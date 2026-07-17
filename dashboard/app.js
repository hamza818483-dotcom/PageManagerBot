const API_BASE = "https://pagemanagerbot.hamza818483.workers.dev";;

let sessionToken = localStorage.getItem('pmb_token');
let currentPageId = null;

function api(path, opts = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
      ...(opts.headers || {})
    }
  }).then(r => r.json());
}

function loginWithFacebook() {
  window.location.href = `${API_BASE}/auth/login`;
}

function logout() {
  localStorage.removeItem('pmb_token');
  location.reload();
}

function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');
  if (tokenFromUrl) {
    sessionToken = tokenFromUrl;
    localStorage.setItem('pmb_token', tokenFromUrl);
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (!sessionToken) {
    document.getElementById('loginScreen').classList.remove('hidden');
  } else {
    document.getElementById('appScreen').classList.remove('hidden');
    loadPages();
  }
}

async function loadPages() {
  const container = document.getElementById('pagesContainer');
  const { pages, error } = await api('/api/pages');
  if (error) { logout(); return; }
  if (!pages || !pages.length) {
    container.innerHTML = '<div class="empty-state"><span class="pulse-dot"></span><p class="muted">Kono page paoa jayni.<br>Facebook e page thakle login re-check koro.</p></div>';
    return;
  }
  container.innerHTML = pages.map(p => `
    <div class="page-item card" style="margin-bottom:8px;" onclick="openPage('${p.id}','${p.page_name}')">
      <div class="page-item-left">
        <div class="page-avatar">${(p.page_name || '?').trim().charAt(0).toUpperCase()}</div>
        <div class="page-item-meta">
          <strong>${p.page_name}</strong>
          <span class="muted">ID: ${p.page_id}</span>
        </div>
      </div>
      <span class="tag">${p.webhook_subscribed ? 'Subscribed' : 'Active'}</span>
    </div>
  `).join('');
}

function openPage(pageId, pageName) {
  currentPageId = pageId;
  document.getElementById('pageListView').classList.add('hidden');
  document.getElementById('pageDetailView').classList.remove('hidden');
  document.getElementById('detailPageName').innerText = pageName;
  loadRules();
  loadPosts();
}

function backToPages() {
  document.getElementById('pageDetailView').classList.add('hidden');
  document.getElementById('pageListView').classList.remove('hidden');
  currentPageId = null;
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  ['rules','posts','logs'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
  });
}

// ---- Rules ----
async function loadRules() {
  const container = document.getElementById('rulesContainer');
  const { rules } = await api(`/api/rules?page_id=${currentPageId}`);
  if (!rules || !rules.length) {
    container.innerHTML = '<div class="empty-state"><span class="pulse-dot"></span><p class="muted">Kono rule set kora hoyni.</p></div>';
    return;
  }
  container.innerHTML = rules.map(r => `
    <div class="rule-item">
      <div><span class="tag">${r.match_type}</span><strong>${r.keyword || '(any)'}</strong> ${r.active ? '' : '<span class="tag">off</span>'}</div>
      <div class="muted">Reply: ${r.comment_reply_text || '-'}</div>
      <div class="muted">Inbox: ${r.inbox_text || '-'} ${r.inbox_image_url ? '📷' : ''}</div>
      <button class="btn danger" style="padding:4px 10px;font-size:12px;margin-top:6px;" onclick="deleteRule('${r.id}')">Delete</button>
    </div>
  `).join('');
}

async function saveRule() {
  const payload = {
    page_id: currentPageId,
    match_type: document.getElementById('ruleMatchType').value,
    priority: parseInt(document.getElementById('rulePriority').value) || 0,
    keyword: document.getElementById('ruleKeyword').value,
    comment_reply_text: document.getElementById('ruleCommentReply').value,
    inbox_text: document.getElementById('ruleInboxText').value,
    inbox_image_url: document.getElementById('ruleInboxImage').value
  };
  await api('/api/rules', { method: 'POST', body: JSON.stringify(payload) });
  ['ruleKeyword','ruleCommentReply','ruleInboxText','ruleInboxImage'].forEach(id => document.getElementById(id).value = '');
  loadRules();
}

async function deleteRule(id) {
  await api(`/api/rules?id=${id}`, { method: 'DELETE' });
  loadRules();
}

// ---- Posts ----
async function loadPosts() {
  const container = document.getElementById('postsContainer');
  const { posts } = await api(`/api/posts?page_id=${currentPageId}`);
  if (!posts || !posts.length) {
    container.innerHTML = '<div class="empty-state"><span class="pulse-dot"></span><p class="muted">Kono post schedule kora nai.</p></div>';
    return;
  }
  container.innerHTML = posts.map(p => `
    <div class="post-item">
      <span class="badge-status badge-${p.status}">${p.status}</span>
      <div>${p.message || '(image only)'}</div>
      <div class="muted">Scheduled: ${new Date(p.scheduled_at).toLocaleString()}</div>
      ${p.error ? `<div class="muted" style="color:#f87171;">Error: ${p.error}</div>` : ''}
      <button class="btn danger" style="padding:4px 10px;font-size:12px;margin-top:6px;" onclick="deletePost('${p.id}')">Delete</button>
    </div>
  `).join('');
}

async function createPost() {
  const scheduled_at = document.getElementById('postTime').value;
  if (!scheduled_at) { alert('Time select korun'); return; }
  const payload = {
    page_id: currentPageId,
    message: document.getElementById('postMessage').value,
    image_url: document.getElementById('postImage').value,
    scheduled_at: new Date(scheduled_at).toISOString()
  };
  await api('/api/posts', { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('postMessage').value = '';
  document.getElementById('postImage').value = '';
  document.getElementById('postTime').value = '';
  loadPosts();
}

async function deletePost(id) {
  await api(`/api/posts?id=${id}`, { method: 'DELETE' });
  loadPosts();
}

init();
