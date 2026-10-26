// The picker's preview shots (public/previews): every track from partway down the intro's swoop, and every
// skill game a few seconds in. Run against the dev server (npm run dev) in another terminal:
//
//   node tools/previews.mjs [http://localhost:5173/] [tracks|skills] [first track index]
//
// Software rendering (no GPU) takes a few seconds a shot.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:5173/';
const only = process.argv[3];
const from = Number(process.argv[4] ?? 0);
const SIZE = { width: 400, height: 225 };
const out = new URL('../public/previews/', import.meta.url).pathname;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
// No tape look, full detail, no questions: a clean picture of the place.
await page.addInitScript(() => localStorage.setItem('gizzracer.settings', JSON.stringify({ steeringChosen: true, videoLook: 'off', videoLookChosen: true, detail: 'high', detailChosen: true, music: 0, sfx: 0 })));
await page.goto(`${base}?shots&unlock=1`);
await page.waitForTimeout(3000);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
const hideUi = () => page.addStyleTag({ content: 'body > :not(#app) { visibility: hidden !important; }' });
const showUi = () => page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent.includes('visibility: hidden !important') && s.remove()));

if (!only || only === 'tracks') {
  mkdirSync(`${out}tracks`, { recursive: true });
  // Single Race, then the track screen.
  await click('[data-pick="mode:3"]');
  await click('[data-next]');
  await page.waitForTimeout(500);
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-grid="track"] .menu-tile')].map((t) => t.dataset.tileId));
  for (let i = from; i < ids.length; i++) {
    await click(`[data-pick="track:${i}"]`);
    await page.waitForTimeout(7000);
    await hideUi();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}tracks/${ids[i]}.jpg`, type: 'jpeg', quality: 72 });
    await showUi();
    console.log(`track ${i} ${ids[i]}`);
  }
  await click('[data-back]');
  await page.waitForTimeout(400);
}

if (!only || only === 'skills') {
  mkdirSync(`${out}skills`, { recursive: true });
  await click('[data-pick="mode:2"]');
  await click('[data-next]');
  await page.waitForTimeout(300);
  const kinds = await page.evaluate(() => [...document.querySelectorAll('[data-grid="skill"] .menu-tile')].map((t) => t.dataset.tileId));
  await click('[data-back]');
  for (let i = 0; i < kinds.length; i++) {
    // Skill Games, the game, the difficulty, PLAY!
    await click('[data-pick="mode:2"]');
    await click('[data-next]');
    await page.waitForTimeout(300);
    await click(`[data-pick="skill:${i}"]`);
    while (await page.evaluate(() => !document.querySelector('[data-start]'))) {
      await click('[data-next]');
      await page.waitForTimeout(300);
    }
    await click('[data-start]');
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${out}skills/${kinds[i]}.jpg`, type: 'jpeg', quality: 72 });
    console.log(`skill ${kinds[i]}`);
    await page.keyboard.press('Escape');
    await page.goto(`${base}?shots&unlock=1`);
    await page.waitForTimeout(3000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
  }
}
await browser.close();
