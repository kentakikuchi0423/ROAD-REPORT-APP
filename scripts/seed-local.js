#!/usr/bin/env node
/**
 * ローカル開発用シードスクリプト
 *
 * 使い方: npm run seed:local
 *
 * 実行するたびにダミー通報 5 件を追加する。
 * 何度実行しても UNIQUE 制約違反が起きないよう設計している。
 *
 * ── 一意性の扱い ──────────────────────────────────────────────
 *  重複不可なフィールドは実行ごとに動的に生成する:
 *    - receipt_number : 当日 JST 日付 + 900〜989 番台を DB クエリで連番採番
 *                       → 既存のシードシーケンスを確認し、次の空き番号から割り当て
 *    - R2 キー        : 日付 + crypto.randomBytes(6).toString("hex") → 衝突確率 1/2^48
 *    - id             : SQLite AUTOINCREMENT（自動）
 *  その他のフィールド（住所・名前・補足など）はテンプレートを再利用してよい。
 *
 * ── 本番安全性 ────────────────────────────────────────────────
 *  すべての wrangler コマンドに --local を付与するため、
 *  ローカルの .wrangler/state にのみ書き込まれ、本番環境には影響しない。
 *
 * ── シーケンス番号の設計 ──────────────────────────────────────
 *  本番の受付番号は OZU-YYYYMMDD-001 から順に採番される。
 *  シードは同じ日付を使いつつ 900〜989 番台を使用することで本番番号と衝突しない。
 *  （同日に 90 回以上シードを実行した場合は上限に達しエラーになる）
 */

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// ── ダミー画像（PNG 形式・120×80 px） ──────────────────────────
// Python で生成した最小 PNG（make_png(120,80,r,g,b)）を base64 で埋め込む

/** 近景イメージ: 暗めの青灰色 (R=80, G=100, B=120) */
const CLOSE_PHOTO_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIADA" +
  "MCMawhDGt4XCHTzA2Zhr60Lj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbd" +
  "CjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBb" +
  "gQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSr" +
  "AyraD4ai+9+2AAAAAElFTkSuQmCC";

/** 遠景イメージ: 明るめの灰緑色 (R=160, G=180, B=160) */
const FAR_PHOTO_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIBDA" +
  "QPun+BAGtIXCPFiAcWv26ELr+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbd" +
  "CjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBb" +
  "gQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSr" +
  "A8C9QkiGKSq9AAAAAElFTkSuQmCC";

// ── ダミーデータテンプレート（一意でないフィールドのみ） ──────
const TEMPLATES = [
  {
    lineUserId: "Useed_dummy_line_001",
    status: "pending",
    latitude: 33.5019,
    longitude: 132.5461,
    locationAddress: "愛媛県大洲市大洲1丁目1番地",
    shootingDate: "2026-03-09",
    remarks:
      "道路中央付近に幅約5cmのひび割れが複数発生しています。\n雨天時に水たまりができて危険です。",
    reporterName: "大洲 太郎",
    reporterPhone: "09012345678",
  },
  {
    lineUserId: "Useed_dummy_line_002",
    status: "in_progress",
    latitude: 33.5478,
    longitude: 132.4933,
    locationAddress: null,
    shootingDate: null,
    remarks: null,
    reporterName: null,
    reporterPhone: null,
  },
  {
    lineUserId: "Useed_dummy_line_003",
    status: "resolved",
    latitude: 33.4939,
    longitude: 132.6303,
    locationAddress: "愛媛県大洲市肱川町山鳥坂",
    shootingDate: "2026-03-19",
    remarks: null,
    reporterName: "肱川 花子",
    reporterPhone: "08098765432",
  },
  {
    lineUserId: "Useed_dummy_line_004",
    status: "rejected",
    latitude: 33.5056,
    longitude: 132.5444,
    locationAddress: "愛媛県大洲市喜多町",
    shootingDate: null,
    remarks:
      "排水溝のふたが少し浮いています。通行に支障はありませんが気になったため通報しました。",
    reporterName: "喜多 次郎",
    reporterPhone: null,
  },
  {
    lineUserId: "Useed_dummy_line_005",
    status: "pending",
    latitude: 33.4581,
    longitude: 132.6031,
    locationAddress: "愛媛県大洲市冨士町若宮",
    shootingDate: "2026-03-26",
    remarks:
      "急な坂道の途中で路面が大きく陥没しています。深さ約10cm・直径約40cm。夜間は特に危険です。",
    reporterName: null,
    reporterPhone: null,
  },
];

// ── ヘルパー関数 ────────────────────────────────────────────────

/** 現在の JST 日付を YYYYMMDD 形式で返す */
function jstDateStr() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * DB をクエリして、当日のシードシーケンス（900〜989）のうち
 * まだ使われていない最小番号を返す。
 *
 * DB が未初期化の場合や接続できない場合は 900 を返す（フォールバック）。
 */
function getNextSeedSeq(ROOT, dateStr) {
  const query =
    `SELECT COALESCE(MAX(CAST(SUBSTR(receipt_number, 14) AS INTEGER)), 899) AS m ` +
    `FROM reports WHERE receipt_number LIKE 'OZU-${dateStr}-9%'`;
  try {
    const raw = execSync(
      `npx wrangler d1 execute ozu-road-report-db --local --json --command="${query}"`,
      { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] },
    ).toString();
    const data = JSON.parse(raw);
    const m = data?.[0]?.results?.[0]?.m;
    return typeof m === "number" ? m + 1 : 900;
  } catch {
    // DB 未初期化など → 先頭から開始
    return 900;
  }
}

