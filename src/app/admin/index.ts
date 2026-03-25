/**
 * 管理画面ルートハンドラ（プレースホルダ）
 *
 * Step 8 で実装予定:
 *   GET  /admin          - 通報一覧
 *   GET  /admin/:id      - 通報詳細
 *   PATCH /admin/:id     - ステータス変更
 *   GET  /admin/export   - CSV 出力
 *   DELETE /admin/:id    - 削除
 */

import type { Env } from "../../types";

export function handleAdmin(
  _request: Request,
  _env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  // TODO: Step 9 で認証ミドルウェアを追加
  // TODO: Step 8 で各ルートを実装
  return Promise.resolve(
    new Response("Admin: Coming Soon", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }),
  );
}
