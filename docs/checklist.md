# 公開前チェックリスト

大洲市道路破損通報アプリを本番公開する前に確認する項目一覧です。

---

## 1. Cloudflare リソース作成

- [ ] `wrangler d1 create ozu-road-report-db` — D1 データベースを作成し、`wrangler.toml` の `database_id` を更新
- [ ] `wrangler d1 migrations apply ozu-road-report-db` — 本番 D1 に migration を適用（`--local` なし）
- [ ] `wrangler r2 bucket create ozu-road-report-images` — R2 バケットを作成
- [ ] `wrangler deploy` — Workers をデプロイし、デプロイ URL（`*.workers.dev` または カスタムドメイン）を確認

---

## 2. シークレット・環境変数の設定（本番）

Cloudflare Workers Secrets に以下を登録する（`wrangler secret put <KEY>` または Cloudflare Dashboard）。

- [ ] `LINE_CHANNEL_SECRET` — LINE チャンネルシークレット
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` — LINE チャンネルアクセストークン
- [ ] `ADMIN_USERNAME` — 管理画面ユーザー名
- [ ] `ADMIN_PASSWORD_HASH` — パスワードの SHA-256 hex（`echo -n "password" | sha256sum`）
- [ ] `ADMIN_SESSION_SECRET` — セッション Cookie 署名用シークレット（`openssl rand -hex 32`）
- [ ] `LINE_ADMIN_USER_ID`（任意）— 管理者通知用の LINE ユーザー ID

`.dev.vars` の値を本番に流用しないこと。本番用に新しいシークレットを生成すること。

---

## 3. LINE チャンネル設定

- [ ] LINE Developers Console でチャンネルを開き、Webhook URL を `https://<your-domain>/webhook` に設定
- [ ] 「Webhook の利用」を **オン** に設定
- [ ] 「Verify」ボタンで Webhook 疎通確認（HTTP 200 が返ること）
- [ ] 「自動応答メッセージ」を **オフ** に設定（LINE 公式アカウントの自動返信と競合しないよう）
- [ ] チャンネルアクセストークン（長期）を発行・更新し、Secrets に反映

---

## 4. セキュリティ確認

- [ ] `.dev.vars` が git に含まれていないことを確認（`git status` でトラッキングされていないこと）
  - 過去にコミットされた場合は `git rm --cached .dev.vars` でトラッキング解除・再コミット
- [ ] `git log --oneline --all | head -20` で `.dev.vars` のコミット履歴がないことを確認
- [ ] 管理画面（`/admin/login`）に不正なパスワードでアクセスできないことを確認
- [ ] HTTPS でのみアクセスできることを確認（Cloudflare Workers はデフォルト HTTPS）
- [ ] 本番 R2 バケットに公開アクセス設定がないことを確認（ダウンロードは管理画面経由のみ）

---

## 6. 動作確認（本番環境）

### LINE 会話フロー

- [ ] LINE 公式アカウントに「通報する」と送信 → 利用同意メッセージが届く
- [ ] 「同意する」→ 近景写真の案内が届く
- [ ] 近景写真を送信 → 遠景写真の案内が届く、R2 に保存される
- [ ] 遠景写真を送信 → 位置情報の案内が届く（Quick Reply ボタン付き）
- [ ] 位置情報を送信 → 撮影日付の案内が届く
- [ ] 各任意項目をスキップしながら確認画面まで進む
- [ ] 「送信する」→ 受付番号が含まれた完了メッセージが届く
- [ ] （`LINE_ADMIN_USER_ID` 設定時）管理者 LINE に通知が届く

### 管理画面

- [ ] `/admin/login` にアクセスしてログインできる
- [ ] 通報一覧に LINE フローで作成した通報が表示される
- [ ] ステータス変更が反映される
- [ ] CSV 出力ができる（UTF-8 BOM、Excel で開けることを確認）
- [ ] 写真ダウンロードができる
- [ ] 通報削除が機能する（R2 画像も削除される）

---

## 7. テスト最終確認

- [ ] `npm test` がすべてパスすること（194 件以上）
- [ ] `npm run lint` （または `npx eslint .`）でエラーがないこと

---

## 8. wrangler.toml 最終確認

- [ ] `database_id` が本番 D1 の実際の ID になっている（ダミー UUID でないこと）
- [ ] `[env.production]` セクションに本番固有の設定があれば追記済み
- [ ] staging / production 環境を分けて使う場合は `wrangler deploy --env production` を使用

---

## 9. 受け入れ確認・引き渡し

- [ ] 大洲市担当者が管理画面にアクセスできることを確認
- [ ] 管理画面の操作マニュアル（一覧・詳細・ステータス変更・CSV・削除）を共有
- [ ] 管理画面パスワードを担当者に安全な方法で共有（メール平文不可）
- [ ] 障害時の連絡先・対応フローを確認

---

## 補足: 本番デプロイコマンド例

```bash
# D1 本番 migration 適用
npx wrangler d1 migrations apply ozu-road-report-db

# Secrets の登録
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SESSION_SECRET
# LINE_ADMIN_USER_ID は任意
# npx wrangler secret put LINE_ADMIN_USER_ID

# Workers のデプロイ
npx wrangler deploy
```
