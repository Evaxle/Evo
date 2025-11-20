// Shared utilities: postJson and loadCurrentUser + status UI
async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const parsed = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: parsed };
}

async function loadCurrentUser() {
  const token = localStorage.getItem('token');
  let statusEl = document.getElementById('current');
  if (!statusEl) {
    const statusWrap = document.createElement('div');
    statusWrap.id = 'status';
    statusWrap.innerHTML = '<div id="current">Checking...</div><button id="signout">Sign out</button>';
    const app = document.getElementById('app') || document.body;
    app.parentNode.insertBefore(statusWrap, app);
    statusEl = document.getElementById('current');
    document.getElementById('signout').onclick = () => { localStorage.removeItem('token'); statusEl.textContent = 'Signed out'; };
  }

  if (!token) {
    statusEl.textContent = 'Not signed in';
    return null;
  }
  try {
    const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      statusEl.textContent = 'Token invalid or expired';
      return null;
    }
    const u = await res.json().catch(() => null);
    statusEl.textContent = u ? `Signed in: ${u.email} (id: ${u.id})` : 'Signed in';
    return u;
  } catch (err) {
    statusEl.textContent = 'Error fetching user';
    return null;
  }
}

// Expose to window for other scripts
window.evoUtils = { postJson, loadCurrentUser };

// Auto-run to show status if page has an #app or loads scripts
document.addEventListener('DOMContentLoaded', () => { loadCurrentUser(); });
