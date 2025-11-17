async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, body: await res.json() };
}

const app = document.getElementById('app');
document.getElementById('toSignup').onclick = () => showSignup();
document.getElementById('toSignin').onclick = () => showSignin();

function showSignup() {
  app.innerHTML = `
    <h2>Sign up</h2>
    <form id="f">
      <input name="email" placeholder="email" required /> <br />
      <input name="name" placeholder="name" /> <br />
      <input name="password" placeholder="password" type="password" required /> <br />
      <button>Sign up</button>
    </form>
    <pre id="out"></pre>
  `;
  const f = document.getElementById('f');
  const out = document.getElementById('out');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const body = { email: fd.get('email'), name: fd.get('name'), password: fd.get('password') };
    const r = await postJson('/api/signup', body);
    out.textContent = JSON.stringify(r, null, 2);
    if (r.ok) localStorage.setItem('token', r.body.token);
  };
}

function showSignin() {
  app.innerHTML = `
    <h2>Sign in</h2>
    <form id="f">
      <input name="email" placeholder="email" required /> <br />
      <input name="password" placeholder="password" type="password" required /> <br />
      <button>Sign in</button>
    </form>
    <pre id="out"></pre>
  `;
  const f = document.getElementById('f');
  const out = document.getElementById('out');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const body = { email: fd.get('email'), password: fd.get('password') };
    const r = await postJson('/api/signin', body);
    out.textContent = JSON.stringify(r, null, 2);
    if (r.ok) localStorage.setItem('token', r.body.token);
  };
}

// small UI to view/save user data
const view = document.createElement('div');
view.innerHTML = `
  <h3>Me</h3>
  <button id="getme">Load me</button>
  <button id="saveme">Save demo data</button>
  <pre id="meout"></pre>
`;
app.appendChild(view);
document.addEventListener('click', async (e) => {
  if (e.target && e.target.id === 'getme') {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/me', { headers: { Authorization: token ? `Bearer ${token}` : '' } });
    const body = await res.json();
    document.getElementById('meout').textContent = JSON.stringify(body, null, 2);
  }
  if (e.target && e.target.id === 'saveme') {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify({ demo: 'hello', ts: Date.now() }) });
    const body = await res.json();
    document.getElementById('meout').textContent = JSON.stringify(body, null, 2);
  }
});
