/**
 * server.mjs – Tests für den Hosting-Server (server/serve.mjs).
 *
 * Startet den Server auf einem freien Port und prüft:
 *  1. Healthcheck, Freigabeliste (nur index.html, src/, vendor/), Path-Traversal,
 *     405 für andere Methoden, ETag/304 und Sicherheits-Header inkl. CSP.
 *  2. Das Spiel läuft über HTTP mit aktiver Content-Security-Policy: kompletter Lauf
 *     per __EDU_DEBUG bis GameOver – ohne Browser-Fehler und ohne CSP-Verstöße.
 *
 * Aufruf: node tests/e2e/server.mjs
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, runTest, assert } from './harness.mjs';

const SERVER_SCRIPT = path.join(ROOT, 'server', 'serve.mjs');
const VENDOR_PHASER = path.join(ROOT, 'vendor', 'phaser.min.js');
const SERVER_START_TIMEOUT_MS = 8000;
const CHAPTER_TIMEOUT_MS = 90000;

/** Pfade, die NICHT öffentlich sein dürfen (roh gesendet, ohne URL-Normalisierung). */
const PRIVATE_PATHS = [
  '/package.json', '/package-lock.json', '/server/serve.mjs', '/tests/e2e/harness.mjs',
  '/docs/ARCHITECTURE.md', '/README.md', '/Dockerfile', '/docker-compose.yml',
  '/node_modules/playwright/package.json', '/.gitignore', '/.git/config',
  '/src/', '/vendor/', '/src/../package.json', '/%2e%2e/package.json',
  '/src/%2e%2e/server/serve.mjs', '/src/..%2f..%2fpackage.json', '/src/.hidden', '/src%5c..%5cpackage.json',
];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await getFreePort();
  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/healthz`);
      if (res.ok) return { base, port, child, getOutput: () => output };
    } catch {
      // Server noch nicht bereit
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill('SIGKILL');
  throw new Error(`Server startete nicht rechtzeitig:\n${output}`);
}

async function stopServer(server) {
  if (server.child.exitCode !== null) return;
  await new Promise((resolve) => {
    server.child.once('exit', resolve);
    server.child.kill('SIGTERM');
  });
}

/** GET mit exakt diesem Pfad (fetch würde '..' und '%2e%2e' vorher wegnormalisieren). */
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

await runTest('server: Healthcheck, Freigabeliste, Header', async () => {
  const server = await startServer();
  try {
    const get = (p, init) => fetch(server.base + p, init);

    const health = await get('/healthz');
    assert(health.status === 200 && (await health.text()).trim() === 'ok', '/healthz → 200 ok');

    const index = await get('/');
    assert(index.status === 200, '/ → 200');
    assert(index.headers.get('content-type').startsWith('text/html'), '/ ist HTML');
    const csp = index.headers.get('content-security-policy') || '';
    assert(csp.includes("script-src 'self' https://cdn.jsdelivr.net"), `CSP erlaubt eigene Scripts + Phaser-CDN (${csp})`);
    assert(/'sha256-[A-Za-z0-9+/=]+'/.test(csp), 'CSP enthält Hashes der Inline-Scripts');
    assert(!csp.includes('unsafe-eval'), 'CSP ohne unsafe-eval');
    assert(index.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
    assert(index.headers.get('x-frame-options') === 'SAMEORIGIN', 'X-Frame-Options: SAMEORIGIN');

    const script = await get('/src/config.js');
    assert(script.status === 200 && script.headers.get('content-type').startsWith('text/javascript'), '/src/config.js → JavaScript');
    assert(script.headers.get('cache-control') === 'no-cache', 'Spielcode: Cache-Control no-cache');
    const etag = script.headers.get('etag');
    const revalidated = await get('/src/config.js', { headers: { 'If-None-Match': etag } });
    assert(revalidated.status === 304, 'gleicher ETag → 304');

    const vendor = await get('/vendor/phaser.min.js');
    assert(vendor.status === 200 && /max-age=\d+/.test(vendor.headers.get('cache-control') || ''), 'vendor/ mit max-age');

    for (const privatePath of PRIVATE_PATHS) {
      const status = await rawGet(server.port, privatePath);
      assert(status === 404, `${privatePath} → 404 (war ${status})`);
    }

    const post = await get('/', { method: 'POST' });
    assert(post.status === 405 && post.headers.get('allow') === 'GET, HEAD', 'POST → 405 mit Allow-Header');
  } finally {
    await stopServer(server);
  }
});

await runTest('server: Spiel läuft über HTTP mit CSP (kompletter Lauf)', async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} (${req.failure()?.errorText})`));
    await page.addInitScript(() => {
      window.__CSP_VIOLATIONS = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__CSP_VIOLATIONS.push(`${event.violatedDirective}: ${event.blockedURI || 'inline'}`);
      });
    });
    // CDN → lokale Kopie: Test läuft offline, die CSP prüft trotzdem die echte CDN-URL
    await page.route('**/phaser@*/dist/phaser.min.js', (route) =>
      route.fulfill({ path: VENDOR_PHASER, contentType: 'text/javascript' })
    );

    await page.goto(`${server.base}/?mute=1&seed=42`);
    await page.waitForFunction(() => window.__EDU_DEBUG && window.__EDU_DEBUG.ready === true, null, { timeout: 20000 });
    await page.evaluate(() => window.__EDU_DEBUG.startChapter(1, { skipIntro: true }));

    const chapterKeys = await page.evaluate(() => CONFIG.CHAPTERS.map((chapter) => chapter.key));
    for (const key of chapterKeys) {
      // Entweder läuft das Kapitel direkt, oder die Intro-Karte wartet auf "Los geht's"
      await page.waitForFunction((expectedKey) => {
        const debug = window.__EDU_DEBUG;
        if (debug.getPhase && debug.getPhase() === 'intro') debug.skipIntro();
        const scene = debug.getChapterScene();
        return Boolean(scene) && scene.sys.settings.key === expectedKey && debug.getActiveScenes().includes(expectedKey);
      }, key, { timeout: CHAPTER_TIMEOUT_MS, polling: 250 });
      await page.evaluate(() => {
        window.__EDU_DEBUG.solve();
      });
    }

    await page.waitForFunction(() => window.__EDU_DEBUG.getActiveScenes().includes('GameOver'), null, { timeout: CHAPTER_TIMEOUT_MS });
    const state = await page.evaluate(() => window.__EDU_DEBUG.getState());
    assert(state.status === 'won', `Lauf über HTTP gewonnen (status ${state.status})`);

    const violations = await page.evaluate(() => window.__CSP_VIOLATIONS);
    assert(violations.length === 0, `keine CSP-Verstöße:\n${violations.join('\n')}`);
    assert(errors.length === 0, `keine Browser-Fehler:\n${errors.join('\n')}`);
  } finally {
    await browser.close();
    await stopServer(server);
  }
});
