# Recherche: eduroam an der DHBW Stuttgart

Stand: 15.10.2026. Alle Inhalte stammen aus öffentlich zugänglichen Quellen (Liste am Ende).
Personenbezogenes im Spiel (Name, Kennungsnummer, Passwörter, Fingerabdruck, Telefon) bleibt
fiktiv. Was in `src/campus.js` als geprüft gilt, steht in `CAMPUS.research.verified`.

---

## 1. Kernbefund (wichtig für Ton und Abspann)

**Am Campus Stuttgart läuft eduroam heute über easyroam, nicht mehr über Kennung + Passwort.**

- Offizielle IT-Seite: „Der Zugang zu eduroam erfolgt über Nutzerzertifikate die vom
  easyroam-Dienst des DFN ausgestellt werden.“ Es gibt Apps für Windows, Linux, Android und iOS
  sowie ein Verwaltungsportal mit QR-Codes. [Q1]
- Im eduroam CAT (IdP 5241 „Duale Hochschule Baden-Württemberg Stuttgart / DHBW Stuttgart“)
  gibt es zwei Profile: **„Campus Stuttgart“** leitet direkt auf easyroam um
  (`easyroam.de`, Shibboleth-IdP `saml.dhbw-stuttgart.de`). **„Campus Horb“** nutzt noch das
  klassische Verfahren. [Q8]
- easyroam ist **EAP-TLS** mit pseudonymen Nutzerzertifikaten aus einer eigenen eduroam-PKI des
  DFN. Im WLAN-Dialog gibt es dann **kein Passwort** mehr. [Q10]

Für das Spiel heißt das: Die Kapitel zeigen das **klassische Verfahren** (PEAP/MSCHAPv2 mit
Kennung und Passwort). Das war bis etwa 2021 auch am Campus Stuttgart Standard [Q2] und ist am
Campus Horb (CAT-Profil) noch heute so [Q9]. Der Witz für den Abspann: Am Ende braucht man das
alles gar nicht mehr, denn heute macht das die easyroam-App (siehe `CAMPUS.realWorldTip`).

---

## 2. Geprüfte Fakten

| Thema | Wert | Quelle |
|---|---|---|
| Realms der DHBW Stuttgart im CAT | `lehre.dhbw-stuttgart.de`, `hb.dhbw-stuttgart.de` (Horb) | Q8 |
| Benutzername für eduroam (klassisch) | E-Mail im Lehrenetz: `username@lehre.dhbw-stuttgart.de` | Q2, Q4 |
| Kennungsschema | Beispiel der IT: `wiw084711@lehre.dhbw-stuttgart.de` | Q4 |
| Separates WLAN-Passwort? | Nein: klassisch das Kennwort des „LEHRE-NETZ“; heute (easyroam) gar keins im WLAN | Q2, Q12, Q1 |
| SSID | `eduroam` (zusätzlich Passpoint-OI `001bc50460`) | Q9 |
| EAP (Profil Horb) | PEAP (EAP-Typ 25), Phase 2 MSCHAPv2 (Typ 26), mindestens WPA2/CCMP | Q9 |
| Anonyme Identität (Horb) | `anonymous@hb.dhbw-stuttgart.de` (Realm passt zur Kennung) | Q9 |
| RADIUS-Servernamen (Horb) | `freeradius.hb.dhbw-stuttgart.de`, `freeradius.ba-horb.de` | Q9 |
| CA-Kette (Horb) | HARICA TLS RSA/ECC Root CA 2021, Zwischen-CA **GEANT TLS RSA 1** bzw. GEANT TLS ECC 1, dazu Hellenic Academic and Research Institutions RootCA 2015 (RSA/ECC) | Q9 |
| easyroam manuell (Android) | Sicherheit WPA/WPA2-Enterprise, EAP-Methode **TLS**, CA „Systemzertifikate verwenden“, Online-Zertifikatstatus „Zertifikatstatus anfordern“, Domain **`easyroam.eduroam.de`**, Identität = Seriennummer des Zertifikats + easyroam-Realm der eigenen Einrichtung (= CN) | Q10 |
| Gültigkeit easyroam-Profil | DHBW Stuttgart: 7 Monate, Erneuerung „am Besten alle sechs Monate“; DFN-Standard ohne Vorgabe: 3 Monate | Q1, Q10 |
| Account | „Lehrenetz-Account“, Infoschreiben ca. 4 Wochen vor Studienbeginn per E-Mail an die private Adresse; Aktivierung im „Aktivierungsportal“; gültig bis zur Exmatrikulation | Q3 |
| Passwort ändern / zurücksetzen | „Account Management“ (im Studierendenportal) | Q3 |
| IT-Support | **IT.Service Center (ITS)**, Sitz Rotebühlstraße 133; Kontakt über das Support-Formular | Q5, Q6 |
| Dienste | Moodle (`elearning.dhbw-stuttgart.de`), Dualis (`dualis.dhbw.de`), Rapla (`rapla.dhbw.de`, Vorlesungspläne) | Q1, Q7 |
| Kursnamen (Wirtschaftsinformatik) | „Kurs WWI2025A“ … „WWI2025I“, „WWI2025V“ | Q7 |
| VPN | eduVPN (2021 noch OpenVPN); im DHBW-WLAN gesperrt, weil dort unnötig | Q1, Q2 |
| GÉANT TCS | Sectigo hat den Vertrag zum **10.01.2025** beendet (eigentlich bis April 2025); DFN-PKI hat am **04.12.2024** einen Übergangsvertrag mit **HARICA** gemeldet | Q11 |

