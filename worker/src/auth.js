import { jsonResponse, fbGraph, d1All, d1First, d1Run, newId } from './utils.js';

export async function handleAuthLogin(request, env) {
  const redirectUri = `${env.SITE_URL_BACKEND}/auth/callback`;
  const authUrl = `https://www.facebook.com/${env.FB_GRAPH_VERSION}/dialog/oauth?client_id=${env.FB_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=${env.FB_CONFIG_ID}&response_type=code`;
  return Response.redirect(authUrl, 302);
}

export async function handleAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return jsonResponse({ error: 'Missing code' }, 400);

  const redirectUri = `${env.SITE_URL_BACKEND}/auth/callback`;

  const tokenRes = await fbGraph(env, 'oauth/access_token', {
    client_id: env.FB_APP_ID,
    client_secret: env.FB_APP_SECRET,
    redirect_uri: redirectUri,
    code
  });
  if (tokenRes.error) return jsonResponse({ error: tokenRes.error.message }, 400);

  const longLived = await fbGraph(env, 'oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: env.FB_APP_ID,
    client_secret: env.FB_APP_SECRET,
    fb_exchange_token: tokenRes.access_token
  });
  if (longLived.error) return jsonResponse({ error: longLived.error.message }, 400);

  const profile = await fbGraph(env, 'me', { fields: 'id,name,email', access_token: longLived.access_token });
  if (profile.error) return jsonResponse({ error: profile.error.message }, 400);

  let user = await d1First(env, `SELECT * FROM users WHERE fb_user_id = ?`, [profile.id]);
  if (!user) {
    const id = newId();
    await d1Run(env, `INSERT INTO users (id, fb_user_id, name, email) VALUES (?, ?, ?, ?)`,
      [id, profile.id, profile.name, profile.email]);
    user = { id, fb_user_id: profile.id, name: profile.name, email: profile.email };
  }

  const pagesRes = await fbGraph(env, 'me/accounts', { access_token: longLived.access_token });
  if (pagesRes.data) {
    for (const p of pagesRes.data) {
      const existing = await d1First(env, `SELECT id FROM pages WHERE page_id = ?`, [p.id]);
      if (existing) {
        await d1Run(env, `UPDATE pages SET user_id = ?, page_name = ?, access_token = ? WHERE page_id = ?`,
          [user.id, p.name, p.access_token, p.id]);
      } else {
        await d1Run(env, `INSERT INTO pages (id, user_id, page_id, page_name, access_token) VALUES (?, ?, ?, ?, ?)`,
          [newId(), user.id, p.id, p.name, p.access_token]);
      }
      await fbGraph(env, `${p.id}/subscribed_apps`, {
        subscribed_fields: 'feed,messages',
        access_token: p.access_token
      }, 'POST');
    }
  }

  const sessionToken = crypto.randomUUID();
  await env.SESSIONS.put(`session:${sessionToken}`, user.id, { expirationTtl: 60 * 60 * 24 * 30 });

  return Response.redirect(`${env.SITE_URL}/dashboard?token=${sessionToken}`, 302);
}
