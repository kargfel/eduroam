# Hosting-Image für den eduroam-Simulator: Node-Webserver ohne Abhängigkeiten.
# Enthält nur Spieldateien und Server – keine Tests, keine Doku, kein .git.
# Bauen/Starten: docker compose up -d --build   (siehe README.md, „Selbst hosten“)
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=2222 \
    HOST=0.0.0.0

WORKDIR /app

# Dateien gehören root und sind nur lesbar – der Server läuft als Benutzer "node".
COPY index.html ./
COPY src/ ./src/
COPY vendor/ ./vendor/
COPY server/ ./server/

USER node
EXPOSE 2222

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 2222) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/serve.mjs"]
