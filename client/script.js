// Use PHP backend API for auth and project management (dev host: http://localhost:8080)
const apiBase = 'http://localhost:8080/api';

function qs(id) { return document.getElementById(id); }

function setToken(t) { localStorage.setItem('evo_token', t); }
function getToken() { return localStorage.getItem('evo_token'); }
function clearToken() { localStorage.removeItem('evo_token'); }

async function api(path, opts = {}){
  opts.headers = opts.headers || {};
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer '+token;
  if (opts.body && typeof opts.body === 'object') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(apiBase + path, opts);
  if (res.status === 401) throw new Error('unauthenticated');
  return res.json();
}

// index.html logic
if (qs('btnRegister')) {
  qs('btnRegister').addEventListener('click', async () => {
    try{
      const email = qs('regEmail').value;
      const password = qs('regPassword').value;
      const res = await api('/auth/register', { method: 'POST', body: { email, password } });
      setToken(res.token);
      showApp();
    }catch(e){ alert(e.message || e); }
  });
}

if (qs('btnLogin')) {
  qs('btnLogin').addEventListener('click', async () => {
    try{
      const email = qs('loginEmail').value;
      const password = qs('loginPassword').value;
      const res = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(res.token);
      showApp();
    }catch(e){ alert(e.message || e); }
  });
}

if (qs('btnConnectGithub')) {
  qs('btnConnectGithub').addEventListener('click', () => {
    // Redirect user to PHP backend GitHub connect endpoint which starts the OAuth flow
    window.location.href = 'http://localhost:8080/github/connect';
  })
}

if (qs('btnLogout')) qs('btnLogout').addEventListener('click', () => { clearToken(); location.reload(); });

async function showApp(){
  try{
    const token = getToken();
    if(!token) return;
    // decode minimal info from JWT (base64 payload)
    const payload = JSON.parse(atob(token.split('.')[1]));
    qs('me').textContent = payload.email || '';
    qs('auth').classList.add('hidden');
    qs('app').classList.remove('hidden');
    await loadProjects();
  }catch(e){ console.error(e); }
}

async function loadProjects(){
  try{
  const res = await api('/projects');
    const list = qs('projectsList');
    list.innerHTML = '';
    res.projects.forEach(p => {
      const li = document.createElement('li');
      li.className = 'flex items-center justify-between';
      li.innerHTML = `<span class="truncate">${p.name}</span><div class="flex gap-2"><button class="open text-sm text-blue-600" data-id="${p.id}">Open</button></div>`;
      list.appendChild(li);
    });
    document.querySelectorAll('.open').forEach(btn => btn.addEventListener('click', e => {
      const id = e.target.dataset.id;
      localStorage.setItem('evo_open_project', id);
      location.href = '/editor.html';
    }));
  }catch(e){ console.error(e); }
}

if (qs('btnCreateProject')) qs('btnCreateProject').addEventListener('click', async () => {
  const name = qs('projectName').value || 'Untitled';
  try{
    await api('/projects', { method: 'POST', body: { name } });
    qs('projectName').value = '';
    await loadProjects();
  }catch(e){ alert(e.message || e); }
});

// editor.html logic
if (qs('btnBack')) qs('btnBack').addEventListener('click', () => { location.href = '/'; });

async function loadProjectToEditor(){
  const id = localStorage.getItem('evo_open_project');
  if (!id) { qs('projName').textContent = 'No project selected'; return; }
  try{
    const res = await api('/projects/' + id);
    qs('projName').textContent = res.project.name;
    qs('editor').value = res.project.content || '';
    qs('btnSave').onclick = async () => {
      qs('saveStatus').textContent = 'Saving...';
      try{
        const content = qs('editor').value;
        await api('/projects/' + id, { method: 'PUT', body: { content } });
        qs('saveStatus').textContent = 'Saved';
        setTimeout(()=> qs('saveStatus').textContent = '', 1500);
      }catch(e){ qs('saveStatus').textContent = 'Save failed'; }
    };
  }catch(e){ console.error(e); }
}

if (location.pathname.endsWith('/editor.html') || location.pathname.endsWith('/editor')){
  showApp().then(loadProjectToEditor);
} else {
  showApp();
}
