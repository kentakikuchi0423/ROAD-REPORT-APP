/**
 * 管理画面 認証ユーティリティ
 *
 * - パスワード検証: SHA-256 hex (Web Crypto API)
 * - セッション管理: HMAC-SHA256 署名付き Cookie（ステートレス）
 *   Cookie 値の形式: "{expiry_ts}|{hmac_hex}"
 */

import type { Env } from "../../types";
import { ADMIN_BASE_PATH } from "./config";

// ---- 定数 -------------------------------------------------------------------

export const SESSION_COOKIE_NAME = "admin_session";
/** セッション有効期限: 8 時間 */
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

// ---- パスワード -------------------------------------------------------------

/** パスワード文字列の SHA-256 hex を返す */
export async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
  return bufToHex(hashBuf);
}

/**
 * パスワードと保存済み SHA-256 hex ハッシュを比較する。
 * タイミング攻撃対策のため定数時間比較を行う。
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const computed = await hashPassword(password);
  return timingSafeEqual(computed, storedHash);
}

// ---- セッション Cookie -------------------------------------------------------

/**
 * 署名付きセッション Cookie 値を生成する。
 * 形式: "{expiry_ts}|{hmac_hex}"
 */
export async function createSessionToken(secret: string): Promise<string> {
  const expiry = Date.now() + SESSION_DURATION_MS;
  const expiryStr = String(expiry);
  const hmac = await signHmac(expiryStr, secret);
  return `${expiryStr}|${hmac}`;
}

/**
 * セッション Cookie 値の有効性を検証する（HMAC + 有効期限）。
 */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split("|");
  if (parts.length !== 2) return false;
  const [expiryStr, hmacHex] = parts as [string, string];

  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry) || Date.now() > expiry) return false;

  const expected = await signHmac(expiryStr, secret);
  return timingSafeEqual(hmacHex, expected);
}

/** Cookie ヘッダーから admin_session の値を取得する */
export function getSessionCookieValue(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) {
      return rest.join("=");
    }
  }
  return null;
}

/**
 * 認証ミドルウェア。
 * セッション Cookie が有効なら null（処理続行）を返す。
 * 無効な場合、mode に応じて以下を返す:
 *   "page" → ログインページへの 302 リダイレクト（HTML ページ向け）
 *   "api"  → 401 JSON レスポンス（fetch API 向け: PATCH / DELETE 等）
 *
 * 注意: ユーザー名・パスワード等の個人情報をログに出さないこと。
 */
export async function requireAuth(
  request: Request,
  env: Env,
  mode: "page" | "api" = "page",
): Promise<Response | null> {
  const cookieHeader = request.headers.get("Cookie");
  const token = getSessionCookieValue(cookieHeader);
  if (token && (await verifySessionToken(token, env.ADMIN_SESSION_SECRET))) {
    return null; // 認証済み
  }
  if (mode === "api") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return Response.redirect(
    new URL(`${ADMIN_BASE_PATH}/login`, request.url).toString(),
    302,
  );
}

/** ログイン成功時の Set-Cookie ヘッダー値を返す */
export async function buildSessionCookieHeader(secret: string): Promise<string> {
  const token = await createSessionToken(secret);
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=${ADMIN_BASE_PATH}; Max-Age=${SESSION_DURATION_MS / 1000}`;
}

/** ログアウト用の Set-Cookie ヘッダー値（Cookie 削除）を返す */
export function buildLogoutCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=${ADMIN_BASE_PATH}; Max-Age=0`;
}

// ---- 内部ヘルパー ------------------------------------------------------------

/** HMAC-SHA256 の hex 文字列を返す */
async function signHmac(data: string, secret: string): Promise<string> {
  const keyBuf = new TextEncoder().encode(secret);
  const dataBuf = new TextEncoder().encode(data);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, dataBuf);
  return bufToHex(sig);
}

/** ArrayBuffer を hex 文字列に変換する */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 2 つの文字列を定数時間で比較する（タイミング攻撃対策）。
 * 長さが異なる場合は全バイト比較後に false を返す。
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const ca = a.charCodeAt(i) || 0;
    const cb = b.charCodeAt(i) || 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}
