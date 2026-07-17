import { jsonResponse, d1All, d1First, d1Run, newId, getUserIdFromRequest } from './utils.js';

export async function handleGetPages(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const pages = await d1All(env, `SELECT id, page_id, page_name, webhook_subscribed, created_at FROM pages WHERE user_id = ?`, [userId]);
  return jsonResponse({ pages });
}

export async function handleGetRules(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const pageId = url.searchParams.get('page_id');
  if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);

  const rules = await d1All(env, `SELECT * FROM reply_rules WHERE page_id = ? ORDER BY priority DESC`, [pageId]);
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

  const mt = match_type || 'contains';
  const pr = priority || 0;
  const act = active !== false ? 1 : 0;

  let rule;
  if (id) {
    await d1Run(env, `UPDATE reply_rules SET page_id=?, keyword=?, match_type=?, comment_reply_text=?, inbox_text=?, inbox_image_url=?, priority=?, active=? WHERE id=?`,
      [page_id, keyword, mt, comment_reply_text, inbox_text, inbox_image_url, pr, act, id]);
    rule = await d1First(env, `SELECT * FROM reply_rules WHERE id = ?`, [id]);
  } else {
    const newRuleId = newId();
    await d1Run(env, `INSERT INTO reply_rules (id, page_id, keyword, match_type, comment_reply_text, inbox_text, inbox_image_url, priority, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newRuleId, page_id, keyword, mt, comment_reply_text, inbox_text, inbox_image_url, pr, act]);
    rule = await d1First(env, `SELECT * FROM reply_rules WHERE id = ?`, [newRuleId]);
  }
  return jsonResponse({ rule });
}

export async function handleDeleteRule(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id required' }, 400);

  await d1Run(env, `DELETE FROM reply_rules WHERE id = ?`, [id]);
  return jsonResponse({ success: true });
}
