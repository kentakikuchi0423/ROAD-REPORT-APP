/**
 * プライバシーポリシーページ
 *
 * CLAUDE.md セキュリティ方針: 簡易プライバシーポリシーを用意する
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
    h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
    p, ul { margin-top: 0.5rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.25rem; }
    .meta { font-size: 0.85rem; color: #666; margin-top: 2.5rem; }
  </style>
</head>
<body>
  <h1>プライバシーポリシー</h1>
  <p>
    大洲市（以下「市」）は、大洲市道路破損通報サービス（以下「本サービス」）において収集する
    個人情報を以下のとおり取り扱います。
  </p>

  <h2>1. 収集する情報</h2>
  <p>本サービスでは、道路破損の通報処理に必要な以下の情報を収集します。</p>
  <ul>
    <li>道路破損箇所の写真（近景・遠景、必須）</li>
    <li>位置情報（緯度・経度・住所テキスト、必須）</li>
    <li>撮影日付（任意）</li>
    <li>補足事項（任意）</li>
    <li>氏名（任意、未入力の場合は匿名で受付）</li>
    <li>電話番号（任意、未入力の場合は匿名で受付）</li>
    <li>LINE ユーザー ID（通報フローの会話管理のみに使用。他の目的には使用しません）</li>
  </ul>
  <p>氏名・電話番号の入力は任意です。入力せずに匿名で通報することができます。</p>

  <h2>2. 利用目的</h2>
  <p>収集した情報は、以下の目的のみに使用します。</p>
  <ul>
    <li>通報内容の確認および道路修繕対応</li>
    <li>通報者への折り返し連絡（電話番号を提供した場合のみ）</li>
    <li>通報受付・対応状況の管理</li>
  </ul>
  <p>収集した情報を上記目的以外に使用することはありません。</p>

  <h2>3. 第三者への提供</h2>
  <p>
    収集した個人情報は、法令に基づく場合または本人の同意がある場合を除き、
    第三者に提供しません。なお、道路修繕の委託業者へ通報箇所の情報を提供する場合がありますが、
    その際も個人を特定できる情報（氏名・電話番号）は原則として提供しません。
  </p>

  <h2>4. 保管・管理</h2>
  <p>
    収集した情報は Cloudflare のクラウドサービス（D1 データベース・R2 ストレージ）上で保管します。
    通報情報は対応完了後も保持し、市の管理者が削除するまで保管します。
    不正アクセスや情報漏えいを防ぐため、アクセス制限・HTTPS 通信・認証を実施します。
  </p>

  <h2>5. LINE サービスについて</h2>
  <p>
    本サービスは LINE 株式会社が提供するメッセージングプラットフォームを利用します。
    LINE の利用に関しては <a href="https://line.me/ja/terms/policy/" target="_blank" rel="noopener noreferrer">LINE プライバシーポリシー</a>
    も合わせてご確認ください。
  </p>

  <h2>6. 開示・訂正・削除のご請求</h2>
  <p>
    ご自身の個人情報について、開示・訂正・削除を希望される場合は下記のお問い合わせ先にご連絡ください。
    本人確認の上、合理的な範囲でご対応します。
  </p>

  <h2>7. お問い合わせ</h2>
  <p>本ポリシーに関するお問い合わせは、大洲市担当窓口までご連絡ください。</p>
  <p>
    大洲市役所<br>
    〒795-8601 愛媛県大洲市大洲649番地1<br>
    TEL: 0893-24-1111（代表）
  </p>

  <p class="meta">
    大洲市道路破損通報サービス<br>
    制定：2026年3月
  </p>
</body>
</html>
`;
