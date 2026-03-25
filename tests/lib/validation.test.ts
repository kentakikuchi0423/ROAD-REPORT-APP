/**
 * バリデーション関数のユニットテスト
 */

import { describe, it, expect } from "vitest";
import {
  validateShootingDate,
  validateRemarks,
  validateReporterName,
  validateReporterPhone,
  validateLocation,
} from "../../src/lib/validation";

// ---- validateShootingDate ---------------------------------------------------

describe("validateShootingDate", () => {
  it("正しい形式・過去日は ok を返す", () => {
    const result = validateShootingDate("2026-01-15");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("2026-01-15");
  });

  it("前後の空白を除去する", () => {
    const result = validateShootingDate("  2026-01-15  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("2026-01-15");
  });

  it("YYYY-MM-DD 以外の形式はエラー", () => {
    expect(validateShootingDate("2026/01/15").ok).toBe(false);
    expect(validateShootingDate("20260115").ok).toBe(false);
    expect(validateShootingDate("01-15-2026").ok).toBe(false);
  });

  it("存在しない日付はエラー", () => {
    expect(validateShootingDate("2026-02-30").ok).toBe(false);
    expect(validateShootingDate("2026-13-01").ok).toBe(false);
  });

  it("未来日はエラー", () => {
    expect(validateShootingDate("9999-12-31").ok).toBe(false);
  });
});

// ---- validateRemarks --------------------------------------------------------

describe("validateRemarks", () => {
  it("通常のテキストは ok を返す", () => {
    const result = validateRemarks("アスファルトに亀裂があります");
    expect(result.ok).toBe(true);
  });

  it("前後の空白を除去する", () => {
    const result = validateRemarks("  メモ  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("メモ");
  });

  it("空文字（空白のみ）はエラー", () => {
    expect(validateRemarks("").ok).toBe(false);
    expect(validateRemarks("   ").ok).toBe(false);
  });

  it("500 文字はギリギリ ok", () => {
    expect(validateRemarks("あ".repeat(500)).ok).toBe(true);
  });

  it("501 文字はエラー", () => {
    expect(validateRemarks("あ".repeat(501)).ok).toBe(false);
  });
});

// ---- validateReporterName ---------------------------------------------------

describe("validateReporterName", () => {
  it("通常の氏名は ok を返す", () => {
    const result = validateReporterName("大洲 太郎");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("大洲 太郎");
  });

  it("空文字（空白のみ）はエラー", () => {
    expect(validateReporterName("").ok).toBe(false);
    expect(validateReporterName("   ").ok).toBe(false);
  });

  it("100 文字はギリギリ ok", () => {
    expect(validateReporterName("あ".repeat(100)).ok).toBe(true);
  });

  it("101 文字はエラー", () => {
    expect(validateReporterName("あ".repeat(101)).ok).toBe(false);
  });
});

// ---- validateReporterPhone --------------------------------------------------

describe("validateReporterPhone", () => {
  it("ハイフンあり固定電話は ok", () => {
    expect(validateReporterPhone("0896-24-1111").ok).toBe(true);
  });

  it("ハイフンなし固定電話は ok", () => {
    expect(validateReporterPhone("0896241111").ok).toBe(true);
  });

  it("携帯電話（090/080/070）は ok", () => {
    expect(validateReporterPhone("090-1234-5678").ok).toBe(true);
    expect(validateReporterPhone("08012345678").ok).toBe(true);
    expect(validateReporterPhone("070-1234-5678").ok).toBe(true);
  });

  it("IP 電話（050）は ok", () => {
    expect(validateReporterPhone("050-1234-5678").ok).toBe(true);
  });

  it("スペース区切りも ok", () => {
    expect(validateReporterPhone("090 1234 5678").ok).toBe(true);
  });

  it("0 以外始まりはエラー", () => {
    expect(validateReporterPhone("1234567890").ok).toBe(false);
  });

  it("桁数不足はエラー", () => {
    expect(validateReporterPhone("090-123-456").ok).toBe(false);
  });

  it("英字を含む場合はエラー", () => {
    expect(validateReporterPhone("090-ABCD-5678").ok).toBe(false);
  });

  it("空文字はエラー", () => {
    expect(validateReporterPhone("").ok).toBe(false);
  });
});

// ---- validateLocation -------------------------------------------------------

describe("validateLocation", () => {
  it("有効な座標は ok を返す", () => {
    const result = validateLocation(33.5, 132.5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.latitude).toBe(33.5);
      expect(result.value.longitude).toBe(132.5);
    }
  });

  it("緯度の境界値（-90/90）は ok", () => {
    expect(validateLocation(-90, 0).ok).toBe(true);
    expect(validateLocation(90, 0).ok).toBe(true);
  });

  it("経度の境界値（-180/180）は ok", () => {
    expect(validateLocation(0, -180).ok).toBe(true);
    expect(validateLocation(0, 180).ok).toBe(true);
  });

  it("緯度範囲外はエラー", () => {
    expect(validateLocation(-91, 0).ok).toBe(false);
    expect(validateLocation(91, 0).ok).toBe(false);
  });

  it("経度範囲外はエラー", () => {
    expect(validateLocation(0, -181).ok).toBe(false);
    expect(validateLocation(0, 181).ok).toBe(false);
  });

  it("NaN はエラー", () => {
    expect(validateLocation(NaN, 0).ok).toBe(false);
    expect(validateLocation(0, NaN).ok).toBe(false);
  });
});
