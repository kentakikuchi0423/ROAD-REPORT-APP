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

## Step 10a: CSV出力・画像ダウンロード・削除機能 ✅（2026-03-26）

管理画面の残機能（CSV・画像DL・削除）を実装した。

- [x] `src/lib/r2.ts`: `deleteImage` 関数追加
- [x] `src/lib/db.ts`: `getAllReports`（CSV用・ページネーションなし）/ `deleteReport` 関数追加
- [x] `src/app/admin/index.ts`: 3ルート追加 + CSV生成ヘルパー関数
  - `GET  /admin/reports/csv` — CSV出力（status フィルタ対応・UTF-8 BOM 付き・Excel 互換）
  - `GET  /admin/reports/:id/images/:type` — 写真ダウンロード（type: close|far）
  - `DELETE /admin/reports/:id` — 通報削除（R2画像 + DB行、全ルートに requireAuth 適用）
- [x] `src/app/admin/views.ts`: UI更新
  - 一覧フィルタフォームに「CSV出力」リンク追加（現在のステータスフィルタを引き継ぐ）
  - 詳細ページ写真セクション: プレースホルダ → ダウンロードリンク（`<a download>`）
  - 詳細ページ下部に「この通報を削除する」ボタン追加（確認ダイアログ + fetch DELETE）
- [x] `tests/app/admin.test.ts`: 14テスト追加（計 47テスト）
  - CSV: 200・BOMバイト確認・ヘッダー行・status フィルタ・未認証
  - 画像DL: close/far 正常・R2 null → 404・通報なし → 404・未認証
  - 削除: 302リダイレクト・deleteImage 両呼び出し確認・DB deleteReport 確認・404・未認証
- [x] テスト全通過: 165 件（+14 件）

### 採用判断メモ

- CSV の UTF-8 BOM: `\uFEFF` → UTF-8 では EF BB BF の 3 バイト。Excel で開いたとき文字化けしない
- CSV 列順: 受付番号・状態・受付日時・更新日時・住所・緯度・経度・撮影日付・補足事項・氏名・電話番号
- ステータスは日本語訳して出力（pending→受付済み など）
- `/admin/reports/csv` は `/admin/reports/:id` より先にルート判定（"csv" が parseInt で NaN になるため）
- 削除時に R2 失敗しても DB 削除は続行（孤立 R2 キーは許容。逆よりマシ）
- 削除確認は JavaScript `confirm()` ダイアログで実装（シンプル・追加ページ不要）

---

## Step 10c: 管理者通知・プライバシーポリシー整備 ✅（2026-03-26）

管理者 LINE 通知の実装、プライバシーポリシー本文の整備、利用同意フローの改善を行った。

### 管理者通知

- [x] `src/lib/notification.ts` 新規作成
  - `AdminNotifier` インターフェース（差し替え可能な抽象化）
  - `LineAdminNotifier`: LINE Push Message API による通知実装
  - `NullAdminNotifier`: `LINE_ADMIN_USER_ID` 未設定時の NULL 実装
  - `createAdminNotifier(env)`: ファクトリ関数（設定に応じて実装を選択）
- [x] `src/types.ts`: `LINE_ADMIN_USER_ID?: string` を Env に追加（任意）
- [x] `src/app/conversation.ts`: `handleConfirmingStep` の `insertReport` 成功後に通知呼び出し追加
  - 通知失敗は try-catch で吸収（エラーログのみ）→ 通報完了処理を妨げない
- [x] `wrangler.toml`: `LINE_ADMIN_USER_ID` の設定コメントを追加

### プライバシーポリシー本文整備

- [x] `src/app/privacy.ts`: プレースホルダを削除し、正式な本文に更新
  - 収集情報（LINE ユーザー ID の扱いを明記）
  - 利用目的
  - 第三者への提供
  - 保管・管理（Cloudflare 上での保管、管理者が削除するまで保持）
  - LINE サービス（LINE プライバシーポリシーへのリンク）
  - 開示・訂正・削除の請求
  - お問い合わせ先（大洲市役所）

### 利用同意フロー改善

- [x] `src/app/conversation.ts`: `MSG_REQUEST_CONSENT` 改善
  - LINE ユーザー ID の収集目的を明記
  - プライバシーポリシーの確認案内を追加
  - キャンセル方法の説明を追加
- [x] `QUICK_REPLY_CONSENT` に「キャンセル」ボタンを追加（テキスト入力なしでキャンセル可能に）

### テスト

