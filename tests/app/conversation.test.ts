/**
 * 会話フロー（近景・遠景写真収集 + 位置情報受付 + 利用同意）のユニットテスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleConversationMessage } from "../../src/app/conversation";
import { getSession, upsertSession, deleteSession, insertReport } from "../../src/lib/db";
import { replyMessage, getMessageContent } from "../../src/lib/line";
import { uploadImage } from "../../src/lib/r2";
import type { ConversationSession, Env, Report } from "../../src/types";
import type { webhook } from "@line/bot-sdk";

// ---- モック設定 --------------------------------------------------------------

vi.mock("../../src/lib/db", () => ({
  getSession: vi.fn(),
  upsertSession: vi.fn(),
  deleteSession: vi.fn(),
  insertReport: vi.fn(),
}));

vi.mock("../../src/lib/line", () => ({
  replyMessage: vi.fn(),
  getMessageContent: vi.fn(),
}));

vi.mock("../../src/lib/r2", () => ({
  uploadImage: vi.fn(),
}));

vi.mock("../../src/lib/notification", () => ({
  createAdminNotifier: vi.fn(() => ({
    notifyNewReport: vi.fn().mockResolvedValue(undefined),
  })),
}));

const mockGetSession = vi.mocked(getSession);
const mockUpsertSession = vi.mocked(upsertSession);
const mockDeleteSession = vi.mocked(deleteSession);
const mockInsertReport = vi.mocked(insertReport);
const mockReplyMessage = vi.mocked(replyMessage);
const mockGetMessageContent = vi.mocked(getMessageContent);
const mockUploadImage = vi.mocked(uploadImage);

// ---- テスト用定数・ヘルパー --------------------------------------------------

const USER_ID = "U_test_user";
const REPLY_TOKEN = "reply-token-test";
const ACCESS_TOKEN = "test-access-token";

const mockEnv: Env = {
  LINE_CHANNEL_SECRET: "secret",
  LINE_CHANNEL_ACCESS_TOKEN: ACCESS_TOKEN,
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "hash",
  ADMIN_SESSION_SECRET: "test-session-secret",
  DB: {} as D1Database,
  IMAGES: {} as R2Bucket,
};

/** テキストメッセージイベントを生成するヘルパー */
function makeTextEvent(text: string): webhook.MessageEvent {
  return {
    type: "message",
    replyToken: REPLY_TOKEN,
    webhookEventId: "evt-text",
    source: { type: "user", userId: USER_ID },
    timestamp: Date.now(),
    mode: "active",
    deliveryContext: { isRedelivery: false },
    message: { type: "text", id: "msg-text", text, quoteToken: "qt" },
  } as webhook.MessageEvent;
}

/** 画像メッセージイベントを生成するヘルパー */
function makeImageEvent(messageId = "msg-img-001"): webhook.MessageEvent {
  return {
    type: "message",
    replyToken: REPLY_TOKEN,
    webhookEventId: "evt-image",
    source: { type: "user", userId: USER_ID },
    timestamp: Date.now(),
    mode: "active",
    deliveryContext: { isRedelivery: false },
    message: {
      type: "image",
      id: messageId,
      quoteToken: "qt",
      contentProvider: { type: "line" },
    },
  } as webhook.MessageEvent;
}

/** 位置情報メッセージイベントを生成するヘルパー */
function makeLocationEvent(
  latitude = 33.5057,
  longitude = 132.5595,
  address: string | null = "愛媛県大洲市大洲649",
): webhook.MessageEvent {
  return {
    type: "message",
    replyToken: REPLY_TOKEN,
    webhookEventId: "evt-location",
    source: { type: "user", userId: USER_ID },
    timestamp: Date.now(),
    mode: "active",
    deliveryContext: { isRedelivery: false },
    message: {
      type: "location",
      id: "msg-loc-001",
      title: address ?? "現在地",
      address,
      latitude,
      longitude,
    },
  } as webhook.MessageEvent;
}

/** スタンプメッセージイベントを生成するヘルパー */
function makeStickerEvent(): webhook.MessageEvent {
  return {
    type: "message",
    replyToken: REPLY_TOKEN,
    webhookEventId: "evt-sticker",
    source: { type: "user", userId: USER_ID },
    timestamp: Date.now(),
    mode: "active",
    deliveryContext: { isRedelivery: false },
    message: {
      type: "sticker",
      id: "msg-sticker",
      packageId: "1",
      stickerId: "1",
      quoteToken: "qt",
    },
  } as unknown as webhook.MessageEvent;
}

