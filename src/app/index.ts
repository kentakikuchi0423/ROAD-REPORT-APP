/**
 * Cloudflare Workers エントリーポイント
 *
 * ルーティング:
 *   GET  /           - 管理画面ログインへリダイレクト
 *   GET  /healthz    - ヘルスチェック
 *   POST /webhook    - LINE Webhook
 *   /admin/*         - 管理画面
 */

import type { Env } from "../types";
import { handleWebhook } from "./webhook";
import { handleAdmin } from "./admin/index";
import { ADMIN_BASE_PATH } from "./admin/config";
import { runSessionTimeoutJob } from "./conversation";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // トップページ → 管理画面ログインへリダイレクト（Web アクセスは管理者のみ）
    if (pathname === "/" && request.method === "GET") {
      return Response.redirect(
        new URL(`${ADMIN_BASE_PATH}/login`, request.url).toString(),
        302,
      );
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

    // 管理画面
    if (pathname.startsWith(ADMIN_BASE_PATH)) {
      return handleAdmin(request, env, ctx);
    }

    // その他は 404
    return new Response("Not Found", { status: 404 });
  },

  // Cron Trigger: 30分ごとにタイムアウトセッションを処理する
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runSessionTimeoutJob(env);
  },
} satisfies ExportedHandler<Env>;
