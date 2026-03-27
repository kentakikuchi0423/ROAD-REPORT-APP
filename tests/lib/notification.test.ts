/**
 * 管理者通知モジュールのユニットテスト
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createAdminNotifier } from "../../src/lib/notification";
import type { Env, Report } from "../../src/types";

// ---- テスト用定数 ------------------------------------------------------------

const MOCK_REPORT: Report = {
  id: 1,
  receiptNumber: "OZU-20260326-001",
  lineUserId: "Utest123",
  status: "pending",
  closePhotoKey: "reports/20260326/test-uuid/close.jpg",
  farPhotoKey: "reports/20260326/test-uuid/far.jpg",
  latitude: 33.5057,
  longitude: 132.5595,
  locationAddress: "愛媛県大洲市大洲649",
  shootingDate: null,
  remarks: null,
  reporterName: null,
  reporterPhone: null,
  createdAt: "2026-03-26T00:00:00.000Z",
  updatedAt: "2026-03-26T00:00:00.000Z",
};

function makeEnv(adminUserId?: string): Env {
  return {
    LINE_CHANNEL_SECRET: "secret",
    LINE_CHANNEL_ACCESS_TOKEN: "test-access-token",
    LINE_ADMIN_USER_ID: adminUserId,
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD_HASH: "hash",
    ADMIN_SESSION_SECRET: "session-secret",
    DB: {} as D1Database,
    IMAGES: {} as R2Bucket,
  };
}

// ---- createAdminNotifier -----------------------------------------------------

describe("createAdminNotifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("LINE_ADMIN_USER_ID が設定されている場合", () => {
    it("LINE Push API を正しいエンドポイント・ヘッダーで呼び出す", async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);

      const notifier = createAdminNotifier(makeEnv("Uadmin123"));
      await notifier.notifyNewReport(MOCK_REPORT);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.line.me/v2/bot/message/push");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer test-access-token",
      );
    });

    it("通知本文に受付番号・住所・日時が含まれる", async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);

      const notifier = createAdminNotifier(makeEnv("Uadmin123"));
      await notifier.notifyNewReport(MOCK_REPORT);

      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      ) as { to: string; messages: { type: string; text: string }[] };
      expect(body.to).toBe("Uadmin123");
      expect(body.messages[0]!.type).toBe("text");
      expect(body.messages[0]!.text).toContain("OZU-20260326-001");
      expect(body.messages[0]!.text).toContain("愛媛県大洲市大洲649");
    });

    it("locationAddress が null の場合は座標（緯度・経度）を表示する", async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);

      const notifier = createAdminNotifier(makeEnv("Uadmin123"));
      await notifier.notifyNewReport({ ...MOCK_REPORT, locationAddress: null });

      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      ) as { messages: { text: string }[] };
      expect(body.messages[0]!.text).toContain("33.5057");
      expect(body.messages[0]!.text).toContain("132.5595");
    });

    it("LINE API が非 2xx を返した場合は例外を throw する", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("Bad Request", { status: 400 })),
      );

      const notifier = createAdminNotifier(makeEnv("Uadmin123"));
      await expect(notifier.notifyNewReport(MOCK_REPORT)).rejects.toThrow(
        "LINE push notification failed: 400",
      );
    });
  });

  describe("LINE_ADMIN_USER_ID が未設定の場合（NullAdminNotifier）", () => {
    it("fetch を呼び出さない", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const notifier = createAdminNotifier(makeEnv(undefined));
      await notifier.notifyNewReport(MOCK_REPORT);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("例外を throw しない", async () => {
      vi.stubGlobal("fetch", vi.fn());

      const notifier = createAdminNotifier(makeEnv(undefined));
      await expect(notifier.notifyNewReport(MOCK_REPORT)).resolves.toBeUndefined();
    });
  });
});
