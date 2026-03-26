/**
 * LINE ヘルパーのユニットテスト
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { verifySignature, replyMessage, getMessageContent } from "../../src/lib/line";

// ---- テスト用ヘルパー --------------------------------------------------------

/**
 * 指定した body と secret で HMAC-SHA-256 署名を計算し、Base64 文字列を返す。
 * Node.js 22 の globalThis.crypto を使用（モック不要）。
 */
async function computeSignature(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// ---- verifySignature --------------------------------------------------------

describe("verifySignature", () => {
  it("正しい署名は true を返す", async () => {
    const body = '{"events":[]}';
    const secret = "test-channel-secret";
    const sig = await computeSignature(body, secret);
    expect(await verifySignature(body, sig, secret)).toBe(true);
  });

  it("別の secret で計算した署名は false を返す", async () => {
    const body = '{"events":[]}';
    const sig = await computeSignature(body, "wrong-secret");
    expect(await verifySignature(body, sig, "correct-secret")).toBe(false);
  });

  it("空文字列の署名は false を返す", async () => {
    const body = '{"events":[]}';
    const secret = "test-channel-secret";
    expect(await verifySignature(body, "", secret)).toBe(false);
  });

  it("改ざんされた body は false を返す", async () => {
    const secret = "test-channel-secret";
    const sig = await computeSignature('{"events":[]}', secret);
    expect(await verifySignature('{"events":[], "extra": true}', sig, secret)).toBe(false);
  });

  it("Base64 以外の文字列の署名は false を返す", async () => {
    const body = '{"events":[]}';
    const secret = "test-channel-secret";
    expect(await verifySignature(body, "not-valid-base64!!!", secret)).toBe(false);
  });
});

// ---- replyMessage -----------------------------------------------------------

describe("replyMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("正しいエンドポイント・ヘッダー・ボディで fetch を呼び出す", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sentMessages: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const replyToken = "test-reply-token";
    const messages = [{ type: "text", text: "hello" }];
    const accessToken = "test-access-token";

    await replyMessage(replyToken, messages, accessToken);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.line.me/v2/bot/message/reply");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${accessToken}`,
    );
    const body = JSON.parse(init.body as string) as unknown;
    expect(body).toEqual({ replyToken, messages });
  });

  it("非 2xx レスポンスはエラーを throw する", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(replyMessage("token", [], "bad-token")).rejects.toThrow(
      "replyMessage failed: 401",
    );
  });
});

// ---- getMessageContent ------------------------------------------------------

describe("getMessageContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("正しいエンドポイントで fetch を呼び出し data と contentType を返す", async () => {
    const fakeBuffer = new ArrayBuffer(8);
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(fakeBuffer, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const messageId = "msg-12345";
    const accessToken = "test-token";
    const result = await getMessageContent(messageId, accessToken);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    );
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${accessToken}`,
    );
    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("content-type ヘッダーなしの場合は image/jpeg を返す", async () => {
    const fakeBuffer = new ArrayBuffer(4);
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(fakeBuffer, { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await getMessageContent("msg-no-ct", "token");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("非 2xx レスポンスはエラーを throw する", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(getMessageContent("bad-id", "token")).rejects.toThrow(
      "getMessageContent failed: 404",
    );
  });
});
