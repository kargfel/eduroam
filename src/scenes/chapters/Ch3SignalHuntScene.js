/**
 * Ch3SignalHuntScene.js – Kapitel 3 „Die Signaljagd“ (Top-down-Arcade).
 *
 * Links der Lageplan als Blaupause (Rotebühlplatz 41, EG – nicht maßstabsgetreu), rechts
 * das Handy-Panel: Android-Downloadkarte (WLAN-Balken, Access Point, Geräte, Fortschritt,
 * Durchsatz, Restzeit), ein Post-it mit dem Countdown bis zum Referat und ein Zettel mit
 * den Fundsachen. Steuerung: Pfeiltasten oder WASD.
 *
 * Die Spiellogik (Signal, Bandbreite, Bewegung, Funklöcher, Ereignisse) steckt vollständig
 * in Ch3Logic (src/logic/ch3SignalHunt.js). Die Szene liest die Tasten, ruft pro Frame
 * Ch3Logic.stepSim() auf, zeichnet den Zustand und übersetzt die Ereignisse in Effekte und
 * GameState-Buchungen (über die ChapterScene-Helfer bzw. GameState.addFrustration).
 * Frust- und Zeitwerte stehen in Ch3Logic.BALANCE.FEEDBACK (eine Quelle der Wahrheit).
 *
 * Leistung: Alles Statische (Plan, Schraffuren, AP-Ringe, Menschentrauben, Heatmap) wird
 * einmalig in Kapitel-Texturen (Präfix ch3-) gebacken – Graphics mit vielen Befehlen würde
 * Phaser sonst in jedem Frame neu zerlegen.
 *
 * Global: Ch3SignalHuntScene.
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, GameState, UI (text, sound, toast, Modal,
 * ProgressBar, Spinner), FX, Ch3Logic, ChapterScene, RNG (optional), Textures-Schlüssel
 * 'icon-wifi-0…4' (optional, sonst eigene Balken).
 */

class Ch3SignalHuntScene extends ChapterScene {
  /** Layout (px, Weltkoordinaten). Wände, Räume und Objekte stehen in Ch3Logic.LEVEL. */
  static LAYOUT = Object.freeze({
    PLAN_W: 596,            // gebackene Plan-Texturen decken (0,0)–(596,592) ab
    PLAN_H: 592,
    MAP_CENTER_X: 302,      // Mitte des Lageplans (Stempel)
    GRID_STEP: 24,
    PAVING_STEP: 16,
    PAVING_SIZE: 2,
    HATCH_SPACING: 10,
    S21_STRIPE_SPACING: 24,
    S21_STRIPE_WIDTH: 9,
    SIGN: { W: 136, H: 74, TITLE_Y: -32, SUBTITLE_Y: -16, YEARS_Y: 0, YEAR_GAP: 42, NEXT_Y: 15 },
    /** Schriftgrößen (px) je Element – nichts unter 13 px (Lesbarkeit am Beamer). */
    FONT: {
      ROOM: 13, AP: 13, AP_REBOOT: 14, DEADZONE_NOTE: 15, CROWD: 13, JANITOR: 13, PLAYER: 14,
      SIGN_TITLE: 13, SIGN_SMALL: 13, SIGN_NEXT: 16, BEST_NOTE: 15,
      SSID: 15, CARD: 13, FILE: 13, POSTIT_TITLE: 16, POSTIT_LINE: 14, COUNTDOWN: 36, NOTE: 13, HELP: 13,
      FLOAT_SMALL: 13, FLOAT_ANNOY: 15,
    },
    /** Dunkle Kontur für Beschriftungen, über die sich Menschentrauben schieben können. */
    LABEL_STROKE: 3,
    AP_LABEL_OFFSET_Y: 7,
    AP_LABEL_SIDE_GAP: 12,  // Abstand des Labels links neben dem Router (siehe AP_LABEL_LEFT)
    AP_LABEL_LEFT: ['bib'], // Label links statt unten, damit es am besten Platz frei bleibt
    AP_REBOOT_LEFT: { DX: -62, DY: 10 }, // Neustart-Notiz bei links beschrifteten APs (rechtsbündig)
    AP_REBOOT_OFFSET_Y: 22,
    AP_RING_FRACTIONS: [0.35, 0.7, 1],
    AP_ICON: { HALF_W: 9, HALF_H: 4, RADIUS: 3, ANTENNA: 6, LED_X: 5, LED_RADIUS: 1.8 },
    DEADZONE_NOTES: [
      { x: 303, y: 252, angle: -8 },  // Treppe/Aufzug
      { x: 76, y: 548, angle: -6 },   // Tiefenhörsaal
    ],
    CROWD_LABEL_GAP: 3,
    CROWD_FILL_SHARE: 0.82,
    CROWD_TEXTURE_MARGIN: 2,
    PERSON_RADIUS: 4,
    PHONE_GLOW_RADIUS: 1.5,
    PHONE_GLOW_OFFSET: 2,
    GOLDEN_ANGLE: 2.39996,
    JANITOR_LABEL_GAP: 3,
    MOP: { X1: 4, Y1: 2, X2: 15, Y2: 10, HEAD_X: 12, HEAD_Y: 8, HEAD_W: 9, HEAD_H: 5 },
    PLAYER_SHADOW: { X: 2, Y: 3, W: 20, H: 14 },
    PLAYER_LABEL_GAP: 4,
    PLAYER_NOSE: { BASE: 1, TIP: 6, HALF: 3.5 },
    GRACE_RING_RADIUS: 15,
    HEATMAP_CELL: 12,
    BEST_MARK_RADIUS: 16,
    BEST_NOTE_GAP: 20,
    PICKUP_SCALE: 0.9,
    DOT_TEXTURE_SIZE: 6,
    CARD: { X: 604, Y: 58, W: 188, H: 166, RADIUS: 10, PAD: 10 },
    CARD_ROWS: { ICON_Y: 8, SSID_Y: 13, STATUS_Y: 42, AP_Y: 60, DIVIDER_Y: 81, FILE_Y: 89, BAR_Y: 111, MB_Y: 125, ETA_Y: 144 },
    CARD_ICON_SIZE: 28,
    CARD_SSID_X: 42,
    SPINNER_SIZE: 18,
    BAR_HEIGHT: 8,
    POSTIT: { X: 612, Y: 238, W: 172, H: 104, ANGLE: -2, PAD: 12, TITLE_Y: 8, LINE_Y: 32, COUNT_BOTTOM: 8 },
    NOTE: {
      X: 606, Y: 360, W: 184, H: 108, ANGLE: 1, PAD: 12,
      TITLE_Y: 10, BREZEL_Y: 36, COFFEE_Y: 60, REPEATER_Y: 82,
      // Brezel-Symbole beginnen ICON_GAP px hinter dem Wort „Brezeln“ (gemessen, schriftunabhängig)
      ICON_GAP: 8, ICON_STEP: 17, ICON_SCALE: 0.62, ICON_EMPTY_ALPHA: 0.22, ICON_TEXTURE_SIZE: 24,
    },
    HELP: { X: 610, Y: 486, LINE_SPACING: 5 },
    SHADOW_OFFSET: { X: 3, Y: 4 },
    SHADOW_ALPHA: 0.35,
    FLOAT_CHAR_WIDTH: 0.55, // grobe Zeichenbreite (× Schriftgröße), um Schwebetexte im Plan zu halten
    FLOAT_MAX_HALF: 210,
    FLOAT_MARGIN: 4,
    FLOAT_ABOVE: 26,
    FLOAT_BELOW: 22,
    FLOAT_RISE: 40,         // so weit steigen Schwebetexte (FX-Standard) – oben nicht unter die HUD
    FAIL_FONT_SIZE: 18,     // Schriftgröße der Fail-Texte (ChapterScene/FX-Standard)
    STAMP_Y: 250,           // „ZU SPÄT“ über dem Flur: Begründung landet darunter auf ruhigem Grund
  });

  /** Tiefen (relativ zu CONFIG.DEPTH): Plan unter dem Inhalt, Panel auf UI-Ebene. */
  static DEPTHS = Object.freeze({
    FLOOR: CONFIG.DEPTH.BACKGROUND + 2,
    HEATMAP: CONFIG.DEPTH.BACKGROUND + 3,
    LINES: CONFIG.DEPTH.BACKGROUND + 4,
    LABELS: CONFIG.DEPTH.BACKGROUND + 5,
    AP_RINGS: CONFIG.DEPTH.CONTENT + 1,
    WET: CONFIG.DEPTH.CONTENT + 2,
    AP_ICON: CONFIG.DEPTH.CONTENT + 3,
    PICKUPS: CONFIG.DEPTH.CONTENT + 4,
    CROWDS: CONFIG.DEPTH.CONTENT + 5,
    JANITOR: CONFIG.DEPTH.CONTENT + 6,
    DOTS: CONFIG.DEPTH.CONTENT + 7,
    PLAYER: CONFIG.DEPTH.CONTENT + 8,
    OVERLAY: CONFIG.DEPTH.CONTENT + 9,
    ANNOTATION: CONFIG.DEPTH.CONTENT + 10,
    SIDEBAR: CONFIG.DEPTH.UI,
  });

  /** Kapitel-Farben (Blaupause auf Nachtblau; Systemfarben aus CONFIG). */
  static PALETTE = Object.freeze({
    FLOOR: CONFIG.COLORS.BG_ALT,
    CORRIDOR: 0x1d3c68,
    YARD: 0x112a4d,
    BLOCK: CONFIG.COLORS.BG_DEEP,
    DEADZONE_FLOOR: 0x2a1a35,
    LINE: CONFIG.COLORS.TEXT_INVERSE,
    PAVING_ALPHA: 0.07,
    GRID_ALPHA: 0.035,
    WALL_ALPHA: 0.88,
    BLOCK_HATCH_ALPHA: 0.12,
    DEADZONE_HATCH: CONFIG.COLORS.DHBW_RED,
    DEADZONE_ALPHA: 0.5,
    DEADZONE_ALPHA_STRONG: 0.9,
    DEADZONE_TEXT: '#ff8a8a',
    HAZARD_STRIPE: 0x1b1b1b,
    LABEL: CONFIG.CSS.TEXT_INVERSE,
    LABEL_ALPHA: 0.72,
    AP_BODY: CONFIG.COLORS.WHITE,
    AP_RING: 0x8ab4f8,
    AP_LABEL: '#cfe0ff',
    LED_ON: 0x34a853,
    LED_WARN: CONFIG.COLORS.HAZARD,
    LED_OFF: CONFIG.COLORS.DHBW_RED,
    PERSON: 0x9fb3d1,
    PHONE_GLOW: 0xd2e3fc,
    CROWD_ZONE: CONFIG.COLORS.TEXT_INVERSE,
    CROWD_ZONE_ALPHA: 0.06,
    CROWD_ZONE_STROKE_ALPHA: 0.3,
    CROWD_LABEL: '#dfe7f5',
    JANITOR: 0xff8f1f,
    MOP_STICK: 0xc8a27a,
    MOP_HEAD: 0xbfe3ff,
    WET: 0x7fb3ff,
    WET_TEXT: '#9cc3ff',
    PLAYER: CONFIG.COLORS.PRIMARY,
    PLAYER_LOST: 0x7b8594,
    DATA_DOT: 0xbfe3ff,
    HEAT_FAST: 0x34a853,
    HEAT_FAST_ALPHA: 0.32,
    HEAT_SLOW: CONFIG.COLORS.DHBW_RED,
    HEAT_SLOW_ALPHA: 0.16,
    BEST_MARK: CONFIG.COLORS.POSTIT,
    BEST_NOTE: '#fff176',
    BREZEL: 0xb5651d,
    SALT: 0xffffff,
    CUP: 0xffffff,
    CUP_SLEEVE: 0xc8a27a,
    CUP_LID: 0x5d4037,
    STEAM: 0xffffff,
    REPEATER: 0xdfe6ee,
    HELP_ALPHA: 0.82,
  });

