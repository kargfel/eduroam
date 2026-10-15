/**
 * ChapterScene.js – Basisklasse aller Kapitel-Szenen (Vertrag 5.12).
 *
 * Kapitel erben von ChapterScene und bekommen einheitliche Bausteine: Spielfläche,
 * Aufgabe im HUD, Fehlversuch/Zeitstrafe/Erleichterung mit passenden Effekten,
 * Kapitelabschluss sowie GameState- und Tastatur-Listener, die beim Stoppen der
 * Szene automatisch abgemeldet werden.
 *
 * Kapitel stoppen sich nie selbst: Den Szenenwechsel übernimmt GameScene nach
 * CHAPTER_COMPLETE bzw. RAGE_QUIT. Kapitel können jederzeit pausiert oder gestoppt
 * werden – deshalb nur Szenen-Zeit verwenden (this.time, Tweens, update).
 *
 * Grundsatz: Spiellogik (GameState) geht vor Effekten. Effekte laufen gekapselt –
 * ein Fehler in einem Effekt wird gemeldet, verhindert aber nie die Buchung eines
 * Fehlversuchs oder den Kapitelabschluss.
 *
 * Global: ChapterScene.
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, GameState, UI (text, sound, toast, Modal), FX.
 */

class ChapterScene extends Phaser.Scene {
  /** Positionen der Rückmelde-Effekte (px). */
  static FEEDBACK = Object.freeze({
    REASON_OFFSET_Y: 62, // Fehlertext erscheint so weit unter dem Stempel
    TEXT_MARGIN: 40,     // Mindestabstand der Floating-Texte zum Rand der Spielfläche
    DEFAULT_X: 400,
    DEFAULT_Y: 300,
  });

  /**
   * @param {number} chapterId Kapitelnummer 1–5 (Index in CONFIG.CHAPTERS + 1)
   */
  constructor(chapterId) {
    super({ key: CONFIG.CHAPTERS[chapterId - 1].key });
    /** @type {number} Kapitelnummer 1–5 */
    this.chapterId = chapterId;
  }

  /** CONFIG.CHAPTERS-Eintrag dieses Kapitels ({ id, key, title, short, intro }). */
  get chapter() {
    return CONFIG.CHAPTERS[this.chapterId - 1];
  }

  /**
   * MUSS als Erstes in create() aufgerufen werden. Setzt die Kapitel-Felder zurück
   * (auch nach scene.restart()), zeichnet den Hintergrund über CONFIG.PLAY_AREA und
   * meldet das Kapitel bei GameState an.
   * @param {object} [opts]
   * @param {number|null} [opts.background=CONFIG.COLORS.BG] Hintergrundfarbe; null = keiner
   */
  initChapter({ background = CONFIG.COLORS.BG } = {}) {
    this.area = CONFIG.PLAY_AREA;
    this.isFinished = false;
    this.chapterFails = 0;
    this.chapterStartMinutes = GameState.getClockMinutes();
    this.ensureCleanupHook();

    if (background !== null && background !== undefined) {
      const { x, y, width, height } = this.area;
      this.backgroundRect = this.add
        .rectangle(x, y, width, height, background)
        .setOrigin(0)
        .setDepth(CONFIG.DEPTH.BACKGROUND);
    }
    GameState.setCurrentChapter(this.chapterId);
  }

  /**
   * Setzt die aktuelle Aufgabe (HUD zeigt „Aufgabe: …“).
   * @param {string} text
   */
  setObjective(text) {
    GameState.setObjective(text);
  }

  /**
   * Meldet einen GameState-Listener an, der beim Stoppen der Szene automatisch
   * wieder abgemeldet wird. Der Handler läuft im Kontext der Szene.
   * @param {string} event Wert aus EVENTS
   * @param {Function} handler
   * @returns {this}
   */
  listen(event, handler) {
    this.ensureCleanupHook();
    GameState.on(event, handler, this);
    this.addCleanup(() => GameState.off(event, handler, this));
    return this;
  }

  /**
   * Meldet einen keydown-Listener an (Handler bekommt das KeyboardEvent), mit Auto-Cleanup.
   * Läuft nur, solange die Szene aktiv ist (pausierte Szenen bekommen keine Tasten).
   * Jedes DOM-Event erreicht den Handler genau einmal: Phaser 3.90 meldet bei mehreren
   * Tastatur-Events im selben Frame frühere keydowns erneut (gemessen: 3 Tasten → 11 Aufrufe).
   * @param {(event: KeyboardEvent) => void} handler
   * @returns {this}
   */
  onKey(handler) {
    this.ensureCleanupHook();
    const keyboard = this.input && this.input.keyboard;
    if (!keyboard || typeof handler !== 'function') return this;
    const listener = ChapterScene.dedupeKeyHandler(handler, this);
    keyboard.on('keydown', listener, this);
    this.addCleanup(() => keyboard.off('keydown', listener, this));
    return this;
  }

