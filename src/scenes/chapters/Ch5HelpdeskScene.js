/**
 * Ch5HelpdeskScene.js – Kapitel 5 „Der IT-Helpdesk“: Bosskampf gegen das Ticketsystem.
 *
 * Links ein Browserfenster (Bibliotheks-PC, Gastsitzung) mit dem Ticketsystem des
 * IT.Service Centers: erst das Support-Formular (Kategorie, „Zuständiges Sekretariat“,
 * Beschreibung), dann der Chat mit Herrn Häberle (1st Level), die Warteschleife mit
 * Musik und Herr Pfleiderer (2nd Level). Der Balken „Ticket-Status“ ist die Boss-HP:
 * richtige Antworten bringen das Ticket voran, falsche kosten Frust (und lehren nebenbei,
 * wie eduroam richtig geht). Parallel prasseln Pop-ups herein, die per kleinem × weg
 * müssen – die großen bunten Knöpfe sind Fallen. Finale: „Haben Sie es schon mit Aus- und
 * wieder Einschalten versucht?“ → Power-Taste am Handy lange drücken → „Neu starten“.
 *
 * Rechts das Handy (UI.Phone, mit eingebauter Power-Taste) und ein Post-it, das immer
 * sagt, was als Nächstes zu tun ist – nach wiederholten Fehlern mit Mitleids-Tipp (gilt nur
 * für die aktuelle Runde). Kleinärger, für den niemand etwas kann (Ticket zusammengeführt,
 * Warteschleife, vorgezogener Notfall), kostet etwas Frust ohne Fehlversuch (annoy()).
 * Kapitel-Erfolge gibt es nur fürs echte Spielen, nicht für debugSolve().
 * Inhalte, Texte und Regeln kommen aus Ch5Logic; hier nur Darstellung und Ablauf.
 *
 * Global: Ch5HelpdeskScene.
 * Abhängigkeiten (Laufzeit): Phaser, CONFIG, CAMPUS, RNG, GameState, UI (text, sound, toast,
 * Window, Phone, Button, Dropdown, TextInput, ProgressBar, Spinner), FX, ChapterScene, Ch5Logic.
 */

class Ch5HelpdeskScene extends ChapterScene {
  /**
   * Layout (px, Spielkoordinaten). Schriftgrößen: Lesetext mindestens 13 px, nur Metazeilen
   * (Namen in Sprechblasen, Handy-Statuszeile, Hinweis „keine echten Zugangsdaten“) 12 px.
   */
  static LAYOUT = Object.freeze({
    WINDOW: Object.freeze({ X: 12, Y: 56, WIDTH: 520, HEIGHT: 538 }),
    PAD: 14, // Innenabstand im Browser-Inhalt
    HEADER: Object.freeze({
      HEIGHT: 66, TITLE_Y: 8, TITLE_SIZE: 14, BAR_Y: 32, BAR_HEIGHT: 10, STATUS_WIDTH: 236, STATUS_SIZE: 13,
      HOURS_Y: 47, HOURS_SIZE: 13,
    }),
    FORM: Object.freeze({
      PAD_X: 18, TOP: 8, TITLE_SIZE: 17, SUBTITLE_GAP: 23, SUBTITLE_SIZE: 13, FIELDS_GAP: 22,
      LABEL_SPACE: 22, // Label-Zeile über dem Feld (wie UI.Dropdown/UI.TextInput)
      FIELD_HEIGHT: 38, FIELD_STEP: 86, INPUT_STEP: 84, FIELD_FONT: 15, // Schritt = Label + Feld + Fehlerzeile + Luft
      MESSAGE_HEIGHT: 36, MESSAGE_SIZE: 13, SUBMIT_WIDTH: 180, SUBMIT_HEIGHT: 40, DISCLAIMER_GAP: 14, DISCLAIMER_SIZE: 12,
    }),
    CHAT: Object.freeze({ TOP_GAP: 6, TYPING_HEIGHT: 20, TYPING_SIZE: 13, BOTTOM_MARGIN: 10 }),
    OPTION: Object.freeze({ HEIGHT: 34, GAP: 6, FONT_SIZE: 14, MAX: 4 }),
    BUBBLE: Object.freeze({
      AGENT_MAX: 400, PLAYER_MAX: 340, PAD_X: 10, PAD_Y: 7, GAP: 8, RADIUS: 10,
      NAME_SIZE: 12, NAME_GAP: 3, TEXT_SIZE: 13, BOT_TEXT_SIZE: 13, SYSTEM_SIZE: 13, SYSTEM_INSET: 16,
    }),
    HOLD: Object.freeze({
      PAD: 16, RADIUS: 10, TITLE_Y: 12, TITLE_SIZE: 15, POSITION_Y: 38, POSITION_SIZE: 22,
      MUSIC_Y: 76, MUSIC_SIZE: 13, NOTE_Y: 102, NOTE_SIZE: 13, SPINNER_Y: 14, SPINNER_SIZE: 30,
    }),
    PHONE: Object.freeze({ X: 548, Y: 60, WIDTH: 216, HEIGHT: 404, BATTERY: 14 }),
    PHONE_UI: Object.freeze({
      PAD: 12, TITLE_Y: 10, TITLE_SIZE: 18, TOGGLE_Y: 44, TOGGLE_SIZE: 13, TOGGLE_WIDTH: 34, TOGGLE_HEIGHT: 18, TOGGLE_KNOB: 7,
      DIVIDER_Y: 70, ROW_TOP: 80, ROW_HEIGHT: 46, ICON_SIZE: 20, ICON_Y: 16, ROW_TEXT_GAP: 8, ROW_NAME_Y: 1, ROW_STATUS_Y: 21,
      ROW_MAIN_SIZE: 14, ROW_NAME_SIZE: 13, ROW_STATUS_SIZE: 12,
      CARD_TITLE_Y: 10, CARD_TITLE_SIZE: 13, CARD_BODY_Y: 30, CARD_TEXT_SIZE: 13, CARD_RADIUS: 12,
      BOOT_SPINNER_SIZE: 30, BOOT_SPINNER_Y: -40, BOOT_TEXT_Y: 10, BOOT_TEXT_SIZE: 13, LOCK_CLOCK_Y: -30, LOCK_CLOCK_SIZE: 40,
      MENU_RADIUS: 18, MENU_ICON_X: 22, MENU_ICON_RADIUS: 11, MENU_LABEL_X: 42, MENU_LABEL_SIZE: 14,
      CARD_HEIGHT: 104, CARD_MARGIN: 10, CARD_TEXT_X: 18, CARD_TEXT_RIGHT: 8, CARD_STRIPE_X: 8, CARD_STRIPE_INSET: 12,
      MENU_WIDTH: 168, MENU_TOP: 70, MENU_ITEM_HEIGHT: 50, MENU_PAD: 8, MENU_DIM_ALPHA: 0.45,
    }),
    // Extras an der Power-Taste (lokal im Handy-Container, damit sie beim Vibrieren mitwandern)
    POWER: Object.freeze({
      BAR_INSET_X: 1, BAR_WIDTH: 4, BAR_INSET_Y: 6, TAG_GAP: 4, TAG_SIZE: 12,
      HIGHLIGHT_INSET_X: 1, HIGHLIGHT_INSET_Y: 2, HIGHLIGHT_RADIUS: 4, HIGHLIGHT_ALPHA: 0.9,
    }),
    POSTIT: Object.freeze({
      X: 548, Y: 476, WIDTH: 236, HEIGHT: 116, ANGLE: 1.5, PAD: 12, TITLE_Y: 8, TITLE_SIZE: 15, TEXT_Y: 30,
      TEXT_SIZE: 14, MIN_TEXT_SIZE: 12, BOTTOM_PAD: 8, SHADOW: 4, TAPE_WIDTH: 48, TAPE_HEIGHT: 12,
      LONG_WORD_CHARS: 20, // ab dieser Länge wird ein Wort einzeln vermessen (darf nicht umbrechen)
    }),
    POPUP: Object.freeze({
      WIDTH: 290, TITLE_HEIGHT: 28, TITLE_SIZE: 13, PAD: 10, CLOSE_HIT: 30, BUTTON_HEIGHT: 30, BUTTON_FONT: 13, BUTTON_GAP: 8,
      TEXT_SIZE: 13, BODY_GAP: 8, MARGIN: 8, BANNER_MARGIN: 12, POSITION_TRIES: 16, SHADOW: 5, SHADOW_ALPHA: 0.22,
      // Platzwahl: Überlappung mit anderen Pop-ups wiegt schwerer als die Nähe zum Mauszeiger
      OVERLAP_PENALTY: 1000, POINTER_PENALTY: 400, CLOSE_SIZE: 20,
      URGENT_DEPTH_BONUS: 100, // Pop-ups mit Countdown liegen immer obenauf
    }),
    FEEDBACK: Object.freeze({
      CHAT_OFFSET_Y: 30,      // Floating-Texte zu Antworten: so weit über den Buttons
      STAMP_Y_RATIO: 0.42,    // Stempel: Anteil der Inhaltshöhe
      PHONE_OFFSET_X: -100,   // Zeitstrafe „Neustart ohne Wirkung“ links neben dem Handy
      PHONE_OFFSET_Y: 60,
      STATUS_OFFSET_Y: 70,    // „Zusammengeführt“: so weit unter dem Ticket-Status (steigt bis knapp unter die Kopfzeile)
      ANNOY_SIZE: 15,         // Schriftgröße der Floating-Texte für Kleinärger
    }),
  });

  /** Zeiten (ms Szenen-Zeit). */
  static TIMING = Object.freeze({
    TYPING_MS: 850,          // „… schreibt …“ vor jeder Nachricht
    TYPING_PER_CHAR_MS: 6,   // lange Nachrichten tippen etwas länger
    TYPING_MAX_MS: 1500,
    AFTER_MESSAGE_MS: 250,
    SYSTEM_MESSAGE_MS: 450,
    SUBMIT_LOADING_MS: 600,  // „Ticket wird gesendet“ (Ladebalken im Browser)
    BUBBLE_FADE_MS: 160,
    CHAT_SCROLL_MS: 220,
    POPUP_IN_MS: 140,
    POPUP_OUT_MS: 120,
    POPUP_GRACE_MS: 260,     // so lange ignorieren neue Pop-ups Klicks (kein „Wegschnappen“)
    MERGED_STATUS_MS: 1600,
    HOURS_CHECK_MS: 500,
    SHUTDOWN_MS: 700,
    BOOT_MS: 1500,
    LOCKSCREEN_MS: 600,
    CONNECTING_MS: 1100,
    FINALE_HINT_MS: 15000,   // so lange ohne Power-Taste → zusätzlicher Hinweis
    HIGHLIGHT_MS: 260,       // Blinken der Power-Markierung (danach bleibt sie im Finale stehen)
    HIGHLIGHT_BLINKS: 2,
    SOLVED_STAMP_HOLD_MS: 1300, // „GELÖST“ bleibt bis zum Kapitelwechsel liegen
  });

  /** Puls-Effekte (FX.pulse) – kurz und dezent, nur als Antwort auf ein Ereignis. */
  static PULSE = Object.freeze({
    OPTION: Object.freeze({ scale: 1.03, duration: 120, repeat: 1 }),      // Mitleids-Tipp: richtige Antwort
    QUEUE: Object.freeze({ scale: 1.12, duration: 110, repeat: 0 }),       // Warteschlange rückt
    POSTIT: Object.freeze({ scale: 1.03, duration: 110, repeat: 0 }),      // neuer Tipp
    POSTIT_MERCY: Object.freeze({ scale: 1.06, duration: 110, repeat: 0 }), // Mitleids-Tipp
    POWER_TAG: Object.freeze({ scale: 1.2, duration: 120, repeat: 1 }),    // „Power“-Etikett im Finale
  });

