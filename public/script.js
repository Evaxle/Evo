// Minimal client script for projects and GitHub browsing
const qs = id => document.getElementById(id);

const API_BASE = 'http://localhost:8080';

async function api(path, opts = {}){
  const headers = opts.headers || {};
  const token = localStorage.getItem('evo_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && typeof opts.body === 'object'){
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const url = path.startsWith('http') ? path : (API_BASE + path);
  const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null } catch(e){ data = text }
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || 'Request failed');
    err.status = res.status; err.body = data;
    throw err;
  }
  return data;
}

// If redirected back from GitHub OAuth, the callback will include the token in the URL fragment
// e.g. http://localhost:3000/#gh_token=... ; read it and POST to /api/github/link to attach to the logged-in user
async function checkOAuthCallback(){
  try{
    if (!location.hash) return;
    const m = location.hash.match(/gh_token=([^&]+)/);
    if (!m) return;
    const ghToken = decodeURIComponent(m[1]);
    // remove the fragment from the URL
    history.replaceState({}, document.title, location.pathname + location.search);
    // if user is logged in, send token to backend to link account
    const localToken = localStorage.getItem('evo_token');
    if (!localToken) { console.warn('Received GitHub token but user not logged in; please login first to link.'); return }
    await api('/api/github/link', { method: 'POST', body: { token: ghToken } });
    alert('GitHub account linked successfully');
  }catch(e){ console.error('checkOAuthCallback', e); }
}

async function fetchGithubRepos(){
  try{
    const res = await api('/api/github/repos');
    return res.repos || [];
  }catch(e){ console.error('fetchGithubRepos', e); throw e }
}

function renderRepoList(repos){
  const container = qs('githubRepos');
  if (!container) return;
  container.innerHTML = '';
  if (!repos.length) { container.textContent = 'No linked repos or none available.'; return }
  repos.forEach(r => {
    const btn = document.createElement('div');
    btn.className = 'flex items-center justify-between p-2 border rounded mb-2';
    btn.innerHTML = `<div class="truncate"><strong>${r.full_name}</strong><div class="text-xs text-gray-500">${r.description || ''}</div></div>`;
    const actions = document.createElement('div');
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Tree';
    openBtn.className = 'text-sm text-blue-600';
    openBtn.onclick = () => showRepoTree(r.owner.login, r.name);
    actions.appendChild(openBtn);
    btn.appendChild(actions);
    container.appendChild(btn);
  })
}

// hierarchical lazy-loading repo tree using /contents proxy
async function showRepoTree(owner, repo){
  try{
    const ref = prompt('Branch or ref (default: main)', 'main') || 'main';

    // modal container
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/30 flex items-start justify-center p-8';
    const box = document.createElement('div');
    box.className = 'bg-white p-4 rounded w-full max-w-2xl max-h-[80vh] overflow-auto';
    box.innerHTML = `<div class="flex justify-between items-center mb-2"><strong>${owner}/${repo} — ${ref}</strong><div><button id="closeRepoTree" class="text-red-600">Close</button></div></div>`;
    const treeRoot = document.createElement('div');
    treeRoot.className = 'repo-tree';
    box.appendChild(treeRoot);
    modal.appendChild(box);
    document.body.appendChild(modal);

    document.getElementById('closeRepoTree').onclick = () => modal.remove();

    // load a path's contents and render into container
    async function loadPath(path, container) {
      try {
        container.innerHTML = '<div class="text-sm text-gray-500">Loading...</div>';
        const qp = path ? `?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}` : `?ref=${encodeURIComponent(ref)}`;
        const res = await api(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${qp}`);
        container.innerHTML = '';
        const items = res.items || [];
        // sort: directories first
        items.sort((a,b) => (a.type === b.type) ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1));
        items.forEach(item => {
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between py-1';
          const left = document.createElement('div');
          left.className = 'flex items-center gap-2';
          const name = document.createElement('div');
          name.className = 'truncate text-sm';
          name.textContent = item.name;
          left.appendChild(name);
          row.appendChild(left);
          const actions = document.createElement('div');
          if (item.type === 'dir') {
            const exp = document.createElement('button');
            exp.textContent = '▸';
            exp.className = 'text-sm text-blue-600 mr-2';
            const childWrap = document.createElement('div');
            childWrap.style.paddingLeft = '16px';
            let expanded = false;
            exp.onclick = async () => {
              if (expanded) { childWrap.innerHTML = ''; exp.textContent = '▸'; expanded = false; return }
              exp.textContent = '▾';
              expanded = true;
              childWrap.innerHTML = '<div class="text-xs text-gray-500">Loading...</div>';
              await loadPath(item.path, childWrap);
            };
            row.insertBefore(exp, left);
            row.appendChild(actions);
            container.appendChild(row);
            container.appendChild(childWrap);
          } else {
            const open = document.createElement('button');
            open.className = 'text-sm text-green-600';
            open.textContent = 'Open';
            open.onclick = async () => {
              try{
                // fetch file content via contents endpoint
                const f = await api(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?path=${encodeURIComponent(item.path)}&ref=${encodeURIComponent(ref)}`);
                const filename = item.path.split('/').pop();
                const tabs = {};
                tabs[filename] = { content: f.content || '', path: item.path, language: filename.endsWith('.js')? 'js' : filename.endsWith('.html')? 'html' : filename.endsWith('.py')? 'python':'text' };
                localStorage.setItem('savedcontent', JSON.stringify(tabs));
                localStorage.setItem('evo_current_repo', owner + '/' + repo);
                localStorage.setItem('evo_current_branch', ref);
                localStorage.removeItem('evo_open_project');
                location.href = '/';
              } catch (e) { alert('Failed to open file: ' + (e.message || e)); }
            };
            actions.appendChild(open);
            row.appendChild(actions);
            container.appendChild(row);
          }
        })
      } catch (e) {
        container.innerHTML = `<div class="text-sm text-red-600">Failed to load: ${e.message || e}</div>`;
      }
    }

    // kick off root
    await loadPath('', treeRoot);

  }catch(e){ console.error(e); alert('Failed to open repo tree: ' + (e.message || e)) }
}

async function loadProjects(){
  // placeholder: load server projects if API exists
  try{
    const res = await api('/api/projects');
    const list = qs('projectList');
    if (list){
      list.innerHTML = '';
      (res.projects||[]).forEach(p => {
        const el = document.createElement('div');
        el.className = 'p-2 border rounded mb-2';
        el.textContent = p.name;
        list.appendChild(el);
      })
    }
  }catch(e){ console.warn('loadProjects failed', e) }
}

async function showApp(){
  // bind create project if exists
  if (qs('btnCreateProject')) qs('btnCreateProject').addEventListener('click', async () => {
    const name = qs('projectName').value || 'Untitled';
    try{
      await api('/api/projects', { method: 'POST', body: { name } });
      qs('projectName').value = '';
      await loadProjects();
    }catch(e){ alert(e.message || e); }
  });

  // bind GitHub list
  if (qs('btnListGithub')){
    qs('btnListGithub').addEventListener('click', async () => {
      try{
        const repos = await fetchGithubRepos();
        renderRepoList(repos);
      }catch(e){ alert('Failed to list GitHub repos: ' + (e.message || e)); }
    });
  }

  await loadProjects();
}

// initialize app view if projects.html
document.addEventListener('DOMContentLoaded', () => { checkOAuthCallback().then(()=>{ if (qs('app') || qs('auth')) showApp(); }); });
