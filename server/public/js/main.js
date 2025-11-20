const routes = {
  '/': '/sections/home.html',
  '/home': '/sections/home.html',
  '/profile': '/sections/profile.html',
  '/editor': '/sections/editor/editor.html'
};

async function loadSection(path, push = true) {
  const url = routes[path] || routes['/'];
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Could not load section');
    const html = await r.text();
    document.getElementById('app').innerHTML = html;
    // load per-section css if present
    const cssPath = url.replace('.html', '.css');
    const existing = document.getElementById('section-style');
    if (existing) existing.remove();
    try {
      const c = await fetch(cssPath);
      if (c.ok) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssPath;
        link.id = 'section-style';
        document.head.appendChild(link);
      }
    } catch (e) {}
    bindInternalLinks();
    updateAuthUi();
    if (push) history.pushState({ path }, '', path === '/' ? '/' : path);
  } catch (err) {
    document.getElementById('app').innerHTML = '<div style="padding:24px;color:#ffd6ea">Error loading page.</div>';
  }
}

function bindInternalLinks() {
  document.querySelectorAll('[data-link]').forEach(btn => {
    btn.onclick = (e) => {
      const p = btn.getAttribute('data-link');
      loadSection(p);
    };
  });
  document.querySelectorAll('a[data-nav]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const p = a.getAttribute('href');
      loadSection(p);
    };
  });
}

function updateAuthUi() {
  const token = localStorage.getItem('token');
  const authLink = document.getElementById('authLink');
  const btnProfile = document.getElementById('btnProfile');
  if (authLink) {
    if (token) {
      authLink.href = '#';
      authLink.innerHTML = '<span>Sign out</span>';
      authLink.onclick = (e) => { e.preventDefault(); localStorage.removeItem('token'); localStorage.removeItem('user'); updateAuthUi(); loadSection('/home'); };
      if (btnProfile) btnProfile.style.display = 'inline-flex';
    } else {
      authLink.href = '/signin.html';
      authLink.innerHTML = '<span>Sign in</span>';
      authLink.onclick = null;
      if (btnProfile) btnProfile.style.display = 'inline-flex';
    }
  }
}

window.addEventListener('popstate', (ev) => {
  const path = location.pathname;
  loadSection(path, false);
});

document.addEventListener('DOMContentLoaded', () => {
  bindInternalLinks();
  const path = location.pathname === '/' ? '/' : location.pathname.replace(/\/$/, '');
  loadSection(path);
});
