/**
 * アプリ共通定数
 *
 * ReportStatus のラベル・バッジクラス・有効値リストを一元管理します。
 * admin/index.ts・views.ts・CSV 出力のすべてからここを参照します。
 */

import type { ReportStatus } from "../types";

/** ステータス表示ラベル（UI・CSV・通知 共通） */
export const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "受付済み",
  in_progress: "対応中",
  resolved: "対応完了",
  rejected: "対応不要",
};

/** ステータスバッジに付与する CSS クラス名（"badge badge--STATUS" 形式） */
export const STATUS_BADGE_CLASSES: Record<ReportStatus, string> = {
  pending: "badge badge--pending",
  in_progress: "badge badge--in_progress",
  resolved: "badge badge--resolved",
  rejected: "badge badge--rejected",
};

/** 有効なステータス値の一覧（バリデーション・フィルタ共通） */
export const VALID_STATUSES: readonly ReportStatus[] = [
  "pending",
  "in_progress",
  "resolved",
  "rejected",
];
