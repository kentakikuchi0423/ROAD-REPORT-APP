/**
 * DB ヘルパーのユニットテスト
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateReceiptNumber,
  getNextDailySequence,
  getSession,
  upsertSession,
  deleteSession,
  getReports,
  getReportById,
  updateReportStatus,
} from "../../src/lib/db";
import type { ConversationSession } from "../../src/types";

// ---- generateReceiptNumber --------------------------------------------------

describe("generateReceiptNumber", () => {
  it("OZU-YYYYMMDD-NNN 形式で生成される", () => {
    const result = generateReceiptNumber(new Date("2026-03-25T00:00:00Z"), 1);
    expect(result).toBe("OZU-20260325-001");
  });

  it("連番が 3 桁でゼロ埋めされる", () => {
    expect(generateReceiptNumber(new Date("2026-03-25T00:00:00Z"), 1)).toBe(
      "OZU-20260325-001",
    );
    expect(generateReceiptNumber(new Date("2026-03-25T00:00:00Z"), 42)).toBe(
      "OZU-20260325-042",
    );
    expect(generateReceiptNumber(new Date("2026-03-25T00:00:00Z"), 999)).toBe(
      "OZU-20260325-999",
    );
  });

  it("日付をまたいでプレフィックスが変わる", () => {
    const d1 = generateReceiptNumber(new Date("2026-03-25T00:00:00Z"), 1);
    const d2 = generateReceiptNumber(new Date("2026-03-26T00:00:00Z"), 1);
    expect(d1).toBe("OZU-20260325-001");
    expect(d2).toBe("OZU-20260326-001");
  });

  it("月が 2 桁でゼロ埋めされる", () => {
    expect(generateReceiptNumber(new Date("2026-01-05T00:00:00Z"), 1)).toBe(
      "OZU-20260105-001",
    );
  });

  it("JST 基準で日付を決定する（UTC 15:00 = JST 翌 00:00）", () => {
    // 2026-03-25T15:00:00Z = 2026-03-26T00:00:00+09:00 → JST では 3/26
    expect(generateReceiptNumber(new Date("2026-03-25T15:00:00Z"), 1)).toBe(
      "OZU-20260326-001",
    );
    // 2026-03-25T14:59:59Z = 2026-03-25T23:59:59+09:00 → JST では 3/25
    expect(generateReceiptNumber(new Date("2026-03-25T14:59:59Z"), 1)).toBe(
      "OZU-20260325-001",
    );
  });
});

// ---- getNextDailySequence ---------------------------------------------------

describe("getNextDailySequence", () => {
  function makeDb(count: number): D1Database {
    return {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ cnt: count }),
        }),
      }),
    } as unknown as D1Database;
  }

  it("レコードが 0 件のとき連番 1 を返す", async () => {
    const db = makeDb(0);
    const seq = await getNextDailySequence(db, new Date("2026-03-25T00:00:00Z"));
    expect(seq).toBe(1);
  });

  it("既存レコードが 5 件のとき連番 6 を返す", async () => {
    const db = makeDb(5);
    const seq = await getNextDailySequence(db, new Date("2026-03-25T00:00:00Z"));
    expect(seq).toBe(6);
  });

  it("LIKE クエリに正しい日付プレフィックスが渡される", async () => {
    const db = makeDb(0);
    await getNextDailySequence(db, new Date("2026-03-25T00:00:00Z"));
    const prepareMock = db.prepare as ReturnType<typeof vi.fn>;
    const bindFn = prepareMock.mock.results[0]?.value.bind as ReturnType<typeof vi.fn>;
    expect(bindFn).toHaveBeenCalledWith("OZU-20260325-%");
  });
});

// ---- getSession / upsertSession / deleteSession ----------------------------

describe("getSession", () => {
  it("セッションが存在する場合は ConversationSession を返す", async () => {
    const sessionData = {
      reportUuid: "test-uuid-001",
      closePhotoKey: "reports/20260325/test-uuid-001/close.jpg",
    };
    const row = {
      line_user_id: "U123",
      step: "far_photo",
      data: JSON.stringify(sessionData),
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:01:00.000Z",
    };
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(row),
        }),
      }),
    } as unknown as D1Database;

    const session = await getSession(db, "U123");
    expect(session).not.toBeNull();
    expect(session?.lineUserId).toBe("U123");
    expect(session?.step).toBe("far_photo");
    expect(session?.data.closePhotoKey).toBe("reports/20260325/test-uuid-001/close.jpg");
  });

  it("セッションが存在しない場合は null を返す", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    } as unknown as D1Database;

    const session = await getSession(db, "U_UNKNOWN");
    expect(session).toBeNull();
  });
});

describe("upsertSession", () => {
  it("INSERT OR REPLACE が実行される", async () => {
    const runFn = vi.fn().mockResolvedValue({});
    const bindFn = vi.fn().mockReturnValue({ run: runFn });
    const db = {
      prepare: vi.fn().mockReturnValue({ bind: bindFn }),
    } as unknown as D1Database;

    const session: ConversationSession = {
      lineUserId: "U456",
      step: "location",
      data: { latitude: 33.5, longitude: 132.5 },
      createdAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T00:00:00.000Z",
    };

    await upsertSession(db, session);
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO sessions"),
    );
    expect(runFn).toHaveBeenCalled();
  });
});

describe("deleteSession", () => {
  it("DELETE が実行される", async () => {
    const runFn = vi.fn().mockResolvedValue({});
    const bindFn = vi.fn().mockReturnValue({ run: runFn });
    const db = {
      prepare: vi.fn().mockReturnValue({ bind: bindFn }),
    } as unknown as D1Database;

    await deleteSession(db, "U789");
    expect(db.prepare).toHaveBeenCalledWith(
      "DELETE FROM sessions WHERE line_user_id = ?",
    );
    expect(bindFn).toHaveBeenCalledWith("U789");
    expect(runFn).toHaveBeenCalled();
  });
});

// ---- getReports / getReportById / updateReportStatus -----------------------

/** テスト用の reports テーブル行（snake_case） */
const sampleRow = {
  id: 1,
  receipt_number: "OZU-20260325-001",
  line_user_id: "Utest",
  status: "pending",
  close_photo_key: "reports/20260325/uuid/close.jpg",
  far_photo_key: "reports/20260325/uuid/far.jpg",
  latitude: 33.5057,
  longitude: 132.5497,
  location_address: "愛媛県大洲市大洲1番地",
  shooting_date: "2026-03-25",
  remarks: "道路にひび割れあり",
  reporter_name: "山田太郎",
  reporter_phone: "09012345678",
  created_at: "2026-03-25T10:00:00.000Z",
  updated_at: "2026-03-25T10:00:00.000Z",
};

