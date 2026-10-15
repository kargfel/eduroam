#!/usr/bin/env node
/**
 * build-moodle-zip.mjs – Baut dist/Spiel.zip für den Moodle-Upload.
 *
 * Enthalten ist alles, was git verwaltet – AUSSER dem persönlichen Hosting
 * (deploy/, docs/DEPLOYMENT.md) und diesem Werkzeug selbst. In Markdown-Dateien
 * werden Abschnitte zwischen <!-- nur-im-repo --> und <!-- /nur-im-repo --> entfernt.
 * Zum Schluss prüft das Skript, dass keine persönlichen Hosting-Angaben übrig sind,
 * und bricht sonst ab.
 *
 * Aufruf:   node tools/build-moodle-zip.mjs        → dist/Spiel.zip + dist/PROMPT.md
 * Benötigt: git und zip (macOS/Linux)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(ROOT, 'dist', 'Spiel.zip');
const PACKAGE_DIR_NAME = 'eduroam-simulator';

/** Nicht ins Paket: persönliches Hosting, dieses Werkzeug, Git-Konfiguration. */
const EXCLUDED_PATHS = [/^deploy\//, /^docs\/DEPLOYMENT\.md$/, /^tools\//, /^\.gitignore$/];

/** Abschnitte, die nur im Repo stehen (persönliche Links, Hosting-Hinweise). */
const REPO_ONLY_BLOCK = /<!-- nur-im-repo -->[\s\S]*?<!-- \/nur-im-repo -->\n?/g;

/** Darf im Paket nirgends vorkommen. */
const FORBIDDEN_PATTERNS = [/felixkarg/i, /kargfel/i, /traefik/i, /cloudflare/i, /homeserver/i, /DEPLOYMENT\.md/, /nur-im-repo/];

/** Nur Textdateien werden umgeschrieben und geprüft (Bilder, Phaser-Bundle nicht). */
const TEXT_EXTENSIONS = new Set(['.md', '.js', '.mjs', '.html', '.json', '.yml', '.yaml', '.css', '.txt', '']);
const VENDOR_BUNDLE = 'vendor/phaser.min.js';

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
}

function isTextFile(relativePath) {
  return relativePath !== VENDOR_BUNDLE && TEXT_EXTENSIONS.has(path.extname(relativePath));
}

/** Liste der Dateien fürs Paket: von git verwaltet, existiert, nicht ausgeschlossen. */
function collectFiles() {
  return run('git', ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .filter((file) => !EXCLUDED_PATHS.some((pattern) => pattern.test(file)))
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
}

/** Kopiert eine Datei in den Paketordner; Markdown ohne die Repo-Abschnitte. */
function copyIntoPackage(relativePath, packageDir) {
  const source = path.join(ROOT, relativePath);
  const target = path.join(packageDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (relativePath.endsWith('.md')) {
    const markdown = fs.readFileSync(source, 'utf8').replace(REPO_ONLY_BLOCK, '');
    fs.writeFileSync(target, markdown);
  } else {
    fs.copyFileSync(source, target);
  }
}

/** Sucht verbotene Angaben in allen Textdateien des Pakets. */
function findForbiddenContent(packageDir, files) {
  const hits = [];
  for (const file of files.filter(isTextFile)) {
    const lines = fs.readFileSync(path.join(packageDir, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(line))) hits.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

function main() {
  const uncommitted = run('git', ['status', '--porcelain']).trim();
  if (uncommitted) console.warn('Hinweis: Es gibt uncommittete Änderungen – das Paket enthält den Stand der Arbeitskopie.');

  const files = collectFiles();
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eduroam-moodle-'));
  const packageDir = path.join(stagingRoot, PACKAGE_DIR_NAME);
  try {
    files.forEach((file) => copyIntoPackage(file, packageDir));

    const hits = findForbiddenContent(packageDir, files);
    if (hits.length) {
      throw new Error(`Persönliche Hosting-Angaben im Paket gefunden:\n${hits.join('\n')}`);
    }

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.rmSync(OUTPUT_FILE, { force: true });
    execFileSync('zip', ['-r', '-q', '-X', OUTPUT_FILE, PACKAGE_DIR_NAME], { cwd: stagingRoot });

    const sizeMb = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);
    console.log(`✓ ${path.relative(ROOT, OUTPUT_FILE)} erstellt: ${files.length} Dateien, ${sizeMb} MB`);

    // Bereinigte Prompt-Doku zusätzlich einzeln (Moodle Teil 1: Screenshot + Prompt)
    const promptFile = path.join(path.dirname(OUTPUT_FILE), 'PROMPT.md');
    fs.copyFileSync(path.join(packageDir, 'PROMPT.md'), promptFile);
    console.log(`✓ ${path.relative(ROOT, promptFile)} erstellt (ohne Hosting-Abschnitte)`);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
