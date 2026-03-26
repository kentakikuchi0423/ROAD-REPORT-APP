# 実装進捗：大洲市道路破損通報アプリ

## Step 1: プロジェクト文脈整備 ✅

- [x] CLAUDE.md 確認（既存・内容完備）
- [x] .claude/settings.json 作成・更新
- [x] docs/requirements.md 作成
- [x] docs/progress.md 作成（本ファイル）

---

## Step 1b: 開発環境構築（devcontainer） ✅

TypeScript + Cloudflare Workers プロジェクトの再現性ある開発環境を定義する。

- [x] .devcontainer/devcontainer.json 作成（Node 22 LTS、pnpm latest、Wrangler グローバル、VS Code 拡張）
- [x] .editorconfig 作成（UTF-8、LF、インデント 2 スペース）
- [x] .gitignore 作成（node_modules、.wrangler、dist、.env を除外）
- [x] .env.example 作成（LINE API トークン、管理画面認証、Cloudflare 設定のテンプレート）

### 採用判断メモ

- Node 22 LTS（Active LTS、2027年4月まで）
- pnpm latest（corepack 経由。ホストの pnpm 10.x と揃えて lockfile フォーマット互換を保つ）
- Dockerfile 不要（mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm で十分）
- Wrangler はコンテナ起動後に `pnpm add -g wrangler` でグローバルインストール（Step 2 で devDependency にも追加予定）

---

## Step 2: プロジェクト初期化 ✅

TypeScript プロジェクトの雛形を作成し、Cloudflare Workers の基本構成を整える。

- [x] package.json・tsconfig.json 作成
- [x] wrangler.toml 作成（D1/R2/KV バインディングはコメントアウト済み）
- [x] ディレクトリ構成の確定（src/app, src/lib, tests）
- [x] ESLint（eslint.config.mjs）/ Prettier（.prettierrc）設定
- [x] vitest.config.ts 作成
- [x] src/types.ts（Env・Report・ConversationSession 型）
- [x] src/app/index.ts（Workers エントリーポイント・ルーティング）
- [x] src/app/webhook.ts（LINE Webhook ハンドラ・プレースホルダ）
- [x] src/app/admin/index.ts（管理画面ルートハンドラ・プレースホルダ）
- [x] src/app/privacy.ts（プライバシーポリシーページ）
- [x] src/lib/line.ts（LINE API ラッパー・プレースホルダ）
- [x] src/lib/db.ts（D1 ヘルパー・プレースホルダ）
- [x] src/lib/r2.ts（R2 ヘルパー・プレースホルダ）
- [x] tests/lib/db.test.ts（テストプレースホルダ）
- [x] tests/lib/line.test.ts（テストプレースホルダ）
- [x] tests/app/routing.test.ts（テストプレースホルダ）

### 採用判断メモ

- ESLint flat config（eslint.config.mjs）: ESLint v9 以降の推奨形式
- vitest + node 環境: Workers 固有 API のテストは Step 4 以降で `@cloudflare/vitest-pool-workers` に切り替えを検討
- プライバシーポリシー: Workers から直接 HTML を返す形式（LIFF 不使用のため）
- wrangler.toml の D1/R2/KV: 各 Step での `wrangler` コマンド実行後にコメントを解除する

---

## Step 2b: npm audit 対応 ✅

依存パッケージの脆弱性を修正した（2026-03-25）。

- [x] `wrangler` を `^3.0.0` → `^4.0.0` へアップグレード
  - 解決: `undici ≤6.23.0` (high) via miniflare / `esbuild ≤0.24.2` (moderate) via wrangler 自身
  - 解決後: wrangler@4.77.0 → esbuild@0.27.3 / miniflare@4.x → undici@7.24.4
- [x] `vitest` を `^2.0.0` → `^3.0.0` へアップグレード（vite がピア依存に変更）
- [x] `vite` を `^6.2.0` で devDependencies に明示追加
  - 解決: `vite 0.11.0–6.1.6` / `esbuild ≤0.24.2` (moderate) via vitest チェーン
  - 解決後: vite@6.4.1 → esbuild@0.25.12
