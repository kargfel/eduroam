/**
 * ch1Registration.js – Reine Logik für Kapitel 1 „Die Registrierung“.
 *
 * Alles, was ohne Phaser testbar ist, steht hier: Login-Prüfung mit verwechselbaren
 * Zeichen (I l 1 O 0) samt Lupe und Mitleids-Tipps, CAPTCHA-Raster („Wähle alle Bilder
 * mit Access Points“ – der erste Versuch scheitert immer), Nutzungsordnung mit
 * verstecktem Wort, Passwort-Regeln nach dem „Password Game“-Prinzip (eine Regel nach
 * der anderen, garantiert lösbar), Synchronisationsplan („bis zu 24 h“), Ladezeiten über
 * EDGE sowie alle Kapiteltexte als Daten. Die Szene (Ch1RegistrationScene) zeichnet nur.
 *
 * Global: Ch1Logic (tief eingefroren).
 * Abhängigkeiten: CONFIG, CAMPUS (beim Laden); RNG nur zur Laufzeit – jede Funktion mit
 * Zufall nimmt optional ein eigenes RNG-Objekt (gleiche Schnittstelle) entgegen.
 */

const Ch1Logic = (() => {
  /** Stationen des Kapitels in Reihenfolge. */
  const STEPS = ['login', 'captcha', 'tos', 'password', 'sync'];

  /**
   * Balance-Werte: Frust in Prozentpunkten, Zeitstrafen in Spielminuten, Dauern in echten ms.
   * Frust-Budget laut Vertrag: vernünftig ca. 10 %, schludrig ca. 30 % (siehe Unit-Test).
   */
  const BALANCE = {
    // Station 1: Login
    LOGIN_FAIL_FRUSTRATION: CONFIG.FRUSTRATION.SMALL,
    LOGIN_FAIL_MINUTES: 1,                            // Fehlermeldung lesen, neu tippen
    MAGNIFIER_MINUTES: CONFIG.PENALTY_MINUTES.SMALL,  // Lupe in der Federmappe suchen
    COPIER_MINUTES: CONFIG.PENALTY_MINUTES.LARGE,     // zum Kopierer laufen (Rettungsweg)
    // Station 2: CAPTCHA
    CAPTCHA_SIZE: 9,
    CAPTCHA_FORCED_FAIL_ROUNDS: 1,                    // so viele Runden scheitern immer
    CAPTCHA_FORCED_FRUSTRATION: CONFIG.FRUSTRATION.TINY,
    CAPTCHA_ERROR_FRUSTRATION: CONFIG.FRUSTRATION.SMALL,
    CAPTCHA_LABELS_AFTER_ERRORS: 3,                   // danach Bildbeschreibungen (barrierefrei)
    CAPTCHA_MIN_TARGETS: 3,
    CAPTCHA_MAX_TARGETS: 4,
    CAPTCHA_MIN_SMOKE_DETECTORS: 2,
    CAPTCHA_VERIFY_MS: 700,                           // „Wird geprüft …“ nach dem Häkchen
    // Station 3: Nutzungsordnung
    TOS_END_THRESHOLD: 0.98,
    TOS_READER_RELIEF: CONFIG.FRUSTRATION.SMALL,
    // Station 4: Passwort
    PASSWORD_MIN_LENGTH: 10,
    PASSWORD_MAX_LENGTH: 16,
    PASSWORD_DIGIT_SUM: 21,                           // wie Stuttgart 21
    PASSWORD_INPUT_MAX: 40,
    PASSWORD_TWIST_FRUSTRATION: CONFIG.FRUSTRATION.TINY,
    CONFIRM_FAIL_FRUSTRATION: CONFIG.FRUSTRATION.SMALL,
    STUCK_TIP_MS: 15000,                              // so lange an derselben Regel → Klartext-Tipp
    // Station 5: Synchronisation
    SYNC_RELOAD_MINUTES: 1,
    SYNC_WAIT_MINUTES: 24 * 60,
    SYNC_MIN_RELOADS: 3,
    SYNC_MAX_RELOADS: 6,
    SYNC_SETBACK_FRUSTRATION: CONFIG.FRUSTRATION.TINY,
    // Mitleid: nach so vielen Fehlern zum selben Problem
    PITY_AFTER_FAILS: 2,
    RESCUE_AFTER_FAILS: 3,
    // Mobilfunk („EDGE“) – Ladezeiten bewusst kurz, der Witz ist die Anzeige
    DATA_VOLUME_MB: 48,
    EDGE_KB_PER_SECOND: 24,
    LOAD_BASE_MS: 350,
    LOAD_MS_PER_KB: 0.3,
    LOAD_MIN_MS: 450,
    LOAD_MAX_MS: 1400,
  };

  /** Portal-Seiten je Station (Pfad hinter CAMPUS.portal.url, Seitengröße für EDGE). */
  const PAGES = {
    login: { path: '/login', title: 'Anmeldung', sizeKb: 380 },
    captcha: { path: '/sicherheitspruefung', title: 'Sicherheitsprüfung', sizeKb: 1240 },
    tos: { path: '/nutzungsordnung', title: 'Nutzungsordnung', sizeKb: 2310 },
    password: { path: '/passwort-aendern', title: 'Neues Passwort', sizeKb: 420 },
    sync: { path: '/synchronisation', title: 'Synchronisation', sizeKb: 96 },
  };

  // ---------------------------------------------------------------------------
  // Texte (Vorlagen-Variablen in {geschweiften Klammern} füllt fill() aus campusVars())
  // ---------------------------------------------------------------------------

  /*
   * Hinweis zu den Toast-Texten (…Toast): Zeilen mit \n auf höchstens ca. 32 Zeichen umbrechen.
   * Toasts erscheinen unten mittig; schmal bleiben sie rechts neben dem Post-it (Tipps)
   * und unter den Bedienelementen des Portals.
   */
  const TEXT = {
    noRealCredentials: 'Spiel – bitte keine echten Zugangsdaten eingeben',
    letter: {
      brand: 'DHBW',
      sender: '{helpdeskName}',
      recipient: '{studentName}',
      subject: 'Zugangsdaten zum Lehrenetz',
      body: 'Willkommen! Bitte aktivieren Sie Ihr Konto im Self-Service-Portal und ändern Sie dabei das Initialpasswort.',
      usernameLabel: 'Kennung',
      courseLabel: 'Kurs',
      passwordLabel: 'Initialpasswort',
      footnote: 'Ersatz nur im Sekretariat oder mit dem Studierendenausweis am Kopierer.',
      closing: 'Mit freundlichen Grüßen',
      signature: 'i. A. Schwäble',
      magnifierButton: 'Lupe (+{magnifierMinutes} min)',
      magnifierTitle: 'Unter der Lupe',
      copierTitle: 'Kopierer-Ausdruck (lesbar)',
    },
    portal: {
      brand: 'DHBW',
      name: '{city} · Self-Service-Portal',
      loading: 'Seite wird geladen …',
      statusReady: 'Fertig',
    },
    login: {
      title: 'Anmeldung',
      intro: 'Melden Sie sich mit Ihrer Kennung und dem Initialpasswort aus dem Begrüßungsschreiben an.',
      usernameLabel: 'Kennung',
      usernamePlaceholder: 'z. B. abc12345',
      passwordLabel: 'Initialpasswort',
      passwordPlaceholder: 'Initialpasswort',
      submit: 'Anmelden',
      forgot: 'Passwort vergessen?',
      noticeTitle: 'Wartungshinweis',
      noticeText: 'Montags von 07:00 bis 09:00 Uhr Wartungsarbeiten. Verzögerungen sind möglich.',
      systemError: 'Anmeldung fehlgeschlagen. Benutzername oder Passwort ungültig.',
      emptyError: 'Bitte füllen Sie alle Pflichtfelder aus.',
      success: 'Anmeldung erfolgreich.',
    },
    captcha: {
      title: 'Sicherheitsprüfung',
      intro: 'Bitte bestätigen Sie, dass Sie kein Roboter sind. Roboter erhalten aus Kapazitätsgründen kein WLAN.',
      robotLabel: 'Ich bin kein Roboter',
      brand: 'DHBW-CAPTCHA',
      legal: 'Datenschutz · Nutzungsbedingungen',
      verifying: 'Wird geprüft …',
      prompt: 'Wähle alle Bilder mit',
      target: 'Access Points',
      instruction: 'Dann auf „Bestätigen“ klicken.',
      confirm: 'Bestätigen',
      retry: 'Bitte erneut versuchen.',
      retryMissing: 'Bitte alle passenden Bilder auswählen.',
      audio: 'Audio: „Klick die mit de Antenna, gell!“',
      reloaded: 'Neue Bilder. Gleiche Aufgabe.',
      passed: 'Sie sind ein Mensch. Vermutlich.',
      loggedInTitle: 'Angemeldet als {username}',
      loggedInText: 'Merke: Im Portal reicht die Kennung. Im WLAN heißt sie später {identity} – mit Realm.',
    },
    tos: {
      title: 'Nutzungsordnung',
      subtitle: 'Fassung vom 01.04.2009 · zuletzt geändert: gestern',
      lockedHint: '„Akzeptieren“ wird aktiv, sobald Sie unten angekommen sind.',
      unlockedHint: 'Ende erreicht. Das schafft kaum jemand.',
      readerHint: 'Brezel-Gutschein verdient! Sie haben wirklich gelesen.',
      remarksLabel: 'Anmerkungen (optional)',
      remarksPlaceholder: 'Ihre Anmerkungen zur Nutzungsordnung',
      accept: 'Akzeptieren',
      remarksToast: 'Anmerkung weitergeleitet\nan die Rechtsabteilung.\nBearbeitung: 6–8 Semester.',
      acceptedToast: 'Zustimmung gespeichert.\nWiderruf nur schriftlich,\n{hours}.',
      confirmTitle: 'Wirklich akzeptieren?',
      confirmText: 'Damit erkennen Sie alle {termsCount} Paragrafen an – auch die, die Sie nicht gelesen haben.',
      confirmYes: 'Ja',
      confirmProtest: 'Ja, unter Protest',
      protestToast: 'Protest vermerkt. Er wird\nbei der nächsten Überarbeitung\n(2031) berücksichtigt.',
    },
    password: {
      title: 'Neues Passwort festlegen',
      intro: 'Das Initialpasswort läuft heute ab – bitte jetzt ändern.',
      fieldLabel: 'Neues Passwort',
      next: 'Weiter',
      rulesHeading: 'Passwort-Richtlinie (Stand: heute, 07:00 Uhr)',
      confirmIntro: 'Bitte noch einmal eingeben. Einfügen ist erlaubt, Vertippen auch.',
      confirmLabel: 'Passwort wiederholen',
      save: 'Passwort speichern',
      back: 'Zurück zu den Regeln',
      mismatch: 'Die Passwörter stimmen nicht überein.',
      savedToast: 'Passwort gespeichert.\nEinzigartig – wie die 43\nanderen in Ihrem Kurs.',
    },
    sync: {
      title: 'Konto-Synchronisation',
      intro: 'Ihr neues Passwort wurde gespeichert. Die Synchronisation mit dem WLAN-System kann bis zu 24 Stunden dauern.',
      statusLabel: 'Status',
      initialStatus: 'Ausstehend (bis zu 24 Stunden).',
      reload: 'Seite neu laden',
      wait: '24 Stunden warten',
      waitTitle: 'Wirklich 24 Stunden warten?',
      waitText: 'Die Vorlesung beginnt um {lecture}. Morgen auch wieder – aber dann ist Dienstag.',
      waitConfirm: 'Ja, warten (+24 h)',
      waitCancel: 'Lieber neu laden',
      waitedToast: 'Es ist Dienstag. Sync: durch.\nDie Vorlesung von gestern: auch.',
      done: 'Synchronisiert. Ihr Konto ist aktiv.',
      doneHint: 'Gut zu wissen: Im WLAN heißt Ihre Kennung gleich {identity} – mit Realm.',
      continue: 'Weiter zu eduroam',
      f5Toast: 'F5: Die Portalseite lädt neu.\nDas Spiel bleibt, wo es ist.',
      stamp: 'AKTIVIERT',
      waitStamp: 'VERTAGT',
    },
    forgot: {
      title: 'Passwort vergessen?',
      text: 'Aus Sicherheitsgründen versenden wir keine Passwörter per E-Mail. Einen Ersatz gibt es persönlich im Sekretariat – oder mit Ihrem Studierendenausweis am Kopierer.',
      copier: 'Zum Kopierer (+{copierMinutes} min)',
      cancel: 'Abbrechen',
    },
    /** Post-it-Tipps (Spielebene: immer klar, was zu tun ist). Höchstens ca. 150 Zeichen. */
    tips: {
      login: 'Kennung und Initialpasswort stehen im Brief. Achtung: I, l, 1, O und 0 sehen dort gleich aus – die Lupe hilft (+{magnifierMinutes} min).',
      magnifier: 'Jetzt eindeutig! Genau so abtippen, wie es unter der Lupe steht. Groß/klein zählt.',
      copier: 'Der Kopierer druckt dasselbe Passwort – diesmal lesbar – und hat es gleich eingetragen. Jetzt „Anmelden“ klicken.',
      captcha: 'Erst „Ich bin kein Roboter“ ankreuzen. Dann alle Access Points anklicken und „Bestätigen“.',
      captchaForced: 'Keine Sorge: Der erste Versuch scheitert immer. Gleiche Aufgabe, neue Bilder.',
      captchaForcedWrong: 'Der erste Versuch scheitert immer – aber Rauchmelder sind trotzdem keine Access Points.',
      captchaPity: 'Access Points: weißes Kästchen mit WLAN-Zeichen oder Router mit Antennen. Rauchmelder haben Schlitze und eine rote LED.',
      captchaRescue: 'Jetzt stehen Bildbeschreibungen dran. Nur „Access Point“ und „WLAN-Router“ anklicken.',
      tos: 'Runterscrollen: Mausrad oder Balken ziehen. Profi-Tipp: Wer liest, ist klar im Vorteil.',
      tosDone: 'Unten angekommen. Jetzt „Akzeptieren“ klicken.',
      tosReader: 'Geheimwort gefunden! Brezel verdient. Jetzt „Akzeptieren“.',
      tosReaderScroll: 'Geheimwort gefunden! Brezel verdient. Jetzt noch bis ganz unten scrollen, dann „Akzeptieren“.',
      password: 'Die Regeln kommen eine nach der anderen. Bau dein Passwort Stück für Stück – und merk es dir!',
      passwordDone: 'Alle Regeln erfüllt! Jetzt „Weiter“ – und das Passwort gut merken.',
      confirm: 'Jetzt dasselbe Passwort nochmal eintippen und speichern.',
      confirmPity: 'Oben steht dein neues Passwort. Zeichen für Zeichen abschreiben – oder zurück und ändern.',
      sync: 'Warten kostet 24 Stunden. „Seite neu laden“ kostet je {reloadMinutes} min – und klappt irgendwann.',
      syncPity: 'Weiter neu laden. Irgendwann klappt es. Versprochen.',
      done: 'Konto aktiv! Fürs WLAN merken: Kennung plus @{realm} – sonst weiß eduroam nicht, wohin.',
    },
    /** Tipps nach fehlgeschlagenem Login (Code → Text), Eskalation in loginTip(). */
    loginTips: {
      EMPTY_USERNAME: 'Erst Kennung und Initialpasswort eintippen, dann „Anmelden“.',
      EMPTY_PASSWORD: 'Erst Kennung und Initialpasswort eintippen, dann „Anmelden“.',
      UNKNOWN_USER: 'Die Kennung steht im Brief: {username}. Ohne Leerzeichen, ohne @.',
      REALM_IN_USERNAME: 'Im Portal nur die Kennung: {username}. Das @{realm} braucht erst das WLAN.',
      CASE: 'Groß- und Kleinschreibung zählt! Schau genau hin – oder nimm die Lupe.',
      WHITESPACE: 'Da ist ein Leerzeichen zu viel. Passwörter sind pingelig.',
      CONFUSABLE: 'Fast! I, l, 1, O und 0 verwechselt. Die Lupe zeigt sie eindeutig.',
      WRONG_PASSWORD: 'Das Initialpasswort steht im Brief. Tipp: erst die Lupe, dann abtippen.',
      pity: 'Buchstabiert: {spelledPassword}.',
      rescue: 'Immer noch nicht? Unter „Passwort vergessen?“ gibt es am Kopierer einen lesbaren Ausdruck (+{copierMinutes} min).',
    },
    /** HUD-Aufgabe je Station (kurz!). */
    objectives: {
      login: 'Mit Kennung + Initialpasswort anmelden',
      captcha: 'Beweisen, dass du kein Roboter bist',
      tos: 'Nutzungsordnung bis unten, akzeptieren',
      password: 'Neues Passwort: alle Regeln erfüllen',
      confirm: 'Passwort wiederholen und speichern',
      sync: 'Synchronisation abwarten oder neu laden',
      done: 'Weiter zu eduroam',
    },
    /** Kurze Begründungen für Floating-Texte und GameState (Fehlversuche, Strafen). */
    reasons: {
      magnifier: 'Lupe gesucht',
      copier: 'Zum Kopierer gelaufen',
      loginFail: 'Anmeldung fehlgeschlagen',
      captchaForced: 'CAPTCHA will mehr',
      captchaError: 'CAPTCHA falsch',
      twist: 'Noch eine Regel?!',
      confirmFail: 'Passwörter verschieden',
      reload: 'Seite neu geladen',
      setback: '99 % → 0 %',
      wait: '24 h gewartet',
      reader: 'Brezel-Gutschein',
    },
  };

  /**
   * Nutzungsordnung (absurd lang). § 14 enthält das Geheimwort für TOS_READER – bewusst
   * erst nach gut der Hälfte, damit es nur findet, wer wirklich liest.
   */
  const TERMS = [
    '§ 1 Geltungsbereich\n(1) Diese Ordnung gilt für alle Nutzer:innen des Datennetzes der {campusName}, einschließlich eduroam, Gast-WLAN und des Netzwerkkabels im Sekretariat, das niemand anfassen darf.\n(2) Sie gilt an allen Standorten, auch dort, wo kein Netz ist.',
    '§ 2 Begriffsbestimmungen\n(1) „Netz“ im Sinne dieser Ordnung ist die Gesamtheit aller Access Points, Kabel, Switches und Hoffnungen.\n(2) „Verbindung“ ist ein Zustand, der kurz vor einer Abgabe endet.\n(3) Rauchmelder sind keine Access Points, auch wenn sie so aussehen.',
    '§ 3 Nutzungszweck\n(1) Das Netz dient ausschließlich Studium, Lehre und Forschung.\n(2) Nicht als Studium gelten: Streaming, Online-Spiele sowie das Abrufen des Mensa-Speiseplans vor 11:30 Uhr.',
    '§ 4 Zugangsberechtigung\n(1) Zugang erhält, wer immatrikuliert ist, ein aktiviertes Konto besitzt und diese Ordnung bis zum Ende gescrollt hat.\n(2) Die Aktivierung kann bis zu 24 Stunden dauern. Oder länger. Meistens länger.',
    '§ 5 Pflichten der Nutzer:innen\n(1) Zugangsdaten sind geheim zu halten, insbesondere vor Kevin aus dem dritten Semester.\n(2) Passwörter dürfen nicht auf Haftnotizen notiert werden. Wir wissen, dass Sie es trotzdem tun.\n(3) Eigene Hotspots mit dem Namen „eduroam“ sind untersagt.',
    '§ 6 Verbotene Handlungen\n(1) Untersagt sind das Mitschneiden fremder Anmeldungen, das Betreiben gefälschter Zertifizierungsstellen und das Herunterladen ganzer Semester in der Mittagspause.\n(2) Ebenfalls untersagt ist lautes Seufzen beim Verbindungsaufbau in der Bibliothek.',
    '§ 7 Bandbreite\n(1) Die Bandbreite wird gerecht auf alle Anwesenden verteilt. Im Hörsaal mit 180 Erstis bedeutet das: auf niemanden.\n(2) Ein Anspruch auf eine bestimmte Geschwindigkeit besteht nicht. Geduld wird vorausgesetzt.',
    '§ 8 Haftung\n(1) Die Hochschule haftet nicht für Funklöcher, insbesondere nicht im Tiefenhörsaal.\n(2) Für verpasste Moodle-Abgaben haftet, wer die Abgabe verpasst hat.',
    '§ 9 Datenschutz\n(1) Verbindungsdaten werden nach den gesetzlichen Bestimmungen gespeichert und nach Ablauf der Fristen gelöscht.\n(2) Die Fristen stehen in Anlage 7. Anlage 7 ist derzeit nicht auffindbar.',
    '§ 10 Kehrwoche\n(1) Nutzer:innen halten ihren Teil des Funkspektrums sauber.\n(2) Der Kehrwochenplan für das 5-GHz-Band hängt im Treppenhaus aus.',
    '§ 11 Wartung\n(1) Wartungsarbeiten finden bevorzugt montags zwischen 07:00 und 09:00 Uhr statt, damit möglichst viele Erstis davon profitieren.',
    '§ 12 Zertifikate\n(1) Vor dem Verbinden ist das Server-Zertifikat zu prüfen.\n(2) Wer „Nicht validieren“ wählt, handelt auf eigene Gefahr – und auf die von Kevin.',
    '§ 13 Störungen\n(1) Störungen sind unverzüglich dem {helpdeskName} zu melden. Sprechzeiten: {hours}.\n(2) Außerhalb der Sprechzeiten sind Störungen nicht vorgesehen.',
    '§ 14 Lesebestätigung\n(1) Diese Ordnung wird erfahrungsgemäß nicht gelesen.\n(2) Wer bis hierher gelesen hat, trägt im Feld „Anmerkungen“ das Wort „{secret}“ ein und erhält dafür einen Gutschein für eine Laugenbrezel. Symbolisch.',
    '§ 15 Druckfassung\n(1) Eine gedruckte Fassung liegt im Sekretariat aus. Sie umfasst 214 Seiten und ist geheftet.',
    '§ 16 Mobile Endgeräte\n(1) Für die Einrichtung mobiler Endgeräte gilt das IT-Merkblatt „WLAN einrichten“ in der jeweils veralteten Fassung.',
    '§ 17 Ende der Nutzung\n(1) Die Berechtigung endet mit der Exmatrikulation oder mit dem Ablauf des Passworts, je nachdem, was früher eintritt. Meistens ist es das Passwort.',
    '§ 18 Änderungen\n(1) Änderungen werden per Aushang am Schwarzen Brett im Keller bekannt gegeben. Der Keller hat kein Netz.',
    '§ 19 Schwäbische Klausel\n(1) Wer sich über diese Ordnung beschwert, gilt als Bruddler. Bruddeln ist erlaubt, ändert aber nichts.',
    '§ 20 Salvatorische Klausel\n(1) Sollte eine Bestimmung dieser Ordnung unwirksam sein, bleibt das WLAN trotzdem langsam.',
    '§ 21 Inkrafttreten\n(1) Diese Ordnung tritt in Kraft, sobald Stuttgart 21 fertig ist. Bis dahin gilt sie vorläufig.',
    '§ 22 Zustimmung\n(1) Mit dem Scrollen bis hierher haben Sie bereits zugestimmt. Der Button „Akzeptieren“ ist reine Formsache.\n(2) Vielen Dank für Ihre Aufmerksamkeit. Sie sind die erste Person, die so weit gekommen ist.',
  ];

  // ---------------------------------------------------------------------------
  // Station 1: Login
  // ---------------------------------------------------------------------------

  /** Verwechselbare Zeichen und ihre eindeutige Beschreibung (Buchstabiertafel DIN 5009). */
  const CONFUSABLE_LABELS = {
    I: 'großes I wie Ida',
    l: 'kleines L wie Ludwig',
    1: 'Ziffer Eins',
    '|': 'senkrechter Strich',
    O: 'großes O wie Otto',
    0: 'Ziffer Null',
  };

  /** Vage System-Fehlercodes (rotierend), absichtlich selbst voller I/l/1/O/0. */
  const ERROR_CODES = ['0xIl1O', 'SSO-0711', '0x00O0', 'LDAP-49'];

  /** Codes, bei denen das Passwort das Problem ist (Eskalation der Tipps). */
  const PASSWORD_CODES = ['CONFUSABLE', 'CASE', 'WRONG_PASSWORD', 'WHITESPACE'];

  /**
   * Bildet verwechselbare Zeichen auf eine gemeinsame Form ab (klein; i/l/1/| → 1, o/0 → 0).
   * @param {string} str
   * @returns {string}
   */
  function normalizeConfusables(str) {
    return String(str ?? '').toLowerCase().replace(/[il1|]/g, '1').replace(/[o0]/g, '0');
  }

  /** Positionen (Zeichenindex), an denen sich zwei Zeichenketten unterscheiden. */
  function diffPositions(a, b) {
    const left = [...a];
    const right = [...b];
    const positions = [];
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      if (left[i] !== right[i]) positions.push(i);
    }
    return positions;
  }

  /**
   * Prüft den Portal-Login. Die Systemmeldung ist absichtlich vage (wie im echten Leben),
   * der Tipp (Spielebene) nennt das konkrete Problem.
   * @param {string} username
   * @param {string} password
   * @param {object} [campus=CAMPUS]
   * @returns {{ok: boolean, code: string, field: ('username'|'password'|null), isAttempt: boolean,
   *            message: string, hint: string, wrongPositions: number[]}}
   */
  function checkLogin(username, password, campus = CAMPUS) {
    const user = String(username ?? '').trim().toLowerCase();
    const pw = String(password ?? '');
    const expectedUser = campus.username.toLowerCase();
    const expectedPw = campus.initialPassword;
    const fail = (code, field, extra = {}) => ({
      ok: false,
      code,
      field,
      isAttempt: !code.startsWith('EMPTY'),
      message: code.startsWith('EMPTY') ? TEXT.login.emptyError : TEXT.login.systemError,
      hint: loginTip(1, code, campus),
      wrongPositions: [],
      ...extra,
    });

    if (!user) return fail('EMPTY_USERNAME', 'username');
    if (!pw) return fail('EMPTY_PASSWORD', 'password');
    if (user.includes('@')) {
      return user.split('@')[0] === expectedUser ? fail('REALM_IN_USERNAME', 'username') : fail('UNKNOWN_USER', 'username');
    }
    if (user !== expectedUser) return fail('UNKNOWN_USER', 'username');
    if (pw === expectedPw) {
      return { ok: true, code: 'OK', field: null, isAttempt: true, message: TEXT.login.success, hint: '', wrongPositions: [] };
    }
    if (pw.trim() === expectedPw) return fail('WHITESPACE', 'password');
    if (pw.toLowerCase() === expectedPw.toLowerCase()) {
      return fail('CASE', 'password', { wrongPositions: diffPositions(pw, expectedPw) });
    }
    if (normalizeConfusables(pw) === normalizeConfusables(expectedPw)) {
      return fail('CONFUSABLE', 'password', { wrongPositions: diffPositions(pw, expectedPw) });
    }
    return fail('WRONG_PASSWORD', 'password');
  }

  /**
   * Zerlegt ein Passwort für die Lupe: jedes Zeichen mit Kennzeichnung, ob es verwechselbar ist.
   * @param {string} password
   * @returns {{char: string, isConfusable: boolean, label: (string|null)}[]}
   */
  function magnifyPassword(password) {
    return [...String(password ?? '')].map((char) => ({
      char,
      isConfusable: Object.prototype.hasOwnProperty.call(CONFUSABLE_LABELS, char),
      label: CONFUSABLE_LABELS[char] || null,
    }));
  }

  /**
   * Buchstabiert die verwechselbaren Zeichen, den Rest am Stück in Anführungszeichen.
   * 'Il1O0-Kx7#q' → „großes I wie Ida, kleines L wie Ludwig, …, „-Kx7#q““
   * @param {string} password
   * @returns {string}
   */
  function spellConfusables(password) {
    const parts = [];
    let run = '';
    for (const { char, label } of magnifyPassword(password)) {
      if (label) {
        if (run) parts.push(`„${run}“`);
        run = '';
        parts.push(label);
      } else {
        run += char;
      }
    }
    if (run) parts.push(`„${run}“`);
    return parts.join(', ');
  }

  /**
   * Tipp nach dem n-ten Fehlversuch. Ab PITY_AFTER_FAILS buchstabiert, ab RESCUE_AFTER_FAILS
   * Hinweis auf den Kopierer (Rettungsweg – keine Sackgasse).
   * @param {number} failCount bisherige Fehlversuche (≥ 1)
   * @param {string} code Ergebnis-Code aus checkLogin
   * @param {object} [campus=CAMPUS]
   * @returns {string}
   */
  function loginTip(failCount, code, campus = CAMPUS) {
    const vars = campusVars(campus);
    const tips = TEXT.loginTips;
    if (PASSWORD_CODES.includes(code)) {
      if (failCount >= BALANCE.RESCUE_AFTER_FAILS) return fill(tips.rescue, vars);
      if (failCount >= BALANCE.PITY_AFTER_FAILS) return fill(tips.pity, vars);
    }
    return fill(tips[code] || tips.WRONG_PASSWORD, vars);
  }

  /**
   * Vager Fehlercode für die n-te Fehlermeldung.
   * @param {number} failCount
   * @returns {string}
   */
  function errorCode(failCount) {
    const index = Math.max(0, Math.floor(failCount) - 1) % ERROR_CODES.length;
    return ERROR_CODES[index];
  }

  // ---------------------------------------------------------------------------
  // Station 2: CAPTCHA
  // ---------------------------------------------------------------------------

  /** Bildarten. Nur Access Points (Decke) und Router zählen – Rauchmelder sehen nur so aus. */
  const CAPTCHA_KINDS = {
    apCeiling: { isTarget: true, label: 'Access Point' },
    apRouter: { isTarget: true, label: 'WLAN-Router' },
    smokeDetector: { isTarget: false, label: 'Rauchmelder' },
    lamp: { isTarget: false, label: 'Deckenlampe' },
    beamer: { isTarget: false, label: 'Beamer' },
    brezel: { isTarget: false, label: 'Brezel' },
    tvTower: { isTarget: false, label: 'Fernsehturm' },
  };
  /** Ablenkungen zum Auffüllen (Brezel und Fernsehturm höchstens einmal). */
  const CAPTCHA_DECOYS = ['lamp', 'beamer', 'brezel', 'tvTower', 'smokeDetector', 'lamp', 'beamer'];
  const CAPTCHA_TARGET_KINDS = ['apCeiling', 'apRouter'];

  /**
   * Erzeugt ein 3×3-Raster. Immer mindestens ein Decken-AP und zwei Rauchmelder (der Gag).
   * @param {object} [rng] RNG-Schnittstelle, Standard: globales RNG
   * @returns {{tiles: {kind: string, isTarget: boolean, label: string}[], targets: number[]}}
   */
  function createCaptchaGrid(rng) {
    const random = resolveRng(rng);
    const targetCount = random.int(BALANCE.CAPTCHA_MIN_TARGETS, BALANCE.CAPTCHA_MAX_TARGETS);
    const kinds = ['apCeiling'];
    while (kinds.length < targetCount) kinds.push(random.pick(CAPTCHA_TARGET_KINDS));
    for (let i = 0; i < BALANCE.CAPTCHA_MIN_SMOKE_DETECTORS; i += 1) kinds.push('smokeDetector');
    kinds.push(...random.shuffle(CAPTCHA_DECOYS).slice(0, BALANCE.CAPTCHA_SIZE - kinds.length));
    const tiles = random.shuffle(kinds).map((kind) => ({
      kind,
      isTarget: CAPTCHA_KINDS[kind].isTarget,
      label: CAPTCHA_KINDS[kind].label,
    }));
    const targets = tiles.map((tile, index) => (tile.isTarget ? index : -1)).filter((index) => index >= 0);
    return { tiles, targets };
  }

  /**
   * Vergleicht die Auswahl mit den Zielen.
   * @param {{tiles: object[], targets: number[]}} grid
   * @param {Iterable<number>} selected gewählte Kachel-Indizes
   * @returns {{isCorrect: boolean, missed: number[], wrong: number[]}}
   */
  function checkCaptcha(grid, selected) {
    const chosen = new Set(Array.from(selected || []));
    const missed = grid.targets.filter((index) => !chosen.has(index));
    const wrong = [...chosen].filter((index) => !grid.tiles[index] || !grid.tiles[index].isTarget).sort((a, b) => a - b);
    return { isCorrect: missed.length === 0 && wrong.length === 0, missed, wrong };
  }

  /**
   * Ergebnis einer Runde: Die ersten CAPTCHA_FORCED_FAIL_ROUNDS Runden scheitern immer.
   * @param {number} round 1-basiert
   * @param {boolean} isCorrect Auswahl der Spieler:in richtig?
   * @returns {{passed: boolean, isForced: boolean, isPlayerError: boolean}}
   */
  function captchaOutcome(round, isCorrect) {
    const isForced = round <= BALANCE.CAPTCHA_FORCED_FAIL_ROUNDS;
    return { passed: !isForced && isCorrect, isForced, isPlayerError: !isCorrect };
  }

  /**
   * Post-it-Tipp für das CAPTCHA.
   * @param {number} errors bisherige echte Fehler der Spieler:in
   * @param {boolean} afterForced gerade am Pflicht-Fehlschlag gescheitert?
   * @returns {string}
   */
  function captchaTip(errors, afterForced) {
    const tips = TEXT.tips;
    if (errors >= BALANCE.CAPTCHA_LABELS_AFTER_ERRORS) return tips.captchaRescue;
    if (errors >= BALANCE.PITY_AFTER_FAILS) return tips.captchaPity;
    if (afterForced) return errors > 0 ? tips.captchaForcedWrong : tips.captchaForced;
    return tips.captcha;
  }

  /** Ab wie vielen Fehlern stehen Bildbeschreibungen an den Kacheln (barrierefreie Rettung)? */
  function shouldShowCaptchaLabels(errors) {
    return errors >= BALANCE.CAPTCHA_LABELS_AFTER_ERRORS;
  }

  // ---------------------------------------------------------------------------
  // Station 3: Nutzungsordnung
  // ---------------------------------------------------------------------------

  /** Schwäbische Wörter ohne Umlaute, die nicht ohnehin schon im Text vorkommen. */
  function secretWordCandidates(campus = CAMPUS) {
    const baseText = TERMS.map((p) => fill(p, { ...campusVars(campus), secret: '' })).join(' ').toLowerCase();
    const ascii = campus.flavor.swabianWords.filter((word) => /^[A-Za-z]+$/.test(word));
    const unused = ascii.filter((word) => !baseText.includes(word.toLowerCase()));
    return unused.length > 0 ? unused : ascii;
  }

  /**
   * Wählt das Geheimwort für § 14.
   * @param {object} [rng]
   * @param {object} [campus=CAMPUS]
   * @returns {string}
   */
  function pickSecretWord(rng, campus = CAMPUS) {
    return resolveRng(rng).pick(secretWordCandidates(campus));
  }

  /**
   * Baut die komplette Nutzungsordnung.
   * @param {string} secretWord
   * @param {object} [campus=CAMPUS]
   * @returns {string}
   */
  function buildTerms(secretWord, campus = CAMPUS) {
    const vars = { ...campusVars(campus), secret: secretWord };
    return TERMS.map((paragraph) => fill(paragraph, vars)).join('\n\n');
  }

  /** Trimmt, entfernt Anführungszeichen außen und vergleicht ohne Groß-/Kleinschreibung. */
  function isSecretWord(input, secretWord) {
    const normalize = (value) => String(value ?? '')
      .trim()
      .replace(/^["'„“”‚‘’»«]+|["'„“”‚‘’»«]+$/g, '')
      .trim()
      .toLowerCase();
    const typed = normalize(input);
    return typed.length > 0 && typed === normalize(secretWord);
  }

  /** true, wenn bis (fast) ganz unten gescrollt wurde. */
  function isTermsEnd(progress) {
    return Number.isFinite(progress) && progress >= BALANCE.TOS_END_THRESHOLD;
  }

  // ---------------------------------------------------------------------------
  // Station 4: Passwort-Regeln
  // ---------------------------------------------------------------------------

  /** Regeln in fester Reihenfolge. Die letzten beiden sind die fiesen Überraschungen. */
  const PASSWORD_RULES = [
    { id: 'minLength', title: 'Mindestens {minLength} Zeichen', detail: 'Sicherheit beginnt bei der Länge.' },
    { id: 'digit', title: 'Mindestens eine Ziffer', detail: 'Irgendeine. Fürs Erste.' },
    { id: 'mixedCase', title: 'Groß- und Kleinbuchstaben', detail: 'Mindestens je einen. Laut und leise.' },
    { id: 'special', title: 'Mindestens ein Sonderzeichen', detail: 'Zum Beispiel ! # + - ? – das § ist der Verwaltung vorbehalten.' },
    { id: 'course', title: 'Muss Ihren Kurs enthalten', detail: 'Zur besseren Zuordnung. Der Kurs steht im Begrüßungsbrief.' },
    { id: 'swabian', title: 'Muss ein schwäbisches Wort enthalten', detail: 'Regionalförderung. Zum Beispiel {swabianExamples}.' },
    { id: 'digitSum', title: 'Quersumme aller Ziffern genau {digitSum}', detail: 'Wie Stuttgart 21. Die Ziffern im Kurs zählen mit.' },
    { id: 'ascii', title: 'Keine Umlaute, kein ß, keine Leerzeichen', detail: 'Das WLAN-System von 2009 spricht nur ASCII (ä → ae).' },
    { id: 'maxLength', title: 'Höchstens {maxLength} Zeichen', detail: 'Mehr verkraftet das Bibliothekssystem nicht.' },
  ];
  /** Regeln, die ein bis dahin gültiges Passwort nachträglich „töten“ können. */
  const TWIST_RULES = ['ascii', 'maxLength'];
  /** Zu Beginn sichtbare Regeln. */
  const INITIAL_REVEALED = 1;

  /** ä → ae, ö → oe, ü → ue, ß → ss (für den Wortvergleich). */
  function transliterate(str) {
    return String(str ?? '')
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss');
  }

  /** Summe aller Ziffern 0–9 in einer Zeichenkette. */
  function sumDigits(str) {
    return [...String(str ?? '')].reduce((sum, ch) => (ch >= '0' && ch <= '9' ? sum + Number(ch) : sum), 0);
  }

  /** Erstes schwäbisches Wort aus CAMPUS, das im Passwort steckt (oder null). */
  function findSwabianWord(password, campus = CAMPUS) {
    const haystack = transliterate(String(password ?? '').toLowerCase());
    return campus.flavor.swabianWords.find((word) => haystack.includes(transliterate(word.toLowerCase()))) || null;
  }

  /** Kürzestes schwäbisches Wort ohne Umlaute (passt am ehesten in 16 Zeichen). */
  function shortestSwabianWord(campus = CAMPUS) {
    const ascii = campus.flavor.swabianWords.filter((word) => /^[A-Za-z]+$/.test(word));
    const pool = ascii.length > 0 ? ascii : campus.flavor.swabianWords;
    return pool.reduce((best, word) => (word.length < best.length ? word : best), pool[0]);
  }

  /**
   * Kürzeste Ziffernfolge mit gegebener Quersumme (13 → „94“).
   * @param {number} sum
   * @returns {string}
   */
  function digitsForSum(sum) {
    let rest = Math.max(0, Math.floor(sum));
    let digits = '';
    while (rest > 9) {
      digits += '9';
      rest -= 9;
    }
    return rest > 0 ? digits + String(rest) : digits;
  }

  /**
   * Bewertet ein Passwort gegen alle Regeln (unabhängig davon, welche schon sichtbar sind).
   * @param {string} password
   * @param {object} [campus=CAMPUS]
   * @returns {{password: string, length: number, digitSum: number, allOk: boolean, firstFailingIndex: number,
   *            results: {id: string, ok: boolean, title: string, detail: string, status: (string|null)}[]}}
   */
  function evaluatePassword(password, campus = CAMPUS) {
    const pw = String(password ?? '');
    const length = [...pw].length;
    const digitSum = sumDigits(pw);
    const vars = campusVars(campus);
    const checks = {
      minLength: length >= BALANCE.PASSWORD_MIN_LENGTH,
      digit: /[0-9]/.test(pw),
      mixedCase: /\p{Lu}/u.test(pw) && /\p{Ll}/u.test(pw),
      special: /[!-\/:-@\[-`{-~]/.test(pw),
      course: pw.toLowerCase().includes(campus.course.toLowerCase()),
      swabian: findSwabianWord(pw, campus) !== null,
      digitSum: digitSum === BALANCE.PASSWORD_DIGIT_SUM,
      ascii: /^[\x21-\x7e]*$/.test(pw),
      maxLength: length <= BALANCE.PASSWORD_MAX_LENGTH,
    };
    const statuses = {
      minLength: `${length} von ${BALANCE.PASSWORD_MIN_LENGTH} Zeichen`,
      digitSum: `Quersumme aktuell: ${digitSum}`,
      maxLength: `aktuell ${length} Zeichen`,
    };
    const results = PASSWORD_RULES.map((rule) => ({
      id: rule.id,
      ok: checks[rule.id],
      title: fill(rule.title, vars),
      detail: fill(rule.detail, vars),
      status: statuses[rule.id] || null,
    }));
    const firstFailingIndex = results.findIndex((result) => !result.ok);
    return { password: pw, length, digitSum, results, firstFailingIndex, allOk: firstFailingIndex === -1 };
  }

  /**
   * Wie viele Regeln sind sichtbar? „Password Game“: Die nächste Regel erscheint, sobald
   * alle davor erfüllt sind; sichtbare Regeln verschwinden nie wieder.
   * @param {number} previous bisher sichtbare Regeln
   * @param {object} evaluation Ergebnis von evaluatePassword
   * @returns {number}
   */
  function revealCount(previous, evaluation) {
    const total = PASSWORD_RULES.length;
    const reachable = evaluation.firstFailingIndex === -1 ? total : evaluation.firstFailingIndex + 1;
    return Math.min(total, Math.max(INITIAL_REVEALED, previous || 0, reachable));
  }

  /** Regeln, die beim Übergang previous → next neu sichtbar werden (mit Erfüllt-Status). */
  function newlyRevealed(previous, next, evaluation) {
    return evaluation.results.slice(previous, next).map((result) => ({ id: result.id, ok: result.ok }));
  }

  /** Ist das eine der fiesen Überraschungsregeln? */
  function isTwistRule(id) {
    return TWIST_RULES.includes(id);
  }

  /** Fertig, wenn alle Regeln sichtbar und erfüllt sind. */
  function isPasswordComplete(evaluation, revealed) {
    return evaluation.allOk && revealed >= PASSWORD_RULES.length;
  }

  /**
   * Klartext-Tipp für eine Regel (Mitleids-Tipp, wenn man zu lange an ihr hängt).
   * @param {string} id Regel-ID
   * @param {string} password aktuelles Passwort
   * @param {object} [campus=CAMPUS]
   * @returns {string}
   */
  function ruleHint(id, password, campus = CAMPUS) {
    const pw = String(password ?? '');
    const length = [...pw].length;
    const shortest = shortestSwabianWord(campus);
    switch (id) {
      case 'minLength':
        return `Noch ${Math.max(1, BALANCE.PASSWORD_MIN_LENGTH - length)} Zeichen. Einfach weitertippen.`;
      case 'digit':
        return 'Eine Ziffer anhängen. Später zählt die Quersumme – klein anfangen.';
      case 'mixedCase':
        return 'Mindestens ein großer und ein kleiner Buchstabe.';
      case 'special':
        return 'Ein ! oder # oder - anhängen. Das § zählt nicht.';
      case 'course':
        return `Dein Kurs steht im Brief: ${campus.course}. Einfach mit reinschreiben.`;
      case 'swabian':
        return `Zum Beispiel „${shortest}“ – kurz und ohne Umlaut. Das wirst du noch zu schätzen wissen.`;
      case 'digitSum': {
        const sum = sumDigits(pw);
        const target = BALANCE.PASSWORD_DIGIT_SUM;
        if (sum < target) return `Quersumme ${sum}, es fehlen ${target - sum}. Häng z. B. „${digitsForSum(target - sum)}“ an.`;
        return `Quersumme ${sum} – ${sum - target} zu viel. Ziffern löschen (die im Kurs bleiben).`;
      }
      case 'ascii': {
        const offenders = [...new Set([...pw].filter((ch) => !/[\x21-\x7e]/.test(ch)))]
          .map((ch) => (ch === ' ' ? 'Leerzeichen' : `„${ch}“`));
        const list = offenders.length > 0 ? offenders.join(', ') : 'Umlauten';
        return `Raus mit ${list}: aus ä wird ae, aus ß wird ss.`;
      }
      case 'maxLength': {
        const excess = Math.max(1, length - BALANCE.PASSWORD_MAX_LENGTH);
        const used = findSwabianWord(pw, campus);
        const swap = used && used !== shortest && transliterate(used).length > shortest.length
          ? ` „${shortest}“ statt „${used}“ spart Platz.`
          : ' Überflüssiges löschen.';
        return `${excess} Zeichen zu viel.${swap}`;
      }
      default:
        return 'Lies die rote Regel und pass das Passwort an.';
    }
  }

  /**
   * Ein garantiert gültiges Passwort aus den CAMPUS-Daten (für debugSolve und Tests).
   * @param {object} [campus=CAMPUS]
   * @returns {string}
   */
  function suggestPassword(campus = CAMPUS) {
    const missing = BALANCE.PASSWORD_DIGIT_SUM - sumDigits(campus.course);
    return `${campus.course}-${shortestSwabianWord(campus)}${digitsForSum(missing)}`;
  }

  // ---------------------------------------------------------------------------
  // Station 5: Synchronisation
  // ---------------------------------------------------------------------------

  /** Statusmeldungen beim Neuladen (Reihenfolge per RNG). */
  const SYNC_MESSAGES = [
    { text: 'Ausstehend. Ihr Antrag steht in der Warteschlange (Position 214).' },
    { text: 'In Bearbeitung. Bitte laden Sie die Seite nicht neu.' },
    { text: 'Synchronisiere mit Server 2 von 3 …' },
    { text: '99 % … Fehler. Synchronisation startet neu (0 %).', isSetback: true },
    { text: 'Der zuständige Server macht gerade Kehrwoche.' },
    { text: 'Warte auf Freigabe durch das {helpdeskName} (Sprechzeiten {hours}).' },
    { text: 'Zeitüberschreitung (Fehler LDAP-49). Bitte später erneut versuchen.' },
    { text: 'Ihre Daten sind mit der S-Bahn unterwegs. Stammstrecke gesperrt.' },
  ];

  /**
   * Plant die Synchronisation: nach `needed` Neuladen (3–6) ist sie durch.
   * @param {object} [rng]
   * @param {object} [campus=CAMPUS]
   * @returns {{needed: number, messages: {text: string, isSetback: boolean}[]}}
   */
  function createSyncPlan(rng, campus = CAMPUS) {
    const random = resolveRng(rng);
    const needed = random.int(BALANCE.SYNC_MIN_RELOADS, BALANCE.SYNC_MAX_RELOADS);
    const vars = campusVars(campus);
    const messages = random.shuffle(SYNC_MESSAGES).map((message) => ({
      text: fill(message.text, vars),
      isSetback: Boolean(message.isSetback),
    }));
    return { needed, messages };
  }

  /**
   * Status nach `reloads` Mal Neuladen.
   * @param {{needed: number, messages: object[]}} plan
   * @param {number} reloads
   * @returns {{done: boolean, text: string, isSetback: boolean}}
   */
  function syncStatus(plan, reloads) {
    if (reloads >= plan.needed) return { done: true, text: TEXT.sync.done, isSetback: false };
    if (reloads <= 0) return { done: false, text: TEXT.sync.initialStatus, isSetback: false };
    const message = plan.messages[(reloads - 1) % plan.messages.length];
    return { done: false, text: message.text, isSetback: message.isSetback };
  }

  // ---------------------------------------------------------------------------
  // Laden über EDGE, Formatierung, Texte
  // ---------------------------------------------------------------------------

  /**
   * Ladezeit einer Seite in echten Millisekunden (begrenzt, damit es witzig bleibt).
   * @param {number} sizeKb
   * @returns {number}
   */
  function loadingMs(sizeKb) {
    const raw = BALANCE.LOAD_BASE_MS + Math.max(0, sizeKb) * BALANCE.LOAD_MS_PER_KB;
    return Math.round(Math.min(BALANCE.LOAD_MAX_MS, Math.max(BALANCE.LOAD_MIN_MS, raw)));
  }

  /** 47.56 → „47,6 MB“ (nie negativ). */
  function formatMegabytes(mb) {
    const value = Math.max(0, Number(mb) || 0);
    return `${value.toFixed(1).replace('.', ',')} MB`;
  }

  /** 1240 → „1.240 kB“. */
  function formatKilobytes(kb) {
    const value = Math.max(0, Math.round(Number(kb) || 0));
    return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kB`;
  }

  /** Datenvolumen nach dem Laden einer Seite (nie negativ). */
  function dataVolumeAfter(volumeMb, sizeKb) {
    return Math.max(0, volumeMb - sizeKb / 1024);
  }

  /** 495 → „08:15“ (lokal, damit die Logik ohne Scoring auskommt). */
  function formatClock(minutes) {
    const total = Math.max(0, Math.floor(minutes));
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  /** „A, B oder C“ */
  function joinOr(words) {
    if (words.length <= 1) return words.join('');
    return `${words.slice(0, -1).join(', ')} oder ${words[words.length - 1]}`;
  }

  /**
   * Variablen für die Text-Vorlagen, alle aus CAMPUS/CONFIG/BALANCE abgeleitet.
   * @param {object} [campus=CAMPUS]
   * @returns {object}
   */
  function campusVars(campus = CAMPUS) {
    return {
      campusName: campus.name,
      city: campus.city,
      studentName: campus.studentName,
      course: campus.course,
      courseName: campus.courseName,
      username: campus.username,
      realm: campus.realm,
      identity: campus.identity,
      portalName: campus.portal.name,
      helpdeskName: campus.helpdesk.name,
      hours: campus.helpdesk.hours,
      lecture: formatClock(CONFIG.CLOCK.LECTURE_MINUTES),
      swabianExamples: joinOr(campus.flavor.swabianWords.slice(0, 3)),
      spelledPassword: spellConfusables(campus.initialPassword),
      minLength: BALANCE.PASSWORD_MIN_LENGTH,
      maxLength: BALANCE.PASSWORD_MAX_LENGTH,
      digitSum: BALANCE.PASSWORD_DIGIT_SUM,
      magnifierMinutes: BALANCE.MAGNIFIER_MINUTES,
      copierMinutes: BALANCE.COPIER_MINUTES,
      reloadMinutes: BALANCE.SYNC_RELOAD_MINUTES,
      termsCount: TERMS.length,
    };
  }

  /**
   * Ersetzt {schlüssel} durch vars[schlüssel]; unbekannte Variablen bleiben stehen.
   * @param {string} template
   * @param {object} vars
   * @returns {string}
   */
  function fill(template, vars) {
    return String(template).replace(/\{([a-zA-Z]+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
    ));
  }

  /** Füllt rekursiv alle Zeichenketten eines Objekts. */
  function fillDeep(value, vars) {
    if (typeof value === 'string') return fill(value, vars);
    if (Array.isArray(value)) return value.map((item) => fillDeep(item, vars));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillDeep(item, vars)]));
    }
    return value;
  }

  /**
   * Alle Kapiteltexte mit eingesetzten CAMPUS-Werten (neue Kopie).
   * @param {object} [campus=CAMPUS]
   * @returns {object} gleiche Struktur wie TEXT
   */
  function texts(campus = CAMPUS) {
    return fillDeep(TEXT, campusVars(campus));
  }

  /** Zusammengesetzte Texte mit Laufzeitwerten. */
  const FORMAT = {
    stepOf: (index, total) => `Schritt ${index} von ${total}`,
    tosProgress: (progress) => `Gelesen: ${Math.round(Math.min(1, Math.max(0, progress || 0)) * 100)} %`,
    reloads: (count) => `Neu geladen: ${count}×`,
    loading: (sizeKb) => `Übertrage ${formatKilobytes(sizeKb)} … (EDGE, ${BALANCE.EDGE_KB_PER_SECOND} kB/s)`,
    dataLeft: (mb) => `EDGE · ${formatMegabytes(mb)} übrig`,
    systemError: (message, failCount) => `${message} (Fehler ${errorCode(failCount)})`,
    ruleLabel: (index, title) => `${index + 1}. ${title}`,
    stuckTip: (index, hint) => `Regel ${index + 1}: ${hint}`,
    allRulesOk: (count) => `Alle ${count} Regeln erfüllt.`,
    lastCheck: (clockLabel) => `Letzte Prüfung: ${clockLabel}`,
  };

  /** Zufallsquelle: übergeben oder globales RNG (Vertrag: Zufall nur über RNG). */
  function resolveRng(rng) {
    if (rng) return rng;
    if (typeof RNG !== 'undefined') return RNG;
    throw new Error('Ch1Logic: kein RNG verfügbar (src/core/rng.js laden oder rng übergeben).');
  }

  /** Friert ein Objekt samt allen verschachtelten Objekten ein. */
  function deepFreeze(obj) {
    Object.values(obj).forEach((value) => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
    });
    return Object.freeze(obj);
  }

  return deepFreeze({
    STEPS,
    BALANCE,
    PAGES,
    TEXT,
    FORMAT,
    CAPTCHA_KINDS,
    PASSWORD_RULES,
    INITIAL_REVEALED,
    SYNC_MESSAGES,
    // Login
    normalizeConfusables,
    checkLogin,
    magnifyPassword,
    spellConfusables,
    loginTip,
    errorCode,
    // CAPTCHA
    createCaptchaGrid,
    checkCaptcha,
    captchaOutcome,
    captchaTip,
    shouldShowCaptchaLabels,
    // Nutzungsordnung
    pickSecretWord,
    buildTerms,
    isSecretWord,
    isTermsEnd,
    // Passwort
    evaluatePassword,
    revealCount,
    newlyRevealed,
    isTwistRule,
    isPasswordComplete,
    ruleHint,
    suggestPassword,
    digitsForSum,
    sumDigits,
    transliterate,
    // Synchronisation
    createSyncPlan,
    syncStatus,
    // Laden, Formatierung, Texte
    loadingMs,
    formatMegabytes,
    formatKilobytes,
    dataVolumeAfter,
    formatClock,
    campusVars,
    fill,
    texts,
  });
})();
