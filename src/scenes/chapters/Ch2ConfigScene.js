/**
 * Ch2ConfigScene.js – Kapitel 2 „Die Konfiguration“.
 *
 * Schreibtisch: links das IT-Merkblatt „Stand 2014“ (teils veraltet, mit Randnotizen von
 * Kommiliton:innen), darunter ein Post-it mit Kennung und Passwort aus Kapitel 1 und – nach
 * wiederholten Fehlern – ein Zettel mit einem Mitleids-Tipp. Rechts das Handy (UI.Phone)
 * mit echt wirkender Android-Oberfläche:
 *  1. WLAN-Liste: eduroam antippen → Android probiert ungefragt das alte Profil vom
 *     Schnupperstudium → „Authentifizierungsproblem“.
 *  2. Detailseite des gespeicherten Netzes: „Entfernen“ (oder stur „Verbinden“).
 *  3. Dialog „eduroam“: EAP-Methode, Phase 2, CA-Zertifikat, Online-Zertifikatstatus,
 *     Domain, Identität, anonyme Identität, Passwort. Trolle (je einmal): Tastatur springt
 *     auf English (y↔z), Autokorrektur macht aus „@lehre.“ ein „@lehrer.“.
 *  4. „Verbinden“ → vage Statuszeilen mit Spinner. Erfolg: „Verbunden, kein Internet“,
 *     das Merkblatt wird rot korrigiert (Lerneffekt), danach succeed().
 *
 * Prüf-Logik, Texte und Balance stecken in Ch2Logic (src/logic/ch2Config.js).
 * Die Handy-Seiten liegen im maskierten Container `phone.screen` (lokale Koordinaten).
 *
 * Global: Ch2ConfigScene.
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, CAMPUS, GameState, RNG, Ch2Logic,
 * ChapterScene, UI (text, sound, toast, Phone, Button, TextInput, Dropdown, Modal, Spinner),
 * FX, optional Textures (WLAN-Fächer, Icons).
 */

class Ch2ConfigScene extends ChapterScene {
  /**
   * Layout (px). Schreibtisch in Weltkoordinaten, Handy-Seiten lokal im Handy-Bildschirm
   * (280 × 468). Lesbarkeit: alle Texte mindestens 13 px.
   */
  static LAYOUT = Object.freeze({
    PHONE: Object.freeze({ X: 482, Y: 54, WIDTH: 300, HEIGHT: 540, BATTERY: 19, WIFI_LEVEL: 3 }),
    SHEET: Object.freeze({
      X: 16, Y: 60, WIDTH: 440, MAX_HEIGHT: 418, ANGLE: -1.2, PADDING: 18, SHADOW: 7,
      HEADER_HEIGHT: 19, LOGO_SIZE: 10, LOGO_GAP: 6, LOGO_OFFSET_Y: 3, RULE_GAP: 7, RULE_ALPHA: 0.6,
      LINE_GAP: 3, INDENT: 26, COPY_EDGE_W: 4, NOTE_RIGHT_OFFSET_Y: -1,
      NOTE_INDENT: 30, NOTE_HEIGHT: 17, NOTE_RIGHT_GAP: 12, NOTE_ANGLE: -1.5,
      TEXT_SIZE: 13, TECH_SIZE: 13, TITLE_SIZE: 17, SMALL_SIZE: 13, NOTE_SIZE: 14,
      STAPLE_X: 14, STAPLE_Y: 10, STAPLE_W: 24, STAPLE_H: 4, STAPLE_ANGLE: -32,
      RING_X: 0.82, RING_Y: 0.12, RING_RADIUS: 27, RING_WIDTH: 5,
      STRIKE_HEIGHT: 2, STRIKE_MS: 220, CORRECTION_STAGGER_MS: 280, CORRECTION_FADE_MS: 260,
    }),
    NOTE: Object.freeze({
      X: 20, Y: 484, WIDTH: 206, HEIGHT: 108, ANGLE: 2.4, PADDING: 10, SHADOW: 4,
      TITLE_SIZE: 13, TEXT_SIZE: 16, FOOT_SIZE: 13, LINE_GAP: 2, LINE_SPACING: 0,
    }),
    TIP: Object.freeze({
      X: 238, BOTTOM: 594, WIDTH: 234, MIN_HEIGHT: 92, MAX_HEIGHT: 150, ANGLE: -1.6, PADDING: 10,
      SHADOW: 4, AUTHOR_SIZE: 13, AUTHOR_GAP: 2, TEXT_SIZE: 14, LINE_SPACING: 1, POP_SCALE: 1.14, POP_MS: 260,
    }),
    SCREEN: Object.freeze({ PAD: 16 }),
    LIST: Object.freeze({
      TITLE_Y: 12, TITLE_SIZE: 22, TOGGLE_Y: 48, TOGGLE_H: 42, TOGGLE_RADIUS: 21, TOGGLE_INSET: 8,
      TOGGLE_TEXT_X: 22, TOGGLE_TEXT_SIZE: 15, SWITCH_W: 40, SWITCH_H: 22, SWITCH_KNOB_INSET: 3,
      SECTION_Y: 101, SECTION_SIZE: 13, ROWS_Y: 120, ROW_H: 44, ICON_CX: 28, ICON_RADIUS: 13, ICON_DROP: 0.45,
      TEXT_X: 54, SSID_Y: 4, SSID_SIZE: 15, STATUS_Y: 24, STATUS_SIZE: 13, RIGHT_ICON_INSET: 26, RIGHT_ICON_SCALE: 0.62,
      SPINNER_SIZE: 18, SPINNER_THICKNESS: 2.5, CARD_Y: 389, CARD_H: 75, CARD_RADIUS: 12, CARD_TEXT_Y: 8,
      CARD_TEXT_SIZE: 13, LINK_X: 12, LINK_BOTTOM: 6, LINK_SIZE: 14, LINK_H: 26,
    }),
    DETAILS: Object.freeze({
      BACK_X: 4, BACK_Y: 6, BACK_W: 96, BACK_H: 30, BACK_SIZE: 14, ICON_Y: 84, ICON_RADIUS: 24, TITLE_Y: 92,
      TITLE_SIZE: 22, STATUS_Y: 124, STATUS_SIZE: 14, BUTTONS_Y: 154, BUTTON_W: 120, BUTTON_H: 40, BUTTON_SIZE: 15,
      DIVIDER_Y: 210, ROWS_Y: 220, LABEL_SIZE: 13, VALUE_SIZE: 14, VALUE_GAP: 1, ROW_GAP: 8, EXPLAIN_SIZE: 13,
    }),
    /**
     * Dialog „eduroam“: Kopfzeile, 7 Zeilen (Beschriftung + Feld), Hinweis, Buttons, Tastatur-Leiste.
     * Zeile i beginnt bei ROW_Y + i · ROW_PITCH; Buttons rücken bei Bedarf unter den Hinweis.
     */
    CONFIG: Object.freeze({
      TITLE_Y: 8, TITLE_SIZE: 20, SUBTITLE_SIZE: 13, ROW_Y: 38, ROW_PITCH: 47,
      LABEL_H: 15, LABEL_SIZE: 13, FIELD_H: 26, FIELD_FONT: 13, FIELD_RADIUS: 6, ERROR_OUTLINE: 2,
      EAP_WIDTH: 84, COLUMN_GAP: 8, NOTICE_GAP: 4, NOTICE_SIZE: 13, NOTICE_LINE_SPACING: 1,
      BUTTONS_Y: 404, BUTTONS_MIN_GAP: 5, BUTTON_H: 32, CANCEL_W: 100, CONNECT_W: 112,
      BUTTON_GAP: 8, BUTTON_FONT: 14, KEYBOARD_H: 26, KEYBOARD_SIZE: 13, KEYBOARD_PULSE: 1.05, MAX_LENGTH: 96,
    }),
    FEEDBACK: Object.freeze({
      STAMP_Y: 300, FLOAT_Y_OFFSET: -16, FLOAT_SIZE: 16, MODAL_PENALTY_Y: 140, // über dem Systemdialog
      AUTOCORRECT_SIZE: 15, AUTOCORRECT_MS: 2600, AUTOCORRECT_RISE: 22,
    }),
    SUCCESS_DELAY_MS: 3200, // Zeit, um die Korrekturen im Merkblatt zu lesen (plus CHAPTER_END_DELAY)
    NOTE_TOAST_MS: 3800,
  });

