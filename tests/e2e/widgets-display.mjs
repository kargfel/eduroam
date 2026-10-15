/**
 * widgets-display.mjs – Browser-Tests für die ui-display-Teile (Galerie tests/pages/display.html):
 * Texturen, FX (inkl. Stempel), ProgressBar, Spinner, ScrollPanel, Window, Phone.
 *
 * Prüft: alle Texturen existieren in Sollgröße (idempotent, Icons weiß, Gesichter farbig),
 * jeder Effekt löst ohne Fehler aus und räumt sich auf (Display-Objekte, Tweens, Timer,
 * Listener kehren zum Ausgangswert zurück), ScrollPanel per Mausrad bis zum Ende →
 * 'scrollend' genau einmal, ProgressBar-Werte, Phone-Zustände, Szenenwechsel ohne
 * Listener-Lecks, Canvas-Renderer. Screenshots: screenshots/display-*.png.
 *
 * Aufruf: node tests/e2e/widgets-display.mjs
 */
import { launchGame, runTest, assert } from './harness.mjs';

const PAGE = 'tests/pages/display.html';
const NAV_H = 36;

/** Galerie öffnen und warten, bis die gewünschte Seite steht. */
async function openGallery(page = 'textures', extraQuery = '') {
  const query = `page=${page}${extraQuery ? `&${extraQuery}` : ''}`;
  const g = await launchGame({
    page: PAGE,
    query,
    ready: () => window.__GALLERY_READY === true && window.__D && window.__D.ready[window.__D.current] === true,
  });
  await g.wait(250);
  return g;
}

async function showPage(g, page) {
  await g.eval((p) => window.__D.show(p), page);
  await g.waitFor((p) => window.__D.ready[p] === true && window.__D.current === p, page);
  await g.wait(250);
}

const sameCounts = (a, b) => JSON.stringify(a) === JSON.stringify(b);

