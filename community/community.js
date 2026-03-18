/* ===== CONFIG ===== */
const REPO_OWNER = 'slickmojang11';
const REPO_NAME  = 'webman';
const HISTORY_PATH = 'community/history.json';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${HISTORY_PATH}`;
const RAW_URL  = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${HISTORY_PATH}`;
const SUPER_ADMIN_CODE = 'H7CXF9';

/* ===== SESSION (shared with parent) ===== */
function getParentSession() {
  try {
    const s = window.parent?.sessionStorage?.getItem('wm_session');
    return s ? JSON.parse(s) : null;
  } catch(e) { return null; }
}
function getGhCreds() {
  try {
    const u = window.parent?.sessionStorage?.getItem('wm_gh_user') || '';
    const p = window.parent?.sessionStorage?.getItem('wm_gh_pat')  || '';
    return { username: u, pat: p };
  } catch(e) { return { username:'', pat:'' }; }
}
function getAuthHeader() {
  const { username, pat } = getGhCreds();
  if (username && pat) return 'Basic ' + btoa(username + ':' + pat);
  if (pat) return 'token ' + pat;
  return '';
}
function getSession() { return getParentSession(); }
function isAdmin()      { const s=getSession(); return s&&['admin','superadmin'].includes(s.role); }
function isSuperAdmin() { const s=getSession(); return s&&s.role==='superadmin'; }
function roleOf(s)      { return s?.role || 'user'; }

/* ===== DATA ===== */
let history = { posts: [] };
let historySha = null;

async function loadHistory() {
  try {
    const auth = getAuthHeader();
    const headers = auth ? { 'Authorization': auth, 'Accept': 'application/vnd.github.v3+json' } : {};
    const r = await fetch(API_BASE, { headers });
    if (r.ok) {
      const d = await r.json();
      historySha = d.sha;
      history = JSON.parse(atob(d.content.replace(/\n/g, '')));
    } else if (r.status === 404) {
      history = { posts: [] };
      historySha = null;
    } else {
      throw new Error('GitHub API ' + r.status);
    }
  } catch(e) {
    // Fallback: try raw (public repo)
    try {
      const r2 = await fetch(RAW_URL + '?t=' + Date.now());
      if (r2.ok) history = await r2.json();
    } catch(_) { history = { posts: [] }; }
  }
}

async function saveHistory(commitMsg) {
  const auth = getAuthHeader();
  if (!auth) { toast('⚠ GitHub credentials required to save. Ask the repo owner to set a Submission Token.'); return false; }
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(history, null, 2))));
    const body = { message: commitMsg || 'Update community history', content };
    if (historySha) body.sha = historySha;
    const r = await fetch(API_BASE, {
      method: 'PUT',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });
    if (r.ok) {
      const d = await r.json();
      historySha = d.content?.sha || historySha;
      return true;
    }
    const err = await r.json().catch(() => ({}));
    toast('Save failed: ' + (err.message || r.status)); return false;
  } catch(e) { toast('Save error: ' + e.message); return false; }
}

/* Also try using submission token */
async function saveHistoryWithSubmissionToken(commitMsg) {
  const subTok = (() => { try { return window.parent?.localStorage?.getItem('wm_submission_token') || localStorage.getItem('wm_submission_token'); } catch(e){ return null; } })();
  const auth = subTok ? 'token ' + subTok : getAuthHeader();
  if (!auth) return false;
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(history, null, 2))));
    const body = { message: commitMsg || 'Update community', content };
    if (historySha) body.sha = historySha;
    const r = await fetch(API_BASE, {
      method: 'PUT',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.ok) { const d = await r.json(); historySha = d.content?.sha || historySha; return true; }
    return false;
  } catch(e) { return false; }
}

/* ===== RENDER ===== */
function render() {
  const feed = document.getElementById('feed');
  const posts = history.posts || [];
  const sub = document.getElementById('commSubtitle');
  sub.textContent = posts.length === 0 ? 'No posts yet — be the first!'
    : posts.length === 1 ? '1 post' : `${posts.length} posts`;

  if (!posts.length) {
    feed.innerHTML = `<div class="empty-feed"><div class="empty-icon">💬</div><p>No posts yet.<br>Start the conversation!</p></div>`;
    return;
  }

  feed.innerHTML = posts.slice().reverse().map(p => renderPost(p)).join('');
}

