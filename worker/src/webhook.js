import { fbGraph, d1All, d1First, d1Run, newId, logError } from './utils.js';

export async function handleWebhookVerify(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.FB_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  await logError(env, 'webhook.handleWebhookVerify', new Error('Verify token mismatch or missing mode'), { mode });
  return new Response('Forbidden', { status: 403 });
}

export async function handleWebhookEvent(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    await logError(env, 'webhook.handleWebhookEvent:parse-body', err, {});
    return new Response('EVENT_RECEIVED', { status: 200 }); // still 200 so FB doesn't retry-storm
  }

  // Always ack fast; process async. Catch here so a failure inside doesn't
  // vanish silently - waitUntil errors are otherwise swallowed by the runtime.
  ctx.waitUntil(
    processWebhookBody(body, env).catch(err => logError(env, 'webhook.processWebhookBody (uncaught)', err, {}))
  );

  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function processWebhookBody(body, env) {
  if (body.object !== 'page') return;

  for (const entry of body.entry || []) {
    const fbPageId = entry.id;
    for (const change of entry.changes || []) {
      if (change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') {
        try {
          await handleNewComment(fbPageId, change.value, env);
        } catch (err) {
          await logError(env, 'webhook.handleNewComment', err, { pageId: fbPageId, commentId: change.value?.comment_id });
        }
      }
    }
  }
}

async function handleNewComment(fbPageId, value, env) {
  const commentId = value.comment_id;
  const commentText = (value.message || '').toLowerCase();
  const commenterId = value.from?.id;
  const commenterName = value.from?.name || 'User';

  if (!commentId || !commenterId) return;

  // Get page + its access token
  const page = await d1First(env, `SELECT * FROM pages WHERE page_id = ?`, [fbPageId]);
  if (!page) {
    await logError(env, 'webhook.handleNewComment', new Error('No matching page in DB for this fb_page_id'), { pageId: fbPageId, commentId });
    return;
  }

  // Ignore comments made by the page itself (avoid loops)
  if (commenterId === fbPageId) return;

  // Get active rules ordered by priority
  const rules = await d1All(env, `SELECT * FROM reply_rules WHERE page_id = ? AND active = 1 ORDER BY priority DESC`, [page.id]);
  if (!rules || !rules.length) return;

  const matched = rules.find(r => {
    if (r.match_type === 'any') return true;
    if (r.match_type === 'exact') return commentText.trim() === r.keyword.toLowerCase().trim();
    return commentText.includes(r.keyword.toLowerCase());
  });
  if (!matched) return;

  const token = page.access_token;
  let action = 'comment_reply';

  // 1. Public reply under the comment
  if (matched.comment_reply_text) {
    const replyRes = await fbGraph(env, `${commentId}/comments`, {
      message: matched.comment_reply_text,
      access_token: token
    }, 'POST');
    if (replyRes.error) {
      await logError(env, 'webhook.handleNewComment:comment_reply', new Error(replyRes.error.message), {
        pageId: page.id, commentId, ruleId: matched.id, fbError: replyRes.error
      });
    }
  }

  // 2. Send DM (text and/or image) to commenter via Messenger Send API
  if (matched.inbox_text || matched.inbox_image_url) {
    const messagingPayload = {
      recipient: JSON.stringify({ comment_id: commentId }), // private reply to comment -> opens DM thread
      message: JSON.stringify(
        matched.inbox_image_url
          ? { attachment: { type: 'image', payload: { url: matched.inbox_image_url, is_reusable: true } } }
          : { text: matched.inbox_text }
      ),
      access_token: token
    };
    const dmRes = await fbGraph(env, 'me/messages', messagingPayload, 'POST');
    if (dmRes.error) {
      await logError(env, 'webhook.handleNewComment:dm', new Error(dmRes.error.message), {
        pageId: page.id, commentId, ruleId: matched.id, fbError: dmRes.error
      });
    }

    // If image + text both set, send text as a follow-up using PSID from private reply response
    if (matched.inbox_image_url && matched.inbox_text && dmRes.recipient_id) {
      const followUpRes = await fbGraph(env, 'me/messages', {
        recipient: JSON.stringify({ id: dmRes.recipient_id }),
        message: JSON.stringify({ text: matched.inbox_text }),
        access_token: token
      }, 'POST');
      if (followUpRes.error) {
        await logError(env, 'webhook.handleNewComment:dm-followup', new Error(followUpRes.error.message), {
          pageId: page.id, commentId, ruleId: matched.id, fbError: followUpRes.error
        });
      }
    }
    action = 'inbox_sent';
  }

  // Log
  try {
    await d1Run(env, `INSERT INTO reply_logs (id, page_id, rule_id, commenter_name, comment_text, action) VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), page.id, matched.id, commenterName, value.message, action]);
  } catch (err) {
    await logError(env, 'webhook.handleNewComment:reply_logs-insert', err, { pageId: page.id, commentId });
  }
}
