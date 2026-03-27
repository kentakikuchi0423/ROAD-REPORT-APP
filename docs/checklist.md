# 公開前チェックリスト

大洲市道路破損通報アプリを本番公開する前に確認する項目一覧です。

**実行順序の原則:** D1 作成 → migration → R2 作成 → secret 登録 → deploy → LINE 設定 → 動作確認

---

## 0. 事前確認（ローカル）

- [ ] `npm test` がすべてパスすること（213 件以上）
- [ ] `npx eslint .` でエラーがないこと
- [ ] `.dev.vars` が git に含まれていないことを確認（`git status` でトラッキングされていないこと）
- [ ] `git log --all -- .dev.vars` でコミット履歴がないことを確認

---

## 1. Wrangler ログイン

```bash
npx wrangler login
```

- [ ] Cloudflare アカウントへのログインが完了していること
- [ ] `npx wrangler whoami` でアカウントが表示されること

---

## 2. D1 データベース作成

```bash
npx wrangler d1 create ozu-road-report-db
```

出力例：
```
✅ Successfully created DB 'ozu-road-report-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

- [ ] コマンドを実行し、出力された `database_id` を `wrangler.toml` の該当箇所に上書きする
  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "ozu-road-report-db"
  database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← ここを実際のIDに
  ```
- [ ] `wrangler.toml` をコミットする前に、ダミー UUID（`00000000-...`）が残っていないことを確認

---

## 3. D1 migration 適用（本番）

```bash
npx wrangler d1 migrations apply ozu-road-report-db --remote
```

（`--remote` フラグ必須。wrangler v4 はデフォルトがローカルのため省略すると本番に適用されない）

- [ ] コマンドが正常終了すること（エラーなし）
- [ ] 「Applied N migration(s)」と表示されること

---

## 4. R2 バケット作成

```bash
npx wrangler r2 bucket create ozu-road-report-images
```

- [ ] コマンドが正常終了すること
- [ ] `wrangler.toml` の `bucket_name = "ozu-road-report-images"` と一致していることを確認

---

## 5. シークレット登録（本番）

`.dev.vars` の値を **流用しないこと**。本番用に新しい値を生成して登録する。

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SESSION_SECRET
# LINE_ADMIN_USER_ID は任意（管理者 LINE 通知が不要なら登録しなくてよい）
# npx wrangler secret put LINE_ADMIN_USER_ID
```

各シークレットの値と生成方法：

| シークレット | 必須 | 値の取得・生成方法 |
|---|---|---|
| `LINE_CHANNEL_SECRET` | ✅ | LINE Developers Console → チャンネル設定 → チャンネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE Developers Console → Messaging API → 長期チャンネルアクセストークン → 発行 |
| `ADMIN_USERNAME` | ✅ | 管理画面に使う任意のユーザー名（例: `admin`） |
| `ADMIN_PASSWORD_HASH` | ✅ | `echo -n "本番用パスワード" \| sha256sum` で生成した SHA-256 hex |
| `ADMIN_SESSION_SECRET` | ✅ | `openssl rand -hex 32`（64 文字のランダム文字列） |
| `LINE_ADMIN_USER_ID` | 任意 | LINE Developers Console または LINE アプリ設定で確認 |

- [ ] `LINE_CHANNEL_SECRET` 登録
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` 登録
- [ ] `ADMIN_USERNAME` 登録
- [ ] `ADMIN_PASSWORD_HASH` 登録（本番用に新規生成したもの）
- [ ] `ADMIN_SESSION_SECRET` 登録（`openssl rand -hex 32` で新規生成）
- [ ] 登録後 `npx wrangler secret list` で 5 件（または 6 件）が表示されることを確認

---

## 6. Workers デプロイ

```bash
npx wrangler deploy
```

（`--env` フラグなし。top-level の `name = "ozu-road-report"` でデプロイされる）

- [ ] デプロイが正常終了すること
- [ ] 出力された URL（例: `https://ozu-road-report.<account>.workers.dev`）を控える
- [ ] その URL の `/healthz` にアクセスして `{"status":"ok"}` が返ること