/** consent ステップのセッション */
function makeConsentSession(): ConversationSession {
  return {
    lineUserId: USER_ID,
    step: "consent",
    data: {},
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
  };
}

/** 任意テキスト入力ステップ共通のセッション */
function makeOptionalStepSession(step: ConversationSession["step"]): ConversationSession {
  return {
    lineUserId: USER_ID,
    step,
    data: {
      reportUuid: "opt-test-uuid",
      closePhotoKey: "reports/20260325/opt-test-uuid/close.jpg",
      farPhotoKey: "reports/20260325/opt-test-uuid/far.jpg",
      latitude: 33.5057,
      longitude: 132.5595,
      locationAddress: "愛媛県大洲市大洲649",
    },
    createdAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-03-25T00:00:00.000Z",
  };
}

/** close_photo ステップのセッション */
function makeClosePhotoSession(): ConversationSession {
  return {
    lineUserId: USER_ID,
    step: "close_photo",
    data: {},
    createdAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-03-25T00:00:00.000Z",
  };
}

/** location ステップのセッション */
function makeLocationSession(reportUuid = "loc-test-uuid-9012"): ConversationSession {
  return {
    lineUserId: USER_ID,
    step: "location",
    data: {
      reportUuid,
      closePhotoKey: `reports/20260325/${reportUuid}/close.jpg`,
      farPhotoKey: `reports/20260325/${reportUuid}/far.jpg`,
    },
    createdAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-03-25T00:00:00.000Z",
  };
}

/** far_photo ステップのセッション（reportUuid あり） */
function makeFarPhotoSession(reportUuid = "test-uuid-1234"): ConversationSession {
  return {
    lineUserId: USER_ID,
    step: "far_photo",
    data: {
      reportUuid,
      closePhotoKey: `reports/20260325/${reportUuid}/close.jpg`,
    },
    createdAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-03-25T00:00:00.000Z",
  };
}

const FAKE_IMAGE_DATA = new ArrayBuffer(16);

/** confirming ステップのセッション（全フィールド入力済み） */
function makeConfirmingSession(): ConversationSession {
  return {
    lineUserId: USER_ID,
    step: "confirming",
    data: {
      reportUuid: "confirm-uuid",
      closePhotoKey: "reports/20260325/confirm-uuid/close.jpg",
      farPhotoKey: "reports/20260325/confirm-uuid/far.jpg",
      latitude: 33.5057,
      longitude: 132.5595,
      locationAddress: "愛媛県大洲市大洲649",
      shootingDate: "2026-03-25",
      remarks: "ひび割れあり",
      reporterName: "山田太郎",
      reporterPhone: "0896-24-1111",
    },
    createdAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-03-25T00:00:00.000Z",
  };
}

const MOCK_REPORT: Report = {
  id: 1,
  receiptNumber: "OZU-20260325-001",
  lineUserId: USER_ID,
  status: "pending",
  closePhotoKey: "reports/20260325/confirm-uuid/close.jpg",
  farPhotoKey: "reports/20260325/confirm-uuid/far.jpg",
  latitude: 33.5057,
  longitude: 132.5595,
  locationAddress: "愛媛県大洲市大洲649",
  shootingDate: "2026-03-25",
  remarks: "ひび割れあり",
  reporterName: "山田太郎",
  reporterPhone: "0896-24-1111",
  createdAt: "2026-03-25T00:00:00.000Z",
  updatedAt: "2026-03-25T00:00:00.000Z",
};

// ---- テスト ------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsertSession.mockResolvedValue(undefined);
  mockDeleteSession.mockResolvedValue(undefined);
  mockInsertReport.mockResolvedValue(MOCK_REPORT);
  mockReplyMessage.mockResolvedValue(undefined);
  mockUploadImage.mockResolvedValue("uploaded-key");
  mockGetMessageContent.mockResolvedValue({
    data: FAKE_IMAGE_DATA,
    contentType: "image/jpeg",
  });
});

// ---- セッションなし ----------------------------------------------------------

