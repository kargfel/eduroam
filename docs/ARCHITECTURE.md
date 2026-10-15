# eduroam – Authentifizierung fehlgeschlagen (DHBW Stuttgart Edition)

## Architektur und Schnittstellen-Vertrag

Dieses Dokument ist die verbindliche Schnittstelle zwischen allen Teilen des Spiels.
Mehrere Personen/Agenten bauen parallel; jede:r verlässt sich auf die hier stehenden
Namen und Signaturen. **Bestehende Signaturen dürfen nicht geändert werden.** Neue
optionale Parameter oder zusätzliche Methoden sind erlaubt.

---

## 1. Spielidee in Kürze

Satirischer, technisch realistischer Simulator: Als Erstsemester (fiktive Figur
„Alex Muster“, Kurs WWI26A) an der DHBW Stuttgart versuchst du, ins eduroam zu kommen.

- **5 Kapitel**: 1 Registrierung (Self-Service-Portal) · 2 Konfiguration (Android-WLAN-Dialog)
  · 3 Signaljagd (Arcade, Top-down) · 4 Zertifikat (Evil Twin) · 5 IT-Helpdesk (Boss).
- **Uhr** (Spielzeit ab 07:30, läuft in Echtzeit weiter, Strafen springen vor) und
  **Frust-Meter** (0–100 %) laufen über alle Kapitel. Frust 100 % = Rage-Quit = verloren.
- **Score** am Ende: wenig Spielminuten, wenige Fehlversuche, wenig Frust, viele Erfolge.
  Highscore und Erfolge in `localStorage`.
- **Ton**: trockene Behörden-Satire. System-Fehlermeldungen im Spiel sind absichtlich
  vage (das ist der Witz) – aber die *Spielebene* (Aufgabe, Tipps, Post-its) sagt immer
  klar, was als Nächstes zu tun ist. Spieler:innen dürfen frustriert sein, aber nie ratlos
  festhängen: Nach wiederholten Fehlern kommt ein deutlicher Hinweis.
- **Lerneffekt** (ernst gemeint): richtige eduroam-Einstellungen, Zertifikat prüfen statt
  blind vertrauen, offizielle Tools (geteduroam-App / cat.eduroam.org) nutzen.

### Technischer Rahmen