  /** Farben und Effekt-Werte. */
  static STYLE = Object.freeze({
    PEN: Object.freeze({ red: '#c62828', blue: '#1f4e9c', pencil: '#6b717c' }),
    SHADOW_ALPHA: 0.35,
    COPY_EDGE_ALPHA: 0.55,
    COFFEE: 0x8d6e63,
    COFFEE_ALPHA: 0.2,
    STAPLE: 0x9aa0a6,
    TIP_PAPER: 0xffe082,
    TOGGLE_BG: 0xe8f0fe,
    DIVIDER: CONFIG.COLORS.BORDER,
    ICON: CONFIG.COLORS.TEXT,
    ICON_MUTED: CONFIG.COLORS.TEXT_MUTED,
    WIFI_EMPTY_ALPHA: 0.25,
    /** Ersatz-Balken, falls Textures.drawWifiFan fehlt (Anteile am Radius). */
    WIFI_FALLBACK: Object.freeze({ BARS: 4, START: 0.7, STEP: 0.38, WIDTH: 0.26 }),
  });

  /** Seiten des Handys. */
  static PAGE = Object.freeze({ LIST: 'list', DETAILS: 'details', CONFIG: 'config' });

  /** Fortschritt im Kapitel (getDebugInfo().step). */
  static STEP = Object.freeze({
    START: 'start',             // altes Profil gespeichert, noch nicht probiert
    OLD_PROFILE: 'old-profile', // altes Profil gescheitert – muss entfernt werden
    SETUP: 'setup',             // entfernt, Dialog noch nicht geöffnet
    CONFIG: 'config',           // Dialog wird ausgefüllt / Fehlversuche
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
  });

  constructor() {
    super(2);
  }

  create() {
    this.initChapter();

    // Zustand (in create, damit scene.restart() sauber neu startet)
    this.step = Ch2ConfigScene.STEP.START;
    this.pageName = null;
    this.page = null;
    this.isBusy = false;
    this.isOldProfileRemoved = false;
    this.oldProfileAttempts = 0;
    this.eduroamStatus = Ch2Logic.STATUS.SAVED;
    this.configValues = Ch2Logic.getDefaultConfig(CAMPUS);
    this.configAttempts = 0;
    this.stampsShown = 0;
    this.fieldErrors = {};
    this.lastResult = null;
    this.keyboardLayout = Ch2Logic.KEYBOARD.DE;
    this.hasKeyboardTrolled = false;
    this.hasAutocorrected = false;
    this.hasShownCorrections = false;
    this.penalizedReactions = new Set();
    this.tracker = Ch2Logic.createFailTracker();
    this.pityTipText = null;
    this.tipContainer = null;
    this.timers = [];
    this.fields = {};
    this.fieldLabels = {};
    this.targets = {};
    this.eduroamRow = null;
    this.neighbourToast = null;

    this.buildSheet();
    this.buildCredentialNote();
    this.buildPhone();
    this.showListPage();
    this.setObjective(Ch2Logic.OBJECTIVES.START);
  }

  // ===========================================================================
  // Schreibtisch: Merkblatt, Post-it, Mitleids-Tipp
  // ===========================================================================

  /** IT-Merkblatt „Stand 2014“: Kopie mit Heftklammer, Kaffeerand und Randnotizen. */
  buildSheet() {
    const S = Ch2ConfigScene.LAYOUT.SHEET;
    const ST = Ch2ConfigScene.STYLE;
    const CSS = CONFIG.CSS;
    const data = Ch2Logic.getMerkblatt(CAMPUS);
    const innerWidth = S.WIDTH - 2 * S.PADDING;
    this.sheetData = data;
    this.sheetLines = {};
    this.sheetSlots = {};
    this.sheetNotes = {};

    // Inhalt zuerst ab (0,0) aufbauen und messen, dann das Papier darum legen
    const content = this.add.container(0, 0);
    const add = (obj) => {
      content.add(obj);
      return obj;
    };
    const paperText = (x, y, str, opts) => add(UI.text(this, x, y, str, { font: 'PAPER', color: CSS.INK, ...opts }));
    let y = 0;

    add(this.add.rectangle(0, y + S.LOGO_OFFSET_Y, S.LOGO_SIZE, S.LOGO_SIZE, CONFIG.COLORS.DHBW_RED).setOrigin(0));
    paperText(S.LOGO_SIZE + S.LOGO_GAP, y, data.org, { size: S.SMALL_SIZE, color: CSS.INK_MUTED });
    paperText(innerWidth, y, data.date, { size: S.SMALL_SIZE, bold: true, origin: { x: 1, y: 0 } });
    y += S.HEADER_HEIGHT;
    const title = paperText(0, y, data.title, { size: S.TITLE_SIZE, bold: true, wrap: innerWidth });
    y += title.height;
    const subtitle = paperText(0, y, data.subtitle, { size: S.SMALL_SIZE, italic: true, color: CSS.INK_MUTED });
    y += subtitle.height + S.RULE_GAP;
    const addRule = () => {
      add(this.add.rectangle(0, y, innerWidth, 1, CONFIG.COLORS.INK_MUTED, S.RULE_ALPHA).setOrigin(0));
      y += S.RULE_GAP;
    };
    addRule();

    const corrected = new Set(data.corrections.map((note) => note.anchor));
    const noteFor = (id) => data.annotations.find((note) => note.anchor === id) || null;
    const addLine = (line, size) => {
      const x = line.isIndented ? S.INDENT : 0;
      const text = paperText(x, y, line.text, { size, wrap: innerWidth - x });
      this.sheetLines[line.id] = text;
      const note = noteFor(line.id);
      const lineY = y;
      y += text.height + S.LINE_GAP;
      if (corrected.has(line.id)) {
        // Eigene Zeile für Randnotiz bzw. spätere Korrektur
        this.sheetSlots[line.id] = { x: S.NOTE_INDENT, y: y - S.LINE_GAP };
        y += S.NOTE_HEIGHT;
        if (note) this.sheetNotes[line.id] = this.addSheetNote(content, this.sheetSlots[line.id], note.text, ST.PEN[note.pen]);
      } else if (note) {
        // Kurze Notiz rechts daneben, wenn sie passt – sonst darunter
        const probe = UI.text(this, 0, 0, note.text, { font: 'HAND', size: S.NOTE_SIZE });
        const fitsRight = x + text.width + S.NOTE_RIGHT_GAP + probe.width <= innerWidth;
        probe.destroy();
        const slot = fitsRight
          ? { x: x + text.width + S.NOTE_RIGHT_GAP, y: lineY + S.NOTE_RIGHT_OFFSET_Y }
          : { x: S.NOTE_INDENT, y: y - S.LINE_GAP };
        if (!fitsRight) y += S.NOTE_HEIGHT;
        this.sheetNotes[line.id] = this.addSheetNote(content, slot, note.text, ST.PEN[note.pen]);
      }
    };
    data.steps.forEach((line) => addLine(line, S.TEXT_SIZE));
    y += S.LINE_GAP;
    addRule();
    data.technical.forEach((line) => addLine(line, S.TECH_SIZE));
    const contentHeight = y - S.LINE_GAP;

    // Papier: so hoch wie nötig, höchstens MAX_HEIGHT (sonst Inhalt leicht verkleinern)
    const height = Math.min(S.MAX_HEIGHT, Math.ceil(contentHeight + 2 * S.PADDING));
    const scale = Math.min(1, (height - 2 * S.PADDING) / contentHeight);
    content.setScale(scale);
    this.sheetContent = content;

    const sheet = this.add.container(S.X + S.WIDTH / 2, S.Y + height / 2).setDepth(CONFIG.DEPTH.CONTENT);
    const left = -S.WIDTH / 2;
    const top = -height / 2;
    const deco = this.add.graphics();
    deco.fillStyle(CONFIG.COLORS.SHADOW, ST.SHADOW_ALPHA);
    deco.fillRect(left + S.SHADOW, top + S.SHADOW, S.WIDTH, height);
    deco.fillStyle(CONFIG.COLORS.PAPER, 1);
    deco.fillRect(left, top, S.WIDTH, height);
    // Kopierer-Rand und Kaffeefleck
    deco.fillStyle(CONFIG.COLORS.PAPER_SHADE, ST.COPY_EDGE_ALPHA);
    deco.fillRect(left, top, S.COPY_EDGE_W, height);
    deco.lineStyle(S.RING_WIDTH, ST.COFFEE, ST.COFFEE_ALPHA);
    deco.strokeCircle(left + S.WIDTH * S.RING_X, top + height * S.RING_Y, S.RING_RADIUS);
    const staple = this.add.rectangle(left + S.STAPLE_X, top + S.STAPLE_Y, S.STAPLE_W, S.STAPLE_H, ST.STAPLE)
      .setAngle(S.STAPLE_ANGLE);
    content.setPosition(left + S.PADDING, top + S.PADDING);
    sheet.add([deco, content, staple]);
    sheet.setAngle(S.ANGLE);
    this.sheet = sheet;
  }