- [x] `tests/app/conversation.test.ts`: notification モック追加（165 テスト全通過）

### 採用判断メモ

- `AdminNotifier` インターフェースで抽象化: 将来 Email・Slack 等に差し替える際、`notification.ts` の実装を追加するだけで対応可能
- 通知失敗は警告ログのみ: 通知は補助機能であり、通報完了メッセージの送信を妨げてはならない
- `LINE_ADMIN_USER_ID` は任意: 未設定の場合は NullAdminNotifier が何もしない（既存動作を変えない）
- プライバシーポリシー URL（`/privacy`）は本番ドメイン確定後に `MSG_REQUEST_CONSENT` へ追記予定（コード内 TODO コメントあり）

---

## Step 10: テスト・品質保証 ✅

単体テスト・結合テストを実施し、品質を担保する。

- [x] 会話フロー単体テスト
- [x] Webhook 署名検証テスト
- [x] 管理画面 E2E テスト
- [x] エラーケーステスト

---

## Step 10b: テスト整理・README整備・公開準備 ✅（2026-03-26）

テスト補完、README強化、環境変数整理、公開前チェックリストを整備した。

### テスト追加

- [x] `tests/lib/notification.test.ts` 新規作成（6 テスト）
  - `createAdminNotifier` — LINE Push API 呼び出し確認（エンドポイント・ヘッダー・本文）
  - `LINE_ADMIN_USER_ID` 未設定時の `NullAdminNotifier` 動作確認
  - `locationAddress` null 時の座標フォールバック確認
  - LINE API エラー時の例外 throw 確認
- [x] `tests/lib/auth.test.ts` 新規作成（21 テスト）
  - `verifyPassword`: 正解・不正解・空パスワード
  - `createSessionToken` / `verifySessionToken`: 正常・別シークレット・期限切れ・改ざん・形式不正
  - `getSessionCookieValue`: 単一・複数・Base64 値・null ヘッダー
  - `buildSessionCookieHeader` / `buildLogoutCookieHeader`: 属性確認
- [x] `tests/app/routing.test.ts`: `GET /` と `GET /healthz` テスト追加（+2 テスト、計 14 テスト）
- [x] テスト全通過: **194 件**（8 ファイル）

### README 整備

- [x] `README.md`: 環境変数テーブルを追加（全変数・必須/任意・説明）
  - `LINE_ADMIN_USER_ID`（任意）の説明追加
  - パスワードハッシュ・セッションシークレット生成コマンドを明示
- [x] `README.md`: テストファイル構成テーブルを追加（8 ファイル）
- [x] `README.md`: 本番デプロイへの `docs/checklist.md` 案内を追記

### 環境変数整理

- [x] `.dev.vars.example`: `LINE_ADMIN_USER_ID` をコメントアウト形式で追記（任意設定）

### 公開前チェックリスト

- [x] `docs/checklist.md` 新規作成
  - Cloudflare リソース作成（D1 / R2 / Workers デプロイ）
  - Secrets 登録手順（wrangler secret put コマンド例）
  - LINE チャンネル設定（Webhook URL・自動応答オフ）
  - セキュリティ確認（.dev.vars の git 除外・HTTPS・R2 非公開）
  - 本番動作確認（会話フロー全ステップ・管理画面全機能）
  - 受け入れ確認・引き渡し項目

### 採用判断メモ

- `notification.test.ts` と `auth.test.ts` は `tests/lib/` に配置（既存 `line.test.ts` / `validation.test.ts` と同じ粒度）
- auth テストで期限切れトークンは「手製トークン」方式（Date.now() - 1000 の有効期限を使用）— vi.useFakeTimers より実態に近い
- README のテストテーブルは全 8 ファイルの役割を一覧化し、初見の開発者が全体像を把握しやすくした

---

## Step 10d: UX改善・ブランディング修正・セキュリティ/保守性向上 ✅（2026-03-26）

写真入力 UX の改善・撮影日 datetime picker 導入・キャンセル導線追加・個人開発表記修正を実施した。

### 写真入力 UX 改善

- [x] `src/app/conversation.ts`: 近景・遠景写真の各プロンプトに `camera` / `cameraRoll` Quick Reply を追加
  - カメラ起動・アルバム選択を 1 タップで行えるようになった
  - エラー（写真以外が届いた場合）のリトライメッセージにも同 QR を追加

### 撮影日 datetime picker 導入

