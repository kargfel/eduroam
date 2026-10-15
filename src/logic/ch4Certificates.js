/**
 * ch4Certificates.js – Reine Logik für Kapitel 4 „Das Zertifikat“ (Evil Twin enttarnen).
 *
 * Inhalt:
 *  - Zertifikatsprüfung: isTrustworthy(cert, reference) → { trustworthy, reasons[], codes[], fields }
 *  - Kevins Fälschungen (Tippfehler-Domain, angehängte Domain, Homoglyph, selbstsigniert,
 *    abgelaufen, falsche CA, perfekte Kopie) und der legitime Zertifikatswechsel (Plot-Twist,
 *    steht nur in der IT-Rundmail)
 *  - Rundenplan: 4 automatische Verbindungen (Android wählt das stärkste „eduroam“) und ein
 *    Finale mit drei Netzen, in dem man selbst wählt
 *  - Spielzustand Ch4Logic.Game (Entscheidungen, Tipps, Statistik), Balance und alle Texte
 *
 * Fachlicher Kern (so stimmt es auch in echt): Jeder Hotspot darf „eduroam“ heißen. Vertraut ein
 * Handy bei PEAP/MSCHAPv2 einem fremden Server, schickt es ihm den Anmelde-Austausch – daraus
 * lässt sich das Passwort offline knacken. Schutz: Servername, Aussteller/Root-CA, Gültigkeit und
 * Fingerabdruck prüfen – am besten automatisch über CA-Zertifikat + Domain im WLAN-Profil.
 * Namen kann jede:r abschreiben, den Fingerabdruck nicht: Darum hat jede Fälschung einen anderen.
 *
 * Reine Logik ohne Grafik- und Browser-APIs, in Node testbar. Zufall nur über ein RNG-Objekt
 * (Standard: globales RNG; Tests übergeben ein eigenes mit derselben Schnittstelle). Genutzt wird
 * davon nur next(), alles Weitere (int, pick, shuffle) rechnet das Modul selbst.
 *
 * Global: Ch4Logic. Abhängigkeiten: CONFIG (Balance-Werte, beim Laden), zur Laufzeit CAMPUS und RNG.
 */