> **なぜ `--env production` を使わないか:**
> `[env.production]` セクションはワーカー名が変わるだけで、D1/R2/シークレットの構成は
> top-level と変わらない。ステージング環境を別途用意する予定がないため、
> シンプルに top-level の設定をそのまま本番に使用する。

---

## 7. LINE チャンネル設定

- [ ] LINE Developers Console でチャンネルを開く
- [ ] Webhook URL を `https://<デプロイURL>/webhook` に設定
- [ ] 「Webhook の利用」を **オン** に設定
- [ ] 「Verify」ボタンで疎通確認（HTTP 200 が返ること）
- [ ] 「自動応答メッセージ」を **オフ** に設定（自動返信と競合しないよう）
- [ ] チャンネルアクセストークン（長期）を発行・Secrets に反映済みであることを確認

---

## 8. セキュリティ確認

- [ ] 本番 R2 バケットに公開アクセス設定がないことを確認（Cloudflare Dashboard → R2 → バケット設定）
- [ ] 管理画面（`https://<デプロイURL>/admin/login`）に不正なパスワードでログインできないことを確認
- [ ] Cloudflare Workers の HTTPS が有効であることを確認（`*.workers.dev` はデフォルト HTTPS）
- [ ] `wrangler secret list` でシークレット一覧に機密値の **平文が表示されないこと** を確認（値はマスクされるはず）

---

## 9. 動作確認（本番環境）

### LINE 会話フロー

- [ ] LINE 公式アカウントに「通報する」と送信 → 利用同意メッセージが届く
- [ ] 「同意する」→ 近景写真の案内が届く
- [ ] 近景写真を送信 → 遠景写真の案内が届く（R2 に保存されること）
- [ ] 遠景写真を送信 → 位置情報の案内が届く（Quick Reply ボタン付き）
- [ ] 位置情報を送信 → 撮影日付の案内が届く
- [ ] 各任意項目をスキップしながら確認画面まで進む
- [ ] 「送信する」→ 受付番号（`OZU-YYYYMMDD-NNN` 形式）が含まれた完了メッセージが届く
- [ ] （`LINE_ADMIN_USER_ID` 設定時）管理者 LINE に通知が届く

### 管理画面

- [ ] `https://<デプロイURL>/admin/login` にアクセスしてログインできる
- [ ] 通報一覧に LINE フローで作成した通報が表示される
- [ ] ステータス変更が反映される
- [ ] CSV 出力ができる（UTF-8 BOM、Excel で文字化けしないことを確認）
- [ ] 写真ダウンロードができる（近景・遠景ともに）
- [ ] 通報削除が機能する（R2 画像も削除されること）

---

## 10. 受け入れ確認・引き渡し

- [ ] 大洲市担当者が管理画面にアクセスできることを確認
- [ ] 管理画面の操作手順（一覧・詳細・ステータス変更・CSV・削除）を共有
- [ ] 管理画面パスワードを担当者に安全な方法で共有（メール平文不可）
- [ ] 障害時の連絡先・対応フローを確認

---

## 補足: 本番デプロイ手順まとめ

```bash
# 0. ログイン
npx wrangler login

# 1. D1 作成（出力された database_id を wrangler.toml に転記する）
npx wrangler d1 create ozu-road-report-db

# 2. wrangler.toml の database_id を実際の値に書き換える（手動）

# 3. D1 migration 適用（本番）
npx wrangler d1 migrations apply ozu-road-report-db --remote

# 4. R2 バケット作成
npx wrangler r2 bucket create ozu-road-report-images

# 5. シークレット登録（各コマンド実行後にプロンプトで値を入力）
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SESSION_SECRET
# npx wrangler secret put LINE_ADMIN_USER_ID  # 任意

# 6. Workers デプロイ
npx wrangler deploy

# 7. 動作確認（healthz）
curl https://ozu-road-report.<account>.workers.dev/healthz
```
