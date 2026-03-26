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

- [x] 利用同意・プライバシーポリシー提示（Step 5e: 2026-03-26）
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

## Step 5e: 利用同意・位置情報 Quick Reply・任意入力 Quick Reply ✅

利用同意フロー・LINE Quick Reply による UX 改善を実装した（2026-03-26）。

- [x] consent ステップ実装（src/app/conversation.ts）
  - 「通報する」→ consent セッション作成 → 利用同意メッセージ（Quick Reply「同意する」付き）
  - 「同意する」→ close_photo ステップへ
  - 「キャンセル」→ deleteSession + キャンセルメッセージ
  - 「同意する」以外 → 再案内（Quick Reply「同意する」付き）
- [x] confirming ステップ「やり直す」→ consent ステップへ戻る（upsertSession でリセット）
- [x] 位置情報 Quick Reply 追加（QUICK_REPLY_LOCATION: type=location アクション）
  - far_photo → location 遷移メッセージ
  - location ステップの再案内メッセージ
- [x] スキップ Quick Reply 追加（QUICK_REPLY_SKIP: type=message アクション）
  - location → shooting_date 遷移メッセージ
  - shooting_date / remarks / reporter_name / reporter_phone のエラー・再案内メッセージ
- [x] 確認 Quick Reply 追加（QUICK_REPLY_CONFIRMING: 「送信する」「やり直す」）
  - reporter_phone → confirming 遷移メッセージ（サマリー）
  - confirming ステップの再案内メッセージ
- [x] テスト更新（tests/app/conversation.test.ts: +4 テスト、計 42 テスト）
  - consent ステップ専用テスト追加
  - 「通報する」→ step: "consent" チェックに変更
  - 「やり直す」→ upsertSession（consent）チェックに変更
  - Quick Reply の存在確認をテストに追加

### 採用判断メモ

- consent ステップで「通報する」→ 同意確認 → close_photo という流れで CLAUDE.md の「利用同意を取得する」方針を満たす
- LINE Quick Reply の `type: "location"` アクションを使用してネイティブの位置情報ピッカーを起動
- 「やり直す」はセッション削除ではなく upsertSession で consent にリセット（再度「通報する」不要）
- プライバシーポリシー URL は本番ドメイン確定後に追記予定（現在は同意メッセージに概要を記載）

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

通報完了フローを完成させた（2026-03-26）。

- [x] 受付番号生成ロジック（OZU-YYYYMMDD-NNN 形式）→ Step 3 で実装（generateReceiptNumber / getNextDailySequence）
- [x] reports テーブルへの登録 → Step 5d で実装（insertReport、UNIQUE制約リトライ付き）
- [x] 最終確認メッセージ（buildSummaryMessage）と受付完了メッセージ（buildCompletionMessage）→ Step 5d で実装
- [x] 二重送信ガード: 「送信する」受信後、先に session.step = "completed" に更新してから insertReport を呼ぶ
  - 並行リクエストが来ても "completed" ステップに分岐し、「受付済み」案内を返す
- [x] insertReport 失敗時のリカバリー: セッションを "confirming" に戻し、再送を促すエラーメッセージ（Quick Reply 付き）
- [x] "completed" ステップへのハンドリング追加（MSG_ALREADY_SUBMITTED）
- [x] テスト追加（tests/app/conversation.test.ts: +3 テスト、計 45 テスト）
  - 二重送信ガード（completed に更新してから insertReport）テスト
  - insertReport 失敗時リカバリーテスト
  - completed ステップへのメッセージ → 受付済み案内テスト

### 採用判断メモ

- 二重送信対策の方式: upsertSession(completed) → insertReport → deleteSession → replyMessage
  - completed に更新後に insertReport が失敗した場合: upsertSession(confirming) でリカバリー → エラーメッセージ
  - completed ステップのセッションは正常系ではほぼ瞬間的に deleteSession される
  - 異常終了時には completed セッションが残るが、その後のメッセージで「受付済み」案内が返る（ループにならない）

