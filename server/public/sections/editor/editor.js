// Editor logic: loads Monaco from CDN and provides file management backed by localStorage.
(function(){
  const projectsKey = 'evo_projects_v1';
  let project = null;
  let currentPath = null;
  let monacoEditor = null;
  let monacoModels = {}; // path -> model
  let tabs = []; // open tabs (paths)

  function readProjects(){
    const raw = localStorage.getItem(projectsKey) || '[]';
    try{ return JSON.parse(raw); }catch(e){ return []; }
  }
  function writeProjects(arr){ localStorage.setItem(projectsKey, JSON.stringify(arr)); }

  function initUI(){
    document.getElementById('addFile').onclick = addFile;
    document.getElementById('saveFile').onclick = saveFile;
    document.getElementById('runFile').onclick = runPreview;
    document.getElementById('btnToggleAI').onclick = toggleAIPanel;
    document.getElementById('btnSettings').onclick = toggleSettings;
    document.getElementById('fileName').addEventListener('change', () => { openFile(document.getElementById('fileName').value); });
    document.addEventListener('keydown', (e)=>{ if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); saveFile(); } });
  }

  function loadProject(){
    const active = localStorage.getItem('evo_active_project');
    const arr = readProjects();
    project = arr.find(p=>p.id===active) || arr[0] || null;
    if (!project){ document.getElementById('fileList').innerHTML = '<div class="small-muted">No project loaded</div>'; return; }
    renderFiles();
    openFile(project.files[0]?.path);
  }

  function renderFiles(){
    const fl = document.getElementById('fileList');
    fl.innerHTML = project.files.map(f=>`<div class="file-row"><button class="btn-evo file-open" data-path="${escapeHtml(f.path)}"><span class="file-icon">${iconForPath(f.path)}</span><span class="file-name">${escapeHtml(f.path)}</span></button><button class="btn-evo file-del" data-path="${escapeHtml(f.path)}">Del</button></div>`).join('');
    fl.querySelectorAll('.file-open').forEach(b=>b.onclick=()=>openFile(b.getAttribute('data-path')));
    fl.querySelectorAll('.file-del').forEach(b=>b.onclick=()=>{ const p=b.getAttribute('data-path'); project.files=project.files.filter(x=>x.path!==p); persistProject(); renderFiles(); });
  }

  function openFile(path){
    if (!project) return;
    const f = project.files.find(x=>x.path===path);
    if (!f) return alert('File not found');
    currentPath = path;
    document.getElementById('fileName').value = path;
    ensureTab(path);
    const content = f.content || '';
    if (monacoEditor) {
      // create or reuse model
      if (!monacoModels[path]) {
        const lang = detectLanguage(path);
        const uri = monaco.Uri.parse('file:///' + path);
        monacoModels[path] = monaco.editor.createModel(content, lang, uri);
      }
      monacoEditor.setModel(monacoModels[path]);
    } else document.getElementById('editorFallback').value = content;
    renderTabs();
  }

  function ensureTab(path){
    if (!tabs.includes(path)) tabs.push(path);
  }

  function renderTabs(){
    const container = document.getElementById('editorTabs');
    if (!container) return;
    container.innerHTML = '';
    tabs.forEach(p => {
      const btn = document.createElement('div'); btn.className='editor-tab'+(p===currentPath?' active':'');
      btn.innerHTML = `<span class="file-icon">${iconForPath(p)}</span><span class="file-name">${escapeHtml(p)}</span>`;
      btn.onclick = () => openFile(p);
      const close = document.createElement('button'); close.textContent='×'; close.style.marginLeft='8px'; close.onclick = (e)=>{ e.stopPropagation(); closeTab(p); };
      btn.appendChild(close);
      container.appendChild(btn);
    });
  }

  function closeTab(path){
    tabs = tabs.filter(t=>t!==path);
    if (monacoModels[path]) {
      try { monacoModels[path].dispose(); } catch(e){}
      delete monacoModels[path];
    }
    if (currentPath === path) currentPath = tabs[0] || null;
    if (currentPath) openFile(currentPath); else { if (monacoEditor) monacoEditor.setValue(''); else document.getElementById('editorFallback').value = ''; }
    renderTabs();
  }

  function saveFile(){
    if (!project) return alert('No project loaded');
    const name = document.getElementById('fileName').value || currentPath;
    const content = monacoEditor ? monacoEditor.getValue() : document.getElementById('editorFallback').value;
    let f = project.files.find(x=>x.path===name);
    if (f) f.content = content; else { project.files.unshift({ path: name, content }); }
    persistProject(); renderFiles();
    flashSaved();
  }

  // detect language id for monaco based on file extension
  function detectLanguage(path){
    const ext = (path.split('.').pop() || '').toLowerCase();
    const map = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', java: 'java', html: 'html', css: 'css', json: 'json', md: 'markdown', sh: 'shell', php: 'php' };
    return map[ext] || 'plaintext';
  }

  function iconForPath(path){
    const ext = (path.split('.').pop() || '').toLowerCase();
    const icons = { js: '📄', ts: '📄', py: '🐍', html: '🌐', css: '🎨', json: '🔧', md: '📝', sh: '📜', php: '🐘' };
    return icons[ext] || '📁';
  }

  function addFile(){
    if (!project) return alert('No project loaded');
    const name = prompt('File path (e.g. src/app.js):');
    if (!name) return;
    if (project.files.find(f=>f.path===name)) { alert('File exists'); return; }
    project.files.unshift({ path: name, content: '' });
    persistProject(); renderFiles(); openFile(name);
  }

  function persistProject(){
    const arr = readProjects();
    const idx = arr.findIndex(p=>p.id===project.id);
    if (idx>=0) arr[idx]=project; else arr.unshift(project);
    writeProjects(arr);
    // attempt background sync to server if user is logged in
    try { syncToServer(); } catch (e) { /* ignore */ }
  }

  async function syncToServer(){
    const token = localStorage.getItem('token');
    if (!token) return; // not signed in
    // prefer server-side id stored on project as _serverId
    const serverId = project._serverId || project.serverId || null;
    const payload = { name: project.name, files: project.files };
    try {
      const opts = { method: serverId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) };
      const url = serverId ? `/api/projects/${serverId}` : '/api/projects';
      const res = await fetch(url, opts);
      if (!res.ok) {
        // if unauthorized, stop trying
        if (res.status === 401) return;
        console.warn('Project sync failed', await res.text());
        return;
      }
      const body = await res.json();
      const returned = body.project || body.project || body;
      // if created, server returns created project object
      if (!serverId && returned && returned.id) {
        project._serverId = returned.id;
        persistProject();
      }
    } catch (err) {
      console.warn('syncToServer error', err && err.message);
    }
  }

  function runPreview(){
    // simple preview: open new window with HTML if index.html exists otherwise show JS console
    const f = project.files.find(x=>x.path==='index.html');
    if (f){ const w = window.open(); w.document.open(); w.document.write(f.content); w.document.close(); return; }
    // otherwise create HTML with script tags for .js files and css
    const html = ['index.html','public/index.html'].map(p=>project.files.find(x=>x.path===p)).find(Boolean);
    if (html){ const w = window.open(); w.document.open(); w.document.write(html.content); w.document.close(); return; }
    alert('No index.html to preview');
  }

  function flashSaved(){
    const btn = document.getElementById('saveFile');
    const orig = btn.textContent;
    btn.textContent = 'Saved';
    setTimeout(()=>btn.textContent = orig, 900);
  }

  function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Monaco loader — loads AMD loader and then the editor
  function loadMonaco(next){
    const base = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.40.0/min/';
    const loaderUrl = base + 'vs/loader.js';
    const existing = document.querySelector(`script[src="${loaderUrl}"]`);
    if (existing){ return initMonaco(next); }
    const s = document.createElement('script');
    s.src = loaderUrl;
    s.onload = () => initMonaco(next);
    s.onerror = () => { console.warn('Monaco loader failed, using textarea fallback'); next && next(); };
    document.head.appendChild(s);
  }

  function initMonaco(next){
    if (typeof require === 'undefined') { console.warn('require not found for monaco'); next && next(); return; }
    const base = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.40.0/min/';
    try{
      require.config({ paths: { 'vs': base + 'vs' } });
      require(['vs/editor/editor.main'], function(){
        const area = document.getElementById('editorArea');
        // hide textarea fallback
        const ta = document.getElementById('editorFallback'); if (ta) ta.style.display = 'none';
        monacoEditor = monaco.editor.create(area, { value: '', language: 'javascript', theme: 'vs-dark', automaticLayout: true });
        if (project) openFile(project.files[0]?.path);
        next && next();
      });
    }catch(e){ console.warn('Monaco init failed', e); next && next(); }
  }

  // Initialize everything
  document.addEventListener('DOMContentLoaded', ()=>{
    initUI();
    // If there are no projects, create a sample one
    const arr = readProjects();
    if (arr.length===0){ const sample = { id: 'sample-1', name: 'Sample Project', files: [ { path: 'index.html', content: '<!doctype html><html><body><h1>Hello Evo</h1><script>console.log("run")</script></body></html>' }, { path: 'src/app.js', content: 'console.log("hello")' } ] }; arr.push(sample); writeProjects(arr); localStorage.setItem('evo_active_project', sample.id); }
    loadProject();
    loadMonaco();
  });

  // AI panel + settings UI
  function toggleAIPanel(){
    let panel = document.getElementById('aiPanel');
    if (!panel) createAIPanel();
    panel = document.getElementById('aiPanel');
    panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
  }

  function toggleSettings(){
    let s = document.getElementById('settingsPanel');
    if (!s) createSettings();
    s = document.getElementById('settingsPanel');
    s.style.display = s.style.display === 'block' ? 'none' : 'block';
  }

  function createSettings(){
    const s = document.createElement('div'); s.id='settingsPanel'; s.className='settings-panel';
    s.innerHTML = `
      <h4>Settings</h4>
      <div class="row"><label><input type="checkbox" id="autoSave" checked/> Autosave to local</label></div>
      <div class="row"><label><input type="checkbox" id="autoSync" /> Auto-sync to server when signed in</label></div>
      <div class="row"><label>Max AI context (chars): <input id="aiContext" type="number" value="20000" style="width:100%"/></label></div>
      <div class="row"><button class="btn-evo" id="closeSettings">Close</button></div>
    `;
    document.body.appendChild(s);
    document.getElementById('closeSettings').onclick = ()=>s.style.display='none';
  }

  function createAIPanel(){
    const panel = document.createElement('div'); panel.id='aiPanel'; panel.className='ai-panel'; panel.style.display='flex';
    panel.innerHTML = `<div class="ai-header"><strong>AI Assistant</strong><div><button id="closeAI" class="btn-evo">Close</button></div></div><div class="ai-body" id="aiBody"></div><div class="ai-input"><input id="aiInput" placeholder="Ask the agent to edit or explain code" style="flex:1;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#fff"/><button id="aiSend" class="btn-evo">Send</button></div>`;
    document.body.appendChild(panel);
    document.getElementById('closeAI').onclick = ()=>panel.style.display='none';
    document.getElementById('aiSend').onclick = sendAIMessage;
  }

  async function sendAIMessage(){
    const input = document.getElementById('aiInput').value.trim();
    if (!input) return;
    const bodyEl = document.getElementById('aiBody');
    const userMsg = document.createElement('div'); userMsg.className='ai-message user'; userMsg.textContent = input; bodyEl.appendChild(userMsg);

    // Gather context: current file and optionally other files
    const includeAll = false; // could be a setting
    const ctx = [];
    if (currentPath) {
      const content = monacoEditor ? monacoEditor.getValue() : document.getElementById('editorFallback').value;
      ctx.push({ path: currentPath, content });
    }
    // limit size
    const ctxText = ctx.map(c => `-- FILE: ${c.path}\n${c.content.slice(0, 20000)}`).join('\n\n');

    // Build messages for AI — system prompt instructs agent to reply with edits if requested
    const messages = [
      { role: 'system', content: 'You are a coding assistant with permission to suggest edits. When asked to modify files, reply with a JSON block inside triple backticks containing {"edits":[{"path":"...","content":"..."}], "explain":"..."}. Otherwise provide normal explanations. Do not call external APIs.' },
      { role: 'user', content: input + '\n\nContext:\n' + ctxText }
    ];

    // call server AI proxy
    try {
      const r = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
      const data = await r.json();
      let reply = '';
      if (data && data.choices && data.choices[0] && data.choices[0].message) reply = data.choices[0].message.content || '';
      else if (data && data.error) reply = 'AI error: ' + JSON.stringify(data.error);
      const aiMsg = document.createElement('div'); aiMsg.className='ai-message'; aiMsg.innerHTML = '<pre style="white-space:pre-wrap">'+ escapeHtml(reply) +'</pre>';
      bodyEl.appendChild(aiMsg);

      // try to parse JSON edits inside reply
      const json = extractJSON(reply);
      if (json && json.edits && Array.isArray(json.edits)) {
        const applyBtn = document.createElement('button'); applyBtn.className='btn-evo'; applyBtn.textContent='Apply Edits';
        applyBtn.onclick = () => { applyEditsFromAI(json.edits); };
        bodyEl.appendChild(applyBtn);
      }
      bodyEl.scrollTop = bodyEl.scrollHeight;
    } catch (err) {
      const aiMsg = document.createElement('div'); aiMsg.className='ai-message'; aiMsg.textContent = 'AI request failed: ' + (err && err.message);
      document.getElementById('aiBody').appendChild(aiMsg);
    }
  }

  function extractJSON(text){
    // Attempt to find a JSON block inside triple backticks or {...}
    const m = text.match(/```(?:json)?([\s\S]*?)```/m);
    let candidate = m ? m[1].trim() : text;
    // find first { and last }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start>=0 && end>start) {
      try { return JSON.parse(candidate.slice(start, end+1)); } catch (e) { return null; }
    }
    return null;
  }

  function applyEditsFromAI(edits){
    for (const e of edits) {
      const path = e.path;
      const content = e.content;
      // if edited file is open, update editor; else update project files
      let f = project.files.find(x=>x.path===path);
      if (f) { f.content = content; }
      else { project.files.unshift({ path, content }); }
    }
    persistProject();
    if (currentPath) {
      const open = project.files.find(x=>x.path===currentPath);
      if (open) {
        if (monacoEditor) monacoEditor.setValue(open.content || ''); else document.getElementById('editorFallback').value = open.content || '';
      }
    }
    alert('Applied AI edits to project (saved locally).');
  }

  function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

})();