  /** Effekt- und Animationswerte. */
  static VISUALS = Object.freeze({
    RING_ALPHA_IDLE: 0.09,
    RING_ALPHA_ACTIVE: 0.34,
    RING_WIDTH_IDLE: 1,
    RING_WIDTH_ACTIVE: 1.5,
    WET_ALPHA: 0.24,
    WET_ALPHA_MIN: 0.05,
    WET_RADIUS_SHARE: 0.85,
    DOT_MB: 0.12,           // ein fliegender Datenpunkt je 0,12 MB
    DOT_MS: 420,
    DOT_POOL: 24,
    DOT_ALPHA_START: 0.95,
    DOT_ALPHA_FADE: 0.5,
    URGENT_S: 30,           // Countdown wird rot
    TICK_SOUND_S: 10,       // ab hier tickt es hörbar
    EXPIRED_DIALOG_DELAY_MS: 1100,
    HEATMAP_FADE_MS: 600,
    HEAT_FAST_RATE: 0.6,    // MB/s – ab hier grün
    BLINK_MS: 250,
    PICKUP_POP_MS: 220,
    PICKUP_FLY_MS: 420,
    PICKUP_FLY_RISE: 26,
    TRICKLE_PULSE_SCALE: 1.3, // rote Durchsatz-Anzeige pulsiert bei „Ladebalken kriecht“
    TRICKLE_PULSE_MS: 140,
    HINT_TOAST_MS: 4800,
    INFO_TOAST_MS: 3200,
    FLOAT_SIZE: 14,
    START_DIALOG_WIDTH: 470,
    BURST_COUNT: 12,
    PROGRESS_EPSILON: 0.001,
    MIN_LOST_MB_SHOWN: 0.1, // kleinere Verluste nicht extra einblenden („−0,0 MB“)
    BEST_NOTE_MARGIN: 6,
  });

  /** Kapitel-eigene Texturen (Präfix ch3-). RINGS_A/B: Doppelpuffer für die AP-Ringe. */
  static TEXTURES = Object.freeze({
    BREZEL: 'ch3-brezel',
    COFFEE: 'ch3-coffee',
    REPEATER: 'ch3-repeater',
    DOT: 'ch3-dot',
    PLAN_FLOOR: 'ch3-plan-floor',
    PLAN_LINES: 'ch3-plan-lines',
    RINGS: 'ch3-rings',
    HEATMAP: 'ch3-heatmap',
    CROWD_PREFIX: 'ch3-crowd-',
  });

  constructor() {
    super(3);
  }

  // ===========================================================================
  // Lebenszyklus
  // ===========================================================================

  create() {
    this.initChapter({ background: CONFIG.COLORS.BG });
    this.initState();
    this.createTextures();
    this.drawMap();
    this.createAccessPoints();
    this.createPickups();
    this.createCrowds();
    this.createJanitor();
    this.createPlayer();
    this.createOverlay();
    this.createSidebar();
    this.createKeys();
    this.renderFrame(0);
    this.setObjective(Ch3Logic.TEXTS.OBJECTIVES.READY);
    this.showStartDialog();
  }

  /**
   * Pro Frame: Eingabe → Simulation → Ereignisse → Darstellung.
   * Die Simulation läuft in Echtzeit (Abstand der `time`-Stempel): Phasers geglättetes
   * `delta` bremst das Spiel bei unruhigen Bildraten sonst spürbar aus. Große Sprünge
   * (z. B. nach einer Pause) werden auf BALANCE.MAX_DT_MS begrenzt.
   */
  update(time, delta) {
    if (!this.sim) return;
    const elapsed = this.lastUpdateTime === null ? delta : Math.max(0, time - this.lastUpdateTime);
    this.lastUpdateTime = time;
    const frameMs = Math.min(elapsed, Ch3Logic.BALANCE.MAX_DT_MS);
    const events = Ch3Logic.stepSim(this.sim, frameMs, this.readInput());
    for (const event of events) this.handleSimEvent(event);
    this.renderFrame(frameMs);
  }

  /** Setzt alle Instanzfelder zurück (auch nach scene.restart()). */
  initState() {
    this.sim = Ch3Logic.createSim({ rng: typeof RNG !== 'undefined' ? RNG : undefined });
    this.lastUpdateTime = null;
    this.uiCache = {};
    this.activeModal = null;
    this.isHeatmapVisible = false;
    this.isDeadzoneHighlighted = false;
    this.hasShownS21Toast = false;
    this.lastObjective = null;
    this.lastCountdownSecond = null;
    this.dotBudget = 0;
    this.dotPool = [];
    this.activeDots = [];
    this.apViewKey = null;
    this.pickupViews = {};
    this.apViews = {};
    this.crowdViews = [];
  }

  // ===========================================================================
  // Texturen (Kapitel-eigen, Präfix ch3-)
  // ===========================================================================

  /**
   * Zeichnet mit einem unsichtbaren Graphics-Objekt in eine Textur. Existiert sie schon,
   * wird sie geleert und neu bemalt (Bilder, die sie nutzen, bleiben gültig).
   * @param {string} key
   * @param {number} width
   * @param {number} height
   * @param {(g: Phaser.GameObjects.Graphics) => void} draw
   * @param {{once?: boolean}} [opts] once: vorhandene Textur unverändert lassen
   */
  bakeTexture(key, width, height, draw, { once = false } = {}) {
    if (this.textures.exists(key)) {
      if (once) return key;
      const source = this.textures.get(key).getSourceImage();
      if (source && typeof source.getContext === 'function') {
        source.getContext('2d').clearRect(0, 0, source.width, source.height);
      } else {
        this.textures.remove(key);
      }
    }
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
    return key;
  }

  createTextures() {
    const T = Ch3SignalHuntScene.TEXTURES;
    const P = Ch3SignalHuntScene.PALETTE;
    const L = Ch3SignalHuntScene.LAYOUT;
    const once = { once: true };
    // Brezel: zwei Schlaufen oben, Bauch unten, Salzkörner
    this.bakeTexture(T.BREZEL, 24, 24, (g) => {
      g.lineStyle(4, P.BREZEL, 1);
      g.strokeCircle(8, 10, 5);
      g.strokeCircle(16, 10, 5);
      g.beginPath();
      g.arc(12, 11, 9, Phaser.Math.DegToRad(15), Phaser.Math.DegToRad(165), false);
      g.strokePath();
      g.fillStyle(P.SALT, 0.95);
      g.fillCircle(6, 5, 1);
      g.fillCircle(17, 5, 1);
      g.fillCircle(12, 19, 1);
      g.fillCircle(4, 13, 0.9);
    }, once);
    // Kaffeebecher to go mit Deckel, Banderole und Dampf
    this.bakeTexture(T.COFFEE, 22, 26, (g) => {
      g.lineStyle(1.5, P.STEAM, 0.85);
      g.lineBetween(8, 6, 9, 2);
      g.lineBetween(13, 6, 12, 1);
      g.fillStyle(P.CUP, 1);
      g.fillPoints([{ x: 4, y: 9 }, { x: 18, y: 9 }, { x: 16, y: 25 }, { x: 6, y: 25 }], true);
      g.fillStyle(P.CUP_LID, 1);
      g.fillRect(3, 7, 16, 3);
      g.fillStyle(P.CUP_SLEEVE, 1);
      g.fillPoints([{ x: 5, y: 13 }, { x: 17, y: 13 }, { x: 16.4, y: 19 }, { x: 5.6, y: 19 }], true);
    }, once);
    // WLAN-Repeater mit zwei Antennen und LEDs
    this.bakeTexture(T.REPEATER, 24, 22, (g) => {
      g.lineStyle(2, P.REPEATER, 1);
      g.lineBetween(6, 11, 4, 2);
      g.lineBetween(18, 11, 20, 2);
      g.fillStyle(P.REPEATER, 1);
      g.fillRoundedRect(2, 10, 20, 10, 3);
      g.fillStyle(P.LED_ON, 1);
      g.fillCircle(8, 15, 1.6);
      g.fillStyle(P.LED_WARN, 1);
      g.fillCircle(13, 15, 1.6);
    }, once);
    // Datenpunkt (weiß, wird eingefärbt)
    this.bakeTexture(T.DOT, L.DOT_TEXTURE_SIZE, L.DOT_TEXTURE_SIZE, (g) => {
      g.fillStyle(CONFIG.COLORS.WHITE, 1);
      g.fillCircle(L.DOT_TEXTURE_SIZE / 2, L.DOT_TEXTURE_SIZE / 2, L.DOT_TEXTURE_SIZE / 2);
    }, once);
    // Lageplan: Böden und Linien getrennt, damit die Heatmap dazwischen liegen kann
    this.bakeTexture(T.PLAN_FLOOR, L.PLAN_W, L.PLAN_H, (g) => this.drawPlanFloor(g), once);
    this.bakeTexture(T.PLAN_LINES, L.PLAN_W, L.PLAN_H, (g) => this.drawPlanLines(g), once);
  }

  // ===========================================================================
  // Lageplan (statisch)
  // ===========================================================================

  drawMap() {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const D = Ch3SignalHuntScene.DEPTHS;
    const T = Ch3SignalHuntScene.TEXTURES;
    this.add.image(0, 0, T.PLAN_FLOOR).setOrigin(0).setDepth(D.FLOOR);
    this.add.image(0, 0, T.PLAN_LINES).setOrigin(0).setDepth(D.LINES);
    this.drawS21Sign();

    // Raumbeschriftungen (Schreibmaschine wie auf einem echten Plan)
    Ch3Logic.LEVEL.rooms.forEach((room) => {
      const isCentered = room.align !== 'left';
      UI.text(this, room.labelX, room.labelY, room.label, {
        font: 'PAPER', size: L.FONT.ROOM, color: P.LABEL, align: isCentered ? 'center' : 'left',
        origin: isCentered ? { x: 0.5, y: 0 } : 0,
      }).setAlpha(P.LABEL_ALPHA).setDepth(D.LABELS);
    });

    // Handschriftliche Funkloch-Notizen der Fachschaft
    this.deadzoneNotes = L.DEADZONE_NOTES.map((note) =>
      UI.text(this, note.x, note.y, Ch3Logic.TEXTS.ANNOTATIONS.DEADZONE, {
        font: 'HAND', size: L.FONT.DEADZONE_NOTE, bold: true, color: P.DEADZONE_TEXT, origin: 0.5,
      }).setAngle(note.angle).setDepth(D.LABELS));
  }

