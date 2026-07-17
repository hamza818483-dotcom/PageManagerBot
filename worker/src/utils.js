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
  if (method === 'GET') {
    const url = `${base}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    return res.json();
  }
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  });
  return res.json();
}

// Simple auth: verify a session token stored in KV, return user_id
export async function getUserIdFromRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  const userId = await env.SESSIONS.get(`session:${token}`);
  return userId;
}
