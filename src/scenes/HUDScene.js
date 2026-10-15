/**
 * HUDScene.js – Statusleiste über den Kapiteln (Key 'HUD', 48 px hoch).
 *
 * Links: „Kapitel N von 5: Titel“ + „Aufgabe: …“ (mit … gekürzt).
 * Mitte: Digitaluhr (MONO) + „Vorlesung 08:15“ bzw. rot „+N min zu spät“.
 * Rechts: Frust-Barometer (Gesicht, Balken grün → gelb → rot, Prozent), Ton und Pause.
 * Darunter gleiten Benachrichtigungen (Uhrzeit-Meilensteine, Erfolge) hervor.
 * Pause-Overlay: Weiter / Kapitel neu starten / Hauptmenü (Esc = Weiter).
 *
 * Das HUD liest nur GameState und ruft für Aktionen GameScene auf (togglePause,
 * restartChapter, quitToMenu). Alle Listener werden beim shutdown abgemeldet.
 *
 * Global: HUDScene.
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, EVENTS, GameState, Scoring, SFX, UI, FX,
 * GameScene (Key 'Game').
 */

class HUDScene extends Phaser.Scene {
  /** Layout der Leiste (px). */
  static LAYOUT = Object.freeze({
    HEIGHT: CONFIG.HUD_HEIGHT,
    PAD_X: 14,
    CHAPTER_Y: 6,
    CHAPTER_SIZE: 11,
    OBJECTIVE_Y: 22,
    OBJECTIVE_SIZE: 14,
    OBJECTIVE_MIN_SIZE: 12, // lange Aufgaben erst verkleinern, dann kürzen
    LEFT_MAX_WIDTH: 312,   // endet vor der Uhr
    TOOLTIP_WIDTH: 340,
    TOOLTIP_PAD: 8,
    CLOCK_X: 400,
    CLOCK_Y: 3,
    CLOCK_SIZE: 24,
    CLOCK_SIZE_LONG: 15,   // „Tag 2, 07:31“
    CLOCK_SUB_Y: 31,
    CLOCK_SUB_SIZE: 11,
    CLOCK_FLOAT_START: 16, // „+N min“ startet so weit unter der Leiste
    FACE_X: 488,
    FACE_Y: 24,
    FACE_SIZE: 28,
    BAR_X: 512,
    BAR_Y: 26,
    BAR_WIDTH: 160,
    BAR_HEIGHT: 10,
    BAR_LABEL_Y: 9,
    ICON_HIT: 34,
    ICON_SIZE: 24,
    SOUND_X: 716,
    PAUSE_X: 762,
    ICON_Y: 24,
    BANNER_WIDTH: 460,
    BANNER_TOP: 56,        // Endposition unter der Leiste
    BANNER_PAD_X: 16,
    BANNER_PAD_Y: 10,
    BANNER_STRIPE: 6,
    BANNER_ICON_SPACE: 34,
    PAUSE_PANEL_WIDTH: 380,
    PAUSE_BUTTON_WIDTH: 280,
    PAUSE_BUTTON_HEIGHT: 44,
    PAUSE_BUTTON_GAP: 12,
  });

  /** Animationen (ms). */
  static TIMING = Object.freeze({
    BAR_TWEEN_MS: 240,
    PULSE_MS: 130,
    PULSE_REPEAT: 2,
    CLOCK_FLOAT_RISE: 36,
    BANNER_IN_MS: 280,
    BANNER_HOLD_MS: 2800,
    BANNER_OUT_MS: 240,
    RAGE_FLASH_MS: 320,
    RAGE_GLITCH_MS: 480,
  });

  /** Farben, die es so nicht in CONFIG gibt. */
  static COLORS = Object.freeze({
    LATE_TEXT: '#ff6b78', // aufgehelltes Stempelrot – auf Nachtblau gut lesbar
    MUTED_ALPHA: 0.72,
  });

  /** Frust-Stufen → face-0 … face-4. */
  static FACE_STEP = 20;

  constructor() {
    super({ key: 'HUD' });
  }

