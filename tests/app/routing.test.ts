/**
 * Workers エントリーポイントのルーティングテスト
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../../src/app/index";
import type { Env } from "../../src/types";

// ---- テスト用ヘルパー --------------------------------------------------------

/** HMAC-SHA-256 署名を計算して Base64 文字列を返す */
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

const TEST_SECRET = "test-channel-secret";
const TEST_TOKEN = "test-access-token";

/** セッションを返さない D1 モック（セッションなし状態をデフォルトとする） */
const mockDb = {
  prepare: vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} }),
    }),
  }),
} as unknown as D1Database;

const mockEnv: Env = {
  LINE_CHANNEL_SECRET: TEST_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN: TEST_TOKEN,
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "hash",
  DB: mockDb,
  IMAGES: {} as R2Bucket,
};

const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

// ---- ルーティングテスト -----------------------------------------------------

describe("fetch handler routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POST /webhook（正しい署名・空 events）は 200 を返す", async () => {
    // fetch をモック（replyMessage は呼ばれないが念のため）
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    const body = JSON.stringify({ destination: "Uxxxx", events: [] });
    const sig = await computeSignature(body, TEST_SECRET);

    const req = new Request("http://localhost/webhook", {
      method: "POST",
      headers: { "x-line-signature": sig, "Content-Type": "application/json" },
      body,
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
  });

  it("POST /webhook（署名ヘッダーなし）は 401 を返す", async () => {
    const body = JSON.stringify({ destination: "Uxxxx", events: [] });
    const req = new Request("http://localhost/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(401);
  });

  it("POST /webhook（不正な署名）は 401 を返す", async () => {
    const body = JSON.stringify({ destination: "Uxxxx", events: [] });
    const wrongSig = await computeSignature(body, "wrong-secret");

    const req = new Request("http://localhost/webhook", {
      method: "POST",
      headers: { "x-line-signature": wrongSig, "Content-Type": "application/json" },
      body,
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(401);
  });

  it("GET /privacy は 200 + text/html を返す", async () => {
    const req = new Request("http://localhost/privacy", { method: "GET" });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });

  it("不明なパスは 404 を返す", async () => {
    const req = new Request("http://localhost/unknown", { method: "GET" });
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(404);
  });
});

// ---- Webhook イベントルーティングテスト --------------------------------------

describe("webhook event routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 署名付きの POST /webhook リクエストを作成するヘルパー */
  async function makeWebhookRequest(events: unknown[]): Promise<Request> {
    const body = JSON.stringify({ destination: "Uxxxx", events });
    const sig = await computeSignature(body, TEST_SECRET);
    return new Request("http://localhost/webhook", {
      method: "POST",
      headers: { "x-line-signature": sig, "Content-Type": "application/json" },
      body,
    });
  }

  it("text メッセージイベントは replyMessage を呼び出す", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const req = await makeWebhookRequest([
      {
        type: "message",
        replyToken: "reply-token-text",
        webhookEventId: "evt-001",
        source: { type: "user", userId: "U123" },
        timestamp: Date.now(),
        mode: "active",
        deliveryContext: { isRedelivery: false },
        message: { type: "text", id: "msg-001", text: "hello", quoteToken: "qt" },
      },
    ]);

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    // replyMessage が LINE Reply API を呼んでいることを確認
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("image メッセージイベントは replyMessage を呼び出す", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const req = await makeWebhookRequest([
      {
        type: "message",
        replyToken: "reply-token-image",
        webhookEventId: "evt-002",
        source: { type: "user", userId: "U123" },
        timestamp: Date.now(),
        mode: "active",
        deliveryContext: { isRedelivery: false },
        message: {
          type: "image",
          id: "msg-002",
          quoteToken: "qt",
          contentProvider: { type: "line" },
        },
      },
    ]);

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("location メッセージイベントは replyMessage を呼び出す", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const req = await makeWebhookRequest([
      {
        type: "message",
        replyToken: "reply-token-location",
        webhookEventId: "evt-003",
        source: { type: "user", userId: "U123" },
        timestamp: Date.now(),
        mode: "active",
        deliveryContext: { isRedelivery: false },
        message: {
          type: "location",
          id: "msg-003",
          title: "現在地",
          address: "愛媛県大洲市",
          latitude: 33.5,
          longitude: 132.5,
        },
      },
    ]);

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("follow イベントは replyMessage を呼び出す", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const req = await makeWebhookRequest([
      {
        type: "follow",
        replyToken: "reply-token-follow",
        webhookEventId: "evt-004",
        source: { type: "user", userId: "U123" },
        timestamp: Date.now(),
        mode: "active",
        deliveryContext: { isRedelivery: false },
      },
    ]);

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("未対応メッセージ種別（sticker）は返信なしで 200 を返す", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const req = await makeWebhookRequest([
      {
        type: "message",
        replyToken: "reply-token-sticker",
        webhookEventId: "evt-005",
        source: { type: "user", userId: "U123" },
        timestamp: Date.now(),
        mode: "active",
        deliveryContext: { isRedelivery: false },
        message: {
          type: "sticker",
          id: "msg-005",
          packageId: "1",
          stickerId: "1",
          quoteToken: "qt",
        },
      },
    ]);

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    // sticker は返信なし
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("unfollow イベントは返信なしで 200 を返す", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const req = await makeWebhookRequest([
      {
        type: "unfollow",
        webhookEventId: "evt-006",
        source: { type: "user", userId: "U123" },
        timestamp: Date.now(),
        mode: "active",
        deliveryContext: { isRedelivery: false },
      },
    ]);

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("処理中の例外は 200 を返す（LINE 再送防止）", async () => {
    // replyMessage が失敗するケース
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Error", { status: 500 })),
    );

    const req = await makeWebhookRequest([
      {
        type: "message",
        replyToken: "reply-token-err",
        webhookEventId: "evt-007",
        source: { type: "user", userId: "U123" },
        timestamp: Date.now(),
        mode: "active",
        deliveryContext: { isRedelivery: false },
        message: { type: "text", id: "msg-007", text: "hi", quoteToken: "qt" },
      },
    ]);

    const res = await worker.fetch(req, mockEnv, mockCtx);
    // エラーが発生しても LINE に 200 を返す
    expect(res.status).toBe(200);
  });
});
