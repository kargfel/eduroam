#!/usr/bin/env node
/**
 * serve.mjs – Webserver für das Hosting des eduroam-Simulators (ohne Abhängigkeiten).
 *
 * Liefert ausschließlich die Spieldateien aus (index.html, src/, vendor/) – keine Tests,
 * kein .git, keine node_modules, keine Doku. Setzt Sicherheits-Header inklusive
 * Content-Security-Policy; die Hashes der Inline-Scripts aus index.html werden
 * automatisch berechnet, damit die CSP auch nach Änderungen an index.html passt.
 *
 * Konfiguration über Umgebungsvariablen:
 *   PORT          Port, Standard 2222
 *   HOST          Bind-Adresse, Standard 0.0.0.0 (alle Schnittstellen)
 *   LOG_REQUESTS  "1" = jede Anfrage protokollieren
 *
 * Start:        npm start            bzw.  node server/serve.mjs
 * Healthcheck:  GET /healthz         → 200 "ok"
 * Benötigt:     Node.js ≥ 18
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_FILE = path.join(ROOT, 'index.html');

const DEFAULT_PORT = 2222;
const PORT = parsePort(process.env.PORT, DEFAULT_PORT);
const HOST = process.env.HOST || '0.0.0.0';
const IS_REQUEST_LOG_ENABLED = process.env.LOG_REQUESTS === '1';
const SHUTDOWN_TIMEOUT_MS = 3000;

/** Öffentlich erreichbar sind nur diese Datei und diese Verzeichnisse. */
const PUBLIC_FILES = new Set(['/index.html']);
const PUBLIC_DIRS = ['/src/', '/vendor/'];

/** Phaser kommt per CDN (Fallback: vendor/). Die CSP muss diese Quelle erlauben. */
const PHASER_CDN_ORIGIN = 'https://cdn.jsdelivr.net';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const FALLBACK_MIME_TYPE = 'application/octet-stream';

/** vendor/ ändert sich nur mit einer neuen Phaser-Version → länger cachen. */
const CACHE_CONTROL_VENDOR = 'public, max-age=604800';
/** Alles andere: Browser/Cloudflare fragen per ETag nach, ob es eine neue Version gibt. */
const CACHE_CONTROL_DEFAULT = 'no-cache';

const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
});

/** Liest PORT robust ein; ungültige Werte fallen auf den Standard zurück. */
function parsePort(raw, fallback) {
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

/**
 * Berechnet die CSP-Hashes ('sha256-…') aller Inline-Scripts eines HTML-Dokuments.
 * @param {string} html
 * @returns {string[]}
 */
export function computeInlineScriptHashes(html) {
  const inlineScriptPattern = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  const hashes = [];
  for (const match of html.matchAll(inlineScriptPattern)) {
    const digest = crypto.createHash('sha256').update(match[1], 'utf8').digest('base64');
    hashes.push(`sha256-${digest}`);
  }
  return hashes;
}

/**
 * Baut die Content-Security-Policy. Erlaubt: eigene Dateien, das Phaser-CDN und genau
 * die Inline-Scripts aus index.html. data:/blob: braucht Phaser für interne Texturen.
 * @param {string[]} inlineScriptHashes
 * @returns {string}
 */
export function buildContentSecurityPolicy(inlineScriptHashes) {
  const scriptSources = ["'self'", PHASER_CDN_ORIGIN, ...inlineScriptHashes.map((hash) => `'${hash}'`)];
  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/** CSP-Cache: wird neu berechnet, sobald sich index.html ändert (z. B. nach git pull). */
const cspCache = { mtimeMs: -1, value: buildContentSecurityPolicy([]) };

async function getContentSecurityPolicy() {
  try {
    const stat = await fsp.stat(INDEX_FILE);
    if (stat.mtimeMs !== cspCache.mtimeMs) {
      const html = await fsp.readFile(INDEX_FILE, 'utf8');
      cspCache.value = buildContentSecurityPolicy(computeInlineScriptHashes(html));
      cspCache.mtimeMs = stat.mtimeMs;
    }
  } catch (err) {
    console.error(`CSP konnte nicht aus index.html berechnet werden: ${err.message}`);
  }
  return cspCache.value;
}

/**
 * Bildet einen URL-Pfad auf eine öffentliche Datei ab – oder liefert null.
 * Verhindert Path-Traversal, versteckte Dateien und alles außerhalb der Freigabeliste.
 * @param {string} pathname URL-Pfad, z. B. '/src/config.js'
 * @returns {string|null} absoluter Dateipfad
 */
export function resolvePublicPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;

  const normalized = path.posix.normalize(decoded === '/' ? '/index.html' : decoded);
  const isPublic = PUBLIC_FILES.has(normalized) || PUBLIC_DIRS.some((dir) => normalized.startsWith(dir));
  if (!isPublic) return null;

  const hasHiddenSegment = normalized.split('/').some((segment) => segment.startsWith('.'));
  if (hasHiddenSegment) return null;

  const absolute = path.join(ROOT, normalized);
  return absolute.startsWith(ROOT + path.sep) ? absolute : null;
}

function getCacheControl(pathname) {
  return pathname.startsWith('/vendor/') ? CACHE_CONTROL_VENDOR : CACHE_CONTROL_DEFAULT;
}

function sendText(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

/** Beantwortet eine Anfrage: prüfen → Datei finden → Header setzen → ausliefern. */
async function handleRequest(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Methode nicht erlaubt\n', { Allow: 'GET, HEAD' });
    return;
  }

  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/healthz') {
    sendText(res, 200, 'ok\n');
    return;
  }

  const filePath = resolvePublicPath(pathname);
  const stat = filePath ? await fsp.stat(filePath).catch(() => null) : null;
  if (!stat || !stat.isFile()) {
    sendText(res, 404, 'Nicht gefunden\n');
    return;
  }

  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Security-Policy': await getContentSecurityPolicy(),
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || FALLBACK_MIME_TYPE,
    'Cache-Control': getCacheControl(pathname),
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath)
    .on('error', (err) => {
      console.error(`Lesefehler ${filePath}: ${err.message}`);
      res.destroy(err);
    })
    .pipe(res);
}

function createServer() {
  return http.createServer((req, res) => {
    const startedAt = process.hrtime.bigint();
    if (IS_REQUEST_LOG_ENABLED) {
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
        console.log(`${req.method} ${req.url} → ${res.statusCode} (${ms.toFixed(1)} ms)`);
      });
    }
    handleRequest(req, res).catch((err) => {
      console.error(`Fehler bei ${req.method} ${req.url}: ${err.stack || err}`);
      if (!res.headersSent) sendText(res, 500, 'Interner Fehler\n');
      else res.destroy(err);
    });
  });
}

/** Startet den Server und beendet ihn sauber bei SIGINT/SIGTERM (z. B. docker stop). */
function main() {
  const server = createServer();
  server.on('error', (err) => {
    console.error(`Server konnte nicht starten (${HOST}:${PORT}): ${err.message}`);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`eduroam-Simulator läuft auf http://${HOST}:${PORT} (Dateien aus ${ROOT})`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} empfangen – Server wird beendet.`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** true, wenn diese Datei direkt gestartet wurde (Symlinks aufgelöst, z. B. /tmp → /private/tmp). */
function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// Nur starten, wenn die Datei direkt ausgeführt wird (nicht beim Import in Tests).
if (isDirectRun()) {
  main();
}