describe("セッションなし", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(null);
  });

  it("「通報する」テキスト → セッション作成（consent ステップ）+ 利用同意メッセージ", async () => {
    await handleConversationMessage(makeTextEvent("通報する"), USER_ID, mockEnv);

    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, session] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(session.step).toBe("consent");
    expect(session.lineUserId).toBe(USER_ID);

    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("同意する");
    expect(msg.quickReply).toBeDefined();
  });

  it("「通報する」前後の空白は許容する", async () => {
    await handleConversationMessage(makeTextEvent("  通報する  "), USER_ID, mockEnv);
    expect(mockUpsertSession).toHaveBeenCalledOnce();
  });

  it("「通報する」以外のテキスト → 開始案内メッセージ（セッション作成なし）", async () => {
    await handleConversationMessage(makeTextEvent("こんにちは"), USER_ID, mockEnv);

    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("通報する");
  });

  it("画像メッセージ → 開始案内メッセージ（セッション作成なし）", async () => {
    await handleConversationMessage(makeImageEvent(), USER_ID, mockEnv);

    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
  });

  it("未対応種別（sticker）→ 返信なし", async () => {
    await handleConversationMessage(makeStickerEvent(), USER_ID, mockEnv);

    expect(mockReplyMessage).not.toHaveBeenCalled();
    expect(mockUpsertSession).not.toHaveBeenCalled();
  });
});

// ---- consent ステップ --------------------------------------------------------

describe("consent ステップ", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(makeConsentSession());
  });

  it("「同意する」→ セッションを close_photo に更新 + 近景写真を求めるメッセージ", async () => {
    await handleConversationMessage(makeTextEvent("同意する"), USER_ID, mockEnv);

    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(updated.step).toBe("close_photo");

    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("近景写真");
  });

  it("「キャンセル」→ deleteSession + キャンセルメッセージ", async () => {
    await handleConversationMessage(makeTextEvent("キャンセル"), USER_ID, mockEnv);

    expect(mockDeleteSession).toHaveBeenCalledWith(mockEnv.DB, USER_ID);
    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("中止しました");
  });

  it("「同意する」以外のテキスト → 再案内（セッション更新なし）", async () => {
    await handleConversationMessage(makeTextEvent("はい"), USER_ID, mockEnv);

    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("同意する");
    expect(msg.quickReply).toBeDefined();
  });

  it("画像メッセージ → 再案内（セッション更新なし）", async () => {
    await handleConversationMessage(makeImageEvent(), USER_ID, mockEnv);

    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("同意する");
  });
});

// ---- close_photo ステップ ----------------------------------------------------

describe("close_photo ステップ", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(makeClosePhotoSession());
  });

  it("画像メッセージ → R2 保存 + セッションを far_photo に更新 + 遠景写真を求めるメッセージ", async () => {
    await handleConversationMessage(makeImageEvent("img-close-001"), USER_ID, mockEnv);

    // LINE Content API から画像取得
    expect(mockGetMessageContent).toHaveBeenCalledWith("img-close-001", ACCESS_TOKEN);

    // R2 に保存（キーが close.jpg を含む）
    expect(mockUploadImage).toHaveBeenCalledOnce();
    const [bucket, key, data, contentType] = mockUploadImage.mock.calls[0] as [
      R2Bucket, string, ArrayBuffer, string,
    ];
    expect(bucket).toBe(mockEnv.IMAGES);
    expect(key).toMatch(/^reports\/\d{8}\/[0-9a-f-]+\/close\.jpg$/);
    expect(data).toBe(FAKE_IMAGE_DATA);
    expect(contentType).toBe("image/jpeg");

    // セッション更新: far_photo ステップ + closePhotoKey + reportUuid
    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(updated.step).toBe("far_photo");
    expect(updated.data.closePhotoKey).toBe(key);
    expect(updated.data.reportUuid).toBeTruthy();

    // 遠景写真を求めるメッセージ
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("遠景写真");
  });

  it("テキストメッセージ → 近景写真の再案内（R2 保存なし）", async () => {
    await handleConversationMessage(makeTextEvent("テスト"), USER_ID, mockEnv);

    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("近景写真");
  });

  it("replyToken がない場合は何もしない", async () => {
    const event = makeImageEvent();
    (event as Record<string, unknown>)["replyToken"] = undefined;
    await handleConversationMessage(event, USER_ID, mockEnv);

    expect(mockReplyMessage).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });
});

