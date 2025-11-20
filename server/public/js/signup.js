document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signup');
  const codeBox = document.getElementById('codeBox');
  const verifyForm = document.getElementById('verify');
  const msg = document.getElementById('msg');
  let pending = null;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { email: fd.get('email'), name: fd.get('name'), password: fd.get('password') };
    const res = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      msg.textContent = data.error || JSON.stringify(data);
      return;
    }
    pending = { email: body.email, type: 'signup' };
    msg.textContent = 'Verification code sent — check your email.';
    codeBox.style.display = 'block';
    if (data.debugCode) msg.textContent += ' (dev code: ' + data.debugCode + ')';
  });

  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pending) return msg.textContent = 'No pending signup.';
    const fd = new FormData(verifyForm);
    const code = fd.get('code');
    const res = await fetch('/api/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pending.email, code, type: pending.type }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return msg.textContent = data.error || JSON.stringify(data);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    msg.textContent = 'Signup complete — signed in as ' + (data.user && data.user.email);
    codeBox.style.display = 'none';
  });

  if (localStorage.getItem('token')) {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u) msg.textContent = `Already signed in as ${u.email}`;
  }
});
