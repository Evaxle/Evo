import { genId } from '../fs/FileSystem';
import { languageFromPath } from '../core/language';
import type { FSNode } from '../core/types';
import { getGitHubLink, setGitHubLink } from './cloud';

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID?.trim() || undefined;
const API = 'https://api.github.com';

export function githubConfigured(): boolean {
  return !!GITHUB_CLIENT_ID;
}

// ---- Device flow linking ---------------------------------------------------

export interface DeviceFlowStep {
  ok: true;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
}

export interface DeviceFlowStepError {
  ok: false;
  error: string;
}

export async function startDeviceFlow(): Promise<DeviceFlowStep | DeviceFlowStepError> {
  if (!GITHUB_CLIENT_ID) {
    return { ok: false, error: 'GitHub is not configured yet (missing VITE_GITHUB_CLIENT_ID).' };
  }
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo' }),
  });
  const data = await res.json();
  if (data.error || !data.device_code) {
    return { ok: false, error: data.error_description ?? data.error ?? 'Failed to start GitHub link.' };
  }
  return {
    ok: true,
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval || 5,
  };
}

export async function pollForToken(
  deviceCode: string,
  interval: number,
  onPoll?: (state: 'waiting' | 'authorized' | 'denied' | 'expired') => void,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const deadline = Date.now() + 15 * 60 * 1000; // 15 min
  while (Date.now() < deadline) {
    await sleep(Math.max(interval, 3) * 1000);
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      onPoll?.('authorized');
      return { ok: true, token: data.access_token };
    }
    if (data.error === 'authorization_pending') {
      onPoll?.('waiting');
      continue;
    }
    if (data.error === 'slow_down') {
      await sleep(5 * 1000);
      continue;
    }
    if (data.error === 'access_denied') {
      onPoll?.('denied');
      return { ok: false, error: 'Access denied.' };
    }
    if (data.error === 'expired_token') {
      onPoll?.('expired');
      return { ok: false, error: 'The link request expired. Please try again.' };
    }
  }
  return { ok: false, error: 'Timed out waiting for authorization.' };
}

/** Links the GitHub account using device flow, storing the token. */
export async function linkGitHubAccount(): Promise<{ ok: boolean; error?: string; username?: string }> {
  const step = await startDeviceFlow();
  if (!step.ok) return { ok: false, error: step.error };

  const poll = await pollForToken(step.deviceCode, step.interval);
  if (!poll.ok || !poll.token) return { ok: false, error: poll.error ?? 'Linking failed.' };

  const user = await githubWhoami(poll.token);
  const username = user?.login ?? '';
  await setGitHubLink({ token: poll.token, username });
  return { ok: true, username };
}

// ---- API helpers -----------------------------------------------------------

export async function githubWhoami(token?: string): Promise<{ login: string } | null> {
  const link = token ? { token } : await getGitHubLink();
  if (!link?.token) return null;
  const res = await gh(link.token, '/user');
  return res.ok ? (res.body as { login: string }) : null;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  owner: string;
  default_branch: string;
  description: string | null;
  updated_at: string;
}

export async function listRepos(): Promise<GitHubRepo[]> {
  const link = await getGitHubLink();
  if (!link?.token) return [];
  const perPage = 100;
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await gh(link.token, `/user/repos?sort=updated&per_page=${perPage}&page=${page}`);
    if (!res.ok) break;
    const arr = (res.body as any[]) ?? [];
    for (const r of arr) {
      repos.push({
        name: r.name,
        full_name: r.full_name,
        owner: r.owner.login,
        default_branch: r.default_branch,
        description: r.description,
        updated_at: r.updated_at,
      });
    }
    if (arr.length < perPage) break;
  }
  return repos;
}

