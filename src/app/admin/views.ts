/**
 * 管理画面 HTML テンプレート関数群
 *
 * 純粋関数（データを受け取り HTML 文字列を返す）。
 * 副作用・外部 I/O なし。
 */

import type { Report, ReportStatus } from "../../types";
import type { ReportsPage } from "../../lib/db";
import { BRANDING } from "../../lib/branding";
import { ADMIN_BASE_PATH } from "./config";
import { STATUS_LABELS, STATUS_BADGE_CLASSES, VALID_STATUSES } from "../../lib/constants";

// ---- 定数 -------------------------------------------------------------------

const PAGE_SIZE = 20;

/** 対応完了・不要の終了系ステータス（一覧行を淡色表示するために使用） */
const CLOSED_STATUSES = new Set<ReportStatus>(["resolved", "rejected"]);

// ---- 小ヘルパー -------------------------------------------------------------

/** XSS 対策: HTML 特殊文字をエスケープする */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ISO 8601 文字列を JST の表示用日時文字列に変換する */
function formatJst(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return escapeHtml(iso);
  }
}

/** ステータスバッジ HTML を返す */
function renderStatusBadge(status: ReportStatus): string {
  const label = STATUS_LABELS[status];
  const cls = STATUS_BADGE_CLASSES[status];
  return `<span class="${cls}">${label}</span>`;
}

// ステータス変更 JS で共通利用するラベル・クラス定義（JSON として埋め込む）
const STATUS_LABELS_JSON = JSON.stringify(STATUS_LABELS);
const STATUS_BADGE_CLASSES_JSON = JSON.stringify(STATUS_BADGE_CLASSES);

// ---- 共通レイアウト ---------------------------------------------------------

