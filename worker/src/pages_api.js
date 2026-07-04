import { jsonResponse, supabaseFetch, getUserIdFromRequest } from './utils.js';

export async function handleGetPages(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const pages = await supabaseFetch(env, `pages?user_id=eq.${userId}&select=id,page_id,page_name,webhook_subscribed,created_at`, { method: 'GET' });
  return jsonResponse({ pages });
}

export async function handleGetRules(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const pageId = url.searchParams.get('page_id');
  if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);

  const rules = await supabaseFetch(env, `reply_rules?page_id=eq.${pageId}&order=priority.desc`, { method: 'GET' });
  return jsonResponse({ rules });
}

export async function handleSaveRule(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const data = await request.json();
  const {
    id, page_id, keyword, match_type,
    comment_reply_text, inbox_text, inbox_image_url,
    priority, active
  } = data;

  const payload = {
    page_id, keyword, match_type: match_type || 'contains',
    comment_reply_text, inbox_text, inbox_image_url,
    priority: priority || 0, active: active !== false
  };

  let result;
  if (id) {
    result = await supabaseFetch(env, `reply_rules?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    result = await supabaseFetch(env, 'reply_rules', { method: 'POST', body: JSON.stringify(payload) });
  }
  return jsonResponse({ rule: result[0] });
}

export async function handleDeleteRule(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id required' }, 400);

  await supabaseFetch(env, `reply_rules?id=eq.${id}`, { method: 'DELETE' });
  return jsonResponse({ success: true });
}
