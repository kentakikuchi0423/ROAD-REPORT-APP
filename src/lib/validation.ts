/**
 * 入力バリデーション関数
 *
 * LINE メッセージから受け取った値を保存前に検証する。
 * Zod は使用せず、型ガード + 軽量ヘルパーで実装する（バンドルサイズ削減のため）。
 */

/** バリデーション結果の型 */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// ---- 撮影日付 ----------------------------------------------------------------

/** 撮影日付を検証する（YYYY-MM-DD 形式、過去日または当日） */
export function validateShootingDate(
  input: string,
): ValidationResult<string> {
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, error: "日付は YYYY-MM-DD 形式で入力してください（例：2026-03-25）" };
  }

  const date = new Date(trimmed + "T00:00:00Z");
  if (isNaN(date.getTime())) {
    return { ok: false, error: "有効な日付を入力してください" };
  }

  // 月・日の妥当性チェック（"2026-02-30" のような日付を弾く）
  const [yyyy, mm, dd] = trimmed.split("-").map(Number);
  if (
    date.getUTCFullYear() !== yyyy ||
    date.getUTCMonth() + 1 !== mm ||
    date.getUTCDate() !== dd
  ) {
    return { ok: false, error: "有効な日付を入力してください" };
  }

  const today = new Date();
  const todayUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  if (date.getTime() > todayUTC) {
    return { ok: false, error: "撮影日付は本日以前の日付を入力してください" };
  }

  return { ok: true, value: trimmed };
}

// ---- 補足コメント -----------------------------------------------------------

/** 補足コメントを検証する（最大 500 文字） */
export function validateRemarks(input: string): ValidationResult<string> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "補足コメントを入力してください" };
  }
  if (trimmed.length > 500) {
    return {
      ok: false,
      error: `補足コメントは 500 文字以内で入力してください（現在 ${String(trimmed.length)} 文字）`,
    };
  }
  return { ok: true, value: trimmed };
}

// ---- 氏名 -------------------------------------------------------------------

/** 氏名を検証する（1〜100 文字、空白のみ不可） */
export function validateReporterName(input: string): ValidationResult<string> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "氏名を入力してください" };
  }
  if (trimmed.length > 100) {
    return { ok: false, error: "氏名は 100 文字以内で入力してください" };
  }
  return { ok: true, value: trimmed };
}

// ---- 電話番号 ----------------------------------------------------------------

/**
 * 電話番号を検証する。
 * 日本の固定電話・携帯電話・IP 電話（050）に対応。
 * ハイフンあり・なし・スペース区切りを許容する。
 */
export function validateReporterPhone(
  input: string,
): ValidationResult<string> {
  const trimmed = input.trim();
  // 数字・ハイフン・スペース以外を除去して正規化
  const normalized = trimmed.replace(/[\s-]/g, "");

  if (!/^\d+$/.test(normalized)) {
    return { ok: false, error: "電話番号は数字・ハイフンで入力してください（例：0896-24-1111）" };
  }

  // 日本の電話番号: 10〜11 桁、0 始まり
  if (!/^0\d{9,10}$/.test(normalized)) {
    return { ok: false, error: "有効な電話番号を入力してください（例：0896-24-1111）" };
  }

  return { ok: true, value: trimmed };
}

// ---- 位置情報 ----------------------------------------------------------------

/** 緯度・経度を検証する */
export function validateLocation(
  lat: number,
  lng: number,
): ValidationResult<{ latitude: number; longitude: number }> {
  if (!isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "緯度が不正です" };
  }
  if (!isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: "経度が不正です" };
  }
  return { ok: true, value: { latitude: lat, longitude: lng } };
}