### Standorte Campus Stuttgart [Q6]

- **Wirtschaft:** Herdweg 21, 23, 29/31 · Kronenstraße 53 A · Paulinenstraße 50 (auch ZEF, ZMS) ·
  Rotebühlplatz 41 (Dekanat Wirtschaft, **Wirtschaftsinformatik**, SIZ) · Theodor-Heuss-Straße 2 ·
  Tübinger Straße 33 (auch Studienfachbereich Gesundheit) · Herdweg 20 (BWL-Risk and Insurance
  Management)
- **Technik:** Lerchenstraße 1 (Dekanat Technik, Neubau)
- **Sozialwesen:** Rotebühlstraße 131 (Dekanat, Hasenbergsaal)
- **Sonstiges:** Rotebühlstraße 133 (Rektorat, Verwaltung, IT.Service Center, Rosenbergsaal) ·
  Jägerstraße 56 · Jägerstraße 58 (Audimax, **Tiefenhörsaal**) · Kronenstraße 53 B (Bibliothek)

---

## 3. Reale Stolpersteine (Futter für die Kapitel)

1. **Alte Konfiguration löschen** (Kap. 2): 2021 wie heute schreibt die IT, ein vorhandenes
   eduroam-WLAN „zu Beginn unbedingt manuell“ zu löschen. Unter iOS muss zusätzlich das Profil
   unter Einstellungen > Allgemein > Profile weg. Grund: Betriebssysteme behalten die alte
   Konfiguration und probieren sie weiter. [Q1, Q2]
2. **App-Kehrtwende** (Kap. 2/5): 2021 hieß es „Nutzer von Android-Geräten müssen … die eduroam
   CAT-App installieren“. 2026 heißt es „Löschen Sie ebenfalls vorhandene eduroam/geteduroam-Apps“.
   [Q2, Q1]
3. **Catch-22** (Kap. 2): Laut IT braucht die Einrichtung eine Internetverbindung, deshalb soll man
   sie zu Hause vorbereiten. Ohne WLAN kommt man also nicht ins WLAN. [Q1]
4. **Manuell geht nicht** (Kap. 2): 2021 offiziell: „Die Verwendung des Installers ist
   unumgänglich. Manuell konfigurierte Geräte können zu Ihrer Sicherheit keine Verbindung mehr zum
   WLAN aufbauen.“ [Q2]
