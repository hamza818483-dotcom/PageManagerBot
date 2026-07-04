import { jsonResponse, fbGraph, supabaseFetch } from './utils.js';

export async function handleAuthLogin(request, env) {
  const redirectUri = `${env.SITE_URL_BACKEND}/auth/callback`;
  const scope = [
    'pages_show_list',
    'pages_manage_posts',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_messaging'
  ].join(',');
  const authUrl = `https://www.facebook.com/${env.FB_GRAPH_VERSION}/dialog/oauth?client_id=${env.FB_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
  return Response.redirect(authUrl, 302);
}

export async function handleAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return jsonResponse({ error: 'Missing code' }, 400);

  const redirectUri = `${env.SITE_URL_BACKEND}/auth/callback`;

  // 1. Exchange code -> short-lived user token
  const tokenRes = await fbGraph(env, 'oauth/access_token', {
    client_id: env.FB_APP_ID,
    client_secret: env.FB_APP_SECRET,
    redirect_uri: redirectUri,
    code
  });
  if (tokenRes.error) return jsonResponse({ error: tokenRes.error.message }, 400);

  // 2. Exchange for long-lived user token
  const longLived = await fbGraph(env, 'oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: env.FB_APP_ID,
    client_secret: env.FB_APP_SECRET,
    fb_exchange_token: tokenRes.access_token
  });

  // 3. Get FB user profile
  const profile = await fbGraph(env, 'me', { fields: 'id,name,email', access_token: longLived.access_token });

  // 4. Upsert user in Supabase
  const users = await supabaseFetch(env, `users?fb_user_id=eq.${profile.id}`, { method: 'GET' });
  let user;
  if (users && users.length) {
    user = users[0];
  } else {
    const created = await supabaseFetch(env, 'users', {
      method: 'POST',
      body: JSON.stringify({ fb_user_id: profile.id, name: profile.name, email: profile.email })
    });
    user = created[0];
  }

  // 5. Get pages user manages, store page access tokens (long-lived, auto via user token)
  const pagesRes = await fbGraph(env, 'me/accounts', { access_token: longLived.access_token });
  if (pagesRes.data) {
    for (const p of pagesRes.data) {
      const existing = await supabaseFetch(env, `pages?page_id=eq.${p.id}`, { method: 'GET' });
      const payload = {
        user_id: user.id,
        page_id: p.id,
        page_name: p.name,
        access_token: p.access_token
      };
      if (existing && existing.length) {
        await supabaseFetch(env, `pages?page_id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await supabaseFetch(env, 'pages', { method: 'POST', body: JSON.stringify(payload) });
      }
      // Subscribe page to webhook events (comments, messages)
      await fbGraph(env, `${p.id}/subscribed_apps`, {
        subscribed_fields: 'feed,messages',
        access_token: p.access_token
      }, 'POST');
    }
  }

  // 6. Create session token, store in KV
  const sessionToken = crypto.randomUUID();
  await env.SESSIONS.put(`session:${sessionToken}`, user.id, { expirationTtl: 60 * 60 * 24 * 30 });

  return Response.redirect(`${env.SITE_URL}/dashboard?token=${sessionToken}`, 302);
}