// ---- far_photo ステップ ------------------------------------------------------

describe("far_photo ステップ", () => {
  const REPORT_UUID = "far-test-uuid-5678";

  beforeEach(() => {
    mockGetSession.mockResolvedValue(makeFarPhotoSession(REPORT_UUID));
  });

  it("画像メッセージ → R2 保存 + セッションを location に更新 + 位置情報 Quick Reply 付きメッセージ", async () => {
    await handleConversationMessage(makeImageEvent("img-far-001"), USER_ID, mockEnv);

    expect(mockGetMessageContent).toHaveBeenCalledWith("img-far-001", ACCESS_TOKEN);

    // R2 に保存（同一 UUID の far.jpg）
    expect(mockUploadImage).toHaveBeenCalledOnce();
    const [, key] = mockUploadImage.mock.calls[0] as [R2Bucket, string, ArrayBuffer, string];
    expect(key).toMatch(new RegExp(`reports/\\d{8}/${REPORT_UUID}/far\\.jpg`));

    // セッション更新: location ステップ + farPhotoKey
    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(updated.step).toBe("location");
    expect(updated.data.farPhotoKey).toBe(key);
    // closePhotoKey は引き継がれている
    expect(updated.data.closePhotoKey).toContain("close.jpg");

    // 位置情報を求めるメッセージ（Quick Reply 付き）
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("位置情報");
    expect(msg.quickReply).toBeDefined();
  });

  it("テキストメッセージ → 遠景写真の再案内（R2 保存なし）", async () => {
    await handleConversationMessage(makeTextEvent("テスト"), USER_ID, mockEnv);

    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("遠景写真");
  });

  it("reportUuid がない場合でも新規 UUID で R2 保存する", async () => {
    const sessionWithoutUuid = makeFarPhotoSession();
    delete sessionWithoutUuid.data.reportUuid;
    mockGetSession.mockResolvedValue(sessionWithoutUuid);

    await handleConversationMessage(makeImageEvent(), USER_ID, mockEnv);

    expect(mockUploadImage).toHaveBeenCalledOnce();
    const [, key] = mockUploadImage.mock.calls[0] as [R2Bucket, string, ArrayBuffer, string];
    expect(key).toMatch(/^reports\/\d{8}\/.+\/far\.jpg$/);
  });
});

// ---- location ステップ -------------------------------------------------------

describe("location ステップ", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(makeLocationSession());
  });

  it("位置情報メッセージ → セッションを shooting_date に更新 + スキップ Quick Reply 付きメッセージ", async () => {
    const LAT = 33.5057;
    const LNG = 132.5595;
    const ADDR = "愛媛県大洲市大洲649";

    await handleConversationMessage(makeLocationEvent(LAT, LNG, ADDR), USER_ID, mockEnv);

    // R2 へのアップロードは発生しない
    expect(mockUploadImage).not.toHaveBeenCalled();

    // セッション更新: shooting_date ステップ + lat/lng/address
    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(updated.step).toBe("shooting_date");
    expect(updated.data.latitude).toBe(LAT);
    expect(updated.data.longitude).toBe(LNG);
    expect(updated.data.locationAddress).toBe(ADDR);
    // 写真キーは引き継がれている
    expect(updated.data.closePhotoKey).toContain("close.jpg");
    expect(updated.data.farPhotoKey).toContain("far.jpg");

    // 撮影日付を求めるメッセージ（スキップ Quick Reply 付き）
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("撮影日付");
    expect(msg.quickReply).toBeDefined();
  });

  it("address が null の場合は locationAddress を保存しない", async () => {
    await handleConversationMessage(makeLocationEvent(33.5, 132.5, null), USER_ID, mockEnv);

    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(updated.data.locationAddress).toBeUndefined();
    expect(updated.data.latitude).toBe(33.5);
    expect(updated.data.longitude).toBe(132.5);
  });

  it("テキストメッセージ → 位置情報の再案内（Quick Reply 付き、セッション更新なし）", async () => {
    await handleConversationMessage(makeTextEvent("テスト"), USER_ID, mockEnv);

    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("位置情報");
    expect(msg.quickReply).toBeDefined();
  });

  it("画像メッセージ → 位置情報の再案内（セッション更新なし）", async () => {
    await handleConversationMessage(makeImageEvent(), USER_ID, mockEnv);

    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("位置情報");
  });
});

