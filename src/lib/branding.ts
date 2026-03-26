/**
 * アプリのブランディング・連絡先定数
 *
 * 本アプリは菊地けんた個人が開発したものです。大洲市公式アプリではありません。
 * 問い合わせ先・プライバシーポリシー URL など、管理者情報を 1 か所に集約しています。
 *
 * TODO: privacyPolicyUrl は本番ドメイン確定後に差し替えてください。
 */
export const BRANDING = {
  /** アプリ名 */
  appName: "大洲市道路破損通報アプリ",
  /** 開発者名 */
  developer: "菊地けんた",
  /** 問い合わせ先メールアドレス */
  contactEmail: "kenta.kikuchi.0423@gmail.com",
  /**
   * プライバシーポリシーページ URL
   * TODO: 本番ドメイン確定後に差し替えてください
   */
  privacyPolicyUrl: "https://example.com/privacy",
  /** 非公式アプリである旨の免責事項 */
  disclaimer:
    "本アプリは菊地けんた個人が開発したものです。大洲市の公式サービスではありません。",
} as const;