- [x] `npm audit` 結果: **0 vulnerabilities**
- [x] `npm test` 結果: 正常通過（todo スキップ含む）

---

## Step 3: DB 設計 ✅

Cloudflare D1 のスキーマ定義・会話状態モデル・受付番号生成・バリデーション関数を実装した（2026-03-25）。

- [x] reports テーブル設計（migrations/0001_initial.sql）
- [x] sessions テーブル設計（会話状態管理、migrations/0001_initial.sql）
- [x] マイグレーションファイル作成
- [x] D1 バインディング設定（wrangler.toml のコメント解除、database_id は要設定）
- [x] 受付番号型と生成方針の整理（generateReceiptNumber / getNextDailySequence）
- [x] 会話状態 ConversationStep 更新（cancelled 追加）
- [x] バリデーションスキーマ作成（src/lib/validation.ts）
- [x] DB helper 関数実装（insertReport / getSession / upsertSession / deleteSession）
- [x] テスト追加（tests/lib/db.test.ts / tests/lib/validation.test.ts）

### 採用判断メモ

- sessions テーブルの PK を line_user_id にして「1ユーザー = 1セッション」を DB 制約で保証
- セッション UPSERT で上書き・完了/キャンセル時は行削除。TTL は Step 5 で Cron Trigger 検討
- KV ネームスペースによるセッション管理は不採用 → D1 に統一
- 受付番号の連番競合は UNIQUE 制約 + アプリ層リトライ（最大 3 回）で対処
- バリデーションは Zod 不使用（バンドルサイズ）。型ガード + 軽量ヘルパー関数で実装
- confirming ステップは往復あり（ユーザーが「送信する / やり直す」を選択）。「やり直す」は consent ステップへ戻る
- locationAddress（LINE 位置情報の住所テキスト）を Report / ConversationSession.data に追加（requirements.md 4-1 より）

### Step 3 レビュー対応（2026-03-25）

- 必須フィールド（close_photo_key / far_photo_key / latitude / longitude）を DB・TypeScript ともに NOT NULL 化
  - 画像は会話中に R2 へ保存するため、insertReport 呼び出し時点で必ず値が存在する
- 任意フィールド（shooting_date / remarks / reporter_name / reporter_phone）は nullable のまま維持
- 受付番号の日付基準を UTC → JST（UTC+9）に変更
  - 管理者運用日と受付番号日付のズレを防ぐ
- idx_reports_receipt_number インデックスを削除（UNIQUE 制約が暗黙的に B-tree を生成するため重複）
- tests/lib/db.test.ts に JST 境界値テストケースを追加

---

## Step 4: LINE Webhook 基盤実装 ✅

LINE Messaging API の Webhook エンドポイントを実装した（2026-03-25）。

- [x] Webhook エンドポイント実装（src/app/webhook.ts）
- [x] 署名検証実装（Web Crypto API / HMAC-SHA-256 / 定数時間比較）
- [x] メッセージ受信・ルーティング基盤（text / image / location / follow / unfollow）
- [x] LINE Reply API 呼び出しラッパー（src/lib/line.ts）
- [x] LINE Content API ラッパー（getMessageContent、Step 6 で使用予定）
- [x] テスト追加（tests/lib/line.test.ts / tests/app/routing.test.ts）

### 採用判断メモ

- 署名検証は SDK の `validateSignature` を使わず Web Crypto API で直接実装
  - Node.js crypto 依存を Workers のコアパスに持ち込まない
  - `crypto.subtle` は Workers ランタイムで安定した組み込み API
  - 定数時間比較（XOR 畳み込み）でタイミング攻撃を防ぐ
- 署名不正・ヘッダーなし → 401（LINE 由来でないリクエストを明確に拒否）
- 処理エラー → 200（LINE の再送ループ防止）
- ログ方針: イベントタイプ・webhookEventId は出力。lineUserId・本文・位置情報は出力しない
- スタブハンドラは固定テキストを返信（LINE から疎通確認できる状態）
- `no-console` lint 警告はログ出力の意図に基づき警告のまま（errors は 0）

---

## Step 5: 会話フロー実装

会話状態の管理ロジックと入力収集フローを実装する。

