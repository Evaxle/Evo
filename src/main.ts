import './style/global.css';
import { bus, EV } from './core/EventEmitter';
import { commands } from './core/commands';
import { icons } from './core/icons';
import { SettingsStore } from './core/SettingsStore';
import { FileSystem, emptyRoot, genId } from './fs/FileSystem';
import { WorkspaceStore } from './fs/WorkspaceStore';
import { EditorManager } from './editor/EditorManager';
import { TitleBar } from './ui/TitleBar';
import { ActivityBar, type ViewId } from './ui/ActivityBar';
import { Sidebar } from './ui/Sidebar';
import { ExplorerView } from './ui/ExplorerView';
import { SearchView } from './ui/SearchView';
import { EditorTabs } from './ui/EditorTabs';
import { StatusBar } from './ui/StatusBar';
import { WelcomeView } from './ui/WelcomeView';
import { AuthScreen } from './ui/AuthScreen';
import { HomeScreen } from './ui/HomeScreen';
import { GitHubView, type RepoSession } from './ui/GitHubView';
import { showQuickPick } from './ui/QuickPick';
import { showSettings } from './ui/SettingsModal';
import { showModal } from './ui/Modal';
import { toast } from './ui/Toast';
import { showLoading } from './ui/LoadingOverlay';
import {
  buildTreeFromDropped,
  pickFiles,
  pickFolder,
  readDroppedDataTransfer,
  readFileAsText,
} from './fs/LocalFiles';
import { cloudEnabled } from './lib/supabase';
import { getSessionUser, logout, onAuthStateChange } from './lib/auth';
import {
  createProject,
  getProject,
  loadCloudEditorState,
  loadCloudSettings,
  saveCloudEditorState,
  saveCloudSettings,
  saveProject,
} from './lib/cloud';
import { listRepos, loadRepoTree } from './lib/github';
import type { User } from '@supabase/supabase-js';
import type { FSNode } from './core/types';

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  app.className = 'evo-app';

  // ---- Core services -----------------------------------------------------
  const settings = new SettingsStore();
  await settings.init();

  const fs = new FileSystem();
  const workspaces = new WorkspaceStore(fs);
  await workspaces.init();

  // ---- Top-level screen containers ---------------------------------------
  const authRoot = document.createElement('div');
  authRoot.className = 'evo-auth-root';
  const homeRoot = document.createElement('div');
  homeRoot.className = 'evo-home-root';

  const titleBarRoot = document.createElement('div');
  titleBarRoot.className = 'evo-shell-title';
  const body = document.createElement('div');
  body.className = 'evo-body';
  const main = document.createElement('main');
  main.className = 'evo-main';
  const editorArea = document.createElement('div');
  editorArea.className = 'evo-editor-area';
  const tabsRoot = document.createElement('div');
  tabsRoot.className = 'evo-tabs-root';
  const editorHost = document.createElement('div');
  editorHost.className = 'evo-editor-host';
  const welcomeRoot = document.createElement('div');
  welcomeRoot.className = 'evo-welcome-root';
  editorArea.appendChild(tabsRoot);
  editorArea.appendChild(editorHost);
  editorArea.appendChild(welcomeRoot);
  main.appendChild(editorArea);
  const statusRoot = document.createElement('div');
  statusRoot.className = 'evo-shell-status';

  app.appendChild(authRoot);
  app.appendChild(homeRoot);
  app.appendChild(titleBarRoot);
  app.appendChild(body);

  const activityRoot = document.createElement('div');
  activityRoot.className = 'evo-activity-root';
  const sidebarRoot = document.createElement('div');
  sidebarRoot.className = 'evo-sidebar-root';
  body.appendChild(activityRoot);
  body.appendChild(sidebarRoot);
  body.appendChild(main);
  app.appendChild(statusRoot);

  // ---- Editor ------------------------------------------------------------
  const editor = new EditorManager(fs, settings, editorHost);
  editor.init();

  // ---- UI ----------------------------------------------------------------
  const titleBar = new TitleBar(titleBarRoot, () => {
    const node = fs.getNode(editor.activeNodeId ?? '');
    return node?.name ?? null;
  });
  titleBar.setWorkspace(fs.root.name);

  const sidebar = new Sidebar(sidebarRoot);
  const searchView = new SearchView(sidebarRoot, fs, (id, pos) =>
    openFile(id, pos),
  );

  function openFile(nodeId: string, position?: { line: number; col: number }): void {
    void (async () => {
      await editor.openNode(nodeId);
      bus.emit(EV.EXPLORER_REVEAL, nodeId);
      if (position) {
        await new Promise((r) => setTimeout(r, 150));
        editor.setPosition(position.line, position.col);
      }
    })();
  }

  function moveNode(id: string, parentId: string): void {
    if (fs.move(id, parentId)) {
      bus.emit(EV.FS_CHANGED, fs.root);
      editor.reconcile();
    }
  }

  const explorer = new ExplorerView(sidebarRoot, fs, openFile, moveNode);
  const githubView = new GitHubView(sidebarRoot, fs, openFile);

  const viewRegistry: Record<ViewId, HTMLElement> = {
    home: placeholderView('Home', 'Go back to your projects.', icons.home),
    explorer: explorer.el,
    search: searchView.el,
    'source-control': githubView.el,
    run: placeholderView('Run and Debug', 'Run configurations are coming soon.', icons.run),
    extensions: placeholderView(
      'Extensions',
      'The marketplace is coming soon.',
      icons.extensions,
    ),
  };

  const activityBar = new ActivityBar(
    activityRoot,
    (view) => {
      if (view) {
        sidebar.setView(view, viewRegistry[view]);
        if (view === 'source-control') void githubView.render();
      } else {
        sidebar.setView(null, null);
      }
    },
    () => void goHome(),
  );
  activityBar.setActive('explorer');
  sidebar.setView('explorer', explorer.el);
  const tabs = new EditorTabs(tabsRoot, editor);
  const statusBar = new StatusBar(statusRoot, editor, settings, fs);
  void tabs;
  void statusBar;
  const welcome = new WelcomeView(welcomeRoot, workspaces, (id) => {
    void workspaces.open(id).then(() => {
      titleBar.setWorkspace(fs.root.name);
      bus.emit(EV.WORKSPACE_CHANGED, fs.root.name);
      bus.emit(EV.FS_CHANGED, fs.root);
      editor.reconcile();
      explorer.render();
      showEditor();
    });
  });
  void welcome;

  // ---- Welcome / editor visibility ---------------------------------------
  const toggleWelcome = () => {
    const hasTab = editor.activeNodeId !== null;
    welcomeRoot.classList.toggle('hidden', hasTab);
    editorHost.classList.toggle('hidden', !hasTab);
  };
  bus.on(EV.TAB_ACTIVATED, toggleWelcome);
  bus.on(EV.TAB_CLOSED, toggleWelcome);
  toggleWelcome();

  // ---- App state ---------------------------------------------------------
  let user: User | null = null;
  let signedIn = false;
  let guestMode = false;
  let currentCloudProjectId: string | null = null;
  let repoSession: RepoSession | null = null;
  let authScreen: AuthScreen | null = null;
  let homeScreen: HomeScreen | null = null;

  // ---- Cloud autosave (debounced) ----------------------------------------
  let cloudSaveTimer: number | null = null;
  function queueCloudSave(): void {
    if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = window.setTimeout(() => {
      cloudSaveTimer = null;
      if (signedIn && currentCloudProjectId) {
        void saveProject(currentCloudProjectId, { root: fs.root });
      } else {
        void workspaces.autosave();
      }
    }, 800);
  }

  let editorStateTimer: number | null = null;
  function queueEditorStateSave(): void {
    if (!signedIn || !currentCloudProjectId) return;
    if (editorStateTimer) clearTimeout(editorStateTimer);
    editorStateTimer = window.setTimeout(() => {
      editorStateTimer = null;
      void saveCloudEditorState(currentCloudProjectId!, editor.getState());
    }, 500);
  }
  bus.on(EV.TABS_CHANGED, queueEditorStateSave);
  bus.on(EV.TAB_ACTIVATED, queueEditorStateSave);
  bus.on(EV.TAB_CLOSED, queueEditorStateSave);
  fs.changed.on(queueCloudSave);

  // ---- Screen switching --------------------------------------------------
  function showScreen(screen: 'auth' | 'home' | 'editor'): void {
    authRoot.classList.toggle('hidden', screen !== 'auth');
    homeRoot.classList.toggle('hidden', screen !== 'home');
    titleBarRoot.classList.toggle('hidden', screen !== 'editor');
    body.classList.toggle('hidden', screen !== 'editor');
    statusRoot.classList.toggle('hidden', screen !== 'editor');
  }

  function showAuth(): void {
    showScreen('auth');
    activityBar.hideForAuth();
    if (!authScreen) {
      authScreen = new AuthScreen(authRoot, {
        onAuthenticated: (username) => {
          void getSessionUser().then((u) => {
            if (u) void handleUser(u);
          });
          toast(`Welcome, @${username}!`, 'success');
        },
        onGuest: () => {
          guestMode = true;
          showHome();
        },
      });
    }
  }

  function refreshHome(): void {
    if (!homeScreen) {
      homeScreen = new HomeScreen(homeRoot, {
        username: user?.user_metadata?.username as string | undefined ?? user?.email ?? null,
        signedIn,
        onOpenCloudProject: (id) => void openCloudProject(id),
        onCreateProject: (name) => void createProjectFlow(name),
        onOpenLocalWorkspace: (id) => void openLocalWorkspace(id),
        onOpenLocalFolder: () => void openFolder(),
        onOpenSettings: () => showSettings(settings),
        onLogout: () => void logout(),
        onLoadRepo: (owner, repo, branch) => void loadRepoIntoEvo(owner, repo, branch),
      });
    } else {
      homeScreen.opts.username = user?.user_metadata?.username as string | undefined ?? user?.email ?? null;
      homeScreen.opts.signedIn = signedIn;
    }
    void workspaces.list().then((list) => homeScreen!.setLocalWorkspaces(list));
  }

  function showHome(): void {
    showScreen('home');
    activityBar.show();
    activityBar.setActive(null);
    sidebar.setView(null, null);
    refreshHome();
  }

  function showEditor(): void {
    showScreen('editor');
    activityBar.show();
  }

  // ---- Auth handling -----------------------------------------------------
  async function handleUser(u: User | null): Promise<void> {
    user = u;
    signedIn = !!u;
    const username = (u?.user_metadata?.username as string | undefined) ?? u?.email ?? '';
    activityBar.setSignedIn(signedIn, username);

    if (signedIn) {
      const cloudSettings = await loadCloudSettings();
      if (cloudSettings) settings.update(cloudSettings);
      if (guestMode || currentCloudProjectId) {
        // stay in editor if a project is open
        if (!currentCloudProjectId) showHome();
      } else {
        showHome();
      }
    } else {
      if (!guestMode) showAuth();
    }
  }

  // ---- Project / repo flows ----------------------------------------------
  function applyFsRoot(root: FSNode, name: string): void {
    fs.root = root;
    fs.reindex();
    editor.closeAll();
    bus.emit(EV.WORKSPACE_CHANGED, name);
    bus.emit(EV.FS_CHANGED, fs.root);
    titleBar.setWorkspace(name);
    explorer.render();
  }

  async function openCloudProject(id: string): Promise<void> {
    const loading = showLoading('Opening project…');
    try {
      const p = await getProject(id);
      if (!p || !p.root) {
        toast('Project could not be loaded.', 'error');
        return;
      }
      await saveLocalEditorState();
      applyFsRoot(p.root, p.name);
      currentCloudProjectId = id;
      repoSession = null;
      githubView.setSession(null);
      const state = await loadCloudEditorState(id);
      await editor.restoreFromState(state);
      showEditor();
      activityBar.setActive('explorer');
      sidebar.setView('explorer', explorer.el);
    } finally {
      loading.done();
    }
  }

  async function createProjectFlow(name: string): Promise<void> {
    const loading = showLoading('Creating project…');
    try {
      if (signedIn && cloudEnabled) {
        const root = emptyRoot();
        root.name = name;
        const p = await createProject(name, root);
        if (!p) {
          toast('Failed to create project.', 'error');
          return;
        }
        currentCloudProjectId = p.id;
        applyFsRoot(p.root ?? root, name);
        repoSession = null;
        githubView.setSession(null);
        editor.closeAll();
        showEditor();
        activityBar.setActive('explorer');
        sidebar.setView('explorer', explorer.el);
        toast(`Created project "${name}"`, 'success');
      } else {
        await workspaces.createNew(name);
        await workspaces.save(name);
        currentCloudProjectId = null;
        applyFsRoot(fs.root, name);
        repoSession = null;
        githubView.setSession(null);
        editor.closeAll();
        showEditor();
        activityBar.setActive('explorer');
        sidebar.setView('explorer', explorer.el);
        toast(`Created workspace "${name}"`, 'success');
      }
    } finally {
      loading.done();
    }
  }

  async function openLocalWorkspace(id: string): Promise<void> {
    currentCloudProjectId = null;
    await workspaces.open(id);
    repoSession = null;
    githubView.setSession(null);
    applyFsRoot(fs.root, fs.root.name);
    editor.closeAll();
    showEditor();
    activityBar.setActive('explorer');
    sidebar.setView('explorer', explorer.el);
  }

  async function loadRepoIntoEvo(owner: string, repo: string, branch: string): Promise<void> {
    const loading = showLoading(`Loading ${owner}/${repo}…`);
    try {
      const tree = await loadRepoTree(owner, repo, branch);
      if (!tree) {
        toast('Could not load the repository.', 'error');
        return;
      }
      const snapshot = new Map<string, string>();
      const walk = (n: FSNode, prefix: string) => {
        const path = prefix ? `${prefix}/${n.name}` : n.name;
        if (n.type === 'file') snapshot.set(path, n.content);
        else n.children?.forEach((c) => walk(c, path));
      };
      walk(tree, '');

      repoSession = { owner, repo, branch, snapshot };
      githubView.setSession(repoSession);
      currentCloudProjectId = null;
      applyFsRoot(tree, repo);
      editor.closeAll();
      showEditor();
      activityBar.setActive('source-control');
      sidebar.setView('source-control', githubView.el);
      void githubView.render();
      toast(`Loaded ${owner}/${repo} on ${branch}`, 'success');
    } finally {
      loading.done();
    }
  }

  async function goHome(): Promise<void> {
    if (currentCloudProjectId && signedIn) {
      await saveProject(currentCloudProjectId, { root: fs.root });
    }
    currentCloudProjectId = null;
    showHome();
  }

  async function saveLocalEditorState(): Promise<void> {
    // keeps the previous project's open tabs in IndexedDB
    editor.persistTabs();
  }

  // ---- Events ------------------------------------------------------------
  bus.on(EV.WORKSPACE_CHANGED, (name: string) => titleBar.setWorkspace(name));
  bus.on(EV.SIDEBAR_CHANGED, () => editor.layout());

  // ---- Commands ----------------------------------------------------------
  registerCommands();

  function registerCommands(): void {
    commands.register({
      id: 'workbench.action.openCommandPalette',
      title: 'Show All Commands',
      category: 'View',
      keybinding: 'Ctrl+Shift+P',
      run: showPalette,
    });
    commands.register({
      id: 'workbench.action.quickOpen',
      title: 'Go to File...',
      category: 'Go',
      keybinding: 'Ctrl+P',
      run: quickOpen,
    });
    commands.register({
      id: 'file.new',
      title: 'New File',
      category: 'File',
      keybinding: 'Ctrl+N',
      run: newFile,
    });
    commands.register({
      id: 'file.save',
      title: 'Save',
      category: 'File',
      keybinding: 'Ctrl+S',
      run: () => void editor.saveNode(),
    });
    commands.register({
      id: 'file.saveAll',
      title: 'Save All',
      category: 'File',
      keybinding: 'Ctrl+K S',
      run: () => void editor.saveAll(),
    });
    commands.register({
      id: 'file.close',
      title: 'Close Editor',
      category: 'File',
      keybinding: 'Ctrl+W',
      run: () => {
        const id = editor.activeNodeId;
        if (id) editor.close(id);
      },
    });
    commands.register({
      id: 'file.openFile',
      title: 'Open File...',
      category: 'File',
      keybinding: 'Ctrl+O',
      run: () => void openLocalFiles(),
    });
    commands.register({
      id: 'file.openFolder',
      title: 'Open Folder...',
      category: 'File',
      keybinding: 'Ctrl+K Ctrl+O',
      run: () => void openFolder(),
    });
    commands.register({
      id: 'explorer.newFile',
      title: 'New File',
      category: 'Explorer',
      run: () => void explorer.createChild('root', 'file'),
    });
    commands.register({
      id: 'explorer.newFolder',
      title: 'New Folder',
      category: 'Explorer',
      run: () => void explorer.createChild('root', 'folder'),
    });
    commands.register({
      id: 'explorer.refresh',
      title: 'Refresh Explorer',
      category: 'Explorer',
      run: () => {
        bus.emit(EV.FS_CHANGED, fs.root);
        explorer.render();
      },
    });
    commands.register({
      id: 'workspace.new',
      title: 'New Workspace',
      category: 'Workspace',
      run: () => void newWorkspace(),
    });
    commands.register({
      id: 'workbench.action.toggleSidebar',
      title: 'Toggle Side Bar Visibility',
      category: 'View',
      keybinding: 'Ctrl+B',
      run: () => sidebar.toggle(),
    });
    commands.register({
      id: 'workbench.action.settings',
      title: 'Open Settings',
      category: 'Preferences',
      keybinding: 'Ctrl+,',
      run: () => showSettings(settings),
    });
    commands.register({
      id: 'workbench.action.home',
      title: 'Go to Home',
      category: 'View',
      run: () => void goHome(),
    });
    commands.register({
      id: 'workbench.action.signIn',
      title: 'Sign In / Sign Up',
      category: 'Account',
      run: () => {
        if (signedIn) {
          toast('You are already signed in.', 'info');
        } else {
          showAuth();
        }
      },
    });
    commands.register({
      id: 'workbench.action.signOut',
      title: 'Sign Out',
      category: 'Account',
      run: async () => {
        guestMode = false;
        currentCloudProjectId = null;
        repoSession = null;
        githubView.setSession(null);
        await logout();
      },
    });
    commands.register({
      id: 'workbench.action.openGitHub',
      title: 'Open GitHub',
      category: 'View',
      run: () => {
        showEditor();
        activityBar.setActive('source-control');
        sidebar.setView('source-control', githubView.el);
        void githubView.render();
      },
    });
    commands.register({
      id: 'workbench.action.resetData',
      title: 'Reset Local Data',
      category: 'Workspace',
      run: () => void resetData(),
    });
    commands.register({
      id: 'workbench.action.preview',
      title: 'Open Preview',
      category: 'View',
      run: (nodeId?: string) => void openPreview(nodeId),
    });
    commands.register({
      id: 'view.switchToExplorer',
      title: 'Show Explorer',
      category: 'View',
      run: () => switchView('explorer'),
    });
    commands.register({
      id: 'view.switchToSearch',
      title: 'Show Search',
      category: 'View',
      keybinding: 'Ctrl+Shift+F',
      run: () => switchView('search'),
    });
    commands.register({
      id: 'github.commitAll',
      title: 'Commit & Push to GitHub',
      category: 'GitHub',
      run: () => {
        showEditor();
        activityBar.setActive('source-control');
        sidebar.setView('source-control', githubView.el);
        void githubView.render();
        toast('Enter a commit message in the Source Control panel.', 'info');
      },
    });
    commands.register({
      id: 'github.loadRepos',
      title: 'Load GitHub Repository',
      category: 'GitHub',
      run: () => void pickRepo(),
    });
  }

  // ---- Command helpers ---------------------------------------------------
  function showPalette(): void {
    const items = commands.all().map((cmd) => ({
      id: cmd.id,
      label: cmd.title,
      icon: cmd.category === 'File' ? icons.file : icons.chevronRight,
      description: cmd.keybinding ?? cmd.category,
      group: cmd.category,
      onSelect: () => void commands.execute(cmd.id),
    }));
    showQuickPick({
      placeholder: 'Type a command to run...',
      items,
    });
  }

  function quickOpen(): void {
    const files: FSNode[] = [];
    const walk = (n: FSNode) => {
      if (n.type === 'file') files.push(n);
      n.children?.forEach(walk);
    };
    walk(fs.root);
    if (!files.length) {
      toast('No files in this workspace yet', 'info');
      return;
    }
    showQuickPick({
      placeholder: 'Go to file...',
      items: files.map((f) => ({
        id: f.id,
        label: f.name,
        description: fs.getPath(f.id),
        icon: icons.file,
        onSelect: () => openFile(f.id),
      })),
    });
  }

  async function pickRepo(): Promise<void> {
    const repos = await listRepos();
    if (!repos.length) {
      toast('No repositories found. Link your GitHub account first.', 'info');
      return;
    }
    showQuickPick({
      placeholder: 'Select a repository to load...',
      items: repos.slice(0, 50).map((r) => ({
        id: r.full_name,
        label: r.full_name,
        description: r.default_branch,
        icon: icons.branch,
        onSelect: () => void loadRepoIntoEvo(r.owner, r.name, r.default_branch),
      })),
    });
  }

  function switchView(view: ViewId): void {
    activityBar.setActive(view);
    sidebar.setView(view, viewRegistry[view]);
    if (view === 'search') searchView.focus();
  }

  function newFile(): void {
    const base = 'untitled';
    let name = 'untitled-1.txt';
    let i = 2;
    while (fs.getNodeByPath('/' + name)) {
      name = `${base}-${i}.txt`;
      i++;
    }
    const node = fs.createFile('root', name, '');
    if (node) {
      editor.openNode(node.id);
      bus.emit(EV.EXPLORER_REVEAL, node.id);
    }
  }

  async function newWorkspace(): Promise<void> {
    const res = await showModal({
      title: 'New Workspace',
      placeholder: 'workspace name',
      confirmText: 'Create',
    });
    if (!res.ok || !res.value.trim()) return;
    await workspaces.createNew(res.value.trim());
    titleBar.setWorkspace(fs.root.name);
    bus.emit(EV.WORKSPACE_CHANGED, fs.root.name);
    bus.emit(EV.FS_CHANGED, fs.root);
    editor.closeAll();
    explorer.render();
    showEditor();
    toast(`Created workspace "${res.value.trim()}"`, 'success');
  }

  async function resetData(): Promise<void> {
    const res = await showModal({
      title: 'Reset Local Data',
      message:
        'This clears all local files, tabs and settings on this device. Cloud projects are not affected.',
      confirmText: 'Reset',
      cancelText: 'Cancel',
    });
    if (!res.ok) return;
    localStorage.clear();
    indexedDB.deleteDatabase('evo-db');
    location.reload();
  }

  async function openLocalFiles(): Promise<void> {
    try {
      const nodes = await pickFiles();
      for (const n of nodes) {
        const node = fs.createFile('root', n.name, '');
        if (!node) continue;
        node.external = true;
        node.fileHandle = n.fileHandle;
        editor.openNode(node.id);
      }
      if (nodes.length) {
        toast(`Opened ${nodes.length} file(s)`, 'success');
        showEditor();
      }
    } catch {
      const files = await inputFiles(false);
      for (const f of files) {
        const node = fs.createFile('root', f.name, '');
        if (!node) continue;
        void readFileAsText(f).then((c) => {
          fs.updateContent(node.id, c);
          fs.persist();
          editor.openNode(node.id);
        });
      }
      if (files.length) {
        toast(`Opened ${files.length} file(s)`, 'success');
        showEditor();
      }
    }
  }

  async function openFolder(): Promise<void> {
    try {
      const folder = await pickFolder();
      if (folder) {
        fs.root = folder;
        fs.reindex();
        editor.closeAll();
        repoSession = null;
        githubView.setSession(null);
        bus.emit(EV.WORKSPACE_CHANGED, folder.name);
        bus.emit(EV.FS_CHANGED, fs.root);
        titleBar.setWorkspace(folder.name);
        explorer.render();
        showEditor();
        activityBar.setActive('explorer');
        sidebar.setView('explorer', explorer.el);
        toast(`Opened folder "${folder.name}"`, 'success');
      }
    } catch {
      const files = await inputFiles(true);
      if (!files.length) return;
      const folderName =
        files[0].webkitRelativePath?.split('/')[0] || 'imported-folder';
      fs.root = buildVirtualTree(files, folderName);
      fs.reindex();
      editor.closeAll();
      repoSession = null;
      githubView.setSession(null);
      bus.emit(EV.WORKSPACE_CHANGED, folderName);
      bus.emit(EV.FS_CHANGED, fs.root);
      titleBar.setWorkspace(folderName);
      explorer.render();
      showEditor();
      activityBar.setActive('explorer');
      sidebar.setView('explorer', explorer.el);
      toast(`Imported folder "${folderName}"`, 'success');
    }
  }

  function buildVirtualTree(files: File[], name: string): FSNode {
    const makeNode = (kind: 'file' | 'folder', n: string): FSNode => ({
      id: `t-${Math.random().toString(36).slice(2, 10)}-${n}`,
      name: n,
      type: kind,
      children: [],
      content: '',
      language: kind === 'folder' ? 'plaintext' : guessLang(n),
      external: false,
    });
    const rootNode = makeNode('folder', name);
    for (const file of files) {
      const parts = file.webkitRelativePath.split('/').slice(1);
      let cursor = rootNode;
      parts.slice(0, -1).forEach((p) => {
        let child = cursor.children.find((c) => c.name === p);
        if (!child) {
          child = makeNode('folder', p);
          cursor.children.push(child);
        }
        cursor = child;
      });
      const fileName = parts[parts.length - 1];
      const node = makeNode('file', fileName);
      void readFileAsText(file).then((c) => {
        fs.updateContent(node.id, c);
        fs.persist();
      });
      cursor.children.push(node);
    }
    return rootNode;
  }

  function inputFiles(directory: boolean): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      if (directory) (input as any).webkitdirectory = true;
      input.onchange = () => resolve(Array.from(input.files ?? []));
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  async function openPreview(nodeId?: string): Promise<void> {
    const id = nodeId ?? editor.activeNodeId;
    const node = id ? fs.getNode(id) : null;
    if (!node) return;
    const content = node.content;
    const overlay = document.createElement('div');
    overlay.className = 'evo-preview-overlay';
    const panel = document.createElement('div');
    panel.className = 'evo-preview';
    const head = document.createElement('div');
    head.className = 'evo-preview-head';
    const title = document.createElement('span');
    title.textContent = `Preview: ${node.name}`;
    const close = document.createElement('button');
    close.textContent = '✕';
    close.addEventListener('click', () => overlay.remove());
    head.appendChild(title);
    head.appendChild(close);
    const iframe = document.createElement('iframe');
    iframe.className = 'evo-preview-frame';
    iframe.sandbox = 'allow-scripts';
    if (node.name.toLowerCase().endsWith('.md')) {
      iframe.srcdoc = `<html><head><style>
        body{padding:32px;max-width:880px;margin:auto;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#ddd;background:#1e1e1e;line-height:1.6}
        pre{background:#252526;padding:14px;border-radius:6px;overflow:auto}
        code{background:#252526;padding:2px 5px;border-radius:4px}
        pre code{background:none;padding:0}blockquote{border-left:3px solid #444;margin-left:0;padding-left:16px;color:#999}
        a{color:#4fc1ff}h1,h2,h3{border-bottom:1px solid #333;padding-bottom:8px}</style></head><body>${renderMarkdown(content)}</body></html>`;
    } else {
      iframe.srcdoc = content;
    }
    panel.appendChild(head);
    panel.appendChild(iframe);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  // ---- OS drag & drop ----------------------------------------------------
  const dropOverlay = document.createElement('div');
  dropOverlay.className = 'evo-drop-overlay';
  dropOverlay.innerHTML = `
    <div class="evo-drop-card">
      ${icons.upload}
      <span>Drop to import into Evo</span>
    </div>`;
  let dragDepth = 0;

  const showDropOverlay = () => {
    dragDepth++;
    document.body.appendChild(dropOverlay);
    requestAnimationFrame(() => dropOverlay.classList.add('show'));
  };
  const hideDropOverlay = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      dropOverlay.classList.remove('show');
      window.setTimeout(() => dropOverlay.remove(), 250);
    }
  };

  window.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) showDropOverlay();
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    if (!e.relatedTarget) hideDropOverlay();
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (e.dataTransfer?.types?.includes('Files')) hideDropOverlay();
    if (!e.dataTransfer?.files.length) return;
    const dropped = await readDroppedDataTransfer(e.dataTransfer);
    if (!dropped.length) return;
    const makeNode = (kind: 'file' | 'folder', name: string): FSNode => {
      const created =
        kind === 'folder'
          ? fs.createFolder('root', name)
          : fs.createFile('root', name, '');
      if (created) return created;
      const tmp: FSNode = {
        id: genId(),
        name,
        type: kind,
        children: [],
        content: '',
        language: 'plaintext',
        external: false,
      };
      fs.root.children ??= [];
      fs.root.children.push(tmp);
      fs.reindex();
      return tmp;
    };
    const nodes = await buildTreeFromDropped(dropped, makeNode);
    for (const n of nodes) {
      if (n.type === 'file') editor.openNode(n.id);
    }
    if (nodes.length) {
      toast(
        `Imported ${nodes.length} item${nodes.length === 1 ? '' : 's'}`,
        'success',
      );
      bus.emit(EV.FS_CHANGED, fs.root);
      explorer.render();
      showEditor();
    }
  });

  // ---- Keyboard shortcuts ------------------------------------------------
  const chordState = { active: false, time: 0 };
  window.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const target = e.target as HTMLElement;
    const inInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    if (ctrl && key === 'k') {
      chordState.active = true;
      chordState.time = Date.now();
      e.preventDefault();
      return;
    }
    if (chordState.active && Date.now() - chordState.time < 2000) {
      chordState.active = false;
      if (ctrl && key === 's') {
        e.preventDefault();
        void commands.execute('file.saveAll');
      } else if (ctrl && key === 'o') {
        e.preventDefault();
        void commands.execute('file.openFolder');
      }
      return;
    }
    chordState.active = false;
    if (inInput) return;

    if (ctrl && e.shiftKey && key === 'p') {
      e.preventDefault();
      void commands.execute('workbench.action.openCommandPalette');
    } else if (e.key === 'F1') {
      e.preventDefault();
      void commands.execute('workbench.action.openCommandPalette');
    } else if (ctrl && key === 'p') {
      e.preventDefault();
      void commands.execute('workbench.action.quickOpen');
    } else if (ctrl && key === 's') {
      e.preventDefault();
      void commands.execute('file.save');
    } else if (ctrl && key === 'w') {
      e.preventDefault();
      void commands.execute('file.close');
    } else if (ctrl && key === 'n') {
      e.preventDefault();
      void commands.execute('file.new');
    } else if (ctrl && key === 'o') {
      e.preventDefault();
      void commands.execute('file.openFile');
    } else if (ctrl && key === 'b') {
      e.preventDefault();
      void commands.execute('workbench.action.toggleSidebar');
    } else if (ctrl && key === ',') {
      e.preventDefault();
      void commands.execute('workbench.action.settings');
    } else if (ctrl && e.shiftKey && key === 'f') {
      e.preventDefault();
      void commands.execute('view.switchToSearch');
    } else if (ctrl && key === 'tab') {
      e.preventDefault();
      cycleTabs(1);
    } else if (ctrl && e.shiftKey && key === 'tab') {
      e.preventDefault();
      cycleTabs(-1);
    }
  });

  function cycleTabs(dir: number): void {
    const infos = editor.tabInfos();
    if (!infos.length) return;
    const idx = infos.findIndex((t) => t.nodeId === editor.activeNodeId);
    const next = infos[(idx + dir + infos.length) % infos.length];
    void editor.activate(next.nodeId);
  }

  // ---- Before unload -----------------------------------------------------
  window.addEventListener('beforeunload', (e) => {
    if (editor.hasDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  window.addEventListener('pagehide', () => {
    if (signedIn && currentCloudProjectId) {
      void saveProject(currentCloudProjectId, { root: fs.root });
    }
    void workspaces.autosave();
  });

  // ---- Settings cloud sync ----------------------------------------------
  settings.changed.on((s) => {
    if (signedIn && cloudEnabled) {
      void saveCloudSettings(s);
    }
  });

  // ---- Initial screen ----------------------------------------------------
  if (!cloudEnabled) {
    guestMode = true;
    showHome();
  } else {
    const initial = await getSessionUser();
    if (initial) {
      await handleUser(initial);
    } else {
      showAuth();
    }
    onAuthStateChange((u) => void handleUser(u));
  }
}

// ---- Markdown preview (lightweight) ----------------------------------------
function renderMarkdown(md: string): string {
  let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre><code>${escaped}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  const paras = html.split(/\n\n+/).map((p) => {
    if (/^<(h\d|pre|blockquote|li)/.test(p)) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  });
  return paras.join('\n');
}

function placeholderView(title: string, message: string, icon: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'evo-view evo-placeholder';
  el.innerHTML = `
    <div class="evo-view-header"><span class="view-title">${title.toUpperCase()}</span></div>
    <div class="placeholder-body">
      <div class="placeholder-icon">${icon}</div>
      <p>${message}</p>
    </div>`;
  return el;
}

function guessLang(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'javascript', ts: 'typescript', json: 'json', html: 'html',
    css: 'css', md: 'markdown', py: 'python', go: 'go', rs: 'rust',
  };
  return map[ext] ?? 'plaintext';
}

void boot();