  /**
   * Handschriftliche Randnotiz auf dem Merkblatt.
   * @param {Phaser.GameObjects.Container} content
   * @param {{x: number, y: number}} slot
   * @param {string} text
   * @param {string} color CSS-Farbe des Stifts
   * @returns {Phaser.GameObjects.Text}
   */
  addSheetNote(content, slot, text, color) {
    const S = Ch2ConfigScene.LAYOUT.SHEET;
    const note = UI.text(this, slot.x, slot.y, text, { font: 'HAND', size: S.NOTE_SIZE, color });
    note.setAngle(S.NOTE_ANGLE);
    content.add(note);
    return note;
  }

  /** Post-it mit Kennung und Passwort (aus GameState.getCredentials()). */
  buildCredentialNote() {
    const N = Ch2ConfigScene.LAYOUT.NOTE;
    const CSS = CONFIG.CSS;
    const note = Ch2Logic.getCredentialNote(GameState.getCredentials());
    const innerWidth = N.WIDTH - 2 * N.PADDING;
    const container = this.add.container(N.X + N.WIDTH / 2, N.Y + N.HEIGHT / 2).setDepth(CONFIG.DEPTH.CONTENT + 1);
    const left = -N.WIDTH / 2;
    const top = -N.HEIGHT / 2;
    container.add(this.add.rectangle(left + N.SHADOW, top + N.SHADOW, N.WIDTH, N.HEIGHT, CONFIG.COLORS.SHADOW,
      Ch2ConfigScene.STYLE.SHADOW_ALPHA).setOrigin(0));
    container.add(this.add.rectangle(left, top, N.WIDTH, N.HEIGHT, CONFIG.COLORS.POSTIT).setOrigin(0));

    const content = this.add.container(left + N.PADDING, top + N.PADDING);
    let y = 0;
    const title = UI.text(this, 0, y, note.title, { font: 'HAND', size: N.TITLE_SIZE, color: CSS.INK_MUTED });
    content.add(title);
    y += title.height + N.LINE_GAP;
    note.lines.forEach((line) => {
      const text = UI.text(this, 0, y, line, {
        font: 'HAND', size: N.TEXT_SIZE, color: CSS.INK, wrap: innerWidth, lineSpacing: N.LINE_SPACING,
      });
      content.add(text);
      y += text.height + N.LINE_GAP;
    });
    const foot = UI.text(this, 0, y, note.footnote, { font: 'HAND', size: N.FOOT_SIZE, color: CSS.INK_MUTED, wrap: innerWidth });
    content.add(foot);
    y += foot.height;
    // Sehr lange Passwörter (Kapitel 1): Text einpassen statt abschneiden
    const available = N.HEIGHT - 2 * N.PADDING;
    if (y > available) content.setScale(available / y);
    container.add(content);
    container.setAngle(N.ANGLE);
    this.credentialNote = container;
  }