// ---- 任意テキスト入力ステップの共通テストユーティリティ ----------------------

/**
 * 任意テキスト入力ステップ（shooting_date / remarks / reporter_name / reporter_phone）の
 * 共通パターンをテストするヘルパー。
 */
function testOptionalStep(opts: {
  step: ConversationSession["step"];
  validText: string;
  invalidText: string;
  invalidErrorContains: string;
  savedField: keyof ConversationSession["data"];
  nextStep: string;
  nextMsgContains: string;
}) {
  const { step, validText, invalidText, invalidErrorContains, savedField, nextStep, nextMsgContains } = opts;

  describe(`${step} ステップ`, () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeOptionalStepSession(step));
    });

    it(`有効なテキスト → ${savedField} を保存して ${nextStep} へ（Quick Reply 付き）`, async () => {
      await handleConversationMessage(makeTextEvent(validText), USER_ID, mockEnv);

      expect(mockUpsertSession).toHaveBeenCalledOnce();
      const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
      expect(updated.step).toBe(nextStep);
      expect(updated.data[savedField]).toBe(validText.trim());

      expect(mockReplyMessage).toHaveBeenCalledOnce();
      const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
      const msg = messages[0] as { text: string; quickReply?: unknown };
      expect(msg.text).toContain(nextMsgContains);
      expect(msg.quickReply).toBeDefined();
    });

    it("「スキップ」 → フィールド保存なしで次ステップへ", async () => {
      await handleConversationMessage(makeTextEvent("スキップ"), USER_ID, mockEnv);

      expect(mockUpsertSession).toHaveBeenCalledOnce();
      const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
      expect(updated.step).toBe(nextStep);
      expect(updated.data[savedField]).toBeUndefined();
    });

    it("無効なテキスト → エラーメッセージ（スキップ Quick Reply 付き、セッション更新なし）", async () => {
      await handleConversationMessage(makeTextEvent(invalidText), USER_ID, mockEnv);

      expect(mockUpsertSession).not.toHaveBeenCalled();
      expect(mockReplyMessage).toHaveBeenCalledOnce();
      const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
      const msg = messages[0] as { text: string; quickReply?: unknown };
      expect(msg.text).toContain(invalidErrorContains);
      expect(msg.quickReply).toBeDefined();
    });

    it("画像メッセージ → テキスト入力を促す案内（スキップ Quick Reply 付き、セッション更新なし）", async () => {
      await handleConversationMessage(makeImageEvent(), USER_ID, mockEnv);

      expect(mockUpsertSession).not.toHaveBeenCalled();
      expect(mockUploadImage).not.toHaveBeenCalled();
      expect(mockReplyMessage).toHaveBeenCalledOnce();
      const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
      const msg = messages[0] as { text: string; quickReply?: unknown };
      expect(msg.text).toContain("スキップ");
      expect(msg.quickReply).toBeDefined();
    });
  });
}

// ---- shooting_date ステップ --------------------------------------------------

testOptionalStep({
  step: "shooting_date",
  validText: "2026-03-25",
  invalidText: "2099-12-31",
  invalidErrorContains: "本日以前",
  savedField: "shootingDate",
  nextStep: "remarks",
  nextMsgContains: "補足事項",
});

// ---- remarks ステップ --------------------------------------------------------

testOptionalStep({
  step: "remarks",
  validText: "アスファルトが剥がれています",
  invalidText: "A".repeat(501),
  invalidErrorContains: "500 文字以内",
  savedField: "remarks",
  nextStep: "reporter_name",
  nextMsgContains: "お名前",
});

// ---- reporter_name ステップ --------------------------------------------------

testOptionalStep({
  step: "reporter_name",
  validText: "山田太郎",
  invalidText: "A".repeat(101),
  invalidErrorContains: "100 文字以内",
  savedField: "reporterName",
  nextStep: "reporter_phone",
  nextMsgContains: "電話番号",
});

// ---- reporter_phone ステップ -------------------------------------------------

