/**
 * LINE Messaging API ラッパー
 */

// ---- 署名検証 ----------------------------------------------------------------

/**
 * LINE Webhook の署名を検証する。
 * Web Crypto API (HMAC-SHA-256) を使用し、タイミング攻撃対策のため定数時間比較を行う。
 *
 * @param body          リクエストの生 body 文字列（JSON 解析前の raw テキスト）
 * @param signature     X-Line-Signature ヘッダーの値（Base64 エンコード済み）
 * @param channelSecret LINE チャンネルシークレット
 */
export async function verifySignature(
  body: string,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  // Base64 デコード（不正な文字列は false を返す）
  let receivedBytes: Uint8Array;
  try {
    const binaryStr = atob(signature);
    receivedBytes = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  const encoder = new TextEncoder();

  // HMAC-SHA-256 キーをインポート
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // body の HMAC を計算
  const computedBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );
  const computedBytes = new Uint8Array(computedBuffer);

  // 定数時間比較（タイミング攻撃対策）
  if (computedBytes.length !== receivedBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < computedBytes.length; i++) {
    diff |= (computedBytes[i] ?? 0) ^ (receivedBytes[i] ?? 0);
  }
  return diff === 0;
}

// ---- Reply API --------------------------------------------------------------

/**
 * LINE Reply API でメッセージを送信する。
 *
 * @param replyToken  イベントから取得した replyToken
 * @param messages    送信するメッセージオブジェクトの配列
 * @param accessToken LINE チャンネルアクセストークン
 */
export async function replyMessage(
  replyToken: string,
  messages: unknown[],
  accessToken: string,
): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`replyMessage failed: ${String(res.status)} ${text}`);
  }
}

// ---- Content API ------------------------------------------------------------

/**
 * LINE コンテンツ API から画像などのバイナリを取得する。
 * Step 6 で画像保存時に使用する。
 *
 * @param messageId   LINE メッセージ ID
 * @param accessToken LINE チャンネルアクセストークン
 */
export async function getMessageContent(
  messageId: string,
  accessToken: string,
): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`getMessageContent failed: ${String(res.status)}`);
  }

  return res.arrayBuffer();
}
