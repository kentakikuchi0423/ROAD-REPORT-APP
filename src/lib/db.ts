/**
 * Cloudflare D1 データベースヘルパー
 */

import type { ConversationSession, Report } from "../types";

// ---- 受付番号 ----------------------------------------------------------------

/**
 * 受付番号を生成する（純粋関数）
 *
 * @param date     基準日（任意のタイムゾーン。内部で JST=UTC+9 に変換して日付を決定する）
 * @param sequence 日次連番（1 始まり）
 * @returns "OZU-YYYYMMDD-NNN" 形式の文字列
 * @example generateReceiptNumber(new Date("2026-03-25T00:00:00Z"), 1) → "OZU-20260325-001"
 */
export function generateReceiptNumber(date: Date, sequence: number): string {
  // 管理者の運用日付（JST = UTC+9）に合わせて日付部分を決定する
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jst.getUTCFullYear().toString();
  const mm = (jst.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = jst.getUTCDate().toString().padStart(2, "0");
  const nnn = sequence.toString().padStart(3, "0");
  return `OZU-${yyyy}${mm}${dd}-${nnn}`;
}

/**
 * 指定日における次の日次連番を返す。
 * reports テーブルの当日レコード件数 + 1 を連番とする。
 *
 * 注意: SELECT と INSERT の間に競合が発生しうる。
 * insertReport 側で UNIQUE 制約違反時のリトライにより対処する。
 */
export async function getNextDailySequence(
  db: D1Database,
  date: Date,
): Promise<number> {
  // generateReceiptNumber と同じ JST 基準で日付を決定する
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jst.getUTCFullYear().toString();
  const mm = (jst.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = jst.getUTCDate().toString().padStart(2, "0");
  const prefix = `OZU-${yyyy}${mm}${dd}-%`;

  const row = await db
    .prepare("SELECT COUNT(*) AS cnt FROM reports WHERE receipt_number LIKE ?")
    .bind(prefix)
    .first<{ cnt: number }>();

  return (row?.cnt ?? 0) + 1;
}

// ---- reports テーブル --------------------------------------------------------

/** reports テーブルの行（snake_case） */
interface ReportRow {
  id: number;
  receipt_number: string;
  line_user_id: string;
  status: string;
  close_photo_key: string;
  far_photo_key: string;
  latitude: number;
  longitude: number;
  location_address: string | null;
  shooting_date: string | null;
  remarks: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  created_at: string;
  updated_at: string;
}

function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    lineUserId: row.line_user_id,
    status: row.status as Report["status"],
    closePhotoKey: row.close_photo_key,
    farPhotoKey: row.far_photo_key,
    latitude: row.latitude,
    longitude: row.longitude,
    locationAddress: row.location_address,
    shootingDate: row.shooting_date,
    remarks: row.remarks,
    reporterName: row.reporter_name,
    reporterPhone: row.reporter_phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * reports テーブルにレコードを挿入し、生成した受付番号を含む Report を返す。
 * receipt_number の UNIQUE 制約違反時は最大 maxRetries 回リトライする。
 */
export async function insertReport(
  db: D1Database,
  data: Omit<Report, "id" | "receiptNumber" | "createdAt" | "updatedAt">,
  date: Date = new Date(),
  maxRetries = 3,
): Promise<Report> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const sequence = await getNextDailySequence(db, date);
    const receiptNumber = generateReceiptNumber(date, sequence);
    const now = date.toISOString();

    try {
      const row = await db
        .prepare(
          `INSERT INTO reports (
            receipt_number, line_user_id, status,
            close_photo_key, far_photo_key,
            latitude, longitude, location_address,
            shooting_date, remarks, reporter_name, reporter_phone,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`,
        )
        .bind(
          receiptNumber,
          data.lineUserId,
          data.status,
          data.closePhotoKey,
          data.farPhotoKey,
          data.latitude,
          data.longitude,
          data.locationAddress ?? null,
          data.shootingDate ?? null,
          data.remarks ?? null,
          data.reporterName ?? null,
          data.reporterPhone ?? null,
          now,
          now,
        )
        .first<ReportRow>();

      if (!row) throw new Error("INSERT RETURNING returned no row");
      return rowToReport(row);
    } catch (err) {
      const isUniqueViolation =
        err instanceof Error && err.message.includes("UNIQUE constraint failed");
      if (!isUniqueViolation || attempt === maxRetries - 1) throw err;
      // 連番競合 → リトライ
    }
  }

  // ここには到達しない（ループ内で必ず throw or return）
  throw new Error("insertReport: unexpected exit");
}

// ---- sessions テーブル -------------------------------------------------------

/** sessions テーブルの行（snake_case） */
interface SessionRow {
  line_user_id: string;
  step: string;
  data: string;
  created_at: string;
  updated_at: string;
}

function rowToSession(row: SessionRow): ConversationSession {
  return {
    lineUserId: row.line_user_id,
    step: row.step as ConversationSession["step"],
    data: JSON.parse(row.data) as ConversationSession["data"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * セッションを取得する。存在しない場合は null を返す。
 */
export async function getSession(
  db: D1Database,
  lineUserId: string,
): Promise<ConversationSession | null> {
  const row = await db
    .prepare("SELECT * FROM sessions WHERE line_user_id = ?")
    .bind(lineUserId)
    .first<SessionRow>();

  return row ? rowToSession(row) : null;
}

/**
 * セッションを保存・更新する（INSERT OR REPLACE）。
 * 同一 line_user_id の既存セッションは上書きされる。
 * created_at は既存行の値を維持する。
 */
export async function upsertSession(
  db: D1Database,
  session: ConversationSession,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR REPLACE INTO sessions (line_user_id, step, data, created_at, updated_at)
       VALUES (?, ?, ?, COALESCE(
         (SELECT created_at FROM sessions WHERE line_user_id = ?), ?
       ), ?)`,
    )
    .bind(
      session.lineUserId,
      session.step,
      JSON.stringify(session.data),
      session.lineUserId,
      session.createdAt,
      now,
    )
    .run();
}

/**
 * セッションを削除する。会話完了またはキャンセル時に呼ぶ。
 */
export async function deleteSession(
  db: D1Database,
  lineUserId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE line_user_id = ?")
    .bind(lineUserId)
    .run();
}