  /** Böden, Pflaster im Innenhof, Blaupausen-Raster (für die Textur PLAN_FLOOR). */
  drawPlanFloor(g) {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const level = Ch3Logic.LEVEL;
    const map = level.map;
    level.rooms.forEach((room) => {
      g.fillStyle(this.floorColor(room), 1);
      g.fillRect(room.x, room.y, room.w, room.h);
    });
    const yard = level.rooms.find((room) => room.id === 'innenhof');
    g.fillStyle(P.LINE, P.PAVING_ALPHA);
    for (let x = yard.x + L.PAVING_STEP / 2; x < yard.x + yard.w; x += L.PAVING_STEP) {
      for (let y = yard.y + L.PAVING_STEP / 2; y < yard.y + yard.h; y += L.PAVING_STEP) {
        g.fillRect(x, y, L.PAVING_SIZE, L.PAVING_SIZE);
      }
    }
    g.lineStyle(1, P.LINE, P.GRID_ALPHA);
    for (let x = map.x; x <= map.x + map.width; x += L.GRID_STEP) g.lineBetween(x, map.y, x, map.y + map.height);
    for (let y = map.y; y <= map.y + map.height; y += L.GRID_STEP) g.lineBetween(map.x, y, map.x + map.width, y);
  }

  /** Schraffuren, Baustelle mit Schild-Fläche und Wände (für die Textur PLAN_LINES). */
  drawPlanLines(g) {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const level = Ch3Logic.LEVEL;
    this.drawDeadzoneHatch(g, false);
    g.lineStyle(1, P.LINE, P.BLOCK_HATCH_ALPHA);
    level.blocks.forEach((block) => {
      Ch3Logic.diagonalSegments(block, L.HATCH_SPACING).forEach((s) => g.lineBetween(s.x1, s.y1, s.x2, s.y2));
    });
    // Stuttgart-21-Baustelle: Warnschraffur, Rahmen, Schild
    const s21 = level.s21;
    g.fillStyle(CONFIG.COLORS.HAZARD, 1);
    g.fillRect(s21.x, s21.y, s21.w, s21.h);
    g.lineStyle(L.S21_STRIPE_WIDTH, P.HAZARD_STRIPE, 0.9);
    Ch3Logic.diagonalSegments(s21, L.S21_STRIPE_SPACING).forEach((s) => g.lineBetween(s.x1, s.y1, s.x2, s.y2));
    g.lineStyle(2, P.HAZARD_STRIPE, 1);
    g.strokeRect(s21.x, s21.y, s21.w, s21.h);
    const cx = s21.x + s21.w / 2;
    const cy = s21.y + s21.h / 2;
    const sign = L.SIGN;
    g.fillStyle(CONFIG.COLORS.SHADOW, L.SHADOW_ALPHA);
    g.fillRect(cx - sign.W / 2 + L.SHADOW_OFFSET.X, cy - sign.H / 2 + L.SHADOW_OFFSET.Y, sign.W, sign.H);
    g.fillStyle(CONFIG.COLORS.PAPER, 1);
    g.fillRect(cx - sign.W / 2, cy - sign.H / 2, sign.W, sign.H);
    // Wände zuletzt (liegen über allem)
    g.fillStyle(P.LINE, P.WALL_ALPHA);
    level.walls.forEach((wall) => g.fillRect(wall.x, wall.y, wall.w, wall.h));
  }

  /** Bodenfarbe je Raumtyp. */
  floorColor(room) {
    const P = Ch3SignalHuntScene.PALETTE;
    if (room.isDeadzone) return P.DEADZONE_FLOOR;
    if (room.isBlock) return P.BLOCK;
    if (room.id === 'innenhof') return P.YARD;
    if (room.id === 'flurWest' || room.id === 'flurOst') return P.CORRIDOR;
    return P.FLOOR;
  }

  /** Rote Schraffur der Funklöcher; `isStrong` (mit Rahmen) nach dem Mitleids-Tipp. */
  drawDeadzoneHatch(g, isStrong) {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const alpha = isStrong ? P.DEADZONE_ALPHA_STRONG : P.DEADZONE_ALPHA;
    Ch3Logic.LEVEL.rooms.filter((room) => room.isDeadzone).forEach((room) => {
      g.lineStyle(isStrong ? 3 : 2, P.DEADZONE_HATCH, alpha);
      Ch3Logic.diagonalSegments(room, L.HATCH_SPACING).forEach((s) => g.lineBetween(s.x1, s.y1, s.x2, s.y2));
      if (isStrong) {
        g.lineStyle(2, P.DEADZONE_HATCH, 1);
        g.strokeRect(room.x + 1, room.y + 1, room.w - 2, room.h - 2);
      }
    });
  }

  /** Texte auf dem Baustellenschild, Jahreszahlen rot durchgestrichen. */
  drawS21Sign() {
    const L = Ch3SignalHuntScene.LAYOUT;
    const D = Ch3SignalHuntScene.DEPTHS;
    const T = Ch3Logic.TEXTS.SIGN_S21;
    const s21 = Ch3Logic.LEVEL.s21;
    const cx = s21.x + s21.w / 2;
    const cy = s21.y + s21.h / 2;
    const sign = L.SIGN;
    const depth = D.LABELS;
    UI.text(this, cx, cy + sign.TITLE_Y, T.TITLE, { font: 'PAPER', size: L.FONT.SIGN_TITLE, bold: true, color: CONFIG.CSS.INK, origin: { x: 0.5, y: 0 } }).setDepth(depth);
    UI.text(this, cx, cy + sign.SUBTITLE_Y, T.SUBTITLE, { font: 'PAPER', size: L.FONT.SIGN_SMALL, color: CONFIG.CSS.INK_MUTED, origin: { x: 0.5, y: 0 } }).setDepth(depth);
    const strike = this.add.graphics().setDepth(depth + 1);
    strike.lineStyle(1.5, CONFIG.COLORS.DHBW_RED, 1);
    T.YEARS.forEach((year, index) => {
      const x = cx + (index - (T.YEARS.length - 1) / 2) * sign.YEAR_GAP;
      const label = UI.text(this, x, cy + sign.YEARS_Y, year, { font: 'PAPER', size: L.FONT.SIGN_SMALL, color: CONFIG.CSS.INK, origin: { x: 0.5, y: 0 } }).setDepth(depth);
      const midY = label.y + label.height / 2;
      strike.lineBetween(x - label.width / 2 - 1, midY, x + label.width / 2 + 1, midY);
    });
    UI.text(this, cx, cy + sign.NEXT_Y, T.NEXT, { font: 'HAND', size: L.FONT.SIGN_NEXT, bold: true, color: CONFIG.CSS.DHBW_RED, origin: { x: 0.5, y: 0 } }).setDepth(depth);
  }

  // ===========================================================================
  // Access Points, Fundsachen, Menschentrauben, Hausmeister, Spielfigur
  // ===========================================================================

  createAccessPoints() {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const D = Ch3SignalHuntScene.DEPTHS;
    this.bakeRings();
    this.ringsImage = this.add.image(0, 0, Ch3SignalHuntScene.TEXTURES.RINGS).setOrigin(0).setDepth(D.AP_RINGS);
    Ch3Logic.LEVEL.aps.forEach((ap) => {
      const icon = this.add.graphics().setDepth(D.AP_ICON);
      this.drawApIcon(icon, ap, P.LED_ON);
      const isLeft = L.AP_LABEL_LEFT.includes(ap.id);
      const label = UI.text(this, isLeft ? ap.x - L.AP_LABEL_SIDE_GAP : ap.x, isLeft ? ap.y : ap.y + L.AP_LABEL_OFFSET_Y, ap.name, {
        font: 'MONO', size: L.FONT.AP, color: P.AP_LABEL, origin: isLeft ? { x: 1, y: 0.5 } : { x: 0.5, y: 0 },
      }).setStroke(CONFIG.CSS.BG_DEEP, L.LABEL_STROKE).setDepth(D.AP_ICON);
      const rebootX = isLeft ? ap.x + L.AP_REBOOT_LEFT.DX : ap.x;
      const rebootY = isLeft ? ap.y + L.AP_REBOOT_LEFT.DY : ap.y + L.AP_REBOOT_OFFSET_Y;
      const reboot = UI.text(this, rebootX, rebootY, Ch3Logic.TEXTS.ANNOTATIONS.REBOOT, {
        font: 'HAND', size: L.FONT.AP_REBOOT, bold: true, color: P.DEADZONE_TEXT, origin: { x: isLeft ? 1 : 0.5, y: 0 },
      }).setDepth(D.ANNOTATION).setVisible(false);
      this.apViews[ap.id] = { ap, icon, label, reboot, ledColor: P.LED_ON };
    });
  }

  /**
   * Reichweiten-Ringe aller erreichbaren APs in eine Textur backen; der verbundene AP
   * leuchtet stärker, APs im Neustart fehlen.
   */
  bakeRings(activeId = null, offlineIds = []) {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const V = Ch3SignalHuntScene.VISUALS;
    this.bakeTexture(Ch3SignalHuntScene.TEXTURES.RINGS, L.PLAN_W, L.PLAN_H, (g) => {
      Ch3Logic.LEVEL.aps.forEach((ap) => {
        if (offlineIds.includes(ap.id)) return;
        const isActive = ap.id === activeId;
        g.lineStyle(isActive ? V.RING_WIDTH_ACTIVE : V.RING_WIDTH_IDLE, P.AP_RING, isActive ? V.RING_ALPHA_ACTIVE : V.RING_ALPHA_IDLE);
        L.AP_RING_FRACTIONS.forEach((fraction) => g.strokeCircle(ap.x, ap.y, ap.range * fraction));
      });
    });
  }

  /** Kleiner Router von oben: Gehäuse, zwei Antennen, Status-LED. */
  drawApIcon(g, ap, ledColor) {
    const A = Ch3SignalHuntScene.LAYOUT.AP_ICON;
    const P = Ch3SignalHuntScene.PALETTE;
    g.clear();
    g.lineStyle(2, P.AP_BODY, 1);
    g.lineBetween(ap.x - A.HALF_W + 3, ap.y - A.HALF_H, ap.x - A.HALF_W + 1, ap.y - A.HALF_H - A.ANTENNA);
    g.lineBetween(ap.x + A.HALF_W - 3, ap.y - A.HALF_H, ap.x + A.HALF_W - 1, ap.y - A.HALF_H - A.ANTENNA);
    g.fillStyle(P.AP_BODY, 1);
    g.fillRoundedRect(ap.x - A.HALF_W, ap.y - A.HALF_H, A.HALF_W * 2, A.HALF_H * 2, A.RADIUS);
    g.fillStyle(ledColor, 1);
    g.fillCircle(ap.x + A.LED_X, ap.y, A.LED_RADIUS);
  }

  createPickups() {
    const L = Ch3SignalHuntScene.LAYOUT;
    const D = Ch3SignalHuntScene.DEPTHS;
    const T = Ch3SignalHuntScene.TEXTURES;
    const keys = { brezel: T.BREZEL, coffee: T.COFFEE, repeater: T.REPEATER };
    this.sim.pickups.forEach((item) => {
      this.pickupViews[item.id] = this.add.image(item.x, item.y, keys[item.type])
        .setScale(L.PICKUP_SCALE).setDepth(D.PICKUPS);
    });
  }