  /** Zeichenebenen (relativ zu CONFIG.DEPTH). */
  static DEPTH = Object.freeze({
    CONTENT: CONFIG.DEPTH.CONTENT + 1, // über dem Browserfenster
    POSTIT: CONFIG.DEPTH.UI,
    POPUP: CONFIG.DEPTH.OVERLAY,
  });

  constructor() {
    super(5);
  }

  create() {
    this.initChapter();
    this.resetState();
    this.buildBrowser();
    this.buildHeader();
    this.buildPhone();
    this.buildPostit();
    this.buildForm();
    this.registerLifecycle();
    this.setObjective(this.texts.objectiveForm);
    this.setTip(this.texts.tipForm);
  }

  // ===========================================================================
  // Aufbau
  // ===========================================================================

  /** Alle Instanzfelder (auch nach scene.restart()) frisch setzen. */
  resetState() {
    const credentials = GameState.getCredentials();
    const snapshot = GameState.getSnapshot();
    this.context = {
      password: credentials.password,
      isPhished: Boolean(GameState.getFlag('phished', false)),
      totalFails: snapshot.totalFails,
    };
    this.session = Ch5Logic.createSession({ campus: CAMPUS, context: this.context });
    this.texts = this.session.getTexts();
    // Was gerade zu sehen ist (die Logik wechselt schon beim Antworten, die Szene erst nach der Antwort des Agenten)
    this.viewPhase = Ch5Logic.PHASES.FORM;
    // Eigener Zufallsstrom für Pop-ups (falls verfügbar), damit Pop-ups die Antwort-Reihenfolge nicht verschieben
    this.popupRng = typeof RNG.create === 'function' ? RNG.create(RNG.getSeed() + 5) : RNG;
    this.schedules = {
      form: { entries: Ch5Logic.buildPopupSchedule('form', this.popupRng), index: 0, clockMs: 0 },
      chat: null,
      hold: null,
    };
    this.popups = [];
    this.popupSerial = 0;
    this.optionButtons = [];
    this.formItems = [];
    this.chatContent = null;
    this.chatCursorY = 0;
    this.chatScrollTween = null;
    this.holdPanel = null;
    this.holdStepMs = 0;
    this.scriptToken = 0;
    this.isScriptRunning = false;
    this.isAnswering = false;
    this.mercyRounds = new Set();
    this.trapClicks = 0;
    this.hasTrapTip = false;
    this.popupsClosed = 0;
    this.sessionTimeouts = 0;
    this.isHoldMusicOn = false;
    this.phoneState = 'on'; // 'on' | 'standby' | 'menu' | 'shutting-down' | 'off' | 'booting'
    this.powerPressMs = null; // ms, solange die Power-Taste gedrückt ist
    this.shortPresses = 0;
    this.isPowerKeyMarked = false; // gelbe Markierung an der Power-Taste (Finale)
    this.finaleIdleMs = 0;
    this.hasFinaleHint = false;
    this.hoursCheckMs = 0;
    this.lastHoursOpen = null;
    this.elapsedMs = 0;
    this.tipProbe = null; // Mess-Text für setTip (entsteht bei Bedarf)
  }

  /** Browserfenster mit dem Ticketsystem. */
  buildBrowser() {
    const W = Ch5HelpdeskScene.LAYOUT.WINDOW;
    this.browser = new UI.Window(this, W.X, W.Y, {
      width: W.WIDTH,
      height: W.HEIGHT,
      title: this.texts.windowTitle,
      variant: 'browser',
      url: Ch5Logic.getTicketUrl(CAMPUS),
    });
    this.contentArea = this.browser.getContentArea();
  }

  /** Kopfzeile: Ticketnummer, Ticket-Status (Boss-HP) und Sprechzeiten mit Spieluhr. */
  buildHeader() {
    const L = Ch5HelpdeskScene.LAYOUT;
    const H = L.HEADER;
    const depth = Ch5HelpdeskScene.DEPTH.CONTENT;
    const ca = this.contentArea;
    const x = ca.x + L.PAD;
    const width = ca.width - 2 * L.PAD;
    this.add.rectangle(ca.x, ca.y, ca.width, H.HEIGHT, CONFIG.COLORS.SURFACE_ALT).setOrigin(0).setDepth(depth);
    this.add.rectangle(ca.x, ca.y + H.HEIGHT - 1, ca.width, 1, CONFIG.COLORS.BORDER).setOrigin(0).setDepth(depth);
    this.ticketLabel = UI.text(this, x, ca.y + H.TITLE_Y, this.texts.headerNoTicket, { size: H.TITLE_SIZE, bold: true, depth });
    this.statusBar = new UI.ProgressBar(this, x, ca.y + H.BAR_Y, {
      width: width - H.STATUS_WIDTH,
      height: H.BAR_HEIGHT,
      value: 0,
      color: CONFIG.COLORS.DHBW_RED,
    });
    this.statusBar.setDepth(depth);
    this.statusLabel = UI.text(this, x + width, ca.y + H.BAR_Y + H.BAR_HEIGHT / 2, '', {
      size: H.STATUS_SIZE, bold: true, color: CONFIG.CSS.TEXT, origin: { x: 1, y: 0.5 }, depth,
    });
    this.hoursLabel = UI.text(this, x, ca.y + H.HOURS_Y, '', { size: H.HOURS_SIZE, color: CONFIG.CSS.TEXT_MUTED, depth });
    this.updateTicketStatus(false);
    this.updateOfficeHours();
  }

  /** Handy mit WLAN-Ansicht, Boot-Bildschirm, Power-Menü und Power-Tasten-Extras. */
  buildPhone() {
    const L = Ch5HelpdeskScene.LAYOUT;
    const PH = L.PHONE;
    this.phone = new UI.Phone(this, PH.X, PH.Y, {
      width: PH.WIDTH,
      height: PH.HEIGHT,
      battery: PH.BATTERY,
      powerLongPressMs: Ch5Logic.BALANCE.LONG_PRESS_MS,
    });
    this.phone.setWifiState('off');
    const area = this.phone.getScreenArea();
    this.phoneScreen = { width: area.width, height: area.height };
    this.buildPhoneWifiView();
    this.buildPhoneBootView();
    this.buildPhoneMenu();

    this.phone.on('power-down', this.handlePowerDown, this);
    this.phone.on('power-up', this.handlePowerUp, this);
    this.phone.on('power-press', this.handlePowerShortPress, this);
    this.phone.on('power-longpress', this.handlePowerLongPress, this);

    // Extras an der Power-Taste: Halte-Fortschritt, Markierung, Beschriftung (Finale). Sie hängen
    // lokal im Handy-Container und wandern so beim Vibrieren mit.
    const P = L.POWER;
    const key = this.phone.getPowerButtonArea(); // Weltkoordinaten (Klickfläche der Taste)
    this.powerCenter = { x: Math.round(key.x + key.width / 2), y: Math.round(key.y + key.height / 2) };
    const local = { x: key.x - this.phone.x, y: key.y - this.phone.y, width: key.width, height: key.height };
    this.powerKeyLocal = local;
    this.powerBar = this.add.graphics();
    this.powerHighlight = this.add.graphics().setAlpha(0);
    this.powerHighlight.lineStyle(2, CONFIG.COLORS.HAZARD, 1);
    this.powerHighlight.strokeRoundedRect(local.x + P.HIGHLIGHT_INSET_X, local.y + P.HIGHLIGHT_INSET_Y,
      local.width - 2 * P.HIGHLIGHT_INSET_X, local.height - 2 * P.HIGHLIGHT_INSET_Y, P.HIGHLIGHT_RADIUS);
    this.powerTag = UI.text(this, 0, local.y + local.height / 2, this.texts.powerTag, {
      size: P.TAG_SIZE, bold: true, color: CONFIG.CSS.HAZARD, origin: 0.5,
    }).setAngle(90).setVisible(false);
    // gedreht: die Texthöhe ist jetzt die Breite
    this.powerTag.x = local.x + local.width + P.TAG_GAP + this.powerTag.height / 2;
    this.phone.add([this.powerBar, this.powerHighlight, this.powerTag]);
  }

  /** WLAN-Liste wie in Android: eduroam mit „Authentifizierungsproblem“ und Sperr-Karte. */
  buildPhoneWifiView() {
    const U = Ch5HelpdeskScene.LAYOUT.PHONE_UI;
    const S = this.phoneScreen;
    const C = CONFIG.COLORS;
    const view = this.add.container(0, 0);
    const parts = [this.add.rectangle(0, 0, S.width, S.height, C.SURFACE).setOrigin(0)];
    parts.push(UI.text(this, U.PAD, U.TITLE_Y, this.texts.phoneWifiTitle, { size: U.TITLE_SIZE, bold: true }));
    parts.push(UI.text(this, U.PAD, U.TOGGLE_Y, this.texts.phoneWifiToggle, { size: U.TOGGLE_SIZE }));
    const toggle = this.add.graphics();
    const toggleX = S.width - U.PAD - U.TOGGLE_WIDTH;
    toggle.fillStyle(C.PRIMARY, 1).fillRoundedRect(toggleX, U.TOGGLE_Y, U.TOGGLE_WIDTH, U.TOGGLE_HEIGHT, U.TOGGLE_HEIGHT / 2);
    toggle.fillStyle(C.WHITE, 1).fillCircle(toggleX + U.TOGGLE_WIDTH - U.TOGGLE_HEIGHT / 2, U.TOGGLE_Y + U.TOGGLE_HEIGHT / 2, U.TOGGLE_KNOB);
    parts.push(toggle);
    parts.push(this.add.rectangle(U.PAD, U.DIVIDER_Y, S.width - 2 * U.PAD, 1, C.BORDER).setOrigin(0));

    const rows = [
      { ssid: CAMPUS.wifi.ssid, status: this.texts.phoneStatusAuth, color: CONFIG.CSS.DANGER, level: 3, isMain: true },
      { ssid: CAMPUS.wifi.guestSsid, status: this.texts.phoneGuestStatus, color: CONFIG.CSS.TEXT_MUTED, level: 2 },
      { ssid: this.texts.phoneKevinSsid, status: this.texts.phoneKevinStatus, color: CONFIG.CSS.TEXT_MUTED, level: 4 },
    ];
    rows.forEach((row, index) => {
      const y = U.ROW_TOP + index * U.ROW_HEIGHT;
      const iconKey = `icon-wifi-${row.level}`;
      const textX = U.PAD + U.ICON_SIZE + U.ROW_TEXT_GAP;
      if (this.textures.exists(iconKey)) {
        parts.push(this.add.image(U.PAD + U.ICON_SIZE / 2, y + U.ICON_Y, iconKey).setDisplaySize(U.ICON_SIZE, U.ICON_SIZE).setTint(C.TEXT));
      }
      parts.push(UI.text(this, textX, y + U.ROW_NAME_Y, row.ssid, {
        size: row.isMain ? U.ROW_MAIN_SIZE : U.ROW_NAME_SIZE, bold: Boolean(row.isMain),
      }));
      const status = UI.text(this, textX, y + U.ROW_STATUS_Y, row.status, { size: U.ROW_STATUS_SIZE, color: row.color });
      parts.push(status);
      if (row.isMain) this.wifiStatusText = status;
    });

    // Benachrichtigungskarte unten (Konto gesperrt → entsperrt → gelöst)
    const cardY = S.height - U.CARD_HEIGHT - U.CARD_MARGIN;
    const cardWidth = S.width - 2 * U.CARD_MARGIN;
    this.cardGfx = this.add.graphics();
    this.cardTitle = UI.text(this, U.CARD_MARGIN + U.CARD_TEXT_X, cardY + U.CARD_TITLE_Y, '', { size: U.CARD_TITLE_SIZE, bold: true });
    this.cardText = UI.text(this, U.CARD_MARGIN + U.CARD_TEXT_X, cardY + U.CARD_BODY_Y, '', {
      size: U.CARD_TEXT_SIZE, wrap: cardWidth - U.CARD_TEXT_X - U.CARD_TEXT_RIGHT, color: CONFIG.CSS.TEXT, lineSpacing: 2,
    });
    this.cardBox = { x: U.CARD_MARGIN, y: cardY, width: cardWidth, height: U.CARD_HEIGHT };
    parts.push(this.cardGfx, this.cardTitle, this.cardText);

    view.add(parts);
    this.phone.screen.add(view);
    this.phoneWifiView = view;
    this.updatePhoneCard('locked');
  }

