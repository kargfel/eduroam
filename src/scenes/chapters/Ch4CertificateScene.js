/**
 * Ch4CertificateScene.js – Kapitel 4 „Das Zertifikat“: den Evil Twin enttarnen.
 *
 * Links ein Android-Handy (UI.Phone) mit der WLAN-Liste – drei Netze namens „eduroam“ mit
 * unterschiedlicher Signalstärke und BSSID – und dem Zertifikatsdialog „Diesem Netzwerk
 * vertrauen?“ (Details, Ablehnen, Vertrauen, böser Countdown „Automatisch vertrauen in 10 s“).
 * Rechts auf dem Schreibtisch: der Ausdruck der IT-Seite (Referenz aus CAMPUS.certificate),
 * darunter die IT-Rundmail (Plot-Twist: legitimer Zertifikatswechsel), ein Post-it mit Tipps
 * und die Lupe (+2 min), die Abweichungen rot markiert.
 *
 * Ablauf: Android-Update-Meldung → Runden 1–4 (Android verbindet automatisch mit dem stärksten
 * Netz, du entscheidest) → Finale (du wählst selbst unter drei Netzen) → Zusammenfassung →
 * succeed(). Regeln, Texte und Balance liegen in Ch4Logic (src/logic/ch4Certificates.js);
 * die Szene ist nur Ansicht und Eingabe.
 *
 * Global: Ch4CertificateScene.
 * Abhängigkeiten (Laufzeit): Phaser, CONFIG, CAMPUS, RNG, GameState, UI (Phone, Button, Modal,
 * ProgressBar, Spinner, toast), FX, Textures (optional), Ch4Logic, ChapterScene.
 */
class Ch4CertificateScene extends ChapterScene {
  /** Layout in Spielkoordinaten bzw. (LIST, DIALOG, CARD) relativ zum Handy-Bildschirm. */
  static LAYOUT = Object.freeze({
    PHONE: Object.freeze({ X: 24, Y: 56, WIDTH: 296, HEIGHT: 536, BATTERY: 23 }),
    LIST: Object.freeze({
      PAD_X: 16,
      BACK_X: 24,
      BACK_Y: 23,
      BACK_SIZE: 20,
      APPBAR_TITLE_X: 48,
      APPBAR_TITLE_Y: 10,
      APPBAR_SIZE: 20,
      TOGGLE_Y: 48,
      TOGGLE_H: 40,
      SWITCH_W: 34,
      SWITCH_H: 14,
      KNOB_R: 9,
      SECTION_Y: 96,
      SECTION_SIZE: 13,
      ROWS_Y: 116,
      ROW_H: 58,
      OTHER_ROW_H: 40,
      ICON_X: 28,
      ICON_RADIUS: 11,
      TEXT_X: 54,
      TITLE_Y: 5,
      TITLE_SIZE: 16,
      STATUS_Y: 25,
      STATUS_SIZE: 12.5,
      BSSID_Y: 41,
      BSSID_SIZE: 11,
      OTHER_TITLE_SIZE: 14,
      OTHER_SUB_SIZE: 12,
      ADD_SIZE: 14,
      CHIP_H: 18,
      CHIP_PAD_X: 7,
      CHIP_RIGHT: 10,
      CHIP_Y: 7,
      CHIP_SIZE: 10.5,
      SPINNER_SIZE: 18,
      ADD_GAP: 6,
      FAN_EMPTY_ALPHA: 0.25,
      INACTIVE_ALPHA: 0.55,
    }),
    DIALOG: Object.freeze({
      MARGIN: 8,
      PAD: 14,
      RADIUS: 22,
      MIN_TOP: 6,
      TITLE_SIZE: 16,
      SUB_SIZE: 12,
      HINT_SIZE: 13,
      LABEL_SIZE: 12,
      VALUE_SIZE: 14,
      FP_SIZE: 13,
      FP_LINE: 17,
      FIELD_GAP: 4,
      SECTION_GAP: 8,
      LUPE_SIZE: 12,
      LINK_H: 26,
      LINK_SIZE: 14,
      COUNTDOWN_SIZE: 13,
      BAR_H: 4,
      BUTTON_H: 36,
      REJECT_W: 100,
      TRUST_W: 118,
      BUTTON_GAP: 8,
      BUTTON_FONT: 15,
      BANNER_H: 24,
      BANNER_SIZE: 13,
      SCRIM_ALPHA: 0.42,
      OPEN_MS: 140,
      START_SCALE: 0.96,
    }),
    CARD: Object.freeze({ MARGIN: 14, PAD: 18, RADIUS: 22, TITLE_SIZE: 17, BODY_SIZE: 14, BUTTON_H: 36, GAP: 12 }),
    TRACKER: Object.freeze({ X: 344, Y: 60, WIDTH: 442, DOT_R: 5.5, DOT_GAP: 18, SIZE: 13 }),
    /** Ausdruck der IT-Seite (Schriftgrößen: Kleingedrucktes ≥ 11 px, Prüfwerte 14 px). */
    SHEET_A: Object.freeze({
      X: 344, Y: 84, WIDTH: 300, HEIGHT: 406, ANGLE: -0.8, PAD: 16,
      HEADER_SIZE: 11.5, TITLE_SIZE: 15, LABEL_SIZE: 12, VALUE_SIZE: 14, WARNING_SIZE: 13, FOOTER_SIZE: 11.5,
      BUTTON_H: 30, BUTTON_SIZE: 14,
    }),
    /** IT-Rundmail (liegt anfangs unter dem Ausdruck; Text nur sichtbar, wenn sie vorn liegt). */
    SHEET_B: Object.freeze({
      X: 500, Y: 96, WIDTH: 286, HEIGHT: 398, ANGLE: 1.2, PAD: 14,
      TAB_SIZE: 14, META_SIZE: 11, BADGE_SIZE: 11, TEASER_SIZE: 12, FROM_SIZE: 11.5, BODY_SIZE: 12.5,
      KEY_SIZE: 13, VALIDITY_SIZE: 13, FP_SIZE: 13, BODY_Y: 78,
    }),
    POSTIT: Object.freeze({ X: 352, Y: 496, WIDTH: 252, HEIGHT: 94, ANGLE: 1.6, PAD: 10, SIZE: 14 }),
    PAPER: Object.freeze({ SHADOW_X: 4, SHADOW_Y: 5, SHADOW_ALPHA: 0.3, PIN_R: 5, LIFT: 3 }),
    STAMP: Object.freeze({ X: 172, Y: 300 }),
    MODAL: Object.freeze({ WIDTH: 520, FINAL_WIDTH: 540, KEVIN_SIZE: 17, TIP_SIZE: 15, TIP_PAD: 10 }),
  });

  /** Zeichenebenen innerhalb der Szene. */
  static DEPTH = Object.freeze({
    DESK: CONFIG.DEPTH.CONTENT,
    SHEET_BACK: CONFIG.DEPTH.CONTENT + 10,
    SHEET_FRONT: CONFIG.DEPTH.CONTENT + 20,
    POSTIT: CONFIG.DEPTH.CONTENT + 30,
    PHONE: CONFIG.DEPTH.CONTENT + 40,
    DIALOG: CONFIG.DEPTH.OVERLAY,
  });

  /** Zeiten in ms (Szenen-Zeit, pausiert mit der Szene). */
  static TIMING = Object.freeze({
    CONNECT_MS: 700,
    ROUND_START_MS: 900,
    RESULT_DELAY_MS: 500,
    DEAUTH_MS: 1100,
    PHISH_MODAL_DELAY_MS: 1150, // Stempel (≈1,2 s) erst wirken lassen
    FINAL_DELAY_MS: 900,
    ROUND_TOAST_MS: 3400,
    COUNTDOWN_WARN_S: 3,
    SHEET_SWAP_MS: 160,
  });

  /** Ablaufschritte (getDebugInfo().step). */
  static STEP = Object.freeze({
    INTRO: 'intro',
    TRANSITION: 'transition',
    CONNECTING: 'connecting',
    DIALOG: 'dialog',
    RESULT: 'result',
    FINALE_INTRO: 'finale-intro',
    CHOOSE: 'choose',
    FINAL: 'final',
    DONE: 'done',
  });

  /** Stempeltext für echte Rückschläge (Evil Twin vertraut). */
  static STAMP_TEXT = 'GEPHISHT';

  /** Höchstzahl Schritte, die debugSolve() durchspielt (Schutz vor Endlosschleifen). */
  static DEBUG_SOLVE_MAX_STEPS = 50;

  constructor() {
    super(4);
  }

  create() {
    this.initChapter();
    // Zustand in create() (scene.restart() ruft create() erneut auf)
    this.logic = new Ch4Logic.Game({ campus: CAMPUS, rng: typeof RNG !== 'undefined' ? RNG : undefined });
    this.step = Ch4CertificateScene.STEP.INTRO;
    this.dialog = null;
    this.countdown = null;
    this.phoneCard = null;
    this.activeModal = null;
    this.rowOverride = null;
    this.rowsLayer = null;
    this.frontSheet = 'reference';
    this.magnifierUses = 0;
    this.pendingPassword = null;
    this.isDebugSolving = false;

    this.buildTracker();
    this.buildReferenceSheet();
    this.buildNewsSheet();
    this.buildPostit();
    this.buildPhone();
    this.renderNetworkList();
    this.updateTracker();
    this.showUpdateNotice();
  }

