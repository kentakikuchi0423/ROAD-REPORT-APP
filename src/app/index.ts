/**
 * Cloudflare Workers エントリーポイント
 *
 * ルーティング:
 *   GET  /           - トップページ（URL 案内・開発確認用）
 *   GET  /healthz    - ヘルスチェック
 *   POST /webhook    - LINE Webhook
 *   GET  /privacy    - プライバシーポリシー
 *   /admin/*         - 管理画面
 */

import type { Env } from "../types";
import { handleWebhook } from "./webhook";
import { handleAdmin } from "./admin/index";
import { privacyPolicyHtml } from "./privacy";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // トップページ
    if (pathname === "/" && request.method === "GET") {
      return new Response(renderTopPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ヘルスチェック
    if (pathname === "/healthz" && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok", service: "ozu-road-report" }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // LINE Webhook
    if (pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env, ctx);
    }

    // プライバシーポリシー
    if (pathname === "/privacy") {
      return new Response(privacyPolicyHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 管理画面
    if (pathname.startsWith("/admin")) {
      return handleAdmin(request, env, ctx);
    }

    // その他は 404
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// ---- トップページ HTML -------------------------------------------------------

function renderTopPage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>大洲市道路破損通報アプリ</title>
  <style>
    body { font-family: sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #333; }
    h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; margin-top: 2rem; }
    ul { line-height: 2.2; padding-left: 1.2rem; }
    code { background: #f0f0f0; padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.85rem; }
    .badge { font-size: 0.75rem; background: #e2e8f0; padding: 0.1rem 0.5rem; border-radius: 4px; margin-left: 0.4rem; color: #555; }
    .note { font-size: 0.85rem; color: #777; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <h1>大洲市道路破損通報アプリ</h1>
  <p class="note">愛媛県大洲市 — LINE チャット上で道路の破損を通報するシステム</p>

  <h2>確認用ページ</h2>
  <ul>
    <li><a href="/healthz">ヘルスチェック</a> <span class="badge">GET /healthz</span></li>
    <li><a href="/privacy">プライバシーポリシー</a> <span class="badge">GET /privacy</span></li>
    <li><a href="/admin/login">管理画面ログイン</a> <span class="badge">GET /admin/login</span></li>
    <li><a href="/admin/reports">通報一覧</a> <span class="badge">GET /admin/reports</span> <span class="note">※ ログイン後</span></li>
  </ul>

  <h2>API エンドポイント</h2>
  <ul>
    <li><code>POST /webhook</code> — LINE Webhook（LINE プラットフォームからのみ受付）</li>
  </ul>

  <h2>ローカル確認の注意</h2>
  <ul>
    <li>D1 migration 未適用の場合、管理画面でエラーが発生します</li>
    <li>migration 適用: <code>npm run d1:migrate:local</code></li>
    <li>LINE Webhook は実機疎通なしでは動作確認できません</li>
  </ul>
</body>
</html>`;
}
