#!/usr/bin/env bash
# update.sh – Holt den neuesten Stand aus GitHub und (re)startet das Spiel.
#
#   ./deploy/update.sh            Docker-Variante (Standard)
#   ./deploy/update.sh systemd    Variante ohne Docker (systemd-Dienst eduroam-simulator)
#
# Baut nur neu, wenn git pull etwas geändert hat (FORCE=1 erzwingt den Neubau).
# Bricht ab, wenn lokale Änderungen einen Fast-Forward verhindern.
set -euo pipefail

MODE="${1:-docker}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_ATTEMPTS=20

cd "$REPO_DIR"

# Gleiche Einstellungen wie docker compose (EDUROAM_PORT, EDUROAM_BIND aus .env)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
PORT="${EDUROAM_PORT:-2222}"
CHECK_HOST="${EDUROAM_BIND:-0.0.0.0}"
[ "$CHECK_HOST" = "0.0.0.0" ] && CHECK_HOST="127.0.0.1"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "✗ Weder 'docker compose' noch 'docker-compose' gefunden." >&2
    exit 1
  fi
}

echo "→ Hole Updates in $REPO_DIR"
BEFORE="$(git rev-parse HEAD)"
git pull --ff-only
AFTER="$(git rev-parse HEAD)"
HAS_CHANGES=0
if [ "$BEFORE" != "$AFTER" ] || [ "${FORCE:-0}" = "1" ]; then
  HAS_CHANGES=1
  echo "→ Neuer Stand: $(git log -1 --format='%h %s')"
else
  echo "→ Keine Änderungen."
fi

case "$MODE" in
  docker)
    if [ "$HAS_CHANGES" = "1" ]; then
      echo "→ Baue Image neu und starte den Container"
      compose up -d --build --remove-orphans
    else
      compose up -d
    fi
    ;;
  systemd)
    if [ "$HAS_CHANGES" = "1" ]; then
      echo "→ Starte den systemd-Dienst neu"
      sudo systemctl restart eduroam-simulator
    else
      sudo systemctl start eduroam-simulator
    fi
    ;;
  *)
    echo "Unbekannter Modus: $MODE (erlaubt: docker | systemd)" >&2
    exit 2
    ;;
esac

echo "→ Prüfe http://${CHECK_HOST}:${PORT}/healthz"
for _ in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if curl -fsS "http://${CHECK_HOST}:${PORT}/healthz" >/dev/null 2>&1; then
    echo "✓ Spiel läuft auf Port ${PORT}"
    exit 0
  fi
  sleep 1
done
echo "✗ Healthcheck fehlgeschlagen. Logs: docker compose logs --tail=50  bzw.  journalctl -u eduroam-simulator -n 50" >&2
exit 1