  update(time, delta) {
    this.updateCountdown(delta);
  }

  // ===========================================================================
  // Ablauf
  // ===========================================================================

  /** Start: Android-Update hat die eduroam-Einstellungen zurückgesetzt (unvermeidbarer Frust). */
  showUpdateNotice() {
    const T = Ch4Logic.TEXTS;
    this.step = Ch4CertificateScene.STEP.INTRO;
    this.setObjective(T.objectives.intro);
    this.showPhoneCard({
      title: T.updateNotice.title,
      body: T.updateNotice.body,
      button: T.updateNotice.button,
      onConfirm: () => {
        this.addFrustration(Ch4Logic.BALANCE.UPDATE_FRUSTRATION, T.updateNotice.reason, Ch4CertificateScene.LAYOUT.STAMP);
        this.startRound();
      },
    });
  }

  /** Neue Runde: Liste neu aufbauen; automatische Runden verbinden von selbst. */
  startRound() {
    if (this.isFinished) return;
    const S = Ch4CertificateScene.STEP;
    const round = this.logic.getRound();
    this.rowOverride = null;
    this.phone.setWifiState('off', 0);
    this.renderNetworkList();
    this.updateTracker();
    this.toast(round.toast, { duration: Ch4CertificateScene.TIMING.ROUND_TOAST_MS });
    if (round.mode === 'auto') {
      this.step = S.TRANSITION;
      this.setObjective(Ch4Logic.TEXTS.objectives.connecting(round.number));
      const featured = this.logic.getNetworks().findIndex((net) => net.featured);
      this.later(Ch4CertificateScene.TIMING.ROUND_START_MS, () => this.connectTo(featured));
    } else {
      this.showFinaleNotice();
    }
  }

  /** Finale: Android verbindet nicht mehr selbst – drei Netze, du wählst. */
  showFinaleNotice() {
    const T = Ch4Logic.TEXTS;
    this.step = Ch4CertificateScene.STEP.FINALE_INTRO;
    this.setObjective(T.objectives.finaleIntro);
    this.showPhoneCard({
      title: T.finaleNotice.title,
      body: T.finaleNotice.body,
      button: T.finaleNotice.button,
      onConfirm: () => this.enterChooseStep(),
    });
  }

  enterChooseStep() {
    if (this.isFinished) return;
    this.step = Ch4CertificateScene.STEP.CHOOSE;
    this.rowOverride = null;
    this.phone.setWifiState('off', 0);
    this.renderNetworkList();
    this.setObjective(Ch4Logic.TEXTS.objectives.choose);
  }

  /**
   * Tipp auf eine Zeile der WLAN-Liste.
   * @param {number} index Netz der aktuellen Runde
   */
  handleNetworkTap(index) {
    if (this.isFinished) return;
    const S = Ch4CertificateScene.STEP;
    const P = Ch4Logic.TEXTS.phone;
    if (this.step === S.CHOOSE) {
      if (this.logic.canInspect(index)) {
        this.connectTo(index);
        return;
      }
      const net = this.logic.getNetworks()[index];
      if (net && (net.status === Ch4Logic.STATUS.CAUGHT || net.status === Ch4Logic.STATUS.PHISHED)) {
        this.toast(P.blockedToast, { variant: 'error' });
      } else if (net && net.status === Ch4Logic.STATUS.CONNECTED) {
        this.toast(P.connectedToast);
      }
      return;
    }
    if (this.step === S.CONNECTING || this.step === S.DIALOG || this.step === S.TRANSITION) this.toast(P.busyToast);
    else this.toast(P.waitToast);
  }

  /** „Verbinde …“ mit Spinner, danach der Zertifikatsdialog. */
  connectTo(index) {
    if (this.isFinished || !this.logic.canInspect(index)) return;
    const S = Ch4CertificateScene.STEP;
    const T = Ch4Logic.TEXTS;
    this.step = S.CONNECTING;
    this.rowOverride = { index, text: T.phone.status.connecting, spinner: true };
    this.renderNetworkList();
    this.phone.setWifiState('connecting');
    this.setObjective(this.logic.isFinale() ? T.objectives.finaleDialog : T.objectives.connecting(this.logic.getRoundNumber()));
    this.later(Ch4CertificateScene.TIMING.CONNECT_MS, () => this.openCertDialog(index));
  }

  /** Öffnet den Zertifikatsdialog für ein Netz und startet den Countdown. */
  openCertDialog(index) {
    if (this.isFinished) return;
    const T = Ch4Logic.TEXTS;
    const net = this.logic.getNetworks()[index];
    if (!net || !net.cert) return;
    this.step = Ch4CertificateScene.STEP.DIALOG;
    this.rowOverride = { index, text: T.phone.status.dialog };
    this.renderNetworkList();
    this.dialog = {
      index,
      net,
      detailsOpen: false,
      magnifier: this.logic.getPhishHintLevel() >= 2, // ab dem 3. Phish läuft die Lupe gratis mit
      container: null,
      refs: {},
      lastSecond: null,
    };
    this.countdown = { remaining: Ch4Logic.COUNTDOWN_MS, running: true };
    this.buildDialog({ animate: true });
    UI.sound('popup');
    this.setObjective(this.logic.isFinale() ? T.objectives.finaleDialog : T.objectives.dialog(this.logic.getRoundNumber()));
  }

  /** „Details anzeigen“: alle Felder einblenden, Countdown anhalten. */
  openDetails() {
    const d = this.dialog;
    if (!d || d.detailsOpen) return;
    d.detailsOpen = true;
    if (this.countdown) this.countdown.running = false;
    this.buildDialog({ animate: false });
  }

  /**
   * Countdown im Dialog (läuft über update(delta) und pausiert daher mit der Szene).
   * @param {number} delta ms seit dem letzten Frame
   */
  updateCountdown(delta) {
    const cd = this.countdown;
    if (!this.dialog || !cd || !cd.running || this.step !== Ch4CertificateScene.STEP.DIALOG) return;
    cd.remaining = Math.max(0, cd.remaining - delta);
    this.refreshCountdownView();
    if (cd.remaining <= 0) {
      cd.running = false;
      this.decideFromDialog(Ch4Logic.DECISION.TRUST, { auto: true });
    }
  }

  /**
   * Entscheidung im Dialog (Button oder Countdown).
   * @param {'trust'|'reject'} decision
   * @param {{auto?: boolean}} [opts]
   */
  decideFromDialog(decision, { auto = false } = {}) {
    const d = this.dialog;
    if (!d || this.step !== Ch4CertificateScene.STEP.DIALOG || this.isFinished) return;
    const index = d.index;
    this.closeDialog();
    const result = this.logic.decide(index, decision, { auto });
    if (!result) {
      this.enterChooseStep();
      return;
    }
    this.step = Ch4CertificateScene.STEP.TRANSITION;
    this.rowOverride = null;
    this.renderNetworkList();
    this.updateTracker();
    this.handleOutcome(result);
  }

  /** Effekte und Buchungen je Ergebnis, danach die Auswertung. */
  handleOutcome(result) {
    const O = Ch4Logic.OUTCOME;
    const pos = this.getRowWorldCenter(result.networkIndex);
    if (result.outcome === O.CAUGHT) this.onCaught(result, pos);
    else if (result.outcome === O.CONNECTED) this.onConnected(result, pos);
    else if (result.outcome === O.PHISHED) this.onPhished(result);
    else if (result.outcome === O.PARANOID) this.onParanoid(result, pos);
  }

  /** Fälschung richtig abgelehnt: kleiner Jubel, Kevin flucht (in der Auswertung). */
  onCaught(result, pos) {
    const C = CONFIG.COLORS;
    UI.sound('pickup');
    this.phone.setWifiState('off', 0);
    ChapterScene.safely(() => FX.burst(this, pos.x, pos.y, { color: C.SUCCESS, count: 16, speed: 150 }));
    ChapterScene.safely(() => FX.floatText(this, pos.x, pos.y - 8, Ch4Logic.TEXTS.caughtFloat, { color: CONFIG.CSS.SUCCESS, size: 17 }));
    this.later(Ch4CertificateScene.TIMING.RESULT_DELAY_MS, () => this.showResultModal(result));
  }

  /** Echtem Netz vertraut: verbunden – in Runde 1–4 wirft Kevin dich per Deauth wieder raus. */
  onConnected(result, pos) {
    const T = Ch4Logic.TEXTS;
    const TM = Ch4CertificateScene.TIMING;
    UI.sound('connect');
    this.phone.setWifiState('connected', result.level);
    if (result.isFinale) {
      this.updatePostit(T.postit.done);
      ChapterScene.safely(() => FX.burst(this, pos.x, pos.y, { color: CONFIG.COLORS.SUCCESS, count: 22 }));
      this.later(TM.FINAL_DELAY_MS, () => this.showFinalModal());
      return;
    }
    this.later(TM.DEAUTH_MS, () => {
      UI.sound('disconnect');
      this.phone.setWifiState('off', 0);
      this.rowOverride = { index: result.networkIndex, text: T.phone.status.disconnected };
      this.renderNetworkList();
      this.addFrustration(Ch4Logic.getPenalty(result).frustration, T.outcomes.deauthReason, pos);
      if (result.auto) this.updatePostit(T.postit.auto);
      this.later(TM.RESULT_DELAY_MS, () => this.showResultModal(result));
    });
  }

