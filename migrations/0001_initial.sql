-- 道路破損通報テーブル
CREATE TABLE reports (
  id                INTEGER  PRIMARY KEY AUTOINCREMENT,
  receipt_number    TEXT     NOT NULL UNIQUE,
  line_user_id      TEXT     NOT NULL,
  status            TEXT     NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected')),
  close_photo_key   TEXT     NOT NULL,
  far_photo_key     TEXT     NOT NULL,
  latitude          REAL     NOT NULL,
  longitude         REAL     NOT NULL,
  location_address  TEXT,
  shooting_date     TEXT,    -- YYYY-MM-DD
  remarks           TEXT,
  reporter_name     TEXT,
  reporter_phone    TEXT,
  created_at        TEXT     NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT     NOT NULL DEFAULT (datetime('now'))
);

-- receipt_number の UNIQUE 制約が暗黙的に B-tree インデックスを生成するため、個別インデックスは不要
CREATE INDEX idx_reports_status         ON reports (status);
CREATE INDEX idx_reports_created_at     ON reports (created_at);
CREATE INDEX idx_reports_line_user_id   ON reports (line_user_id);

-- 会話セッションテーブル
-- line_user_id を PK として 1 ユーザー = 1 アクティブセッションを保証する
-- セッション開始時は INSERT OR REPLACE で上書き、完了/キャンセル時は行削除
CREATE TABLE sessions (
  line_user_id  TEXT    PRIMARY KEY,
  step          TEXT    NOT NULL,
  data          TEXT    NOT NULL DEFAULT '{}',  -- ConversationSession.data の JSON 文字列
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
