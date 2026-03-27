/**
 * 管理画面 認証ユーティリティのユニットテスト
 */

import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getSessionCookieValue,
  buildSessionCookieHeader,
  buildLogoutCookieHeader,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "../../src/app/admin/auth";

// ---- verifyPassword ----------------------------------------------------------

describe("verifyPassword", () => {
  it("正しいパスワードは true を返す", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("correct-password", hash)).toBe(true);
  });

  it("誤ったパスワードは false を返す", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("ハッシュが完全に異なる文字列でも false を返す（クラッシュしない）", async () => {
    expect(await verifyPassword("password", "not-a-hash-at-all")).toBe(false);
  });

  it("空パスワードはハッシュが一致する場合のみ true を返す", async () => {
    const hash = await hashPassword("");
    expect(await verifyPassword("", hash)).toBe(true);
    expect(await verifyPassword("notempty", hash)).toBe(false);
  });
});

// ---- createSessionToken / verifySessionToken ---------------------------------

describe("createSessionToken / verifySessionToken", () => {
  const SECRET = "test-session-secret-32chars-long!!";

  it("生成したトークンは検証に成功する", async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });

  it("別の secret で検証すると false を返す", async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, "different-secret")).toBe(false);
  });

  it("期限切れトークン（過去の有効期限）は false を返す", async () => {
    // 有効期限を 1 秒前に設定した手製トークン
    const expiry = Date.now() - 1000;
    const expiryStr = String(expiry);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(expiryStr));
    const hmacHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expiredToken = `${expiryStr}|${hmacHex}`;

    expect(await verifySessionToken(expiredToken, SECRET)).toBe(false);
  });

  it("パイプ区切り形式でないトークンは false を返す", async () => {
    expect(await verifySessionToken("invalidtoken", SECRET)).toBe(false);
  });

  it("空文字列は false を返す", async () => {
    expect(await verifySessionToken("", SECRET)).toBe(false);
  });

  it("パイプが複数あるトークンは false を返す（形式不正）", async () => {
    expect(await verifySessionToken("a|b|c", SECRET)).toBe(false);
  });

  it("HMAC が改ざんされたトークンは false を返す", async () => {
    const token = await createSessionToken(SECRET);
    const [expiry] = token.split("|");
    const tampered = `${expiry}|${"0".repeat(64)}`;
    expect(await verifySessionToken(tampered, SECRET)).toBe(false);
  });

  it("有効期限の数値部分が NaN のトークンは false を返す", async () => {
    expect(await verifySessionToken("notanumber|fakehex", SECRET)).toBe(false);
  });

  it("生成トークンの有効期限は現在時刻から SESSION_DURATION_MS 後である", async () => {
    const before = Date.now();
    const token = await createSessionToken(SECRET);
    const after = Date.now();

    const [expiryStr] = token.split("|");
    const expiry = parseInt(expiryStr!, 10);
    expect(expiry).toBeGreaterThanOrEqual(before + SESSION_DURATION_MS);
    expect(expiry).toBeLessThanOrEqual(after + SESSION_DURATION_MS);
  });
});

// ---- getSessionCookieValue ---------------------------------------------------

describe("getSessionCookieValue", () => {
  it("単一 Cookie から値を取得できる", () => {
    expect(getSessionCookieValue(`${SESSION_COOKIE_NAME}=token-value`)).toBe("token-value");
  });

  it("複数 Cookie の中から admin_session を取得できる", () => {
    expect(
      getSessionCookieValue(
        `other_cookie=foo; ${SESSION_COOKIE_NAME}=my-token; another=bar`,
      ),
    ).toBe("my-token");
  });

  it("Cookie が存在しない場合は null を返す", () => {
    expect(getSessionCookieValue("other_cookie=foo")).toBeNull();
  });

  it("Cookie ヘッダーが null の場合は null を返す", () => {
    expect(getSessionCookieValue(null)).toBeNull();
  });

  it("Cookie の値に = が含まれる場合も正しく取得できる（Base64 等）", () => {
    expect(
      getSessionCookieValue(`${SESSION_COOKIE_NAME}=abc=def==`),
    ).toBe("abc=def==");
  });
});

// ---- buildSessionCookieHeader ------------------------------------------------

describe("buildSessionCookieHeader", () => {
  it("HttpOnly / SameSite=Strict / Path=/admin が含まれる", async () => {
    const header = await buildSessionCookieHeader("some-secret");
    expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/admin");
  });

  it("Max-Age が SESSION_DURATION_MS / 1000 に設定される", async () => {
    const header = await buildSessionCookieHeader("some-secret");
    expect(header).toContain(`Max-Age=${SESSION_DURATION_MS / 1000}`);
  });
});

// ---- buildLogoutCookieHeader -------------------------------------------------

describe("buildLogoutCookieHeader", () => {
  it("Max-Age=0 で Cookie を削除する", () => {
    const header = buildLogoutCookieHeader();
    expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/admin");
  });
});