  /** Evil Twin vertraut: Stempel, großer Frust, Flag 'phished', Erfolg PHISHED, Passwort ändern. */
  onPhished(result) {
    const T = Ch4Logic.TEXTS;
    const L = Ch4CertificateScene.LAYOUT;
    const penalty = Ch4Logic.getPenalty(result);
    this.phone.setWifiState('connected', result.level);
    UI.sound('alarm');
    this.pendingPassword = { minutes: penalty.minutes };
    GameState.setFlag('phished', true);
    if (result.isFirstPhish) this.achievement('PHISHED');
    if (result.phishHintLevel >= 2) this.updatePostit(T.postit.lupe);
    else if (result.phishHintLevel >= 1) this.updatePostit(T.postit.phish);
    else if (result.auto) this.updatePostit(T.postit.auto);
    ChapterScene.safely(() => FX.flash(this));
    ChapterScene.safely(() => this.phone.vibrate());
    // fail() zuletzt: kann synchron RAGE_QUIT auslösen (GameScene stoppt dann das Kapitel)
    this.fail(result.isFirstPhish ? T.outcomes.phishedReason : T.outcomes.phishedRepeatReason, {
      frustration: penalty.frustration,
      stamp: Ch4CertificateScene.STAMP_TEXT,
      x: L.STAMP.X,
      y: L.STAMP.Y,
    });
    this.later(Ch4CertificateScene.TIMING.PHISH_MODAL_DELAY_MS, () => this.showResultModal(result));
  }

  /** Echtes Netz abgelehnt: kleiner Fehlversuch ohne Stempel; im Finale eskalierende Tipps. */
  onParanoid(result, pos) {
    const T = Ch4Logic.TEXTS;
    const penalty = Ch4Logic.getPenalty(result);
    this.phone.setWifiState('off', 0);
    if (result.isFinale) this.applyFinaleHint(result.hintLevel);
    this.fail(result.isFinale ? T.outcomes.finaleRejectedReason : T.outcomes.paranoidReason, {
      frustration: penalty.frustration,
      minutes: penalty.minutes,
      stamp: null,
      shake: false,
      x: pos.x,
      y: pos.y,
    });
    this.later(Ch4CertificateScene.TIMING.RESULT_DELAY_MS, () => this.showResultModal(result));
  }

  /** Tipps im Finale: 1 = Post-it + Rundmail pulsiert, 2 = Rundmail nach vorn, 3 = Banner im Dialog. */
  applyFinaleHint(level) {
    const T = Ch4Logic.TEXTS;
    if (level >= 2) {
      this.updatePostit(T.postit.newsStrong(Ch4Logic.fingerprintPrefix(Ch4Logic.RENEWAL.sha256)));
      this.bringSheetToFront('news');
    } else if (level >= 1) {
      this.updatePostit(T.postit.news);
    }
    if (level >= 1 && this.newsSheet) ChapterScene.safely(() => FX.pulse(this, this.newsSheet.container, { scale: 1.03, duration: 140, repeat: 2 }));
  }

  /** Auswertung einer Entscheidung (Spielebene: klar, was passiert ist und warum). */
  showResultModal(result) {
    if (this.isFinished) return;
    const L = Ch4CertificateScene.LAYOUT;
    const text = Ch4Logic.describeResult(result);
    const isPhish = result.outcome === Ch4Logic.OUTCOME.PHISHED;
    this.step = Ch4CertificateScene.STEP.RESULT;
    this.setObjective(Ch4Logic.TEXTS.objectives.result(result.roundNumber));
    this.activeModal = this.showModal({
      title: text.title,
      text: Ch4CertificateScene.formatResultBody(text, result),
      icon: { success: 'success', error: 'error', warning: 'warning' }[text.tone] || 'info',
      width: L.MODAL.WIDTH,
      content: (container, innerWidth) => this.buildModalExtras(container, innerWidth, text),
      buttons: [{ text: text.button, variant: isPhish ? 'danger' : 'primary', onClick: () => this.handleResultContinue(result) }],
    });
  }

  /** „Weiter“ bzw. „Passwort ändern“ in der Auswertung. */
  handleResultContinue(result) {
    this.activeModal = null;
    if (this.isFinished) return;
    if (result.outcome === Ch4Logic.OUTCOME.PHISHED) this.completePasswordChange();
    if (result.roundComplete && !result.chapterComplete) {
      this.logic.advance();
      this.startRound();
      return;
    }
    this.enterChooseStep();
  }

  /** Passwort ändern nach dem Phish: Zeitstrafe (Self-Service-Portal über EDGE). */
  completePasswordChange() {
    const pending = this.pendingPassword;
    if (!pending) return;
    this.pendingPassword = null;
    const L = Ch4CertificateScene.LAYOUT;
    this.penalty(pending.minutes, Ch4Logic.TEXTS.passwordChange.reason, { x: L.STAMP.X, y: L.STAMP.Y });
    this.toast(Ch4Logic.TEXTS.passwordChange.done, { variant: 'success' });
    this.phone.setWifiState('off', 0);
  }

  /** Abschluss-Zusammenfassung mit Lerneffekt; „Weiter“ beendet das Kapitel. */
  showFinalModal() {
    if (this.isFinished) return;
    const L = Ch4CertificateScene.LAYOUT;
    const text = Ch4Logic.describeFinal(this.logic.getStats());
    this.step = Ch4CertificateScene.STEP.FINAL;
    this.setObjective(Ch4Logic.TEXTS.objectives.final);
    this.activeModal = this.showModal({
      title: text.title,
      text: text.lines.join('\n\n'),
      icon: 'success',
      width: L.MODAL.FINAL_WIDTH,
      buttons: [{ text: text.button, variant: 'success', onClick: () => this.finishChapter() }],
    });
  }

  /** Kapitel abschließen (CERT_INSPECTOR bei fehlerfreiem Spiel – nicht per debugSolve). */
  finishChapter() {
    if (this.isFinished) return;
    this.activeModal = null;
    this.closeDialog();
    this.closePhoneCard();
    const stats = this.logic.getStats();
    if (stats.perfect && !this.isDebugSolving) this.achievement('CERT_INSPECTOR');
    this.step = Ch4CertificateScene.STEP.DONE;
    this.phone.setWifiState('connected', 4);
    this.setObjective(Ch4Logic.TEXTS.objectives.done);
    this.succeed({
      phishCount: stats.phishCount,
      mistakes: stats.mistakes,
      perfect: stats.perfect,
      newsRead: stats.newsRead,
      magnifierUses: this.magnifierUses,
      solvedBy: this.isDebugSolving ? 'debug' : 'player',
    });
  }

  // ===========================================================================
  // Lupe und Papiere
  // ===========================================================================

  /** Lupe: markiert im offenen Zertifikat grün/rot, was zum Ausdruck passt (+2 min). */
  useMagnifier() {
    const T = Ch4Logic.TEXTS.sheet;
    const d = this.dialog;
    if (!d || this.step !== Ch4CertificateScene.STEP.DIALOG) {
      this.toast(T.magnifierNoDialog);
      return;
    }
    if (d.magnifier) {
      this.toast(T.magnifierActive);
      return;
    }
    const L = Ch4CertificateScene.LAYOUT.SHEET_A;
    this.penalty(Ch4Logic.BALANCE.MAGNIFIER_MINUTES, T.magnifierReason, { x: L.X + L.WIDTH / 2, y: L.Y + L.HEIGHT - 60 });
    this.magnifierUses += 1;
    d.magnifier = true;
    if (!d.detailsOpen) this.openDetails();
    else this.buildDialog({ animate: false });
  }

  /**
   * Holt ein Blatt nach vorn ('reference' = Ausdruck, 'news' = Rundmail).
   * @param {'reference'|'news'} which
   */
  bringSheetToFront(which) {
    if (this.frontSheet === which || !this.referenceSheet || !this.newsSheet) return;
    const DP = Ch4CertificateScene.DEPTH;
    const lift = Ch4CertificateScene.LAYOUT.PAPER.LIFT;
    this.frontSheet = which;
    const front = which === 'news' ? this.newsSheet : this.referenceSheet;
    const back = which === 'news' ? this.referenceSheet : this.newsSheet;
    front.container.setDepth(DP.SHEET_FRONT);
    back.container.setDepth(DP.SHEET_BACK);
    this.updateNewsVisibility();
    this.tweens.add({ targets: front.container, y: front.baseY - lift, duration: Ch4CertificateScene.TIMING.SHEET_SWAP_MS, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: back.container, y: back.baseY, duration: Ch4CertificateScene.TIMING.SHEET_SWAP_MS, ease: 'Quad.easeOut' });
    UI.sound('whoosh');
    if (which === 'news' && !this.logic.hasReadNews()) {
      this.logic.markNewsRead();
      if (this.newsSheet.badge) this.newsSheet.badge.setVisible(false);
      this.toast(Ch4Logic.TEXTS.news.readToast);
      if (this.dialog && this.dialog.magnifier) this.buildDialog({ animate: false }); // Lupe kennt jetzt die Rundmail
    }
  }

