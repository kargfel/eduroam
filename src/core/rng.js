/**
 * rng.js – Seedbarer Zufallsgenerator für das ganze Spiel.
 *
 * Zufall läuft im Spiel AUSSCHLIESSLICH über RNG (nie Math.random()), damit Läufe mit
 * `?seed=S` reproduzierbar sind (Tests, Präsentation). Algorithmus: mulberry32 –
 * klein, schnell und für Spielzwecke gut verteilt. String-Seeds werden per FNV-1a
 * gehasht; rein numerische Strings ('7') gelten als Zahl, damit `?seed=7` unabhängig
 * vom URL-Parsing dieselbe Folge liefert.
 *
 * Global: RNG. Abhängigkeiten: keine (reine Logik, auch in Node testbar).
 */

const RNG = (() => {
  /** 2^32 – Umrechnung des 32-Bit-Zustands in [0, 1). */
  const UINT32_RANGE = 4294967296;
  /** Startwert und Primzahl des FNV-1a-Hashs (32 Bit). */
  const FNV_OFFSET = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  /** Additive Konstante von mulberry32. */
  const MULBERRY_INCREMENT = 0x6d2b79f5;

  /**
   * Zufälliger Start-Seed. Einzige Stelle im Spiel, an der „echter“ Zufall entsteht:
   * bevorzugt crypto.getRandomValues, sonst Uhrzeit gemischt mit Math.random.
   * @returns {number} vorzeichenlose 32-Bit-Ganzzahl
   */
  function randomSeed() {
    try {
      const cryptoApi = globalThis.crypto;
      if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
        return cryptoApi.getRandomValues(new Uint32Array(1))[0];
      }
    } catch (err) {
      // Kein Krypto-Zufall verfügbar – weiter mit dem Fallback.
    }
    return (Date.now() ^ Math.floor(Math.random() * UINT32_RANGE)) >>> 0;
  }

  /** FNV-1a-Hash eines Strings → vorzeichenlose 32-Bit-Ganzzahl. */
  function hashString(text) {
    let hash = FNV_OFFSET;
    for (const char of text) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
  }

  /**
   * Normalisiert einen Seed-Wert (Zahl oder String) auf eine 32-Bit-Ganzzahl.
   * Leere/ungültige Werte (undefined, null, '', NaN) → zufälliger Seed.
   */
  function normalizeSeed(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return randomSeed();
      return Number.isInteger(value) ? value >>> 0 : hashString(String(value));
    }
    if (value === undefined || value === null) return randomSeed();
    const text = String(value).trim();
    if (text === '') return randomSeed();
    if (/^[+-]?\d+$/.test(text)) return Number(text) >>> 0;
    return hashString(text);
  }

  /**
   * Baut einen unabhängigen Generator mit eigenem Zustand.
   * @param {number|string} [initialSeed] ohne Wert: zufällig
   */
  function createGenerator(initialSeed) {
    let currentSeed = 0;
    let state = 0;

    const generator = {
      /**
       * Setzt den Seed und startet die Folge neu.
       * @param {number|string} value Zahl oder String; leer → zufälliger Seed
       * @returns {number} normalisierter Seed
       */
      seed(value) {
        currentSeed = normalizeSeed(value);
        state = currentSeed;
        return currentSeed;
      },

      /** @returns {number} aktueller (normalisierter) Seed */
      getSeed() {
        return currentSeed;
      },

      /** @returns {number} Zufallszahl in [0, 1) – mulberry32 */
      next() {
        state = (state + MULBERRY_INCREMENT) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
      },

      /**
       * Ganze Zahl zwischen min und max, BEIDE Grenzen inklusive.
       * Vertauschte Grenzen werden korrigiert, Kommazahlen nach innen gerundet.
       */
      int(min, max) {
        let low = Math.ceil(Math.min(min, max));
        let high = Math.floor(Math.max(min, max));
        if (!Number.isFinite(low) || !Number.isFinite(high)) return 0;
        if (high < low) high = low;
        return low + Math.floor(generator.next() * (high - low + 1));
      },

      /** Kommazahl in [min, max). Standard: [0, 1). */
      float(min = 0, max = 1) {
        return min + generator.next() * (max - min);
      },

      /** true mit Wahrscheinlichkeit p (0 → nie, 1 → immer). */
      chance(p = 0.5) {
        return generator.next() < Number(p);
      },

      /** Zufälliges Element; leeres/kein Array → undefined. */
      pick(array) {
        if (!array || typeof array.length !== 'number' || array.length === 0) return undefined;
        return array[generator.int(0, array.length - 1)];
      },

      /**
       * Gemischte KOPIE (Fisher-Yates); das Original bleibt unverändert,
       * funktioniert daher auch mit eingefrorenen Arrays aus CONFIG/CAMPUS.
       * @returns {Array} neues Array
       */
      shuffle(array) {
        const result = array && typeof array.length === 'number' ? Array.from(array) : [];
        for (let i = result.length - 1; i > 0; i--) {
          const j = generator.int(0, i);
          [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
      },
    };

    generator.seed(initialSeed);
    return generator;
  }

  // Globaler Generator: ohne RNG.seed()-Aufruf mit zufälligem Seed.
  const globalGenerator = createGenerator();

  /**
   * Zusatz: unabhängiger Generator mit gleicher API (z. B. für Level-Daten, die den
   * globalen Zufallsstrom nicht verschieben sollen).
   * @param {number|string} [seed]
   */
  globalGenerator.create = (seed) => createGenerator(seed);

  return globalGenerator;
})();