function avatarFor(role) {
  if (role === 'superadmin') return '👑';
  if (role === 'admin') return '🔑';
  return '👤';
}
function badgeFor(role) {
  if (role === 'superadmin') return `<span class="role-badge superadmin">Super Admin</span>`;
  if (role === 'admin')      return `<span class="role-badge admin">Admin</span>`;
  return '';
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd ago';
  return new Date(iso).toLocaleDateString();
}

function canDelete(authorCode) {
  const s = getSession();
  if (!s) return false;
  if (isSuperAdmin()) return true;
  if (isAdmin() && s.code === authorCode) return true;
  return false;
}

function renderPost(p) {
  const replies = (p.replies || []).map(r => renderReply(p.id, r)).join('');
  const repliesSection = p.replies?.length
    ? `<div class="replies-section">${replies}<div class="reply-composer-wrap" id="rw-${p.id}" style="display:none"></div></div>`
    : `<div class="replies-section" style="display:none" id="rs-${p.id}"><div class="reply-composer-wrap" id="rw-${p.id}"></div></div>`;

  const delBtn = canDelete(p.authorCode)
    ? `<button class="btn-delete-post" onclick="promptDel('post','${p.id}',null)">🗑 Delete</button>` : '';

  return `
  <div class="post-card" id="post-${p.id}">
    <div class="post-header">
      <div class="post-avatar">${avatarFor(p.role)}</div>
      <div class="post-meta">
        <div class="post-author-row">
          <span class="post-author">${escHtml(p.author || 'Anonymous')}</span>
          ${badgeFor(p.role)}
          <span class="post-time">${timeAgo(p.createdAt)}</span>
        </div>
      </div>
    </div>
    <div class="post-body">${escHtml(p.body)}</div>
    <div class="post-footer">
      <button class="btn-reply" onclick="showReplyComposer('${p.id}')">💬 Reply${p.replies?.length ? ` (${p.replies.length})` : ''}</button>
      ${delBtn}
    </div>
    ${repliesSection}
  </div>`;
}

function renderReply(postId, r) {
  const delBtn = canDelete(r.authorCode)
    ? `<button class="btn-del-reply" onclick="promptDel('reply','${postId}','${r.id}')">🗑</button>` : '';
  return `
  <div class="reply-item" id="reply-${r.id}">
    <div class="reply-avatar">${avatarFor(r.role)}</div>
    <div style="flex:1;min-width:0">
      <div class="reply-meta-row">
        <span class="reply-author">${escHtml(r.author || 'Anonymous')}</span>
        ${badgeFor(r.role)}
        <span class="reply-time">${timeAgo(r.createdAt)}</span>
      </div>
      <div class="reply-body">${escHtml(r.body)}</div>
      <div class="reply-actions">${delBtn}</div>
    </div>
  </div>`;
}

/* ===== COMPOSER ===== */
function updateComposerRole() {
  const badge = document.getElementById('compRoleBadge');
  const s = getSession();
  if (!s) { badge.style.display = 'none'; return; }
  badge.style.display = '';
  badge.className = `role-badge ${s.role}`;
  badge.textContent = s.role === 'superadmin' ? 'Super Admin' : 'Admin';
}

function updateCharCount(ta, max, countId) {
  const el = countId ? document.getElementById(countId) : ta.parentElement.querySelector('.char-count');
  if (el) el.textContent = `${ta.value.length} / ${max}`;
}

async function submitPost() {
  const name = document.getElementById('compName').value.trim();
  const body = document.getElementById('compText').value.trim();
  if (!body) { toast('Please write something first.'); return; }
  if (body.length > 1000) { toast('Post too long (max 1000 chars).'); return; }

  const s = getSession();
  const post = {
    id: genId(), author: name || 'Anonymous',
    role: s?.role || 'user', authorCode: s?.code || '',
    body, createdAt: new Date().toISOString(), replies: []
  };
  history.posts.push(post);

  const btn = document.querySelector('#mainComposer .btn-post');
  btn.disabled = true; btn.textContent = 'Posting…';

  const ok = await saveHistoryWithSubmissionToken(`New post by ${post.author}`);
  if (ok) {
    document.getElementById('compText').value = '';
    document.getElementById('compCharCount').textContent = '0 / 1000';
    render();
    toast('✓ Posted!');
  } else {
    history.posts.pop();
    toast('Failed to save. Check credentials.');
  }
  btn.disabled = false; btn.textContent = 'Post';
}

