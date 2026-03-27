/**
 * 会話フロー ステートマシン
 *
 * 担当ステップ（このモジュール）:
 *   - セッションなし     → 「通報する」テキストで consent ステップ開始
 *   - consent          → 利用同意確認（「同意する」で close_photo へ）
 *   - close_photo      → 画像受信 → R2 保存 → far_photo ステップへ
 *   - far_photo        → 画像受信 → R2 保存 → location ステップへ
 *   - location         → 位置情報受信 → セッション保存 → shooting_date ステップへ
 *   - shooting_date    → datetime picker postback またはテキスト入力またはスキップ → remarks ステップへ
 *   - remarks          → テキスト入力またはスキップ → reporter_name ステップへ
 *   - reporter_name    → テキスト入力またはスキップ → reporter_phone ステップへ
 *   - reporter_phone   → テキスト入力またはスキップ → confirming ステップへ
 *   - confirming       → 「送信する」→ D1 登録 + 受付番号発行 / 「やり直す」→ consent ステップへ
 *
 * キャンセル方針:
 *   consent 以降の全ステップで「通報を中止する」テキストを受け取ると cancelling ステップへ遷移。
 *   cancelling ステップで「はい、中止します」→ セッション削除。
 *   cancelling ステップで「いいえ、続けます」→ 元のステップへ復帰。
 *   R2 に保存済みの写真は孤立オブジェクトとして残る（管理コスト軽微なため許容）。
 *
 * postback 処理:
 *   shooting_date ステップの datetime picker は LINE postback イベントで届く。
 *   handleConversationPostback() を別エントリとして export し、webhook.ts からルーティングする。
 *
 * 画像保存方針:
 *   近景受信時に UUID を生成し、R2 キー `reports/{YYYYMMDD}/{uuid}/close.jpg` に即時保存。
 *   遠景は同一 UUID で `reports/{YYYYMMDD}/{uuid}/far.jpg` に保存。
 *   キーはセッションデータに記録する。
 */

import type { webhook } from "@line/bot-sdk";
import type { ConversationSession, ConversationStep, Env } from "../types";
import {
  getSession,
  upsertSession,
  insertReport,
  deleteSession,
  countPendingReportsByUser,
} from "../lib/db";
import { replyMessage, getMessageContent } from "../lib/line";
import { uploadImage } from "../lib/r2";
import { createAdminNotifier } from "../lib/notification";
import {
  validateShootingDate,
  validateRemarks,
  validateReporterName,
  validateReporterPhone,
  type ValidationResult,
} from "../lib/validation";
import { BRANDING } from "../lib/branding";

// ---- メッセージ文言 ----------------------------------------------------------

/** 1ユーザーあたりの pending 通報上限件数 */
const REPORT_LIMIT_PER_USER = 10;

/** 通報件数が上限に達している場合のメッセージ */
const MSG_REPORT_LIMIT_EXCEEDED = [
  "通報件数が上限に達しているため、これ以上の通報を受け付けることができません。",
  "",
  `通報が必要な場合は ${BRANDING.contactEmail} までご連絡ください。`,
  "",
  `※本アプリは『${BRANDING.developer}』が個人で開発したものです。大洲市の公式サービスではないため、大洲市へのお問い合わせはご遠慮ください。`,
].join("\n");

/** 通報フローを開始するトリガーワード */
const START_TRIGGER_WORDS = ["通報する", "通報", "つうほう"];

/**
 * 利用同意を求めるメッセージ。
 */
const MSG_REQUEST_CONSENT = [
  "大洲市の道路破損を通報できるアプリです。",
  "",
  `【重要】${BRANDING.disclaimer}`,
  "",
  "収集した情報は大洲市の道路修繕への通報対応のみに使用します。",
  "",
  "通報内容への個別のご回答は原則行っておりませんが、状況によりご連絡をすることがあります。",
  "",
  "内容にご同意いただける場合は「同意する」をタップしてください。",
  "中止する場合は「通報を中止する」をタップしてください。",
].join("\n");

/** 同意テキスト以外が届いた場合の再案内 */
const MSG_RETRY_CONSENT =
  "通報を始めるには「同意する」をタップしてください。\n中止する場合は「通報を中止する」をタップしてください。";

/** キャンセル時のメッセージ */
const MSG_CANCELLED =
  "通報を中止しました。\n再度通報する場合は「通報する」と送信してください。";

