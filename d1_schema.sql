-- D1 schema (SQLite)

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  fb_user_id TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  page_id TEXT UNIQUE NOT NULL,
  page_name TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TEXT,
  webhook_subscribed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE reply_rules (
  id TEXT PRIMARY KEY,
  page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  match_type TEXT DEFAULT 'contains',
  comment_reply_text TEXT,
  inbox_text TEXT,
  inbox_image_url TEXT,
  priority INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE scheduled_posts (
  id TEXT PRIMARY KEY,
  page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  message TEXT,
  image_url TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  fb_post_id TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE reply_logs (
  id TEXT PRIMARY KEY,
  page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES reply_rules(id),
  commenter_name TEXT,
  comment_text TEXT,
  action TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_reply_rules_page ON reply_rules(page_id, active);
CREATE INDEX idx_scheduled_posts_status ON scheduled_posts(status, scheduled_at);

CREATE TABLE error_logs (
  id TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  request_id TEXT,
  user_id TEXT,
  page_id TEXT,
  path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);
