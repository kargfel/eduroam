/**
 * ch5Helpdesk.js – Reine Logik für Kapitel 5 „Der IT-Helpdesk“ (Bosskampf).
 *
 * Enthält alle Kapitel-Inhalte als Daten und einen kleinen Zustandsautomaten:
 *   Formular (Support-Ticket) → Chat mit dem 1st Level → Warteschleife (Pop-up-Gewitter)
 *   → Chat mit dem 2nd Level → Finale „Aus- und wieder Einschalten“ → gelöst.
 * Der Ticket-Fortschritt (0 = Entwurf … 1 = gelöst) ist die Boss-HP.
 * Dazu: Pop-up-Typen und -Zeitplan (seedbar), Sprechzeiten-Prüfung mit der Spieluhr,
 * Ticket-Status-Etiketten, Passwort-Maskierung und alle Texte des Kapitels.
 *
 * Reine Logik: kein Phaser, kein DOM, kein GameState. Die Szene übergibt Kontext
 * (Uhrzeit, Passwort, phished-Flag, bisherige Fehlversuche) und bucht die gelieferten
 * Effekte (Frust, Zeitstrafe, Stempel) selbst über die ChapterScene-Helfer.
 * Zufall nur über RNG (global) oder ein injiziertes Objekt mit derselben API.
 *
 * Global: Ch5Logic (eingefroren).
 * Abhängigkeiten: CONFIG (beim Laden); CAMPUS und RNG nur zur Laufzeit.
 */