  /** Schwarzer Boot-/Shutdown-Bildschirm mit Spinner bzw. Sperrbildschirm-Uhr. */
  buildPhoneBootView() {
    const U = Ch5HelpdeskScene.LAYOUT.PHONE_UI;
    const S = this.phoneScreen;
    const centerX = S.width / 2;
    const centerY = S.height / 2;
    const view = this.add.container(0, 0);
    const black = this.add.rectangle(0, 0, S.width, S.height, CONFIG.COLORS.SHADOW).setOrigin(0);
    this.bootSpinner = new UI.Spinner(this, centerX - U.BOOT_SPINNER_SIZE / 2, centerY + U.BOOT_SPINNER_Y, {
      size: U.BOOT_SPINNER_SIZE, color: CONFIG.COLORS.WHITE, autoStart: false,
    });
    this.bootText = UI.text(this, centerX, centerY + U.BOOT_TEXT_Y, '', {
      size: U.BOOT_TEXT_SIZE, color: CONFIG.CSS.WHITE, origin: 0.5, align: 'center',
    });
    this.lockClock = UI.text(this, centerX, centerY + U.LOCK_CLOCK_Y, '', { size: U.LOCK_CLOCK_SIZE, bold: true, color: CONFIG.CSS.WHITE, origin: 0.5 });
    view.add([black, this.bootSpinner, this.bootText, this.lockClock]);
    view.setVisible(false);
    this.phone.screen.add(view);
    this.phoneBootView = view;
  }

