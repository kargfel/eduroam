# Prompt-Dokumentation (für den Moodle-Upload)

## Ausgangs-Prompt

> Lies die Dateien in dem Ordner hier. Erstelle ein Eduroam Simulator der es spielbar macht
> wie schwer es ist sich in Eduroam anzumelden/zu registrieren

Werkzeug: Claude Code (Modell Claude Opus 5.5) im Ordner mit den Workshop-Unterlagen
(Aufgabenstellung, Game-Prompt-Template, Diagnose-Prompts, Refactoring-Guide, Reflexionsbogen).

## Rückfragen der KI und unsere Antworten

Die KI hat die Unterlagen gelesen, die Pflichtanforderungen (DHBW-Bezug, JavaScript mit
Phaser.js, > 1000 Zeilen) und die Template-Vorgaben zusammengefasst und einen Design-Vorschlag
gemacht. Danach kamen vier Rückfragen:

| Frage | Unsere Wahl |
|---|---|
| Spielkonzept | Hybrid aus 5 Kapiteln: Registrierung, Android-Konfiguration, Arcade-Signaljagd, Evil-Twin-Zertifikat, Endgegner IT-Helpdesk |
| DHBW-Standort | DHBW Stuttgart |
| Code-Struktur | mehrere Dateien (`index.html` + `src/`), startet per Doppelklick |
| Vorgehen | Design passt, direkt bauen |

## Wie die KI vorgegangen ist

1. **Design im Chat:** Rahmenhandlung (Erstsemester, 07:30 Uhr, Vorlesung laut Rapla um 08:15),
   Uhr und Frust-Meter über alle Kapitel, Score mit Highscore in `localStorage`.
2. **Visuelle Identität:** „Behördenpapier trifft Systemdialog“. Nachtblau, Kopierpapier,
   Stempelrot (DHBW-Rot) und Baustellengelb (S21). Signatur-Effekt ist ein roter
   „ABGELEHNT“-Stempel.
3. **Schnittstellen-Vertrag** (`docs/ARCHITECTURE.md`): Dateien, Zuständigkeiten, APIs aller
   Module, Konventionen und Kapitel-Briefings. So konnten mehrere KI-Agenten parallel bauen.
4. **Multi-Agent-Build:** Recherche zu eduroam an der DHBW Stuttgart; parallel Kern
   (Spielzustand und Audio, Formular-Widgets, Anzeige-Widgets mit Effekten, Szenen),
   Integration, 5 Kapitel parallel (erst Entwurf, dann Browser-Test), Review aus vier
   Blickwinkeln (Bugs, Playtest, Codequalität, Inhalt und Sicherheit), Fixes, Abnahme.
5. **Tests:** Unit-Tests mit `node --test` für die reine Spiellogik, Browser-Tests mit
   Playwright (echte Klicks und Tastatureingaben, Screenshots).

## Bezug zum Game-Prompt-Template

Übernommen: Phaser 3 via CDN, 800×600 mit `Phaser.Scale.FIT`, Szenen `BootScene`, `GameScene`
und `GameOverScene` (plus Menü, HUD und Kapitel-Szenen), keine externen Assets (alles per
Graphics und WebAudio), Juice (Screenshake, Partikel, Tweens, Sound), Highscore in
`localStorage`, Start- und Game-Over-Screen.

Abweichung: mehrere Dateien statt einer einzigen `index.html`. Grund: Mehrere Agenten
sollten parallel arbeiten können, und für Teil 2 (Code-Review, Team-Parallelarbeit,
Refactoring) ist eine klare Dateistruktur hilfreicher. Ohne Internet lädt das Spiel Phaser
aus `vendor/phaser.min.js`.

## Weitere Prompts im Verlauf

1. *„After completing sync to github to this repo https://github.com/kargfel/eduroam“*: Die
   KI hat ein Git-Repo angelegt und das Projekt per GitHub-CLI gepusht. Die Workshop-Unterlagen
   blieben draußen, committet wurde mit der GitHub-noreply-Adresse.
2. *„Ich habe auf meinem Homeserver bereits die traefik config auf den Port 2222 gemacht und
   auch cloudflare dns published applications gemacht. Ich möchte wenn es fertig ist das Repo
   dorthin clonen und hosten. Füge dazu einen Guide und die Funktionalität dazu“*: Ergebnis sind
   ein Webserver ohne Abhängigkeiten (`server/serve.mjs`), Docker-Setup, Update-Skript,
   systemd-Dienst und der Guide `docs/DEPLOYMENT.md`. Beim Testen unter der neuen
   Content-Security-Policy fiel ein `eval` im Spielcode auf, das daraufhin ersetzt wurde.
3. *„Können wir das ganze etwas beschleunigen?“*: Hosting und Feinschliff wurden entkoppelt.
   Ein getesteter Zwischenstand ging sofort online, die große Review-Runde entfiel zugunsten
   einer kurzen Endabnahme.
