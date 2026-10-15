/**
 * core-integration.mjs – Integrationstests des Kerns im echten Spiel (index.html).
 *
 * Prüft das Zusammenspiel der Kern-Bausteine, auf das sich alle Kapitel verlassen:
 *  1. Vertragsoberfläche (docs/ARCHITECTURE.md, Abschnitt 5): Globals, Methoden, Defaults,
 *     Tiefen, Textures-Schlüssel und -Größen, Szenen-Reihenfolge, __EDU_DEBUG, URL-Parameter.
 *  2. TextInput und Dropdown in UI.Phone.screen und UI.Window.content (verschobene bzw.
 *     maskierte Container) mit echten Klicks und Tastatureingaben; Modal mit content-Builder
 *     liegt über allem und sperrt Eingaben darunter; Toast-Stapel; FX.stamp-Tiefe.
 *  3. Das HUD liegt über den Kapiteln und schluckt Klicks auf der Leiste; die Pause friert
 *     Kapitel-Timer, Tweens und update() ein.
 *  4. Tastatur: onKey/HUD bekommen jedes keydown genau einmal (Phaser-3.90-Falle),
 *     Escape pausiert auch bei offenem Dialog ohne Escape-Funktion, Escape in einem
 *     fokussierten Kapitel-Textfeld nimmt nur den Fokus.
 *
 * Aufruf: node tests/e2e/core-integration.mjs   Screenshots: screenshots/core-*.png
 */
import { launchGame, runTest, assert } from './harness.mjs';

/** Mitte eines Rechtecks (Spielkoordinaten). */
const centerOf = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

/** Mitte eines registrierten HUD-Buttons. */
async function hudButton(g, id) {
  const center = await g.eval((buttonId) => window.__EDU_DEBUG.getScene('HUD').getButtonCenter(buttonId), id);
  assert(center, `HUD-Button „${id}“ gefunden`);
  return center;
}

/** Feuert mehrere Tastatur-Events im selben JS-Task (= im selben Frame) am window. */
async function fireKeysInOneFrame(g, keys) {
  await g.eval((list) => {
    list.forEach(([key, code, keyCode]) => {
      ['keydown', 'keyup'].forEach((type) => {
        window.dispatchEvent(new KeyboardEvent(type, { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }));
      });
    });
  }, keys);
}

// -----------------------------------------------------------------------------
// 1. Vertragsoberfläche
// -----------------------------------------------------------------------------

