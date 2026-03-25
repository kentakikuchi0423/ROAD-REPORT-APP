/**
 * プライバシーポリシーページ（簡易版）
 *
 * CLAUDE.md のセキュリティ方針: 簡易プライバシーポリシーを用意する
 * Step 9 で内容を充実させる予定
 */

export const privacyPolicyHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>プライバシーポリシー - 大洲市道路破損通報サービス</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 1.5rem;
      color: #333;
      line-height: 1.8;
    }
    h1 { font-size: 1.4rem; border-bottom: 2px solid #2a6496; padding-bottom: 0.5rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; }
    .note {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 0.75rem 1rem;
      margin: 1rem 0;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <h1>プライバシーポリシー</h1>
  <p>大洲市道路破損通報サービス（以下「本サービス」）は、市民の皆様の個人情報を適切に取り扱うため、以下のポリシーを定めます。</p>

  <div class="note">
    ⚠️ このページはプレースホルダです。Step 9 で正式な内容に更新予定です。
  </div>

  <h2>1. 収集する情報</h2>
  <p>本サービスでは、道路破損の通報にあたり以下の情報を収集します。</p>
  <ul>
    <li>道路破損箇所の写真（近景・遠景）</li>
    <li>位置情報（緯度・経度）</li>
    <li>撮影日付（任意）</li>
    <li>補足事項（任意）</li>
    <li>氏名・電話番号（任意、匿名通報も可能）</li>
    <li>LINE ユーザー ID（会話管理のため）</li>
  </ul>

  <h2>2. 利用目的</h2>
  <p>収集した情報は、道路破損の確認・修繕対応のみに使用します。</p>

  <h2>3. 第三者提供</h2>
  <p>法令に基づく場合を除き、収集した情報を第三者に提供することはありません。</p>

  <h2>4. 保管・管理</h2>
  <p>収集した情報は Cloudflare のサービス上で安全に保管し、不正アクセスの防止に努めます。</p>

  <h2>5. お問い合わせ</h2>
  <p>個人情報の取り扱いに関するお問い合わせは、大洲市までご連絡ください。</p>

  <p style="margin-top: 2rem; font-size: 0.85rem; color: #666;">
    大洲市道路破損通報サービス<br>
    最終更新: 2026年3月（準備中）
  </p>
</body>
</html>
`;
