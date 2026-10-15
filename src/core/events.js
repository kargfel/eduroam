/**
 * events.js – Minimaler Event-Emitter und die Namen aller Spiel-Events.
 *
 * Emitter ist die Basisklasse von GameState: Szenen und HUD hören damit auf
 * Zustandsänderungen, ohne sich gegenseitig zu kennen. Fehler in einem Handler werden
 * gefangen und per console.error gemeldet – ein kaputter Listener darf das Spiel
 * (und die übrigen Listener) nicht anhalten.
 *
 * Globals: Emitter (Klasse), EVENTS (eingefroren). Abhängigkeiten: keine.
 */

class Emitter {
  constructor() {
    /** @type {Map<string, Array<{handler: Function, context: *, once: boolean, removed: boolean}>>} */
    this._listeners = new Map();
  }

  /**
   * Registriert einen Handler.
   * @param {string} event
   * @param {Function} handler (payload) => void
   * @param {*} [context] wird als `this` übergeben
   * @returns {this}
   */
  on(event, handler, context) {
    return this._add(event, handler, context, false);
  }

  /**
   * Registriert einen Handler, der nur beim nächsten emit läuft.
   * @param {string} event
   * @param {Function} handler
   * @param {*} [context]
   * @returns {this}
   */
  once(event, handler, context) {
    return this._add(event, handler, context, true);
  }

  /**
   * Meldet Handler ab.
   * - ohne handler: alle Handler des Events
   * - mit handler: alle Registrierungen dieses Handlers (mit context: nur mit diesem Kontext)
   * @param {string} event
   * @param {Function} [handler]
   * @param {*} [context]
   * @returns {this}
   */
  off(event, handler, context) {
    if (event === undefined || event === null) return this;
    const entries = this._listeners.get(event);
    if (!entries) return this;
    const remaining = [];
    for (const entry of entries) {
      const handlerMatches = handler === undefined || handler === null || entry.handler === handler;
      const contextMatches = context === undefined || entry.context === context;
      if (handlerMatches && contextMatches) entry.removed = true;
      else remaining.push(entry);
    }
    if (remaining.length) this._listeners.set(event, remaining);
    else this._listeners.delete(event);
    return this;
  }

  /**
   * Löst ein Event aus. Handler laufen in Registrierungsreihenfolge; Handler, die während
   * des Auslösens entfernt werden, laufen nicht mehr; neu hinzugefügte erst beim nächsten
   * Mal. Fehler in Handlern werden gefangen und per console.error gemeldet.
   * @param {string} event
   * @param {...*} args üblicherweise genau ein Payload-Objekt
   * @returns {boolean} true, wenn mindestens ein Handler registriert war
   */
  emit(event, ...args) {
    const entries = this._listeners.get(event);
    if (!entries || entries.length === 0) return false;
    for (const entry of entries.slice()) {
      if (entry.removed) continue;
      if (entry.once) this._removeEntry(event, entry);
      try {
        entry.handler.apply(entry.context, args);
      } catch (err) {
        console.error(`[Emitter] Fehler in einem Handler für "${event}":`, err);
      }
    }
    return true;
  }

  /**
   * Entfernt alle Handler (ohne Argument) bzw. alle Handler eines Events.
   * @param {string} [event]
   * @returns {this}
   */
  removeAllListeners(event) {
    if (event === undefined) {
      for (const entries of this._listeners.values()) entries.forEach((entry) => (entry.removed = true));
      this._listeners.clear();
      return this;
    }
    return this.off(event);
  }

  /**
   * Zusatz: Anzahl aktiver Handler eines Events (Tests, Leck-Suche).
   * @param {string} event
   * @returns {number}
   */
  listenerCount(event) {
    const entries = this._listeners.get(event);
    return entries ? entries.length : 0;
  }

  /** Interne Registrierung; Nicht-Funktionen werden still ignoriert. */
  _add(event, handler, context, once) {
    if (typeof handler !== 'function') return this;
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push({ handler, context, once, removed: false });
    return this;
  }

  /** Entfernt genau eine Registrierung (für once). */
  _removeEntry(event, target) {
    target.removed = true;
    const entries = this._listeners.get(event);
    if (!entries) return;
    const remaining = entries.filter((entry) => entry !== target);
    if (remaining.length) this._listeners.set(event, remaining);
    else this._listeners.delete(event);
  }
}

/** Namen aller GameState-Events (Payloads siehe docs/ARCHITECTURE.md, Abschnitt 5.4). */
const EVENTS = Object.freeze({
  STATE_CHANGED: 'state-changed', // Snapshot (GameState.getSnapshot())
  FRUSTRATION_CHANGED: 'frustration-changed', // { value, delta, reason }
  CLOCK_JUMP: 'clock-jump', // { minutes, reason }   (Zeitstrafe)
  CLOCK_MILESTONE: 'clock-milestone', // { minutes, text }
  OBJECTIVE_CHANGED: 'objective-changed', // { text }
  RAGE_QUIT: 'rage-quit', // { reason }  (einmal pro Lauf)
  CHAPTER_COMPLETE: 'chapter-complete', // { chapterId, stats }
  ACHIEVEMENT: 'achievement-unlocked', // { id, title, description, isNewGlobal }
  PAUSE_CHANGED: 'pause-changed', // { paused }
});
