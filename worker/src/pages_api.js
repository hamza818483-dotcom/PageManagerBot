import { jsonResponse, d1All, d1First, d1Run, newId, getUserIdFromRequest, logError } from './utils.js';

export async function handleGetPages(request, env) {
  try {
    const userId = await getUserIdFromRequest(request, env);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

    const pages = await d1All(env, `SELECT id, page_id, page_name, webhook_subscribed, created_at FROM pages WHERE user_id = ?`, [userId]);
    return jsonResponse({ pages });
  } catch (err) {
    await logError(env, 'pages_api.handleGetPages', err, { path: '/api/pages' });
    return jsonResponse({ error: 'Could not load pages: ' + err.message }, 500);
  }
}

export async function handleGetRules(request, env) {
  const url = new URL(request.url);
  const pageId = url.searchParams.get('page_id');
  try {
    const userId = await getUserIdFromRequest(request, env);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);

    const rules = await d1All(env, `SELECT * FROM reply_rules WHERE page_id = ? ORDER BY priority DESC`, [pageId]);
    return jsonResponse({ rules });
  } catch (err) {
    await logError(env, 'pages_api.handleGetRules', err, { path: '/api/rules', pageId });
    return jsonResponse({ error: 'Could not load rules: ' + err.message }, 500);
  }
}

export async function handleSaveRule(request, env) {
  let data;
  try {
    const userId = await getUserIdFromRequest(request, env);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

    data = await request.json();
    const {
      id, page_id, keyword, match_type,
      comment_reply_text, inbox_text, inbox_image_url,
      priority, active
    } = data;

    if (!page_id) return jsonResponse({ error: 'page_id required' }, 400);

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
  } catch (err) {
    await logError(env, 'pages_api.handleSaveRule', err, { path: '/api/rules', pageId: data?.page_id });
    return jsonResponse({ error: 'Could not save rule: ' + err.message }, 500);
  }
}

export async function handleDeleteRule(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  try {
    const userId = await getUserIdFromRequest(request, env);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!id) return jsonResponse({ error: 'id required' }, 400);

    await d1Run(env, `DELETE FROM reply_rules WHERE id = ?`, [id]);
    return jsonResponse({ success: true });
  } catch (err) {
    await logError(env, 'pages_api.handleDeleteRule', err, { path: '/api/rules', ruleId: id });
    return jsonResponse({ error: 'Could not delete rule: ' + err.message }, 500);
  }
}
