import { genId } from '../fs/FileSystem';
import { languageFromPath } from '../core/language';
import type { FSNode } from '../core/types';
import { getGitHubLink } from './cloud';

const API = 'https://api.github.com';

// ---- API helpers -----------------------------------------------------------

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
