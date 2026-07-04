import { fbGraph, supabaseFetch } from './utils.js';

export async function handleWebhookVerify(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.FB_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function handleWebhookEvent(request, env, ctx) {
  const body = await request.json();

  // Always ack fast; process async
  ctx.waitUntil(processWebhookBody(body, env));

  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function processWebhookBody(body, env) {
  if (body.object !== 'page') return;

  for (const entry of body.entry || []) {
    const fbPageId = entry.id;
    for (const change of entry.changes || []) {
      if (change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') {
        await handleNewComment(fbPageId, change.value, env);
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
  const pages = await supabaseFetch(env, `pages?page_id=eq.${fbPageId}`, { method: 'GET' });
  if (!pages || !pages.length) return;
  const page = pages[0];

  // Ignore comments made by the page itself (avoid loops)
  if (commenterId === fbPageId) return;

  // Get active rules ordered by priority
  const rules = await supabaseFetch(
    env,
    `reply_rules?page_id=eq.${page.id}&active=eq.true&order=priority.desc`,
    { method: 'GET' }
  );
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
    await fbGraph(env, `${commentId}/comments`, {
      message: matched.comment_reply_text,
      access_token: token
    }, 'POST');
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

    // If image + text both set, send text as a follow-up using PSID from private reply response
    if (matched.inbox_image_url && matched.inbox_text && dmRes.recipient_id) {
      await fbGraph(env, 'me/messages', {
        recipient: JSON.stringify({ id: dmRes.recipient_id }),
        message: JSON.stringify({ text: matched.inbox_text }),
        access_token: token
      }, 'POST');
    }
    action = 'inbox_sent';
  }

  // Log
  await supabaseFetch(env, 'reply_logs', {
    method: 'POST',
    body: JSON.stringify({
      page_id: page.id,
      rule_id: matched.id,
      commenter_name: commenterName,
      comment_text: value.message,
      action
    })
  });
}
