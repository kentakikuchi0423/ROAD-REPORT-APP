/**
 * 管理画面 HTML テンプレート関数群
 *
 * 純粋関数（データを受け取り HTML 文字列を返す）。
 * 副作用・外部 I/O なし。
 */

import type { Report, ReportStatus } from "../../types";
import type { ReportsPage } from "../../lib/db";
import { BRANDING } from "../../lib/branding";

// ---- 定数 -------------------------------------------------------------------

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "受付済み",
  in_progress: "対応中",
  resolved: "対応完了",
  rejected: "対応不要",
};

/** ステータスバッジに付与する CSS クラス名（badge badge--STATUS） */
const STATUS_BADGE_CLASSES: Record<ReportStatus, string> = {
  pending: "badge badge--pending",
  in_progress: "badge badge--in_progress",
  resolved: "badge badge--resolved",
  rejected: "badge badge--rejected",
};

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
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem;
    color: #333;
    line-height: 1.7;
  }
  h1 { font-size: 1.4rem; border-bottom: 2px solid var(--color-brand); padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1.1rem; margin-top: 1.5rem; }
  a { color: var(--color-brand); }
  a:hover { color: var(--color-brand-dark); }
  .nav { margin-bottom: 1.5rem; font-size: 0.9rem; }
  .note {
    background: #fff3cd;
    border-left: 4px solid #ffc107;
    padding: 0.6rem 1rem;
    margin: 1rem 0;
    font-size: 0.88rem;
  }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { border: 1px solid #dee2e6; padding: 0.5rem 0.75rem; text-align: left; vertical-align: middle; }
  th { background: #f1f3f5; white-space: nowrap; }
  tr:hover td { background: #f8f9fa; }
  tr.row--closed td { color: #999; }
  tr.row--closed td a { color: #999; }
  .muted { color: #999; font-style: italic; }
  .filter-form { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
  .filter-form select, .filter-form button { padding: 0.35rem 0.65rem; font-size: 0.88rem; border: 1px solid #ced4da; border-radius: 4px; }
  .filter-form button { background: var(--color-brand); color: #fff; cursor: pointer; border-color: var(--color-brand); }
  .filter-form button:hover { background: var(--color-brand-dark); }
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
  .section { border: 1px solid #dee2e6; border-radius: 6px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
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
  .danger-btn { padding: 0.45rem 1.2rem; font-size: 0.9rem; background: #fff; color: #dc3545; border: 1px solid #dc3545; border-radius: 4px; cursor: pointer; }
  .danger-btn:hover { background: #dc3545; color: #fff; }
  /* 詳細: ステータス更新 */
  .status-form { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .status-form select { padding: 0.4rem 0.6rem; font-size: 0.9rem; border: 1px solid #ced4da; border-radius: 4px; }
  .status-form button { padding: 0.4rem 1.2rem; font-size: 0.9rem; background: var(--color-brand); color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  .status-form button:hover { background: var(--color-brand-dark); }
  .status-msg { font-size: 0.88rem; color: #198754; margin-left: 0.5rem; }
  .back-link { margin-bottom: 1rem; display: inline-block; font-size: 0.9rem; }
`;

function renderLayout(title: string, body: string): string {
  const logoutNav = `
  <nav style="display:flex;justify-content:flex-end;margin-bottom:0.5rem;font-size:0.85rem">
    <form method="POST" action="/admin/logout" style="margin:0">
      <button type="submit" style="background:none;border:none;color:#2a6496;cursor:pointer;padding:0;font-size:0.85rem;text-decoration:underline">ログアウト</button>
    </form>
  </nav>`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${BRANDING.appName} 管理画面</title>
  <style>${COMMON_CSS}</style>
</head>
<body>
${logoutNav}
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
    <form method="POST" action="/admin/login">
      <label for="username">ユーザー名</label>
      <input type="text" id="username" name="username" autocomplete="username" required>
      <label for="password">パスワード</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit">ログイン</button>
    </form>
    <p class="footer">${BRANDING.appName}（個人開発: ${BRANDING.developer}）</p>
  </div>
</body>
</html>`;
}

/** 管理トップページ */
export function renderAdminTop(): string {
  const body = `
  <h1>${BRANDING.appName} 管理画面</h1>
  <div class="section">
    <h2>メニュー</h2>
    <ul>
      <li><a href="/admin/reports">通報一覧</a> — 受け付けた通報の一覧を確認・ステータス管理</li>
    </ul>
  </div>
  <p style="margin-top:2rem;font-size:0.85rem;color:#666;">${BRANDING.appName} 管理画面（個人開発: ${BRANDING.developer}）</p>
`;
  return renderLayout("トップ", body);
}

/** 通報一覧ページ */
export function renderReportList(
  page: ReportsPage,
  currentPage: number,
  status: ReportStatus | undefined,
): string {
  const totalPages = Math.max(1, Math.ceil(page.total / PAGE_SIZE));

  // フィルタフォーム
  const csvHref = status
    ? `/admin/reports/csv?status=${status}`
    : "/admin/reports/csv";
  const filterForm = `
  <form class="filter-form" method="GET" action="/admin/reports">
    <label for="status-filter">ステータス:</label>
    <select id="status-filter" name="status">
      <option value=""${!status ? " selected" : ""}>全て</option>
      <option value="pending"${status === "pending" ? " selected" : ""}>受付済み</option>
      <option value="in_progress"${status === "in_progress" ? " selected" : ""}>対応中</option>
      <option value="resolved"${status === "resolved" ? " selected" : ""}>対応完了</option>
      <option value="rejected"${status === "rejected" ? " selected" : ""}>対応不要</option>
    </select>
    <button type="submit">絞り込み</button>
    ${status ? `<a href="/admin/reports">リセット</a>` : ""}
    <a href="${csvHref}" style="padding:0.35rem 0.65rem;font-size:0.88rem;border:1px solid #198754;border-radius:4px;color:#198754;text-decoration:none;white-space:nowrap">CSV出力</a>
    <span style="margin-left:auto;color:#666;font-size:0.88rem">${page.total} 件</span>
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
          <td><a href="/admin/reports/${r.id}">${escapeHtml(r.receiptNumber)}</a></td>
          <td style="white-space:nowrap">${formatJst(r.createdAt)}</td>
          <td class="status-badge-cell">${renderStatusBadge(r.status)}</td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${addr}</td>
          <td>${name}</td>
          <td>
            <form class="inline-status-form" data-id="${r.id}">
              <select>
                <option value="pending"${r.status === "pending" ? " selected" : ""}>受付済み</option>
                <option value="in_progress"${r.status === "in_progress" ? " selected" : ""}>対応中</option>
                <option value="resolved"${r.status === "resolved" ? " selected" : ""}>対応完了</option>
                <option value="rejected"${r.status === "rejected" ? " selected" : ""}>対応不要</option>
              </select>
              <button type="submit">更新</button>
            </form>
          </td>
        </tr>`;
          })
          .join("\n");

  // ページネーション
  const statusParam = status ? `&status=${status}` : "";
  const prevLink =
    currentPage > 1
      ? `<a href="/admin/reports?page=${currentPage - 1}${statusParam}">◀ 前へ</a>`
      : `<span>◀ 前へ</span>`;
  const nextLink =
    currentPage < totalPages
      ? `<a href="/admin/reports?page=${currentPage + 1}${statusParam}">次へ ▶</a>`
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
      fetch('/admin/reports/' + id + '/status', {
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
  <div class="nav"><a href="/admin">← 管理トップ</a></div>
  <h1>通報一覧</h1>
  ${filterForm}
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
  ${pagination}
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
    fetch('/admin/reports/${report.id}/status', {
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
  <a class="back-link" href="/admin/reports">← 一覧へ戻る</a>
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
        <option value="pending"${report.status === "pending" ? " selected" : ""}>受付済み</option>
        <option value="in_progress"${report.status === "in_progress" ? " selected" : ""}>対応中</option>
        <option value="resolved"${report.status === "resolved" ? " selected" : ""}>対応完了</option>
        <option value="rejected"${report.status === "rejected" ? " selected" : ""}>対応不要</option>
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
      <dt>LINE ユーザー ID</dt><dd>${escapeHtml(report.lineUserId)}</dd>
    </dl>
  </div>

  <div class="section">
    <h2>写真</h2>
    <div class="photo-grid">
      <div class="photo-card">
        <p class="photo-label">近景写真</p>
        <a href="/admin/reports/${report.id}/images/close" target="_blank" rel="noopener" class="photo-preview-link">
          <img src="/admin/reports/${report.id}/images/close" alt="近景写真" class="photo-thumb" loading="lazy">
        </a>
        <a class="photo-download-link" href="/admin/reports/${report.id}/images/close?dl=1" download="${escapeHtml(`close_${report.receiptNumber}.jpg`)}">ダウンロード</a>
      </div>
      <div class="photo-card">
        <p class="photo-label">遠景写真</p>
        <a href="/admin/reports/${report.id}/images/far" target="_blank" rel="noopener" class="photo-preview-link">
          <img src="/admin/reports/${report.id}/images/far" alt="遠景写真" class="photo-thumb" loading="lazy">
        </a>
        <a class="photo-download-link" href="/admin/reports/${report.id}/images/far?dl=1" download="${escapeHtml(`far_${report.receiptNumber}.jpg`)}">ダウンロード</a>
      </div>
    </div>
  </div>

  <div class="section danger-section">
    <h2>危険な操作</h2>
    <p style="font-size:0.9rem;color:#666;margin-top:0">通報データと写真（R2）を削除します。この操作は取り消せません。</p>
    <button id="delete-btn" class="danger-btn" type="button">この通報を削除する</button>
  </div>
  ${statusUpdateScript}
  <script>
(function() {
  var btn = document.getElementById('delete-btn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    if (!confirm('通報「${escapeHtml(report.receiptNumber)}」を削除しますか？\\nR2の写真も削除されます。この操作は取り消せません。')) return;
    btn.disabled = true;
    btn.textContent = '削除中...';
    fetch('/admin/reports/${report.id}', { method: 'DELETE' })
      .then(function(res) {
        if (res.ok) {
          location.href = '/admin/reports';
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
`;
  return renderLayout(`通報詳細 ${report.receiptNumber}`, body);
}

/** エラーページ */
export function renderErrorPage(code: number, message: string): string {
  const body = `
  <h1>${code} エラー</h1>
  <p>${escapeHtml(message)}</p>
  <p><a href="/admin/reports">通報一覧へ戻る</a></p>
`;
  return renderLayout(`${code} エラー`, body);
}
