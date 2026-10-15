/**
 * MenuScene.js – Hauptmenü (Key 'Menu').
 *
 * Der einmalige Lade-Moment: großer Titel „eduroam“, dann knallt der rote Stempel
 * „AUTHENTIFIZIERUNG FEHLGESCHLAGEN“ schräg darüber und bleibt liegen. Darunter die
 * Bedienung: Neues Spiel, Kapitel wählen (Overlay), Erfolge (Overlay), Ton an/aus,
 * Highscore-Zeile und der Disclaimer. Der Hintergrund bleibt ruhig (dezente WLAN-Bögen).
 *
 * Tastatur: Enter = Neues Spiel, Escape = Overlay schließen.
 *
 * Global: MenuScene (inkl. MenuScene.drawBackdrop für Game/GameOver).
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, RUNTIME, CAMPUS, UI (text, Button), FX,
 * SFX, Storage, Scoring.
 */

class MenuScene extends Phaser.Scene {
  /** Layout des Menüs (px). */
  static LAYOUT = Object.freeze({
    TITLE_Y: 128,          // Mitte des Titels
    TITLE_SIZE: 104,
    TITLE_RISE: 14,        // Titel gleitet beim ersten Laden so weit nach oben
    STAMP_Y: 136,
    STAMP_SIZE: 29,
    STAMP_ANGLE: -8,
    SUBTITLE_Y: 206,
    SUBTITLE_SIZE: 20,
    BUTTON_WIDTH: 280,
    BUTTON_HEIGHT: 46,
    BUTTON_TOP: 254,
    BUTTON_GAP: 58,        // Abstand der Button-Oberkanten
    HIGHSCORE_Y: 498,
    DISCLAIMER_Y: 546,
    DISCLAIMER_WRAP: 660,
    PANEL_RADIUS: 12,
    PANEL_PADDING: 28,
    DIM_ALPHA: 0.74,
    CHAPTER_PANEL_WIDTH: 520,
    CHAPTER_ROW_HEIGHT: 46,
    CHAPTER_ROW_GAP: 12,
    ACHIEVEMENT_PANEL_WIDTH: 740,
    ACHIEVEMENT_CELL_WIDTH: 330,
    ACHIEVEMENT_CELL_HEIGHT: 54, // Platz für zweizeilige Beschreibungen
    ACHIEVEMENT_ICON_SIZE: 22,
    CLOSE_BUTTON_WIDTH: 180,
  });

  /** Ablauf des Lade-Moments (ms). */
  static TIMING = Object.freeze({
    TITLE_FADE_MS: 520,
    STAMP_DELAY_MS: 700,   // nach Szenenstart
    STAMP_SETTLE_MS: 450,  // bis der Stempel liegt
    BUTTONS_FADE_MS: 400,
    BUTTONS_START_ALPHA: 0.3, // > 0, sonst sind die Buttons während des Einblendens nicht klickbar
    STAMP_HOLD_FOREVER: 24 * 60 * 60 * 1000, // „bleibt stehen“
  });

  /** Dezente WLAN-Bögen im Hintergrund. */
  static BACKDROP = Object.freeze({
    CENTER_X: 400,
    CENTER_Y: 690,
    FIRST_RADIUS: 170,
    RADIUS_STEP: 115,
    COUNT: 6,
    LINE_WIDTH: 3,
    ALPHA: 0.05,
    SPAN: (Math.PI * 2) / 3, // 120° Öffnungswinkel
  });

  constructor() {
    super({ key: 'Menu' });
  }

