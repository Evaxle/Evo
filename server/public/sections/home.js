document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('projectsList');
  async function load() {
    container.innerHTML = '<div class="small-muted">Loading projects...</div>';
    const token = localStorage.getItem('token');
    if (!token) { container.innerHTML = '<div class="small-muted">Sign in to see your projects.</div>'; return; }
    try {
      const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { container.innerHTML = '<div class="small-muted">Could not load projects.</div>'; return; }
      const list = await res.json();
      if (!list || list.length===0) { container.innerHTML = '<div class="small-muted">No projects yet.</div>'; return; }
      container.innerHTML = '<ul>' + list.map(p => `<li><strong>${p.name||p.id}</strong> <button data-id="${p.id}" class="btn-evo open">Open</button></li>`).join('') + '</ul>';
      container.querySelectorAll('button.open').forEach(b => b.onclick = async (e) => {
        const id = e.target.getAttribute('data-id');
        // fetch project and save to localStorage then navigate to editor
        const r = await fetch('/api/projects/' + id, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return alert('Failed to load project');
        const p = await r.json();
        const arr = JSON.parse(localStorage.getItem('evo_projects_v1') || '[]');
        // store server project as local and mark active
        p._serverId = p.id;
        p.id = p.id; // keep id
        arr.unshift({ id: p.id, name: p.name, files: p.data.files || p.data.files || [] });
        localStorage.setItem('evo_projects_v1', JSON.stringify(arr));
        localStorage.setItem('evo_active_project', p.id);
        location.href = '/editor';
      });
    } catch (err) { container.innerHTML = '<div class="small-muted">Error loading projects</div>'; }
  }
  load();
});
