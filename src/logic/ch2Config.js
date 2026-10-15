/**
 * ch2Config.js – Reine Logik für Kapitel 2 „Die Konfiguration“ (Ch2Logic).
 *
 * Das Kapitel: Android-WLAN-Dialog für eduroam (klassisch PEAP/MSCHAPv2). Daneben liegt
 * das IT-Merkblatt „Stand 2014“ (teils veraltet) und ein Post-it mit den Zugangsdaten.
 *
 * Inhalt dieser Datei:
 *  - validateConfig(): prüft die Konfiguration in der Reihenfolge einer echten Anmeldung
 *    (Pflichtfelder → EAP-Methode → Routing über den Realm der äußeren Identität →
 *    Server-Zertifikat → innere Anmeldung per MSCHAPv2). Die Systemmeldung ist absichtlich
 *    vage („Gespeichert“, „Authentifizierungsproblem“ …), der Hinweis (Mitleids-Tipp) klar.
 *  - Trolle: EN-Tastaturlayout (y↔z & Co.), Autokorrektur „lehre“ → „lehrer“.
 *  - Kapitel-Inhalte als Daten: Auswahllisten, WLAN-Liste, altes Profil, Merkblatt,
 *    Post-it, Aufgaben- und Meldungstexte.
 *  - Verbindungsablauf (Dauern über RNG), Mitleids-Tipp-Zähler und Balance (Frust/Zeit).
 *
 * Kein Phaser, kein DOM → in Node testbar (tests/unit/ch2.test.js).
 *
 * Global: Ch2Logic (eingefroren).
 * Abhängigkeiten: CONFIG (Balance-Werte, beim Laden); zur Laufzeit optional RNG.
 * CAMPUS wird immer als Parameter übergeben (Werte nie hart codieren).
 */

