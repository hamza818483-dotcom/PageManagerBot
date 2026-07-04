-- Users who logged in via Facebook
create table users (
  id uuid primary key default gen_random_uuid(),
  fb_user_id text unique not null,
  name text,
  email text,
  created_at timestamptz default now()
);

-- Connected FB Pages (encrypted tokens)
create table pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  page_id text unique not null,
  page_name text,
  access_token text not null, -- long-lived page token
  token_expires_at timestamptz,
  webhook_subscribed boolean default false,
  created_at timestamptz default now()
);

-- Auto-reply rules per page
create table reply_rules (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id) on delete cascade,
  keyword text not null,           -- match keyword/phrase (case-insensitive contains)
  match_type text default 'contains', -- contains | exact | any (any = catch-all)
  comment_reply_text text,         -- public reply under the comment
  inbox_text text,                 -- DM text sent to commenter
  inbox_image_url text,            -- optional image sent in DM
  priority int default 0,          -- higher checked first
  active boolean default true,
  created_at timestamptz default now()
);

-- Scheduled posts
create table scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id) on delete cascade,
  message text,
  image_url text,
  scheduled_at timestamptz not null,
  status text default 'pending', -- pending | posted | failed
  fb_post_id text,
  error text,
  created_at timestamptz default now()
);

-- Logs of every auto-reply action (for dashboard visibility)
create table reply_logs (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id) on delete cascade,
  rule_id uuid references reply_rules(id),
  commenter_name text,
  comment_text text,
  action text, -- comment_reply | inbox_sent | inbox_failed
  created_at timestamptz default now()
);

create index idx_reply_rules_page on reply_rules(page_id, active);
create index idx_scheduled_posts_status on scheduled_posts(status, scheduled_at);
