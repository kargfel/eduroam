/**
 * widgets-forms.mjs – Browser-Tests der Formular-Widgets (Button, TextInput, Dropdown,
 * Checkbox, Modal, Toast) auf der Galerie tests/pages/forms.html.
 *
 * Alle Interaktionen laufen über ECHTE Maus- und Tastatureingaben (Playwright bzw. CDP).
 * Positionen kommen aus den Widgets selbst (getFieldBounds/getOptionBounds/hitRect), damit
 * die Tests Layout-Änderungen überstehen. Ereignisse protokolliert die Galerie in window.__LOG.
 *
 * Hinweis zu Umlauten/ß: Playwrights keyboard.type() schickt für Zeichen außerhalb des
 * US-Layouts (ß, ä, €, …) KEIN keydown, sondern nur insertText – eine Canvas bekommt davon
 * nichts mit. typeReal() schickt solche Zeichen per CDP als echtes keydown (key: 'ß'),
 * genau wie eine deutsche Tastatur.
 *
 * Aufruf: node tests/e2e/widgets-forms.mjs   Screenshots: screenshots/forms-*.png
 */
import { launchGame, runTest, assert } from './harness.mjs';

const PAGE = 'tests/pages/forms.html';
const READY = () => window.__GALLERY_READY === true;
const IDENTITY = 'wwi26042@lehre.dhbw-stuttgart.de';
const PASSWORD = 'Brezel2026!ß';
const GAP_POINT = { x: 396, y: 300 }; // nicht interaktiver Spalt zwischen den Karten
const US_PRINTABLE = /^[\x20-\x7e]$/;

async function openGallery() {
  const g = await launchGame({ page: PAGE, ready: READY });
  await g.wait(250); // erster Frame + Einblend-Tweens
  return g;
}

/** Rechteck eines Widgets in Spielkoordinaten (Feld bzw. Klickfläche). */
async function boundsOf(g, kind, id) {
  return g.eval(([k, i]) => {
    const widget = window.__W[k][i];
    const r = typeof widget.getFieldBounds === 'function' ? widget.getFieldBounds() : widget.hitRect.getBounds();
    return { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  }, [kind, id]);
}

/** Zeile `index` der offenen Liste eines Dropdowns (scrollt sie bei Bedarf sichtbar). */
async function optionBounds(g, id, index) {
  return g.eval(([i, n]) => {
    const r = window.__W.dropdowns[i].getOptionBounds(n);
    return r && { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  }, [id, index]);
}

async function entries(g, filter = {}) {
  return g.eval((f) => window.__LOG.filter((e) => (!f.type || e.type === f.type) && (!f.id || e.id === f.id)), filter);
}

const valueOf = (g, id) => g.eval((i) => window.__W.inputs[i].getValue(), id);
const isFocused = (g, id) => g.eval((i) => window.__W.inputs[i].isFocused(), id);
const focusedName = (g) => g.eval(() => {
  const focused = UI.TextInput.getFocused(window.__W.scene);
  return focused ? Object.keys(window.__W.inputs).find((key) => window.__W.inputs[key] === focused) || '?' : null;
});

/** Tippt wie eine echte (deutsche) Tastatur: US-Zeichen per Playwright, den Rest per CDP-keydown. */
async function typeReal(g, text) {
  let cdp = null;
  let chunk = '';
  const flush = async () => {
    if (chunk) await g.type(chunk);
    chunk = '';
  };
  for (const char of text) {
    if (US_PRINTABLE.test(char)) {
      chunk += char;
      continue;
    }
    await flush();
    cdp = cdp || (await g.context.newCDPSession(g.page));
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: char, text: char, unmodifiedText: char });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: char });
  }
  await flush();
  await g.wait(30);
}

