import { supabase, cloudEnabled } from './supabase';
import type { AppSettings, FSNode, OpenEditorsState } from '../core/types';
import { defaultSettings } from '../core/SettingsStore';

export interface CloudProject {
  id: string;
  name: string;
  folder_name: string;
  root: FSNode | null;
  created_at: string;
  updated_at: string;
}

export function isCloudEnabled(): boolean {
  return cloudEnabled;
}

// ---- Projects -------------------------------------------------------------

export async function listProjects(): Promise<CloudProject[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('listProjects:', error.message);
      return [];
    }
    return (data ?? []) as CloudProject[];
  } catch (err) {
    console.error('listProjects:', err);
    return [];
  }
}

export async function getProject(id: string): Promise<CloudProject | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return data as CloudProject;
  } catch {
    return null;
  }
}

export async function createProject(
  name: string,
  root: FSNode,
): Promise<CloudProject | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('projects')
      .insert({ name, folder_name: root.name, root })
      .select()
      .single();
    if (error) {
      console.error('createProject:', error.message);
      return null;
    }
    return data as CloudProject;
  } catch (err) {
    console.error('createProject:', err);
    return null;
  }
}

export async function saveProject(
  id: string,
  patch: Partial<Pick<CloudProject, 'name' | 'folder_name' | 'root'>>,
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('saveProject:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('saveProject:', err);
    return false;
  }
}

export async function renameProject(id: string, name: string): Promise<boolean> {
  return saveProject(id, { name });
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      console.error('deleteProject:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ---- Settings -------------------------------------------------------------

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function loadCloudSettings(): Promise<AppSettings | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('settings')
      .maybeSingle();
    if (error || !data?.settings) return null;
    return { ...defaultSettings, ...(data.settings as Partial<AppSettings>) };
  } catch {
    return null;
  }
}

export async function saveCloudSettings(settings: AppSettings): Promise<void> {
  if (!supabase) return;
  try {
    const user_id = await currentUserId();
    if (!user_id) return;
    await supabase
      .from('settings')
      .upsert({ user_id, settings }, { onConflict: 'user_id' });
  } catch {
    /* ignore */
  }
}

// ---- Editor state ---------------------------------------------------------

export async function loadCloudEditorState(
  projectId: string,
): Promise<OpenEditorsState | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('editor_state')
      .select('tabs')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error || !data?.tabs) return null;
    return data.tabs as OpenEditorsState;
  } catch {
    return null;
  }
}

export async function saveCloudEditorState(
  projectId: string,
  state: OpenEditorsState,
): Promise<void> {
  if (!supabase) return;
  try {
    const user_id = await currentUserId();
    if (!user_id) return;
    const { error } = await supabase
      .from('editor_state')
      .upsert(
        { project_id: projectId, user_id, tabs: state },
        { onConflict: 'project_id' },
      );
    if (error) console.error('saveCloudEditorState:', error.message);
  } catch {
    /* ignore */
  }
}

// ---- GitHub link ----------------------------------------------------------

export interface GitHubLink {
  token: string;
  username: string;
}

export async function getGitHubLink(): Promise<GitHubLink | null> {
  try {
    const local = localStorage.getItem('evo.github.token');
    if (local) {
      const username = localStorage.getItem('evo.github.username') ?? '';
      return { token: local, username };
    }
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('github_token, github_username')
      .maybeSingle();
    if (error || !data?.github_token) return null;
    return { token: data.github_token, username: data.github_username ?? '' };
  } catch {
    return null;
  }
}

export async function setGitHubLink(link: GitHubLink | null): Promise<void> {
  try {
    if (link) {
      localStorage.setItem('evo.github.token', link.token);
      localStorage.setItem('evo.github.username', link.username);
    } else {
      localStorage.removeItem('evo.github.token');
      localStorage.removeItem('evo.github.username');
    }
    if (!supabase) return;
    const user_id = await currentUserId();
    if (!user_id) return;
    await supabase
      .from('profiles')
      .upsert(
        {
          id: user_id,
          github_token: link?.token ?? null,
          github_username: link?.username ?? null,
        },
        { onConflict: 'id' },
      );
  } catch {
    /* ignore */
  }
}