---

## Step 8: 管理画面実装

Cloudflare Workers 上に管理者向け Web UI を実装する（サーバーサイドレンダリング HTML）。

### Step 8a: 管理画面基本実装 ✅（2026-03-26）

- [x] DB ヘルパー追加（getReports / getReportById / updateReportStatus）（src/lib/db.ts）
- [x] 管理画面ルートハンドラ実装（src/app/admin/index.ts）
- [x] HTML ビュー関数実装（src/app/admin/views.ts）
- [x] 管理トップページ（GET /admin）
- [x] 通報一覧ページ（GET /admin/reports）— ページネーション・ステータスフィルタ付き
- [x] 通報詳細ページ（GET /admin/reports/:id）— 全フィールド表示・Google Maps リンク・写真プレースホルダ
- [x] ステータス更新 API（PATCH /admin/reports/:id/status）— JSON API、詳細ページから fetch 呼び出し

### 採用判断メモ

- HTML テンプレートを `views.ts` に分離（routing 関心と表示関心を分けて保守性向上）
- ステータス更新は PATCH + fetch（JavaScript 最小限、ページリロードで反映）
- 写真は R2 署名付き URL 未実装のためプレースホルダ表示（R2 キーのみ表示）
- XSS 対策: ユーザー入力フィールドはすべて `escapeHtml()` でエスケープ
- 日時表示: `Intl.DateTimeFormat` で JST 変換（arithmetic 不要）
- ページサイズ: 20 件（自治体用途として十分）

### Step 8c: 管理画面 UI 改善 ✅（2026-03-26）

- [x] バグ修正: 一覧テーブルの空データ行の colspan を 7 → 6 に修正
- [x] 一覧: 受付番号リンクと「詳細」リンクの重複を解消（受付番号のみリンク化）
- [x] 一覧: 「操作」列 → 「ステータス変更」列（インライン select + 更新ボタン）に変更
  - 更新成功時: バッジ即時更新 + ボタンを一時的に「✓」表示（リロードなし）
- [x] 詳細: ステータス更新フォームを「基本情報」直後に移動（スクロール不要）
- [x] 詳細: 更新成功時に「✓ 更新しました」メッセージを 3 秒表示（リロードなし・バッジ即時更新）
- [x] 詳細: 撮影日付を「位置情報」セクションから「補足・通報者情報」セクションへ移動
- [x] テスト全通過: 142 件（変更なし）

### Step 8b: 管理画面テスト追加 ✅（2026-03-26）

- [x] tests/app/admin.test.ts 新規作成（24 テスト）
  - GET /admin トップページ（HTML・タイトル確認）
  - GET /admin/reports 一覧（getReports 呼び出し・ステータスフィルタ・ページネーション・不正値）
  - GET /admin/reports/:id 詳細（正常・404・不正ID）
  - PATCH /admin/reports/:id/status 更新（全4ステータス・404・不正JSON・不正ステータス）
  - 不明ルート 404
- [x] tests/lib/db.test.ts に管理画面 DB 関数テストを追記（+9 テスト、計 21 テスト）
  - getReports: フィルタなし・フィルタあり・0件・camelCase変換
  - getReportById: 存在あり・存在なし
  - updateReportStatus: 更新成功・対象なし・SQL 引数確認
- [x] テスト全通過: 142 件（+33 件）

### 残課題

- [ ] 署名付き URL による写真表示（Step 6 / Step 9 で対応）
- [ ] 認証（Step 9 で対応）
- [ ] CSV 出力（後続 Step）
- [ ] 写真ダウンロード・削除（後続 Step）

---

## Step 9: 認証・セキュリティ実装 ✅（2026-03-26）

管理画面の認証と全体のセキュリティ強化を行った。

- [x] 管理画面認証実装（ログインフォーム + 署名付き Cookie セッション）
- [x] 個人情報ログ抑制確認（webhook.ts・conversation.ts ともに問題なし）
- [ ] Webhook 署名検証の堅牢化（現状で十分・後続 Step で検討）
- [ ] プライバシーポリシーページ作成（src/app/privacy.ts に雛形あり）

