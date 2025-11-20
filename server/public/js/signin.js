document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signin');
  const codeBox = document.getElementById('codeBox');
  const verifyForm = document.getElementById('verify');
  const msg = document.getElementById('msg');
  let pending = null;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { email: fd.get('email'), password: fd.get('password') };
    const res = await fetch('/api/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      msg.textContent = data.error || JSON.stringify(data);
      return;
    }
  });

  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pending) return msg.textContent = 'No pending signin.';
    const fd = new FormData(verifyForm);
    const code = fd.get('code');
    const res = await fetch('/api/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pending.email, code, type: pending.type }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return msg.textContent = data.error || JSON.stringify(data);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    msg.textContent = 'Signed in as ' + (data.user && data.user.email);
    codeBox.style.display = 'none';
  });

  if (localStorage.getItem('token')) {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u) msg.textContent = `Already signed in as ${u.email}`;
  }
});
