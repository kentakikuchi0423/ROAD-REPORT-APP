/**
 * 管理画面 設定定数
 *
 * ベースパスを一箇所で管理する。
 * 変更する場合はこのファイルのみを更新すればよい。
 *
 * 注意: segment 解析（segments[2], segments[3] 等）はベースパスが
 * 1 階層（/xxx 形式）であることを前提にしている。
 * 2 階層以上（例: /admin/v2）に変更する場合は admin/index.ts の
 * segment オフセット計算も合わせて更新すること。
 */

export const ADMIN_BASE_PATH = "/admin";