const COMMON_CSS = `
  :root {
    --color-brand: #2a6496;
    --color-brand-dark: #1a4066;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 1.5rem 2rem;
    color: #333;
    line-height: 1.7;
    background: #f8f9fa;
  }
  .site-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0;
    margin: 0 -1.5rem 1.75rem;
    padding-left: 1.5rem;
    padding-right: 1.5rem;
    background: var(--color-brand);
    color: #fff;
  }
  .site-header__title {
    font-size: 0.95rem;
    font-weight: bold;
    color: #fff;
    text-decoration: none;
    letter-spacing: 0.01em;
  }
  .site-header__label {
    font-size: 0.78rem;
    font-weight: normal;
    opacity: 0.8;
    margin-left: 0.5rem;
  }
  .logout-btn {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.35);
    color: #fff;
    padding: 0.25rem 0.8rem;
    font-size: 0.82rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .logout-btn:hover { background: rgba(255,255,255,0.25); }
  h1 { font-size: 1.3rem; border-bottom: 2px solid var(--color-brand); padding-bottom: 0.45rem; margin-bottom: 1.25rem; margin-top: 0; }
  h2 { font-size: 1.05rem; margin-top: 1.25rem; }
  a { color: var(--color-brand); }
  a:hover { color: var(--color-brand-dark); }
  .note {
    background: #fff3cd;
    border-left: 4px solid #ffc107;
    padding: 0.6rem 1rem;
    margin: 1rem 0;
    font-size: 0.88rem;
  }
  .card { background: #fff; border: 1px solid #dee2e6; border-radius: 6px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { border: 1px solid #dee2e6; padding: 0.5rem 0.75rem; text-align: left; vertical-align: middle; }
  th { background: #f1f3f5; white-space: nowrap; }
  tr:hover td { background: #f8f9fa; }
  tr.row--closed td { color: #999; }
  tr.row--closed td a { color: #999; }
  .muted { color: #999; font-style: italic; }
  /* 一覧ツールバー（件数 + CSV） */
  .list-toolbar { display: flex; align-items: center; justify-content: space-between; padding-bottom: 0.85rem; margin-bottom: 0.85rem; border-bottom: 1px solid #e9ecef; }
  .list-count { font-size: 0.85rem; color: #888; }
  .csv-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.75rem; font-size: 0.82rem; color: #444; background: #fff; border: 1px solid #dde1e7; border-radius: 6px; text-decoration: none; line-height: 1.5; transition: background 0.12s, border-color 0.12s; }
  .csv-btn:hover { background: #f4f6f9; border-color: #b0bbc8; color: #222; }
  /* フィルタバー */
  .filter-bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .filter-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; flex: 1; min-width: 0; }
  .filter-chip { display: inline-flex; align-items: center; padding: 0.25rem 0.8rem; border: 1.5px solid #dde1e7; border-radius: 20px; font-size: 0.82rem; cursor: pointer; background: #f8f9fa; color: #555; user-select: none; transition: background 0.12s, border-color 0.12s, color 0.12s; }
  .filter-chip input[type="checkbox"] { display: none; }
  .filter-chip:has(input:checked) { background: var(--color-brand); border-color: var(--color-brand); color: #fff; font-weight: 600; }
  .filter-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
  .apply-btn { display: inline-flex; align-items: center; padding: 0.28rem 0.85rem; font-size: 0.82rem; background: #f1f3f7; color: #333; border: 1px solid #dde1e7; border-radius: 6px; cursor: pointer; font-family: inherit; white-space: nowrap; line-height: 1.5; transition: background 0.12s, border-color 0.12s; }
  .apply-btn:hover { background: #e3e8f0; border-color: #b0bbc8; }
  .reset-lnk { font-size: 0.81rem; color: #bbb; text-decoration: none; padding: 0.28rem 0.2rem; cursor: pointer; white-space: nowrap; transition: color 0.12s; line-height: 1.5; }
  .reset-lnk:hover { color: #666; text-decoration: underline; }
  .pagination { display: flex; gap: 0.75rem; align-items: center; margin-top: 1rem; font-size: 0.9rem; }
  .pagination a, .pagination span { padding: 4px 12px; border: 1px solid #ced4da; border-radius: 4px; text-decoration: none; color: var(--color-brand); }
  .pagination span { color: #999; cursor: default; }
  .pagination .current { background: var(--color-brand); color: #fff; border-color: var(--color-brand); }
  /* ステータスバッジ */
  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 0.82rem; white-space: nowrap; font-weight: 600; }
  .badge--pending   { background: #fff3cd; color: #664d03; border: 1px solid #ffda6a; }
  .badge--in_progress { background: var(--color-brand); color: #fff; border: 1px solid var(--color-brand); }
  .badge--resolved  { background: #198754; color: #fff; border: 1px solid #198754; }
  .badge--rejected  { background: #adb5bd; color: #fff; border: 1px solid #adb5bd; }
  /* 一覧: インラインステータス変更 */
  .inline-status-form { display: flex; gap: 0.3rem; align-items: center; }
  .inline-status-form select { padding: 0.2rem 0.4rem; font-size: 0.8rem; border: 1px solid #ced4da; border-radius: 3px; }
  .inline-status-form button { padding: 0.2rem 0.55rem; font-size: 0.8rem; background: var(--color-brand); color: #fff; border: none; border-radius: 3px; cursor: pointer; white-space: nowrap; transition: background 0.2s; }
  .inline-status-form button:hover { background: var(--color-brand-dark); }
  /* 詳細: 共通レイアウト */
  dl { display: grid; grid-template-columns: 180px 1fr; gap: 0.5rem 1rem; margin: 0; }
  dt { font-weight: bold; color: #555; }
  dd { margin: 0; }
  .section { background: #fff; border: 1px solid #dee2e6; border-radius: 6px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
  .section h2 { margin-top: 0; border-bottom: 1px solid #dee2e6; padding-bottom: 0.4rem; padding-left: 0.5rem; border-left: 3px solid var(--color-brand); }
  .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .photo-card { border: 1px solid #dee2e6; background: #f8f9fa; padding: 0.75rem; text-align: center; border-radius: 6px; display: flex; flex-direction: column; gap: 0.5rem; }
  .photo-card .photo-label { font-weight: bold; margin: 0; font-size: 0.9rem; color: #555; }
  .photo-thumb { width: 100%; height: 200px; object-fit: cover; border-radius: 4px; border: 1px solid #dee2e6; cursor: pointer; transition: opacity 0.15s; display: block; }
  .photo-thumb:hover { opacity: 0.88; }
  .photo-preview-link { display: block; }
  .photo-download-link { display: inline-block; padding: 0.3rem 0.8rem; font-size: 0.82rem; background: var(--color-brand); color: #fff; border-radius: 4px; text-decoration: none; }
  .photo-download-link:hover { background: var(--color-brand-dark); color: #fff; }
  .danger-section { border-color: #dc3545; }
  .danger-section h2 { color: #dc3545; border-left-color: #dc3545; }
  /* 写真 lightbox */
  .photo-error { font-size: 0.82rem; color: #dc3545; padding: 0.5rem 0; }
  .lightbox-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; align-items: center; justify-content: center; cursor: zoom-out; }
  .lightbox-overlay.is-open { display: flex; }
  .lightbox-overlay img { max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 4px; box-shadow: 0 4px 24px rgba(0,0,0,0.5); cursor: default; }
  .lightbox-close { position: absolute; top: 1rem; right: 1.25rem; color: #fff; font-size: 2rem; line-height: 1; cursor: pointer; background: none; border: none; padding: 0; opacity: 0.8; }
  .lightbox-close:hover { opacity: 1; }
  .danger-btn { padding: 0.45rem 1.2rem; font-size: 0.9rem; background: #fff; color: #dc3545; border: 1px solid #dc3545; border-radius: 4px; cursor: pointer; }
  .danger-btn:hover { background: #dc3545; color: #fff; }
  /* 詳細: ステータス更新 */
  .status-form { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .status-form select { padding: 0.4rem 0.6rem; font-size: 0.9rem; border: 1px solid #ced4da; border-radius: 4px; }
  .status-form button { padding: 0.4rem 1.2rem; font-size: 0.9rem; background: var(--color-brand); color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  .status-form button:hover { background: var(--color-brand-dark); }
  .status-msg { font-size: 0.88rem; color: #198754; margin-left: 0.5rem; }
  .back-link { margin-bottom: 1rem; display: inline-block; font-size: 0.9rem; }
  /* テーブル横スクロール */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  @media (max-width: 640px) {
    body { padding: 0 0.75rem 2rem; }
    .site-header { flex-wrap: wrap; gap: 0.5rem; }
    dl { grid-template-columns: 1fr; }
    dt { margin-top: 0.4rem; }
    .photo-grid { grid-template-columns: 1fr; }
    .logout-btn { min-height: 44px; }
    .status-form button { min-height: 44px; }
    .danger-btn { min-height: 44px; width: 100%; }
    .photo-download-link { min-height: 44px; display: flex; align-items: center; justify-content: center; }
    .list-toolbar { flex-wrap: wrap; gap: 0.4rem; }
    .csv-btn { flex: 1 1 auto; justify-content: center; min-height: 44px; }
    .filter-bar { flex-direction: column; align-items: stretch; gap: 0.5rem; }
    .filter-actions { flex-wrap: wrap; gap: 0.4rem; }
    .apply-btn { flex: 1 1 auto; justify-content: center; min-height: 44px; }
    .reset-lnk { min-height: 44px; display: flex; align-items: center; }
  }
`;

