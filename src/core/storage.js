/**
 * storage.js – Dauerhafte Spieldaten (Highscore, Erfolge, freigeschaltete Kapitel,
 * Einstellungen) im localStorage – robust gekapselt.
 *
 * - Alle Schlüssel tragen CONFIG.STORAGE_PREFIX (verträgt sich mit anderen Apps).
 * - Werte werden als JSON gespeichert; kaputte Daten führen zum Fallback, nie zum Absturz.
 * - Ohne localStorage (Node, blockierte Website-Daten, Safari privat, Speicher voll)
 *   greift ein In-Memory-Fallback: Das Spiel läuft weiter, nur ohne Dauerhaftigkeit.
 *   localStorage wird bei JEDEM Zugriff neu über globalThis gesucht (kein Caching), damit
 *   z. B. `localStorage.clear()` in Tests sofort wirkt.
 * - Passwörter gehören NIE hierher (die liegen nur im Speicher von GameState).
 *
 * Global: Storage (überdeckt bewusst das eingebaute window.Storage-Interface, das das
 * Spiel nicht braucht). Abhängigkeiten: CONFIG; Scoring (optional, nur zur Laufzeit).
 */

const Storage = (() => {
  /** Schlüssel (ohne Präfix) der Spieldaten. */
  const KEYS = Object.freeze({
    HIGHSCORE: 'highscore',
    ACHIEVEMENTS: 'achievements',
    UNLOCKED_CHAPTER: 'unlockedChapter',
    SETTINGS: 'settings',
  });

  /** Standard-Einstellungen; gespeicherte Werte werden darüber gemerged. */
  const DEFAULT_SETTINGS = Object.freeze({ muted: false });

  /** Schlüssel für den Verfügbarkeitstest von localStorage. */
  const PROBE_KEY = '__probe__';

  /**
   * In-Memory-Fallback: enthält nur Schlüssel, deren letzter Schreib-/Löschversuch
   * localStorage nicht erreicht hat. Diese Werte haben beim Lesen Vorrang
   * (neuester Stand dieser Sitzung). `null` = gelöscht (Grabstein).
   * @type {Map<string, string|null>}
   */
  const memory = new Map();

  /** @returns {string} vollständiger Schlüssel mit Präfix */
  function fullKey(key) {
    return CONFIG.STORAGE_PREFIX + key;
  }

  /** @returns {boolean} true für {…}-Objekte (keine Arrays, kein null) */
  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /** Anzahl Kapitel = höchste freischaltbare Kapitelnummer. */
  function chapterCount() {
    return Math.max(1, CONFIG.CHAPTERS.length);
  }

  /** Begrenzt value auf [min, max]. */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Liefert das localStorage-Objekt oder null. Schon der Zugriff kann werfen
   * (SecurityError bei blockierten Website-Daten), daher try/catch.
   */
  function getBackend() {
    try {
      const backend = globalThis.localStorage;
      if (backend && typeof backend.getItem === 'function' && typeof backend.setItem === 'function') return backend;
    } catch (err) {
      // Zugriff verweigert → In-Memory-Fallback
    }
    return null;
  }

  /** Liest den Rohwert (String) oder null. */
  function readRaw(key) {
    const name = fullKey(key);
    if (memory.has(name)) return memory.get(name);
    const backend = getBackend();
    if (!backend) return null;
    try {
      return backend.getItem(name);
    } catch (err) {
      return null;
    }
  }

  /**
   * Schreibt einen Rohwert. Klappt localStorage nicht, landet er im Speicher-Fallback.
   * @returns {boolean} true, wenn dauerhaft in localStorage gespeichert
   */
  function writeRaw(key, raw) {
    const name = fullKey(key);
    const backend = getBackend();
    if (backend) {
      try {
        backend.setItem(name, raw);
        memory.delete(name);
        return true;
      } catch (err) {
        // Speicher voll oder gesperrt → Fallback
      }
    }
    memory.set(name, raw);
    return false;
  }

  /** Löscht einen vollständigen Schlüssel; schlägt das fehl, bleibt ein Grabstein im Speicher. */
  function removeFullKey(name, backend) {
    memory.delete(name);
    if (backend) {
      try {
        backend.removeItem(name);
        return;
      } catch (err) {
        // Löschen fehlgeschlagen → Grabstein
      }
    }
    memory.set(name, null);
  }

  /** Normalisiert einen Highscore-Eintrag oder liefert null, wenn er unbrauchbar ist. */
  function normalizeHighscore(entry) {
    if (!isPlainObject(entry) || typeof entry.score !== 'number' || !Number.isFinite(entry.score)) return null;
    const score = Math.round(entry.score);
    let rank = typeof entry.rank === 'string' ? entry.rank : '';
    if (!rank && typeof Scoring !== 'undefined') rank = Scoring.rankTitle(score);
    return {
      ...entry,
      score,
      rank,
      clockLabel: typeof entry.clockLabel === 'string' ? entry.clockLabel : '',
      won: Boolean(entry.won),
      date: typeof entry.date === 'string' && entry.date ? entry.date : new Date().toISOString(),
    };
  }

  return {
    /** Schlüsselnamen (ohne Präfix), nur zur Information. */
    KEYS,

    /**
     * Liest einen JSON-Wert.
     * @param {string} key ohne Präfix
     * @param {*} [fallback=null] bei fehlendem Schlüssel oder kaputtem JSON
     * @returns {*} geparster Wert (immer eine frische Kopie)
     */
    get(key, fallback = null) {
      const raw = readRaw(key);
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },

    /**
     * Speichert einen Wert als JSON. `undefined` löscht den Schlüssel.
     * @param {string} key ohne Präfix
     * @param {*} value JSON-serialisierbar
     * @returns {boolean} true = dauerhaft gespeichert; false = nur im Speicher-Fallback
     *   (gilt bis zum Neuladen) bzw. nicht serialisierbar (dann gar nicht gespeichert)
     */
    set(key, value) {
      let raw;
      try {
        raw = JSON.stringify(value);
      } catch (err) {
        return false; // z. B. zirkuläre Struktur
      }
      if (raw === undefined) {
        Storage.remove(key);
        return true;
      }
      return writeRaw(key, raw);
    },

    /**
     * Löscht einen Schlüssel.
     * @param {string} key ohne Präfix
     */
    remove(key) {
      removeFullKey(fullKey(key), getBackend());
    },

    /**
     * Zusatz: Ist localStorage benutzbar (Daten überleben ein Neuladen)?
     * @returns {boolean}
     */
    isAvailable() {
      const backend = getBackend();
      if (!backend) return false;
      try {
        const name = fullKey(PROBE_KEY);
        backend.setItem(name, '1');
        backend.removeItem(name);
        return true;
      } catch (err) {
        return false;
      }
    },

    /**
     * Bester Lauf bisher.
     * @returns {{score:number, rank:string, clockLabel:string, won:boolean, date:string}|null}
     *   date ist ein ISO-8601-String (Anzeige z. B. new Date(date).toLocaleDateString('de-DE'))
     */
    getHighscore() {
      const stored = Storage.get(KEYS.HIGHSCORE, null);
      return isPlainObject(stored) ? normalizeHighscore(stored) : null;
    },

    /**
     * Reicht einen Lauf ein; gespeichert wird nur bei echter Verbesserung (score größer).
     * Fehlende Felder werden ergänzt (rank aus Scoring, date = jetzt).
     * @param {{score:number, rank?:string, clockLabel?:string, won?:boolean, date?:string}} entry
     * @returns {boolean} true, wenn neuer Highscore
     */
    submitHighscore(entry) {
      const candidate = normalizeHighscore(entry);
      if (!candidate) return false;
      const current = Storage.getHighscore();
      if (current && candidate.score <= current.score) return false;
      Storage.set(KEYS.HIGHSCORE, candidate);
      return true;
    },

    /**
     * Global (über alle Läufe) freigeschaltete Erfolge.
     * @returns {string[]} IDs ohne Duplikate (Kopie)
     */
    getAchievements() {
      const list = Storage.get(KEYS.ACHIEVEMENTS, []);
      if (!Array.isArray(list)) return [];
      return [...new Set(list.filter((id) => typeof id === 'string' && id !== ''))];
    },

    /**
     * Merkt einen Erfolg global.
     * @param {string} id
     * @returns {boolean} true, wenn global neu
     */
    addAchievement(id) {
      if (typeof id !== 'string' || id === '') return false;
      const list = Storage.getAchievements();
      if (list.includes(id)) return false;
      list.push(id);
      Storage.set(KEYS.ACHIEVEMENTS, list);
      return true;
    },

    /**
     * Höchste freigeschaltete Kapitelnummer.
     * @returns {number} 1 … Kapitelanzahl
     */
    getUnlockedChapter() {
      const value = Storage.get(KEYS.UNLOCKED_CHAPTER, 1);
      if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
      return clamp(Math.floor(value), 1, chapterCount());
    },

    /**
     * Schaltet ein Kapitel frei: neuer Wert = max(alt, id), begrenzt auf die Kapitelanzahl
     * (unlockChapter(6) nach Kapitel 5 bleibt also bei 5).
     * @param {number} id
     * @returns {number} neuer Stand
     */
    unlockChapter(id) {
      const current = Storage.getUnlockedChapter();
      const requested = Number(id);
      if (!Number.isFinite(requested)) return current;
      const next = Math.max(current, clamp(Math.floor(requested), 1, chapterCount()));
      if (next !== current) Storage.set(KEYS.UNLOCKED_CHAPTER, next);
      return next;
    },

    /**
     * Einstellungen (Standardwerte + Gespeichertes).
     * @returns {{muted:boolean}} Kopie
     */
    getSettings() {
      const stored = Storage.get(KEYS.SETTINGS, null);
      return { ...DEFAULT_SETTINGS, ...(isPlainObject(stored) ? stored : {}) };
    },

    /**
     * Merged Teil-Einstellungen in die gespeicherten.
     * @param {object} partial z. B. { muted: true }
     * @returns {object} neue Einstellungen
     */
    setSettings(partial) {
      const merged = { ...Storage.getSettings(), ...(isPlainObject(partial) ? partial : {}) };
      Storage.set(KEYS.SETTINGS, merged);
      return { ...merged };
    },

    /** Löscht alle Spieldaten mit Präfix (Tests, „Daten löschen“ im Menü). */
    resetAll() {
      memory.clear();
      const backend = getBackend();
      const names = new Set(Object.values(KEYS).map(fullKey));
      if (backend) {
        try {
          for (let i = 0; i < backend.length; i++) {
            const name = backend.key(i);
            if (typeof name === 'string' && name.startsWith(CONFIG.STORAGE_PREFIX)) names.add(name);
          }
        } catch (err) {
          // Aufzählen nicht möglich – dann wenigstens die bekannten Schlüssel löschen.
        }
      }
      names.forEach((name) => removeFullKey(name, backend));
    },
  };
})();
