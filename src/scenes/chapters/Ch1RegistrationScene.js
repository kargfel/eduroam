/**
 * Ch1RegistrationScene.js – Kapitel 1 „Die Registrierung“ (Self-Service-Portal).
 *
 * Links auf dem Schreibtisch: der Begrüßungsbrief (Kopierpapier, leicht schräg) mit
 * Kennung, Kurs und dem Initialpasswort voller verwechselbarer Zeichen (I l 1 O 0), daneben
 * die Lupe und ein Post-it mit Tipps (die Spielebene sagt immer klar, was zu tun ist).
 * Rechts das Self-Service-Portal im Browserfenster (UI.Window 'browser'), das über „EDGE“
 * lädt. Fünf Stationen:
 *   1. Login – Lupe kostet Zeit, nach 3 Fehlern rettet der Kopierer (keine Sackgasse)
 *   2. CAPTCHA „Wähle alle Bilder mit Access Points“ – Bilderrätsel als Popup über der Seite
 *      (wie das Original), der erste Versuch scheitert immer
 *   3. Nutzungsordnung – „Akzeptieren“ erst am Ende, Geheimwort in § 14 → TOS_READER
 *   4. Neues Passwort – Regeln erscheinen nacheinander („Password Game“), dann wiederholen
 *   5. Synchronisation „bis zu 24 h“ – warten (+24 h) oder neu laden (je +1 min, 3–6×)
 * Regeln, Texte und Zufall stehen in Ch1Logic; diese Szene zeichnet und verbucht
 * Fehlversuche/Strafen über die ChapterScene-Helfer.
 *
 * Gestaltung: Alle Texte mindestens 13 px. Rückmeldungen, die unten mittig als Toast das
 * Post-it oder Bedienelemente verdecken würden, stehen in der Seite (Infokasten, Hinweiszeile);
 * die übrigen Toasts sind schmal umbrochen (siehe Ch1Logic.TEXT).
 *
 * Global: Ch1RegistrationScene.
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, CAMPUS, GameState, UI (+ Widgets), FX,
 * RNG (über Ch1Logic), Ch1Logic, ChapterScene.
 */

class Ch1RegistrationScene extends ChapterScene {
  /** Layout (px, Spielkoordinaten 800×600; Kapitel-Fläche ab y = 48). */
  static LAYOUT = Object.freeze({
    LETTER: Object.freeze({
      X: 14, Y: 56, WIDTH: 244, HEIGHT: 400, ANGLE: -2, PAD: 14, SHADOW: 6, SHADOW_ALPHA: 0.35,
      LOGO_W: 46, LOGO_H: 20, LOGO_GAP: 8,
      RECIPIENT_Y: 44, SUBJECT_Y: 64, BODY_Y: 86,
      // Zugangsdaten-Kasten: oben Kennung | Kurs nebeneinander, darunter das Initialpasswort
      CRED_Y: 160, CRED_H: 124, CRED_PAD: 8, CRED_COL2_X: 112,
      CRED_LABEL1_Y: 6, CRED_VALUE1_Y: 22, CRED_LABEL2_Y: 46, CRED_VALUE2_Y: 62,
      FOOT_Y: 292, CLOSING_Y: 346, SIGNATURE_Y: 364,
      COFFEE_X: 214, COFFEE_Y: 34, COFFEE_R: 21, COFFEE_INNER: 4,
      // Lupe-Knopf: nicht gedreht, im Zugangsdaten-Kasten unter dem Initialpasswort (Versatz zur Brief-Ecke)
      MAGNIFIER_X: 22, MAGNIFIER_Y: 253, MAGNIFIER_W: 142, MAGNIFIER_H: 26,
    }),
    LENS: Object.freeze({
      X: 16, Y: 304, WIDTH: 240, HEIGHT: 155, PAD: 12, RADIUS: 10, BORDER: 3, SHADOW: 5,
      TITLE_Y: 9, CELLS_Y: 31, CELL_W: 19, CELL_H: 28, LEGEND_Y: 66, LEGEND_LINE: 16.5, LEGEND_CHAR_X: 22, LEGEND_LABEL_X: 40,
      RING_X: 222, RING_Y: 18, RING_R: 7, HANDLE: 6,
    }),
    POSTIT: Object.freeze({
      X: 22, Y: 464, WIDTH: 228, HEIGHT: 126, ANGLE: 1.5, PAD: 12, TAPE_W: 64, TAPE_H: 14, TAPE_ANGLE: -4,
      SHADOW: 4, SHADOW_ALPHA: 0.3, PULSE_SCALE: 1.04,
    }),
    BROWSER: Object.freeze({ X: 270, Y: 56, WIDTH: 518, HEIGHT: 538, CORNER: 9 }),
    PAGE: Object.freeze({
      PAD: 22, HEADER_H: 40, STATUS_H: 22, LOGO_Y: 10, DOT_R: 3.5, DOT_GAP: 12, STATUS_PAD: 10,
      SIGNAL_W: 3, SIGNAL_GAP: 2, SIGNAL_H: 11, SIGNAL_BARS: 4, SIGNAL_ON: 2, TITLE_Y: 14,
      SPINNER: 30, LOADING_GAP: 12, FEEDBACK_Y: 330,
    }),
    FIELD: Object.freeze({ WIDTH: 300, HEIGHT: 38, BLOCK: 90, BUTTON_H: 40, LABEL_SPACE: 22 }),
    LOGIN: Object.freeze({
      INTRO_Y: 48, FIELDS_Y: 88, BUTTON_W: 140, LINK_X: 150, LINK_W: 170, BANNER_GAP: 50, BANNER_H: 44,
      NOTICE_GAP: 18, NOTICE_PAD: 10, NOTICE_TEXT_Y: 31, NOTICE_H: 128, NOTICE_RADIUS: 6,
    }),
    CAPTCHA: Object.freeze({
      // Seite: Erklärung, „Ich bin kein Roboter“-Kasten, Infokasten „Angemeldet als …“
      INTRO_Y: 46, ROBOT_Y: 96, ROBOT_W: 320, ROBOT_H: 74, ROBOT_RADIUS: 4, CHECK: 28, CHECK_STROKE: 4, CHECK_X: 14,
      LABEL_X: 54, BRAND_PAD: 12, LEGAL_GAP: 6, PASSED_GAP: 16, INFO_GAP: 66, INFO_PAD: 12, INFO_TEXT_GAP: 6, INFO_RADIUS: 6,
      // Bilderrätsel: eigenes Popup über der Seite (wie das Original), Kachelgröße aus der Höhe
      POPUP_MARGIN: 8, BACKDROP_ALPHA: 0.62, COLS: 3, PAD_IN: 8, HEADER_H: 68, GRID_GAP: 4, ERROR_H: 20, FOOTER_H: 42,
      TILE_MAX: 90, HEADER_TEXT_X: 12, PROMPT_Y: 8, TARGET_Y: 25, INSTRUCTION_Y: 50,
      CONFIRM_W: 116, CONFIRM_H: 32, ICON_GAP: 4, BADGE_R: 11, BADGE_INSET: 14, SELECT_SCALE: 0.82,
      LABEL_H: 20, FADE_STAGGER_MS: 25, SHADOW: 4,
    }),
    TOS: Object.freeze({
      SUB_Y: 42, PANEL_Y: 64, BOTTOM: 118, PROGRESS_GAP: 10, BAR_W: 110, BAR_H: 6, BAR_Y: 6,
      PERCENT_X: 120, HINT_X: 226, REMARKS_GAP: 42, ACCEPT_W: 160, ACCEPT_H: 36, FIELD_GAP: 16,
    }),
    PASSWORD: Object.freeze({
      INTRO_Y: 40, FIELD_Y: 62, NEXT_GAP: 16, NEXT_W: 130, HEADING_Y: 148, RULES_Y: 168,
      ROW_H: 22, ROW_CURRENT_H: 44, ICON_X: 10, ICON_Y: 11, ICON_R: 7, TEXT_X: 24, TEXT_Y: 3, DETAIL_Y: 22,
      STATUS_PAD: 8, ACCENT_W: 3, SUMMARY_Y: 148, CONFIRM_INTRO_Y: 176, CONFIRM_FIELD_Y: 204, SAVE_Y: 292,
      SAVE_W: 190, BACK_GAP: 14, BACK_W: 190,
    }),
    SYNC: Object.freeze({
      INTRO_Y: 46, BOX_Y: 104, BOX_H: 100, BOX_RADIUS: 8, ICON_X: 18, ICON_Y: 24, ICON_SIZE: 28,
      TEXT_X: 60, LABEL_Y: 12, STATUS_Y: 32, CHECK_Y: 76, BUTTONS_Y: 222, BUTTON_W: 200, BUTTON_H: 42,
      BUTTON_GAP: 14, COUNTER_Y: 276, HINT_Y: 220, CONTINUE_Y: 270, CONTINUE_W: 220, CONTINUE_H: 44,
    }),
  });

  /** Schriftgrößen (px). Untergrenze 13 px – alles, was man lesen soll, bleibt lesbar. */
  static TEXT_SIZE = Object.freeze({
    TEXT: 13, LEAD: 14, VALUE: 15, PASSWORD: 17, LABEL: 15,
    HAND: 14.5, HAND_SMALL: 13, SIGNATURE: 18, LENS: 19, TARGET: 20, TITLE: 21,
  });

  /** Dauern (echte ms). */
  static TIMING = Object.freeze({ PASS_DELAY_MS: 900, FADE_MS: 200, SELECT_MS: 90, LONG_TOAST_MS: 4200, STAMP_HOLD_MS: 900 });

  /** Zeichenebenen innerhalb der Szene (alles unter Modal/FX/Toast). */
  static DEPTHS = Object.freeze({
    DESK: CONFIG.DEPTH.CONTENT,
    WINDOW: CONFIG.DEPTH.CONTENT,
    PAGE: CONFIG.DEPTH.CONTENT + 1,
    PAGE_FRONT: CONFIG.DEPTH.CONTENT + 2,
    LENS: CONFIG.DEPTH.CONTENT + 3,
    POPUP: CONFIG.DEPTH.CONTENT + 4,
    POPUP_FRONT: CONFIG.DEPTH.CONTENT + 5,
  });

  /** Farben der gezeichneten CAPTCHA-Bilder und Schreibtisch-Details (Illustration, kein UI). */
  static ART = Object.freeze({
    CEILING: 0xdfe2dc, CEILING_LINE: 0xc9cdc6, WALL: 0xe8e2d5, DESK: 0xa77b52, DESK_EDGE: 0x8c6440,
    SKY: 0xa9d2f3, HILL: 0x6f9a5b, DEVICE: 0xfbfbf9, DEVICE_EDGE: 0xc8ccc6, DEVICE_PRINT: 0xaeb4ba,
    LED_BLUE: 0x1a73e8, LED_RED: 0xe2001a, LED_GREEN: 0x34a853, ROUTER: 0x263238, ANTENNA: 0x37474f,
    LAMP_GLOW: 0xffefa8, LAMP: 0xfffbe8, LAMP_EDGE: 0xe2d9a6, BEAMER: 0xeceff1, BEAMER_EDGE: 0xaab2b8,
    LENS: 0x37474f, LENS_SHINE: 0x9fb3bd, POLE: 0x9aa0a6, BREZEL: 0xa0612b, SALT: 0xffffff,
    TOWER: 0xddd7c9, TOWER_CABIN: 0x7d848a, TOWER_WINDOW: 0xcfd8dc,
    COFFEE: 0x8d6e63, SIGNATURE: 0x2a4a8a, TAPE: 0xffffff, LENS_RING: 0x5f6368,
  });

  constructor() {
    super(1);
  }

  // ===========================================================================
  // Lebenszyklus
  // ===========================================================================

  /** Baut Schreibtisch und Browser und lädt die erste Portalseite über „EDGE“. */
  create() {
    this.initChapter();
    this.txt = Ch1Logic.texts(CAMPUS);
    this.resetState();
    this.buildLetter();
    this.buildPostIt();
    this.buildBrowser();
    this.onKey(this.handleKeyDown);
    this.loadPage('login', { isFirst: true });
  }

  /**
   * Mitleids-Tipp, wenn man zu lange an derselben Passwort-Regel hängt (Szenen-Zeit,
   * pausiert also mit der Szene).
   * @param {number} time
   * @param {number} delta ms seit dem letzten Frame
   */
  update(time, delta) {
    if (this.isFinished || this.isLoading || this.step !== 'password' || this.passwordPhase !== 'rules') return;
    const evaluation = this.passwordEvaluation;
    if (!evaluation || evaluation.firstFailingIndex < 0 || this.stuckTipShown) return;
    this.stuckMs += delta;
    if (this.stuckMs >= Ch1Logic.BALANCE.STUCK_TIP_MS) {
      this.stuckTipShown = true;
      this.showRuleHint(evaluation);
    }
  }

  /** Setzt alle Instanzfelder (create() läuft nach scene.restart() erneut). */
  resetState() {
    const B = Ch1Logic.BALANCE;
    this.step = 'login';
    this.isLoading = false;
    this.loadTimer = null;
    this.pageObjects = [];
    this.dataVolumeMb = B.DATA_VOLUME_MB;
    this.currentTip = '';
    this.isSolving = false;
    // Station 1
    this.loginFails = 0;
    this.lastLoginCode = null;
    this.usedMagnifier = false;
    this.usedCopier = false;
    this.lens = null;
    this.magnifierButton = null;
    // Station 2
    this.captchaStarted = false;
    this.captchaPassed = false;
    this.captchaRound = 1;
    this.captchaErrors = 0;
    this.captchaGrid = null;
    this.captchaSelected = new Set();
    this.captchaLabelsShown = false;
    this.captchaReadyAt = 0;
    // Station 3 (Zufall in fester Reihenfolge → reproduzierbar mit ?seed=)
    this.secretWord = Ch1Logic.pickSecretWord(undefined, CAMPUS);
    this.tosProgress = 0;
    this.tosUnlocked = false;
    this.tosReader = false;
    // Station 4
    this.passwordPhase = 'rules';
    this.passwordRevealed = Ch1Logic.INITIAL_REVEALED;
    this.passwordEvaluation = null;
    this.newPassword = null;
    this.twistHits = 0;
    this.confirmFails = 0;
    this.credentialsSaved = false;
    this.stuckMs = 0;
    this.stuckRuleIndex = -1;
    this.stuckTipShown = false;
    // Station 5
    this.syncPlan = Ch1Logic.createSyncPlan(undefined, CAMPUS);
    this.syncReloads = 0;
    this.syncDone = false;
    this.syncStampShown = false;
    this.setbackShown = false;
    this.waited24h = false;
    this.resetPageRefs();
  }