### 実施内容（2026-03-26）

- [x] `src/app/admin/auth.ts` 新規作成
  - `verifyPassword`: SHA-256 hex で定数時間比較（Web Crypto API）
  - `createSessionToken` / `verifySessionToken`: HMAC-SHA256 署名付き Cookie（8時間有効）
  - `requireAuth`: 認証ミドルウェア（未ログイン → /admin/login リダイレクト）
  - `buildSessionCookieHeader` / `buildLogoutCookieHeader`: Set-Cookie ヘルパー
- [x] `src/types.ts`: `ADMIN_SESSION_SECRET` 追加、`ADMIN_PASSWORD_HASH` コメントを SHA-256 hex に修正
- [x] `src/app/admin/index.ts`: ログイン/ログアウトルート追加 + 全管理ルートに `requireAuth` 適用
- [x] `src/app/admin/views.ts`: `renderLoginPage` 追加、管理トップの未認証警告削除、ナビにログアウトボタン追加
- [x] `wrangler.toml`: `ADMIN_SESSION_SECRET` コメント追加
- [x] `tests/app/admin.test.ts`: 全テストを auth Cookie 付きリクエストに更新 + 認証フロー新テスト追加（33 テスト）
- [x] テスト全通過: 151 件（+9 件）

### 採用判断メモ

- セッションはステートレス（D1/KV 不使用）— HMAC-SHA256 署名 + 有効期限で改ざん検知
- パスワードは bcrypt 非対応（Cloudflare Workers）→ SHA-256 hex に変更
  - `ADMIN_PASSWORD_HASH` の生成: `echo -n "yourpassword" | sha256sum`
- `ADMIN_SESSION_SECRET` は Cloudflare Workers Secrets（本番）/ `.dev.vars`（開発）に設定
  - 生成例: `openssl rand -hex 32`
- ログイン失敗時は理由を返さない（ユーザー名・パスワードどちらが違うか不明にする）
- ユーザー名・パスワードはいかなるログにも出力しない（auth.ts コメントで明示）

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

---

## Step 9b: ローカル確認環境の整備 ✅（2026-03-26）

`npx wrangler dev` 後にブラウザで接続できない問題を解消した。

### 原因

- `/` に対するルートが未定義（404 を返すのみ）
- `wrangler.toml` の `database_id` が UUID 形式でなく起動エラーの原因になりえた
- `.dev.vars`（実際のシークレット値を含む）が `.gitignore` 未登録でコミット済みだった
- devcontainer 環境で `wrangler dev` が `127.0.0.1` のみにバインドし、ポートフォワーディングが通らなかった

### 実施内容

- [x] `src/app/index.ts`: `GET /` トップページ追加（URL 案内・主要リンク一覧）
- [x] `src/app/index.ts`: `GET /healthz` ヘルスチェックエンドポイント追加
- [x] `wrangler.toml`: `database_id` をダミー UUID に変更（ローカル開発用）
- [x] `wrangler.toml`: `[dev]` セクションに `ip = "0.0.0.0"` 追加（devcontainer ポートフォワーディング対応）
- [x] `.gitignore`: `.dev.vars` を追加（シークレット漏洩防止）
- [x] `.env.example`: ダミー値のみのテンプレートを作成
- [x] `package.json`: `d1:migrate:local` スクリプト追加
- [x] `README.md`: ローカル確認手順を新規作成

### セキュリティ注意

- `.dev.vars` がすでに git 管理下に入っている。シークレットのローテーションを検討すること
- `git rm --cached .dev.vars` を実行してトラッキングを解除し、再コミットが必要

### ローカル確認手順（概要）

```bash
npm run d1:migrate:local   # D1 migration 適用（初回・migration 追加時）
npm run dev                # 開発サーバー起動
# → http://localhost:8787/ を開く
```