- [x] `src/app/conversation.ts`:
  - `buildShootingDateQuickReply()`: `datetimepicker` アクション（mode: date）+ スキップ + 中止 の QR を動的生成
  - `getTodayJst()`: JST 当日日付を "YYYY-MM-DD" で返すヘルパー（datetimepicker.max に使用）
  - `handleConversationPostback()`: postback イベントで日付を受け取り remarks ステップへ遷移する関数を export
- [x] `src/app/webhook.ts`:
  - `routeEvent()` に `case "postback":` を追加
  - `routePostbackEvent()` で userId を抽出し `handleConversationPostback()` へ委譲

### キャンセル導線追加

- [x] `src/app/conversation.ts`:
  - `CANCEL_TEXT = "通報を中止する"` を定数化
  - `QR_ITEM_CANCEL`: キャンセルボタン定義を共通化
  - `handleCancelIfRequested()`: テキスト「通報を中止する」を検出し即時キャンセルする共通ヘルパー
  - consent 以降の全ステップで即時キャンセル対応（確認ステップなし）
  - `QUICK_REPLY_SKIP_CANCEL`: スキップ + 中止ボタン（旧 QUICK_REPLY_SKIP を置き換え）
  - `QUICK_REPLY_CONFIRMING` に「通報を中止する」ボタンを追加

### 個人開発表記修正

- [x] `src/lib/branding.ts` 新規作成
  - `BRANDING` 定数: appName / developer / contactEmail / privacyPolicyUrl / disclaimer を 1 か所に集約
- [x] `src/app/conversation.ts`: BRANDING を参照して同意文・完了メッセージを更新
  - 完了メッセージの「大洲市へのお問い合わせ」→「アプリへのお問い合わせは {contactEmail}」
  - 同意文に disclaimer（非公式アプリ注意書き）を追加
- [x] `src/app/webhook.ts`: follow イベントの Welcome メッセージを更新（公式感を除去）
- [x] `src/app/privacy.ts`: 主体を「菊地けんた（個人）」に変更、連絡先を contactEmail に統一
- [x] `src/app/index.ts`: トップページに disclaimer + contactEmail を表示
- [x] `src/app/admin/views.ts`: 管理画面タイトル・フッタを BRANDING 参照に統一

### シークレット管理整備

- [x] `.dev.vars.example`: 本番環境では新しい値を生成すること、git add しないことの注意書きを追記
- [x] `git log --all -- .dev.vars` で .dev.vars がコミット履歴に存在しないことを確認済み

### テスト

- [x] `tests/app/conversation.test.ts`: キャンセルメッセージ文言の期待値を「中止しました」に更新
- [x] テスト全通過: **194 件**（変更後も同数）

### 採用判断メモ

- datetimepicker の max 値は実行時 JST 今日日付を動的生成（ハードコードしない）
- キャンセルは全ステップで確認なし即時キャンセル（確認ステップなし）
  - R2 保存済み写真は孤立オブジェクトとして残るが、容量的に軽微なため許容
- BRANDING 定数を 1 か所（src/lib/branding.ts）に集約し、全ファイルから import で参照
  - privacyPolicyUrl は TODO コメントで本番 URL 確定後に差し替えることを明記

---

## Step 11: デプロイ・本番環境構築 ✅

Cloudflare へのデプロイと本番環境の設定を行う。

- [x] D1 本番データベース作成
- [x] R2 バケット作成
- [x] Workers / Pages デプロイ
- [x] 環境変数・シークレット設定
- [x] LINE チャンネル本番設定
- [x] 動作確認・受け入れテスト

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

---

## Step 10e: UX/UI改善（誤タップ防止・管理画面モダン化・写真プレビュー） ✅（2026-03-26）

LINE キャンセル確認フロー・管理画面 UI 統一・写真プレビュー実装を行った。

### Step A: キャンセル確認フロー（誤タップ防止）

- [x] `src/types.ts`: `ConversationStep` に `"cancelling"` を追加
- [x] `src/types.ts`: `ConversationSession.data` に `previousStep?: ConversationStep` を追加
- [x] `src/app/conversation.ts`:
  - `enterCancellingStep()`: キャンセルボタン押下時に即キャンセルせず `cancelling` ステップへ遷移するヘルパーを追加
  - `handleCancelIfRequested()`: 即キャンセル → `enterCancellingStep()` 呼び出しに変更
  - `handleOptionalTextStep()` / `handleConfirmingStep()` のインラインキャンセル処理も `enterCancellingStep()` に統一
  - `handleCancellingStep()`: 「はい、中止します」→ deleteSession + キャンセルメッセージ / 「いいえ、続けます」→ previousStep に復帰
  - `getStepResumeMessage()`: ステップ別の再案内メッセージを返すヘルパー（close_photo ～ confirming の 8 ステップ対応）
  - `cancelling` ステップを switch 文に追加