  /** Verweise auf Objekte der aktuellen Portalseite (werden beim Seitenwechsel zerstört). */
  resetPageRefs() {
    this.usernameInput = null;
    this.passwordInput = null;
    this.loginButton = null;
    this.forgotButton = null;
    this.loginBanner = null;
    this.loginBannerText = null;
    this.robotHit = null;
    this.robotSquare = null;
    this.robotCheck = null;
    this.robotSpinner = null;
    this.robotLabel = null;
    this.robotPassedText = null;
    this.captchaGeometry = null;
    this.challengeObjects = [];
    this.captchaTiles = [];
    this.captchaErrorText = null;
    this.captchaConfirmButton = null;
    this.captchaReloadButton = null;
    this.captchaAudioButton = null;
    this.tosPanel = null;
    this.tosPanelRect = null;
    this.tosBar = null;
    this.tosPercentText = null;
    this.tosHintText = null;
    this.remarksInput = null;
    this.acceptButton = null;
    this.newPasswordInput = null;
    this.nextButton = null;
    this.rulesHeading = null;
    this.ruleRows = [];
    this.confirmObjects = [];
    this.confirmInput = null;
    this.saveButton = null;
    this.backButton = null;
    this.reloadButton = null;
    this.waitButton = null;
    this.continueButton = null;
  }

  // ===========================================================================
  // Schreibtisch: Brief, Lupe, Post-it
  // ===========================================================================

  /** Begrüßungsbrief auf Kopierpapier (−2°), dazu der Lupe-Knopf (gerade, klar bedienbar). */
  buildLetter() {
    const L = Ch1RegistrationScene.LAYOUT.LETTER;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const A = Ch1RegistrationScene.ART;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = this.txt.letter;
    const left = -L.WIDTH / 2;
    const top = -L.HEIGHT / 2;
    const x = left + L.PAD;
    const wrap = L.WIDTH - 2 * L.PAD;
    const paper = (dy, str, opts) => UI.text(this, x, top + dy, str, { font: 'PAPER', color: CSS.INK, ...opts });

    const letter = this.add.container(L.X + L.WIDTH / 2, L.Y + L.HEIGHT / 2).setDepth(Ch1RegistrationScene.DEPTHS.DESK);
    letter.add(this.add.rectangle(left + L.SHADOW, top + L.SHADOW, L.WIDTH, L.HEIGHT, C.SHADOW, L.SHADOW_ALPHA).setOrigin(0));
    letter.add(this.add.rectangle(left, top, L.WIDTH, L.HEIGHT, C.PAPER).setOrigin(0));

    // Kaffeerand – der Brief lag schon eine Woche auf dem Küchentisch
    const coffee = this.add.graphics();
    coffee.lineStyle(3, A.COFFEE, 0.18).strokeCircle(left + L.COFFEE_X, top + L.COFFEE_Y, L.COFFEE_R);
    coffee.lineStyle(1.5, A.COFFEE, 0.12).strokeCircle(left + L.COFFEE_X + 2, top + L.COFFEE_Y + 1, L.COFFEE_R - L.COFFEE_INNER);
    letter.add(coffee);

    // Briefkopf: Logo + Absender
    letter.add(this.add.rectangle(x, top + L.PAD, L.LOGO_W, L.LOGO_H, C.DHBW_RED).setOrigin(0));
    letter.add(UI.text(this, x + L.LOGO_W / 2, top + L.PAD + L.LOGO_H / 2, T.brand,
      { size: S.TEXT, bold: true, color: CSS.WHITE, origin: 0.5 }));
    letter.add(UI.text(this, x + L.LOGO_W + L.LOGO_GAP, top + L.PAD + L.LOGO_H / 2, T.sender,
      { size: S.LEAD, bold: true, color: CSS.INK, origin: { x: 0, y: 0.5 } }));
    letter.add(paper(L.RECIPIENT_Y, T.recipient, { size: S.TEXT }));
    letter.add(paper(L.SUBJECT_Y, T.subject, { size: S.TEXT, bold: true, wrap }));
    letter.add(paper(L.BODY_Y, T.body, { size: S.TEXT, wrap, lineSpacing: 2 }));

    // Zugangsdaten-Kasten: Kennung | Kurs, darunter das Initialpasswort in einer Schrift,
    // in der I, l, 1, O, 0 verschwimmen
    const credTop = top + L.CRED_Y;
    letter.add(this.add.rectangle(x, credTop, wrap, L.CRED_H, C.PAPER_SHADE, 0.55).setOrigin(0).setStrokeStyle(1, C.INK_MUTED, 0.35));
    const credX = x + L.CRED_PAD;
    const label = (lx, ly, str) => UI.text(this, lx, credTop + ly, str, { font: 'PAPER', size: S.TEXT, color: CSS.INK_MUTED });
    letter.add(label(credX, L.CRED_LABEL1_Y, T.usernameLabel));
    letter.add(UI.text(this, credX, credTop + L.CRED_VALUE1_Y, CAMPUS.username, { size: S.VALUE, bold: true, color: CSS.INK }));
    letter.add(label(credX + L.CRED_COL2_X, L.CRED_LABEL1_Y, T.courseLabel));
    letter.add(UI.text(this, credX + L.CRED_COL2_X, credTop + L.CRED_VALUE1_Y, CAMPUS.course, { size: S.VALUE, bold: true, color: CSS.INK }));
    letter.add(label(credX, L.CRED_LABEL2_Y, T.passwordLabel));
    this.letterPassword = UI.text(this, credX, credTop + L.CRED_VALUE2_Y, CAMPUS.initialPassword, { size: S.PASSWORD, color: CSS.INK });
    letter.add(this.letterPassword);

    letter.add(paper(L.FOOT_Y, T.footnote, { size: S.TEXT, wrap, lineSpacing: 2 }));
    letter.add(paper(L.CLOSING_Y, T.closing, { size: S.TEXT }));
    letter.add(UI.text(this, x, top + L.SIGNATURE_Y, T.signature, { font: 'HAND', size: S.SIGNATURE, color: '#' + A.SIGNATURE.toString(16).padStart(6, '0') }));
    letter.setAngle(L.ANGLE);
    this.letter = letter;

    this.magnifierButton = new UI.Button(this, L.X + L.MAGNIFIER_X, L.Y + L.MAGNIFIER_Y, {
      text: T.magnifierButton,
      variant: 'secondary',
      width: L.MAGNIFIER_W,
      height: L.MAGNIFIER_H,
      fontSize: S.TEXT,
      onClick: () => this.useMagnifier(),
    }).setDepth(Ch1RegistrationScene.DEPTHS.LENS);
  }

  /** Post-it unter dem Brief: hier stehen die Tipps (Handschrift, leicht schräg, Klebestreifen). */
  buildPostIt() {
    const P = Ch1RegistrationScene.LAYOUT.POSTIT;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const A = Ch1RegistrationScene.ART;
    const C = CONFIG.COLORS;
    const left = -P.WIDTH / 2;
    const top = -P.HEIGHT / 2;
    const note = this.add.container(P.X + P.WIDTH / 2, P.Y + P.HEIGHT / 2).setDepth(Ch1RegistrationScene.DEPTHS.DESK);
    note.add(this.add.rectangle(left + P.SHADOW, top + P.SHADOW, P.WIDTH, P.HEIGHT, C.SHADOW, P.SHADOW_ALPHA).setOrigin(0));
    note.add(this.add.rectangle(left, top, P.WIDTH, P.HEIGHT, C.POSTIT).setOrigin(0));
    note.add(this.add.rectangle(0, top, P.TAPE_W, P.TAPE_H, A.TAPE, 0.55).setAngle(P.TAPE_ANGLE));
    this.tipText = UI.text(this, left + P.PAD, top + P.PAD, '', {
      font: 'HAND', size: S.HAND, color: CONFIG.CSS.INK, wrap: P.WIDTH - 2 * P.PAD, lineSpacing: 2,
    });
    note.add(this.tipText);
    note.setAngle(P.ANGLE);
    this.postit = note;
  }

  /**
   * Neuer Tipp auf dem Post-it. Mitleids-Tipps (isPity) machen kurz auf sich aufmerksam.
   * @param {string} text
   * @param {{isPity?: boolean}} [opts]
   */
  setTip(text, { isPity = false } = {}) {
    if (!this.tipText || !text || text === this.currentTip) return;
    const P = Ch1RegistrationScene.LAYOUT.POSTIT;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    this.currentTip = text;
    this.tipText.setFontSize(S.HAND).setText(text);
    if (this.tipText.height > P.HEIGHT - 2 * P.PAD) this.tipText.setFontSize(S.HAND_SMALL);
    if (isPity) {
      UI.sound('notify');
      ChapterScene.safely(() => FX.pulse(this, this.postit, { scale: P.PULSE_SCALE }));
    }
  }

  /** Lupe benutzen: kostet Zeit, zeigt jedes Zeichen eindeutig. */
  useMagnifier() {
    if (this.isFinished || this.usedMagnifier) return;
    const L = Ch1RegistrationScene.LAYOUT;
    this.usedMagnifier = true;
    this.destroyMagnifierButton();
    this.showLens({ isCopier: false });
    this.penalty(Ch1Logic.BALANCE.MAGNIFIER_MINUTES, this.txt.reasons.magnifier,
      { x: L.LENS.X + L.LENS.WIDTH / 2, y: L.LENS.Y });
    if (this.step === 'login') this.setTip(this.txt.tips.magnifier);
  }

  /**
   * Lupen-Ansicht auf dem Brief: Passwort in eindeutiger Schrift, verwechselbare Zeichen
   * markiert und buchstabiert (Ida, Ludwig, Otto …).
   * @param {{isCopier: boolean}} opts isCopier = Ausdruck vom Kopierer statt Lupe
   */
  showLens({ isCopier }) {
    const L = Ch1RegistrationScene.LAYOUT.LENS;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const A = Ch1RegistrationScene.ART;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = this.txt.letter;
    if (this.lens) this.lens.destroy();
    const lens = this.add.container(L.X, L.Y).setDepth(Ch1RegistrationScene.DEPTHS.LENS);
    const g = this.add.graphics();
    g.fillStyle(C.SHADOW, 0.3).fillRoundedRect(L.SHADOW, L.SHADOW, L.WIDTH, L.HEIGHT, L.RADIUS);
    g.fillStyle(C.SURFACE, 1).fillRoundedRect(0, 0, L.WIDTH, L.HEIGHT, L.RADIUS);
    g.lineStyle(L.BORDER, isCopier ? C.BORDER : A.LENS_RING, 1).strokeRoundedRect(0, 0, L.WIDTH, L.HEIGHT, L.RADIUS);
    // kleines Lupen-Symbol oben rechts
    g.lineStyle(2, A.LENS_RING, 1).strokeCircle(L.RING_X, L.RING_Y, L.RING_R);
    g.lineBetween(L.RING_X + L.RING_R * 0.7, L.RING_Y + L.RING_R * 0.7, L.RING_X + L.RING_R * 0.7 + L.HANDLE, L.RING_Y + L.RING_R * 0.7 + L.HANDLE);
    lens.add(g);
    const title = isCopier ? T.copierTitle : T.magnifierTitle;
    lens.add(UI.text(this, L.PAD, L.TITLE_Y, title, { size: S.TEXT, bold: true, color: CSS.TEXT, wrap: L.RING_X - L.RING_R - 2 * L.PAD }));

    const cells = Ch1Logic.magnifyPassword(CAMPUS.initialPassword);
    const cellsX = Math.round((L.WIDTH - cells.length * L.CELL_W) / 2);
    cells.forEach((cell, index) => {
      const cx = cellsX + index * L.CELL_W;
      const box = this.add.rectangle(cx + 1, L.CELLS_Y, L.CELL_W - 2, L.CELL_H, cell.isConfusable ? C.HAZARD : C.SURFACE_ALT,
        cell.isConfusable ? 0.35 : 1).setOrigin(0);
      lens.add(box);
      lens.add(UI.text(this, cx + L.CELL_W / 2, L.CELLS_Y + L.CELL_H / 2, cell.char,
        { font: 'MONO', size: S.LENS, bold: true, color: CSS.TEXT, origin: 0.5 }));
    });
    // Legende in Zeichen-Reihenfolge: „1. I großes I wie Ida“ – Position, Zeichen, Klartext
    cells.map((cell, position) => ({ ...cell, position })).filter((cell) => cell.isConfusable).forEach((cell, index) => {
      const y = L.LEGEND_Y + index * L.LEGEND_LINE;
      lens.add(UI.text(this, L.PAD, y, `${cell.position + 1}.`, { size: S.TEXT, color: CSS.TEXT_MUTED }));
      lens.add(UI.text(this, L.PAD + L.LEGEND_CHAR_X, y, cell.char, { font: 'MONO', size: S.LEAD, bold: true, color: CSS.TEXT }));
      lens.add(UI.text(this, L.PAD + L.LEGEND_LABEL_X, y, cell.label, { size: S.TEXT, color: CSS.TEXT }));
    });
    lens.setAlpha(0.02);
    this.tweens.add({ targets: lens, alpha: 1, duration: Ch1RegistrationScene.TIMING.FADE_MS });
    this.lens = lens;
  }

  // ===========================================================================
  // Browser: Fenster, Statusleiste, Seitenwechsel
  // ===========================================================================

