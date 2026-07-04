import { supabaseFetch, fbGraph } from './utils.js';

export async function runScheduler(env) {
  const now = new Date().toISOString();
  const due = await supabaseFetch(
    env,
    `scheduled_posts?status=eq.pending&scheduled_at=lte.${now}&select=*,pages(page_id,access_token)`,
    { method: 'GET' }
  );
  if (!due || !due.length) return;

  for (const post of due) {
    const page = post.pages;
    if (!page) continue;

    try {
      let fbRes;
      if (post.image_url) {
        fbRes = await fbGraph(env, `${page.page_id}/photos`, {
          url: post.image_url,
          caption: post.message || '',
          access_token: page.access_token
        }, 'POST');
      } else {
        fbRes = await fbGraph(env, `${page.page_id}/feed`, {
          message: post.message || '',
          access_token: page.access_token
        }, 'POST');
      }

      if (fbRes.error) {
        await supabaseFetch(env, `scheduled_posts?id=eq.${post.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'failed', error: fbRes.error.message })
        });
      } else {
        await supabaseFetch(env, `scheduled_posts?id=eq.${post.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'posted', fb_post_id: fbRes.id || fbRes.post_id })
        });
      }
    } catch (err) {
      await supabaseFetch(env, `scheduled_posts?id=eq.${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'failed', error: err.message })
      });
    }
  }
}
