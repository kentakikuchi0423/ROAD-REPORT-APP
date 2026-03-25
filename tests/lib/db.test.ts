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
      closePhotoMessageId: "msg-001",
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
    expect(session?.data.closePhotoMessageId).toBe("msg-001");
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
