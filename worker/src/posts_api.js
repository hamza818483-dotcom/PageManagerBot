import { jsonResponse, d1All, d1First, d1Run, newId, getUserIdFromRequest, logError } from './utils.js';

export async function handleGetPosts(request, env) {
  const url = new URL(request.url);
  const pageId = url.searchParams.get('page_id');
  try {
    const userId = await getUserIdFromRequest(request, env);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);

    const posts = await d1All(env, `SELECT * FROM scheduled_posts WHERE page_id = ? ORDER BY scheduled_at DESC`, [pageId]);
    return jsonResponse({ posts });
  } catch (err) {
    await logError(env, 'posts_api.handleGetPosts', err, { path: '/api/posts', pageId });
    return jsonResponse({ error: 'Could not load posts: ' + err.message }, 500);
  }
}

export async function handleCreatePost(request, env) {
  let body;
  try {
    const userId = await getUserIdFromRequest(request, env);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

    body = await request.json();
    const { page_id, message, image_url, scheduled_at } = body;
    if (!page_id || !scheduled_at) return jsonResponse({ error: 'page_id and scheduled_at required' }, 400);

    const id = newId();
    await d1Run(env, `INSERT INTO scheduled_posts (id, page_id, message, image_url, scheduled_at, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [id, page_id, message, image_url, scheduled_at]);
    const post = await d1First(env, `SELECT * FROM scheduled_posts WHERE id = ?`, [id]);
    return jsonResponse({ post });
  } catch (err) {
    await logError(env, 'posts_api.handleCreatePost', err, { path: '/api/posts', pageId: body?.page_id });
    return jsonResponse({ error: 'Could not schedule post: ' + err.message }, 500);
  }
}

export async function handleDeletePost(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  try {
    const userId = await getUserIdFromRequest(request, env);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!id) return jsonResponse({ error: 'id required' }, 400);

    await d1Run(env, `DELETE FROM scheduled_posts WHERE id = ?`, [id]);
    return jsonResponse({ success: true });
  } catch (err) {
    await logError(env, 'posts_api.handleDeletePost', err, { path: '/api/posts', postId: id });
    return jsonResponse({ error: 'Could not delete post: ' + err.message }, 500);
  }
}