- [x] `tests/app/conversation.test.ts`: cancelling ステップのテスト追加（+8 テスト、計 202 テスト）
  - 各ステップで「通報を中止する」→ cancelling 遷移（previousStep 保存）
  - 「はい、中止します」→ deleteSession
  - 「いいえ、続けます」→ previousStep 復帰 + 再案内 QR
  - その他・非テキスト → 確認 QR 再案内

### Step B: 管理画面 UI 改善

- [x] `src/app/admin/views.ts`:
  - CSS 変数 `--color-brand` / `--color-brand-dark` を導入し、重複カラーコード (`#2a6496`, `#1a4066`) を一元管理
  - ステータスバッジをインラインスタイルから CSS クラスベース（`.badge .badge--{status}`）に変更
    - `pending`: amber tint（背景薄黄・濃い文字・アンバー枠）→ 未対応で目立つ
    - `in_progress`: solid blue（ブランドカラー・白文字）→ 対応中で最も強調
    - `resolved`: solid green → 完了
    - `rejected`: solid gray → 対応不要（淡く目立たない）
  - 一覧テーブルの終了系ステータス（resolved / rejected）行に `.row--closed` クラスを付与 → 淡灰色で淡く表示
  - 詳細 `.section h2` に左ボーダー（`border-left: 3px solid var(--color-brand)`）追加 → セクション区切りを強調
  - `.danger-section h2` の左ボーダー色を赤に上書き
  - JS の `makeBadge` 関数を CSS クラス生成方式に変更（`STATUS_COLORS_JSON` → `STATUS_BADGE_CLASSES_JSON`）
  - 写真エリアを `.photo-placeholder`（dashed border）→ `.photo-card`（solid border, 画像プレビュー対応）に変更

### Step C: 写真プレビュー実装

- [x] `src/app/admin/index.ts`: `handleImageDownload` に `download: boolean` 引数を追加
  - `download=true` → `Content-Disposition: attachment`（ダウンロード）
  - `download=false`（デフォルト）→ `Content-Disposition: inline`（`<img>` タグ・新タブ表示対応）
  - `Cache-Control: private, max-age=300` を追加（管理者認証済み・5分キャッシュ）
  - ルートハンドラで `?dl` クエリパラメータを検出し `download` 引数に渡す
- [x] `src/app/admin/views.ts`: 詳細ページ写真セクションを更新
  - `<img src="...images/close">` でインラインプレビュー（height: 200px, object-fit: cover）
  - クリックで `target="_blank"` の新タブ原寸大表示
  - 「ダウンロード」リンクは `?dl=1` 付き URL + `download` 属性
- [x] `tests/app/admin.test.ts`: 画像エンドポイントのテスト更新（+1 テスト、計 203 テスト）
  - デフォルト（パラメータなし）→ `inline` を確認
  - `?dl=1` 付き → `attachment` を確認

### 採用判断メモ

- キャンセル確認の「いいえ、続けます」で使う再案内メッセージは `getStepResumeMessage()` に集約（switch + リトライメッセージ定数の再利用）
- consent ステップの「キャンセル」は即時キャンセルのまま維持（確認不要な導線）
- R2 の公開設定不要・署名 URL 不要：Workers が認証 Cookie 確認後 R2 からプロキシする設計を維持
- 写真プレビューはシンプルに `<img>` + 新タブリンクの組み合わせ（外部ライブラリ不使用・保守性優先）

---

## Step 10f: 管理画面セキュリティ・構成見直し ✅（2026-03-26）

管理者のみが URL を知る運用を前提に、公開側からの管理画面 URL 露出を排除し、
認証・API 認可・ルーティング方針を整理した。

### 実施内容

- [x] `src/app/admin/config.ts` 新規作成
  - `ADMIN_BASE_PATH = "/admin"` を一元管理（後から 1 箇所で変更可能）
  - segment 解析は 1 階層ベースパス前提の旨を TODO コメントで明記
