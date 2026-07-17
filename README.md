# Page Manager Bot

Facebook Page auto-reply (comment → public reply + inbox DM) + post scheduler, controlled fully from a website.

## Architecture
- **worker/** → Cloudflare Worker: FB OAuth, webhook receiver, REST API, cron scheduler
- **dashboard/** → Cloudflare Pages static site (login, rules manager, post scheduler)
- **D1** → users, pages, reply_rules, scheduled_posts, reply_logs

## Setup Steps

### 1. Facebook App
1. https://developers.facebook.com → Create App → type: Business
2. Add product: **Facebook Login** + **Webhooks**
3. App settings → Basic: copy `App ID`, `App Secret`
4. Facebook Login → Settings → Valid OAuth Redirect URIs: `https://YOUR-WORKER-URL/auth/callback`
5. Webhooks → Page → Callback URL: `https://YOUR-WORKER-URL/webhook`, Verify Token: (choose any string, put in `FB_VERIFY_TOKEN` secret)
6. Subscribe to fields: `feed`, `messages`
7. App Review → request permissions: `pages_show_list`, `pages_manage_posts`, `pages_manage_metadata`, `pages_manage_engagement`, `pages_read_engagement`, `pages_messaging` (business verification needed for live mode)

### 2. Cloudflare D1
1. Database `pagemanagerbot_db` already created; schema applied from `d1_schema.sql` (tables: users, pages, reply_rules, scheduled_posts, reply_logs).
2. Bound in `wrangler.toml` as `DB`.

### 3. Cloudflare Worker
```bash
npm install -g wrangler
wrangler login
wrangler kv namespace create SESSIONS
# copy the id output into wrangler.toml [[kv_namespaces]] id field

wrangler secret put FB_APP_SECRET
wrangler secret put FB_VERIFY_TOKEN

# edit wrangler.toml vars: FB_APP_ID, SITE_URL (pages domain), SITE_URL_BACKEND (worker domain)
wrangler deploy
```

### 4. Cloudflare Pages (dashboard)
1. In `dashboard/app.js`, replace `__WORKER_URL__` with your deployed worker URL
2. Connect this repo to Cloudflare Pages, build output directory: `dashboard`, no build command needed
3. Deploy

### 5. Use
1. Open dashboard site → Login with Facebook → approve permissions
2. Pages list dekhabe → click a page
3. Add rules: keyword, comment reply text, inbox text/image
4. Schedule posts from the Posts tab

## How it works
- Comment ashle → FB webhook `feed` event Worker e ashe → keyword match → matched rule diye public comment reply + private inbox message (text/image) pathay → log save hoy
- Post scheduler → cron every 5 min → due posts Graph API diye publish kore