5. **Identität mit Realm** (Kap. 2): Als Benutzername gilt die volle Lehrenetz-Adresse
   `username@lehre.dhbw-stuttgart.de`, nicht nur die Kennung. Ohne Realm weiß eduroam nicht, an
   welche Heimat-Einrichtung die Anfrage gehen soll. [Q2]
6. **Anonyme Identität mit passendem Realm** (Kap. 2): Die äußere Identität wird im Klartext und
   über Hochschulgrenzen hinweg geroutet, deshalb `anonymous@<eigener Realm>` (Horb:
   `anonymous@hb.dhbw-stuttgart.de`). Mit falschem Realm landet die Anfrage beim Roaming im
   Nirgendwo. [Q9; Begründung allgemeines eduroam-Prinzip]
7. **Android 11+: „Nicht validieren“ ist weg** (Kap. 2/4): Wer vorher ohne Zertifikatsprüfung
   verbunden war, kommt nach dem Update auf Android 11 nicht mehr ins Netz [Q13]. Man muss ein
   CA-Zertifikat wählen. Bei „Systemzertifikate verwenden“ verlangt Android zusätzlich eine
   Domain, sonst bleibt „Verbinden“ ausgegraut [allgemeines Fachwissen; die DFN-Anleitung Q10
   nutzt genau diese Kombination].
8. **Evil Twin** (Kap. 4): Jeder Hotspot darf „eduroam“ heißen. Ohne Prüfung von Root-CA und
   Servername gibt das Handy bei PEAP/MSCHAPv2 die Anmeldung an einen fremden Server weiter, der
   den MSCHAPv2-Austausch mitschneiden und das Passwort offline angreifen kann. Genau deshalb hat
   Android die Option „Nicht validieren“ entfernt. Bei easyroam (EAP-TLS) gibt es kein Passwort,
   das man abgreifen könnte. [allgemeines Fachwissen]
9. **Zertifikatswechsel** (Kap. 4, Plot-Twist): Durch den Wechsel von GÉANT TCS von Sectigo zu
   HARICA (Ende 2024/Anfang 2025) bekamen RADIUS-Server neue Zertifikatsketten mit neuer
   Root-CA. Profile, die auf die alte Root festgelegt waren, mussten neu installiert werden.
   **Korrektur zum Briefing:** Der Wechsel war nicht 2023/24, sondern Dezember 2024 bis Januar
   2025. [Q11]
10. **Profil läuft ab** (Kap. 5): easyroam-Zertifikate der DHBW Stuttgart gelten sieben Monate.
    Wer das Erneuern vergisst, fliegt mitten im Semester raus. Abhilfe laut IT: in der App
    erneuern, die neueste Version nutzen, WLAN löschen und „Reinstallieren“. [Q1]
11. **Firmenlaptop ohne Adminrechte** (Kap. 5, sehr dual): Wer easyroam auf dem Gerät des
    Ausbildungsbetriebs nicht installieren darf, muss sich laut IT „an die IT Ihres Unternehmens
    wenden“. Das ergibt Helpdesk-Ping-Pong zwischen zwei IT-Abteilungen. [Q1]
12. **Fehlermeldung ignorieren** (Kap. 2): Die Installation versucht sofort zu verbinden. Wer gerade
    nicht im WLAN-Bereich ist, bekommt eine Fehlermeldung, die man laut IT ignorieren darf. [Q1]
13. **Wenn alle Stricke reißen** (Kap. 2/5): Bei manuellem easyroam unter Android lädt man eine
    PKCS12-Datei herunter, „je nach Alter des Geräts“ notfalls per USB-Kabel. Die Identität muss
    exakt zum CN des Zertifikats passen, sonst lehnt der RADIUS-Server ab. Das ist die
    Original-Überschrift im DFN-Wiki. [Q10]
14. **Passwort vergessen** (Kap. 1/5): Ersatz gibt es nur persönlich im Sekretariat, per Post oder
    mit dem Studierendenausweis an einem Kopierer der DHBW. Per E-Mail werden keine Passwörter
    verschickt. [Q3]

---

## 4. Unsicherheiten (bewusst nicht als „geprüft“ markiert)

