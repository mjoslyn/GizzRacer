/**
 * After a race on a generated track: keep it, under the name it was
 * given or one you type.
 */
export class SaveTrackPanel {
  /** The player saved (or renamed) the track. */
  onSave: (name: string) => void = () => {};
  private readonly el = document.createElement('div');
  private saved = false;

  constructor(parent: HTMLElement) {
    this.el.className = 'savetrack';
    parent.appendChild(this.el);
    // Typing a name mustn't continue past the results or drive the game.
    // Once it's saved (focus gone), keys go back to continuing past the results.
    this.el.addEventListener('keydown', (e) => {
      if (!(e.target as HTMLElement).matches('input')) return;
      e.stopPropagation();
      if (e.key === 'Enter') this.save();
    });
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act=save]')) this.save();
    });
  }

  /** Shows the panel for a track (`saved`: already in the list, so the button renames), or hides it with null. */
  show(name: string | null, saved = false): void {
    this.el.classList.toggle('show', name !== null);
    if (name === null) return;
    this.saved = saved;
    this.el.innerHTML = `
      <div class="savetrack-label">${saved ? 'Saved track' : 'Keep this track?'}</div>
      <input class="savetrack-name" maxlength="32" value="${esc(name)}" spellcheck="false" />
      <button class="hud-big" data-act="save">${saved ? 'RENAME' : 'SAVE'}</button>`;
  }

  private save(): void {
    const input = this.el.querySelector<HTMLInputElement>('.savetrack-name');
    const name = input?.value ?? '';
    this.onSave(name);
    this.el.querySelector('.savetrack-label')!.textContent = this.saved ? 'Renamed!' : 'Saved! Find it in Track Generator';
    this.saved = true;
    const button = this.el.querySelector<HTMLButtonElement>('[data-act=save]');
    if (button) button.textContent = 'RENAME';
    input?.blur();
    button?.blur();
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
