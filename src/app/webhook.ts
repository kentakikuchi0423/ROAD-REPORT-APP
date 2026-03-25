/**
 * LINE Webhook ハンドラ
 *
 * 処理フロー:
 *   1. raw body 読み取り
 *   2. X-Line-Signature 検証（失敗 → 401）
 *   3. JSON パース
 *   4. events をループしてルーティング
 *   5. 200 OK 返却
 *
 * ログ方針:
 *   - 出力する: イベントタイプ、webhookEventId、セキュリティイベント
 *   - 出力しない: lineUserId、メッセージ本文、位置情報の座標、個人情報フィールド
 */

import type { webhook } from "@line/bot-sdk";
import type { Env } from "../types";
import { verifySignature, replyMessage } from "../lib/line";

// ---- エントリポイント -------------------------------------------------------

export async function handleWebhook(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  // 1. raw body 読み取り（署名検証は raw テキストに対して行う）
  const rawBody = await request.text();

  // 2. 署名検証
  const signature = request.headers.get("x-line-signature");
  if (!signature) {
    console.warn("[webhook] missing x-line-signature header");
    return new Response("Unauthorized", { status: 401 });
  }

  const isValid = await verifySignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
  if (!isValid) {
    console.warn("[webhook] invalid signature");
    return new Response("Unauthorized", { status: 401 });
  }

  // 3. JSON パース
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    console.warn("[webhook] failed to parse JSON body");
    return new Response("OK", { status: 200 });
  }

  // 4. events 配列の確認
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)["events"])
  ) {
    console.warn("[webhook] unexpected body shape");
    return new Response("OK", { status: 200 });
  }

  const events = (parsed as { events: webhook.Event[] }).events;

  // 5. イベントごとにルーティング（エラーは catch してループ継続）
  for (const event of events) {
    try {
      await routeEvent(event, env);
    } catch (err) {
      const eventId = event.webhookEventId;
      console.error(
        `[webhook] error processing event id=${eventId} type=${event.type}:`,
        err instanceof Error ? err.message : String(err),
      );
      // 処理失敗でも LINE への応答は 200（再送ループ防止）
    }
  }

  return new Response("OK", { status: 200 });
}

// ---- イベントルーティング ---------------------------------------------------

async function routeEvent(event: webhook.Event, env: Env): Promise<void> {
  switch (event.type) {
    case "message":
      await routeMessageEvent(event, env);
      break;

    case "follow":
      console.log(`[webhook] follow event id=${event.webhookEventId}`);
      await handleFollowEvent(event, env);
      break;

    case "unfollow":
      // replyToken がないため返信不可。ログのみ。
      console.log(`[webhook] unfollow event id=${event.webhookEventId}`);
      break;

    default:
      console.log(
        `[webhook] unhandled event type=${event.type} id=${event.webhookEventId}`,
      );
      break;
  }
}

async function routeMessageEvent(
  event: webhook.MessageEvent,
  env: Env,
): Promise<void> {
  const userId = extractUserId(event);
  if (!userId) {
    console.warn(
      `[webhook] message event without userId, skipping id=${event.webhookEventId}`,
    );
    return;
  }

  const msgType = event.message.type;
  console.log(
    `[webhook] message event type=${msgType} id=${event.webhookEventId}`,
  );

  switch (msgType) {
    case "text":
      await handleTextMessage(
        event as webhook.MessageEvent & { message: webhook.TextMessageContent },
        env,
      );
      break;

    case "image":
      await handleImageMessage(
        event as webhook.MessageEvent & {
          message: webhook.ImageMessageContent;
        },
        env,
      );
      break;

    case "location":
      await handleLocationMessage(
        event as webhook.MessageEvent & {
          message: webhook.LocationMessageContent;
        },
        env,
      );
      break;

    default:
      // 未対応メッセージ種別：返信なし・ログのみ
      console.log(`[webhook] unsupported message type=${msgType}`);
      break;
  }
}

// ---- ユーティリティ ---------------------------------------------------------

/** event.source から userId を取得する。取得できない場合は null を返す。 */
function extractUserId(event: webhook.Event): string | null {
  const source = event.source;
  if (!source) return null;
  // UserSource | GroupSource | RoomSource のいずれも userId? を持つ
  return ("userId" in source && typeof source.userId === "string")
    ? source.userId
    : null;
}

// ---- スタブハンドラ（Step 5 で会話フローに置き換え予定） --------------------

/**
 * テキストメッセージ受信時の処理。
 * Step 5 で会話状態機械に委譲する実装に置き換える。
 */
async function handleTextMessage(
  event: webhook.MessageEvent & { message: webhook.TextMessageContent },
  env: Env,
): Promise<void> {
  if (!event.replyToken) return;
  await replyMessage(
    event.replyToken,
    [{ type: "text", text: "メッセージを受け付けました（通報フローは準備中です）" }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

/**
 * 画像メッセージ受信時の処理。
 * Step 5/6 で R2 保存フローに置き換える。
 */
async function handleImageMessage(
  event: webhook.MessageEvent & { message: webhook.ImageMessageContent },
  env: Env,
): Promise<void> {
  if (!event.replyToken) return;
  await replyMessage(
    event.replyToken,
    [{ type: "text", text: "写真を受け付けました（通報フローは準備中です）" }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

/**
 * 位置情報メッセージ受信時の処理。
 * Step 5 で位置情報収集フローに置き換える。
 */
async function handleLocationMessage(
  event: webhook.MessageEvent & { message: webhook.LocationMessageContent },
  env: Env,
): Promise<void> {
  if (!event.replyToken) return;
  await replyMessage(
    event.replyToken,
    [{ type: "text", text: "位置情報を受け付けました（通報フローは準備中です）" }],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

/**
 * フォローイベント受信時の処理。
 * Step 5 でウェルカムメッセージ + 同意フロー起動に置き換える。
 */
async function handleFollowEvent(
  event: webhook.FollowEvent,
  env: Env,
): Promise<void> {
  if (!event.replyToken) return;
  await replyMessage(
    event.replyToken,
    [
      {
        type: "text",
        text: "大洲市道路破損通報へようこそ。\n「通報する」と送信して開始してください。",
      },
    ],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}
