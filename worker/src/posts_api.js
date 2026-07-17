import { jsonResponse, d1All, d1First, d1Run, newId, getUserIdFromRequest } from './utils.js';

export async function handleGetPosts(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const pageId = url.searchParams.get('page_id');
  if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);

  const posts = await d1All(env, `SELECT * FROM scheduled_posts WHERE page_id = ? ORDER BY scheduled_at DESC`, [pageId]);
  return jsonResponse({ posts });
}

export async function handleCreatePost(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { page_id, message, image_url, scheduled_at } = await request.json();
  if (!page_id || !scheduled_at) return jsonResponse({ error: 'page_id and scheduled_at required' }, 400);

  const id = newId();
  await d1Run(env, `INSERT INTO scheduled_posts (id, page_id, message, image_url, scheduled_at, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [id, page_id, message, image_url, scheduled_at]);
  const post = await d1First(env, `SELECT * FROM scheduled_posts WHERE id = ?`, [id]);
  return jsonResponse({ post });
}

export async function handleDeletePost(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id required' }, 400);

  await d1Run(env, `DELETE FROM scheduled_posts WHERE id = ?`, [id]);
  return jsonResponse({ success: true });
}
