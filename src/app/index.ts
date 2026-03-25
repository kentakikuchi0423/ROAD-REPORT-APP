/**
 * Cloudflare Workers エントリーポイント
 *
 * ルーティング:
 *   POST /webhook      - LINE Webhook（Step 4 で実装）
 *   GET  /privacy      - プライバシーポリシー
 *   /admin/*           - 管理画面（Step 8 で実装）
 */

import type { Env } from "../types";
import { handleWebhook } from "./webhook";
import { handleAdmin } from "./admin/index";
import { privacyPolicyHtml } from "./privacy";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

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