testOptionalStep({
  step: "reporter_phone",
  validText: "0896-24-1111",
  invalidText: "abc-def-ghij",
  invalidErrorContains: "数字・ハイフン",
  savedField: "reporterPhone",
  nextStep: "confirming",
  nextMsgContains: "送信する",
});

// ---- reporter_phone → confirming サマリー表示 --------------------------------

describe("reporter_phone → confirming 遷移時のサマリーメッセージ", () => {
  it("入力済みフィールドがサマリーに含まれる（確認 Quick Reply 付き）", async () => {
    const session = makeOptionalStepSession("reporter_phone");
    session.data.shootingDate = "2026-03-25";
    session.data.remarks = "ひび割れあり";
    session.data.reporterName = "山田太郎";
    mockGetSession.mockResolvedValue(session);

    await handleConversationMessage(makeTextEvent("スキップ"), USER_ID, mockEnv);

    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("通報内容の確認");
    expect(msg.text).toContain("近景写真：受付済み");
    expect(msg.text).toContain("山田太郎");
    expect(msg.text).toContain("2026-03-25");
    expect(msg.text).toContain("送信する");
    expect(msg.text).toContain("やり直す");
    expect(msg.quickReply).toBeDefined();
  });

  it("未入力フィールドは「未入力」と表示される", async () => {
    const session = makeOptionalStepSession("reporter_phone");
    // shootingDate / remarks / reporterName / reporterPhone はすべて未設定
    mockGetSession.mockResolvedValue(session);

    await handleConversationMessage(makeTextEvent("スキップ"), USER_ID, mockEnv);

    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const text = (messages[0] as { text: string }).text;
    expect(text).toContain("撮影日付：未入力");
    expect(text).toContain("お名前：匿名");
  });
});

// ---- confirming ステップ -----------------------------------------------------