const Ch2Logic = (() => {
  /** Android-Statuszeilen (absichtlich vage – das ist der Witz). */
  const STATUS = Object.freeze({
    SAVED: 'Gespeichert',
    AUTH_PROBLEM: 'Authentifizierungsproblem',
    DOMAIN_MISMATCH: 'Domain stimmt nicht überein',
    SAVING: 'Wird gespeichert…',
    CONNECTING: 'Verbindung wird hergestellt…',
    AUTHENTICATING: 'Authentifizierung…',
    OBTAINING_IP: 'IP-Adresse wird abgerufen…',
    CONNECTED_NO_INTERNET: 'Verbunden, kein Internet',
  });

  /** Ergebnis-Codes von validateConfig (plus OLD_PROFILE für das alte Profil). */
  const CODES = Object.freeze({
    OK: 'OK',
    CA_MISSING: 'CA_MISSING',
    CA_NOT_ALLOWED: 'CA_NOT_ALLOWED',
    CA_OUTDATED: 'CA_OUTDATED',
    CA_UNKNOWN: 'CA_UNKNOWN',
    DOMAIN_MISSING: 'DOMAIN_MISSING',
    DOMAIN_MISMATCH: 'DOMAIN_MISMATCH',
    DOMAIN_LAYOUT: 'DOMAIN_LAYOUT',
    OCSP_REQUIRED: 'OCSP_REQUIRED',
    EAP_METHOD: 'EAP_METHOD',
    PHASE2: 'PHASE2',
    IDENTITY_MISSING: 'IDENTITY_MISSING',
    IDENTITY_NO_REALM: 'IDENTITY_NO_REALM',
    IDENTITY_REALM: 'IDENTITY_REALM',
    IDENTITY_LAYOUT: 'IDENTITY_LAYOUT',
    IDENTITY_USER: 'IDENTITY_USER',
    ANON_REALM: 'ANON_REALM',
    PASSWORD_MISSING: 'PASSWORD_MISSING',
    PASSWORD: 'PASSWORD',
    PASSWORD_LAYOUT: 'PASSWORD_LAYOUT',
    OLD_PROFILE: 'OLD_PROFILE',
  });

  /** Felder des Dialogs in Anzeige-Reihenfolge (wie Android). */
  const FIELDS = Object.freeze([
    'eapMethod', 'phase2', 'caCert', 'ocsp', 'domain', 'identity', 'anonymousIdentity', 'password',
  ]);

  /** Android-Beschriftungen (deutsch). */
  const FIELD_LABELS = Object.freeze({
    eapMethod: 'EAP-Methode',
    phase2: 'Phase 2-Authentifizierung',
    caCert: 'CA-Zertifikat',
    ocsp: 'Online-Zertifikatstatus',
    domain: 'Domain',
    identity: 'Identität',
    anonymousIdentity: 'Anonyme Identität',
    password: 'Passwort',
  });

  /** Besondere Einträge der Auswahllisten. */
  const OPTION = Object.freeze({
    PHASE2_NONE: 'Keine',
    CA_NO_VALIDATE: 'Nicht validieren',
    CA_INSTALL: 'Zertifikate installieren',
    OCSP_REQUEST: 'Zertifikatstatus anfordern',
    OCSP_REQUIRE: 'Zertifikatstatus erforderlich',
  });

  /** EAP- und Phase-2-Methoden, wie sie Android anbietet (Standard: PEAP, Phase 2 „Keine“). */
  const EAP_METHODS = Object.freeze(['PEAP', 'TLS', 'TTLS', 'PWD', 'SIM', 'AKA', "AKA'"]);
  const PHASE2_METHODS = Object.freeze([OPTION.PHASE2_NONE, 'MSCHAPV2', 'GTC']);

  /** Beispielkennung im Merkblatt von 2014 (nicht die eigene!). */
  const MERKBLATT_EXAMPLE_USERNAME = 'wwi14001';

  /** Tastaturlayouts. EN = QWERTY: gleiche Taste, anderes Zeichen. */
  const KEYBOARD = Object.freeze({ DE: 'de', EN: 'en' });
  const EN_LAYOUT_MAP = Object.freeze({
    y: 'z', z: 'y', Y: 'Z', Z: 'Y',
    'ä': "'", 'Ä': '"', 'ö': ';', 'Ö': ':', 'ü': '[', 'Ü': '{',
    'ß': '-', '-': '/',
  });

  /** Autokorrektur „weiß es besser“: Wort direkt hinter dem @ wird beim Punkt ergänzt. */
  const AUTOCORRECT_RULES = Object.freeze([Object.freeze({ word: 'lehre', replacement: 'lehrer' })]);

  /** Tipp-Gruppen: mehrere Fehler zum selben Problem → Mitleids-Tipp. */
  const GROUPS = Object.freeze({
    [CODES.OLD_PROFILE]: 'oldProfile',
    [CODES.CA_MISSING]: 'certificate',
    [CODES.CA_NOT_ALLOWED]: 'certificate',
    [CODES.CA_OUTDATED]: 'certificate',
    [CODES.CA_UNKNOWN]: 'certificate',
    [CODES.DOMAIN_MISSING]: 'certificate',
    [CODES.DOMAIN_MISMATCH]: 'certificate',
    [CODES.DOMAIN_LAYOUT]: 'certificate',
    [CODES.OCSP_REQUIRED]: 'certificate',
    [CODES.EAP_METHOD]: 'method',
    [CODES.PHASE2]: 'method',
    [CODES.IDENTITY_MISSING]: 'identity',
    [CODES.IDENTITY_NO_REALM]: 'identity',
    [CODES.IDENTITY_REALM]: 'identity',
    [CODES.IDENTITY_LAYOUT]: 'identity',
    [CODES.IDENTITY_USER]: 'identity',
    [CODES.ANON_REALM]: 'anonymous',
    [CODES.PASSWORD_MISSING]: 'password',
    [CODES.PASSWORD]: 'password',
    [CODES.PASSWORD_LAYOUT]: 'password',
  });

  /** Mitleids-Tipp: ab so vielen Fehlern derselben Gruppe bzw. insgesamt. */
  const PITY = Object.freeze({ THRESHOLD: 2, GENERAL_AFTER: 4 });

  /** Balance (Frust in %, Zeit in Spielminuten) – Budget siehe Briefing, Test „Frust-Budget“. */
  const BALANCE = Object.freeze({
    OLD_PROFILE_FIRST_CONTACT: CONFIG.FRUSTRATION.TINY, // Handy probiert ungefragt das alte Profil
    OLD_PROFILE_RETRY: CONFIG.FRUSTRATION.TINY,         // Spieler:in probiert es selbst noch mal
    SAVED_ONLY: CONFIG.FRUSTRATION.SMALL,               // „Gespeichert“ – und sonst nichts
    DOMAIN_MISMATCH: CONFIG.FRUSTRATION.SMALL,
    AUTH_PROBLEM: CONFIG.FRUSTRATION.MEDIUM,
    AUTH_MINUTES: CONFIG.PENALTY_MINUTES.SMALL,         // Fehlermeldung über mobile Daten gegoogelt
    GUEST_PORTAL_MINUTES: CONFIG.PENALTY_MINUTES.SMALL, // Gast-Portal lädt über EDGE
    PLAY_STORE_MINUTES: CONFIG.PENALTY_MINUTES.SMALL,   // Play Store versucht es trotzdem
    MAX_STAMPS: 2,                                       // Stempel sparsam: höchstens zwei pro Kapitel
    STAMP_TEXT: 'ABGELEHNT',
  });

  /** Wartezeiten der Statuszeilen (ms, [min, max]) – Zufall über RNG. */
  const TIMING = Object.freeze({
    SAVING: Object.freeze([350, 600]),
    CONNECTING: Object.freeze([700, 1100]),
    AUTHENTICATING: Object.freeze([700, 1200]),
    OBTAINING_IP: Object.freeze([500, 900]),
  });

  /** Aufgaben im HUD (kurz!). */
  const OBJECTIVES = Object.freeze({
    START: 'eduroam in der WLAN-Liste antippen',
    OLD_PROFILE_FAILED: 'eduroam antippen – was ist da los?',
    OLD_PROFILE_DETAILS: 'Altes Schnupper-Profil entfernen',
    SETUP: 'eduroam antippen und neu einrichten',
    CONFIG: 'eduroam einrichten – siehe Merkblatt',
    RETRY: 'Einstellungen prüfen, neu verbinden',
    RETRY_LIST: 'eduroam antippen, Eingaben prüfen',
    CONNECTING: 'Warten … Android verbindet',
    CONNECTED: 'Verbunden! (Kein Internet.)',
  });

  /** Feste Texte der Szene (Android-Oberfläche und Spielebene). */
  const TEXTS = Object.freeze({
    WIFI_TITLE: 'WLAN',
    WIFI_TOGGLE: 'WLAN verwenden',
    AVAILABLE: 'Verfügbare Netzwerke',
    BACK: 'Zurück',
    DETAILS_REMOVE: 'Entfernen',
    DETAILS_CONNECT: 'Verbinden',
    DIALOG_CANCEL: 'Abbrechen',
    DIALOG_CONNECT: 'Verbinden',
    SELECT_PLACEHOLDER: 'Bitte auswählen',
    PASSWORD_PLACEHOLDER: 'Passwort',
    OPTIONAL_PLACEHOLDER: '(optional)',
    KEYBOARD_LABEL_DE: 'Tastatur: Deutsch (QWERTZ)',
    KEYBOARD_LABEL_EN: 'Tastatur: English (US) – antippen für DE',
    KEYBOARD_SWITCHED: 'Gboard: English (US)',
    KEYBOARD_BACK: 'Gboard: Deutsch',
    AUTOCORRECT: 'Autokorrektur: „lehre“ → „lehrer“',
    FIRST_CONTACT: 'Das Handy probiert sein altes eduroam-Profil …',
    OLD_PROFILE_EXPLAIN: 'Das Schnupperkonto ist längst abgelaufen – Android probiert es trotzdem immer wieder.',
    OLD_PROFILE_REMOVED: 'Netzwerk entfernt',
    CONNECTED: 'Verbunden. Kein Internet. Aber verbunden.',
    NO_REAL_CREDENTIALS: 'Spiel – bitte keine echten Zugangsdaten eingeben',
    PLAY_STORE_CARD: 'Tipp: Die App „easyroam“ richtet eduroam automatisch ein.',
    PLAY_STORE_BUTTON: 'Im Play Store öffnen',
    PLAY_STORE_TITLE: 'Play Store',
    PLAY_STORE_TEXT:
      'Keine Internetverbindung. Prüfe deine Verbindung und versuche es noch einmal.\n\n' +
      'Die IT empfiehlt übrigens, eduroam zu Hause einzurichten – das braucht Internet. ' +
      'Du bist aber nicht zu Hause.',
    PLAY_STORE_OK: 'Na toll',
    NOTE_NO_ANON: 'Ohne anonyme Identität geht deine Kennung im Klartext über jeden eduroam-Server auf dem Weg.',
    NOTE_ANON_NOT_ANONYMOUS: 'Die „anonyme“ Identität enthält deine echte Kennung – anonym ist anders.',
    TIP_TITLE: 'Mitleids-Tipp',
  });

  /**
   * Feldfehler (Android-Stil), wenn nur „Gespeichert“ herauskommt. Die Meldung ersetzt die
   * Feldbeschriftung (rot) – deshalb nennt jede Meldung das Feld selbst.
   */
  const FIELD_ERRORS = Object.freeze({
    [CODES.CA_MISSING]: `${FIELD_LABELS.caCert}: Bitte auswählen`,
    [CODES.CA_NOT_ALLOWED]: `${FIELD_LABELS.caCert}: Bitte auswählen`,
    [CODES.DOMAIN_MISSING]: `${FIELD_LABELS.domain} muss angegeben werden`,
    [CODES.IDENTITY_MISSING]: `${FIELD_LABELS.identity}: Erforderlich`,
    [CODES.PASSWORD_MISSING]: `${FIELD_LABELS.password}: Erforderlich`,
  });

  /** Altes Profil vom Schnupperstudium (fiktive Kennung). */
  const OLD_PROFILE = Object.freeze({
    identity: 'st123456@stud.uni-stuttgart.de',
    eapMethod: 'TTLS',
    origin: 'Schnupperstudium Uni Stuttgart',
    savedAt: '14.03.2023',
  });

  // ------------------------------------------------------------------ Hilfsfunktionen

  const Util = {
    /** Wert als String (null/undefined → ''). */
    str(value) {
      return value === null || value === undefined ? '' : String(value);
    },

    /** Liste ohne Duplikate, Reihenfolge bleibt. */
    unique(list) {
      return [...new Set(list)];
    },

    /** RNG-Quelle: Parameter, sonst globaler RNG (falls geladen), sonst null. */
    resolveRng(rng) {
      if (rng && typeof rng.int === 'function') return rng;
      if (typeof RNG !== 'undefined' && RNG && typeof RNG.int === 'function') return RNG;
      return null;
    },

    /** Dauer aus [min, max] – mit RNG zufällig, ohne die Mitte. */
    duration(range, rng) {
      const [min, max] = range;
      return rng ? rng.int(min, max) : Math.round((min + max) / 2);
    },

    /**
     * true, wenn die Domain nur wegen des EN-Layouts nicht passt – verglichen mit dem
     * Servernamen und allen gültigen Suffixen (z. B. „dhbw-stuttgart.de“).
     */
    isDomainLayoutMixup(domain, serverName) {
      const entered = Util.str(domain).trim().toLowerCase().replace(/\.+$/, '');
      const labels = Util.str(serverName).trim().toLowerCase().split('.');
      for (let i = 0; i < labels.length - 1; i++) {
        if (isLayoutMixup(entered, labels.slice(i).join('.'))) return true;
      }
      return false;
    },

    /** Ort aus CAMPUS.flavor.places (bevorzugt `preferred`), sonst die Stadt. */
    place(campus, preferred) {
      const places = (campus.flavor && campus.flavor.places) || [];
      if (places.includes(preferred)) return preferred;
      return places[0] || campus.city;
    },
  };

  // ------------------------------------------------------------------ Prüf-Bausteine

  /**
   * Zerlegt eine Identität am letzten @ (getrimmt, klein geschrieben).
   * @param {string} identity
   * @returns {{user: string, realm: string|null}} realm null = kein (oder leerer) Realm
   */
  function splitIdentity(identity) {
    const value = Util.str(identity).trim().toLowerCase();
    const at = value.lastIndexOf('@');
    if (at < 0) return { user: value, realm: null };
    const realm = value.slice(at + 1);
    return { user: value.slice(0, at), realm: realm || null };
  }

  /**
   * Domain-Abgleich wie Android (Suffix an einer Punkt-Grenze, ohne Groß-/Kleinschreibung).
   * Eine nackte TLD („de“) oder URL-Schreibweisen zählen nicht.
   * @param {string} domain Eingabe im Feld „Domain“
   * @param {string} serverName Name im Server-Zertifikat
   * @returns {boolean}
   */
  function matchesDomain(domain, serverName) {
    const wanted = Util.str(domain).trim().toLowerCase().replace(/\.+$/, '');
    const server = Util.str(serverName).trim().toLowerCase();
    if (!wanted || !wanted.includes('.') || !/^[a-z0-9.-]+$/.test(wanted)) return false;
    return server === wanted || server.endsWith(`.${wanted}`);
  }

  /**
   * Zeichen so, wie es bei aktivem Layout ankommt (EN: QWERTY statt QWERTZ).
   * @param {string} char ein Zeichen
   * @param {string} layout KEYBOARD.DE | KEYBOARD.EN
   * @returns {string}
   */
  function mapKey(char, layout) {
    if (layout !== KEYBOARD.EN) return char;
    return Object.prototype.hasOwnProperty.call(EN_LAYOUT_MAP, char) ? EN_LAYOUT_MAP[char] : char;
  }

  /**
   * Ganzen Text durch ein Layout schicken.
   * @param {string} text
   * @param {string} layout
   * @returns {string}
   */
  function applyLayout(text, layout) {
    return Array.from(Util.str(text)).map((char) => mapKey(char, layout)).join('');
  }

  /**
   * true, wenn `entered` genau dem erwarteten Text entspricht – nur mit (teilweise)
   * vertauschtem Tastaturlayout. Normale Tippfehler zählen nicht.
   * @param {string} entered
   * @param {string} expected
   * @param {string} [layout=KEYBOARD.EN]
   * @returns {boolean}
   */
  function isLayoutMixup(entered, expected, layout = KEYBOARD.EN) {
    const got = Array.from(Util.str(entered));
    const want = Array.from(Util.str(expected));
    if (got.length === 0 || got.length !== want.length) return false;
    let mapped = 0;
    for (let i = 0; i < want.length; i++) {
      if (got[i] === want[i]) continue;
      if (got[i] === mapKey(want[i], layout)) {
        mapped += 1;
        continue;
      }
      return false;
    }
    return mapped > 0;
  }

  /**
   * Autokorrektur: Beim Punkt direkt hinter „@lehre“ wird daraus „@lehrer.“.
   * @param {string} char das gerade getippte Zeichen
   * @param {string} textBeforeCaret Text links vom Cursor
   * @returns {string|null} einzufügender Text (z. B. 'r.') oder null = keine Korrektur
   */
  function autocorrect(char, textBeforeCaret) {
    if (char !== '.') return null;
    const before = Util.str(textBeforeCaret).toLowerCase();
    for (const rule of AUTOCORRECT_RULES) {
      if (before.endsWith(`@${rule.word}`) && rule.replacement.startsWith(rule.word)) {
        return rule.replacement.slice(rule.word.length) + char;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ Hinweise

  /**
   * Klarer Hinweis (Mitleids-Tipp) zu einem Fehler-Code – mit konkreten Werten aus CAMPUS.
   * @param {string} code Wert aus CODES
   * @param {object} campus CAMPUS
   * @returns {string|null}
   */
  function getHint(code, campus) {
    // Hinweise ohne Standortdaten (funktionieren auch ohne campus)
    switch (code) {
      case CODES.PASSWORD_MISSING:
        return 'Das Passwort fehlt – es steht auf dem Post-it neben dem Handy.';
      case CODES.PASSWORD_LAYOUT:
        return 'Die Tastatur stand auf English (US): y und z waren vertauscht. Tastatur unten auf Deutsch stellen, Passwort neu tippen.';
      case CODES.PASSWORD:
        return 'Passwort falsch. Es steht auf dem Post-it – Groß-/Kleinschreibung beachten, das Auge im Feld zeigt es an.';
      case CODES.OLD_PROFILE:
        return 'Android probiert stur das alte Profil vom Schnupperstudium. Tippe auf „Entfernen“ – alte Profile immer zuerst löschen.';
      default:
        break;
    }
    if (!campus) return null;
    const wifi = campus.wifi;
    const ca = wifi.caCertOption;
    const server = campus.certificate.serverName;
    switch (code) {
      case CODES.CA_MISSING:
        return `Ohne CA-Zertifikat verbindet Android gar nicht erst. Wähle „${ca}“ – die Root-CA aus dem Merkblatt gibt es nicht mehr.`;
      case CODES.CA_NOT_ALLOWED:
        return `„${OPTION.CA_NO_VALIDATE}“ gibt es seit Android 11 nicht mehr (Evil-Twin-Gefahr). Wähle „${ca}“ und trag die Domain ein.`;
      case CODES.CA_OUTDATED:
        return `Die Root-CA aus dem Merkblatt ist längst abgelaufen. Heute: „${ca}“ plus Domain ${server}.`;
      case CODES.CA_UNKNOWN:
        return `Unbekanntes CA-Zertifikat. Richtig ist „${ca}“ – plus Domain ${server}.`;
      case CODES.DOMAIN_MISSING:
        return `Bei „${ca}“ will Android eine Domain: den Namen aus dem Server-Zertifikat, ${server} (unten im Merkblatt).`;
      case CODES.DOMAIN_MISMATCH:
        return `Die Domain muss zum Server-Zertifikat passen: ${server} – nicht der Realm aus der Identität.`;
      case CODES.DOMAIN_LAYOUT:
        return `Die Tastatur stand auf English (US): aus „-“ wurde „/“. Tastatur unten auf Deutsch stellen, Domain neu tippen: ${server}`;
      case CODES.OCSP_REQUIRED:
        return `„${OPTION.OCSP_REQUIRE}“ klappt nur, wenn der Server OCSP-Antworten mitschickt. Tut er nicht – lass „${wifi.ocsp}“.`;
      case CODES.EAP_METHOD:
        return `EAP-Methode: ${wifi.eapMethod}. Das stimmt sogar im Merkblatt von 2014.`;
      case CODES.PHASE2:
        return `Phase 2-Authentifizierung: ${wifi.phase2} (steht im Merkblatt). „${OPTION.PHASE2_NONE}“ reicht dem Server nicht.`;
      case CODES.IDENTITY_MISSING:
        return `Die Identität fehlt. Sie lautet: ${campus.identity}`;
      case CODES.IDENTITY_NO_REALM:
        return `Die Kennung allein reicht nicht (Merkblatt von 2014!). eduroam braucht den Realm: ${campus.identity}`;
      case CODES.IDENTITY_REALM:
        return `Falscher Realm – eduroam schickt dich ins Nirgendwo. Richtig: …@${campus.realm}. Autokorrektur und Tastatur im Blick behalten!`;
      case CODES.IDENTITY_LAYOUT:
        return `Die Tastatur stand auf English (US): aus „-“ wurde „/“. Tastatur unten auf Deutsch stellen und neu tippen: ${campus.identity}`;
      case CODES.IDENTITY_USER:
        return `Kennung vertippt? Deine steht auf dem Post-it: ${campus.username} – nicht die Beispielkennung aus dem Merkblatt.`;
      case CODES.ANON_REALM:
        return `Die anonyme Identität braucht denselben Realm wie die Identität: ${campus.anonymousIdentity} – oder das Feld leer lassen.`;
      default:
        return null;
    }
  }

  /**
   * Feldfehler im Android-Stil (nur für „Gespeichert“-Fälle); ersetzt die Feldbeschriftung.
   * @param {string} code
   * @returns {string|null}
   */
  function getFieldError(code) {
    return FIELD_ERRORS[code] || null;
  }

  /**
   * Tipp-Gruppe eines Codes (z. B. 'certificate', 'identity', 'password').
   * @param {string} code
   * @returns {string}
   */
  function getGroup(code) {
    return GROUPS[code] || 'other';
  }

  // ------------------------------------------------------------------ Hauptprüfung

  /**
   * Prüft die Konfiguration des WLAN-Dialogs.
   * Reihenfolge wie bei einer echten PEAP-Anmeldung: Pflichtfelder (sonst nur „Gespeichert“)
   * → EAP-Methode → Routing über den Realm der äußeren Identität → Server-Zertifikat
   * (CA, OCSP, Domain) → innere Anmeldung (Phase 2, Kennung, Passwort).
   * @param {object} config { eapMethod, phase2, caCert, ocsp, domain, identity, anonymousIdentity, password }
   * @param {object} campus CAMPUS
   * @param {object} [options]
   * @param {string} [options.expectedPassword] richtiges Passwort (Standard: campus.defaultPassword)
   * @returns {{ok: boolean, field: string|null, code: string, message: string, hint: string|null,
   *            isAnonymousIdentityCorrect: boolean, notes: string[]}}
   */
  function validateConfig(config, campus, { expectedPassword } = {}) {
    const source = config || {};
    const expected = typeof expectedPassword === 'string' && expectedPassword !== ''
      ? expectedPassword
      : campus.defaultPassword;
    const c = {
      eapMethod: Util.str(source.eapMethod).trim(),
      phase2: Util.str(source.phase2).trim(),
      caCert: Util.str(source.caCert).trim(),
      ocsp: Util.str(source.ocsp).trim(),
      domain: Util.str(source.domain).trim(),
      identity: Util.str(source.identity).trim(),
      anonymousIdentity: Util.str(source.anonymousIdentity).trim(),
      password: Util.str(source.password), // Passwörter nie trimmen
    };
    const fail = (field, code, message) => ({
      ok: false, field, code, message, hint: getHint(code, campus), isAnonymousIdentityCorrect: false, notes: [],
    });
    const systemCa = campus.wifi.caCertOption;
    const realm = campus.realm.toLowerCase();

    // 1. Pflichtfelder: Android speichert nur und verbindet gar nicht erst
    if (!c.caCert || c.caCert === OPTION.CA_INSTALL) return fail('caCert', CODES.CA_MISSING, STATUS.SAVED);
    if (c.caCert === OPTION.CA_NO_VALIDATE) return fail('caCert', CODES.CA_NOT_ALLOWED, STATUS.SAVED);
    if (c.caCert === systemCa && !c.domain) return fail('domain', CODES.DOMAIN_MISSING, STATUS.SAVED);
    if (!c.identity) return fail('identity', CODES.IDENTITY_MISSING, STATUS.SAVED);
    if (!c.password) return fail('password', CODES.PASSWORD_MISSING, STATUS.SAVED);

    // 2. EAP-Methode: der Server spricht nur PEAP
    if (c.eapMethod.toUpperCase() !== campus.wifi.eapMethod.toUpperCase()) {
      return fail('eapMethod', CODES.EAP_METHOD, STATUS.AUTH_PROBLEM);
    }

    // 3. Routing: Die äußere Identität (anonym oder echt) geht im Klartext an den Heimat-Realm
    if (c.anonymousIdentity && splitIdentity(c.anonymousIdentity).realm !== realm) {
      return fail('anonymousIdentity', CODES.ANON_REALM, STATUS.AUTH_PROBLEM);
    }
    const identity = splitIdentity(c.identity);
    if (identity.realm === null) return fail('identity', CODES.IDENTITY_NO_REALM, STATUS.AUTH_PROBLEM);
    if (identity.realm !== realm) {
      const code = isLayoutMixup(identity.realm, realm) ? CODES.IDENTITY_LAYOUT : CODES.IDENTITY_REALM;
      return fail('identity', code, STATUS.AUTH_PROBLEM);
    }

    // 4. Server-Zertifikat: CA, Zertifikatstatus, Domain
    if (c.caCert === campus.certificate.outdatedRootCA) return fail('caCert', CODES.CA_OUTDATED, STATUS.AUTH_PROBLEM);
    if (c.caCert !== systemCa) return fail('caCert', CODES.CA_UNKNOWN, STATUS.AUTH_PROBLEM);
    if (c.ocsp === OPTION.OCSP_REQUIRE) return fail('ocsp', CODES.OCSP_REQUIRED, STATUS.AUTH_PROBLEM);
    if (!matchesDomain(c.domain, campus.certificate.serverName)) {
      const code = Util.isDomainLayoutMixup(c.domain, campus.certificate.serverName)
        ? CODES.DOMAIN_LAYOUT
        : CODES.DOMAIN_MISMATCH;
      return fail('domain', code, STATUS.DOMAIN_MISMATCH);
    }

    // 5. Innere Anmeldung im TLS-Tunnel (MSCHAPv2 mit Kennung und Passwort)
    if (c.phase2.toUpperCase() !== campus.wifi.phase2.toUpperCase()) return fail('phase2', CODES.PHASE2, STATUS.AUTH_PROBLEM);
    if (identity.user !== campus.username.toLowerCase()) return fail('identity', CODES.IDENTITY_USER, STATUS.AUTH_PROBLEM);
    if (c.password !== expected) {
      const code = isLayoutMixup(c.password, expected) ? CODES.PASSWORD_LAYOUT : CODES.PASSWORD;
      return fail('password', code, STATUS.AUTH_PROBLEM);
    }

    const isAnonymousIdentityCorrect = c.anonymousIdentity.toLowerCase() === campus.anonymousIdentity.toLowerCase();
    const notes = [];
    if (!c.anonymousIdentity) notes.push(TEXTS.NOTE_NO_ANON);
    else if (!isAnonymousIdentityCorrect) notes.push(TEXTS.NOTE_ANON_NOT_ANONYMOUS);
    return {
      ok: true, field: null, code: CODES.OK, message: STATUS.CONNECTED_NO_INTERNET, hint: null,
      isAnonymousIdentityCorrect, notes,
    };
  }

  /** Ergebnis, wenn Android das alte Profil vom Schnupperstudium probiert. */
  const OLD_PROFILE_RESULT = Object.freeze({
    ok: false,
    field: null,
    code: CODES.OLD_PROFILE,
    message: STATUS.AUTH_PROBLEM,
    hint: getHint(CODES.OLD_PROFILE, null),
    isAnonymousIdentityCorrect: false,
    notes: Object.freeze([]),
  });

  // ------------------------------------------------------------------ Daten für die Szene

  /**
   * Auswahllisten des Dialogs (Format für UI.Dropdown).
   * @param {object} campus
   * @returns {{eapMethod: object[], phase2: object[], caCert: object[], ocsp: object[]}}
   */
  function getOptions(campus) {
    const plain = (values) => Util.unique(values).map((value) => ({ value, label: value }));
    return {
      eapMethod: plain([...EAP_METHODS, campus.wifi.eapMethod]),
      phase2: plain([...PHASE2_METHODS, campus.wifi.phase2]),
      caCert: [
        { value: campus.wifi.caCertOption, label: campus.wifi.caCertOption },
        {
          value: OPTION.CA_INSTALL, label: OPTION.CA_INSTALL, disabled: true,
          hint: 'Zertifikat installieren? Dafür musst du es erst herunterladen. Aus dem Internet. Das du nicht hast.',
        },
        {
          value: OPTION.CA_NO_VALIDATE, label: OPTION.CA_NO_VALIDATE, disabled: true,
          hint: '„Nicht validieren“ gibt es seit Android 11 nicht mehr – zu gefährlich (Evil Twin).',
        },
        {
          value: campus.certificate.outdatedRootCA, label: campus.certificate.outdatedRootCA, disabled: true,
          hint: 'Nicht auf dem Gerät – und längst abgelaufen. Das Merkblatt ist von 2014.',
        },
      ],
      ocsp: plain([campus.wifi.ocsp, OPTION.OCSP_REQUEST, OPTION.OCSP_REQUIRE]),
    };
  }

  /**
   * Startwerte des Android-Dialogs (PEAP, Phase 2 „Keine“, CA „Bitte auswählen“ …).
   * @param {object} campus
   * @returns {object} config
   */
  function getDefaultConfig(campus) {
    return {
      eapMethod: EAP_METHODS[0],
      phase2: OPTION.PHASE2_NONE,
      caCert: null,
      ocsp: campus.wifi.ocsp,
      domain: '',
      identity: '',
      anonymousIdentity: '',
      password: '',
    };
  }

  /**
   * Richtige Konfiguration (für debugSolve und Tests).
   * @param {object} campus
   * @param {string} [expectedPassword=campus.defaultPassword]
   * @returns {object} config
   */
  function getSolution(campus, expectedPassword = campus.defaultPassword) {
    return {
      eapMethod: campus.wifi.eapMethod,
      phase2: campus.wifi.phase2,
      caCert: campus.wifi.caCertOption,
      ocsp: campus.wifi.ocsp,
      domain: campus.wifi.domain,
      identity: campus.identity,
      anonymousIdentity: campus.anonymousIdentity,
      password: expectedPassword,
    };
  }

  /**
   * WLAN-Liste: eduroam (mit altem Profil gespeichert) zuerst, dann Nachbarn mit Reaktion.
   * reaction.kind 'toast' = kurze Meldung, 'modal' = Systemdialog (+ optionale Zeitstrafe).
   * @param {object} campus
   * @returns {object[]} [{ id, ssid, level 0–4, isSecured, isSaved, reaction }]
   */
  function getNetworks(campus) {
    const wg = Util.place(campus, 'Feuersee');
    return [
      { id: 'eduroam', ssid: campus.wifi.ssid, level: 3, isSecured: true, isSaved: true, reaction: null },
      {
        id: 'guest', ssid: campus.wifi.guestSsid, level: 4, isSecured: false, isSaved: false,
        reaction: {
          kind: 'modal',
          title: `${campus.wifi.guestSsid}: Anmeldung erforderlich`,
          text: 'Gastzugänge gibt es nur mit Voucher. Den stellt das Sekretariat aus – persönlich, gegen Unterschrift, Di 10–11 Uhr.\n\nDu bist übrigens kein Gast. Du studierst hier.',
          minutes: BALANCE.GUEST_PORTAL_MINUTES,
          reason: 'Gast-Portal über EDGE geladen',
        },
      },
      {
        id: 'kevin', ssid: 'iPhone von Kevin', level: 4, isSecured: true, isSaved: false,
        reaction: { kind: 'toast', text: '„iPhone von Kevin“ ist passwortgeschützt. Kevin teilt nicht. Kevin sammelt.' },
      },
      {
        id: 'fritz', ssid: 'FRITZ!Box 7590 XY', level: 1, isSecured: true, isSaved: false,
        reaction: { kind: 'toast', text: `WLAN-Schlüssel? Klebt hinten auf der FRITZ!Box. Die steht in einer WG am ${wg}.` },
      },
      {
        id: 'printer', ssid: 'DIRECT-7B-HP LaserJet', level: 2, isSecured: true, isSaved: false,
        reaction: { kind: 'toast', text: 'Ein Drucker aus dem Sekretariat. Internet hat er nicht, dafür einen Papierstau.' },
      },
      {
        id: 's21', ssid: 'S21-Baustelle', level: 2, isSecured: true, isSaved: false,
        reaction: { kind: 'toast', text: 'Verbindung wird hergestellt… seit 2010. Fertigstellung: demnächst.' },
      },
    ];
  }

  /**
   * Das alte eduroam-Profil vom Schnupperstudium (Detailseite „Gespeichert“).
   * @param {object} campus
   * @returns {{ssid: string, identity: string, origin: string, savedAt: string, rows: object[]}}
   */
  function getOldProfile(campus) {
    return {
      ssid: campus.wifi.ssid,
      identity: OLD_PROFILE.identity,
      origin: OLD_PROFILE.origin,
      savedAt: OLD_PROFILE.savedAt,
      rows: [
        { label: 'Gespeichert am', value: `${OLD_PROFILE.savedAt} · ${OLD_PROFILE.origin}` },
        { label: 'Identität', value: OLD_PROFILE.identity },
        { label: 'EAP-Methode', value: OLD_PROFILE.eapMethod },
        { label: 'Sicherheit', value: campus.wifi.security },
      ],
    };
  }

  /**
   * IT-Merkblatt „Stand 2014“: Schritte, technische Angaben, Randnotizen von Kommiliton:innen
   * und die Korrekturen, die nach dem Verbinden in Rot nachgetragen werden.
   * @param {object} campus
   * @returns {object}
   */
  function getMerkblatt(campus) {
    const wifi = campus.wifi;
    return {
      org: `${campus.name} · Rechenzentrum`,
      date: 'Stand: 03/2014',
      title: 'Merkblatt: eduroam unter Android',
      subtitle: 'gilt für Android 4.4 „KitKat“ und neuer',
      steps: [
        { id: 'open', text: `1. Einstellungen › WLAN › „${wifi.ssid}“ antippen` },
        { id: 'eap', text: `2. EAP-Methode: ${wifi.eapMethod}` },
        { id: 'phase2', text: `3. Phase-2-Authentifizierung: ${wifi.phase2}` },
        { id: 'ca', text: `4. CA-Zertifikat: ${campus.certificate.outdatedRootCA}`, isOutdated: true },
        { id: 'caFallback', text: `Fehlt es? Dann „${OPTION.CA_NO_VALIDATE}“ wählen.`, isIndented: true, isOutdated: true },
        { id: 'identity', text: `5. Identität: Ihre Kennung (z. B. ${MERKBLATT_EXAMPLE_USERNAME})`, isOutdated: true },
        { id: 'anon', text: '6. Anonyme Identität: frei lassen' },
        { id: 'password', text: '7. Passwort: Ihr Lehrenetz-Passwort' },
        { id: 'connect', text: '8. „Verbinden“ antippen – fertig!' },
      ],
      technical: [
        { id: 'server', text: `RADIUS-Server: ${campus.certificate.serverName}` },
        { id: 'macos', text: 'Unter macOS: Datei „eduroam-W10-DHBSDS“ ausführen.' },
        { id: 'contact', text: `Fragen? Rechenzentrum, ${campus.helpdesk.hours}` },
      ],
      annotations: [
        { anchor: 'ca', text: 'Hab ich nicht im Handy?!', pen: 'blue' },
        { anchor: 'caFallback', text: '„Nicht validieren“ geht immer! – Kevin', pen: 'pencil' },
        { anchor: 'identity', text: `MIT @${campus.realm} !!`, pen: 'red' },
        { anchor: 'anon', text: 'besser: anonymous@ + Realm wie oben', pen: 'blue' },
        { anchor: 'server', text: '= „Domain“?', pen: 'blue' },
      ],
      corrections: [
        { anchor: 'ca', text: `${wifi.caCertOption} + Domain` },
        { anchor: 'caFallback', text: 'gibt’s seit Android 11 nicht mehr' },
        { anchor: 'identity', text: campus.identity },
        { anchor: 'anon', text: campus.anonymousIdentity },
      ],
    };
  }

  /**
   * Post-it mit den Zugangsdaten (aus GameState.getCredentials()).
   * @param {{username: string, password: string}} credentials
   * @returns {{title: string, lines: string[], footnote: string}}
   */
  function getCredentialNote(credentials) {
    const creds = credentials || {};
    return {
      title: 'Mein Login – nicht verlieren!',
      lines: [`Kennung: ${Util.str(creds.username)}`, `Passwort: ${Util.str(creds.password)}`],
      footnote: '(Ja, ich weiß: Passwort auf Post-it.)',
    };
  }

  /**
   * Absender der Mitleids-Tipps (Kommilitonin aus dem eigenen Kurs).
   * @param {object} campus
   * @returns {string}
   */
  function getTipAuthor(campus) {
    return `Zettel von Lea (${campus.course}):`;
  }

  /**
   * Schwäbischer Ausruf für Rückschläge (über RNG).
   * @param {object} campus
   * @param {object} [rng]
   * @returns {string}
   */
  function pickExclamation(campus, rng) {
    const list = (campus.flavor && campus.flavor.exclamations) || [];
    if (list.length === 0) return '';
    const source = Util.resolveRng(rng);
    return source ? list[source.int(0, list.length - 1)] : list[0];
  }

  // ------------------------------------------------------------------ Ablauf & Balance

  /**
   * Statuszeilen beim Verbinden: unvollständig → nur kurz „Wird gespeichert…“; Versuch →
   * „Verbindung wird hergestellt…“, „Authentifizierung…“ und bei Erfolg „IP-Adresse …“.
   * @param {object} result Ergebnis von validateConfig (oder OLD_PROFILE_RESULT)
   * @param {object} [rng] RNG-kompatibel; ohne → globaler RNG, sonst Mittelwerte
   * @returns {{steps: {status: string, ms: number}[], finalStatus: string}}
   */
  function getConnectionPlan(result, rng) {
    const source = Util.resolveRng(rng);
    const step = (status, range) => ({ status, ms: Util.duration(range, source) });
    if (!result.ok && result.message === STATUS.SAVED) {
      return { steps: [step(STATUS.SAVING, TIMING.SAVING)], finalStatus: STATUS.SAVED };
    }
    const steps = [step(STATUS.CONNECTING, TIMING.CONNECTING), step(STATUS.AUTHENTICATING, TIMING.AUTHENTICATING)];
    if (result.ok) steps.push(step(STATUS.OBTAINING_IP, TIMING.OBTAINING_IP));
    return { steps, finalStatus: result.ok ? STATUS.CONNECTED_NO_INTERNET : result.message };
  }

  /**
   * Strafe für einen Fehlversuch (für ChapterScene.fail).
   * @param {object} result Ergebnis von validateConfig bzw. OLD_PROFILE_RESULT
   * @param {{stampsShown?: number}} [options] bisher gezeigte Stempel (sparsam!)
   * @returns {{frustration: number, minutes: number, stamp: string|null, reason: string}}
   */
  function getPenalty(result, { stampsShown = 0 } = {}) {
    if (result.ok) return { frustration: 0, minutes: 0, stamp: null, reason: '' };
    if (result.code === CODES.OLD_PROFILE) {
      return { frustration: BALANCE.OLD_PROFILE_RETRY, minutes: 0, stamp: null, reason: 'Altes Profil von 2023' };
    }
    if (result.message === STATUS.SAVED) {
      return { frustration: BALANCE.SAVED_ONLY, minutes: 0, stamp: null, reason: 'Nur „Gespeichert“' };
    }
    if (result.message === STATUS.DOMAIN_MISMATCH) {
      return { frustration: BALANCE.DOMAIN_MISMATCH, minutes: BALANCE.AUTH_MINUTES, stamp: null, reason: STATUS.DOMAIN_MISMATCH };
    }
    return {
      frustration: BALANCE.AUTH_PROBLEM,
      minutes: BALANCE.AUTH_MINUTES,
      stamp: stampsShown < BALANCE.MAX_STAMPS ? BALANCE.STAMP_TEXT : null,
      reason: STATUS.AUTH_PROBLEM,
    };
  }

  /**
   * Zählt Fehler je Tipp-Gruppe und entscheidet, wann ein Mitleids-Tipp kommt.
   * @param {{threshold?: number, generalAfter?: number}} [options]
   * @returns {{record: Function, getCount: Function, getTotal: Function, reset: Function}}
   */
  function createFailTracker({ threshold = PITY.THRESHOLD, generalAfter = PITY.GENERAL_AFTER } = {}) {
    const counts = new Map();
    let total = 0;
    return {
      /**
       * @param {string} code
       * @returns {{code: string, group: string, groupCount: number, total: number, shouldShowTip: boolean}}
       */
      record(code) {
        const group = getGroup(code);
        const groupCount = (counts.get(group) || 0) + 1;
        counts.set(group, groupCount);
        total += 1;
        return { code, group, groupCount, total, shouldShowTip: groupCount >= threshold || total >= generalAfter };
      },
      getCount(group) {
        return counts.get(group) || 0;
      },
      getTotal() {
        return total;
      },
      reset() {
        counts.clear();
        total = 0;
      },
    };
  }

  return Object.freeze({
    STATUS,
    CODES,
    FIELDS,
    FIELD_LABELS,
    OPTION,
    KEYBOARD,
    PITY,
    BALANCE,
    TIMING,
    OBJECTIVES,
    TEXTS,
    MERKBLATT_EXAMPLE_USERNAME,
    OLD_PROFILE_RESULT,
    validateConfig,
    splitIdentity,
    matchesDomain,
    mapKey,
    applyLayout,
    isLayoutMixup,
    autocorrect,
    getHint,
    getFieldError,
    getGroup,
    getOptions,
    getDefaultConfig,
    getSolution,
    getNetworks,
    getOldProfile,
    getMerkblatt,
    getCredentialNote,
    getTipAuthor,
    pickExclamation,
    getConnectionPlan,
    getPenalty,
    createFailTracker,
  });
})();