  createCrowds() {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const D = Ch3SignalHuntScene.DEPTHS;
    this.crowdViews = Ch3Logic.LEVEL.crowds.map((crowd) => {
      const key = `${Ch3SignalHuntScene.TEXTURES.CROWD_PREFIX}${crowd.id}`;
      const half = crowd.radius + L.CROWD_TEXTURE_MARGIN;
      this.bakeTexture(key, half * 2, half * 2, (g) => {
        g.fillStyle(P.CROWD_ZONE, P.CROWD_ZONE_ALPHA);
        g.fillCircle(half, half, crowd.radius);
        g.lineStyle(1, P.CROWD_ZONE, P.CROWD_ZONE_STROKE_ALPHA);
        g.strokeCircle(half, half, crowd.radius);
        // Personen auf einer Sonnenblumen-Spirale: dicht, aber ohne Zufall
        for (let i = 0; i < crowd.dots; i++) {
          const r = crowd.radius * L.CROWD_FILL_SHARE * Math.sqrt((i + 0.5) / crowd.dots);
          const angle = i * L.GOLDEN_ANGLE;
          const x = half + Math.cos(angle) * r;
          const y = half + Math.sin(angle) * r;
          g.fillStyle(P.PERSON, 1);
          g.fillCircle(x, y, L.PERSON_RADIUS);
          g.fillStyle(P.PHONE_GLOW, 1);
          g.fillCircle(x + L.PHONE_GLOW_OFFSET, y - L.PHONE_GLOW_OFFSET, L.PHONE_GLOW_RADIUS);
        }
      }, { once: true });
      const container = this.add.container(crowd.path[0].x, crowd.path[0].y).setDepth(D.CROWDS);
      container.add(this.add.image(0, 0, key));
      container.add(UI.text(this, 0, crowd.radius + L.CROWD_LABEL_GAP, crowd.label, {
        size: L.FONT.CROWD, color: P.CROWD_LABEL, origin: { x: 0.5, y: 0 },
      }).setStroke(CONFIG.CSS.BG_DEEP, L.LABEL_STROKE));
      return { crowd, container };
    });
  }

  createJanitor() {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const D = Ch3SignalHuntScene.DEPTHS;
    const radius = Ch3Logic.BALANCE.JANITOR.RADIUS;
    const container = this.add.container(this.sim.janitor.x, this.sim.janitor.y).setDepth(D.JANITOR);
    const mop = this.add.graphics();
    mop.lineStyle(2, P.MOP_STICK, 1);
    mop.lineBetween(L.MOP.X1, L.MOP.Y1, L.MOP.X2, L.MOP.Y2);
    mop.fillStyle(P.MOP_HEAD, 1);
    mop.fillRoundedRect(L.MOP.HEAD_X, L.MOP.HEAD_Y, L.MOP.HEAD_W, L.MOP.HEAD_H, 2);
    const body = this.add.circle(0, 0, radius, P.JANITOR).setStrokeStyle(2, CONFIG.COLORS.WHITE, 0.9);
    const label = UI.text(this, 0, -radius - L.JANITOR_LABEL_GAP, Ch3Logic.TEXTS.ANNOTATIONS.JANITOR, {
      size: L.FONT.JANITOR, bold: true, color: CONFIG.CSS.HAZARD, origin: { x: 0.5, y: 1 },
    }).setStroke(CONFIG.CSS.BG_DEEP, L.LABEL_STROKE);
    container.add([mop, body, label]);
    this.janitorView = { container, mop, lastX: this.sim.janitor.x };
    this.wetGraphics = this.add.graphics().setDepth(D.WET);
  }

  createPlayer() {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const D = Ch3SignalHuntScene.DEPTHS;
    const radius = Ch3Logic.BALANCE.PLAYER_RADIUS;
    const container = this.add.container(this.sim.player.x, this.sim.player.y).setDepth(D.PLAYER);
    const shadow = this.add.ellipse(L.PLAYER_SHADOW.X, L.PLAYER_SHADOW.Y, L.PLAYER_SHADOW.W, L.PLAYER_SHADOW.H,
      CONFIG.COLORS.SHADOW, L.SHADOW_ALPHA);
    const body = this.add.circle(0, 0, radius, P.PLAYER).setStrokeStyle(2, CONFIG.COLORS.WHITE, 1);
    const nose = this.add.graphics();
    const N = L.PLAYER_NOSE;
    nose.fillStyle(CONFIG.COLORS.WHITE, 1);
    nose.fillTriangle(radius + N.BASE, -N.HALF, radius + N.BASE, N.HALF, radius + N.TIP, 0);
    const label = UI.text(this, 0, -radius - L.PLAYER_LABEL_GAP, Ch3Logic.TEXTS.ANNOTATIONS.PLAYER, {
      font: 'HAND', size: L.FONT.PLAYER, bold: true, color: CONFIG.CSS.WHITE, origin: { x: 0.5, y: 1 },
    }).setStroke(CONFIG.CSS.BG_DEEP, L.LABEL_STROKE);
    container.add([shadow, body, nose, label]);
    this.playerView = { container, body, nose, color: P.PLAYER };
  }

  createOverlay() {
    const D = Ch3SignalHuntScene.DEPTHS;
    const V = Ch3SignalHuntScene.VISUALS;
    const P = Ch3SignalHuntScene.PALETTE;
    this.overlayGraphics = this.add.graphics().setDepth(D.OVERLAY);
    for (let i = 0; i < V.DOT_POOL; i++) {
      this.dotPool.push(this.add.image(0, 0, Ch3SignalHuntScene.TEXTURES.DOT).setTint(P.DATA_DOT).setDepth(D.DOTS).setVisible(false));
    }
  }

  // ===========================================================================
  // Handy-Panel (rechts)
  // ===========================================================================

  createSidebar() {
    const L = Ch3SignalHuntScene.LAYOUT;
    const D = Ch3SignalHuntScene.DEPTHS;
    const C = L.CARD;
    const R = L.CARD_ROWS;
    const T = Ch3Logic.TEXTS;
    const depth = D.SIDEBAR;
    const innerWidth = C.W - 2 * C.PAD;

    // Android-Karte
    const card = this.add.graphics().setDepth(depth);
    card.fillStyle(CONFIG.COLORS.SHADOW, L.SHADOW_ALPHA);
    card.fillRoundedRect(C.X + 1, C.Y + 3, C.W, C.H, C.RADIUS);
    card.fillStyle(CONFIG.COLORS.SURFACE, 1);
    card.fillRoundedRect(C.X, C.Y, C.W, C.H, C.RADIUS);
    card.lineStyle(1, CONFIG.COLORS.BORDER, 1);
    card.lineBetween(C.X + C.PAD, C.Y + R.DIVIDER_Y, C.X + C.W - C.PAD, C.Y + R.DIVIDER_Y);

    const iconX = C.X + C.PAD + L.CARD_ICON_SIZE / 2;
    const iconY = C.Y + R.ICON_Y + L.CARD_ICON_SIZE / 2;
    if (this.textures.exists('icon-wifi-4')) {
      this.wifiIcon = this.add.image(iconX, iconY, 'icon-wifi-4').setDisplaySize(L.CARD_ICON_SIZE, L.CARD_ICON_SIZE)
        .setTint(CONFIG.COLORS.TEXT).setDepth(depth + 1);
    } else {
      this.wifiFallback = this.add.graphics().setDepth(depth + 1);
      this.wifiFallbackPos = { x: iconX, y: iconY };
    }
    UI.text(this, C.X + L.CARD_SSID_X, C.Y + R.SSID_Y, T.SSID, { size: L.FONT.SSID, bold: true, color: CONFIG.CSS.TEXT }).setDepth(depth + 1);
    this.spinner = new UI.Spinner(this, C.X + C.W - C.PAD - L.SPINNER_SIZE, C.Y + R.SSID_Y, {
      size: L.SPINNER_SIZE, thickness: 2.5, autoStart: false,
    });
    this.spinner.setDepth(depth + 2);
    this.statusText = UI.text(this, C.X + C.PAD, C.Y + R.STATUS_Y, '', { size: L.FONT.CARD, bold: true, color: CONFIG.CSS.TEXT_MUTED }).setDepth(depth + 1);
    this.apText = UI.text(this, C.X + C.PAD, C.Y + R.AP_Y, '', { size: L.FONT.CARD, color: CONFIG.CSS.TEXT_MUTED }).setDepth(depth + 1);
    this.fileText = UI.text(this, C.X + C.PAD, C.Y + R.FILE_Y, '', { size: L.FONT.FILE, color: CONFIG.CSS.TEXT }).setDepth(depth + 1);
    Ch3SignalHuntScene.fitText(this.fileText, `↓ ${this.sim.fileName}`, innerWidth);
    this.progressBar = new UI.ProgressBar(this, C.X + C.PAD, C.Y + R.BAR_Y, {
      width: innerWidth, height: L.BAR_HEIGHT, value: 0, color: CONFIG.COLORS.PRIMARY, bgColor: CONFIG.COLORS.SURFACE_ALT,
    });
    this.progressBar.setDepth(depth + 1);
    this.mbText = UI.text(this, C.X + C.PAD, C.Y + R.MB_Y, '', { size: L.FONT.CARD, color: CONFIG.CSS.TEXT }).setDepth(depth + 1);
    this.rateText = UI.text(this, C.X + C.W - C.PAD, C.Y + R.MB_Y, '', {
      size: L.FONT.CARD, bold: true, color: CONFIG.CSS.TEXT, origin: { x: 1, y: 0 },
    }).setDepth(depth + 1);
    this.etaText = UI.text(this, C.X + C.PAD, C.Y + R.ETA_Y, '', { size: L.FONT.CARD, color: CONFIG.CSS.TEXT_MUTED }).setDepth(depth + 1);

    this.createPostit(depth);
    this.createInventoryNote(depth);

    UI.text(this, L.HELP.X, L.HELP.Y, T.SIDEBAR.HELP, {
      size: L.FONT.HELP, color: CONFIG.CSS.TEXT_INVERSE, lineSpacing: L.HELP.LINE_SPACING,
    }).setAlpha(Ch3SignalHuntScene.PALETTE.HELP_ALPHA).setDepth(depth);
  }

  /** Post-it mit dem Countdown bis zum Referat. */
  createPostit(depth) {
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = L.POSTIT;
    const T = Ch3Logic.TEXTS.SIDEBAR;
    const container = this.add.container(P.X + P.W / 2, P.Y + P.H / 2).setDepth(depth).setAngle(P.ANGLE);
    const left = -P.W / 2;
    const top = -P.H / 2;
    container.add(this.add.rectangle(left + L.SHADOW_OFFSET.X, top + L.SHADOW_OFFSET.Y, P.W, P.H, CONFIG.COLORS.SHADOW, L.SHADOW_ALPHA).setOrigin(0));
    container.add(this.add.rectangle(left, top, P.W, P.H, CONFIG.COLORS.POSTIT).setOrigin(0));
    container.add(UI.text(this, left + P.PAD, top + P.TITLE_Y, T.POSTIT_TITLE, { font: 'HAND', size: L.FONT.POSTIT_TITLE, bold: true, color: CONFIG.CSS.INK }));
    container.add(UI.text(this, left + P.PAD, top + P.LINE_Y, T.POSTIT_LINE, { font: 'HAND', size: L.FONT.POSTIT_LINE, color: CONFIG.CSS.INK }));
    this.countdownText = UI.text(this, 0, -top - P.COUNT_BOTTOM, '', {
      font: 'HAND', size: L.FONT.COUNTDOWN, bold: true, color: CONFIG.CSS.INK, origin: { x: 0.5, y: 1 },
    });
    container.add(this.countdownText);
    this.postit = container;
  }