- **Umstellungsdatum auf easyroam** am Campus Stuttgart: unbekannt. 2021 lief noch CAT [Q2], das
  CAT-Profil „Campus Stuttgart“ wurde zuletzt am 11.11.2025 geändert [Q8].
- **RADIUS-Servername Campus Stuttgart** (klassisch) ist nicht öffentlich. `radius.dhbw-stuttgart.de`
  im Spiel ist erfunden. Echt sind nur die Horb-Namen und `easyroam.eduroam.de`.
- **Gast-WLAN:** Kein öffentlich dokumentierter Name gefunden. `DHBW-Gast` ist erfunden.
- **Sprechzeiten des IT.Service Centers:** nicht veröffentlicht (nur Support-Formular).
  `Mo–Do 09:00–11:00` ist Satire und passt zum Intro von Kapitel 5.
- **Kurzform der Kursnamen** (`WWI26A` statt `WWI2026A`): im Alltag üblich, aber nicht offiziell
  belegt. Offiziell steht der vierstellige Jahrgang.
- **Kennungsschema:** Es gibt nur ein Beispiel (`wiw084711`). Die Deutung „Kürzel + Jahrgang +
  Nummer“ ist eine Vermutung. `wwi26042` im Spiel ist fiktiv.
- **Raum „2.14“** am Rotebühlplatz 41: fiktiv, die Raumbenennung wurde nicht geprüft.
- **„Systemzertifikate verwenden“ beim klassischen PEAP:** Das funktioniert nur, wenn die
  HARICA-Root im System-Zertifikatsspeicher des Geräts liegt. Bei älteren Android-Versionen ist
  das nicht geprüft. CAT- und geteduroam-Profile bringen die CA deshalb selbst mit.
- **Sicherheitsstufe:** Je nach Android-Version heißt die Option „WPA/WPA2-Enterprise“ (DFN-Doku)
  oder „WPA2/WPA3-Enterprise“. Der Spielwert ist plausibel, aber nicht belegt.
- **`Deutsche Telekom Root CA 2`** als Root im Merkblatt von 2014 stammt aus Vorwissen (frühere
  DFN-PKI-Kette) und wurde in dieser Recherche nicht erneut belegt.

---

## 5. Ideen für Insider-Gags (harmlos, möglichst mit echtem Kern)

- **„Passwort vergessen? Bitte am Kopierer abholen.“** Das ist echt [Q3]. Gut für den
  Passwort-Schritt in Kapitel 1 oder als Helpdesk-Antwort in Kapitel 5.
- Original-Satz der IT: „Sollten Sie also Ihr Passwort vergessen haben, in der Praxisphase fernab
  von Stuttgart sind und unbedingt Ihre neuesten Noten einsehen wollen − dann haben Sie ein
  Problem.“ [Q3]
- **Merkblatt-Fehler (echt, 2021):** Im Abschnitt „Unter macOS“ steht „Führen Sie anschließend die
  Datei ‚eduroam-W10-DHBSDS‘ aus“, also eine Windows-10-Datei auf dem Mac. [Q12] Passt ideal ins
  veraltete IT-Merkblatt von Kapitel 2.
- Vage Fehlermeldung mit Originalwortlaut: „Manuell konfigurierte Geräte können zu Ihrer
  Sicherheit keine Verbindung mehr zum WLAN aufbauen.“ [Q2]
- Abspann-Pointe: „Übrigens: Am Campus Stuttgart braucht eduroam gar kein Passwort mehr. Lade die
  easyroam-App.“ Und danach: „Ihr Zertifikat läuft in 7 Monaten ab.“
- Kapitel 5: Pflichtfeld „Zuständiges Sekretariat“ im Support-Formular. Dazu Kategorien wie
  „WLAN-Zugang“, „Passwort vergessen“ und „RosettaStone“ (echte Auswahlliste) [Q5].
- „Ihre E-Mail-Weiterleitung zu Outlook ist leider einfach verschwunden.“ Laut IT passiert das bei
  Microsoft-Servern [Q4].