await runTest('Texturen: alle Schlüssel in Sollgröße, idempotent, Icons weiß, Gesichter farbig', async () => {
  const g = await openGallery('textures');
  try {
    const info = await g.eval(() => window.__D.textureInfo());
    assert(info.length >= 28, `mindestens 28 Texturen erwartet, gefunden ${info.length}`);
    const required = ['px', 'dot', 'confetti', 'icon-wifi-0', 'icon-wifi-1', 'icon-wifi-2', 'icon-wifi-3', 'icon-wifi-4',
      'icon-lock', 'icon-gear', 'icon-sound-on', 'icon-sound-off', 'icon-pause', 'icon-close', 'icon-back',
      'icon-warning', 'icon-error', 'icon-info', 'icon-success', 'icon-question', 'icon-cert', 'icon-router', 'icon-battery',
      'face-0', 'face-1', 'face-2', 'face-3', 'face-4'];
    const byKey = Object.fromEntries(info.map((t) => [t.key, t]));
    required.forEach((key) => {
      const t = byKey[key];
      assert(t && t.exists, `Textur fehlt: ${key}`);
      assert(t.width === t.expected.width && t.height === t.expected.height, `${key}: ${t.width}×${t.height} statt ${t.expected.width}×${t.expected.height}`);
    });
    const sizes = { px: 4, dot: 8, 'icon-lock': 24, 'icon-warning': 32, 'icon-cert': 32, 'face-0': 28, 'icon-wifi-0': 32 };
    Object.entries(sizes).forEach(([key, size]) => assert(byKey[key].width === size, `${key} soll ${size} px breit sein`));
    assert(byKey.confetti.width === 8 && byKey.confetti.height === 4, 'confetti soll 8×4 sein');

    const check = await g.eval(() => {
      const scene = window.__D.scene();
      const before = scene.textures.get('dot');
      const created = Textures.generateAll(scene);
      const px = (key, x, y) => {
        const c = scene.textures.getPixel(x, y, key);
        return c ? { r: c.red, g: c.green, b: c.blue, a: c.alpha } : null;
      };
      return {
        created,
        sameObject: scene.textures.get('dot') === before,
        closeCenter: px('icon-close', 12, 12),
        lockHole: px('icon-lock', 12, 15),
        lockBody: px('icon-lock', 7, 19),
        errorHole: px('icon-error', 16, 16),
        errorRing: px('icon-error', 16, 4),
        face0: px('face-0', 9, 20),
        face4: px('face-4', 14, 9),
        wifiEmpty: px('icon-wifi-1', 16, 7),
        wifiFull: px('icon-wifi-4', 16, 7),
        tintedKey: Textures.tinted(scene, 'icon-lock', 0xe2001a),
        tintedBody: px(Textures.tinted(scene, 'icon-lock', 0xe2001a), 7, 19),
        tintedAgain: Textures.tinted(scene, 'icon-lock', 0xe2001a),
      };
    });
    assert(check.tintedKey === 'icon-lock~e2001a' && check.tintedAgain === check.tintedKey, `Textures.tinted liefert stabilen Schlüssel: ${check.tintedKey}`);
    assert(check.tintedBody && check.tintedBody.r > 200 && check.tintedBody.g < 40 && check.tintedBody.a > 200, `eingefärbte Kopie rot: ${JSON.stringify(check.tintedBody)}`);
    assert(check.created.length === 0, `zweiter Aufruf darf nichts erzeugen: ${check.created}`);
    assert(check.sameObject, 'vorhandene Texturen dürfen nicht ersetzt werden');
    const isWhite = (p) => p && p.r > 240 && p.g > 240 && p.b > 240 && p.a > 200;
    assert(isWhite(check.closeCenter), `icon-close Mitte weiß erwartet: ${JSON.stringify(check.closeCenter)}`);
    assert(isWhite(check.lockBody), 'icon-lock Körper weiß erwartet');
    assert(check.lockHole && check.lockHole.a < 40, `Schlüsselloch soll ausgestanzt sein: ${JSON.stringify(check.lockHole)}`);
    assert(check.errorHole && check.errorHole.a < 40, 'Kreuz im Fehler-Icon soll ausgestanzt sein');
    assert(isWhite(check.errorRing), 'Fehler-Icon-Kreis weiß erwartet');
    assert(check.face0.g > check.face0.r && check.face0.g > check.face0.b, `face-0 soll grün sein: ${JSON.stringify(check.face0)}`);
    assert(check.face4.r > check.face4.g * 2, `face-4 soll dunkelrot sein: ${JSON.stringify(check.face4)}`);
    assert(check.wifiFull.a > 200 && check.wifiEmpty.a < 140, 'WLAN: volle Bänder deckend, leere Bänder blass');
    await g.shot('display-textures');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('FX: alle Effekte lösen aus und räumen sich auf; Stempel-Ablauf', async () => {
  const g = await openGallery('fx');
  try {
    const base = await g.eval(() => window.__D.counts('fx'));
    const settle = { stamp: 1700, stamp2: 1700, stampLong: 1700, stampGreen: 1700, shake: 450, flash: 400, burst: 900, confetti: 3300, float: 1500, pulse: 700, glitch: 600, typewriter: 0 };
    for (const [name, wait] of Object.entries(settle)) {
      if (name === 'typewriter') continue;
      const type = await g.eval((n) => window.__D.fx(n), name);
      assert(type !== 'undefined' || name === 'shake', `${name} soll ein Objekt liefern (bekam ${type})`);
      await g.wait(wait);
      await g.waitFor((b) => JSON.stringify(window.__D.counts('fx')) === b, JSON.stringify(base), { timeout: 3000 })
        .catch(async () => {
          const now = await g.eval(() => window.__D.counts('fx'));
          throw new Error(`${name} hat nicht aufgeräumt: vorher ${JSON.stringify(base)}, nachher ${JSON.stringify(now)}`);
        });
    }

    // Stempel im Detail: Tiefe, Bildschirm-Haftung, Einfallen aus 1,8-facher Größe, Aufprall
    const start = await g.eval(() => {
      const scene = window.__D.scene('fx');
      const stamp = FX.stamp(scene, 'gesperrt', { x: 400, y: 260 });
      return { depth: stamp.depth, sfx: stamp.scrollFactorX, scale: stamp.scaleX, angle: stamp.angle, text: stamp.stampText, alpha: stamp.alpha };
    });
    assert(start.depth === 950, `Stempel-Tiefe CONFIG.DEPTH.FX erwartet, war ${start.depth}`);
    assert(start.sfx === 0, 'Stempel haftet am Bildschirm (scrollFactor 0)');
    assert(Math.abs(start.scale - 1.8) < 0.01, `Startgröße 1,8 erwartet, war ${start.scale}`);
    assert(start.angle < -8 && start.angle > -16, `leicht schräg (≈ −12°) erwartet, war ${start.angle}`);
    assert(start.text === 'GESPERRT', `Großbuchstaben erwartet, war ${start.text}`);
    await g.wait(320);
    const landed = await g.eval(() => {
      const stamp = window.__D.scene('fx').children.list.find((o) => o.isStamp);
      return stamp ? { scale: stamp.scaleX, alpha: stamp.alpha } : null;
    });
    assert(landed && Math.abs(landed.scale - 1) < 0.02 && landed.alpha > 0.99, `nach dem Einfallen Größe 1 und deckend: ${JSON.stringify(landed)}`);
    await g.wait(1400);
    const gone = await g.eval(() => window.__D.scene('fx').children.list.some((o) => o.isStamp));
    assert(!gone, 'Stempel soll nach hold + Ausblenden verschwunden sein');

    // Zeitlupe für Screenshots mitten im Effekt
    await g.eval(() => window.__D.setTimeScale(0.05, 'fx'));
    await g.eval(() => window.__D.fx('stamp'));
    await g.wait(450);
    await g.shot('display-fx-stamp-drop');
    await g.wait(2000);
    await g.shot('display-fx-stamp-impact');
    await g.eval(() => window.__D.setTimeScale(1, 'fx'));
    await g.wait(450);
    await g.shot('display-fx-stamp-hold');
    await g.wait(1200);
    await g.eval(() => window.__D.fx('stamp2'));
    await g.wait(400);
    await g.shot('display-fx-stamp-zweizeilig');
    await g.wait(1400);

    // Schwebetexte stapeln sich
    const floats = await g.eval(() => {
      const scene = window.__D.scene('fx');
      const a = FX.floatText(scene, 400, 320, 'Erster Text');
      const b = FX.floatText(scene, 400, 320, 'Zweiter Text');
      return { ay: a.y, by: b.y, depth: a.depth };
    });
    assert(floats.by > floats.ay + 10, `gleichzeitige Schwebetexte dürfen sich nicht überdecken: ${JSON.stringify(floats)}`);
    assert(floats.depth === 950, 'Schwebetext auf CONFIG.DEPTH.FX');
    await g.wait(1300);

    // Schwebetext weicht einem liegenden Stempel aus (wie in ChapterScene.fail)
    const avoid = await g.eval(() => {
      const scene = window.__D.scene('fx');
      const stamp = FX.stamp(scene, 'ABGELEHNT', { x: 400, y: 260, angle: -12 });
      const below = FX.floatText(scene, 400, 300, 'Grund unter dem Stempel');
      const above = FX.floatText(scene, 400, 230, 'Grund über dem Stempel');
      return { stampY: stamp.y, belowY: below.y, aboveY: above.y };
    });
    assert(avoid.belowY > avoid.stampY + 60, `Text unterhalb soll unter den Stempel ausweichen: ${JSON.stringify(avoid)}`);
    assert(avoid.aboveY < avoid.stampY - 60, `Text oberhalb soll über den Stempel ausweichen: ${JSON.stringify(avoid)}`);
    await g.wait(200);
    await g.shot('display-fx-float-stamp');
    await g.wait(250);
    await g.shot('display-fx-float');
    await g.wait(1200);

    // Puls stellt Größe und Position wieder her
    const pulse = await g.eval(async () => {
      const scene = window.__D.scene('fx');
      const target = window.__D.widgets.fx.pulseTarget;
      const before = { x: target.x, y: target.y, s: target.scaleX };
      FX.pulse(scene, target);
      await new Promise((r) => setTimeout(r, 140));
      const mid = { x: target.x, y: target.y, s: target.scaleX };
      FX.pulse(scene, target, { scale: 1.2 }); // Neustart mitten im Puls
      await new Promise((r) => setTimeout(r, 700));
      return { before, mid, after: { x: target.x, y: target.y, s: target.scaleX } };
    });
    assert(pulse.mid.s > 1.01 && pulse.mid.x < pulse.before.x, `Puls skaliert um die Mitte: ${JSON.stringify(pulse)}`);
    assert(sameCounts(pulse.before, pulse.after), `Puls muss Ausgangswerte wiederherstellen: ${JSON.stringify(pulse)}`);

    // Typewriter: skip() zeigt alles, onComplete genau einmal
    const tw = await g.eval(() => {
      const before = window.__D.typewriterCompletions;
      const handle = window.__D.lastTypewriter || null;
      if (handle) handle.skip();
      window.__D.fx('typewriter');
      const text = window.__D.widgets.fx.typeText;
      const started = text.text.length;
      window.__D.lastTypewriter.skip();
      window.__D.lastTypewriter.skip();
      return { before, after: window.__D.typewriterCompletions, started, final: text.text, expected: CONFIG.CHAPTERS[1].intro, done: window.__D.lastTypewriter.isDone() };
    });
    assert(tw.started === 0, 'Typewriter beginnt mit leerem Text');
    assert(tw.final === tw.expected, 'skip() zeigt den vollständigen Text');
    assert(tw.after - tw.before === 1 && tw.done, `onComplete genau einmal (vorher ${tw.before}, nachher ${tw.after})`);
    await g.eval(() => window.__D.fx('typewriter'));
    await g.wait(900);
    await g.shot('display-fx-typewriter');
    await g.waitFor(() => window.__D.lastTypewriter.isDone(), null, { timeout: 8000 });

    // Glitch (länger, damit er im Screenshot landet) und Konfetti
    await g.eval(() => FX.glitch(window.__D.scene('fx'), { duration: 1500 }));
    await g.wait(300);
    await g.shot('display-fx-glitch');
    await g.wait(1400);
    await g.eval(() => window.__D.fx('confetti'));
    await g.wait(700);
    await g.shot('display-fx-confetti');
    await g.wait(3000);

    const end = await g.eval(() => window.__D.counts('fx'));
    assert(sameCounts(end, base), `nach allen Effekten wieder Ausgangszustand: ${JSON.stringify(base)} → ${JSON.stringify(end)}`);
    const cache = await g.eval(() => FX.getStampCacheSize());
    assert(cache >= 1 && cache <= 12, `Stempel-Texturen werden gecacht (≤ 12), sind ${cache}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Widgets: ProgressBar-Werte, Spinner, ScrollPanel per Mausrad → scrollend genau einmal', async () => {
  const g = await openGallery('widgets');
  try {
    // ProgressBar
    const bar = await g.eval(async () => {
      const b = window.__D.widgets.widgets.bar;
      const changes = [];
      b.on('change', (v) => changes.push(v));
      b.setValue(0.5);
      const immediate = b.getValue();
      await new Promise((r) => setTimeout(r, 900));
      const shown = b.getDisplayedValue();
      b.setValue(2, false);
      const clampedHigh = b.getValue();
      b.setValue(-1, false);
      const clampedLow = b.getValue();
      b.setValue(NaN, false);
      const nan = b.getValue();
      b.setValue(0.25, false);
      return { immediate, shown, clampedHigh, clampedLow, nan, changes, displayed: b.getDisplayedValue() };
    });
    assert(bar.immediate === 0.5, 'getValue() liefert sofort den Zielwert');
    assert(Math.abs(bar.shown - 0.5) < 0.001, `Animation endet beim Zielwert, war ${bar.shown}`);
    assert(bar.clampedHigh === 1 && bar.clampedLow === 0 && bar.nan === 0, 'Werte werden auf 0..1 begrenzt');
    assert(bar.displayed === 0.25, 'animate=false setzt sofort');
    assert(bar.changes[0] === 0.5, 'Event change(value)');

    // Spinner
    const spin = await g.eval(() => {
      const s = window.__D.widgets.widgets.spinner;
      const scene = window.__D.scene();
      const listeners = scene.events.listenerCount('update');
      s.stop();
      const stopped = { running: s.isRunning(), visible: s.visible, listeners: scene.events.listenerCount('update') };
      s.start();
      return { listeners, stopped, running: s.isRunning(), visible: s.visible, after: scene.events.listenerCount('update') };
    });
    assert(spin.stopped.running === false && spin.stopped.visible === false && spin.stopped.listeners === spin.listeners - 1, `stop() hält an und blendet aus: ${JSON.stringify(spin)}`);
    assert(spin.running && spin.visible && spin.after === spin.listeners, 'start() läuft wieder');

    // Kurzer Text: scrollend sofort (genau einmal)
    const shortEnds = await g.eval(() => window.__D.scrollEnds.short || 0);
    assert(shortEnds === 1, `kurzes Panel: scrollend genau einmal, war ${shortEnds}`);

    // Mausrad außerhalb bewegt nichts
    const outside = await g.eval(() => window.__D.widgets.widgets.outsidePoint);
    await g.wheel(outside.x, outside.y, 400);
    await g.wait(300);
    const afterOutside = await g.eval(() => window.__D.widgets.widgets.scroll.getProgress());
    assert(afterOutside === 0, `Mausrad außerhalb darf nicht scrollen (Fortschritt ${afterOutside})`);

    // Mausrad über dem Panel bis zum Ende
    const panel = { x: 440 + 165, y: NAV_H + 36 + 150 };
    let progress = 0;
    for (let i = 0; i < 80 && progress < 1; i++) {
      await g.wheel(panel.x, panel.y, 240);
      progress = await g.eval(() => window.__D.widgets.widgets.scroll.getProgress());
    }
    await g.wait(400);
    progress = await g.eval(() => window.__D.widgets.widgets.scroll.getProgress());
    assert(progress === 1, `Mausrad bis zum Ende: Fortschritt 1 erwartet, war ${progress}`);
    await g.shot('display-scroll-end');
    for (let i = 0; i < 4; i++) await g.wheel(panel.x, panel.y, 300); // weiter drehen
    await g.wheel(panel.x, panel.y, -600); // hoch …
    await g.wait(300);
    for (let i = 0; i < 6; i++) await g.wheel(panel.x, panel.y, 400); // … und wieder runter
    await g.wait(400);
    const ends = await g.eval(() => ({ cb: window.__D.scrollEnds.long, ev: window.__D.scrollEnds.longEvent, scrolls: window.__D.log.filter((e) => e.type === 'scroll').length }));
    assert(ends.cb === 1 && ends.ev === 1, `scrollend genau einmal (Callback ${ends.cb}, Event ${ends.ev})`);
    assert(ends.scrolls > 3, 'scroll-Events beim Scrollen');

    // Ziehen im Text scrollt (nach oben ziehen = weiter nach unten)
    await g.eval(() => window.__D.widgets.widgets.scroll.scrollTo(0));
    await g.drag(panel.x, panel.y + 80, panel.x, panel.y - 60, { steps: 10 });
    await g.wait(200);
    const dragged = await g.eval(() => window.__D.widgets.widgets.scroll.getProgress());
    assert(dragged > 0.02, `Ziehen soll scrollen, Fortschritt ${dragged}`);
    // Scrollbalken-Spur anklicken: eine Seite weiter
    const beforeTrack = await g.eval(() => window.__D.widgets.widgets.scroll.targetY);
    await g.click(440 + 330 - 6, NAV_H + 36 + 280);
    await g.wait(400);
    const afterTrack = await g.eval(() => window.__D.widgets.widgets.scroll.targetY);
    assert(afterTrack > beforeTrack + 100, `Klick in die Spur blättert (${beforeTrack} → ${afterTrack})`);

    // Sehr langer Text wird gestückelt und bleibt vollständig erreichbar
    const long = await g.eval(() => window.__D.makeLongPanel(420));
    assert(long.chunks > 1, `langer Text soll gestückelt werden (${long.chunks})`);
    assert(long.progress === 1 && long.lastChunkHasLastLine, `letzte Zeile erreichbar: ${JSON.stringify(long)}`);
    assert(long.gaps.every((gap) => gap === 4), `Blöcke liegen lückenlos im Zeilenabstand: ${JSON.stringify(long.gaps)}`);
    assert(long.maxChunkHeight <= 3800, `kein Text-Objekt über der sicheren Texturhöhe: ${long.maxChunkHeight}`);

    await g.eval(() => window.__D.widgets.widgets.scroll.scrollTo(0.45));
    await g.wait(200);
    await g.shot('display-widgets');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Fenster: Inhaltsbereich, Laden, Titel/URL, Schließen-Event', async () => {
  const g = await openGallery('windows');
  try {
    const area = await g.eval(() => window.__D.widgets.windows.browserArea);
    assert(area.x === 17 && area.y === NAV_H + 14 + 80 && area.width === 468 && area.height === 219, `Browser-Inhaltsbereich: ${JSON.stringify(area)}`);
    const parts = await g.eval(() => {
      const w = window.__D.widgets.windows;
      return {
        osArea: w.os.getContentArea(),
        paperArea: w.paper.getContentArea(),
        contentPos: { x: w.browser.content.x, y: w.browser.content.y },
      };
    });
    assert(parts.osArea.y === NAV_H + 14 + 34, `OS-Inhalt unter der Titelleiste: ${JSON.stringify(parts.osArea)}`);
    assert(parts.contentPos.x === 1 && parts.contentPos.y === 80, 'content-Container an der Ecke des Inhaltsbereichs');

    await g.click(500 + 65, NAV_H + 330 + 15); // „Laden an/aus“
    await g.wait(700);
    const loading = await g.eval(() => {
      const b = window.__D.widgets.windows.browser;
      return { isLoading: b.isLoading(), barVisible: b.loadingBar.visible, barScale: b.loadingBar.scaleX, spinner: b.tabSpinner.isRunning() };
    });
    assert(loading.isLoading && loading.barVisible && loading.barScale > 0.1 && loading.spinner, `Ladezustand sichtbar: ${JSON.stringify(loading)}`);
    await g.shot('display-windows-loading');
    await g.click(500 + 65, NAV_H + 330 + 15);
    await g.wait(700);
    const loaded = await g.eval(() => {
      const b = window.__D.widgets.windows.browser;
      return { isLoading: b.isLoading(), barVisible: b.loadingBar.visible, spinner: b.tabSpinner.isRunning() };
    });
    assert(!loaded.isLoading && !loaded.barVisible && !loaded.spinner, `Laden beendet: ${JSON.stringify(loaded)}`);

    await g.click(640 + 65, NAV_H + 330 + 15); // „Titel/URL“
    const titles = await g.eval(() => {
      const b = window.__D.widgets.windows.browser;
      return { title: b.titleLabel.text, url: b.getUrl(), host: b.addressHost.text };
    });
    assert(titles.title.endsWith('…'), `langer Titel wird gekürzt: ${titles.title}`);
    assert(titles.host === 'rapla.dhbw-stuttgart.example', `Host in der Adresszeile: ${titles.host}`);

    // Schließen-Knopf des OS-Fensters: Event, aber kein Zerstören
    await g.click(500 + 284 - 22, NAV_H + 14 + 17);
    const closes = await g.eval(() => ({ count: window.__D.osCloses || 0, alive: Boolean(window.__D.widgets.windows.os.scene) }));
    assert(closes.count === 1 && closes.alive, `close-Event einmal, Fenster bleibt: ${JSON.stringify(closes)}`);
    await g.shot('display-windows');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Phone: WLAN-Zustände, Uhr, Akku, Vibration, Power-Taste', async () => {
  const g = await openGallery('phone');
  try {
    const area = await g.eval(() => window.__D.widgets.phone.screenArea);
    assert(area.x === 50 && area.y === NAV_H + 14 + 40 && area.width === 280 && area.height === 468, `Bildschirmbereich: ${JSON.stringify(area)}`);

    for (const [state, level] of [['off', undefined], ['connecting', undefined], ['connected', 2], ['no-internet', 4]]) {
      const ws = await g.eval(([s, l]) => {
        const phone = window.__D.widgets.phone.phone;
        phone.setWifiState(s, l);
        return phone.getWifiState();
      }, [state, level]);
      assert(ws.state === state, `WLAN-Zustand ${state} erwartet, war ${ws.state}`);
      if (level !== undefined) assert(ws.level === level, `Pegel ${level} erwartet, war ${ws.level}`);
      await g.wait(state === 'connecting' ? 500 : 150);
      await g.shot(`display-phone-${state}`);
    }
    const invalid = await g.eval(() => {
      const phone = window.__D.widgets.phone.phone;
      phone.setWifiState('kaputt');
      return phone.getWifiState().state;
    });
    assert(invalid === 'no-internet', 'unbekannter Zustand wird ignoriert');

    const anim = await g.eval(async () => {
      const phone = window.__D.widgets.phone.phone;
      phone.setWifiState('connecting');
      const steps = new Set();
      for (let i = 0; i < 8; i++) {
        steps.add(phone.connectingStep);
        await new Promise((r) => setTimeout(r, 120));
      }
      const timers = phone.scene.time._active.includes(phone.connectingTimer);
      phone.setWifiState('connected');
      return { steps: steps.size, timers, timerAfter: phone.connectingTimer };
    });
    assert(anim.steps >= 2 && anim.timers, `„connecting“ ist animiert: ${JSON.stringify(anim)}`);
    assert(anim.timerAfter === null, 'Animations-Timer endet beim Zustandswechsel');

    const clock = await g.eval(() => {
      const phone = window.__D.widgets.phone.phone;
      let expected = '07:30';
      if (typeof GameState !== 'undefined' && typeof GameState.getClockLabel === 'function') {
        try {
          const m = /(\d{1,2}:\d{2})\s*$/.exec(String(GameState.getClockLabel()));
          if (m) expected = m[1];
        } catch (err) { /* Fallback */ }
      }
      return { shown: phone.getClockText(), expected };
    });
    assert(clock.shown === clock.expected, `Uhr ${clock.expected} erwartet, war ${clock.shown}`);

    const battery = await g.eval(() => {
      const phone = window.__D.widgets.phone.phone;
      phone.setBattery(5);
      const low = { text: phone.batteryText.text, color: phone.batteryText.style.color };
      phone.setBattery(150);
      const high = phone.getBattery();
      phone.setBattery(23);
      return { low, high };
    });
    assert(battery.low.text === '5 %' && battery.low.color === '#e2001a', `Akku 5 % rot: ${JSON.stringify(battery.low)}`);
    assert(battery.high === 100, 'Akku auf 100 % begrenzt');

    const vib = await g.eval(async () => {
      const phone = window.__D.widgets.phone.phone;
      const x0 = phone.x;
      phone.vibrate();
      const xs = [];
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 30));
        xs.push(phone.x);
      }
      await new Promise((r) => setTimeout(r, 500));
      return { moved: xs.some((x) => Math.abs(x - x0) > 0.5), back: phone.x === x0 };
    });
    assert(vib.moved && vib.back, `vibrate wackelt und kehrt zurück: ${JSON.stringify(vib)}`);

    // Power-Taste: lang drücken → power-longpress, kurz → power-press
    const power = await g.eval(() => window.__D.widgets.phone.phone.getPowerButtonArea());
    const px = power.x + power.width / 2;
    const py = power.y + power.height / 2;
    await g.longPress(px, py, 1500);
    await g.wait(100);
    await g.click(px, py);
    const events = await g.eval(() => window.__D.powerEvents.slice());
    assert(events.includes('power-longpress'), `langer Druck meldet power-longpress: ${events}`);
    assert(events.filter((e) => e === 'power-press').length === 1, `kurzer Druck meldet power-press: ${events}`);

    await g.eval(() => window.__D.widgets.phone.phone.setScreenOn(false, { animate: false }));
    await g.shot('display-phone-screen-off');
    await g.eval(() => window.__D.widgets.phone.phone.setScreenOn(true, { animate: false }));
    await g.eval(() => window.__D.widgets.phone.phone.setWifiState('connected', 3));
    await g.wait(150);
    await g.shot('display-phone');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Szenenwechsel: Widgets räumen Listener und Timer ab', async () => {
  const g = await openGallery('widgets');
  try {
    const first = await g.eval(() => window.__D.counts('widgets'));
    for (const page of ['phone', 'windows', 'widgets', 'phone', 'fx', 'widgets']) await showPage(g, page);
    const again = await g.eval(() => window.__D.counts('widgets'));
    assert(again.wheel === first.wheel && again.postupdate === first.postupdate && again.pointerup === first.pointerup,
      `Listener dürfen sich nicht ansammeln: ${JSON.stringify(first)} → ${JSON.stringify(again)}`);
    await showPage(g, 'phone');
    const phoneCounts = await g.eval(() => window.__D.counts('phone'));
    await showPage(g, 'textures');
    await showPage(g, 'phone');
    const phoneAgain = await g.eval(() => window.__D.counts('phone'));
    assert(phoneAgain.timers === phoneCounts.timers && phoneAgain.postupdate === phoneCounts.postupdate,
      `Phone-Timer/Listener nach Neustart gleich: ${JSON.stringify(phoneCounts)} → ${JSON.stringify(phoneAgain)}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Canvas-Renderer: alle Seiten und der Stempel ohne Fehler', async () => {
  const g = await openGallery('textures', 'renderer=canvas');
  try {
    const renderer = await g.eval(() => window.__D.renderer());
    assert(renderer === 'canvas', `Canvas-Renderer erwartet, war ${renderer}`);
    for (const page of ['widgets', 'windows', 'phone', 'fx']) await showPage(g, page);
    await g.eval(() => window.__D.fx('stamp'));
    await g.wait(500);
    await g.shot('display-canvas-stamp');
    await g.wait(1300);
    await g.eval(() => window.__D.fx('confetti'));
    await g.eval(() => window.__D.fx('burst'));
    await g.eval(() => window.__D.fx('float'));
    await g.wait(500);
    await g.shot('display-canvas-confetti');
    await g.wait(3200);
    const counts = await g.eval(() => window.__D.counts('fx'));
    assert(counts.tweens === 0 && counts.timers === 0, `Canvas: Effekte räumen auf: ${JSON.stringify(counts)}`);
    await showPage(g, 'phone');
    await g.shot('display-canvas-phone');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