  // ===========================================================================
  // Aufbau: Schreibtisch
  // ===========================================================================

  /** „RUNDE 1/5 · Ort“ mit Fortschrittspunkten. */
  buildTracker() {
    const TR = Ch4CertificateScene.LAYOUT.TRACKER;
    const depth = Ch4CertificateScene.DEPTH.DESK;
    this.trackerText = UI.text(this, TR.X, TR.Y, '', { size: TR.SIZE, bold: true, color: CONFIG.CSS.TEXT_INVERSE, depth });
    this.trackerDots = this.add.graphics().setDepth(depth);
  }

  updateTracker() {
    if (!this.trackerText) return;
    const TR = Ch4CertificateScene.LAYOUT.TRACKER;
    const C = CONFIG.COLORS;
    const round = this.logic.getRound();
    this.trackerText.setText(`RUNDE ${round.number}/${Ch4Logic.ROUND_COUNT} · ${round.place}`);
    const results = this.logic.getRoundResults();
    const g = this.trackerDots;
    g.clear();
    const cy = TR.Y + this.trackerText.height / 2;
    results.forEach((state, i) => {
      const cx = TR.X + TR.WIDTH - TR.DOT_R - (results.length - 1 - i) * TR.DOT_GAP;
      if (state === 'good' || state === 'bad') {
        g.fillStyle(state === 'good' ? C.SUCCESS : C.DANGER, 1);
        g.fillCircle(cx, cy, TR.DOT_R);
      } else if (state === 'current') {
        g.lineStyle(2, C.WHITE, 1);
        g.strokeCircle(cx, cy, TR.DOT_R);
      } else {
        g.fillStyle(C.WHITE, 0.22);
        g.fillCircle(cx, cy, TR.DOT_R);
      }
    });
  }

  /**
   * Papierblatt mit Schatten und Pinnnadel; Klick holt es nach vorn.
   * @param {{X: number, Y: number, WIDTH: number, HEIGHT: number, ANGLE: number}} spec Maße aus LAYOUT
   * @param {number} depth
   * @param {'reference'|'news'} which
   * @returns {{container: Phaser.GameObjects.Container, paper: Phaser.GameObjects.Rectangle, baseY: number}}
   */
  createPaper(spec, depth, which) {
    const P = Ch4CertificateScene.LAYOUT.PAPER;
    const C = CONFIG.COLORS;
    const container = this.add.container(spec.X, spec.Y).setDepth(depth).setAngle(spec.ANGLE);
    const shadow = this.add.rectangle(P.SHADOW_X, P.SHADOW_Y, spec.WIDTH, spec.HEIGHT, C.SHADOW, P.SHADOW_ALPHA).setOrigin(0);
    const paper = this.add.rectangle(0, 0, spec.WIDTH, spec.HEIGHT, C.PAPER, 1).setOrigin(0).setStrokeStyle(1, C.PAPER_SHADE, 1);
    paper.setInteractive({ useHandCursor: true });
    paper.on('pointerdown', () => this.bringSheetToFront(which));
    const pin = this.add.graphics();
    pin.fillStyle(C.DHBW_RED, 1);
    pin.fillCircle(spec.WIDTH / 2, P.PIN_R + 3, P.PIN_R);
    pin.fillStyle(C.WHITE, 0.6);
    pin.fillCircle(spec.WIDTH / 2 - 1.5, P.PIN_R + 1.5, 1.4);
    container.add([shadow, paper, pin]);
    return { container, paper, baseY: spec.Y };
  }

  /** Ausdruck der IT-Seite: die Referenzwerte aus CAMPUS.certificate. */
  buildReferenceSheet() {
    const S = Ch4CertificateScene.LAYOUT.SHEET_A;
    const T = Ch4Logic.TEXTS.sheet;
    const CSS = CONFIG.CSS;
    const cert = CAMPUS.certificate;
    const sheet = this.createPaper(S, Ch4CertificateScene.DEPTH.SHEET_FRONT, 'reference');
    const c = sheet.container;
    const inner = S.WIDTH - 2 * S.PAD;
    const paperText = (size, extra = {}) => ({ size, font: 'PAPER', color: CSS.INK_MUTED, ...extra });
    let y = 16;
    const header = UI.text(this, S.PAD, y, T.header, paperText(S.HEADER_SIZE));
    y += header.height + 6;
    const title = UI.text(this, S.PAD, y, T.title, paperText(S.TITLE_SIZE, { bold: true, color: CSS.INK, wrap: inner, lineSpacing: 2 }));
    y += title.height + 8;
    const rule = this.add.rectangle(S.PAD, y, inner, 1, CONFIG.COLORS.INK_MUTED, 0.6).setOrigin(0);
    y += 8;
    c.add([header, title, rule]);

    const fields = [
      [T.labels.serverName, cert.serverName],
      [T.labels.issuer, cert.issuer],
      [T.labels.rootCA, cert.rootCA],
      [T.labels.validity, `${cert.validFrom} – ${cert.validTo}`],
    ];
    fields.forEach(([label, value]) => {
      const l = UI.text(this, S.PAD, y, label, paperText(S.LABEL_SIZE));
      const v = UI.text(this, S.PAD, y + l.height, value, { size: S.VALUE_SIZE, font: 'MONO', color: CSS.INK, wrap: inner });
      c.add([l, v]);
      y += l.height + v.height + 5;
    });
    const fpLabel = UI.text(this, S.PAD, y, T.labels.sha256, paperText(S.LABEL_SIZE));
    y += fpLabel.height + 1;
    const fp = UI.text(this, S.PAD, y, Ch4Logic.formatFingerprintRows(cert.sha256).join('\n'), {
      size: S.VALUE_SIZE, font: 'MONO', color: CSS.INK, lineSpacing: 3,
    });
    y += fp.height + 8;
    const warning = UI.text(this, S.PAD, y, T.warning, paperText(S.WARNING_SIZE, { bold: true, color: CSS.DHBW_RED }));
    y += warning.height + 3;
    const footer = UI.text(this, S.PAD, y, T.footer(CAMPUS), paperText(S.FOOTER_SIZE, { wrap: inner }));
    y += footer.height + 8;
    c.add([fpLabel, fp, warning, footer]);

    this.magnifierButton = new UI.Button(this, S.PAD, y, {
      text: T.magnifierButton(Ch4Logic.BALANCE.MAGNIFIER_MINUTES),
      variant: 'secondary',
      width: 'auto',
      minWidth: 120,
      height: S.BUTTON_H,
      fontSize: S.BUTTON_SIZE,
      onClick: () => this.useMagnifier(),
    });
    c.add(this.magnifierButton);
    sheet.contentBottom = y + S.BUTTON_H;
    this.referenceSheet = sheet;
  }