- „Die Adressen @lehre.ba-stuttgart.de bleiben bis auf Weiteres gültig.“ Ein Erbe aus der Zeit der
  Berufsakademie [Q4].
- Duale Ironie: Der Firmenlaptop darf nichts installieren, die Firmen-IT schickt zur DHBW-IT
  zurück [Q1].
- Kapitel 3: **Tiefenhörsaal** (Jägerstraße 58) als Funkloch, der Name passt fast zu gut [Q6].
  Weitere echte Orte: Rotebühlplatz, Feuersee, Hasenbergsaal, Rosenbergsaal.
- eduVPN funktioniert im DHBW-WLAN absichtlich nicht [Q1]: „VPN? Brauchen Sie hier nicht. Geht
  auch nicht.“
- Schwäbische Würze (in `CAMPUS.flavor` ergänzt): „Muggeseggele“ (winzige Maßeinheit),
  „Bruddler“ (Dauernörgler), „Do legsch di nieder!“, „So a Glump!“.

---

## 6. Quellen (abgerufen am 15.10.2026)

- **Q1** DHBW Stuttgart, IT.Service Center: WLAN/VPN-Zugang –
  https://www.dhbw-stuttgart.de/service/its/informationen-fuer-studierende/wlan/vpn-zugang/
- **Q2** dieselbe Seite, Archivstand 16.05.2021 –
  https://web.archive.org/web/20210516082842/https://www.dhbw-stuttgart.de/service/its/informationen-fuer-studierende/wlan/vpn-zugang/
- **Q3** Zugangsdaten zum Rechnernetz –
  https://www.dhbw-stuttgart.de/service/its/informationen-fuer-studierende/zugangsdaten-zum-rechnernetz/
  (und Account Management: …/informationen-fuer-studierende/account-management/)
- **Q4** E-Mail an der DHBW Stuttgart –
  https://www.dhbw-stuttgart.de/service/its/informationen-fuer-studierende/e-mail-an-der-dhbw-stuttgart/
- **Q5** Support für Studierende (Formular) – https://www.dhbw-stuttgart.de/service/its/support-studierende/
- **Q6** Standorte Campus Stuttgart – https://www.dhbw-stuttgart.de/dhbw-stuttgart/standorte/
- **Q7** Vorlesungspläne Wirtschaftsinformatik, Jahrgang 2025 (Rapla-Links) –
  https://www.dhbw-stuttgart.de/studierendenportal/wirtschaftsinformatik/plaene/vorlesungsplaene/studienjahrgang-2025/
- **Q8** eduroam CAT API: IdP-Liste und Profile der DHBW Stuttgart –
  https://cat.eduroam.org/user/API.php?action=listAllIdentityProviders&lang=de ,
  https://cat.eduroam.org/user/API.php?action=listProfiles&idp=5241&lang=de ,
  https://cat.eduroam.org/user/API.php?action=profileAttributes&profile=12550&lang=de
- **Q9** eduroam CAT, EAP-Konfiguration Profil „Campus Horb“ (6998) –
  https://cat.eduroam.org/user/API.php?action=downloadInstaller&lang=de&profile=6998&device=eap-config&generatedfor=user&openroaming=0
  (CA-Namen per `openssl x509` aus der Datei ausgelesen)
- **Q10** DFN-Doku easyroam (inkl. „Installation der eduroam Profile auf ANDROID, wenn alle
  Stricke reißen“) – https://doku.tid.dfn.de/de:eduroam:easyroam
- **Q11** KIT-CA: „Sectigo contract ends“ – https://docs.ca.kit.edu/geant-tcs/en/sectigo_contract_ends/
- **Q12** DHBW Stuttgart, „Eduroam verbinden“ (Klick-Anleitung, Archivstand 2021) –
  https://web.archive.org/web/2021id_/https://www.dhbw-stuttgart.de/fileadmin/dateien/IT_Service_Center/Eduroam_Verbinden.pdf
- **Q13** Stanford University IT: Setting up eduroam on Android –
  https://uit.stanford.edu/service/wirelessnet/eduroam/Android
