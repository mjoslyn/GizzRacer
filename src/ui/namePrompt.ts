import { identity, setName } from '../net/identity';

/**
 * Asks for a display name the first time there's a score to post online
 * (a Time Trial run, a race time, a cup result), on the results screen,
 * and posts it once there is one. Until then the leaderboards beside the
 * picker only show; nothing is asked of anyone just looking.
 */
export class NamePrompt {
  private readonly el = document.createElement('div');
  private pending: (() => void) | null = null;
  private status = '';
  private busy = false;

  constructor(parent: HTMLElement) {
    this.el.className = 'nameprompt';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'post') void this.submit();
      else if (act === 'skip') this.hide();
    });
    // Typing a name must not advance the results or drive the kart.
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.submit();
      if (e.key === 'Escape') this.hide();
    });
    this.el.addEventListener('keyup', (e) => e.stopPropagation());
  }

  get visible(): boolean {
    return this.el.classList.contains('show');
  }

  /** Asks for a name, then runs `post`. With a name already set, posts at once. */
  ask(what: string, post: () => void): void {
    if (identity().name) {
      post();
      return;
    }
    this.pending = post;
    this.status = '';
    this.render(what);
    this.el.classList.add('show');
    this.el.querySelector<HTMLInputElement>('input')?.focus();
  }

  /** Drops the ask: the next results screen asks again if there's something to post. */
  hide(): void {
    this.pending = null;
    this.el.classList.remove('show');
  }

  private async submit(): Promise<void> {
    const input = this.el.querySelector<HTMLInputElement>('input');
    if (!input || this.busy) return;
    this.busy = true;
    this.status = 'Saving...';
    this.renderStatus();
    try {
      await setName(input.value);
      const post = this.pending;
      this.hide();
      post?.();
    } catch (err) {
      this.status = (err as Error).message;
      this.renderStatus();
    } finally {
      this.busy = false;
    }
  }

  private render(what: string): void {
    this.el.innerHTML = `
      <div class="nameprompt-title">Post ${escape(what)} online?</div>
      <div class="nameprompt-row"><input maxlength="16" placeholder="your name" value="${escape(identity().name ?? '')}" /><button data-act="post">Post</button><button class="nameprompt-skip" data-act="skip">Not now</button></div>
      <div class="nameprompt-status"></div>`;
  }

  private renderStatus(): void {
    const s = this.el.querySelector<HTMLElement>('.nameprompt-status');
    if (s) s.textContent = this.status;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