describe("confirming ステップ", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(makeConfirmingSession());
  });

  it("任意項目がすべて未入力（匿名・全スキップ）でも送信完了できる", async () => {
    // 必須フィールドのみ・任意フィールドは一切なし（匿名通報）
    const anonymousSession: ConversationSession = {
      lineUserId: USER_ID,
      step: "confirming",
      data: {
        reportUuid: "anon-uuid",
        closePhotoKey: "reports/20260326/anon-uuid/close.jpg",
        farPhotoKey: "reports/20260326/anon-uuid/far.jpg",
        latitude: 33.5057,
        longitude: 132.5595,
        // locationAddress / shootingDate / remarks / reporterName / reporterPhone は未設定
      },
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
    };
    mockGetSession.mockResolvedValue(anonymousSession);

    await handleConversationMessage(makeTextEvent("送信する"), USER_ID, mockEnv);

    // insertReport が null 値で呼ばれる
    expect(mockInsertReport).toHaveBeenCalledOnce();
    const [, reportData] = mockInsertReport.mock.calls[0] as [D1Database, Record<string, unknown>];
    expect(reportData.locationAddress).toBeNull();
    expect(reportData.shootingDate).toBeNull();
    expect(reportData.remarks).toBeNull();
    expect(reportData.reporterName).toBeNull();
    expect(reportData.reporterPhone).toBeNull();

    // 完了メッセージが返る
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("受付番号");
  });

  it("「送信する」→ insertReport + deleteSession + 受付番号を含む完了メッセージ", async () => {
    await handleConversationMessage(makeTextEvent("送信する"), USER_ID, mockEnv);

    // insertReport が正しい引数で呼ばれる
    expect(mockInsertReport).toHaveBeenCalledOnce();
    const [, reportData] = mockInsertReport.mock.calls[0] as [D1Database, Record<string, unknown>];
    expect(reportData.status).toBe("pending");
    expect(reportData.closePhotoKey).toBe("reports/20260325/confirm-uuid/close.jpg");
    expect(reportData.latitude).toBe(33.5057);

    // 二重送信ガード: completed に更新してから insertReport を呼ぶ
    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, completedSession] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(completedSession.step).toBe("completed");

    // セッション削除
    expect(mockDeleteSession).toHaveBeenCalledWith(mockEnv.DB, USER_ID);

    // 受付番号を含む完了メッセージ
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const text = (messages[0] as { text: string }).text;
    expect(text).toContain("OZU-20260325-001");
    expect(text).toContain("受付番号");
  });

  it("「やり直す」→ upsertSession（consent ステップに戻る）+ 利用同意メッセージ", async () => {
    await handleConversationMessage(makeTextEvent("やり直す"), USER_ID, mockEnv);

    expect(mockInsertReport).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, restored] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(restored.step).toBe("consent");
    expect(restored.data).toEqual({});

    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("同意する");
    expect(msg.quickReply).toBeDefined();
  });

  it("その他テキスト → 操作案内のみ（確認 Quick Reply 付き、セッション変更なし）", async () => {
    await handleConversationMessage(makeTextEvent("確認"), USER_ID, mockEnv);

    expect(mockInsertReport).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("送信する");
    expect(msg.quickReply).toBeDefined();
  });

  it("画像メッセージ → 操作案内のみ（セッション変更なし）", async () => {
    await handleConversationMessage(makeImageEvent(), USER_ID, mockEnv);

    expect(mockInsertReport).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
  });

  it("必須フィールド欠損 → deleteSession + エラーメッセージ（insertReport 呼ばれない）", async () => {
    const broken = makeConfirmingSession();
    delete broken.data.closePhotoKey;
    mockGetSession.mockResolvedValue(broken);

    await handleConversationMessage(makeTextEvent("送信する"), USER_ID, mockEnv);

    expect(mockInsertReport).not.toHaveBeenCalled();
    expect(mockDeleteSession).toHaveBeenCalledWith(mockEnv.DB, USER_ID);
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("やり直し");
  });

  it("「送信する」→ 先に completed に更新してから insertReport を呼ぶ（二重送信ガード）", async () => {
    await handleConversationMessage(makeTextEvent("送信する"), USER_ID, mockEnv);

    // upsertSession が completed ステップで呼ばれる（insertReport より前）
    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, completedSession] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(completedSession.step).toBe("completed");

    // insertReport が呼ばれる
    expect(mockInsertReport).toHaveBeenCalledOnce();

    // 最終的に deleteSession が呼ばれる
    expect(mockDeleteSession).toHaveBeenCalledWith(mockEnv.DB, USER_ID);
  });

  it("insertReport 失敗 → セッションを confirming に戻し、エラーメッセージ（Quick Reply 付き）", async () => {
    mockInsertReport.mockRejectedValueOnce(new Error("D1 insert error"));

    await handleConversationMessage(makeTextEvent("送信する"), USER_ID, mockEnv);

    // upsertSession が2回呼ばれる: completed → confirming（リカバリー）
    expect(mockUpsertSession).toHaveBeenCalledTimes(2);
    const [, first] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    const [, second] = mockUpsertSession.mock.calls[1] as [D1Database, ConversationSession];
    expect(first.step).toBe("completed");
    expect(second.step).toBe("confirming");

    // deleteSession は呼ばれない
    expect(mockDeleteSession).not.toHaveBeenCalled();

    // エラーメッセージ（Quick Reply 付き）
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("エラー");
    expect(msg.quickReply).toBeDefined();
  });
});

// ---- completed ステップ（二重送信・処理中） ------------------------------------

describe("completed ステップ", () => {
  it("任意のメッセージ → 受付済み案内（セッション変更なし）", async () => {
    mockGetSession.mockResolvedValue({
      lineUserId: USER_ID,
      step: "completed",
      data: {},
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
    });

    await handleConversationMessage(makeTextEvent("送信する"), USER_ID, mockEnv);

    expect(mockInsertReport).not.toHaveBeenCalled();
    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("受け付け済み");
  });
});

// ---- キャンセル確認フロー（cancelling ステップ） ---------------------------------

