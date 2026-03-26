/**
 * 管理画面ハンドラテスト（tests/app/admin.test.ts）
 *
 * handleAdmin の各ルート・エラーケースを検証する。
 * DB 関数・R2 関数は vi.mock でモックする。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAdmin } from "../../src/app/admin/index";
import { createSessionToken, SESSION_COOKIE_NAME, hashPassword } from "../../src/app/admin/auth";
import * as db from "../../src/lib/db";
import * as r2 from "../../src/lib/r2";
import type { Env, Report } from "../../src/types";
import type { ReportsPage } from "../../src/lib/db";

// ---- モック設定 -------------------------------------------------------------

vi.mock("../../src/lib/db");
vi.mock("../../src/lib/r2");

const mockGetReports = vi.mocked(db.getReports);
const mockGetAllReports = vi.mocked(db.getAllReports);
const mockGetReportById = vi.mocked(db.getReportById);
const mockUpdateReportStatus = vi.mocked(db.updateReportStatus);
const mockDeleteReport = vi.mocked(db.deleteReport);
const mockDownloadImage = vi.mocked(r2.downloadImage);
const mockDeleteImage = vi.mocked(r2.deleteImage);

// ---- テスト用定数 ------------------------------------------------------------

const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

const TEST_SESSION_SECRET = "test-session-secret";
const TEST_USERNAME = "admin";
const TEST_PASSWORD = "testpass";

const mockEnv: Env = {
  LINE_CHANNEL_SECRET: "test-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "test-token",
  ADMIN_USERNAME: TEST_USERNAME,
  ADMIN_PASSWORD_HASH: "", // beforeEach で設定
  ADMIN_SESSION_SECRET: TEST_SESSION_SECRET,
  DB: {} as D1Database,
  IMAGES: {} as R2Bucket,
};

/** テスト用通報オブジェクト */
const sampleReport: Report = {
  id: 1,
  receiptNumber: "OZU-20260325-001",
  lineUserId: "Utest",
  status: "pending",
  closePhotoKey: "reports/20260325/uuid/close.jpg",
  farPhotoKey: "reports/20260325/uuid/far.jpg",
  latitude: 33.5057,
  longitude: 132.5497,
  locationAddress: "愛媛県大洲市大洲1番地",
  shootingDate: "2026-03-25",
  remarks: "道路にひび割れあり",
  reporterName: "山田太郎",
  reporterPhone: "09012345678",
  createdAt: "2026-03-25T10:00:00.000Z",
  updatedAt: "2026-03-25T10:00:00.000Z",
};

const emptyPage: ReportsPage = { reports: [], total: 0 };