  /**
   * IT-Rundmail (liegt unter dem Ausdruck): kündigt den Zertifikatswechsel an.
   * Solange sie hinten liegt, zeigt der sichtbare rechte Streifen nur Kopf, „1 NEU“ und Betreff;
   * der eigentliche Text (body) erscheint erst, wenn sie vorn liegt – keine abgeschnittenen Zeilen.
   */
  buildNewsSheet() {
    const S = Ch4CertificateScene.LAYOUT.SHEET_B;
    const N = Ch4Logic.TEXTS.news;
    const CSS = CONFIG.CSS;
    const sheet = this.createPaper(S, Ch4CertificateScene.DEPTH.SHEET_BACK, 'news');
    const c = sheet.container;
    const inner = S.WIDTH - 2 * S.PAD;
    const right = S.WIDTH - S.PAD;
    const paperText = (size, extra = {}) => ({ size, font: 'PAPER', color: CSS.INK, wrap: inner, lineSpacing: 2, ...extra });
    // Kopf rechtsbündig: bleibt sichtbar, solange der Ausdruck darüber liegt
    const tab = UI.text(this, right, 14, N.tab, { size: S.TAB_SIZE, font: 'PAPER', bold: true, color: CSS.INK, origin: { x: 1, y: 0 } });
    const meta = UI.text(this, right, 34, N.meta(), { size: S.META_SIZE, font: 'PAPER', color: CSS.INK_MUTED, origin: { x: 1, y: 0 } });
    const badgeText = UI.text(this, 0, 0, N.badge, { size: S.BADGE_SIZE, bold: true, color: '#ffffff', origin: 0.5 });
    const badgeW = badgeText.width + 12;
    const badge = this.add.container(right - badgeW / 2, 60);
    badge.add([this.add.rectangle(0, 0, badgeW, 17, CONFIG.COLORS.DHBW_RED, 1), badgeText]);
    // Betreff im sichtbaren Streifen (nur solange die Rundmail hinten liegt)
    const teaser = UI.text(this, right, 80, N.teaser, {
      size: S.TEASER_SIZE, font: 'PAPER', color: CSS.INK_MUTED, align: 'right', lineSpacing: 2, origin: { x: 1, y: 0 },
    });
    c.add([tab, meta, badge, teaser]);

    const body = this.add.container(0, 0);
    let y = S.BODY_Y;
    const from = UI.text(this, S.PAD, y, N.header, paperText(S.FROM_SIZE, { color: CSS.INK_MUTED }));
    y += from.height + 5;
    const rule = this.add.rectangle(S.PAD, y, inner, 1, CONFIG.COLORS.INK_MUTED, 0.6).setOrigin(0);
    y += 7;
    const certItem = UI.text(this, S.PAD, y, N.certItem(CAMPUS), paperText(S.KEY_SIZE, { bold: true }));
    y += certItem.height + 4;
    const validity = UI.text(this, S.PAD, y, `${N.certValidity()}\n${N.certFingerprintLabel}`, paperText(S.VALIDITY_SIZE));
    y += validity.height + 2;
    const fp = UI.text(this, S.PAD, y, Ch4Logic.formatFingerprintRows(Ch4Logic.RENEWAL.sha256).join('\n'), {
      size: S.FP_SIZE, font: 'MONO', color: CSS.INK, lineSpacing: 3,
    });
    y += fp.height + 3;
    const footer = UI.text(this, S.PAD, y, N.certFooter, paperText(S.BODY_SIZE, { italic: true, color: CSS.INK_MUTED }));
    y += footer.height + 6;
    const more = UI.text(this, S.PAD, y, N.items.join('\n'), paperText(S.BODY_SIZE));
    y += more.height;
    body.add([from, rule, certItem, validity, fp, footer, more]);
    body.setVisible(false);
    c.add(body);
    sheet.badge = badge;
    sheet.teaser = teaser;
    sheet.body = body;
    sheet.contentBottom = y;
    this.newsSheet = sheet;
  }

  /** Rundmail-Text nur zeigen, wenn sie vorn liegt (hinten nur Kopf und Betreff). */
  updateNewsVisibility() {
    if (!this.newsSheet) return;
    const isFront = this.frontSheet === 'news';
    this.newsSheet.body.setVisible(isFront);
    this.newsSheet.teaser.setVisible(!isFront);
  }

  /** Post-it mit Tipps (Mitleids-Tipps aktualisieren es). */
  buildPostit() {
    const P = Ch4CertificateScene.LAYOUT.POSTIT;
    const container = this.add.container(P.X, P.Y).setDepth(Ch4CertificateScene.DEPTH.POSTIT).setAngle(P.ANGLE);
    const shadow = this.add.rectangle(3, 4, P.WIDTH, P.HEIGHT, CONFIG.COLORS.SHADOW, 0.25).setOrigin(0);
    const note = this.add.rectangle(0, 0, P.WIDTH, P.HEIGHT, CONFIG.COLORS.POSTIT, 1).setOrigin(0);
    this.postitText = UI.text(this, P.PAD, P.PAD - 2, Ch4Logic.TEXTS.postit.initial, {
      size: P.SIZE, font: 'HAND', color: CONFIG.CSS.INK, wrap: P.WIDTH - 2 * P.PAD, lineSpacing: 1,
    });
    container.add([shadow, note, this.postitText]);
    this.postit = container;
  }

  /** Neuer Post-it-Text mit kurzem Puls (Aufmerksamkeit ohne Dauer-Animation). */
  updatePostit(text) {
    if (!this.postitText || this.postitText.text === text) return;
    const P = Ch4CertificateScene.LAYOUT.POSTIT;
    this.postitText.setText(text);
    this.postitText.setFontSize(P.SIZE);
    // Passt der Text nicht aufs Post-it, Schrift verkleinern
    let size = P.SIZE;
    while (this.postitText.height > P.HEIGHT - P.PAD && size > 11) {
      size -= 1;
      this.postitText.setFontSize(size);
    }
    ChapterScene.safely(() => FX.pulse(this, this.postit, { scale: 1.05, duration: 120, repeat: 1 }));
  }

  // ===========================================================================
  // Aufbau: Handy
  // ===========================================================================

  buildPhone() {
    const P = Ch4CertificateScene.LAYOUT.PHONE;
    this.phone = new UI.Phone(this, P.X, P.Y, { width: P.WIDTH, height: P.HEIGHT, battery: P.BATTERY, theme: 'light' });
    this.phone.setDepth(Ch4CertificateScene.DEPTH.PHONE);
    this.phone.setWifiState('off', 0);
    this.screenArea = this.phone.getScreenArea();
    this.buildPhoneChrome();
  }

  /** App-Leiste „← WLAN“, Schalter „WLAN verwenden“ und Abschnittstitel. */
  buildPhoneChrome() {
    const L = Ch4CertificateScene.LAYOUT.LIST;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = Ch4Logic.TEXTS.phone;
    const W = this.screenArea.width;
    const parts = [];
    if (this.textures.exists('icon-back')) {
      parts.push(this.add.image(L.BACK_X, L.BACK_Y, 'icon-back').setDisplaySize(L.BACK_SIZE, L.BACK_SIZE).setTint(C.TEXT));
    } else {
      parts.push(UI.text(this, L.BACK_X, L.BACK_Y, '←', { size: L.APPBAR_SIZE, origin: 0.5 }));
    }
    parts.push(UI.text(this, L.APPBAR_TITLE_X, L.APPBAR_TITLE_Y, T.appBar, { size: L.APPBAR_SIZE, color: CSS.TEXT }));
    const toggleMid = L.TOGGLE_Y + L.TOGGLE_H / 2;
    parts.push(this.add.rectangle(0, L.TOGGLE_Y, W, L.TOGGLE_H, C.SURFACE_ALT, 1).setOrigin(0));
    parts.push(UI.text(this, L.PAD_X, toggleMid, T.toggle, { size: 15, color: CSS.TEXT, origin: { x: 0, y: 0.5 } }));
    const sw = this.add.graphics();
    const swX = W - L.PAD_X - L.SWITCH_W;
    sw.fillStyle(C.PRIMARY, 0.45);
    sw.fillRoundedRect(swX, toggleMid - L.SWITCH_H / 2, L.SWITCH_W, L.SWITCH_H, L.SWITCH_H / 2);
    sw.fillStyle(C.PRIMARY, 1);
    sw.fillCircle(swX + L.SWITCH_W - L.KNOB_R + 2, toggleMid, L.KNOB_R);
    parts.push(sw);
    parts.push(UI.text(this, L.PAD_X, L.SECTION_Y, T.section, { size: L.SECTION_SIZE, bold: true, color: CSS.PRIMARY }));
    this.phone.screen.add(parts);
  }

  /** Baut die WLAN-Liste neu auf (drei eduroam + sonstige Netze + „Netzwerk hinzufügen“). */
  renderNetworkList() {
    if (!this.phone) return;
    const L = Ch4CertificateScene.LAYOUT.LIST;
    if (this.rowsLayer) this.rowsLayer.destroy();
    this.rowsLayer = this.add.container(0, L.ROWS_Y);
    this.phone.screen.add(this.rowsLayer);
    const nets = this.logic.getNetworks();
    nets.forEach((net, i) => this.buildNetworkRow(net, i, i * L.ROW_H));
    let y = nets.length * L.ROW_H;
    Ch4Logic.TEXTS.otherNetworks(CAMPUS).forEach((net) => {
      this.buildOtherRow(net, y);
      y += L.OTHER_ROW_H;
    });
    const add = UI.text(this, L.PAD_X, y + L.ADD_GAP, Ch4Logic.TEXTS.phone.addNetwork, { size: L.ADD_SIZE, color: CONFIG.CSS.PRIMARY });
    add.setInteractive({ useHandCursor: true });
    add.on('pointerup', () => this.toast(Ch4Logic.TEXTS.phone.addNetworkToast, { duration: Ch4CertificateScene.TIMING.ROUND_TOAST_MS }));
    this.rowsLayer.add(add);
  }

  /** Eine eduroam-Zeile: Fächer, Name, Status · dBm, BSSID, Status-Chip. */
  buildNetworkRow(net, index, y) {
    const L = Ch4CertificateScene.LAYOUT.LIST;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = Ch4Logic.TEXTS.phone;
    const W = this.screenArea.width;
    const row = this.add.container(0, y);
    const bg = this.add.rectangle(0, 0, W, L.ROW_H, C.SURFACE, 1).setOrigin(0);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(C.SURFACE_ALT, 1));
    bg.on('pointerout', () => bg.setFillStyle(C.SURFACE, 1));
    bg.on('pointerup', () => this.handleNetworkTap(index));
    const separator = this.add.rectangle(L.TEXT_X, L.ROW_H - 1, W - L.TEXT_X, 1, C.BORDER, 1).setOrigin(0);
    const fan = this.add.graphics();
    this.drawFan(fan, L.ICON_X, L.ROW_H / 2 + L.ICON_RADIUS / 2, net.level, C.TEXT);