function showReplyComposer(postId) {
  // Close any open reply composers
  document.querySelectorAll('.reply-composer-wrap').forEach(w => {
    if (w.id !== `rw-${postId}`) { w.style.display = 'none'; w.innerHTML = ''; }
  });

  const wrap = document.getElementById(`rw-${postId}`);
  const rs   = document.getElementById(`rs-${postId}`) || wrap?.closest('.replies-section');

  if (!wrap) return;
  if (wrap.querySelector('.reply-composer')) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

  if (rs) rs.style.display = '';

  const s = getSession();
  const roleBadge = s ? `<span class="role-badge ${s.role}" style="display:inline-flex">${s.role==='superadmin'?'Super Admin':'Admin'}</span>` : '';

  wrap.style.display = '';
  wrap.innerHTML = `
    <div class="reply-composer" data-post="${postId}">
      <div class="comp-avatar sm">${avatarFor(s?.role || 'user')}</div>
      <div class="comp-right" style="flex:1">
        <div class="comp-meta-row">
          <input class="comp-name sm" placeholder="Your name (optional)" maxlength="32" value="${s ? escAttr(s.name||'') : ''}"/>
          ${roleBadge}
        </div>
        <textarea class="comp-text sm" placeholder="Write a reply…" rows="2" oninput="updateCharCount(this,500)"></textarea>
        <div class="comp-actions">
          <span class="char-count">0 / 500</span>
          <button class="btn-cancel-reply" onclick="cancelReply('${postId}')">Cancel</button>
          <button class="btn-post sm" onclick="submitReply('${postId}')">Reply</button>
        </div>
      </div>
    </div>`;
  wrap.querySelector('textarea')?.focus();
}

function cancelReply(postId) {
  const wrap = document.getElementById(`rw-${postId}`);
  if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
}

async function submitReply(postId) {
  const wrap = document.getElementById(`rw-${postId}`); if (!wrap) return;
  const ta   = wrap.querySelector('textarea');
  const ni   = wrap.querySelector('.comp-name');
  const body = ta?.value.trim(); if (!body) { toast('Please write something.'); return; }
  if (body.length > 500) { toast('Reply too long (max 500 chars).'); return; }
  const name = ni?.value.trim() || '';

  const post = history.posts.find(p => p.id === postId); if (!post) return;
  const s = getSession();
  const reply = {
    id: genId(), author: name || 'Anonymous',
    role: s?.role || 'user', authorCode: s?.code || '',
    body, createdAt: new Date().toISOString()
  };
  post.replies = post.replies || [];
  post.replies.push(reply);

  const btn = wrap.querySelector('.btn-post');
  btn.disabled = true; btn.textContent = '…';

  const ok = await saveHistoryWithSubmissionToken(`Reply by ${reply.author}`);
  if (ok) { render(); toast('✓ Reply posted!'); }
  else { post.replies.pop(); toast('Failed to save.'); btn.disabled = false; btn.textContent = 'Reply'; }
}

/* ===== DELETE ===== */
let _delTarget = null;
function promptDel(type, postId, replyId) {
  _delTarget = { type, postId, replyId };
  document.getElementById('delMsg').textContent = type === 'post'
    ? 'This post and all its replies will be permanently deleted.'
    : 'This reply will be permanently deleted.';
  document.getElementById('delOverlay').style.display = 'flex';
}
function cancelDel() { document.getElementById('delOverlay').style.display = 'none'; _delTarget = null; }
async function confirmDel() {
  document.getElementById('delOverlay').style.display = 'none';
  if (!_delTarget) return;
  const { type, postId, replyId } = _delTarget; _delTarget = null;
  if (type === 'post') {
    history.posts = history.posts.filter(p => p.id !== postId);
  } else {
    const post = history.posts.find(p => p.id === postId); if (!post) return;
    post.replies = post.replies.filter(r => r.id !== replyId);
  }
  const ok = await saveHistory(`Delete ${type}`);
  if (ok) { render(); toast('🗑 Deleted.'); }
  else { toast('Delete failed.'); await loadHistory(); render(); }
}

/* ===== HELPERS ===== */
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

let _toastTimer = null;
function toast(msg) {
  let el = document.getElementById('__toast');
  if (!el) { el = document.createElement('div'); el.id = '__toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/* ===== INIT ===== */
(async () => {
  await loadHistory();
  updateComposerRole();
  render();
  // Auto-refresh every 30s
  setInterval(async () => { await loadHistory(); render(); }, 30000);
})();