/** キャンセル確認メッセージ（cancelling ステップ） */
const MSG_CANCEL_CONFIRM =
  "通報を中止してよろしいですか？\n入力中の内容はすべて失われます。";

/** キャンセル確認「はい」のテキスト */
const CANCEL_CONFIRM_YES = "はい、中止します";
/** キャンセル確認「いいえ」のテキスト */
const CANCEL_CONFIRM_NO = "いいえ、続けます";

const MSG_REQUEST_CLOSE_PHOTO = [
  "【進捗 1/7】近景写真（必須）",
  "",
  "ありがとうございます。通報を開始します。",
  "",
  "まず「近景写真」（破損箇所を写した写真）を1枚送ってください。",
  "下のボタンでカメラを起動するか、アルバムから選択してください。",
].join("\n");

const MSG_RETRY_CLOSE_PHOTO = [
  "【進捗 1/7】近景写真（必須）",
  "",
  "写真（画像ファイル）を送ってください。",
  "",
  "「近景写真」（破損箇所を写した写真）を1枚送ってください。",
  "下のボタンでカメラを起動するか、アルバムから選択してください。",
].join("\n");

const MSG_REQUEST_FAR_PHOTO = [
  "【進捗 2/7】遠景写真（必須）",
  "",
  "近景写真を受け付けました。",
  "",
  "次に「遠景写真」（周辺の状況がわかる写真）を1枚送ってください。",
  "下のボタンでカメラを起動するか、アルバムから選択してください。",
].join("\n");

const MSG_RETRY_FAR_PHOTO = [
  "【進捗 2/7】遠景写真（必須）",
  "",
  "写真（画像ファイル）を送ってください。",
  "",
  "「遠景写真」（周辺の状況がわかる写真）を1枚送ってください。",
  "下のボタンでカメラを起動するか、アルバムから選択してください。",
].join("\n");

const MSG_REQUEST_LOCATION = [
  "【進捗 3/7】位置情報（必須）",
  "",
  "遠景写真を受け付けました。",
  "",
  "次に「位置情報」を送ってください。",
  "下のボタン、またはLINEのメニュー（＋）から「位置情報」をタップして送信してください。",
].join("\n");

const MSG_RETRY_LOCATION = [
  "【進捗 3/7】位置情報（必須）",
  "",
  "位置情報を送ってください。",
  "下のボタン、またはLINEのメニュー（＋）から「位置情報」をタップして送信してください。",
].join("\n");

const MSG_REQUEST_SHOOTING_DATE = [
  "【進捗 4/7】撮影日付（任意）",
  "",
  "位置情報を受け付けました。",
  "",
  "「撮影日付」を選択してください（任意）。",
  "カレンダーボタンで選ぶか、YYYY-MM-DD 形式で直接入力もできます（例：2026-03-25）。",
].join("\n");

const MSG_REQUEST_REMARKS = [
  "【進捗 5/7】補足事項（任意）",
  "",
  "「補足事項」があれば入力してください（任意・500文字以内）。",
  "",
  "スキップする場合は「スキップ」をタップ、中止する場合は「通報を中止する」をタップしてください。",
].join("\n");

const MSG_REQUEST_REPORTER_NAME = [
  "【進捗 6/7】お名前（任意）",
  "",
  "「お名前」を入力してください（任意）。",
  "",
  "スキップする場合は「スキップ」をタップ、中止する場合は「通報を中止する」をタップしてください。",
].join("\n");

const MSG_REQUEST_REPORTER_PHONE = [
  "【進捗 7/7】電話番号（任意）",
  "",
  "「電話番号」を入力してください（任意）。",
  "形式：0896-24-1111",
  "",
  "スキップする場合は「スキップ」をタップ、中止する場合は「通報を中止する」をタップしてください。",
].join("\n");

/** confirming ステップで想定外のテキストが届いた場合の案内 */
const MSG_RETRY_CONFIRMING =
  "「送信する」「やり直す」「通報を中止する」のいずれかを選択してください。";

/** セッションデータ欠損時のエラーメッセージ */
const MSG_SESSION_ERROR =
  "申し訳ございません。セッションデータに問題が発生したため、通報をリセットしました。\n「通報する」と送信して最初からやり直してください。";

/** 通報送信済み（completed）の場合の案内（二重送信時など） */
const MSG_ALREADY_SUBMITTED =
  "この通報はすでに受け付け済みです。\n別の通報を行う場合は「通報する」と送信してください。";

