/**
 * harness.mjs – Playwright-Helfer für Browser-Tests des Spiels.
 *
 * Startet Headless-Chromium, öffnet index.html (oder eine Testseite) per file://,
 * leitet die Phaser-CDN-Anfrage auf vendor/phaser.min.js um (schnell, offline-fähig)
 * und sammelt alle Browser-Fehler. Koordinaten in click()/move() sind
 * SPIELKOORDINATEN (800×600) und werden auf die Canvas-Position umgerechnet.
 *
 * Beispiel:
 *   import { launchGame, runTest, assert } from './harness.mjs';
 *   await runTest('Kapitel 2 – Happy Path', async () => {
 *     const g = await launchGame({ query: 'chapter=2&skipintro=1&seed=7' });
 *     try {
 *       await g.click(400, 300);
 *       await g.type('wwi26042@lehre.dhbw-stuttgart.de');
 *       await g.waitFor(() => window.__EDU_DEBUG.getState().currentChapterId === 3);
 *       await g.shot('ch2-done');
 *       g.assertNoErrors();
 *     } finally {
 *       await g.close();
 *     }
 *   });
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SCREENSHOT_DIR = path.join(ROOT, 'screenshots');
const VENDOR_PHASER = path.join(ROOT, 'vendor', 'phaser.min.js');
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

/** Standard-Bereitschaftsprüfung für index.html (setzt main.js). */
const DEFAULT_READY = () => Boolean(window.__EDU_DEBUG && window.__EDU_DEBUG.ready === true);

/**
 * Startet einen Browser mit dem Spiel.
 * @param {object} [opts]
 * @param {string} [opts.query='']        URL-Parameter, z. B. 'chapter=2&skipintro=1&seed=7'
 * @param {boolean} [opts.mute=true]      hängt mute=1 an
 * @param {string} [opts.page='index.html'] relativ zum Projektordner, z. B. 'tests/pages/forms.html'
 * @param {Function} [opts.ready]         Funktion, die im Browser true liefert, sobald bereit
 * @param {number} [opts.readyTimeout=20000]
 * @param {{width:number,height:number}} [opts.viewport] Standard 800×600 (= Maßstab 1)
 * @param {string[]} [opts.ignoreErrors=[]] Teilstrings von Fehlern, die ignoriert werden
 * @param {boolean} [opts.headless=true]
 */
export async function launchGame({
  query = '',
  mute = true,
  page: pagePath = 'index.html',
  ready = DEFAULT_READY,
  readyTimeout = 20000,
  viewport = { width: GAME_WIDTH, height: GAME_HEIGHT },
  ignoreErrors = [],
  headless = true,
} = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];

  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${err.stack || ''}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} (${req.failure()?.errorText})`));

  // Phaser-CDN → lokale Kopie
  await page.route('**/phaser@*/dist/phaser.min.js', (route) =>
    route.fulfill({ path: VENDOR_PHASER, contentType: 'application/javascript' })
  );

  const params = new URLSearchParams(query);
  if (mute) params.set('mute', '1');
  const search = params.toString();
  const url = pathToFileURL(path.join(ROOT, pagePath)).href + (search ? `?${search}` : '');
  await page.goto(url);

  try {
    await page.waitForFunction(ready, null, { timeout: readyTimeout });
  } catch (err) {
    const detail = errors.length ? `\nBrowser-Fehler:\n${errors.join('\n')}` : '';
    await browser.close();
    throw new Error(`Spiel wurde nicht bereit (${pagePath}?${search}): ${err.message}${detail}`);
  }

  const api = {
    browser,
    context,
    page,
    errors,

    /** Bounding-Box der Canvas in Seitenkoordinaten. */
    async canvasBox() {
      const canvas = await page.$('canvas');
      if (!canvas) throw new Error('Keine Canvas gefunden');
      return canvas.boundingBox();
    },

    /** Rechnet Spielkoordinaten in Seitenkoordinaten um. */
    async toPage(x, y) {
      const box = await api.canvasBox();
      return { x: box.x + (x * box.width) / GAME_WIDTH, y: box.y + (y * box.height) / GAME_HEIGHT };
    },

    /** Klick auf Spielkoordinaten; wartet danach kurz, damit Tweens/Handler laufen. */
    async click(x, y, { settle = 150, ...opts } = {}) {
      const p = await api.toPage(x, y);
      await page.mouse.click(p.x, p.y, opts);
      await page.waitForTimeout(settle);
    },

    async move(x, y) {
      const p = await api.toPage(x, y);
      await page.mouse.move(p.x, p.y);
    },

    async mouseDown(x, y) {
      await api.move(x, y);
      await page.mouse.down();
    },

    async mouseUp() {
      await page.mouse.up();
    },

    /** Drückt die Maus an (x,y), hält `ms` Millisekunden und lässt los (Long-Press). */
    async longPress(x, y, ms) {
      await api.mouseDown(x, y);
      await page.waitForTimeout(ms);
      await page.mouse.up();
    },

    async drag(x1, y1, x2, y2, { steps = 12 } = {}) {
      const a = await api.toPage(x1, y1);
      const b = await api.toPage(x2, y2);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps });
      await page.mouse.up();
    },

    async wheel(x, y, deltaY) {
      await api.move(x, y);
      await page.mouse.wheel(0, deltaY);
      await page.waitForTimeout(80);
    },

    async type(text, { delay = 12 } = {}) {
      await page.keyboard.type(text, { delay });
    },

    async press(key) {
      await page.keyboard.press(key);
      await page.waitForTimeout(40);
    },

    /** Hält eine Taste `ms` Millisekunden gedrückt (z. B. Pfeiltasten in Kapitel 3). */
    async hold(key, ms) {
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
    },

    async wait(ms) {
      await page.waitForTimeout(ms);
    },

    /** Wartet, bis `fn` im Browser truthy liefert. */
    async waitFor(fn, arg = null, { timeout = 10000 } = {}) {
      return page.waitForFunction(fn, arg, { timeout });
    },

    async eval(fn, arg) {
      return page.evaluate(fn, arg);
    },

    /** Snapshot von GameState (über __EDU_DEBUG). */
    async state() {
      return page.evaluate(() => window.__EDU_DEBUG.getState());
    },

    /** Screenshot der Canvas nach screenshots/<name>.png; liefert den Dateipfad. */
    async shot(name) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const file = path.join(SCREENSHOT_DIR, `${name}.png`);
      const canvas = await page.$('canvas');
      await (canvas || page).screenshot({ path: file });
      return file;
    },

    /** Wirft, falls im Browser Fehler aufgetreten sind (außer ignorierte). */
    assertNoErrors() {
      const relevant = errors.filter((e) => !ignoreErrors.some((pattern) => e.includes(pattern)));
      if (relevant.length) throw new Error(`Fehler im Browser:\n${relevant.join('\n')}`);
    },

    async close() {
      await browser.close();
    },
  };
  return api;
}

/** Führt einen benannten Test aus, protokolliert PASS/FAIL und setzt den Exit-Code. */
export async function runTest(name, fn) {
  const started = Date.now();
  try {
    await fn();
    console.log(`PASS  ${name} (${Date.now() - started} ms)`);
  } catch (err) {
    console.error(`FAIL  ${name}\n${err && err.stack ? err.stack : err}`);
    process.exitCode = 1;
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(`Assertion fehlgeschlagen: ${message}`);
}
