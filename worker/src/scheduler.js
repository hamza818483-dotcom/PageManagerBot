import { d1All, d1Run, fbGraph, logError } from './utils.js';

export async function runScheduler(env) {
  const now = new Date().toISOString();
  let due;
  try {
    due = await d1All(
      env,
      `SELECT sp.*, p.page_id as fb_page_id, p.access_token as page_access_token
       FROM scheduled_posts sp
       JOIN pages p ON p.id = sp.page_id
       WHERE sp.status = 'pending' AND sp.scheduled_at <= ?`,
      [now]
    );
  } catch (err) {
    await logError(env, 'scheduler.runScheduler:fetch-due', err, {});
    return;
  }
  if (!due || !due.length) return;

  for (const post of due) {
    if (!post.fb_page_id) {
      await logError(env, 'scheduler.runScheduler:post-loop', new Error('Post has no linked fb_page_id (page deleted?)'), { postId: post.id });
      continue;
    }

    try {
      let fbRes;
      if (post.image_url) {
        fbRes = await fbGraph(env, `${post.fb_page_id}/photos`, {
          url: post.image_url,
          caption: post.message || '',
          access_token: post.page_access_token
        }, 'POST');
      } else {
        fbRes = await fbGraph(env, `${post.fb_page_id}/feed`, {
          message: post.message || '',
          access_token: post.page_access_token
        }, 'POST');
      }

      if (fbRes.error) {
        await logError(env, 'scheduler.runScheduler:fbGraph-post', new Error(fbRes.error.message), {
          postId: post.id, pageId: post.page_id, fbError: fbRes.error
        });
        await d1Run(env, `UPDATE scheduled_posts SET status='failed', error=? WHERE id=?`, [fbRes.error.message, post.id]);
      } else {
        await d1Run(env, `UPDATE scheduled_posts SET status='posted', fb_post_id=? WHERE id=?`, [fbRes.id || fbRes.post_id, post.id]);
      }
    } catch (err) {
      await logError(env, 'scheduler.runScheduler:post-loop (uncaught)', err, { postId: post.id, pageId: post.page_id });
      try {
        await d1Run(env, `UPDATE scheduled_posts SET status='failed', error=? WHERE id=?`, [err.message, post.id]);
      } catch (dbErr) {
        await logError(env, 'scheduler.runScheduler:mark-failed', dbErr, { postId: post.id });
      }
    }
  }
}
