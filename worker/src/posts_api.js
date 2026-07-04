import { jsonResponse, supabaseFetch, getUserIdFromRequest } from './utils.js';

export async function handleGetPosts(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const pageId = url.searchParams.get('page_id');
  if (!pageId) return jsonResponse({ error: 'page_id required' }, 400);

  const posts = await supabaseFetch(env, `scheduled_posts?page_id=eq.${pageId}&order=scheduled_at.desc`, { method: 'GET' });
  return jsonResponse({ posts });
}

export async function handleCreatePost(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { page_id, message, image_url, scheduled_at } = await request.json();
  if (!page_id || !scheduled_at) return jsonResponse({ error: 'page_id and scheduled_at required' }, 400);

  const result = await supabaseFetch(env, 'scheduled_posts', {
    method: 'POST',
    body: JSON.stringify({ page_id, message, image_url, scheduled_at, status: 'pending' })
  });
  return jsonResponse({ post: result[0] });
}

export async function handleDeletePost(request, env) {
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id required' }, 400);

  await supabaseFetch(env, `scheduled_posts?id=eq.${id}`, { method: 'DELETE' });
  return jsonResponse({ success: true });
}