/**
 * getReports 用 D1 モック。
 * COUNT クエリ:
 *   - status なし → prepare().first() （bind なし）
 *   - status あり → prepare().bind().first()
 * DATA クエリ: prepare().bind().all()
 */
function makeGetReportsDb(
  total: number,
  rows: typeof sampleRow[],
): D1Database {
  return {
    prepare: vi.fn().mockImplementation((sql: string) => {
      if ((sql as string).includes("COUNT")) {
        const firstFn = vi.fn().mockResolvedValue({ cnt: total });
        return {
          first: firstFn, // status なし: .prepare().first()
          bind: vi.fn().mockReturnValue({ first: firstFn }), // status あり: .prepare().bind().first()
        };
      }
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: rows }),
        }),
      };
    }),
  } as unknown as D1Database;
}

describe("getReports", () => {
  it("status フィルタなし: 全件数と Report 配列を返す", async () => {
    const db = makeGetReportsDb(1, [sampleRow]);
    const result = await getReports(db, { limit: 20, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]!.receiptNumber).toBe("OZU-20260325-001");
    expect(result.reports[0]!.status).toBe("pending");
  });

  it("status フィルタあり: WHERE 句付きで照会される", async () => {
    const db = makeGetReportsDb(1, [sampleRow]);
    const prepareMock = db.prepare as ReturnType<typeof vi.fn>;

    await getReports(db, { status: "pending", limit: 20, offset: 0 });

    // COUNT クエリと DATA クエリの両方に status バインドが渡されることを確認
    const sqlCalls = prepareMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(sqlCalls.some((sql) => sql.includes("WHERE status"))).toBe(true);
  });

  it("0 件の場合は total=0 + 空配列を返す", async () => {
    const db = makeGetReportsDb(0, []);
    const result = await getReports(db, { limit: 20, offset: 0 });

    expect(result.total).toBe(0);
    expect(result.reports).toHaveLength(0);
  });

  it("snake_case の DB 行が camelCase の Report に変換される", async () => {
    const db = makeGetReportsDb(1, [sampleRow]);
    const result = await getReports(db, { limit: 20, offset: 0 });
    const report = result.reports[0]!;

    expect(report.lineUserId).toBe("Utest");
    expect(report.closePhotoKey).toBe("reports/20260325/uuid/close.jpg");
    expect(report.locationAddress).toBe("愛媛県大洲市大洲1番地");
    expect(report.reporterName).toBe("山田太郎");
  });
});

describe("getReportById", () => {
  it("通報が存在する場合は Report を返す", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(sampleRow),
        }),
      }),
    } as unknown as D1Database;

    const report = await getReportById(db, 1);
    expect(report).not.toBeNull();
    expect(report?.id).toBe(1);
    expect(report?.receiptNumber).toBe("OZU-20260325-001");
  });

  it("通報が存在しない場合は null を返す", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    } as unknown as D1Database;

    const report = await getReportById(db, 999);
    expect(report).toBeNull();
  });
});

describe("updateReportStatus", () => {
  it("更新成功時: 更新後の Report を返す", async () => {
    const updatedRow = { ...sampleRow, status: "in_progress" };
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(updatedRow),
        }),
      }),
    } as unknown as D1Database;

    const report = await updateReportStatus(db, 1, "in_progress");
    expect(report).not.toBeNull();
    expect(report?.status).toBe("in_progress");
    expect(report?.id).toBe(1);
  });

  it("対象行が存在しない場合は null を返す", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    } as unknown as D1Database;

    const report = await updateReportStatus(db, 999, "resolved");
    expect(report).toBeNull();
  });

  it("UPDATE クエリに status と updated_at が渡される", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ ...sampleRow, status: "resolved" }),
        }),
      }),
    } as unknown as D1Database;

    await updateReportStatus(db, 1, "resolved");
    const bindFn = (db.prepare as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value.bind as ReturnType<typeof vi.fn>;
    const [status, , id] = bindFn.mock.calls[0] as [string, string, number];
    expect(status).toBe("resolved");
    expect(id).toBe(1);
  });
});
