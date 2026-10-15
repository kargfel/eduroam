/**
 * campus.js – Standortdaten „DHBW Stuttgart“ für alle Kapitel.
 *
 * Gemeinsame Fakten (Realm, WLAN-Einstellungen, Zertifikat, Orte, Lokalkolorit)
 * stehen hier, damit Kapitel sie nicht hart codieren. Kapitel-spezifische Inhalte
 * gehören in src/logic/chN*.js.
 *
 * Alle personenbezogenen Daten sind fiktiv. Werte unter `research.verified`
 * wurden aus öffentlichen Quellen geprüft (Stand Oktober 2026, Details und Belege in
 * docs/RESEARCH.md), alles andere ist plausible Satire.
 *
 * Wichtig für die Einordnung: Das Spiel zeigt das „klassische“ eduroam-Verfahren
 * (PEAP/MSCHAPv2 mit Kennung und Passwort), wie es das CAT-Profil der DHBW Stuttgart
 * für den Campus Horb noch nutzt. Am Campus Stuttgart läuft eduroam inzwischen über
 * easyroam-Nutzerzertifikate des DFN (EAP-TLS) – das steht in research.notes und im
 * realWorldTip.
 *
 * Global: CAMPUS (nur lesen). Abhängigkeiten: keine.
 */