  /** Browserfenster mit Statusleiste („EDGE · 47,6 MB übrig“), bleibt über alle Seiten. */
  buildBrowser() {
    const B = Ch1RegistrationScene.LAYOUT.BROWSER;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const D = Ch1RegistrationScene.DEPTHS;
    const C = CONFIG.COLORS;
    this.win = new UI.Window(this, B.X, B.Y, {
      width: B.WIDTH, height: B.HEIGHT, title: CAMPUS.portal.name, variant: 'browser', url: CAMPUS.portal.url,
    }).setDepth(D.WINDOW);
    const area = this.win.getContentArea();
    this.content = { x: Math.round(area.x), y: Math.round(area.y), width: Math.round(area.width), height: Math.round(area.height) };
    const c = this.content;
    this.body = { x: c.x, y: c.y + P.HEADER_H, width: c.width, height: c.height - P.HEADER_H - P.STATUS_H };

    this.statusBarY = c.y + c.height - P.STATUS_H;
    const bar = this.add.graphics().setDepth(D.PAGE);
    bar.fillStyle(C.SURFACE_ALT, 1).fillRoundedRect(c.x, this.statusBarY, c.width, P.STATUS_H, { tl: 0, tr: 0, bl: B.CORNER, br: B.CORNER });
    bar.lineStyle(1, C.BORDER, 1).lineBetween(c.x, this.statusBarY + 0.5, c.x + c.width, this.statusBarY + 0.5);
    const midY = this.statusBarY + P.STATUS_H / 2;
    this.statusText = UI.text(this, c.x + P.STATUS_PAD, midY, '', { size: S.TEXT, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 0, y: 0.5 }, depth: D.PAGE_FRONT });
    this.dataText = UI.text(this, c.x + c.width - P.STATUS_PAD, midY, '', { size: S.TEXT, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 1, y: 0.5 }, depth: D.PAGE_FRONT });
    this.signalIcon = this.add.graphics().setDepth(D.PAGE_FRONT);
    this.updateDataText();
  }

  /** Datenvolumen und Signalbalken in der Statusleiste aktualisieren. */
  updateDataText() {
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const C = CONFIG.COLORS;
    this.dataText.setText(Ch1Logic.FORMAT.dataLeft(this.dataVolumeMb));
    const g = this.signalIcon.clear();
    const right = this.dataText.x - this.dataText.width - P.STATUS_PAD / 2;
    const baseY = this.statusBarY + P.STATUS_H / 2 + P.SIGNAL_H / 2;
    for (let i = 0; i < P.SIGNAL_BARS; i += 1) {
      const barHeight = (P.SIGNAL_H * (i + 1)) / P.SIGNAL_BARS;
      const barX = right - (P.SIGNAL_BARS - i) * (P.SIGNAL_W + P.SIGNAL_GAP);
      g.fillStyle(i < P.SIGNAL_ON ? C.TEXT_MUTED : C.BORDER, 1).fillRect(barX, baseY - barHeight, P.SIGNAL_W, barHeight);
    }
  }

  /** @param {string} text linke Seite der Statusleiste */
  setStatus(text) {
    if (this.statusText) this.statusText.setText(text);
  }

  /**
   * Lädt eine Portalseite: leere Seite mit Spinner, Ladebalken, „Übertrage … (EDGE)“.
   * @param {string} step Station aus Ch1Logic.STEPS
   * @param {{isFirst?: boolean}} [opts] isFirst: Einwahl-Geräusch beim allerersten Laden
   */
  loadPage(step, { isFirst = false } = {}) {
    const page = Ch1Logic.PAGES[step];
    if (this.loadTimer) {
      this.loadTimer.remove(false);
      this.loadTimer = null;
    }
    this.step = step;
    this.isLoading = true;
    this.clearPage();
    this.setObjective(this.objectiveFor(step));
    this.setPageChrome(step);
    this.win.setLoading(true);
    this.setStatus(Ch1Logic.FORMAT.loading(page.sizeKb));
    this.buildLoadingIndicator();
    if (isFirst) UI.sound('modem');
    this.loadTimer = this.time.delayedCall(Ch1Logic.loadingMs(page.sizeKb), () => {
      this.loadTimer = null;
      this.dataVolumeMb = Ch1Logic.dataVolumeAfter(this.dataVolumeMb, page.sizeKb);
      this.renderPage(step);
    });
  }

  /**
   * Adresszeile und Tab-Titel für eine Station. Beim Neuladen zählt die Adresse mit –
   * wie jedes Portal mit Sitzungs-Parametern.
   * @param {string} step
   */
  setPageChrome(step) {
    const page = Ch1Logic.PAGES[step];
    const query = step === 'sync' && this.syncReloads > 0 ? `?versuch=${this.syncReloads + 1}` : '';
    this.win.setUrl(CAMPUS.portal.url + page.path + query);
    this.win.setTitle(`${page.title} – ${CAMPUS.portal.name}`);
  }

  /** Baut eine Seite sofort (nach dem Laden bzw. in debugSolve). */
  renderPage(step) {
    const builders = {
      login: this.buildLoginPage,
      captcha: this.buildCaptchaPage,
      tos: this.buildTosPage,
      password: this.buildPasswordPage,
      sync: this.buildSyncPage,
    };
    this.clearPage();
    this.isLoading = false;
    this.win.setLoading(false);
    this.setStatus(this.txt.portal.statusReady);
    this.updateDataText();
    this.buildPortalHeader(step);
    builders[step].call(this);
  }

  /** HUD-Aufgabe je Station (Passwort: Regeln bzw. Wiederholen, Sync: erledigt). */
  objectiveFor(step) {
    const O = this.txt.objectives;
    if (step === 'password' && this.passwordPhase === 'confirm') return O.confirm;
    if (step === 'sync' && this.syncDone) return O.done;
    return O[step];
  }

  /** Zerstört alle Objekte der aktuellen Seite. */
  clearPage() {
    if (UI.TextInput && typeof UI.TextInput.blurAll === 'function') UI.TextInput.blurAll(this);
    this.pageObjects.forEach((obj) => {
      if (obj && obj.scene) {
        this.tweens.killTweensOf(obj);
        obj.destroy();
      }
    });
    this.pageObjects = [];
    this.resetPageRefs();
  }

  /**
   * Merkt ein Objekt als Teil der aktuellen Seite und legt es auf die Seitenebene.
   * @template T
   * @param {T} obj
   * @param {number} [depth]
   * @returns {T}
   */
  addPage(obj, depth = Ch1RegistrationScene.DEPTHS.PAGE_FRONT) {
    obj.setDepth(depth);
    this.pageObjects.push(obj);
    return obj;
  }

  /** Portal-Kopf: DHBW-Logo, Portalname, Schrittanzeige. */
  buildPortalHeader(step) {
    const c = this.content;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const L = Ch1RegistrationScene.LAYOUT.LETTER;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const g = this.addPage(this.add.graphics(), Ch1RegistrationScene.DEPTHS.PAGE);
    g.fillStyle(C.SURFACE, 1).fillRect(c.x, c.y, c.width, P.HEADER_H);
    g.lineStyle(1, C.BORDER, 1).lineBetween(c.x, c.y + P.HEADER_H - 0.5, c.x + c.width, c.y + P.HEADER_H - 0.5);
    const logoX = c.x + P.PAD;
    const logoY = c.y + P.LOGO_Y;
    g.fillStyle(C.DHBW_RED, 1).fillRect(logoX, logoY, L.LOGO_W, L.LOGO_H);
    this.addPage(UI.text(this, logoX + L.LOGO_W / 2, logoY + L.LOGO_H / 2, this.txt.portal.brand,
      { size: S.TEXT, bold: true, color: CSS.WHITE, origin: 0.5 }));
    this.addPage(UI.text(this, logoX + L.LOGO_W + L.LOGO_GAP, logoY + L.LOGO_H / 2, this.txt.portal.name,
      { size: S.LEAD, bold: true, color: CSS.TEXT, origin: { x: 0, y: 0.5 } }));

    const index = Ch1Logic.STEPS.indexOf(step);
    const total = Ch1Logic.STEPS.length;
    const dotsRight = c.x + c.width - P.PAD;
    const midY = c.y + P.HEADER_H / 2;
    for (let i = 0; i < total; i += 1) {
      g.fillStyle(i <= index ? C.PRIMARY : C.BORDER, 1).fillCircle(dotsRight - (total - 1 - i) * P.DOT_GAP, midY, P.DOT_R);
    }
    this.addPage(UI.text(this, dotsRight - total * P.DOT_GAP, midY, Ch1Logic.FORMAT.stepOf(index + 1, total),
      { size: S.TEXT, color: CSS.TEXT_MUTED, origin: { x: 1, y: 0.5 } }));
  }

  /** Leere Seite mit Spinner, solange EDGE lädt. */
  buildLoadingIndicator() {
    const b = this.body;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const cx = Math.round(b.x + b.width / 2);
    const cy = Math.round(b.y + b.height / 2);
    this.addPage(new UI.Spinner(this, cx - P.SPINNER / 2, cy - P.SPINNER, { size: P.SPINNER }));
    this.addPage(UI.text(this, cx, cy + P.LOADING_GAP, this.txt.portal.loading,
      { size: Ch1RegistrationScene.TEXT_SIZE.TEXT, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 0.5, y: 0 } }));
  }

  /** Große Seitenüberschrift. */
  addPageTitle(text, { wrap = null } = {}) {
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    return this.addPage(UI.text(this, this.body.x + P.PAD, this.body.y + P.TITLE_Y, text,
      { size: Ch1RegistrationScene.TEXT_SIZE.TITLE, bold: true, color: CONFIG.CSS.TEXT, wrap }));
  }

  /** Darf die Spieler:in gerade auf dieser Station handeln? */
  canAct(step) {
    return !this.isFinished && !this.isLoading && this.step === step && !UI.Modal.isAnyOpen(this);
  }

  /** Mitte des Browserfensters (für Stempel und Floating-Texte). */
  feedbackPoint(y = Ch1RegistrationScene.LAYOUT.PAGE.FEEDBACK_Y) {
    const B = Ch1RegistrationScene.LAYOUT.BROWSER;
    return { x: B.X + B.WIDTH / 2, y };
  }

  /**
   * Kleiner Ärger ohne Fehlversuch (das System ist schuld, nicht die Spieler:in):
   * Klang, roter Floating-Text, Frust über GameState.
   */
  annoy(amount, reason, { x, y } = this.feedbackPoint()) {
    if (this.isFinished || !(amount > 0)) return;
    UI.sound('error');
    ChapterScene.safely(() => {
      const pos = this.clampToArea(x, y);
      FX.floatText(this, pos.x, pos.y, `${reason} · +${amount} % Frust`);
    });
    GameState.addFrustration(amount, reason);
  }

  // ===========================================================================
  // Station 1: Login
  // ===========================================================================

  buildLoginPage() {
    const b = this.body;
    const K = Ch1RegistrationScene.LAYOUT.LOGIN;
    const F = Ch1RegistrationScene.LAYOUT.FIELD;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = this.txt.login;
    const x = b.x + P.PAD;
    this.setObjective(this.objectiveFor('login'));
    this.addPageTitle(T.title);
    this.addPage(UI.text(this, x, b.y + K.INTRO_Y, T.intro, { size: S.TEXT, color: CSS.TEXT_MUTED, wrap: b.width - 2 * P.PAD }));

    const fieldsY = b.y + K.FIELDS_Y;
    this.usernameInput = this.addPage(new UI.TextInput(this, x, fieldsY, {
      width: F.WIDTH, height: F.HEIGHT, label: T.usernameLabel, placeholder: T.usernamePlaceholder,
      hint: this.txt.noRealCredentials, maxLength: Ch1Logic.BALANCE.PASSWORD_INPUT_MAX,
      onChange: () => this.hideLoginBanner(),
      onSubmit: () => this.passwordInput && this.passwordInput.focus(),
    }));
    this.passwordInput = this.addPage(new UI.TextInput(this, x, fieldsY + F.BLOCK, {
      width: F.WIDTH, height: F.HEIGHT, label: T.passwordLabel, placeholder: T.passwordPlaceholder,
      password: true, showToggle: true, hint: this.txt.noRealCredentials, maxLength: Ch1Logic.BALANCE.PASSWORD_INPUT_MAX,
      onChange: () => this.hideLoginBanner(),
      onSubmit: () => this.submitLogin(),
    }));
    const buttonY = fieldsY + 2 * F.BLOCK;
    this.loginButton = this.addPage(new UI.Button(this, x, buttonY, {
      text: T.submit, width: K.BUTTON_W, height: F.BUTTON_H, fontSize: S.VALUE, onClick: () => this.submitLogin(),
    }));
    this.forgotButton = this.addPage(new UI.Button(this, x + K.LINK_X, buttonY, {
      text: T.forgot, variant: 'link', width: K.LINK_W, height: F.BUTTON_H, fontSize: S.TEXT, onClick: () => this.openForgotModal(),
    }));

    // Fehlerbanner (vage Systemmeldung), erst nach dem ersten Fehlversuch sichtbar
    const banner = this.addPage(this.add.container(x, buttonY + K.BANNER_GAP));
    banner.add(this.add.rectangle(0, 0, F.WIDTH, K.BANNER_H, C.DANGER, 0.07).setOrigin(0).setStrokeStyle(1, C.DANGER, 0.6));
    this.loginBannerText = UI.text(this, K.NOTICE_PAD, K.BANNER_H / 2, '', {
      size: S.TEXT, color: CSS.DANGER, wrap: F.WIDTH - 2 * K.NOTICE_PAD, origin: { x: 0, y: 0.5 }, lineSpacing: 2,
    });
    banner.add(this.loginBannerText);
    banner.setVisible(false);
    this.loginBanner = banner;

    // Wartungshinweis: erklärt montags um 07:30 einiges
    const noticeX = x + F.WIDTH + K.NOTICE_GAP;
    const noticeW = b.x + b.width - P.PAD - noticeX;
    const notice = this.addPage(this.add.graphics());
    notice.fillStyle(C.HAZARD, 0.14).fillRoundedRect(noticeX, fieldsY, noticeW, K.NOTICE_H, K.NOTICE_RADIUS);
    notice.lineStyle(1, C.HAZARD, 0.9).strokeRoundedRect(noticeX, fieldsY, noticeW, K.NOTICE_H, K.NOTICE_RADIUS);
    this.addPage(UI.text(this, noticeX + K.NOTICE_PAD, fieldsY + K.NOTICE_PAD, T.noticeTitle, { size: S.TEXT, bold: true, color: CSS.TEXT }));
    this.addPage(UI.text(this, noticeX + K.NOTICE_PAD, fieldsY + K.NOTICE_TEXT_Y, T.noticeText,
      { size: S.TEXT, color: CSS.TEXT_MUTED, wrap: noticeW - 2 * K.NOTICE_PAD, lineSpacing: 2 }));

    if (this.loginFails === 0) this.setTip(this.usedMagnifier ? this.txt.tips.magnifier : this.txt.tips.login);
    this.usernameInput.focus();
  }

  showLoginBanner(text) {
    if (!this.loginBanner) return;
    this.loginBannerText.setText(text);
    this.loginBanner.setVisible(true);
  }

  hideLoginBanner() {
    if (this.loginBanner) this.loginBanner.setVisible(false);
  }

  /** „Anmelden“: vage Systemmeldung, konkreter Tipp auf dem Post-it, Eskalation bis zum Kopierer. */
  submitLogin() {
    if (!this.canAct('login') || !this.usernameInput) return;
    const B = Ch1Logic.BALANCE;
    const result = Ch1Logic.checkLogin(this.usernameInput.getValue(), this.passwordInput.getValue(), CAMPUS);
    if (result.ok) {
      this.completeLogin();
      return;
    }
    const input = result.field === 'username' ? this.usernameInput : this.passwordInput;
    if (!result.isAttempt) {
      // Leeres Pflichtfeld: Formularprüfung, kein Anmeldeversuch
      input.setError(result.message, { shake: true });
      input.focus();
      this.setTip(result.hint);
      return;
    }
    this.loginFails += 1;
    this.lastLoginCode = result.code;
    this.showLoginBanner(Ch1Logic.FORMAT.systemError(result.message, this.loginFails));
    this.passwordInput.setValue('', { silent: true }); // wie jedes echte Portal: Passwort weg
    this.usernameInput.shake();
    this.passwordInput.shake();
    input.focus();
    this.setTip(Ch1Logic.loginTip(this.loginFails, result.code, CAMPUS), { isPity: this.loginFails >= B.PITY_AFTER_FAILS });
    if (this.loginFails >= B.RESCUE_AFTER_FAILS && this.forgotButton) {
      ChapterScene.safely(() => FX.pulse(this, this.forgotButton));
    }
    const at = this.feedbackPoint();
    this.fail(this.txt.reasons.loginFail, {
      frustration: B.LOGIN_FAIL_FRUSTRATION,
      minutes: B.LOGIN_FAIL_MINUTES,
      x: at.x,
      y: at.y,
      stamp: this.loginFails === 1 ? 'ABGELEHNT' : null, // großer Stempel nur beim ersten Mal
    });
  }

  /** Login geschafft: Lupe wird nicht mehr gebraucht; die nächste Seite zeigt „Angemeldet als …“. */
  completeLogin() {
    this.hideLoginBanner();
    UI.sound('success');
    this.destroyMagnifierButton();
    this.loadPage('captcha');
  }

  destroyMagnifierButton() {
    if (!this.magnifierButton) return;
    this.magnifierButton.destroy();
    this.magnifierButton = null;
  }

  /** „Passwort vergessen?“ – echte DHBW-Praxis: Ersatz nur persönlich oder am Kopierer. */
  openForgotModal() {
    if (!this.canAct('login')) return;
    const T = this.txt.forgot;
    this.showModal({
      title: T.title,
      text: T.text,
      icon: 'info',
      buttons: [
        { text: T.cancel, variant: 'secondary' },
        { text: T.copier, variant: 'primary', onClick: () => this.useCopier() },
      ],
    });
  }

  /** Rettungsweg: +15 min, lesbarer Ausdruck, Passwortfeld ausgefüllt. */
  useCopier() {
    if (this.isFinished || this.step !== 'login') return;
    const L = Ch1RegistrationScene.LAYOUT.LENS;
    this.usedCopier = true;
    this.destroyMagnifierButton();
    this.showLens({ isCopier: true });
    this.penalty(Ch1Logic.BALANCE.COPIER_MINUTES, this.txt.reasons.copier, { x: L.X + L.WIDTH / 2, y: L.Y });
    if (this.passwordInput) {
      this.passwordInput.setValue(CAMPUS.initialPassword, { silent: true });
      this.passwordInput.setPasswordVisible(true);
    }
    this.hideLoginBanner();
    // Die Pointe („dasselbe Passwort – diesmal lesbar“) steht auf dem Post-it statt in einem
    // Toast, der unten das Post-it verdecken würde.
    this.setTip(this.txt.tips.copier, { isPity: true });
  }

  // ===========================================================================
  // Station 2: CAPTCHA
  // ===========================================================================

  /**
   * Seite „Sicherheitsprüfung“: Erklärung, „Ich bin kein Roboter“-Kasten und ein Infokasten
   * „Angemeldet als …“ mit der Realm-Lektion (bleibt stehen, statt als Toast zu verschwinden).
   */
  buildCaptchaPage() {
    const b = this.body;
    const K = Ch1RegistrationScene.LAYOUT.CAPTCHA;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const D = Ch1RegistrationScene.DEPTHS;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = this.txt.captcha;
    const x = b.x + P.PAD;
    const w = b.width - 2 * P.PAD;

    this.setObjective(this.objectiveFor('captcha'));
    this.addPageTitle(T.title);
    this.addPage(UI.text(this, x, b.y + K.INTRO_Y, T.intro, { size: S.TEXT, color: CSS.TEXT_MUTED, wrap: w }));

    // „Ich bin kein Roboter“-Kasten (eigene Zeichnung im bekannten Look)
    const robotY = b.y + K.ROBOT_Y;
    const frame = this.addPage(this.add.graphics());
    frame.fillStyle(C.SHADOW, 0.08).fillRoundedRect(x + 1, robotY + 2, K.ROBOT_W, K.ROBOT_H, K.ROBOT_RADIUS);
    frame.fillStyle(C.SURFACE_ALT, 1).fillRoundedRect(x, robotY, K.ROBOT_W, K.ROBOT_H, K.ROBOT_RADIUS);
    frame.lineStyle(1, C.BORDER, 1).strokeRoundedRect(x, robotY, K.ROBOT_W, K.ROBOT_H, K.ROBOT_RADIUS);
    const checkX = x + K.CHECK_X;
    const checkY = robotY + (K.ROBOT_H - K.CHECK) / 2;
    this.robotSquare = this.addPage(this.add.rectangle(checkX, checkY, K.CHECK, K.CHECK, C.SURFACE).setOrigin(0).setStrokeStyle(2, C.TEXT_MUTED, 0.6));
    this.robotCheck = this.addPage(this.add.graphics());
    this.robotCheck.lineStyle(K.CHECK_STROKE, C.SUCCESS, 1);
    this.robotCheck.beginPath();
    this.robotCheck.moveTo(checkX + K.CHECK * 0.18, checkY + K.CHECK * 0.52);
    this.robotCheck.lineTo(checkX + K.CHECK * 0.42, checkY + K.CHECK * 0.76);
    this.robotCheck.lineTo(checkX + K.CHECK * 0.86, checkY + K.CHECK * 0.22);
    this.robotCheck.strokePath();
    this.robotCheck.setVisible(this.captchaPassed);
    this.robotSpinner = this.addPage(new UI.Spinner(this, checkX, checkY, { size: K.CHECK, autoStart: false }));
    this.robotLabel = this.addPage(UI.text(this, x + K.LABEL_X, robotY + K.ROBOT_H / 2, T.robotLabel,
      { size: S.LABEL, color: CSS.TEXT, origin: { x: 0, y: 0.5 } }));
    // Marke rechts im Kasten: Kreispfeil-Logo über „DHBW-CAPTCHA“
    const brandRight = x + K.ROBOT_W - K.BRAND_PAD;
    const brand = this.addPage(UI.text(this, brandRight, robotY + K.ROBOT_H * 0.7, T.brand,
      { size: S.TEXT, bold: true, color: CSS.TEXT_MUTED, origin: { x: 1, y: 0.5 } }));
    const logo = this.addPage(this.add.graphics());
    Ch1RegistrationScene.drawCaptchaLogo(logo, brandRight - brand.width / 2, robotY + K.ROBOT_H * 0.32, K.CHECK * 0.4);
    this.robotHit = this.addPage(this.add.rectangle(x, robotY, K.ROBOT_W, K.ROBOT_H, C.WHITE, 0.001).setOrigin(0)
      .setInteractive({ useHandCursor: true }));
    this.robotHit.on('pointerup', () => this.handleRobotClick());
    this.addPage(UI.text(this, x, robotY + K.ROBOT_H + K.LEGAL_GAP, T.legal, { size: S.TEXT, color: CSS.TEXT_MUTED }));
    this.robotPassedText = this.addPage(UI.text(this, x, robotY + K.ROBOT_H + K.LEGAL_GAP + K.PASSED_GAP + S.TEXT, T.passed,
      { size: S.TEXT, bold: true, color: CSS.SUCCESS, wrap: w }));
    this.robotPassedText.setVisible(this.captchaPassed);

    // Infokasten „Angemeldet als …“ mit der Realm-Lektion (Kennung ≠ Identität)
    const infoY = robotY + K.ROBOT_H + K.INFO_GAP;
    const infoTitle = this.addPage(UI.text(this, x + K.INFO_PAD, infoY + K.INFO_PAD, T.loggedInTitle,
      { size: S.TEXT, bold: true, color: CSS.TEXT }));
    const infoText = this.addPage(UI.text(this, x + K.INFO_PAD, infoTitle.y + infoTitle.height + K.INFO_TEXT_GAP, T.loggedInText,
      { size: S.TEXT, color: CSS.TEXT, wrap: w - 2 * K.INFO_PAD, lineSpacing: 2 }));
    const infoH = Math.round(infoText.y + infoText.height + K.INFO_PAD - infoY);
    const info = this.addPage(this.add.graphics(), D.PAGE);
    info.fillStyle(C.PRIMARY, 0.07).fillRoundedRect(x, infoY, w, infoH, K.INFO_RADIUS);
    info.lineStyle(1, C.PRIMARY, 0.45).strokeRoundedRect(x, infoY, w, infoH, K.INFO_RADIUS);

    this.captchaStarted = false;
    this.setTip(this.txt.tips.captcha);
  }

  /** Häkchen bei „Ich bin kein Roboter“: kurz prüfen, dann das Bilderrätsel öffnen. */
  handleRobotClick() {
    if (!this.canAct('captcha') || this.captchaStarted || this.captchaPassed) return;
    this.captchaStarted = true;
    UI.sound('click');
    this.robotSquare.setVisible(false);
    this.robotSpinner.start();
    this.robotLabel.setText(this.txt.captcha.verifying);
    this.time.delayedCall(Ch1Logic.BALANCE.CAPTCHA_VERIFY_MS, () => {
      if (this.step !== 'captcha' || this.isFinished || !this.robotSpinner) return;
      this.robotSpinner.stop();
      this.robotSquare.setVisible(true);
      this.robotLabel.setText(this.txt.captcha.robotLabel);
      this.openChallenge();
    });
  }

  /**
   * Bilderrätsel als Popup über der Seite (wie beim Original): weißer Schleier, Kopf
   * („Wähle alle Bilder mit Access Points“), 3×3-Raster, Meldungszeile, Fußleiste.
   * Die Kachelgröße ergibt sich aus der verfügbaren Höhe des Browserfensters.
   */
  openChallenge() {
    const c = this.content;
    const K = Ch1RegistrationScene.LAYOUT.CAPTCHA;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const D = Ch1RegistrationScene.DEPTHS;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = this.txt.captcha;

    const top = c.y + K.POPUP_MARGIN;
    const bottom = this.statusBarY - K.POPUP_MARGIN;
    // Höhe = Rand + Kopf + Abstände (oben + zwischen den Reihen) + Meldungszeile + Fuß + Reihen
    const fixedHeight = K.PAD_IN + K.HEADER_H + K.COLS * K.GRID_GAP + K.ERROR_H + K.FOOTER_H;
    const tile = Math.min(K.TILE_MAX, Math.floor((bottom - top - fixedHeight) / K.COLS));
    const boxW = 2 * K.PAD_IN + K.COLS * tile + (K.COLS - 1) * K.GRID_GAP;
    const boxH = fixedHeight + K.COLS * tile;
    const boxX = Math.round(c.x + (c.width - boxW) / 2);
    const boxY = top;
    this.captchaGeometry = { tile, boxX, boxY, boxW, boxH, gridX: boxX + K.PAD_IN, gridY: boxY + K.PAD_IN + K.HEADER_H + K.GRID_GAP };
    const g = this.captchaGeometry;
    const keep = (obj, depth = D.POPUP_FRONT) => {
      this.challengeObjects.push(obj);
      return this.addPage(obj, depth);
    };

    // Schleier über Seite und Portal-Kopf (nicht über die Statusleiste); schluckt Klicks darunter
    keep(this.add.rectangle(c.x, c.y, c.width, this.statusBarY - c.y, C.WHITE, K.BACKDROP_ALPHA).setOrigin(0).setInteractive(), D.POPUP);
    const frame = keep(this.add.graphics(), D.POPUP);
    frame.fillStyle(C.SHADOW, 0.18).fillRect(g.boxX + K.SHADOW, g.boxY + K.SHADOW, g.boxW, g.boxH);
    frame.fillStyle(C.SURFACE, 1).fillRect(g.boxX, g.boxY, g.boxW, g.boxH);
    frame.lineStyle(1, C.BORDER, 1).strokeRect(g.boxX + 0.5, g.boxY + 0.5, g.boxW - 1, g.boxH - 1);
    const headerX = g.boxX + K.PAD_IN;
    const headerY = g.boxY + K.PAD_IN;
    frame.fillStyle(C.PRIMARY, 1).fillRect(headerX, headerY, g.boxW - 2 * K.PAD_IN, K.HEADER_H);
    keep(UI.text(this, headerX + K.HEADER_TEXT_X, headerY + K.PROMPT_Y, T.prompt, { size: S.TEXT, color: CSS.WHITE }));
    keep(UI.text(this, headerX + K.HEADER_TEXT_X, headerY + K.TARGET_Y, T.target, { size: S.TARGET, bold: true, color: CSS.WHITE }));
    keep(UI.text(this, headerX + K.HEADER_TEXT_X, headerY + K.INSTRUCTION_Y, T.instruction, { size: S.TEXT, color: CSS.WHITE }));

    const errorY = g.gridY + K.COLS * g.tile + (K.COLS - 1) * K.GRID_GAP;
    this.captchaErrorText = keep(UI.text(this, headerX, errorY + K.ERROR_H / 2, '',
      { size: S.TEXT, bold: true, color: CSS.DANGER, origin: { x: 0, y: 0.5 } }));
    const footerY = errorY + K.ERROR_H;
    frame.lineStyle(1, C.BORDER, 1).lineBetween(g.boxX, footerY + 0.5, g.boxX + g.boxW, footerY + 0.5);
    const buttonY = footerY + (K.FOOTER_H - K.CONFIRM_H) / 2;
    this.captchaReloadButton = keep(this.createIconButton(headerX, buttonY, K.CONFIRM_H, 'reload', () => this.reloadCaptcha()));
    this.captchaAudioButton = keep(this.createIconButton(headerX + K.CONFIRM_H + K.ICON_GAP, buttonY, K.CONFIRM_H, 'audio',
      () => this.playAudioCaptcha()));
    this.captchaConfirmButton = keep(new UI.Button(this, g.boxX + g.boxW - K.PAD_IN - K.CONFIRM_W, buttonY, {
      text: T.confirm, width: K.CONFIRM_W, height: K.CONFIRM_H, fontSize: S.LEAD, onClick: () => this.submitCaptcha(),
    }));
    this.newCaptchaGrid();
  }

  /**
   * Meldungszeile im Bilderrätsel (Fehler rot, Hinweise blau/grau, leer = ausblenden).
   * @param {string} text
   * @param {string} [color] CSS-Farbe
   */
  setCaptchaMessage(text, color = CONFIG.CSS.DANGER) {
    if (this.captchaErrorText && this.captchaErrorText.scene) this.captchaErrorText.setText(text).setColor(color);
  }

  /** Neues 3×3-Raster (neue Runde oder „Neue Bilder“). */
  newCaptchaGrid() {
    const g = this.captchaGeometry;
    const K = Ch1RegistrationScene.LAYOUT.CAPTCHA;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const C = CONFIG.COLORS;
    this.destroyTiles();
    this.captchaGrid = Ch1Logic.createCaptchaGrid();
    this.captchaSelected = new Set();
    // Doppelklick-Schutz: „Bestätigen“ zählt erst, wenn das neue Raster eingeblendet ist
    this.captchaReadyAt = this.time.now + Ch1Logic.BALANCE.CAPTCHA_SIZE * K.FADE_STAGGER_MS + Ch1RegistrationScene.TIMING.FADE_MS;
    this.captchaGrid.tiles.forEach((tileData, index) => {
      const col = index % K.COLS;
      const row = Math.floor(index / K.COLS);
      const x = g.gridX + col * (g.tile + K.GRID_GAP);
      const y = g.gridY + row * (g.tile + K.GRID_GAP);
      const container = this.addPage(this.add.container(x, y), Ch1RegistrationScene.DEPTHS.POPUP_FRONT);
      const hit = this.add.rectangle(0, 0, g.tile, g.tile, C.SURFACE).setOrigin(0).setInteractive({ useHandCursor: true });
      const art = this.add.graphics({ x: g.tile / 2, y: g.tile / 2 });
      Ch1RegistrationScene.drawTile(art, tileData.kind, g.tile);
      // Bildbeschreibung (barrierefreie Rettung nach mehreren Fehlern)
      const labelBg = this.add.rectangle(0, g.tile - K.LABEL_H, g.tile, K.LABEL_H, C.SHADOW, 0.66).setOrigin(0);
      const label = UI.text(this, g.tile / 2, g.tile - K.LABEL_H / 2, tileData.label,
        { size: S.TEXT, color: CONFIG.CSS.WHITE, origin: 0.5 });
      labelBg.setVisible(this.captchaLabelsShown);
      label.setVisible(this.captchaLabelsShown);
      const badge = this.add.graphics();
      badge.fillStyle(C.PRIMARY, 1).fillCircle(K.BADGE_INSET, K.BADGE_INSET, K.BADGE_R);
      badge.lineStyle(3, C.WHITE, 1);
      badge.beginPath();
      badge.moveTo(K.BADGE_INSET - K.BADGE_R * 0.45, K.BADGE_INSET);
      badge.lineTo(K.BADGE_INSET - K.BADGE_R * 0.1, K.BADGE_INSET + K.BADGE_R * 0.38);
      badge.lineTo(K.BADGE_INSET + K.BADGE_R * 0.5, K.BADGE_INSET - K.BADGE_R * 0.35);
      badge.strokePath();
      badge.setVisible(false);
      container.add([hit, art, labelBg, label, badge]);
      hit.on('pointerup', () => this.toggleTile(index));
      container.setAlpha(0.02);
      this.tweens.add({ targets: container, alpha: 1, duration: Ch1RegistrationScene.TIMING.FADE_MS, delay: index * K.FADE_STAGGER_MS });
      this.captchaTiles.push({ container, hit, art, badge });
    });
  }

  destroyTiles() {
    this.captchaTiles.forEach((tile) => {
      if (tile.container.scene) {
        this.tweens.killTweensOf(tile.container);
        this.tweens.killTweensOf(tile.art);
        tile.container.destroy();
      }
    });
    this.pageObjects = this.pageObjects.filter((obj) => obj && obj.scene);
    this.captchaTiles = [];
  }

  /** Kachel an-/abwählen (verkleinert sich wie im Original, blaues Häkchen). */
  toggleTile(index) {
    if (!this.canAct('captcha') || this.captchaPassed || !this.captchaGrid) return;
    const tile = this.captchaTiles[index];
    if (!tile) return;
    const K = Ch1RegistrationScene.LAYOUT.CAPTCHA;
    const isSelected = !this.captchaSelected.has(index);
    if (isSelected) this.captchaSelected.add(index);
    else this.captchaSelected.delete(index);
    UI.sound('click');
    this.tweens.killTweensOf(tile.art);
    this.tweens.add({ targets: tile.art, scale: isSelected ? K.SELECT_SCALE : 1, duration: Ch1RegistrationScene.TIMING.SELECT_MS, ease: 'Quad.easeOut' });
    tile.badge.setVisible(isSelected);
    this.setCaptchaMessage('');
  }

  /** „Bestätigen“: Runde 1 scheitert immer; danach zählt die Auswahl. */
  submitCaptcha() {
    if (!this.canAct('captcha') || this.captchaPassed || !this.captchaGrid) return;
    if (this.time.now < this.captchaReadyAt) return;
    const B = Ch1Logic.BALANCE;
    const T = this.txt.captcha;
    const g = this.captchaGeometry;
    const at = { x: g.boxX + g.boxW / 2, y: g.gridY + g.tile };
    const check = Ch1Logic.checkCaptcha(this.captchaGrid, this.captchaSelected);
    const outcome = Ch1Logic.captchaOutcome(this.captchaRound, check.isCorrect);
    if (outcome.passed) {
      this.passCaptcha();
      return;
    }
    if (outcome.isPlayerError) this.captchaErrors += 1;
    this.captchaRound += 1;
    const errorMessage = !outcome.isForced && check.missed.length > 0 && check.wrong.length === 0 ? T.retryMissing : T.retry;
    this.captchaLabelsShown = Ch1Logic.shouldShowCaptchaLabels(this.captchaErrors);
    this.newCaptchaGrid();
    this.setCaptchaMessage(errorMessage);
    this.setTip(Ch1Logic.captchaTip(this.captchaErrors, outcome.isForced), { isPity: this.captchaErrors >= B.PITY_AFTER_FAILS });
    if (outcome.isPlayerError) {
      this.fail(this.txt.reasons.captchaError, { frustration: B.CAPTCHA_ERROR_FRUSTRATION, stamp: null, shake: false, x: at.x, y: at.y });
    } else {
      this.annoy(B.CAPTCHA_FORCED_FRUSTRATION, this.txt.reasons.captchaForced, at);
    }
  }

  /** Geschafft: Popup schließt, Häkchen im Kasten, ggf. CAPTCHA_HUMAN, weiter zur Nutzungsordnung. */
  passCaptcha() {
    this.captchaPassed = true;
    this.closeChallenge();
    this.robotCheck.setVisible(true);
    this.robotPassedText.setVisible(true);
    if (this.captchaErrors === 0) this.achievement('CAPTCHA_HUMAN');
    UI.sound('success');
    this.time.delayedCall(Ch1RegistrationScene.TIMING.PASS_DELAY_MS, () => {
      if (this.step === 'captcha' && !this.isFinished) this.loadPage('tos');
    });
  }

  /** Entfernt das Popup samt Schleier und Kacheln. */
  closeChallenge() {
    this.destroyTiles();
    this.challengeObjects.forEach((obj) => {
      if (obj && obj.scene) obj.destroy();
    });
    this.challengeObjects = [];
    this.pageObjects = this.pageObjects.filter((obj) => obj && obj.scene);
    this.captchaConfirmButton = null;
    this.captchaReloadButton = null;
    this.captchaAudioButton = null;
    this.captchaErrorText = null;
  }

  /** „Neue Bilder“: gleiche Aufgabe, neue Kacheln (zählt nicht als Versuch). */
  reloadCaptcha() {
    if (!this.canAct('captcha') || this.captchaPassed) return;
    this.newCaptchaGrid();
    this.setCaptchaMessage(this.txt.captcha.reloaded, CONFIG.CSS.TEXT_MUTED);
  }

  /** Audio-CAPTCHA – leider nur auf Schwäbisch (Meldung im Popup, kein Toast über den Kacheln). */
  playAudioCaptcha() {
    if (!this.canAct('captcha') || this.captchaPassed) return;
    UI.sound('modem');
    this.setCaptchaMessage(this.txt.captcha.audio, CONFIG.CSS.PRIMARY);
  }

  /**
   * Kreispfeil-Logo des CAPTCHA (zwei Bögen mit Pfeilspitzen, wie das bekannte Original).
   * @param {Phaser.GameObjects.Graphics} g
   * @param {number} cx Mitte
   * @param {number} cy
   * @param {number} r Radius
   */
  static drawCaptchaLogo(g, cx, cy, r) {
    const C = CONFIG.COLORS;
    const rad = Phaser.Math.DegToRad;
    [[C.PRIMARY, 200, 340], [C.TEXT_MUTED, 20, 160]].forEach(([color, from, to]) => {
      g.lineStyle(3, color, 1);
      g.beginPath();
      g.arc(cx, cy, r, rad(from), rad(to), false);
      g.strokePath();
      const tipX = cx + Math.cos(rad(to)) * r;
      const tipY = cy + Math.sin(rad(to)) * r;
      const dir = rad(to + 90);
      const side = rad(to);
      g.fillStyle(color, 1).fillTriangle(
        tipX + Math.cos(dir) * 4, tipY + Math.sin(dir) * 4,
        tipX + Math.cos(side) * 4, tipY + Math.sin(side) * 4,
        tipX - Math.cos(side) * 4, tipY - Math.sin(side) * 4,
      );
    });
  }

  /**
   * Kleiner Symbol-Knopf wie im Original-CAPTCHA (Neu laden ↻, Audio 🎧 – gezeichnet, nicht als Zeichen).
   * @param {number} x linke obere Ecke
   * @param {number} y
   * @param {number} size Kantenlänge der Klickfläche
   * @param {'reload'|'audio'} kind
   * @param {Function} onClick
   * @returns {Phaser.GameObjects.Container} mit .hitRect (für Tests)
   */
  createIconButton(x, y, size, kind, onClick) {
    const C = CONFIG.COLORS;
    const container = this.add.container(x, y);
    const hit = this.add.rectangle(0, 0, size, size, C.SURFACE, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
    const g = this.add.graphics();
    const c = size / 2;
    const r = size * 0.27;
    const draw = (color) => {
      g.clear().lineStyle(2.2, color, 1);
      if (kind === 'reload') {
        const start = Phaser.Math.DegToRad(-50);
        const end = Phaser.Math.DegToRad(250);
        g.beginPath();
        g.arc(c, c, r, start, end, false);
        g.strokePath();
        const tipX = c + Math.cos(start) * r;
        const tipY = c + Math.sin(start) * r;
        g.fillStyle(color, 1).fillTriangle(tipX - 4, tipY - 3, tipX + 4, tipY - 3, tipX, tipY + 3);
      } else {
        g.beginPath();
        g.arc(c, c + r * 0.25, r, Math.PI, 0, false);
        g.strokePath();
        g.fillStyle(color, 1);
        g.fillRoundedRect(c - r - 2.5, c + r * 0.1, 5, r * 0.95, 2);
        g.fillRoundedRect(c + r - 2.5, c + r * 0.1, 5, r * 0.95, 2);
      }
    };
    draw(C.TEXT_MUTED);
    hit.on('pointerover', () => draw(C.PRIMARY));
    hit.on('pointerout', () => draw(C.TEXT_MUTED));
    hit.on('pointerup', () => {
      UI.sound('click');
      onClick();
    });
    container.add([hit, g]);
    container.hitRect = hit;
    return container;
  }

  /**
   * Zeichnet ein CAPTCHA-Bild in eine Graphics, Ursprung = Kachelmitte (Bild skaliert beim
   * Auswählen um die Mitte). Decken-AP und Rauchmelder sehen sich absichtlich ähnlich.
   * Die Faktoren (z. B. s * 0.27) sind Proportionen der Kachelgröße – reine Illustration.
   * @param {Phaser.GameObjects.Graphics} g
   * @param {string} kind Schlüssel aus Ch1Logic.CAPTCHA_KINDS
   * @param {number} s Kachelgröße
   */
  static drawTile(g, kind, s) {
    const A = Ch1RegistrationScene.ART;
    const h = s / 2;
    const rad = Phaser.Math.DegToRad;
    const deskTop = h * 0.3;
    const backgrounds = { apRouter: 'desk', brezel: 'desk', tvTower: 'sky' };
    const background = backgrounds[kind] || 'ceiling';
    if (background === 'ceiling') {
      g.fillStyle(A.CEILING, 1).fillRect(-h, -h, s, s);
      g.lineStyle(1, A.CEILING_LINE, 1);
      const step = s / 2.6;
      for (let k = -h + step * 0.6; k < h; k += step) {
        g.lineBetween(k, -h, k, h);
        g.lineBetween(-h, k, h, k);
      }
    } else if (background === 'desk') {
      g.fillStyle(A.WALL, 1).fillRect(-h, -h, s, h + deskTop);
      g.fillStyle(A.DESK, 1).fillRect(-h, deskTop, s, h - deskTop);
      g.lineStyle(2, A.DESK_EDGE, 1).lineBetween(-h, deskTop, h, deskTop);
    } else {
      // Himmel + Hügel; der Hügel ist ein auf die Kachel beschnittener Ellipsenbogen, damit er
      // nicht in die Nachbarkacheln (und deren Bildbeschreibung) hineinragt
      g.fillStyle(A.SKY, 1).fillRect(-h, -h, s, s);
      const hillRx = s * 0.75;
      const hillRy = s * 0.275;
      const hill = [];
      for (let i = 0; i <= 16; i += 1) {
        const hx = -h + (s * i) / 16;
        hill.push({ x: hx, y: h - hillRy * Math.sqrt(Math.max(0, 1 - (hx / hillRx) ** 2)) });
      }
      hill.push({ x: h, y: h }, { x: -h, y: h });
      g.fillStyle(A.HILL, 1).fillPoints(hill, true);
    }

    switch (kind) {
      case 'apCeiling': {
        const r = s * 0.27;
        g.fillStyle(0x000000, 0.13).fillRoundedRect(-r + 3, -r + 4, 2 * r, 2 * r, 9);
        g.fillStyle(A.DEVICE, 1).fillRoundedRect(-r, -r, 2 * r, 2 * r, 9);
        g.lineStyle(1, A.DEVICE_EDGE, 1).strokeRoundedRect(-r, -r, 2 * r, 2 * r, 9);
        g.lineStyle(2, A.DEVICE_PRINT, 1);
        [0.06, 0.11, 0.16].forEach((f) => {
          g.beginPath();
          g.arc(0, s * 0.08, s * f, rad(225), rad(315), false);
          g.strokePath();
        });
        g.fillStyle(A.DEVICE_PRINT, 1).fillCircle(0, s * 0.08, 2);
        g.fillStyle(A.LED_BLUE, 1).fillCircle(r * 0.62, r * 0.62, 2.5);
        break;
      }
      case 'smokeDetector': {
        const r = s * 0.29;
        g.fillStyle(0x000000, 0.13).fillCircle(3, 4, r);
        g.fillStyle(A.DEVICE, 1).fillCircle(0, 0, r);
        g.lineStyle(1, A.DEVICE_EDGE, 1).strokeCircle(0, 0, r);
        g.lineStyle(1.5, A.DEVICE_EDGE, 1).strokeCircle(0, 0, r * 0.62);
        g.lineStyle(2, A.DEVICE_PRINT, 1);
        for (let i = 0; i < 12; i += 1) {
          const a = (i / 12) * Math.PI * 2;
          g.lineBetween(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        }
        g.fillStyle(A.CEILING, 1).fillCircle(0, 0, r * 0.28);
        g.lineStyle(1, A.DEVICE_EDGE, 1).strokeCircle(0, 0, r * 0.28);
        g.fillStyle(A.LED_RED, 1).fillCircle(r * 0.38, -r * 0.38, 2.5);
        break;
      }
      case 'lamp': {
        const r = s * 0.25;
        g.fillStyle(A.LAMP_GLOW, 0.35).fillCircle(0, 0, r * 1.75);
        g.fillStyle(A.LAMP_GLOW, 0.55).fillCircle(0, 0, r * 1.35);
        g.fillStyle(A.LAMP, 1).fillCircle(0, 0, r);
        g.lineStyle(1, A.LAMP_EDGE, 1).strokeCircle(0, 0, r);
        g.fillStyle(0xffffff, 1).fillCircle(0, 0, r * 0.55);
        break;
      }
      case 'beamer': {
        const bw = s * 0.62;
        const bh = s * 0.26;
        const by = -s * 0.12;
        g.fillStyle(A.POLE, 1).fillRect(-3, -h, 6, s * 0.3);
        g.fillRect(-s * 0.12, -h + s * 0.28, s * 0.24, 4);
        g.fillStyle(0x000000, 0.12).fillRoundedRect(-bw / 2 + 3, by + 4, bw, bh, 6);
        g.fillStyle(A.BEAMER, 1).fillRoundedRect(-bw / 2, by, bw, bh, 6);
        g.lineStyle(1, A.BEAMER_EDGE, 1).strokeRoundedRect(-bw / 2, by, bw, bh, 6);
        g.fillStyle(A.LENS, 1).fillCircle(-bw * 0.22, by + bh / 2, s * 0.075);
        g.fillStyle(A.LENS_SHINE, 1).fillCircle(-bw * 0.22 - 2, by + bh / 2 - 2, s * 0.022);
        g.lineStyle(1.5, A.BEAMER_EDGE, 1);
        for (let i = 0; i < 4; i += 1) g.lineBetween(bw * 0.08 + i * 5, by + 6, bw * 0.08 + i * 5, by + bh - 6);
        break;
      }
      case 'apRouter': {
        const bw = s * 0.62;
        const bh = s * 0.17;
        const by = deskTop - bh + 2;
        const tips = [[-bw * 0.46, by - s * 0.3], [0, by - s * 0.34], [bw * 0.46, by - s * 0.3]];
        const feet = [-bw * 0.36, 0, bw * 0.36];
        g.lineStyle(4, A.ANTENNA, 1);
        tips.forEach(([tx, ty], i) => g.lineBetween(feet[i], by + 2, tx, ty));
        g.fillStyle(A.ANTENNA, 1);
        tips.forEach(([tx, ty]) => g.fillCircle(tx, ty, 2.5));
        g.lineStyle(1.5, A.LED_BLUE, 0.7);
        [0.07, 0.12].forEach((f) => {
          g.beginPath();
          g.arc(0, by - s * 0.34, s * f, rad(220), rad(320), false);
          g.strokePath();
        });
        g.fillStyle(0x000000, 0.18).fillRoundedRect(-bw / 2 + 2, by + 3, bw, bh, 4);
        g.fillStyle(A.ROUTER, 1).fillRoundedRect(-bw / 2, by, bw, bh, 4);
        g.fillStyle(A.LED_GREEN, 1);
        for (let i = 0; i < 4; i += 1) g.fillCircle(-bw * 0.3 + i * bw * 0.14, by + bh / 2, 2);
        break;
      }
      case 'brezel': {
        const lw = Math.max(5, s * 0.075);
        g.lineStyle(lw, A.BREZEL, 1);
        g.beginPath();
        g.arc(0, -s * 0.02, s * 0.27, rad(12), rad(168), false);
        g.strokePath();
        g.strokeCircle(-s * 0.11, -s * 0.08, s * 0.12);
        g.strokeCircle(s * 0.11, -s * 0.08, s * 0.12);
        g.lineBetween(-s * 0.04, -s * 0.0, s * 0.25, s * 0.07);
        g.lineBetween(s * 0.04, -s * 0.0, -s * 0.25, s * 0.07);
        g.fillStyle(A.SALT, 1);
        [[-0.2, 0.12], [0.18, 0.15], [-0.12, -0.17], [0.13, -0.18], [0.0, 0.24], [-0.24, -0.04]].forEach(([fx, fy]) => g.fillCircle(s * fx, s * fy, 1.6));
        break;
      }
      case 'tvTower': {
        g.fillStyle(A.TOWER, 1);
        g.fillPoints([
          { x: -s * 0.05, y: h * 0.78 }, { x: s * 0.05, y: h * 0.78 },
          { x: s * 0.022, y: -s * 0.16 }, { x: -s * 0.022, y: -s * 0.16 },
        ], true);
        g.fillStyle(A.TOWER_CABIN, 1).fillRect(-s * 0.075, -s * 0.25, s * 0.15, s * 0.1);
        g.lineStyle(1, A.TOWER_WINDOW, 1).lineBetween(-s * 0.075, -s * 0.2, s * 0.075, -s * 0.2);
        for (let i = 0; i < 5; i += 1) {
          g.fillStyle(i % 2 === 0 ? A.LED_RED : 0xffffff, 1).fillRect(-1.5, -s * 0.25 - (i + 1) * s * 0.045, 3, s * 0.045);
        }
        break;
      }
      default:
        break;
    }
  }

  // ===========================================================================
  // Station 3: Nutzungsordnung
  // ===========================================================================

  buildTosPage() {
    const b = this.body;
    const K = Ch1RegistrationScene.LAYOUT.TOS;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const F = Ch1RegistrationScene.LAYOUT.FIELD;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const CSS = CONFIG.CSS;
    const T = this.txt.tos;
    const x = b.x + P.PAD;
    const w = b.width - 2 * P.PAD;
    this.setObjective(this.objectiveFor('tos'));
    this.addPageTitle(T.title);
    this.addPage(UI.text(this, x, b.y + K.SUB_Y, T.subtitle, { size: S.TEXT, color: CSS.TEXT_MUTED, wrap: w }));

    const panelY = b.y + K.PANEL_Y;
    const panelH = b.height - K.PANEL_Y - K.BOTTOM;
    this.tosProgress = 0;
    this.tosUnlocked = false;
    this.tosPanelRect = { x, y: panelY, width: w, height: panelH };
    this.tosPanel = this.addPage(new UI.ScrollPanel(this, x, panelY, {
      width: w,
      height: panelH,
      text: Ch1Logic.buildTerms(this.secretWord, CAMPUS),
      font: 'UI',
      fontSize: S.TEXT,
      bgColor: CONFIG.COLORS.SURFACE_ALT,
      onScroll: (progress) => this.handleTosScroll(progress),
      onScrollEnd: () => this.handleTosScroll(1),
    }));

    const progressY = panelY + panelH + K.PROGRESS_GAP;
    this.tosBar = this.addPage(new UI.ProgressBar(this, x, progressY + K.BAR_Y, { width: K.BAR_W, height: K.BAR_H, value: 0 }));
    this.tosPercentText = this.addPage(UI.text(this, x + K.PERCENT_X, progressY, Ch1Logic.FORMAT.tosProgress(0),
      { size: S.TEXT, bold: true, color: CSS.TEXT_MUTED }));
    this.tosHintText = this.addPage(UI.text(this, x + K.HINT_X, progressY, T.lockedHint,
      { size: S.TEXT, color: CSS.TEXT_MUTED, wrap: w - K.HINT_X, lineSpacing: 1 }));

    const remarksY = progressY + K.REMARKS_GAP;
    this.remarksInput = this.addPage(new UI.TextInput(this, x, remarksY, {
      width: w - K.ACCEPT_W - K.FIELD_GAP, height: K.ACCEPT_H, label: T.remarksLabel, placeholder: T.remarksPlaceholder,
      maxLength: Ch1Logic.BALANCE.PASSWORD_INPUT_MAX, fontSize: S.LEAD,
      onChange: (value) => this.handleRemarksChange(value),
      onSubmit: () => this.acceptTos(),
    }));
    this.acceptButton = this.addPage(new UI.Button(this, x + w - K.ACCEPT_W, remarksY + F.LABEL_SPACE, {
      text: T.accept, width: K.ACCEPT_W, height: K.ACCEPT_H, fontSize: S.VALUE, disabled: true, onClick: () => this.acceptTos(),
    }));
    this.setTip(this.txt.tips.tos);
  }

  /** Lesefortschritt; am Ende wird „Akzeptieren“ aktiv. */
  handleTosScroll(progress) {
    if (this.step !== 'tos' || !this.tosBar) return;
    this.tosProgress = Math.max(this.tosProgress, Number(progress) || 0);
    this.tosBar.setValue(this.tosProgress, false);
    this.tosPercentText.setText(Ch1Logic.FORMAT.tosProgress(this.tosProgress));
    if (this.tosUnlocked || !Ch1Logic.isTermsEnd(this.tosProgress)) return;
    this.tosUnlocked = true;
    this.acceptButton.setEnabled(true);
    this.updateTosHint();
    ChapterScene.safely(() => FX.pulse(this, this.acceptButton));
    this.setTip(this.tosReader ? this.txt.tips.tosReader : this.txt.tips.tosDone);
  }

  /** Hinweis neben dem Lesefortschritt: gesperrt, Ende erreicht oder Brezel-Gutschein (grün). */
  updateTosHint() {
    if (!this.tosHintText) return;
    const T = this.txt.tos;
    const CSS = CONFIG.CSS;
    if (this.tosReader) this.tosHintText.setText(T.readerHint).setColor(CSS.SUCCESS);
    else this.tosHintText.setText(this.tosUnlocked ? T.unlockedHint : T.lockedHint).setColor(CSS.TEXT_MUTED);
  }

  /**
   * Geheimwort aus § 14 im Feld „Anmerkungen“ → TOS_READER + Brezel-Gutschein. Die Rückmeldung
   * steht in der Seite (grüner Hinweis) – ein Toast würde Feld und „Akzeptieren“ verdecken.
   */
  handleRemarksChange(value) {
    if (this.tosReader || !Ch1Logic.isSecretWord(value, this.secretWord)) return;
    this.tosReader = true;
    this.achievement('TOS_READER');
    const at = this.feedbackPoint();
    this.relief(Ch1Logic.BALANCE.TOS_READER_RELIEF, this.txt.reasons.reader, at);
    UI.sound('success');
    this.updateTosHint();
    this.setTip(this.tosUnlocked ? this.txt.tips.tosReader : this.txt.tips.tosReaderScroll);
  }

  /** „Akzeptieren“: Rückfrage mit zwei gleichwertigen Antworten (beide führen weiter). */
  acceptTos() {
    if (!this.canAct('tos') || !this.tosUnlocked) return;
    const T = this.txt.tos;
    this.showModal({
      title: T.confirmTitle,
      text: T.confirmText,
      icon: 'question',
      buttons: [
        { text: T.confirmProtest, variant: 'secondary', onClick: () => this.completeTos({ isProtest: true }) },
        { text: T.confirmYes, variant: 'primary', onClick: () => this.completeTos({ isProtest: false }) },
      ],
    });
  }

  /** Zustimmung gespeichert – weiter zum Passwort. */
  completeTos({ isProtest }) {
    if (this.isFinished || this.step !== 'tos') return;
    const T = this.txt.tos;
    const remarks = this.remarksInput ? this.remarksInput.getValue().trim() : '';
    let message = T.acceptedToast;
    if (isProtest) message = T.protestToast;
    else if (remarks && !this.tosReader) message = T.remarksToast;
    this.toast(message, { duration: Ch1RegistrationScene.TIMING.LONG_TOAST_MS });
    this.loadPage('password');
  }

  // ===========================================================================
  // Station 4: Neues Passwort
  // ===========================================================================

  buildPasswordPage() {
    const b = this.body;
    const K = Ch1RegistrationScene.LAYOUT.PASSWORD;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const F = Ch1RegistrationScene.LAYOUT.FIELD;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const CSS = CONFIG.CSS;
    const T = this.txt.password;
    const x = b.x + P.PAD;
    this.passwordPhase = 'rules';
    this.setObjective(this.objectiveFor('password'));
    this.addPageTitle(T.title);
    this.addPage(UI.text(this, x, b.y + K.INTRO_Y, T.intro, { size: S.TEXT, color: CSS.TEXT_MUTED, wrap: b.width - 2 * P.PAD }));

    this.newPasswordInput = this.addPage(new UI.TextInput(this, x, b.y + K.FIELD_Y, {
      width: F.WIDTH, height: F.HEIGHT, label: T.fieldLabel, password: true, showToggle: true,
      hint: this.txt.noRealCredentials, maxLength: Ch1Logic.BALANCE.PASSWORD_INPUT_MAX,
      value: this.newPassword || '',
      onChange: (value) => this.handlePasswordChange(value),
      onSubmit: () => this.goToConfirm(),
    }));
    this.newPasswordInput.setPasswordVisible(true); // Regeln prüfen geht nur, wenn man sieht, was man tippt
    this.nextButton = this.addPage(new UI.Button(this, x + F.WIDTH + K.NEXT_GAP, b.y + K.FIELD_Y + F.LABEL_SPACE, {
      text: T.next, width: K.NEXT_W, height: F.HEIGHT, fontSize: S.VALUE, disabled: true, onClick: () => this.goToConfirm(),
    }));
    this.rulesHeading = this.addPage(UI.text(this, x, b.y + K.HEADING_Y, T.rulesHeading, { size: S.TEXT, bold: true, color: CSS.TEXT_MUTED }));
    this.ruleRows = Ch1Logic.PASSWORD_RULES.map(() => this.createRuleRow());
    this.setTip(this.txt.tips.password);
    this.handlePasswordChange(this.newPasswordInput.getValue(), { isInitial: true });
    this.newPasswordInput.focus();
  }

  /** Eine Regelzeile (unsichtbar, bis die Regel aufgedeckt wird). */
  createRuleRow() {
    const K = Ch1RegistrationScene.LAYOUT.PASSWORD;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const C = CONFIG.COLORS;
    const width = this.body.width - 2 * P.PAD;
    const row = this.addPage(this.add.container(this.body.x + P.PAD, this.body.y + K.RULES_Y));
    const bg = this.add.rectangle(0, 0, width, K.ROW_CURRENT_H, C.DANGER, 0.06).setOrigin(0);
    const accent = this.add.rectangle(0, 0, K.ACCENT_W, K.ROW_CURRENT_H, C.DANGER).setOrigin(0);
    const icon = this.add.graphics();
    const title = UI.text(this, K.TEXT_X, K.TEXT_Y, '', { size: S.TEXT, color: CONFIG.CSS.TEXT });
    const status = UI.text(this, width - K.STATUS_PAD, K.TEXT_Y, '', { size: S.TEXT, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 1, y: 0 } });
    const detail = UI.text(this, K.TEXT_X, K.DETAIL_Y, '', { size: S.TEXT, color: CONFIG.CSS.TEXT_MUTED, wrap: width - K.TEXT_X - K.STATUS_PAD });
    row.add([bg, accent, icon, title, status, detail]);
    row.setVisible(false);
    return { row, bg, accent, icon, title, status, detail, isShown: false };
  }

  /** Zeichnet die sichtbaren Regeln: erfüllt (grün), offen (rot), die erste offene ausführlich. */
  renderRules(evaluation) {
    const K = Ch1RegistrationScene.LAYOUT.PASSWORD;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const current = evaluation.firstFailingIndex >= 0 && evaluation.firstFailingIndex < this.passwordRevealed
      ? evaluation.firstFailingIndex : -1;
    let y = this.body.y + K.RULES_Y;
    this.ruleRows.forEach((entry, index) => {
      if (index >= this.passwordRevealed || this.passwordPhase !== 'rules') {
        entry.row.setVisible(false);
        return;
      }
      const result = evaluation.results[index];
      const isCurrent = index === current;
      entry.row.setPosition(entry.row.x, y).setVisible(true);
      entry.bg.setVisible(isCurrent);
      entry.accent.setVisible(isCurrent);
      entry.title.setText(Ch1Logic.FORMAT.ruleLabel(index, result.title));
      entry.title.setColor(result.ok ? CSS.TEXT_MUTED : CSS.TEXT).setFontStyle(isCurrent ? 'bold' : 'normal');
      entry.status.setText(result.status && !result.ok ? result.status : '');
      entry.detail.setText(isCurrent ? result.detail : '').setVisible(isCurrent);
      const g = entry.icon.clear();
      g.fillStyle(result.ok ? C.SUCCESS : C.DANGER, 1).fillCircle(K.ICON_X, K.ICON_Y, K.ICON_R);
      g.lineStyle(2, C.WHITE, 1);
      if (result.ok) {
        g.beginPath();
        g.moveTo(K.ICON_X - K.ICON_R * 0.45, K.ICON_Y);
        g.lineTo(K.ICON_X - K.ICON_R * 0.1, K.ICON_Y + K.ICON_R * 0.38);
        g.lineTo(K.ICON_X + K.ICON_R * 0.5, K.ICON_Y - K.ICON_R * 0.35);
        g.strokePath();
      } else {
        const d = K.ICON_R * 0.4;
        g.lineBetween(K.ICON_X - d, K.ICON_Y - d, K.ICON_X + d, K.ICON_Y + d);
        g.lineBetween(K.ICON_X + d, K.ICON_Y - d, K.ICON_X - d, K.ICON_Y + d);
      }
      if (!entry.isShown) {
        entry.isShown = true;
        entry.row.setAlpha(0.02);
        this.tweens.add({ targets: entry.row, alpha: 1, duration: Ch1RegistrationScene.TIMING.FADE_MS });
      }
      y += isCurrent ? K.ROW_CURRENT_H : K.ROW_H;
    });
  }

  /**
   * Jede Eingabe: Regeln neu bewerten, neue Regeln aufdecken, Überraschungsregeln bestrafen.
   * @param {string} value
   * @param {{isInitial?: boolean}} [opts]
   */
  handlePasswordChange(value, { isInitial = false } = {}) {
    if (this.step !== 'password' || this.passwordPhase !== 'rules' || !this.newPasswordInput) return;
    const B = Ch1Logic.BALANCE;
    const evaluation = Ch1Logic.evaluatePassword(value, CAMPUS);
    const previous = this.passwordRevealed;
    const next = Ch1Logic.revealCount(previous, evaluation);
    let isTwist = false;
    this.passwordEvaluation = evaluation;
    if (next > previous) {
      const fresh = Ch1Logic.newlyRevealed(previous, next, evaluation);
      this.passwordRevealed = next;
      const twists = fresh.filter((rule) => !rule.ok && Ch1Logic.isTwistRule(rule.id));
      if (!isInitial) UI.sound('popup');
      if (!isInitial && twists.length > 0) {
        isTwist = true;
        this.twistHits += twists.length;
        this.annoy(B.PASSWORD_TWIST_FRUSTRATION * twists.length, this.txt.reasons.twist, this.feedbackPoint());
      }
    }
    // Neue offene Regel → Stoppuhr für den Klartext-Tipp neu starten
    if (evaluation.firstFailingIndex !== this.stuckRuleIndex) {
      this.stuckRuleIndex = evaluation.firstFailingIndex;
      this.stuckMs = 0;
      this.stuckTipShown = false;
      if (evaluation.firstFailingIndex >= 0) this.setTip(this.txt.tips.password);
    }
    if (isTwist) this.stuckTipShown = true; // Überraschungsregel: Klartext-Tipp sofort
    // Klartext-Tipp aktuell halten (z. B. „es fehlen noch 4“)
    if (this.stuckTipShown && evaluation.firstFailingIndex >= 0) this.showRuleHint(evaluation);
    this.renderRules(evaluation);
    const isComplete = Ch1Logic.isPasswordComplete(evaluation, this.passwordRevealed);
    this.nextButton.setEnabled(isComplete);
    if (isComplete) this.setTip(this.txt.tips.passwordDone);
  }

  /** Klartext-Tipp zur ersten offenen Regel auf das Post-it. */
  showRuleHint(evaluation) {
    const index = evaluation.firstFailingIndex;
    if (index < 0) return;
    const rule = evaluation.results[index];
    this.setTip(Ch1Logic.FORMAT.stuckTip(index, Ch1Logic.ruleHint(rule.id, evaluation.password, CAMPUS)), { isPity: true });
  }

  /** „Weiter“: Regeln einklappen, Wiederholungsfeld zeigen. */
  goToConfirm() {
    if (!this.canAct('password') || this.passwordPhase !== 'rules' || !this.newPasswordInput) return;
    const evaluation = Ch1Logic.evaluatePassword(this.newPasswordInput.getValue(), CAMPUS);
    if (!Ch1Logic.isPasswordComplete(evaluation, this.passwordRevealed)) {
      this.newPasswordInput.shake();
      return;
    }
    const b = this.body;
    const K = Ch1RegistrationScene.LAYOUT.PASSWORD;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const F = Ch1RegistrationScene.LAYOUT.FIELD;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const CSS = CONFIG.CSS;
    const T = this.txt.password;
    const x = b.x + P.PAD;
    this.newPassword = evaluation.password;
    this.passwordPhase = 'confirm';
    this.newPasswordInput.setEnabled(false);
    this.nextButton.setVisible(false);
    this.rulesHeading.setVisible(false);
    this.renderRules(evaluation);
    const keep = (obj) => {
      this.confirmObjects.push(obj);
      return this.addPage(obj);
    };
    keep(UI.text(this, x, b.y + K.SUMMARY_Y, `✓ ${Ch1Logic.FORMAT.allRulesOk(Ch1Logic.PASSWORD_RULES.length)}`,
      { size: S.TEXT, bold: true, color: CSS.SUCCESS }));
    keep(UI.text(this, x, b.y + K.CONFIRM_INTRO_Y, T.confirmIntro, { size: S.TEXT, color: CSS.TEXT_MUTED, wrap: b.width - 2 * P.PAD }));
    this.confirmInput = keep(new UI.TextInput(this, x, b.y + K.CONFIRM_FIELD_Y, {
      width: F.WIDTH, height: F.HEIGHT, label: T.confirmLabel, password: true, showToggle: true,
      hint: this.txt.noRealCredentials, maxLength: Ch1Logic.BALANCE.PASSWORD_INPUT_MAX,
      onSubmit: () => this.savePassword(),
    }));
    this.saveButton = keep(new UI.Button(this, x, b.y + K.SAVE_Y, {
      text: T.save, width: K.SAVE_W, height: F.BUTTON_H, fontSize: S.VALUE, onClick: () => this.savePassword(),
    }));
    this.backButton = keep(new UI.Button(this, x + K.SAVE_W + K.BACK_GAP, b.y + K.SAVE_Y, {
      text: T.back, variant: 'link', width: K.BACK_W, height: F.BUTTON_H, fontSize: S.TEXT, onClick: () => this.backToRules(),
    }));
    this.setObjective(this.objectiveFor('password'));
    this.setTip(this.txt.tips.confirm);
    this.confirmInput.focus();
  }

  /** „Zurück zu den Regeln“: Passwort wieder bearbeitbar. */
  backToRules() {
    if (!this.canAct('password') || this.passwordPhase !== 'confirm') return;
    this.confirmObjects.forEach((obj) => {
      if (obj && obj.scene) obj.destroy();
    });
    this.confirmObjects = [];
    this.pageObjects = this.pageObjects.filter((obj) => obj && obj.scene);
    this.confirmInput = null;
    this.saveButton = null;
    this.backButton = null;
    this.passwordPhase = 'rules';
    this.newPasswordInput.setEnabled(true);
    this.nextButton.setVisible(true);
    this.rulesHeading.setVisible(true);
    this.setObjective(this.objectiveFor('password'));
    this.handlePasswordChange(this.newPasswordInput.getValue(), { isInitial: true });
    this.newPasswordInput.focus();
  }

  /** „Passwort speichern“: Wiederholung prüfen, Zugangsdaten an GameState, ggf. PASSWORD_POET. */
  savePassword() {
    if (!this.canAct('password') || this.passwordPhase !== 'confirm' || !this.confirmInput) return;
    const B = Ch1Logic.BALANCE;
    if (this.confirmInput.getValue() !== this.newPassword) {
      this.confirmFails += 1;
      this.confirmInput.setValue('', { silent: true });
      this.confirmInput.setError(this.txt.password.mismatch, { shake: true });
      this.confirmInput.focus();
      if (this.confirmFails >= B.PITY_AFTER_FAILS) this.setTip(this.txt.tips.confirmPity, { isPity: true });
      const at = this.feedbackPoint();
      this.fail(this.txt.reasons.confirmFail, { frustration: B.CONFIRM_FAIL_FRUSTRATION, stamp: null, shake: false, x: at.x, y: at.y });
      return;
    }
    GameState.setCredentials({ username: CAMPUS.username, password: this.newPassword });
    this.credentialsSaved = true;
    // „Überlebt alle Regeln“: keine Überraschungsregel hat das Passwort gekillt, Wiederholung sofort richtig
    if (this.twistHits === 0 && this.confirmFails === 0) this.achievement('PASSWORD_POET');
    UI.sound('success');
    this.toast(this.txt.password.savedToast, { variant: 'success', duration: Ch1RegistrationScene.TIMING.LONG_TOAST_MS });
    this.loadPage('sync');
  }

  // ===========================================================================
  // Station 5: Synchronisation
  // ===========================================================================

  buildSyncPage() {
    const b = this.body;
    const K = Ch1RegistrationScene.LAYOUT.SYNC;
    const P = Ch1RegistrationScene.LAYOUT.PAGE;
    const S = Ch1RegistrationScene.TEXT_SIZE;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = this.txt.sync;
    const B = Ch1Logic.BALANCE;
    const x = b.x + P.PAD;
    const w = b.width - 2 * P.PAD;
    const status = this.syncDone
      ? { done: true, text: T.done, isSetback: false }
      : Ch1Logic.syncStatus(this.syncPlan, this.syncReloads);

    this.setObjective(this.objectiveFor('sync'));
    this.addPageTitle(T.title);
    this.addPage(UI.text(this, x, b.y + K.INTRO_Y, T.intro, { size: S.TEXT, color: CSS.TEXT_MUTED, wrap: w }));

    const boxY = b.y + K.BOX_Y;
    const box = this.addPage(this.add.graphics());
    box.fillStyle(status.done ? C.SUCCESS : C.SURFACE_ALT, status.done ? 0.1 : 1).fillRoundedRect(x, boxY, w, K.BOX_H, K.BOX_RADIUS);
    box.lineStyle(1, status.done ? C.SUCCESS : C.BORDER, 1).strokeRoundedRect(x, boxY, w, K.BOX_H, K.BOX_RADIUS);
    const iconX = x + K.ICON_X;
    const iconY = boxY + K.ICON_Y;
    if (status.done) {
      const half = K.ICON_SIZE / 2;
      box.fillStyle(C.SUCCESS, 1).fillCircle(iconX + half, iconY + half, half);
      box.lineStyle(3, C.WHITE, 1);
      box.beginPath();
      box.moveTo(iconX + half * 0.5, iconY + half);
      box.lineTo(iconX + half * 0.88, iconY + half * 1.38);
      box.lineTo(iconX + half * 1.5, iconY + half * 0.62);
      box.strokePath();
    } else {
      this.addPage(new UI.Spinner(this, iconX, iconY, { size: K.ICON_SIZE }));
    }
    this.addPage(UI.text(this, x + K.TEXT_X, boxY + K.LABEL_Y, T.statusLabel, { size: S.TEXT, bold: true, color: CSS.TEXT_MUTED }));
    this.addPage(UI.text(this, x + K.TEXT_X, boxY + K.STATUS_Y, status.text,
      { size: S.LEAD, bold: status.done, color: status.done ? CSS.SUCCESS : CSS.TEXT, wrap: w - K.TEXT_X - P.PAD }));
    this.addPage(UI.text(this, x + K.TEXT_X, boxY + K.CHECK_Y, Ch1Logic.FORMAT.lastCheck(GameState.getClockLabel()),
      { size: S.TEXT, color: CSS.TEXT_MUTED }));

    if (status.done) {
      this.addPage(UI.text(this, x, b.y + K.HINT_Y, T.doneHint, { size: S.TEXT, color: CSS.TEXT, wrap: w }));
      this.continueButton = this.addPage(new UI.Button(this, x, b.y + K.CONTINUE_Y, {
        text: T.continue, variant: 'success', width: K.CONTINUE_W, height: K.CONTINUE_H, fontSize: S.VALUE + 1,
        onClick: () => this.finishChapter(),
      }));
      this.setTip(this.txt.tips.done);
      if (!this.syncStampShown) {
        this.syncStampShown = true;
        const at = this.feedbackPoint();
        ChapterScene.safely(() => FX.stamp(this, T.stamp, { x: at.x, y: at.y, color: C.SUCCESS, hold: Ch1RegistrationScene.TIMING.STAMP_HOLD_MS }));
      }
      return;
    }

    this.reloadButton = this.addPage(new UI.Button(this, x, b.y + K.BUTTONS_Y, {
      text: T.reload, width: K.BUTTON_W, height: K.BUTTON_H, fontSize: S.VALUE, onClick: () => this.reloadSync(),
    }));
    this.waitButton = this.addPage(new UI.Button(this, x + K.BUTTON_W + K.BUTTON_GAP, b.y + K.BUTTONS_Y, {
      text: T.wait, variant: 'secondary', width: K.BUTTON_W, height: K.BUTTON_H, fontSize: S.VALUE, onClick: () => this.confirmWait(),
    }));
    if (this.syncReloads > 0) {
      this.addPage(UI.text(this, x, b.y + K.COUNTER_Y, Ch1Logic.FORMAT.reloads(this.syncReloads), { size: S.TEXT, color: CSS.TEXT_MUTED }));
    }
    this.setTip(this.syncReloads >= B.PITY_AFTER_FAILS ? this.txt.tips.syncPity : this.txt.tips.sync);
    if (status.isSetback && !this.setbackShown) {
      this.setbackShown = true;
      this.annoy(B.SYNC_SETBACK_FRUSTRATION, this.txt.reasons.setback, { x: x + w / 2, y: boxY + K.BOX_H / 2 });
    }
  }

  /** „Seite neu laden“ (oder F5): +1 min, nach 3–6 Mal ist die Synchronisation durch. */
  reloadSync() {
    if (!this.canAct('sync') || this.syncDone) return;
    const B = Ch1Logic.BALANCE;
    this.syncReloads += 1;
    const at = this.reloadButton ? Ch1RegistrationScene.centerOf(this.reloadButton) : this.feedbackPoint();
    this.penalty(B.SYNC_RELOAD_MINUTES, this.txt.reasons.reload, at || this.feedbackPoint());
    if (Ch1Logic.syncStatus(this.syncPlan, this.syncReloads).done) this.syncDone = true;
    this.loadPage('sync');
  }

  /** „24 Stunden warten“ – mit Rückfrage, denn das kostet wirklich 24 Spielstunden. */
  confirmWait() {
    if (!this.canAct('sync') || this.syncDone) return;
    const T = this.txt.sync;
    this.showModal({
      title: T.waitTitle,
      text: T.waitText,
      icon: 'warning',
      buttons: [
        { text: T.waitCancel, variant: 'secondary' },
        { text: T.waitConfirm, variant: 'danger', onClick: () => this.wait24h() },
      ],
    });
  }

  wait24h() {
    if (this.isFinished || this.step !== 'sync' || this.syncDone) return;
    const at = this.feedbackPoint();
    this.waited24h = true;
    this.syncDone = true;
    this.syncStampShown = true; // statt „AKTIVIERT“ gibt es hier „VERTAGT“
    this.penalty(Ch1Logic.BALANCE.SYNC_WAIT_MINUTES, this.txt.reasons.wait, at);
    ChapterScene.safely(() => FX.stamp(this, this.txt.sync.waitStamp, { x: at.x, y: at.y, hold: Ch1RegistrationScene.TIMING.STAMP_HOLD_MS }));
    this.toast(this.txt.sync.waitedToast, { duration: Ch1RegistrationScene.TIMING.LONG_TOAST_MS });
    this.renderPage('sync');
  }

  /** „Weiter zu eduroam“ – Kapitel geschafft. */
  finishChapter() {
    if (this.isFinished || this.step !== 'sync' || !this.syncDone) return;
    this.step = 'done';
    this.succeed(this.collectStats());
  }

  /** Kapitel-Statistik für chapterStats. */
  collectStats() {
    return {
      loginFails: this.loginFails,
      usedMagnifier: this.usedMagnifier,
      usedCopier: this.usedCopier,
      captchaErrors: this.captchaErrors,
      captchaRounds: this.captchaRound,
      tosReader: this.tosReader,
      twistHits: this.twistHits,
      confirmFails: this.confirmFails,
      syncReloads: this.syncReloads,
      waited24h: this.waited24h,
      passwordLength: this.newPassword ? [...this.newPassword].length : 0,
    };
  }

  // ===========================================================================
  // Tastatur
  // ===========================================================================

  /**
   * F5 bzw. Strg/Cmd+R auf der Sync-Seite lädt die PORTALSEITE neu (nicht das Spiel).
   * Doppelmeldungen von Phaser 3.90 filtert ChapterScene.onKey() bereits.
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    if (!event) return;
    const key = String(event.key || '');
    const isReloadKey = key === 'F5' || ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'r');
    if (!isReloadKey || this.step !== 'sync' || this.isFinished) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (!this.canAct('sync') || this.syncDone) return;
    this.toast(this.txt.sync.f5Toast);
    this.reloadSync();
  }

  // ===========================================================================
  // Debug / Tests
  // ===========================================================================

  /**
   * Löst das Kapitel wie eine perfekte Spieler:in: gültiges Passwort setzen, Synchronisation
   * abschließen, succeed(). Keine Strafen, keine Erfolge (Debug ist keine Leistung).
   */
  debugSolve() {
    if (this.isFinished || this.isSolving) return;
    this.isSolving = true;
    if (this.loadTimer) {
      this.loadTimer.remove(false);
      this.loadTimer = null;
    }
    ChapterScene.safely(() => UI.Modal.closeAll(this));
    ChapterScene.safely(() => UI.TextInput.blurAll(this));
    this.destroyMagnifierButton();
    if (!this.credentialsSaved) {
      const typed = this.passwordPhase === 'confirm' && this.newPassword ? this.newPassword : null;
      this.newPassword = typed || Ch1Logic.suggestPassword(CAMPUS);
      GameState.setCredentials({ username: CAMPUS.username, password: this.newPassword });
      this.credentialsSaved = true;
    }
    this.captchaPassed = true;
    this.tosUnlocked = true;
    this.syncDone = true;
    this.syncStampShown = true;
    this.step = 'sync';
    this.setPageChrome('sync');
    this.renderPage('sync');
    this.step = 'done';
    this.succeed({ ...this.collectStats(), solvedBy: 'debug' });
  }

  /**
   * Zustand für Tests: Station, Zähler, Geheimwort, CAPTCHA-Lösung und Klickziele
   * (Mittelpunkte in Spielkoordinaten).
   * @returns {object}
   */
  getDebugInfo() {
    const center = Ch1RegistrationScene.centerOf;
    const evaluation = this.passwordEvaluation;
    const modal = UI.Modal && typeof UI.Modal.getTop === 'function' ? UI.Modal.getTop(this) : null;
    const tos = this.tosPanelRect;
    return {
      ...super.getDebugInfo(),
      step: this.step,
      isLoading: Boolean(this.isLoading),
      tip: this.currentTip,
      loginFails: this.loginFails,
      lastLoginCode: this.lastLoginCode,
      usedMagnifier: this.usedMagnifier,
      usedCopier: this.usedCopier,
      captchaStarted: this.captchaStarted,
      captchaOpen: this.captchaTiles.length > 0,
      captchaPassed: this.captchaPassed,
      captchaRound: this.captchaRound,
      captchaErrors: this.captchaErrors,
      captchaKinds: this.captchaGrid ? this.captchaGrid.tiles.map((tile) => tile.kind) : [],
      captchaTargets: this.captchaGrid ? this.captchaGrid.targets.slice() : [],
      captchaSelected: [...this.captchaSelected].sort((a, b) => a - b),
      captchaLabels: this.captchaLabelsShown,
      secretWord: this.secretWord,
      tosProgress: this.tosProgress,
      tosUnlocked: this.tosUnlocked,
      tosReader: this.tosReader,
      passwordPhase: this.passwordPhase,
      passwordRevealed: this.passwordRevealed,
      passwordFailing: evaluation ? evaluation.results.filter((r) => !r.ok).map((r) => r.id) : [],
      passwordComplete: evaluation ? Ch1Logic.isPasswordComplete(evaluation, this.passwordRevealed) : false,
      twistHits: this.twistHits,
      confirmFails: this.confirmFails,
      credentialsSaved: this.credentialsSaved,
      syncReloads: this.syncReloads,
      syncNeeded: this.syncPlan ? this.syncPlan.needed : null,
      syncDone: this.syncDone,
      waited24h: this.waited24h,
      dataVolumeMb: Math.round(this.dataVolumeMb * 10) / 10,
      targets: {
        magnifier: center(this.magnifierButton),
        username: center(this.usernameInput),
        password: center(this.passwordInput),
        login: center(this.loginButton),
        forgot: center(this.forgotButton),
        robot: center(this.robotHit),
        tiles: this.captchaTiles.map((tile) => center(tile.hit)),
        captchaConfirm: center(this.captchaConfirmButton),
        captchaReload: center(this.captchaReloadButton),
        captchaAudio: center(this.captchaAudioButton),
        tosPanel: tos ? { x: Math.round(tos.x + tos.width / 2), y: Math.round(tos.y + tos.height / 2) } : null,
        remarks: center(this.remarksInput),
        accept: center(this.acceptButton),
        newPassword: center(this.newPasswordInput),
        next: center(this.nextButton),
        confirm: center(this.confirmInput),
        save: center(this.saveButton),
        back: center(this.backButton),
        reload: center(this.reloadButton),
        wait: center(this.waitButton),
        continue: center(this.continueButton),
        modalButtons: modal && typeof modal.getButtons === 'function' ? modal.getButtons().map((button) => center(button)) : [],
      },
    };
  }

  /**
   * Mittelpunkt eines Widgets/Objekts in Spielkoordinaten (Textfeld: das Feld selbst,
   * Button: die Klickfläche) oder null, wenn es nicht (mehr) sichtbar ist.
   * @param {Phaser.GameObjects.GameObject|null} obj
   * @returns {{x: number, y: number}|null}
   */
  static centerOf(obj) {
    if (!obj || !obj.scene || !obj.visible) return null;
    let bounds;
    if (typeof obj.getFieldBounds === 'function') bounds = obj.getFieldBounds();
    else if (obj.hitRect && typeof obj.hitRect.getBounds === 'function') bounds = obj.hitRect.getBounds();
    else bounds = obj.getBounds();
    return { x: Math.round(bounds.centerX), y: Math.round(bounds.centerY) };
  }
}
