# eduroam – Authentifizierung fehlgeschlagen (DHBW Stuttgart Edition)

Ein satirisches Browserspiel, das spielbar macht, wie mühsam Registrierung und Login bei
eduroam sein können. Du bist Erstsemester an der DHBW Stuttgart, es ist 07:30 Uhr, um
08:15 beginnt die Vorlesung – und du brauchst nur „kurz“ WLAN.

<!-- nur-im-repo -->
**Spielen:** https://eduroam.felixkarg.de
<!-- /nur-im-repo -->

## Die fünf Kapitel

1. **Die Registrierung** – Konto im Self-Service-Portal aktivieren
2. **Die Konfiguration** – das Handy mit eduroam verbinden, mit einem IT-Merkblatt von 2014
3. **Die Signaljagd** – über den Campus laufen und Empfang finden (Arcade)
4. **Das Zertifikat** – den Evil Twin enttarnen, bevor er dein Passwort bekommt
5. **Der IT-Helpdesk** – Endgegner mit Ticketsystem und Pop-up-Gewitter

Über alle Kapitel laufen eine Uhr und ein Frust-Meter. Bei 100 % Frust ist Schluss.
Highscore und Erfolge speichert der Browser.

## Screenshots

| Menü | Kapitel 2: Konfiguration |
|---|---|
| ![Menü mit Stempel](screenshots/moodle-1-menu.png) | ![Android-Dialog und IT-Merkblatt von 2014](screenshots/moodle-2-kapitel2.png) |
| **Kapitel 3: Signaljagd** | **Kapitel 4: Zertifikat** |
| ![Campus mit Funklöchern und S21-Baustelle](screenshots/moodle-3-kapitel3.png) | ![Evil Twin mit Tippfehler-Servername](screenshots/moodle-4-kapitel4.png) |

## Sofort spielen

`index.html` doppelklicken – fertig. Keine Installation, läuft auch offline
(Phaser liegt als Kopie in `vendor/`).

**Steuerung:** Maus und Tastatur; in Kapitel 3 Pfeiltasten oder WASD.

**Für Präsentationen** (URL-Parameter): `?unlock=all` schaltet alle Kapitel frei,
`?chapter=3` springt direkt in Kapitel 3, `?mute=1` schaltet den Ton aus.

## Selbst hosten

Das Spiel ist rein statisch, ein Backend gibt es nicht. Eine der drei Varianten genügt:

| Variante | Befehl im Projektordner | Adresse |
|---|---|---|
| Node.js ≥ 18 (ohne `npm install`) | `node server/serve.mjs` | http://localhost:2222 |
| Docker | `docker compose up -d --build` | http://localhost:2222 |
| Beliebiger Webserver (Apache, nginx, GitHub Pages …) | `index.html`, `src/` und `vendor/` hochladen | je nach Server |

- Anderer Port: `PORT=8080 node server/serve.mjs` bzw. in `.env` `EDUROAM_PORT=8080`
  (Docker). Healthcheck: `/healthz`.
- Der mitgelieferte Server liefert nur die Spieldateien aus und setzt Sicherheits-Header
  inklusive Content-Security-Policy. Der Container läuft ohne Root-Rechte und mit
  schreibgeschütztem Dateisystem.

<!-- nur-im-repo -->
**Eigenes Hosting** (Homeserver mit Traefik und Cloudflare Tunnel unter
`eduroam.felixkarg.de`): Anleitung in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), Updates
per `./deploy/update.sh`. Repo: https://github.com/kargfel/eduroam

**Moodle-Paket bauen** (ohne persönliches Hosting): `node tools/build-moodle-zip.mjs`
erzeugt `dist/Spiel.zip`.
<!-- /nur-im-repo -->

## Entwicklung

- Phaser 3.90, klassische Scripts ohne Build-Schritt, keine externen Assets
- Architektur, Schnittstellen und Konventionen: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Recherche zu eduroam an der DHBW Stuttgart: [docs/RESEARCH.md](docs/RESEARCH.md)
- Tests: `npm install`, dann `npm test` (Unit-Tests mit `node --test`, Browser-Tests mit Playwright)

## Hinweis

Satire. Alle Personen, Kennungen, Zertifikate und Abläufe sind fiktiv oder überzeichnet.
Bitte im Spiel **niemals echte Zugangsdaten** eingeben. Wie es wirklich geht, steht am
Ende des Spiels.

Entstanden im Vibe-Coding-Workshop der DHBW („Neue Konzepte der Informatik“) mit
KI-Unterstützung (Claude). Phaser steht unter MIT-Lizenz, siehe `vendor/PHASER-LICENSE.md`.
