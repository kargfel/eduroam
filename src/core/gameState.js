/**
 * gameState.js – Zustand EINES Laufs: Spieluhr, Frust-Meter, Fehlversuche, Kapitel-
 * Statistiken, Erfolge, aktuelle Aufgabe, kapitelübergreifende Merker, Zugangsdaten.
 *
 * GameState ist ein Singleton (Instanz einer Emitter-Unterklasse). Szenen schreiben nur
 * über die Methoden hier; jede Schreibmethode sendet STATE_CHANGED mit einem Snapshot
 * (tiefe Kopie), dazu ggf. ein spezielles Event (siehe EVENTS). Damit bei 60 fps nicht
 * 60 Events pro Sekunde entstehen, sendet tick() STATE_CHANGED nur, wenn sich die
 * angezeigte Minute ändert.
 *
 * Uhr: intern exakt (Bruchteile aus tick), nach außen immer GANZE Minuten
 * (getClockMinutes, Snapshot, Ergebnis) – passend zur Anzeige „08:55“.
 * Passwörter liegen nur hier im Speicher; sie stehen weder im Snapshot noch in Events
 * noch im localStorage.
 *
 * Global: GameState. Abhängigkeiten: CONFIG, CAMPUS, Emitter, EVENTS, Storage, Scoring.
 */