/** Recursively loads a repository's files into a virtual FSNode tree. */
export async function loadRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<FSNode | null> {
  const link = token ? { token } : await getGitHubLink();
  if (!link?.token) return null;

  // 1. Get the recursive git tree (blobs + trees).
  const treeRes = await gh(
    link.token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  if (!treeRes.ok) return null;
  const tree = treeRes.body as { tree: Array<{ path: string; type: string; sha: string }> };
  if (!tree?.tree) return null;

  const root: FSNode = {
    id: genId(),
    name: repo,
    type: 'folder',
    children: [],
    content: '',
    language: 'plaintext',
    external: false,
  };

  // Build a path -> node map for O(1) parent lookup.
  const nodes = new Map<string, FSNode>([['', root]]);

  const entries = tree.tree
    .filter((e) => e.type === 'blob' || e.type === 'tree')
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of entries) {
    const parts = entry.path.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    const parent = nodes.get(parentPath) ?? root;

    if (entry.type === 'tree') {
      const node: FSNode = {
        id: genId(),
        name,
        type: 'folder',
        children: [],
        content: '',
        language: 'plaintext',
        external: false,
      };
      parent.children.push(node);
      nodes.set(entry.path, node);
    } else {
      const node: FSNode = {
        id: genId(),
        name,
        type: 'file',
        children: [],
        content: '',
        language: languageFromPath(name),
        external: false,
      };
      parent.children.push(node);
      nodes.set(entry.path, node);
    }
  }

  // 2. Fetch file contents in parallel batches (blobs API).
  const blobEntries = tree.tree.filter((e) => e.type === 'blob');
  const BATCH = 25;
  for (let i = 0; i < blobEntries.length; i += BATCH) {
    const batch = blobEntries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (entry) => {
        const res = await gh(link.token!, `/repos/${owner}/${repo}/git/blobs/${entry.sha}`);
        if (!res.ok) return;
        const blob = res.body as { content: string; encoding: string };
        const node = nodes.get(entry.path);
        if (node) {
          node.content =
            blob.encoding === 'base64'
              ? decodeBase64(blob.content)
              : blob.content;
        }
      }),
    );
  }

  return root;
}

export interface CommitChange {
  path: string;
  content: string;
  deleted?: boolean;
}

/**
 * Commits a set of file changes to a branch and pushes (updates the ref)
 * using the Git Data API. This mirrors what a source-control "commit & push"
 * would do.
 */
export async function commitChanges(
  owner: string,
  repo: string,
  branch: string,
  message: string,
  changes: CommitChange[],
  token?: string,
): Promise<{ ok: boolean; error?: string }> {
  const link = token ? { token } : await getGitHubLink();
  if (!link?.token) return { ok: false, error: 'GitHub is not linked.' };
  if (!message.trim()) return { ok: false, error: 'Commit message is required.' };

  const t = link.token;

  // Current ref (branch head).
  const refRes = await gh(t, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!refRes.ok) {
    return { ok: false, error: `Branch "${branch}" not found.` };
  }
  const refBody = refRes.body as { object: { sha: string } };
  const headSha = refBody.object.sha;

  const commitRes = await gh(t, `/repos/${owner}/${repo}/git/commits/${headSha}`);
  if (!commitRes.ok) return { ok: false, error: 'Failed to read current commit.' };
  const baseTreeSha = (commitRes.body as { tree: { sha: string } }).tree.sha;

  // Create blobs for changed files.
  const treeItems: Array<{ path: string; mode: string; type: string; sha?: string }> = [];
  for (const change of changes) {
    if (change.deleted) {
      treeItems.push({ path: change.path, mode: '100644', type: 'blob', sha: undefined });
      continue;
    }
    const blobRes = await gh(t, `/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: change.content, encoding: 'utf-8' }),
    });
    if (!blobRes.ok) return { ok: false, error: `Failed to create blob for ${change.path}` };
    const blobSha = (blobRes.body as { sha: string }).sha;
    treeItems.push({ path: change.path, mode: '100644', type: 'blob', sha: blobSha });
  }

  // Create the new tree.
  const newTreeRes = await gh(t, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!newTreeRes.ok) return { ok: false, error: 'Failed to create tree.' };
  const newTreeSha = (newTreeRes.body as { sha: string }).sha;

  // Create the commit.
  const newCommitRes = await gh(t, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: newTreeSha,
      parents: [headSha],
    }),
  });
  if (!newCommitRes.ok) return { ok: false, error: 'Failed to create commit.' };
  const newCommitSha = (newCommitRes.body as { sha: string }).sha;

  // Update the branch ref (push).
  const refUpdateRes = await gh(t, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommitSha, force: false }),
  });
  if (!refUpdateRes.ok) {
    return { ok: false, error: 'Commit created but the push was rejected (the remote may have moved).' };
  }
  return { ok: true };
}

// ---- Internal helpers -------------------------------------------------------

async function gh(
  token: string,
  path: string,
  init?: { method?: string; body?: string },
): Promise<{ ok: boolean; body: unknown; status: number }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: init?.body,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    return { ok: res.ok, body, status: res.status };
  } catch (err) {
    console.error('GitHub API error:', err);
    return { ok: false, body: null, status: 0 };
  }
}

function decodeBase64(b64: string): string {
  try {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
