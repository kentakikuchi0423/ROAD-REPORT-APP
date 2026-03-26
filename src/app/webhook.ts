/* eslint-disable no-console */
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
import { handleConversationMessage, handleConversationPostback } from "./conversation";

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

    case "postback":
      await routePostbackEvent(event, env);
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

  if (msgType === "text" || msgType === "image" || msgType === "location") {
    await handleConversationMessage(event, userId, env);
  } else {
    // 未対応メッセージ種別（sticker 等）：返信なし・ログのみ
    console.log(`[webhook] unsupported message type=${msgType}`);
  }
}

// ---- ユーティリティ ---------------------------------------------------------

async function routePostbackEvent(
  event: webhook.PostbackEvent,
  env: Env,
): Promise<void> {
  const userId = extractUserId(event);
  if (!userId) {
    console.warn(
      `[webhook] postback event without userId, skipping id=${event.webhookEventId}`,
    );
    return;
  }
  console.log(`[webhook] postback event id=${event.webhookEventId}`);
  await handleConversationPostback(event, userId, env);
}

/** event.source から userId を取得する。取得できない場合は null を返す。 */
function extractUserId(event: webhook.Event): string | null {
  const source = event.source;
  if (!source) return null;
  // UserSource | GroupSource | RoomSource のいずれも userId? を持つ
  return ("userId" in source && typeof source.userId === "string")
    ? source.userId
    : null;
}

/**
 * フォローイベント受信時の処理。
 * ウェルカムメッセージを送信し、通報開始を案内する。
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
        text: "大洲市の道路破損を通報できるアプリです。\n「通報する」と送信して開始してください。",
      },
    ],
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}
