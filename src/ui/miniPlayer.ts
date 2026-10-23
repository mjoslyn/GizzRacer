import type { MusicPlayer } from '../audio/music';
import type { LiveRadio } from '../audio/radio';

/**
 * The mini player for the live soundtrack (Settings > Soundtrack), on
 * desktop: the song, the show it's from, a progress line, and back,
 * pause, next, another show (when shows play through) and a link to the show on the
 * Internet Archive. On touch it stays hidden and the same controls are in
 * Settings (ui/settings.ts).
 */
export class MiniPlayer {
  readonly el = document.createElement('div');
  private readonly title: HTMLElement;
  private readonly show: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly pause: HTMLButtonElement;
  private readonly shuffle: HTMLButtonElement;
  private readonly link: HTMLAnchorElement;

  constructor(
    parent: HTMLElement,
    private readonly radio: LiveRadio,
    private readonly music: MusicPlayer,
  ) {
    this.el.className = 'mini-player';
    this.el.innerHTML = `
      <div class="mp-info"><div class="mp-title"></div><div class="mp-show"></div></div>
      <div class="mp-buttons">
        <button data-mp="prev" title="The song before" aria-label="Previous">&#9198;</button>
        <button data-mp="pause" title="Pause" aria-label="Pause">&#9208;</button>
        <button data-mp="next" title="Next song" aria-label="Next">&#9197;</button>
        <button data-mp="new" title="Another show" aria-label="Another show">&#128256;</button>
        <a class="mp-link" target="_blank" rel="noopener" title="This show on the Internet Archive" aria-label="This show on the Internet Archive">&#8599;</a>
      </div>
      <div class="mp-bar"><i></i></div>`;
    parent.appendChild(this.el);
    const q = <T extends HTMLElement>(sel: string) => this.el.querySelector<T>(sel)!;
    this.title = q('.mp-title');
    this.show = q('.mp-show');
    this.bar = q('.mp-bar i');
    this.pause = q<HTMLButtonElement>('[data-mp="pause"]');
    this.shuffle = q<HTMLButtonElement>('[data-mp="new"]');
    this.link = q<HTMLAnchorElement>('.mp-link');
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mp]');
      if (!btn) return;
      // Off the button again at once, or Space (the hop) would press it.
      btn.blur();
      const act = btn.dataset.mp;
      if (act === 'prev') radio.prev();
      else if (act === 'next') radio.next();
      else if (act === 'pause') radio.togglePause();
      else if (act === 'new') void radio.newShow();
      this.render();
    });
    radio.onChange(() => this.render());
    this.render();
    // The progress line and the pause button follow the stream.
    setInterval(() => this.tick(), 500);
  }

  private render(): void {
    const p = this.radio.playing;
    this.el.classList.toggle('show', !!p);
    if (!p) return;
    this.title.textContent = p.title;
    const where = [p.rec.venue, p.rec.date].filter(Boolean).join(', ');
    this.show.textContent = p.set ? `${where} · ${p.set.index + 1}/${p.set.songs.length}` : `live, ${where}`;
    this.shuffle.hidden = p.mode === 'song';
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
  }
}
