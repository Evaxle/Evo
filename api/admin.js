async function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  opts.headers = opts.headers || {};
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && typeof opts.body === 'object') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

// On load, check admin access: call /api/admin/users — if forbidden redirect to home
window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) return window.location.href = '/';
  const r = await api('/api/admin/users');
  if (!r.ok) return window.location.href = '/';
  renderList(r.body || []);
});

document.getElementById('load').onclick = async () => {
  const filter = document.getElementById('filter').value.toLowerCase();
  const r = await api('/api/admin/users');
  if (!r.ok) return alert('Error loading: ' + JSON.stringify(r.body));
  renderList((r.body || []).filter(u => !filter || (u.email || '').toLowerCase().includes(filter)));
};

// Migration/export button
const btn = document.createElement('button');
btn.textContent = 'Export users (JSON)';
btn.style.marginLeft = '8px';
document.getElementById('load').parentNode.appendChild(btn);
btn.onclick = async () => {
  const r = await api('/api/admin/export');
  if (!r.ok) return alert('Export failed: ' + JSON.stringify(r.body));
  const blob = new Blob([JSON.stringify(r.body, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'users-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

function renderList(users) {
  const out = document.getElementById('list');
  if (!users || users.length === 0) { out.innerHTML = '<p>No users</p>'; return; }
  let html = '<table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Last Login</th><th>Data</th><th>PasswordHash</th><th>Actions</th></tr></thead><tbody>';
  for (const u of users) {
    const last = u.last_login ? new Date(u.last_login * 1000).toLocaleString() : '';
    html += `<tr data-id="${u.id}"><td><input class="email" value="${u.email || ''}"/></td><td><input class="name" value="${u.name || ''}"/></td><td><select class="role"><option value="user" ${u.role==='user'?'selected':''}>user</option><option value="admin" ${u.role==='admin'?'selected':''}>admin</option></select></td><td>${last}</td><td><textarea class="data">${JSON.stringify(u.data||{})}</textarea></td><td><code style="max-width:300px;display:block">${u.passwordHash||''}</code></td><td><button class="save">Save</button> <button class="resetpw">Set PW</button> <button class="history">History</button> <button class="delete">Delete</button></td></tr>`;
  }
  html += '</tbody></table>';
  out.innerHTML = html;

  out.querySelectorAll('.save').forEach(b => b.onclick = async (e) => {
    const row = e.target.closest('tr');
    const id = row.dataset.id;
    const email = row.querySelector('.email').value;
    const name = row.querySelector('.name').value;
    let data;
    try { data = JSON.parse(row.querySelector('.data').value); } catch (err) { return alert('Invalid JSON in data'); }
    const r = await api('/api/admin/users/' + id, { method: 'PUT', body: { email, name, data } });
    if (!r.ok) return alert('Save failed: ' + JSON.stringify(r.body));
    alert('Saved');
  });

  out.querySelectorAll('.resetpw').forEach(b => b.onclick = async (e) => {
    const row = e.target.closest('tr');
    const id = row.dataset.id;
    const pw = prompt('Set new password for this user (plaintext):');
    if (!pw) return;
    const r = await api('/api/admin/users/' + id + '/password', { method: 'POST', body: { password: pw } });
    if (!r.ok) return alert('Set password failed: ' + JSON.stringify(r.body));
    alert('Password set (hashed in DB)');
  });

  out.querySelectorAll('.role').forEach(sel => sel.onchange = async (e) => {
    const row = e.target.closest('tr');
    const id = row.dataset.id;
    const role = e.target.value;
    const r = await api('/api/admin/users/' + id + '/role', { method: 'PUT', body: { role } });
    if (!r.ok) return alert('Set role failed: ' + JSON.stringify(r.body));
    alert('Role updated');
  });

  out.querySelectorAll('.history').forEach(b => b.onclick = async (e) => {
    const row = e.target.closest('tr');
    const id = row.dataset.id;
    const r = await api('/api/admin/users/' + id + '/history');
    if (!r.ok) return alert('History failed: ' + JSON.stringify(r.body));
    const h = r.body || [];
    alert('History:\n' + h.map(x => `${new Date(x.ts*1000).toLocaleString()} ${x.event}`).join('\n'));
  });

  out.querySelectorAll('.delete').forEach(b => b.onclick = async (e) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    const row = e.target.closest('tr');
    const id = row.dataset.id;
    const r = await api('/api/admin/users/' + id, { method: 'DELETE' });
    if (!r.ok) return alert('Delete failed: ' + JSON.stringify(r.body));
    row.remove();
    alert('Deleted');
  });
}
