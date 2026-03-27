/**
 * アプリ共通の型定義
 */

/** Cloudflare Workers の環境変数バインディング */
export interface Env {
  // LINE Messaging API
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  /** 管理者通知先の LINE ユーザー ID（任意）。設定すると新規通報時に LINE プッシュ通知を送る */
  LINE_ADMIN_USER_ID?: string;

  // 管理画面認証
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string; // SHA-256 hex ハッシュ（echo -n "password" | sha256sum で生成）
  ADMIN_SESSION_SECRET: string; // セッション Cookie の HMAC-SHA256 署名用シークレット

  // D1 データベース
  DB: D1Database;

  // R2 バケット
  IMAGES: R2Bucket;
}

/** 道路破損通報のステータス */
export type ReportStatus = "pending" | "in_progress" | "resolved" | "rejected";

/** 道路破損通報レコード */
export interface Report {
  id: number;
  receiptNumber: string; // OZU-YYYYMMDD-NNN
  lineUserId: string;
  status: ReportStatus;
  closePhotoKey: string; // R2 キー（近景）
  farPhotoKey: string; // R2 キー（遠景）
  latitude: number;
  longitude: number;
  locationAddress: string | null; // LINE 位置情報の住所テキスト
  shootingDate: string | null; // ISO 8601 date
  remarks: string | null;
  reporterName: string | null;
  reporterPhone: string | null;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
}

/** 会話セッションの状態 */
export type ConversationStep =
  | "consent" // 利用同意
  | "close_photo" // 近景写真
  | "far_photo" // 遠景写真
  | "location" // 位置情報
  | "shooting_date" // 撮影日付（任意）
  | "remarks" // 補足事項（任意）
  | "reporter_name" // 氏名（任意）
  | "reporter_phone" // 電話番号（任意）
  | "confirming" // 確認中（送信する／やり直す を待つ）。「やり直す」は consent ステップへ戻る
  | "cancelling" // キャンセル確認中（「はい、中止します」「いいえ、続けます」を待つ）
  | "completed" // 完了
  | "cancelled" // キャンセル済み
  | "timed_out"; // タイムアウト（Cron により設定。次回メッセージ時に案内して削除）

/** 会話セッション */
export interface ConversationSession {
  lineUserId: string;
  step: ConversationStep;
  data: Partial<{
    reportUuid: string; // R2 キーの基盤となる UUID（近景受信時に生成）
    closePhotoKey: string; // R2 キー（近景）
    farPhotoKey: string; // R2 キー（遠景）
    latitude: number;
    longitude: number;
    locationAddress: string;
    shootingDate: string;
    remarks: string;
    reporterName: string;
    reporterPhone: string;
    previousStep: ConversationStep; // cancelling ステップ中に元のステップを保持
  }>;
  createdAt: string;
  updatedAt: string;
}
