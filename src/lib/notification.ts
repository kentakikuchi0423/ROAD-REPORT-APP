/**
 * 管理者通知モジュール
 *
 * 通報完了時に管理者へ通知を送る。
 * 現在の実装は LINE Push Message API を使用する。
 * 将来的に Email・Slack 等へ差し替えやすいよう AdminNotifier インターフェースで抽象化する。
 *
 * 通知の失敗は呼び出し元でキャッチし、通報完了処理を妨げないこと。
 */

import type { Env, Report } from "../types";

// ---- インターフェース ---------------------------------------------------------

/** 管理者通知サービスの抽象インターフェース */
export interface AdminNotifier {
  /** 新規通報を管理者へ通知する */
  notifyNewReport(report: Report): Promise<void>;
}

// ---- LINE Push Message 実装 --------------------------------------------------

class LineAdminNotifier implements AdminNotifier {
  constructor(
    private readonly adminUserId: string,
    private readonly accessToken: string,
  ) {}

  async notifyNewReport(report: Report): Promise<void> {
    const text = buildNotificationText(report);
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        to: this.adminUserId,
        messages: [{ type: "text", text }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      throw new Error(`LINE push notification failed: ${String(res.status)} ${body}`);
    }
  }
}

// ---- NULL実装（通知不要・未設定時） ------------------------------------------

class NullAdminNotifier implements AdminNotifier {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async notifyNewReport(_report: Report): Promise<void> {
    // LINE_ADMIN_USER_ID 未設定のため通知しない
  }
}

// ---- ファクトリ関数 ----------------------------------------------------------

/**
 * 環境変数から適切な AdminNotifier を生成する。
 * LINE_ADMIN_USER_ID が設定されていれば LINE 通知を行う。
 * 未設定の場合は通知しない NullAdminNotifier を返す。
 */
export function createAdminNotifier(env: Env): AdminNotifier {
  if (env.LINE_ADMIN_USER_ID) {
    return new LineAdminNotifier(env.LINE_ADMIN_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);
  }
  return new NullAdminNotifier();
}

// ---- 通知文言 ----------------------------------------------------------------

function buildNotificationText(report: Report): string {
  const location = report.locationAddress ?? `${String(report.latitude)}, ${String(report.longitude)}`;
  return [
    "【新規道路破損通報】",
    "",
    `受付番号: ${report.receiptNumber}`,
    `場所: ${location}`,
    `受付日時: ${new Date(report.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    "",
    "管理画面で内容を確認してください。",
  ].join("\n");
}
