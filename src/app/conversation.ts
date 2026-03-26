/**
 * 会話フロー ステートマシン
 *
 * 担当ステップ（このモジュール）:
 *   - セッションなし     → 「通報する」テキストで close_photo ステップ開始
 *   - close_photo       → 画像受信 → R2 保存 → far_photo ステップへ
 *   - far_photo         → 画像受信 → R2 保存 → location ステップへ
 *   - location          → 位置情報受信 → セッション保存 → shooting_date ステップへ
 *   - shooting_date     → テキスト入力またはスキップ → remarks ステップへ
 *   - remarks           → テキスト入力またはスキップ → reporter_name ステップへ
 *   - reporter_name     → テキスト入力またはスキップ → reporter_phone ステップへ
 *   - reporter_phone    → テキスト入力またはスキップ → confirming ステップへ
 *   - confirming        → 「送信する」→ D1 登録 + 受付番号発行 / 「やり直す」→ セッション削除
 *
 * 画像保存方針:
 *   近景受信時に UUID を生成し、R2 キー `reports/{YYYYMMDD}/{uuid}/close.jpg` に即時保存。
 *   遠景は同一 UUID で `reports/{YYYYMMDD}/{uuid}/far.jpg` に保存。
 *   キーはセッションデータに記録する。
 */

import type { webhook } from "@line/bot-sdk";
import type { ConversationSession, ConversationStep, Env } from "../types";
import { getSession, upsertSession, insertReport, deleteSession } from "../lib/db";
import { replyMessage, getMessageContent } from "../lib/line";
import { uploadImage } from "../lib/r2";
import {
  validateShootingDate,
  validateRemarks,
  validateReporterName,
  validateReporterPhone,
  type ValidationResult,
} from "../lib/validation";

// ---- メッセージ文言 ----------------------------------------------------------

const MSG_HOW_TO_START =
  "大洲市道路破損通報へようこそ。\n通報を開始するには「通報する」と送信してください。";

const MSG_REQUEST_CLOSE_PHOTO =
  "通報を受け付けます。\n\nまず「近景写真」（破損箇所を写した写真）を1枚送ってください。";

const MSG_RETRY_CLOSE_PHOTO =
  "写真（画像ファイル）を送ってください。\n\n「近景写真」（破損箇所を写した写真）を1枚送ってください。";

const MSG_REQUEST_FAR_PHOTO =
  "近景写真を受け付けました。\n\n次に「遠景写真」（周辺の状況がわかる写真）を1枚送ってください。";

const MSG_RETRY_FAR_PHOTO =
  "写真（画像ファイル）を送ってください。\n\n「遠景写真」（周辺の状況がわかる写真）を1枚送ってください。";

const MSG_REQUEST_LOCATION =
  "遠景写真を受け付けました。\n\n次に「位置情報」を送ってください。\nLINEの「位置情報を送る」をご利用ください。";

const MSG_RETRY_LOCATION =
  "位置情報を送ってください。\nLINEの「位置情報を送る」をご利用ください。";

const MSG_REQUEST_SHOOTING_DATE =
  "位置情報を受け付けました。\n\n「撮影日付」を入力してください（任意）。\n形式：YYYY-MM-DD（例：2026-03-25）\n\nスキップする場合は「スキップ」と送信してください。";

const MSG_REQUEST_REMARKS =
  "「補足事項」があれば入力してください（任意・500文字以内）。\n\nスキップする場合は「スキップ」と送信してください。";

const MSG_REQUEST_REPORTER_NAME =
  "「お名前」を入力してください（任意）。\n匿名での通報も可能です。\n\nスキップする場合は「スキップ」と送信してください。";

const MSG_REQUEST_REPORTER_PHONE =
  "「電話番号」を入力してください（任意）。\n形式：0896-24-1111\n\nスキップする場合は「スキップ」と送信してください。";

/** confirming ステップで「送信する」「やり直す」以外が届いた場合の案内 */
const MSG_RETRY_CONFIRMING =
  "「送信する」または「やり直す」と入力してください。";

/** 「やり直す」でセッションをリセットした後の案内 */
const MSG_RESTART =
  "通報をリセットしました。\n再度通報する場合は「通報する」と送信してください。";

/** セッションデータ欠損時のエラーメッセージ */
const MSG_SESSION_ERROR =
  "申し訳ございません。セッションデータに問題が発生したため、通報をリセットしました。\n「通報する」と送信して最初からやり直してください。";

/** 任意テキスト入力ステップで、テキスト以外が届いた場合の共通案内 */
const MSG_RETRY_TEXT_OR_SKIP =
  "テキストで入力するか、「スキップ」と送信してください。";