- [x] `src/app/admin/auth.ts` 更新
  - `requireAuth` に `mode: "page" | "api" = "page"` パラメータを追加
    - `"page"` → 未認証時 302 リダイレクト（HTML ページ向け、現行維持）
    - `"api"` → 未認証時 401 JSON `{"error":"Unauthorized"}`（fetch API 向け）
  - Cookie の `Path` 属性を `ADMIN_BASE_PATH` 定数参照に変更
  - ログインリダイレクト先も定数参照に変更
- [x] `src/app/admin/index.ts` 更新
  - `PATCH` / `DELETE` メソッドの `requireAuth` 呼び出しを `mode: "api"` に変更
  - ログイン成功後のリダイレクト先: `/admin` → `/admin/reports`
  - `GET /admin` / `GET /admin/` の応答: ダッシュボード HTML → `/admin/reports` への 302 リダイレクト
  - `renderAdminTop` import を削除（関数廃止に対応）
  - logout リダイレクト先を定数参照に変更
- [x] `src/app/admin/views.ts` 更新
  - `renderAdminTop()` 関数を削除（`/admin` ダッシュボード廃止）
  - 全 `/admin/*` の URL を `ADMIN_BASE_PATH` 定数参照に変更
    - form action, href, fetch(), location.href すべて対応
- [x] `src/app/index.ts` 更新
  - `GET /` → `/admin/login` への 302 リダイレクトに変更（開発確認ページを廃止）
  - `renderTopPage()` 関数を削除
  - `ADMIN_BASE_PATH` を import し `pathname.startsWith()` で参照
- [x] `README.md` 更新
  - URL 表の公開向けから管理画面 URL を削除
  - 「管理画面（開発者向け）」小節を新設し、管理画面 URL と注意事項をそこに移動
- [x] `tests/app/admin.test.ts` 更新
  - ログイン後リダイレクト先: `/admin` → `/admin/reports` に更新
  - `GET /admin` のテスト: 200 HTML → 302 `/admin/reports` リダイレクトに変更
  - `DELETE /admin/reports/:id` 未認証テスト: 302 → 401 JSON に変更
  - `PATCH /admin/reports/:id/status` 未認証テストを新規追加（401 JSON）
- [x] `tests/app/routing.test.ts` 更新
  - `GET /` のテスト: 200 HTML → 302 `/admin/login` リダイレクトに変更
- [x] テスト結果: **202 件通過**（`conversation.test.ts` の 1 件は今回と無関係の既存バグ）

### 採用判断メモ

- 認証制御が主役: URL 秘匿は補助手段にすぎない。`requireAuth` による確実なブロックを優先
- ベースパス変更は 1 ファイル（`config.ts`）の `ADMIN_BASE_PATH` のみで対応可能
  - ただし 2 階層以上（`/admin/v2` 等）への変更は `admin/index.ts` の segment 解析も要更新
- PATCH/DELETE が 302 リダイレクトを返していた問題を修正
  - fetch() からのリクエストはリダイレクトに自動追従するが、意図しない動作を招く可能性があった
- `/admin` ダッシュボードを廃止し、ログイン後に `/admin/reports` へ直行させることで操作起点を明確化
- トップページ（`/`）をログイン画面リダイレクトにしたため、一般ユーザーが誤アクセスしてもログインフォームのみ表示される

---

## Step 11: 管理画面 UI 改善（複数ステータスフィルタ・モバイル対応）✅（2026-03-26）

パスワード変更機能は管理画面に設けず env var 管理を継続することを確認・整理。
その上でステータスフィルタの複数選択対応とモバイル対応を実装した。

### パスワード変更ページ — 実装しない（整合性確認）

- `ADMIN_PASSWORD_HASH` は引き続き env var（Wrangler secrets）で管理
- 管理画面からのパスワード変更ページ・D1 永続化は実装しない方針を確定
- 前セッションで検討のみ行い未実装だったため、コードへの影響なし

### ステータス複数選択フィルタ

- [x] `src/lib/db.ts`: `GetReportsOptions.status?: ReportStatus` → `statuses?: ReportStatus[]`
  - `getReports`: 空配列・未指定は全件。非空のとき `WHERE status IN (?, ...)` で絞り込み
  - `getAllReports`: 同様に引数を `statuses?: ReportStatus[]` に変更
- [x] `src/app/admin/index.ts`: `searchParams.get("status")` → `getAll("status").filter(isValidStatus)`
  - `handleReportList` / `handleCsvExport` 両方を配列ベースに変更
- [x] `src/app/admin/views.ts`: フィルタ UI を `<select>` → チェックボックス群に変更
  - ページネーションリンクに複数 `status=X&status=Y` パラメータを引き継ぐ
  - CSV 出力リンクも同様に複数パラメータ対応