await runTest('core: Vertragsoberfläche (Abschnitt 5) – Globals, Methoden, Defaults, Texturen', async () => {
  const g = await launchGame({ query: 'seed=7' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    const problems = await g.eval(() => {
      const out = [];
      const need = (label, obj, names) => names.forEach((name) => {
        if (!obj || typeof obj[name] !== 'function') out.push(`${label}.${name}`);
      });

      need('RNG', RNG, ['seed', 'getSeed', 'next', 'int', 'float', 'chance', 'pick', 'shuffle']);
      need('Emitter#', Emitter.prototype, ['on', 'once', 'off', 'emit', 'removeAllListeners']);
      const events = {
        STATE_CHANGED: 'state-changed', FRUSTRATION_CHANGED: 'frustration-changed', CLOCK_JUMP: 'clock-jump',
        CLOCK_MILESTONE: 'clock-milestone', OBJECTIVE_CHANGED: 'objective-changed', RAGE_QUIT: 'rage-quit',
        CHAPTER_COMPLETE: 'chapter-complete', ACHIEVEMENT: 'achievement-unlocked', PAUSE_CHANGED: 'pause-changed',
      };
      Object.entries(events).forEach(([key, value]) => {
        if (EVENTS[key] !== value) out.push(`EVENTS.${key}`);
      });
      need('Storage', Storage, ['get', 'set', 'remove', 'getHighscore', 'submitHighscore', 'getAchievements',
        'addAchievement', 'getUnlockedChapter', 'unlockChapter', 'getSettings', 'setSettings', 'resetAll']);
      need('Scoring', Scoring, ['computeScore', 'rankTitle', 'formatClock', 'minutesLate']);
      need('GameState', GameState, ['startRun', 'finishRun', 'abortRun', 'getSnapshot', 'getClockMinutes',
        'getClockLabel', 'isPastLecture', 'getFrustration', 'isPaused', 'getCredentials', 'getFlag',
        'setCurrentChapter', 'setObjective', 'setCredentials', 'setFlag', 'addFrustration', 'reduceFrustration',
        'advanceClock', 'tick', 'setPaused', 'recordFail', 'recordSuccess', 'completeChapter', 'unlockAchievement',
        'on', 'once', 'off', 'emit']);
      if (!(GameState instanceof Emitter)) out.push('GameState ist keine Emitter-Instanz');
      need('SFX', SFX, ['init', 'unlock', 'setMuted', 'isMuted', 'toggleMuted', 'click', 'hover', 'type', 'error',
        'fail', 'success', 'notify', 'popup', 'connect', 'disconnect', 'pickup', 'alarm', 'stamp', 'modem', 'win',
        'lose', 'whoosh', 'tick', 'startHoldMusic', 'stopHoldMusic']);
      need('UI', UI, ['text', 'textStyle', 'centerX', 'sound', 'toast', 'Button', 'TextInput', 'Dropdown', 'Checkbox',
        'Modal', 'ProgressBar', 'Spinner', 'ScrollPanel', 'Window', 'Phone']);
      need('UI.Button#', UI.Button.prototype, ['setEnabled', 'isEnabled', 'setText', 'setVariant', 'setOnClick']);
      need('UI.TextInput#', UI.TextInput.prototype, ['getValue', 'setValue', 'focus', 'blur', 'isFocused', 'setError',
        'setHint', 'setEnabled', 'setPasswordVisible']);
      need('UI.TextInput', UI.TextInput, ['blurAll']);
      need('UI.Dropdown#', UI.Dropdown.prototype, ['getValue', 'getSelectedOption', 'setValue', 'setOptions', 'open',
        'close', 'isOpen', 'setError', 'setEnabled']);
      need('UI.Checkbox#', UI.Checkbox.prototype, ['isChecked', 'setChecked', 'setEnabled']);
      need('UI.Modal#', UI.Modal.prototype, ['close', 'isOpen']);
      need('UI.Modal', UI.Modal, ['closeAll', 'isAnyOpen']);
      need('UI.ProgressBar#', UI.ProgressBar.prototype, ['setValue', 'getValue', 'setColor']);
      need('UI.Spinner#', UI.Spinner.prototype, ['start', 'stop']);
      need('UI.ScrollPanel#', UI.ScrollPanel.prototype, ['getProgress', 'scrollTo', 'scrollBy', 'setText',
        'getTextObject', 'getContent']);
      need('UI.Window#', UI.Window.prototype, ['getContentArea', 'setTitle', 'setUrl', 'setLoading']);
      need('UI.Phone#', UI.Phone.prototype, ['getScreenArea', 'setWifiState', 'setBattery', 'vibrate']);
      need('FX', FX, ['shake', 'flash', 'burst', 'confetti', 'floatText', 'pulse', 'stamp', 'glitch', 'typewriter']);
      need('Textures', Textures, ['generateAll']);
      need('ChapterScene#', ChapterScene.prototype, ['initChapter', 'setObjective', 'listen', 'onKey', 'fail',
        'penalty', 'relief', 'succeed', 'achievement', 'toast', 'showModal', 'debugSolve', 'getDebugInfo']);
      if (typeof makePlaceholderChapter !== 'function') out.push('makePlaceholderChapter');
      need('GameScene#', GameScene.prototype, ['startChapter', 'restartChapter', 'togglePause', 'isPaused',
        'quitToMenu', 'getActiveChapterScene', 'skipIntro']);

      const dbg = window.__EDU_DEBUG;
      need('__EDU_DEBUG', dbg, ['getState', 'getActiveScenes', 'getChapterScene', 'startChapter', 'skipIntro',
        'solve', 'setFrustration', 'addMinutes']);
      if (dbg.ready !== true || !dbg.game || !Array.isArray(dbg.events)) out.push('__EDU_DEBUG.ready/game/events');

      // Szenen-Reihenfolge = Zeichenreihenfolge (HUD über den Kapiteln)
      const order = dbg.game.scene.scenes.map((s) => s.sys.settings.key);
      const expected = ['Boot', 'Menu', 'Game', ...CONFIG.CHAPTERS.map((c) => c.key), 'HUD', 'GameOver'];
      if (order.join() !== expected.join()) out.push(`Szenen-Reihenfolge: ${order.join(', ')}`);
      CONFIG.CHAPTERS.forEach((c) => {
        const scene = dbg.game.scene.getScene(c.key);
        if (!(scene instanceof ChapterScene) || scene.chapter.id !== c.id) out.push(`Kapitel-Szene ${c.key}`);
      });

      // Texturen: alle Schlüssel in Sollgröße
      const scene = dbg.game.scene.getScene('Menu');
      const sizes = { px: [4, 4], dot: [8, 8], confetti: [8, 4] };
      for (let i = 0; i <= 4; i += 1) sizes[`icon-wifi-${i}`] = [32, 32];
      ['lock', 'gear', 'sound-on', 'sound-off', 'pause', 'close', 'back'].forEach((k) => { sizes[`icon-${k}`] = [24, 24]; });
      ['warning', 'error', 'info', 'success', 'question', 'cert', 'router', 'battery'].forEach((k) => { sizes[`icon-${k}`] = [32, 32]; });
      for (let i = 0; i <= 4; i += 1) sizes[`face-${i}`] = [28, 28];
      Object.entries(sizes).forEach(([key, [w, h]]) => {
        if (!scene.textures.exists(key)) {
          out.push(`Textur ${key} fehlt`);
          return;
        }
        const frame = scene.textures.getFrame(key);
        if (frame.width !== w || frame.height !== h) out.push(`Textur ${key}: ${frame.width}×${frame.height}`);
      });

      // Widget-Defaults und Tiefen
      const D = CONFIG.DEPTH;
      const button = new UI.Button(scene, 10, 10);
      if (button.width !== 180 || button.height !== 44 || !button.isEnabled()) out.push('Button-Defaults');
      const input = new UI.TextInput(scene, 10, 60);
      if (input.fieldWidth !== 300 || input.fieldHeight !== 40 || input.maxLength !== 64 || input.getValue() !== '') out.push('TextInput-Defaults');
      const dropdown = new UI.Dropdown(scene, 10, 120, { options: [{ value: 'a', label: 'A' }] });
      if (dropdown.placeholder !== 'Bitte auswählen' || dropdown.maxVisible !== 6 || dropdown.getValue() !== null) out.push('Dropdown-Defaults');
      dropdown.open();
      const popup = dropdown.getPopup();
      if (!popup || popup.depth !== D.DROPDOWN) out.push(`Dropdown-Liste Tiefe ${popup && popup.depth}`);
      dropdown.close();
      const checkbox = new UI.Checkbox(scene, 10, 180);
      if (checkbox.isChecked() !== false) out.push('Checkbox-Default');
      const bar = new UI.ProgressBar(scene, 10, 220);
      if (bar.getValue() !== 0 || bar.width !== 200 || bar.height !== 14) out.push(`ProgressBar-Defaults ${bar.width}×${bar.height}`);
      const spinner = new UI.Spinner(scene, 10, 250);
      const phone = new UI.Phone(scene, 420, 20);
      if (phone.width !== 300 || phone.height !== 540) out.push('Phone-Defaults');
      const area = phone.getScreenArea();
      if (!(area.x > 420 && area.y > 20 && area.width > 0 && area.height > 0)) out.push('Phone.getScreenArea');
      if (!(phone.screen instanceof Phaser.GameObjects.Container)) out.push('Phone.screen');
      const win = new UI.Window(scene, 20, 300, { width: 300, height: 200 });
      const content = win.getContentArea();
      if (!(win.content instanceof Phaser.GameObjects.Container) || !(content.y > 300)) out.push('Window.content/getContentArea');
      const panel = new UI.ScrollPanel(scene, 20, 520, { width: 200, height: 60, text: 'Zeile\n'.repeat(40) });
      panel.refresh();
      if (panel.getProgress() !== 0) out.push(`ScrollPanel.getProgress oben (${panel.getProgress()})`);
      panel.scrollTo(1);
      if (panel.getProgress() !== 1) out.push(`ScrollPanel.scrollTo(1) (${panel.getProgress()})`);
      const modal = new UI.Modal(scene, { title: 'Test' });
      if (modal.panelWidth !== 460 || modal.depth !== D.MODAL || !UI.Modal.isAnyOpen(scene)) out.push(`Modal-Defaults (Tiefe ${modal.depth})`);
      if (modal.getButtons().length !== 1 || modal.getButtons()[0].getText() !== 'OK') out.push('Modal-Standardbutton OK');
      UI.Modal.closeAll(scene);
      if (UI.Modal.isAnyOpen(scene)) out.push('Modal.closeAll');
      const toast = UI.toast(scene, 'Gespeichert');
      if (!(toast instanceof Phaser.GameObjects.Container) || toast.depth !== D.TOAST) out.push('UI.toast → Container auf TOAST');
      const stamp = FX.stamp(scene, 'GEPRÜFT', { sound: false });
      if (!stamp || stamp.depth !== D.FX) out.push('FX.stamp → Container auf FX');
      const textObject = UI.text(scene, 0, 0, '');
      const typer = FX.typewriter(scene, textObject, 'Hallo');
      if (!typer || typeof typer.skip !== 'function') out.push('FX.typewriter → { skip }');
      typer.skip();
      if (textObject.text !== 'Hallo') out.push('typewriter.skip zeigt den Volltext');
      [button, input, dropdown, checkbox, bar, spinner, phone, win, panel, toast, textObject].forEach((o) => o.destroy());
      return out;
    });
    assert(problems.length === 0, `Vertrag vollständig – abweichend: ${problems.join('; ')}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('core: URL-Parameter landen in RUNTIME (chapter, skipintro, mute, seed, unlock)', async () => {
  const g = await launchGame({ query: 'chapter=2&skipintro=1&seed=abc&unlock=all' });
  try {
    const runtime = await g.eval(() => ({ ...RUNTIME }));
    assert(runtime.startChapter === 2 && runtime.skipIntro === true && runtime.muted === true
      && runtime.seed === 'abc' && runtime.unlockAll === true, `RUNTIME (${JSON.stringify(runtime)})`);
    const active = await g.eval(() => window.__EDU_DEBUG.getActiveScenes());
    assert(active.includes('Ch2Config') && active.includes('HUD'), `Kapitel 2 direkt (${active.join(', ')})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }

  const g2 = await launchGame({ query: 'seed=7' });
  try {
    const seed = await g2.eval(() => ({ runtime: RUNTIME.seed, rng: RNG.getSeed(), start: RUNTIME.startChapter }));
    assert(seed.runtime === 7 && typeof seed.rng === 'number' && seed.start === null, `Zahl-Seed (${JSON.stringify(seed)})`);
    g2.assertNoErrors();
  } finally {
    await g2.close();
  }
});

// -----------------------------------------------------------------------------
// 2. Widgets in verschobenen Containern, Modal, Toasts
// -----------------------------------------------------------------------------

await runTest('core: TextInput/Dropdown in Phone.screen und Window.content, Modal über allem, Toast-Stapel', async () => {
  const g = await launchGame();
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    await g.eval(() => {
      class CoreIntegrationScene extends Phaser.Scene {
        constructor() {
          super({ key: 'CoreIntegration' });
        }

        create() {
          this.cameras.main.setBackgroundColor(CONFIG.CSS.BG);
          this.log = [];
          this.phone = new UI.Phone(this, 30, 40, { battery: 42 });
          const screenWidth = this.phone.getScreenArea().width;
          this.phoneInput = new UI.TextInput(this, 12, 16, {
            width: screenWidth - 24, label: 'Identität', placeholder: 'kennung@realm', hint: UI.TextInput.CREDENTIALS_HINT,
          });
          this.phoneDropdown = new UI.Dropdown(this, 12, 110, {
            width: screenWidth - 24,
            label: 'EAP-Methode',
            options: [
              { value: 'PEAP', label: 'PEAP' },
              { value: 'TLS', label: 'TLS' },
              { value: 'TTLS', label: 'TTLS' },
              { value: 'LEAP', label: 'LEAP', disabled: true, hint: 'Seit Android 11 nicht mehr verfügbar' },
            ],
            onChange: (value) => this.log.push(['phone-dropdown', value]),
          });
          this.phone.screen.add([this.phoneInput, this.phoneDropdown]);

          this.win = new UI.Window(this, 360, 70, { width: 420, height: 360, title: 'Self-Service', url: CAMPUS.portal.url });
          this.winInput = new UI.TextInput(this, 20, 20, {
            width: 300, label: 'Kennung', onSubmit: (value) => this.log.push(['submit', value]),
          });
          this.winDropdown = new UI.Dropdown(this, 20, 112, { width: 300, label: 'Kurs', options: ['WWI26A', 'WWI26B', 'WWI26C'] });
          this.win.content.add([this.winInput, this.winDropdown]);
        }
      }
      const manager = window.__EDU_DEBUG.game.scene;
      manager.stop('Menu');
      manager.add('CoreIntegration', CoreIntegrationScene, true);
    });
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('CoreIntegration'));
    await g.wait(200);

    const bounds = (name) => g.eval((n) => {
      const r = window.__EDU_DEBUG.getScene('CoreIntegration')[n].getFieldBounds();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, name);
    const sceneValue = (expr) => g.eval((e) => (new Function('s', `return ${e};`))(window.__EDU_DEBUG.getScene('CoreIntegration')), expr);

    // TextInput im (maskierten) Handy-Bildschirm
    let p = centerOf(await bounds('phoneInput'));
    await g.click(p.x, p.y);
    assert(await sceneValue('s.phoneInput.isFocused()'), 'Phone-Feld fokussiert per Klick');
    await g.type('wwi26042@lehre');
    assert((await sceneValue('s.phoneInput.getValue()')) === 'wwi26042@lehre', 'Tippen im Phone-Feld');

    // TextInput im Browser-Fenster: Fokus wandert, Enter = submit
    p = centerOf(await bounds('winInput'));
    await g.click(p.x, p.y);
    assert(await sceneValue('s.winInput.isFocused() && !s.phoneInput.isFocused()'), 'Fokus wandert ins Fenster-Feld');
    await g.type('abc');
    await g.press('Enter');
    assert(JSON.stringify(await sceneValue('s.log')) === '[["submit","abc"]]', 'Enter löst submit aus');
    await g.press('Tab');
    assert(await sceneValue('s.phoneInput.isFocused()'), 'Tab springt (mit Umlauf) ins nächste Feld');

    // Dropdown im Handy: öffnen, Option wählen; gesperrte Option → Toast, Liste bleibt offen
    p = centerOf(await bounds('phoneDropdown'));
    await g.click(p.x, p.y);
    assert(await sceneValue('s.phoneDropdown.isOpen() && !s.phoneInput.isFocused()'), 'Phone-Dropdown offen, Feld nicht mehr fokussiert');
    const depth = await sceneValue('s.phoneDropdown.getPopup().depth');
    assert(depth >= 800, `Liste auf DROPDOWN-Tiefe (${depth})`);
    let option = await sceneValue('(() => { const r = s.phoneDropdown.getOptionBounds(3); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()');
    await g.click(centerOf(option).x, centerOf(option).y);
    assert(await sceneValue('s.phoneDropdown.isOpen() && UI.Toast.getActive(s).length === 1'), 'gesperrte Option: Liste bleibt offen, Hinweis-Toast');
    option = await sceneValue('(() => { const r = s.phoneDropdown.getOptionBounds(1); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()');
    await g.click(centerOf(option).x, centerOf(option).y);
    assert((await sceneValue('s.phoneDropdown.getValue()')) === 'TLS' && !(await sceneValue('s.phoneDropdown.isOpen()')), 'Option gewählt, Liste zu');
    assert(JSON.stringify(await sceneValue('s.log.slice(1)')) === '[["phone-dropdown","TLS"]]', 'onChange(value)');

    // Container verschieben → Klickflächen und Liste folgen
    await g.eval(() => {
      const s = window.__EDU_DEBUG.getScene('CoreIntegration');
      s.phone.x += 20;
      s.win.y += 30;
    });
    await g.wait(80);
    p = centerOf(await bounds('phoneInput'));
    await g.click(p.x + 40, p.y);
    assert(await sceneValue('s.phoneInput.isFocused()'), 'Phone-Feld nach dem Verschieben klickbar');
    const field = await bounds('winDropdown');
    await g.click(centerOf(field).x, centerOf(field).y);
    const popupPos = await sceneValue('(() => { const pp = s.winDropdown.getPopup(); return pp ? { x: pp.x, y: pp.y } : null; })()');
    assert(popupPos && Math.abs(popupPos.x - field.x) <= 2 && popupPos.y >= field.y + field.height - 2,
      `Liste hängt am verschobenen Feld (${JSON.stringify(popupPos)} / ${JSON.stringify(field)})`);
    await g.wait(120);
    await g.shot('core-widgets-in-containers');
    option = await sceneValue('(() => { const r = s.winDropdown.getOptionBounds(2); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()');
    await g.click(centerOf(option).x, centerOf(option).y);
    assert((await sceneValue('s.winDropdown.getValue()')) === 'WWI26C', 'Fenster-Dropdown gewählt');

    // Modal mit content-Builder: liegt über allem, sperrt Eingaben darunter
    await g.eval(() => {
      const s = window.__EDU_DEBUG.getScene('CoreIntegration');
      s.phoneInput.focus();
      s.modal = new UI.Modal(s, {
        title: 'Passwort ändern',
        icon: 'question',
        text: 'Bitte ein neues Passwort festlegen.',
        content: (container, innerWidth) => {
          s.modalInput = new UI.TextInput(s, 0, 0, {
            width: innerWidth, label: 'Neues Passwort', password: true, showToggle: true, hint: UI.TextInput.CREDENTIALS_HINT,
          });
          s.modalDropdown = new UI.Dropdown(s, 0, 90, { width: innerWidth, label: 'Sicherheitsfrage', options: ['Lieblingsbrezel', 'Erstes Haustier'] });
          container.add([s.modalInput, s.modalDropdown]);
          return 90 + s.modalDropdown.getTotalHeight();
        },
        buttons: [
          { text: 'Abbrechen' },
          { text: 'Speichern', onClick: () => s.log.push(['save', s.modalInput.getValue(), s.modalDropdown.getValue()]) },
        ],
      });
    });
    assert(!(await sceneValue('s.phoneInput.isFocused()')), 'Modal nimmt Feldern darunter den Fokus');
    await g.wait(300); // Einblenden
    const under = centerOf(await bounds('phoneInput'));
    await g.click(under.x, under.y);
    assert(!(await sceneValue('s.phoneInput.isFocused()')), 'Klick unter dem Modal erreicht das Phone-Feld nicht');
    p = centerOf(await bounds('modalInput'));
    await g.click(p.x, p.y);
    await g.type('Brezel#2026');
    assert((await sceneValue('s.modalInput.getValue()')) === 'Brezel#2026', 'Tippen im Modal-Feld');
    p = centerOf(await bounds('modalDropdown'));
    await g.click(p.x, p.y);
    const depths = await sceneValue('({ modal: s.modal.depth, list: s.modalDropdown.getPopup().depth, phone: s.phone.depth })');
    assert(depths.modal >= 900 && depths.list > depths.modal && depths.phone < depths.modal, `Tiefen Modal/Liste (${JSON.stringify(depths)})`);
    await g.wait(120);
    await g.shot('core-modal-content');
    option = await sceneValue('(() => { const r = s.modalDropdown.getOptionBounds(0); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()');
    await g.click(centerOf(option).x, centerOf(option).y);
    const save = await sceneValue('(() => { const b = s.modal.getButtons()[1].hitRect.getBounds(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()');
    await g.click(centerOf(save).x, centerOf(save).y);
    await g.waitFor(() => !UI.Modal.isAnyOpen(window.__EDU_DEBUG.getScene('CoreIntegration')));
    assert(JSON.stringify(await sceneValue('s.log.at(-1)')) === '["save","Brezel#2026","Lieblingsbrezel"]', 'Speichern liefert Werte aus dem Modal');

    // Toast-Stapel: neuere Toasts stapeln sich über den älteren, alle auf TOAST-Tiefe
    const toasts = await g.eval(() => {
      const s = window.__EDU_DEBUG.getScene('CoreIntegration');
      UI.Toast.dismissAll(s);
      ['Gespeichert', 'Authentifizierungsproblem', 'Verbunden, kein Internet'].forEach((t, i) => UI.toast(s, t, { variant: ['default', 'error', 'success'][i] }));
      return null;
    });
    void toasts;
    await g.wait(450);
    const stack = await sceneValue('UI.Toast.getActive(s).map((t) => ({ y: t.y, depth: t.depth, h: t.toastHeight }))');
    assert(stack.length === 3, `drei Toasts (${stack.length})`);
    assert(stack[0].y > stack[1].y && stack[1].y > stack[2].y, `stapeln nach oben (${stack.map((t) => t.y).join(' > ')})`);
    assert(stack.every((t) => t.depth === 1000 && t.y > 300 && t.y + t.h <= 600), 'Toasts unten im Bild, Tiefe TOAST');
    await g.shot('core-toast-stack');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// -----------------------------------------------------------------------------
// 3. HUD über den Kapiteln, Pause friert Kapitel ein
// -----------------------------------------------------------------------------

await runTest('core: HUD schluckt Klicks auf der Leiste; Pause friert Kapitel-Timer, Tweens und update() ein', async () => {
  const g = await launchGame({ query: 'chapter=1&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await g.eval(() => {
      const ch = window.__EDU_DEBUG.getChapterScene();
      window.__core = { timer: 0, update: 0, tween: 0, trap: 0 };
      ch.time.addEvent({ delay: 40, loop: true, callback: () => { window.__core.timer += 1; } });
      ch.events.on('update', () => { window.__core.update += 1; });
      const dummy = ch.add.rectangle(-50, -50, 2, 2, 0xffffff);
      ch.tweens.add({ targets: dummy, x: 5000, duration: 60000, onUpdate: () => { window.__core.tween += 1; } });
      // Klickfalle unter der HUD-Leiste (liegt im Kapitel ganz oben)
      const trap = ch.add.rectangle(0, 0, CONFIG.WIDTH, CONFIG.HUD_HEIGHT, 0xff0000, 0.001).setOrigin(0).setDepth(5000).setInteractive();
      trap.on('pointerdown', () => { window.__core.trap += 1; });
    });
    await g.click(250, 24);
    await g.click(600, 10);
    assert((await g.eval(() => window.__core.trap)) === 0, 'Klicks auf die HUD-Leiste erreichen das Kapitel nicht');

    const pause = await hudButton(g, 'pause');
    await g.click(pause.x, pause.y);
    await g.waitFor(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration') === 'paused');
    const before = await g.eval(() => ({ ...window.__core }));
    await g.wait(900);
    const during = await g.eval(() => ({ ...window.__core }));
    assert(during.timer === before.timer && during.update === before.update && during.tween === before.tween,
      `Kapitel steht in der Pause (${JSON.stringify(before)} → ${JSON.stringify(during)})`);
    await g.click(400, 140); // Klick auf die Abdunklung des Pause-Overlays
    assert((await g.eval(() => window.__core.trap)) === 0, 'Pause-Overlay blockiert Klicks');

    const resume = await hudButton(g, 'resume');
    await g.click(resume.x, resume.y);
    await g.waitFor((t) => window.__core.timer > t.timer && window.__core.update > t.update && window.__core.tween > t.tween,
      during, { timeout: 4000 });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// -----------------------------------------------------------------------------
// 4. Tastatur
// -----------------------------------------------------------------------------

await runTest('core: onKey und HUD bekommen jedes keydown genau einmal (Phaser-3.90-Doppelmeldung)', async () => {
  const g = await launchGame({ query: 'chapter=3&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await g.wait(300);
    await g.eval(() => {
      window.__keys = [];
      window.__EDU_DEBUG.getChapterScene().onKey((event) => window.__keys.push(event.key));
      window.__EDU_DEBUG.clearEvents();
    });
    await fireKeysInOneFrame(g, [['x', 'KeyX', 88], ['y', 'KeyY', 89], ['z', 'KeyZ', 90], ['q', 'KeyQ', 81]]);
    await g.wait(100);
    const keys = await g.eval(() => window.__keys);
    assert(keys.join('') === 'xyzq', `onKey: jede Taste genau einmal (${keys.join('')})`);

    // Kapitel 3 startet mit einem Dialog ohne Escape-Funktion → Escape pausiert trotzdem, genau einmal
    assert(await g.eval(() => UI.Modal.isAnyOpen(window.__EDU_DEBUG.getChapterScene())), 'Startdialog von Kapitel 3 offen');
    await fireKeysInOneFrame(g, [['x', 'KeyX', 88], ['Escape', 'Escape', 27], ['q', 'KeyQ', 81]]);
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true, null, { timeout: 3000 });
    await g.wait(200);
    const pauses = await g.eval(() => window.__EDU_DEBUG.events.filter((e) => e.event === EVENTS.PAUSE_CHANGED).map((e) => e.payload.paused));
    assert(JSON.stringify(pauses) === '[true]', `Escape pausiert genau einmal (${JSON.stringify(pauses)})`);
    await g.press('Escape');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === false, null, { timeout: 3000 });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('core: Escape im fokussierten Kapitel-Textfeld nimmt nur den Fokus, danach pausiert Escape', async () => {
  const g = await launchGame({ query: 'chapter=1&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await g.waitFor(() => UI.TextInput.getAll(window.__EDU_DEBUG.getChapterScene()).length > 0, null, { timeout: 8000 });
    await g.wait(300);
    const field = await g.eval(() => {
      const input = UI.TextInput.getAll(window.__EDU_DEBUG.getChapterScene())[0];
      const r = input.getFieldBounds();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await g.click(centerOf(field).x, centerOf(field).y);
    assert(await g.eval(() => UI.TextInput.isAnyFocused(window.__EDU_DEBUG.getChapterScene())), 'Kapitel-Feld fokussiert');
    await g.press('Escape');
    await g.wait(150);
    const afterFirst = await g.eval(() => ({
      focused: UI.TextInput.isAnyFocused(window.__EDU_DEBUG.getChapterScene()),
      paused: GameState.isPaused(),
    }));
    assert(!afterFirst.focused && !afterFirst.paused, `1. Escape: nur blur (${JSON.stringify(afterFirst)})`);
    await g.press('Escape');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true, null, { timeout: 3000 });
    await g.press('Escape');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === false, null, { timeout: 3000 });

    // Offene Dropdown-Liste tief in verschachtelten Containern: Escape schließt nur die Liste
    const dropdownField = await g.eval(() => {
      const ch = window.__EDU_DEBUG.getChapterScene();
      let parent = ch.add.container(20, 60).setDepth(CONFIG.DEPTH.UI);
      for (let i = 0; i < 5; i += 1) {
        const child = ch.add.container(2, 2);
        parent.add(child);
        parent = child;
      }
      window.__deepDropdown = new UI.Dropdown(ch, 0, 380, { width: 220, options: ['PEAP', 'TLS', 'TTLS'] });
      parent.add(window.__deepDropdown);
      const r = window.__deepDropdown.getFieldBounds();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await g.click(centerOf(dropdownField).x, centerOf(dropdownField).y);
    assert(await g.eval(() => window.__deepDropdown.isOpen()), 'tief verschachteltes Dropdown offen');
    await g.press('Escape');
    await g.wait(150);
    const afterDropdown = await g.eval(() => ({ open: window.__deepDropdown.isOpen(), paused: GameState.isPaused() }));
    assert(!afterDropdown.open && !afterDropdown.paused, `Escape schließt nur die Liste (${JSON.stringify(afterDropdown)})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