function renderLayout(title: string, body: string): string {
  const header = `<header class="site-header">
  <span class="site-header__title">${escapeHtml(BRANDING.appName)}<span class="site-header__label">管理画面</span></span>
  <form method="POST" action="${ADMIN_BASE_PATH}/logout" style="margin:0">
    <button type="submit" class="logout-btn">ログアウト</button>
  </form>
</header>`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${BRANDING.appName} 管理画面</title>
  <style>${COMMON_CSS}</style>
</head>
<body>
${header}
${body}
</body>
</html>`;
}

// ---- 各ページ ---------------------------------------------------------------

/** ログインページ */
export function renderLoginPage(error?: string): string {
  const errorHtml = error
    ? `<p style="color:#dc3545;margin-bottom:1rem;font-size:0.9rem">${escapeHtml(error)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ログイン - ${BRANDING.appName} 管理画面</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; background: #f1f3f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .login-box { background: #fff; border: 1px solid #dee2e6; border-radius: 8px; padding: 2rem 2.5rem; width: 100%; max-width: 360px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    h1 { font-size: 1.15rem; margin: 0 0 1.5rem; color: #333; border-bottom: 2px solid #2a6496; padding-bottom: 0.5rem; }
    label { display: block; font-size: 0.88rem; font-weight: bold; color: #555; margin-bottom: 0.25rem; }
    input[type="text"], input[type="password"] { width: 100%; padding: 0.5rem 0.65rem; font-size: 0.95rem; border: 1px solid #ced4da; border-radius: 4px; box-sizing: border-box; margin-bottom: 1rem; }
    input:focus { outline: none; border-color: #2a6496; box-shadow: 0 0 0 2px rgba(42,100,150,0.15); }
    button[type="submit"] { width: 100%; padding: 0.55rem; font-size: 1rem; background: #2a6496; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
    button[type="submit"]:hover { background: #1a4066; }
    .footer { margin-top: 1.5rem; font-size: 0.8rem; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>管理画面 ログイン</h1>
    ${errorHtml}
    <form method="POST" action="${ADMIN_BASE_PATH}/login">
      <label for="username">ユーザー名</label>
      <input type="text" id="username" name="username" autocomplete="username" required>
      <label for="password">パスワード</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit">ログイン</button>
    </form>
    <p class="footer">${BRANDING.appName}</p>
  </div>
</body>
</html>`;
}

/** 通報一覧ページ */
export function renderReportList(
  page: ReportsPage,
  currentPage: number,
  statuses: ReportStatus[],
): string {
  const totalPages = Math.max(1, Math.ceil(page.total / PAGE_SIZE));

  // ステータスクエリ文字列（複数対応）
  const statusQs = statuses.map((s) => `status=${encodeURIComponent(s)}`).join("&");

  // フィルタフォーム（チップ型チェックボックス）
  const checkboxes = VALID_STATUSES
    .map((s) => {
      const checked = statuses.includes(s) ? " checked" : "";
      return `<label class="filter-chip"><input type="checkbox" name="status" value="${s}"${checked}>${STATUS_LABELS[s]}</label>`;
    })
    .join("\n        ");
  const csvHref = statusQs
    ? `${ADMIN_BASE_PATH}/reports/csv?${statusQs}`
    : `${ADMIN_BASE_PATH}/reports/csv`;
  const resetLink = statuses.length > 0
    ? `<a class="reset-lnk" href="${ADMIN_BASE_PATH}/reports">リセット</a>`
    : "";
  const toolbar = `
  <div class="list-toolbar">
    <span class="list-count">${page.total} 件</span>
    <a class="csv-btn" href="${csvHref}"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>CSV 出力</a>
  </div>`;
  const filterForm = `
  <form class="filter-bar" method="GET" action="${ADMIN_BASE_PATH}/reports">
    <div class="filter-chips">
      ${checkboxes}
    </div>
    <div class="filter-actions">
      ${resetLink}
      <button class="apply-btn" type="submit">絞り込み</button>
    </div>
  </form>`;

  // テーブル行（6列: 受付番号・受付日時・ステータス・住所・通報者名・ステータス変更）
  const rows =
    page.reports.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#999;padding:2rem">通報データがありません</td></tr>`
      : page.reports
          .map((r) => {
            const addr = r.locationAddress
              ? escapeHtml(r.locationAddress)
              : `<span class="muted">住所なし</span>`;
            const name = r.reporterName
              ? escapeHtml(r.reporterName)
              : `<span class="muted">匿名</span>`;
            const rowClass = CLOSED_STATUSES.has(r.status) ? ' class="row--closed"' : '';
            return `<tr${rowClass}>
          <td><a href="${ADMIN_BASE_PATH}/reports/${r.id}">${escapeHtml(r.receiptNumber)}</a></td>
          <td style="white-space:nowrap">${formatJst(r.createdAt)}</td>
          <td class="status-badge-cell">${renderStatusBadge(r.status)}</td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${addr}</td>
          <td>${name}</td>
          <td>
            <form class="inline-status-form" data-id="${r.id}">
              <select>
                ${VALID_STATUSES.map((s) => `<option value="${s}"${r.status === s ? " selected" : ""}>${STATUS_LABELS[s]}</option>`).join("\n                ")}
              </select>
              <button type="submit">更新</button>
            </form>
          </td>
        </tr>`;
          })
          .join("\n");

  // ページネーション
  const pageQsSuffix = statusQs ? `&${statusQs}` : "";
  const prevLink =
    currentPage > 1
      ? `<a href="${ADMIN_BASE_PATH}/reports?page=${currentPage - 1}${pageQsSuffix}">◀ 前へ</a>`
      : `<span>◀ 前へ</span>`;
  const nextLink =
    currentPage < totalPages
      ? `<a href="${ADMIN_BASE_PATH}/reports?page=${currentPage + 1}${pageQsSuffix}">次へ ▶</a>`
      : `<span>次へ ▶</span>`;
  const pagination = `
  <div class="pagination">
    ${prevLink}
    <span class="current">${currentPage} / ${totalPages} ページ</span>
    ${nextLink}
  </div>`;

  // 一覧インラインステータス変更スクリプト
  const listScript = `
<script>
(function() {
  var STATUS_LABELS = ${STATUS_LABELS_JSON};
  var STATUS_BADGE_CLASSES = ${STATUS_BADGE_CLASSES_JSON};
  function makeBadge(status) {
    var label = STATUS_LABELS[status] || status;
    var cls = STATUS_BADGE_CLASSES[status] || 'badge';
    return '<span class="' + cls + '">' + label + '</span>';
  }
  document.querySelectorAll('.inline-status-form').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var id = form.dataset.id;
      var select = form.querySelector('select');
      var btn = form.querySelector('button[type="submit"]');
      var row = form.closest('tr');
      var badgeCell = row ? row.querySelector('.status-badge-cell') : null;
      btn.disabled = true;
      btn.textContent = '...';
      fetch('${ADMIN_BASE_PATH}/reports/' + id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: select.value })
      })
      .then(function(res) {
        if (!res.ok) return res.json().then(function(d) { throw new Error(d.error || 'エラーが発生しました'); });
        if (badgeCell) badgeCell.innerHTML = makeBadge(select.value);
        btn.disabled = false;
        btn.textContent = '✓';
        btn.style.background = '#198754';
        setTimeout(function() {
          btn.textContent = '更新';
          btn.style.background = '';
        }, 1500);
      })
      .catch(function(err) {
        alert('更新失敗: ' + err.message);
        btn.disabled = false;
        btn.textContent = '更新';
      });
    });
  });
})();
</script>`;

  const body = `
  <h1>通報一覧</h1>
  <div class="card">
    ${toolbar}
    ${filterForm}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>受付番号</th>
            <th>受付日時</th>
            <th>ステータス</th>
            <th>住所</th>
            <th>通報者名</th>
            <th>ステータス変更</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    ${pagination}
  </div>
  ${listScript}
`;
  return renderLayout("通報一覧", body);
}

/** 通報詳細ページ */
export function renderReportDetail(report: Report): string {
  const mapsUrl = `https://maps.google.com/?q=${report.latitude},${report.longitude}`;

  const val = (v: string | null | undefined, fallback = "（未記入）") =>
    v ? escapeHtml(v) : `<span class="muted">${fallback}</span>`;

  // ステータス更新スクリプト（リロードなし・バッジ即時更新・成功メッセージ表示）
  const statusUpdateScript = `
<script>
(function() {
  var STATUS_LABELS = ${STATUS_LABELS_JSON};
  var STATUS_BADGE_CLASSES = ${STATUS_BADGE_CLASSES_JSON};
  function makeBadge(status) {
    var label = STATUS_LABELS[status] || status;
    var cls = STATUS_BADGE_CLASSES[status] || 'badge';
    return '<span class="' + cls + '">' + label + '</span>';
  }
  var form = document.getElementById('status-form');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var select = document.getElementById('status-select');
    var btn = document.getElementById('status-btn');
    var msg = document.getElementById('status-msg');
    btn.disabled = true;
    btn.textContent = '更新中...';
    if (msg) msg.style.display = 'none';
    fetch('${ADMIN_BASE_PATH}/reports/${report.id}/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: select.value })
    })
    .then(function(res) {
      if (!res.ok) return res.json().then(function(d) { throw new Error(d.error || 'エラーが発生しました'); });
      var badgeContainer = document.getElementById('status-badge-container');
      if (badgeContainer) badgeContainer.innerHTML = makeBadge(select.value);
      if (msg) { msg.style.display = 'inline'; setTimeout(function() { msg.style.display = 'none'; }, 3000); }
      btn.disabled = false;
      btn.textContent = '更新';
    })
    .catch(function(err) {
      alert('ステータス更新に失敗しました: ' + err.message);
      btn.disabled = false;
      btn.textContent = '更新';
    });
  });
})();
</script>`;

  const body = `
  <a class="back-link" href="${ADMIN_BASE_PATH}/reports">← 一覧へ戻る</a>
  <h1>通報詳細 — ${escapeHtml(report.receiptNumber)}</h1>

  <div class="section">
    <h2>基本情報</h2>
    <dl>
      <dt>受付番号</dt><dd>${escapeHtml(report.receiptNumber)}</dd>
      <dt>ステータス</dt><dd id="status-badge-container">${renderStatusBadge(report.status)}</dd>
      <dt>受付日時</dt><dd>${formatJst(report.createdAt)}</dd>
      <dt>最終更新</dt><dd>${formatJst(report.updatedAt)}</dd>
    </dl>
  </div>

  <div class="section">
    <h2>ステータス更新</h2>
    <form id="status-form" class="status-form">
      <select id="status-select">
        ${VALID_STATUSES.map((s) => `<option value="${s}"${report.status === s ? " selected" : ""}>${STATUS_LABELS[s]}</option>`).join("\n        ")}
      </select>
      <button id="status-btn" type="submit">更新</button>
      <span id="status-msg" class="status-msg" style="display:none">✓ 更新しました</span>
    </form>
  </div>

  <div class="section">
    <h2>位置情報</h2>
    <dl>
      <dt>緯度 / 経度</dt><dd>${report.latitude}, ${report.longitude} &nbsp;<a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener">Google Maps で開く ↗</a></dd>
      <dt>住所</dt><dd>${val(report.locationAddress, "（住所なし）")}</dd>
    </dl>
  </div>

  <div class="section">
    <h2>補足・通報者情報</h2>
    <dl>
      <dt>撮影日付</dt><dd>${val(report.shootingDate)}</dd>
      <dt>補足事項</dt><dd style="white-space:pre-wrap">${val(report.remarks)}</dd>
      <dt>通報者名</dt><dd>${val(report.reporterName)}</dd>
      <dt>電話番号</dt><dd>${val(report.reporterPhone)}</dd>
    </dl>
  </div>

  <div class="section">
    <h2>写真</h2>
    <div class="photo-grid">
      <div class="photo-card">
        <p class="photo-label">近景写真</p>
        <img src="${ADMIN_BASE_PATH}/reports/${report.id}/images/close" alt="近景写真" class="photo-thumb js-lightbox-trigger" loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
        <p class="photo-error" style="display:none">画像を取得できませんでした</p>
        <a class="photo-download-link" href="${ADMIN_BASE_PATH}/reports/${report.id}/images/close?dl=1" download="${escapeHtml(`close_${report.receiptNumber}.jpg`)}">ダウンロード</a>
      </div>
      <div class="photo-card">
        <p class="photo-label">遠景写真</p>
        <img src="${ADMIN_BASE_PATH}/reports/${report.id}/images/far" alt="遠景写真" class="photo-thumb js-lightbox-trigger" loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
        <p class="photo-error" style="display:none">画像を取得できませんでした</p>
        <a class="photo-download-link" href="${ADMIN_BASE_PATH}/reports/${report.id}/images/far?dl=1" download="${escapeHtml(`far_${report.receiptNumber}.jpg`)}">ダウンロード</a>
      </div>
    </div>
  </div>

  <div id="lightbox" class="lightbox-overlay" role="dialog" aria-modal="true" aria-label="写真拡大表示">
    <button class="lightbox-close" id="lightbox-close" aria-label="閉じる">✕</button>
    <img id="lightbox-img" src="" alt="">
  </div>

  <div class="section danger-section">
    <h2>削除</h2>
    <p style="font-size:0.9rem;color:#666;margin-top:0">通報データと添付写真をすべて削除します。この操作は取り消せません。</p>
    <button id="delete-btn" class="danger-btn" type="button">この通報を削除する</button>
  </div>
  ${statusUpdateScript}
  <script>
(function() {
  var btn = document.getElementById('delete-btn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    if (!confirm('通報「${escapeHtml(report.receiptNumber)}」を削除しますか？\\n添付写真も含めてすべて削除されます。この操作は取り消せません。')) return;
    btn.disabled = true;
    btn.textContent = '削除中...';
    fetch('${ADMIN_BASE_PATH}/reports/${report.id}', { method: 'DELETE' })
      .then(function(res) {
        if (res.ok) {
          location.href = '${ADMIN_BASE_PATH}/reports';
        } else {
          throw new Error('削除に失敗しました（' + res.status + '）');
        }
      })
      .catch(function(err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'この通報を削除する';
      });
  });
})();
</script>
<script>
(function() {
  var overlay = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightbox-img');
  var closeBtn = document.getElementById('lightbox-close');
  if (!overlay || !lightboxImg || !closeBtn) return;
  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    lightboxImg.src = '';
  }
  document.querySelectorAll('.js-lightbox-trigger').forEach(function(img) {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', function() {
      openLightbox(img.src, img.alt);
    });
  });
  closeBtn.addEventListener('click', closeLightbox);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeLightbox();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeLightbox();
  });
})();
</script>
`;
  return renderLayout(`通報詳細 ${report.receiptNumber}`, body);
}

/** エラーページ */
export function renderErrorPage(code: number, message: string): string {
  const body = `
  <h1>${code} エラー</h1>
  <p>${escapeHtml(message)}</p>
  <p><a href="${ADMIN_BASE_PATH}/reports">通報一覧へ戻る</a></p>
`;
  return renderLayout(`${code} エラー`, body);
}
