/**
 * config.js – Zentrale Konfiguration des eduroam-Simulators.
 *
 * Alle festen Werte (Größen, Farben, Schriften, Zeiten, Strafen, Kapitel, Erfolge,
 * Score-Gewichte) liegen hier an EINER Stelle statt verstreut im Code.
 * Reine Daten: kein Phaser, kein DOM → auch in Node testbar.
 *
 * Globals: CONFIG (eingefroren, nur lesen), RUNTIME (veränderbare Laufzeit-Flags,
 * werden in main.js aus den URL-Parametern befüllt).
 * Abhängigkeiten: keine. Wird als erstes Spiel-Script geladen.
 */

const CONFIG = (() => {
  /** Farbpalette als Zahlen (0xRRGGBB) für Graphics/Rectangles/Tints. */
  const COLORS = {
    // Welt: Nachtblau (Hintergrund), Kopierpapier, Stempelrot, Baustellengelb
    BG: 0x0e2240,            // Nachtblau – Spielhintergrund
    BG_ALT: 0x173158,        // helleres Nachtblau – HUD, Flächen auf dem Hintergrund
    BG_DEEP: 0x091a33,       // dunkelstes Blau – Schatten, Vignette
    PAPER: 0xf2f3ef,         // kühles Kopierpapier (Merkblatt, Brief, Formulare)
    PAPER_SHADE: 0xdcdfd8,   // Papierschatten/Linien
    INK: 0x2b2f36,           // Tinte/Toner auf Papier
    INK_MUTED: 0x6b717c,     // blasser Toner
    DHBW_RED: 0xe2001a,      // DHBW-Rot = Stempelrot (Fehler, Ablehnung)
    HAZARD: 0xf5c400,        // Baustellengelb (Stuttgart 21) – Warnungen, Gefahren
    POSTIT: 0xfff176,        // Haftnotiz
    // System-UI (Android/Windows-Dialoge sollen echt aussehen)
    SURFACE: 0xffffff,       // Dialog-/Fensterfläche
    SURFACE_ALT: 0xf1f3f4,   // Android-Grau (Listen, Eingabefelder)
    BORDER: 0xdadce0,        // Rahmenlinien
    TEXT: 0x202124,          // Text auf hellen Flächen
    TEXT_MUTED: 0x5f6368,    // Sekundärtext
    TEXT_INVERSE: 0xf3f6fb,  // Text auf dunklem Grund
    PRIMARY: 0x1a73e8,       // System-Blau (Buttons, Links, Fokus)
    PRIMARY_DARK: 0x1557b0,  // gedrücktes System-Blau
    SUCCESS: 0x1e8e3e,       // Erfolg
    WARNING: 0xf29900,       // Warnung (Text/Icons auf hellem Grund)
    DANGER: 0xe2001a,        // Fehler (identisch mit DHBW_RED)
    SHADOW: 0x000000,
    WHITE: 0xffffff,
  };

  /** Dieselben Farben als CSS-Strings ('#rrggbb') für Phaser-Text-Styles. */
  const CSS = Object.fromEntries(
    Object.entries(COLORS).map(([name, value]) => [name, '#' + value.toString(16).padStart(6, '0')])
  );

  /**
   * Schriften: nur Systemschriften (keine externen Assets erlaubt).
   * Jede Rolle hat einen klaren Zweck – siehe docs/ARCHITECTURE.md.
   */
  const FONTS = {
    UI: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    PAPER: '"American Typewriter", "Courier New", Courier, monospace',
    HAND: '"Marker Felt", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
    STAMP: '"Arial Black", "Helvetica Neue", Impact, sans-serif',
    MONO: 'ui-monospace, Menlo, Consolas, "Courier New", monospace',
  };

  const CHAPTERS = [
    {
      id: 1,
      key: 'Ch1Registration',
      title: 'Die Registrierung',
      short: 'Konto aktivieren',
      intro:
        'Montag, 07:30 Uhr. Dein erster Tag an der DHBW Stuttgart.\n\n' +
        'Im Begrüßungsbrief stehen deine Kennung und ein Initialpasswort. ' +
        'Um 08:00 ist eine Moodle-Abgabe fällig, um 08:15 beginnt die Vorlesung. ' +
        'Den Raum verrät Rapla. Rapla braucht Internet, Internet braucht eduroam – ' +
        'und eduroam braucht ein aktiviertes Konto.\n\n' +
        'Also: ab ins Self-Service-Portal. Über dein letztes mobiles Datenvolumen.',
    },
    {
      id: 2,
      key: 'Ch2Config',
      title: 'Die Konfiguration',
      short: 'Handy einrichten',
      intro:
        'Konto aktiviert. Jetzt nur noch schnell das Handy mit eduroam verbinden.\n\n' +
        'Wie schwer kann das sein? Das offizielle IT-Merkblatt hilft bestimmt weiter.\n\n' +
        'Es ist von 2014.',
    },
    {
      id: 3,
      key: 'Ch3SignalHunt',
      title: 'Die Signaljagd',
      short: 'Signal finden',
      intro:
        'Verbunden! Aber da steht: „Kein Internet“.\n\n' +
        'Der Access Point im Hörsaal teilt sich gerade zwischen 180 Erstis auf. ' +
        'Lauf über den Campus, such dir Empfang und lad deine Referatsfolien herunter, ' +
        'bevor du dran bist. Meide Funklöcher und Menschentrauben.',
    },
    {
      id: 4,
      key: 'Ch4Certificate',
      title: 'Das Zertifikat',
      short: 'Evil Twin enttarnen',
      intro:
        'Verbindung getrennt. Dein Handy sieht jetzt drei Netze namens „eduroam“.\n\n' +
        'Eins davon ist ein Laptop-Hotspot von Kevin aus dem dritten Semester – ' +
        'und Kevin sammelt Passwörter.\n\n' +
        'Prüf die Zertifikate, bevor du einem vertraust.',
    },
    {
      id: 5,
      key: 'Ch5Helpdesk',
      title: 'Der IT-Helpdesk',
      short: 'Ticket lösen',
      intro:
        'Zu viele Fehlversuche: Dein Konto wurde vorsorglich gesperrt.\n\n' +
        'Jetzt hilft nur noch das IT.Service Center. Sprechzeiten: Mo–Do 09:00–11:00. ' +
        'Ticketsystem: rund um die Uhr. Antwortzeit: ja.',
    },
  ];

  /** Erfolge. Kapitel lösen nur IDs aus ihrem Block aus; global = GameState.finishRun. */
  const ACHIEVEMENTS = {
    // Kapitel 1
    PASSWORD_POET: { id: 'PASSWORD_POET', title: 'Passwort-Poet:in', description: 'Ein Passwort gebaut, das alle Regeln überlebt hat.' },
    TOS_READER: { id: 'TOS_READER', title: 'Kleingedrucktes gelesen', description: 'Das versteckte Wort in der Nutzungsordnung gefunden.' },
    CAPTCHA_HUMAN: { id: 'CAPTCHA_HUMAN', title: 'Nachweislich Mensch', description: 'Das CAPTCHA ohne Fehler gelöst.' },
    // Kapitel 2
    FIRST_TRY_CONFIG: { id: 'FIRST_TRY_CONFIG', title: 'Beim ersten Mal richtig', description: 'eduroam im ersten Versuch korrekt konfiguriert.' },
    ANON_IDENTITY: { id: 'ANON_IDENTITY', title: 'Anonym, aber richtig', description: 'Die anonyme Identität korrekt gesetzt.' },
    // Kapitel 3
    NO_DEADZONE: { id: 'NO_DEADZONE', title: 'Funklochfrei', description: 'Die Signaljagd ohne Verbindungsabbruch geschafft.' },
    BREZEL_LOVER: { id: 'BREZEL_LOVER', title: 'Brezel-Liebe', description: 'Fünf Brezeln auf dem Campus gesammelt.' },
    // Kapitel 4
    CERT_INSPECTOR: { id: 'CERT_INSPECTOR', title: 'Zertifikats-Detektiv:in', description: 'Jedes Zertifikat richtig beurteilt.' },
    PHISHED: { id: 'PHISHED', title: 'Kevin sagt danke', description: 'Dem Evil Twin vertraut. Autsch.' },
    // Kapitel 5
    TURNED_OFF_ON: { id: 'TURNED_OFF_ON', title: 'Aus und wieder an', description: 'Das Handy tatsächlich neu gestartet.' },
    HELPDESK_HERO: { id: 'HELPDESK_HERO', title: 'Ticket gelöst', description: 'Das IT.Service Center besiegt.' },
    // Global (vergibt GameState.finishRun)
    ON_TIME: { id: 'ON_TIME', title: 'Pünktlich wie die S-Bahn', description: 'Vor Vorlesungsbeginn (08:15) verbunden.' },
    ZEN_MASTER: { id: 'ZEN_MASTER', title: 'Innere Ruhe', description: 'Mit weniger als 40 % Frust verbunden.' },
    RAGE_QUIT: { id: 'RAGE_QUIT', title: 'Heilandsack!', description: 'Frust auf 100 %. Das Handy fliegt.' },
  };

  return {
    TITLE: 'eduroam – Authentifizierung fehlgeschlagen',
    SUBTITLE: 'DHBW Stuttgart Edition',
    VERSION: '1.0.0',

    WIDTH: 800,
    HEIGHT: 600,
    HUD_HEIGHT: 48,
    /** Fläche, die Kapitel bespielen (unterhalb der HUD-Leiste). */
    PLAY_AREA: { x: 0, y: 48, width: 800, height: 552 },

    COLORS,
    CSS,
    FONTS,

    CLOCK: {
      START_MINUTES: 7 * 60 + 30,      // 07:30 Spielstart
      MOODLE_DEADLINE_MINUTES: 8 * 60, // 08:00 Moodle-Abgabe
      LECTURE_MINUTES: 8 * 60 + 15,    // 08:15 Vorlesungsbeginn laut Rapla
      REAL_MS_PER_GAME_MINUTE: 4000,   // 4 echte Sekunden = 1 Spielminute
      /** Uhrzeit-Ereignisse: Toast im HUD + optional Frust (absolute Minuten seit Mitternacht von Tag 1). */
      MILESTONES: [
        { minutes: 8 * 60, text: '08:00 – Moodle-Abgabefrist verpasst. Danke, eduroam.', frustration: 4 },
        { minutes: 8 * 60 + 15, text: '08:15 – Die Vorlesung hat begonnen. Ohne dich.', frustration: 4 },
        { minutes: 9 * 60 + 45, text: '09:45 – Erste Vorlesung vorbei. Du hast angeblich nichts verpasst.', frustration: 0 },
        { minutes: 11 * 60 + 30, text: '11:30 – Die Mensa öffnet. Heute: Maultaschen.', frustration: 0 },
        { minutes: 14 * 60, text: '14:00 – Mensa geschlossen. Die Maultaschen sind weg.', frustration: 6 },
        { minutes: 24 * 60, text: 'Mitternacht. Neuer Tag, neues Glück?', frustration: 0 },
      ],
    },

    FRUSTRATION: { MAX: 100, TINY: 2, SMALL: 4, MEDIUM: 8, LARGE: 15, HUGE: 25 },
    PENALTY_MINUTES: { SMALL: 2, MEDIUM: 5, LARGE: 15, HUGE: 60 },

    TIMING: {
      CHAPTER_END_DELAY: 1400, // ms zwischen succeed() und Kapitelwechsel (Erfolgs-Effekt)
      TOAST_MS: 2400,
      INTRO_TYPEWRITER_MS: 16, // ms pro Zeichen im Kapitel-Intro
    },

    /** Zeichenebenen innerhalb einer Szene. */
    DEPTH: { BACKGROUND: -10, CONTENT: 0, UI: 100, OVERLAY: 500, DROPDOWN: 800, MODAL: 900, FX: 950, TOAST: 1000 },

    CHAPTERS,
    ACHIEVEMENTS,

    SCORE: {
      BASE: 10000,
      PER_MINUTE: 8,        // Abzug pro Spielminute seit 07:30
      PER_FAIL: 120,        // Abzug pro Fehlversuch
      PER_FRUSTRATION: 15,  // Abzug pro Prozentpunkt Frust-Spitzenwert
      PER_ACHIEVEMENT: 300, // Bonus pro Erfolg in diesem Lauf
      WIN_BONUS: 1000,
      LOSS_FACTOR: 0.3,     // Rage-Quit: Score × 0,3
    },
    RANKS: [
      { min: 9000, title: 'Netzwerk-Gottheit' },
      { min: 7000, title: 'eduroam-Profi' },
      { min: 5000, title: 'Fortgeschrittene:r Ersti' },
      { min: 3000, title: 'WLAN-Wanderer:in' },
      { min: 1000, title: 'Analogmensch' },
      { min: 0, title: 'Brieftaube empfohlen' },
    ],

    STORAGE_PREFIX: 'eduroamSim.v1.',
  };
})();

// Tiefes Einfrieren: CONFIG ist read-only, versehentliche Änderungen fallen sofort auf.
(function deepFreeze(obj) {
  Object.values(obj).forEach((value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  });
  return Object.freeze(obj);
})(CONFIG);

/**
 * Veränderbare Laufzeit-Flags. main.js befüllt sie aus den URL-Parametern
 * (?chapter=N, ?skipintro=1, ?mute=1, ?seed=S, ?unlock=all).
 */
const RUNTIME = {
  startChapter: null, // Zahl 1–5: direkt in dieses Kapitel springen
  skipIntro: false,   // Kapitel-Intros überspringen (Tests)
  muted: false,       // Ton aus erzwingen (Tests)
  seed: null,         // Seed für RNG (reproduzierbare Tests)
  unlockAll: false,   // alle Kapitel im Menü freischalten (Präsentation)
};
