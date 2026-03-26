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

`.env.example` をコピーして `.dev.vars` を作成し、実際の値を記入します。

```bash
cp .env.example .dev.vars
# .dev.vars を編集して実際の値を設定する
```

`.dev.vars` は `wrangler dev` 実行時に自動で読み込まれます。  
**`.dev.vars` は `.gitignore` に含まれており、コミットしないでください。**

### 3. ローカル D1 migration の適用

初回および migration ファイルを追加した後に実行します。

```bash
npm run d1:migrate:local
# または
npx wrangler d1 migrations apply ozu-road-report-db --local
```

### 4. 開発サーバーの起動

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

---

## wrangler.toml について

`database_id` はローカル開発用のダミー値 (`00000000-0000-0000-0000-000000000000`) が設定されています。  
本番デプロイ前に `wrangler d1 create ozu-road-report-db` で取得した実際の ID に変更してください。

---

## セキュリティ注意事項

- `.dev.vars` に記載した値はコミットしないでください（`.gitignore` 設定済み）
- `ADMIN_PASSWORD_HASH` は `echo -n "yourpassword" | sha256sum` で生成した SHA-256 hex を使用
- `ADMIN_SESSION_SECRET` は `openssl rand -hex 32` で生成してください
