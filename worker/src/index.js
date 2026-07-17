import { handleAuthLogin, handleAuthCallback } from './auth.js';
import { handleWebhookVerify, handleWebhookEvent } from './webhook.js';
import { handleGetPages, handleGetRules, handleSaveRule, handleDeleteRule } from './pages_api.js';
import { handleGetPosts, handleCreatePost, handleDeletePost } from './posts_api.js';
import { runScheduler } from './scheduler.js';
import { corsHeaders, jsonResponse, logError, getUserIdFromRequest, d1All } from './utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const requestId = crypto.randomUUID();

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Auth
      if (path === '/auth/login') return await handleAuthLogin(request, env);
      if (path === '/auth/callback') return await handleAuthCallback(request, env);

      // Webhook (Facebook -> us)
      if (path === '/webhook' && request.method === 'GET') return await handleWebhookVerify(request, env);
      if (path === '/webhook' && request.method === 'POST') return await handleWebhookEvent(request, env, ctx);

      // Pages & Rules API
      if (path === '/api/pages' && request.method === 'GET') return await handleGetPages(request, env);
      if (path === '/api/rules' && request.method === 'GET') return await handleGetRules(request, env);
      if (path === '/api/rules' && request.method === 'POST') return await handleSaveRule(request, env);
      if (path === '/api/rules' && request.method === 'DELETE') return await handleDeleteRule(request, env);

      // Posts API
      if (path === '/api/posts' && request.method === 'GET') return await handleGetPosts(request, env);
      if (path === '/api/posts' && request.method === 'POST') return await handleCreatePost(request, env);
      if (path === '/api/posts' && request.method === 'DELETE') return await handleDeletePost(request, env);

      // Error log viewer (for dashboard "Errors" tab / debugging)
      if (path === '/api/errors' && request.method === 'GET') {
        const userId = await getUserIdFromRequest(request, env);
        if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
        const errors = await d1All(env, `SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 100`);
        return jsonResponse({ errors });
      }

      return jsonResponse({ error: 'Not found', path }, 404);
    } catch (err) {
      // Last-resort catch: anything that slips past a handler's own try/catch
      // still gets logged with full context instead of silently 500-ing.
      await logError(env, 'index.fetch (uncaught)', err, { requestId, path, method: request.method });
      return jsonResponse({ error: err.message, requestId }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runScheduler(env).catch(err => logError(env, 'scheduled.runScheduler (uncaught)', err, {}))
    );
  }
};
