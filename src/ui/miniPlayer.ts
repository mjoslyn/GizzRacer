import type { MusicPlayer } from '../audio/music';
import type { LiveRadio } from '../audio/radio';

/**
 * The mini player for the live soundtrack (Settings > Soundtrack: Track
 * song or Live set): the song, the show it's from, a progress line, and back, pause,
 * next and a link to the show on the Internet Archive. On desktop it sits
 * bottom left. On touch there's a ♫ button on screen instead, which opens
 * the same player as a modal; a tap outside it, or its ×, closes it.
 */
export class MiniPlayer {
  readonly el = document.createElement('div');
  /** The ♫ button on touch. */
  readonly fab = document.createElement('button');
  private readonly title: HTMLElement;
  private readonly show: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly pause: HTMLButtonElement;
  private readonly link: HTMLAnchorElement;

  constructor(
    parent: HTMLElement,
    private readonly radio: LiveRadio,
    private readonly music: MusicPlayer,
  ) {
    this.el.className = 'mini-player';
    this.el.innerHTML = `
      <div class="mp-card">
        <button class="mp-close" data-mp="close" aria-label="Close">&times;</button>
        <div class="mp-info"><div class="mp-title"></div><div class="mp-show"></div></div>
        <div class="mp-buttons">
          <button data-mp="prev" title="The recording before" aria-label="Previous">&#9198;</button>
          <button data-mp="pause" title="Pause" aria-label="Pause">&#9208;</button>
          <button data-mp="next" title="Another recording" aria-label="Next">&#9197;</button>
          <a class="mp-link" target="_blank" rel="noopener" title="This show on the Internet Archive" aria-label="This show on the Internet Archive">&#8599;</a>
        </div>
        <div class="mp-bar"><i></i></div>
      </div>`;
    this.fab.className = 'mp-fab';
    this.fab.setAttribute('aria-label', 'Now playing');
    this.fab.innerHTML = '&#9835;';
    parent.append(this.el, this.fab);
    const q = <T extends HTMLElement>(sel: string) => this.el.querySelector<T>(sel)!;
    this.title = q('.mp-title');
    this.show = q('.mp-show');
    this.bar = q('.mp-bar i');
    this.pause = q<HTMLButtonElement>('[data-mp="pause"]');
    this.link = q<HTMLAnchorElement>('.mp-link');
    // Taps on the player mustn't reach the touch controls under it.
    for (const el of [this.el, this.fab]) for (const ev of ['pointerdown', 'touchstart'] as const) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    this.fab.addEventListener('click', () => {
      this.fab.blur();
      this.setOpen(true);
    });
    this.el.addEventListener('click', (e) => {
      // A tap on the backdrop (outside the card) closes the modal.
      if (e.target === this.el) return this.setOpen(false);
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mp]');
      if (!btn) return;
      // Off the button again at once, or Space (the hop) would press it.
      btn.blur();
      const act = btn.dataset.mp;
      if (act === 'close') return this.setOpen(false);
      if (act === 'prev') radio.prev();
      else if (act === 'next') radio.next();
      else if (act === 'pause') radio.togglePause();
      this.render();
    });
    radio.onChange(() => this.render());
    this.render();
    // The progress line and the pause button follow the stream.
    setInterval(() => this.tick(), 500);
  }

  /** The modal, on touch. */
  private setOpen(open: boolean): void {
    this.el.classList.toggle('open', open && !!this.radio.playing);
  }

  private render(): void {
    const p = this.radio.playing;
    this.el.classList.toggle('show', !!p);
    this.fab.classList.toggle('show', !!p);
    if (!p) return this.setOpen(false);
    this.title.textContent = p.title;
    const where = [p.rec.venue, p.rec.date].filter(Boolean).join(', ');
    this.show.textContent = p.set ? `${where} · ${p.set.index + 1}/${p.set.songs.length}` : `live, ${where}`;
    this.link.href = `https://archive.org/details/${encodeURIComponent(p.rec.id)}`;
    this.tick();
  }

  private tick(): void {
    if (!this.radio.playing) return;
    const prog = this.music.liveProgress();
    this.bar.style.width = prog && prog.length > 0 ? `${Math.min(100, (prog.at / prog.length) * 100)}%` : '0';
    const paused = this.radio.paused;
    this.pause.innerHTML = paused ? '&#9654;' : '&#9208;';
    this.pause.title = paused ? 'Play' : 'Pause';
    this.el.classList.toggle('loading', !prog);
    this.fab.classList.toggle('paused', paused);
  }
}