describe("「通報を中止する」→ cancelling ステップへ遷移", () => {
  it("close_photo ステップで「通報を中止する」→ cancelling に遷移 + 確認メッセージ", async () => {
    mockGetSession.mockResolvedValue(makeClosePhotoSession());

    await handleConversationMessage(makeTextEvent("通報を中止する"), USER_ID, mockEnv);

    // セッションが cancelling に更新される
    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(updated.step).toBe("cancelling");
    expect(updated.data.previousStep).toBe("close_photo");

    // 即時 deleteSession は呼ばれない
    expect(mockDeleteSession).not.toHaveBeenCalled();

    // 確認メッセージ（Quick Reply 付き）
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: { items: unknown[] } };
    expect(msg.text).toContain("中止してよろしいですか");
    expect(msg.quickReply).toBeDefined();
    expect(msg.quickReply?.items).toHaveLength(2);
  });

  it("confirming ステップで「通報を中止する」→ cancelling に遷移 + 確認メッセージ", async () => {
    mockGetSession.mockResolvedValue(makeOptionalStepSession("confirming"));

    await handleConversationMessage(makeTextEvent("通報を中止する"), USER_ID, mockEnv);

    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(updated.step).toBe("cancelling");
    expect(updated.data.previousStep).toBe("confirming");
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it("remarks ステップで「通報を中止する」→ cancelling に遷移", async () => {
    mockGetSession.mockResolvedValue(makeOptionalStepSession("remarks"));

    await handleConversationMessage(makeTextEvent("通報を中止する"), USER_ID, mockEnv);

    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, updated] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(updated.step).toBe("cancelling");
    expect(updated.data.previousStep).toBe("remarks");
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });
});

describe("cancelling ステップ", () => {
  function makeCancellingSession(prevStep: ConversationSession["step"]): ConversationSession {
    return {
      lineUserId: USER_ID,
      step: "cancelling",
      data: {
        reportUuid: "cancel-test-uuid",
        closePhotoKey: "reports/20260326/cancel-test-uuid/close.jpg",
        farPhotoKey: "reports/20260326/cancel-test-uuid/far.jpg",
        latitude: 33.5057,
        longitude: 132.5595,
        previousStep: prevStep,
      },
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
    };
  }

  beforeEach(() => {
    mockGetSession.mockResolvedValue(makeCancellingSession("remarks"));
  });

  it("「はい、中止します」→ deleteSession + キャンセルメッセージ", async () => {
    await handleConversationMessage(makeTextEvent("はい、中止します"), USER_ID, mockEnv);

    expect(mockDeleteSession).toHaveBeenCalledWith(mockEnv.DB, USER_ID);
    expect(mockUpsertSession).not.toHaveBeenCalled();

    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    expect((messages[0] as { text: string }).text).toContain("中止しました");
  });

  it("「いいえ、続けます」→ セッションを previousStep に戻す + 再案内メッセージ", async () => {
    await handleConversationMessage(makeTextEvent("いいえ、続けます"), USER_ID, mockEnv);

    expect(mockDeleteSession).not.toHaveBeenCalled();

    // セッションが remarks に戻る
    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, restored] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(restored.step).toBe("remarks");
    // previousStep がデータから除去される
    expect(restored.data.previousStep).toBeUndefined();

    // 再案内メッセージ（Quick Reply 付き）
    expect(mockReplyMessage).toHaveBeenCalledOnce();
    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toBeTruthy();
    expect(msg.quickReply).toBeDefined();
  });

  it("「いいえ、続けます」→ close_photo ステップへの復帰でも Quick Reply あり", async () => {
    mockGetSession.mockResolvedValue(makeCancellingSession("close_photo"));

    await handleConversationMessage(makeTextEvent("いいえ、続けます"), USER_ID, mockEnv);

    expect(mockUpsertSession).toHaveBeenCalledOnce();
    const [, restored] = mockUpsertSession.mock.calls[0] as [D1Database, ConversationSession];
    expect(restored.step).toBe("close_photo");

    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("写真");
    expect(msg.quickReply).toBeDefined();
  });

  it("その他のテキスト → 確認メッセージ再案内（セッション変更なし）", async () => {
    await handleConversationMessage(makeTextEvent("どちらでもない"), USER_ID, mockEnv);

    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();

    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("中止してよろしいですか");
    expect(msg.quickReply).toBeDefined();
  });

  it("テキスト以外（画像）→ 確認メッセージ再案内（セッション変更なし）", async () => {
    await handleConversationMessage(makeImageEvent(), USER_ID, mockEnv);

    expect(mockUpsertSession).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();

    const [, messages] = mockReplyMessage.mock.calls[0] as [string, unknown[], string];
    const msg = messages[0] as { text: string; quickReply?: unknown };
    expect(msg.text).toContain("中止してよろしいですか");
    expect(msg.quickReply).toBeDefined();
  });
});