- [ ] 利用同意・プライバシーポリシー提示（後のStep）
- [x] 近景写真受付（Step 5a: 2026-03-25）
- [x] 遠景写真受付（Step 5a: 2026-03-25）
- [x] 位置情報受付（Step 5b: 2026-03-25）
- [x] 任意情報入力（撮影日付・補足・氏名・電話番号）（Step 5c: 2026-03-25）
- [x] 画像以外が来た場合の再案内メッセージ

---

## Step 5a: 近景・遠景写真回収フロー ✅

近景→遠景写真の収集、R2 即時保存、セッション管理を実装した（2026-03-25）。

- [x] 会話フロー State Machine 作成（src/app/conversation.ts）
  - セッションなし + 「通報する」→ close_photo ステップ開始
  - close_photo: 画像受信 → LINE Content API → R2 保存 → far_photo へ
  - far_photo: 画像受信 → LINE Content API → R2 保存 → location へ（次 Step）
  - 画像以外（テキスト等）→ 再案内メッセージ
  - sticker 等未対応種別 → 返信なし
- [x] R2 uploadImage 実装（src/lib/r2.ts）
- [x] getMessageContent 返値に contentType 追加（src/lib/line.ts）
- [x] Env に IMAGES: R2Bucket 追加（src/types.ts）
- [x] ConversationSession.data を reportUuid / closePhotoKey / farPhotoKey に更新（src/types.ts）
- [x] wrangler.toml R2 バインディング有効化
- [x] webhook.ts スタブを conversation.ts に接続
- [x] テスト追加（tests/app/conversation.test.ts: 11 テスト）
- [x] テスト更新（tests/lib/line.test.ts / tests/app/routing.test.ts / tests/lib/db.test.ts）

### 採用判断メモ

- R2 キー形式: `reports/{YYYYMMDD}/{uuid}/{type}.jpg`（JST基準、lineUserId をキーに含めない）
- UUID は近景受信時に生成し、遠景は同一 UUID を流用（1通報 = 1ディレクトリ）
- 画像はリプライ前に即時 R2 保存（「できるだけ早く保存する」方針）
- 利用同意ステップは後のStep で実装（現時点は「通報する」テキストで直接 close_photo へ）

---

## Step 5b: 位置情報受付フロー ✅

位置情報メッセージの収集とセッション保存を実装した（2026-03-25）。

- [x] location ステップのハンドラ実装（src/app/conversation.ts）
  - 位置情報受信 → latitude / longitude / address をセッションに保存 → shooting_date ステップへ
  - address が null の場合は locationAddress を保存しない
  - 位置情報以外（テキスト・画像等）→ 再案内メッセージ
- [x] テスト追加（tests/app/conversation.test.ts: +4 テスト、計 15 テスト）

### 採用判断メモ

- LINE 位置情報の address フィールドは null になる場合がある（座標のみ選択時）→ 存在する場合のみ保存
- shooting_date ステップへの遷移メッセージは任意・スキップ可の説明を含む

---

## Step 5c: 任意情報入力フロー ✅

shooting_date / remarks / reporter_name / reporter_phone の 4 ステップを実装した（2026-03-25）。

- [x] handleOptionalTextStep 共通ヘルパー実装（src/app/conversation.ts）
  - テキスト以外 → MSG_RETRY_TEXT_OR_SKIP 返信
  - 「スキップ」 → フィールド保存なし + 次ステップへ
  - 有効なテキスト → バリデーション通過 + 保存 + 次ステップへ
  - バリデーション失敗 → エラーメッセージ返信（セッション更新なし）
- [x] shooting_date ステップ（validateShootingDate / → remarks）
- [x] remarks ステップ（validateRemarks / → reporter_name）
- [x] reporter_name ステップ（validateReporterName / → reporter_phone）
- [x] reporter_phone ステップ（validateReporterPhone / → confirming）
- [x] テスト追加（tests/app/conversation.test.ts: +16 テスト、計 31 テスト）

### 採用判断メモ

