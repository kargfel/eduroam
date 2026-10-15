# Hosting auf dem Homeserver (Traefik + Cloudflare Tunnel)

Diese Anleitung bringt den eduroam-Simulator unter **https://eduroam.felixkarg.de** ins
Netz. Traefik leitet die Domain bereits auf **Port 2222** weiter, und der Cloudflare Tunnel
(„Published application“) zeigt auf Traefik. Es fehlt nur noch der Dienst auf Port 2222.

```
Browser ──HTTPS──▶ Cloudflare ──Tunnel──▶ cloudflared ──▶ Traefik ──HTTP──▶ :2222  eduroam-Simulator
```

Der Spiel-Server (`server/serve.mjs`) hat keine Abhängigkeiten und liefert **nur** die
Spieldateien aus (`index.html`, `src/`, `vendor/`). Tests, Doku, `.git` und `node_modules`
sind nicht erreichbar. Er setzt Sicherheits-Header inklusive Content-Security-Policy und
bietet unter `/healthz` einen Healthcheck.

Es gibt zwei Varianten: **A – Docker** (empfohlen) oder **B – systemd ohne Docker**.
Beide nutzen denselben Server.

---

## Voraussetzungen

- `git`
- Variante A: Docker Engine mit Compose-Plugin (Test: `docker compose version`)
- Variante B: Node.js 18 oder neuer (Test: `node --version`)
- Traefik-Route für `eduroam.felixkarg.de` auf Port 2222 und ein Cloudflare-Tunnel mit
  Published Application für diesen Hostnamen (bei dir schon eingerichtet)

---

## Variante A: Docker (empfohlen)

**1. Repo klonen**

```bash
sudo mkdir -p /opt/eduroam && sudo chown "$USER" /opt/eduroam
git clone https://github.com/kargfel/eduroam.git /opt/eduroam
cd /opt/eduroam
```

**2. Starten**

```bash
docker compose up -d --build
```

Das baut ein kleines Image (`node:24-alpine` + Spieldateien) und startet den Container
`eduroam-simulator`. Er lauscht auf Port 2222 aller Schnittstellen und startet nach einem
Reboot automatisch neu (`restart: unless-stopped`).

**3. Prüfen**

```bash
docker compose ps                          # STATUS: Up … (healthy)
curl -fsS http://127.0.0.1:2222/healthz    # → ok
curl -sI  http://127.0.0.1:2222/ | head -1 # → HTTP/1.1 200 OK
```

Danach im Browser https://eduroam.felixkarg.de öffnen.

**Optional: Port oder Bind-Adresse ändern.** Leg im Repo-Ordner eine Datei `.env` an:

```ini
EDUROAM_PORT=2222        # Host-Port (Traefik muss dorthin zeigen)
EDUROAM_BIND=0.0.0.0     # z. B. 127.0.0.1, wenn Traefik direkt auf dem Host läuft
```

Danach `docker compose up -d` ausführen. `.env` steht nicht im Repo, lokale Einstellungen
bleiben also bei Updates erhalten.

---

## Variante B: ohne Docker (systemd)

**1. Node.js installieren** (z. B. aus der Paketquelle oder von NodeSource) und das Repo
wie oben nach `/opt/eduroam` klonen. Ein `npm install` ist nicht nötig, weil der Server
keine Abhängigkeiten hat.

**2. Testlauf**

```bash
cd /opt/eduroam
node server/serve.mjs      # beendet mit Strg+C; alternativ: npm start
```

**3. Als Dienst einrichten**

```bash
command -v node                                   # Pfad prüfen, z. B. /usr/bin/node
sudo cp deploy/eduroam-simulator.service /etc/systemd/system/
sudoedit /etc/systemd/system/eduroam-simulator.service   # nur falls Pfade abweichen
sudo systemctl daemon-reload
sudo systemctl enable --now eduroam-simulator
systemctl status eduroam-simulator
journalctl -u eduroam-simulator -f                # Logs
```

Der Dienst läuft mit einem flüchtigen Benutzer ohne Schreibrechte (`DynamicUser`,
`ProtectSystem=strict`).

---

## Traefik abgleichen

Die Route existiert schon. Wichtig ist nur, dass die Service-URL zum Ort von Traefik passt.
Ein vollständiges Beispiel steht in `deploy/traefik-dynamic.example.yml`.

| Traefik läuft … | Service-URL |
|---|---|
| direkt auf dem Homeserver | `http://127.0.0.1:2222` |
| im Docker auf demselben Host | `http://host.docker.internal:2222`, beim Traefik-Container zusätzlich `extra_hosts: ["host.docker.internal:host-gateway"]` |
| auf einem anderen Rechner | `http://<IP-des-Homeservers>:2222` |

Läuft auf dem Host eine Firewall (z. B. `ufw`), muss sie Verbindungen aus dem
Docker-Netz bzw. von Traefik auf Port 2222 erlauben. Optional kann Traefik `/healthz`
als Healthcheck nutzen.

Nutzt Traefik den Docker-Provider statt der Datei-Konfiguration, kommen diese Labels
(plus das Traefik-Netzwerk) an den Dienst in `docker-compose.yml`:

