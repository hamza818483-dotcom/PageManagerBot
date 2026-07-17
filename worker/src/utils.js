export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

export function newId() {
  return crypto.randomUUID();
}

// D1 helpers
export async function d1All(env, sql, params = []) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results;
}

export async function d1First(env, sql, params = []) {
  return await env.DB.prepare(sql).bind(...params).first();
}

export async function d1Run(env, sql, params = []) {
  return await env.DB.prepare(sql).bind(...params).run();
}

export async function fbGraph(env, path, params = {}, method = 'GET') {
  const base = `https://graph.facebook.com/${env.FB_GRAPH_VERSION}/${path}`;
  let res, json;
  try {
    if (method === 'GET') {
      const url = `${base}?${new URLSearchParams(params)}`;
      res = await fetch(url);
    } else {
      res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params)
      });
    }
    json = await res.json();
  } catch (networkErr) {
    // Network-level failure (FB unreachable, bad response, etc.) - surface it the same
    // shape as an FB error object so callers can handle both uniformly.
    return { error: { message: `fbGraph network failure on ${path}: ${networkErr.message}`, type: 'NetworkError' } };
  }
  if (json && json.error) {
    console.error(`fbGraph error [${path}]:`, JSON.stringify(json.error));
  }
  return json;
}

// Simple auth: verify a session token stored in KV, return user_id
export async function getUserIdFromRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  const userId = await env.SESSIONS.get(`session:${token}`);
  return userId;
}

// ---- Central error logging ----
// Call this from any catch block so every failure is captured with consistent
// context: where it happened, what went wrong, and who/what was involved.
// Errors land in D1 (error_logs table) AND console.error (visible in
// `wrangler tail` / Cloudflare dashboard logs) so nothing gets missed.
export async function logError(env, location, err, context = {}) {
  const message = err?.message || String(err);
  const detail = JSON.stringify({
    stack: err?.stack || null,
    ...context
  });
  console.error(`[ERROR] ${location}: ${message}`, detail);
  try {
    await env.DB.prepare(
      `INSERT INTO error_logs (id, location, message, detail, request_id, user_id, page_id, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId(),
      location,
      message,
      detail,
      context.requestId || null,
      context.userId || null,
      context.pageId || null,
      context.path || null
    ).run();
  } catch (logErr) {
    // If D1 logging itself fails, at least make sure it's visible in console logs.
    console.error(`[ERROR] logError itself failed for ${location}:`, logErr.message);
  }
}