  /** Zettel „Fundsachen“: Brezeln, Kaffee, Repeater. */
  createInventoryNote(depth) {
    const L = Ch3SignalHuntScene.LAYOUT;
    const N = L.NOTE;
    const T = Ch3Logic.TEXTS.SIDEBAR;
    const container = this.add.container(N.X + N.W / 2, N.Y + N.H / 2).setDepth(depth).setAngle(N.ANGLE);
    const left = -N.W / 2;
    const top = -N.H / 2;
    const ink = { font: 'PAPER', size: L.FONT.NOTE, color: CONFIG.CSS.INK };
    container.add(this.add.rectangle(left + L.SHADOW_OFFSET.X, top + L.SHADOW_OFFSET.Y, N.W, N.H, CONFIG.COLORS.SHADOW, L.SHADOW_ALPHA).setOrigin(0));
    container.add(this.add.rectangle(left, top, N.W, N.H, CONFIG.COLORS.PAPER).setOrigin(0));
    container.add(UI.text(this, left + N.PAD, top + N.TITLE_Y, T.INVENTORY_TITLE, { ...ink, bold: true }));
    const brezelLabel = UI.text(this, left + N.PAD, top + N.BREZEL_Y, T.BREZELS, ink);
    container.add(brezelLabel);
    // Fünf Plätze für Brezeln (blass = noch offen); Position aus der gemessenen Wortbreite
    this.brezelIcons = [];
    const iconHalf = (N.ICON_TEXTURE_SIZE * N.ICON_SCALE) / 2;
    const firstIconX = brezelLabel.x + brezelLabel.width + N.ICON_GAP + iconHalf;
    const iconY = brezelLabel.y + brezelLabel.height / 2;
    for (let i = 0; i < Ch3Logic.BALANCE.BREZEL_GOAL; i++) {
      const icon = this.add.image(firstIconX + i * N.ICON_STEP, iconY, Ch3SignalHuntScene.TEXTURES.BREZEL)
        .setScale(N.ICON_SCALE).setAlpha(N.ICON_EMPTY_ALPHA);
      container.add(icon);
      this.brezelIcons.push(icon);
    }
    // Nur für Extra-Brezeln über dem Ziel („+2“); das Ziel selbst zeigen die fünf Plätze
    this.brezelCountText = UI.text(this, -left - N.PAD, top + N.BREZEL_Y, '', { ...ink, bold: true, origin: { x: 1, y: 0 } });
    this.coffeeText = UI.text(this, left + N.PAD, top + N.COFFEE_Y, '', ink);
    this.repeaterText = UI.text(this, left + N.PAD, top + N.REPEATER_Y, '', ink);
    container.add([this.brezelCountText, this.coffeeText, this.repeaterText]);
    this.inventoryNote = container;
  }

  // ===========================================================================
  // Eingabe
  // ===========================================================================

  createKeys() {
    const keyboard = this.input && this.input.keyboard;
    // Ohne Capture: WASD/Pfeile blockieren so keine Eingaben anderer Szenen.
    this.moveKeys = keyboard
      ? keyboard.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D' }, false)
      : null;
  }

  /** @returns {{dx:number, dy:number}} Richtung aus Pfeiltasten/WASD */
  readInput() {
    const k = this.moveKeys;
    if (!k) return { dx: 0, dy: 0 };
    const right = k.right.isDown || k.d.isDown;
    const left = k.left.isDown || k.a.isDown;
    const down = k.down.isDown || k.s.isDown;
    const up = k.up.isDown || k.w.isDown;
    return { dx: (right ? 1 : 0) - (left ? 1 : 0), dy: (down ? 1 : 0) - (up ? 1 : 0) };
  }

  // ===========================================================================
  // Dialoge
  // ===========================================================================

  showStartDialog() {
    const sim = this.sim;
    const T = Ch3Logic.TEXTS.START_DIALOG;
    if (!UI.Modal) {
      this.startDownload();
      return;
    }
    const eta = sim.potentialRate > 0 ? sim.sizeMB / sim.potentialRate : Infinity;
    this.activeModal = this.showModal({
      title: T.TITLE,
      icon: 'question',
      width: Ch3SignalHuntScene.VISUALS.START_DIALOG_WIDTH,
      text: Ch3Logic.fill(T.TEXT, {
        file: sim.fileName,
        size: Ch3Logic.formatMB(sim.sizeMB),
        eta: Ch3Logic.formatDuration(eta),
        countdown: Ch3Logic.formatCountdown(sim.countdownS),
      }),
      buttons: [{ text: T.BUTTON, variant: 'primary', onClick: () => this.startDownload() }],
      onClose: () => this.startDownload(),
    });
  }

  /** Startet Countdown und Download (idempotent; Button und onClose rufen beide). */
  startDownload() {
    this.activeModal = null;
    if (!this.sim || this.sim.phase !== 'ready') return;
    Ch3Logic.startSim(this.sim);
    UI.sound('modem');
    this.updateObjective();
  }

  /** Dialog nach abgelaufenem Countdown: neuer Versuch mit Restfortschritt. */
  showExpiredDialog(event) {
    if (this.isFinished || !this.sim) return;
    const T = Ch3Logic.TEXTS;
    this.activeModal = this.showModal({
      title: T.EXPIRED_DIALOG.TITLE,
      icon: 'warning',
      width: Ch3SignalHuntScene.VISUALS.START_DIALOG_WIDTH,
      text: Ch3Logic.fill(T.EXPIRED_DIALOG.TEXT, {
        prof: T.PROFESSOR,
        residual: Ch3Logic.formatMB(event.residualMB),
        size: Ch3Logic.formatMB(this.sim.sizeMB),
        countdown: Ch3Logic.formatCountdown(event.countdownS),
      }),
      buttons: [{ text: T.EXPIRED_DIALOG.BUTTON, variant: 'primary', onClick: () => this.resumeSim() }],
      onClose: () => this.resumeSim(),
    });
  }

  /** Gnaden-Abschluss nach dem letzten Ablauf (keine Sackgasse). */
  showMercyDialog() {
    if (this.isFinished) return;
    const T = Ch3Logic.TEXTS.MERCY_DIALOG;
    this.activeModal = this.showModal({
      title: T.TITLE,
      icon: 'info',
      width: Ch3SignalHuntScene.VISUALS.START_DIALOG_WIDTH,
      text: T.TEXT,
      buttons: [{ text: T.BUTTON, variant: 'success', onClick: () => this.finishChapter({ mercy: true }) }],
      onClose: () => this.finishChapter({ mercy: true }),
    });
  }

  resumeSim() {
    this.activeModal = null;
    if (this.isFinished || !this.sim) return;
    this.sim.isFrozen = false;
    this.updateObjective();
  }

  // ===========================================================================
  // Ereignisse der Simulation → Effekte und Buchungen
  // ===========================================================================

  handleSimEvent(event) {
    const T = Ch3Logic.TEXTS;
    const F = Ch3Logic.BALANCE.FEEDBACK;
    const L = Ch3SignalHuntScene.LAYOUT;
    const V = Ch3SignalHuntScene.VISUALS;
    const C = CONFIG.CSS;
    const player = this.sim.player;
    switch (event.type) {
      case 'pickup':
        this.handlePickup(event);
        break;
      case 'brezel-lover':
        this.achievement('BREZEL_LOVER');
        this.safeToast(T.TOASTS.BREZEL_LOVER, { variant: 'success' });
        break;
      case 'crowd':
        this.floatAt(event.x, event.y - L.FLOAT_ABOVE, T.FLOATS.CROWD, { color: C.TEXT_INVERSE, size: L.FONT.FLOAT_SMALL });
        break;
      case 'slip':
        UI.sound('whoosh');
        this.floatAt(event.x, event.y - L.FLOAT_ABOVE, T.FLOATS.SLIP, { color: Ch3SignalHuntScene.PALETTE.WET_TEXT });
        break;
      case 'blocked':
        UI.sound('error');
        if (!this.hasShownS21Toast) {
          this.hasShownS21Toast = true;
          this.safeToast(T.TOASTS.S21, { variant: 'warning', duration: V.INFO_TOAST_MS });
        } else {
          this.floatAt(event.x, event.y - L.FLOAT_ABOVE, T.FLOATS.BLOCKED, { color: C.HAZARD });
        }
        break;
      case 'shush':
        this.safeToast(T.TOASTS.SHUSH, { duration: V.INFO_TOAST_MS });
        break;
      case 'janitor':
        this.handleJanitorBump(event);
        break;
      case 'roam':
        this.pulseAp(event.to);
        break;
      case 'grace-start':
        UI.sound('alarm');
        this.floatAt(player.x, player.y - L.FLOAT_ABOVE, T.FLOATS.SIGNAL_LOST, { color: C.DANGER });
        break;
      case 'grace-saved':
        this.floatAt(player.x, player.y - L.FLOAT_ABOVE, T.FLOATS.SAVED, { color: C.SUCCESS });
        break;
      case 'disconnect':
        this.handleDisconnect(event);
        break;
      case 'reconnected':
        UI.sound('connect');
        this.floatAt(player.x, player.y - L.FLOAT_ABOVE, T.FLOATS.RECONNECTED, { color: C.SUCCESS });
        break;
      case 'outage-warning':
        UI.sound('notify');
        this.safeToast(Ch3Logic.fill(T.TOASTS.OUTAGE_WARNING, { ap: this.apName(event.apId), s: event.seconds }), { variant: 'warning' });
        this.blinkAp(event.apId, event.seconds);
        break;
      case 'outage-start':
        UI.sound('disconnect');
        this.safeToast(Ch3Logic.fill(T.TOASTS.OUTAGE_START, { ap: this.apName(event.apId) }), { variant: 'error' });
        break;
      case 'outage-end':
        UI.sound('notify');
        this.safeToast(Ch3Logic.fill(T.TOASTS.OUTAGE_END, { ap: this.apName(event.apId) }), { duration: V.INFO_TOAST_MS });
        break;
      case 'hint':
        this.handleHint(event);
        break;
      case 'trickle':
        this.handleTrickle(event);
        break;
      case 'stall-start':
        this.annoy(F.STALL_FRUST, T.REASONS.STALL, player.x, player.y - L.FLOAT_ABOVE);
        break;
      case 'complete':
        this.finishChapter();
        break;
      case 'expired':
        this.handleExpired(event);
        break;
      case 'mercy':
        this.handleMercy();
        break;
      default:
        break;
    }
  }