  create() {
    const L = HUDScene.LAYOUT;
    this.bannerQueue = [];
    this.activeBanner = null;
    this.pauseOverlay = null;
    this.rageBlocker = null;
    this.buttonRects = {};
    this.lastClockMinutes = null;
    this.lastClockLabel = null;
    this.lastLateMinutes = null;
    this.lastChapterId = null;
    this.objectiveFull = '';
    this.displayedFrustration = null;

    // Leiste (fängt Klicks ab, damit nichts darunter ausgelöst wird)
    this.add.rectangle(0, 0, CONFIG.WIDTH, L.HEIGHT, CONFIG.COLORS.BG_ALT)
      .setOrigin(0)
      .setDepth(CONFIG.DEPTH.UI)
      .setInteractive();
    this.add.rectangle(0, L.HEIGHT - 1, CONFIG.WIDTH, 1, CONFIG.COLORS.BG_DEEP).setOrigin(0).setDepth(CONFIG.DEPTH.UI);

    this.buildLeft();
    this.buildClock();
    this.buildFrustration();
    this.buildIconButtons();

    // Startzustand
    const snapshot = GameState.getSnapshot();
    this.renderChapter(snapshot.currentChapterId);
    this.renderObjective(snapshot.objective || '');
    this.renderFrustration(snapshot.frustration || 0, { animate: false });
    this.renderClock(GameState.getClockMinutes());
    if (snapshot.paused) this.showPauseOverlay();

    // GameState-Ereignisse
    this.gameStateHandlers = [
      [EVENTS.STATE_CHANGED, this.handleStateChanged],
      [EVENTS.FRUSTRATION_CHANGED, this.handleFrustrationChanged],
      [EVENTS.CLOCK_JUMP, this.handleClockJump],
      [EVENTS.CLOCK_MILESTONE, this.handleMilestone],
      [EVENTS.OBJECTIVE_CHANGED, this.handleObjectiveChanged],
      [EVENTS.ACHIEVEMENT, this.handleAchievement],
      [EVENTS.PAUSE_CHANGED, this.handlePauseChanged],
      [EVENTS.RAGE_QUIT, this.handleRageQuit],
    ];
    this.gameStateHandlers.forEach(([event, handler]) => GameState.on(event, handler, this));
    this.seenKeyEvents = new WeakSet(); // Phaser 3.90 meldet keydowns teils mehrfach
    this.input.keyboard.on('keydown', this.handleKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  /** Uhr jede Frame aktualisieren (Text nur bei Änderung neu setzen). */
  update() {
    const minutes = GameState.getClockMinutes();
    if (minutes !== this.lastClockMinutes) this.renderClock(minutes);
  }

  // ---------------------------------------------------------------------------
  // Aufbau
  // ---------------------------------------------------------------------------

  buildLeft() {
    const L = HUDScene.LAYOUT;
    this.chapterText = UI.text(this, L.PAD_X, L.CHAPTER_Y, '', {
      size: L.CHAPTER_SIZE,
      color: CONFIG.CSS.TEXT_INVERSE,
      depth: CONFIG.DEPTH.UI + 1,
    }).setAlpha(HUDScene.COLORS.MUTED_ALPHA);
    this.objectiveText = UI.text(this, L.PAD_X, L.OBJECTIVE_Y, '', {
      size: L.OBJECTIVE_SIZE,
      bold: true,
      color: CONFIG.CSS.TEXT_INVERSE,
      depth: CONFIG.DEPTH.UI + 1,
    });

    // Gekürzte Aufgabe: beim Überfahren vollständig als Tooltip unter der Leiste
    this.objectiveTooltip = null;
    this.isObjectiveTruncated = false;
    const zone = this.add.rectangle(0, 0, L.PAD_X + L.LEFT_MAX_WIDTH, L.HEIGHT, CONFIG.COLORS.WHITE, 0)
      .setOrigin(0)
      .setDepth(CONFIG.DEPTH.UI + 1)
      .setInteractive();
    zone.on('pointerover', () => this.showObjectiveTooltip());
    zone.on('pointerout', () => this.hideObjectiveTooltip());
  }

  buildClock() {
    const L = HUDScene.LAYOUT;
    this.clockText = UI.text(this, L.CLOCK_X, L.CLOCK_Y, '', {
      font: 'MONO',
      size: L.CLOCK_SIZE,
      bold: true,
      color: CONFIG.CSS.TEXT_INVERSE,
      origin: { x: 0.5, y: 0 },
      depth: CONFIG.DEPTH.UI + 1,
    });
    this.clockSubText = UI.text(this, L.CLOCK_X, L.CLOCK_SUB_Y, '', {
      size: L.CLOCK_SUB_SIZE,
      color: CONFIG.CSS.TEXT_INVERSE,
      origin: { x: 0.5, y: 0 },
      depth: CONFIG.DEPTH.UI + 1,
    });
  }

  buildFrustration() {
    const L = HUDScene.LAYOUT;
    const depth = CONFIG.DEPTH.UI + 1;
    if (this.textures.exists('face-0')) {
      this.face = this.add.image(L.FACE_X, L.FACE_Y, 'face-0').setDisplaySize(L.FACE_SIZE, L.FACE_SIZE).setDepth(depth);
    } else {
      this.face = this.add.circle(L.FACE_X, L.FACE_Y, L.FACE_SIZE / 2, CONFIG.COLORS.HAZARD).setDepth(depth);
    }
    this.faceBaseScale = this.face.scaleX;

    UI.text(this, L.BAR_X, L.BAR_LABEL_Y, 'Frust', {
      size: 10,
      bold: true,
      color: CONFIG.CSS.TEXT_INVERSE,
      depth,
    }).setAlpha(HUDScene.COLORS.MUTED_ALPHA);
    this.percentText = UI.text(this, L.BAR_X + L.BAR_WIDTH, L.BAR_LABEL_Y - 2, '0 %', {
      font: 'MONO',
      size: 12,
      bold: true,
      color: CONFIG.CSS.TEXT_INVERSE,
      origin: { x: 1, y: 0 },
      depth,
    });
    this.add.rectangle(L.BAR_X, L.BAR_Y, L.BAR_WIDTH, L.BAR_HEIGHT, CONFIG.COLORS.BG_DEEP).setOrigin(0).setDepth(depth);
    this.barFill = this.add.rectangle(L.BAR_X, L.BAR_Y, L.BAR_WIDTH, L.BAR_HEIGHT, CONFIG.COLORS.SUCCESS)
      .setOrigin(0)
      .setDepth(depth)
      .setScale(0, 1);
    this.barPulse = this.add.rectangle(L.BAR_X - 2, L.BAR_Y - 2, L.BAR_WIDTH + 4, L.BAR_HEIGHT + 4, CONFIG.COLORS.DHBW_RED)
      .setOrigin(0)
      .setDepth(depth)
      .setAlpha(0);
  }

  buildIconButtons() {
    const L = HUDScene.LAYOUT;
    this.soundIcon = this.createIconButton('sound', L.SOUND_X, L.ICON_Y, this.soundIconKey(), '♪', () => this.toggleSound());
    this.createIconButton('pause', L.PAUSE_X, L.ICON_Y, 'icon-pause', 'II', () => this.requestPause());
  }

  /**
   * Kleiner Symbol-Button (Trefferfläche als Rechteck, Symbol darüber).
   * @returns {Phaser.GameObjects.Image|Phaser.GameObjects.Text} das Symbol
   */
  createIconButton(id, x, y, textureKey, fallbackLabel, onClick) {
    const L = HUDScene.LAYOUT;
    const hit = this.add.rectangle(x, y, L.ICON_HIT, L.ICON_HIT, CONFIG.COLORS.WHITE, 0)
      .setDepth(CONFIG.DEPTH.UI + 1)
      .setInteractive({ useHandCursor: true });
    let icon;
    if (this.textures.exists(textureKey)) {
      icon = this.add.image(x, y, textureKey).setDisplaySize(L.ICON_SIZE, L.ICON_SIZE);
    } else {
      icon = UI.text(this, x, y, fallbackLabel, { size: 16, bold: true, color: CONFIG.CSS.TEXT_INVERSE, origin: 0.5 });
    }
    icon.setDepth(CONFIG.DEPTH.UI + 2);
    hit.on('pointerover', () => hit.setFillStyle(CONFIG.COLORS.WHITE, 0.12));
    hit.on('pointerout', () => hit.setFillStyle(CONFIG.COLORS.WHITE, 0));
    hit.on('pointerup', () => onClick());
    this.buttonRects[id] = { x: x - L.ICON_HIT / 2, y: y - L.ICON_HIT / 2, width: L.ICON_HIT, height: L.ICON_HIT };
    return icon;
  }

  // ---------------------------------------------------------------------------
  // Darstellung
  // ---------------------------------------------------------------------------

  /** @param {number|null} chapterId */
  renderChapter(chapterId) {
    if (chapterId === this.lastChapterId) return;
    this.lastChapterId = chapterId;
    const chapter = chapterId ? CONFIG.CHAPTERS[chapterId - 1] : null;
    const label = chapter ? `Kapitel ${chapter.id} von ${CONFIG.CHAPTERS.length}: ${chapter.title}` : '';
    HUDScene.setTruncatedText(this.chapterText, label, HUDScene.LAYOUT.LEFT_MAX_WIDTH);
  }

  /**
   * „Aufgabe: …“ – erst Schrift verkleinern (bis OBJECTIVE_MIN_SIZE), dann mit … kürzen.
   * @param {string} text
   */
  renderObjective(text) {
    const L = HUDScene.LAYOUT;
    this.objectiveFull = text || '';
    const label = this.objectiveFull ? `Aufgabe: ${this.objectiveFull}` : '';
    let size = L.OBJECTIVE_SIZE;
    this.objectiveText.setFontSize(size).setText(label);
    while (this.objectiveText.width > L.LEFT_MAX_WIDTH && size > L.OBJECTIVE_MIN_SIZE) {
      size -= 1;
      this.objectiveText.setFontSize(size);
    }
    // vertikal mittig in der zweiten Zeile halten
    this.objectiveText.setY(L.OBJECTIVE_Y + (L.OBJECTIVE_SIZE - size) / 2);
    HUDScene.setTruncatedText(this.objectiveText, label, L.LEFT_MAX_WIDTH);
    this.isObjectiveTruncated = this.objectiveText.text !== label;
    if (this.objectiveTooltip) {
      this.hideObjectiveTooltip();
      this.showObjectiveTooltip();
    }
  }

  /** Zeigt die vollständige Aufgabe unter der Leiste (nur wenn sie gekürzt ist). */
  showObjectiveTooltip() {
    if (!this.isObjectiveTruncated || this.objectiveTooltip || this.pauseOverlay) return;
    const L = HUDScene.LAYOUT;
    const text = UI.text(this, L.PAD_X + L.TOOLTIP_PAD, L.HEIGHT + 6 + L.TOOLTIP_PAD, `Aufgabe: ${this.objectiveFull}`, {
      size: 13,
      bold: true,
      color: CONFIG.CSS.TEXT_INVERSE,
      wrap: L.TOOLTIP_WIDTH - 2 * L.TOOLTIP_PAD,
      depth: CONFIG.DEPTH.OVERLAY - 1,
    });
    const bg = this.add.rectangle(L.PAD_X, L.HEIGHT + 6, L.TOOLTIP_WIDTH, text.height + 2 * L.TOOLTIP_PAD, CONFIG.COLORS.BG_DEEP, 0.97)
      .setOrigin(0)
      .setStrokeStyle(1, CONFIG.COLORS.WHITE, 0.2)
      .setDepth(CONFIG.DEPTH.OVERLAY - 2);
    this.objectiveTooltip = [bg, text];
  }

  hideObjectiveTooltip() {
    if (!this.objectiveTooltip) return;
    this.objectiveTooltip.forEach((object) => object.destroy());
    this.objectiveTooltip = null;
  }

  /** @param {number} minutes Spielminuten seit Mitternacht von Tag 1 */
  renderClock(minutes) {
    const L = HUDScene.LAYOUT;
    this.lastClockMinutes = minutes;
    const label = Scoring.formatClock(minutes);
    const lateMinutes = Math.floor(Scoring.minutesLate(minutes));
    if (label === this.lastClockLabel && lateMinutes === this.lastLateMinutes) return;
    this.lastClockLabel = label;
    this.lastLateMinutes = lateMinutes;

    const isPastLecture = minutes >= CONFIG.CLOCK.LECTURE_MINUTES;
    this.clockText.setText(label);
    this.clockText.setFontSize(label.length > 5 ? L.CLOCK_SIZE_LONG : L.CLOCK_SIZE);
    this.clockText.setColor(isPastLecture ? HUDScene.COLORS.LATE_TEXT : CONFIG.CSS.TEXT_INVERSE);
    if (lateMinutes >= 1) {
      this.clockSubText.setText(`+${HUDScene.formatLate(lateMinutes)} zu spät`);
      this.clockSubText.setColor(HUDScene.COLORS.LATE_TEXT).setAlpha(1);
    } else {
      this.clockSubText.setText(`Vorlesung ${Scoring.formatClock(CONFIG.CLOCK.LECTURE_MINUTES)}`);
      this.clockSubText.setColor(CONFIG.CSS.TEXT_INVERSE).setAlpha(HUDScene.COLORS.MUTED_ALPHA);
    }
  }

  /**
   * Frust-Balken, Prozent und Gesicht.
   * @param {number} value 0–100
   * @param {{animate?: boolean}} [opts]
   */
  renderFrustration(value, { animate = true } = {}) {
    const clamped = Phaser.Math.Clamp(Math.round(Number(value) || 0), 0, CONFIG.FRUSTRATION.MAX);
    if (clamped === this.displayedFrustration) return;
    this.displayedFrustration = clamped;
    const ratio = clamped / CONFIG.FRUSTRATION.MAX;
    this.percentText.setText(`${clamped} %`);
    this.barFill.setFillStyle(HUDScene.frustrationColor(ratio));
    this.tweens.killTweensOf(this.barFill);
    if (animate) {
      this.tweens.add({ targets: this.barFill, scaleX: ratio, duration: HUDScene.TIMING.BAR_TWEEN_MS, ease: 'Cubic.easeOut' });
    } else {
      this.barFill.setScale(ratio, 1);
    }
    const faceIndex = Math.min(4, Math.floor(clamped / HUDScene.FACE_STEP));
    const faceKey = `face-${faceIndex}`;
    if (this.face.setTexture && this.textures.exists(faceKey)) {
      this.face.setTexture(faceKey);
      this.face.setDisplaySize(HUDScene.LAYOUT.FACE_SIZE, HUDScene.LAYOUT.FACE_SIZE);
      this.faceBaseScale = this.face.scaleX;
    }
  }

  /** Balken pulsiert rot, Gesicht zuckt. */
  pulseFrustration() {
    const T = HUDScene.TIMING;
    this.tweens.killTweensOf(this.barPulse);
    this.barPulse.setAlpha(0);
    this.tweens.add({
      targets: this.barPulse,
      alpha: 0.85,
      duration: T.PULSE_MS,
      yoyo: true,
      repeat: T.PULSE_REPEAT - 1,
      onComplete: () => this.barPulse.setAlpha(0),
    });
    this.tweens.killTweensOf(this.face);
    this.face.setScale(this.faceBaseScale);
    this.tweens.add({
      targets: this.face,
      scaleX: this.faceBaseScale * 1.25,
      scaleY: this.faceBaseScale * 1.25,
      duration: T.PULSE_MS,
      yoyo: true,
      onComplete: () => this.face.setScale(this.faceBaseScale),
    });
  }

  // ---------------------------------------------------------------------------
  // GameState-Ereignisse
  // ---------------------------------------------------------------------------

  /** @param {object} snapshot */
  handleStateChanged(snapshot) {
    if (!snapshot) return;
    this.renderChapter(snapshot.currentChapterId);
    if (typeof snapshot.objective === 'string' && snapshot.objective !== this.objectiveFull) this.renderObjective(snapshot.objective);
    if (typeof snapshot.frustration === 'number') this.renderFrustration(snapshot.frustration);
  }

  /** @param {{value: number, delta: number}} payload */
  handleFrustrationChanged(payload) {
    if (!payload) return;
    this.renderFrustration(payload.value);
    if (payload.delta > 0) this.pulseFrustration();
  }

  /** „+N min“ fliegt an der Uhr hoch. @param {{minutes: number}} payload */
  handleClockJump(payload) {
    if (!payload || !(payload.minutes > 0)) return;
    const L = HUDScene.LAYOUT;
    const text = `+${HUDScene.formatLate(Math.round(payload.minutes))}`;
    // startet knapp unter der Leiste und steigt in die Uhr hinein
    HUDScene.safely(() => FX.floatText(this, L.CLOCK_X, L.HEIGHT + L.CLOCK_FLOAT_START, text, {
      color: CONFIG.CSS.HAZARD,
      size: 17,
      rise: HUDScene.TIMING.CLOCK_FLOAT_RISE,
    }));
    this.renderClock(GameState.getClockMinutes());
    this.tweens.killTweensOf(this.clockText);
    this.clockText.setScale(1);
    this.tweens.add({ targets: this.clockText, scaleX: 1.12, scaleY: 1.12, duration: 110, yoyo: true });
  }

  /** @param {{minutes: number, text: string}} payload */
  handleMilestone(payload) {
    if (!payload) return;
    this.enqueueBanner({ kind: 'milestone', label: 'UHRZEIT', title: payload.text || '', text: '' });
  }

  /** @param {{text: string}} payload */
  handleObjectiveChanged(payload) {
    this.renderObjective(payload ? payload.text : '');
  }

  /** @param {{title: string, description: string, isNewGlobal: boolean}} payload */
  handleAchievement(payload) {
    if (!payload) return;
    this.enqueueBanner({
      kind: 'achievement',
      label: payload.isNewGlobal === false ? 'ERFOLG ERNEUT ERREICHT' : 'ERFOLG FREIGESCHALTET',
      title: payload.title || payload.id || '',
      text: payload.description || '',
    });
  }

  /** @param {{paused: boolean}} payload */
  handlePauseChanged(payload) {
    if (payload && payload.paused) this.showPauseOverlay();
    else this.hidePauseOverlay();
  }

  /** Rage-Moment: roter Blitz, Glitch, Eingaben gesperrt bis GameOver. */
  handleRageQuit() {
    const T = HUDScene.TIMING;
    this.hidePauseOverlay();
    if (!this.rageBlocker) {
      this.rageBlocker = this.add.rectangle(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.COLORS.BG_DEEP, 0.001)
        .setOrigin(0)
        .setDepth(CONFIG.DEPTH.FX - 1)
        .setInteractive();
    }
    UI.sound('disconnect');
    HUDScene.safely(() => FX.flash(this, { color: CONFIG.COLORS.DHBW_RED, alpha: 0.4, duration: T.RAGE_FLASH_MS }));
    HUDScene.safely(() => FX.glitch(this, { duration: T.RAGE_GLITCH_MS }));
  }

  // ---------------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------------

  /** @returns {GameScene|null} */
  getGameScene() {
    const game = this.scene.get('Game');
    return game && (game.sys.isActive() || game.sys.isPaused()) ? game : null;
  }

  toggleSound() {
    if (typeof SFX !== 'undefined') SFX.toggleMuted();
    UI.sound('click');
    const key = this.soundIconKey();
    if (this.soundIcon.setTexture && this.textures.exists(key)) {
      this.soundIcon.setTexture(key).setDisplaySize(HUDScene.LAYOUT.ICON_SIZE, HUDScene.LAYOUT.ICON_SIZE);
    } else if (this.soundIcon.setText) {
      this.soundIcon.setText(SFX.isMuted() ? '×' : '♪');
    }
  }

  /** @returns {string} Textur-Key passend zum Tonzustand */
  soundIconKey() {
    const isMuted = typeof SFX !== 'undefined' && SFX.isMuted();
    return isMuted ? 'icon-sound-off' : 'icon-sound-on';
  }

  requestPause() {
    const game = this.getGameScene();
    if (!game || GameState.isPaused()) return;
    UI.sound('click');
    game.togglePause();
  }

  requestResume() {
    const game = this.getGameScene();
    if (!game || !GameState.isPaused()) return;
    UI.sound('click');
    game.togglePause();
  }

  requestRestart() {
    const game = this.getGameScene();
    if (game) game.restartChapter();
  }

  requestMenu() {
    const game = this.getGameScene();
    if (game) game.quitToMenu();
  }

  // ---------------------------------------------------------------------------
  // Pause-Overlay
  // ---------------------------------------------------------------------------

  showPauseOverlay() {
    if (this.pauseOverlay) return;
    this.hideObjectiveTooltip();
    const L = HUDScene.LAYOUT;
    const depth = CONFIG.DEPTH.OVERLAY;
    const objects = [];
    const buttonCount = 3;
    const height = 132 + buttonCount * L.PAUSE_BUTTON_HEIGHT + (buttonCount - 1) * L.PAUSE_BUTTON_GAP + 52;
    const panelX = UI.centerX(L.PAUSE_PANEL_WIDTH);
    const panelY = Math.round((CONFIG.HEIGHT - height) / 2);

    objects.push(this.add.rectangle(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.COLORS.BG_DEEP, 0.78)
      .setOrigin(0).setDepth(depth).setInteractive());
    objects.push(this.add.rectangle(panelX + 7, panelY + 9, L.PAUSE_PANEL_WIDTH, height, CONFIG.COLORS.SHADOW, 0.4)
      .setOrigin(0).setDepth(depth + 1));
    objects.push(this.add.rectangle(panelX, panelY, L.PAUSE_PANEL_WIDTH, height, CONFIG.COLORS.PAPER)
      .setOrigin(0).setDepth(depth + 1));
    objects.push(UI.text(this, CONFIG.WIDTH / 2, panelY + 30, 'PAUSE', {
      font: 'STAMP', size: 30, color: CONFIG.CSS.DHBW_RED, origin: { x: 0.5, y: 0 }, depth: depth + 2,
    }));
    objects.push(UI.text(this, CONFIG.WIDTH / 2, panelY + 78, 'Die Uhr steht. Das WLAN leider auch.', {
      font: 'PAPER', size: 15, color: CONFIG.CSS.INK, origin: { x: 0.5, y: 0 }, depth: depth + 2,
    }));

    const specs = [
      { id: 'resume', text: 'Weiter', variant: 'primary', onClick: () => this.requestResume() },
      { id: 'restart', text: 'Kapitel neu starten', variant: 'secondary', onClick: () => this.requestRestart() },
      { id: 'menu', text: 'Hauptmenü', variant: 'secondary', onClick: () => this.requestMenu() },
    ];
    const buttonX = UI.centerX(L.PAUSE_BUTTON_WIDTH);
    specs.forEach((spec, index) => {
      const y = panelY + 122 + index * (L.PAUSE_BUTTON_HEIGHT + L.PAUSE_BUTTON_GAP);
      const button = new UI.Button(this, buttonX, y, {
        text: spec.text,
        variant: spec.variant,
        width: L.PAUSE_BUTTON_WIDTH,
        height: L.PAUSE_BUTTON_HEIGHT,
        onClick: spec.onClick,
      });
      button.setDepth(depth + 2);
      objects.push(button);
      this.buttonRects[spec.id] = { x: buttonX, y, width: L.PAUSE_BUTTON_WIDTH, height: L.PAUSE_BUTTON_HEIGHT };
    });
    objects.push(UI.text(this, CONFIG.WIDTH / 2, panelY + height - 30, 'Esc: weiter', {
      font: 'PAPER', size: 12, color: CONFIG.CSS.INK_MUTED, origin: { x: 0.5, y: 0 }, depth: depth + 2,
    }));
    this.pauseOverlay = objects;
  }

  hidePauseOverlay() {
    if (!this.pauseOverlay) return;
    this.pauseOverlay.forEach((object) => object.destroy());
    this.pauseOverlay = null;
    ['resume', 'restart', 'menu'].forEach((id) => delete this.buttonRects[id]);
  }

  /** @returns {boolean} */
  isPauseOverlayVisible() {
    return Boolean(this.pauseOverlay);
  }

  // ---------------------------------------------------------------------------
  // Benachrichtigungs-Banner
  // ---------------------------------------------------------------------------

  /**
   * Reiht ein Banner ein; es wird gezeigt, sobald das vorige weg ist.
   * @param {{kind: 'milestone'|'achievement', label: string, title: string, text: string}} spec
   */
  enqueueBanner(spec) {
    this.bannerQueue.push(spec);
    if (!this.activeBanner) this.showNextBanner();
  }

  showNextBanner() {
    const spec = this.bannerQueue.shift();
    if (!spec) {
      this.activeBanner = null;
      return;
    }
    const T = HUDScene.TIMING;
    const L = HUDScene.LAYOUT;
    const banner = this.buildBanner(spec);
    const hiddenY = L.HEIGHT - banner.bannerHeight;
    banner.setY(hiddenY);
    this.activeBanner = banner;
    UI.sound(spec.kind === 'achievement' ? 'success' : 'notify');
    this.tweens.add({
      targets: banner,
      y: L.BANNER_TOP,
      duration: T.BANNER_IN_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          y: hiddenY,
          delay: T.BANNER_HOLD_MS,
          duration: T.BANNER_OUT_MS,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            banner.destroy();
            this.activeBanner = null;
            this.showNextBanner();
          },
        });
      },
    });
  }

  /**
   * Banner: dunkle Karte mit Akzentstreifen (Erfolg: Baustellengelb), Symbol, Texte.
   * Liegt unter der Leiste (Tiefe UI − 1) und gleitet darunter hervor.
   * @returns {Phaser.GameObjects.Container} mit Feld bannerHeight
   */
  buildBanner(spec) {
    const L = HUDScene.LAYOUT;
    const isAchievement = spec.kind === 'achievement';
    const accent = isAchievement ? CONFIG.COLORS.HAZARD : CONFIG.COLORS.PRIMARY;
    const accentCss = isAchievement ? CONFIG.CSS.HAZARD : CONFIG.CSS.TEXT_INVERSE;
    const textX = L.BANNER_STRIPE + L.BANNER_PAD_X + L.BANNER_ICON_SPACE;
    const wrap = L.BANNER_WIDTH - textX - L.BANNER_PAD_X;

    const label = UI.text(this, textX, L.BANNER_PAD_Y, spec.label, { size: 10, bold: true, color: accentCss });
    const title = UI.text(this, textX, L.BANNER_PAD_Y + 15, spec.title, {
      size: isAchievement ? 15 : 14,
      bold: true,
      color: CONFIG.CSS.WHITE,
      wrap,
    });
    let bottom = title.y + title.height;
    const parts = [label, title];
    if (spec.text) {
      const body = UI.text(this, textX, bottom + 2, spec.text, { size: 12, color: CONFIG.CSS.TEXT_INVERSE, wrap });
      body.setAlpha(0.85);
      parts.push(body);
      bottom = body.y + body.height;
    }
    const height = Math.round(bottom + L.BANNER_PAD_Y);

    const bg = this.add.rectangle(0, 0, L.BANNER_WIDTH, height, CONFIG.COLORS.BG_DEEP, 0.97).setOrigin(0);
    bg.setStrokeStyle(1, accent, 0.6);
    const stripe = this.add.rectangle(0, 0, L.BANNER_STRIPE, height, accent).setOrigin(0);
    const icon = this.add.graphics();
    const iconX = L.BANNER_STRIPE + L.BANNER_PAD_X + 12;
    const iconY = height / 2;
    if (isAchievement) HUDScene.drawStar(icon, iconX, iconY, 12, accent);
    else HUDScene.drawClockIcon(icon, iconX, iconY, 11, CONFIG.COLORS.WHITE);

    const container = this.add.container(UI.centerX(L.BANNER_WIDTH), 0, [bg, stripe, icon, ...parts]);
    container.setDepth(CONFIG.DEPTH.UI - 1);
    container.bannerHeight = height;
    return container;
  }

  // ---------------------------------------------------------------------------
  // Eingaben, Test-Hilfen, Aufräumen
  // ---------------------------------------------------------------------------

  /**
   * Escape: Pause an/aus – außer das Kapitel braucht Escape gerade selbst
   * (fokussiertes Textfeld, offene Dropdown-Liste, Dialog mit closeOnEscape). Das HUD
   * bekommt Tastendrücke vor den Kapiteln (Phaser aktualisiert die oberste Szene zuerst).
   * Jedes KeyboardEvent zählt nur einmal (Phaser 3.90 meldet keydowns teils mehrfach).
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    if (!event || this.seenKeyEvents.has(event)) return;
    this.seenKeyEvents.add(event);
    if (event.repeat || event.key !== 'Escape' || this.rageBlocker) return;
    if (this.pauseOverlay) {
      this.requestResume();
      return;
    }
    const game = this.getGameScene();
    const chapterScene = game ? game.getActiveChapterScene() : null;
    if (chapterScene && HUDScene.isEscapeUsedBy(chapterScene)) return;
    this.requestPause();
  }

  /**
   * Mittelpunkt eines HUD-Buttons in Spielkoordinaten.
   * @param {string} id 'sound' | 'pause' | 'resume' | 'restart' | 'menu'
   * @returns {{x: number, y: number}|null}
   */
  getButtonCenter(id) {
    const rect = this.buttonRects && this.buttonRects[id];
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  }

  handleShutdown() {
    (this.gameStateHandlers || []).forEach(([event, handler]) => GameState.off(event, handler, this));
    this.gameStateHandlers = [];
    if (this.input && this.input.keyboard) this.input.keyboard.off('keydown', this.handleKeyDown, this);
    this.bannerQueue = [];
    this.activeBanner = null;
    this.pauseOverlay = null;
    this.rageBlocker = null;
    this.objectiveTooltip = null;
  }

  // ---------------------------------------------------------------------------
  // Statische Helfer
  // ---------------------------------------------------------------------------

  /**
   * Setzt Text und kürzt ihn mit „…“, bis er in maxWidth passt.
   * @param {Phaser.GameObjects.Text} textObject
   * @param {string} fullText
   * @param {number} maxWidth
   */
  static setTruncatedText(textObject, fullText, maxWidth) {
    textObject.setText(fullText);
    if (textObject.width <= maxWidth) return;
    let low = 0;
    let high = fullText.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      textObject.setText(`${fullText.slice(0, mid).trimEnd()}…`);
      if (textObject.width <= maxWidth) low = mid;
      else high = mid - 1;
    }
    textObject.setText(`${fullText.slice(0, low).trimEnd()}…`);
  }

  /**
   * Balkenfarbe: grün → gelb (50 %) → rot (100 %).
   * @param {number} ratio 0–1
   * @returns {number}
   */
  static frustrationColor(ratio) {
    const { SUCCESS, HAZARD, DHBW_RED } = CONFIG.COLORS;
    return ratio <= 0.5
      ? HUDScene.lerpColor(SUCCESS, HAZARD, ratio / 0.5)
      : HUDScene.lerpColor(HAZARD, DHBW_RED, (ratio - 0.5) / 0.5);
  }

  /**
   * Lineare Mischung zweier 0xRRGGBB-Farben.
   * @returns {number}
   */
  static lerpColor(from, to, t) {
    const mix = (shift) => {
      const a = (from >> shift) & 0xff;
      const b = (to >> shift) & 0xff;
      return Math.round(a + (b - a) * Phaser.Math.Clamp(t, 0, 1)) & 0xff;
    };
    return (mix(16) << 16) | (mix(8) << 8) | mix(0);
  }

  /**
   * „+12 min“ bzw. „+1 h 5 min“ (ohne Pluszeichen).
   * @param {number} minutes
   * @returns {string}
   */
  static formatLate(minutes) {
    const total = Math.max(0, Math.round(minutes));
    if (total < 60) return `${total} min`;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  /**
   * Prüft, ob die Kapitel-Szene Escape gerade selbst braucht: fokussiertes Textfeld,
   * offene Dropdown-Liste oder ein oberster Dialog, der per Escape schließt
   * (closeOnEscape). Ein Dialog ohne Escape-Funktion blockiert die Pause nicht.
   * @param {Phaser.Scene} chapterScene
   * @returns {boolean}
   */
  static isEscapeUsedBy(chapterScene) {
    try {
      const topModal = UI.Modal && typeof UI.Modal.getTop === 'function' ? UI.Modal.getTop(chapterScene) : null;
      if (topModal && topModal.closeOnEscape) return true;
      // Registries der Widgets statt Baumsuche: findet auch tief verschachtelte Felder
      // (Phone → screen → Seite → Zeile …)
      if (UI.Dropdown && typeof UI.Dropdown.isAnyOpen === 'function' && UI.Dropdown.isAnyOpen(chapterScene)) return true;
      const focused = UI.TextInput && typeof UI.TextInput.getFocused === 'function'
        ? UI.TextInput.getFocused(chapterScene)
        : null;
      // Ein unsichtbar gewordenes Feld verliert beim nächsten Tastendruck ohnehin den Fokus
      return Boolean(focused) && (typeof focused.canKeepFocus !== 'function' || focused.canKeepFocus());
    } catch (err) {
      return false;
    }
  }

  /** Fünfzackiger Stern (Erfolgs-Symbol). */
  static drawStar(graphics, cx, cy, radius, color) {
    const points = [];
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? radius : radius * 0.45;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      points.push(new Phaser.Math.Vector2(cx + r * Math.cos(angle), cy + r * Math.sin(angle)));
    }
    graphics.fillStyle(color, 1);
    graphics.fillPoints(points, true);
  }

  /** Kleines Uhr-Symbol (Meilenstein). */
  static drawClockIcon(graphics, cx, cy, radius, color) {
    graphics.lineStyle(2, color, 1);
    graphics.strokeCircle(cx, cy, radius);
    graphics.lineBetween(cx, cy, cx, cy - radius * 0.6);
    graphics.lineBetween(cx, cy, cx + radius * 0.45, cy + radius * 0.2);
  }

  /** Effekte dürfen das HUD nie abbrechen. */
  static safely(fn) {
    try {
      fn();
    } catch (err) {
      console.error('[HUD] Effekt fehlgeschlagen:', err);
    }
  }
}