  /**
   * Registriert eine eigene Aufräum-Funktion für shutdown (z. B. DOM-Listener).
   * @param {Function} task
   * @returns {this}
   */
  addCleanup(task) {
    this.ensureCleanupHook();
    this._cleanupTasks.push(task);
    return this;
  }

  /**
   * Fehlversuch: Klang, Wackeln, Stempel und Begründung als Floating-Text; bucht den
   * Fehlversuch, Frust und optional Zeitstrafe in GameState. Nach succeed() ignoriert.
   * @param {string} reason kurze Begründung (wird angezeigt)
   * @param {object} [opts]
   * @param {number} [opts.frustration=CONFIG.FRUSTRATION.MEDIUM]
   * @param {number} [opts.minutes=0] Zeitstrafe in Spielminuten
   * @param {number} [opts.x=400] Position der Effekte
   * @param {number} [opts.y=300]
   * @param {boolean} [opts.shake=true]
   * @param {string|null} [opts.stamp='ABGELEHNT'] null = kein Stempel (für Kleinkram)
   */
  fail(reason, {
    frustration = CONFIG.FRUSTRATION.MEDIUM,
    minutes = 0,
    x = ChapterScene.FEEDBACK.DEFAULT_X,
    y = ChapterScene.FEEDBACK.DEFAULT_Y,
    shake = true,
    stamp = 'ABGELEHNT',
  } = {}) {
    if (this.isFinished) return;
    const text = minutes > 0 ? `${reason} · +${minutes} min` : reason;

    // Effekte (gekapselt) …
    UI.sound('error');
    ChapterScene.safely(() => {
      if (shake) FX.shake(this);
    });
    let stampY = y;
    ChapterScene.safely(() => {
      // FX.stamp hält den Stempel im Bild – die tatsächliche Position zählt
      const stampObject = stamp ? FX.stamp(this, stamp, { x, y }) : null;
      if (stampObject) stampY = stampObject.y;
    });
    ChapterScene.safely(() => {
      const pos = this.clampToArea(x, stamp ? this.reasonYBesideStamp(stampY) : y);
      FX.floatText(this, pos.x, pos.y, text);
    });

    // … dann die Buchung. addFrustration kann synchron RAGE_QUIT auslösen.
    this.chapterFails += 1;
    GameState.recordFail(this.chapterId, reason);
    if (frustration > 0) GameState.addFrustration(frustration, reason);
    if (minutes > 0) GameState.advanceClock(minutes, reason);
  }

  /**
   * Nur Zeitstrafe (ohne Fehlversuch), Floating-Text „+5 min · reason“.
   * @param {number} minutes
   * @param {string} reason
   * @param {{x?: number, y?: number}} [pos]
   */
  penalty(minutes, reason, { x = ChapterScene.FEEDBACK.DEFAULT_X, y = ChapterScene.FEEDBACK.DEFAULT_Y } = {}) {
    if (!(minutes > 0)) return;
    UI.sound('tick');
    ChapterScene.safely(() => {
      const pos = this.clampToArea(x, y);
      FX.floatText(this, pos.x, pos.y, `+${minutes} min · ${reason}`, { color: CONFIG.CSS.HAZARD });
    });
    GameState.advanceClock(minutes, reason);
  }

  /**
   * Senkt den Frust, grüner Floating-Text.
   * @param {number} amount Prozentpunkte
   * @param {string} reason
   * @param {{x?: number, y?: number}} [pos]
   */
  relief(amount, reason, { x = ChapterScene.FEEDBACK.DEFAULT_X, y = ChapterScene.FEEDBACK.DEFAULT_Y } = {}) {
    if (!(amount > 0)) return;
    ChapterScene.safely(() => {
      const pos = this.clampToArea(x, y);
      FX.floatText(this, pos.x, pos.y, `${reason} · −${amount} % Frust`, { color: CONFIG.CSS.SUCCESS });
    });
    GameState.reduceFrustration(amount, reason);
  }

  /**
   * Kapitel geschafft (idempotent): Jubel-Effekt, etwas Frust-Abbau und nach
   * CONFIG.TIMING.CHAPTER_END_DELAY recordSuccess + completeChapter. Den Wechsel
   * zum nächsten Kapitel macht GameScene.
   * @param {object} [stats] zusätzliche Kapitel-Statistik (landet in chapterStats)
   * @returns {boolean} false, wenn das Kapitel schon abgeschlossen war
   */
  succeed(stats = {}) {
    if (this.isFinished) return false;
    this.isFinished = true;
    UI.sound('success');
    ChapterScene.safely(() => FX.confetti(this));
    GameState.reduceFrustration(CONFIG.FRUSTRATION.SMALL, 'Geschafft');

    this.time.delayedCall(CONFIG.TIMING.CHAPTER_END_DELAY, () => {
      const minutesSpent = Math.max(0, Math.round(GameState.getClockMinutes() - this.chapterStartMinutes));
      GameState.recordSuccess(this.chapterId);
      GameState.completeChapter(this.chapterId, { fails: this.chapterFails, minutesSpent, ...stats });
    });
    return true;
  }