/** insertReport 失敗時の一時エラーメッセージ */
const MSG_SUBMIT_ERROR =
  "申し訳ございません。送信処理中にエラーが発生しました。\nもう一度「送信する」をタップしてお試しください。";

/** 任意テキスト入力ステップで、テキスト以外が届いた場合の共通案内 */
const MSG_RETRY_TEXT_OR_SKIP =
  "テキストで入力するか、「スキップ」または「通報を中止する」をタップしてください。";

/** スキップを示すテキスト */
const SKIP_TEXT = "スキップ";

/** 通報中止を示すテキスト（全ステップ共通） */
const CANCEL_TEXT = "通報を中止する";

// ---- Quick Reply 定義 --------------------------------------------------------

/** キャンセルアクション（各 QR に共通で追加する） */
const QR_ITEM_CANCEL = {
  type: "action",
  action: { type: "message", label: "通報を中止する", text: CANCEL_TEXT },
};

/** キャンセル確認 Quick Reply（cancelling ステップ用） */
const QUICK_REPLY_CANCEL_CONFIRM = {
  items: [
    { type: "action", action: { type: "message", label: CANCEL_CONFIRM_YES, text: CANCEL_CONFIRM_YES } },
    { type: "action", action: { type: "message", label: CANCEL_CONFIRM_NO, text: CANCEL_CONFIRM_NO } },
  ],
};

/** 利用同意 Quick Reply（「同意する」「通報を中止する」） */
const QUICK_REPLY_CONSENT = {
  items: [
    { type: "action", action: { type: "message", label: "同意する", text: "同意する" } },
    { type: "action", action: { type: "message", label: "通報を中止する", text: CANCEL_TEXT } },
  ],
};

/**
 * 写真入力 Quick Reply（カメラ起動・アルバム選択・中止）
 * close_photo / far_photo ステップで使用。
 */
const QUICK_REPLY_PHOTO = {
  items: [
    { type: "action", action: { type: "camera", label: "カメラで撮影" } },
    { type: "action", action: { type: "cameraRoll", label: "アルバムから選択" } },
    QR_ITEM_CANCEL,
  ],
};

/** スキップ + 中止 Quick Reply（任意テキスト入力ステップ用） */
const QUICK_REPLY_SKIP_CANCEL = {
  items: [
    { type: "action", action: { type: "message", label: "スキップ", text: "スキップ" } },
    QR_ITEM_CANCEL,
  ],
};

/** 確認 Quick Reply（confirming ステップ用） */
const QUICK_REPLY_CONFIRMING = {
  items: [
    { type: "action", action: { type: "message", label: "送信する", text: "送信する" } },
    { type: "action", action: { type: "message", label: "やり直す", text: "やり直す" } },
    QR_ITEM_CANCEL,
  ],
};

/** 位置情報送信 Quick Reply */
const QUICK_REPLY_LOCATION = {
  items: [
    { type: "action", action: { type: "location", label: "位置情報を送る" } },
    QR_ITEM_CANCEL,
  ],
};

// ---- 型定義 ------------------------------------------------------------------

/** メッセージ指定型（文字列または quickReply 付きオブジェクト） */
type MsgSpec = string | { text: string; quickReply?: unknown };
/** nextMsg の型（静的またはデータを受け取る関数） */
type NextMsgSpec =
  | MsgSpec
  | ((data: ConversationSession["data"]) => MsgSpec);

// ---- Quick Reply ビルダー ---------------------------------------------------

/**
 * 撮影日付ステップ用 Quick Reply を生成する。
 * datetime picker の max 値は JST 当日日付を動的にセットする。
 */
function buildShootingDateQuickReply(): unknown {
  return {
    items: [
      {
        type: "action",
        action: {
          type: "datetimepicker",
          label: "カレンダーで選択",
          data: "action=select_shooting_date",
          mode: "date",
          max: getTodayJst(),
        },
      },
      { type: "action", action: { type: "message", label: "スキップ", text: "スキップ" } },
      QR_ITEM_CANCEL,
    ],
  };
}

// ---- キャンセル共通処理 -----------------------------------------------------

/**
 * cancelling ステップへ遷移し、キャンセル確認メッセージを返信する。
 * 遷移前のステップを session.data.previousStep に保持する。
 */
