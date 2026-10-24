import { CPU_DIFFICULTIES } from '../ai/cpuDriver';
import { SOUNDTRACKS, SOUNDTRACK_BLURBS, SOUNDTRACK_NAMES, TILT_RANGES, VIDEO_LOOKS, settings, updateSettings, type Settings } from '../core/settings';
import { DETAILS, DETAIL_NAMES } from '../render/detail';
import { chosenShow, onShows, randomShow, showSelect, shows } from '../audio/shows';
import { creditsHtml } from './credits';
import type { TiltSteering } from './tilt';


const SENSITIVITY = ['High', 'Medium', 'Low'];

/**
 * Settings, from the title screen and the pause menu: volumes, tilt
 * steering. Changes apply at once and are saved. The
 * credits are a second page of it, reached from Settings or straight from
 * the title screen.
 */
export class SettingsScreen {
  private readonly el = document.createElement('div');
  private onClose: () => void = () => {};
  private status = '';
  private last = '';
  private asking = false;
  private credits = false;
  /** Opened straight onto the credits (the title screen), so Done closes rather than going back. */
  private creditsOnly = false;

  constructor(
    parent: HTMLElement,
    private readonly tilt: TiltSteering,
  ) {
    this.el.className = 'settings';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => void this.click(e.target as HTMLElement));
    this.el.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      if (!sel.matches('.settings-select')) return;
      updateSettings({ liveShow: sel.value });
      this.render();
    });
    // The show list arrives after startup: the Live set row fills in.
    onShows(() => this.visible && !this.asking && !this.credits && this.render());
    // Keys pressed here mustn't reach the game.
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });
  }

  /**
   * First run on a phone: drag or tilt? The answer is saved; Settings can
   * change it later.
   */
  askSteering(onDone: () => void): void {
    this.onClose = onDone;
    this.status = '';
    this.asking = true;
    this.el.classList.add('show');
    this.render();
  }

  get visible(): boolean {
    return this.el.classList.contains('show');
  }

  open(onClose: () => void = () => {}): void {
    this.onClose = onClose;
    this.status = '';
    this.credits = this.creditsOnly = false;
    this.el.classList.add('show');
    this.render();
  }

  /** The credits on their own, from the title screen. */
  openCredits(onClose: () => void = () => {}): void {
    this.open(onClose);
    this.credits = this.creditsOnly = true;
    this.render();
  }

  close(): void {
    if (!this.visible) return;
    this.asking = false;
    this.el.classList.remove('show');
    this.onClose();
  }

  private async click(t: HTMLElement): Promise<void> {
    const btn = t.closest<HTMLElement>('[data-act]');
    if (!btn) {
      // A tap on the backdrop closes (the steering question needs an answer).
      if (t === this.el && !this.asking) this.close();
      return;
    }
    const dir = Number(btn.dataset.dir ?? 0);
    const s = settings();
    const step = (v: number) => Math.round(Math.min(1, Math.max(0, v + dir * 0.1)) * 10) / 10;
    switch (btn.dataset.act) {
      case 'music':
        updateSettings({ music: step(s.music) });
        break;
      case 'sfx':
        updateSettings({ sfx: step(s.sfx) });
        break;
      case 'look': {
        const i = VIDEO_LOOKS.indexOf(s.videoLook);
        updateSettings({ videoLook: VIDEO_LOOKS[(Math.max(0, i) + dir + VIDEO_LOOKS.length) % VIDEO_LOOKS.length], videoLookChosen: true });
        break;
      }
      case 'tilt':
        if (s.tilt) {
          this.tilt.stop();
          updateSettings({ tilt: false });
        } else if (await this.tilt.start()) {
          updateSettings({ tilt: true });
          this.status = 'Tilt on: hold the phone level and steer like a wheel';
        } else {
          this.status = 'Tilt needs motion sensor access. Allow it for this site in your browser settings.';
        }
        break;
      case 'range': {
        const i = TILT_RANGES.indexOf(s.tiltRange as (typeof TILT_RANGES)[number]);
        updateSettings({ tiltRange: TILT_RANGES[(Math.max(0, i) + dir + TILT_RANGES.length) % TILT_RANGES.length] });
        break;
      }
      case 'invert':
        updateSettings({ tiltInvert: !s.tiltInvert });
        break;
      case 'recenter':
        this.tilt.recenter();
        this.status = 'Straight ahead is how you hold it now';
        break;
      case 'smart':
        updateSettings({ smartSteering: !s.smartSteering });
        break;
      case 'cpus': {
        const i = CPU_DIFFICULTIES.indexOf(s.cpuDifficulty);
        const next = CPU_DIFFICULTIES[(Math.max(0, i) + dir + CPU_DIFFICULTIES.length) % CPU_DIFFICULTIES.length];
        updateSettings({ cpuDifficulty: next });
        this.status = { easy: 'Easy: the CPUs are slower, drift less and are careless with items (from the next race)', normal: 'Normal: the CPUs race as the class says', hard: 'Hard: the CPUs are quicker, drift deeper and save their items for you (from the next race)' }[next];
        break;
      }
      case 'soundtrack': {
        const i = SOUNDTRACKS.indexOf(s.soundtrack);
        const next = SOUNDTRACKS[(Math.max(0, i) + dir + SOUNDTRACKS.length) % SOUNDTRACKS.length];
        updateSettings({ soundtrack: next });
        this.status = `${SOUNDTRACK_NAMES[next]}: ${SOUNDTRACK_BLURBS[next]}${next === 'remix' ? '' : ". From the band's shows on the Internet Archive; needs a connection"}${next === 'song' ? '; from the next race' : ''}`;
        break;
      }
      case 'show-random':
        updateSettings({ liveShow: randomShow(shows(), s.liveShow) });
        break;
      case 'turns':
        updateSettings({ turnIndicator: !s.turnIndicator });
        this.status = s.turnIndicator ? 'Turn hints off' : 'Turn hints on: the next bend, which way, how sharp and how far, at the top of the screen';
        break;
      case 'detail': {
        const i = DETAILS.indexOf(s.detail);
        const next = DETAILS[(Math.max(0, i) + dir + DETAILS.length) % DETAILS.length];
        updateSettings({ detail: next, detailChosen: true });
        this.status = { low: 'Low: fewer pixels, no shadows, flatter roads, less scenery', medium: 'Medium: full resolution, shadows nearby, bump-mapped roads (the next track loaded gets the scenery)', high: 'High: full resolution, long shadows, bump-mapped roads, denser scenery (the next track loaded gets the scenery)' }[next];
        break;
      }
      case 'done':
        this.close();
        return;
      case 'credits':
        this.credits = true;
        break;
      case 'manual':
        // A page of its own, in a new tab so the game keeps its place.
        window.open('manual.html', '_blank', 'noopener');
        return;
      case 'back':
        if (this.creditsOnly) {
          this.close();
          return;
        }
        this.credits = false;
        break;
      case 'choose-drag':
        this.tilt.stop();
        updateSettings({ tilt: false, steeringChosen: true });
        this.close();
        return;
      case 'choose-tilt':
        if (await this.tilt.start()) {
          updateSettings({ tilt: true, steeringChosen: true });
          this.close();
          return;
        }
        this.status = "Couldn't read the motion sensor, so it's drag steering for now. You can try tilt again in Settings.";
        updateSettings({ tilt: false, steeringChosen: true });
        break;
    }
    this.render();
  }

  private render(): void {
    if (this.asking) return this.renderAsk();
    if (this.credits) return this.renderCredits();
    const s: Settings = settings();
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const arrows = (act: string, value: string) =>
      `<button class="menu-arrow" data-act="${act}" data-dir="-1">&#9664;</button><div class="lobby-value">${value}</div><button class="menu-arrow" data-act="${act}" data-dir="1">&#9654;</button>`;
    const toggle = (act: string, on: boolean, label = on ? 'On' : 'Off') => `<span></span><button class="settings-toggle${on ? ' on' : ''}" data-act="${act}">${label}</button><span></span>`;
    const sensitivity = SENSITIVITY[Math.max(0, TILT_RANGES.indexOf(s.tiltRange as (typeof TILT_RANGES)[number]))];
    const html = `
      <div class="lobby-panel settings-panel">
        <div class="lobby-title hud-big">SETTINGS</div>
        <div class="settings-cols">
          <div class="settings-col">
            <div class="settings-group">Sound and driving</div>
            <div class="lobby-row"><span class="lobby-label">Music</span>${arrows('music', pct(s.music))}</div>
            <div class="lobby-row"><span class="lobby-label">Soundtrack</span>${arrows('soundtrack', SOUNDTRACK_NAMES[s.soundtrack])}</div>
            ${s.soundtrack === 'show' ? this.showRows() : ''}
            <div class="lobby-row"><span class="lobby-label">Effects</span>${arrows('sfx', pct(s.sfx))}</div>
            <div class="lobby-row"><span class="lobby-label">VHS</span>${arrows('look', { full: 'Full', light: 'Light', off: 'Off' }[s.videoLook])}</div>
            <div class="lobby-row"><span class="lobby-label">Steering</span>${toggle('smart', s.smartSteering, s.smartSteering ? 'Smart' : 'Manual')}</div>
            <div class="lobby-row"><span class="lobby-label">CPUs</span>${arrows('cpus', { easy: 'Easy', normal: 'Normal', hard: 'Hard' }[s.cpuDifficulty])}</div>
            <div class="lobby-row"><span class="lobby-label">Turn hints</span>${toggle('turns', s.turnIndicator)}</div>
            <div class="lobby-row"><span class="lobby-label">Detail</span>${arrows('detail', DETAIL_NAMES[s.detail])}</div>
          </div>
          ${
            this.tilt.available
              ? `<div class="settings-col">
            <div class="settings-group">Phone steering</div>
            <div class="lobby-row"><span class="lobby-label">Tilt</span>${toggle('tilt', s.tilt)}</div>
            <div class="lobby-row${s.tilt ? '' : ' off'}"><span class="lobby-label">Sensitivity</span>${arrows('range', sensitivity)}</div>
            <div class="lobby-row${s.tilt ? '' : ' off'}"><span class="lobby-label">Invert</span>${toggle('invert', s.tiltInvert)}</div>
            <button class="settings-recenter" data-act="recenter"${s.tilt ? '' : ' disabled'}>Recentre tilt</button>
          </div>`
              : ''
          }
        </div>
        ${this.status ? `<div class="lobby-status">${this.status}</div>` : ''}
        <div class="settings-links">
          <button class="settings-credits" data-act="manual">Manual</button>
          <button class="settings-credits" data-act="credits">Credits</button>
        </div>
        <button class="lobby-big hud-big" data-act="done">DONE</button>
      </div>`;
    this.show(html);
  }

  /** Live set: which show, from a dropdown by year, or the dice. */
  private showRows(): string {
    const all = shows();
    const show = chosenShow(all, settings().liveShow);
    if (!show) return '<div class="lobby-row"><span class="lobby-label">Live set</span><span></span><div class="lobby-value">Loading shows&hellip;</div><span></span></div>';
    return `
            <div class="lobby-row settings-show"><span class="lobby-label">Live set</span>${showSelect(all, show.id, 'settings-select')}<button class="menu-dice" data-act="show-random" title="A show at random" aria-label="A show at random">&#9860;</button></div>`;
  }

  private renderCredits(): void {
    this.show(`
      <div class="lobby-panel settings-panel credits-panel">
        <div class="lobby-title hud-big">CREDITS</div>
        ${creditsHtml()}
        <button class="lobby-big hud-big" data-act="back">${this.creditsOnly ? 'DONE' : 'BACK'}</button>
      </div>`);
    this.el.querySelector('.credits-panel')?.scrollTo(0, 0);
  }

  private renderAsk(): void {
    this.show(`
      <div class="lobby-panel settings-panel steer-ask">
        <div class="lobby-title hud-big">HOW DO YOU STEER?</div>
        <div class="steer-choices">
          <button class="steer-choice" data-act="choose-drag">
            <span class="steer-icon drag"><i></i></span>
            <b class="hud-big">DRAG</b>
            <small>Drag left and right on the left side of the screen</small>
          </button>
          <button class="steer-choice" data-act="choose-tilt">
            <span class="steer-icon tilt"><i></i></span>
            <b class="hud-big">TILT</b>
            <small>Turn the phone like a steering wheel</small>
          </button>
        </div>
        ${this.status ? `<div class="lobby-status">${this.status}</div><button class="lobby-big hud-big" data-act="done">OK</button>` : '<div class="lobby-note">You can change this any time in Settings.</div>'}
      </div>`);
  }

  private show(html: string): void {
    if (html === this.last) return;
    this.last = html;
    this.el.innerHTML = html;
  }
}
