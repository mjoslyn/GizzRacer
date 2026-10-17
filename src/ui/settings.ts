import { TILT_RANGES, settings, updateSettings, type Settings } from '../core/settings';
import type { TiltSteering } from './tilt';

const SENSITIVITY = ['High', 'Medium', 'Low'];

/**
 * Settings, from the title screen and the pause menu: volumes, tilt
 * steering and auto-accelerate. Changes apply at once and are saved.
 */
export class SettingsScreen {
  private readonly el = document.createElement('div');
  private onClose: () => void = () => {};
  private status = '';
  private last = '';
  private asking = false;

  constructor(
    parent: HTMLElement,
    private readonly tilt: TiltSteering,
  ) {
    this.el.className = 'settings';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => void this.click(e.target as HTMLElement));
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
    this.el.classList.add('show');
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
      case 'auto':
        updateSettings({ autoAccelerate: !s.autoAccelerate });
        break;
      case 'done':
        this.close();
        return;
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
    const s: Settings = settings();
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const arrows = (act: string, value: string) =>
      `<button class="menu-arrow" data-act="${act}" data-dir="-1">&#9664;</button><div class="lobby-value">${value}</div><button class="menu-arrow" data-act="${act}" data-dir="1">&#9654;</button>`;
    const toggle = (act: string, on: boolean, label = on ? 'On' : 'Off') => `<span></span><button class="settings-toggle${on ? ' on' : ''}" data-act="${act}">${label}</button><span></span>`;
    const sensitivity = SENSITIVITY[Math.max(0, TILT_RANGES.indexOf(s.tiltRange as (typeof TILT_RANGES)[number]))];
    const html = `
      <div class="lobby-panel settings-panel">
        <div class="lobby-title hud-big">SETTINGS</div>
        <div class="lobby-row"><span class="lobby-label">Music</span>${arrows('music', pct(s.music))}</div>
        <div class="lobby-row"><span class="lobby-label">Effects</span>${arrows('sfx', pct(s.sfx))}</div>
        <div class="lobby-row"><span class="lobby-label">Throttle</span>${toggle('auto', s.autoAccelerate, s.autoAccelerate ? 'Automatic' : 'Manual')}</div>
        ${
          this.tilt.available
            ? `<div class="settings-group">Phone steering</div>
        <div class="lobby-row"><span class="lobby-label">Tilt</span>${toggle('tilt', s.tilt)}</div>
        <div class="lobby-row${s.tilt ? '' : ' off'}"><span class="lobby-label">Sensitivity</span>${arrows('range', sensitivity)}</div>
        <div class="lobby-row${s.tilt ? '' : ' off'}"><span class="lobby-label">Invert</span>${toggle('invert', s.tiltInvert)}</div>
        <button class="settings-recenter" data-act="recenter"${s.tilt ? '' : ' disabled'}>Recentre tilt</button>`
            : ''
        }
        ${this.status ? `<div class="lobby-status">${this.status}</div>` : ''}
        <button class="lobby-big hud-big" data-act="done">DONE</button>
      </div>`;
    this.show(html);
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
