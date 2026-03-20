// api/gh.js — Vercel serverless function
// Proxies GitHub Contents API calls so the PAT never has to be stored in the repo.
//
// Required Vercel environment variables (set in Vercel dashboard → Project → Settings → Environment Variables):
//   WM_PAT      — GitHub PAT (classic with `repo` scope, or fine-grained with Contents: read+write)
//   WM_SATOKEN  — 6-character Super Admin code
//
// Supported POST actions (sent as JSON body):
//   { action: "config" }
//     → { satoken }   — returns only the SAToken; PAT is never exposed to the browser
//
//   { action: "getFile", path: "some/file.json" }
//     → { sha }       — returns current file SHA (null if file doesn't exist yet)
//
//   { action: "putFile", path: "some/file.json", content: "<base64>", message: "commit msg", sha: "<sha|null>" }
//     → { ok: true }  — creates or updates the file

const REPO = 'slickmojang11/webman';

function authHeader(pat) {
  return pat.startsWith('github_pat_') ? `Bearer ${pat}` : `token ${pat}`;
}

export default async function handler(req, res) {
  // Only POST is accepted
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, path: filePath, content, sha, message } = req.body || {};

  // ── CONFIG ────────────────────────────────────────────────────────────────
  if (action === 'config') {
    const satoken = (process.env.WM_SATOKEN || '').trim().toUpperCase();
    // PAT is intentionally NOT returned — it stays server-side only
    return res.status(200).json({ satoken });
  }

  // ── All other actions require the PAT ─────────────────────────────────────
  const pat = (process.env.WM_PAT || '').trim();
  if (!pat) {
    return res.status(503).json({ error: 'WM_PAT is not configured in Vercel environment variables.' });
  }

  const auth = authHeader(pat);
  const ghBase = `https://api.github.com/repos/${REPO}/contents`;

  // ── GET FILE (fetch SHA) ──────────────────────────────────────────────────
  if (action === 'getFile') {
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`${ghBase}/${encodedPath}`, {
      headers: { Authorization: auth, Accept: 'application/vnd.github.v3+json' }
    });
    if (r.ok) {
      const d = await r.json();
      return res.status(200).json({ sha: d.sha });
    }
    if (r.status === 404) {
      return res.status(200).json({ sha: null }); // file doesn't exist yet — not an error
    }
    const err = await r.json().catch(() => ({}));
    return res.status(r.status).json({ error: err.message || `GitHub GET failed (${r.status})` });
  }

  // ── PUT FILE (create or update) ───────────────────────────────────────────
  if (action === 'putFile') {
    if (!filePath || !content || !message) {
      return res.status(400).json({ error: 'Missing path, content, or message' });
    }
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const body = { message, content };
    if (sha) body.sha = sha; // required by GitHub API when updating an existing file
    const r = await fetch(`${ghBase}/${encodedPath}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.ok) return res.status(200).json({ ok: true });
    const err = await r.json().catch(() => ({}));
    return res.status(r.status).json({ error: err.message || `GitHub PUT failed (${r.status})` });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