/** Löst ein paste-Event aus, wie es der Browser bei Strg/Cmd+V feuert. */
async function paste(g, text) {
  await g.eval((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await g.wait(30);
}

// ============================================================================ Button

await runTest('Button: Klick löst onClick aus, deaktiviert nicht, Wegziehen bricht ab', async () => {
  const g = await openGallery();
  try {
    await g.shot('forms-overview');
    const primary = await boundsOf(g, 'buttons', 'primary');
    await g.click(primary.cx, primary.cy);
    assert((await entries(g, { type: 'click', id: 'primary' })).length === 1, 'primary: genau ein Klick');

    const disabled = await boundsOf(g, 'buttons', 'disabled');
    await g.click(disabled.cx, disabled.cy);
    assert((await entries(g, { type: 'click', id: 'disabled' })).length === 0, 'deaktivierter Button darf nicht auslösen');

    // Drücken, wegziehen, loslassen → kein Klick (wie bei echten Buttons)
    const danger = await boundsOf(g, 'buttons', 'danger');
    await g.mouseDown(danger.cx, danger.cy);
    await g.move(danger.cx, danger.cy + 140);
    await g.mouseUp();
    await g.wait(60);
    assert((await entries(g, { type: 'click', id: 'danger' })).length === 0, 'Wegziehen vor dem Loslassen bricht ab');

    for (const id of ['secondary', 'success', 'ghost', 'link', 'icon', 'submit']) {
      const b = await boundsOf(g, 'buttons', id);
      await g.click(b.cx, b.cy);
      assert((await entries(g, { type: 'click', id })).length === 1, `${id}: Klick erwartet`);
    }

    await g.eval(() => window.__W.buttons.disabled.setEnabled(true));
    await g.click(disabled.cx, disabled.cy);
    assert((await entries(g, { type: 'click', id: 'disabled' })).length === 1, 'nach setEnabled(true) klickbar');

    // Hover-Zustand + Cursor
    await g.move(primary.cx, primary.cy);
    await g.wait(60);
    const hover = await g.eval(() => ({
      hovered: window.__W.buttons.primary.isHovered,
      cursor: window.__W.scene.game.canvas.style.cursor,
    }));
    assert(hover.hovered && hover.cursor === 'pointer', `Hover + Hand-Cursor erwartet (${JSON.stringify(hover)})`);

    // setText passt zu lange Beschriftungen ein (kleiner, zweizeilig oder gekürzt)
    const fit = await g.eval(() => {
      const check = (b, str) => {
        b.setText(str);
        return { fits: b.label.width <= b.width - 2 * UI.Button.LAYOUT.PADDING_X + 0.5, full: b.getText() === str, shown: b.label.text };
      };
      return [
        check(window.__W.buttons.secondary, 'Haben Sie es schon mit Aus- und Einschalten versucht?'),
        check(window.__W.buttons.success, 'Donaudampfschifffahrtsgesellschaftskapitän'),
      ];
    });
    assert(fit.every((f) => f.fits && f.full), `lange Beschriftungen passen: ${JSON.stringify(fit)}`);
    await g.move(10, 590);
    await g.wait(60);
    await g.shot('forms-buttons-long');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ============================================================================ TextInput

await runTest('TextInput: Tippen, Bearbeiten, Tab, Enter, Maske, transformChar, Einfügen, Scrollen', async () => {
  const g = await openGallery();
  try {
    const email = await boundsOf(g, 'inputs', 'email');
    await g.click(email.cx, email.cy);
    assert(await isFocused(g, 'email'), 'Klick fokussiert das Feld');

    await g.type(IDENTITY);
    assert((await valueOf(g, 'email')) === IDENTITY, `Kennung getippt: ${await valueOf(g, 'email')}`);

    await g.press('Backspace');
    assert((await valueOf(g, 'email')) === IDENTITY.slice(0, -1), 'Backspace löscht das letzte Zeichen');
    await g.type('e');

    // Pfeil links ×3 und in der Mitte einfügen
    for (let i = 0; i < 3; i += 1) await g.press('ArrowLeft');
    await g.type('X');
    assert((await valueOf(g, 'email')) === 'wwi26042@lehre.dhbw-stuttgartX.de', `Einfügen in der Mitte: ${await valueOf(g, 'email')}`);
    await g.press('Backspace');
    assert((await valueOf(g, 'email')) === IDENTITY, 'Backspace in der Mitte');

    // Home/Delete/End
    await g.press('Home');
    await g.type('>');
    assert((await valueOf(g, 'email')) === `>${IDENTITY}`, 'Home setzt den Cursor an den Anfang');
    await g.press('Home');
    await g.press('Delete');
    assert((await valueOf(g, 'email')) === IDENTITY, 'Delete löscht rechts vom Cursor');
    await g.press('End');
    await g.type('!');
    assert((await valueOf(g, 'email')) === `${IDENTITY}!`, 'End setzt den Cursor ans Ende');
    await g.press('Backspace');

    // Alles markieren + überschreiben, Wort löschen
    await g.press('ControlOrMeta+a');
    await g.type('neu');
    assert((await valueOf(g, 'email')) === 'neu', 'Strg/Cmd+A + Tippen ersetzt alles');
    await g.press('ControlOrMeta+a');
    await g.type(IDENTITY);
    await g.press('Alt+Backspace');
    assert((await valueOf(g, 'email')) === 'wwi26042@lehre.dhbw-stuttgart.', 'Alt+Backspace löscht ein Wort');
    await g.type('de');
    const changes = await entries(g, { type: 'change', id: 'email' });
    assert(changes.length > 10 && changes[changes.length - 1].payload === IDENTITY, 'change-Events mit aktuellem Wert');
    await g.shot('forms-input-focused');

    // Tab → Passwortfeld, Umlaute/ß wie auf deutscher Tastatur
    await g.press('Tab');
    assert((await focusedName(g)) === 'password', `Tab wechselt ins Passwortfeld (fokussiert: ${await focusedName(g)})`);
    assert(!(await isFocused(g, 'email')), 'vorheriges Feld verliert den Fokus');
    await typeReal(g, PASSWORD);
    assert((await valueOf(g, 'password')) === PASSWORD, `Passwort getippt: ${await valueOf(g, 'password')}`);
    const masked = await g.eval(() => window.__W.inputs.password.valueText.text);
    assert(masked === '•'.repeat(PASSWORD.length), `Passwort maskiert: ${masked}`);

    // Auge-Umschalter
    const pw = await boundsOf(g, 'inputs', 'password');
    await g.click(pw.x + pw.width - 20, pw.cy);
    const revealed = await g.eval(() => window.__W.inputs.password.valueText.text);
    assert(revealed === PASSWORD, `Auge zeigt Klartext: ${revealed}`);
    assert(await isFocused(g, 'password'), 'Auge-Klick behält den Fokus');
    await g.shot('forms-input-password');
    await g.click(pw.x + pw.width - 20, pw.cy);

    // Enter → submit; Autorepeat (Taste gedrückt halten) löst nicht erneut aus
    await g.press('Enter');
    const cdp = await g.context.newCDPSession(g.page);
    for (let i = 0; i < 3; i += 1) {
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, autoRepeat: true,
      });
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await g.wait(40);
    const submits = await entries(g, { type: 'submit', id: 'password' });
    assert(submits.length === 1 && submits[0].payload === PASSWORD, `Enter löst genau ein submit aus (${submits.length})`);

    // Tab → transformChar-Feld (y↔z)
    await g.press('Tab');
    assert((await focusedName(g)) === 'zy', 'Tab überspringt nichts Falsches');
    await g.type('yzYZ wwi26');
    assert((await valueOf(g, 'zy')) === 'zyZY wwi26', `transformChar wirkt: ${await valueOf(g, 'zy')}`);

    // Tab überspringt das deaktivierte Feld; Shift+Tab zurück
    await g.press('Tab');
    assert((await focusedName(g)) === 'domain', 'Tab → Domain');
    await g.press('Tab');
    assert((await focusedName(g)) === 'narrow', 'Tab überspringt deaktiviertes Feld');
    await g.press('Shift+Tab');
    await g.press('Shift+Tab');
    assert((await focusedName(g)) === 'zy', 'Shift+Tab geht zurück');

    // Escape → blur, Klick daneben → blur
    await g.press('Escape');
    assert((await focusedName(g)) === null, 'Escape nimmt den Fokus');
    await g.click(email.cx, email.cy);
    assert(await isFocused(g, 'email'), 'Klick fokussiert erneut');
    await g.click(GAP_POINT.x, GAP_POINT.y);
    assert((await focusedName(g)) === null, 'Klick daneben nimmt den Fokus');

    // Einfügen per paste-Event (Strg/Cmd+V) – läuft durch transformChar, ohne Zeilenumbruch
    const zy = await boundsOf(g, 'inputs', 'zy');
    await g.click(zy.x + zy.width - 12, zy.cy);
    await g.press('End');
    await paste(g, ' Kehrwoche y\n');
    assert((await valueOf(g, 'zy')) === 'zyZY wwi26 Kehrwoche z', `Einfügen + transformChar: ${await valueOf(g, 'zy')}`);
    await g.press('ControlOrMeta+v');
    assert((await valueOf(g, 'zy')) === 'zyZY wwi26 Kehrwoche z', 'Strg/Cmd+V tippt kein „v“');
    await g.press('Escape');
    await paste(g, 'ungefragt');
    assert((await valueOf(g, 'zy')) === 'zyZY wwi26 Kehrwoche z', 'Einfügen ohne Fokus ändert nichts');

    // Langer Text scrollt horizontal, Cursor bleibt sichtbar
    const narrow = await boundsOf(g, 'inputs', 'narrow');
    const unfocusedStart = await g.eval(() => window.__W.inputs.narrow.valueText.text);
    assert(unfocusedStart.startsWith('Ein ziemlich'), `ohne Fokus ist der Textanfang sichtbar: ${unfocusedStart}`);
    await g.click(narrow.cx, narrow.cy);
    await g.press('End');
    await g.type(' - mit Ende!');
    const scroll = await g.eval(() => {
      const input = window.__W.inputs.narrow;
      const field = input.getFieldBounds();
      const caret = input.caretRect.getBounds();
      return {
        value: input.getValue(), shown: input.valueText.text, scrollStart: input.scrollStart,
        caretX: caret.x, left: field.x, right: field.x + field.width,
      };
    });
    assert(scroll.value.endsWith(' - mit Ende!'), 'Text angehängt');
    assert(scroll.scrollStart > 0 && scroll.value.endsWith(scroll.shown) && scroll.shown.length < scroll.value.length,
      `Ausschnitt zeigt das Ende: ${JSON.stringify(scroll)}`);
    assert(scroll.caretX > scroll.left && scroll.caretX < scroll.right, `Cursor im Feld: ${JSON.stringify(scroll)}`);
    await g.shot('forms-input-scroll');
    await g.press('Home');
    assert((await g.eval(() => window.__W.inputs.narrow.scrollStart)) === 0, 'Home scrollt zurück an den Anfang');

    // maxLength
    const maxLengthOk = await g.eval(() => {
      const input = window.__W.inputs.narrow;
      input.setMaxLength(60);
      return input.getValue().length <= 60;
    });
    await g.press('End');
    await g.type('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    const narrowLength = (await valueOf(g, 'narrow')).length;
    assert(maxLengthOk && narrowLength === 60, `maxLength begrenzt (${narrowLength})`);

    // Schnelles Tippen (viele Events pro Frame) ohne doppelte Zeichen
    await g.click(email.cx, email.cy);
    await g.press('ControlOrMeta+a');
    await g.press('Backspace');
    const fast = 'Rotebuehlplatz 41, Raum 2.14 - Vorlesung 08:15 Uhr';
    await g.page.keyboard.type(fast, { delay: 0 });
    await g.wait(60);
    assert((await valueOf(g, 'email')) === fast, `schnelles Tippen ohne Doppelungen: ${await valueOf(g, 'email')}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('TextInput: keine Tasten in unsichtbare, zerstörte oder verdeckte Felder', async () => {
  const g = await openGallery();
  try {
    const email = await boundsOf(g, 'inputs', 'email');
    await g.click(email.cx, email.cy);
    await g.type('abc');
    await g.eval(() => window.__W.inputs.email.setVisible(false));
    await g.type('xyz');
    assert((await valueOf(g, 'email')) === 'abc', 'unsichtbares Feld nimmt keine Tasten an');
    assert(!(await isFocused(g, 'email')), 'unsichtbares Feld verliert den Fokus');

    // Tab ohne Fokus springt ins erste SICHTBARE Feld
    await g.press('Tab');
    assert((await focusedName(g)) === 'password', `Tab überspringt versteckte Felder (${await focusedName(g)})`);
    await g.type('pw');

    // Zerstörtes Feld: keine Fehler, kein Fokus mehr
    await g.eval(() => window.__W.inputs.password.destroy());
    await g.type('qqq');
    assert((await g.eval(() => UI.TextInput.getFocused(window.__W.scene))) === null, 'nach destroy kein Fokus');
    assert((await valueOf(g, 'zy')) === '' && (await valueOf(g, 'email')) === 'abc', 'Tasten landen nirgendwo');
    await paste(g, 'ins Leere');
    assert((await valueOf(g, 'zy')) === '', 'Einfügen nach destroy landet nirgendwo');

    // Modal sperrt Felder darunter; Tab bleibt im Dialog
    await g.eval(() => window.__W.inputs.email.setVisible(true));
    await g.click(email.cx, email.cy);
    assert(await isFocused(g, 'email'), 'wieder sichtbar → fokussierbar');
    await g.eval(() => window.__W.openDemoModal());
    await g.wait(250);
    assert(!(await isFocused(g, 'email')), 'Modal nimmt dem Feld darunter den Fokus');
    await g.type('zzz');
    assert((await valueOf(g, 'email')) === 'abc', 'Tippen bei offenem Modal ändert Felder darunter nicht');
    await g.click(email.cx, email.cy);
    assert(!(await isFocused(g, 'email')), 'Klick durch die Abdunklung fokussiert nicht');
    await g.press('Tab');
    assert((await focusedName(g)) === 'modalNote', `Tab springt ins Feld im Dialog (${await focusedName(g)})`);
    await typeReal(g, 'Grüße');
    await g.press('Tab');
    assert((await focusedName(g)) === 'modalNote', 'Tab bleibt im Dialog');
    assert((await valueOf(g, 'modalNote')) === 'Grüße', `Umlaute im Dialogfeld: ${await valueOf(g, 'modalNote')}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ============================================================================ Dropdown

await runTest('Dropdown: öffnen, wählen, außen schließen, deaktivierte Option, Mausrad, verschobener Container', async () => {
  const g = await openGallery();
  try {
    const eap = await boundsOf(g, 'dropdowns', 'eap');
    await g.click(eap.cx, eap.cy);
    const popup = await g.eval(() => {
      const d = window.__W.dropdowns.eap;
      const p = d.getPopup();
      return {
        open: d.isOpen(), x: p.x, y: p.y, depth: p.depth, hasParent: Boolean(p.parentContainer),
        rows: d.popupState.rows, expectedDepth: CONFIG.DEPTH.DROPDOWN,
      };
    });
    assert(popup.open, 'Klick öffnet die Liste');
    assert(!popup.hasParent && popup.depth === popup.expectedDepth, `Liste ist Top-Level auf DROPDOWN-Tiefe: ${JSON.stringify(popup)}`);
    assert(Math.abs(popup.x - eap.x) <= 1 && popup.y >= eap.y + eap.height, `Liste unter dem Feld: ${JSON.stringify({ popup, eap })}`);
    assert(popup.rows === 4, 'maxVisible = 4 Zeilen');
    assert((await entries(g, { type: 'open', id: 'eap' })).length === 1, 'open-Event');

    // Hover-Markierung
    const row1 = await optionBounds(g, 'eap', 1);
    await g.move(row1.cx, row1.cy);
    await g.wait(60);
    assert((await g.eval(() => window.__W.dropdowns.eap.popupState.hover)) === 1, 'Hover markiert die Zeile');
    await g.shot('forms-dropdown-open');

    // Mausrad scrollt (7 Optionen, 4 sichtbar)
    await g.wheel(row1.cx, row1.cy, 200);
    await g.wait(60);
    const firstAfterWheel = await g.eval(() => window.__W.dropdowns.eap.popupState.first);
    assert(firstAfterWheel > 0, `Mausrad scrollt (first = ${firstAfterWheel})`);
    await g.wheel(row1.cx, row1.cy, -400);
    assert((await g.eval(() => window.__W.dropdowns.eap.popupState.first)) === 0, 'zurückgescrollt');

    // Option wählen
    const ttls = await optionBounds(g, 'eap', 2);
    await g.click(ttls.cx, ttls.cy);
    const afterPick = await g.eval(() => ({ value: window.__W.dropdowns.eap.getValue(), open: window.__W.dropdowns.eap.isOpen() }));
    assert(afterPick.value === 'TTLS' && !afterPick.open, `Option gewählt + Liste zu: ${JSON.stringify(afterPick)}`);
    const changes = await entries(g, { type: 'change', id: 'eap' });
    assert(changes.length === 1 && changes[0].payload === 'TTLS', 'change-Event mit Wert');

    // Letzte Option nur per Scrollen erreichbar
    await g.click(eap.cx, eap.cy);
    const last = await optionBounds(g, 'eap', 6);
    await g.click(last.cx, last.cy);
    assert((await g.eval(() => window.__W.dropdowns.eap.getValue())) === "AKA'", 'gescrollte Option wählbar');

    // Klick außerhalb schließt, Klick aufs Feld toggelt
    await g.click(eap.cx, eap.cy);
    assert(await g.eval(() => window.__W.dropdowns.eap.isOpen()), 'wieder offen');
    await g.click(GAP_POINT.x, GAP_POINT.y);
    assert(!(await g.eval(() => window.__W.dropdowns.eap.isOpen())), 'Klick außerhalb schließt');
    await g.click(eap.cx, eap.cy);
    await g.click(eap.cx, eap.cy);
    assert(!(await g.eval(() => window.__W.dropdowns.eap.isOpen())), 'zweiter Klick aufs Feld schließt');
    assert((await g.eval(() => window.__W.dropdowns.eap.getValue())) === "AKA'", 'Schließen ändert den Wert nicht');

    // Deaktivierte Option: Liste bleibt offen, Toast mit Hinweis
    const ca = await boundsOf(g, 'dropdowns', 'ca');
    await g.click(ca.cx, ca.cy);
    const none = await optionBounds(g, 'ca', 2);
    await g.click(none.cx, none.cy);
    const disabledPick = await g.eval(() => ({
      open: window.__W.dropdowns.ca.isOpen(),
      value: window.__W.dropdowns.ca.getValue(),
      toasts: UI.Toast.getActive(window.__W.scene).map((t) => t.getText()),
    }));
    assert(disabledPick.open && disabledPick.value === null, `deaktivierte Option nicht wählbar: ${JSON.stringify(disabledPick)}`);
    assert(disabledPick.toasts.includes('Seit Android 11 nicht mehr verfügbar.'), `Hinweis-Toast: ${JSON.stringify(disabledPick)}`);
    await g.click(none.cx, none.cy);
    assert((await g.eval(() => UI.Toast.getActive(window.__W.scene).length)) === 1, 'gleicher Hinweis wird nicht gestapelt');
    await g.wait(200);
    await g.shot('forms-dropdown-disabled');

    // Tastatur: Pfeil runter + Enter wählt die nächste aktivierte Option
    await g.press('ArrowDown');
    await g.press('Enter');
    assert((await g.eval(() => window.__W.dropdowns.ca.getValue())) === 'unset', 'Pfeil + Enter wählt');

    // Verschachtelter, verschobener Container: Liste exakt unter dem Feld
    const popupInfo = () => g.eval(() => {
      const d = window.__W.dropdowns.phase2;
      const p = d.getPopup();
      return { x: p.x, y: p.y, height: d.popupState.height, openUp: d.popupState.openUp };
    });
    let p2 = await boundsOf(g, 'dropdowns', 'phase2');
    await g.click(p2.cx, p2.cy);
    const down = await popupInfo();
    assert(!down.openUp && Math.abs(down.x - p2.x) <= 1 && Math.abs(down.y - (p2.y + p2.height + 4)) <= 1,
      `Liste unter dem verschachtelten Feld: ${JSON.stringify({ down, p2 })}`);
    const gtc = await optionBounds(g, 'phase2', 2);
    await g.click(gtc.cx, gtc.cy);
    assert((await g.eval(() => window.__W.dropdowns.phase2.getValue())) === 'GTC', 'Wahl im verschachtelten Container');

    // Karte weiter nach unten: unten zu wenig Platz → Liste öffnet nach oben
    await g.eval(() => {
      window.__W.containers.formCard.y += 60;
    });
    await g.wait(50);
    p2 = await boundsOf(g, 'dropdowns', 'phase2');
    await g.click(p2.cx, p2.cy);
    const up = await popupInfo();
    assert(up.openUp && Math.abs(up.y + up.height - (p2.y - 4)) <= 1 && Math.abs(up.x - p2.x) <= 1,
      `Liste über dem Feld: ${JSON.stringify({ up, p2 })}`);
    await g.wait(120);
    await g.shot('forms-dropdown-up');
    await g.press('Escape');
    await g.eval(() => {
      window.__W.containers.formCard.y -= 60;
    });

    // Container verschieben: Liste richtet sich am neuen Ort aus und folgt bei Bewegung
    await g.eval(() => {
      window.__W.containers.formCard.x -= 120;
      window.__W.containers.nested.y += 10;
    });
    await g.wait(50);
    p2 = await boundsOf(g, 'dropdowns', 'phase2');
    await g.click(p2.cx, p2.cy);
    let moved = await g.eval(() => window.__W.dropdowns.phase2.getPopup().x);
    assert(Math.abs(moved - p2.x) <= 1, `Liste folgt dem verschobenen Container (${moved} vs ${p2.x})`);
    await g.eval(() => {
      window.__W.containers.formCard.x += 30;
    });
    await g.waitFor((x) => Math.abs(window.__W.dropdowns.phase2.getPopup().x - x) <= 1, p2.x + 30, { timeout: 3000 });
    moved = await g.eval(() => window.__W.dropdowns.phase2.getPopup().x);
    assert(Math.abs(moved - (p2.x + 30)) <= 1, `offene Liste folgt der Bewegung (${moved})`);
    await g.press('Escape');
    assert(!(await g.eval(() => window.__W.dropdowns.phase2.isOpen())), 'Escape schließt');

    // Verstecken schließt die offene Liste
    p2 = await boundsOf(g, 'dropdowns', 'phase2');
    await g.click(p2.cx, p2.cy);
    await g.eval(() => window.__W.containers.nested.setVisible(false));
    await g.waitFor(() => !window.__W.dropdowns.phase2.isOpen(), null, { timeout: 3000 }); // schließt beim nächsten Frame
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ============================================================================ Checkbox

await runTest('Checkbox: Kästchen und Beschriftung schalten um, deaktiviert nicht', async () => {
  const g = await openGallery();
  try {
    const tos = await boundsOf(g, 'checkboxes', 'tos');
    await g.click(tos.x + 14, tos.cy); // aufs Kästchen
    assert(await g.eval(() => window.__W.checkboxes.tos.isChecked()), 'Klick aufs Kästchen hakt an');
    await g.click(tos.cx + 60, tos.cy); // auf die Beschriftung
    assert(!(await g.eval(() => window.__W.checkboxes.tos.isChecked())), 'Klick auf die Beschriftung schaltet um');
    const changes = await entries(g, { type: 'change', id: 'tos' });
    assert(changes.length === 2 && changes[0].payload === true && changes[1].payload === false, 'change-Events');

    const disabled = await boundsOf(g, 'checkboxes', 'disabled');
    await g.click(disabled.cx, disabled.cy);
    assert(!(await g.eval(() => window.__W.checkboxes.disabled.isChecked())), 'deaktiviert: keine Änderung');

    const silent = await g.eval(() => {
      const before = window.__LOG.length;
      window.__W.checkboxes.remember.setChecked(false, { silent: true });
      return { checked: window.__W.checkboxes.remember.isChecked(), logged: window.__LOG.length - before };
    });
    assert(!silent.checked && silent.logged === 0, 'setChecked(silent) ohne Event');
    await g.click(tos.x + 14, tos.cy);
    await g.wait(150);
    await g.shot('forms-checkbox');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ============================================================================ Modal + Toast

await runTest('Modal blockiert Klicks darunter und schließt per Button; Toasts stapeln sich', async () => {
  const g = await openGallery();
  try {
    const openButton = await boundsOf(g, 'buttons', 'openModal');
    await g.click(openButton.cx, openButton.cy);
    await g.wait(250);
    const state = await g.eval(() => ({
      open: window.__W.modal.isOpen(), any: UI.Modal.isAnyOpen(window.__W.scene),
      depth: window.__W.modal.depth, expected: CONFIG.DEPTH.MODAL,
    }));
    assert(state.open && state.any && state.depth === state.expected, `Modal offen auf MODAL-Tiefe: ${JSON.stringify(state)}`);
    await g.shot('forms-modal');

    // Klicks darunter kommen nicht an; Abdunklung schließt hier nicht
    const primary = await boundsOf(g, 'buttons', 'primary');
    await g.click(primary.cx, primary.cy);
    assert((await entries(g, { type: 'click', id: 'primary' })).length === 0, 'Button unter dem Modal bleibt stumm');
    assert(await g.eval(() => window.__W.modal.isOpen()), 'closeOnBackdrop=false: bleibt offen');
    await g.press('Escape');
    assert(await g.eval(() => window.__W.modal.isOpen()), 'Escape schließt ohne closeOnEscape nicht');

    const modalButtons = await g.eval(() => window.__W.modal.getButtons().map((b) => {
      const r = b.hitRect.getBounds();
      return { text: b.getText(), cx: r.x + r.width / 2, cy: r.y + r.height / 2, right: r.x + r.width };
    }));
    const panelRight = await g.eval(() => {
      const r = window.__W.modal.panelHit.getBounds();
      return r.x + r.width;
    });
    assert(Math.abs(modalButtons[2].right - (panelRight - 24)) <= 1, 'Buttons rechtsbündig');
    const details = modalButtons.find((b) => b.text === 'Details');
    await g.click(details.cx, details.cy);
    assert(await g.eval(() => window.__W.modal.isOpen()), 'keepOpen hält den Dialog offen');
    assert((await entries(g, { type: 'modal', id: 'details' })).length === 1, 'onClick von „Details“');

    const cancel = modalButtons.find((b) => b.text === 'Abbrechen');
    await g.click(cancel.cx, cancel.cy);
    assert(!(await g.eval(() => window.__W.modal.isOpen())), 'Abbrechen schließt');
    const closes = await entries(g, { type: 'modalClose' });
    assert(closes.length === 1 && closes[0].id === 'button' && closes[0].payload === 0, `onClose: ${JSON.stringify(closes)}`);
    await g.waitFor(() => !window.__W.modal.scene, null, { timeout: 3000 }); // nach dem Ausblenden zerstört
    await g.click(primary.cx, primary.cy);
    assert((await entries(g, { type: 'click', id: 'primary' })).length === 1, 'nach dem Schließen wieder klickbar');

    // closeOnBackdrop
    await g.eval(() => window.__W.openBackdropModal());
    await g.wait(250);
    await g.click(40, 40);
    assert(!(await g.eval(() => window.__W.modal.isOpen())), 'Klick auf die Abdunklung schließt');
    const last = (await entries(g, { type: 'modalClose' })).pop();
    assert(last.id === 'backdrop', 'reason backdrop');
    await g.wait(250);

    // Dropdown im Dialog: Liste liegt über dem Dialog und ist klickbar
    await g.eval(() => window.__W.openDropdownModal());
    await g.wait(250);
    const inModal = await boundsOf(g, 'dropdowns', 'modalEap');
    await g.click(inModal.cx, inModal.cy);
    const modalPopup = await g.eval(() => ({
      depth: window.__W.dropdowns.modalEap.getPopup().depth, modalDepth: window.__W.modal.depth,
    }));
    assert(modalPopup.depth > modalPopup.modalDepth, `Liste über dem Dialog: ${JSON.stringify(modalPopup)}`);
    const tls = await optionBounds(g, 'modalEap', 1);
    await g.click(tls.cx, tls.cy);
    assert((await g.eval(() => window.__W.dropdowns.modalEap.getValue())) === 'TLS', 'Auswahl im Dialog');
    assert(await g.eval(() => window.__W.modal.isOpen()), 'Auswahl schließt den Dialog nicht');
    await g.click(inModal.cx, inModal.cy);
    await g.press('Escape');
    assert(await g.eval(() => window.__W.modal.isOpen() && !window.__W.dropdowns.modalEap.isOpen()),
      'Escape schließt nur die Liste');
    await g.eval(() => window.__W.modal.close());
    await g.wait(250);

    // Toasts
    const toastButton = await boundsOf(g, 'buttons', 'showToasts');
    await g.click(toastButton.cx, toastButton.cy);
    await g.wait(300);
    const toasts = await g.eval(() => UI.Toast.getActive(window.__W.scene).map((t) => ({
      y: t.targetY, h: t.toastHeight, cx: t.x + t.toastWidth / 2, depth: t.depth, text: t.getText(),
    })));
    assert(toasts.length === 4, `4 Toasts sichtbar (${toasts.length})`);
    const bottom = toasts[0];
    assert(Math.abs(bottom.y + bottom.h / 2 - (600 - 64)) <= 2 && Math.abs(bottom.cx - 400) <= 1, `unterster Toast unten mittig: ${JSON.stringify(bottom)}`);
    for (let i = 1; i < toasts.length; i += 1) {
      assert(toasts[i].y + toasts[i].h <= toasts[i - 1].y, `Toast ${i} liegt über Toast ${i - 1}`);
      assert(toasts[i].depth === 1000, 'Toast auf TOAST-Tiefe');
    }
    await g.shot('forms-toasts');
    // Die beiden kurzen Toasts (2,4 s) verschwinden, die langen (8 s) rutschen nach unten
    await g.waitFor(() => UI.Toast.getActive(window.__W.scene).length === 2, null, { timeout: 6000 });
    const remaining = await g.eval(() => UI.Toast.getActive(window.__W.scene).map((t) => ({ text: t.getText(), y: t.targetY, h: t.toastHeight })));
    assert(remaining[0].text === 'Verbunden, kein Internet', `kurze Toasts verschwunden: ${JSON.stringify(remaining)}`);
    assert(Math.abs(remaining[0].y + remaining[0].h / 2 - (600 - 64)) <= 2, `ältester verbliebener Toast rutscht nach unten: ${JSON.stringify(remaining)}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ============================================================================ Szenen-Neustart

await runTest('Neustart der Szene: Listener abgemeldet, Widgets funktionieren wieder', async () => {
  const g = await openGallery();
  try {
    // Zustand vor dem Neustart: Feld fokussiert, Liste offen, Dialog offen, Toast sichtbar
    const email = await boundsOf(g, 'inputs', 'email');
    await g.click(email.cx, email.cy);
    await g.type('alt');
    const listeners = () => g.eval(() => {
      const scene = window.__W.scene;
      return {
        keydown: scene.input.keyboard.listenerCount('keydown'),
        pointerdown: scene.input.listenerCount('pointerdown'),
        prerender: scene.events.listenerCount('prerender'),
      };
    });
    const before = await listeners();
    await g.eval(() => {
      window.__W.dropdowns.eap.open();
      window.__W.openBackdropModal();
      UI.toast(window.__W.scene, 'Neustart');
      window.__GALLERY_READY = false;
      window.__W.scene.scene.restart();
    });
    await g.waitFor(() => window.__GALLERY_READY === true);
    await g.wait(250);

    const after = await listeners();
    assert(after.keydown <= before.keydown && after.pointerdown <= before.pointerdown && after.prerender <= before.prerender,
      `keine zusätzlichen Listener nach dem Neustart: ${JSON.stringify({ before, after })}`);
    const fresh = await g.eval(() => ({
      focused: UI.TextInput.getFocused(window.__W.scene),
      modal: UI.Modal.isAnyOpen(window.__W.scene),
      dropdown: UI.Dropdown.isAnyOpen(window.__W.scene),
      toasts: UI.Toast.getActive(window.__W.scene).length,
      inputs: UI.TextInput.getAll(window.__W.scene).length,
    }));
    assert(fresh.focused === null && !fresh.modal && !fresh.dropdown && fresh.toasts === 0,
      `sauberer Zustand nach dem Neustart: ${JSON.stringify(fresh)}`);
    assert(fresh.inputs === 6, `nur die neuen Felder registriert (${fresh.inputs})`);

    // Tippen und Einfügen wirken genau einmal (keine Listener der alten Felder mehr)
    const fresher = await boundsOf(g, 'inputs', 'email');
    await g.click(fresher.cx, fresher.cy);
    await g.type('neu');
    await paste(g, '!');
    assert((await valueOf(g, 'email')) === 'neu!', `nach dem Neustart: ${await valueOf(g, 'email')}`);
    const eap = await boundsOf(g, 'dropdowns', 'eap');
    await g.click(eap.cx, eap.cy);
    const peap = await optionBounds(g, 'eap', 0);
    await g.click(peap.cx, peap.cy);
    assert((await g.eval(() => window.__W.dropdowns.eap.getValue())) === 'PEAP', 'Dropdown nach dem Neustart');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