const CAMPUS = Object.freeze({
  id: 'stuttgart',
  name: 'DHBW Stuttgart',
  city: 'Stuttgart',

  // Fiktive Spielfigur (Studiengang und Gebäude sind echt: Wirtschaftsinformatik sitzt am Rotebühlplatz 41)
  studentName: 'Alex Muster',
  course: 'WWI26A',                       // offizielles Schema „Kurs WWI2025A“ (Jahr vierstellig), im Alltag kurz
  courseName: 'Wirtschaftsinformatik',
  lectureRoom: 'Raum 2.14',               // fiktiv
  lectureBuilding: 'Rotebühlplatz 41',

  // Zugangsdaten (fiktiv!) – Schema echt: benutzername@lehre.dhbw-stuttgart.de (Beispiel der IT: wiw084711)
  username: 'wwi26042',
  realm: 'lehre.dhbw-stuttgart.de',
  identity: 'wwi26042@lehre.dhbw-stuttgart.de',
  anonymousIdentity: 'anonymous@lehre.dhbw-stuttgart.de', // Realm muss zur Identität passen (Muster CAT-Profil Horb)
  initialPassword: 'Il1O0-Kx7#q',        // absichtlich verwechselbare Zeichen (Kapitel 1)
  defaultPassword: 'Brezel2026!Kehrwoche', // Fallback, falls Kapitel 1 übersprungen wurde

  /** Korrekte eduroam-Einstellungen für das klassische Verfahren (Android-Begriffe, deutsch). */
  wifi: Object.freeze({
    ssid: 'eduroam',
    guestSsid: 'DHBW-Gast',                       // fiktiv: kein öffentlich dokumentiertes Gast-WLAN gefunden
    security: 'WPA2/WPA3-Enterprise',
    eapMethod: 'PEAP',                            // laut CAT-Profil DHBW Stuttgart (Campus Horb)
    phase2: 'MSCHAPV2',                           // laut CAT-Profil DHBW Stuttgart (Campus Horb)
    caCertOption: 'Systemzertifikate verwenden',
    ocsp: 'Nicht bestätigen',                     // Android-Standard; DFN-easyroam-Anleitung: „Zertifikatstatus anfordern“
    domain: 'radius.dhbw-stuttgart.de',           // plausibel, aber erfunden (Horb: freeradius.hb.dhbw-stuttgart.de)
  }),

  /** Server-Zertifikat des RADIUS-Servers. CA-Kette echt (GÉANT TCS über HARICA), Name/Fingerabdruck fiktiv. */
  certificate: Object.freeze({
    serverName: 'radius.dhbw-stuttgart.de',
    issuer: 'GEANT TLS RSA 1',
    rootCA: 'HARICA TLS RSA Root CA 2021',
    validFrom: '01.03.2026',
    validTo: '31.03.2027',
    sha256: '4F:9A:1C:E2:77:0B:D3:58:A6:21:9E:C4:5B:F0:3D:82:6A:17:E9:4C:B5:02:D8:73:1F:AE:66:C9:30:8B:E5:14',
    outdatedRootCA: 'Deutsche Telekom Root CA 2', // steht noch im Merkblatt von 2014 (damals DFN-PKI-Wurzel)
  }),

  portal: Object.freeze({
    name: 'DHBW Self-Service-Portal',                  // echt heißen die Stationen „Aktivierungsportal“ und „Account Management“
    url: 'https://selfservice.dhbw-stuttgart.example', // bewusst .example – kein echtes Portal
  }),

  helpdesk: Object.freeze({
    name: 'IT.Service Center',
    hours: 'Mo–Do 09:00–11:00', // Satire: echte Sprechzeiten sind nicht veröffentlicht, Kontakt per Support-Formular
    ticketPrefix: 'ITSD',
    phone: '0711 000000-0', // fiktiv
  }),

  services: Object.freeze({ schedule: 'Rapla', grades: 'Dualis', lms: 'Moodle' }),

  // Echte Standorte laut dhbw-stuttgart.de/dhbw-stuttgart/standorte (Reihenfolge der ersten fünf bleibt stabil)
  buildings: Object.freeze([
    'Rotebühlplatz 41',
    'Paulinenstraße 50',
    'Lerchenstraße 1',
    'Jägerstraße 56',
    'Herdweg 23',
    'Rotebühlstraße 133',
    'Kronenstraße 53 A',
    'Tübinger Straße 33',
  ]),

  flavor: Object.freeze({
    swabianWords: Object.freeze([
      'Brezel', 'Spätzle', 'Maultasche', 'Kehrwoche', 'Gsälz', 'Grombira', 'Häusle', 'Bobbele',
      'Muggeseggele', 'Viertele', 'Schätzle', 'Bruddler',
    ]),
    exclamations: Object.freeze([
      'Heilandsack!', 'Ha noi!', 'Des gibt’s doch net!', 'Herrschaftszeiten!', 'Jetzt aber!',
      'Do legsch di nieder!', 'Ha, des isch jo subber!', 'So a Glump!',
    ]),
    places: Object.freeze([
      'Stuttgart-21-Baustelle', 'Kessel', 'Fernsehturm', 'Königstraße', 'Stäffele', 'Cannstatter Wasen',
      'Rotebühlplatz', 'Feuersee', 'Schlossplatz', 'S-Bahn-Stammstrecke', 'Tiefenhörsaal',
    ]),
  }),

  /** Wird vom Recherche-Schritt gepflegt: was ist geprüft, woher stammt es. */
  research: Object.freeze({
    verified: Object.freeze([
      'name',
      'courseName',
      'lectureBuilding',
      'realm',
      'identity',
      'wifi.ssid',
      'wifi.eapMethod',
      'wifi.phase2',
      'certificate.issuer',
      'certificate.rootCA',
      'helpdesk.name',
      'services.schedule',
      'services.grades',
      'services.lms',
      'buildings',
    ]),
    sources: Object.freeze([
      'https://www.dhbw-stuttgart.de/service/its/informationen-fuer-studierende/wlan/vpn-zugang/',
      'https://web.archive.org/web/20210516082842/https://www.dhbw-stuttgart.de/service/its/informationen-fuer-studierende/wlan/vpn-zugang/',
      'https://www.dhbw-stuttgart.de/service/its/informationen-fuer-studierende/zugangsdaten-zum-rechnernetz/',
      'https://www.dhbw-stuttgart.de/service/its/informationen-fuer-studierende/e-mail-an-der-dhbw-stuttgart/',
      'https://www.dhbw-stuttgart.de/service/its/support-studierende/',
      'https://www.dhbw-stuttgart.de/dhbw-stuttgart/standorte/',
      'https://www.dhbw-stuttgart.de/studierendenportal/wirtschaftsinformatik/plaene/vorlesungsplaene/studienjahrgang-2025/',
      'https://cat.eduroam.org/user/API.php?action=listProfiles&idp=5241&lang=de',
      'https://cat.eduroam.org/user/API.php?action=downloadInstaller&lang=de&profile=6998&device=eap-config&generatedfor=user&openroaming=0',
      'https://doku.tid.dfn.de/de:eduroam:easyroam',
      'https://docs.ca.kit.edu/geant-tcs/en/sectigo_contract_ends/',
    ]),
    notes: Object.freeze([
      'Campus Stuttgart: eduroam läuft über easyroam-Nutzerzertifikate des DFN (EAP-TLS) – im WLAN-Dialog steht dann kein Passwort mehr.',
      'Das Spiel zeigt das klassische Verfahren (PEAP/MSCHAPv2), wie es das CAT-Profil der DHBW Stuttgart für den Campus Horb nutzt.',
      'easyroam-Profile der DHBW Stuttgart gelten sieben Monate; die IT empfiehlt, sie alle sechs Monate in der App zu erneuern.',
      'Offizielle IT-Seite: alte eduroam-Konfiguration und geteduroam-Apps vorher löschen; Einrichtung am besten zu Hause, denn sie braucht Internet.',
      'easyroam manuell (Android): EAP-Methode TLS, Systemzertifikate, Zertifikatstatus anfordern, Domain easyroam.eduroam.de, Identität = Seriennummer@Realm.',
      'Ersatz-Passwörter gibt es nur persönlich im Sekretariat oder mit dem Studierendenausweis an einem Kopierer der DHBW.',
      'GÉANT TCS: Sectigo hat den Vertrag zum 10.01.2025 beendet; Nachfolger ist HARICA (Root „HARICA TLS RSA Root CA 2021“).',
      'Erfunden: Gast-WLAN-Name, RADIUS-Servername, Sprechzeiten, Raum, Kennungsnummer, Passwörter und Fingerabdruck.',
    ]),
  }),

  /** Ernst gemeinter Tipp für das Ende des Spiels (Stand Oktober 2026, Campus Stuttgart). */
  realWorldTip:
    'So geht es an der DHBW Stuttgart wirklich: alte eduroam-Profile und geteduroam-Apps löschen, ' +
    'dann (am besten zu Hause, das braucht Internet) die App „easyroam“ installieren, ' +
    '„DHBW Stuttgart“ wählen und mit den Lehrenetz-Zugangsdaten anmelden. Die App richtet ein ' +
    'Zertifikat ein, ein WLAN-Passwort brauchst du nicht. Profil alle sechs Monate in der App erneuern.',

  disclaimer:
    'Satire. Alle Personen, Kennungen, Zertifikate und Abläufe sind fiktiv oder überzeichnet. ' +
    'Bitte niemals echte Zugangsdaten eingeben.',
});