  handlePickup(event) {
    const T = Ch3Logic.TEXTS;
    const B = Ch3Logic.BALANCE;
    const V = Ch3SignalHuntScene.VISUALS;
    const L = Ch3SignalHuntScene.LAYOUT;
    UI.sound('pickup');
    this.flyAway(this.pickupViews[event.id]);
    ChapterScene.safely(() => FX.burst(this, event.x, event.y, { color: CONFIG.COLORS.POSTIT, count: V.BURST_COUNT }));
    if (event.kind === 'brezel') {
      const reason = event.count <= B.BREZEL_GOAL
        ? Ch3Logic.fill(T.REASONS.BREZEL, { n: event.count, goal: B.BREZEL_GOAL })
        : T.REASONS.BREZEL_EXTRA;
      this.relief(B.FEEDBACK.BREZEL_RELIEF, reason, this.floatPosition(event.x, event.y - L.FLOAT_ABOVE, reason));
      const note = T.PICKUP_NOTES[event.id];
      if (note) this.safeToast(note, { duration: V.INFO_TOAST_MS });
    } else if (event.kind === 'coffee') {
      this.floatAt(event.x, event.y - L.FLOAT_ABOVE, T.FLOATS.COFFEE, { color: CONFIG.CSS.POSTIT });
      this.safeToast(Ch3Logic.fill(T.TOASTS.COFFEE, { s: B.COFFEE.S }), { duration: V.INFO_TOAST_MS });
    } else if (event.kind === 'repeater') {
      this.floatAt(event.x, event.y - L.FLOAT_ABOVE, T.FLOATS.REPEATER, { color: CONFIG.CSS.POSTIT });
      this.safeToast(Ch3Logic.fill(T.TOASTS.REPEATER, { s: B.REPEATER.S }), { duration: V.HINT_TOAST_MS });
    }
  }

  handleJanitorBump(event) {
    if (!event.isAngry) return;
    const T = Ch3Logic.TEXTS;
    UI.sound('error');
    GameState.addFrustration(Ch3Logic.BALANCE.FEEDBACK.JANITOR_FRUST, T.REASONS.JANITOR);
    const line = this.sim.rng.pick(T.JANITOR_LINES);
    this.floatAt(event.x, event.y - Ch3SignalHuntScene.LAYOUT.FLOAT_ABOVE, line, { color: CONFIG.CSS.HAZARD });
  }

  handleDisconnect(event) {
    const T = Ch3Logic.TEXTS;
    const F = Ch3Logic.BALANCE.FEEDBACK;
    const L = Ch3SignalHuntScene.LAYOUT;
    const player = this.sim.player;
    UI.sound('disconnect');
    const pos = this.floatPosition(player.x, player.y - L.FLOAT_ABOVE, T.REASONS.DISCONNECT, L.FAIL_FONT_SIZE);
    this.fail(T.REASONS.DISCONNECT, {
      frustration: F.DISCONNECT_FRUST, minutes: F.DISCONNECT_MINUTES, stamp: null, x: pos.x, y: pos.y,
    });
    if (event.lostMB >= Ch3SignalHuntScene.VISUALS.MIN_LOST_MB_SHOWN) {
      const text = Ch3Logic.fill(T.FLOATS.LOST_MB, { mb: Ch3Logic.formatMB(event.lostMB) });
      this.floatAt(player.x, player.y + L.FLOAT_BELOW, text, { color: CONFIG.CSS.DANGER, size: L.FONT.FLOAT_SMALL });
    }
    this.updateObjective();
  }

  handleHint(event) {
    const T = Ch3Logic.TEXTS;
    const F = Ch3Logic.BALANCE.FEEDBACK;
    const V = Ch3SignalHuntScene.VISUALS;
    const player = this.sim.player;
    if (event.id === 'hall') {
      this.annoy(F.HALL_FRUST, T.REASONS.HALL, player.x, player.y - Ch3SignalHuntScene.LAYOUT.FLOAT_ABOVE);
      this.safeToast(Ch3Logic.fill(T.HINTS.HALL, { n: (event.clients || 0) + 1 }), { variant: 'warning', duration: V.HINT_TOAST_MS });
    } else if (event.id === 'slow') {
      this.revealHeatmap();
      this.safeToast(T.HINTS.SLOW, { duration: V.HINT_TOAST_MS });
    } else if (event.id === 'deadzone') {
      this.highlightDeadzones();
      this.safeToast(T.HINTS.DEADZONE, { variant: 'warning', duration: V.HINT_TOAST_MS });
    }
  }

  handleExpired(event) {
    const T = Ch3Logic.TEXTS;
    const F = Ch3Logic.BALANCE.FEEDBACK;
    const L = Ch3SignalHuntScene.LAYOUT;
    this.sim.isFrozen = true;
    this.fail(T.REASONS.EXPIRED, {
      frustration: F.EXPIRY_FRUST, minutes: F.EXPIRY_MINUTES, stamp: T.STAMPS.EXPIRED, x: L.MAP_CENTER_X, y: L.STAMP_Y,
    });
    this.revealHeatmap();
    this.time.delayedCall(Ch3SignalHuntScene.VISUALS.EXPIRED_DIALOG_DELAY_MS, () => this.showExpiredDialog(event));
  }

  handleMercy() {
    const T = Ch3Logic.TEXTS;
    const F = Ch3Logic.BALANCE.FEEDBACK;
    const L = Ch3SignalHuntScene.LAYOUT;
    this.sim.isFrozen = true;
    this.fail(T.REASONS.MERCY, {
      frustration: F.EXPIRY_FRUST, minutes: F.EXPIRY_MINUTES, stamp: T.STAMPS.EXPIRED, x: L.MAP_CENTER_X, y: L.STAMP_Y,
    });
    this.time.delayedCall(Ch3SignalHuntScene.VISUALS.EXPIRED_DIALOG_DELAY_MS, () => this.showMercyDialog());
  }

  /**
   * Kapitel geschafft (idempotent). NO_DEADZONE nur bei echtem Abschluss ohne Abbruch.
   * @param {{mercy?: boolean, solvedBy?: string|null}} [opts]
   */
  finishChapter({ mercy = false, solvedBy = null } = {}) {
    if (this.isFinished || !this.sim) return;
    const sim = this.sim;
    this.activeModal = null;
    if (!mercy && sim.disconnects === 0) this.achievement('NO_DEADZONE');
    this.setObjective(Ch3Logic.TEXTS.OBJECTIVES.DONE);
    this.lastObjective = Ch3Logic.TEXTS.OBJECTIVES.DONE;
    if (!mercy) this.safeToast(Ch3Logic.fill(Ch3Logic.TEXTS.TOASTS.DONE, { file: sim.fileName }), { variant: 'success' });
    this.succeed({
      disconnects: sim.disconnects,
      brezels: sim.brezels,
      expiries: sim.expiries,
      mercy,
      solvedBy,
      downloadSeconds: Math.round(sim.t),
    });
  }

  // ===========================================================================
  // Mitleids-Hilfen
  // ===========================================================================

  /** Fachschafts-Heatmap: erwarteter Durchsatz (feste Menschentrauben) + Markierung am besten Platz. */
  revealHeatmap() {
    if (this.isHeatmapVisible) return;
    this.isHeatmapVisible = true;
    const L = Ch3SignalHuntScene.LAYOUT;
    const P = Ch3SignalHuntScene.PALETTE;
    const D = Ch3SignalHuntScene.DEPTHS;
    const V = Ch3SignalHuntScene.VISUALS;
    const level = Ch3Logic.LEVEL;
    const balance = Ch3Logic.BALANCE;
    const staticCrowds = level.crowds.filter((crowd) => !crowd.speed).map((crowd) => ({ id: crowd.id, x: crowd.path[0].x, y: crowd.path[0].y }));
    const loads = Ch3Logic.computeApLoads(staticCrowds, level, balance, []);
    const cell = L.HEATMAP_CELL;
    this.bakeTexture(Ch3SignalHuntScene.TEXTURES.HEATMAP, L.PLAN_W, L.PLAN_H, (g) => {
      for (let x = level.map.x; x < level.map.x + level.map.width; x += cell) {
        for (let y = level.map.y; y < level.map.y + level.map.height; y += cell) {
          const cx = x + cell / 2;
          const cy = y + cell / 2;
          if (level.solids.some((solid) => Ch3Logic.pointInRect(cx, cy, solid))) continue;
          const signal = Ch3Logic.evaluateSignal(cx, cy, { level, balance });
          if (signal.deadzone) continue;
          const ap = Ch3Logic.apById(level, signal.bestApId);
          const rate = ap ? Ch3Logic.downloadRate(ap, signal.bestQuality, loads[ap.id] || 0, balance) : 0;
          // Nur „schnell“ und „langsam“ einfärben: Gelb und Grün verschwimmen auf Nachtblau
          if (rate >= V.HEAT_FAST_RATE) g.fillStyle(P.HEAT_FAST, P.HEAT_FAST_ALPHA);
          else if (rate < balance.SLOW_RATE) g.fillStyle(P.HEAT_SLOW, P.HEAT_SLOW_ALPHA);
          else continue;
          g.fillRect(x, y, cell, cell);
        }
      }
    });
    const heat = this.add.image(0, 0, Ch3SignalHuntScene.TEXTURES.HEATMAP).setOrigin(0).setDepth(D.HEATMAP).setAlpha(0);
    const best = level.bestSpot;
    const mark = this.add.graphics().setDepth(D.ANNOTATION).setAlpha(0);
    mark.lineStyle(2, P.BEST_MARK, 1);
    mark.strokeCircle(best.x, best.y, L.BEST_MARK_RADIUS);
    const note = UI.text(this, best.x, best.y + L.BEST_NOTE_GAP, Ch3Logic.TEXTS.ANNOTATIONS.BEST, {
      font: 'HAND', size: L.FONT.BEST_NOTE, bold: true, color: P.BEST_NOTE, origin: { x: 0.5, y: 0 },
    }).setDepth(D.ANNOTATION).setAlpha(0);
    note.setStroke(CONFIG.CSS.BG_DEEP, 3);
    const mapRight = level.map.x + level.map.width;
    note.x = Math.min(note.x, mapRight - note.width / 2 - V.BEST_NOTE_MARGIN);
    this.tweens.add({ targets: [heat, mark, note], alpha: 1, duration: V.HEATMAP_FADE_MS, ease: 'Quad.easeOut' });
  }

  highlightDeadzones() {
    if (this.isDeadzoneHighlighted) return;
    this.isDeadzoneHighlighted = true;
    const highlight = this.add.graphics().setDepth(Ch3SignalHuntScene.DEPTHS.LINES);
    this.drawDeadzoneHatch(highlight, true);
    (this.deadzoneNotes || []).forEach((note) => ChapterScene.safely(() => FX.pulse(this, note, { scale: 1.25, duration: 160, repeat: 2 })));
  }

  // ===========================================================================
  // Darstellung pro Frame
  // ===========================================================================

  renderFrame(delta) {
    this.renderWorld(delta);
    this.refreshSidebar();
    this.updateObjective();
  }

