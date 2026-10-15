/**
 * textures.js – Erzeugt alle gemeinsamen Texturen des Spiels zur Laufzeit.
 *
 * Keine externen Assets: Jede Textur wird mit einem Phaser-Graphics-Objekt gezeichnet,
 * per generateTexture() in eine Canvas-Textur gerendert und das Graphics-Objekt danach
 * zerstört. Aussparungen (Schlüsselloch, Häkchen im Kreis, Ausrufezeichen …) stanzt ein
 * zweiter Schritt mit 'destination-out' direkt in die Canvas – so sind die Symbole echte
 * Löcher und bleiben mit setTint() frei einfärbbar.
 *
 * Konvention (siehe docs/ARCHITECTURE.md 5.11): Symbole weiß auf transparent,
 * nur die Frust-Gesichter face-0 … face-4 sind farbig.
 *
 * Global: Textures. Abhängigkeiten: Phaser (zur Laufzeit), CONFIG (Gesichtsfarben).
 */

const Textures = (() => {
  const WHITE = 0xffffff;
  const TAU = Math.PI * 2;

  /** Leere Bögen im WLAN-Fächer bleiben schwach sichtbar (wie bei Android). */
  const WIFI_EMPTY_ALPHA = 0.3;
  /** Die vier Bänder des WLAN-Fächers: [innen, außen] als Anteil des Außenradius. */
  const WIFI_BANDS = [[0, 0.27], [0.37, 0.53], [0.63, 0.79], [0.89, 1]];
  /** Öffnungswinkel des Fächers (90°, Spitze unten, Bögen nach oben). */
  const WIFI_FROM = -Math.PI * 0.75;
  const WIFI_TO = -Math.PI * 0.25;

  /** Frust-Gesichter: gelassen (grün) → explodierend (dunkelrot). */
  const FACE_FEATURE = 0x2a1a10;
  const FACE_STYLES = [
    { fill: 0x2fb344, rim: 0x1d7a2c }, // 0 – gelassen
    { fill: 0xf7c600, rim: 0xb38f00 }, // 1 – geht noch
    { fill: 0xf5850a, rim: 0xb05c00 }, // 2 – genervt
    { fill: CONFIG.COLORS.DHBW_RED, rim: 0x99000f }, // 3 – wütend
    { fill: 0x9b0712, rim: 0x5c0008 }, // 4 – explodiert
  ];

  // ---------------------------------------------------------------------------
  // Zeichenhelfer (Graphics)
  // ---------------------------------------------------------------------------

  /** Linie mit runden Enden (Graphics kennt keine lineCap-Option). */
  function roundLine(g, x1, y1, x2, y2, width, color = WHITE, alpha = 1) {
    g.lineStyle(width, color, alpha);
    g.lineBetween(x1, y1, x2, y2);
    g.fillStyle(color, alpha);
    g.fillCircle(x1, y1, width / 2);
    g.fillCircle(x2, y2, width / 2);
  }

  /** Linienzug mit runden Enden und Gelenken. */
  function roundPolyline(g, points, width, color = WHITE, alpha = 1) {
    for (let i = 1; i < points.length; i++) {
      roundLine(g, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], width, color, alpha);
    }
  }

  /** Bogen als Linie (Winkel im Bogenmaß, im Uhrzeigersinn). */
  function strokeArc(g, cx, cy, radius, from, to, width, color = WHITE, alpha = 1) {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.arc(cx, cy, radius, from, to, false);
    g.strokePath();
  }

  /**
   * Punkte eines Polygons mit abgerundeten Ecken (quadratische Bézierkurve je Ecke).
   * @param {number[][]} corners Eckpunkte [[x, y], …] im Uhrzeigersinn
   * @param {number} radius Rundung in px
   * @param {number} [segments=6] Stützpunkte je Ecke
   */
  function roundedPolygon(corners, radius, segments = 6) {
    const points = [];
    corners.forEach((corner, i) => {
      const prev = corners[(i - 1 + corners.length) % corners.length];
      const next = corners[(i + 1) % corners.length];
      const toPrev = Math.hypot(prev[0] - corner[0], prev[1] - corner[1]);
      const toNext = Math.hypot(next[0] - corner[0], next[1] - corner[1]);
      const d = Math.min(radius, toPrev / 2, toNext / 2);
      const a = [corner[0] + ((prev[0] - corner[0]) / toPrev) * d, corner[1] + ((prev[1] - corner[1]) / toPrev) * d];
      const b = [corner[0] + ((next[0] - corner[0]) / toNext) * d, corner[1] + ((next[1] - corner[1]) / toNext) * d];
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const u = 1 - t;
        points.push({
          x: u * u * a[0] + 2 * u * t * corner[0] + t * t * b[0],
          y: u * u * a[1] + 2 * u * t * corner[1] + t * t * b[1],
        });
      }
    });
    return points;
  }

  /**
   * Zeichnet einen WLAN-Fächer (vier Bänder, Spitze unten) in ein Graphics-Objekt.
   * Öffentlich, damit z. B. das Phone-Widget das Symbol in beliebiger Farbe zeichnen
   * kann (setTint wirkt im Canvas-Renderer nicht).
   * @param {Phaser.GameObjects.Graphics} g
   * @param {number} cx Spitze x
   * @param {number} cy Spitze y
   * @param {number} radius Außenradius in px
   * @param {number} level 0–4 gefüllte Bänder (von innen)
   * @param {number} [color=0xffffff]
   * @param {number} [emptyAlpha=0.3] Deckkraft der leeren Bänder
   */
  function drawWifiFan(g, cx, cy, radius, level, color = WHITE, emptyAlpha = WIFI_EMPTY_ALPHA) {
    const filled = Math.max(0, Math.min(WIFI_BANDS.length, Math.round(level || 0)));
    WIFI_BANDS.forEach(([inner, outer], index) => {
      const alpha = index < filled ? 1 : emptyAlpha;
      if (alpha <= 0) return;
      g.fillStyle(color, alpha);
      g.beginPath();
      if (inner === 0) {
        g.moveTo(cx, cy);
        g.arc(cx, cy, outer * radius, WIFI_FROM, WIFI_TO, false);
      } else {
        g.arc(cx, cy, outer * radius, WIFI_FROM, WIFI_TO, false);
        g.arc(cx, cy, inner * radius, WIFI_TO, WIFI_FROM, true);
      }
      g.closePath();
      g.fillPath();
    });
  }

  // ---------------------------------------------------------------------------
  // Stanz-Helfer (Canvas 2D, globalCompositeOperation = 'destination-out')
  // ---------------------------------------------------------------------------

  function punchCircle(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  function punchStroke(ctx, points, width) {
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  function punchRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Frust-Gesichter
  // ---------------------------------------------------------------------------

  /** Dampfwölkchen (Stufe 4): drei überlappende Kreise mit zartem Rand. */
  function drawSteam(g, x, y, mirror) {
    const dir = mirror ? -1 : 1;
    const puffs = [[0, 0, 2.7], [dir * 2.6, 2.4, 2.1], [dir * -1.6, 3.4, 1.8]];
    g.fillStyle(0xd5dbe3, 1);
    puffs.forEach(([dx, dy, r]) => g.fillCircle(x + dx, y + dy, r + 0.7));
    g.fillStyle(WHITE, 1);
    puffs.forEach(([dx, dy, r]) => g.fillCircle(x + dx, y + dy, r));
  }

  function drawFace(g, level) {
    const style = FACE_STYLES[level];
    const exploding = level === 4;
    const cx = 14;
    const cy = exploding ? 15.6 : 14.5;
    const r = exploding ? 10.6 : 11.8;

    if (exploding) {
      drawSteam(g, 4.6, 4.2, false);
      drawSteam(g, 23.4, 4.2, true);
    }

    // Kopf mit dunklerem Rand und dezentem Glanzlicht
    g.fillStyle(style.rim, 1);
    g.fillCircle(cx, cy, r);
    g.fillStyle(style.fill, 1);
    g.fillCircle(cx, cy, r - 1.2);
    g.fillStyle(WHITE, 0.24);
    g.fillEllipse(cx - r * 0.3, cy - r * 0.52, r * 0.9, r * 0.4);

    const ink = exploding ? 0xffe8e8 : FACE_FEATURE;
    switch (level) {
      case 0: {
        // gelassen: geschlossene, zufriedene Augen, Lächeln, rosige Wangen
        strokeArc(g, cx - 4.2, cy - 0.6, 2.3, Math.PI * 1.1, Math.PI * 1.9, 1.7, ink);
        strokeArc(g, cx + 4.2, cy - 0.6, 2.3, Math.PI * 1.1, Math.PI * 1.9, 1.7, ink);
        g.fillStyle(0xffffff, 0.22);
        g.fillCircle(cx - 7, cy + 3.2, 1.9);
        g.fillCircle(cx + 7, cy + 3.2, 1.9);
        strokeArc(g, cx, cy + 0.6, 5.4, Math.PI * 0.18, Math.PI * 0.82, 1.8, ink);
        break;
      }
      case 1: {
        // geht noch: offene Augen, gerader Mund
        g.fillStyle(ink, 1);
        g.fillCircle(cx - 4, cy - 1.8, 1.7);
        g.fillCircle(cx + 4, cy - 1.8, 1.7);
        roundLine(g, cx - 4.2, cy + 5, cx + 4.2, cy + 5, 1.8, ink);
        break;
      }
      case 2: {
        // genervt: hochgezogene Brauen, leicht hängender Mund, Schweißtropfen
        g.fillStyle(ink, 1);
        g.fillCircle(cx - 4, cy - 1.2, 1.7);
        g.fillCircle(cx + 4, cy - 1.2, 1.7);
        roundLine(g, cx - 6.4, cy - 4.6, cx - 2.2, cy - 5.6, 1.6, ink);
        roundLine(g, cx + 2.2, cy - 5.6, cx + 6.4, cy - 4.6, 1.6, ink);
        strokeArc(g, cx, cy + 10.4, 5, Math.PI * 1.27, Math.PI * 1.73, 1.8, ink);
        g.fillStyle(0x8fd3ff, 1);
        g.fillCircle(cx + 8.3, cy - 2.4, 1.6);
        g.fillTriangle(cx + 6.8, cy - 2.9, cx + 9.8, cy - 2.9, cx + 8.3, cy - 6.4);
        break;
      }
      case 3: {
        // wütend: V-Brauen, starrer Blick, tiefer Mundwinkel
        roundLine(g, cx - 7, cy - 6.4, cx - 2, cy - 3.6, 2.1, ink);
        roundLine(g, cx + 2, cy - 3.6, cx + 7, cy - 6.4, 2.1, ink);
        g.fillStyle(ink, 1);
        g.fillCircle(cx - 3.9, cy - 0.6, 1.8);
        g.fillCircle(cx + 3.9, cy - 0.6, 1.8);
        strokeArc(g, cx, cy + 10.6, 5.6, Math.PI * 1.2, Math.PI * 1.8, 2.1, ink);
        break;
      }
      default: {
        // explodiert: zusammengekniffene Augen (> <), offener Schrei-Mund mit Zähnen
        roundPolyline(g, [[cx - 7, cy - 4.6], [cx - 3, cy - 2.6], [cx - 7, cy - 0.6]], 1.8, ink);
        roundPolyline(g, [[cx + 7, cy - 4.6], [cx + 3, cy - 2.6], [cx + 7, cy - 0.6]], 1.8, ink);
        g.fillStyle(0x2a0306, 1);
        g.fillEllipse(cx, cy + 4.9, 9.4, 6.2);
        g.fillStyle(0xfff4f4, 1);
        g.fillRect(cx - 3.4, cy + 2.1, 6.8, 1.5);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Definitionen aller Texturen (Schlüssel, Größe, Zeichnung, optionale Stanzung)
  // ---------------------------------------------------------------------------

  /** Kreis mit ausgestanztem Symbol (für Dialog-Icons 32×32). */
  function circleIcon(key, punch) {
    return {
      key,
      width: 32,
      height: 32,
      draw(g) {
        g.fillStyle(WHITE, 1);
        g.fillCircle(16, 16, 14.5);
      },
      post: punch,
    };
  }

  const DEFINITIONS = [
    {
      key: 'px',
      width: 4,
      height: 4,
      draw(g) {
        g.fillStyle(WHITE, 1);
        g.fillRect(0, 0, 4, 4);
      },
    },
    {
      key: 'dot',
      width: 8,
      height: 8,
      draw(g) {
        // weicher Kreis: übereinanderliegende Ringe mit steigender Deckkraft
        [[4, 0.2], [3.5, 0.32], [3, 0.5], [2.4, 0.75], [1.8, 1]].forEach(([r, a]) => {
          g.fillStyle(WHITE, a);
          g.fillCircle(4, 4, r);
        });
      },
    },
    {
      key: 'confetti',
      width: 8,
      height: 4,
      draw(g) {
        g.fillStyle(WHITE, 1);
        g.fillRect(0, 0, 8, 4);
      },
    },
    ...[0, 1, 2, 3, 4].map((level) => ({
      key: `icon-wifi-${level}`,
      width: 32,
      height: 32,
      draw(g) {
        drawWifiFan(g, 16, 26.5, 21, level, WHITE, WIFI_EMPTY_ALPHA);
      },
    })),

    // --- 24×24: Bedien-Symbole ---
    {
      key: 'icon-lock',
      width: 24,
      height: 24,
      draw(g) {
        g.lineStyle(2.6, WHITE, 1);
        g.beginPath();
        g.moveTo(7.6, 11.5);
        g.lineTo(7.6, 8.2);
        g.arc(12, 8.2, 4.4, Math.PI, 0, false);
        g.lineTo(16.4, 11.5);
        g.strokePath();
        g.fillStyle(WHITE, 1);
        g.fillRoundedRect(4.5, 10.5, 15, 11, 2.6);
      },
      post(ctx) {
        punchCircle(ctx, 12, 15.2, 1.8);
        punchRoundRect(ctx, 11.2, 15.4, 1.6, 3.6, 0.8);
      },
    },
    {
      key: 'icon-gear',
      width: 24,
      height: 24,
      draw(g) {
        const teeth = 8;
        const half = Math.PI / teeth;
        const outer = 10.6;
        const inner = 8.1;
        const points = [];
        for (let i = 0; i < teeth; i++) {
          const base = (i / teeth) * TAU - Math.PI / 2;
          [[-0.62, inner], [-0.36, outer], [0.36, outer], [0.62, inner], [1, inner * 0.985]].forEach(([k, r]) => {
            points.push({ x: 12 + Math.cos(base + k * half) * r, y: 12 + Math.sin(base + k * half) * r });
          });
        }
        g.fillStyle(WHITE, 1);
        g.fillPoints(points, true, true);
      },
      post(ctx) {
        punchCircle(ctx, 12, 12, 3.4);
      },
    },
    {
      key: 'icon-sound-on',
      width: 24,
      height: 24,
      draw(g) {
        g.fillStyle(WHITE, 1);
        g.fillPoints(roundedPolygon([[3, 9], [7.4, 9], [12, 4.6], [12, 19.4], [7.4, 15], [3, 15]], 1.2), true, true);
        strokeArc(g, 12.4, 12, 4.4, -0.85, 0.85, 2, WHITE);
        strokeArc(g, 12.4, 12, 8.2, -0.9, 0.9, 2, WHITE);
      },
    },
    {
      key: 'icon-sound-off',
      width: 24,
      height: 24,
      draw(g) {
        g.fillStyle(WHITE, 1);
        g.fillPoints(roundedPolygon([[3, 9], [7.4, 9], [12, 4.6], [12, 19.4], [7.4, 15], [3, 15]], 1.2), true, true);
        roundLine(g, 15.6, 9.2, 21.2, 14.8, 2.2);
        roundLine(g, 21.2, 9.2, 15.6, 14.8, 2.2);
      },
    },
    {
      key: 'icon-pause',
      width: 24,
      height: 24,
      draw(g) {
        g.fillStyle(WHITE, 1);
        g.fillRoundedRect(5.6, 4.6, 4.6, 14.8, 1.4);
        g.fillRoundedRect(13.8, 4.6, 4.6, 14.8, 1.4);
      },
    },
    {
      key: 'icon-close',
      width: 24,
      height: 24,
      draw(g) {
        roundLine(g, 6.4, 6.4, 17.6, 17.6, 2.6);
        roundLine(g, 17.6, 6.4, 6.4, 17.6, 2.6);
      },
    },
    {
      key: 'icon-back',
      width: 24,
      height: 24,
      draw(g) {
        roundLine(g, 5.4, 12, 19, 12, 2.4);
        roundPolyline(g, [[11.4, 6], [5.4, 12], [11.4, 18]], 2.4);
      },
    },

    // --- 32×32: Dialog-Symbole ---
    {
      key: 'icon-warning',
      width: 32,
      height: 32,
      draw(g) {
        g.fillStyle(WHITE, 1);
        g.fillPoints(roundedPolygon([[16, 3], [30.4, 28.4], [1.6, 28.4]], 3.4, 8), true, true);
      },
      post(ctx) {
        punchRoundRect(ctx, 14.5, 10.6, 3, 10.2, 1.5);
        punchCircle(ctx, 16, 24.2, 1.85);
      },
    },
    circleIcon('icon-error', (ctx) => {
      punchStroke(ctx, [[11, 11], [21, 21]], 3.2);
      punchStroke(ctx, [[21, 11], [11, 21]], 3.2);
    }),
    circleIcon('icon-info', (ctx) => {
      punchCircle(ctx, 16, 9.6, 2.1);
      punchRoundRect(ctx, 14.5, 13.2, 3, 10.6, 1.5);
    }),
    circleIcon('icon-success', (ctx) => {
      punchStroke(ctx, [[9.6, 16.6], [14, 21], [22.6, 11.6]], 3.3);
    }),
    circleIcon('icon-question', (ctx) => {
      ctx.lineWidth = 3.1;
      ctx.beginPath();
      ctx.arc(16, 12.4, 4.6, Math.PI * 1.02, Math.PI * 2.28, false);
      ctx.lineTo(16, 17.4);
      ctx.lineTo(16, 18.6);
      ctx.stroke();
      punchCircle(ctx, 16, 23.8, 1.95);
    }),

    // --- 32×32: Gegenstände ---
    {
      key: 'icon-cert',
      width: 32,
      height: 32,
      draw(g) {
        g.fillStyle(WHITE, 1);
        g.fillRoundedRect(2.5, 4, 27, 19.5, 2.6);
      },
      post(ctx) {
        // Textzeilen
        punchStroke(ctx, [[7, 9.4], [22, 9.4]], 1.9);
        punchStroke(ctx, [[7, 13.4], [17, 13.4]], 1.9);
        punchStroke(ctx, [[7, 17.4], [13.4, 17.4]], 1.9);
        // Platz für das Siegel freistanzen, dann Siegel und Bänder wieder einzeichnen
        punchCircle(ctx, 23.4, 21, 7);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(19.6, 23.2);
        ctx.lineTo(18.6, 30.6);
        ctx.lineTo(21.4, 29);
        ctx.lineTo(23.2, 31);
        ctx.lineTo(23.6, 24.4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(27.2, 23.2);
        ctx.lineTo(28.2, 30.6);
        ctx.lineTo(25.4, 29);
        ctx.lineTo(23.6, 31);
        ctx.lineTo(23.2, 24.4);
        ctx.closePath();
        ctx.fill();
        punchCircle(ctx, 23.4, 21, 5.4); // im Modus 'source-over' wird gemalt statt gestanzt
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(23.4, 21, 2.7, 0, TAU);
        ctx.stroke();
      },
    },
    {
      key: 'icon-router',
      width: 32,
      height: 32,
      draw(g) {
        roundLine(g, 9, 17.5, 7, 5.6, 2.4);
        roundLine(g, 23, 17.5, 25, 5.6, 2.4);
        strokeArc(g, 16, 14.6, 3.4, -Math.PI * 0.78, -Math.PI * 0.22, 1.8, WHITE);
        strokeArc(g, 16, 14.6, 6.6, -Math.PI * 0.76, -Math.PI * 0.24, 1.8, WHITE);
        g.fillStyle(WHITE, 1);
        g.fillRoundedRect(2.5, 17, 27, 10, 3);
        g.fillRect(6, 26.5, 3.4, 2.6);
        g.fillRect(22.6, 26.5, 3.4, 2.6);
      },
      post(ctx) {
        punchCircle(ctx, 7.6, 22, 1.45);
        punchCircle(ctx, 12, 22, 1.45);
        punchCircle(ctx, 16.4, 22, 1.45);
        punchRoundRect(ctx, 20.4, 21.1, 6, 1.8, 0.9);
      },
    },
    {
      key: 'icon-battery',
      width: 32,
      height: 32,
      draw(g) {
        g.lineStyle(2.2, WHITE, 1);
        g.strokeRoundedRect(2.6, 9.6, 24, 12.8, 3);
        g.fillStyle(WHITE, 1);
        g.fillRoundedRect(27.4, 13.4, 2.8, 5.2, 1.2);
        g.fillRoundedRect(5.4, 12.4, 13.4, 7.2, 1.6);
      },
    },

    // --- 28×28: Frust-Gesichter (farbig) ---
    ...[0, 1, 2, 3, 4].map((level) => ({
      key: `face-${level}`,
      width: 28,
      height: 28,
      draw(g) {
        drawFace(g, level);
      },
    })),
  ];

  /**
   * Zeichnet eine Definition, rendert sie in eine Textur und zerstört das Graphics-Objekt.
   * @returns {boolean} true, wenn die Textur danach existiert
   */
  function bake(scene, def) {
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    try {
      def.draw(graphics);
      graphics.generateTexture(def.key, def.width, def.height);
    } finally {
      graphics.destroy();
    }
    if (def.post && scene.textures.exists(def.key)) {
      const texture = scene.textures.get(def.key);
      const ctx = typeof texture.getContext === 'function' ? texture.getContext() : null;
      if (ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        def.post(ctx);
        ctx.restore();
        texture.refresh();
      }
    }
    return scene.textures.exists(def.key);
  }

  return {
    /** Alle Schlüssel, die generateAll() garantiert (Reihenfolge wie in der Galerie). */
    KEYS: Object.freeze(DEFINITIONS.map((def) => def.key)),

    /** Sollgröße je Schlüssel, z. B. SIZES['icon-lock'] → { width: 24, height: 24 }. */
    SIZES: Object.freeze(
      Object.fromEntries(DEFINITIONS.map((def) => [def.key, Object.freeze({ width: def.width, height: def.height })]))
    ),

    /** Deckkraft leerer WLAN-Bänder (für eigene Zeichnungen im gleichen Stil). */
    WIFI_EMPTY_ALPHA,

    /**
     * Erzeugt alle gemeinsamen Texturen. Idempotent: vorhandene Schlüssel bleiben unangetastet.
     * Texturen gehören dem Spiel (nicht der Szene) – ein Aufruf in der BootScene genügt.
     * @param {Phaser.Scene} scene
     * @returns {string[]} neu erzeugte Schlüssel
     */
    generateAll(scene) {
      if (!scene || !scene.textures || !scene.make) return [];
      const created = [];
      DEFINITIONS.forEach((def) => {
        if (scene.textures.exists(def.key)) return;
        if (bake(scene, def)) created.push(def.key);
      });
      return created;
    },

    /**
     * Liefert den Schlüssel einer eingefärbten Kopie (z. B. 'icon-lock~5f6368') und erzeugt
     * sie bei Bedarf einmalig. Wirkt in beiden Renderern – setTint() dagegen nur in WebGL.
     * Gedacht für die weißen Symbole (nicht für face-*).
     * @param {Phaser.Scene} scene
     * @param {string} key vorhandener Texturschlüssel
     * @param {number} color 0xRRGGBB
     * @returns {string} Schlüssel der eingefärbten Textur (bzw. key, falls die Quelle fehlt)
     */
    tinted(scene, key, color) {
      const hex = (color >>> 0).toString(16).padStart(6, '0').slice(-6);
      const tintedKey = `${key}~${hex}`;
      if (scene.textures.exists(tintedKey)) return tintedKey;
      if (!scene.textures.exists(key)) this.generateAll(scene);
      if (!scene.textures.exists(key)) return key;
      const source = scene.textures.get(key).getSourceImage();
      const texture = scene.textures.createCanvas(tintedKey, source.width, source.height);
      const ctx = texture.getContext();
      ctx.drawImage(source, 0, 0);
      ctx.globalCompositeOperation = 'source-in'; // Deckkraft behalten, Farbe ersetzen
      ctx.fillStyle = `#${hex}`;
      ctx.fillRect(0, 0, source.width, source.height);
      texture.refresh();
      return tintedKey;
    },

    drawWifiFan,
  };
})();
