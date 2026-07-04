import { handleAuthLogin, handleAuthCallback } from './auth.js';
import { handleWebhookVerify, handleWebhookEvent } from './webhook.js';
import { handleGetPages, handleGetRules, handleSaveRule, handleDeleteRule } from './pages_api.js';
import { handleGetPosts, handleCreatePost, handleDeletePost } from './posts_api.js';
import { runScheduler } from './scheduler.js';
import { corsHeaders, jsonResponse } from './utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Auth
      if (path === '/auth/login') return handleAuthLogin(request, env);
      if (path === '/auth/callback') return handleAuthCallback(request, env);

      // Webhook (Facebook -> us)
      if (path === '/webhook' && request.method === 'GET') return handleWebhookVerify(request, env);
      if (path === '/webhook' && request.method === 'POST') return handleWebhookEvent(request, env, ctx);

      // Pages & Rules API
      if (path === '/api/pages' && request.method === 'GET') return handleGetPages(request, env);
      if (path === '/api/rules' && request.method === 'GET') return handleGetRules(request, env);
      if (path === '/api/rules' && request.method === 'POST') return handleSaveRule(request, env);
      if (path === '/api/rules' && request.method === 'DELETE') return handleDeleteRule(request, env);

      // Posts API
      if (path === '/api/posts' && request.method === 'GET') return handleGetPosts(request, env);
      if (path === '/api/posts' && request.method === 'POST') return handleCreatePost(request, env);
      if (path === '/api/posts' && request.method === 'DELETE') return handleDeletePost(request, env);

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduler(env));
  }
};