    const override = this.rowOverride && this.rowOverride.index === index ? this.rowOverride : null;
    const statusText = override ? override.text : T.status[net.status] || T.status.idle;
    const dbm = Ch4CertificateScene.formatDbm(net.dbm);
    const title = UI.text(this, L.TEXT_X, L.TITLE_Y, net.ssid, { size: L.TITLE_SIZE, color: CSS.TEXT });
    const status = UI.text(this, L.TEXT_X, L.STATUS_Y, `${statusText} · ${dbm}`, {
      size: L.STATUS_SIZE,
      color: override ? CSS.PRIMARY : CSS.TEXT_MUTED,
    });
    const bssid = UI.text(this, L.TEXT_X, L.BSSID_Y, `BSSID ${net.bssid}`, { size: L.BSSID_SIZE, font: 'MONO', color: CSS.TEXT_MUTED });
    row.add([bg, separator, fan, title, status, bssid]);

    const chipColors = { caught: C.DANGER, phished: C.DANGER, rejected: C.TEXT_MUTED, connected: C.SUCCESS };
    const chipLabel = !override && T.chip[net.status];
    if (chipLabel) {
      const label = UI.text(this, 0, 0, chipLabel, { size: L.CHIP_SIZE, bold: true, color: '#ffffff', origin: 0.5 });
      const chipW = label.width + 2 * L.CHIP_PAD_X;
      const chipX = W - L.CHIP_RIGHT - chipW;
      const chip = this.add.graphics();
      chip.fillStyle(chipColors[net.status], 1);
      chip.fillRoundedRect(chipX, L.CHIP_Y, chipW, L.CHIP_H, L.CHIP_H / 2);
      label.setPosition(chipX + chipW / 2, L.CHIP_Y + L.CHIP_H / 2);
      row.add([chip, label]);
    }
    if (override && override.spinner) {
      const spinner = new UI.Spinner(this, W - L.CHIP_RIGHT - L.SPINNER_SIZE, (L.ROW_H - L.SPINNER_SIZE) / 2, {
        size: L.SPINNER_SIZE,
        color: C.PRIMARY,
      });
      spinner.start();
      row.add(spinner);
    }
    const isInactive = net.status === Ch4Logic.STATUS.CAUGHT || net.status === Ch4Logic.STATUS.PHISHED;
    [fan, title, status, bssid].forEach((obj) => obj.setAlpha(isInactive ? L.INACTIVE_ALPHA : 1));
    this.rowsLayer.add(row);
  }

  /** Sonstige Netze (Gast-WLAN, FRITZ!Box, Kevins iPhone) – nur für Witz-Toasts. */
  buildOtherRow(net, y) {
    const L = Ch4CertificateScene.LAYOUT.LIST;
    const C = CONFIG.COLORS;
    const W = this.screenArea.width;
    const row = this.add.container(0, y);
    const bg = this.add.rectangle(0, 0, W, L.OTHER_ROW_H, C.SURFACE, 1).setOrigin(0);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(C.SURFACE_ALT, 1));
    bg.on('pointerout', () => bg.setFillStyle(C.SURFACE, 1));
    bg.on('pointerup', () => this.toast(net.toast, { duration: Ch4CertificateScene.TIMING.ROUND_TOAST_MS }));
    const fan = this.add.graphics();
    this.drawFan(fan, L.ICON_X, L.OTHER_ROW_H / 2 + L.ICON_RADIUS / 2, Ch4Logic.signalLevel(net.dbm), C.TEXT_MUTED);
    const title = UI.text(this, L.TEXT_X, L.OTHER_ROW_H / 2, net.ssid, { size: L.OTHER_TITLE_SIZE, color: CONFIG.CSS.TEXT, origin: { x: 0, y: 0.5 } });
    const sub = UI.text(this, W - L.CHIP_RIGHT, L.OTHER_ROW_H / 2, net.isLocked ? Ch4Logic.TEXTS.phone.status.idle : '', {
      size: L.OTHER_SUB_SIZE, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 1, y: 0.5 },
    });
    row.add([bg, fan, title, sub]);
    this.rowsLayer.add(row);
  }

  /** WLAN-Fächer (Textures.drawWifiFan, sonst vier Balken). Spitze bei (x, y). */
  drawFan(g, x, y, level, color) {
    const L = Ch4CertificateScene.LAYOUT.LIST;
    const r = L.ICON_RADIUS;
    if (typeof Textures !== 'undefined' && typeof Textures.drawWifiFan === 'function') {
      Textures.drawWifiFan(g, x, y, r, level, color, L.FAN_EMPTY_ALPHA);
      return;
    }
    for (let i = 0; i < 4; i += 1) {
      const h = (r * (i + 1)) / 4;
      g.fillStyle(color, i < level ? 1 : L.FAN_EMPTY_ALPHA);
      g.fillRect(x - r * 0.7 + i * r * 0.38, y - h, r * 0.26, h);
    }
  }

  // ===========================================================================
  // Aufbau: Dialoge im Handy
  // ===========================================================================

  /** Android-Zertifikatsdialog (neu aufgebaut bei Details/Lupe). */
  buildDialog({ animate = false } = {}) {
    const d = this.dialog;
    if (!d) return;
    if (d.container) d.container.destroy();
    const DL = Ch4CertificateScene.LAYOUT.DIALOG;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const T = Ch4Logic.TEXTS.dialog;
    const A = this.screenArea;
    const root = this.add.container(A.x, A.y).setDepth(Ch4CertificateScene.DEPTH.DIALOG);
    const scrim = this.add.rectangle(0, 0, A.width, A.height, C.SHADOW, DL.SCRIM_ALPHA).setOrigin(0).setInteractive();
    const panel = this.add.container(DL.MARGIN, 0);
    root.add([scrim, panel]);
    const W = A.width - 2 * DL.MARGIN;
    const inner = W - 2 * DL.PAD;
    const cert = d.net.cert;
    const refs = {};
    const parts = [];
    let y = DL.PAD;

    const title = UI.text(this, DL.PAD, y, T.title, { size: DL.TITLE_SIZE, bold: true, color: CSS.TEXT, wrap: inner, lineSpacing: 2 });
    y += title.height + 2;
    const sub = UI.text(this, DL.PAD, y, `${d.net.ssid} · ${Ch4CertificateScene.formatDbm(d.net.dbm)} · ${d.net.bssid}`, {
      size: DL.SUB_SIZE, color: CSS.TEXT_MUTED, wrap: inner,
    });
    y += sub.height + DL.SECTION_GAP;
    parts.push(title, sub);
    if (!d.detailsOpen) {
      const hint = UI.text(this, DL.PAD, y, T.hint, { size: DL.HINT_SIZE, color: CSS.TEXT, wrap: inner });
      y += hint.height + DL.SECTION_GAP;
      parts.push(hint);
    }
    if (d.magnifier) {
      const lupe = UI.text(this, DL.PAD, y, T.magnifier, { size: DL.LUPE_SIZE, bold: true, color: CSS.PRIMARY, wrap: inner });
      y += lupe.height + DL.FIELD_GAP;
      parts.push(lupe);
    }

    // Felder (mit Lupe grün/rot)
    this.getDialogFields(d).forEach((field) => {
      const label = UI.text(this, DL.PAD, y, field.label, { size: DL.LABEL_SIZE, color: CSS.TEXT_MUTED });
      const color = field.ok === true ? CSS.SUCCESS : field.ok === false ? CSS.DANGER : CSS.TEXT;
      const value = UI.text(this, DL.PAD, y + label.height, field.value, {
        size: DL.VALUE_SIZE, color, bold: field.ok === false, wrap: field.isHost ? null : inner,
      });
      if (field.isHost) Ch4CertificateScene.fitHostname(value, inner);
      y += label.height + value.height + DL.FIELD_GAP;
      parts.push(label, value);
    });
    if (d.detailsOpen) {
      const label = UI.text(this, DL.PAD, y, T.labels.sha256, { size: DL.LABEL_SIZE, color: CSS.TEXT_MUTED });
      y += label.height + 1;
      parts.push(label);
      const rowsOk = d.magnifier ? this.logic.compareFingerprintRows(d.index) : null;
      Ch4Logic.formatFingerprintRows(cert.sha256).forEach((line, r) => {
        const ok = rowsOk ? rowsOk[r] : null;
        const color = ok === true ? CSS.SUCCESS : ok === false ? CSS.DANGER : CSS.TEXT;
        parts.push(UI.text(this, DL.PAD, y, line, { size: DL.FP_SIZE, font: 'MONO', color, bold: ok === false }));
        y += DL.FP_LINE;
      });
      y += DL.FIELD_GAP;
    }
    if (this.isAnnouncedBannerVisible(d)) {
      const banner = this.add.rectangle(DL.PAD, y, inner, DL.BANNER_H, C.SUCCESS, 0.12).setOrigin(0);
      const bannerText = UI.text(this, DL.PAD + 8, y + DL.BANNER_H / 2, T.announced, {
        size: DL.BANNER_SIZE, bold: true, color: CSS.SUCCESS, origin: { x: 0, y: 0.5 },
      });
      y += DL.BANNER_H + DL.FIELD_GAP;
      parts.push(banner, bannerText);
    }
    if (!d.detailsOpen) {
      refs.details = new UI.Button(this, DL.PAD - 6, y, {
        text: `${T.details} ▾`, variant: 'link', width: 'auto', minWidth: 60, height: DL.LINK_H, fontSize: DL.LINK_SIZE,
        onClick: () => this.openDetails(),
      });
      y += DL.LINK_H + 2;
      parts.push(refs.details);
    }

    // Countdown (böse UX)
    refs.countdownText = UI.text(this, DL.PAD, y, '', { size: DL.COUNTDOWN_SIZE, color: CSS.TEXT_MUTED });
    y += refs.countdownText.height + 3;
    refs.bar = new UI.ProgressBar(this, DL.PAD, y, { width: inner, height: DL.BAR_H, value: 1, color: C.WARNING });
    y += DL.BAR_H + DL.SECTION_GAP + 2;
    parts.push(refs.countdownText, refs.bar);

    // Buttons: „Ablehnen“ unscheinbar, „Vertrauen“ knallblau (Dark Pattern)
    const trustX = W - DL.PAD - DL.TRUST_W;
    refs.reject = new UI.Button(this, trustX - DL.BUTTON_GAP - DL.REJECT_W, y, {
      text: T.reject, variant: 'ghost', width: DL.REJECT_W, height: DL.BUTTON_H, fontSize: DL.BUTTON_FONT,
      onClick: () => this.decideFromDialog(Ch4Logic.DECISION.REJECT),
    });
    refs.trust = new UI.Button(this, trustX, y, {
      text: T.trust, variant: 'primary', width: DL.TRUST_W, height: DL.BUTTON_H, fontSize: DL.BUTTON_FONT,
      onClick: () => this.decideFromDialog(Ch4Logic.DECISION.TRUST),
    });
    y += DL.BUTTON_H + DL.PAD;
    parts.push(refs.reject, refs.trust);

    // Fläche + Klickfänger zuunterst
    const bg = this.add.graphics();
    bg.fillStyle(C.SHADOW, 0.18);
    bg.fillRoundedRect(0, 3, W, y, DL.RADIUS);
    bg.fillStyle(C.SURFACE, 1);
    bg.fillRoundedRect(0, 0, W, y, DL.RADIUS);
    const hit = this.add.rectangle(0, 0, W, y).setOrigin(0).setInteractive();
    panel.add([bg, hit, ...parts]);
    panel.y = Math.max(DL.MIN_TOP, Math.round((A.height - y) / 2));
    refs.panelHeight = y;

    d.container = root;
    d.panel = panel;
    d.refs = refs;
    d.lastSecond = null;
    this.refreshCountdownView();
    if (animate) {
      panel.setAlpha(0.02).setScale(DL.START_SCALE);
      this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: DL.OPEN_MS, ease: 'Cubic.easeOut' });
    }
  }

  /** Feldliste der kompakten bzw. ausführlichen Ansicht (mit Lupen-Ergebnis). */
  getDialogFields(d) {
    const T = Ch4Logic.TEXTS.dialog.labels;
    const cert = d.net.cert;
    const cmp = d.magnifier ? this.logic.compareForDisplay(d.index) : null;
    const pick = (key) => (cmp ? cmp[key] : null);
    const maxChars = CAMPUS.certificate.serverName.length;
    const fields = [
      {
        label: T.serverName,
        value: d.detailsOpen ? cert.serverName : Ch4Logic.truncateServerName(cert.serverName, maxChars),
        ok: pick('serverName'),
        isHost: true,
      },
      { label: T.organization, value: cert.organization || '—', ok: null },
    ];
    if (d.detailsOpen) {
      fields.push({ label: T.issuer, value: cert.issuer || '—', ok: pick('issuer') });
      fields.push({ label: T.rootCA, value: cert.rootCA || '—', ok: pick('rootCA') });
      fields.push({ label: T.validity, value: `${cert.validFrom} – ${cert.validTo}`, ok: pick('validity') });
    } else {
      fields.push({ label: T.validTo, value: cert.validTo || '—', ok: pick('validity') });
    }
    return fields;
  }

  /** Banner „In der IT-Rundmail angekündigt“: höchste Tipp-Stufe im Finale. */
  isAnnouncedBannerVisible(d) {
    return d.net.kind === Ch4Logic.KIND.RENEWED && this.logic.getFinaleHintLevel() >= 3;
  }

  /** Countdown-Text und -Balken aktualisieren (Text nur bei Sekundenwechsel). */
  refreshCountdownView() {
    const d = this.dialog;
    const cd = this.countdown;
    if (!d || !cd || !d.refs.countdownText) return;
    const T = Ch4Logic.TEXTS.dialog;
    const CSS = CONFIG.CSS;
    const fraction = cd.remaining / Ch4Logic.COUNTDOWN_MS;
    if (!cd.running) {
      if (d.lastSecond !== 'paused') {
        d.refs.countdownText.setText(T.paused).setColor(CSS.SUCCESS);
        d.refs.bar.setColor(CONFIG.COLORS.BORDER);
        d.refs.bar.setValue(fraction, false);
        d.lastSecond = 'paused';
      }
      return;
    }
    const seconds = Math.ceil(cd.remaining / 1000);
    if (seconds !== d.lastSecond) {
      const isWarning = seconds <= Ch4CertificateScene.TIMING.COUNTDOWN_WARN_S;
      d.refs.countdownText.setText(T.countdown(seconds)).setColor(isWarning ? CSS.DANGER : CSS.TEXT_MUTED);
      if (isWarning && d.lastSecond !== null && seconds > 0) UI.sound('tick');
      d.lastSecond = seconds;
    }
    d.refs.bar.setValue(fraction, false);
  }

  closeDialog() {
    if (this.dialog && this.dialog.container) this.dialog.container.destroy();
    this.dialog = null;
    this.countdown = null;
  }

  /**
   * Einfache Android-Meldung im Handy (Titel, Text, ein Text-Button).
   * @param {{title: string, body: string, button: string, onConfirm: Function}} spec
   */
  showPhoneCard({ title, body, button, onConfirm }) {
    this.closePhoneCard();
    const CL = Ch4CertificateScene.LAYOUT.CARD;
    const DL = Ch4CertificateScene.LAYOUT.DIALOG;
    const C = CONFIG.COLORS;
    const CSS = CONFIG.CSS;
    const A = this.screenArea;
    const root = this.add.container(A.x, A.y).setDepth(Ch4CertificateScene.DEPTH.DIALOG);
    const scrim = this.add.rectangle(0, 0, A.width, A.height, C.SHADOW, DL.SCRIM_ALPHA).setOrigin(0).setInteractive();
    const panel = this.add.container(CL.MARGIN, 0);
    root.add([scrim, panel]);
    const W = A.width - 2 * CL.MARGIN;
    const inner = W - 2 * CL.PAD;
    let y = CL.PAD;
    const titleText = UI.text(this, CL.PAD, y, title, { size: CL.TITLE_SIZE, bold: true, color: CSS.TEXT, wrap: inner });
    y += titleText.height + CL.GAP;
    const bodyText = UI.text(this, CL.PAD, y, body, { size: CL.BODY_SIZE, color: CSS.TEXT, wrap: inner, lineSpacing: 4 });
    y += bodyText.height + CL.GAP;
    const confirm = new UI.Button(this, 0, y, {
      text: button, variant: 'ghost', width: 'auto', minWidth: 72, height: CL.BUTTON_H, fontSize: 15,
      onClick: () => {
        if (!this.phoneCard || this.phoneCard.container !== root) return;
        this.closePhoneCard();
        onConfirm();
      },
    });
    confirm.x = W - CL.PAD + 8 - confirm.width;
    y += CL.BUTTON_H + CL.PAD - 6;
    const bg = this.add.graphics();
    bg.fillStyle(C.SHADOW, 0.18);
    bg.fillRoundedRect(0, 3, W, y, CL.RADIUS);
    bg.fillStyle(C.SURFACE, 1);
    bg.fillRoundedRect(0, 0, W, y, CL.RADIUS);
    const hit = this.add.rectangle(0, 0, W, y).setOrigin(0).setInteractive();
    panel.add([bg, hit, titleText, bodyText, confirm]);
    panel.y = Math.round((A.height - y) / 2);
    panel.setAlpha(0.02).setScale(DL.START_SCALE);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: DL.OPEN_MS, ease: 'Cubic.easeOut' });
    UI.sound('notify');
    this.phoneCard = { container: root, button: confirm };
  }

  closePhoneCard() {
    if (this.phoneCard && this.phoneCard.container) this.phoneCard.container.destroy();
    this.phoneCard = null;
  }

  /** Kevin-Spruch (Handschrift) und Tipp (Post-it-Kasten) unter dem Text der Auswertung. */
  buildModalExtras(container, innerWidth, text) {
    const M = Ch4CertificateScene.LAYOUT.MODAL;
    let y = 0;
    if (text.kevin) {
      const kevin = UI.text(this, 0, y, text.kevin, { size: M.KEVIN_SIZE, font: 'HAND', color: CONFIG.CSS.DHBW_RED, wrap: innerWidth });
      container.add(kevin);
      y += kevin.height + 8;
    }
    if (text.tip) {
      const tipText = UI.text(this, M.TIP_PAD, y + M.TIP_PAD, `Tipp: ${text.tip}`, {
        size: M.TIP_SIZE, font: 'HAND', color: CONFIG.CSS.INK, wrap: innerWidth - 2 * M.TIP_PAD,
      });
      const box = this.add.rectangle(0, y, innerWidth, tipText.height + 2 * M.TIP_PAD, CONFIG.COLORS.POSTIT, 1).setOrigin(0);
      container.add([box, tipText]);
      y += box.height;
    }
    return y;
  }

  // ===========================================================================
  // Hilfen
  // ===========================================================================

  /** Szenen-Timer, der nach dem Kapitelende nichts mehr auslöst. */
  later(ms, fn) {
    return this.time.delayedCall(ms, () => {
      if (!this.isFinished) fn();
    });
  }

  /**
   * Kleiner, unvermeidbarer Frust (kein Fehlversuch) mit Schwebetext.
   * @param {number} amount Prozentpunkte
   * @param {string} reason
   * @param {{x?: number, y?: number, X?: number, Y?: number}} pos
   */
  addFrustration(amount, reason, pos = {}) {
    if (!(amount > 0) || this.isFinished) return;
    const x = pos.x ?? pos.X ?? ChapterScene.FEEDBACK.DEFAULT_X;
    const y = pos.y ?? pos.Y ?? ChapterScene.FEEDBACK.DEFAULT_Y;
    ChapterScene.safely(() => {
      const p = this.clampToArea(x, y);
      FX.floatText(this, p.x, p.y, `${reason} · +${amount} % Frust`, { color: CONFIG.CSS.HAZARD, size: 15 });
    });
    GameState.addFrustration(amount, reason);
  }

  /** Mittelpunkt einer eduroam-Zeile in Weltkoordinaten. */
  getRowWorldCenter(index) {
    const L = Ch4CertificateScene.LAYOUT.LIST;
    const A = this.screenArea || { x: 0, y: 0, width: 0 };
    return { x: Math.round(A.x + A.width / 2), y: Math.round(A.y + L.ROWS_Y + index * L.ROW_H + L.ROW_H / 2) };
  }

  /** Mittelpunkt eines Objekts (Ursprung links oben) in Weltkoordinaten. */
  static worldCenter(object, width, height) {
    if (!object || !object.scene) return null;
    const m = object.getWorldTransformMatrix();
    const p = m.transformPoint(width / 2, height / 2, { x: 0, y: 0 });
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /**
   * Bricht einen zu langen Hostnamen an Punkten um statt mitten im Wort
   * („radius.dhbw-stuttgart.de.“ / „login-portal.example“) – so fällt Kevins Anhängsel auf.
   * @param {Phaser.GameObjects.Text} textObject Text ohne wordWrap (die Breite wird gemessen)
   * @param {number} maxWidth
   */
  static fitHostname(textObject, maxWidth) {
    if (!textObject || textObject.width <= maxWidth) return;
    const labels = textObject.text.split('.');
    const lines = [];
    let current = '';
    labels.forEach((label, i) => {
      const piece = i < labels.length - 1 ? `${label}.` : label;
      textObject.setText(current + piece);
      if (current && textObject.width > maxWidth) {
        lines.push(current);
        current = piece;
      } else {
        current += piece;
      }
    });
    lines.push(current);
    textObject.setText(lines.join('\n'));
    // Ein einzelnes Label ist immer noch zu breit (sehr unwahrscheinlich): dann normal umbrechen
    if (textObject.width > maxWidth) textObject.setWordWrapWidth(maxWidth, true);
  }

  /** −45 dBm (mit echtem Minuszeichen). */
  static formatDbm(dbm) {
    return `${String(dbm).replace('-', '−')} dBm`;
  }

  /** Text der Auswertung: Begründungen als Aufzählung, „Merke“ als eigener Absatz. */
  static formatResultBody(text, result) {
    if (result.outcome === Ch4Logic.OUTCOME.CAUGHT) {
      const lesson = Ch4Logic.TEXTS.outcomes.copyLesson;
      const [intro, ...rest] = text.lines;
      const reasons = rest.filter((line) => line !== lesson).map((line) => `• ${line}`);
      const body = [intro, ...reasons].join('\n');
      return rest.includes(lesson) ? `${body}\n\n${lesson}` : body;
    }
    return text.lines.join('\n\n');
  }

  // ===========================================================================
  // Debug/Test
  // ===========================================================================

  /**
   * Löst das Kapitel wie ein perfekter Spieler (Rundmail lesen, richtig entscheiden) – aus jedem
   * Zustand, ohne Strafen und ohne Erfolg (Debug ist keine Leistung).
   */
  debugSolve() {
    if (this.isFinished) return;
    this.isDebugSolving = true; // eigene Timer/Handler laufen danach ins Leere (isFinished)
    this.closeDialog();
    this.closePhoneCard();
    if (UI.Modal && typeof UI.Modal.closeAll === 'function') UI.Modal.closeAll(this);
    this.activeModal = null;
    this.pendingPassword = null; // offene Passwort-Zeitstrafe verfällt (keine Strafen im Debug)
    if (!this.logic.hasReadNews()) this.bringSheetToFront('news');
    const { TRUST, REJECT } = Ch4Logic.DECISION;
    for (let step = 0; step < Ch4CertificateScene.DEBUG_SOLVE_MAX_STEPS && !this.logic.isFinished(); step += 1) {
      if (this.logic.isRoundComplete()) {
        this.logic.advance();
        continue;
      }
      const open = this.logic.getNetworks().filter((net) => net.canInspect);
      if (open.length === 0) break;
      const genuine = open.find((net) => net.trustworthy);
      if (genuine) this.logic.decide(genuine.index, TRUST);
      else this.logic.decide(open[0].index, REJECT);
    }
    this.rowOverride = null;
    this.renderNetworkList();
    this.updateTracker();
    this.finishChapter();
  }

  /** Zustand für Tests: Schritt, Runde, Dialog, Netze (inkl. Klickpunkten) und UI-Klickpunkte. */
  getDebugInfo() {
    const base = super.getDebugInfo();
    if (!this.logic) return { ...base, step: 'init' };
    const d = this.dialog;
    const nets = this.logic.getNetworks();
    return {
      ...base,
      step: this.step,
      round: this.logic.getRoundNumber(),
      roundCount: Ch4Logic.ROUND_COUNT,
      mode: this.logic.getRound().mode,
      isFinale: this.logic.isFinale(),
      newsRead: this.logic.hasReadNews(),
      frontSheet: this.frontSheet,
      newsBodyVisible: Boolean(this.newsSheet && this.newsSheet.body.visible),
      magnifierUses: this.magnifierUses,
      stats: this.logic.getStats(),
      dialog: d
        ? {
          networkIndex: d.index,
          kind: d.net.kind,
          trustworthy: d.net.trustworthy,
          detailsOpen: d.detailsOpen,
          magnifier: d.magnifier,
          countdownMs: this.countdown ? Math.round(this.countdown.remaining) : null,
          countdownRunning: Boolean(this.countdown && this.countdown.running),
          panelHeight: d.refs.panelHeight,
        }
        : null,
      networks: nets.map((net) => ({
        index: net.index,
        kind: net.kind,
        status: net.status,
        dbm: net.dbm,
        bssid: net.bssid,
        featured: net.featured,
        canInspect: net.canInspect,
        trustworthy: net.trustworthy,
        center: this.getRowWorldCenter(net.index),
      })),
      ui: this.getUiPoints(),
    };
  }

  /** Klickpunkte (Spielkoordinaten) der gerade sichtbaren Bedienelemente. */
  getUiPoints() {
    const W = Ch4CertificateScene.worldCenter;
    const SA = Ch4CertificateScene.LAYOUT.SHEET_A;
    const SB = Ch4CertificateScene.LAYOUT.SHEET_B;
    const refs = this.dialog ? this.dialog.refs : {};
    const btn = (b) => (b && b.scene ? W(b, b.width, b.height) : null);
    const modal = this.activeModal && this.activeModal.isOpen() ? this.activeModal : null;
    return {
      card: this.phoneCard ? btn(this.phoneCard.button) : null,
      details: btn(refs.details),
      trust: btn(refs.trust),
      reject: btn(refs.reject),
      modalButtons: modal ? modal.getButtons().map(btn) : [],
      magnifier: btn(this.magnifierButton),
      // sichtbare Stellen der Blätter (Rundmail: rechter Rand, Ausdruck: linker Rand)
      newsSheet: { x: SB.X + SB.WIDTH - 50, y: SB.Y + 150 },
      referenceSheet: { x: SA.X + 60, y: SA.Y + 150 },
    };
  }
}
