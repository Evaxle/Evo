import { login, register } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { icons } from '../core/icons';

export interface AuthScreenOptions {
  onAuthenticated: (username: string) => void;
  onGuest: () => void;
}

/**
 * Full-screen sign in / create account card. Username + password, or
 * sign in/sign up with a GitHub account (Supabase GitHub OAuth).
 */
export class AuthScreen {
  el: HTMLElement;
  private mode: 'login' | 'register' = 'login';
  private statusEl!: HTMLElement;
  private submitBtn!: HTMLButtonElement;
  private oauthBtn!: HTMLButtonElement;
  private busy = false;

  constructor(private root: HTMLElement, private opts: AuthScreenOptions) {
    this.el = document.createElement('div');
    this.el.className = 'evo-auth';
    this.render();
    this.root.appendChild(this.el);
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">E</div>
        <h1 class="auth-title">Evo</h1>
        <p class="auth-sub">Your workspace, saved in the cloud.</p>

        <div class="auth-tabs">
          <button class="auth-tab" data-mode="login">Sign In</button>
          <button class="auth-tab" data-mode="register">Create Account</button>
        </div>

        <form class="auth-form" autocomplete="off">
          <label class="auth-label" for="auth-username">Username</label>
          <input class="auth-input" id="auth-username" name="username" type="text"
                 placeholder="e.g. evo_dev" spellcheck="false" autocomplete="username" required>

          <label class="auth-label" for="auth-password">Password</label>
          <input class="auth-input" id="auth-password" name="password" type="password"
                 placeholder="••••••••" autocomplete="current-password" required>

          <p class="auth-status" role="alert"></p>
          <button class="auth-submit" type="submit">Sign In</button>
        </form>

        <div class="auth-or"><span>or</span></div>
        <button class="auth-oauth" type="button">
          ${icons.github}
          <span>Continue with GitHub</span>
        </button>

        <button class="auth-guest">Use Evo without an account</button>
        <p class="auth-foot">Your projects, files and settings are synced and autosaved to your account.</p>
      </div>
    `;

    this.statusEl = this.el.querySelector<HTMLElement>('.auth-status')!;
    this.submitBtn = this.el.querySelector<HTMLButtonElement>('.auth-submit')!;
    this.oauthBtn = this.el.querySelector<HTMLButtonElement>('.auth-oauth')!;

    this.el.querySelectorAll<HTMLElement>('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.setMode(tab.dataset.mode === 'register' ? 'register' : 'login'));
    });

    this.el.querySelector<HTMLFormElement>('.auth-form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });

    this.el.querySelector<HTMLButtonElement>('.auth-guest')!.addEventListener('click', () => {
      this.opts.onGuest();
    });

    this.oauthBtn.addEventListener('click', () => void this.signInWithGitHub());

    this.setMode('login');
  }

  private setMode(mode: 'login' | 'register'): void {
    this.mode = mode;
    this.el.querySelectorAll<HTMLElement>('.auth-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    this.submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    const pass = this.el.querySelector<HTMLInputElement>('#auth-password');
    if (pass) pass.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    this.setStatus('');
    this.el.querySelector<HTMLInputElement>('#auth-username')?.focus();
  }

  private setStatus(msg: string, kind: 'error' | 'info' = 'error'): void {
    this.statusEl.textContent = msg;
    this.statusEl.classList.toggle('error', kind === 'error');
  }

  private async signInWithGitHub(): Promise<void> {
    if (this.busy) return;
    if (!supabase) {
      this.setStatus('Cloud accounts are not configured yet.');
      return;
    }
    this.busy = true;
    this.oauthBtn.disabled = true;
    const label = this.oauthBtn.querySelector('span');
    if (label) label.textContent = 'Redirecting to GitHub…';
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
          scopes: 'repo',
        },
      });
      if (error) {
        this.busy = false;
        this.oauthBtn.disabled = false;
        if (label) label.textContent = 'Continue with GitHub';
        this.setStatus(error.message);
      }
    } catch {
      this.busy = false;
      this.oauthBtn.disabled = false;
      if (label) label.textContent = 'Continue with GitHub';
      this.setStatus('Could not reach GitHub. Check your connection and try again.');
    }
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const username = (this.el.querySelector<HTMLInputElement>('#auth-username')?.value ?? '').trim();
    const password = this.el.querySelector<HTMLInputElement>('#auth-password')?.value ?? '';

    this.busy = true;
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = this.mode === 'login' ? 'Signing in…' : 'Creating account…';
    this.setStatus('');

    const result =
      this.mode === 'login'
        ? await login(username, password)
        : await register(username, password);

    this.busy = false;
    this.submitBtn.disabled = false;
    this.submitBtn.textContent = this.mode === 'login' ? 'Sign In' : 'Create Account';

    if (result.ok) {
      this.opts.onAuthenticated(username);
    } else {
      this.setStatus(result.error ?? 'Something went wrong.');
    }
  }
}