async function enterCancellingStep(
  session: ConversationSession,
  env: Env,
  replyToken: string,
): Promise<void> {
  const updated: ConversationSession = {
    ...session,
    step: "cancelling",
    data: { ...session.data, previousStep: session.step },
    updatedAt: new Date().toISOString(),
  };
  await upsertSession(env.DB, updated);
  await replyMessage(
    replyToken,
    [{ type: "text", text: MSG_CANCEL_CONFIRM, quickReply: QUICK_REPLY_CANCEL_CONFIRM }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

/**
 * テキストメッセージが「通報を中止する」であれば cancelling ステップへ遷移する。
 * @returns キャンセル確認フローへ遷移した場合 true
 */
async function handleCancelIfRequested(
  event: webhook.MessageEvent,
  session: ConversationSession,
  env: Env,
  replyToken: string,
): Promise<boolean> {
  if (event.message.type !== "text") return false;
  if (event.message.text.trim() !== CANCEL_TEXT) return false;
  await enterCancellingStep(session, env, replyToken);
  return true;
}

// ---- エントリポイント --------------------------------------------------------

/**
 * メッセージイベントを会話フローに委譲する。
 * text / image / location 以外の種別は返信なしで無視する。
 *
 * @param event  LINE メッセージイベント
 * @param userId LINE ユーザー ID
 * @param env    Workers 環境バインディング
 */
export async function handleConversationMessage(
  event: webhook.MessageEvent,
  userId: string,
  env: Env,
): Promise<void> {
  const replyToken = event.replyToken;
  if (!replyToken) return;

  const msgType = event.message.type;
  if (
    msgType !== "text" &&
    msgType !== "image" &&
    msgType !== "video" &&
    msgType !== "location"
  ) {
    return;
  }

  const session = await getSession(env.DB, userId);

  if (!session) {
    await handleNoSession(event, userId, env, replyToken);
    return;
  }

  switch (session.step) {
    case "consent":
      await handleConsentStep(event, session, env, replyToken);
      break;

    case "close_photo":
      await handleClosePhotoStep(event, session, userId, env, replyToken);
      break;

    case "far_photo":
      await handleFarPhotoStep(event, session, userId, env, replyToken);
      break;

    case "location":
      await handleLocationStep(event, session, env, replyToken);
      break;

    case "shooting_date":
      await handleOptionalTextStep(
        event, session, env, replyToken,
        validateShootingDate,
        (data, value) => ({ ...data, shootingDate: value }),
        "remarks",
        { text: MSG_REQUEST_REMARKS, quickReply: QUICK_REPLY_SKIP_CANCEL },
        buildShootingDateQuickReply(),
      );
      break;

    case "remarks":
      await handleOptionalTextStep(
        event, session, env, replyToken,
        validateRemarks,
        (data, value) => ({ ...data, remarks: value }),
        "reporter_name",
        { text: MSG_REQUEST_REPORTER_NAME, quickReply: QUICK_REPLY_SKIP_CANCEL },
      );
      break;

    case "reporter_name":
      await handleOptionalTextStep(
        event, session, env, replyToken,
        validateReporterName,
        (data, value) => ({ ...data, reporterName: value }),
        "reporter_phone",
        { text: MSG_REQUEST_REPORTER_PHONE, quickReply: QUICK_REPLY_SKIP_CANCEL },
      );
      break;

    case "reporter_phone":
      await handleOptionalTextStep(
        event, session, env, replyToken,
        validateReporterPhone,
        (data, value) => ({ ...data, reporterPhone: value }),
        "confirming",
        (data) => ({ text: buildSummaryMessage(data), quickReply: QUICK_REPLY_CONFIRMING }),
      );
      break;

    case "confirming":
      await handleConfirmingStep(event, session, env, replyToken);
      break;

    case "cancelling":
      await handleCancellingStep(event, session, env, replyToken);
      break;

    case "completed":
      // 送信処理中または二重送信。受付済みの旨を案内するのみ。
      await replyMessage(
        replyToken,
        [{ type: "text", text: MSG_ALREADY_SUBMITTED }],
        env.LINE_CHANNEL_ACCESS_TOKEN,
      );
      break;

    default:
      break;
  }
}

// ---- セッションなし ----------------------------------------------------------

async function handleNoSession(
  event: webhook.MessageEvent,
  userId: string,
  env: Env,
  replyToken: string,
): Promise<void> {
  const isStartTrigger =
    event.message.type === "text" &&
    START_TRIGGER_WORDS.includes(event.message.text.trim());

  if (isStartTrigger) {
    const pendingCount = await countPendingReportsByUser(env.DB, userId);
    if (pendingCount > REPORT_LIMIT_PER_USER) {
      await replyMessage(
        replyToken,
        [{ type: "text", text: MSG_REPORT_LIMIT_EXCEEDED }],
        env.LINE_CHANNEL_ACCESS_TOKEN,
      );
      return;
    }

    const now = new Date().toISOString();
    const session: ConversationSession = {
      lineUserId: userId,
      step: "consent",
      data: {},
      createdAt: now,
      updatedAt: now,
    };
    await upsertSession(env.DB, session);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_REQUEST_CONSENT, quickReply: QUICK_REPLY_CONSENT }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  // トリガーワード以外には返信しない
}

// ---- consent ステップ --------------------------------------------------------

async function handleConsentStep(
  event: webhook.MessageEvent,
  session: ConversationSession,
  env: Env,
  replyToken: string,
): Promise<void> {
  if (event.message.type !== "text") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_CONSENT, quickReply: QUICK_REPLY_CONSENT }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const text = event.message.text.trim();

  if (text === CANCEL_TEXT) {
    await deleteSession(env.DB, session.lineUserId);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_CANCELLED }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  if (text !== "同意する") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_CONSENT, quickReply: QUICK_REPLY_CONSENT }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  // 「同意する」: close_photo ステップへ
  const updated: ConversationSession = {
    ...session,
    step: "close_photo",
    updatedAt: new Date().toISOString(),
  };
  await upsertSession(env.DB, updated);
  await replyMessage(
    replyToken,
    [{ type: "text", text: MSG_REQUEST_CLOSE_PHOTO, quickReply: QUICK_REPLY_PHOTO }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

// ---- close_photo ステップ ----------------------------------------------------

async function handleClosePhotoStep(
  event: webhook.MessageEvent,
  session: ConversationSession,
  _userId: string,
  env: Env,
  replyToken: string,
): Promise<void> {
  // キャンセルチェック（テキストで「通報を中止する」が来た場合）
  if (await handleCancelIfRequested(event, session, env, replyToken)) return;

  if (event.message.type !== "image") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_CLOSE_PHOTO, quickReply: QUICK_REPLY_PHOTO }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const messageId = event.message.id;
  const { data, contentType } = await getMessageContent(
    messageId,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );

  const uuid = crypto.randomUUID();
  const closePhotoKey = buildPhotoKey(uuid, "close", new Date());
  await uploadImage(env.IMAGES, closePhotoKey, data, contentType);

  const updated: ConversationSession = {
    ...session,
    step: "far_photo",
    data: { ...session.data, reportUuid: uuid, closePhotoKey },
    updatedAt: new Date().toISOString(),
  };
  await upsertSession(env.DB, updated);

  await replyMessage(
    replyToken,
    [{ type: "text", text: MSG_REQUEST_FAR_PHOTO, quickReply: QUICK_REPLY_PHOTO }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

// ---- far_photo ステップ ------------------------------------------------------

async function handleFarPhotoStep(
  event: webhook.MessageEvent,
  session: ConversationSession,
  _userId: string,
  env: Env,
  replyToken: string,
): Promise<void> {
  // キャンセルチェック（テキストで「通報を中止する」が来た場合）
  if (await handleCancelIfRequested(event, session, env, replyToken)) return;

  if (event.message.type !== "image") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_FAR_PHOTO, quickReply: QUICK_REPLY_PHOTO }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const messageId = event.message.id;
  const { data, contentType } = await getMessageContent(
    messageId,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );

  // 近景受信時に生成した UUID を流用（ない場合は新規生成）
  const uuid = session.data.reportUuid ?? crypto.randomUUID();
  const farPhotoKey = buildPhotoKey(uuid, "far", new Date());
  await uploadImage(env.IMAGES, farPhotoKey, data, contentType);

  const updated: ConversationSession = {
    ...session,
    step: "location",
    data: { ...session.data, farPhotoKey },
    updatedAt: new Date().toISOString(),
  };
  await upsertSession(env.DB, updated);

  await replyMessage(
    replyToken,
    [{ type: "text", text: MSG_REQUEST_LOCATION, quickReply: QUICK_REPLY_LOCATION }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

// ---- location ステップ -------------------------------------------------------

async function handleLocationStep(
  event: webhook.MessageEvent,
  session: ConversationSession,
  env: Env,
  replyToken: string,
): Promise<void> {
  // キャンセルチェック（テキストで「通報を中止する」が来た場合）
  if (await handleCancelIfRequested(event, session, env, replyToken)) return;

  if (event.message.type !== "location") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_LOCATION, quickReply: QUICK_REPLY_LOCATION }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const { latitude, longitude, address } = event.message;

  const updatedData: ConversationSession["data"] = {
    ...session.data,
    latitude,
    longitude,
  };
  // address は null の場合もある（座標のみ選択時）
  if (address) {
    updatedData.locationAddress = address;
  }

  const updated: ConversationSession = {
    ...session,
    step: "shooting_date",
    data: updatedData,
    updatedAt: new Date().toISOString(),
  };
  await upsertSession(env.DB, updated);

  await replyMessage(
    replyToken,
    [{ type: "text", text: MSG_REQUEST_SHOOTING_DATE, quickReply: buildShootingDateQuickReply() }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

// ---- 任意テキスト入力ステップ共通ハンドラ --------------------------------------

/**
 * shooting_date / remarks / reporter_name / reporter_phone の 4 ステップに共通する処理。
 *
 * - テキスト以外 → MSG_RETRY_TEXT_OR_SKIP を返信（retryQuickReply 付き）
 * - 「通報を中止する」 → 即時キャンセル
 * - 「スキップ」 → フィールドを保存せず次ステップへ
 * - 有効なテキスト → バリデーション通過後に保存し次ステップへ
 * - バリデーション失敗 → エラーメッセージを返信（セッション更新なし）
 *
 * @param retryQuickReply エラー・リトライ時に使う Quick Reply（省略時は QUICK_REPLY_SKIP_CANCEL）
 */
async function handleOptionalTextStep(
  event: webhook.MessageEvent,
  session: ConversationSession,
  env: Env,
  replyToken: string,
  validate: (input: string) => ValidationResult<string>,
  saveToData: (
    data: ConversationSession["data"],
    value: string,
  ) => ConversationSession["data"],
  nextStep: ConversationStep,
  nextMsg: NextMsgSpec,
  retryQuickReply: unknown = QUICK_REPLY_SKIP_CANCEL,
): Promise<void> {
  if (event.message.type !== "text") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_TEXT_OR_SKIP, quickReply: retryQuickReply }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const text = event.message.text.trim();

  if (text === CANCEL_TEXT) {
    await enterCancellingStep(session, env, replyToken);
    return;
  }

  let nextData = session.data;
  if (text !== SKIP_TEXT) {
    const result = validate(text);
    if (!result.ok) {
      await replyMessage(
        replyToken,
        [{ type: "text", text: result.error, quickReply: retryQuickReply }],
        env.LINE_CHANNEL_ACCESS_TOKEN,
      );
      return;
    }
    nextData = saveToData(session.data, result.value);
  }

  const updated: ConversationSession = {
    ...session,
    step: nextStep,
    data: nextData,
    updatedAt: new Date().toISOString(),
  };
  await upsertSession(env.DB, updated);

  const msgSpec = typeof nextMsg === "function" ? nextMsg(nextData) : nextMsg;
  const msgText = typeof msgSpec === "string" ? msgSpec : msgSpec.text;
  const msgObj: Record<string, unknown> = { type: "text", text: msgText };
  if (typeof msgSpec !== "string" && msgSpec.quickReply) {
    msgObj.quickReply = msgSpec.quickReply;
  }
  await replyMessage(replyToken, [msgObj], env.LINE_CHANNEL_ACCESS_TOKEN);
}

// ---- confirming ステップ -----------------------------------------------------

async function handleConfirmingStep(
  event: webhook.MessageEvent,
  session: ConversationSession,
  env: Env,
  replyToken: string,
): Promise<void> {
  if (event.message.type !== "text") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_CONFIRMING, quickReply: QUICK_REPLY_CONFIRMING }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const text = event.message.text.trim();

  if (text === CANCEL_TEXT) {
    await enterCancellingStep(session, env, replyToken);
    return;
  }

  if (text === "やり直す") {
    // consent ステップに戻し、データをリセット
    const restored: ConversationSession = {
      lineUserId: session.lineUserId,
      step: "consent",
      data: {},
      createdAt: session.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await upsertSession(env.DB, restored);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_REQUEST_CONSENT, quickReply: QUICK_REPLY_CONSENT }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  if (text !== "送信する") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_CONFIRMING, quickReply: QUICK_REPLY_CONFIRMING }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  // 「送信する」: 必須フィールドの存在確認
  const { closePhotoKey, farPhotoKey, latitude, longitude } = session.data;
  if (!closePhotoKey || !farPhotoKey || latitude === undefined || longitude === undefined) {
    await deleteSession(env.DB, session.lineUserId);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_SESSION_ERROR }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  // 二重送信ガード: セッションを completed に更新してから DB 登録
  // 並行リクエストが来ても、completed ステップなら「受付済み」案内に分岐する
  const completedSession: ConversationSession = {
    ...session,
    step: "completed",
    updatedAt: new Date().toISOString(),
  };
  await upsertSession(env.DB, completedSession);

  // reports テーブルへ登録
  let report;
  try {
    report = await insertReport(env.DB, {
      lineUserId: session.lineUserId,
      status: "pending",
      closePhotoKey,
      farPhotoKey,
      latitude,
      longitude,
      locationAddress: session.data.locationAddress ?? null,
      shootingDate: session.data.shootingDate ?? null,
      remarks: session.data.remarks ?? null,
      reporterName: session.data.reporterName ?? null,
      reporterPhone: session.data.reporterPhone ?? null,
    });
  } catch {
    // DB 登録失敗: セッションを confirming に戻して再送を促す
    const restoredSession: ConversationSession = {
      ...session,
      step: "confirming",
      updatedAt: new Date().toISOString(),
    };
    await upsertSession(env.DB, restoredSession);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_SUBMIT_ERROR, quickReply: QUICK_REPLY_CONFIRMING }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  await deleteSession(env.DB, session.lineUserId);

  // 管理者通知（失敗しても通報完了は妨げない）
  try {
    const notifier = createAdminNotifier(env);
    await notifier.notifyNewReport(report);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("admin notification failed:", err instanceof Error ? err.message : String(err));
  }

  await replyMessage(
    replyToken,
    [{ type: "text", text: buildCompletionMessage(report.receiptNumber) }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

// ---- cancelling ステップ -------------------------------------------------------

/**
 * ステップに対応する「再案内メッセージ」を返す。
 * cancelling → 「いいえ、続けます」で元のステップへ戻る際に使用。
 */
function getStepResumeMessage(
  step: ConversationStep,
  data: ConversationSession["data"],
): { text: string; quickReply?: unknown } | null {
  switch (step) {
    case "close_photo":
      return { text: MSG_RETRY_CLOSE_PHOTO, quickReply: QUICK_REPLY_PHOTO };
    case "far_photo":
      return { text: MSG_RETRY_FAR_PHOTO, quickReply: QUICK_REPLY_PHOTO };
    case "location":
      return { text: MSG_RETRY_LOCATION, quickReply: QUICK_REPLY_LOCATION };
    case "shooting_date":
      return { text: MSG_REQUEST_SHOOTING_DATE, quickReply: buildShootingDateQuickReply() };
    case "remarks":
      return { text: MSG_REQUEST_REMARKS, quickReply: QUICK_REPLY_SKIP_CANCEL };
    case "reporter_name":
      return { text: MSG_REQUEST_REPORTER_NAME, quickReply: QUICK_REPLY_SKIP_CANCEL };
    case "reporter_phone":
      return { text: MSG_REQUEST_REPORTER_PHONE, quickReply: QUICK_REPLY_SKIP_CANCEL };
    case "confirming":
      return { text: buildSummaryMessage(data), quickReply: QUICK_REPLY_CONFIRMING };
    default:
      return null;
  }
}

async function handleCancellingStep(
  event: webhook.MessageEvent,
  session: ConversationSession,
  env: Env,
  replyToken: string,
): Promise<void> {
  const reConfirm = async () =>
    replyMessage(
      replyToken,
      [{ type: "text", text: MSG_CANCEL_CONFIRM, quickReply: QUICK_REPLY_CANCEL_CONFIRM }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );

  if (event.message.type !== "text") {
    await reConfirm();
    return;
  }

  const text = event.message.text.trim();

  if (text === CANCEL_CONFIRM_YES) {
    await deleteSession(env.DB, session.lineUserId);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_CANCELLED }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  if (text === CANCEL_CONFIRM_NO) {
    const prevStep = session.data.previousStep;
    const { previousStep: _removed, ...dataWithoutPrev } = session.data;
    const targetStep: ConversationStep = prevStep ?? "consent";

    const restoredSession: ConversationSession = {
      ...session,
      step: targetStep,
      data: dataWithoutPrev,
      updatedAt: new Date().toISOString(),
    };
    await upsertSession(env.DB, restoredSession);

    const resume = prevStep ? getStepResumeMessage(prevStep, dataWithoutPrev) : null;
    if (resume) {
      const msgObj: Record<string, unknown> = { type: "text", text: resume.text };
      if (resume.quickReply) msgObj.quickReply = resume.quickReply;
      await replyMessage(replyToken, [msgObj], env.LINE_CHANNEL_ACCESS_TOKEN);
    } else {
      // previousStep が不明な場合は consent へフォールバック
      await replyMessage(
        replyToken,
        [{ type: "text", text: MSG_REQUEST_CONSENT, quickReply: QUICK_REPLY_CONSENT }],
        env.LINE_CHANNEL_ACCESS_TOKEN,
      );
    }
    return;
  }

  // その他 → 再案内
  await reConfirm();
}

// ---- ユーティリティ ----------------------------------------------------------

/**
 * R2 キーを生成する。
 * 形式: `reports/{YYYYMMDD}/{uuid}/{type}.jpg`
 * 日付は JST（UTC+9）基準。
 */
function buildPhotoKey(uuid: string, type: "close" | "far", date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jst.getUTCFullYear().toString();
  const mm = (jst.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = jst.getUTCDate().toString().padStart(2, "0");
  return `reports/${yyyy}${mm}${dd}/${uuid}/${type}.jpg`;
}

/**
 * confirming ステップへの遷移時に表示する入力内容サマリーを生成する。
 */
function buildSummaryMessage(data: ConversationSession["data"]): string {
  return [
    "【通報内容の確認】",
    "",
    "近景写真：受付済み",
    "遠景写真：受付済み",
    `位置情報：${data.locationAddress ?? "受付済み（住所なし）"}`,
    `撮影日付：${data.shootingDate ?? "未入力"}`,
    `補足事項：${data.remarks ?? "未入力"}`,
    `お名前：${data.reporterName ?? "未入力"}`,
    `電話番号：${data.reporterPhone ?? "未入力"}`,
    "",
    "「送信する」をタップして通報を完了してください。",
    "「やり直す」をタップすると最初からやり直せます。",
  ].join("\n");
}

/**
 * 通報完了時のメッセージを生成する。
 */
function buildCompletionMessage(receiptNumber: string): string {
  return [
    "通報を受け付けました。",
    "",
    "【受付番号】",
    receiptNumber,
    "",
    "この番号を控えておいてください。",
    `アプリに関するお問い合わせは ${BRANDING.contactEmail} までご連絡ください。`,
    "",
    `※本アプリは『${BRANDING.developer}』が個人で開発したものです。大洲市の公式サービスではないため、大洲市へのお問い合わせはご遠慮ください。`,
  ].join("\n");
}

/**
 * JST（UTC+9）での当日日付を "YYYY-MM-DD" 形式で返す。
 * datetime picker の max 値として使用する。
 */
function getTodayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jst.getUTCFullYear().toString();
  const mm = (jst.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = jst.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---- postback エントリポイント -----------------------------------------------

/**
 * LINE postback イベントを会話フローに委譲する。
 * 現在は shooting_date ステップの datetime picker 選択のみ処理する。
 *
 * @param event  LINE postback イベント
 * @param userId LINE ユーザー ID
 * @param env    Workers 環境バインディング
 */
export async function handleConversationPostback(
  event: webhook.PostbackEvent,
  userId: string,
  env: Env,
): Promise<void> {
  const replyToken = event.replyToken;
  if (!replyToken) return;

  const session = await getSession(env.DB, userId);
  if (!session) return;

  if (
    session.step === "shooting_date" &&
    event.postback.data === "action=select_shooting_date"
  ) {
    const date = (event.postback.params as Record<string, string> | undefined)?.["date"];
    if (!date) return;

    const result = validateShootingDate(date);
    if (!result.ok) {
      // datetime picker の max 制約で通常は発生しないが、念のため二重チェック
      await replyMessage(
        replyToken,
        [{ type: "text", text: result.error, quickReply: buildShootingDateQuickReply() }],
        env.LINE_CHANNEL_ACCESS_TOKEN,
      );
      return;
    }

    const nextData: ConversationSession["data"] = { ...session.data, shootingDate: result.value };
    const updated: ConversationSession = {
      ...session,
      step: "remarks",
      data: nextData,
      updatedAt: new Date().toISOString(),
    };
    await upsertSession(env.DB, updated);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_REQUEST_REMARKS, quickReply: QUICK_REPLY_SKIP_CANCEL }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
  }
}