const Ch5Logic = (() => {
  const F = CONFIG.FRUSTRATION;
  const P = CONFIG.PENALTY_MINUTES;
  const MINUTES_PER_DAY = 24 * 60;

  /** Phasen des Zustandsautomaten. */
  const PHASES = Object.freeze({
    FORM: 'form',     // Support-Formular ausfüllen
    CHAT: 'chat',     // Dialogrunden mit dem 1st bzw. 2nd Level
    HOLD: 'hold',     // Warteschleife mit Pop-up-Gewitter
    FINALE: 'finale', // Power-Taste lange drücken → Neu starten
    DONE: 'done',     // Ticket gelöst
  });

  /**
   * Balance- und Interaktionswerte (die Szene liest sie, statt eigene Zahlen zu erfinden).
   * Frust-Budget (Unit-Test „Frust-Budget“): Unvermeidbar sind Zusammenführung, Warteschleife
   * und vorgezogener Notfall (+6) abzüglich des bestandenen Phishing-Tests (−2) = 4 %.
   * Ein normaler Lauf mit zwei typischen Fehlern („Ich rufe an“, „Ja, natürlich.“) landet bei
   * ca. 10 % (Ziel laut Briefing 8–12 %), zufälliges Klicken bei ca. 30 %.
   */
  const BALANCE = Object.freeze({
    MERCY_AFTER_WRONG: 2,         // ab so vielen Fehlern im selben Schritt kommt der Mitleids-Tipp
    OPTION_LABEL_MAX: 46,         // Zeichen – passt einzeilig auf einen Antwort-Button
    DESCRIPTION_MIN_LENGTH: 20,
    DESCRIPTION_MAX_LENGTH: 120,
    MIN_LOCK_ATTEMPTS: 5,         // „gesperrt nach mindestens 5 Fehlversuchen“
    FORM_ERROR_FRUSTRATION: F.TINY,
    PASSWORD_IN_TICKET_FRUSTRATION: F.SMALL,
    OFFICE_FORWARD_MINUTES: P.SMALL,
    RECATEGORIZE_MINUTES: P.SMALL,
    MERGED_FRUSTRATION: F.TINY,   // „Ticket zusammengeführt“ (mit dem rosa Drucker) – trifft alle
    PHISHING_TEST_RELIEF: F.TINY, // bestandener Phishing-Awareness-Test
    HOLD_FRUSTRATION: F.TINY,     // Warteschleife an sich nervt ein bisschen
    HOLD_SETBACK_FRUSTRATION: F.TINY, // ein Notfall wird vorgezogen
    HOLD_QUEUE_START: 4,          // Wartende vor dir
    HOLD_SETBACK_AMOUNT: 2,       // ein Notfall wird vorgezogen
    HOLD_TIMEOUT_SETBACK: 3,      // Sitzung abgelaufen → Platz verloren
    HOLD_QUEUE_MAX: 9,
    EARLY_RESTART_MINUTES: P.SMALL,
    POPUP_MAX_OPEN: 3,
    SESSION_TIMEOUT_SECONDS: 8,
    LONG_PRESS_MS: 1100,          // so lange muss die Power-Taste gehalten werden
    TRAP_TIP_AFTER: 2,            // nach so vielen Pop-up-Fallen kommt der ×-Tipp
    SHORT_PRESS_TIP_AFTER: 2,     // nach so vielen Kurzdrücken im Finale kommt der Halten-Tipp
  });

  /** Zeitplan der Pop-ups (ms Kapitel-Zeit der jeweiligen Phase). */
  const POPUP_SCHEDULE = Object.freeze({
    FORM_COOKIE_MS: 1200,
    CHAT_FIRST_MS: 3500,
    CHAT_GAP_MIN_MS: 9500,
    CHAT_GAP_MAX_MS: 13500,
    CHAT_COUNT: 14,
    HOLD_FIRST_MS: 800,
    HOLD_GAP_MIN_MS: 1800,
    HOLD_GAP_MAX_MS: 2600,
    HOLD_COUNT: 6,
    HOLD_STEP_MS: 2200, // alle 2,2 s rückt die Warteschlange einen Platz vor
  });

  /** Ticket-Fortschritt (Boss-HP) an festen Etappen; Runden bringen ihren eigenen Wert mit. */
  const PROGRESS = Object.freeze({ NONE: 0, TICKET_CREATED: 0.1, HOLD_DONE: 0.6, SOLVED: 1 });

  /** Status-Etiketten des Tickets nach Fortschritt (aufsteigend). */
  const STATUS_STAGES = Object.freeze([
    Object.freeze({ min: 0, label: 'Entwurf' }),
    Object.freeze({ min: 0.1, label: 'Offen' }),
    Object.freeze({ min: 0.25, label: 'In Bearbeitung' }),
    Object.freeze({ min: 0.5, label: 'Eskaliert' }),
    Object.freeze({ min: 0.6, label: 'In Bearbeitung (2nd Level)' }),
    Object.freeze({ min: 0.85, label: 'Lösung vorgeschlagen' }),
    Object.freeze({ min: 1, label: 'Gelöst' }),
  ]);

  /** Gesprächspartner:innen (fiktiv; Gruß an Häberle & Pfleiderer). */
  const AGENTS = Object.freeze({
    bot: Object.freeze({ id: 'bot', name: 'Ticketsystem', surname: 'Ticketsystem', role: 'automatisch' }),
    first: Object.freeze({ id: 'first', name: 'Herr Häberle', surname: 'Häberle', role: '1st Level' }),
    second: Object.freeze({ id: 'second', name: 'Herr Pfleiderer', surname: 'Pfleiderer', role: '2nd Level' }),
  });

  const WEEKDAYS = Object.freeze(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
  const WEEKDAY_NAMES = Object.freeze(['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']);
  const DEFAULT_HOURS = Object.freeze({ days: [0, 1, 2, 3], fromMinutes: 9 * 60, toMinutes: 11 * 60 });

  // ---------------------------------------------------------------------------
  // Support-Formular
  // ---------------------------------------------------------------------------

  /** Kategorien des Support-Formulars (u. a. echte Einträge wie „RosettaStone“). */
  const CATEGORIES = Object.freeze([
    Object.freeze({ value: 'wlan', label: 'WLAN-Zugang (eduroam)' }),
    Object.freeze({ value: 'account', label: 'Account gesperrt' }),
    Object.freeze({ value: 'password', label: 'Passwort vergessen',
      message: 'Sie haben Ihr Passwort nicht vergessen – Sie haben es zu oft falsch eingegeben. Das ist ein Unterschied.' }),
    Object.freeze({ value: 'rosetta', label: 'RosettaStone',
      message: 'RosettaStone ist die Sprachlern-Software. Einen Kurs für „Authentifizierung fehlgeschlagen“ gibt es dort nicht.' }),
    Object.freeze({ value: 'printing', label: 'Drucken & Kopieren',
      message: 'Drucken & Kopieren? Zum Kopierer kommen Sie früh genug. Erst muss das Konto wieder gehen.' }),
    Object.freeze({ value: 'other', label: 'Sonstiges',
      message: '„Sonstiges“ wird einmal pro Semester gesichtet. Wählen Sie lieber etwas Konkretes.' }),
  ]);
  const CORRECT_CATEGORY = 'account';
  const SOFT_CATEGORY = 'wlan'; // wird angenommen, aber verschoben (nur Zeitstrafe)

  /** Mitleids-Tipps je Formularfeld. */
  const formMercy = (campus) => ({
    category: 'Dein Problem: Das Konto ist gesperrt. Nimm die Kategorie „Account gesperrt“.',
    office: `Zuständig ist das Sekretariat deines Studiengangs: ${campus.courseName}.`,
    description: 'Beschreib kurz das Problem, z. B. „Konto gesperrt, eduroam: Authentifizierung fehlgeschlagen“. Kein Passwort!',
  });

  /** Optionen „Zuständiges Sekretariat“ (Pflichtfeld). */
  const buildOffices = (campus) => [
    { value: 'course', label: `Studiengang ${campus.courseName}`, isCorrect: true },
    { value: 'insurance', label: 'Studiengang BWL – Versicherung', minutes: P.SMALL,
      message: 'Weitergeleitet an BWL – Versicherung. Dort prüft man, ob Ihr Schaden versichert ist. Er ist es nicht.' },
    { value: 'technik', label: 'Fakultät Technik', minutes: P.SMALL,
      message: 'Weitergeleitet an die Fakultät Technik. Die ist nicht zuständig und schickt es zurück.' },
    { value: 'sozial', label: 'Fakultät Sozialwesen', minutes: P.SMALL,
      message: 'Weitergeleitet an die Fakultät Sozialwesen. Man hat dort viel Verständnis – aber keine Zuständigkeit.' },
    { value: 'its', label: campus.helpdesk.name, minutes: 0,
      message: `Das ${campus.helpdesk.name} ist kein Sekretariat. Es ist das, dem Sie gerade schreiben.` },
    // Hinweis erscheint als Toast (kurz halten, sonst verdeckt die Pille das Post-it)
    { value: 'unknown', label: 'Weiß ich nicht', disabled: true,
      hint: '„Weiß ich nicht“ zählt nicht.' },
  ];

  // ---------------------------------------------------------------------------
  // Texte (Platzhalter in {geschweiften Klammern})
  // ---------------------------------------------------------------------------

  const TEXT_TEMPLATES = Object.freeze({
    windowTitle: '{helpdesk}',
    headerNoTicket: 'Neues Ticket · Bibliotheks-PC (Gastsitzung)',
    headerTicket: 'Ticket {ticketId} · {category}',
    statusPrefix: 'Status: ',
    statusMerged: 'Status: Zusammengeführt',
    hoursLine: 'Telefon: {hours} · {status}',
    // Toasts (alle toast*/hours*-Texte): höchstens ca. 36 Zeichen – breitere Pillen verdecken das Post-it
    hoursOpened: 'Sprechzeit! Die Leitung ist besetzt.',
    hoursClosed: 'Sprechzeit vorbei. Bitte Ticket nutzen.',

    formTitle: 'Neue Support-Anfrage',
    formSubtitle: 'Alle Felder sind Pflichtfelder. Auch die optionalen.',
    formCategoryLabel: 'Kategorie *',
    formOfficeLabel: 'Zuständiges Sekretariat *',
    formDescriptionLabel: 'Beschreibung *',
    formDescriptionPlaceholder: 'z. B. Konto gesperrt, eduroam geht nicht',
    formDescriptionHint: 'Mind. {minLength} Zeichen',
    formDisclaimer: 'Spiel – bitte keine echten Zugangsdaten eingeben.',
    formSubmit: 'Ticket absenden',
    formPlaceholder: 'Bitte auswählen',

    ticketCreated: 'Ticket {ticketId} erstellt · Kategorie „{category}“',
    ticketRecategorized: 'Ticket von „{from}“ nach „{category}“ verschoben.',
    botName: 'Ticketsystem · automatische Nachricht',
    autoReply: 'Vielen Dank für Ihre Anfrage. Die durchschnittliche Bearbeitungszeit beträgt 5–7 Werktage.',
    lockStatus: 'Kontostatus {identity}: gesperrt nach {attempts} Fehlversuchen.{phishedNote}',
    agentJoined: '{name} ({role}) hat den Chat betreten.',
    escalated: 'Ticket an den 2nd Level eskaliert.',
    holdStarted: 'Sie werden mit dem 2nd Level verbunden. Diese Chat-Warteschleife wird musikalisch begleitet.',
    holdTitle: 'Warteschleife',
    holdPosition: 'Wartende vor Ihnen: {position}',
    holdMusic: '♪ Warteschleifenmusik ♪',
    holdNote: 'Ihr Chat ist uns wichtig. Bitte legen Sie nicht auf.',
    holdSetback: 'Ein Notfall wurde vorgezogen: Das Rektorat findet den Beamer-Knopf nicht. Wartende vor Ihnen: {position}',
    holdTimeout: 'Sitzung abgelaufen – zurück auf Platz {position} der Warteschlange.',
    holdDone: 'Sie sind dran.',
    chatTimeout: 'Sitzung abgelaufen. Neu angemeldet – der Chatverlauf ist zum Glück noch da.',
    phishingNote: 'Sicherheitshinweis: Das {helpdesk} verschickt keine Entsperr-Links. Die Adresse endete auf „.evil.example“.',
    accountUnlocked: 'Konto {identity} entsperrt.',
    solved: 'Ha, na also! Ich schließe das Ticket. Bitte bewerten Sie uns mit fünf Sternen.',
    solvedSystem: 'Ticket {ticketId}: Status „Gelöst“.',

    // HUD-Aufgaben: kurz halten, die HUD-Zeile ist nur ca. 312 px breit
    objectiveForm: 'Support-Ticket ausfüllen und absenden',
    objectiveChat: 'Dem Helpdesk antworten · Pop-ups: ×',
    objectiveHold: 'Warteschleife: Pop-ups wegklicken',
    objectiveFinale: 'Power-Taste lange halten → Neu starten',
    objectivePhoneOff: 'Handy einschalten: Power-Taste halten',
    objectiveDone: 'Ticket gelöst!',

    tipTitle: 'Tipp',
    tipMercyTitle: 'Mitleids-Tipp',
    tipForm: 'Konto gesperrt → Support-Ticket schreiben. Kategorie und Sekretariat passend wählen. Pop-ups: kleines × oben rechts.',
    tipChat: 'Antworte so, wie es bei eduroam richtig ist. Falsche Antworten kosten Nerven. Pop-ups: kleines ×.',
    tipHold: 'Warteschleife! Pop-ups wegklicken und „Sitzung verlängern“ nicht verpassen.',
    tipFinale: 'Power-Taste rechts am Handy GEDRÜCKT HALTEN, dann „Neu starten“.',
    tipPhoneOff: 'Handy ist aus. Power-Taste wieder lange gedrückt halten.',
    tipTraps: 'Große bunte Knöpfe in Pop-ups kosten Zeit. Immer das kleine × oben rechts nehmen!',
    tipShortPress: 'Nicht nur tippen: Power-Taste gedrückt HALTEN (gut eine Sekunde).',
    tipDone: 'Geschafft! Der IT-Helpdesk ist besiegt.',

    phoneWifiTitle: 'WLAN',
    phoneWifiToggle: 'WLAN verwenden',
    phoneStatusAuth: 'Authentifizierungsproblem',
    phoneStatusConnecting: 'Verbinden …', // „Verbindung wird hergestellt …“ passt nicht in die Handy-Zeile
    phoneStatusConnected: 'Verbunden',
    phoneGuestStatus: 'Anmeldung erforderlich',
    phoneKevinSsid: 'iPhone von Kevin',
    phoneKevinStatus: 'Gesichert',
    phoneLockedTitle: 'Konto gesperrt',
    phoneLockedText: 'Zu viele Fehlversuche. Bitte an das {helpdesk} wenden.',
    phoneUnlockedTitle: 'Konto entsperrt',
    phoneUnlockedText: 'eduroam hängt noch in der alten Sitzung fest.',
    phoneSolvedTitle: 'Ticket gelöst',
    phoneSolvedText: 'Willkommen im eduroam. Für heute.',
    phoneMenuOff: 'Ausschalten',
    phoneMenuRestart: 'Neu starten',
    phoneMenuEmergency: 'Notfallmodus',
    phoneRestarting: 'Wird neu gestartet …',
    phoneShuttingDown: 'Wird ausgeschaltet …',
    phoneBooting: 'Startet …',
    phoneOffHint: 'ausgeschaltet',
    powerTag: 'Power',

    toastStandby: 'Bildschirm aus. Taste länger halten!',
    toastOffShort: 'Handy ist aus. Taste länger halten!',
    toastEmergency: 'Notfall? Bitte nicht die 112 wählen.',
    toastEarlyRestart: 'Bringt nichts: Konto noch gesperrt.',
    toastFinaleHint: 'Power-Taste rechts am Handy halten!',
    toastTraps: 'Tipp: Immer das kleine × nehmen!',

    reasonTimeout: 'Sitzung abgelaufen',
    reasonEarlyRestart: 'Neustart ohne Wirkung',
    reasonRecategorized: 'Ticket verschoben',
    reasonHold: 'Warteschleife',
    reasonMerged: 'Mit Druckerticket zusammengeführt',
    reasonSetback: 'Notfall vorgezogen',
    reliefPhishingTest: 'Phishing-Test bestanden',
    stampSolved: 'GELÖST',
  });

  // ---------------------------------------------------------------------------
  // Pop-ups (jedes hat zusätzlich ein kleines × – das ist immer die sichere Wahl)
  // ---------------------------------------------------------------------------

  const POPUP_DEFS = Object.freeze({
    cookie: Object.freeze({
      title: 'Cookie-Hinweis',
      text: 'Wir verwenden Cookies. Ohne Cookies funktioniert das Ticketsystem nicht. Mit Cookies nur bedingt.',
      isBanner: true,
      actions: Object.freeze([
        Object.freeze({ id: 'accept', label: 'Alle akzeptieren', variant: 'primary' }),
        Object.freeze({ id: 'settings', label: 'Einstellungen', variant: 'link',
          trap: Object.freeze({ reason: '147 Partner einzeln abgewählt', frustration: F.TINY, minutes: P.SMALL }) }),
      ]),
    }),
    merged: Object.freeze({
      title: 'Ticket zusammengeführt',
      text: 'Ihr Ticket wurde mit {otherTicketId} („Drucker im 3. OG druckt nur rosa“) zusammengeführt.',
      actions: Object.freeze([Object.freeze({ id: 'ok', label: 'OK', variant: 'secondary' })]),
    }),
    survey: Object.freeze({
      title: 'Kurze Umfrage (2 Minuten)',
      text: 'Wie zufrieden sind Sie mit der Lösung Ihres Tickets? (Es ist noch nicht gelöst.)',
      actions: Object.freeze([
        Object.freeze({ id: 'join', label: 'Jetzt teilnehmen', variant: 'primary',
          trap: Object.freeze({ reason: '37 Fragen beantwortet', frustration: F.TINY, minutes: P.MEDIUM }) }),
      ]),
    }),
    newsletter: Object.freeze({
      title: 'ITS-Newsletter',
      text: 'Bleiben Sie informiert über geplante und ungeplante Ausfälle!',
      actions: Object.freeze([
        Object.freeze({ id: 'subscribe', label: 'Abonnieren', variant: 'primary',
          trap: Object.freeze({ reason: 'Mail an gesperrtes Postfach', frustration: F.TINY, minutes: 0 }) }),
      ]),
    }),
    phishing: Object.freeze({
      title: 'Konto sofort entsperren!',
      text: 'Ihr Konto ist gesperrt. Jetzt entsperren unter {phishingUrl}',
      actions: Object.freeze([
        Object.freeze({ id: 'unlock', label: 'Jetzt entsperren', variant: 'primary',
          trap: Object.freeze({ reason: 'Das war Kevin, nicht die IT', frustration: F.MEDIUM, minutes: P.MEDIUM,
            stamp: 'PHISHING', chatNote: true }) }),
      ]),
    }),
    timeout: Object.freeze({
      title: 'Sitzung läuft ab',
      text: 'Ihre Gastsitzung am Bibliotheks-PC endet in {seconds} s.',
      timeoutSeconds: BALANCE.SESSION_TIMEOUT_SECONDS,
      onTimeout: Object.freeze({ reason: 'Sitzung abgelaufen', frustration: F.SMALL, minutes: P.SMALL }),
      actions: Object.freeze([Object.freeze({ id: 'extend', label: 'Sitzung verlängern', variant: 'primary' })]),
    }),
    browser: Object.freeze({
      title: 'Browser veraltet',
      text: 'Das Ticketsystem unterstützt offiziell nur den Internet Explorer 11.',
      actions: Object.freeze([]),
    }),
    lms: Object.freeze({
      title: '{lms}',
      text: 'Erinnerung: Abgabe „Referatsfolien“ – Frist abgelaufen.',
      actions: Object.freeze([]),
    }),
    maintenance: Object.freeze({
      title: 'Wartungsfenster',
      text: 'Das Ticketsystem ist heute von 08:00 bis 18:00 eingeschränkt verfügbar.',
      actions: Object.freeze([]),
    }),
  });
  const POPUP_TYPES = Object.freeze(Object.keys(POPUP_DEFS));
  const CHAT_POPUP_POOL = Object.freeze(['survey', 'newsletter', 'browser', 'lms', 'maintenance', 'timeout']);
  const REFILL_POPUP_POOL = Object.freeze(['survey', 'newsletter', 'browser', 'lms', 'maintenance']);
  const HOLD_POPUP_POOL = Object.freeze(['survey', 'newsletter', 'browser', 'lms', 'maintenance']);

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------

  /** Ersetzt {schlüssel} durch values[schlüssel]; unbekannte Platzhalter bleiben stehen. */
  const format = (template, values = {}) =>
    String(template).replace(/\{([a-zA-Z]+)\}/g, (match, key) =>
      (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));

  /** 545 → "09:05" (lokal, damit die Logik nicht von Scoring abhängt). */
  const formatHm = (minutes) => {
    const dayMinutes = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(dayMinutes / 60))}:${pad(dayMinutes % 60)}`;
  };

  /**
   * Notfall-Zufall (mulberry32, fester Seed), falls weder ein Generator injiziert
   * wurde noch RNG geladen ist. Deterministisch – niemals Math.random().
   */
  const createFallbackRng = (seed = 1) => {
    let state = seed >>> 0;
    const next = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      pick: (items) => (items && items.length ? items[Math.floor(next() * items.length)] : undefined),
      shuffle: (items) => {
        const copy = Array.from(items || []);
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      },
    };
  };

  /** Injizierter Generator → globaler RNG → deterministischer Notfall-Generator. */
  const resolveRng = (rng) => {
    if (rng && typeof rng.next === 'function') return rng;
    if (typeof RNG !== 'undefined' && RNG && typeof RNG.shuffle === 'function') return RNG;
    return createFallbackRng();
  };

  const resolveCampus = (campus) => campus || (typeof CAMPUS !== 'undefined' ? CAMPUS : null);

  /** Basis-Domain der Hochschule aus dem Realm, z. B. „dhbw-stuttgart.de“. */
  const baseDomain = (campus) => String(campus.realm || 'dhbw-stuttgart.de').split('.').slice(-2).join('.');

  /** Täuschend echte, aber falsche Adresse für das Phishing-Pop-up (immer .example). */
  const getPhishingUrl = (campus) => `${baseDomain(resolveCampus(campus))}.evil.example/entsperren`;

  /** Adresse des Ticketsystems, abgeleitet vom (fiktiven) Portal; endet garantiert auf .example. */
  const getTicketUrl = (campus) => {
    const url = String(resolveCampus(campus).portal.url || '');
    const match = url.match(/^(https?:\/\/)?([^/]+)/);
    let host = match ? match[2] : 'support.example';
    const labels = host.split('.');
    if (labels.length >= 3) labels[0] = 'support';
    host = labels.join('.');
    if (!host.endsWith('.example')) host += '.example';
    return `https://${host}/ticket/neu`;
  };

  /** Ticketnummer wie „ITSD-104711“. */
  const makeTicketId = (campus, rng) =>
    `${resolveCampus(campus).helpdesk.ticketPrefix}-${resolveRng(rng).int(100000, 999999)}`;

  /** Zeigt höchstens die ersten zwei Zeichen, Rest als Punkte (kurze Passwörter komplett verdeckt). */
  const maskPassword = (password) => {
    const value = String(password || '');
    if (value.length < 6) return '••••••••';
    return value.slice(0, 2) + '•'.repeat(Math.min(8, value.length - 2));
  };

  /** Status-Etikett zum Ticket-Fortschritt. */
  const getStatusLabel = (progress) => {
    const value = Number(progress) || 0;
    let label = STATUS_STAGES[0].label;
    for (const stage of STATUS_STAGES) if (value + 1e-9 >= stage.min) label = stage.label;
    return label;
  };

  /**
   * Liest Sprechzeiten wie „Mo–Do 09:00–11:00“ (auch mit „-“). Tag 0 = Montag
   * (das Spiel beginnt an einem Montag). Unlesbares → Mo–Do 09:00–11:00.
   * @returns {{ days: number[], fromMinutes: number, toMinutes: number }}
   */
  const parseOfficeHours = (hours) => {
    const text = String(hours || '');
    const time = text.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
    if (!time) return { ...DEFAULT_HOURS, days: [...DEFAULT_HOURS.days] };
    const fromMinutes = Number(time[1]) * 60 + Number(time[2]);
    const toMinutes = Number(time[3]) * 60 + Number(time[4]);
    let days = [0, 1, 2, 3, 4, 5, 6];
    const range = text.match(/(Mo|Di|Mi|Do|Fr|Sa|So)\s*[–-]\s*(Mo|Di|Mi|Do|Fr|Sa|So)/);
    if (range) {
      const start = WEEKDAYS.indexOf(range[1]);
      const end = WEEKDAYS.indexOf(range[2]);
      days = [];
      for (let d = start; ; d = (d + 1) % 7) {
        days.push(d);
        if (d === end || days.length >= 7) break;
      }
    }
    if (!(toMinutes > fromMinutes)) return { ...DEFAULT_HOURS, days: [...DEFAULT_HOURS.days] };
    return { days, fromMinutes, toMinutes };
  };

  /**
   * Sprechzeiten-Status zur Spieluhr (Minuten seit Mitternacht von Tag 1 = Montag).
   * @returns {{ isOpen: boolean, minutesUntilOpen: number, minutesUntilClose: number, text: string }}
   */
  const getOfficeHoursStatus = (clockMinutes, hours) => {
    const parsed = parseOfficeHours(hours);
    const minutes = Math.max(0, Number(clockMinutes) || 0);
    const day = Math.floor(minutes / MINUTES_PER_DAY);
    const weekday = day % 7;
    const minuteOfDay = minutes - day * MINUTES_PER_DAY;
    const isWorkday = parsed.days.includes(weekday);
    const opensAt = formatHm(parsed.fromMinutes);

    if (isWorkday && minuteOfDay >= parsed.fromMinutes && minuteOfDay < parsed.toMinutes) {
      const left = Math.ceil(parsed.toMinutes - minuteOfDay);
      return { isOpen: true, minutesUntilOpen: 0, minutesUntilClose: left, text: `geöffnet (noch ${left} min)` };
    }
    if (isWorkday && minuteOfDay < parsed.fromMinutes) {
      const wait = Math.ceil(parsed.fromMinutes - minuteOfDay);
      return { isOpen: false, minutesUntilOpen: wait, minutesUntilClose: 0, text: `geschlossen (öffnet ${opensAt})` };
    }
    let daysAhead = 1;
    while (daysAhead < 7 && !parsed.days.includes((weekday + daysAhead) % 7)) daysAhead += 1;
    const wait = Math.ceil(daysAhead * MINUTES_PER_DAY + parsed.fromMinutes - minuteOfDay);
    const when = daysAhead === 1 ? 'morgen' : WEEKDAY_NAMES[(weekday + daysAhead) % 7];
    return { isOpen: false, minutesUntilOpen: wait, minutesUntilClose: 0, text: `geschlossen (wieder ${when} ab ${opensAt})` };
  };

  /** Kategorien für das Dropdown ({ value, label }). */
  const getCategoryOptions = () => CATEGORIES.map(({ value, label }) => ({ value, label }));

  /** Sekretariate für das Dropdown ({ value, label, disabled?, hint? }). */
  const getOfficeOptions = (campus) =>
    buildOffices(resolveCampus(campus)).map(({ value, label, disabled, hint }) =>
      (disabled ? { value, label, disabled: true, hint } : { value, label }));

  /** Liefert ein Formular-Fehlerergebnis. */
  const formError = (field, code, message, reason, { frustration = BALANCE.FORM_ERROR_FRUSTRATION, minutes = 0, clearField = false } = {}) =>
    ({ ok: false, field, code, message, reason, frustration, minutes, clearField, isSoft: false });

  /**
   * Prüft das Support-Formular der Reihe nach (Kategorie → Sekretariat → Beschreibung).
   * @param {{ category?: string, office?: string, description?: string }} form
   * @param {object} [campus=CAMPUS]
   * @param {{ passwords?: string[] }} [opts] Passwörter, die nicht ins Ticket dürfen
   *   (Initial- und Standardpasswort aus CAMPUS werden immer geprüft)
   * @returns {{ ok, field, code, message, reason, frustration, minutes, isSoft, clearField?, category?, categoryLabel?, fromLabel? }}
   */
  const validateTicketForm = (form = {}, campus = null, { passwords = [] } = {}) => {
    const place = resolveCampus(campus);
    const values = form || {};
    const category = CATEGORIES.find((c) => c.value === values.category);
    if (!category) return formError('category', 'missing', 'Bitte wählen Sie eine Kategorie.', 'Kategorie fehlt');
    if (category.value !== CORRECT_CATEGORY && category.value !== SOFT_CATEGORY) {
      return formError('category', category.value, category.message, 'Falsche Kategorie');
    }

    const office = buildOffices(place).find((o) => o.value === values.office);
    if (!office || office.disabled) {
      return formError('office', 'missing', 'Pflichtfeld „Zuständiges Sekretariat“ fehlt.', 'Pflichtfeld fehlt');
    }
    if (!office.isCorrect) {
      return formError('office', office.value, office.message, 'Falsches Sekretariat', { minutes: office.minutes || 0 });
    }

    const description = String(values.description || '').trim();
    const secrets = [...passwords, place.initialPassword, place.defaultPassword]
      .filter((secret) => typeof secret === 'string' && secret.length >= 4);
    if (secrets.some((secret) => description.includes(secret))) {
      return formError('description', 'password',
        'Bitte niemals Passwörter in ein Ticket schreiben – Tickets lesen viele mit. Das Feld wurde geleert.',
        'Passwort im Ticket!', { frustration: BALANCE.PASSWORD_IN_TICKET_FRUSTRATION, clearField: true });
    }
    if (description.length < BALANCE.DESCRIPTION_MIN_LENGTH) {
      return formError('description', 'short',
        `Bitte beschreiben Sie Ihr Problem genauer (mind. ${BALANCE.DESCRIPTION_MIN_LENGTH} Zeichen). „Geht nicht“ hatten wir heute schon 40-mal.`,
        'Beschreibung zu kurz');
    }

    const correctLabel = CATEGORIES.find((c) => c.value === CORRECT_CATEGORY).label;
    const isSoft = category.value === SOFT_CATEGORY;
    return {
      ok: true,
      field: null,
      code: isSoft ? 'recategorized' : 'ok',
      message: isSoft
        ? format(TEXT_TEMPLATES.ticketRecategorized, { from: category.label, category: correctLabel })
        : 'Ticket erstellt.',
      reason: isSoft ? TEXT_TEMPLATES.reasonRecategorized : '',
      frustration: 0,
      minutes: isSoft ? BALANCE.RECATEGORIZE_MINUTES : 0,
      isSoft,
      clearField: false,
      category: CORRECT_CATEGORY,
      categoryLabel: correctLabel,
      fromLabel: category.label,
    };
  };

  /**
   * Alle Texte des Kapitels mit aufgelösten Campus-Werten (flaches Objekt aus Strings).
   * Dynamische Platzhalter ({ticketId}, {position}, {seconds} …) setzt die Szene per format() ein.
   * @param {object} [campus=CAMPUS]
   * @param {{ totalFails?: number, isPhished?: boolean }} [context]
   */
  const getTexts = (campus = null, { totalFails = 0, isPhished = false } = {}) => {
    const place = resolveCampus(campus);
    const values = {
      helpdesk: place.helpdesk.name,
      identity: place.identity,
      hours: place.helpdesk.hours,
      courseName: place.courseName,
      realm: place.realm,
      lms: place.services.lms,
      minLength: BALANCE.DESCRIPTION_MIN_LENGTH,
      attempts: Math.max(BALANCE.MIN_LOCK_ATTEMPTS, Math.round(Number(totalFails) || 0)),
      phishedNote: isPhished ? ' Davon 12 von „Kevins-MacBook“.' : '',
    };
    const texts = {};
    for (const [key, template] of Object.entries(TEXT_TEMPLATES)) texts[key] = format(template, values);
    return texts;
  };

  /**
   * Die Dialogrunden des Bosskampfs, Texte aus CAMPUS und Kontext aufgelöst.
   * Jede Runde: { id, agent, message, mercy, progressAfter, next?, options[] };
   * Option: { id, label, isCorrect?, advances?, reply | byHours, reason, frustration, minutes, stamp?, relief? }.
   * @param {object} [campus=CAMPUS]
   * @param {{ password?: string, isPhished?: boolean, totalFails?: number }} [context]
   */
  const buildRounds = (campus = null, { password = '', isPhished = false, totalFails = 0 } = {}) => {
    const place = resolveCampus(campus);
    const hd = place.helpdesk;
    const wifi = place.wifi;
    const attempts = Math.max(BALANCE.MIN_LOCK_ATTEMPTS, Math.round(Number(totalFails) || 0));
    const wrong = (props) => Object.freeze({ isCorrect: false, minutes: 0, stamp: null, ...props });
    const right = (props) => Object.freeze({ isCorrect: true, frustration: 0, minutes: 0, stamp: null, reason: '', ...props });

    const rounds = [
      {
        id: 'identity',
        agent: 'first',
        message: `Grüß Gott, ${AGENTS.first.surname} vom ${hd.name}. Mit welcher Identität melden Sie sich im eduroam an?`,
        options: [
          right({ id: 'identity', label: place.identity,
            reply: `Danke. Konto gefunden: gesperrt nach ${attempts} Fehlversuchen. Nicht schlecht für einen Montag.` }),
          wrong({ id: 'username', label: place.username, reason: 'Realm fehlt', frustration: F.SMALL,
            reply: `Ohne „@${place.realm}“ weiß eduroam nicht, wohin mit Ihrer Anmeldung. Deshalb sind Sie ja hier.` }),
          wrong({ id: 'anonymous', label: place.anonymousIdentity, reason: 'Nur die anonyme Identität', frustration: F.SMALL,
            reply: 'Das ist die anonyme Identität – die heißt bei allen so. Ich brauche Ihre echte.' }),
          wrong({ id: 'name', label: `${place.studentName}, ${place.course}`, reason: 'Name ist keine Kennung', frustration: F.SMALL,
            reply: `Wir haben 14 Personen namens ${place.studentName}. Drei davon im ${place.course}.` }),
        ],
        mercy: `Identität = Kennung@Realm, also ${place.identity}. Die anonyme Identität ist nur die äußere Hülle.`,
        progressAfter: 0.25,
      },
      {
        id: 'password',
        agent: 'first',
        message: 'Zur Verifizierung nennen Sie mir bitte noch kurz Ihr aktuelles Passwort.',
        options: [
          right({ id: 'refuse', label: 'Nein. Die IT fragt nie nach Passwörtern.', relief: BALANCE.PHISHING_TEST_RELIEF,
            reliefReason: TEXT_TEMPLATES.reliefPhishingTest,
            reply: 'Richtig! Das war unser Phishing-Awareness-Test. Bestanden. Sie glauben nicht, wie viele hier durchfallen.' }),
          wrong({ id: 'send', label: `Klar: ${maskPassword(password)}`, reason: 'Passwort verraten!',
            frustration: F.LARGE, minutes: P.MEDIUM, stamp: 'DURCHGEFALLEN',
            reply: 'Durchgefallen: Die IT fragt NIE nach Ihrem Passwort – auch ich nicht. Es gilt jetzt als kompromittiert.'
              + (isPhished ? ' Kevin hatte es allerdings eh schon.' : '') }),
          wrong({ id: 'mail', label: 'Ich schicke es Ihnen lieber per E-Mail.', reason: 'Passwort per E-Mail?!', frustration: F.SMALL,
            reply: 'Per E-Mail ist es genauso verraten. Ein Passwort gehört niemandem außer Ihnen.' }),
          wrong({ id: 'half', label: 'Nur die erste Hälfte, okay?', reason: 'Halbes Passwort verraten', frustration: F.SMALL,
            reply: 'Ein halbes Passwort ist immer noch ein ganzes Sicherheitsproblem.' }),
        ],
        mercy: 'Echte IT-Mitarbeitende fragen NIE nach deinem Passwort. Auch nicht „zur Verifizierung“.',
        progressAfter: 0.4,
      },
      {
        id: 'escalate',
        agent: 'first',
        message: 'Entsperren darf ich im 1st Level leider nicht. Wie möchten Sie weitermachen?',
        options: [
          right({ id: 'escalate', label: 'Bitte an den 2nd-Level-Support eskalieren.',
            reply: 'Ich eskaliere. Bitte bleiben Sie im Chat – wir haben jetzt auch Warteschleifenmusik.' }),
          wrong({ id: 'call', label: `Ich rufe an: ${hd.phone}`, reason: 'Außerhalb der Sprechzeit', frustration: F.SMALL,
            byHours: Object.freeze({
              closed: Object.freeze({ reason: 'Außerhalb der Sprechzeit', minutes: P.SMALL,
                reply: `Bandansage: „Sie rufen außerhalb unserer Sprechzeiten an (${hd.hours}). Bitte nutzen Sie unser Ticketsystem.“` }),
              open: Object.freeze({ reason: 'Telefon-Warteschleife', minutes: P.MEDIUM,
                reply: '„Sie sind Platz 47 in der Warteschlange.“ Fünf Minuten später: „Bitte nutzen Sie unser Ticketsystem.“' }),
            }) }),
          wrong({ id: 'visit', label: `Ich komme persönlich ins ${hd.name}.`, reason: 'Umsonst hingelaufen',
            frustration: F.SMALL, minutes: P.MEDIUM,
            reply: 'Sie laufen hin. An der Tür hängt ein Zettel: „Bitte nutzen Sie unser Ticketsystem.“' }),
          wrong({ id: 'mail', label: 'Ich schreibe dem Support eine E-Mail.', reason: 'Postfach gesperrt', frustration: F.SMALL,
            reply: 'Von welcher Adresse? Ihr Konto ist gesperrt – Ihr Postfach also auch.' }),
        ],
        mercy: 'Im 1st Level geht es nicht weiter: Lass das Ticket an den 2nd Level eskalieren.',
        progressAfter: 0.5,
        next: PHASES.HOLD,
      },
      {
        id: 'certificate',
        agent: 'second',
        message: `${AGENTS.second.surname}, 2nd Level, grüß Gott. Hab Ihr Ticket überflogen. Welches CA-Zertifikat steht in Ihrem eduroam-Profil?`,
        options: [
          right({ id: 'system', label: `${wifi.caCertOption} + Domain`,
            reply: `Korrekt: Systemzertifikate plus Domain ${wifi.domain}. So prüft Ihr Handy, dass es wirklich mit uns spricht.` }),
          wrong({ id: 'novalidate', label: 'Nicht validieren', reason: 'Gibt’s seit Android 11 nicht', frustration: F.SMALL,
            reply: 'Gibt es seit Android 11 nicht mehr. Zum Glück: Sonst könnte jeder Hotspot namens „eduroam“ Ihre Anmeldung mitschneiden.' }),
          wrong({ id: 'outdated', label: `${place.certificate.outdatedRootCA} (Merkblatt)`, reason: 'Merkblatt von 2014', frustration: F.SMALL,
            reply: 'Das steht im Merkblatt von 2014. Das Merkblatt ist inzwischen selbst ein Sicherheitsrisiko.' }),
          wrong({ id: 'kevin', label: 'Das von Kevin aus dem dritten Semester.', reason: 'Kevin ist nicht die IT', frustration: F.SMALL,
            reply: isPhished
              ? 'Ah, daher die Anmeldungen von „Kevins-MacBook“. Bitte sofort löschen.'
              : 'Kevin ist nicht die IT. Fremde Zertifikate bitte sofort löschen.' }),
        ],
        mercy: `Richtig ist „${wifi.caCertOption}“ – zusammen mit der Domain ${wifi.domain}.`,
        progressAfter: 0.72,
      },
      {
        id: 'newPassword',
        agent: 'second',
        message: 'Ich entsperre Ihr Konto und setze ein neues Initialpasswort. Wie möchten Sie es bekommen?',
        options: [
          right({ id: 'copier', label: 'Mit dem Studierendenausweis am Kopierer.',
            reply: 'Genau, das gibt es wirklich: Studierendenausweis an einen DHBW-Kopierer, neues Passwort ausdrucken. Konto ist entsperrt.' }),
          wrong({ id: 'mail', label: 'Per E-Mail, bitte.', reason: 'Nie per E-Mail', frustration: F.SMALL,
            reply: 'Passwörter verschicken wir nie per E-Mail. Und an welches Postfach? Ihres ist gesperrt.' }),
          wrong({ id: 'post', label: 'Per Post nach Hause.', reason: 'Dauert 3–5 Werktage', frustration: F.TINY,
            reply: 'Geht tatsächlich – dauert aber 3–5 Werktage. Die Vorlesung ist heute. Lieber etwas Schnelleres?' }),
          wrong({ id: 'pigeon', label: 'Per Brieftaube.', reason: 'Keine Brieftauben mehr', frustration: F.TINY,
            reply: 'Brieftauben unterstützen wir seit der Berufsakademie-Zeit nicht mehr.' }),
        ],
        mercy: 'Kein Witz: Ersatz-Passwörter gibt es persönlich, per Post – oder mit dem Studierendenausweis am Kopierer.',
        progressAfter: 0.85,
      },
      {
        id: 'restart',
        agent: 'second',
        message: 'Konto ist entsperrt. Ihr Handy hängt vermutlich noch in der alten Sitzung. Haben Sie es schon mit Aus- und wieder Einschalten versucht?',
        options: [
          wrong({ id: 'lie', label: 'Ja, natürlich.', reason: 'Das sagen alle', frustration: F.TINY, advances: true,
            reply: 'Das sagen alle. Bitte trotzdem: Power-Taste rechts am Handy lange gedrückt halten, dann „Neu starten“.' }),
          right({ id: 'try', label: 'Nein … ich probier’s.',
            reply: 'Dann bitte jetzt: Power-Taste rechts am Handy lange gedrückt halten, dann „Neu starten“.' }),
        ],
        mercy: 'Power-Taste rechts am Handy lange gedrückt halten, dann „Neu starten“.',
        progressAfter: 0.92,
        next: PHASES.FINALE,
      },
    ];
    return Object.freeze(rounds.map((round) => Object.freeze({ ...round, options: Object.freeze(round.options) })));
  };

  /**
   * Ein Pop-up mit aufgelösten Texten. {seconds} bleibt stehen, wenn nicht übergeben
   * (die Szene setzt den Countdown pro Sekunde ein).
   * @param {string} type Schlüssel aus POPUP_TYPES
   * @param {object} [campus=CAMPUS]
   * @param {{ ticketId?: string, otherTicketId?: string, seconds?: number }} [values]
   * @returns {object|null} { type, title, text, isBanner, timeoutSeconds, onTimeout, actions[] }
   */
  const getPopup = (type, campus = null, values = {}) => {
    const def = POPUP_DEFS[type];
    if (!def) return null;
    const place = resolveCampus(campus);
    const fill = {
      phishingUrl: getPhishingUrl(place),
      lms: place.services.lms,
      helpdesk: place.helpdesk.name,
      ticketId: values.ticketId || `${place.helpdesk.ticketPrefix}-000000`,
      otherTicketId: values.otherTicketId || `${place.helpdesk.ticketPrefix}-000001`,
    };
    if (values.seconds !== undefined) fill.seconds = values.seconds;
    return {
      type,
      title: format(def.title, fill),
      text: format(def.text, fill),
      isBanner: Boolean(def.isBanner),
      timeoutSeconds: def.timeoutSeconds || 0,
      onTimeout: def.onTimeout ? { ...def.onTimeout } : null,
      actions: def.actions.map((action) => ({
        id: action.id,
        label: action.label,
        variant: action.variant || 'secondary',
        trap: action.trap ? { minutes: 0, stamp: null, chatNote: false, ...action.trap } : null,
      })),
    };
  };

  /**
   * Zeitplan der Pop-ups für eine Phase.
   * 'form': nur der Cookie-Banner. 'chat': erst „zusammengeführt“, dann gemischt – Phishing
   * und Sitzungs-Timeout genau einmal. 'hold': dichtes Gewitter mit einem Timeout früh genug.
   * @param {'form'|'chat'|'hold'} kind
   * @param {object} [rng] Generator mit RNG-API (Standard: globaler RNG)
   * @returns {{ atMs: number, type: string }[]}
   */
  const buildPopupSchedule = (kind, rng = null) => {
    const S = POPUP_SCHEDULE;
    if (kind === 'form') return [{ atMs: S.FORM_COOKIE_MS, type: 'cookie' }];
    if (kind !== 'chat' && kind !== 'hold') return [];
    const random = resolveRng(rng);
    let types;
    let atMs;
    let gapMin;
    let gapMax;
    let count;
    if (kind === 'chat') {
      const block = random.shuffle(CHAT_POPUP_POOL);
      block.splice(random.int(1, 3), 0, 'phishing'); // garantiert, aber nicht gleich als Erstes
      types = ['merged', ...block];
      while (types.length < S.CHAT_COUNT) types.push(...random.shuffle(REFILL_POPUP_POOL));
      atMs = S.CHAT_FIRST_MS;
      gapMin = S.CHAT_GAP_MIN_MS;
      gapMax = S.CHAT_GAP_MAX_MS;
      count = S.CHAT_COUNT;
    } else {
      const pool = random.shuffle(HOLD_POPUP_POOL);
      types = [pool[0], 'timeout', ...pool.slice(1)];
      while (types.length < S.HOLD_COUNT) types.push(...random.shuffle(HOLD_POPUP_POOL));
      atMs = S.HOLD_FIRST_MS;
      gapMin = S.HOLD_GAP_MIN_MS;
      gapMax = S.HOLD_GAP_MAX_MS;
      count = S.HOLD_COUNT;
    }
    const schedule = [];
    for (let i = 0; i < count; i++) {
      schedule.push({ atMs, type: types[i] });
      atMs += random.int(gapMin, gapMax);
    }
    return schedule;
  };

  // ---------------------------------------------------------------------------
  // Zustandsautomat
  // ---------------------------------------------------------------------------

  /** Ein Durchlauf des Helpdesk-Bosskampfs (Formular → … → gelöst). */
  class HelpdeskSession {
    /**
     * @param {object} [opts]
     * @param {object} [opts.campus=CAMPUS]
     * @param {object} [opts.rng] Generator mit RNG-API (Standard: globaler RNG)
     * @param {{ password?: string, isPhished?: boolean, totalFails?: number }} [opts.context]
     */
    constructor({ campus = null, rng = null, context = {} } = {}) {
      this.campus = resolveCampus(campus);
      this.rng = resolveRng(rng);
      this.context = { password: '', isPhished: false, totalFails: 0, ...context };
      this.texts = getTexts(this.campus, this.context);
      this.rounds = buildRounds(this.campus, this.context);
      this.phase = PHASES.FORM;
      this.progress = PROGRESS.NONE;
      this.roundIndex = -1;
      this.optionOrder = [];
      this.disabledOptions = new Set();
      this.wrongInRound = 0;
      this.wrongTotal = 0;
      this.formErrors = {};
      this.category = null;
      this.categoryLabel = '';
      this.queue = null;
      this.hasRestarted = false;
      this.ticketId = makeTicketId(this.campus, this.rng);
      this.otherTicketId = makeTicketId(this.campus, this.rng);
    }

    getPhase() { return this.phase; }
    getProgress() { return this.progress; }
    getStatusLabel() { return getStatusLabel(this.progress); }
    getTicketId() { return this.ticketId; }
    getOtherTicketId() { return this.otherTicketId; }
    getCategoryLabel() { return this.categoryLabel; }
    getQueuePosition() { return this.queue ? this.queue.position : null; }
    getTexts() { return this.texts; }

    /**
     * Schickt das Formular ab. Bei Erfolg beginnt der Chat (Runde 1).
     * @returns {object} Ergebnis von validateTicketForm + { showMercy, mercy } bzw. { ignored: true }
     */
    submitForm(form = {}) {
      if (this.phase !== PHASES.FORM) return { ok: false, ignored: true };
      const result = validateTicketForm(form, this.campus, { passwords: [this.context.password] });
      if (!result.ok) {
        const count = (this.formErrors[result.field] || 0) + 1;
        this.formErrors[result.field] = count;
        return { ...result, showMercy: count >= BALANCE.MERCY_AFTER_WRONG, mercy: formMercy(this.campus)[result.field] };
      }
      this.category = result.category;
      this.categoryLabel = result.categoryLabel;
      this.phase = PHASES.CHAT;
      this.progress = Math.max(this.progress, PROGRESS.TICKET_CREATED);
      this.startRound(0);
      return { ...result, showMercy: false, mercy: '' };
    }

    /** Aktuelle Runde mit gemischten Optionen (nur in der Chat-Phase), sonst null. */
    getRound() {
      if (this.phase !== PHASES.CHAT || this.roundIndex < 0) return null;
      const round = this.rounds[this.roundIndex];
      const agent = AGENTS[round.agent];
      return {
        id: round.id,
        index: this.roundIndex,
        agent: round.agent,
        agentName: agent.name,
        agentRole: agent.role,
        message: round.message,
        mercy: round.mercy,
        options: this.optionOrder.map((id) => {
          const option = round.options.find((o) => o.id === id);
          return { id, label: option.label, isCorrect: Boolean(option.isCorrect), isDisabled: this.disabledOptions.has(id) };
        }),
      };
    }

    /**
     * Beantwortet die aktuelle Runde.
     * @param {string} optionId
     * @param {{ clockMinutes?: number }} [opts] Spieluhr (für den Sprechzeiten-Gag)
     * @returns {object} { correct, advanced, roundId, optionId, label, reply, reason, frustration, minutes,
     *   stamp, relief, reliefReason, showMercy, mercy, phase, progress } bzw. { ignored: true }
     */
    answer(optionId, { clockMinutes = null } = {}) {
      if (this.phase !== PHASES.CHAT) return { ignored: true };
      const round = this.rounds[this.roundIndex];
      const option = round.options.find((o) => o.id === optionId);
      if (!option || this.disabledOptions.has(optionId)) return { ignored: true };

      let { reply, reason, minutes } = option;
      if (option.byHours) {
        const isOpen = clockMinutes !== null && getOfficeHoursStatus(clockMinutes, this.campus.helpdesk.hours).isOpen;
        ({ reply, reason, minutes } = isOpen ? option.byHours.open : option.byHours.closed);
      }
      const result = {
        ignored: false,
        correct: Boolean(option.isCorrect),
        advanced: Boolean(option.isCorrect || option.advances),
        roundId: round.id,
        optionId,
        label: option.label,
        reply,
        reason,
        frustration: option.isCorrect ? 0 : option.frustration,
        minutes: option.isCorrect ? 0 : minutes,
        stamp: option.stamp || null,
        relief: option.relief || 0,
        reliefReason: option.reliefReason || '',
        showMercy: false,
        mercy: round.mercy,
      };

      if (!option.isCorrect) this.wrongTotal += 1;
      if (result.advanced) {
        this.progress = Math.max(this.progress, round.progressAfter);
        if (round.next === PHASES.HOLD) this.enterHold();
        else if (round.next === PHASES.FINALE) this.phase = PHASES.FINALE;
        else this.startRound(this.roundIndex + 1);
      } else {
        this.wrongInRound += 1;
        this.disabledOptions.add(optionId);
        result.showMercy = this.wrongInRound >= BALANCE.MERCY_AFTER_WRONG;
      }
      result.phase = this.phase;
      result.progress = this.progress;
      return result;
    }

    /**
     * Warteschleife: rückt einen Platz vor (einmal wird ein Notfall vorgezogen).
     * Bei 0 übernimmt der 2nd Level (Phase CHAT, nächste Runde).
     * @returns {{ position: number, event: 'step'|'setback'|'done', message: string }|{ ignored: true }}
     */
    advanceQueue() {
      if (this.phase !== PHASES.HOLD) return { ignored: true };
      const queue = this.queue;
      if (!queue.hasSetback && queue.position === queue.setbackAt) {
        queue.hasSetback = true;
        queue.position = Math.min(BALANCE.HOLD_QUEUE_MAX, queue.position + BALANCE.HOLD_SETBACK_AMOUNT);
        return { position: queue.position, event: 'setback', message: format(this.texts.holdSetback, { position: queue.position }) };
      }
      queue.position = Math.max(0, queue.position - 1);
      if (queue.position === 0) {
        this.progress = Math.max(this.progress, PROGRESS.HOLD_DONE);
        this.phase = PHASES.CHAT;
        this.startRound(this.roundIndex + 1);
        return { position: 0, event: 'done', message: this.texts.holdDone };
      }
      return { position: queue.position, event: 'step', message: format(this.texts.holdPosition, { position: queue.position }) };
    }

    /**
     * Sitzung abgelaufen: in der Warteschleife geht der Platz verloren.
     * @returns {{ position: number, message: string }|{ ignored: true }}
     */
    applySessionTimeout() {
      if (this.phase !== PHASES.HOLD) return { ignored: true };
      this.queue.position = Math.min(BALANCE.HOLD_QUEUE_MAX, this.queue.position + BALANCE.HOLD_TIMEOUT_SETBACK);
      return { position: this.queue.position, message: format(this.texts.holdTimeout, { position: this.queue.position }) };
    }

    /**
     * Das Handy wurde neu gestartet (bzw. aus- und wieder eingeschaltet). Löst das Ticket
     * im Finale – oder schon während der Finalfrage, wer es einfach macht.
     * @returns {{ solved: boolean }}
     */
    completeRestart() {
      this.hasRestarted = true;
      const isFinalQuestion = this.phase === PHASES.CHAT && this.rounds[this.roundIndex].next === PHASES.FINALE;
      if (this.phase === PHASES.FINALE || isFinalQuestion) {
        this.phase = PHASES.DONE;
        this.progress = PROGRESS.SOLVED;
        return { solved: true };
      }
      return { solved: false };
    }

    /** Spielt den Rest perfekt durch (für debugSolve und Tests). */
    solvePerfectly() {
      let guard = 0;
      while (this.phase !== PHASES.DONE && guard++ < 100) {
        if (this.phase === PHASES.FORM) {
          this.submitForm({ category: CORRECT_CATEGORY, office: 'course',
            description: 'Konto gesperrt – eduroam: Authentifizierung fehlgeschlagen.' });
        } else if (this.phase === PHASES.CHAT) {
          this.answer(this.rounds[this.roundIndex].options.find((o) => o.isCorrect).id);
        } else if (this.phase === PHASES.HOLD) {
          this.advanceQueue();
        } else if (this.phase === PHASES.FINALE) {
          this.completeRestart();
        }
      }
      return this;
    }

    /** Zustand für Tests und getDebugInfo(). */
    getDebugState() {
      const round = this.roundIndex >= 0 ? this.rounds[this.roundIndex] : null;
      return {
        phase: this.phase,
        roundId: this.phase === PHASES.CHAT && round ? round.id : null,
        roundIndex: this.roundIndex,
        progress: this.progress,
        statusLabel: this.getStatusLabel(),
        wrongInRound: this.wrongInRound,
        wrongTotal: this.wrongTotal,
        disabledOptions: [...this.disabledOptions],
        formErrors: { ...this.formErrors },
        queuePosition: this.getQueuePosition(),
        hasRestarted: this.hasRestarted,
        ticketId: this.ticketId,
        category: this.category,
      };
    }

    // --- intern ---

    /** Beginnt Runde `index`: Zähler zurücksetzen, Optionen einmal mischen. */
    startRound(index) {
      this.roundIndex = index;
      this.wrongInRound = 0;
      this.disabledOptions = new Set();
      this.optionOrder = this.rng.shuffle(this.rounds[index].options.map((o) => o.id));
    }

    /** Wechselt in die Warteschleife. */
    enterHold() {
      this.phase = PHASES.HOLD;
      this.queue = {
        position: BALANCE.HOLD_QUEUE_START,
        setbackAt: this.rng.int(2, Math.max(2, BALANCE.HOLD_QUEUE_START - 1)),
        hasSetback: false,
      };
    }
  }

  /**
   * Neue Session.
   * @param {object} [opts] siehe HelpdeskSession
   * @returns {HelpdeskSession}
   */
  const createSession = (opts = {}) => new HelpdeskSession(opts);

  return Object.freeze({
    PHASES,
    BALANCE,
    POPUP_SCHEDULE,
    PROGRESS,
    STATUS_STAGES,
    AGENTS,
    POPUP_TYPES,
    HelpdeskSession,
    createSession,
    validateTicketForm,
    buildRounds,
    getCategoryOptions,
    getOfficeOptions,
    getPopup,
    buildPopupSchedule,
    parseOfficeHours,
    getOfficeHoursStatus,
    getStatusLabel,
    maskPassword,
    getTexts,
    format,
    makeTicketId,
    getTicketUrl,
    getPhishingUrl,
  });
})();