### モバイル対応

- [x] `src/app/admin/views.ts` COMMON_CSS に以下を追加
  - `.table-wrap { overflow-x: auto }` でテーブルを横スクロール化（HTML も `<div class="table-wrap">` でラップ）
  - `.filter-checkboxes` スタイル追加（チェックボックスの横並び・折り返し）
  - `@media (max-width: 640px)` ブレークポイントで以下を切り替え:
    - `body` padding を 0.75rem に縮小
    - `dl` を 2カラム → 1カラム（詳細ページの定義リスト）
    - `.photo-grid` を 2カラム → 1カラム
    - `.site-header` に `flex-wrap: wrap`
    - ボタン・リンクの最小高さを 44px（タップターゲット基準）
    - フィルタフォームを縦並びに変更

### テスト更新

- [x] `tests/lib/db.test.ts`: `statuses: ["pending"]`（単一）・`statuses: ["pending", "in_progress"]`（複数）に更新
- [x] `tests/app/admin.test.ts`: 複数ステータスフィルタテストを追加・既存テストを配列ベースに更新
- [x] テスト結果: **204 件通過**（`conversation.test.ts` の 1 件は既存バグのまま）

### 採用判断メモ

- チェックボックスを採用: `<select multiple>` より直感的にタップ・クリックしやすく、モバイルでも操作しやすい
- テーブルは横スクロール化を選択: カード形式等への変換は実装コストが高く、既存の列構成を維持したまま対応できる横スクロールを優先
- `@media (max-width: 640px)` ブレークポイント: 一般的なスマートフォン（375px〜430px）をカバー

---

## Step 10f: Pre-production security check ✅（2026-03-26）

本番公開前のシークレット・環境変数・.gitignore の安全確認を実施した。

### 確認結果

| ファイル | 状態 |
|---|---|
| `.dev.vars` | `.gitignore` 除外済み、コミット履歴なし ✅ |
| `.env.example` | git 管理対象だがダミー値のみ ✅ |
| `.dev.vars.example` | git 管理対象だがプレースホルダのみ ✅ |
| `wrangler.toml` | シークレット値なし、`database_id` はダミー UUID ✅ |
| `src/` ソースコード | ハードコードされたシークレットなし ✅ |
| `docs/checklist.md` | `.dev.vars` 流用禁止の注意書きあり ✅ |

### 修正内容

- [x] `.gitignore`: `.dev.vars.*` を追加（`.dev.vars.backup` / `.dev.vars.prod` 等のバリアントも除外）

### 本番公開前に再生成必須のシークレット一覧

| シークレット | 再生成方法 |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE Developers Console → チャンネル設定 → 再発行 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → 長期トークン → 再発行 |
| `ADMIN_PASSWORD_HASH` | 本番用パスワード決定後 `echo -n "newpass" \| sha256sum` |
| `ADMIN_SESSION_SECRET` | `openssl rand -hex 32`（64 文字以上） |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → API Tokens → 現トークン無効化 → 新規発行 |

### 指摘事項（次フェーズで対応）

- `.env.example` は `ADMIN_SESSION_SECRET` が欠落、`.dev.vars.example` との二重管理で混乱の元
  → `.env.example` のヘッダーに「wrangler 用は `.dev.vars.example` を参照」の注記追加を推奨

### 採用判断メモ

- `.dev.vars` は開発用として実際の値が設定されているが、git 未追跡のため漏洩リスクなし
- ただし上記 5 シークレットは本番環境に同じ値を使用してはならない（`wrangler secret put` で別途登録）
- `CLOUDFLARE_API_TOKEN` は Workers 本番環境では不要（wrangler CLI 認証用のローカル専用）

---

## Step 12: 本番前最終整備 ✅

保守性・セキュリティ・コード統一性の向上を目的とした最終整備。

### 実施内容