  renderWorld(delta) {
    const sim = this.sim;
    const P = Ch3SignalHuntScene.PALETTE;
    const V = Ch3SignalHuntScene.VISUALS;
    const player = sim.player;

    // Spielfigur (grau, solange getrennt)
    this.playerView.container.setPosition(player.x, player.y);
    this.playerView.nose.setRotation(player.facing);
    const color = sim.connection.state === 'lost' ? P.PLAYER_LOST : P.PLAYER;
    if (color !== this.playerView.color) {
      this.playerView.color = color;
      this.playerView.body.setFillStyle(color);
    }

    // Menschentrauben und Hausmeister
    sim.crowds.forEach((crowd, index) => this.crowdViews[index].container.setPosition(crowd.x, crowd.y));
    const janitor = this.janitorView;
    if (sim.janitor.x < janitor.lastX - 0.01) janitor.mop.setScale(-1, 1);
    else if (sim.janitor.x > janitor.lastX + 0.01) janitor.mop.setScale(1, 1);
    janitor.lastX = sim.janitor.x;
    janitor.container.setPosition(sim.janitor.x, sim.janitor.y);

    // Nasse Spur (frisch gewischt)
    const wet = Ch3Logic.BALANCE.WET;
    this.wetGraphics.clear();
    sim.wetTrail.forEach((spot) => {
      this.wetGraphics.fillStyle(P.WET, V.WET_ALPHA * (1 - spot.age / wet.DURATION_S) + V.WET_ALPHA_MIN);
      this.wetGraphics.fillCircle(spot.x, spot.y, wet.RADIUS * V.WET_RADIUS_SHARE);
    });

    // Fundsachen (Automat füllt Kaffee nach → kurzes Aufploppen)
    sim.pickups.forEach((item) => {
      const view = this.pickupViews[item.id];
      if (!view || view.isFlying) return;
      if (!item.isTaken && !view.visible) {
        view.setVisible(true).setAlpha(1).setScale(0);
        this.tweens.add({ targets: view, scale: Ch3SignalHuntScene.LAYOUT.PICKUP_SCALE, duration: V.PICKUP_POP_MS, ease: 'Back.easeOut' });
      } else if (item.isTaken && view.visible) {
        view.setVisible(false);
      }
    });

    this.refreshApViews();
    this.drawOverlay();
    this.updateDataDots(delta);
  }

  /** Ringe, LED und Neustart-Hinweis der APs – nur bei Zustandswechsel neu zeichnen. */
  refreshApViews() {
    const sim = this.sim;
    const P = Ch3SignalHuntScene.PALETTE;
    const activeId = sim.connection.state === 'lost' ? null : sim.connection.apId;
    const key = `${activeId}|${sim.offlineIds.join(',')}|${sim.outage.state}`;
    if (key === this.apViewKey) return;
    this.apViewKey = key;
    this.bakeRings(activeId, sim.offlineIds);
    Object.values(this.apViews).forEach((view) => {
      const isOffline = sim.offlineIds.includes(view.ap.id);
      const isWarning = sim.outage.state === 'warning' && sim.outage.apId === view.ap.id;
      let led = P.LED_ON;
      if (isOffline) led = P.LED_OFF;
      else if (isWarning) led = P.LED_WARN;
      if (led !== view.ledColor) {
        view.ledColor = led;
        this.drawApIcon(view.icon, view.ap, led);
      }
      view.reboot.setVisible(isOffline);
      if (!isWarning) {
        this.tweens.killTweensOf(view.icon);
        view.icon.setAlpha(1);
      }
    });
  }

  /** Gnadenfrist-Ring (rot, läuft ab), Anmelde-Ring (gelb, füllt sich), getrennt (rot). */
  drawOverlay() {
    const sim = this.sim;
    const L = Ch3SignalHuntScene.LAYOUT;
    const B = Ch3Logic.BALANCE;
    const g = this.overlayGraphics;
    const player = sim.player;
    const connection = sim.connection;
    const start = -Math.PI / 2;
    g.clear();
    if (sim.phase === 'done') return;
    if (connection.state === 'grace') {
      const share = Phaser.Math.Clamp(connection.timer / B.GRACE_S, 0, 1);
      g.lineStyle(3, CONFIG.COLORS.DHBW_RED, 1);
      g.beginPath();
      g.arc(player.x, player.y, L.GRACE_RING_RADIUS, start, start + share * Math.PI * 2, false);
      g.strokePath();
    } else if (connection.state === 'roaming' || connection.state === 'reconnecting') {
      const total = connection.state === 'roaming' ? B.ROAM_S : B.RECONNECT_S;
      const share = 1 - Phaser.Math.Clamp(connection.timer / total, 0, 1);
      g.lineStyle(2, CONFIG.COLORS.HAZARD, 0.95);
      g.beginPath();
      g.arc(player.x, player.y, L.GRACE_RING_RADIUS, start, start + Math.max(0.05, share) * Math.PI * 2, false);
      g.strokePath();
    } else if (connection.state === 'lost') {
      g.lineStyle(2, CONFIG.COLORS.DHBW_RED, 0.7);
      g.strokeCircle(player.x, player.y, L.GRACE_RING_RADIUS);
    }
  }

  /** Datenpunkte fliegen vom AP zur Spielfigur – je schneller der Download, desto mehr. */
  updateDataDots(delta) {
    const sim = this.sim;
    const V = Ch3SignalHuntScene.VISUALS;
    const ap = sim.connection.apId ? Ch3Logic.apById(Ch3Logic.LEVEL, sim.connection.apId) : null;
    if (ap && sim.rate > 0 && delta > 0) {
      this.dotBudget += (sim.rate * delta) / 1000;
      while (this.dotBudget >= V.DOT_MB) {
        this.dotBudget -= V.DOT_MB;
        const dot = this.dotPool.pop();
        if (!dot) {
          this.dotBudget = 0;
          break;
        }
        dot.setPosition(ap.x, ap.y).setAlpha(V.DOT_ALPHA_START).setVisible(true);
        this.activeDots.push({ obj: dot, fromX: ap.x, fromY: ap.y, progress: 0 });
      }
    } else {
      this.dotBudget = 0;
    }
    const player = sim.player;
    for (let i = this.activeDots.length - 1; i >= 0; i--) {
      const dot = this.activeDots[i];
      dot.progress += delta / V.DOT_MS;
      if (dot.progress >= 1) {
        dot.obj.setVisible(false);
        this.dotPool.push(dot.obj);
        this.activeDots.splice(i, 1);
        continue;
      }
      const eased = dot.progress * dot.progress;
      dot.obj.setPosition(dot.fromX + (player.x - dot.fromX) * eased, dot.fromY + (player.y - dot.fromY) * eased);
      dot.obj.setAlpha(V.DOT_ALPHA_START - V.DOT_ALPHA_FADE * dot.progress);
    }
  }

  refreshSidebar() {
    const sim = this.sim;
    const T = Ch3Logic.TEXTS;
    const B = Ch3Logic.BALANCE;
    const V = Ch3SignalHuntScene.VISUALS;
    const L = Ch3SignalHuntScene.LAYOUT;
    const innerWidth = L.CARD.W - 2 * L.CARD.PAD;

    // WLAN-Balken
    const bars = this.displayBars();
    if (this.uiCache.bars !== bars) {
      this.uiCache.bars = bars;
      if (this.wifiIcon) {
        this.wifiIcon.setTexture(`icon-wifi-${bars}`).setDisplaySize(L.CARD_ICON_SIZE, L.CARD_ICON_SIZE);
      } else if (this.wifiFallback) {
        this.drawWifiFallback(bars);
      }
    }

    // Status, Spinner, AP
    const status = this.statusLine();
    this.setTextCached('status', this.statusText, status.text, innerWidth);
    if (this.uiCache.statusColor !== status.color) {
      this.uiCache.statusColor = status.color;
      this.statusText.setColor(status.color);
    }
    const isBusy = sim.phase === 'stalling' || (sim.phase === 'running' && ['roaming', 'reconnecting'].includes(sim.connection.state));
    if (this.uiCache.isBusy !== isBusy) {
      this.uiCache.isBusy = isBusy;
      if (isBusy) this.spinner.start();
      else this.spinner.stop();
    }
    // Detailzeile: Access Point und Geräte – oder die Restsekunden der Gnadenfrist
    const devices = sim.load + 1; // inklusive dir
    let detail = sim.connection.apId
      ? Ch3Logic.fill(devices === 1 ? T.STATUS.DEVICE_SINGLE : T.STATUS.DEVICES, { ap: this.apName(sim.connection.apId), n: devices })
      : T.STATUS.NO_AP;
    let detailColor = CONFIG.CSS.TEXT_MUTED;
    if (status.detail) {
      detail = status.detail;
      detailColor = status.color;
    }
    this.setTextCached('ap', this.apText, detail, innerWidth);
    if (this.uiCache.detailColor !== detailColor) {
      this.uiCache.detailColor = detailColor;
      this.apText.setColor(detailColor);
    }

    // Download
    const progress = sim.progressMB / sim.sizeMB;
    if (this.uiCache.progress === undefined || Math.abs(progress - this.uiCache.progress) > V.PROGRESS_EPSILON || progress >= 1) {
      this.uiCache.progress = progress;
      this.progressBar.setValue(progress, false);
    }
    this.setTextCached('mb', this.mbText, Ch3Logic.fill(T.SIDEBAR.DOWNLOAD_OF, {
      done: Ch3Logic.formatNumber(sim.progressMB, 1), size: Ch3Logic.formatSize(sim.sizeMB),
    }));
    this.setTextCached('rate', this.rateText, sim.rate > 0 ? Ch3Logic.formatRate(sim.rate) : T.SIDEBAR.RATE_NONE);
    // Kriechender Download (unter SLOW_RATE, Frust tröpfelt): Durchsatz in Rot
    const rateColor = sim.rate > 0 && sim.rate < B.SLOW_RATE ? CONFIG.CSS.DANGER : CONFIG.CSS.TEXT;
    if (this.uiCache.rateColor !== rateColor) {
      this.uiCache.rateColor = rateColor;
      this.rateText.setColor(rateColor);
    }
    let eta = Ch3Logic.formatEta(sim.rate > 0 ? (sim.sizeMB - sim.progressMB) / sim.rate : Infinity);
    if (sim.phase === 'ready') eta = Ch3Logic.formatEta(sim.potentialRate > 0 ? sim.sizeMB / sim.potentialRate : Infinity);
    if (sim.phase === 'stalling') eta = T.SIDEBAR.STALLING_ETA;
    if (sim.phase === 'done') eta = T.SIDEBAR.DONE_ETA;
    this.setTextCached('eta', this.etaText, eta, innerWidth);

    // Countdown (rot und tickend, wenn es knapp wird)
    const seconds = Math.max(0, Math.ceil(sim.countdownS - 1e-9));
    this.setTextCached('countdown', this.countdownText, Ch3Logic.formatCountdown(sim.countdownS));
    const isUrgent = sim.phase === 'running' && seconds <= V.URGENT_S;
    const countdownColor = isUrgent ? CONFIG.CSS.DANGER : CONFIG.CSS.INK;
    if (this.uiCache.countdownColor !== countdownColor) {
      this.uiCache.countdownColor = countdownColor;
      this.countdownText.setColor(countdownColor);
    }
    if (this.lastCountdownSecond !== seconds) {
      if (isUrgent && this.lastCountdownSecond !== null && !sim.isFrozen) {
        ChapterScene.safely(() => FX.pulse(this, this.countdownText, { scale: 1.12, duration: 110, repeat: 0 }));
        if (seconds <= V.TICK_SOUND_S) UI.sound('tick');
      }
      this.lastCountdownSecond = seconds;
    }

    // Fundsachen
    if (this.uiCache.brezels !== sim.brezels) {
      this.uiCache.brezels = sim.brezels;
      this.brezelIcons.forEach((icon, index) => icon.setAlpha(index < sim.brezels ? 1 : L.NOTE.ICON_EMPTY_ALPHA));
      const extra = sim.brezels - B.BREZEL_GOAL;
      this.brezelCountText.setText(extra > 0 ? Ch3Logic.fill(T.SIDEBAR.BREZEL_EXTRA, { n: extra }) : '');
    }
    this.setTextCached('coffee', this.coffeeText, this.effectLine(T.SIDEBAR.COFFEE, sim.effects.coffeeS));
    this.setTextCached('repeater', this.repeaterText, this.effectLine(T.SIDEBAR.REPEATER, sim.effects.repeaterS));
  }