```yaml
    networks:
      - proxy
    labels:
      - traefik.enable=true
      - traefik.http.routers.eduroam.rule=Host(`eduroam.felixkarg.de`)
      - traefik.http.routers.eduroam.entrypoints=web
      - traefik.http.services.eduroam.loadbalancer.server.port=2222
# …und auf oberster Ebene:
networks:
  proxy:
    external: true
```

---

## Cloudflare Tunnel (Published application)

- **Hostname** `eduroam.felixkarg.de` → **Service** = Traefik (z. B. `http://traefik:80`
  oder `http://localhost:80`, je nachdem, wo `cloudflared` läuft).
- **HTTP Host Header** nicht überschreiben (oder auf `eduroam.felixkarg.de` setzen),
  sonst greift die `Host(…)`-Regel in Traefik nicht.
- Spricht der Tunnel Traefik per HTTPS mit eigenem Zertifikat an: unter *TLS* „No TLS
  Verify“ aktivieren oder den passenden „Origin Server Name“ eintragen.
- Zum Eingrenzen von Fehlern kann der Service vorübergehend direkt auf
  `http://localhost:2222` zeigen und damit Traefik umgehen.
- **Caching:** HTML und JavaScript kommen mit `Cache-Control: no-cache`, Updates sind
  also sofort sichtbar. `vendor/` (Phaser) darf 7 Tage gecacht werden.
- Optional: Mit Cloudflare Access lässt sich das Spiel z. B. nur für den Kurs freigeben.

---

## Updates

```bash
cd /opt/eduroam
./deploy/update.sh            # Docker
./deploy/update.sh systemd    # ohne Docker
```

Das Skript holt den neuesten Stand (`git pull --ff-only`), baut bzw. startet nur bei
Änderungen neu (`FORCE=1` erzwingt den Neubau) und prüft danach `/healthz`.

**Automatisch (optional)** per Cron, z. B. alle 15 Minuten. Der Cron-Benutzer braucht
Docker-Rechte (Gruppe `docker`):

```cron
*/15 * * * * /opt/eduroam/deploy/update.sh >> /opt/eduroam/update.log 2>&1
```

Auf dem Server selbst nichts an den Dateien ändern, sonst schlägt der Fast-Forward fehl.
Einstellungen gehören in `.env`.

---

## Fehlersuche

| Symptom | Ursache | Lösung |
|---|---|---|
| Cloudflare zeigt **„502 Bad Gateway“** / „error code: 502“ | Tunnel und Traefik erreichen nichts auf Port 2222 | Auf dem Server `curl http://127.0.0.1:2222/healthz`. Läuft der Container (`docker compose ps`)? Passt die Service-URL in Traefik? Blockt die Firewall? |
| Traefik antwortet **„404 page not found“** | Router-Regel oder EntryPoint passt nicht | `Host(…)` und `entryPoints` prüfen, Host-Header im Tunnel nicht überschreiben |
| Cloudflare-Fehler **1033** | Tunnel offline | `cloudflared` neu starten, Status im Zero-Trust-Dashboard prüfen |
| Start schlägt fehl: **„address already in use“** | Port 2222 ist belegt | `sudo ss -ltnp \| grep 2222`; anderen Port in `.env` setzen und Traefik anpassen |
| Container **unhealthy** | Server startet nicht | `docker compose logs --tail=50` |
| Weißer Bildschirm | JavaScript-Fehler | Browser-Konsole (F12) öffnen; im Container `LOG_REQUESTS=1` setzen (siehe `docker-compose.yml`) |
| Nach dem Update alte Version | Browser-Cache | Hart neu laden (Strg+F5 bzw. Cmd+Shift+R); bei Phaser-Updates im Cloudflare-Dashboard „Purge Cache“ |

---

## Sicherheit und Datenschutz

- **Freigabeliste:** Öffentlich sind nur `index.html`, `src/` und `vendor/`. Versteckte
  Dateien, Path-Traversal (`..`) und Verzeichnislisten liefern 404.
- **Header:** `Content-Security-Policy` (erlaubt nur eigene Dateien, das Phaser-CDN und die
  Inline-Scripts aus `index.html` per automatisch berechnetem Hash), `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`.
- **Container:** läuft als Benutzer `node`, Dateisystem schreibgeschützt, keine Capabilities,
  `no-new-privileges`.
- **Keine Daten auf dem Server:** Highscores und Erfolge liegen nur im `localStorage` des
  Browsers. Passwörter im Spiel sind fiktiv und verlassen den Browser nie.
- **Phaser-CDN:** `index.html` lädt Phaser von jsDelivr, dabei geht die IP der Besucher an
  jsDelivr. Wer das nicht möchte, entfernt in `index.html` die Zeile mit
  `cdn.jsdelivr.net`. Dann greift automatisch die lokale Kopie in `vendor/`, die CSP passt
  weiterhin.
- **Keine Portfreigabe nötig:** Der Tunnel baut die Verbindung von innen auf. Port 2222
  sollte im Router **nicht** ins Internet freigegeben werden.

---

## Lokal testen

```bash
npm start                      # http://localhost:2222
PORT=8080 npm start            # anderer Port
npm install && npm test        # alle Tests, inkl. Server-Test (tests/e2e/server.mjs)
```
