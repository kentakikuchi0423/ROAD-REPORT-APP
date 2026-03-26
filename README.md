# 大洲市道路破損通報アプリ

愛媛県大洲市の道路の破損を、LINE チャット上で通報できるシステムです。

- LINE Messaging API でチャット完結
- Cloudflare Workers / D1 / R2 で動作
- 管理者向け Web 管理画面あり

---

## ローカル開発の手順

### 前提

- Node.js 22 以上
- npm / pnpm（`pnpm@9` 推奨）
- wrangler（`devDependencies` に含まれているため `npx wrangler` で使用可）

### 1. 依存パッケージのインストール

```bash
npm install
# または
pnpm install
```

### 2. 環境変数の設定

`.dev.vars.example` をコピーして `.dev.vars` を作成し、実際の値を記入します。

```bash
cp .dev.vars.example .dev.vars
# .dev.vars を編集して実際の値を設定する
```

`.dev.vars` は `wrangler dev` 実行時に自動で読み込まれます。
**`.dev.vars` は `.gitignore` に含まれており、コミットしないでください。**

#### 環境変数一覧

| 変数名 | 必須 | 説明 |
|---|---|---|
| `LINE_CHANNEL_SECRET` | ✅ | LINE Developers のチャンネルシークレット（Webhook 署名検証） |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE チャンネルアクセストークン（メッセージ送信・画像取得） |
| `LINE_ADMIN_USER_ID` | 任意 | 管理者の LINE ユーザー ID。設定すると新規通報時に LINE プッシュ通知を送信 |
| `ADMIN_USERNAME` | ✅ | 管理画面のログインユーザー名 |
| `ADMIN_PASSWORD_HASH` | ✅ | 管理画面パスワードの SHA-256 hex |
| `ADMIN_SESSION_SECRET` | ✅ | セッション Cookie 署名用シークレット（64 文字以上を推奨） |

**パスワードハッシュの生成:**

```bash
echo -n "yourpassword" | sha256sum
```

**セッションシークレットの生成:**

```bash
openssl rand -hex 32
```

### 3. ローカル D1 migration の適用

初回および migration ファイルを追加した後に実行します。

```bash
npm run d1:migrate:local
# または
npx wrangler d1 migrations apply ozu-road-report-db --local
```

### 4. ダミーデータの投入（任意）

管理画面の動作確認に使うダミー通報データを追加できます。

```bash
npm run seed:local
```

実行するたびに**新しい通報 5 件**（ステータスが異なるもの）と**ダミー画像 10 枚**がローカル環境に追加されます。

#### ダミーデータの仕様

| 項目 | 内容 |
|---|---|
| 受付番号 | `OZU-{当日JST日付}-9XX`（900〜989 番台を連番採番） |
| ステータス | `pending` / `in_progress` / `resolved` / `rejected` の 4 種類 |
| 場所 | 大洲市内の各地区（大洲・長浜・肱川町・喜多町・冨士町） |
| 画像 | 120×80px の PNG（近景: 青灰色、遠景: 灰緑色） |

#### 繰り返し実行について

- **何度でも実行可能**：実行ごとに一意な受付番号・R2 キーを生成するため、UNIQUE 制約違反は発生しない
- **上限**：同日に 18 回（90 件）実行すると採番枠が尽きてエラーになる → 翌日に実行するか DB をリセットする
- **本番への影響なし**：すべての wrangler コマンドに `--local` を付与しているため、本番環境には書き込まない

#### ローカル DB をリセットしたい場合

```bash
# SQLite ファイルを削除
rm .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite*

# migration を再適用
npm run d1:migrate:local

# 必要に応じてダミーデータを再投入
npm run seed:local
```

### 5. 開発サーバーの起動

```bash
npm run dev
# または
npx wrangler dev
```

起動後、以下の URL を確認してください。

| URL | 内容 |
|---|---|
| http://localhost:8787/ | トップページ（URL 一覧） |
| http://localhost:8787/healthz | ヘルスチェック（JSON） |
| http://localhost:8787/privacy | プライバシーポリシー |
| http://localhost:8787/admin/login | 管理画面ログイン |
| http://localhost:8787/admin/reports | 通報一覧（ログイン後） |

---

## どこまでローカルで確認できるか

| 機能 | ローカル確認 | 備考 |
|---|---|---|
| トップページ・プライバシーポリシー | ✅ 可能 | |
| 管理画面（ログイン・一覧・詳細） | ✅ 可能 | D1 migration 適用済みが前提 |
| LINE Webhook の受信 | ❌ 不可 | LINE プラットフォームへの URL 登録が必要 |
| 画像の R2 保存 | ✅ ローカル R2 で可能 | wrangler dev 起動時にローカル R2 エミュレートあり |
| 本番 D1 / R2 の参照 | ❌ 不可 | `--remote` フラグ + Cloudflare 認証が必要 |

---

## テストの実行

```bash
npm test
```

テストファイルの構成:

| ファイル | 内容 |
|---|---|
| `tests/lib/db.test.ts` | D1 ヘルパー関数（insertReport / getReports 等） |
| `tests/lib/line.test.ts` | LINE API ラッパー（verifySignature / replyMessage 等） |
| `tests/lib/validation.test.ts` | 入力値バリデーション関数 |
| `tests/lib/notification.test.ts` | 管理者通知（LINE Push / NullNotifier） |
| `tests/lib/auth.test.ts` | 認証ユーティリティ（パスワード検証・セッション Cookie） |
| `tests/app/routing.test.ts` | エントリーポイントのルーティング・Webhook 署名検証 |
| `tests/app/conversation.test.ts` | 会話フロー全ステップ（consent → 完了） |
| `tests/app/admin.test.ts` | 管理画面 API（一覧・詳細・ステータス更新・CSV・削除） |

---

## wrangler.toml について

`database_id` はローカル開発用のダミー値 (`00000000-0000-0000-0000-000000000000`) が設定されています。
本番デプロイ前に `wrangler d1 create ozu-road-report-db` で取得した実際の ID に変更してください。

---

## セキュリティ注意事項

- `.dev.vars` に記載した値はコミットしないでください（`.gitignore` 設定済み）
- `ADMIN_PASSWORD_HASH` は `echo -n "yourpassword" | sha256sum` で生成した SHA-256 hex を使用
- `ADMIN_SESSION_SECRET` は `openssl rand -hex 32` で生成してください（64 文字以上を推奨）
- `LINE_ADMIN_USER_ID` は任意設定です。未設定でも通報フローは正常に動作します

---

## 本番デプロイについて

本番デプロイ前に `docs/checklist.md` のチェックリストを確認してください。