  /**
   * Mitleids-Tipp als Zettel von Lea (ersetzt den vorigen Zettel).
   * @param {string} text klarer Hinweis aus Ch2Logic
   */
  showPityTip(text) {
    if (!text) return;
    const T = Ch2ConfigScene.LAYOUT.TIP;
    const CSS = CONFIG.CSS;
    if (this.tipContainer) this.tipContainer.destroy();
    this.pityTipText = text;
    const innerWidth = T.WIDTH - 2 * T.PADDING;
    const author = UI.text(this, 0, 0, Ch2Logic.getTipAuthor(CAMPUS), { font: 'HAND', size: T.AUTHOR_SIZE, color: CSS.INK_MUTED });
    const body = UI.text(this, 0, author.height + T.AUTHOR_GAP, text, {
      font: 'HAND', size: T.TEXT_SIZE, color: CSS.INK, wrap: innerWidth, lineSpacing: T.LINE_SPACING,
    });
    const contentHeight = body.y + body.height;
    const height = Phaser.Math.Clamp(Math.ceil(contentHeight + 2 * T.PADDING), T.MIN_HEIGHT, T.MAX_HEIGHT);
    const top = T.BOTTOM - height;

    const container = this.add.container(T.X + T.WIDTH / 2, top + height / 2).setDepth(CONFIG.DEPTH.CONTENT + 2);
    const left = -T.WIDTH / 2;
    const upper = -height / 2;
    container.add(this.add.rectangle(left + T.SHADOW, upper + T.SHADOW, T.WIDTH, height, CONFIG.COLORS.SHADOW,
      Ch2ConfigScene.STYLE.SHADOW_ALPHA).setOrigin(0));
    container.add(this.add.rectangle(left, upper, T.WIDTH, height, Ch2ConfigScene.STYLE.TIP_PAPER).setOrigin(0));
    const content = this.add.container(left + T.PADDING, upper + T.PADDING, [author, body]);
    const available = height - 2 * T.PADDING;
    if (contentHeight > available) content.setScale(available / contentHeight);
    container.add(content);
    container.setAngle(T.ANGLE);
    this.tipContainer = container;

    UI.sound('notify');
    container.setScale(T.POP_SCALE).setAlpha(0);
    this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: T.POP_MS, ease: 'Back.easeOut' });
  }

  /** Lerneffekt nach dem Verbinden: veraltete Zeilen rot durchstreichen und korrigieren. */
  showSheetCorrections({ animate = true } = {}) {
    if (this.hasShownCorrections) return;
    this.hasShownCorrections = true;
    const S = Ch2ConfigScene.LAYOUT.SHEET;
    this.sheetData.corrections.forEach((correction, index) => {
      const line = this.sheetLines[correction.anchor];
      const slot = this.sheetSlots[correction.anchor];
      if (!line || !slot) return;
      const strike = this.add.rectangle(line.x, line.y + line.height / 2, line.width, S.STRIKE_HEIGHT, CONFIG.COLORS.DHBW_RED)
        .setOrigin(0, 0.5);
      const text = UI.text(this, slot.x, slot.y, `→ ${correction.text}`, { font: 'HAND', size: S.NOTE_SIZE, color: CONFIG.CSS.DHBW_RED });
      text.setAngle(S.NOTE_ANGLE);
      this.sheetContent.add([strike, text]);
      const oldNote = this.sheetNotes[correction.anchor];
      if (!animate) {
        if (oldNote) oldNote.setVisible(false);
        return;
      }
      const delay = index * S.CORRECTION_STAGGER_MS;
      strike.setScale(0, 1);
      text.setAlpha(0);
      this.tweens.add({ targets: strike, scaleX: 1, duration: S.STRIKE_MS, delay, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: text, alpha: 1, duration: S.CORRECTION_FADE_MS, delay: delay + S.STRIKE_MS / 2 });
      if (oldNote) this.tweens.add({ targets: oldNote, alpha: 0, duration: S.CORRECTION_FADE_MS, delay });
    });
  }

  // ===========================================================================
  // Handy und Seiten
  // ===========================================================================

  buildPhone() {
    const P = Ch2ConfigScene.LAYOUT.PHONE;
    this.phone = new UI.Phone(this, P.X, P.Y, { width: P.WIDTH, height: P.HEIGHT, battery: P.BATTERY });
    this.phone.setDepth(CONFIG.DEPTH.CONTENT + 1);
    this.phone.setWifiState('off');
    const area = this.phone.getScreenArea();
    this.screenWidth = area.width;
    this.screenHeight = area.height;
  }

  /** Alte Seite abbauen (Widgets räumen ihre Listener selbst ab). */
  clearPage() {
    ChapterScene.safely(() => UI.Dropdown.closeAll(this));
    UI.TextInput.blurAll(this);
    if (this.page) this.page.destroy();
    this.page = this.add.container(0, 0);
    this.phone.screen.add(this.page);
    this.fields = {};
    this.fieldLabels = {};
    this.targets = {};
    this.eduroamRow = null;
    this.keyboardBar = null;
  }

  /** Weißer Seitenhintergrund (deckt den ganzen Handy-Bildschirm). */
  addPageBackground() {
    this.page.add(this.add.rectangle(0, 0, this.screenWidth, this.screenHeight, CONFIG.COLORS.SURFACE).setOrigin(0));
  }

  /** Text auf der aktuellen Seite (lokale Koordinaten). */
  pageText(x, y, str, opts = {}) {
    const text = UI.text(this, x, y, str, opts);
    this.page.add(text);
    return text;
  }

  /** Widget/Objekt auf die aktuelle Seite legen. */
  addToPage(obj) {
    this.page.add(obj);
    return obj;
  }

  /** Merkt sich ein Klickziel (lokal) für getDebugInfo().targets. */
  setTarget(name, x, y, width, height) {
    this.targets[name] = { x, y, width, height };
  }

  /**
   * Klickfläche (Rectangle als Kind, Klick zählt beim Loslassen auf derselben Fläche).
   * @returns {Phaser.GameObjects.Rectangle}
   */
  addTapZone(x, y, width, height, onTap, { color = CONFIG.COLORS.SURFACE, hoverColor = CONFIG.COLORS.SURFACE_ALT, alpha = 1 } = {}) {
    const zone = this.add.rectangle(x, y, width, height, color, alpha).setOrigin(0);
    zone.setInteractive({ useHandCursor: true });
    zone.baseColor = color; // änderbar (z. B. Tastatur-Leiste wird gelb)
    let isPressed = false;
    zone.on('pointerover', () => zone.setFillStyle(hoverColor, alpha));
    zone.on('pointerout', () => {
      isPressed = false;
      zone.setFillStyle(zone.baseColor, alpha);
    });
    zone.on('pointerdown', (pointer) => {
      if (!pointer || pointer.button === 0) isPressed = true;
    });
    zone.on('pointerup', () => {
      if (!isPressed) return;
      isPressed = false;
      onTap();
    });
    this.page.add(zone);
    return zone;
  }

  /** WLAN-Fächer (Textures.drawWifiFan, sonst Balken). cy = Spitze unten. */
  drawWifiIcon(g, cx, cy, radius, level, color) {
    const emptyAlpha = Ch2ConfigScene.STYLE.WIFI_EMPTY_ALPHA;
    if (typeof Textures !== 'undefined' && typeof Textures.drawWifiFan === 'function') {
      Textures.drawWifiFan(g, cx, cy, radius, level, color, emptyAlpha);
      return;
    }
    const bars = Ch2ConfigScene.STYLE.WIFI_FALLBACK;
    for (let i = 0; i < bars.BARS; i++) {
      const h = (radius * (i + 1)) / bars.BARS;
      g.fillStyle(color, i < level ? 1 : emptyAlpha);
      g.fillRect(cx - radius * bars.START + i * radius * bars.STEP, cy - h, radius * bars.WIDTH, h);
    }
  }

  /** Kleines Icon (Textur, falls vorhanden) – sonst null. */
  addIcon(key, x, y, scale, tint) {
    if (!this.textures.exists(key)) return null;
    const icon = this.add.image(x, y, key).setScale(scale).setTint(tint);
    this.page.add(icon);
    return icon;
  }

  /** Farbe einer Statuszeile. */
  statusColor(status) {
    const S = Ch2Logic.STATUS;
    if (status === S.AUTH_PROBLEM || status === S.DOMAIN_MISMATCH) return CONFIG.CSS.DANGER;
    if (status === S.SAVED || !status) return CONFIG.CSS.TEXT_MUTED;
    return CONFIG.CSS.PRIMARY;
  }

  // ---------------------------------------------------------------- WLAN-Liste

  showListPage() {
    const L = Ch2ConfigScene.LAYOUT.LIST;
    const pad = Ch2ConfigScene.LAYOUT.SCREEN.PAD;
    const W = this.screenWidth;
    const CSS = CONFIG.CSS;
    this.clearPage();
    this.pageName = Ch2ConfigScene.PAGE.LIST;
    this.addPageBackground();

    this.pageText(pad, L.TITLE_Y, Ch2Logic.TEXTS.WIFI_TITLE, { size: L.TITLE_SIZE, bold: true });
    // „WLAN verwenden“ mit Schalter (an – sonst wäre es ja zu einfach)
    const toggle = this.add.graphics();
    toggle.fillStyle(Ch2ConfigScene.STYLE.TOGGLE_BG, 1);
    toggle.fillRoundedRect(L.TOGGLE_INSET, L.TOGGLE_Y, W - 2 * L.TOGGLE_INSET, L.TOGGLE_H, L.TOGGLE_RADIUS);
    const switchX = W - pad - L.SWITCH_W;
    const switchY = L.TOGGLE_Y + (L.TOGGLE_H - L.SWITCH_H) / 2;
    toggle.fillStyle(CONFIG.COLORS.PRIMARY, 1);
    toggle.fillRoundedRect(switchX, switchY, L.SWITCH_W, L.SWITCH_H, L.SWITCH_H / 2);
    toggle.fillStyle(CONFIG.COLORS.WHITE, 1);
    toggle.fillCircle(switchX + L.SWITCH_W - L.SWITCH_H / 2, switchY + L.SWITCH_H / 2, L.SWITCH_H / 2 - L.SWITCH_KNOB_INSET);
    this.addToPage(toggle);
    this.pageText(L.TOGGLE_TEXT_X, L.TOGGLE_Y + L.TOGGLE_H / 2, Ch2Logic.TEXTS.WIFI_TOGGLE, {
      size: L.TOGGLE_TEXT_SIZE, origin: { x: 0, y: 0.5 },
    });
    this.pageText(pad, L.SECTION_Y, Ch2Logic.TEXTS.AVAILABLE, { size: L.SECTION_SIZE, bold: true, color: CSS.PRIMARY });

    Ch2Logic.getNetworks(CAMPUS).forEach((network, index) => {
      this.addNetworkRow(network, L.ROWS_Y + index * L.ROW_H);
    });

    // Hinweis-Karte: App „easyroam“ (Catch-22: braucht Internet)
    const card = this.add.graphics();
    card.fillStyle(CONFIG.COLORS.SURFACE_ALT, 1);
    card.fillRoundedRect(L.TOGGLE_INSET, L.CARD_Y, W - 2 * L.TOGGLE_INSET, L.CARD_H, L.CARD_RADIUS);
    this.addToPage(card);
    this.pageText(pad, L.CARD_Y + L.CARD_TEXT_Y, Ch2Logic.TEXTS.PLAY_STORE_CARD, {
      size: L.CARD_TEXT_SIZE, color: CSS.TEXT_MUTED, wrap: W - 2 * pad,
    });
    const linkY = L.CARD_Y + L.CARD_H - L.LINK_H - L.LINK_BOTTOM;
    const link = new UI.Button(this, L.LINK_X, linkY, {
      text: Ch2Logic.TEXTS.PLAY_STORE_BUTTON, variant: 'link', width: 'auto', height: L.LINK_H, fontSize: L.LINK_SIZE,
      onClick: () => this.handlePlayStore(),
    });
    this.addToPage(link);
    this.setTarget('playStore', L.LINK_X, linkY, link.width || W / 2, L.LINK_H);
  }

  /** Eine Zeile der WLAN-Liste. */
  addNetworkRow(network, y) {
    const L = Ch2ConfigScene.LAYOUT.LIST;
    const W = this.screenWidth;
    const isEduroam = network.id === 'eduroam';
    this.addTapZone(0, y, W, L.ROW_H, () => this.handleNetworkTap(network));
    this.setTarget(network.id, 0, y, W, L.ROW_H);

    const fan = this.add.graphics();
    const level = isEduroam && this.step === Ch2ConfigScene.STEP.CONNECTED ? 4 : network.level;
    this.drawWifiIcon(fan, L.ICON_CX, y + L.ROW_H / 2 + L.ICON_RADIUS * L.ICON_DROP, L.ICON_RADIUS, level, Ch2ConfigScene.STYLE.ICON);
    this.addToPage(fan);

    const status = isEduroam ? this.eduroamStatus : '';
    const ssidY = status ? y + L.SSID_Y : y + L.ROW_H / 2;
    this.pageText(L.TEXT_X, ssidY, network.ssid, {
      size: L.SSID_SIZE, bold: isEduroam, origin: status ? { x: 0, y: 0 } : { x: 0, y: 0.5 },
    });
    const rightX = W - L.RIGHT_ICON_INSET;
    if (isEduroam) {
      const statusText = this.pageText(L.TEXT_X, y + L.STATUS_Y, status, { size: L.STATUS_SIZE, color: this.statusColor(status) });
      this.eduroamRow = { y, statusText, spinner: null, lock: null };
    }
    // Rechts: Zahnrad beim gespeicherten Profil, sonst Schloss bei gesicherten Netzen
    const iconKey = isEduroam && !this.isOldProfileRemoved ? 'icon-gear' : 'icon-lock';
    if (network.isSecured) {
      const icon = this.addIcon(iconKey, rightX, y + L.ROW_H / 2, L.RIGHT_ICON_SCALE, Ch2ConfigScene.STYLE.ICON_MUTED);
      if (isEduroam) this.eduroamRow.lock = icon;
    }
    if (isEduroam && this.isBusy && this.step === Ch2ConfigScene.STEP.CONNECTING) this.startRowSpinner();
  }

  /** Statuszeile von eduroam aktualisieren (ohne die Seite neu zu bauen). */
  setEduroamStatus(status) {
    this.eduroamStatus = status;
    if (this.eduroamRow && this.eduroamRow.statusText && this.eduroamRow.statusText.scene) {
      this.eduroamRow.statusText.setText(status).setColor(this.statusColor(status));
    }
  }

  startRowSpinner() {
    if (!this.eduroamRow || this.eduroamRow.spinner) return;
    const L = Ch2ConfigScene.LAYOUT.LIST;
    const x = this.screenWidth - L.RIGHT_ICON_INSET - L.SPINNER_SIZE / 2;
    const spinner = new UI.Spinner(this, x, this.eduroamRow.y + (L.ROW_H - L.SPINNER_SIZE) / 2, {
      size: L.SPINNER_SIZE, thickness: L.SPINNER_THICKNESS,
    });
    this.addToPage(spinner);
    if (this.eduroamRow.lock) this.eduroamRow.lock.setVisible(false);
    this.eduroamRow.spinner = spinner;
  }

  stopRowSpinner() {
    if (!this.eduroamRow || !this.eduroamRow.spinner) return;
    this.eduroamRow.spinner.destroy();
    this.eduroamRow.spinner = null;
    if (this.eduroamRow.lock) this.eduroamRow.lock.setVisible(true);
  }

  /** Tipp auf ein Netz der Liste. */
  handleNetworkTap(network) {
    if (this.isFinished || this.isBusy) return;
    UI.sound('click');
    if (network.id !== 'eduroam') {
      this.handleNeighbourNetwork(network);
      return;
    }
    if (!this.isOldProfileRemoved) {
      if (this.step === Ch2ConfigScene.STEP.START) this.startOldProfileAttempt({ isFirstContact: true });
      else this.showDetailsPage();
      return;
    }
    this.showConfigPage();
  }

  /** Nachbarnetze: Witz als Toast bzw. Systemdialog (Gast-Portal kostet einmal Zeit). */
  handleNeighbourNetwork(network) {
    const reaction = network.reaction;
    if (!reaction) return;
    if (reaction.kind === 'modal') {
      this.dismissToasts();
      this.showModal({
        title: reaction.title, text: reaction.text, icon: 'info', closeOnBackdrop: true,
        buttons: [{ text: 'OK', variant: 'primary' }],
      });
      if (reaction.minutes && !this.penalizedReactions.has(network.id)) {
        this.penalizedReactions.add(network.id);
        this.penalty(reaction.minutes, reaction.reason, this.feedbackPosition({ isAboveModal: true }));
      }
      return;
    }
    // Immer nur ein Nachbar-Witz gleichzeitig – sonst stapeln sich die Toasts über das Handy
    if (this.neighbourToast && this.neighbourToast.scene) this.neighbourToast.dismiss();
    this.neighbourToast = this.toast(reaction.text);
  }

  /** Alle Toasts ausblenden (vor Systemdialogen: Toasts liegen laut Vertrag über Modals). */
  dismissToasts() {
    ChapterScene.safely(() => {
      if (UI.Toast && typeof UI.Toast.dismissAll === 'function') UI.Toast.dismissAll(this);
    });
    this.neighbourToast = null;
  }

  /** Play Store: Catch-22 – die Einrichtungs-App braucht Internet. */
  handlePlayStore() {
    if (this.isFinished || this.isBusy) return;
    this.dismissToasts();
    this.showModal({
      title: Ch2Logic.TEXTS.PLAY_STORE_TITLE,
      text: Ch2Logic.TEXTS.PLAY_STORE_TEXT,
      icon: 'error',
      closeOnBackdrop: true,
      buttons: [{ text: Ch2Logic.TEXTS.PLAY_STORE_OK, variant: 'primary' }],
    });
    if (!this.penalizedReactions.has('playStore')) {
      this.penalizedReactions.add('playStore');
      this.penalty(Ch2Logic.BALANCE.PLAY_STORE_MINUTES, 'Play Store versucht es trotzdem', this.feedbackPosition({ isAboveModal: true }));
    }
  }

  // ---------------------------------------------------------------- Detailseite (altes Profil)

  showDetailsPage() {
    const D = Ch2ConfigScene.LAYOUT.DETAILS;
    const pad = Ch2ConfigScene.LAYOUT.SCREEN.PAD;
    const W = this.screenWidth;
    const CSS = CONFIG.CSS;
    const profile = Ch2Logic.getOldProfile(CAMPUS);
    this.clearPage();
    this.pageName = Ch2ConfigScene.PAGE.DETAILS;
    this.addPageBackground();
    this.setObjective(Ch2Logic.OBJECTIVES.OLD_PROFILE_DETAILS);

    const back = new UI.Button(this, D.BACK_X, D.BACK_Y, {
      text: `‹ ${Ch2Logic.TEXTS.BACK}`, variant: 'ghost', width: D.BACK_W, height: D.BACK_H, fontSize: D.BACK_SIZE,
      onClick: () => this.showListPage(),
    });
    this.addToPage(back);
    this.setTarget('back', D.BACK_X, D.BACK_Y, D.BACK_W, D.BACK_H);

    const fan = this.add.graphics();
    this.drawWifiIcon(fan, W / 2, D.ICON_Y, D.ICON_RADIUS, Ch2ConfigScene.LAYOUT.PHONE.WIFI_LEVEL, Ch2ConfigScene.STYLE.ICON_MUTED);
    this.addToPage(fan);
    this.pageText(W / 2, D.TITLE_Y, profile.ssid, { size: D.TITLE_SIZE, bold: true, origin: { x: 0.5, y: 0 } });
    this.pageText(W / 2, D.STATUS_Y, this.eduroamStatus, {
      size: D.STATUS_SIZE, color: this.statusColor(this.eduroamStatus), origin: { x: 0.5, y: 0 },
    });

    const removeButton = new UI.Button(this, pad, D.BUTTONS_Y, {
      text: Ch2Logic.TEXTS.DETAILS_REMOVE, variant: 'secondary', width: D.BUTTON_W, height: D.BUTTON_H, fontSize: D.BUTTON_SIZE,
      onClick: () => this.handleRemoveOldProfile(),
    });
    const connectX = W - pad - D.BUTTON_W;
    const connectButton = new UI.Button(this, connectX, D.BUTTONS_Y, {
      text: Ch2Logic.TEXTS.DETAILS_CONNECT, variant: 'primary', width: D.BUTTON_W, height: D.BUTTON_H, fontSize: D.BUTTON_SIZE,
      onClick: () => this.startOldProfileAttempt({ isFirstContact: false }),
    });
    this.addToPage(removeButton);
    this.addToPage(connectButton);
    this.setTarget('remove', pad, D.BUTTONS_Y, D.BUTTON_W, D.BUTTON_H);
    this.setTarget('connect', connectX, D.BUTTONS_Y, D.BUTTON_W, D.BUTTON_H);

    this.addToPage(this.add.rectangle(pad, D.DIVIDER_Y, W - 2 * pad, 1, Ch2ConfigScene.STYLE.DIVIDER).setOrigin(0));
    let y = D.ROWS_Y;
    profile.rows.forEach((row) => {
      const label = this.pageText(pad, y, row.label, { size: D.LABEL_SIZE, color: CSS.TEXT_MUTED });
      const value = this.pageText(pad, y + label.height + D.VALUE_GAP, row.value, { size: D.VALUE_SIZE, wrap: W - 2 * pad });
      y = value.y + value.height + D.ROW_GAP;
    });
    this.pageText(pad, y, Ch2Logic.TEXTS.OLD_PROFILE_EXPLAIN, {
      size: D.EXPLAIN_SIZE, italic: true, color: CSS.TEXT_MUTED, wrap: W - 2 * pad,
    });
  }

  /** „Entfernen“: Android vergisst das alte Profil endlich. */
  handleRemoveOldProfile() {
    if (this.isFinished || this.isBusy) return;
    this.isOldProfileRemoved = true;
    this.step = Ch2ConfigScene.STEP.SETUP;
    this.eduroamStatus = '';
    UI.sound('whoosh');
    this.toast(Ch2Logic.TEXTS.OLD_PROFILE_REMOVED);
    this.showListPage();
    this.setObjective(Ch2Logic.OBJECTIVES.SETUP);
  }

  // ---------------------------------------------------------------- Dialog „eduroam“

  showConfigPage() {
    const C = Ch2ConfigScene.LAYOUT.CONFIG;
    const pad = Ch2ConfigScene.LAYOUT.SCREEN.PAD;
    const W = this.screenWidth;
    const H = this.screenHeight;
    const CSS = CONFIG.CSS;
    const options = Ch2Logic.getOptions(CAMPUS);
    this.clearPage();
    this.pageName = Ch2ConfigScene.PAGE.CONFIG;
    if (this.step === Ch2ConfigScene.STEP.SETUP) this.step = Ch2ConfigScene.STEP.CONFIG;
    this.addPageBackground();
    this.setObjective(this.configAttempts > 0 ? Ch2Logic.OBJECTIVES.RETRY : Ch2Logic.OBJECTIVES.CONFIG);

    // Kopfzeile: SSID links, Sicherheitstyp rechts daneben (spart eine Zeile)
    const title = this.pageText(pad, C.TITLE_Y, CAMPUS.wifi.ssid, { size: C.TITLE_SIZE, bold: true });
    this.pageText(W - pad, C.TITLE_Y + title.height / 2, CAMPUS.wifi.security, {
      size: C.SUBTITLE_SIZE, color: CSS.TEXT_MUTED, origin: { x: 1, y: 0.5 },
    });

    const fullWidth = W - 2 * pad;
    const rowY = (index) => C.ROW_Y + index * C.ROW_PITCH;
    const phaseX = pad + C.EAP_WIDTH + C.COLUMN_GAP;

    // Zeile 0: EAP-Methode | Phase 2 (nebeneinander), danach je ein Feld pro Zeile
    this.addDropdownField('eapMethod', pad, rowY(0), C.EAP_WIDTH, options.eapMethod);
    this.addDropdownField('phase2', phaseX, rowY(0), W - pad - phaseX, options.phase2);
    this.addDropdownField('caCert', pad, rowY(1), fullWidth, options.caCert);
    this.addDropdownField('ocsp', pad, rowY(2), fullWidth, options.ocsp);
    this.addInputField('domain', pad, rowY(3), fullWidth, {});
    this.addInputField('identity', pad, rowY(4), fullWidth, {});
    this.addInputField('anonymousIdentity', pad, rowY(5), fullWidth, { placeholder: Ch2Logic.TEXTS.OPTIONAL_PLACEHOLDER });
    this.addInputField('password', pad, rowY(6), fullWidth, { password: true, showToggle: true });

    // Pflicht-Hinweis (Konvention) direkt unter dem Passwort
    const noticeY = rowY(6) + C.LABEL_H + C.FIELD_H + C.NOTICE_GAP;
    const notice = this.pageText(pad, noticeY, Ch2Logic.TEXTS.NO_REAL_CREDENTIALS, {
      size: C.NOTICE_SIZE, italic: true, color: CSS.TEXT_MUTED, wrap: fullWidth, lineSpacing: C.NOTICE_LINE_SPACING,
    });

    // Buttons unter dem Hinweis (rücken nach unten, falls der Hinweis höher ausfällt)
    const buttonsY = Math.max(C.BUTTONS_Y, Math.ceil(notice.y + notice.height + C.BUTTONS_MIN_GAP));
    const connectX = W - pad - C.CONNECT_W;
    const cancelX = connectX - C.BUTTON_GAP - C.CANCEL_W;
    const cancel = new UI.Button(this, cancelX, buttonsY, {
      text: Ch2Logic.TEXTS.DIALOG_CANCEL, variant: 'ghost', width: C.CANCEL_W, height: C.BUTTON_H, fontSize: C.BUTTON_FONT,
      onClick: () => this.handleCancelConfig(),
    });
    const connect = new UI.Button(this, connectX, buttonsY, {
      text: Ch2Logic.TEXTS.DIALOG_CONNECT, variant: 'primary', width: C.CONNECT_W, height: C.BUTTON_H, fontSize: C.BUTTON_FONT,
      onClick: () => this.handleConnectPressed(),
    });
    this.addToPage(cancel);
    this.addToPage(connect);
    this.setTarget('cancel', cancelX, buttonsY, C.CANCEL_W, C.BUTTON_H);
    this.setTarget('connect', connectX, buttonsY, C.CONNECT_W, C.BUTTON_H);

    // Tastatur-Leiste (simuliert die Sprachumschaltung von Gboard)
    const barY = H - C.KEYBOARD_H;
    const bar = this.addTapZone(0, barY, W, C.KEYBOARD_H, () => this.handleKeyboardToggle(), {
      color: CONFIG.COLORS.SURFACE_ALT, hoverColor: CONFIG.COLORS.BORDER,
    });
    const barText = this.pageText(W / 2, barY + C.KEYBOARD_H / 2, '', { size: C.KEYBOARD_SIZE, bold: true, origin: 0.5 });
    this.keyboardBar = { zone: bar, text: barText };
    this.setTarget('keyboard', 0, barY, W, C.KEYBOARD_H);
    this.refreshKeyboardBar();
  }

  /**
   * Beschriftung über einem Feld (Android-Stil: grau, beim Bearbeiten blau). Ein Feldfehler
   * ersetzt die Beschriftung in Rot, dazu bekommt das Feld einen roten Rahmen (siehe
   * refreshFieldLabel). Die Widgets selbst bleiben ohne eigenes Label.
   */
  addFieldLabel(field, x, y, width) {
    const C = Ch2ConfigScene.LAYOUT.CONFIG;
    const text = this.pageText(x, y, Ch2Logic.FIELD_LABELS[field], { size: C.LABEL_SIZE, color: CONFIG.CSS.TEXT_MUTED });
    this.fieldLabels[field] = { text, outline: null, isActive: false, x, fieldY: y + C.LABEL_H, width };
  }

  /** Beschriftung und Fehlerrahmen eines Feldes an Fokus und Feldfehler anpassen. */
  refreshFieldLabel(field) {
    const C = Ch2ConfigScene.LAYOUT.CONFIG;
    const entry = this.fieldLabels[field];
    if (!entry || !entry.text.scene || !this.page) return;
    const error = this.fieldErrors[field] || null;
    let color = CONFIG.CSS.TEXT_MUTED;
    if (error) color = CONFIG.CSS.DANGER;
    else if (entry.isActive) color = CONFIG.CSS.PRIMARY;
    entry.text.setText(error || Ch2Logic.FIELD_LABELS[field]);
    entry.text.setColor(color);
    entry.text.setFontStyle(error ? 'bold' : 'normal');

    if (error && !entry.outline) {
      const line = C.ERROR_OUTLINE;
      const outline = this.add.graphics();
      outline.lineStyle(line, CONFIG.COLORS.DANGER, 1);
      outline.strokeRoundedRect(entry.x + line / 2, entry.fieldY + line / 2, entry.width - line, C.FIELD_H - line, C.FIELD_RADIUS);
      this.addToPage(outline); // über dem Widget, nicht klickbar
      entry.outline = outline;
    } else if (!error && entry.outline) {
      entry.outline.destroy();
      entry.outline = null;
    }
  }

  /** Feld wird bearbeitet (Fokus bzw. offene Liste) → Beschriftung blau. */
  setFieldActive(field, isActive) {
    const entry = this.fieldLabels[field];
    if (!entry || entry.isActive === isActive) return;
    entry.isActive = isActive;
    this.refreshFieldLabel(field);
  }

  addDropdownField(field, x, y, width, options) {
    const C = Ch2ConfigScene.LAYOUT.CONFIG;
    this.addFieldLabel(field, x, y, width);
    const fieldY = y + C.LABEL_H;
    const dropdown = new UI.Dropdown(this, x, fieldY, {
      width, height: C.FIELD_H, options, value: this.configValues[field], fontSize: C.FIELD_FONT,
      placeholder: Ch2Logic.TEXTS.SELECT_PLACEHOLDER,
      onChange: (value) => this.handleFieldChange(field, value),
    });
    dropdown.on('open', () => this.setFieldActive(field, true));
    dropdown.on('close', () => this.setFieldActive(field, false));
    this.addToPage(dropdown);
    this.fields[field] = dropdown;
    this.setTarget(field, x, fieldY, width, C.FIELD_H);
    this.refreshFieldLabel(field);
    return dropdown;
  }

  addInputField(field, x, y, width, { placeholder = '', password = false, showToggle = false } = {}) {
    const C = Ch2ConfigScene.LAYOUT.CONFIG;
    this.addFieldLabel(field, x, y, width);
    const fieldY = y + C.LABEL_H;
    const input = new UI.TextInput(this, x, fieldY, {
      width, height: C.FIELD_H, fontSize: C.FIELD_FONT, value: this.configValues[field] || '',
      placeholder, password, showToggle, maxLength: C.MAX_LENGTH,
      transformChar: (char, value, inputField) => this.transformTypedChar(field, char, value, inputField),
      onChange: (value) => this.handleFieldChange(field, value),
      onFocus: () => this.handleFieldFocus(field),
      onBlur: () => this.setFieldActive(field, false),
      onSubmit: field === 'password' ? () => this.handleConnectPressed() : null,
    });
    this.addToPage(input);
    this.fields[field] = input;
    this.setTarget(field, x, fieldY, width, C.FIELD_H);
    this.refreshFieldLabel(field);
    return input;
  }

  handleFieldChange(field, value) {
    this.configValues[field] = value;
    if (this.fieldErrors[field]) {
      delete this.fieldErrors[field];
      this.refreshFieldLabel(field);
    }
  }

  /** Fokus auf ein Eingabefeld; Troll 1: beim ersten Fokus aufs Passwort springt die Tastatur auf English (US). */
  handleFieldFocus(field) {
    this.setFieldActive(field, true);
    if (field !== 'password' || this.hasKeyboardTrolled || this.isFinished) return;
    this.hasKeyboardTrolled = true;
    this.setKeyboardLayout(Ch2Logic.KEYBOARD.EN);
    this.toast(Ch2Logic.TEXTS.KEYBOARD_SWITCHED, { variant: 'warning' });
  }

  /**
   * Jedes getippte Zeichen: aktives Tastaturlayout, dann (einmalig) die Autokorrektur.
   * @returns {string} einzufügender Text
   */
  transformTypedChar(field, char, value, inputField) {
    const typed = Ch2Logic.mapKey(char, this.keyboardLayout);
    if (this.hasAutocorrected || (field !== 'identity' && field !== 'anonymousIdentity')) return typed;
    const caret = inputField && Number.isInteger(inputField.caret) ? inputField.caret : value.length;
    const correction = Ch2Logic.autocorrect(typed, value.slice(0, caret));
    if (!correction) return typed;
    this.hasAutocorrected = true;
    this.handleAutocorrect(inputField);
    return correction;
  }

  /** Troll 2: Autokorrektur sichtbar machen (Text springt, Hinweis schwebt lesbar lange über dem Feld). */
  handleAutocorrect(inputField) {
    const F = Ch2ConfigScene.LAYOUT.FEEDBACK;
    UI.sound('notify');
    ChapterScene.safely(() => {
      const target = this.getWorldTarget(inputField === this.fields.identity ? 'identity' : 'anonymousIdentity');
      if (target) {
        FX.floatText(this, target.x, target.y + F.FLOAT_Y_OFFSET, Ch2Logic.TEXTS.AUTOCORRECT, {
          color: CONFIG.CSS.HAZARD, size: F.AUTOCORRECT_SIZE, duration: F.AUTOCORRECT_MS, rise: F.AUTOCORRECT_RISE,
        });
      }
    });
  }

  setKeyboardLayout(layout) {
    this.keyboardLayout = layout;
    this.refreshKeyboardBar({ pulse: true });
  }

  handleKeyboardToggle() {
    if (this.isFinished) return;
    const { DE, EN } = Ch2Logic.KEYBOARD;
    const next = this.keyboardLayout === EN ? DE : EN;
    this.setKeyboardLayout(next);
    this.toast(next === DE ? Ch2Logic.TEXTS.KEYBOARD_BACK : Ch2Logic.TEXTS.KEYBOARD_SWITCHED);
  }

  refreshKeyboardBar({ pulse = false } = {}) {
    if (!this.keyboardBar || !this.keyboardBar.text.scene) return;
    const isEn = this.keyboardLayout === Ch2Logic.KEYBOARD.EN;
    const { zone, text } = this.keyboardBar;
    zone.baseColor = isEn ? CONFIG.COLORS.HAZARD : CONFIG.COLORS.SURFACE_ALT;
    zone.setFillStyle(zone.baseColor, 1);
    text.setText(isEn ? Ch2Logic.TEXTS.KEYBOARD_LABEL_EN : Ch2Logic.TEXTS.KEYBOARD_LABEL_DE);
    text.setColor(isEn ? CONFIG.CSS.TEXT : CONFIG.CSS.TEXT_MUTED);
    if (pulse) ChapterScene.safely(() => FX.pulse(this, text, { scale: Ch2ConfigScene.LAYOUT.CONFIG.KEYBOARD_PULSE }));
  }

  handleCancelConfig() {
    if (this.isFinished || this.isBusy) return;
    this.showListPage();
    this.setObjective(this.configAttempts > 0 ? Ch2Logic.OBJECTIVES.RETRY_LIST : Ch2Logic.OBJECTIVES.SETUP);
  }

  // ===========================================================================
  // Verbinden
  // ===========================================================================

  /** Richtiges Passwort: aus Kapitel 1 bzw. CAMPUS.defaultPassword. */
  getExpectedPassword() {
    return GameState.getCredentials().password;
  }

  /** Android probiert das alte Profil (beim ersten Antippen von selbst). */
  startOldProfileAttempt({ isFirstContact }) {
    if (this.isFinished || this.isBusy) return;
    this.runConnection(Ch2Logic.OLD_PROFILE_RESULT, () => this.handleOldProfileResult(isFirstContact));
  }

  handleOldProfileResult(isFirstContact) {
    const result = Ch2Logic.OLD_PROFILE_RESULT;
    this.oldProfileAttempts += 1;
    this.step = Ch2ConfigScene.STEP.OLD_PROFILE;
    this.setObjective(Ch2Logic.OBJECTIVES.OLD_PROFILE_FAILED);
    const pos = this.feedbackPosition();
    if (isFirstContact) {
      // Kein Fehlversuch der Spielerin – das Handy war's. Ein bisschen Frust gibt's trotzdem.
      UI.sound('error');
      ChapterScene.safely(() => FX.floatText(this, pos.x, pos.y, Ch2Logic.pickExclamation(CAMPUS, this.rng()), {
        color: CONFIG.CSS.HAZARD,
      }));
      GameState.addFrustration(Ch2Logic.BALANCE.OLD_PROFILE_FIRST_CONTACT, Ch2Logic.TEXTS.FIRST_CONTACT);
      return;
    }
    const info = this.tracker.record(result.code);
    if (info.shouldShowTip) this.showPityTip(result.hint);
    const penalty = Ch2Logic.getPenalty(result);
    this.fail(penalty.reason, { frustration: penalty.frustration, minutes: penalty.minutes, stamp: null, shake: false, ...pos });
  }

  handleConnectPressed() {
    if (this.isFinished || this.isBusy) return;
    UI.TextInput.blurAll(this);
    const result = Ch2Logic.validateConfig(this.configValues, CAMPUS, { expectedPassword: this.getExpectedPassword() });
    this.configAttempts += 1;
    this.lastResult = result;
    this.runConnection(result, () => (result.ok ? this.handleConnected(result) : this.handleConfigFailed(result)));
  }

  /**
   * Zeigt die WLAN-Liste mit Statuszeilen und Spinner (Szenen-Zeit → pausierbar).
   * @param {object} result Prüfergebnis
   * @param {Function} onDone nach der letzten Statuszeile
   */
  runConnection(result, onDone) {
    this.isBusy = true;
    this.step = Ch2ConfigScene.STEP.CONNECTING;
    this.setObjective(Ch2Logic.OBJECTIVES.CONNECTING);
    const plan = Ch2Logic.getConnectionPlan(result, this.rng());
    this.eduroamStatus = plan.steps[0].status;
    this.showListPage();
    this.startRowSpinner();
    this.phone.setWifiState('connecting', Ch2ConfigScene.LAYOUT.PHONE.WIFI_LEVEL);

    let elapsed = 0;
    plan.steps.forEach((planStep, index) => {
      if (index > 0) this.schedule(elapsed, () => this.setEduroamStatus(planStep.status));
      elapsed += planStep.ms;
    });
    this.schedule(elapsed, () => {
      this.isBusy = false;
      this.stopRowSpinner();
      this.setEduroamStatus(plan.finalStatus);
      onDone();
    });
  }

  handleConfigFailed(result) {
    this.step = Ch2ConfigScene.STEP.CONFIG;
    this.phone.setWifiState('off');
    const fieldError = Ch2Logic.getFieldError(result.code);
    this.fieldErrors = fieldError ? { [result.field]: fieldError } : {};
    this.setObjective(Ch2Logic.OBJECTIVES.RETRY_LIST); // Spieler:in steht wieder in der WLAN-Liste
    const info = this.tracker.record(result.code);
    if (info.shouldShowTip) this.showPityTip(result.hint);

    const penalty = Ch2Logic.getPenalty(result, { stampsShown: this.stampsShown });
    if (penalty.stamp) {
      this.stampsShown += 1;
      ChapterScene.safely(() => this.phone.vibrate());
    }
    const pos = this.feedbackPosition({ isStamp: Boolean(penalty.stamp) });
    // Buchung zuletzt: addFrustration kann einen Rage-Quit auslösen
    this.fail(penalty.reason, {
      frustration: penalty.frustration, minutes: penalty.minutes, stamp: penalty.stamp, shake: Boolean(penalty.stamp), ...pos,
    });
  }

  handleConnected(result) {
    this.step = Ch2ConfigScene.STEP.CONNECTED;
    this.isBusy = true; // keine Eingaben mehr – nur noch feiern
    this.phone.setWifiState('no-internet', Ch2ConfigScene.LAYOUT.PHONE.WIFI_LEVEL);
    UI.sound('connect');
    this.showListPage();
    this.setObjective(Ch2Logic.OBJECTIVES.CONNECTED);
    this.toast(Ch2Logic.TEXTS.CONNECTED, { variant: 'success' });
    // Lerneffekt: ohne anonyme Identität geht die Kennung im Klartext durchs Netz
    if (result.notes && result.notes.length > 0) {
      this.toast(result.notes[0], { variant: 'warning', duration: Ch2ConfigScene.LAYOUT.NOTE_TOAST_MS });
    }
    if (this.configAttempts === 1) this.achievement('FIRST_TRY_CONFIG');
    if (result.isAnonymousIdentityCorrect) this.achievement('ANON_IDENTITY');
    this.showSheetCorrections();
    const stats = { configAttempts: this.configAttempts, anonymousIdentity: result.isAnonymousIdentityCorrect };
    this.schedule(Ch2ConfigScene.LAYOUT.SUCCESS_DELAY_MS, () => this.succeed(stats));
  }

  /** Szenen-Timer, der bei debugSolve abgebrochen werden kann. */
  schedule(ms, callback) {
    const timer = this.time.delayedCall(ms, () => {
      this.timers = this.timers.filter((entry) => entry !== timer);
      callback();
    });
    this.timers.push(timer);
    return timer;
  }

  cancelTimers() {
    this.timers.forEach((timer) => timer.remove(false));
    this.timers = [];
  }

  /** RNG für Wartezeiten (global, falls geladen). */
  rng() {
    return typeof RNG !== 'undefined' ? RNG : null;
  }

  /**
   * Effekt-Position über dem Handy: Stempel mittig, Texte an der eduroam-Zeile bzw. über einem
   * offenen Systemdialog (sonst verdeckt der Text den Dialog).
   */
  feedbackPosition({ isStamp = false, isAboveModal = false } = {}) {
    const P = Ch2ConfigScene.LAYOUT.PHONE;
    const L = Ch2ConfigScene.LAYOUT.LIST;
    const F = Ch2ConfigScene.LAYOUT.FEEDBACK;
    const x = P.X + P.WIDTH / 2;
    if (isStamp) return { x, y: F.STAMP_Y };
    if (isAboveModal) return { x, y: F.MODAL_PENALTY_Y };
    const area = this.phone.getScreenArea();
    return { x, y: area.y + L.ROWS_Y + F.FLOAT_Y_OFFSET };
  }

  // ===========================================================================
  // Debug & Tests
  // ===========================================================================

  /** Klickziel in Weltkoordinaten (Mitte) oder null. */
  getWorldTarget(name) {
    const rect = this.targets[name];
    if (!rect || !this.phone) return null;
    const area = this.phone.getScreenArea();
    return {
      x: Math.round(area.x + rect.x + rect.width / 2),
      y: Math.round(area.y + rect.y + rect.height / 2),
      width: rect.width,
      height: rect.height,
    };
  }

  /** Löst das Kapitel wie ein perfekter Spieler (ohne Erfolge zu vergeben). */
  debugSolve() {
    if (this.isFinished) return;
    this.cancelTimers();
    ChapterScene.safely(() => UI.Modal.closeAll(this));
    ChapterScene.safely(() => UI.Dropdown.closeAll(this));
    UI.TextInput.blurAll(this);
    this.isOldProfileRemoved = true;
    this.keyboardLayout = Ch2Logic.KEYBOARD.DE;
    const expectedPassword = this.getExpectedPassword();
    this.configValues = Ch2Logic.getSolution(CAMPUS, expectedPassword);
    this.fieldErrors = {};
    this.lastResult = Ch2Logic.validateConfig(this.configValues, CAMPUS, { expectedPassword });
    this.step = Ch2ConfigScene.STEP.CONNECTED;
    this.isBusy = true;
    this.eduroamStatus = Ch2Logic.STATUS.CONNECTED_NO_INTERNET;
    this.showListPage();
    this.phone.setWifiState('no-internet', Ch2ConfigScene.LAYOUT.PHONE.WIFI_LEVEL);
    this.setObjective(Ch2Logic.OBJECTIVES.CONNECTED);
    this.showSheetCorrections({ animate: false });
    this.succeed({ solvedBy: 'debug', configAttempts: this.configAttempts });
  }

  /** Zustand für Tests (inkl. Klickziele der aktuellen Handy-Seite in Weltkoordinaten). */
  getDebugInfo() {
    const targets = {};
    Object.keys(this.targets || {}).forEach((name) => {
      targets[name] = this.getWorldTarget(name);
    });
    const config = { ...(this.configValues || {}) };
    const passwordLength = (config.password || '').length;
    delete config.password;
    return {
      ...super.getDebugInfo(),
      step: this.step,
      page: this.pageName,
      isBusy: Boolean(this.isBusy),
      eduroamStatus: this.eduroamStatus,
      isOldProfileRemoved: Boolean(this.isOldProfileRemoved),
      oldProfileAttempts: this.oldProfileAttempts || 0,
      configAttempts: this.configAttempts || 0,
      stampsShown: this.stampsShown || 0,
      keyboardLayout: this.keyboardLayout,
      hasKeyboardTrolled: Boolean(this.hasKeyboardTrolled),
      hasAutocorrected: Boolean(this.hasAutocorrected),
      fieldErrors: { ...(this.fieldErrors || {}) },
      lastResult: this.lastResult
        ? { ok: this.lastResult.ok, code: this.lastResult.code, field: this.lastResult.field, message: this.lastResult.message }
        : null,
      pityTip: this.pityTipText || null,
      config,
      passwordLength,
      targets,
    };
  }
}