/** テスト用リクエスト生成ヘルパー（認証なし） */
function makeRequest(method: string, path: string, body?: unknown): Request {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** 有効なセッション Cookie を持つリクエストを生成するヘルパー */
async function makeAuthRequest(method: string, path: string, body?: unknown): Promise<Request> {
  const token = await createSessionToken(TEST_SESSION_SECRET);
  const headers: Record<string, string> = {
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---- テスト -----------------------------------------------------------------

describe("handleAdmin", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // パスワードハッシュを設定
    mockEnv.ADMIN_PASSWORD_HASH = await hashPassword(TEST_PASSWORD);
  });

  // ---- GET /admin/login -----------------------------------------------------

  describe("GET /admin/login", () => {
    it("200 + ログインフォーム HTML を返す", async () => {
      const req = makeRequest("GET", "/admin/login");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
    });

    it("HTML にログインフォームが含まれる", async () => {
      const req = makeRequest("GET", "/admin/login");
      const res = await handleAdmin(req, mockEnv, mockCtx);
      const html = await res.text();

      expect(html).toContain('action="/admin/login"');
      expect(html).toContain('name="username"');
      expect(html).toContain('name="password"');
    });

    it("認証なしでもアクセスできる（302 にならない）", async () => {
      const req = makeRequest("GET", "/admin/login");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
    });
  });

  // ---- POST /admin/login ----------------------------------------------------

  describe("POST /admin/login", () => {
    function makeLoginRequest(username: string, password: string): Request {
      const body = new URLSearchParams({ username, password }).toString();
      return new Request("http://localhost/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    }

    it("正しい認証情報で 302 + Set-Cookie を返す", async () => {
      const req = makeLoginRequest(TEST_USERNAME, TEST_PASSWORD);
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin");
      expect(res.headers.get("Set-Cookie")).toContain(SESSION_COOKIE_NAME);
    });

    it("誤ったパスワードで 401 + エラーメッセージを返す", async () => {
      const req = makeLoginRequest(TEST_USERNAME, "wrongpassword");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(401);
      const html = await res.text();
      expect(html).toContain("ユーザー名またはパスワードが違います");
    });

    it("誤ったユーザー名で 401 を返す", async () => {
      const req = makeLoginRequest("wronguser", TEST_PASSWORD);
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(401);
    });
  });

  // ---- POST /admin/logout ---------------------------------------------------

  describe("POST /admin/logout", () => {
    it("302 + Cookie 削除ヘッダーを返す", async () => {
      const req = await makeAuthRequest("POST", "/admin/logout");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin/login");
      const cookie = res.headers.get("Set-Cookie") ?? "";
      expect(cookie).toContain(SESSION_COOKIE_NAME);
      expect(cookie).toContain("Max-Age=0");
    });
  });

  // ---- 未認証アクセス --------------------------------------------------------

  describe("未認証アクセス", () => {
    it("GET /admin（Cookie なし）は /admin/login へリダイレクト", async () => {
      const req = makeRequest("GET", "/admin");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/admin/login");
    });

    it("GET /admin/reports（Cookie なし）は /admin/login へリダイレクト", async () => {
      const req = makeRequest("GET", "/admin/reports");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/admin/login");
    });
  });

  // ---- GET /admin -----------------------------------------------------------

  describe("GET /admin", () => {
    it("200 + text/html を返す", async () => {
      const req = await makeAuthRequest("GET", "/admin");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
    });

    it("レスポンス HTML に管理画面タイトルが含まれる", async () => {
      const req = await makeAuthRequest("GET", "/admin");
      const res = await handleAdmin(req, mockEnv, mockCtx);
      const html = await res.text();

      expect(html).toContain("管理画面");
    });

    it("GET /admin/ （末尾スラッシュ）でも 200 を返す", async () => {
      const req = await makeAuthRequest("GET", "/admin/");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
    });
  });

  // ---- GET /admin/reports ---------------------------------------------------

  describe("GET /admin/reports", () => {
    it("200 + HTML を返し getReports を呼ぶ", async () => {
      mockGetReports.mockResolvedValue(emptyPage);

      const req = await makeAuthRequest("GET", "/admin/reports");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
      expect(mockGetReports).toHaveBeenCalledOnce();
      expect(mockGetReports).toHaveBeenCalledWith(
        mockEnv.DB,
        expect.objectContaining({ limit: 20, offset: 0 }),
      );
    });

    it("通報データがある場合、受付番号が HTML に含まれる", async () => {
      mockGetReports.mockResolvedValue({ reports: [sampleReport], total: 1 });

      const req = await makeAuthRequest("GET", "/admin/reports");
      const res = await handleAdmin(req, mockEnv, mockCtx);
      const html = await res.text();

      expect(html).toContain("OZU-20260325-001");
    });

    it("?status=pending で getReports に status が渡される", async () => {
      mockGetReports.mockResolvedValue(emptyPage);

      const req = await makeAuthRequest("GET", "/admin/reports?status=pending");
      await handleAdmin(req, mockEnv, mockCtx);

      expect(mockGetReports).toHaveBeenCalledWith(
        mockEnv.DB,
        expect.objectContaining({ status: "pending" }),
      );
    });

    it("?status=in_progress でも status が渡される", async () => {
      mockGetReports.mockResolvedValue(emptyPage);

      const req = await makeAuthRequest("GET", "/admin/reports?status=in_progress");
      await handleAdmin(req, mockEnv, mockCtx);

      expect(mockGetReports).toHaveBeenCalledWith(
        mockEnv.DB,
        expect.objectContaining({ status: "in_progress" }),
      );
    });

    it("?status=unknown（不正値）は status=undefined で呼ばれる", async () => {
      mockGetReports.mockResolvedValue(emptyPage);

      const req = await makeAuthRequest("GET", "/admin/reports?status=unknown");
      await handleAdmin(req, mockEnv, mockCtx);

      const call = mockGetReports.mock.calls[0]!;
      expect(call[1]!.status).toBeUndefined();
    });

    it("?page=2 で offset=20 が渡される", async () => {
      mockGetReports.mockResolvedValue(emptyPage);

      const req = await makeAuthRequest("GET", "/admin/reports?page=2");
      await handleAdmin(req, mockEnv, mockCtx);

      expect(mockGetReports).toHaveBeenCalledWith(
        mockEnv.DB,
        expect.objectContaining({ offset: 20 }),
      );
    });

    it("?page=invalid は page=1（offset=0）として扱う", async () => {
      mockGetReports.mockResolvedValue(emptyPage);

      const req = await makeAuthRequest("GET", "/admin/reports?page=invalid");
      await handleAdmin(req, mockEnv, mockCtx);

      expect(mockGetReports).toHaveBeenCalledWith(
        mockEnv.DB,
        expect.objectContaining({ offset: 0 }),
      );
    });
  });

  // ---- GET /admin/reports/:id -----------------------------------------------

  describe("GET /admin/reports/:id", () => {
    it("通報が存在する場合 200 + HTML を返す", async () => {
      mockGetReportById.mockResolvedValue(sampleReport);

      const req = await makeAuthRequest("GET", "/admin/reports/1");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
      expect(mockGetReportById).toHaveBeenCalledWith(mockEnv.DB, 1);
    });

    it("HTML に受付番号・ステータスが含まれる", async () => {
      mockGetReportById.mockResolvedValue(sampleReport);

      const req = await makeAuthRequest("GET", "/admin/reports/1");
      const res = await handleAdmin(req, mockEnv, mockCtx);
      const html = await res.text();

      expect(html).toContain("OZU-20260325-001");
      expect(html).toContain("受付済み");
    });

    it("通報が存在しない場合 404 + HTML を返す", async () => {
      mockGetReportById.mockResolvedValue(null);

      const req = await makeAuthRequest("GET", "/admin/reports/999");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
    });

    it("非数値 ID の場合 400 + HTML を返す", async () => {
      const req = await makeAuthRequest("GET", "/admin/reports/abc");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(400);
      expect(mockGetReportById).not.toHaveBeenCalled();
    });
  });

  // ---- PATCH /admin/reports/:id/status --------------------------------------

  describe("PATCH /admin/reports/:id/status", () => {
    it("正常なステータス更新で 200 + JSON を返す", async () => {
      const updated = { ...sampleReport, status: "in_progress" as const };
      mockUpdateReportStatus.mockResolvedValue(updated);

      const req = await makeAuthRequest("PATCH", "/admin/reports/1/status", {
        status: "in_progress",
      });
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
      expect(mockUpdateReportStatus).toHaveBeenCalledWith(
        mockEnv.DB,
        1,
        "in_progress",
      );
    });

    it("レスポンス JSON に更新後の report が含まれる", async () => {
      const updated = { ...sampleReport, status: "resolved" as const };
      mockUpdateReportStatus.mockResolvedValue(updated);

      const req = await makeAuthRequest("PATCH", "/admin/reports/1/status", {
        status: "resolved",
      });
      const res = await handleAdmin(req, mockEnv, mockCtx);
      const json = await res.json<{ report: Report }>();

      expect(json.report.status).toBe("resolved");
    });

    it("全 4 ステータス値を受け付ける", async () => {
      const statuses = ["pending", "in_progress", "resolved", "rejected"] as const;
      for (const status of statuses) {
        mockUpdateReportStatus.mockResolvedValue({ ...sampleReport, status });
        const req = await makeAuthRequest("PATCH", "/admin/reports/1/status", { status });
        const res = await handleAdmin(req, mockEnv, mockCtx);
        expect(res.status).toBe(200);
      }
    });

    it("通報が存在しない場合 404 + JSON を返す", async () => {
      mockUpdateReportStatus.mockResolvedValue(null);

      const req = await makeAuthRequest("PATCH", "/admin/reports/1/status", {
        status: "resolved",
      });
      const res = await handleAdmin(req, mockEnv, mockCtx);
      const json = await res.json<{ error: string }>();

      expect(res.status).toBe(404);
      expect(json.error).toBeTruthy();
    });

    it("不正なステータス値で 400 + JSON を返す", async () => {
      const req = await makeAuthRequest("PATCH", "/admin/reports/1/status", {
        status: "invalid_status",
      });
      const res = await handleAdmin(req, mockEnv, mockCtx);
      const json = await res.json<{ error: string }>();

      expect(res.status).toBe(400);
      expect(json.error).toBeTruthy();
      expect(mockUpdateReportStatus).not.toHaveBeenCalled();
    });

    it("status フィールドなしのリクエストで 400 を返す", async () => {
      const req = await makeAuthRequest("PATCH", "/admin/reports/1/status", {
        other: "field",
      });
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(400);
      expect(mockUpdateReportStatus).not.toHaveBeenCalled();
    });

    it("不正な JSON ボディで 400 + JSON を返す", async () => {
      const token = await createSessionToken(TEST_SESSION_SECRET);
      const req = new Request("http://localhost/admin/reports/1/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: "not-valid-json",
      });
      const res = await handleAdmin(req, mockEnv, mockCtx);
      const json = await res.json<{ error: string }>();

      expect(res.status).toBe(400);
      expect(json.error).toBeTruthy();
    });

    it("非数値 ID で 400 + JSON を返す", async () => {
      const req = await makeAuthRequest("PATCH", "/admin/reports/abc/status", {
        status: "pending",
      });
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(400);
    });
  });

  // ---- GET /admin/reports/csv -----------------------------------------------

  describe("GET /admin/reports/csv", () => {
    it("200 + text/csv + BOM（UTF-8）+ ヘッダー行を返す", async () => {
      mockGetAllReports.mockResolvedValue([sampleReport]);

      const req = await makeAuthRequest("GET", "/admin/reports/csv");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/csv/);
      expect(res.headers.get("content-disposition")).toMatch(/attachment/);

      // UTF-8 BOM は EF BB BF の 3 バイト
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);

      const text = new TextDecoder("utf-8").decode(buf);
      expect(text).toContain("受付番号");
      expect(text).toContain("OZU-20260325-001");
      expect(text).toContain("受付済み");
    });

    it("?status=pending で getAllReports に status が渡される", async () => {
      mockGetAllReports.mockResolvedValue([]);

      const req = await makeAuthRequest("GET", "/admin/reports/csv?status=pending");
      await handleAdmin(req, mockEnv, mockCtx);

      expect(mockGetAllReports).toHaveBeenCalledWith(mockEnv.DB, "pending");
    });

    it("?status=unknown（不正値）は status=undefined で呼ばれる", async () => {
      mockGetAllReports.mockResolvedValue([]);

      const req = await makeAuthRequest("GET", "/admin/reports/csv?status=unknown");
      await handleAdmin(req, mockEnv, mockCtx);

      expect(mockGetAllReports).toHaveBeenCalledWith(mockEnv.DB, undefined);
    });

    it("未認証は /admin/login へリダイレクト", async () => {
      const req = makeRequest("GET", "/admin/reports/csv");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/admin/login");
    });
  });

  // ---- GET /admin/reports/:id/images/:type ----------------------------------

  describe("GET /admin/reports/:id/images/:type", () => {
    const mockR2Body = new ReadableStream();

    it("close 画像が存在する場合 200 + image/jpeg を返す", async () => {
      mockGetReportById.mockResolvedValue(sampleReport);
      mockDownloadImage.mockResolvedValue({
        body: mockR2Body,
        httpMetadata: { contentType: "image/jpeg" },
      } as unknown as R2ObjectBody);

      const req = await makeAuthRequest("GET", "/admin/reports/1/images/close");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("content-disposition")).toMatch(/attachment/);
      expect(mockDownloadImage).toHaveBeenCalledWith(
        mockEnv.IMAGES,
        sampleReport.closePhotoKey,
      );
    });

    it("far 画像が存在する場合 200 を返し farPhotoKey が使われる", async () => {
      mockGetReportById.mockResolvedValue(sampleReport);
      mockDownloadImage.mockResolvedValue({
        body: mockR2Body,
        httpMetadata: { contentType: "image/jpeg" },
      } as unknown as R2ObjectBody);

      const req = await makeAuthRequest("GET", "/admin/reports/1/images/far");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      expect(mockDownloadImage).toHaveBeenCalledWith(
        mockEnv.IMAGES,
        sampleReport.farPhotoKey,
      );
    });

    it("R2 に画像が存在しない場合 404 を返す", async () => {
      mockGetReportById.mockResolvedValue(sampleReport);
      mockDownloadImage.mockResolvedValue(null);

      const req = await makeAuthRequest("GET", "/admin/reports/1/images/close");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(404);
    });

    it("通報が存在しない場合 404 を返す", async () => {
      mockGetReportById.mockResolvedValue(null);

      const req = await makeAuthRequest("GET", "/admin/reports/999/images/close");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(404);
      expect(mockDownloadImage).not.toHaveBeenCalled();
    });

    it("未認証は /admin/login へリダイレクト", async () => {
      const req = makeRequest("GET", "/admin/reports/1/images/close");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/admin/login");
    });
  });

  // ---- DELETE /admin/reports/:id --------------------------------------------

  describe("DELETE /admin/reports/:id", () => {
    it("通報が存在する場合 204 を返す", async () => {
      mockGetReportById.mockResolvedValue(sampleReport);
      mockDeleteImage.mockResolvedValue(undefined);
      mockDeleteReport.mockResolvedValue(true);

      const req = await makeAuthRequest("DELETE", "/admin/reports/1");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(204);
    });

    it("R2 画像削除（close・far 両方）が呼ばれる", async () => {
      mockGetReportById.mockResolvedValue(sampleReport);
      mockDeleteImage.mockResolvedValue(undefined);
      mockDeleteReport.mockResolvedValue(true);

      const req = await makeAuthRequest("DELETE", "/admin/reports/1");
      await handleAdmin(req, mockEnv, mockCtx);

      expect(mockDeleteImage).toHaveBeenCalledWith(
        mockEnv.IMAGES,
        sampleReport.closePhotoKey,
      );
      expect(mockDeleteImage).toHaveBeenCalledWith(
        mockEnv.IMAGES,
        sampleReport.farPhotoKey,
      );
    });

    it("DB の deleteReport が呼ばれる", async () => {
      mockGetReportById.mockResolvedValue(sampleReport);
      mockDeleteImage.mockResolvedValue(undefined);
      mockDeleteReport.mockResolvedValue(true);

      const req = await makeAuthRequest("DELETE", "/admin/reports/1");
      await handleAdmin(req, mockEnv, mockCtx);

      expect(mockDeleteReport).toHaveBeenCalledWith(mockEnv.DB, 1);
    });

    it("通報が存在しない場合 404 + deleteReport は呼ばれない", async () => {
      mockGetReportById.mockResolvedValue(null);

      const req = await makeAuthRequest("DELETE", "/admin/reports/999");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(404);
      expect(mockDeleteReport).not.toHaveBeenCalled();
    });

    it("未認証は /admin/login へリダイレクト", async () => {
      const req = makeRequest("DELETE", "/admin/reports/1");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/admin/login");
    });
  });

  // ---- 404 / 不明ルート ------------------------------------------------------

  describe("不明なルート", () => {
    it("GET /admin/unknown は 404 + HTML を返す", async () => {
      const req = await makeAuthRequest("GET", "/admin/unknown");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
    });

    it("POST /admin/reports は 404 を返す（未定義メソッド）", async () => {
      const req = await makeAuthRequest("POST", "/admin/reports");
      const res = await handleAdmin(req, mockEnv, mockCtx);

      expect(res.status).toBe(404);
    });
  });
});