  /**
   * Schaltet einen Erfolg frei (einmal pro Lauf; GameState kümmert sich um Storage + Event).
   * @param {string} id Schlüssel aus CONFIG.ACHIEVEMENTS
   */
  achievement(id) {
    return GameState.unlockAchievement(id);
  }

  /**
   * Android-Toast in dieser Szene.
   * @param {string} text
   * @param {object} [opts] siehe UI.toast
   */
  toast(text, opts) {
    return UI.toast(this, text, opts);
  }

  /**
   * Öffnet einen Systemdialog in dieser Szene.
   * @param {object} opts siehe UI.Modal
   * @returns {UI.Modal}
   */
  showModal(opts) {
    return new UI.Modal(this, opts);
  }

  /**
   * MUSS überschrieben werden: löst das Kapitel programmatisch wie ein perfekter
   * Spieler und endet mit this.succeed(). Die Basis-Version warnt und schließt ab,
   * damit ein Lauf nie hängen bleibt.
   */
  debugSolve() {
    console.warn(`[ChapterScene] ${this.sys.settings.key}: debugSolve() nicht überschrieben – schließe direkt ab.`);
    this.succeed({ solvedBy: 'debug-fallback' });
  }

  /**
   * Zustand für Tests (optional überschreiben, z. B. { step }).
   * @returns {object}
   */
  getDebugInfo() {
    return { chapterId: this.chapterId, isFinished: Boolean(this.isFinished), chapterFails: this.chapterFails || 0 };
  }

  // ---------------------------------------------------------------------------
  // Interna
  // ---------------------------------------------------------------------------

  /** Stellt sicher, dass die Aufräumliste existiert und beim shutdown/destroy abgearbeitet wird. */
  ensureCleanupHook() {
    if (!this._cleanupTasks) this._cleanupTasks = [];
    if (this._isCleanupHooked) return;
    this._isCleanupHooked = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.runCleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.runCleanup, this);
  }

  /** Arbeitet alle Aufräum-Aufgaben ab (Listener abmelden usw.). */
  runCleanup() {
    const tasks = this._cleanupTasks || [];
    this._cleanupTasks = [];
    this._isCleanupHooked = false;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.runCleanup, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.runCleanup, this);
    tasks.forEach((task) => ChapterScene.safely(task));
  }

  /**
   * y für den Fehlertext: unter dem Stempel – oder darüber, wenn unten kein Platz ist.
   * @param {number} stampY Mitte des Stempels
   * @returns {number}
   */
  reasonYBesideStamp(stampY) {
    const area = this.area || CONFIG.PLAY_AREA;
    const { REASON_OFFSET_Y, TEXT_MARGIN } = ChapterScene.FEEDBACK;
    const below = stampY + REASON_OFFSET_Y;
    return below <= area.y + area.height - TEXT_MARGIN ? below : stampY - REASON_OFFSET_Y;
  }

  /**
   * Hält einen Punkt innerhalb der Spielfläche (mit Rand), damit Texte nicht abgeschnitten werden.
   * @param {number} x
   * @param {number} y
   * @returns {{x: number, y: number}}
   */
  clampToArea(x, y) {
    const area = this.area || CONFIG.PLAY_AREA;
    const margin = ChapterScene.FEEDBACK.TEXT_MARGIN;
    return {
      x: Phaser.Math.Clamp(x, area.x + margin, area.x + area.width - margin),
      y: Phaser.Math.Clamp(y, area.y + margin, area.y + area.height - margin),
    };
  }

  /**
   * Umhüllt einen keydown-Handler so, dass jedes KeyboardEvent nur einmal ankommt.
   * Hintergrund: Phaser 3.90 (KeyboardPlugin.update) arbeitet bei jedem neuen DOM-Event die
   * Queue des ganzen Frames erneut ab und überspringt nur das zuletzt verarbeitete Event.
   * Auch für HUD/Menü/GameOver nutzbar.
   * @param {(event: KeyboardEvent) => void} handler
   * @param {object} [context] this für den Handler
   * @returns {(event: KeyboardEvent) => void}
   */
  static dedupeKeyHandler(handler, context = null) {
    const seen = new WeakSet();
    return (event) => {
      if (event && typeof event === 'object') {
        if (seen.has(event)) return;
        seen.add(event);
      }
      handler.call(context, event);
    };
  }

  /**
   * Führt eine Funktion aus und meldet Fehler, statt sie weiterzuwerfen
   * (Effekte dürfen die Spiellogik nie abbrechen).
   * @param {Function} fn
   */
  static safely(fn) {
    try {
      fn();
    } catch (err) {
      console.error('[ChapterScene] Effekt/Aufräumen fehlgeschlagen:', err);
    }
  }
}