const GameState = (() => {
  /** Mögliche Lauf-Zustände. */
  const STATUS = Object.freeze({ IDLE: 'idle', RUNNING: 'running', WON: 'won', LOST: 'lost', ABORTED: 'aborted' });

  /** ZEN_MASTER: Frust-Spitzenwert muss STRIKT darunter liegen (Vertrag 5.7). */
  const ZEN_MASTER_PEAK_LIMIT = 40;
  /** finishRun-Grund, der den Erfolg RAGE_QUIT auslöst. */
  const RAGE_REASON = 'rage';
  /** reason-Text für Frust aus Uhrzeit-Meilensteinen. */
  const MILESTONE_REASON = 'milestone';
  /** reason-Text für setFrustration ohne Angabe (Debug-API). */
  const DEBUG_REASON = 'debug';

  /** Meilensteine aufsteigend nach Uhrzeit (CONFIG ist eingefroren → einmal sortieren). */
  const MILESTONES = [...CONFIG.CLOCK.MILESTONES].sort((a, b) => a.minutes - b.minutes);

  /**
   * Tiefe Kopie für reine Daten (Objekte, Arrays, Primitive, Date). Zyklische Verweise
   * (z. B. versehentlich übergebene Szenen-Objekte) führen nicht zum Absturz: Sie werden
   * als Verweis auf die bereits erstellte Kopie übernommen.
   */
  function deepCopy(value, seen = new Map()) {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    if (value instanceof Date) return new Date(value.getTime());
    const copy = Array.isArray(value) ? [] : {};
    seen.set(value, copy);
    for (const key of Object.keys(value)) copy[key] = deepCopy(value[key], seen);
    return copy;
  }

  /** @returns {boolean} true für {…}-Objekte */
  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /** @returns {boolean} true, wenn id eine Kapitelnummer aus CONFIG.CHAPTERS ist */
  function isChapterId(id) {
    return Number.isInteger(id) && CONFIG.CHAPTERS.some((chapter) => chapter.id === id);
  }

  /** Erfolgs-Definition aus CONFIG oder null (nur eigene Schlüssel, kein Prototyp-Zugriff). */
  function achievementDef(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CONFIG.ACHIEVEMENTS, id)
      ? CONFIG.ACHIEVEMENTS[id]
      : null;
  }

  class GameStateStore extends Emitter {
    constructor() {
      super();
      // Öffentliche Methoden binden: funktionieren so auch als losgelöste Callbacks.
      for (const name of Object.getOwnPropertyNames(GameStateStore.prototype)) {
        if (name === 'constructor' || name.startsWith('_')) continue;
        if (typeof this[name] === 'function') this[name] = this[name].bind(this);
      }
      this._resetRun(STATUS.IDLE, 1);
    }

    // ------------------------------------------------------------------ Lebenszyklus

    /**
     * Startet einen neuen Lauf: setzt ALLES zurück (Uhr 07:30, Frust 0, Versuche,
     * Erfolge des Laufs, Aufgabe, Merker, Zugangsdaten, Meilensteine), status 'running'.
     * @param {number} [startChapterId=1] ungültige Werte → 1
     * @returns {object} Snapshot
     */
    startRun(startChapterId = 1) {
      const wasPaused = this._paused;
      const id = isChapterId(Number(startChapterId)) ? Number(startChapterId) : 1;
      this._resetRun(STATUS.RUNNING, id);
      if (wasPaused) this.emit(EVENTS.PAUSE_CHANGED, { paused: false });
      this._changed();
      return this.getSnapshot();
    }

    /**
     * Beendet den Lauf: vergibt globale Erfolge (ON_TIME, ZEN_MASTER, RAGE_QUIT),
     * berechnet den Score, reicht den Highscore ein. Idempotent: ein zweiter Aufruf
     * liefert dasselbe Ergebnis ohne neue Events.
     * @param {boolean} won
     * @param {string|null} [reason=null] z. B. 'rage'
     * @returns {{won:boolean, reason:(string|null), score:number, rank:string, isNewHighscore:boolean,
     *   highscore:(object|null), clockMinutes:number, clockLabel:string, minutesLate:number,
     *   totalFails:number, frustration:number, frustrationPeak:number,
     *   runAchievements:Array<{id:string, title:string, description:string, isNewGlobal:boolean}>,
     *   chapterStats:object, attempts:object, breakdown:object, startChapterId:number}}
     */
    finishRun(won, reason = null) {
      if (this._lastResult && (this._status === STATUS.WON || this._status === STATUS.LOST)) {
        return deepCopy(this._lastResult);
      }
      const isWin = Boolean(won);
      const finalReason = reason === undefined ? null : reason;
      const clockMinutes = this.getClockMinutes();

      // 1. Globale Erfolge (zählen schon für den Score dieses Laufs)
      if (isWin && clockMinutes < CONFIG.CLOCK.LECTURE_MINUTES) this.unlockAchievement('ON_TIME');
      if (isWin && this._frustrationPeak < ZEN_MASTER_PEAK_LIMIT) this.unlockAchievement('ZEN_MASTER');
      if (!isWin && finalReason === RAGE_REASON) this.unlockAchievement('RAGE_QUIT');

      // 2. Score und Rang
      const breakdown = Scoring.breakdown({
        clockMinutes,
        totalFails: this._totalFails,
        frustrationPeak: this._frustrationPeak,
        achievementCount: this._runAchievements.length,
        won: isWin,
      });
      const score = breakdown.total;
      const rank = Scoring.rankTitle(score);
      const clockLabel = Scoring.formatClock(clockMinutes);

      // 3. Highscore (Storage speichert nur bei Verbesserung)
      const isNewHighscore = Storage.submitHighscore({
        score,
        rank,
        clockLabel,
        won: isWin,
        date: new Date().toISOString(),
      });
      const highscore = Storage.getHighscore();

      // 4. Status setzen und Ergebnis festhalten
      const wasPaused = this._paused;
      this._status = isWin ? STATUS.WON : STATUS.LOST;
      this._paused = false;
      this._lastResult = {
        won: isWin,
        reason: finalReason,
        score,
        rank,
        isNewHighscore,
        highscore,
        clockMinutes,
        clockLabel,
        minutesLate: Scoring.minutesLate(clockMinutes),
        totalFails: this._totalFails,
        frustration: this._frustration,
        frustrationPeak: this._frustrationPeak,
        runAchievements: this._runAchievements.map((id) => {
          const def = achievementDef(id);
          return { id, title: def.title, description: def.description, isNewGlobal: this._newGlobalAchievements.has(id) };
        }),
        chapterStats: deepCopy(this._chapterStats),
        // Zusätze (nicht im Vertrag, aber praktisch für GameOver):
        attempts: deepCopy(this._attempts),
        breakdown,
        startChapterId: this._startChapterId,
      };
      if (wasPaused) this.emit(EVENTS.PAUSE_CHANGED, { paused: false });
      this._changed();
      return deepCopy(this._lastResult);
    }

    /** Bricht den Lauf ab (zurück ins Menü): status 'aborted', Pause aufgehoben. */
    abortRun() {
      const wasPaused = this._paused;
      this._status = STATUS.ABORTED;
      this._paused = false;
      if (wasPaused) this.emit(EVENTS.PAUSE_CHANGED, { paused: false });
      this._changed();
    }

    // ------------------------------------------------------------------ Lesen

    /**
     * Tiefe Kopie des Zustands (Änderungen daran wirken nicht zurück).
     * @returns {{status:string, paused:boolean, currentChapterId:number, startChapterId:number,
     *   clockMinutes:number, clockLabel:string, frustration:number, frustrationPeak:number,
     *   attempts:Object<string,{fails:number, successes:number}>, totalFails:number,
     *   chapterStats:object, runAchievements:string[], objective:string, flags:object,
     *   milestonesReached:number[]}}
     */
    getSnapshot() {
      return {
        status: this._status,
        paused: this._paused,
        currentChapterId: this._currentChapterId,
        startChapterId: this._startChapterId,
        clockMinutes: this.getClockMinutes(),
        clockLabel: this.getClockLabel(),
        frustration: this._frustration,
        frustrationPeak: this._frustrationPeak,
        attempts: deepCopy(this._attempts),
        totalFails: this._totalFails,
        chapterStats: deepCopy(this._chapterStats),
        runAchievements: [...this._runAchievements],
        objective: this._objective,
        flags: deepCopy(this._flags),
        milestonesReached: MILESTONES.filter((m, index) => this._firedMilestones.has(index)).map((m) => m.minutes),
      };
    }

    /** @returns {string} 'idle' | 'running' | 'won' | 'lost' | 'aborted' (Zusatz) */
    getStatus() {
      return this._status;
    }

    /** @returns {number} Spieluhr in GANZEN Minuten seit Mitternacht von Tag 1 */
    getClockMinutes() {
      return Math.floor(this._clockMinutes);
    }

    /** @returns {number} Spieluhr mit Bruchteilen (Zusatz) */
    getClockMinutesExact() {
      return this._clockMinutes;
    }

    /**
     * @param {{withDay?: boolean}} [options] Zusatz: { withDay: false } → nur "07:31"
     * @returns {string} z. B. "08:55" oder "Tag 2, 07:31"
     */
    getClockLabel(options) {
      return Scoring.formatClock(this.getClockMinutes(), isPlainObject(options) ? options : {});
    }

    /** @returns {boolean} true ab Vorlesungsbeginn (08:15) */
    isPastLecture() {
      return this.getClockMinutes() >= CONFIG.CLOCK.LECTURE_MINUTES;
    }

    /** @returns {number} Frust 0 … CONFIG.FRUSTRATION.MAX */
    getFrustration() {
      return this._frustration;
    }

    /** @returns {boolean} */
    isPaused() {
      return this._paused;
    }

    /** @returns {number} Fehlversuche im ganzen Lauf (Zusatz) */
    getTotalFails() {
      return this._totalFails;
    }

    /**
     * Versuche eines Kapitels (Zusatz).
     * @param {number} [chapterId] Standard: aktuelles Kapitel
     * @returns {{fails:number, successes:number}}
     */
    getAttempts(chapterId) {
      const entry = this._attempts[this._resolveChapterId(chapterId)];
      return entry ? { ...entry } : { fails: 0, successes: 0 };
    }

    /**
     * Zugangsdaten des Laufs. Ohne setCredentials (z. B. Kapitel 1 übersprungen):
     * CAMPUS.username/identity und CAMPUS.defaultPassword, isDefault true.
     * @returns {{username:string, identity:string, password:string, isDefault:boolean}}
     */
    getCredentials() {
      const stored = this._credentials || {};
      const username = stored.username || CAMPUS.username;
      let identity;
      if (username === CAMPUS.username) identity = CAMPUS.identity;
      else identity = username.includes('@') ? username : `${username}@${CAMPUS.realm}`;
      const hasPassword = typeof stored.password === 'string' && stored.password !== '';
      return {
        username,
        identity,
        password: hasPassword ? stored.password : CAMPUS.defaultPassword,
        isDefault: !hasPassword,
      };
    }

    /**
     * Kapitelübergreifender Merker.
     * @param {string} key
     * @param {*} [fallback] wenn nicht gesetzt
     * @returns {*} Kopie des Werts
     */
    getFlag(key, fallback) {
      return Object.prototype.hasOwnProperty.call(this._flags, key) ? deepCopy(this._flags[key]) : fallback;
    }

    // ------------------------------------------------------------------ Schreiben

    /**
     * Setzt das aktuelle Kapitel (ChapterScene.initChapter). Ungültige IDs werden ignoriert
     * und als Programmierfehler per console.error gemeldet (fällt in Browser-Tests auf).
     * @param {number} id
     */
    setCurrentChapter(id) {
      const chapterId = Number(id);
      if (!isChapterId(chapterId)) {
        console.error(`[GameState] Unbekanntes Kapitel: ${id}`);
        return;
      }
      this._currentChapterId = chapterId;
      this._changed();
    }

    /**
     * Setzt die Aufgabe, die das HUD anzeigt. Sendet OBJECTIVE_CHANGED { text } – nur,
     * wenn sich der Text ändert (sicher, auch wenn ein Kapitel es pro Frame aufruft).
     * @param {string} text
     */
    setObjective(text) {
      const value = text === undefined || text === null ? '' : String(text);
      if (value === this._objective) return;
      this._objective = value;
      this.emit(EVENTS.OBJECTIVE_CHANGED, { text: value });
      this._changed();
    }

    /**
     * Speichert Kennung/Passwort aus Kapitel 1 (nur im Speicher!). Teil-Updates erlaubt;
     * leere Werte werden ignoriert.
     * @param {{username?:string, password?:string}} credentials
     */
    setCredentials({ username, password } = {}) {
      const next = { ...(this._credentials || {}) };
      if (typeof username === 'string' && username.trim() !== '') next.username = username.trim();
      if (typeof password === 'string' && password !== '') next.password = password;
      this._credentials = next;
      this._changed();
    }

    /**
     * Kapitelübergreifender Merker (z. B. 'phished'). undefined löscht den Merker.
     * @param {string} key
     * @param {*} value reine Daten (wird kopiert)
     * @returns {*} value
     */
    setFlag(key, value) {
      const name = String(key);
      if (value === undefined) delete this._flags[name];
      else this._flags[name] = deepCopy(value);
      this._changed();
      return value;
    }

    /**
     * Erhöht den Frust (Clamp 0 … MAX) und sendet FRUSTRATION_CHANGED { value, delta, reason }.
     * Erreicht der Frust MAX, folgt (einmal pro Lauf, nur im laufenden Lauf) RAGE_QUIT { reason }.
     * Nicht pro Frame aufrufen – jede Änderung erzeugt Events.
     * @param {number} amount
     * @param {string} [reason]
     * @returns {number} neuer Frust
     */
    addFrustration(amount, reason) {
      return this._changeFrustration(Number(amount), reason);
    }

    /**
     * Senkt den Frust (Clamp bei 0); delta im Event ist negativ.
     * @param {number} amount positiv
     * @param {string} [reason]
     * @returns {number} neuer Frust
     */
    reduceFrustration(amount, reason) {
      return this._changeFrustration(-Math.abs(Number(amount)), reason);
    }

    /**
     * Zusatz (Debug-API): setzt den Frust auf einen absoluten Wert.
     * @param {number} value
     * @param {string} [reason='debug']
     * @returns {number} neuer Frust
     */
    setFrustration(value, reason = DEBUG_REASON) {
      return this._changeFrustration(Number(value) - this._frustration, reason);
    }

    /**
     * Zeitstrafe: Uhr springt vor, CLOCK_JUMP { minutes, reason }, danach Meilensteine.
     * Wirkt auch pausiert. Werte ≤ 0 werden ignoriert (keine Zeitreisen).
     * @param {number} minutes
     * @param {string} [reason]
     * @returns {number} neue Uhrzeit (ganze Minuten)
     */
    advanceClock(minutes, reason) {
      const amount = Number(minutes);
      if (!Number.isFinite(amount) || amount <= 0) return this.getClockMinutes();
      this._clockMinutes += amount;
      this.emit(EVENTS.CLOCK_JUMP, { minutes: amount, reason: reason === undefined ? null : reason });
      this._checkMilestones();
      this._changed();
      return this.getClockMinutes();
    }

    /**
     * Echtzeit → Spielzeit (GameScene.update). Nur wenn status 'running' und nicht pausiert.
     * STATE_CHANGED nur bei Wechsel der angezeigten Minute.
     * @param {number} deltaMs Millisekunden seit dem letzten Frame
     * @returns {number} Uhrzeit (ganze Minuten)
     */
    tick(deltaMs) {
      const delta = Number(deltaMs);
      if (this._status !== STATUS.RUNNING || this._paused || !Number.isFinite(delta) || delta <= 0) {
        return this.getClockMinutes();
      }
      const before = this.getClockMinutes();
      this._clockMinutes += delta / CONFIG.CLOCK.REAL_MS_PER_GAME_MINUTE;
      this._checkMilestones();
      const after = this.getClockMinutes();
      if (after !== before) this._changed();
      return after;
    }

    /**
     * Pausiert/entpausiert die Spieluhr. PAUSE_CHANGED { paused } nur bei Änderung.
     * @param {boolean} paused
     * @param {string} [reason] Zusatz: z. B. 'intro' oder 'user' – steht dann als
     *   `reason` im Payload, damit das HUD eine Intro-Pause vom Pause-Menü unterscheiden kann
     */
    setPaused(paused, reason) {
      const next = Boolean(paused);
      if (next === this._paused) return;
      this._paused = next;
      const payload = { paused: next };
      if (reason !== undefined) payload.reason = reason;
      this.emit(EVENTS.PAUSE_CHANGED, payload);
      this._changed();
    }

    /**
     * Zählt einen Fehlversuch (pro Kapitel und insgesamt).
     * @param {number} [chapterId] Standard: aktuelles Kapitel
     * @param {string} [reason]
     * @returns {number} Fehlversuche dieses Kapitels
     */
    recordFail(chapterId, reason) {
      const id = this._resolveChapterId(chapterId);
      const entry = this._attemptsFor(id);
      entry.fails++;
      this._totalFails++;
      this._lastFailReason = reason === undefined ? null : reason;
      this._changed();
      return entry.fails;
    }

    /**
     * Zählt einen Erfolg in einem Kapitel.
     * @param {number} [chapterId] Standard: aktuelles Kapitel
     * @returns {number} Erfolge dieses Kapitels
     */
    recordSuccess(chapterId) {
      const entry = this._attemptsFor(this._resolveChapterId(chapterId));
      entry.successes++;
      this._changed();
      return entry.successes;
    }

    /**
     * Kapitel abgeschlossen: speichert stats (Kopie) und sendet CHAPTER_COMPLETE { chapterId, stats }.
     * GameScene wechselt daraufhin das Kapitel.
     * @param {number} chapterId
     * @param {object} [stats={}] z. B. { fails, minutesSpent, … }
     */
    completeChapter(chapterId, stats = {}) {
      const id = this._resolveChapterId(chapterId);
      const copy = isPlainObject(stats) ? deepCopy(stats) : {};
      this._chapterStats[id] = copy;
      this.emit(EVENTS.CHAPTER_COMPLETE, { chapterId: id, stats: deepCopy(copy) });
      this._changed();
    }

    /**
     * Schaltet einen Erfolg frei – höchstens einmal pro Lauf. Merkt ihn global
     * (Storage.addAchievement) und sendet ACHIEVEMENT { id, title, description, isNewGlobal }.
     * Unbekannte IDs (Tippfehler) werden ignoriert und per console.error gemeldet.
     * @param {string} id Schlüssel aus CONFIG.ACHIEVEMENTS
     * @returns {boolean} true, wenn in diesem Lauf neu freigeschaltet
     */
    unlockAchievement(id) {
      const def = achievementDef(id);
      if (!def) {
        console.error(`[GameState] Unbekannter Erfolg: ${id}`);
        return false;
      }
      if (this._runAchievements.includes(id)) return false;
      this._runAchievements.push(id);
      const isNewGlobal = Storage.addAchievement(id);
      if (isNewGlobal) this._newGlobalAchievements.add(id);
      this.emit(EVENTS.ACHIEVEMENT, { id: def.id, title: def.title, description: def.description, isNewGlobal });
      this._changed();
      return true;
    }

    // ------------------------------------------------------------------ intern

    /** Setzt alle Felder eines Laufs zurück (ohne Events). */
    _resetRun(status, startChapterId) {
      this._status = status;
      this._paused = false;
      this._startChapterId = startChapterId;
      this._currentChapterId = startChapterId;
      this._clockMinutes = CONFIG.CLOCK.START_MINUTES;
      this._frustration = 0;
      this._frustrationPeak = 0;
      this._attempts = {};
      CONFIG.CHAPTERS.forEach((chapter) => {
        this._attempts[chapter.id] = { fails: 0, successes: 0 };
      });
      this._totalFails = 0;
      this._lastFailReason = null;
      this._chapterStats = {};
      this._runAchievements = [];
      this._newGlobalAchievements = new Set();
      this._objective = '';
      this._flags = {};
      this._credentials = null;
      this._firedMilestones = new Set();
      this._rageQuitSent = false;
      this._lastResult = null;
    }

    /** Sendet STATE_CHANGED mit frischem Snapshot. */
    _changed() {
      this.emit(EVENTS.STATE_CHANGED, this.getSnapshot());
    }

    /** Kapitel-ID oder (ohne Angabe) das aktuelle Kapitel. */
    _resolveChapterId(chapterId) {
      return chapterId === undefined || chapterId === null ? this._currentChapterId : chapterId;
    }

    /** Versuchszähler eines Kapitels (legt ihn bei Bedarf an). */
    _attemptsFor(id) {
      if (!this._attempts[id]) this._attempts[id] = { fails: 0, successes: 0 };
      return this._attempts[id];
    }

    /** Gemeinsame Frust-Änderung inkl. Clamp, Spitzenwert, Events und Rage-Quit. */
    _changeFrustration(delta, reason) {
      if (!Number.isFinite(delta) || delta === 0) return this._frustration;
      const previous = this._frustration;
      const next = Math.min(CONFIG.FRUSTRATION.MAX, Math.max(0, previous + delta));
      if (next === previous) return previous;
      const finalReason = reason === undefined ? null : reason;
      this._frustration = next;
      this._frustrationPeak = Math.max(this._frustrationPeak, next);
      this.emit(EVENTS.FRUSTRATION_CHANGED, { value: next, delta: next - previous, reason: finalReason });
      this._changed();
      if (next >= CONFIG.FRUSTRATION.MAX && !this._rageQuitSent && this._status === STATUS.RUNNING) {
        this._rageQuitSent = true;
        this.emit(EVENTS.RAGE_QUIT, { reason: finalReason });
      }
      return next;
    }

    /**
     * Löst alle erreichten, noch nicht ausgelösten Meilensteine aus (aufsteigend):
     * CLOCK_MILESTONE { minutes, text, frustration } und ggf. Frust mit reason 'milestone'.
     */
    _checkMilestones() {
      for (let index = 0; index < MILESTONES.length; index++) {
        const milestone = MILESTONES[index];
        if (this._clockMinutes < milestone.minutes) break;
        if (this._firedMilestones.has(index)) continue;
        this._firedMilestones.add(index); // vor dem Event: verhindert Doppelungen bei Re-Entrance
        const frustration = milestone.frustration || 0;
        this.emit(EVENTS.CLOCK_MILESTONE, { minutes: milestone.minutes, text: milestone.text, frustration });
        if (frustration > 0) this.addFrustration(frustration, MILESTONE_REASON);
      }
    }
  }

  return new GameStateStore();
})();