/** スキップを示すテキスト */
const SKIP_TEXT = "スキップ";

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
  if (msgType !== "text" && msgType !== "image" && msgType !== "location") {
    return;
  }

  const session = await getSession(env.DB, userId);

  if (!session) {
    await handleNoSession(event, userId, env, replyToken);
    return;
  }

  switch (session.step) {
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
        MSG_REQUEST_REMARKS,
      );
      break;

    case "remarks":
      await handleOptionalTextStep(
        event, session, env, replyToken,
        validateRemarks,
        (data, value) => ({ ...data, remarks: value }),
        "reporter_name",
        MSG_REQUEST_REPORTER_NAME,
      );
      break;

    case "reporter_name":
      await handleOptionalTextStep(
        event, session, env, replyToken,
        validateReporterName,
        (data, value) => ({ ...data, reporterName: value }),
        "reporter_phone",
        MSG_REQUEST_REPORTER_PHONE,
      );
      break;

    case "reporter_phone":
      await handleOptionalTextStep(
        event, session, env, replyToken,
        validateReporterPhone,
        (data, value) => ({ ...data, reporterPhone: value }),
        "confirming",
        (data) => buildSummaryMessage(data),
      );
      break;

    case "confirming":
      await handleConfirmingStep(event, session, env, replyToken);
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
    (event.message as webhook.TextMessageContent).text.trim() === "通報する";

  if (isStartTrigger) {
    const now = new Date().toISOString();
    const session: ConversationSession = {
      lineUserId: userId,
      step: "close_photo",
      data: {},
      createdAt: now,
      updatedAt: now,
    };
    await upsertSession(env.DB, session);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_REQUEST_CLOSE_PHOTO }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  await replyMessage(
    replyToken,
    [{ type: "text", text: MSG_HOW_TO_START }],
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
  if (event.message.type !== "image") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_CLOSE_PHOTO }],
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
    [{ type: "text", text: MSG_REQUEST_FAR_PHOTO }],
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
  if (event.message.type !== "image") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_FAR_PHOTO }],
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
    [{ type: "text", text: MSG_REQUEST_LOCATION }],
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
  if (event.message.type !== "location") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_LOCATION }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const { latitude, longitude, address } = event.message as webhook.LocationMessageContent;

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
    [{ type: "text", text: MSG_REQUEST_SHOOTING_DATE }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

// ---- 任意テキスト入力ステップ共通ハンドラ --------------------------------------

/**
 * shooting_date / remarks / reporter_name / reporter_phone の 4 ステップに共通する処理。
 *
 * - テキスト以外 → MSG_RETRY_TEXT_OR_SKIP を返信
 * - 「スキップ」 → フィールドを保存せず次ステップへ
 * - 有効なテキスト → バリデーション通過後に保存し次ステップへ
 * - バリデーション失敗 → エラーメッセージを返信（セッション更新なし）
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
  nextMsg: string | ((data: ConversationSession["data"]) => string),
): Promise<void> {
  if (event.message.type !== "text") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_TEXT_OR_SKIP }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const text = (event.message as webhook.TextMessageContent).text.trim();

  let nextData = session.data;
  if (text !== SKIP_TEXT) {
    const result = validate(text);
    if (!result.ok) {
      await replyMessage(
        replyToken,
        [{ type: "text", text: result.error }],
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

  const msgText = typeof nextMsg === "function" ? nextMsg(nextData) : nextMsg;
  await replyMessage(
    replyToken,
    [{ type: "text", text: msgText }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
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
      [{ type: "text", text: MSG_RETRY_CONFIRMING }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  const text = (event.message as webhook.TextMessageContent).text.trim();

  if (text === "やり直す") {
    await deleteSession(env.DB, session.lineUserId);
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RESTART }],
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
    return;
  }

  if (text !== "送信する") {
    await replyMessage(
      replyToken,
      [{ type: "text", text: MSG_RETRY_CONFIRMING }],
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

  // reports テーブルへ登録
  const report = await insertReport(env.DB, {
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

  await deleteSession(env.DB, session.lineUserId);

  await replyMessage(
    replyToken,
    [{ type: "text", text: buildCompletionMessage(report.receiptNumber) }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
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
    `お名前：${data.reporterName ?? "匿名"}`,
    `電話番号：${data.reporterPhone ?? "未入力"}`,
    "",
    "「送信する」と入力して通報を完了してください。",
    "「やり直す」と入力すると最初からやり直せます。",
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
    "受付番号は菊地けんたへのお問い合わせの際にご利用ください。",
  ].join("\n");
}