/**
 * 受付番号を count 個、連番で生成する。
 * 既存のシードシーケンスの続きから割り当てるため重複しない。
 */
function generateReceiptNumbers(ROOT, dateStr, count) {
  const startSeq = getNextSeedSeq(ROOT, dateStr);
  const endSeq = startSeq + count - 1;

  if (endSeq > 989) {
    console.error(
      `\n✘ 本日（${dateStr}）のシードシーケンス上限（989）を超えます。`,
    );
    console.error(`  現在の開始番号: ${startSeq}、必要数: ${count}`);
    console.error("  翌日以降に実行するか、D1 ローカル DB をリセットしてください。");
    process.exit(1);
  }

  return Array.from({ length: count }, (_, i) =>
    `OZU-${dateStr}-${String(startSeq + i).padStart(3, "0")}`,
  );
}

/**
 * 実行ごとに一意な R2 キーペアを count 組生成する。
 * キー: reports/{YYYYMMDD}/seed-{12文字hex}/{close|far}.jpg
 */
function generateR2Keys(dateStr, count) {
  return Array.from({ length: count }, () => {
    const uid = crypto.randomBytes(6).toString("hex"); // 12文字
    return {
      close: `reports/${dateStr}/seed-${uid}/close.jpg`,
      far: `reports/${dateStr}/seed-${uid}/far.jpg`,
    };
  });
}

/** SQL 値をエスケープして囲む（NULL 対応） */
function sqlStr(v) {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** INSERT SQL を生成する */
function buildInsertSql(records) {
  const now = new Date().toISOString();
  const rows = records
    .map(
      (r) =>
        `(\n` +
        `  ${sqlStr(r.receiptNumber)}, ${sqlStr(r.lineUserId)}, ${sqlStr(r.status)},\n` +
        `  ${sqlStr(r.closePhotoKey)}, ${sqlStr(r.farPhotoKey)},\n` +
        `  ${r.latitude}, ${r.longitude}, ${sqlStr(r.locationAddress)},\n` +
        `  ${sqlStr(r.shootingDate)}, ${sqlStr(r.remarks)},\n` +
        `  ${sqlStr(r.reporterName)}, ${sqlStr(r.reporterPhone)},\n` +
        `  ${sqlStr(now)}, ${sqlStr(now)}\n` +
        `)`,
    )
    .join(",\n");

  return (
    `INSERT INTO reports (\n` +
    `  receipt_number, line_user_id, status,\n` +
    `  close_photo_key, far_photo_key,\n` +
    `  latitude, longitude, location_address,\n` +
    `  shooting_date, remarks, reporter_name, reporter_phone,\n` +
    `  created_at, updated_at\n` +
    `) VALUES\n` +
    rows +
    ";"
  );
}

// ── メイン処理 ──────────────────────────────────────────────────

function main() {
  const ROOT = path.join(__dirname, "..");
  const COUNT = TEMPLATES.length; // 5
  const dateStr = jstDateStr();

  // 一意なフィールドを生成
  const receiptNumbers = generateReceiptNumbers(ROOT, dateStr, COUNT);
  const r2Keys = generateR2Keys(dateStr, COUNT);

  // テンプレートに一意フィールドをマージ
  const records = TEMPLATES.map((tmpl, i) => ({
    ...tmpl,
    receiptNumber: receiptNumbers[i],
    closePhotoKey: r2Keys[i].close,
    farPhotoKey: r2Keys[i].far,
  }));

  // ── 1. D1 シードデータ投入 ──────────────────────────────────
  console.log("\n=== D1: ダミー通報データ投入（--local）===");
  const sql = buildInsertSql(records);
  const tmpSql = path.join(os.tmpdir(), `seed_${Date.now()}.sql`);
  fs.writeFileSync(tmpSql, sql, "utf8");
  try {
    execSync(
      `npx wrangler d1 execute ozu-road-report-db --local --file=${tmpSql}`,
      { cwd: ROOT, stdio: "inherit" },
    );
  } finally {
    fs.unlinkSync(tmpSql);
  }
  for (const r of records) {
    console.log(`  ✓ ${r.receiptNumber}  [${r.status}]`);
  }

  // ── 2. R2 ダミー画像アップロード ──────────────────────────
  console.log("\n=== R2: ダミー画像アップロード（--local）===");
  const tmpClose = path.join(os.tmpdir(), "seed_close.png");
  const tmpFar = path.join(os.tmpdir(), "seed_far.png");
  fs.writeFileSync(tmpClose, Buffer.from(CLOSE_PHOTO_B64, "base64"));
  fs.writeFileSync(tmpFar, Buffer.from(FAR_PHOTO_B64, "base64"));

  try {
    for (const keys of r2Keys) {
      for (const [key, file] of [
        [keys.close, tmpClose],
        [keys.far, tmpFar],
      ]) {
        execSync(
          `npx wrangler r2 object put ozu-road-report-images/${key}` +
            ` --local --file=${file} --content-type image/png`,
          { cwd: ROOT, stdio: "inherit" },
        );
        console.log(`  ✓ ${key}`);
      }
    }
  } finally {
    if (fs.existsSync(tmpClose)) fs.unlinkSync(tmpClose);
    if (fs.existsSync(tmpFar)) fs.unlinkSync(tmpFar);
  }

  // ── 完了メッセージ ────────────────────────────────────────
  console.log(
    `\n✅ 完了: 通報 ${COUNT} 件・画像 ${COUNT * 2} 枚をローカル環境に追加しました。`,
  );
  for (const r of records) {
    console.log(`   ${r.receiptNumber}  [${r.status}]`);
  }
  console.log("\n   npm run dev → /admin/reports で確認してください。\n");
}

main();
