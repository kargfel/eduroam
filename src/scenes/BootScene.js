/**
 * BootScene.js – Startszene (Key 'Boot').
 *
 * Erzeugt die gemeinsamen Texturen, initialisiert Audio (Freischaltung bei der ersten
 * Nutzergeste), setzt den RNG-Seed aus der URL und zeigt eine kurze „Verbinde …“-
 * Animation (≤ 1,2 s). Danach geht es ins Menü – oder bei ?chapter=N direkt ins Spiel.
 *
 * Global: BootScene.
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, RUNTIME, UI, Textures, SFX, RNG.
 */

class BootScene extends Phaser.Scene {
  /** Ablauf und Layout der Verbinde-Animation. */
  static ANIMATION = Object.freeze({
    STEP_MS: 170,        // pro WLAN-Bogen
    LEVELS: 4,           // Bögen 1–4 nacheinander
    FINAL_HOLD_MS: 300,  // „Authentifiziere …“ – 4 × 170 + 300 = 980 ms ≤ 1200 ms
    CENTER_X: 400,
    CENTER_Y: 285,
    ARC_RADII: [22, 40, 58, 76],
    ARC_WIDTH: 9,
    DOT_RADIUS: 7,
    ARC_SPAN: Math.PI / 2, // Öffnungswinkel des WLAN-Fächers (90°)
    DIM_ALPHA: 0.18,
    TEXT_Y: 330,
  });

  /** Globals, ohne die das Spiel nicht laufen kann (Meldung hilft bei der Integration). */
  static REQUIRED_GLOBALS = Object.freeze([
    'CONFIG', 'CAMPUS', 'RNG', 'EVENTS', 'Storage', 'Scoring', 'GameState', 'SFX', 'UI', 'FX', 'Textures',
  ]);

  constructor() {
    super({ key: 'Boot' });
  }

  create() {
    BootScene.reportMissingGlobals();
    if (typeof Textures !== 'undefined') Textures.generateAll(this);
    if (typeof SFX !== 'undefined') SFX.init();
    BootScene.installAudioUnlock();
    if (RUNTIME.seed !== null && RUNTIME.seed !== undefined && typeof RNG !== 'undefined') RNG.seed(RUNTIME.seed);

    this.cameras.main.setBackgroundColor(CONFIG.CSS.BG);

    if (RUNTIME.startChapter) {
      // Direkteinstieg (Tests/Präsentation): keine Animation
      this.scene.start('Game', { startChapter: RUNTIME.startChapter });
      return;
    }
    this.playConnectAnimation(() => this.scene.start('Menu'));
  }

  /**
   * WLAN-Fächer füllt sich Bogen für Bogen, dann „Authentifiziere …“ und weiter.
   * @param {Function} onDone
   */
  playConnectAnimation(onDone) {
    const A = BootScene.ANIMATION;
    const graphics = this.add.graphics();
    const label = UI.text(this, A.CENTER_X, A.TEXT_Y, 'Verbinde mit eduroam …', {
      size: 18,
      color: CONFIG.CSS.TEXT_INVERSE,
      origin: { x: 0.5, y: 0 },
    });
    let level = 0;
    BootScene.drawWifiFan(graphics, A.CENTER_X, A.CENTER_Y, level);

    this.time.addEvent({
      delay: A.STEP_MS,
      repeat: A.LEVELS - 1,
      callback: () => {
        level += 1;
        BootScene.drawWifiFan(graphics, A.CENTER_X, A.CENTER_Y, level);
        if (level === A.LEVELS) {
          label.setText('Authentifiziere …');
          this.time.delayedCall(A.FINAL_HOLD_MS, onDone);
        }
      },
    });
  }

  /**
   * Zeichnet einen WLAN-Fächer (Punkt + Bögen), Bögen bis `level` hell, der Rest blass.
   * @param {Phaser.GameObjects.Graphics} graphics
   * @param {number} cx Mittelpunkt (Punkt unten)
   * @param {number} cy
   * @param {number} level 0–4
   * @param {object} [opts]
   * @param {number} [opts.color=CONFIG.COLORS.WHITE]
   */
  static drawWifiFan(graphics, cx, cy, level, { color = CONFIG.COLORS.WHITE } = {}) {
    const A = BootScene.ANIMATION;
    const start = -Math.PI / 2 - A.ARC_SPAN / 2;
    const end = -Math.PI / 2 + A.ARC_SPAN / 2;
    graphics.clear();
    graphics.fillStyle(color, 1);
    graphics.fillCircle(cx, cy, A.DOT_RADIUS);
    A.ARC_RADII.forEach((radius, index) => {
      graphics.lineStyle(A.ARC_WIDTH, color, index < level ? 1 : A.DIM_ALPHA);
      graphics.beginPath();
      graphics.arc(cx, cy, radius, start, end, false);
      graphics.strokePath();
    });
  }

  /**
   * Schaltet WebAudio bei der ersten Nutzergeste frei (Autoplay-Regeln der Browser).
   * DOM-Listener auf window, weil die erste Geste meist erst im Menü passiert.
   */
  static installAudioUnlock() {
    if (BootScene.isAudioUnlockInstalled || typeof window === 'undefined') return;
    BootScene.isAudioUnlockInstalled = true;
    const gestures = ['pointerdown', 'keydown', 'touchend'];
    const unlock = () => {
      gestures.forEach((name) => window.removeEventListener(name, unlock, true));
      UI.sound('unlock');
    };
    gestures.forEach((name) => window.addEventListener(name, unlock, true));
  }

  /** Meldet fehlende Kern-Module deutlich in der Konsole (statt kryptischer Folgefehler). */
  static reportMissingGlobals() {
    const availability = BootScene.getGlobalAvailability();
    const missing = BootScene.REQUIRED_GLOBALS.filter((name) => availability[name] !== true);
    if (missing.length) console.error(`[Boot] Fehlende Module: ${missing.join(', ')} – Spiel läuft nur eingeschränkt.`);
  }

  /**
   * Globale const/class-Bindungen hängen nicht an window, deshalb hier direkt per typeof.
   * Bewusst ohne eval/Function: Die Content-Security-Policy des Servers verbietet das.
   * @returns {Object<string, boolean>} Modulname → geladen?
   */
  static getGlobalAvailability() {
    return {
      CONFIG: typeof CONFIG !== 'undefined',
      CAMPUS: typeof CAMPUS !== 'undefined',
      RNG: typeof RNG !== 'undefined',
      EVENTS: typeof EVENTS !== 'undefined',
      Storage: typeof Storage !== 'undefined',
      Scoring: typeof Scoring !== 'undefined',
      GameState: typeof GameState !== 'undefined',
      SFX: typeof SFX !== 'undefined',
      UI: typeof UI !== 'undefined',
      FX: typeof FX !== 'undefined',
      Textures: typeof Textures !== 'undefined',
    };
  }
}

/** Wird true, sobald die Audio-Freischaltung registriert ist (einmal pro Seite). */
BootScene.isAudioUnlockInstalled = false;