- Phaser **3.90.0** (CDN, lokaler Fallback `vendor/phaser.min.js`), **klassische Scripts**
  (keine ES-Module, kein Build) → startet per Doppelklick auf `index.html` (file://).
- Spielfläche 800×600, `Phaser.Scale.FIT` + `CENTER_BOTH`.
- **Keine externen Assets**: alles per Graphics, Text, generierten Texturen und WebAudio.
- Deutsche Oberfläche mit korrekten Umlauten (alle Dateien UTF-8).

### Visuelle Identität: „Behördenpapier trifft Systemdialog“

| Token | Wert | Verwendung |
|---|---|---|
| Nachtblau `BG` | `#0e2240` | Spielhintergrund, Campus bei Nacht/Kessel |
| Kopierpapier `PAPER` | `#f2f3ef` | Merkblatt, Begrüßungsbrief, Formulare (leicht schräg, ±2°) |
| Stempelrot `DHBW_RED` | `#e2001a` | Fehler, Ablehnung, **Stempel-Effekt** |
| Baustellengelb `HAZARD` | `#f5c400` | Warnungen, Gefahrenzonen (S21-Schraffur) |
| System-Blau `PRIMARY` | `#1a73e8` | echte OS-Dialoge, Buttons, Fokus |
| Weiß/Grau `SURFACE`… | `#ffffff` / `#f1f3f4` | Android-/Windows-Dialoge sollen echt aussehen |

Schriften (nur Systemschriften, Rollen in `CONFIG.FONTS`): `UI` für Systemdialoge,
`PAPER` (Schreibmaschine) für Behördenpapier, `HAND` für Post-its/Notizen, `STAMP`
(Arial Black) nur für Stempel, `MONO` für Technisches (Fingerabdrücke, Logcat).

**Signatur-Effekt:** `FX.stamp()` – ein roter Gummistempel („ABGELEHNT“, „GESPERRT“ …)
knallt schräg aufs Bild, mit kurzem Screenshake und dumpfem Sound. Das ist das *eine*
auffällige Element; alles andere bleibt ruhig und diszipliniert. Kein Deko-Gewackel,
keine Dauer-Animationen ohne Anlass. Bewegung antwortet auf Aktionen.

---

## 2. Projektstruktur und Zuständigkeiten

```
eduroam-simulator/
├── index.html                  Setup        Script-Reihenfolge (siehe 4.)
├── package.json                Setup        devDependency playwright 1.63.0
├── vendor/phaser.min.js        Setup        Phaser 3.90.0 (Offline-Fallback)
├── src/
│   ├── config.js               Setup        CONFIG (eingefroren) + RUNTIME (URL-Flags)
│   ├── campus.js               Recherche    CAMPUS – Standortfakten DHBW Stuttgart
│   ├── core/                   core-state   rng.js, events.js, storage.js, scoring.js, gameState.js
│   ├── audio/sfx.js            core-state   SFX – WebAudio-Synth
│   ├── ui/theme.js             Setup        UI-Namespace, UI.text(), UI.textStyle()
│   ├── ui/fx.js                ui-display   FX – Juice-Effekte inkl. Stempel
│   ├── ui/textures.js          ui-display   Textures.generateAll(scene)
│   ├── ui/widgets/             ui-forms     Button, TextInput, Dropdown, Checkbox, Modal, Toast
│   │                           ui-display   ProgressBar, Spinner, ScrollPanel, Window, Phone
│   ├── logic/chN*.js           Kapitel N    reine Kapitel-Logik (Node-testbar)
│   ├── scenes/                 scenes       ChapterScene, PlaceholderChapterScene, Boot, Menu,
│   │                                        Game, HUD, GameOver
│   ├── scenes/chapters/ChN*.js Kapitel N    Kapitel-Szenen
│   └── main.js                 scenes       Phaser-Konfiguration, URL-Parameter, Debug-API
├── tests/
│   ├── unit/_load.js           Setup        lädt Browser-Scripts in Node
│   ├── unit/*.test.js          je Bereich   node:test
│   ├── pages/*.html            ui-forms/ui-display  eigenständige Widget-Galerien
│   └── e2e/harness.mjs, run-all.mjs  Setup  Playwright-Helfer
│       e2e/*.mjs               je Bereich   Browser-Tests (server.mjs: Hosting über HTTP + CSP)
├── server/serve.mjs            Hosting      Webserver ohne Abhängigkeiten (Port 2222, Freigabeliste, CSP)
├── Dockerfile, docker-compose.yml, .dockerignore   Hosting   Container zum Selbsthosten
├── screenshots/                Tests        PNGs (Moodle + visuelle Prüfung)
└── docs/                       ARCHITECTURE.md, RESEARCH.md
```

Hosting-Regel: Spielcode darf weder `eval` noch `new Function` benutzen und keine
weiteren Inline-Scripts in `index.html` brauchen, sonst greift die Content-Security-Policy
des Servers (Details in `server/serve.mjs`).

**Dateihoheit:** Jede:r ändert nur die eigenen Dateien. Wer einen Fehler in fremden
Dateien findet, baut lokal einen Workaround und meldet den Fehler im Ergebnisbericht.

---

## 3. Konventionen

- **Globals:** Klassische Scripts teilen einen globalen Scope. Jede Datei definiert genau
  die hier genannten Globals (`const X = …` oder `class X …`). Hilfsfunktionen kapseln
  (statische Methoden, Objekt-Properties, IIFE) – keine losen Top-Level-Funktionen.
  Kapitel-Dateien: Logik-Global `ChNLogic`, Szenen-Klasse `ChN…Scene`.
- **Namen:** Bezeichner Englisch (camelCase, Klassen PascalCase, Konstanten UPPER_SNAKE),
  Booleans `is/has/can/should…`, Handler `on…`/`handle…`. **Kommentare Deutsch**, jede
  Datei mit Kopfkommentar (Zweck, Globals, Abhängigkeiten), öffentliche Methoden mit JSDoc.
- **Keine Magic Numbers** in Szenen: Layout-/Balance-Werte als benannte Konstanten am
  Dateianfang (bzw. im Logik-Modul), globale Werte aus `CONFIG`.
- **Reine Logik** (`src/config.js`, `src/campus.js`, `src/core/*`, `src/logic/*`) benutzt
  weder `Phaser` noch `window`/`document` (Ausnahme: Storage kapselt `localStorage`).
- **Zufall nur über `RNG`** (seedbar mit `?seed=`), nie `Math.random()`.
- **Zeit nur über die Szene:** `this.time.delayedCall`, `this.time.addEvent`, Tweens,
  `update(time, delta)`. Kein `setTimeout`/`setInterval` (pausiert nicht mit der Szene).
- **Koordinaten:** Alle Widgets werden über ihre **linke obere Ecke** positioniert.
  Kapitel bespielen `CONFIG.PLAY_AREA` = `{ x: 0, y: 48, width: 800, height: 552 }`.
- **Tiefen:** `CONFIG.DEPTH` (BACKGROUND −10, CONTENT 0, UI 100, OVERLAY 500, DROPDOWN 800,
  MODAL 900, FX 950, TOAST 1000).
- **Texte** immer über `UI.text()` (setzt Schrift, Farbe, Auflösung).
- **Keine echten Zugangsdaten:** Jede Passwort-/Identitätseingabe zeigt den Hinweis
  „Spiel – bitte keine echten Zugangsdaten eingeben“. Nichts verlässt den Browser;
  Passwörter liegen nur im Speicher (`GameState`), nie in `localStorage`.
- **Sprache:** natürlich, inklusiv wo es sich anbietet („Erstis“, „Kommiliton:innen“).
  Schwäbisch als Würze, nicht als Dauerwitz.

### Phaser-3.90-Fallen

- Partikel: `scene.add.particles(x, y, key, config)` liefert direkt einen `ParticleEmitter`
  (`createEmitter` gibt es nicht mehr). Einmal-Explosion: `emitting: false` +
  `emitter.explode(n, x, y)`; Emitter danach per `delayedCall` zerstören.
- Container-Klickflächen: **nicht** `container.setInteractive()` (Hit-Area versetzt).
  Stattdessen ein Hintergrund-`Rectangle` als Kind mit `setOrigin(0)` und
  `setInteractive({ useHandCursor: true })`.
- `GeometryMask` rechnet in Weltkoordinaten; die Masken-Graphics nicht in einen Container.
- Listener immer abmelden: `GameState`-Events über `ChapterScene.listen()`, Tastatur über
  `ChapterScene.onKey()` bzw. in `shutdown`. DOM-Listener (paste) im Widget bei `destroy`.
- `scene.restart()` ruft `create()` erneut auf → Instanzfelder in `create()` initialisieren,
  nicht im Konstruktor.
- Szenen-Reihenfolge = Zeichenreihenfolge. main.js registriert: Boot, Menu, Game,
  Kapitel 1–5, HUD, GameOver (HUD liegt über den Kapiteln).

---

## 4. Lade-Reihenfolge (`index.html`)

Phaser → `config.js` → `campus.js` → `core/rng.js` → `core/events.js` → `core/storage.js`
→ `core/scoring.js` → `core/gameState.js` → `audio/sfx.js` → `ui/theme.js` → `ui/fx.js`
→ `ui/textures.js` → Widgets (Button, TextInput, Dropdown, Checkbox, Modal, Toast,
ProgressBar, Spinner, ScrollPanel, Window, Phone) → `logic/ch1…ch5` → `scenes/ChapterScene.js`
→ `PlaceholderChapterScene.js` → Boot, Menu, Game, HUD, GameOver → `scenes/chapters/Ch1…Ch5`
→ `main.js`.

Code darf beim Laden (Top-Level) nur Globals aus *früher* geladenen Dateien benutzen.
Zugriffe auf später geladene Globals nur innerhalb von Funktionen/Methoden.

---

## 5. Kern-API

### 5.1 `CONFIG` und `RUNTIME` (src/config.js) – fertig

Siehe Datei. Wichtig: `CONFIG.COLORS` (Zahlen), `CONFIG.CSS` (gleiche Schlüssel als
`'#rrggbb'`), `CONFIG.FONTS`, `CONFIG.CLOCK` (START_MINUTES 450, LECTURE_MINUTES 495,
REAL_MS_PER_GAME_MINUTE 4000, MILESTONES), `CONFIG.FRUSTRATION` (MAX 100, TINY 2, SMALL 4,
MEDIUM 8, LARGE 15, HUGE 25), `CONFIG.PENALTY_MINUTES` (SMALL 2, MEDIUM 5, LARGE 15, HUGE 60),
`CONFIG.TIMING`, `CONFIG.DEPTH`, `CONFIG.CHAPTERS[i] = { id, key, title, short, intro }`,
`CONFIG.ACHIEVEMENTS[ID] = { id, title, description }`, `CONFIG.SCORE`, `CONFIG.RANKS`,
`CONFIG.STORAGE_PREFIX`. `CONFIG` ist tief eingefroren.

`RUNTIME = { startChapter, skipIntro, muted, seed, unlockAll }` – veränderbar, wird in
main.js aus den URL-Parametern befüllt, bevor das Spiel startet.

### 5.2 `CAMPUS` (src/campus.js)

Schlüssel (fest; nur Werte dürfen sich durch die Recherche ändern): `id, name, city,
studentName, course, courseName, lectureRoom, lectureBuilding, username, realm, identity,
anonymousIdentity, initialPassword, defaultPassword, wifi { ssid, guestSsid, security,
eapMethod, phase2, caCertOption, ocsp, domain }, certificate { serverName, issuer, rootCA,
validFrom, validTo, sha256, outdatedRootCA }, portal { name, url }, helpdesk { name, hours,
ticketPrefix, phone }, services { schedule, grades, lms }, buildings[], flavor
{ swabianWords[], exclamations[], places[] }, research { verified[], sources[], notes[] },
realWorldTip, disclaimer`. Kapitel lesen Werte immer aus `CAMPUS`, nie hart codiert.
`realWorldTip` (ernst gemeinter Tipp, wie es wirklich geht) zeigt der GameOver-Bildschirm.

### 5.3 `RNG` (src/core/rng.js)

```js
RNG.seed(value)          // Zahl oder String; ohne Aufruf: zufälliger Seed
RNG.getSeed()            // aktueller Seed (Zahl)
RNG.next()               // [0, 1)
RNG.int(min, max)        // ganze Zahl, beide Grenzen inklusive
RNG.float(min, max)
RNG.chance(p)            // true mit Wahrscheinlichkeit p
RNG.pick(array)
RNG.shuffle(array)       // NEUES gemischtes Array, Original unverändert
```

### 5.4 `Emitter` und `EVENTS` (src/core/events.js)

```js
class Emitter {
  on(event, handler, context)   // → this
  once(event, handler, context) // → this
  off(event, handler, context)  // ohne handler: alle Handler des Events
  emit(event, payload)          // Handler-Fehler werden gefangen und per console.error gemeldet
  removeAllListeners()
}
const EVENTS = {
  STATE_CHANGED: 'state-changed',             // payload: Snapshot (siehe GameState)
  FRUSTRATION_CHANGED: 'frustration-changed', // { value, delta, reason }
  CLOCK_JUMP: 'clock-jump',                   // { minutes, reason }   (Zeitstrafe)
  CLOCK_MILESTONE: 'clock-milestone',         // { minutes, text }
  OBJECTIVE_CHANGED: 'objective-changed',     // { text }
  RAGE_QUIT: 'rage-quit',                     // { reason }  (einmal pro Lauf)
  CHAPTER_COMPLETE: 'chapter-complete',       // { chapterId, stats }
  ACHIEVEMENT: 'achievement-unlocked',        // { id, title, description, isNewGlobal }
  PAUSE_CHANGED: 'pause-changed',             // { paused }
};
```

### 5.5 `Storage` (src/core/storage.js)

`localStorage` gekapselt mit `try/catch`; ohne `localStorage` (oder bei Fehlern) In-Memory-
Fallback. Alle Schlüssel mit `CONFIG.STORAGE_PREFIX`.

```js
Storage.get(key, fallback)        // JSON-geparst; bei Fehler fallback
Storage.set(key, value)           // JSON; → boolean (Erfolg)
Storage.remove(key)
Storage.getHighscore()            // { score, rank, clockLabel, won, date } | null
Storage.submitHighscore(entry)    // → true, wenn neuer Highscore (speichert dann)
Storage.getAchievements()         // string[] (IDs, global über alle Läufe)
Storage.addAchievement(id)        // → true, wenn global neu
Storage.getUnlockedChapter()      // höchste freigeschaltete Kapitelnummer (≥ 1)
Storage.unlockChapter(id)         // setzt max(alt, id)
Storage.getSettings()             // { muted: false, … }
Storage.setSettings(partial)      // merged
Storage.resetAll()                // nur für Tests/„Daten löschen“
```

### 5.6 `Scoring` (src/core/scoring.js) – reine Funktionen

```js
Scoring.computeScore({ clockMinutes, totalFails, frustrationPeak, achievementCount, won })
  // BASE − (clockMinutes − START_MINUTES)·PER_MINUTE − totalFails·PER_FAIL
  // − frustrationPeak·PER_FRUSTRATION + achievementCount·PER_ACHIEVEMENT (+ WIN_BONUS bei Sieg)
  // verloren: × LOSS_FACTOR; gerundet; nie < 0
Scoring.rankTitle(score)          // Titel aus CONFIG.RANKS
Scoring.formatClock(minutes)      // 535 → "08:55"; ab 1440: "Tag 2, 07:31"
Scoring.minutesLate(minutes)      // max(0, minutes − LECTURE_MINUTES)
```

### 5.7 `GameState` (src/core/gameState.js)

Singleton (Instanz einer `Emitter`-Unterklasse). Hält den Zustand **eines Laufs**.

```js
// Lebenszyklus
GameState.startRun(startChapterId = 1) // setzt alles zurück, status 'running', paused false
GameState.finishRun(won, reason = null) // → Ergebnis (siehe unten); status 'won'|'lost'
GameState.abortRun()                    // status 'aborted' (zurück ins Menü)

// Lesen
GameState.getSnapshot()   // tiefe Kopie:
  // { status, paused, currentChapterId, clockMinutes, clockLabel, frustration, frustrationPeak,
  //   attempts: { [chapterId]: { fails, successes } }, totalFails, chapterStats: { [id]: {...} },
  //   runAchievements: [id], objective, flags: {…} }
GameState.getClockMinutes()
GameState.getClockLabel()           // Scoring.formatClock(clockMinutes)
GameState.isPastLecture()
GameState.getFrustration()
GameState.isPaused()
GameState.getCredentials()          // { username, identity, password, isDefault }
                                    // ohne setCredentials: CAMPUS.defaultPassword, isDefault true
GameState.getFlag(key, fallback)

// Schreiben (alle senden STATE_CHANGED)
GameState.setCurrentChapter(id)
GameState.setObjective(text)        // + OBJECTIVE_CHANGED (HUD zeigt die Aufgabe)
GameState.setCredentials({ username, password })
GameState.setFlag(key, value)       // kapitelübergreifende Merker (z. B. 'phished')
GameState.addFrustration(amount, reason)    // clamp 0..MAX, + FRUSTRATION_CHANGED;
                                            // erreicht MAX → einmalig RAGE_QUIT
GameState.reduceFrustration(amount, reason)
GameState.advanceClock(minutes, reason)     // Zeitstrafe, + CLOCK_JUMP; prüft Meilensteine
GameState.tick(deltaMs)             // nur wenn status 'running' und nicht pausiert;
                                    // Echtzeit → Spielminuten; prüft Meilensteine
GameState.setPaused(bool)           // + PAUSE_CHANGED
GameState.recordFail(chapterId, reason)
GameState.recordSuccess(chapterId)
GameState.completeChapter(chapterId, stats = {}) // speichert stats, + CHAPTER_COMPLETE
GameState.unlockAchievement(id)     // einmal pro Lauf; Storage.addAchievement; + ACHIEVEMENT

// Events: GameState.on/once/off/emit (siehe Emitter)
```

**Meilensteine:** Überschreitet die Uhr (durch `tick` oder `advanceClock`) einen Eintrag aus
`CONFIG.CLOCK.MILESTONES`, wird er genau einmal pro Lauf ausgelöst: `CLOCK_MILESTONE` und
ggf. `addFrustration(milestone.frustration, 'milestone')`.

**`finishRun(won, reason)`** vergibt globale Erfolge (`ON_TIME`: gewonnen und
`clockMinutes < LECTURE_MINUTES`; `ZEN_MASTER`: gewonnen und `frustrationPeak < 40`;
`RAGE_QUIT`: verloren mit reason `'rage'`), berechnet den Score, reicht den Highscore ein
(`Storage.submitHighscore`) und liefert:

```js
{ won, reason, score, rank, isNewHighscore, highscore, clockMinutes, clockLabel,
  minutesLate, totalFails, frustration, frustrationPeak,
  runAchievements: [{ id, title, description }], chapterStats }
```

### 5.8 `SFX` (src/audio/sfx.js)

WebAudio-Synthesizer, keine Audiodateien. Jede Methode ist ein No-op, wenn stumm oder
kein AudioContext verfügbar – und wirft **nie**.

```js
SFX.init()               // legt AudioContext lazy an; liest Storage-Settings (muted)
SFX.unlock()             // resume() nach erster Nutzergeste (BootScene ruft es auf)
SFX.setMuted(bool)       // speichert in Storage.setSettings
SFX.isMuted()
SFX.toggleMuted()        // → neuer Zustand
// Klänge:
SFX.click() SFX.hover() SFX.type() SFX.error() SFX.fail() SFX.success() SFX.notify()
SFX.popup() SFX.connect() SFX.disconnect() SFX.pickup() SFX.alarm() SFX.stamp()
SFX.modem() SFX.win() SFX.lose() SFX.whoosh() SFX.tick()
SFX.startHoldMusic() SFX.stopHoldMusic()   // Warteschleifen-Melodie (Kapitel 5)
```

`RUNTIME.muted === true` erzwingt Stummschaltung (ohne Settings zu überschreiben).

### 5.9 `UI` – Helfer und Widgets

`UI.text(scene, x, y, str, opts)`, `UI.textStyle(opts)`, `UI.centerX(width)`,
`UI.sound(name)` – fertig (src/ui/theme.js). Text-Optionen: `size, color, font
('UI'|'PAPER'|'HAND'|'STAMP'|'MONO'), bold, italic, align, wrap, lineSpacing, origin, depth`.
**Widgets spielen Klänge nur über `UI.sound('click')`** (funktioniert auch ohne geladenes SFX).
Widgets, die `GameState` oder `Textures` nutzen (Phone-Uhr, Modal-Icons), prüfen mit
`typeof … !== 'undefined'` bzw. `scene.textures.exists(key)` und haben einen Fallback.

Alle Widgets sind Unterklassen von `Phaser.GameObjects.Container`, fügen sich selbst der
Szene hinzu (`scene.add.existing(this)`), werden über die **linke obere Ecke** positioniert,
räumen beim `destroy()` alle Listener ab und sind Event-Emitter (Container-Events).

```js
new UI.Button(scene, x, y, {
  text = '', width = 180, height = 44,
  variant = 'primary',          // 'primary'|'secondary'|'danger'|'success'|'ghost'|'link'
  fontSize = 17, icon = null,   // Textur-Key links neben dem Text
  onClick = null, disabled = false, sound = true,
})
  .setEnabled(bool) .isEnabled() .setText(str) .setVariant(v) .setOnClick(fn)
  // Event 'click'

new UI.TextInput(scene, x, y, {
  width = 300, height = 40, label = null, placeholder = '', value = '',
  password = false, showToggle = false, maxLength = 64, font = 'UI', fontSize = 16,
  hint = null,                  // kleiner Text unter dem Feld
  transformChar = null,         // (char, currentValue, input) => string | null  (Trolle!)
  onChange = null, onSubmit = null, onFocus = null, onBlur = null,
})
  .getValue() .setValue(str, { silent = false } = {}) .focus() .blur() .isFocused()
  .setError(msgOrNull) .setHint(str) .setEnabled(bool) .setPasswordVisible(bool)
  // Events 'change'(value) 'submit'(value) 'focus' 'blur'
UI.TextInput.blurAll(scene)
// Verhalten: höchstens ein fokussiertes Feld pro Szene; Klick daneben → blur;
// Tab/Shift+Tab = nächstes/vorheriges Feld (Erstellungsreihenfolge); Enter = submit;
// Escape = blur; Backspace/Delete, Pfeil links/rechts, Home/End; Einfügen per Strg/Cmd+V
// (jedes Zeichen läuft durch transformChar); SFX.type() je Zeichen; langer Text scrollt
// horizontal mit; blinkender Cursor.

new UI.Dropdown(scene, x, y, {
  width = 300, height = 40, label = null, placeholder = 'Bitte auswählen',
  options = [],                 // [{ value, label, disabled = false, hint = null }]
  value = null, maxVisible = 6, fontSize = 16,
  onChange = null,              // (value, option)
})
  .getValue() .getSelectedOption() .setValue(v, { silent = false } = {}) .setOptions(options)
  .open() .close() .isOpen() .setError(msgOrNull) .setEnabled(bool)
  // Events 'change'(value, option) 'open' 'close'
// Offene Liste: eigenes Top-Level-Objekt mit Tiefe CONFIG.DEPTH.DROPDOWN (nach unten, oder
// nach oben wenn kein Platz), scrollbar ab maxVisible, Klick außerhalb schließt.
// Klick auf disabled-Option: Liste bleibt offen, UI.toast(option.hint) falls vorhanden.

new UI.Checkbox(scene, x, y, { label = '', checked = false, fontSize = 15, onChange = null })
  .isChecked() .setChecked(bool, { silent = false } = {}) .setEnabled(bool)  // Event 'change'

new UI.Modal(scene, {
  title = '', text = '', icon = null,  // 'info'|'warning'|'error'|'success'|'question'
  width = 460,
  buttons = [{ text: 'OK', variant: 'primary' }], // { text, variant, onClick, keepOpen = false }
  closeOnBackdrop = false,
  content = null,              // (container, innerWidth) => Höhe; eigener Inhalt unter dem Text
  onClose = null, sound = true,
})
  .close() .isOpen()
UI.Modal.closeAll(scene)  UI.Modal.isAnyOpen(scene)
// Zentriert, Tiefe CONFIG.DEPTH.MODAL, dunkelt den ganzen Bildschirm ab und blockiert
// Eingaben darunter, ruft UI.TextInput.blurAll(scene). Höhe ergibt sich aus dem Inhalt.

UI.toast(scene, text, { duration = CONFIG.TIMING.TOAST_MS, variant = 'default' })
  // variant 'default'|'error'|'success'|'warning'; Android-Pille unten mittig;
  // mehrere Toasts stapeln sich nach oben; Tiefe CONFIG.DEPTH.TOAST; → Container

new UI.ProgressBar(scene, x, y, { width = 200, height = 14, value = 0, color, bgColor, radius })
  .setValue(v01, animate = true) .getValue() .setColor(color)

new UI.Spinner(scene, x, y, { size = 28, color, thickness = 3 })  .start() .stop()

new UI.ScrollPanel(scene, x, y, {
  width, height, text = '', font = 'UI', fontSize = 14, color, padding = 12,
  bgColor = CONFIG.COLORS.SURFACE, onScroll = null, onScrollEnd = null,
})
  .getProgress() .scrollTo(p01) .scrollBy(px) .setText(str) .getTextObject() .getContent()
  // Mausrad (nur über dem Panel), Ziehen, Scrollbalken; Events 'scroll'(p) 'scrollend'

new UI.Window(scene, x, y, {
  width, height, title = '', variant = 'browser',  // 'browser'|'os'|'paper'
  url = '', closable = false, onClose = null,
})
  .getContentArea()   // { x, y, width, height } in Weltkoordinaten
  .content            // Container an der linken oberen Ecke des Inhaltsbereichs
  .setTitle(str) .setUrl(str) .setLoading(bool)

new UI.Phone(scene, x, y, { width = 300, height = 540, battery = 23, theme = 'light' })
  .getScreenArea()    // { x, y, width, height } unter der Statusleiste, Weltkoordinaten
  .screen             // Container an der linken oberen Ecke des Bildschirms
  .setWifiState(state, level = 0)  // 'off'|'connecting'|'connected'|'no-internet'
  .setBattery(percent) .vibrate()
// Statusleiste: Uhrzeit live aus GameState.getClockLabel(), WLAN-Symbol, Akku.
```

### 5.10 `FX` (src/ui/fx.js)

```js
FX.shake(scene, { intensity = 0.008, duration = 220 } = {})
FX.flash(scene, { color = CONFIG.COLORS.DHBW_RED, alpha = 0.22, duration = 180 } = {})
FX.burst(scene, x, y, { color = 0xffffff, count = 18, speed = 180, lifespan = 600, texture = 'dot' } = {})
FX.confetti(scene, { x = 400, y = 160, count = 80 } = {})
FX.floatText(scene, x, y, text, { color = CONFIG.CSS.DANGER, size = 18, rise = 40, duration = 1100, bold = true } = {})
FX.pulse(scene, target, { scale = 1.08, duration = 120, repeat = 1 } = {})
FX.stamp(scene, text, { x = 400, y = 300, color = CONFIG.COLORS.DHBW_RED, angle = -12,
                        size = 46, hold = 700, sound = true } = {})
  // Signatur-Effekt: Stempel fällt mit Überskalierung ein, Rahmen + Schrift STAMP,
  // leicht unregelmäßige Tinte, kurzer Shake, SFX.stamp(); verblasst nach `hold` ms.
FX.glitch(scene, { duration = 300 } = {})
FX.typewriter(scene, textObject, fullText, { speed = CONFIG.TIMING.INTRO_TYPEWRITER_MS, onComplete } = {})
  // → { skip() }
```

Alle Effekte liegen auf Tiefe `CONFIG.DEPTH.FX`, räumen sich selbst auf und funktionieren
in jeder Szene.

### 5.11 `Textures` (src/ui/textures.js)

`Textures.generateAll(scene)` – idempotent (`scene.textures.exists(key)` prüfen). Weiß auf
transparent (einfärbbar mit `setTint`), außer `face-*`:

| Key | Größe | Inhalt |
|---|---|---|
| `px` | 4×4 | weißes Quadrat |
| `dot` | 8×8 | weicher Kreis |
| `confetti` | 8×4 | Rechteck |
| `icon-wifi-0` … `icon-wifi-4` | 32×32 | WLAN-Fächer mit 0–4 gefüllten Bögen |
| `icon-lock`, `icon-gear`, `icon-sound-on`, `icon-sound-off`, `icon-pause`, `icon-close`, `icon-back` | 24×24 | Symbole |
| `icon-warning`, `icon-error`, `icon-info`, `icon-success`, `icon-question` | 32×32 | Dialog-Symbole |
| `icon-cert`, `icon-router`, `icon-battery` | 32×32 | Zertifikat, Router, Akku |
| `face-0` … `face-4` | 28×28 | Frust-Gesichter, farbig (gelassen → explodierend) |

Kapitel-eigene Texturen erzeugt das Kapitel selbst mit Präfix `chN-`.

### 5.12 `ChapterScene` (src/scenes/ChapterScene.js) – Basisklasse aller Kapitel

```js
class ChapterScene extends Phaser.Scene {
  constructor(chapterId)        // super({ key: CONFIG.CHAPTERS[chapterId - 1].key })
  get chapter()                 // CONFIG.CHAPTERS-Eintrag

  // MUSS als Erstes in create() aufgerufen werden:
  initChapter({ background = CONFIG.COLORS.BG } = {})
    // setzt this.area = CONFIG.PLAY_AREA, this.isFinished = false, this.chapterFails = 0,
    // this.chapterStartMinutes; zeichnet den Hintergrund über PLAY_AREA; Cleanup bei shutdown;
    // GameState.setCurrentChapter(id)

  setObjective(text)            // → GameState.setObjective (HUD zeigt „Aufgabe: …“)
  listen(event, handler)        // GameState.on mit automatischem off bei shutdown
  onKey(handler)                // keydown-Listener (KeyboardEvent) mit Auto-Cleanup

  fail(reason, { frustration = CONFIG.FRUSTRATION.MEDIUM, minutes = 0,
                 x = 400, y = 300, shake = true, stamp = 'ABGELEHNT' } = {})
    // SFX.error, FX.shake (falls shake), FX.stamp(stamp) (falls stamp ≠ null), FX.floatText(reason),
    // GameState.recordFail + addFrustration + advanceClock(minutes, reason); this.chapterFails++
  penalty(minutes, reason, { x, y } = {})   // nur Zeitstrafe, Floating-Text „+5 min · reason“
  relief(amount, reason, { x, y } = {})     // Frust senken, grüner Floating-Text
  succeed(stats = {})
    // idempotent; isFinished = true; SFX.success, FX.confetti; reduceFrustration(SMALL, 'Geschafft');
    // nach CONFIG.TIMING.CHAPTER_END_DELAY: GameState.recordSuccess +
    // completeChapter(id, { fails: chapterFails, minutesSpent, ...stats })
  achievement(id)               // GameState.unlockAchievement(id)
  toast(text, opts)             // UI.toast(this, text, opts)
  showModal(opts)               // new UI.Modal(this, opts)

  debugSolve()                  // MUSS überschrieben werden: löst das Kapitel programmatisch
                                // (wie ein perfekter Spieler) und endet mit this.succeed()
  getDebugInfo()                // optional überschreiben: Zustand für Tests, z. B. { step }
}
```

Kapitel stoppen sich **nie** selbst – den Szenenwechsel macht `GameScene` nach
`CHAPTER_COMPLETE` bzw. `RAGE_QUIT`. Kapitel müssen jederzeit gestoppt oder pausiert
werden können (`scene.pause`); deshalb nur Szenen-Zeit verwenden.

`PlaceholderChapterScene` (gleiche Datei-Hoheit wie ChapterScene): `makePlaceholderChapter(id)`
liefert eine Klasse für noch fehlende Kapitel („Kapitel in Arbeit“ + Button „Abschließen“).
main.js nutzt sie, wenn `typeof ChN…Scene === 'undefined'`.

### 5.13 Szenenfluss

- **BootScene** (`'Boot'`): `Textures.generateAll`, `SFX.init`, `SFX.unlock` bei erster Geste,
  `RNG.seed(RUNTIME.seed)` falls gesetzt, kurze „Verbinde …“-Animation (≤ 1,2 s, entfällt bei
  `RUNTIME.startChapter`), dann `'Menu'` bzw. `'Game'` mit `{ startChapter }`.
- **MenuScene** (`'Menu'`): Titel mit Stempel-Moment (einmalige Lade-Inszenierung),
  „Neues Spiel“, „Kapitel wählen“ (freigeschaltet laut Storage bzw. `RUNTIME.unlockAll`),
  „Erfolge“, Ton an/aus, Highscore, Hinweis/Disclaimer (`CAMPUS.disclaimer`).
- **GameScene** (`'Game'`, Daten `{ startChapter = 1 }`): Ablaufsteuerung eines Laufs.
  `GameState.startRun(startChapter)`, startet `'HUD'`, zeigt Kapitel-Intro (Titelkarte mit
  `chapter.intro` per Typewriter, Button „Los geht's“; Uhr pausiert) – bei `RUNTIME.skipIntro`
  direkt weiter –, startet die Kapitel-Szene, hört auf `CHAPTER_COMPLETE` (Kapitel stoppen,
  `Storage.unlockChapter(id + 1)`, nächstes Intro bzw. nach Kapitel 5 `finish(true)`) und
  `RAGE_QUIT` (Kapitel stoppen, `finish(false, 'rage')`). `update()` → `GameState.tick(delta)`.
  Öffentlich: `startChapter(id)`, `restartChapter()`, `togglePause()`, `isPaused()`,
  `quitToMenu()`, `getActiveChapterScene()`, `skipIntro()`.
- **HUDScene** (`'HUD'`): Leiste oben (48 px): links „Kapitel N von 5: Titel“ + Aufgabe,
  Mitte Uhr (rot ab Vorlesungsbeginn, „+N min zu spät“), rechts Frust-Barometer (Balken +
  `face-*`) sowie Ton- und Pause-Button. Meilensteine und Erfolge als Benachrichtigung, die
  von oben unter die Leiste gleitet. Pause-Overlay (Weiter / Kapitel neu starten / Hauptmenü).
- **GameOverScene** (`'GameOver'`, Daten = Ergebnis von `finishRun`): Sieg „Verbunden!“
  (Pointe: „Ihr Passwort läuft in 3 Tagen ab.“) oder Rage-Quit (Pointe: mobile Daten,
  19,99 € für 1 GB). Statistik, Score-Hochzählen, Rang, neue Erfolge, Highscore-Feier,
  Buttons „Nochmal“ und „Hauptmenü“.

### 5.14 URL-Parameter und Debug-API (main.js)

URL: `?chapter=N` (direkt in Kapitel N), `?skipintro=1`, `?mute=1`, `?seed=S`, `?unlock=all`.

```js
window.__EDU_DEBUG = {
  ready,                 // true, sobald Menü bzw. (bei ?chapter) die Kapitel-Szene läuft
  game,
  events: [],            // Protokoll aller GameState-Events { event, payload }
  getState(),            // GameState.getSnapshot()
  getActiveScenes(),     // Keys der aktiven Szenen
  getChapterScene(),     // aktive ChapterScene oder null
  startChapter(n, { skipIntro = true } = {}),
  skipIntro(),           // „Los geht's“ auf der Titelkarte
  solve(),               // getChapterScene().debugSolve()
  setFrustration(v), addMinutes(m),
};
```

---

## 6. Kapitel-Briefings

Gemeinsame Regeln für alle Kapitel:

- **Länge:** 2,5–4 Minuten für Erstspieler:innen. Klarer Ablauf in Schritten; die aktuelle
  Aufgabe steht immer im HUD (`setObjective`).
- **Frust-Budget:** Wer vernünftig spielt, sammelt pro Kapitel ca. 8–12 % Frust, wer
  schludert 25–35 %. Ein ganzer Lauf soll für die meisten schaffbar sein, ein Rage-Quit
  aber eine echte Gefahr. Nach 2–3 Fehlern zum selben Problem kommt ein klarer Hinweis
  („Mitleids-Tipp“), damit niemand festhängt.
- **Zeit:** Strafen über `penalty()`/`fail({ minutes })` – realistisch begründet
  („+5 min: Fehlermeldung gegoogelt“).
- **Stempel sparsam einsetzen:** großer Stempel für echte Rückschläge; für Kleinkram
  `fail(reason, { stamp: null })` oder nur Toast.
- **Eigene Erfolge:** nur die aus dem eigenen Block in `CONFIG.ACHIEVEMENTS`.
- **Daten aus `CAMPUS`** (Kennung, Realm, Domain, Zertifikat, Orte), nichts hart codieren.
- **`debugSolve()`** löst das Kapitel vollständig, **`getDebugInfo()`** liefert den Schritt.

### Kapitel 1 – Die Registrierung (`Ch1RegistrationScene`, `Ch1Logic`)

Browser-Fenster (`UI.Window`, variant `browser`, URL `CAMPUS.portal.url`) mit dem
Self-Service-Portal; daneben der **Begrüßungsbrief** auf Papier (Kennung, Initialpasswort
mit verwechselbaren Zeichen `I l 1 O 0`, Kurs). Ladezeiten über „EDGE“-Mobilfunk.
Schritte (Vorschlag, Ausgestaltung frei):
1. Login mit Kennung + Initialpasswort (Lupe auf dem Brief zeigt die Zeichen eindeutig, kostet Zeit).
2. CAPTCHA „Wähle alle Bilder mit Access Points“ (3×3, gezeichnete Router vs. Rauchmelder/
   Lampen); der erste Versuch scheitert immer („Bitte erneut versuchen“).
3. Nutzungsordnung (`UI.ScrollPanel`, absurd lang; „Akzeptieren“ erst am Ende aktiv;
   verstecktes Wort → `TOS_READER`).
4. Neues Passwort: Regeln erscheinen nacheinander, sobald die vorige erfüllt ist („Password
   Game“-Prinzip: Länge, Ziffer, Sonderzeichen, Kurs `CAMPUS.course`, schwäbisches Wort,
   Ziffernsumme, kein ß, …); danach Bestätigen-Feld. Ergebnis `GameState.setCredentials`.
5. „Synchronisation mit dem WLAN-System kann bis zu 24 h dauern“: Warten (+24 h) oder
   „Seite neu laden“ (je +1 min, nach zufällig 3–6 Versuchen erledigt).
Erfolge: `PASSWORD_POET`, `TOS_READER`, `CAPTCHA_HUMAN`.

### Kapitel 2 – Die Konfiguration (`Ch2ConfigScene`, `Ch2Logic`)

`UI.Phone` mit Android-WLAN-Liste (eduroam, `CAMPUS.wifi.guestSsid`, „FRITZ!Box 7590 XY“,
„iPhone von Kevin“ …) → eduroam antippen → Konfigurationsdialog: EAP-Methode, Phase-2-
Authentifizierung, CA-Zertifikat (inkl. „Nicht validieren“ → seit Android 11 nicht mehr
verfügbar), Online-Zertifikatstatus, Domain, Identität, Anonyme Identität, Passwort.
Daneben das **IT-Merkblatt „Stand 2014“** (teils veraltet: z. B. `CAMPUS.certificate.
outdatedRootCA`, Kennung ohne Realm) und ein Post-it mit dem Passwort aus Kapitel 1
(`GameState.getCredentials()`). „Verbinden“ zeigt realistische, vage Zustände
(„Authentifizierungsproblem“, „Gespeichert“, „Domain stimmt nicht überein“) mit Spinner.
Trolle (sparsam): Tastatur steht plötzlich auf EN (y↔z per `transformChar`), Autokorrektur,
„Netzwerk entfernen“ nötig, weil Android die alte Konfiguration behält. Optional: Knopf
„geteduroam-App installieren“ – braucht Internet (Catch-22). Ende: „Verbunden, kein Internet“.
`Ch2Logic.validateConfig(config, CAMPUS)` → `{ ok, field, code, message, hint }`.
Erfolge: `FIRST_TRY_CONFIG`, `ANON_IDENTITY`.

### Kapitel 3 – Die Signaljagd (`Ch3SignalHuntScene`, `Ch3Logic`)

Top-down-Campus (Hörsaal, Flure, Treppenhaus, Mensa, Bibliothek, Innenhof, Keller),
Steuerung Pfeiltasten/WASD. Ziel: Download-Balken (Referatsfolien, z. B. 48 MB) auf 100 %
bringen, bevor ein Kapitel-Countdown abläuft. Fortschritt ∝ Signalqualität am Standort
(Access Points mit Reichweite; Menschentrauben in der Nähe teilen die Bandbreite).
Funklöcher (Treppenhaus/Keller/Aufzug) trennen die Verbindung („Authentifiziere …“, Frust).
Gefahren: S21-Baustelle (gesperrter Bereich), Hausmeister wischt (rutschig/langsam).
Pickups: Brezel (−Frust), Kaffee (Tempo), Repeater (Signal-Boost). Countdown abgelaufen →
Fail + Neustart des Downloads mit etwas Restfortschritt (nie Sackgasse).
`Ch3Logic`: Karten-/Level-Daten, Signalberechnung, Bandbreitenteilung, Kollisionshilfen.
Erfolge: `NO_DEADZONE`, `BREZEL_LOVER`.

### Kapitel 4 – Das Zertifikat (`Ch4CertificateScene`, `Ch4Logic`)

`UI.Phone`: drei Netze „eduroam“ (unterschiedliche Signalstärken/BSSIDs). Mehrere Runden
(z. B. 5): Zertifikatsdialog mit Server-Name, Aussteller, Root-CA, Gültigkeit, SHA-256-
Fingerabdruck → „Vertrauen“ / „Ablehnen“ / „Details“. Referenz: offizielle IT-Seite
(Werte aus `CAMPUS.certificate`). Fälschungen mit erkennbaren Merkmalen (Tippfehler-Domain,
`…dhbw-stuttgart.de.evil.example`, selbstsigniert „Kevin's CA“, abgelaufen, falscher
Fingerabdruck); Plot-Twist: legitimer Zertifikatswechsel, den nur die IT-News erwähnen.
Böse UX: „Automatisch vertrauen in 10 s“. Evil Twin vertraut → `PHISHED`, großer Frust,
Passwort ändern (Zeitstrafe), `GameState.setFlag('phished', true)` – kein sofortiges Aus.
Ziel: mit dem echten Netz verbinden. Die Sicherheitsbotschaft muss fachlich stimmen.
`Ch4Logic.isTrustworthy(cert, reference)` → `{ trustworthy, reasons[] }`.
Erfolge: `CERT_INSPECTOR`, `PHISHED`.

### Kapitel 5 – Der IT-Helpdesk (`Ch5HelpdeskScene`, `Ch5Logic`)

Ticketsystem/Chat mit dem IT.Service Center (`CAMPUS.helpdesk`). Konto gesperrt (zu viele
Fehlversuche; ggf. Bezug auf `phished`). Bosskampf: Balken „Ticket-Status“ (offen → gelöst)
als Boss-HP; jede Runde eine Standardantwort/-frage des Helpdesks, 3–4 Antwortoptionen
(richtig = Fortschritt, falsch = Frust). Parallel ein **Pop-up-Gewitter** (Umfragen,
„Ihr Ticket wurde zusammengeführt“, Sitzungs-Timeout …), das per kleinem × weggeklickt
werden muss. Sprechzeiten-Gag mit der Spieluhr. Finale: „Haben Sie es schon mit Aus- und
wieder Einschalten versucht?“ → Power-Taste am Handy lange drücken → Neustart-Animation →
verbunden. Warteschleifenmusik (`SFX.startHoldMusic`).
`Ch5Logic`: Dialogbaum/Zustandsautomat, Pop-up-Zeitplan.
Erfolge: `TURNED_OFF_ON`, `HELPDESK_HERO`.

---

## 7. Tests

- **Unit (Node):** `npm run test:unit` → `node --test "tests/unit/*.test.js"`. Browser-Scripts
  laden mit `tests/unit/_load.js` (`loadScripts(files, names)`; `CORE_LOGIC_FILES`).
  Variablen im Test-Modul dürfen wie Globals heißen (`const { CONFIG } = …` ist im
  Modul-Scope erlaubt). Jede Datei läuft in eigenem Prozess.
- **Browser (Playwright):** `npm run test:e2e` → alle `tests/e2e/*.mjs`. Helfer in
  `tests/e2e/harness.mjs`: `launchGame({ query, page, ready })`, `click(x, y)` in
  Spielkoordinaten, `type`, `press`, `hold`, `longPress`, `drag`, `wheel`, `waitFor`,
  `eval`, `state()`, `shot(name)`, `assertNoErrors()`, `runTest(name, fn)`, `assert`.
  Die Phaser-CDN-Anfrage wird automatisch auf `vendor/` umgeleitet.
- **Pflicht je Kapitel** (`tests/e2e/chN.mjs`): Happy Path mit **echten Eingaben**
  (Klicks/Tippen), mindestens ein Fehlerpfad (Fail erhöht `totalFails`/Frust),
  `debugSolve()`-Pfad, keine Browser-Fehler, Screenshots `screenshots/chN-*.png`, die
  angeschaut werden (Layout, Überlappungen, abgeschnittene Texte).
- **Widget-Galerien:** `tests/pages/forms.html` und `tests/pages/display.html` binden
  Phaser + config + theme + die Widgets ein und setzen `window.__GALLERY_READY = true`.

## 8. Definition of Done (für jeden Teil)

1. Eigene Dateien vollständig, kommentiert, ohne Platzhalter.
2. Eigene Unit-Tests und Browser-Tests grün; keine Konsolenfehler.
3. Screenshots angesehen, Layout geprüft.
4. Vertrag eingehalten (Namen, Signaturen, Tiefen, Koordinaten, keine fremden Dateien geändert).
5. Kurzer Ergebnisbericht: was gebaut wurde, wie man es löst/testet, bekannte Grenzen,
   gefundene Fehler in fremden Dateien.

---

## 9. Kern-Hinweise für Kapitel

Ergänzung aus der Kern-Integration (Stand nach dem Integrationslauf). Der Vertrag in
Abschnitt 5 gilt unverändert; hier stehen Fallstricke, gemessene Werte und erprobte Muster.
Alle Beispiele laufen so in `tests/e2e/core-integration.mjs`.

### 9.1 Fallstricke (Phaser 3.90 und Kern)

- **Tastatur – Doppelmeldungen:** Phaser 3.90 meldet bei mehreren Tastatur-Events im selben
  Frame frühere `keydown`s erneut (gemessen: 3 Tasten → 11 Aufrufe). `ChapterScene.onKey()`
  filtert das jetzt (jedes `KeyboardEvent` genau einmal). Eigene
  `this.input.keyboard.on('keydown' | 'keydown-X', …)`-Listener filtern **nicht** → `onKey()`
  benutzen oder `ChapterScene.dedupeKeyHandler(fn, this)`. Bei `addKey(s)`-Objekten bleibt
  `isDown` korrekt (Phaser spielt die Queue in Reihenfolge erneut ab) – Bewegung per `isDown`
  ist sicher, deren `'down'`-Events und `JustDown` können aber doppelt kommen.
- **Escape gehört dem HUD (Pause)**, außer im Kapitel ist ein `UI.TextInput` fokussiert (Escape =
  blur), eine `UI.Dropdown`-Liste offen (Escape schließt sie) oder der oberste `UI.Modal` hat
  `closeOnEscape` (Escape schließt ihn). Ein offener Dialog **ohne** Escape-Funktion blockiert
  die Pause nicht. Die Prüfung nutzt die Widget-Registries und findet beliebig tief
  verschachtelte Felder.
- **Kürzel nicht beim Tippen auslösen:** Vor eigenen Tasten (WASD, Leertaste, Enter) prüfen:
  `UI.TextInput.isAnyFocused(this) || UI.Dropdown.isAnyOpen(this) || UI.Modal.isAnyOpen(this)`.
- **Szenenweite Pointer-Listener** (`this.input.on('pointerdown', …)`) feuern auch bei
  Klicks auf einen Dialog. Bei offenem Modal selbst ignorieren (`UI.Modal.isAnyOpen(this)`).
- **Masken blockieren keine Klicks:** Was in `phone.screen` oder einem `UI.ScrollPanel`
  weggescrollt bzw. maskiert ist, bleibt anklickbar → unsichtbare Seiten mit `setVisible(false)`
  ausblenden (versteckte Felder bekommen dann auch keine Tasten mehr).
- **Alpha 0 = nicht klickbar** (auch wenn nur ein Eltern-Container Alpha 0 hat). Einblenden
  bei Alpha > 0 beginnen (z. B. 0.02).
- **Tiefen:** `FX` (950) liegt über `MODAL` (900): Ein `fail()`-Stempel bei offenem Dialog liegt
  darüber (gewollt). Dauerhafte Stempel per Rückgabewert unter eigene Dialoge legen.
  Dropdown-Listen in Modals liegen automatisch knapp über dem Dialog.
- **Langsame Frames:** Phaser deckelt `delta` in den ersten 120 Frames nach Start/Fokus auf
  16,7 ms. In Headless-Tests (SwiftShader, 25–45 ms pro Frame) laufen Szenen-Timer und die
  Spieluhr dann nur mit ⅓–⅔ Geschwindigkeit → in Tests auf Zustände warten (`waitFor`) statt
  feste Wartezeiten, Timeouts großzügig (Rage-Quit → GameOver: bis 15 s).
- **Kapitel bauen UI teils verzögert auf** (Ladebalken, Intro-Dialog): In Tests erst auf das
  Widget warten (`waitFor(() => UI.TextInput.getAll(scene).length > 0)`), dann klicken.
- **Pause** friert die ganze Kapitel-Szene ein (Timer, Tweens, `update`, Tasten). Kapitel
  pausieren/stoppen sich nie selbst. Nach `succeed()` wird `fail()` ignoriert, `penalty()` und
  `relief()` aber nicht – eigene Timer beim Abschluss stoppen.

### 9.2 Maße zum Planen (gemessen)

| Element | Wert |
|---|---|
| `UI.TextInput` ohne Label / mit Label | 40 / 62 px hoch (`getTotalHeight()`) |
| … mit Label + `CREDENTIALS_HINT` | 80 px, in Feldern **unter 288 px Breite** zweizeilig: 96 px |
| `UI.Dropdown` mit Label | 62 px (+ Hinweis/Fehler wie TextInput) |
| `UI.Phone` (Standard 300×540) `getScreenArea()` | 280×468 px ab (10, 40) relativ zum Handy |
| `UI.Window` Inhaltsbereich | `browser`: ab y = 80, `os`: ab y = 34, Breite = width − 2 |
| HUD-Aufgabe (`setObjective`) | ≤ 45 Zeichen, sonst verkleinert/gekürzt |

Vertikaler Abstand im Formular: `y += widget.getTotalHeight() + 12` statt fester Zahlen.

### 9.3 Muster: TextInput und Dropdown im Handy (bzw. im Browser-Fenster)

```js
this.phone = new UI.Phone(this, 470, 56, { battery: 19 });
const PAD = 12;
const fieldWidth = this.phone.getScreenArea().width - 2 * PAD;   // 256 px
this.identityInput = new UI.TextInput(this, PAD, 16, {
  width: fieldWidth, label: 'Identität', placeholder: 'kennung@realm',
  hint: UI.TextInput.CREDENTIALS_HINT,                 // Pflicht bei Kennung/Passwort
  onChange: (value) => { this.config.identity = value; },
});
this.eapDropdown = new UI.Dropdown(this, PAD, 16 + this.identityInput.getTotalHeight() + 12, {
  width: fieldWidth, label: 'EAP-Methode',
  options: [
    { value: 'PEAP', label: 'PEAP' },
    { value: 'TLS', label: 'TLS' },
    { value: 'LEAP', label: 'LEAP', disabled: true, hint: 'Seit Android 11 nicht mehr verfügbar' },
  ],
  onChange: (value, option) => { this.config.eap = value; },
});
// lokale Koordinaten ab der linken oberen Ecke des Bildschirms (unter der Statusleiste)
this.phone.screen.add([this.identityInput, this.eapDropdown]);
// Browser-Fenster genauso: this.win.content.add([...]) – Window schneidet NICHT ab.
```

WLAN-Symbol: `phone.setWifiState('connected', 3)` immer **mit** Pegel aufrufen. Ohne Pegel
zeigt das Handy den bisherigen Pegel bzw. volle 4 Bänder (bewusst statt des Defaults 0 aus
5.9, der „verbunden“ mit leerem Fächer zeigen würde); `'connecting'` animiert von selbst.

Die offene Dropdown-Liste wird nicht vom Handy-Rand beschnitten (sie liegt auf
`DEPTH.DROPDOWN` über allem und öffnet nach oben, wenn unten kein Platz ist) → Dropdowns im
oberen Teil des Bildschirms platzieren oder `maxVisible` klein halten. Verschieben/Vibrieren
des Handys ist unkritisch: Klickflächen und Liste folgen dem Container.

### 9.4 Muster: Modal mit eigenem Inhalt (content-Builder)

```js
this.showModal({
  title: 'Neues Passwort', icon: 'question', text: 'Bitte ein neues Passwort festlegen.',
  content: (container, innerWidth) => {
    this.pwInput = new UI.TextInput(this, 0, 0, {
      width: innerWidth, label: 'Passwort', password: true, showToggle: true,
      hint: UI.TextInput.CREDENTIALS_HINT,
    });
    this.questionDropdown = new UI.Dropdown(this, 0, this.pwInput.getTotalHeight() + 12, {
      width: innerWidth, label: 'Sicherheitsfrage', options: ['Lieblingsbrezel', 'Erstes Haustier'],
    });
    container.add([this.pwInput, this.questionDropdown]);
    return this.pwInput.getTotalHeight() + 12 + this.questionDropdown.getTotalHeight(); // Höhe
  },
  buttons: [
    { text: 'Abbrechen' },                               // ohne variant: secondary
    {
      text: 'Speichern',                                 // letzter Button: primary
      onClick: () => {
        if (this.pwInput.getValue().length >= 12) return true;
        this.pwInput.setError('Mindestens 12 Zeichen', { shake: true });
        return false;                                    // false (oder keepOpen) = bleibt offen
      },
    },
  ],
  onClose: (result) => { /* result.reason: 'button' | 'backdrop' | 'escape' | 'api' */ },
});
```

Der Dialog nimmt Feldern darunter den Fokus, Tab wechselt nur zwischen seinen Feldern, Klicks
darunter kommen nicht an. `UI.Modal.closeAll(this)` schließt mit `reason: 'api'` – onClose-
Handler, die „Abbrechen“ bestrafen, sollten `'api'` ignorieren.

### 9.5 Muster: Stempel und Rückmeldungen

```js
this.fail('Domain stimmt nicht überein', { x: 600, y: 300, minutes: CONFIG.PENALTY_MINUTES.SMALL });
this.fail('Tippfehler', { stamp: null, frustration: CONFIG.FRUSTRATION.TINY });  // Kleinkram
FX.stamp(this, 'ZERTIFIKAT\nUNGÜLTIG', { x: 560, y: 260, size: 34, angle: -8 });  // mehrzeilig
const seal = FX.stamp(this, 'GESPERRT', { x: 400, y: 200, hold: 24 * 60 * 60 * 1000 }); // bleibt
seal.setDepth(CONFIG.DEPTH.MODAL - 1);                  // unter eigene Dialoge legen
this.toast('Gespeichert', { variant: 'success' });     // max. 4 gleichzeitig
```

### 9.6 Muster: `debugSolve()`

```js
debugSolve() {
  if (this.isFinished) return;
  this.isSolving = true;                         // eigene Handler (onClose, Timer) prüfen das
  if (this.countdown) { this.countdown.remove(false); this.countdown = null; }
  UI.Modal.closeAll(this);
  UI.Dropdown.closeAll(this);
  UI.TextInput.blurAll(this);
  // Endzustand herstellen, den Folgekapitel brauchen (z. B. Zugangsdaten, Flags)
  GameState.setCredentials({ username: CAMPUS.username, password: CAMPUS.defaultPassword });
  this.succeed({ solvedBy: 'debug' });           // idempotent; danach wird fail() ignoriert
}
```

- Muss aus **jedem** Zustand funktionieren (Startdialog, offene Liste, fokussiertes Feld,
  laufende Animation, Countdown) und darf asynchron sein (`this.time.delayedCall`), muss aber
  mit `this.succeed()` enden (`full-run` wartet bis zu 90 s).
- Keine Strafen, kein Frust; Erfolge möglichst nicht vergeben (Debug ist keine Leistung).
- `getDebugInfo()` liefert mindestens `{ step }` – Tests warten darauf statt auf Zeiten.

### 9.7 Tests

- Echte Klicks über Weltkoordinaten der Widgets: `input.getFieldBounds()`,
  `dropdown.getFieldBounds()`, `dropdown.getOptionBounds(i)` (scrollt die Zeile sichtbar),
  `button.hitRect.getBounds()`, `phone.getPowerButtonArea()`, HUD/Menü/GameOver:
  `scene.getButtonCenter(id)`.
- Umlaute/ß tippt Playwright nicht als `keydown` → per CDP (`typeReal()` in
  `tests/e2e/widgets-forms.mjs`) oder in debug-Pfaden `setValue()`.
- Eigene Test-Szene mit Kern-Widgets: siehe `tests/e2e/core-integration.mjs`
  (`game.scene.add(key, Klasse, true)` nach `scene.stop('Menu')`).