  /** Aufgabe im HUD je nach Zustand (nur bei Änderung setzen). */
  updateObjective() {
    if (!this.sim || this.isFinished) return;
    const sim = this.sim;
    const O = Ch3Logic.TEXTS.OBJECTIVES;
    let objective = O.RUNNING;
    if (sim.phase === 'ready') objective = O.READY;
    else if (sim.phase === 'done') objective = O.DONE;
    else if (sim.phase === 'stalling') objective = O.STALL;
    else if (sim.connection.state === 'lost') objective = O.DISCONNECTED;
    else if (sim.connection.state === 'reconnecting') objective = O.RECONNECTING;
    else if (sim.outage.state === 'warning' || sim.outage.state === 'active') objective = O.OUTAGE;
    else if (sim.expiries > 0) objective = O.RETRY[Math.min(sim.expiries, O.RETRY.length) - 1];
    if (objective === this.lastObjective) return;
    this.lastObjective = objective;
    this.setObjective(objective);
  }

  // ===========================================================================
  // Kleine Helfer
  // ===========================================================================

  /** Balken der Anzeige: 0, solange keine Verbindung besteht. */
  displayBars() {
    const state = this.sim.connection.state;
    if (state === 'grace' || state === 'lost') return 0;
    return Ch3Logic.barsFor(this.sim.quality);
  }

  /**
   * Statuszeile der Android-Karte: { text, color, detail? }. `detail` ersetzt die Zeile
   * „AP · Geräte“ (in derselben Farbe), z. B. mit den Restsekunden der Gnadenfrist.
   */
  statusLine() {
    const sim = this.sim;
    const S = Ch3Logic.TEXTS.STATUS;
    const C = CONFIG.CSS;
    const connection = sim.connection;
    if (sim.phase === 'ready') return { text: S.READY, color: C.TEXT_MUTED };
    if (sim.phase === 'done') return { text: S.DONE, color: C.SUCCESS };
    if (sim.phase === 'stalling') return { text: S.STALLING, color: C.WARNING };
    switch (connection.state) {
      case 'roaming':
        return { text: S.ROAMING, color: C.WARNING };
      case 'grace':
        return {
          text: S.GRACE,
          detail: Ch3Logic.fill(S.GRACE_DETAIL, { s: Ch3Logic.formatNumber(Math.max(0, connection.timer), 1) }),
          color: C.DANGER,
        };
      case 'lost':
        return { text: S.LOST, color: C.DANGER };
      case 'reconnecting': {
        const share = 1 - Phaser.Math.Clamp(connection.timer / Ch3Logic.BALANCE.RECONNECT_S, 0, 1);
        const index = Math.min(S.RECONNECTING.length - 1, Math.floor(share * S.RECONNECTING.length));
        return { text: S.RECONNECTING[index], color: C.WARNING };
      }
      default:
        if (sim.outage.state === 'warning' && sim.outage.apId === connection.apId) {
          return { text: Ch3Logic.fill(S.OUTAGE_WARNING, { ap: this.apName(connection.apId), s: Math.ceil(sim.outage.timer) }), color: C.WARNING };
        }
        return { text: S.CONNECTED, color: C.SUCCESS };
    }
  }

  effectLine(label, seconds) {
    const S = Ch3Logic.TEXTS.SIDEBAR;
    const value = seconds > 0 ? Ch3Logic.fill(S.SECONDS, { s: Math.ceil(seconds) }) : S.NONE;
    return `${label}: ${value}`;
  }

  apName(apId) {
    const ap = Ch3Logic.apById(Ch3Logic.LEVEL, apId);
    return ap ? ap.name : '';
  }

  /** Eigene WLAN-Balken, falls die gemeinsamen Texturen fehlen. */
  drawWifiFallback(bars) {
    const g = this.wifiFallback;
    const { x, y } = this.wifiFallbackPos;
    g.clear();
    for (let i = 0; i < 4; i++) {
      g.fillStyle(CONFIG.COLORS.TEXT, i < bars ? 1 : 0.2);
      g.fillRect(x - 10 + i * 6, y + 8 - (i + 1) * 4, 4, (i + 1) * 4);
    }
  }

  /** Setzt Text nur bei Änderung (optional mit „…“ auf maxWidth gekürzt). */
  setTextCached(key, textObject, value, maxWidth = null) {
    if (this.uiCache[key] === value) return;
    this.uiCache[key] = value;
    if (maxWidth) Ch3SignalHuntScene.fitText(textObject, value, maxWidth);
    else textObject.setText(value);
  }

  /** Kurzer AP-Puls beim Roaming. */
  pulseAp(apId) {
    const view = this.apViews[apId];
    if (view) ChapterScene.safely(() => FX.pulse(this, view.label, { scale: 1.2, duration: 120, repeat: 0 }));
  }

  /** LED blinkt während der Ankündigung des Wartungsfensters. */
  blinkAp(apId, seconds) {
    const view = this.apViews[apId];
    if (!view) return;
    const V = Ch3SignalHuntScene.VISUALS;
    this.tweens.killTweensOf(view.icon);
    this.tweens.add({
      targets: view.icon,
      alpha: 0.25,
      duration: V.BLINK_MS,
      yoyo: true,
      repeat: Math.max(0, Math.round((seconds * 1000) / (2 * V.BLINK_MS)) - 1),
      onComplete: () => view.icon.setAlpha(1),
    });
  }

  /** Aufgesammeltes Objekt fliegt kurz hoch und verblasst. */
  flyAway(view) {
    if (!view) return;
    const V = Ch3SignalHuntScene.VISUALS;
    view.isFlying = true;
    this.tweens.add({
      targets: view,
      y: view.y - V.PICKUP_FLY_RISE,
      alpha: 0,
      scale: view.scale * 1.4,
      duration: V.PICKUP_FLY_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        view.isFlying = false;
        view.setVisible(false).setAlpha(1).setScale(Ch3SignalHuntScene.LAYOUT.PICKUP_SCALE);
        view.y += V.PICKUP_FLY_RISE;
      },
    });
  }

  /**
   * Ladebalken kriecht: +Frust, und die (dann rote) Durchsatz-Anzeige der Karte pulsiert
   * im selben Moment wie die Frust-Anzeige – so ist der Grund sichtbar, ohne Textgewitter.
   */
  handleTrickle(event) {
    GameState.addFrustration(event.amount, Ch3Logic.TEXTS.REASONS.TRICKLE);
    const V = Ch3SignalHuntScene.VISUALS;
    ChapterScene.safely(() => FX.pulse(this, this.rateText, { scale: V.TRICKLE_PULSE_SCALE, duration: V.TRICKLE_PULSE_MS, repeat: 0 }));
  }

  /** Frust ohne Fehlversuch (Gags wie „Hängt bei 99 %“) mit rotem Schwebetext. */
  annoy(amount, reason, x, y) {
    GameState.addFrustration(amount, reason);
    this.floatAt(x, y, `${reason} · +${amount} % Frust`, { color: CONFIG.CSS.DANGER, size: Ch3SignalHuntScene.LAYOUT.FONT.FLOAT_ANNOY });
  }

  /**
   * Position für Schwebetexte: horizontal im Lageplan, vertikal so tief, dass der Text
   * auch nach dem Aufsteigen (FLOAT_RISE) noch unter der HUD-Leiste sichtbar bleibt.
   */
  floatPosition(x, y, text, size = Ch3SignalHuntScene.VISUALS.FLOAT_SIZE) {
    const L = Ch3SignalHuntScene.LAYOUT;
    const map = Ch3Logic.LEVEL.map;
    const half = Math.min(L.FLOAT_MAX_HALF, (String(text).length * size * L.FLOAT_CHAR_WIDTH) / 2);
    const minX = map.x + half + L.FLOAT_MARGIN;
    const maxX = Math.max(minX, map.x + map.width - half - L.FLOAT_MARGIN);
    const minY = map.y + L.FLOAT_RISE + size + L.FLOAT_MARGIN;
    return { x: Phaser.Math.Clamp(x, minX, maxX), y: Math.max(y, minY) };
  }

  floatAt(x, y, text, { color = CONFIG.CSS.TEXT_INVERSE, size = Ch3SignalHuntScene.VISUALS.FLOAT_SIZE, bold = true } = {}) {
    const pos = this.floatPosition(x, y, text, size);
    const rise = Ch3SignalHuntScene.LAYOUT.FLOAT_RISE;
    ChapterScene.safely(() => FX.floatText(this, pos.x, pos.y, text, { color, size, bold, rise }));
  }

  safeToast(text, opts) {
    ChapterScene.safely(() => this.toast(text, opts));
  }

  /** Kürzt einen Text mit „…“, bis er in maxWidth passt. */
  static fitText(textObject, fullText, maxWidth) {
    textObject.setText(fullText);
    if (textObject.width <= maxWidth) return;
    let text = String(fullText);
    while (text.length > 1 && textObject.width > maxWidth) {
      text = text.slice(0, -1);
      textObject.setText(`${text.trimEnd()}…`);
    }
  }

  // ===========================================================================
  // Test- und Debug-Schnittstelle
  // ===========================================================================

  /** Löst das Kapitel wie ein perfekter Spieler: zum besten Platz, Download fertig. */
  debugSolve() {
    if (this.isFinished || !this.sim) return;
    if (UI.Modal && typeof UI.Modal.closeAll === 'function') UI.Modal.closeAll(this);
    if (this.isFinished) return; // z. B. Gnaden-Dialog hat beim Schließen schon abgeschlossen
    Ch3Logic.solveSim(this.sim);
    this.renderFrame(0);
    this.finishChapter({ solvedBy: 'debug' });
  }

  /** @returns {object} Zustand für Tests (Schritt, Position, Verbindung, Download …) */
  getDebugInfo() {
    const base = super.getDebugInfo();
    if (!this.sim) return { ...base, step: 'init' };
    const snapshot = Ch3Logic.getSnapshot(this.sim);
    return {
      ...base,
      ...snapshot,
      simPhase: snapshot.phase,
      step: this.currentStep(),
      isModalOpen: Boolean(this.activeModal && this.activeModal.isOpen && this.activeModal.isOpen()),
      isHeatmapVisible: this.isHeatmapVisible,
      isDeadzoneHighlighted: this.isDeadzoneHighlighted,
      bestSpot: { ...Ch3Logic.LEVEL.bestSpot },
    };
  }

  /** 'intro' (Startdialog) | 'dialog' | 'download' | 'stall' | 'done' */
  currentStep() {
    const sim = this.sim;
    if (this.isFinished || sim.phase === 'done') return 'done';
    if (sim.phase === 'ready') return 'intro';
    if (sim.isFrozen) return 'dialog';
    if (sim.phase === 'stalling') return 'stall';
    return 'download';
  }
}