- [x] `src/lib/constants.ts` 新規作成：`STATUS_LABELS` / `STATUS_BADGE_CLASSES` / `VALID_STATUSES` を一元管理
- [x] `src/app/admin/index.ts`：`STATUS_LABELS_CSV` / `VALID_STATUSES` を constants から参照に変更
- [x] `src/app/admin/views.ts`：ローカル定義の重複ラベル（`STATUS_LABELS`・`allStatusLabels`・`STATUS_BADGE_CLASSES`）を削除し constants から参照。ステータス select の選択肢を動的生成に変更
- [x] 認証ルート網羅確認：全 `/admin/*` ルートで `requireAuth` が適用されていることを確認（追加修正なし）
- [x] `src/app/index.ts`：トップページを `/admin/login` リダイレクトから LINE サービス案内 HTML（200）に変更し管理画面URL露出を排除
- [x] `src/app/conversation.ts`：consent ステップの「キャンセル」QR を「通報を中止する」に統一（他ステップと表記を揃える）
- [x] `src/app/admin/views.ts`：詳細ページ写真セクションに lightbox（CSS モーダル）と `onerror` エラーフォールバックを追加
- [x] `src/lib/branding.ts`：BRANDING 参照が適切であることを確認（追加修正なし）
- [x] `src/app/privacy.ts`：削除（`/privacy` ルートを廃止）。`src/app/index.ts` のインポート・ルートハンドラ・トップページリンクも合わせて削除。`tests/app/routing.test.ts` / `README.md` も追従更新
- [x] テスト更新（205件全通過）：consent「キャンセル」→「通報を中止する」、`お名前：匿名`→`お名前：未入力`、`GET /` 期待値変更、`/privacy` → 404 に更新

### 変更ファイル

| ファイル | 種別 |
|---|---|
| `src/lib/constants.ts` | 新規作成 |
| `src/app/admin/index.ts` | 更新 |
| `src/app/admin/views.ts` | 更新 |
| `src/app/index.ts` | 更新 |
| `src/app/conversation.ts` | 更新 |
| `tests/app/conversation.test.ts` | 更新 |
| `tests/app/routing.test.ts` | 更新 |

### テスト結果

- 205 tests passed（0 failed）
- `npx tsc --noEmit` の既存型エラー（tests/ 内の `as` キャストと `undefined` 参照）は変更前から存在し今回の変更では未修正

### 次のステップ

本番環境デプロイ（Step 11 本体：`wrangler deploy` / D1 migration / R2 bucket 作成 / シークレット登録）

---

## Step 13: 本番 Cloudflare 設定・デプロイドキュメント整備 ✅（2026-03-27）

コードを変更せず、設定・docs・checklist を本番デプロイ向けに整理した。

### 実施内容

- [x] `wrangler.toml` に本番デプロイ方針コメントを追記
  - デプロイ順序（D1 作成 → migration → R2 → secret → deploy）をファイル内に明記
  - `database_id` の上書き必須であることを強調
  - `[env.production]` / `[env.staging]` に「現時点未使用・将来拡張用」を明記
  - named env での `[[d1_databases]]` 再宣言が必要な旨をコメントに追記
- [x] `docs/checklist.md` を全面刷新
  - セクション番号欠番（4→6）を修正し 0〜10 の連番に統一
  - 実行順序を明確化：`wrangler login` → D1 作成 → migration → R2 → secret put → deploy
  - D1 作成後に `wrangler.toml` の `database_id` を手動で書き換えるステップを明示
  - secret 一覧テーブルを追加（必須/任意・値の取得方法）
  - deploy コマンドに「なぜ `--env production` を使わないか」の説明を追加
  - テスト件数を 194 件 → 205 件に更新
  - 末尾に全コマンドをまとめた「手順まとめ」セクションを追加

### `env.production` 不使用の判断理由

`[env.production]` セクションは `name = "ozu-road-report-prod"` のみ定義されており、
D1/R2 バインディングや secrets は top-level から引き継がれる（ただし `[[d1_databases]]` は
named env での再宣言が必要なため引き継ぎが不完全）。
ステージング環境を別途用意する予定がないため、`wrangler deploy`（フラグなし）で
top-level 設定をそのまま本番に使用する方針を確定。
`[env.production]` / `[env.staging]` は将来の拡張用として定義のみ残す。

### 変更ファイル

| ファイル | 種別 |
|---|---|
| `wrangler.toml` | 更新（コメント追記のみ、設定値変更なし） |
| `docs/checklist.md` | 全面刷新 |
| `docs/progress.md` | 本ステップ追記 |

### 次のステップ

手動でコマンドを実行して本番デプロイする（`docs/checklist.md` の手順に従う）。

---

## Step 14: ユーザー通報件数上限チェック実装 ✅（2026-03-27）

同一 LINE ユーザーの pending 通報が 10 件に達した場合、新規通報を受け付けない機能を追加した。

### 実施内容