  create() {
    const L = MenuScene.LAYOUT;
    const T = MenuScene.TIMING;
    this.isLeaving = false;
    this.isIntroDone = false;
    this.overlay = null;
    this.buttonRects = {};

    this.cameras.main.setBackgroundColor(CONFIG.CSS.BG);
    MenuScene.drawBackdrop(this);

    // Erster Besuch pro Seitenaufruf → volle Inszenierung; danach ohne Wartezeit und ohne Ton.
    const isFirstVisit = !this.registry.get('menuIntroPlayed');
    this.registry.set('menuIntroPlayed', true);

    // Titel
    this.title = UI.text(this, CONFIG.WIDTH / 2, L.TITLE_Y, 'eduroam', {
      size: L.TITLE_SIZE,
      bold: true,
      color: CONFIG.CSS.WHITE,
      origin: 0.5,
    });
    this.subtitle = UI.text(this, CONFIG.WIDTH / 2, L.SUBTITLE_Y, CONFIG.SUBTITLE, {
      size: L.SUBTITLE_SIZE,
      color: CONFIG.CSS.TEXT_INVERSE,
      origin: { x: 0.5, y: 0 },
    }).setAlpha(0.85);

    this.buildButtons();
    this.buildFooter();

    if (isFirstVisit) {
      this.title.setAlpha(0).setY(L.TITLE_Y + L.TITLE_RISE);
      this.tweens.add({ targets: this.title, alpha: 1, y: L.TITLE_Y, duration: T.TITLE_FADE_MS, ease: 'Cubic.easeOut' });
      this.subtitle.setAlpha(0);
      this.tweens.add({ targets: this.subtitle, alpha: 0.85, duration: T.TITLE_FADE_MS, delay: T.TITLE_FADE_MS / 2 });
      // Nicht bei Alpha 0 starten: Phaser 3.90 nimmt Container mit Alpha 0 nicht als
      // Klickziel – die Buttons müssen sofort bedienbar sein.
      this.menuButtons.forEach((button) => {
        button.setAlpha(T.BUTTONS_START_ALPHA);
        this.tweens.add({ targets: button, alpha: 1, duration: T.BUTTONS_FADE_MS, delay: T.STAMP_DELAY_MS });
      });
      this.time.delayedCall(T.STAMP_DELAY_MS, () => this.dropTitleStamp(true));
    } else {
      this.dropTitleStamp(false);
    }

    this.seenKeyEvents = new WeakSet(); // Phaser 3.90 meldet keydowns teils mehrfach
    this.input.keyboard.on('keydown', this.handleKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    if (typeof window !== 'undefined' && window.__EDU_DEBUG) window.__EDU_DEBUG.ready = true;
  }

  // ---------------------------------------------------------------------------
  // Aufbau
  // ---------------------------------------------------------------------------

  /** Die vier Hauptbuttons, mittig untereinander. */
  buildButtons() {
    const L = MenuScene.LAYOUT;
    const x = UI.centerX(L.BUTTON_WIDTH);
    const specs = [
      { id: 'newGame', text: 'Neues Spiel', variant: 'primary', onClick: () => this.startGame(1) },
      { id: 'chapters', text: 'Kapitel wählen', variant: 'secondary', onClick: () => this.openChapterSelect() },
      { id: 'achievements', text: 'Erfolge', variant: 'secondary', onClick: () => this.openAchievements() },
      { id: 'sound', text: this.soundLabel(), variant: 'secondary', onClick: () => this.toggleSound() },
    ];
    this.menuButtons = specs.map((spec, index) => {
      const y = L.BUTTON_TOP + index * L.BUTTON_GAP;
      const button = new UI.Button(this, x, y, {
        text: spec.text,
        variant: spec.variant,
        width: L.BUTTON_WIDTH,
        height: L.BUTTON_HEIGHT,
        onClick: spec.onClick,
      });
      this.registerButton(spec.id, x, y, L.BUTTON_WIDTH, L.BUTTON_HEIGHT);
      return button;
    });
    this.soundButton = this.menuButtons[3];
  }

  /** Highscore-Zeile und Disclaimer. */
  buildFooter() {
    const L = MenuScene.LAYOUT;
    this.highscoreText = UI.text(this, CONFIG.WIDTH / 2, L.HIGHSCORE_Y, MenuScene.highscoreLine(), {
      size: 15,
      color: CONFIG.CSS.HAZARD,
      origin: { x: 0.5, y: 0 },
    });
    UI.text(this, CONFIG.WIDTH / 2, L.DISCLAIMER_Y, CAMPUS.disclaimer, {
      size: 12,
      color: CONFIG.CSS.TEXT_INVERSE,
      align: 'center',
      wrap: L.DISCLAIMER_WRAP,
      origin: { x: 0.5, y: 0 },
    }).setAlpha(0.6);
  }

  /**
   * Der Stempel „AUTHENTIFIZIERUNG FEHLGESCHLAGEN“ – bleibt liegen.
   * @param {boolean} withSound Nur beim ersten Laden mit Ton
   */
  dropTitleStamp(withSound) {
    const L = MenuScene.LAYOUT;
    const T = MenuScene.TIMING;
    try {
      this.titleStamp = FX.stamp(this, 'AUTHENTIFIZIERUNG FEHLGESCHLAGEN', {
        x: CONFIG.WIDTH / 2,
        y: L.STAMP_Y,
        angle: L.STAMP_ANGLE,
        size: L.STAMP_SIZE,
        hold: T.STAMP_HOLD_FOREVER,
        sound: withSound,
      });
      // Effekte liegen auf DEPTH.FX – dieser Stempel bleibt liegen und muss unter die Overlays.
      if (this.titleStamp) this.titleStamp.setDepth(CONFIG.DEPTH.UI);
    } catch (err) {
      console.error('[Menu] Stempel fehlgeschlagen:', err);
    }
    this.time.delayedCall(T.STAMP_SETTLE_MS, () => {
      this.isIntroDone = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------------

  /**
   * Startet einen neuen Lauf.
   * @param {number} startChapter
   */
  startGame(startChapter) {
    if (this.isLeaving) return;
    this.isLeaving = true;
    this.scene.start('Game', { startChapter });
  }

  /** Ton umschalten; Beschriftung zeigt die nächste Aktion („Ton aus“ / „Ton an“). */
  toggleSound() {
    if (typeof SFX !== 'undefined') SFX.toggleMuted();
    this.soundButton.setText(this.soundLabel());
  }

  /** @returns {string} */
  soundLabel() {
    const isMuted = typeof SFX !== 'undefined' && SFX.isMuted();
    return isMuted ? 'Ton an' : 'Ton aus';
  }

  /** @returns {number} höchste wählbare Kapitelnummer */
  getUnlockedChapter() {
    if (RUNTIME.unlockAll) return CONFIG.CHAPTERS.length;
    return Phaser.Math.Clamp(Storage.getUnlockedChapter() || 1, 1, CONFIG.CHAPTERS.length);
  }

  // ---------------------------------------------------------------------------
  // Overlays (Kapitelwahl, Erfolge)
  // ---------------------------------------------------------------------------

  /** Overlay „Kapitel wählen“: freigeschaltete Kapitel anklickbar, Rest gesperrt. */
  openChapterSelect() {
    const L = MenuScene.LAYOUT;
    const unlocked = this.getUnlockedChapter();
    const rows = CONFIG.CHAPTERS.length;
    const listHeight = rows * L.CHAPTER_ROW_HEIGHT + (rows - 1) * L.CHAPTER_ROW_GAP;
    const height = L.PANEL_PADDING + 64 + listHeight + 34 + L.BUTTON_HEIGHT + L.PANEL_PADDING;
    const panel = this.openOverlay('chapters', 'Kapitel wählen', L.CHAPTER_PANEL_WIDTH, height);
    const rowWidth = L.CHAPTER_PANEL_WIDTH - 2 * L.PANEL_PADDING;

    this.addOverlayObject(UI.text(this, panel.x + L.PANEL_PADDING, panel.y + L.PANEL_PADDING + 32,
      `${unlocked} von ${rows} Kapiteln freigeschaltet`, { size: 14, color: CONFIG.CSS.TEXT_MUTED }));

    CONFIG.CHAPTERS.forEach((chapter, index) => {
      const isUnlocked = chapter.id <= unlocked;
      const x = panel.x + L.PANEL_PADDING;
      const y = panel.y + L.PANEL_PADDING + 64 + index * (L.CHAPTER_ROW_HEIGHT + L.CHAPTER_ROW_GAP);
      const label = isUnlocked
        ? `${chapter.id} · ${chapter.title}`
        : `${chapter.id} · ${chapter.title} (gesperrt)`;
      const button = new UI.Button(this, x, y, {
        text: label,
        variant: isUnlocked ? 'primary' : 'secondary',
        width: rowWidth,
        height: L.CHAPTER_ROW_HEIGHT,
        icon: isUnlocked ? null : 'icon-lock',
        disabled: !isUnlocked,
        onClick: () => this.startGame(chapter.id),
      });
      this.addOverlayObject(button);
      this.registerButton(`chapter-${chapter.id}`, x, y, rowWidth, L.CHAPTER_ROW_HEIGHT);
    });

    const hintY = panel.y + L.PANEL_PADDING + 64 + listHeight + 10;
    this.addOverlayObject(UI.text(this, CONFIG.WIDTH / 2, hintY,
      'Gesperrte Kapitel öffnen sich, sobald du das vorherige geschafft hast.',
      { size: 12, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 0.5, y: 0 } }));
    this.addCloseButton(panel, height);
  }

  /** Overlay „Erfolge“: alle Erfolge, freigeschaltete hervorgehoben. */
  openAchievements() {
    const L = MenuScene.LAYOUT;
    const unlockedIds = new Set(Storage.getAchievements() || []);
    const all = Object.values(CONFIG.ACHIEVEMENTS);
    const rows = Math.ceil(all.length / 2);
    const gridHeight = rows * L.ACHIEVEMENT_CELL_HEIGHT;
    const height = L.PANEL_PADDING + 64 + gridHeight + 16 + L.BUTTON_HEIGHT + L.PANEL_PADDING;
    const panel = this.openOverlay('achievements', 'Erfolge', L.ACHIEVEMENT_PANEL_WIDTH, height);
    const unlockedCount = all.filter((a) => unlockedIds.has(a.id)).length;

    this.addOverlayObject(UI.text(this, panel.x + L.PANEL_PADDING, panel.y + L.PANEL_PADDING + 32,
      `${unlockedCount} von ${all.length} freigeschaltet`, { size: 14, color: CONFIG.CSS.TEXT_MUTED }));

    const gap = L.ACHIEVEMENT_PANEL_WIDTH - 2 * L.PANEL_PADDING - 2 * L.ACHIEVEMENT_CELL_WIDTH;
    all.forEach((achievement, index) => {
      const isUnlocked = unlockedIds.has(achievement.id);
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = panel.x + L.PANEL_PADDING + col * (L.ACHIEVEMENT_CELL_WIDTH + gap);
      const y = panel.y + L.PANEL_PADDING + 64 + row * L.ACHIEVEMENT_CELL_HEIGHT;
      this.addAchievementCell(achievement, isUnlocked, x, y);
    });
    this.addCloseButton(panel, height);
  }

  /**
   * Eine Zeile im Erfolge-Overlay: Symbol, Titel, Beschreibung.
   * @param {{id: string, title: string, description: string}} achievement
   * @param {boolean} isUnlocked
   * @param {number} x
   * @param {number} y
   */
  addAchievementCell(achievement, isUnlocked, x, y) {
    const L = MenuScene.LAYOUT;
    const depth = CONFIG.DEPTH.OVERLAY + 2;
    const iconKey = isUnlocked ? 'icon-success' : 'icon-lock';
    const iconX = x + L.ACHIEVEMENT_ICON_SIZE / 2;
    const iconY = y + 12;
    if (this.textures.exists(iconKey)) {
      const icon = this.add.image(iconX, iconY, iconKey).setDisplaySize(L.ACHIEVEMENT_ICON_SIZE, L.ACHIEVEMENT_ICON_SIZE).setDepth(depth);
      // Symbole sind weiß (einfärbbar) – auf der weißen Fläche immer tönen
      if (isUnlocked) icon.setTint(CONFIG.COLORS.SUCCESS);
      else icon.setTint(CONFIG.COLORS.TEXT_MUTED).setAlpha(0.6);
      this.addOverlayObject(icon);
    } else {
      this.addOverlayObject(this.add.circle(iconX, iconY, L.ACHIEVEMENT_ICON_SIZE / 2 - 2,
        isUnlocked ? CONFIG.COLORS.SUCCESS : CONFIG.COLORS.BORDER).setDepth(depth));
    }
    const textX = x + L.ACHIEVEMENT_ICON_SIZE + 10;
    const textWidth = L.ACHIEVEMENT_CELL_WIDTH - L.ACHIEVEMENT_ICON_SIZE - 10;
    const title = UI.text(this, textX, y + 2, achievement.title, {
      size: 14,
      bold: true,
      color: isUnlocked ? CONFIG.CSS.TEXT : CONFIG.CSS.TEXT_MUTED,
      depth,
    });
    const description = UI.text(this, textX, y + 21, achievement.description, {
      size: 12,
      color: CONFIG.CSS.TEXT_MUTED,
      wrap: textWidth,
      lineSpacing: 1,
      depth,
    });
    if (!isUnlocked) {
      title.setAlpha(0.75);
      description.setAlpha(0.7);
    }
    this.addOverlayObject(title);
    this.addOverlayObject(description);
  }

  /**
   * Öffnet ein Overlay (Abdunklung + weiße Systemdialog-Fläche) und liefert die Panel-Fläche.
   * @param {string} kind
   * @param {string} titleText
   * @param {number} width
   * @param {number} height
   * @returns {{x: number, y: number, width: number, height: number}}
   */
  openOverlay(kind, titleText, width, height) {
    const L = MenuScene.LAYOUT;
    this.closeOverlay();
    UI.sound('popup');
    this.overlay = { kind, objects: [] };
    const panel = {
      x: UI.centerX(width),
      y: Math.round((CONFIG.HEIGHT - height) / 2),
      width,
      height,
    };
    const dim = this.add.rectangle(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.COLORS.BG_DEEP, L.DIM_ALPHA)
      .setOrigin(0)
      .setDepth(CONFIG.DEPTH.OVERLAY)
      .setInteractive();
    dim.on('pointerup', (pointer) => {
      const isOutside = pointer.x < panel.x || pointer.x > panel.x + width || pointer.y < panel.y || pointer.y > panel.y + height;
      if (isOutside) this.closeOverlay();
    });
    this.addOverlayObject(dim);

    const graphics = this.add.graphics().setDepth(CONFIG.DEPTH.OVERLAY + 1);
    graphics.fillStyle(CONFIG.COLORS.SHADOW, 0.3);
    graphics.fillRoundedRect(panel.x + 4, panel.y + 6, width, height, L.PANEL_RADIUS);
    graphics.fillStyle(CONFIG.COLORS.SURFACE, 1);
    graphics.fillRoundedRect(panel.x, panel.y, width, height, L.PANEL_RADIUS);
    // Klicks auf das Panel selbst nicht als „daneben“ werten
    const panelHit = this.add.rectangle(panel.x, panel.y, width, height, CONFIG.COLORS.SURFACE, 0)
      .setOrigin(0)
      .setDepth(CONFIG.DEPTH.OVERLAY + 1)
      .setInteractive();
    this.addOverlayObject(graphics);
    this.addOverlayObject(panelHit);

    this.addOverlayObject(UI.text(this, panel.x + L.PANEL_PADDING, panel.y + L.PANEL_PADDING - 4, titleText, {
      size: 22,
      bold: true,
      color: CONFIG.CSS.TEXT,
      depth: CONFIG.DEPTH.OVERLAY + 2,
    }));
    return panel;
  }

  /**
   * „Zurück“-Button unten mittig im Panel.
   * @param {{x: number, y: number, width: number}} panel
   * @param {number} height
   */
  addCloseButton(panel, height) {
    const L = MenuScene.LAYOUT;
    const x = panel.x + Math.round((panel.width - L.CLOSE_BUTTON_WIDTH) / 2);
    const y = panel.y + height - L.PANEL_PADDING - L.BUTTON_HEIGHT;
    const button = new UI.Button(this, x, y, {
      text: 'Zurück',
      variant: 'secondary',
      width: L.CLOSE_BUTTON_WIDTH,
      height: L.BUTTON_HEIGHT,
      onClick: () => this.closeOverlay(),
    });
    this.addOverlayObject(button);
    this.registerButton('overlay-close', x, y, L.CLOSE_BUTTON_WIDTH, L.BUTTON_HEIGHT);
  }

  /**
   * Hängt ein Objekt ans offene Overlay (Tiefe über der Abdunklung, wird mit ihm zerstört).
   * @param {Phaser.GameObjects.GameObject} object
   */
  addOverlayObject(object) {
    if (!this.overlay) return object;
    if (object.depth < CONFIG.DEPTH.OVERLAY) object.setDepth(CONFIG.DEPTH.OVERLAY + 2);
    this.overlay.objects.push(object);
    return object;
  }

  /** Schließt das offene Overlay (falls vorhanden). */
  closeOverlay() {
    if (!this.overlay) return;
    this.overlay.objects.forEach((object) => object.destroy());
    this.overlay = null;
    ['overlay-close'].concat(CONFIG.CHAPTERS.map((c) => `chapter-${c.id}`)).forEach((id) => delete this.buttonRects[id]);
  }

  /** @returns {string|null} 'chapters' | 'achievements' | null */
  getOverlayKind() {
    return this.overlay ? this.overlay.kind : null;
  }

  // ---------------------------------------------------------------------------
  // Eingaben, Test-Hilfen, Aufräumen
  // ---------------------------------------------------------------------------

  /** @param {KeyboardEvent} event */
  handleKeyDown(event) {
    if (!event || this.seenKeyEvents.has(event)) return;
    this.seenKeyEvents.add(event);
    if (event.repeat) return;
    if (event.key === 'Escape') {
      this.closeOverlay();
    } else if (event.key === 'Enter' && !this.overlay) {
      this.startGame(1);
    }
  }

  /**
   * Merkt sich die Fläche eines Buttons (für Tests: echte Klicks auf echte Positionen).
   * @param {string} id
   */
  registerButton(id, x, y, width, height) {
    this.buttonRects[id] = { x, y, width, height };
  }

  /**
   * Mittelpunkt eines Buttons in Spielkoordinaten.
   * @param {string} id 'newGame' | 'chapters' | 'achievements' | 'sound' | 'chapter-N' | 'overlay-close'
   * @returns {{x: number, y: number}|null}
   */
  getButtonCenter(id) {
    const rect = this.buttonRects && this.buttonRects[id];
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  }

  handleShutdown() {
    this.input.keyboard.off('keydown', this.handleKeyDown, this);
    this.overlay = null;
  }

  // ---------------------------------------------------------------------------
  // Statische Helfer (auch von GameScene/GameOverScene genutzt)
  // ---------------------------------------------------------------------------

  /**
   * Zeichnet den ruhigen Hintergrund: Nachtblau mit sehr dezenten WLAN-Bögen.
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.alpha=MenuScene.BACKDROP.ALPHA]
   * @returns {Phaser.GameObjects.Graphics}
   */
  static drawBackdrop(scene, { alpha = MenuScene.BACKDROP.ALPHA } = {}) {
    const B = MenuScene.BACKDROP;
    const graphics = scene.add.graphics().setDepth(CONFIG.DEPTH.BACKGROUND);
    graphics.fillStyle(CONFIG.COLORS.BG, 1);
    graphics.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    const start = -Math.PI / 2 - B.SPAN / 2;
    const end = -Math.PI / 2 + B.SPAN / 2;
    for (let i = 0; i < B.COUNT; i += 1) {
      graphics.lineStyle(B.LINE_WIDTH, CONFIG.COLORS.WHITE, alpha * (1 - i / (B.COUNT + 2)));
      graphics.beginPath();
      graphics.arc(B.CENTER_X, B.CENTER_Y, B.FIRST_RADIUS + i * B.RADIUS_STEP, start, end, false);
      graphics.strokePath();
    }
    return graphics;
  }

  /** @returns {string} Highscore-Zeile fürs Menü */
  static highscoreLine() {
    const best = typeof Storage !== 'undefined' ? Storage.getHighscore() : null;
    if (!best) return 'Noch kein Highscore. Das WLAN wartet schon.';
    const outcome = best.won ? `verbunden um ${best.clockLabel}` : `Rage-Quit um ${best.clockLabel}`;
    return `Highscore: ${MenuScene.formatNumber(best.score)} Punkte · ${best.rank} · ${outcome}`;
  }

  /**
   * Tausenderpunkte wie im Deutschen („8.420“).
   * @param {number} value
   * @returns {string}
   */
  static formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString('de-DE');
  }
}
