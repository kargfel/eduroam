/**
 * scoring.js – Punkte, Ränge und Uhrzeit-Formatierung (reine Funktionen).
 *
 * Score-Formel (docs/ARCHITECTURE.md, 5.6):
 *   BASE − (clockMinutes − START_MINUTES)·PER_MINUTE − totalFails·PER_FAIL
 *   − frustrationPeak·PER_FRUSTRATION + achievementCount·PER_ACHIEVEMENT (+ WIN_BONUS bei Sieg)
 *   verloren: × LOSS_FACTOR; gerundet; nie < 0
 * Alle Gewichte stehen in CONFIG.SCORE, die Ränge in CONFIG.RANKS.
 *
 * Global: Scoring. Abhängigkeiten: CONFIG.
 */

const Scoring = (() => {
  const MINUTES_PER_HOUR = 60;
  const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

  /** Zahl oder Standardwert (für fehlende/ungültige Eingaben). */
  function numberOr(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  /** Zweistellig mit führender Null. */
  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  const api = {
    /**
     * Zusatz: Score mit allen Einzelposten (z. B. für das Hochzählen im GameOver-Bildschirm).
     * Fehlende Werte gelten als neutral: Startuhrzeit, 0 Fehler, 0 Frust, 0 Erfolge, verloren.
     * @param {{clockMinutes?:number, totalFails?:number, frustrationPeak?:number, achievementCount?:number, won?:boolean}} [params]
     * @returns {{base:number, timePenalty:number, failPenalty:number, frustrationPenalty:number,
     *            achievementBonus:number, winBonus:number, subtotal:number, factor:number, total:number}}
     */
    breakdown({ clockMinutes, totalFails, frustrationPeak, achievementCount, won } = {}) {
      const S = CONFIG.SCORE;
      const isWin = Boolean(won);
      const elapsed = Math.max(0, numberOr(clockMinutes, CONFIG.CLOCK.START_MINUTES) - CONFIG.CLOCK.START_MINUTES);
      const parts = {
        base: S.BASE,
        timePenalty: elapsed * S.PER_MINUTE,
        failPenalty: Math.max(0, numberOr(totalFails, 0)) * S.PER_FAIL,
        frustrationPenalty: Math.max(0, numberOr(frustrationPeak, 0)) * S.PER_FRUSTRATION,
        achievementBonus: Math.max(0, numberOr(achievementCount, 0)) * S.PER_ACHIEVEMENT,
        winBonus: isWin ? S.WIN_BONUS : 0,
        factor: isWin ? 1 : S.LOSS_FACTOR,
      };
      parts.subtotal =
        parts.base - parts.timePenalty - parts.failPenalty - parts.frustrationPenalty + parts.achievementBonus + parts.winBonus;
      parts.total = Math.max(0, Math.round(parts.subtotal * parts.factor));
      return parts;
    },

    /**
     * Endpunktzahl eines Laufs (Formel siehe Dateikopf).
     * @param {{clockMinutes:number, totalFails:number, frustrationPeak:number, achievementCount:number, won:boolean}} [params]
     * @returns {number} ganze Zahl ≥ 0
     */
    computeScore(params = {}) {
      return api.breakdown(params).total;
    },

    /**
     * Rangtitel zur Punktzahl: höchster Rang mit min ≤ score; darunter der niedrigste Rang.
     * @param {number} score
     * @returns {string}
     */
    rankTitle(score) {
      const ranks = [...CONFIG.RANKS].sort((a, b) => b.min - a.min);
      if (ranks.length === 0) return '';
      const value = numberOr(score, 0);
      const match = ranks.find((rank) => value >= rank.min);
      return (match || ranks[ranks.length - 1]).title;
    },

    /**
     * Spieluhr als Text: 535 → "08:55"; ab 1440 (Mitternacht) mit Tag: "Tag 2, 07:31".
     * Bruchteile werden abgeschnitten, ungültige/negative Werte gelten als 0.
     * @param {number} minutes Minuten seit Mitternacht von Tag 1
     * @param {{withDay?: boolean}} [options] Zusatz: withDay false → nur "07:31" (z. B. Handy-Statusleiste)
     * @returns {string}
     */
    formatClock(minutes, { withDay = true } = {}) {
      const total = Math.max(0, Math.floor(numberOr(minutes, 0)));
      const day = Math.floor(total / MINUTES_PER_DAY) + 1;
      const ofDay = total % MINUTES_PER_DAY;
      const label = `${pad2(Math.floor(ofDay / MINUTES_PER_HOUR))}:${pad2(ofDay % MINUTES_PER_HOUR)}`;
      return day > 1 && withDay !== false ? `Tag ${day}, ${label}` : label;
    },

    /**
     * Verspätung gegenüber dem Vorlesungsbeginn in ganzen Minuten.
     * @param {number} minutes Spieluhr
     * @returns {number} max(0, minutes − LECTURE_MINUTES)
     */
    minutesLate(minutes) {
      return Math.max(0, Math.floor(numberOr(minutes, 0)) - CONFIG.CLOCK.LECTURE_MINUTES);
    },

    /**
     * Zusatz: Dauer für Statistiken, z. B. 45 → "45 min", 85 → "1 h 25 min".
     * @param {number} minutes
     * @returns {string}
     */
    formatDuration(minutes) {
      const total = Math.max(0, Math.floor(numberOr(minutes, 0)));
      if (total < MINUTES_PER_HOUR) return `${total} min`;
      return `${Math.floor(total / MINUTES_PER_HOUR)} h ${total % MINUTES_PER_HOUR} min`;
    },
  };

  return api;
})();