const Ch4Logic = (() => {
  // ---------------------------------------------------------------------------
  // Grundwerte
  // ---------------------------------------------------------------------------

  /** Runden im Kapitel: 4 automatische + 1 Finale. */
  const ROUND_COUNT = 5;
  const AUTO_ROUND_COUNT = 4;
  /** Immer drei Netze namens „eduroam“ in der Liste. */
  const NETWORKS_PER_ROUND = 3;
  /** Böse UX: „Automatisch vertrauen in 10 s“. */
  const COUNTDOWN_MS = 10000;
  /** Spieldatum (Montag im Oktober 2026) – Bezug für „abgelaufen“ und „noch nicht gültig“. */
  const GAME_DATE = '12.10.2026';
  const FINGERPRINT_BYTES = 32;
  const FINGERPRINT_ROW_GROUPS = 8;
  /** Perfekte Kopie: so viele Gruppen am Anfang und am Ende stimmen (2 Byte je Seite sind per Rechenzeit erzwingbar). */
  const COPY_KEEP_GROUPS = 2;
  const COPY_MIN_CHANGED_GROUPS = 6;
  const COPY_EXTRA_CHANGED_GROUPS = 3;
  /** Tipp-Stufen im Finale (1 = Rundmail erwähnen, 2 = Fingerabdruck nennen, 3 = Klartext). */
  const MAX_HINT_LEVEL = 3;
  /** Gruppen des neuen Fingerabdrucks, die Tipps und Banner zitieren. */
  const HINT_PREFIX_GROUPS = 4;
  /** Signalstärken (dBm) für die Netzliste. */
  const SIGNAL = Object.freeze({
    KEVIN_NEAR: [-46, -36],       // Kevin sitzt zwei Tische weiter
    AP_UNDER: [-45, -38],         // direkt unter dem Access Point
    AP_CORRIDOR: [-69, -56],      // Access Point im Flur
    OTHER: [-79, -60],            // sonstige eduroam-Sender
    FINALE: [[-46, -38], [-56, -48], [-68, -58]],
    LEVELS: [-50, -60, -70, -80], // ≥ Schwelle → 4, 3, 2, 1 Balken, darunter 0
  });

  const KIND = Object.freeze({
    GENUINE: 'genuine',          // echtes Zertifikat laut Ausdruck der IT-Seite
    RENEWED: 'renewed',          // echtes, heute getauschtes Zertifikat (nur in der Rundmail)
    TYPO: 'typo',                // Tippfehler-Domain
    SUFFIX: 'suffix',            // radius.dhbw-stuttgart.de.evil.example
    HOMOGLYPH: 'homoglyph',      // kyrillisches „а“ im Namen
    SELF_SIGNED: 'selfSigned',   // „Kevin's CA“
    EXPIRED: 'expired',          // abgelaufen
    WRONG_CA: 'wrongCa',         // öffentlich gültig, aber für Kevins Domain
    COPY: 'copy',                // alles abgeschrieben, nur der Fingerabdruck passt nicht
  });

  const OUTCOME = Object.freeze({
    CAUGHT: 'caught',       // Fälschung abgelehnt
    CONNECTED: 'connected', // echtem Netz vertraut
    PHISHED: 'phished',     // Fälschung vertraut
    PARANOID: 'paranoid',   // echtes Netz abgelehnt
  });

  const CODE = Object.freeze({
    MISSING: 'MISSING',
    SERVER_NAME: 'SERVER_NAME',
    SUFFIX: 'SUFFIX',
    HOMOGLYPH: 'HOMOGLYPH',
    ISSUER: 'ISSUER',
    SELF_SIGNED: 'SELF_SIGNED',
    ROOT_CA: 'ROOT_CA',
    EXPIRED: 'EXPIRED',
    NOT_YET_VALID: 'NOT_YET_VALID',
    BAD_DATES: 'BAD_DATES',
    FINGERPRINT: 'FINGERPRINT',
  });

  const STATUS = Object.freeze({
    IDLE: 'idle',
    CAUGHT: 'caught',
    PHISHED: 'phished',
    REJECTED: 'rejected',
    CONNECTED: 'connected',
  });

  const DECISION = Object.freeze({ TRUST: 'trust', REJECT: 'reject' });

  /**
   * Der legitime Zertifikatswechsel (Plot-Twist). Laufzeit 199 Tage: Seit dem 15.03.2026 dürfen
   * öffentlich vertrauenswürdige TLS-Zertifikate höchstens 200 Tage gelten (CA/B-Forum).
   */
  const RENEWAL = Object.freeze({
    sha256: '7C:3D:A0:58:E1:9B:24:F6:0D:C7:82:5E:B3:19:6A:F4:E8:21:9D:07:C5:3B:A6:72:4F:D0:18:8E:B9:63:2C:E1',
    validFrom: GAME_DATE,
    validTo: '29.04.2027',
    announcedOn: GAME_DATE,
    announcedAt: '06:58',
  });

  /** Bausteine für Kevins Fälschungen (Varianten per Zufall). */
  const FORGERY = Object.freeze({
    SUFFIXES: Object.freeze(['evil.example', 'login-portal.example', 'free-wifi.example']),
    SELF_SIGNED_CAS: Object.freeze(["Kevin's CA", 'DHBW Stuttgart Root CA', 'eduroam Security CA']),
    SELF_SIGNED_YEARS: 10,
    /** Altes Zertifikat aus der Sectigo-Zeit von GÉANT TCS (Vertrag endete am 10.01.2025). */
    SECTIGO: Object.freeze({
      issuer: 'GEANT OV RSA CA 4',
      rootCA: 'USERTrust RSA Certification Authority',
      validFrom: '15.01.2024',
      validTo: '31.01.2025',
    }),
    /** Abgeschriebene Namen, aber seit zwei Wochen abgelaufen. */
    RECENTLY_EXPIRED: Object.freeze({ validFrom: '01.10.2025', validTo: '30.09.2026' }),
    /** Öffentlich gültiges 90-Tage-Zertifikat – nur eben für Kevins eigene Domain. */
    PUBLIC_CA: Object.freeze({
      issuer: "R11 (Let's Encrypt)",
      rootCA: 'ISRG Root X1',
      validFrom: '01.10.2026',
      validTo: '30.12.2026',
      domainSuffix: '-wlan.example',
    }),
    /** Lateinisch → kyrillisch (sieht gleich aus). */
    HOMOGLYPHS: Object.freeze({ a: 'а', e: 'е', o: 'о', c: 'с', p: 'р', x: 'х' }),
    CYRILLIC_RANGE: Object.freeze([0x0400, 0x04ff]),
  });

  /** Balance (Frust in Prozentpunkten, Zeit in Spielminuten) – Werte aus CONFIG. */
  const BALANCE = Object.freeze({
    UPDATE_FRUSTRATION: CONFIG.FRUSTRATION.SMALL,          // Android-Update setzt eduroam zurück
    DEAUTH_FRUSTRATION: CONFIG.FRUSTRATION.TINY,           // Kevin wirft dich aus dem echten Netz
    PHISH_FIRST_FRUSTRATION: CONFIG.FRUSTRATION.LARGE,     // erster Phish: großer Frust
    PHISH_REPEAT_FRUSTRATION: CONFIG.FRUSTRATION.MEDIUM,
    PHISH_FIRST_MINUTES: CONFIG.PENALTY_MINUTES.LARGE,     // Passwort ändern über EDGE
    PHISH_REPEAT_MINUTES: CONFIG.PENALTY_MINUTES.MEDIUM,
    PARANOID_FRUSTRATION: CONFIG.FRUSTRATION.SMALL,        // echtes Netz abgelehnt
    PARANOID_MINUTES: CONFIG.PENALTY_MINUTES.SMALL,        // Android sucht neu
    ALL_REJECTED_FRUSTRATION: CONFIG.FRUSTRATION.TINY,     // im Finale alles abgelehnt
    MAGNIFIER_MINUTES: CONFIG.PENALTY_MINUTES.SMALL,       // Lupe aus dem Sekretariat holen
  });

  // ---------------------------------------------------------------------------
  // Zufall (nur über ein RNG-Objekt)
  // ---------------------------------------------------------------------------

  /**
   * Deterministischer Ersatz, falls weder rng übergeben wurde noch das globale RNG existiert
   * (nur für isolierte Tests; im Spiel ist RNG immer geladen).
   * @param {number} seed
   */
  function createFallbackRng(seed) {
    let state = seed >>> 0;
    return {
      next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
    };
  }

  /**
   * Liefert ein Objekt mit next(); bevorzugt das übergebene, dann das globale RNG.
   * @param {{next: Function}} [rng]
   */
  function resolveRng(rng) {
    if (rng && typeof rng.next === 'function') return rng;
    if (typeof RNG !== 'undefined' && RNG && typeof RNG.next === 'function') return RNG;
    return createFallbackRng(1);
  }

  /** Ganze Zahl zwischen min und max (inklusive). */
  function randInt(rng, min, max) {
    return min + Math.floor(rng.next() * (max - min + 1));
  }

  function randPick(rng, array) {
    return array[randInt(rng, 0, array.length - 1)];
  }

  /** Neues, gemischtes Array (Fisher-Yates); Original bleibt unverändert. */
  function randShuffle(rng, array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = randInt(rng, 0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function randomByteHex(rng) {
    return randInt(rng, 0, 255).toString(16).toUpperCase().padStart(2, '0');
  }

  // ---------------------------------------------------------------------------
  // Datum, Fingerabdruck, Servername
  // ---------------------------------------------------------------------------

  /**
   * Wandelt 'TT.MM.JJJJ' oder 'JJJJ-MM-TT' in eine vergleichbare Zahl JJJJMMTT.
   * @param {string} value
   * @returns {number} NaN bei unlesbarem Wert
   */
  function parseDate(value) {
    if (typeof value !== 'string') return NaN;
    const text = value.trim();
    let match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (match) return Number(match[3]) * 10000 + Number(match[2]) * 100 + Number(match[1]);
    match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
    return NaN;
  }

  /** 'TT.MM.JJJJ' + n Jahre (Tag und Monat bleiben). */
  function addYears(dateText, years) {
    const match = typeof dateText === 'string' ? dateText.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/) : null;
    if (!match) return dateText;
    return `${match[1]}.${match[2]}.${Number(match[3]) + years}`;
  }

  /** Nur Hex-Ziffern, Großbuchstaben (Doppelpunkte, Leerzeichen, Kleinschreibung egal). */
  function normalizeFingerprint(value) {
    return typeof value === 'string' ? value.replace(/[^0-9a-f]/gi, '').toUpperCase() : '';
  }

  /** Gruppen à 2 Hex-Ziffern. */
  function fingerprintGroups(value) {
    const hex = normalizeFingerprint(value);
    const groups = [];
    for (let i = 0; i + 1 < hex.length; i += 2) groups.push(hex.slice(i, i + 2));
    return groups;
  }

  /** 'AA:BB:…' */
  function formatFingerprint(value) {
    return fingerprintGroups(value).join(':');
  }

  /**
   * Zeilen à 8 Gruppen (wie im Zertifikats-Viewer und auf dem Ausdruck).
   * @returns {string[]}
   */
  function formatFingerprintRows(value, perRow = FINGERPRINT_ROW_GROUPS) {
    const groups = fingerprintGroups(value);
    const rows = [];
    for (let i = 0; i < groups.length; i += perRow) rows.push(groups.slice(i, i + perRow).join(':'));
    return rows;
  }

  function sameFingerprint(a, b) {
    const left = normalizeFingerprint(a);
    return left.length > 0 && left === normalizeFingerprint(b);
  }

  /** Indizes der Gruppen, in denen sich zwei Fingerabdrücke unterscheiden. */
  function diffFingerprintGroups(a, b) {
    const left = fingerprintGroups(a);
    const right = fingerprintGroups(b);
    const diff = [];
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      if (left[i] !== right[i]) diff.push(i);
    }
    return diff;
  }

  /** Erste Gruppen eines Fingerabdrucks, z. B. '7C:3D:A0:58' (für Tipps). */
  function fingerprintPrefix(value, groups = HINT_PREFIX_GROUPS) {
    return fingerprintGroups(value).slice(0, groups).join(':');
  }

  /** Zufälliger Fingerabdruck, der keinem aus `avoid` gleicht. */
  function randomFingerprint(rng, avoid = []) {
    const forbidden = avoid.map(normalizeFingerprint);
    let hex = '';
    do {
      const groups = [];
      for (let i = 0; i < FINGERPRINT_BYTES; i += 1) groups.push(randomByteHex(rng));
      hex = groups.join('');
    } while (forbidden.includes(hex));
    return formatFingerprint(hex);
  }

  /**
   * Perfekte Kopie: Anfang und Ende wie das Original, in der Mitte mehrere andere Gruppen.
   * (Ein paar Byte am Rand lassen sich mit Rechenzeit erzwingen – alle 32 nie.)
   */
  function mutateFingerprintMiddle(base, rng) {
    const groups = fingerprintGroups(base);
    const middle = [];
    for (let i = COPY_KEEP_GROUPS; i < groups.length - COPY_KEEP_GROUPS; i += 1) middle.push(i);
    const count = COPY_MIN_CHANGED_GROUPS + randInt(rng, 0, COPY_EXTRA_CHANGED_GROUPS);
    randShuffle(rng, middle)
      .slice(0, count)
      .forEach((index) => {
        let replacement = groups[index];
        while (replacement === groups[index]) replacement = randomByteHex(rng);
        groups[index] = replacement;
      });
    return groups.join(':');
  }

  /** Signalbalken 0–4 aus dBm. */
  function signalLevel(dbm) {
    const index = SIGNAL.LEVELS.findIndex((threshold) => dbm >= threshold);
    return index === -1 ? 0 : SIGNAL.LEVELS.length - index;
  }

  /**
   * Kürzt einen Servernamen für die kompakte Dialog-Ansicht (wie Android: „…“ am Ende).
   * @param {string} name
   * @param {number} maxChars
   */
  function truncateServerName(name, maxChars) {
    const text = String(name || '');
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  }

  /** Index des Domain-Labels (vorletztes Label, z. B. „dhbw-stuttgart“). */
  function domainLabelIndex(labels) {
    return labels.length >= 2 ? labels.length - 2 : 0;
  }

  /** Buchstabendreher oder fehlender Doppelbuchstabe im Domain-Label. */
  function makeTypo(serverName, rng) {
    const labels = serverName.split('.');
    const li = domainLabelIndex(labels);
    const label = labels[li];
    const isLetter = (ch) => /[a-z]/i.test(ch || '');
    const candidates = [];
    for (let i = 1; i < label.length - 1; i += 1) {
      if (isLetter(label[i]) && isLetter(label[i + 1]) && label[i] !== label[i + 1]) candidates.push({ type: 'swap', i });
    }
    for (let i = 1; i < label.length; i += 1) {
      if (isLetter(label[i]) && label[i] === label[i - 1]) candidates.push({ type: 'drop', i });
    }
    let mutated;
    if (candidates.length === 0) {
      mutated = `${label}${label.slice(-1)}`; // sehr kurzes Label: letzten Buchstaben verdoppeln
    } else {
      const choice = randPick(rng, candidates);
      mutated = choice.type === 'swap'
        ? label.slice(0, choice.i) + label[choice.i + 1] + label[choice.i] + label.slice(choice.i + 2)
        : label.slice(0, choice.i) + label.slice(choice.i + 1);
    }
    labels[li] = mutated;
    return labels.join('.');
  }

  /** Ersetzt im Domain-Label das letzte passende Zeichen durch sein kyrillisches Gegenstück. */
  function makeHomoglyph(serverName) {
    const labels = serverName.split('.');
    const order = [domainLabelIndex(labels), ...labels.map((_, i) => i)];
    for (const li of order) {
      const label = labels[li];
      for (let i = label.length - 1; i >= 0; i -= 1) {
        const replacement = FORGERY.HOMOGLYPHS[label[i]];
        if (replacement) {
          labels[li] = label.slice(0, i) + replacement + label.slice(i + 1);
          return labels.join('.');
        }
      }
    }
    return `${serverName}${FORGERY.HOMOGLYPHS.a}`;
  }

  /** Kyrillische Doppelgänger zurück ins Lateinische (für den Vergleich „sieht gleich aus“). */
  function foldHomoglyphs(name) {
    const back = {};
    Object.entries(FORGERY.HOMOGLYPHS).forEach(([latin, glyph]) => {
      back[glyph] = latin;
    });
    return String(name || '').replace(/[^\x00-\x7f]/g, (ch) => back[ch] || ch);
  }

  /** Erstes Nicht-ASCII-Zeichen samt Beschreibung oder null. */
  function findUnusualChar(name) {
    const text = String(name || '');
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code > 0x7e) {
        const [from, to] = FORGERY.CYRILLIC_RANGE;
        return {
          char: text[i],
          index: i,
          code: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
          latin: foldHomoglyphs(text[i]),
          isCyrillic: code >= from && code <= to,
        };
      }
    }
    return null;
  }

  function sameText(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // Texte (alle Kapiteltexte an einer Stelle)
  // ---------------------------------------------------------------------------

  const REASON = Object.freeze({
    missing: 'Kein Zertifikat – nichts, dem man vertrauen könnte.',
    serverName: (got, want) => (got ? `Servername „${got}“ statt „${want}“.` : `Servername fehlt (erwartet: „${want}“).`),
    suffix: (got, want) =>
      `Servername geht nach „${want}“ noch weiter („…${got.slice(want.length)}“) – das ist Kevins Domain, nicht die der DHBW.`,
    homoglyph: (info) =>
      `Servername enthält ein ${info.isCyrillic ? 'kyrillisches' : 'fremdes'} Zeichen (${info.code}) – sieht aus wie „${info.latin}“, ist es aber nicht.`,
    issuer: (got, want) => `Aussteller „${got || '—'}“ statt „${want}“.`,
    selfSigned: (name) => `Selbstsigniert: „${name}“ bestätigt sich selbst. So ein Zertifikat kann sich jede:r ausstellen.`,
    rootCA: (got, want) => `Root-CA „${got || '—'}“ statt „${want}“.`,
    expired: (date) => `Abgelaufen am ${date}.`,
    notYetValid: (date) => `Erst gültig ab ${date}.`,
    badDates: 'Gültigkeit fehlt oder ist unlesbar.',
    fingerprintPrinted: 'SHA-256-Fingerabdruck passt nicht zum Ausdruck der IT-Seite.',
    fingerprintAll: 'SHA-256-Fingerabdruck passt weder zum Ausdruck der IT-Seite noch zur IT-Rundmail.',
    noReference: 'Keine Referenz zum Vergleichen – im Zweifel nicht vertrauen.',
  });

  const TEXTS = Object.freeze({
    updateNotice: Object.freeze({
      title: 'Systemupdate installiert',
      body:
        'Für mehr Sicherheit wurden deine WLAN-Einstellungen zurückgesetzt.\n\n' +
        'Neu: Bei jeder eduroam-Verbindung fragt Android, ob du dem Zertifikat vertraust. ' +
        `Für mehr Komfort wird nach ${Math.round(COUNTDOWN_MS / 1000)} Sekunden automatisch vertraut.`,
      button: 'Na super',
      reason: 'Update hat eduroam zurückgesetzt',
    }),
    finaleNotice: Object.freeze({
      title: 'Automatisch verbinden: aus',
      body:
        'Nach so vielen Abbrüchen hat Android „Automatisch verbinden“ abgeschaltet. ' +
        'Und Kevin funkt jetzt mit zwei Hotspots.\n\n' +
        'Tippe selbst ein „eduroam“ an, prüf das Zertifikat und vertrau nur dem echten.',
      button: 'Los',
    }),
    dialog: Object.freeze({
      title: 'Diesem Netzwerk vertrauen?',
      hint: 'Prüf das Zertifikat, bevor du vertraust.',
      details: 'Details anzeigen',
      trust: 'Vertrauen',
      reject: 'Ablehnen',
      countdown: (seconds) => `Automatisch vertrauen in ${seconds} s`,
      paused: 'Countdown angehalten – Details offen',
      announced: '✓ In der IT-Rundmail angekündigt',
      magnifier: 'Lupe: grün = passt, rot = weicht ab',
      connecting: 'Verbinde …',
      labels: Object.freeze({
        serverName: 'Servername',
        organization: 'Organisation',
        issuer: 'Aussteller',
        rootCA: 'Root-CA',
        validFrom: 'Gültig ab',
        validTo: 'Gültig bis',
        validity: 'Gültigkeit',
        sha256: 'SHA-256-Fingerabdruck',
      }),
    }),
    phone: Object.freeze({
      appBar: 'WLAN',
      toggle: 'WLAN verwenden',
      section: 'Verfügbare Netzwerke',
      addNetwork: '+ Netzwerk hinzufügen',
      addNetworkToast:
        '„Manuell konfigurierte Geräte können zu Ihrer Sicherheit keine Verbindung mehr zum WLAN aufbauen.“ (IT-Merkblatt, 2021)',
      status: Object.freeze({
        idle: 'Gesichert',
        connecting: 'Verbinde …',
        dialog: 'Zertifikat prüfen …',
        caught: 'Fälschung – gesperrt',
        phished: 'Kevin! – entfernt',
        rejected: 'Abgelehnt',
        connected: 'Verbunden',
        disconnected: 'Getrennt',
      }),
      chip: Object.freeze({ caught: 'FÄLSCHUNG', phished: 'KEVIN', rejected: 'ABGELEHNT', connected: 'VERBUNDEN' }),
      busyToast: 'Android verbindet gerade automatisch mit dem stärksten Netz. Geduld.',
      blockedToast: 'Das ist Kevins Hotspot. Gesperrt.',
      connectedToast: 'Damit bist du schon verbunden.',
      waitToast: 'Erst die Meldung auf dem Handy erledigen.',
    }),
    /** HUD-Aufgaben: höchstens 40 Zeichen, sonst kürzt das HUD sie. */
    objectives: Object.freeze({
      intro: 'Android-Meldung lesen und bestätigen',
      connecting: (n) => `Runde ${n}/${ROUND_COUNT}: Android verbindet …`,
      dialog: (n) => `Runde ${n}/${ROUND_COUNT}: Zertifikat prüfen – echt?`,
      result: (n) => `Runde ${n}/${ROUND_COUNT}: Auswertung lesen`,
      finaleIntro: 'Finale: Meldung lesen',
      choose: 'Finale: Tippe ein eduroam-Netz an',
      finaleDialog: 'Finale: Nur dem echten Netz vertrauen',
      final: 'Verbunden! Zusammenfassung lesen',
      done: 'Geschafft – weiter zum nächsten Kapitel',
    }),
    /** Je Runde: Ort (Fortschrittszeile), optional kürzerer Ort für den Toast, Einleitung. */
    rounds: Object.freeze([
      Object.freeze({
        place: (campus) => `Foyer, ${campus.lectureBuilding}`,
        toastPlace: 'Foyer',
        intro: 'Android verbindet automatisch mit dem stärksten „eduroam“.',
      }),
      Object.freeze({ place: () => 'Treppenhaus', intro: 'Neuer Access Point, neue Frage.' }),
      Object.freeze({ place: () => 'Mensa', intro: 'Kevin sitzt zwei Tische weiter. Sein Laptop läuft heiß.' }),
      Object.freeze({ place: () => 'Bibliothek', intro: 'Pssst. Auch hier funkt Kevin.' }),
      Object.freeze({
        place: (campus) => `Vor ${campus.lectureRoom}`,
        intro: 'Drei Netze namens „eduroam“. Eins davon ist echt.',
      }),
    ]),
    kevin: Object.freeze({
      typo: 'Kevin: Ha noi! Ein Buchstabendreher. Passiert den Besten.',
      suffix: 'Kevin: Wer liest Servernamen denn bis zum Ende?!',
      homoglyph: 'Kevin: Ein kyrillisches Zeichen! Woher wusstest du das?',
      selfSigned: 'Kevin: Meine CA ist auch eine CA!',
      expired: 'Kevin: So a Glump! Das war doch mal gültig!',
      wrongCa: 'Kevin: Das Zertifikat war echt! … nur halt für meine Domain.',
      copy: 'Kevin: Ich hab alles abgeschrieben! ALLES!',
      phished: 'Kevin: Danke für dein Passwort! Schönes Semester noch.',
    }),
    outcomes: Object.freeze({
      caughtTitle: 'Kevin enttarnt!',
      evidence: 'Woran man es erkennt:',
      copyLesson: 'Merke: Namen kann jede:r abschreiben – den Fingerabdruck nicht.',
      connectedTitle: 'Echt – und verbunden. Kurz.',
      connectedChecked: 'Alles passte zum Ausdruck: richtig vertraut.',
      connectedAuto: 'Glück gehabt: Der Countdown hat für dich vertraut – diesmal dem echten Netz.',
      deauth:
        'Dann „Verbindung getrennt“: Kevin wirft dich mit gefälschten Abmelde-Paketen (Deauth) raus, ' +
        'damit du dich neu verbindest – am liebsten mit ihm.',
      deauthReason: 'Kevin: Deauth-Angriff',
      phishedTitle: 'Gephisht!',
      phishedManual: 'Das war Kevins Hotspot.',
      phishedAuto: 'Du hast nichts getippt – der Countdown hat Kevins Hotspot vertraut.',
      phishedWhy:
        'Dein Handy hat ihm deine Anmeldung geschickt. Bei PEAP/MSCHAPv2 kann er daraus dein Passwort offline knacken. ' +
        'Also: sofort Passwort ändern.',
      phishedHint: (reason) => `Erkennbar gewesen: ${reason}`,
      phishedReason: 'Evil Twin vertraut',
      phishedRepeatReason: 'Schon wieder Kevin vertraut',
      paranoidTitle: 'Das war das echte Netz.',
      paranoidAuto:
        'Servername, Aussteller, Root-CA, Gültigkeit und Fingerabdruck passten zum Ausdruck – da darfst du vertrauen.',
      paranoidSearch: 'Android sucht neu …',
      paranoidReason: 'Echtes Netz abgelehnt',
      finaleRejectedTitle: 'Abgelehnt.',
      finaleRejected: 'Android: „Keine Verbindung.“',
      finaleCaution: 'Im Zweifel ablehnen ist richtig – nur kommst du so nicht ins Netz.',
      finaleRejectedReason: 'Kein eduroam verbunden',
      allRejected: 'Alle drei abgelehnt – jetzt stehst du ganz ohne Netz da.',
      continueButton: 'Weiter',
      passwordButton: (minutes) => `Passwort ändern (+${minutes} min)`,
    }),
    hints: Object.freeze({
      finale: Object.freeze([
        null,
        () =>
          'Passt nicht zum Ausdruck? Vielleicht hat sich etwas geändert: Unter dem Ausdruck liegt die IT-Rundmail. ' +
          'Lies sie, bevor du weiter ablehnst.',
        (prefix) => `Laut IT-Rundmail hat der Server seit heute ein neues Zertifikat. Sein Fingerabdruck beginnt mit ${prefix} – vergleich damit.`,
        (prefix) => `Ganz ehrlich: Das Netz mit dem Fingerabdruck ${prefix} … ist das echte. Steht so in der Rundmail.`,
      ]),
      phish: Object.freeze([
        null,
        'Langsam! Erst „Details“ antippen (das hält den Countdown an), dann Zeile für Zeile mit dem Ausdruck vergleichen. ' +
          'Eine Abweichung reicht zum Ablehnen.',
        'Ab jetzt hilft die Lupe gratis: Rot markierte Felder weichen vom Ausdruck ab.',
      ]),
      auto: 'Der Countdown ist kein Freund: „Details“ antippen hält ihn an.',
      paranoidAuto: 'Stimmt alles mit dem Ausdruck überein, darfst du vertrauen.',
    }),
    postit: Object.freeze({
      initial: 'Kevin (3. Semester) sammelt Passwörter!\n• „Details“ antippen – hält den Countdown an\n• alles mit dem Ausdruck vergleichen\n• eine Abweichung = Ablehnen',
      phish: 'Langsam! Erst „Details“, dann Zeile für Zeile vergleichen. Die Lupe hilft (+2 min).',
      lupe: 'Lupe läuft gratis mit: rot = weicht ab. Kevin ist verzweifelt.',
      auto: 'Der Countdown ist kein Freund. „Details“ stoppt ihn.',
      news: 'Neues Zertifikat? → IT-Rundmail lesen! (liegt unter dem Ausdruck)',
      newsStrong: (prefix) => `Rundmail: neuer Fingerabdruck beginnt mit ${prefix}`,
      done: 'Geschafft. Kevin sucht sich ein anderes Hobby.',
    }),
    sheet: Object.freeze({
      header: 'IT.SERVICE CENTER · DHBW STUTTGART',
      title: 'eduroam: So erkennen Sie unseren echten WLAN-Server',
      labels: Object.freeze({
        serverName: 'Servername',
        issuer: 'Aussteller',
        rootCA: 'Root-CA',
        validity: 'Gültig',
        sha256: 'SHA-256-Fingerabdruck',
      }),
      warning: 'Weicht etwas ab? NICHT verbinden!',
      footer: (campus) => {
        const match = String(campus.certificate.validFrom || '').match(/^\d{1,2}\.(\d{1,2})\.(\d{4})$/);
        const stand = match ? `${match[1].padStart(2, '0')}/${match[2]}` : campus.certificate.validFrom;
        return `Stand: ${stand} · Änderungen siehe IT-News`;
      },
      magnifierButton: (minutes) => `Lupe (+${minutes} min)`,
      magnifierReason: 'Lupe aus dem Sekretariat geholt',
      magnifierNoDialog: 'Die Lupe vergleicht das geöffnete Zertifikat. Erst ein Netz antippen.',
      magnifierActive: 'Die Lupe liegt schon auf dem Zertifikat.',
    }),
    news: Object.freeze({
      header: 'IT.Service Center · IT-News Oktober',
      meta: () => `${RENEWAL.announcedOn}, ${RENEWAL.announcedAt} Uhr`,
      /** Sichtbarer Streifen, solange die Rundmail unter dem Ausdruck liegt. */
      teaser: 'Betreff:\nIT-News Oktober',
      tab: 'IT-RUNDMAIL',
      badge: '1 NEU',
      /** Weitere Meldungen unter dem Zertifikatswechsel (echt: Ersatz-Passwort am Kopierer). */
      items: Object.freeze([
        '+++ Passwort vergessen? Ersatz nur persönlich – oder mit dem Studierendenausweis am Kopierer.',
      ]),
      certItem: (campus) =>
        `+++ WLAN: Heute tauschen wir das Zertifikat von ${campus.certificate.serverName} ` +
        '(neue Regeln: max. 200 Tage Laufzeit). Name, Aussteller und Root-CA bleiben gleich.',
      certValidity: () => `Gültig: ${RENEWAL.validFrom} – ${RENEWAL.validTo}`,
      certFingerprintLabel: 'Neuer SHA-256-Fingerabdruck:',
      certFooter: 'Die IT-Seite aktualisieren wir zeitnah.',
      readToast: 'IT-Rundmail gelesen. Interessant …',
    }),
    otherNetworks: (campus) => [
      {
        ssid: campus.wifi.guestSsid,
        toast: `„${campus.wifi.guestSsid}“: Gastzugang nur mit Voucher aus dem Sekretariat. Das Sekretariat hat gerade zu.`,
        dbm: -63,
        isLocked: false,
      },
      {
        ssid: 'FRITZ!Box 7590 XY',
        toast: 'Das Passwort steht hinten auf der Box. Die Box hängt im Hausmeisterbüro.',
        dbm: -71,
        isLocked: true,
      },
      {
        ssid: 'iPhone von Kevin',
        toast: 'Kevins Handy-Hotspot. Nein. Einfach nein.',
        dbm: -44,
        isLocked: true,
      },
    ],
    final: Object.freeze({
      title: 'Verbunden – mit dem echten eduroam!',
      lessons: Object.freeze([
        'Das echte Netz erkennst du am Zertifikat: Servername, Aussteller und Root-CA stimmen, es ist gültig – ' +
          'und der Fingerabdruck steht auf der IT-Seite oder in den IT-News.',
        'Noch besser: CA-Zertifikat und Domain im WLAN-Profil eintragen oder die offizielle App der Hochschule nutzen. ' +
          'Dann prüft dein Handy das bei jeder Verbindung selbst – und Kevins Hotspot fliegt ohne Rückfrage raus.',
        'Übrigens: Mit easyroam (Zertifikat statt Passwort, so läuft es inzwischen am Campus Stuttgart) ' +
          'hätte Kevin gar kein Passwort abgreifen können.',
      ]),
      perfect: 'Jedes Zertifikat richtig beurteilt. Kevin wechselt das Semester.',
      phished: (count) => `Kevin hat ${count}× deine Anmeldung abgegriffen – gut, dass du das Passwort geändert hast.`,
      button: 'Weiter',
    }),
    passwordChange: Object.freeze({
      reason: 'Passwort geändert (Self-Service-Portal über EDGE)',
      done: 'Passwort geändert. Kevins Beute ist wertlos.',
    }),
    caughtFloat: 'Kevin enttarnt!',
  });

  // ---------------------------------------------------------------------------
  // Referenz und Prüfung
  // ---------------------------------------------------------------------------

  /**
   * Baut die Referenz aus dem Ausdruck der IT-Seite (CAMPUS.certificate) und optional der Rundmail.
   * @param {object} campus CAMPUS
   * @param {{includeNews?: boolean, today?: string}} [opts]
   */
  function buildReference(campus, { includeNews = true, today = GAME_DATE } = {}) {
    const cert = campus.certificate;
    const trustedFingerprints = [{ sha256: cert.sha256, source: 'it-page' }];
    if (includeNews) trustedFingerprints.push({ sha256: RENEWAL.sha256, source: 'it-news' });
    return {
      serverName: cert.serverName,
      issuer: cert.issuer,
      rootCA: cert.rootCA,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      sha256: cert.sha256,
      today: today || GAME_DATE,
      trustedFingerprints,
    };
  }

  /** Akzeptiert die volle Referenz oder direkt CAMPUS.certificate. */
  function normalizeReference(reference) {
    if (!reference || typeof reference !== 'object') return null;
    const trusted = Array.isArray(reference.trustedFingerprints)
      ? reference.trustedFingerprints
      : reference.sha256
        ? [{ sha256: reference.sha256, source: 'it-page' }]
        : [];
    return {
      serverName: reference.serverName,
      issuer: reference.issuer,
      rootCA: reference.rootCA,
      today: reference.today || GAME_DATE,
      trustedFingerprints: trusted,
    };
  }

  /**
   * Prüft ein Server-Zertifikat gegen die Referenz (Vertrag: → { trustworthy, reasons[] }).
   * Zusätzlich: codes[] (maschinenlesbar) und fields (je Feld true = passt) für die Lupe.
   * @param {object} cert { serverName, organization, issuer, rootCA, validFrom, validTo, sha256, selfSigned }
   * @param {object} reference buildReference(...) oder CAMPUS.certificate
   * @returns {{trustworthy: boolean, reasons: string[], codes: string[], fields: object}}
   */
  function isTrustworthy(cert, reference) {
    const fields = { serverName: true, issuer: true, rootCA: true, validity: true, sha256: true };
    const reasons = [];
    const codes = [];
    const add = (code, reason) => {
      codes.push(code);
      reasons.push(reason);
    };
    const ref = normalizeReference(reference);
    if (!cert || typeof cert !== 'object') {
      Object.keys(fields).forEach((key) => {
        fields[key] = false;
      });
      add(CODE.MISSING, REASON.missing);
      return { trustworthy: false, reasons, codes, fields };
    }
    if (!ref) {
      add(CODE.MISSING, REASON.noReference);
      return { trustworthy: false, reasons, codes, fields };
    }

    // 1. Servername (exakt; Groß-/Kleinschreibung egal)
    if (!sameText(cert.serverName, ref.serverName)) {
      fields.serverName = false;
      const name = typeof cert.serverName === 'string' ? cert.serverName.trim() : '';
      const unusual = findUnusualChar(name);
      if (unusual && sameText(foldHomoglyphs(name), ref.serverName)) {
        add(CODE.HOMOGLYPH, REASON.homoglyph(unusual));
      } else if (name.toLowerCase().startsWith(`${String(ref.serverName).toLowerCase()}.`)) {
        add(CODE.SUFFIX, REASON.suffix(name, ref.serverName));
      } else {
        add(CODE.SERVER_NAME, REASON.serverName(name, ref.serverName));
      }
    }

    // 2. Aussteller und selbstsigniert
    const looksSelfSigned =
      cert.selfSigned === true || (sameText(cert.issuer, cert.rootCA) && !sameText(ref.issuer, ref.rootCA));
    if (looksSelfSigned) add(CODE.SELF_SIGNED, REASON.selfSigned(cert.issuer || cert.rootCA || '?'));
    if (!sameText(cert.issuer, ref.issuer)) {
      fields.issuer = false;
      add(CODE.ISSUER, REASON.issuer(cert.issuer, ref.issuer));
    }

    // 3. Root-CA
    if (!sameText(cert.rootCA, ref.rootCA)) {
      fields.rootCA = false;
      add(CODE.ROOT_CA, REASON.rootCA(cert.rootCA, ref.rootCA));
    }

    // 4. Gültigkeit (Grenzen inklusive)
    const today = parseDate(ref.today);
    const from = parseDate(cert.validFrom);
    const to = parseDate(cert.validTo);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      fields.validity = false;
      add(CODE.BAD_DATES, REASON.badDates);
    } else if (to < today) {
      fields.validity = false;
      add(CODE.EXPIRED, REASON.expired(cert.validTo));
    } else if (from > today) {
      fields.validity = false;
      add(CODE.NOT_YET_VALID, REASON.notYetValid(cert.validFrom));
    }

    // 5. Fingerabdruck – muss einem veröffentlichten gleichen
    if (!ref.trustedFingerprints.some((entry) => sameFingerprint(entry.sha256, cert.sha256))) {
      fields.sha256 = false;
      const knowsNews = ref.trustedFingerprints.some((entry) => entry.source === 'it-news');
      add(CODE.FINGERPRINT, knowsNews ? REASON.fingerprintAll : REASON.fingerprintPrinted);
    }

    return { trustworthy: reasons.length === 0, reasons, codes, fields };
  }

  // ---------------------------------------------------------------------------
  // Zertifikate erzeugen
  // ---------------------------------------------------------------------------

  /**
   * Erzeugt ein Zertifikat eines Typs (echt, erneuert oder eine von Kevins Fälschungen).
   * @param {string} kind Wert aus KIND
   * @param {{campus?: object, rng?: object, reference?: object}} [opts]
   */
  function makeCertificate(kind, { campus, rng, reference } = {}) {
    const site = campus || (typeof CAMPUS !== 'undefined' ? CAMPUS : null);
    const random = resolveRng(rng);
    const ref = reference || buildReference(site);
    const trusted = ref.trustedFingerprints.map((entry) => entry.sha256);
    const base = {
      kind,
      serverName: ref.serverName,
      organization: site.name,
      issuer: ref.issuer,
      rootCA: ref.rootCA,
      validFrom: ref.validFrom,
      validTo: ref.validTo,
      sha256: ref.sha256,
      selfSigned: false,
    };
    const fake = (overrides) => ({ ...base, sha256: randomFingerprint(random, trusted), ...overrides });

    switch (kind) {
      case KIND.GENUINE:
        return base;
      case KIND.RENEWED:
        return { ...base, validFrom: RENEWAL.validFrom, validTo: RENEWAL.validTo, sha256: RENEWAL.sha256 };
      case KIND.TYPO:
        return fake({ serverName: makeTypo(ref.serverName, random) });
      case KIND.SUFFIX:
        return fake({ serverName: `${ref.serverName}.${randPick(random, FORGERY.SUFFIXES)}` });
      case KIND.HOMOGLYPH:
        return fake({ serverName: makeHomoglyph(ref.serverName) });
      case KIND.SELF_SIGNED: {
        const ca = randPick(random, FORGERY.SELF_SIGNED_CAS);
        return fake({
          issuer: ca,
          rootCA: ca,
          selfSigned: true,
          validFrom: ref.today, // heute frisch gebastelt …
          validTo: addYears(ref.today, FORGERY.SELF_SIGNED_YEARS), // … und gleich zehn Jahre gültig
        });
      }
      case KIND.EXPIRED:
        return randInt(random, 0, 1) === 0 ? fake({ ...FORGERY.SECTIGO }) : fake({ ...FORGERY.RECENTLY_EXPIRED });
      case KIND.WRONG_CA: {
        const labels = ref.serverName.split('.');
        const host = labels[0];
        const domain = labels[domainLabelIndex(labels)];
        return fake({
          serverName: `${host}.${domain}${FORGERY.PUBLIC_CA.domainSuffix}`,
          organization: '',
          issuer: FORGERY.PUBLIC_CA.issuer,
          rootCA: FORGERY.PUBLIC_CA.rootCA,
          validFrom: FORGERY.PUBLIC_CA.validFrom,
          validTo: FORGERY.PUBLIC_CA.validTo,
        });
      }
      case KIND.COPY: {
        let sha256 = mutateFingerprintMiddle(ref.sha256, random);
        while (trusted.some((fp) => sameFingerprint(fp, sha256))) sha256 = mutateFingerprintMiddle(ref.sha256, random);
        return { ...base, sha256 };
      }
      default:
        throw new Error(`Ch4Logic.makeCertificate: unbekannter Typ „${kind}“`);
    }
  }

  // ---------------------------------------------------------------------------
  // Rundenplan
  // ---------------------------------------------------------------------------

  /** Zufällige BSSID (Unicast), die in `used` noch nicht vorkommt. */
  function randomBssid(rng, used) {
    let bssid = '';
    do {
      const bytes = [];
      for (let i = 0; i < 6; i += 1) bytes.push(randInt(rng, 0, 255));
      bytes[0] &= 0xfe; // Unicast-Bit
      bssid = bytes.map((b) => b.toString(16).padStart(2, '0')).join(':');
    } while (used.has(bssid));
    used.add(bssid);
    return bssid;
  }

  /** Verschiedene dBm-Werte aus Bereichen [max, min] (absteigend sortiert zurück). */
  function distinctDbms(rng, ranges) {
    const used = new Set();
    return ranges.map(([low, high]) => {
      let value = randInt(rng, low, high);
      while (used.has(value)) value = value > low ? value - 1 : value + 1;
      used.add(value);
      return value;
    });
  }

  function makeNetwork(index, ssid, bssid, dbm, extra) {
    return { index, ssid, bssid, dbm, level: signalLevel(dbm), featured: false, kind: null, cert: null, ...extra };
  }

  /**
   * Erstellt alle Runden des Kapitels.
   * Runde 1: Tippfehler · Runde 2/3: echt + (selbstsigniert | abgelaufen | falsche CA) in
   * zufälliger Reihenfolge · Runde 4: perfekte Kopie oder Homoglyph · Finale: erneuertes echtes
   * Zertifikat + perfekte Kopie + angehängte Domain (Reihenfolge per Signalstärke zufällig).
   * @param {object} campus CAMPUS
   * @param {{next: Function}} [rngInput]
   * @param {object} [referenceInput]
   */
  function createRounds(campus, rngInput, referenceInput) {
    const rng = resolveRng(rngInput);
    const reference = referenceInput || buildReference(campus);
    const ssid = campus.wifi.ssid;
    const middleFake = randPick(rng, [KIND.SELF_SIGNED, KIND.EXPIRED, KIND.WRONG_CA]);
    const lateFake = randPick(rng, [KIND.COPY, KIND.HOMOGLYPH]);
    const middle = randShuffle(rng, [KIND.GENUINE, middleFake]);
    const autoKinds = [KIND.TYPO, middle[0], middle[1], lateFake];
    const rounds = [];

    autoKinds.forEach((kind, index) => {
      const used = new Set();
      const isGenuine = kind === KIND.GENUINE;
      const [featuredDbm, ...others] = distinctDbms(rng, [
        isGenuine ? SIGNAL.AP_UNDER : SIGNAL.KEVIN_NEAR,
        isGenuine ? SIGNAL.OTHER : SIGNAL.AP_CORRIDOR,
        SIGNAL.OTHER,
      ]);
      const weaker = others.map((dbm) => Math.min(dbm, featuredDbm - 1)).sort((a, b) => b - a);
      if (weaker[1] >= weaker[0]) weaker[1] = weaker[0] - 1;
      const networks = [
        makeNetwork(0, ssid, randomBssid(rng, used), featuredDbm, {
          featured: true,
          kind,
          cert: makeCertificate(kind, { campus, rng, reference }),
        }),
        makeNetwork(1, ssid, randomBssid(rng, used), weaker[0]),
        makeNetwork(2, ssid, randomBssid(rng, used), weaker[1]),
      ];
      rounds.push(makeRound(index, 'auto', networks, campus));
    });

    const used = new Set();
    const finaleKinds = randShuffle(rng, [KIND.RENEWED, KIND.COPY, KIND.SUFFIX]);
    const dbms = distinctDbms(rng, SIGNAL.FINALE);
    const finaleNetworks = finaleKinds.map((kind, index) =>
      makeNetwork(index, ssid, randomBssid(rng, used), dbms[index], {
        kind,
        cert: makeCertificate(kind, { campus, rng, reference }),
      })
    );
    rounds.push(makeRound(AUTO_ROUND_COUNT, 'choice', finaleNetworks, campus));
    return rounds;
  }

  function makeRound(index, mode, networks, campus) {
    const sorted = networks.slice().sort((a, b) => b.dbm - a.dbm);
    sorted.forEach((net, i) => {
      net.index = i;
    });
    const meta = TEXTS.rounds[index];
    const place = meta.place(campus);
    // Toast-Text einzeilig halten (sonst verdeckt er Dialog-Buttons und Post-it)
    const toast = `${meta.toastPlace || place}: ${meta.intro}`;
    return { index, number: index + 1, mode, place, intro: meta.intro, toast, networks: sorted };
  }

  // ---------------------------------------------------------------------------
  // Konsequenzen und Texte zu Ergebnissen
  // ---------------------------------------------------------------------------

  /**
   * Frust und Zeitstrafe zu einem Entscheidungsergebnis (eine Quelle für Szene und Tests).
   * @param {object} result Ergebnis von Game.decide
   * @returns {{frustration: number, minutes: number}}
   */
  function getPenalty(result) {
    const none = { frustration: 0, minutes: 0 };
    if (!result) return none;
    switch (result.outcome) {
      case OUTCOME.PHISHED:
        return result.isFirstPhish
          ? { frustration: BALANCE.PHISH_FIRST_FRUSTRATION, minutes: BALANCE.PHISH_FIRST_MINUTES }
          : { frustration: BALANCE.PHISH_REPEAT_FRUSTRATION, minutes: BALANCE.PHISH_REPEAT_MINUTES };
      case OUTCOME.PARANOID:
        return {
          frustration: BALANCE.PARANOID_FRUSTRATION + (result.allRejected ? BALANCE.ALL_REJECTED_FRUSTRATION : 0),
          minutes: BALANCE.PARANOID_MINUTES,
        };
      case OUTCOME.CONNECTED:
        return result.isFinale ? none : { frustration: BALANCE.DEAUTH_FRUSTRATION, minutes: 0 };
      default:
        return none;
    }
  }

  /** Maximal so viele Begründungen in der Auswertung. */
  const MAX_REASON_LINES = 3;

  /**
   * Texte für die Auswertung einer Entscheidung.
   * @param {object} result Ergebnis von Game.decide (Teilobjekte reichen)
   * @returns {{tone: string, title: string, lines: string[], kevin: string|null, tip: string|null, button: string}}
   */
  function describeResult(result) {
    const O = TEXTS.outcomes;
    const reasons = (result && (result.displayReasons || (result.verdict && result.verdict.reasons))) || [];
    const out = { tone: 'info', title: '', lines: [], kevin: null, tip: null, button: O.continueButton };
    if (!result) return out;
    const prefix = fingerprintPrefix(RENEWAL.sha256);

    switch (result.outcome) {
      case OUTCOME.CAUGHT:
        out.tone = 'success';
        out.title = O.caughtTitle;
        out.lines = [O.evidence, ...reasons.slice(0, MAX_REASON_LINES)];
        if (result.kind === KIND.COPY || result.kind === KIND.HOMOGLYPH) out.lines.push(O.copyLesson);
        out.kevin = TEXTS.kevin[result.kind] || null;
        break;
      case OUTCOME.CONNECTED:
        out.tone = 'success';
        out.title = result.isFinale ? TEXTS.final.title : O.connectedTitle;
        out.lines = result.isFinale ? TEXTS.final.lessons.slice() : [result.auto ? O.connectedAuto : O.connectedChecked, O.deauth];
        if (result.auto) out.tip = TEXTS.hints.auto;
        break;
      case OUTCOME.PHISHED: {
        out.tone = 'error';
        out.title = O.phishedTitle;
        out.lines = [result.auto ? O.phishedAuto : O.phishedManual, O.phishedWhy];
        if (reasons.length) out.lines.push(O.phishedHint(reasons[0]));
        out.kevin = TEXTS.kevin.phished;
        const minutes = result.isFirstPhish === false ? BALANCE.PHISH_REPEAT_MINUTES : BALANCE.PHISH_FIRST_MINUTES;
        out.button = O.passwordButton(minutes);
        const level = Math.min(result.phishHintLevel || 0, TEXTS.hints.phish.length - 1);
        out.tip = TEXTS.hints.phish[level] || (result.auto ? TEXTS.hints.auto : null);
        break;
      }
      case OUTCOME.PARANOID:
        out.tone = 'warning';
        if (result.isFinale) {
          out.title = O.finaleRejectedTitle;
          out.lines = [O.finaleRejected, O.finaleCaution];
          if (result.allRejected) out.lines.push(O.allRejected);
          const level = Math.max(1, Math.min(result.hintLevel || 1, MAX_HINT_LEVEL));
          out.tip = TEXTS.hints.finale[level](prefix);
        } else {
          out.title = O.paranoidTitle;
          out.lines = [O.paranoidAuto, O.paranoidSearch];
          out.tip = TEXTS.hints.paranoidAuto;
        }
        break;
      default:
        break;
    }
    return out;
  }

  /**
   * Texte für die Abschluss-Zusammenfassung.
   * @param {{perfect: boolean, phishCount: number}} stats
   */
  function describeFinal({ perfect = false, phishCount = 0 } = {}) {
    const lines = TEXTS.final.lessons.slice();
    if (perfect) lines.unshift(TEXTS.final.perfect);
    else if (phishCount > 0) lines.unshift(TEXTS.final.phished(phishCount));
    return { tone: 'success', title: TEXTS.final.title, lines, button: TEXTS.final.button };
  }

  // ---------------------------------------------------------------------------
  // Spielzustand
  // ---------------------------------------------------------------------------

  /**
   * Zustand eines Kapitel-Durchlaufs: Runden, Netzstatus, Entscheidungen, Tipps, Statistik.
   * Die Szene ist nur Ansicht und Eingabe; alle Regeln stehen hier.
   */
  class Game {
    /**
     * @param {{campus?: object, rng?: {next: Function}, today?: string}} [opts]
     */
    constructor({ campus, rng, today } = {}) {
      this.campus = campus || (typeof CAMPUS !== 'undefined' ? CAMPUS : null);
      if (!this.campus) throw new Error('Ch4Logic.Game: CAMPUS fehlt');
      this.rng = resolveRng(rng);
      /** Wahrheit: Ausdruck + Rundmail. */
      this.reference = buildReference(this.campus, { includeNews: true, today });
      /** Was auf dem Ausdruck steht (Lupe ohne gelesene Rundmail). */
      this.printedReference = buildReference(this.campus, { includeNews: false, today });
      this.rounds = createRounds(this.campus, this.rng, this.reference);
      this.roundIndex = 0;
      this.statuses = this.rounds.map((round) => round.networks.map(() => STATUS.IDLE));
      this.roundDone = this.rounds.map(() => false);
      this.roundMistakes = this.rounds.map(() => 0);
      this.newsRead = false;
      this.finished = false;
      this.log = [];
      this.counters = {
        decisions: 0,
        correct: 0,
        mistakes: 0,
        caught: 0,
        phishCount: 0,
        paranoidCount: 0,
        finaleParanoidCount: 0,
        autoTrusts: 0,
      };
    }

    /** @returns {number} 1-basiert */
    getRoundNumber() {
      return this.roundIndex + 1;
    }

    getRound() {
      return this.rounds[this.roundIndex];
    }

    isFinale() {
      return this.getRound().mode === 'choice';
    }

    isRoundComplete() {
      return this.roundDone[this.roundIndex];
    }

    isFinished() {
      return this.finished;
    }

    /**
     * Netze der aktuellen Runde inkl. Status, Prüfbarkeit und Wahrheit (für Ansicht und Tests).
     * @returns {object[]}
     */
    getNetworks() {
      const round = this.getRound();
      return round.networks.map((net, index) => ({
        ...net,
        status: this.statuses[this.roundIndex][index],
        canInspect: this.canInspect(index),
        trustworthy: net.cert ? isTrustworthy(net.cert, this.reference).trustworthy : null,
      }));
    }

    /** Darf dieses Netz gerade geprüft werden? */
    canInspect(index) {
      if (this.finished || this.isRoundComplete()) return false;
      const round = this.getRound();
      const net = round.networks[index];
      if (!net || !net.cert) return false;
      const status = this.statuses[this.roundIndex][index];
      if (round.mode === 'auto') return net.featured && status === STATUS.IDLE;
      return status === STATUS.IDLE || status === STATUS.REJECTED;
    }

    /** Prüfergebnis gegen die volle Wahrheit (Ausdruck + Rundmail). */
    evaluate(index) {
      const net = this.getRound().networks[index];
      return isTrustworthy(net ? net.cert : null, this.reference);
    }

    /**
     * Feldvergleich wie mit der Lupe: gegen den Ausdruck, die Rundmail erst nach dem Lesen.
     * @param {number} index
     * @param {{includeNews?: boolean}} [opts]
     */
    compareForDisplay(index, { includeNews = this.newsRead } = {}) {
      const net = this.getRound().networks[index];
      return isTrustworthy(net ? net.cert : null, includeNews ? this.reference : this.printedReference).fields;
    }

    /**
     * Lupe für den Fingerabdruck: je Zeile (à 8 Gruppen) true = stimmt mit dem nächstgelegenen
     * veröffentlichten Fingerabdruck überein (Ausdruck, Rundmail erst nach dem Lesen).
     * @param {number} index
     * @param {{includeNews?: boolean}} [opts]
     * @returns {boolean[]}
     */
    compareFingerprintRows(index, { includeNews = this.newsRead } = {}) {
      const net = this.getRound().networks[index];
      if (!net || !net.cert) return [];
      const reference = includeNews ? this.reference : this.printedReference;
      const diffs = reference.trustedFingerprints.map((entry) => diffFingerprintGroups(net.cert.sha256, entry.sha256));
      const closest = diffs.reduce((best, diff) => (diff.length < best.length ? diff : best));
      const rowCount = formatFingerprintRows(net.cert.sha256).length;
      return Array.from({ length: rowCount }, (_, row) =>
        !closest.some((groupIndex) => Math.floor(groupIndex / FINGERPRINT_ROW_GROUPS) === row));
    }

    /**
     * Verarbeitet eine Entscheidung im Zertifikatsdialog.
     * @param {number} index Netz der aktuellen Runde
     * @param {'trust'|'reject'} decision
     * @param {{auto?: boolean}} [opts] auto = der Countdown hat vertraut
     * @returns {object|null} Ergebnis oder null, wenn die Entscheidung nicht zulässig ist
     */
    decide(index, decision, { auto = false } = {}) {
      if (decision !== DECISION.TRUST && decision !== DECISION.REJECT) return null;
      if (!this.canInspect(index)) return null;
      const r = this.roundIndex;
      const round = this.rounds[r];
      const net = round.networks[index];
      const verdict = isTrustworthy(net.cert, this.reference);
      const trusted = decision === DECISION.TRUST;
      const isAuto = Boolean(auto) && trusted; // ablehnen kann der Countdown nicht
      let outcome;
      if (trusted) outcome = verdict.trustworthy ? OUTCOME.CONNECTED : OUTCOME.PHISHED;
      else outcome = verdict.trustworthy ? OUTCOME.PARANOID : OUTCOME.CAUGHT;
      const isFinale = round.mode === 'choice';
      const correct = !isAuto && (outcome === OUTCOME.CONNECTED || outcome === OUTCOME.CAUGHT);

      const c = this.counters;
      c.decisions += 1;
      if (correct) c.correct += 1;
      if (isAuto) c.autoTrusts += 1;
      if (outcome === OUTCOME.PHISHED || outcome === OUTCOME.PARANOID) {
        c.mistakes += 1;
        this.roundMistakes[r] += 1;
      }
      if (outcome === OUTCOME.CAUGHT) c.caught += 1;
      if (outcome === OUTCOME.PHISHED) c.phishCount += 1;
      if (outcome === OUTCOME.PARANOID) {
        c.paranoidCount += 1;
        if (isFinale) c.finaleParanoidCount += 1;
      }

      const statusFor = {
        [OUTCOME.CAUGHT]: STATUS.CAUGHT,
        [OUTCOME.PHISHED]: STATUS.PHISHED,
        [OUTCOME.PARANOID]: STATUS.REJECTED,
        [OUTCOME.CONNECTED]: STATUS.CONNECTED,
      };
      this.statuses[r][index] = statusFor[outcome];

      const roundComplete = !isFinale || outcome === OUTCOME.CONNECTED;
      if (roundComplete) this.roundDone[r] = true;
      if (isFinale && outcome === OUTCOME.CONNECTED) this.finished = true;

      const allRejected =
        isFinale &&
        outcome === OUTCOME.PARANOID &&
        this.statuses[r].every((status) => status === STATUS.CAUGHT || status === STATUS.PHISHED || status === STATUS.REJECTED);

      // Angezeigte Gründe nur mit dem Wissen der Spielerin (Rundmail erst nach dem Lesen)
      const shown = this.newsRead ? verdict : isTrustworthy(net.cert, this.printedReference);
      const result = {
        outcome,
        decision,
        correct,
        auto: isAuto,
        kind: net.cert.kind,
        networkIndex: index,
        bssid: net.bssid,
        dbm: net.dbm,
        level: net.level,
        roundNumber: r + 1,
        isFinale,
        verdict,
        displayReasons: verdict.trustworthy ? [] : shown.reasons,
        roundComplete,
        chapterComplete: this.finished,
        isFirstPhish: outcome === OUTCOME.PHISHED && c.phishCount === 1,
        phishCount: c.phishCount,
        phishHintLevel: this.getPhishHintLevel(),
        allRejected,
        hintLevel: isFinale && outcome === OUTCOME.PARANOID ? this.getFinaleHintLevel() : 0,
      };
      this.log.push({ round: r + 1, index, decision, outcome, auto: isAuto });
      return result;
    }

    /**
     * Nächste Runde (nur wenn die aktuelle entschieden ist).
     * @returns {number|null} neue Rundennummer oder null
     */
    advance() {
      if (this.finished || !this.isRoundComplete() || this.roundIndex >= this.rounds.length - 1) return null;
      this.roundIndex += 1;
      return this.getRoundNumber();
    }

    markNewsRead() {
      this.newsRead = true;
    }

    hasReadNews() {
      return this.newsRead;
    }

    /** Jedes Zertifikat selbst und richtig beurteilt (Grundlage für CERT_INSPECTOR). */
    isPerfect() {
      const c = this.counters;
      return c.decisions > 0 && c.mistakes === 0 && c.autoTrusts === 0;
    }

    /** 0–3: wie deutlich der Tipp im Finale wird (nach jeder Ablehnung des echten Netzes). */
    getFinaleHintLevel() {
      return Math.min(MAX_HINT_LEVEL, this.counters.finaleParanoidCount);
    }

    /** 0 = nichts, 1 = Mitleids-Tipp (ab 2 Phishes), 2 = Gratis-Lupe (ab 3 Phishes). */
    getPhishHintLevel() {
      const count = this.counters.phishCount;
      if (count >= 3) return 2;
      if (count >= 2) return 1;
      return 0;
    }

    /** Je Runde: 'pending' | 'current' | 'good' | 'bad' (für die Fortschrittspunkte). */
    getRoundResults() {
      return this.rounds.map((round, i) => {
        if (this.roundDone[i]) return this.roundMistakes[i] > 0 ? 'bad' : 'good';
        if (i === this.roundIndex) return 'current';
        return 'pending';
      });
    }

    getStats() {
      return {
        ...this.counters,
        newsRead: this.newsRead,
        perfect: this.isPerfect(),
        roundNumber: this.getRoundNumber(),
        rounds: ROUND_COUNT,
      };
    }
  }

  return Object.freeze({
    ROUND_COUNT,
    AUTO_ROUND_COUNT,
    NETWORKS_PER_ROUND,
    COUNTDOWN_MS,
    GAME_DATE,
    KIND,
    OUTCOME,
    CODE,
    STATUS,
    DECISION,
    RENEWAL,
    FORGERY,
    BALANCE,
    TEXTS,
    parseDate,
    normalizeFingerprint,
    fingerprintGroups,
    formatFingerprint,
    formatFingerprintRows,
    fingerprintPrefix,
    diffFingerprintGroups,
    signalLevel,
    truncateServerName,
    foldHomoglyphs,
    buildReference,
    isTrustworthy,
    makeCertificate,
    createRounds,
    getPenalty,
    describeResult,
    describeFinal,
    Game,
  });
})();