- [x] `src/lib/db.ts`: `countPendingReportsByUser(db, lineUserId)` 関数を追加
  - `SELECT COUNT(*) FROM reports WHERE line_user_id = ? AND status = 'pending'`
  - 既存の `idx_reports_line_user_id` インデックスを活用（新 migration 不要）
- [x] `src/app/conversation.ts`: 上限チェックを実装
  - `REPORT_LIMIT_PER_USER = 10` 定数を追加
  - `MSG_REPORT_LIMIT_EXCEEDED` エラーメッセージ定数を追加（BRANDING 参照）
  - 「通報する」受信時（consent セッション作成前）に pending 件数をチェック
  - 上限以上の場合はエラーメッセージを返しセッションを作成しない
- [x] `tests/lib/db.test.ts`: `countPendingReportsByUser` のテスト追加（+3 テスト、計 25 テスト）
- [x] `tests/app/conversation.test.ts`: 上限超過シナリオのテスト追加（+4 テスト、計 211 テスト）
  - pending 9件（上限未満）→ 通常フロー開始
  - pending 10件（上限ちょうど）→ エラーメッセージ・セッション未作成
  - pending 15件（上限超過）→ エラーメッセージ
  - グローバル `beforeEach` に `countPendingReportsByUser` のデフォルトモック（0件）を追加
- [x] lint エラーなし、テスト 211 件全通過

### 採用判断メモ

- カウント対象を `pending` のみとした理由: 管理者が対応済みにすると枠が回復し、誠実なユーザーが再通報できる
- チェックタイミングを「通報する」受信時とした理由: R2 への写真アップロードが発生する前に弾けるため、R2 未登録状態でも安全
- 上限値 10: ユーザー要件による（pending のみカウントのため全件とは異なる）

### 変更ファイル

| ファイル | 種別 |
|---|---|
| `src/lib/db.ts` | 更新 |
| `src/app/conversation.ts` | 更新 |
| `tests/lib/db.test.ts` | 更新 |
| `tests/app/conversation.test.ts` | 更新 |
| `docs/progress.md` | 本ステップ追記 |

---

## Step 15: トリガーワード拡張・非トリガー無返信・docs/README 更新 ✅（2026-03-27）

本番動作確認後、UX 改善とドキュメント整備を実施した。

### トリガーワード拡張

- [x] `src/app/conversation.ts`: `MSG_HOW_TO_START` 定数を削除し `START_TRIGGER_WORDS` 配列に置き換え
  - `["通報する", "通報", "つうほう"]` の 3 ワードを受け付ける
  - いずれかに完全一致（`trim()` 後）した場合のみ会話を開始
- [x] `src/app/conversation.ts`: セッションなし時の非トリガーメッセージに **返信しない** よう変更
  - 旧: トリガーワード以外は `MSG_HOW_TO_START` メッセージを返信
  - 新: 返信なし（`return` のみ）

### テスト更新

- [x] `tests/app/conversation.test.ts`: 新トリガーワードのテストを追加（+4 テスト、計 215 テスト）
  - 「通報」でフロー開始 → 利用同意メッセージが届く
  - 「つうほう」でフロー開始 → 利用同意メッセージが届く
  - 非トリガーテキスト → 返信なし（mockFetch 未呼び出し）
  - 画像メッセージ → 返信なし
- [x] `tests/app/routing.test.ts`: 3 テストを非返信アサーションに更新
  - text / image / location メッセージ（セッションなし）→ `replyMessage` 未呼び出しを確認
- [x] テスト 213 件全通過（lint エラーなし）

### ドキュメント更新

- [x] `README.md`: 「LINE 会話の動作仕様」セクションを新規追加
  - トリガーワード（通報する / 通報 / つうほう）を明記
  - 非トリガー無返信の仕様を明記
  - follow イベント時の Welcome メッセージを記載
- [x] `README.md`: 「どこまでローカルで確認できるか」テーブルから「トップページ・プライバシーポリシー」行を削除（Step 12 での削除に追従）
- [x] `README.md`: 「wrangler.toml について」を更新
  - `database_id` が本番値に設定済みであることを明記
  - D1 migration に `--remote` が必要な理由を説明
  - deploy コマンドの `--env=""` フラグを追記
- [x] `docs/progress.md`: 本ステップ追記

### 変更ファイル

| ファイル | 種別 |
|---|---|
| `src/app/conversation.ts` | 更新 |
| `tests/app/conversation.test.ts` | 更新 |
| `tests/app/routing.test.ts` | 更新 |
| `README.md` | 更新 |
| `docs/progress.md` | 本ステップ追記 |