- 4 ステップは同一パターンなので `handleOptionalTextStep` に共通化（コード重複を回避）
- テストは `testOptionalStep` ヘルパー関数でパターンを共有（4 ステップ × 4 ケース = 16 テスト）
- バリデーション関数は既存の `src/lib/validation.ts` を再利用
- confirming ステップのメッセージ（MSG_REQUEST_CONFIRMING）は仮定義。次 Step で確認フロー実装時に詳細を追加

---

## Step 5d: 確認・送信フロー ✅

confirming ステップ（「送信する」/「やり直す」）と受付番号発行を実装した（2026-03-25）。

- [x] handleConfirmingStep 実装（src/app/conversation.ts）
  - 「送信する」→ 必須フィールド確認 → insertReport → deleteSession → 受付番号を含む完了メッセージ
  - 「やり直す」→ deleteSession → 再開案内メッセージ
  - その他テキスト・画像等 → 「送信する / やり直す」案内（セッション変更なし）
  - 必須フィールド欠損時 → deleteSession + エラーメッセージ（insertReport 呼ばず）
- [x] buildSummaryMessage 実装（reporter_phone → confirming 遷移時に入力内容サマリーを表示）
- [x] buildCompletionMessage 実装（受付番号を含む完了メッセージ）
- [x] handleOptionalTextStep の nextMsg を string | 関数 に拡張（サマリー動的生成のため）
- [x] テスト追加（tests/app/conversation.test.ts: +7 テスト、計 38 テスト）

### 採用判断メモ

- 「やり直す」はセッション削除のみ（consent ステップ未実装のため「通報する」で再開案内）
  - consent 実装時は consent ステップへ戻す形に変更予定
- 必須フィールド欠損はあり得ないケースだが、防御的チェックとしてセッション削除 + エラーメッセージを返す
- サマリーは buildSummaryMessage で生成（reporter_phone の nextMsg に関数を渡す形で統一）
- insertReport は既存の D1 ヘルパー（UNIQUE制約リトライ付き）を使用

---

## Step 6: 画像・位置情報処理

受信した写真・位置情報を R2 に保存する処理を実装する。

- [x] 画像ファイル受信・R2 保存（Step 5a で実装済み）
- [x] R2 バインディング設定（Step 5a で実装済み）
- [x] 位置情報のパース・保存（Step 5b で実装済み）
- [ ] 署名付き URL 生成（管理画面実装時）

---

## Step 7: 受付番号発行・通報完了処理 ✅

通報完了時の受付番号発行と D1 への保存処理を実装した（Step 3 / Step 5d で実装済み）。

- [x] 受付番号生成ロジック（OZU-YYYYMMDD-NNN 形式）→ Step 3 で実装（generateReceiptNumber / getNextDailySequence）
- [x] reports テーブルへの登録 → Step 5d で実装（insertReport、UNIQUE制約リトライ付き）
- [x] 完了メッセージ返送 → Step 5d で実装（buildCompletionMessage）

---

## Step 8: 管理画面実装

Cloudflare Pages 上に管理者向け Web UI を実装する。

- [ ] 通報一覧画面
- [ ] 通報詳細画面
- [ ] ステータス変更機能
- [ ] CSV 出力機能
- [ ] 写真ダウンロード機能
- [ ] 通報削除機能

---

## Step 9: 認証・セキュリティ実装

管理画面の認証と全体のセキュリティ強化を行う。

- [ ] 管理画面認証実装
- [ ] Webhook 署名検証の堅牢化
- [ ] 個人情報ログ抑制確認
- [ ] プライバシーポリシーページ作成

---

## Step 10: テスト・品質保証

単体テスト・結合テストを実施し、品質を担保する。

- [ ] 会話フロー単体テスト
- [ ] Webhook 署名検証テスト
- [ ] 管理画面 E2E テスト
- [ ] エラーケーステスト

---

## Step 11: デプロイ・本番環境構築

Cloudflare へのデプロイと本番環境の設定を行う。

- [ ] D1 本番データベース作成
- [ ] R2 バケット作成
- [ ] Workers / Pages デプロイ
- [ ] 環境変数・シークレット設定
- [ ] LINE チャンネル本番設定
- [ ] 動作確認・受け入れテスト