  /** Android-Power-Menü: Ausschalten, Neu starten, Notfallmodus. */
  buildPhoneMenu() {
    const U = Ch5HelpdeskScene.LAYOUT.PHONE_UI;
    const S = this.phoneScreen;
    const C = CONFIG.COLORS;
    const view = this.add.container(0, 0);
    const dim = this.add.rectangle(0, 0, S.width, S.height, C.SHADOW, U.MENU_DIM_ALPHA).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.closePowerMenu());
    const panelX = Math.round((S.width - U.MENU_WIDTH) / 2);
    const entries = [
      { id: 'off', label: this.texts.phoneMenuOff, color: C.TEXT_MUTED },
      { id: 'restart', label: this.texts.phoneMenuRestart, color: C.PRIMARY },
      { id: 'emergency', label: this.texts.phoneMenuEmergency, color: C.DANGER },
    ];
    const panelHeight = entries.length * U.MENU_ITEM_HEIGHT + 2 * U.MENU_PAD;
    const panel = this.add.graphics();
    panel.fillStyle(C.SURFACE, 1).fillRoundedRect(panelX, U.MENU_TOP, U.MENU_WIDTH, panelHeight, U.MENU_RADIUS);
    const parts = [dim, panel];
    this.powerMenuEntries = entries.map((entry, index) => {
      const y = U.MENU_TOP + U.MENU_PAD + index * U.MENU_ITEM_HEIGHT;
      const hit = this.add.rectangle(panelX + U.MENU_PAD, y, U.MENU_WIDTH - 2 * U.MENU_PAD, U.MENU_ITEM_HEIGHT - 4, C.SURFACE_ALT)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => hit.setFillStyle(C.BORDER));
      hit.on('pointerout', () => hit.setFillStyle(C.SURFACE_ALT));
      hit.on('pointerup', () => this.handlePowerMenu(entry.id));
      const middle = y + (U.MENU_ITEM_HEIGHT - 4) / 2;
      const icon = this.add.graphics();
      icon.fillStyle(entry.color, 1).fillCircle(panelX + U.MENU_PAD + U.MENU_ICON_X, middle, U.MENU_ICON_RADIUS);
      const label = UI.text(this, panelX + U.MENU_PAD + U.MENU_LABEL_X, middle, entry.label, {
        size: U.MENU_LABEL_SIZE, origin: { x: 0, y: 0.5 },
      });
      parts.push(hit, icon, label);
      return { id: entry.id, hit };
    });
    view.add(parts);
    view.setVisible(false);
    this.phone.screen.add(view);
    this.phoneMenuView = view;
    this.setMenuInteractive(false);
  }

  /** Post-it: sagt immer, was zu tun ist (und zeigt Mitleids-Tipps). */
  buildPostit() {
    const N = Ch5HelpdeskScene.LAYOUT.POSTIT;
    const halfW = N.WIDTH / 2;
    const halfH = N.HEIGHT / 2;
    this.postit = this.add.container(N.X + halfW, N.Y + halfH).setDepth(Ch5HelpdeskScene.DEPTH.POSTIT);
    const shadow = this.add.rectangle(-halfW + N.SHADOW, -halfH + N.SHADOW, N.WIDTH, N.HEIGHT, CONFIG.COLORS.SHADOW, 0.3).setOrigin(0);
    const paper = this.add.rectangle(-halfW, -halfH, N.WIDTH, N.HEIGHT, CONFIG.COLORS.POSTIT).setOrigin(0);
    const tape = this.add.rectangle(-N.TAPE_WIDTH / 2, -halfH - N.TAPE_HEIGHT / 2, N.TAPE_WIDTH, N.TAPE_HEIGHT, CONFIG.COLORS.WHITE, 0.5)
      .setOrigin(0).setAngle(-4);
    this.tipTitle = UI.text(this, -halfW + N.PAD, -halfH + N.TITLE_Y, this.texts.tipTitle, {
      font: 'HAND', size: N.TITLE_SIZE, bold: true, color: CONFIG.CSS.INK,
    });
    this.tipText = UI.text(this, -halfW + N.PAD, -halfH + N.TEXT_Y, '', {
      font: 'HAND', size: N.TEXT_SIZE, color: CONFIG.CSS.INK, wrap: N.WIDTH - 2 * N.PAD, lineSpacing: 2,
    });
    this.postit.add([shadow, paper, tape, this.tipTitle, this.tipText]);
    this.postit.setAngle(N.ANGLE);
  }

  /** Support-Formular im Browser. */
  buildForm() {
    const L = Ch5HelpdeskScene.LAYOUT;
    const FM = L.FORM;
    const depth = Ch5HelpdeskScene.DEPTH.CONTENT;
    const ca = this.contentArea;
    const x = ca.x + FM.PAD_X;
    const width = ca.width - 2 * FM.PAD_X;
    const fieldCenter = (top) => ({ x: Math.round(x + width / 2), y: Math.round(top + FM.LABEL_SPACE + FM.FIELD_HEIGHT / 2) });
    let y = ca.y + L.HEADER.HEIGHT + FM.TOP;

    const title = UI.text(this, x, y, this.texts.formTitle, { size: FM.TITLE_SIZE, bold: true, depth });
    y += FM.SUBTITLE_GAP;
    const subtitle = UI.text(this, x, y, this.texts.formSubtitle, { size: FM.SUBTITLE_SIZE, color: CONFIG.CSS.TEXT_MUTED, depth });
    y += FM.FIELDS_GAP;

    this.formCenters = {};
    this.categoryDropdown = new UI.Dropdown(this, x, y, {
      width, height: FM.FIELD_HEIGHT, label: this.texts.formCategoryLabel, placeholder: this.texts.formPlaceholder,
      options: Ch5Logic.getCategoryOptions(), fontSize: FM.FIELD_FONT,
      onChange: () => this.clearFormError('category'),
    }).setDepth(depth);
    this.formCenters.category = fieldCenter(y);
    y += FM.FIELD_STEP;

    this.officeDropdown = new UI.Dropdown(this, x, y, {
      width, height: FM.FIELD_HEIGHT, label: this.texts.formOfficeLabel, placeholder: this.texts.formPlaceholder,
      options: Ch5Logic.getOfficeOptions(CAMPUS), fontSize: FM.FIELD_FONT,
      onChange: () => this.clearFormError('office'),
    }).setDepth(depth);
    this.formCenters.office = fieldCenter(y);
    y += FM.FIELD_STEP;

    this.descriptionInput = new UI.TextInput(this, x, y, {
      width, height: FM.FIELD_HEIGHT, label: this.texts.formDescriptionLabel,
      placeholder: this.texts.formDescriptionPlaceholder, hint: this.texts.formDescriptionHint,
      maxLength: Ch5Logic.BALANCE.DESCRIPTION_MAX_LENGTH, fontSize: FM.FIELD_FONT,
      onChange: () => this.clearFormError('description'),
      onSubmit: () => this.handleSubmitForm(),
    }).setDepth(depth);
    this.formCenters.description = fieldCenter(y);
    y += FM.INPUT_STEP;

    this.formMessage = UI.text(this, x, y, '', { size: FM.MESSAGE_SIZE, color: CONFIG.CSS.DANGER, wrap: width, lineSpacing: 3, depth });
    y += FM.MESSAGE_HEIGHT;

    this.submitButton = new UI.Button(this, x, y, {
      text: this.texts.formSubmit, width: FM.SUBMIT_WIDTH, height: FM.SUBMIT_HEIGHT, variant: 'primary', fontSize: FM.FIELD_FONT,
      onClick: () => this.handleSubmitForm(),
    }).setDepth(depth);
    this.formCenters.submit = { x: Math.round(x + FM.SUBMIT_WIDTH / 2), y: Math.round(y + FM.SUBMIT_HEIGHT / 2) };
    const disclaimer = UI.text(this, x + FM.SUBMIT_WIDTH + FM.DISCLAIMER_GAP, y + FM.SUBMIT_HEIGHT / 2, this.texts.formDisclaimer, {
      size: FM.DISCLAIMER_SIZE, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 0, y: 0.5 },
      wrap: width - FM.SUBMIT_WIDTH - FM.DISCLAIMER_GAP, depth,
    });
    this.formFeedback = { x: Math.round(ca.x + ca.width / 2), y: Math.round(y - FM.MESSAGE_HEIGHT / 2) };
    this.formItems = [title, subtitle, this.categoryDropdown, this.officeDropdown, this.descriptionInput,
      this.formMessage, this.submitButton, disclaimer];
  }

  /** Chatbereich (maskiert), Tipp-Anzeige und Platz für die Antwort-Buttons. */
  buildChat() {
    if (this.chatContent) return;
    const L = Ch5HelpdeskScene.LAYOUT;
    const O = L.OPTION;
    const depth = Ch5HelpdeskScene.DEPTH.CONTENT;
    const ca = this.contentArea;
    const optionsBlock = O.MAX * O.HEIGHT + (O.MAX - 1) * O.GAP;
    this.optionsTop = ca.y + ca.height - L.CHAT.BOTTOM_MARGIN - optionsBlock;
    this.optionsBlockHeight = optionsBlock;
    const typingY = this.optionsTop - L.CHAT.TYPING_HEIGHT;
    const top = ca.y + L.HEADER.HEIGHT + L.CHAT.TOP_GAP;
    this.chatArea = { x: ca.x + L.PAD, y: top, width: ca.width - 2 * L.PAD, height: typingY - top - 2 };
    this.chatContent = this.add.container(this.chatArea.x, this.chatArea.y).setDepth(depth);
    // Maske in Weltkoordinaten (nicht in einen Container hängen)
    this.chatMaskShape = this.make.graphics({ x: 0, y: 0 }, false);
    this.chatMaskShape.fillStyle(CONFIG.COLORS.WHITE, 1).fillRect(this.chatArea.x, this.chatArea.y, this.chatArea.width, this.chatArea.height);
    this.chatContent.setMask(this.chatMaskShape.createGeometryMask());
    this.chatCursorY = 0;
    this.typingText = UI.text(this, this.chatArea.x, typingY, '', {
      size: L.CHAT.TYPING_SIZE, italic: true, color: CONFIG.CSS.TEXT_MUTED, depth,
    });
  }

  /** Pause/Weiter und Aufräumen beim Stoppen der Szene. */
  registerLifecycle() {
    this.events.on(Phaser.Scenes.Events.PAUSE, this.handleScenePause, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);
    this.addCleanup(() => {
      this.events.off(Phaser.Scenes.Events.PAUSE, this.handleScenePause, this);
      this.events.off(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);
      this.scriptToken += 1;
      this.stopHoldMusic();
      if (this.chatMaskShape) {
        this.chatMaskShape.destroy();
        this.chatMaskShape = null;
      }
    });
  }

  // ===========================================================================
  // Spielschleife
  // ===========================================================================

  update(time, delta) {
    if (!this.session) return;
    this.elapsedMs += delta;
    this.hoursCheckMs += delta;
    if (this.hoursCheckMs >= Ch5HelpdeskScene.TIMING.HOURS_CHECK_MS) {
      this.hoursCheckMs = 0;
      this.updateOfficeHours();
    }
    if (this.isFinished) return;
    this.updatePopups(delta);
    if (this.session.getPhase() === Ch5Logic.PHASES.HOLD) this.updateHold(delta);
    this.updatePowerPress(delta);
    this.updateFinaleHint(delta);
  }

  // ===========================================================================
  // Formular
  // ===========================================================================

  /** „Ticket absenden“ (Button oder Enter im Beschreibungsfeld). */
  handleSubmitForm() {
    if (this.isFinished || this.session.getPhase() !== Ch5Logic.PHASES.FORM) return;
    UI.TextInput.blurAll(this);
    const result = this.session.submitForm({
      category: this.categoryDropdown.getValue(),
      office: this.officeDropdown.getValue(),
      description: this.descriptionInput.getValue(),
    });
    if (result.ignored) return;
    const pos = this.formFeedback;
    if (!result.ok) {
      const widget = this.getFormWidget(result.field);
      if (widget) {
        if (result.clearField) widget.setValue('', { silent: true });
        widget.setError(result.reason, { shake: true });
      }
      this.formMessage.setText(result.message);
      // Floating-Text am betroffenen Feld (nicht über der roten Formularmeldung)
      const at = this.formCenters[result.field] || pos;
      this.fail(result.reason, { frustration: result.frustration, minutes: result.minutes, stamp: null, shake: false, x: at.x, y: at.y });
      if (result.showMercy) this.setTip(result.mercy, { isMercy: true });
      return;
    }
    if (result.isSoft) this.penalty(result.minutes, result.reason, pos);
    this.startChat(result);
  }

  /** @returns {object|null} Widget zum Formularfeld */
  getFormWidget(field) {
    return { category: this.categoryDropdown, office: this.officeDropdown, description: this.descriptionInput }[field] || null;
  }

  /** Entfernt die Fehleranzeige eines Feldes (beim Ändern). */
  clearFormError(field) {
    const widget = this.getFormWidget(field);
    if (widget && widget.scene) widget.setError(null);
    if (this.formMessage && this.formMessage.scene) this.formMessage.setText('');
  }

  /** Baut das Formular ab (Fokus und offene Listen zuerst schließen). */
  removeForm() {
    if (!this.formItems.length) return;
    UI.TextInput.blurAll(this);
    [this.categoryDropdown, this.officeDropdown].forEach((dropdown) => {
      if (dropdown && dropdown.scene) dropdown.close();
    });
    this.formItems.forEach((item) => item.destroy());
    this.formItems = [];
    this.categoryDropdown = null;
    this.officeDropdown = null;
    this.descriptionInput = null;
    this.submitButton = null;
    this.formMessage = null;
    this.formCenters = null;
  }

  // ===========================================================================
  // Chat und Runden
  // ===========================================================================

  /** Ticket ist erstellt: Formular weg, Chat auf, Begrüßungsskript, dann Runde 1. */
  startChat(formResult) {
    const texts = this.texts;
    const ticketId = this.session.getTicketId();
    const category = this.session.getCategoryLabel();
    UI.sound('whoosh');
    this.viewPhase = Ch5Logic.PHASES.CHAT;
    this.removeForm();
    this.buildChat();
    this.browser.setLoading(true);
    this.ticketLabel.setText(Ch5Logic.format(texts.headerTicket, { ticketId, category }));
    this.updateTicketStatus();
    this.setObjective(texts.objectiveChat);
    this.setTip(texts.tipChat);
    this.schedules.chat = { entries: Ch5Logic.buildPopupSchedule('chat', this.popupRng), index: 0, clockMs: 0 };

    const steps = [{ kind: 'system', text: Ch5Logic.format(texts.ticketCreated, { ticketId, category }) }];
    if (formResult.isSoft) steps.push({ kind: 'system', text: formResult.message });
    steps.push({ kind: 'bot', text: texts.autoReply });
    steps.push({ kind: 'bot', text: texts.lockStatus });
    steps.push({ kind: 'system', text: Ch5Logic.format(texts.agentJoined, Ch5Logic.AGENTS.first) });
    this.time.delayedCall(Ch5HelpdeskScene.TIMING.SUBMIT_LOADING_MS, () => {
      if (this.isFinished) return;
      this.browser.setLoading(false);
      this.runScript(steps, () => this.presentRound());
    });
  }

  /** „Name · Rolle“ eines Agenten. */
  agentName(agentId) {
    const agent = Ch5Logic.AGENTS[agentId] || Ch5Logic.AGENTS.first;
    return `${agent.name} · ${agent.role}`;
  }

  /** Stellt die Frage der aktuellen Runde und zeigt danach die Antworten. */
  presentRound() {
    const round = this.session.getRound();
    if (!round || this.isFinished) return;
    // Neue Runde, neues Glück: Der Mitleids-Tipp der vorigen Runde passt nicht mehr
    this.setTip(this.texts.tipChat);
    this.runScript([{ kind: 'agent', name: this.agentName(round.agent), text: round.message }], () => this.showOptions());
  }

  /** Antwort-Buttons der aktuellen Runde (gemischt, gesperrte Optionen ausgegraut). */
  showOptions() {
    this.clearOptions();
    const round = this.session.getRound();
    if (!round || this.isFinished) return;
    const O = Ch5HelpdeskScene.LAYOUT.OPTION;
    round.options.forEach((option, index) => {
      const y = this.optionsTop + index * (O.HEIGHT + O.GAP);
      const button = new UI.Button(this, this.chatArea.x, y, {
        text: option.label,
        width: this.chatArea.width,
        height: O.HEIGHT,
        variant: 'secondary',
        fontSize: O.FONT_SIZE,
        disabled: option.isDisabled,
        onClick: () => this.handleAnswer(option.id),
      });
      button.setDepth(Ch5HelpdeskScene.DEPTH.CONTENT);
      button.optionId = option.id;
      button.optionLabel = option.label;
      button.isCorrectOption = option.isCorrect;
      this.optionButtons.push(button);
    });
    if (this.mercyRounds.has(round.id)) this.highlightCorrectOption();
  }

  clearOptions() {
    this.optionButtons.forEach((button) => button.destroy());
    this.optionButtons = [];
  }

  /** Alle Antworten (de)aktivieren; bereits falsch gewählte bleiben gesperrt. */
  setOptionsEnabled(isEnabled) {
    const round = this.session.getRound();
    const disabled = new Set(round ? round.options.filter((o) => o.isDisabled).map((o) => o.id) : []);
    this.optionButtons.forEach((button) => button.setEnabled(isEnabled && !disabled.has(button.optionId)));
  }

  /** Mitleids-Tipp: richtige Antwort grün hervorheben. */
  highlightCorrectOption() {
    const button = this.optionButtons.find((b) => b.isCorrectOption);
    if (!button) return;
    button.setVariant('success');
    FX.pulse(this, button, { ...Ch5HelpdeskScene.PULSE.OPTION });
  }

  /** Spieler:in wählt eine Antwort. */
  handleAnswer(optionId) {
    if (this.isFinished || this.isAnswering || this.isScriptRunning) return;
    const round = this.session.getRound();
    if (!round) return;
    const result = this.session.answer(optionId, { clockMinutes: GameState.getClockMinutes() });
    if (result.ignored) return;

    this.isAnswering = true;
    this.setOptionsEnabled(false);
    this.addBubble({ kind: 'player', text: result.label });
    if (!result.correct) {
      const pos = result.stamp ? this.stampPosition() : this.chatFeedbackPosition();
      this.fail(result.reason, {
        frustration: result.frustration, minutes: result.minutes, stamp: result.stamp,
        shake: Boolean(result.stamp), x: pos.x, y: pos.y,
      });
    } else if (result.relief > 0) {
      this.relief(result.relief, result.reliefReason, this.chatFeedbackPosition());
    }
    this.updateTicketStatus();

    this.runScript([{ kind: 'agent', name: this.agentName(round.agent), text: result.reply }], () => {
      this.isAnswering = false;
      if (result.advanced) {
        this.afterAdvance(result);
        return;
      }
      this.setOptionsEnabled(true);
      if (result.showMercy) {
        this.mercyRounds.add(result.roundId);
        this.setTip(result.mercy, { isMercy: true });
        this.highlightCorrectOption();
      }
    });
  }

  /** Nach einer Antwort, die das Ticket voranbringt: nächste Runde, Warteschleife oder Finale. */
  afterAdvance(result) {
    this.clearOptions();
    if (result.roundId === 'newPassword') this.handleAccountUnlocked();
    const phase = this.session.getPhase();
    if (phase === Ch5Logic.PHASES.HOLD) this.startHold();
    else if (phase === Ch5Logic.PHASES.FINALE) this.startFinale();
    else if (phase === Ch5Logic.PHASES.CHAT) this.presentRound();
  }

  /** Konto entsperrt: Handy-Karte umstellen, kurz vibrieren. */
  handleAccountUnlocked() {
    this.addBubble({ kind: 'system', text: this.texts.accountUnlocked });
    this.updatePhoneCard('unlocked');
    this.phone.vibrate();
  }

  /**
   * Spielt Chat-Nachrichten nacheinander ab (Agenten „tippen“ vorher). Ein neues Skript
   * oder das Kapitelende bricht laufende Skripte ab (Token).
   * @param {{kind: 'agent'|'bot'|'player'|'system', name?: string, text: string}[]} steps
   * @param {Function} [onDone]
   */
  runScript(steps, onDone = null) {
    const T = Ch5HelpdeskScene.TIMING;
    const token = ++this.scriptToken;
    this.isScriptRunning = true;
    const next = (index) => {
      if (token !== this.scriptToken || this.isFinished) return;
      if (index >= steps.length) {
        this.isScriptRunning = false;
        this.setTyping(null);
        if (onDone) onDone();
        return;
      }
      const step = steps[index];
      if (step.kind === 'agent') {
        this.setTyping(step.name);
        const delay = Math.min(T.TYPING_MAX_MS, T.TYPING_MS + step.text.length * T.TYPING_PER_CHAR_MS);
        this.time.delayedCall(delay, () => {
          if (token !== this.scriptToken || this.isFinished) return;
          this.setTyping(null);
          this.addBubble(step);
          UI.sound('notify');
          this.time.delayedCall(T.AFTER_MESSAGE_MS, () => next(index + 1));
        });
        return;
      }
      this.addBubble(step);
      if (step.kind === 'bot') UI.sound('notify');
      this.time.delayedCall(T.SYSTEM_MESSAGE_MS, () => next(index + 1));
    };
    next(0);
  }

  /** „Herr Häberle · 1st Level schreibt …“ bzw. leer. */
  setTyping(name) {
    if (!this.typingText) return;
    this.typingText.setText(name ? `${name} schreibt …` : '');
  }

  /**
   * Neue Chat-Nachricht (Sprechblase). Agenten links grau, Ticketsystem auf Kopierpapier
   * in Schreibmaschinenschrift, eigene Antworten rechts blau, Systemhinweise mittig.
   * @returns {Phaser.GameObjects.Container|null}
   */
  addBubble({ kind, name = '', text }) {
    if (!this.chatContent) return null;
    const B = Ch5HelpdeskScene.LAYOUT.BUBBLE;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const width = this.chatArea.width;
    const item = this.add.container(0, this.chatCursorY);
    let height;
    if (kind === 'system') {
      const label = UI.text(this, width / 2, 0, text, {
        size: B.SYSTEM_SIZE, italic: true, color: CSS.TEXT_MUTED, align: 'center', wrap: width - 2 * B.SYSTEM_INSET, origin: { x: 0.5, y: 0 },
      });
      item.add(label);
      height = Math.ceil(label.height);
    } else {
      const isPlayer = kind === 'player';
      const isBot = kind === 'bot';
      const maxWidth = isPlayer ? B.PLAYER_MAX : B.AGENT_MAX;
      const parts = [];
      let cursor = B.PAD_Y;
      let contentWidth = 0;
      if (!isPlayer) {
        const nameText = UI.text(this, B.PAD_X, cursor, isBot ? this.texts.botName : name, {
          size: B.NAME_SIZE, bold: true, color: isBot ? CSS.INK_MUTED : CSS.PRIMARY,
        });
        parts.push(nameText);
        cursor += nameText.height + B.NAME_GAP;
        contentWidth = nameText.width;
      }
      const body = UI.text(this, B.PAD_X, cursor, text, {
        size: isBot ? B.BOT_TEXT_SIZE : B.TEXT_SIZE,
        font: isBot ? 'PAPER' : 'UI',
        color: isPlayer ? CSS.WHITE : isBot ? CSS.INK : CSS.TEXT,
        wrap: maxWidth - 2 * B.PAD_X,
        lineSpacing: 2,
      });
      parts.push(body);
      contentWidth = Math.max(contentWidth, body.width);
      const bubbleWidth = Math.ceil(Math.min(maxWidth, contentWidth + 2 * B.PAD_X));
      height = Math.ceil(cursor + body.height + B.PAD_Y);
      const bg = this.add.graphics();
      bg.fillStyle(isPlayer ? C.PRIMARY : isBot ? C.PAPER : C.SURFACE_ALT, 1).fillRoundedRect(0, 0, bubbleWidth, height, B.RADIUS);
      if (!isPlayer) bg.lineStyle(1, isBot ? C.PAPER_SHADE : C.BORDER, 1).strokeRoundedRect(0.5, 0.5, bubbleWidth - 1, height - 1, B.RADIUS);
      item.add([bg, ...parts]);
      item.x = isPlayer ? width - bubbleWidth : 0;
    }
    this.chatContent.add(item);
    this.chatCursorY += height + B.GAP;
    item.setAlpha(0);
    this.tweens.add({ targets: item, alpha: 1, duration: Ch5HelpdeskScene.TIMING.BUBBLE_FADE_MS });
    this.scrollChatToBottom();
    return item;
  }

  /** Scrollt so, dass die neueste Nachricht unten sichtbar ist. */
  scrollChatToBottom() {
    const overflow = Math.max(0, this.chatCursorY - Ch5HelpdeskScene.LAYOUT.BUBBLE.GAP - this.chatArea.height);
    const targetY = this.chatArea.y - overflow;
    if (this.chatScrollTween) this.chatScrollTween.stop();
    this.chatScrollTween = this.tweens.add({
      targets: this.chatContent, y: targetY, duration: Ch5HelpdeskScene.TIMING.CHAT_SCROLL_MS, ease: 'Cubic.easeOut',
    });
  }

  /** Effekte zu Antworten erscheinen über den Buttons. */
  chatFeedbackPosition() {
    const area = this.chatArea || this.contentArea;
    return {
      x: Math.round(area.x + area.width / 2),
      y: Math.round((this.optionsTop || area.y + area.height) - Ch5HelpdeskScene.LAYOUT.FEEDBACK.CHAT_OFFSET_Y),
    };
  }

  /** Großer Stempel mitten aufs Ticket. */
  stampPosition() {
    const ca = this.contentArea;
    return { x: Math.round(ca.x + ca.width / 2), y: Math.round(ca.y + ca.height * Ch5HelpdeskScene.LAYOUT.FEEDBACK.STAMP_Y_RATIO) };
  }

  // ===========================================================================
  // Warteschleife
  // ===========================================================================

  /** Eskalation: Warteschlange mit Musik, Pop-up-Gewitter. */
  startHold() {
    const texts = this.texts;
    this.viewPhase = Ch5Logic.PHASES.HOLD;
    this.setObjective(texts.objectiveHold);
    this.setTip(texts.tipHold);
    this.addBubble({ kind: 'system', text: texts.escalated });
    this.addBubble({ kind: 'system', text: texts.holdStarted });
    this.startHoldMusic();
    this.schedules.hold = { entries: Ch5Logic.buildPopupSchedule('hold', this.popupRng), index: 0, clockMs: 0 };
    this.holdStepMs = 0;
    this.buildHoldPanel();
    this.annoy(Ch5Logic.BALANCE.HOLD_FRUSTRATION, texts.reasonHold, this.chatFeedbackPosition());
  }

  /** Warteschleifen-Anzeige anstelle der Antwort-Buttons. */
  buildHoldPanel() {
    const H = Ch5HelpdeskScene.LAYOUT.HOLD;
    const C = CONFIG.COLORS;
    const width = this.chatArea.width;
    const height = this.optionsBlockHeight;
    const panel = this.add.container(this.chatArea.x, this.optionsTop).setDepth(Ch5HelpdeskScene.DEPTH.CONTENT);
    const bg = this.add.graphics();
    bg.fillStyle(C.PAPER, 1).fillRoundedRect(0, 0, width, height, H.RADIUS);
    bg.lineStyle(1, C.PAPER_SHADE, 1).strokeRoundedRect(0.5, 0.5, width - 1, height - 1, H.RADIUS);
    const title = UI.text(this, H.PAD, H.TITLE_Y, this.texts.holdTitle, { size: H.TITLE_SIZE, bold: true, color: CONFIG.CSS.INK });
    this.holdPositionText = UI.text(this, H.PAD, H.POSITION_Y, Ch5Logic.format(this.texts.holdPosition, { position: this.session.getQueuePosition() }), {
      size: H.POSITION_SIZE, bold: true, color: CONFIG.CSS.INK,
    });
    const music = UI.text(this, H.PAD, H.MUSIC_Y, this.texts.holdMusic, { size: H.MUSIC_SIZE, italic: true, color: CONFIG.CSS.INK_MUTED });
    const note = UI.text(this, H.PAD, H.NOTE_Y, this.texts.holdNote, { size: H.NOTE_SIZE, color: CONFIG.CSS.INK_MUTED, wrap: width - 2 * H.PAD });
    const spinner = new UI.Spinner(this, width - H.PAD - H.SPINNER_SIZE, H.SPINNER_Y, { size: H.SPINNER_SIZE, color: C.PRIMARY });
    panel.add([bg, title, this.holdPositionText, music, note, spinner]);
    this.holdPanel = panel;
  }

  /** Warteschlange rückt im Takt vor; Pop-ups nach eigenem Plan. */
  updateHold(delta) {
    const plan = this.schedules.hold;
    if (!plan) return;
    plan.clockMs += delta;
    this.spawnDuePopups(plan);
    this.holdStepMs += delta;
    if (this.holdStepMs < Ch5Logic.POPUP_SCHEDULE.HOLD_STEP_MS) return;
    this.holdStepMs -= Ch5Logic.POPUP_SCHEDULE.HOLD_STEP_MS;
    const step = this.session.advanceQueue();
    if (step.ignored) return;
    if (step.event === 'done') {
      this.endHold();
      return;
    }
    this.setHoldPosition(step.position);
    if (step.event === 'setback') {
      this.addBubble({ kind: 'system', text: step.message });
      UI.sound('error');
      this.annoy(Ch5Logic.BALANCE.HOLD_SETBACK_FRUSTRATION, this.texts.reasonSetback, this.chatFeedbackPosition());
    }
  }

  setHoldPosition(position) {
    if (!this.holdPositionText || !this.holdPositionText.scene) return;
    this.holdPositionText.setText(Ch5Logic.format(this.texts.holdPosition, { position }));
    FX.pulse(this, this.holdPositionText, { ...Ch5HelpdeskScene.PULSE.QUEUE });
  }

  /** 2nd Level übernimmt. */
  endHold() {
    this.viewPhase = Ch5Logic.PHASES.CHAT;
    this.stopHoldMusic();
    if (this.holdPanel) {
      this.holdPanel.destroy();
      this.holdPanel = null;
    }
    this.holdPositionText = null;
    this.addBubble({ kind: 'system', text: Ch5Logic.format(this.texts.agentJoined, Ch5Logic.AGENTS.second) });
    this.setObjective(this.texts.objectiveChat);
    this.setTip(this.texts.tipChat);
    this.updateTicketStatus();
    this.presentRound();
  }

  startHoldMusic() {
    this.isHoldMusicOn = true;
    UI.sound('startHoldMusic');
  }

  stopHoldMusic() {
    if (!this.isHoldMusicOn) return;
    this.isHoldMusicOn = false;
    UI.sound('stopHoldMusic');
  }

  handleScenePause() {
    if (this.isHoldMusicOn) UI.sound('stopHoldMusic');
    this.powerPressMs = null;
    if (this.powerBar) this.powerBar.clear();
  }

  handleSceneResume() {
    if (this.isHoldMusicOn) UI.sound('startHoldMusic');
  }

  // ===========================================================================
  // Pop-ups
  // ===========================================================================

  /** Pop-up-Pläne je Phase abarbeiten, Countdowns zählen (nicht im Finale). */
  updatePopups(delta) {
    const phase = this.session.getPhase();
    const { PHASES } = Ch5Logic;
    if (phase === PHASES.FORM) {
      this.schedules.form.clockMs += delta;
      this.spawnDuePopups(this.schedules.form);
    } else if (phase === PHASES.CHAT && this.schedules.chat) {
      this.schedules.chat.clockMs += delta;
      this.spawnDuePopups(this.schedules.chat);
    }
    if (phase === PHASES.FORM || phase === PHASES.CHAT || phase === PHASES.HOLD) {
      [...this.popups].forEach((popup) => this.tickPopupCountdown(popup, delta));
    }
  }

  /** Startet alle fälligen Pop-ups eines Plans (über dem Limit verfallen sie). */
  spawnDuePopups(plan) {
    while (plan.index < plan.entries.length && plan.entries[plan.index].atMs <= plan.clockMs) {
      const entry = plan.entries[plan.index];
      plan.index += 1;
      this.spawnPopup(entry.type);
    }
  }

  /**
   * Öffnet ein Pop-up über dem Browserinhalt (nie über dem Handy – das bleibt immer bedienbar).
   * @param {string} type Schlüssel aus Ch5Logic.POPUP_TYPES
   * @returns {object|null} Pop-up-Datensatz
   */
  spawnPopup(type) {
    if (this.isFinished || this.popups.length >= Ch5Logic.BALANCE.POPUP_MAX_OPEN) return null;
    const def = Ch5Logic.getPopup(type, CAMPUS, { ticketId: this.session.getTicketId(), otherTicketId: this.session.getOtherTicketId() });
    if (!def) return null;
    const popup = this.buildPopup(def);
    this.popups.push(popup);
    UI.sound(type === 'timeout' ? 'alarm' : 'popup');
    if (type === 'merged') this.flashMergedStatus();
    return popup;
  }

  /** Baut ein Pop-up (Mini-Fenster bzw. Cookie-Banner) mit kleinem × und Aktionen. */
  buildPopup(def) {
    const P = Ch5HelpdeskScene.LAYOUT.POPUP;
    const C = CONFIG.COLORS;
    const ca = this.contentArea;
    const width = def.isBanner ? Math.round(ca.width - 2 * P.BANNER_MARGIN) : P.WIDTH;
    const popup = {
      id: ++this.popupSerial,
      type: def.type,
      def,
      isReady: false,
      isClosing: false,
      remainingMs: def.timeoutSeconds * 1000,
      shownSeconds: def.timeoutSeconds,
      actionButtons: [],
    };
    const urgentBonus = def.timeoutSeconds ? P.URGENT_DEPTH_BONUS : 0;
    const container = this.add.container(0, 0).setDepth(Ch5HelpdeskScene.DEPTH.POPUP + urgentBonus + popup.id);
    const bodyText = def.timeoutSeconds ? Ch5Logic.format(def.text, { seconds: def.timeoutSeconds }) : def.text;
    const body = UI.text(this, P.PAD, P.TITLE_HEIGHT + P.BODY_GAP, bodyText, { size: P.TEXT_SIZE, wrap: width - 2 * P.PAD, lineSpacing: 2 });
    let height = body.y + body.height + P.PAD;
    const buttonsY = Math.ceil(body.y + body.height + P.BODY_GAP);
    if (def.actions.length) height = buttonsY + P.BUTTON_HEIGHT + P.PAD;
    height = Math.ceil(height);

    const shadow = this.add.rectangle(P.SHADOW, P.SHADOW, width, height, C.SHADOW, P.SHADOW_ALPHA).setOrigin(0);
    const bg = this.add.rectangle(0, 0, width, height, C.SURFACE).setOrigin(0).setStrokeStyle(1, C.BORDER).setInteractive();
    const titleBar = this.add.rectangle(0, 0, width, P.TITLE_HEIGHT, C.SURFACE_ALT).setOrigin(0);
    const title = UI.text(this, P.PAD, P.TITLE_HEIGHT / 2, def.title, { size: P.TITLE_SIZE, bold: true, origin: { x: 0, y: 0.5 } });
    const closeHit = this.add.rectangle(width - P.CLOSE_HIT, 0, P.CLOSE_HIT, P.TITLE_HEIGHT, C.SURFACE_ALT)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const closeGlyph = UI.text(this, width - P.CLOSE_HIT / 2, P.TITLE_HEIGHT / 2, '×', { size: P.CLOSE_SIZE, color: CONFIG.CSS.TEXT_MUTED, origin: 0.5 });
    closeHit.on('pointerover', () => {
      closeHit.setFillStyle(C.DANGER);
      closeGlyph.setColor(CONFIG.CSS.WHITE);
    });
    closeHit.on('pointerout', () => {
      closeHit.setFillStyle(C.SURFACE_ALT);
      closeGlyph.setColor(CONFIG.CSS.TEXT_MUTED);
    });
    closeHit.on('pointerup', () => this.handlePopupClose(popup));
    container.add([shadow, bg, titleBar, title, closeHit, closeGlyph, body]);

    let buttonX = P.PAD;
    def.actions.forEach((action) => {
      const button = new UI.Button(this, buttonX, buttonsY, {
        text: action.label, width: 'auto', minWidth: 60, height: P.BUTTON_HEIGHT, variant: action.variant,
        fontSize: P.BUTTON_FONT, onClick: () => this.handlePopupAction(popup, action),
      });
      container.add(button);
      popup.actionButtons.push({ action, button });
      buttonX += button.width + P.BUTTON_GAP;
    });

    const pos = this.pickPopupPosition(width, height, def.isBanner);
    container.setPosition(pos.x, pos.y);
    popup.container = container;
    popup.body = body;
    popup.bounds = new Phaser.Geom.Rectangle(pos.x, pos.y, width, height);
    popup.closeCenter = { x: Math.round(pos.x + width - P.CLOSE_HIT / 2), y: Math.round(pos.y + P.TITLE_HEIGHT / 2) };

    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: Ch5HelpdeskScene.TIMING.POPUP_IN_MS });
    this.time.delayedCall(Ch5HelpdeskScene.TIMING.POPUP_GRACE_MS, () => {
      popup.isReady = !popup.isClosing;
    });
    return popup;
  }

  /** Zufällige Position im Browserinhalt – möglichst weit weg vom Mauszeiger und von anderen Pop-ups. */
  pickPopupPosition(width, height, isBanner) {
    const L = Ch5HelpdeskScene.LAYOUT;
    const P = L.POPUP;
    const ca = this.contentArea;
    if (isBanner) return { x: Math.round(ca.x + P.BANNER_MARGIN), y: Math.round(ca.y + ca.height - height - P.BANNER_MARGIN) };
    const minX = Math.round(ca.x + P.MARGIN);
    const maxX = Math.round(ca.x + ca.width - width - P.MARGIN);
    const minY = Math.round(ca.y + L.HEADER.HEIGHT + P.MARGIN);
    const maxY = Math.round(ca.y + ca.height - height - P.MARGIN);
    const pointer = this.input.activePointer;
    let best = { x: minX, y: minY };
    let bestScore = -Infinity;
    for (let i = 0; i < P.POSITION_TRIES; i++) {
      const x = this.popupRng.int(minX, Math.max(minX, maxX));
      const y = this.popupRng.int(minY, Math.max(minY, maxY));
      const candidate = new Phaser.Geom.Rectangle(x, y, width, height);
      let score = Phaser.Math.Distance.Between(candidate.centerX, candidate.centerY, pointer.worldX, pointer.worldY);
      if (Phaser.Geom.Rectangle.Contains(candidate, pointer.worldX, pointer.worldY)) score -= P.POINTER_PENALTY;
      // Überlappung: fester Abzug plus Anteil der verdeckten Fläche (wenig Überlappung ist besser als viel)
      this.popups.forEach((other) => {
        const overlap = Phaser.Geom.Intersects.GetRectangleIntersection(candidate, other.bounds);
        if (overlap && overlap.width > 0 && overlap.height > 0) {
          score -= P.OVERLAP_PENALTY * (1 + (overlap.width * overlap.height) / (width * height));
        }
      });
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }

  /** Das kleine ×: immer ohne Nebenwirkungen. */
  handlePopupClose(popup) {
    if (!popup.isReady || popup.isClosing || this.isFinished) return;
    UI.sound('click');
    this.popupsClosed += 1;
    this.closePopup(popup);
  }

  /** Aktions-Button im Pop-up: sicher (schließt) oder Falle (kostet Zeit/Frust). */
  handlePopupAction(popup, action) {
    if (!popup.isReady || popup.isClosing || this.isFinished) return;
    const bounds = popup.bounds;
    this.closePopup(popup);
    if (!action.trap) {
      this.popupsClosed += 1;
      return;
    }
    const trap = action.trap;
    this.trapClicks += 1;
    const pos = trap.stamp ? this.stampPosition() : { x: Math.round(bounds.centerX), y: Math.round(bounds.centerY) };
    this.fail(trap.reason, {
      frustration: trap.frustration, minutes: trap.minutes, stamp: trap.stamp || null,
      shake: Boolean(trap.stamp), x: pos.x, y: pos.y,
    });
    if (trap.chatNote) this.addBubble({ kind: 'system', text: this.texts.phishingNote });
    if (this.trapClicks >= Ch5Logic.BALANCE.TRAP_TIP_AFTER && !this.hasTrapTip) {
      this.hasTrapTip = true;
      this.setTip(this.texts.tipTraps, { isMercy: true });
      this.toast(this.texts.toastTraps);
    }
  }

  /** Blendet ein Pop-up aus und entfernt es. */
  closePopup(popup) {
    if (popup.isClosing) return;
    popup.isClosing = true;
    popup.isReady = false;
    this.popups = this.popups.filter((entry) => entry !== popup);
    this.tweens.add({
      targets: popup.container,
      alpha: 0,
      duration: Ch5HelpdeskScene.TIMING.POPUP_OUT_MS,
      onComplete: () => popup.container.destroy(),
    });
  }

  /** Sitzungs-Countdown im Timeout-Pop-up. */
  tickPopupCountdown(popup, delta) {
    if (!popup.def.timeoutSeconds || popup.isClosing) return;
    popup.remainingMs -= delta;
    const seconds = Math.max(0, Math.ceil(popup.remainingMs / 1000));
    if (seconds !== popup.shownSeconds) {
      popup.shownSeconds = seconds;
      popup.body.setText(Ch5Logic.format(popup.def.text, { seconds }));
      if (seconds > 0 && seconds <= 3) UI.sound('tick');
    }
    if (popup.remainingMs <= 0) {
      this.closePopup(popup);
      this.handleSessionTimeout(popup.def);
    }
  }

  /** Sitzung abgelaufen: Fehlversuch; in der Warteschleife geht der Platz verloren. */
  handleSessionTimeout(def) {
    this.sessionTimeouts += 1;
    const pos = this.chatFeedbackPosition();
    const penalty = def.onTimeout;
    this.fail(penalty.reason, { frustration: penalty.frustration, minutes: penalty.minutes, stamp: null, shake: true, x: pos.x, y: pos.y });
    if (this.session.getPhase() === Ch5Logic.PHASES.HOLD) {
      const result = this.session.applySessionTimeout();
      if (!result.ignored) {
        this.addBubble({ kind: 'system', text: result.message });
        this.setHoldPosition(result.position);
      }
    } else {
      this.addBubble({ kind: 'system', text: this.texts.chatTimeout });
    }
  }

  /** „Ticket zusammengeführt“: Status flackert kurz – und das nervt jeden ein bisschen. */
  flashMergedStatus() {
    this.statusLabel.setText(this.texts.statusMerged).setColor(CONFIG.CSS.WARNING);
    this.time.delayedCall(Ch5HelpdeskScene.TIMING.MERGED_STATUS_MS, () => this.updateTicketStatus());
    const ca = this.contentArea;
    this.annoy(Ch5Logic.BALANCE.MERGED_FRUSTRATION, this.texts.reasonMerged, {
      x: Math.round(ca.x + ca.width / 2), y: Math.round(this.statusLabel.y + Ch5HelpdeskScene.LAYOUT.FEEDBACK.STATUS_OFFSET_Y),
    });
  }

  /**
   * Kleiner Ärger ohne Fehlversuch (das System ist schuld, nicht die Spieler:in):
   * gelber Floating-Text „Grund · +2 % Frust“, Frust über GameState.
   * @param {number} amount Prozentpunkte
   * @param {string} reason
   * @param {{x: number, y: number}} pos
   */
  annoy(amount, reason, { x, y }) {
    if (this.isFinished || !(amount > 0)) return;
    ChapterScene.safely(() => {
      const p = this.clampToArea(x, y);
      FX.floatText(this, p.x, p.y, `${reason} · +${amount} % Frust`, {
        color: CONFIG.CSS.HAZARD, size: Ch5HelpdeskScene.LAYOUT.FEEDBACK.ANNOY_SIZE,
      });
    });
    // Buchung zuletzt: addFrustration kann einen Rage-Quit auslösen
    GameState.addFrustration(amount, reason);
  }

  // ===========================================================================
  // Ticket-Status, Sprechzeiten, Post-it
  // ===========================================================================

  /** Boss-HP: Balken + Status-Etikett aus dem Ticket-Fortschritt. */
  updateTicketStatus(animate = true) {
    const progress = this.session.getProgress();
    const C = CONFIG.COLORS;
    let color = C.DHBW_RED;
    if (progress >= Ch5Logic.PROGRESS.SOLVED) color = C.SUCCESS;
    else if (progress >= 0.85) color = C.PRIMARY;
    else if (progress >= 0.5) color = C.WARNING;
    this.statusBar.setValue(progress, animate);
    this.statusBar.setColor(color);
    this.statusLabel.setText(this.texts.statusPrefix + this.session.getStatusLabel()).setColor(CONFIG.CSS.TEXT);
  }

  /** Sprechzeiten-Zeile live mit der Spieluhr; Toast beim Öffnen/Schließen. */
  updateOfficeHours() {
    const status = Ch5Logic.getOfficeHoursStatus(GameState.getClockMinutes(), CAMPUS.helpdesk.hours);
    this.hoursLabel.setText(Ch5Logic.format(this.texts.hoursLine, { status: status.text }));
    if (this.lastHoursOpen !== null && status.isOpen !== this.lastHoursOpen && !this.isFinished) {
      this.toast(status.isOpen ? this.texts.hoursOpened : this.texts.hoursClosed);
    }
    this.lastHoursOpen = status.isOpen;
  }

  /**
   * Text auf dem Post-it. Die Schrift schrumpft, bis der Tipp in die Notiz passt und kein
   * einzelnes Wort (z. B. Kennung@Realm) mitten im Wort umbrechen muss.
   * @param {string} text
   * @param {{isMercy?: boolean}} [opts] Mitleids-Tipp: rote Überschrift + kurzes Pulsieren
   */
  setTip(text, { isMercy = false } = {}) {
    const N = Ch5HelpdeskScene.LAYOUT.POSTIT;
    if (!this.tipText) return;
    const changed = this.tipText.text !== text;
    this.tipTitle.setText(isMercy ? this.texts.tipMercyTitle : this.texts.tipTitle)
      .setColor(isMercy ? CONFIG.CSS.DHBW_RED : CONFIG.CSS.INK);
    this.tipText.setText(text);
    const available = N.HEIGHT - N.TEXT_Y - N.BOTTOM_PAD;
    const wrapWidth = N.WIDTH - 2 * N.PAD;
    const longWords = String(text).split(/\s+/).filter((word) => word.length >= N.LONG_WORD_CHARS);
    const fits = (size) => this.tipText.height <= available
      && longWords.every((word) => this.measureTipWord(word, size) <= wrapWidth);
    let size = N.TEXT_SIZE;
    this.tipText.setFontSize(size);
    while (!fits(size) && size > N.MIN_TEXT_SIZE) {
      size -= 0.5;
      this.tipText.setFontSize(size);
    }
    if (changed && (isMercy || this.elapsedMs > 0)) {
      FX.pulse(this, this.postit, { ...(isMercy ? Ch5HelpdeskScene.PULSE.POSTIT_MERCY : Ch5HelpdeskScene.PULSE.POSTIT) });
    }
  }

  /**
   * Breite eines Wortes in der Post-it-Schrift (unsichtbarer Mess-Text, wird wiederverwendet).
   * @param {string} word
   * @param {number} size Schriftgröße in px
   * @returns {number}
   */
  measureTipWord(word, size) {
    if (!this.tipProbe || !this.tipProbe.scene) {
      this.tipProbe = UI.text(this, 0, 0, '', { font: 'HAND', size, color: CONFIG.CSS.INK }).setVisible(false);
    }
    this.tipProbe.setFontSize(size).setText(word);
    return this.tipProbe.width;
  }

  /** Ziel und Tipp passend zur aktuellen Phase (z. B. nach einem frühen Neustart). */
  restorePhaseGuidance() {
    const texts = this.texts;
    const { PHASES } = Ch5Logic;
    const phase = this.session.getPhase();
    const guidance = {
      [PHASES.FORM]: [texts.objectiveForm, texts.tipForm],
      [PHASES.CHAT]: [texts.objectiveChat, texts.tipChat],
      [PHASES.HOLD]: [texts.objectiveHold, texts.tipHold],
      [PHASES.FINALE]: [texts.objectiveFinale, texts.tipFinale],
    }[phase];
    if (!guidance) return;
    this.setObjective(guidance[0]);
    this.setTip(guidance[1]);
  }

  // ===========================================================================
  // Handy und Finale
  // ===========================================================================

  /** Finale: „Aus- und wieder Einschalten“. */
  startFinale() {
    this.viewPhase = Ch5Logic.PHASES.FINALE;
    this.clearOptions();
    const isOff = this.phoneState === 'off';
    this.setObjective(isOff ? this.texts.objectivePhoneOff : this.texts.objectiveFinale);
    this.setTip(isOff ? this.texts.tipPhoneOff : this.texts.tipFinale);
    this.powerTag.setVisible(true);
    this.isPowerKeyMarked = true;
    this.finaleIdleMs = 0;
    this.pulsePowerKey();
  }

  /** Markiert die Power-Taste: gelber Rahmen blinkt und bleibt im Finale ruhig stehen. */
  pulsePowerKey() {
    const T = Ch5HelpdeskScene.TIMING;
    const restAlpha = () => (this.isPowerKeyMarked ? Ch5HelpdeskScene.LAYOUT.POWER.HIGHLIGHT_ALPHA : 0);
    this.tweens.killTweensOf(this.powerHighlight);
    this.powerHighlight.setAlpha(0);
    this.tweens.add({
      targets: this.powerHighlight, alpha: 1, duration: T.HIGHLIGHT_MS, yoyo: true, repeat: T.HIGHLIGHT_BLINKS,
      onComplete: () => this.powerHighlight.setAlpha(restAlpha()),
    });
    FX.pulse(this, this.powerTag, { ...Ch5HelpdeskScene.PULSE.POWER_TAG });
  }

  /** Nach längerem Zögern im Finale: deutlicher Hinweis auf die Power-Taste. */
  updateFinaleHint(delta) {
    if (this.session.getPhase() !== Ch5Logic.PHASES.FINALE || this.hasFinaleHint) return;
    if (this.powerPressMs !== null || this.phoneState === 'booting' || this.phoneState === 'shutting-down') return;
    this.finaleIdleMs += delta;
    if (this.finaleIdleMs < Ch5HelpdeskScene.TIMING.FINALE_HINT_MS) return;
    this.hasFinaleHint = true;
    this.toast(this.texts.toastFinaleHint);
    this.setTip(this.texts.tipFinale, { isMercy: true });
    this.pulsePowerKey();
  }

  canUsePowerKey() {
    return !this.isFinished && this.phoneState !== 'booting' && this.phoneState !== 'shutting-down';
  }

  handlePowerDown() {
    if (!this.canUsePowerKey()) return;
    this.powerPressMs = 0;
  }

  handlePowerUp() {
    this.powerPressMs = null;
    this.powerBar.clear();
  }

  /** Halte-Fortschritt als kleiner Balken neben der Taste (lokal im Handy-Container). */
  updatePowerPress(delta) {
    if (this.powerPressMs === null) return;
    this.powerPressMs += delta;
    const P = Ch5HelpdeskScene.LAYOUT.POWER;
    const key = this.powerKeyLocal;
    const progress = Phaser.Math.Clamp(this.powerPressMs / Ch5Logic.BALANCE.LONG_PRESS_MS, 0, 1);
    const x = key.x + key.width - P.BAR_INSET_X - P.BAR_WIDTH;
    const top = key.y + P.BAR_INSET_Y;
    const height = key.height - 2 * P.BAR_INSET_Y;
    this.powerBar.clear();
    this.powerBar.fillStyle(CONFIG.COLORS.WHITE, 0.25).fillRect(x, top, P.BAR_WIDTH, height);
    this.powerBar.fillStyle(CONFIG.COLORS.HAZARD, 1).fillRect(x, top + height * (1 - progress), P.BAR_WIDTH, height * progress);
  }

  /** Kurz gedrückt: Bildschirm aus/an (wie echt) – im Finale mit Hinweis. */
  handlePowerShortPress() {
    if (!this.canUsePowerKey()) return;
    if (this.phoneState === 'on') {
      this.setPhoneState('standby');
      this.phone.setScreenOn(false);
      this.toast(this.texts.toastStandby);
      this.registerShortPress();
    } else if (this.phoneState === 'standby') {
      this.setPhoneState('on');
      this.phone.setScreenOn(true);
    } else if (this.phoneState === 'menu') {
      this.closePowerMenu();
    } else if (this.phoneState === 'off') {
      this.toast(this.texts.toastOffShort);
      this.registerShortPress();
    }
  }

  /** Mitleids-Tipp, wenn im Finale nur getippt statt gehalten wird. */
  registerShortPress() {
    if (this.session.getPhase() !== Ch5Logic.PHASES.FINALE) return;
    this.shortPresses += 1;
    if (this.shortPresses >= Ch5Logic.BALANCE.SHORT_PRESS_TIP_AFTER) this.setTip(this.texts.tipShortPress, { isMercy: true });
  }

  /** Lang gedrückt: Power-Menü (an) bzw. Einschalten (aus). */
  handlePowerLongPress() {
    this.powerPressMs = null;
    this.powerBar.clear();
    if (!this.canUsePowerKey()) return;
    if (this.phoneState === 'on' || this.phoneState === 'standby') {
      this.phone.setScreenOn(true);
      this.openPowerMenu();
    } else if (this.phoneState === 'off') {
      this.bootPhone();
    }
  }

  openPowerMenu() {
    this.setPhoneState('menu');
    this.phoneMenuView.setVisible(true);
    this.setMenuInteractive(true);
    this.phone.vibrate();
    UI.sound('popup');
  }

  closePowerMenu() {
    if (this.phoneState !== 'menu') return;
    this.hidePowerMenu();
    this.setPhoneState('on');
  }

  hidePowerMenu() {
    this.phoneMenuView.setVisible(false);
    this.setMenuInteractive(false);
  }

  /** Menü-Einträge nur klickbar, solange das Menü sichtbar ist. */
  setMenuInteractive(isOn) {
    if (!this.powerMenuEntries) return;
    this.powerMenuEntries.forEach(({ hit }) => {
      if (hit.input) hit.input.enabled = isOn;
    });
    const dim = this.phoneMenuView ? this.phoneMenuView.list[0] : null;
    if (dim && dim.input) dim.input.enabled = isOn;
  }

  handlePowerMenu(id) {
    if (this.phoneState !== 'menu' || this.isFinished) return;
    if (id === 'restart') this.restartPhone();
    else if (id === 'off') this.shutDownPhone();
    else {
      this.closePowerMenu();
      this.toast(this.texts.toastEmergency);
    }
  }

  /** „Neu starten“: schwarz, Spinner, dann Boot. */
  restartPhone() {
    this.hidePowerMenu();
    this.setPhoneState('shutting-down');
    UI.sound('disconnect');
    this.phone.setWifiState('off');
    this.showBootScreen(this.texts.phoneRestarting);
    this.time.delayedCall(Ch5HelpdeskScene.TIMING.SHUTDOWN_MS + Ch5HelpdeskScene.TIMING.BOOT_MS, () => this.finishBoot());
  }

  /** „Ausschalten“: Handy bleibt aus, bis die Power-Taste wieder lange gedrückt wird. */
  shutDownPhone() {
    this.hidePowerMenu();
    this.setPhoneState('shutting-down');
    UI.sound('disconnect');
    this.phone.setWifiState('off');
    this.showBootScreen(this.texts.phoneShuttingDown);
    this.time.delayedCall(Ch5HelpdeskScene.TIMING.SHUTDOWN_MS, () => {
      if (this.isFinished) return;
      this.hideBootScreen();
      this.phone.setScreenOn(false);
      this.setPhoneState('off');
      this.setObjective(this.texts.objectivePhoneOff);
      this.setTip(this.texts.tipPhoneOff);
    });
  }

  /** Einschalten aus dem ausgeschalteten Zustand. */
  bootPhone() {
    this.setPhoneState('booting');
    this.phone.setScreenOn(true);
    this.showBootScreen(this.texts.phoneBooting);
    this.time.delayedCall(Ch5HelpdeskScene.TIMING.BOOT_MS, () => this.finishBoot());
  }

  /** Boot fertig: Erfolg „Aus und wieder an“, Sperrbildschirm, dann WLAN verbinden. */
  finishBoot() {
    if (this.isFinished) return;
    this.setPhoneState('booting');
    this.achievement('TURNED_OFF_ON');
    this.bootSpinner.stop();
    this.bootText.setText('');
    this.lockClock.setText(this.phone.getClockText());
    this.time.delayedCall(Ch5HelpdeskScene.TIMING.LOCKSCREEN_MS, () => {
      if (this.isFinished) return;
      this.hideBootScreen();
      this.wifiStatusText.setText(this.texts.phoneStatusConnecting).setColor(CONFIG.CSS.TEXT_MUTED);
      this.phone.setWifiState('connecting');
      this.time.delayedCall(Ch5HelpdeskScene.TIMING.CONNECTING_MS, () => this.handlePhoneReconnected());
    });
  }

  /** Nach dem Neustart: gelöst (Finale) – oder weiter gesperrt (zu früh neu gestartet). */
  handlePhoneReconnected() {
    if (this.isFinished) return;
    const result = this.session.completeRestart();
    this.setPhoneState('on');
    if (result.solved) {
      this.solveChapter({ solvedBy: 'player' });
      return;
    }
    this.wifiStatusText.setText(this.texts.phoneStatusAuth).setColor(CONFIG.CSS.DANGER);
    this.phone.setWifiState('off');
    const F = Ch5HelpdeskScene.LAYOUT.FEEDBACK;
    this.penalty(Ch5Logic.BALANCE.EARLY_RESTART_MINUTES, this.texts.reasonEarlyRestart, {
      x: this.powerCenter.x + F.PHONE_OFFSET_X, y: this.powerCenter.y + F.PHONE_OFFSET_Y,
    });
    this.toast(this.texts.toastEarlyRestart);
    this.restorePhaseGuidance();
  }

  showBootScreen(text) {
    this.phone.setStatusBarColor(CONFIG.COLORS.SHADOW);
    this.phoneBootView.setVisible(true);
    this.lockClock.setText('');
    this.bootText.setText(text);
    this.bootSpinner.start();
  }

  hideBootScreen() {
    this.bootSpinner.stop();
    this.phoneBootView.setVisible(false);
    this.phone.setStatusBarColor(null);
  }

  setPhoneState(state) {
    this.phoneState = state;
  }

  /** Benachrichtigungskarte auf dem Handy: 'locked' | 'unlocked' | 'solved'. */
  updatePhoneCard(state) {
    const C = CONFIG.COLORS;
    const texts = this.texts;
    const variants = {
      locked: [texts.phoneLockedTitle, texts.phoneLockedText, C.DANGER, CONFIG.CSS.DANGER],
      unlocked: [texts.phoneUnlockedTitle, texts.phoneUnlockedText, C.WARNING, CONFIG.CSS.WARNING],
      solved: [texts.phoneSolvedTitle, texts.phoneSolvedText, C.SUCCESS, CONFIG.CSS.SUCCESS],
    };
    const [title, text, color, css] = variants[state] || variants.locked;
    const U = Ch5HelpdeskScene.LAYOUT.PHONE_UI;
    const box = this.cardBox;
    this.cardGfx.clear();
    this.cardGfx.fillStyle(C.SURFACE_ALT, 1).fillRoundedRect(box.x, box.y, box.width, box.height, U.CARD_RADIUS);
    this.cardGfx.fillStyle(color, 1).fillRoundedRect(box.x + U.CARD_STRIPE_X, box.y + U.CARD_STRIPE_INSET, 4,
      box.height - 2 * U.CARD_STRIPE_INSET, 2);
    this.cardTitle.setText(title).setColor(css);
    this.cardText.setText(text);
  }

  // ===========================================================================
  // Abschluss
  // ===========================================================================

  /** Ticket gelöst: alles aufräumen, Handy verbunden, Stempel „GELÖST“, Erfolge, succeed(). */
  solveChapter({ solvedBy = 'player' } = {}) {
    if (this.isFinished) return;
    const texts = this.texts;
    this.viewPhase = Ch5Logic.PHASES.DONE;
    this.scriptToken += 1;
    this.isScriptRunning = false;
    this.isAnswering = false;
    this.powerPressMs = null;
    this.powerBar.clear();
    this.stopHoldMusic();
    this.clearOptions();
    if (this.holdPanel) {
      this.holdPanel.destroy();
      this.holdPanel = null;
    }
    [...this.popups].forEach((popup) => this.closePopup(popup));
    this.removeForm();
    this.buildChat();
    this.setTyping(null);
    this.browser.setLoading(false); // falls gerade „Ticket wird gesendet“ lief

    this.hidePowerMenu();
    this.hideBootScreen();
    this.phone.setScreenOn(true);
    this.setPhoneState('on');
    this.phone.setWifiState('connected', 4);
    this.wifiStatusText.setText(texts.phoneStatusConnected).setColor(CONFIG.CSS.SUCCESS);
    this.updatePhoneCard('solved');
    this.powerTag.setVisible(false);
    this.isPowerKeyMarked = false;
    this.tweens.killTweensOf(this.powerHighlight);
    this.powerHighlight.setAlpha(0);
    UI.sound('connect');

    this.updateTicketStatus();
    // Kopfzeile mit Ticketnummer (auch wenn debugSolve direkt aus dem Formular kommt)
    this.ticketLabel.setText(Ch5Logic.format(texts.headerTicket, {
      ticketId: this.session.getTicketId(), category: this.session.getCategoryLabel(),
    }));
    this.addBubble({ kind: 'agent', name: this.agentName('second'), text: texts.solved });
    this.addBubble({ kind: 'system', text: Ch5Logic.format(texts.solvedSystem, { ticketId: this.session.getTicketId() }) });
    this.setObjective(texts.objectiveDone);
    this.setTip(texts.tipDone);
    // Erfolg nur für echtes Spielen – debugSolve ist keine Leistung (ARCHITECTURE.md 9.6)
    if (solvedBy === 'player') this.achievement('HELPDESK_HERO');
    const stampPos = this.stampPosition();
    ChapterScene.safely(() => FX.stamp(this, texts.stampSolved, {
      x: stampPos.x, y: stampPos.y, color: CONFIG.COLORS.SUCCESS, angle: -8, sound: false,
      hold: Ch5HelpdeskScene.TIMING.SOLVED_STAMP_HOLD_MS,
    }));
    const state = this.session.getDebugState();
    this.succeed({
      solvedBy,
      wrongAnswers: state.wrongTotal,
      trapsClicked: this.trapClicks,
      popupsClosed: this.popupsClosed,
      sessionTimeouts: this.sessionTimeouts,
      phished: this.context.isPhished,
    });
  }

  /**
   * Löst das Kapitel wie ein perfekter Spieler (Formular, alle Runden, Neustart) – aus jedem
   * Zustand, ohne Strafen und ohne Kapitel-Erfolge. Laufende Skripte, Pop-ups, Warteschleife,
   * Power-Menü und Boot-Timer räumt solveChapter() ab.
   */
  debugSolve() {
    if (this.isFinished || !this.session) return;
    this.session.solvePerfectly();
    this.solveChapter({ solvedBy: 'debug' });
  }

  /** Zustand für Tests: Phase, Runde, Buttons/Pop-ups/Handy mit Klick-Koordinaten. */
  getDebugInfo() {
    const base = super.getDebugInfo();
    if (!this.session) return { ...base, step: 'init' };
    const state = this.session.getDebugState();
    const centerOf = (x, y, width, height) => ({ x: Math.round(x + width / 2), y: Math.round(y + height / 2) });
    const boundsCenter = (obj) => {
      const b = obj.getBounds();
      return { x: Math.round(b.centerX), y: Math.round(b.centerY) };
    };
    return {
      ...base,
      step: this.isFinished ? Ch5Logic.PHASES.DONE : this.viewPhase,
      phase: state.phase,
      roundId: state.roundId,
      progress: state.progress,
      statusLabel: state.statusLabel,
      wrongInRound: state.wrongInRound,
      wrongTotal: state.wrongTotal,
      queuePosition: state.queuePosition,
      ticketId: state.ticketId,
      isTyping: this.isScriptRunning,
      isAnswering: this.isAnswering,
      canAnswer: !this.isScriptRunning && !this.isAnswering && this.optionButtons.length > 0,
      options: this.optionButtons.map((b) => ({
        id: b.optionId, label: b.optionLabel, isCorrect: b.isCorrectOption, isEnabled: b.isEnabled(), ...centerOf(b.x, b.y, b.width, b.height),
      })),
      popups: this.popups.map((p) => ({
        id: p.id,
        type: p.type,
        isReady: p.isReady,
        remainingMs: Math.max(0, Math.round(p.remainingMs || 0)),
        close: p.closeCenter,
        actions: p.actionButtons.map(({ action, button }) => ({
          id: action.id, isTrap: Boolean(action.trap), ...centerOf(p.container.x + button.x, p.container.y + button.y, button.width, button.height),
        })),
      })),
      form: this.formCenters ? { ...this.formCenters, message: this.formMessage ? this.formMessage.text : '' } : null,
      phone: {
        state: this.phoneState,
        wifi: this.phone.getWifiState().state,
        power: this.powerCenter,
        menu: this.phoneMenuView.visible ? this.powerMenuEntries.map(({ id, hit }) => ({ id, ...boundsCenter(hit) })) : [],
      },
      mercyRounds: [...this.mercyRounds],
      tip: this.tipText.text,
      tipIsMercy: this.tipTitle.text === this.texts.tipMercyTitle,
      holdMusic: this.isHoldMusicOn,
      trapsClicked: this.trapClicks,
      popupsClosed: this.popupsClosed,
      sessionTimeouts: this.sessionTimeouts,
      officeHoursOpen: this.lastHoursOpen,
      elapsedMs: Math.round(this.elapsedMs),
    };
  }
}
