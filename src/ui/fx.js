/**
 * fx.js – „Juice“-Effekte: Wackeln, Blitz, Partikel, Konfetti, Schwebetext, Puls, Glitch,
 * Schreibmaschine und der Signatur-Effekt des Spiels: der rote Gummistempel (FX.stamp).
 *
 * Regeln (docs/ARCHITECTURE.md 5.10):
 * - Alle Effekte liegen auf CONFIG.DEPTH.FX und räumen sich selbst auf (Objekte, Tweens,
 *   Timer). Zeit läuft nur über die Szene (Tweens, scene.time, Update-Event).
 * - Bildschirm-Effekte (flash, stamp, glitch, confetti) haften an der Kamera
 *   (scrollFactor 0, Koordinaten = Bildschirm). burst und floatText arbeiten in
 *   Weltkoordinaten; mit der Option `fixed: true` haften auch sie am Bildschirm.
 * - Visueller Zufall (Tintenstruktur, Konfetti-Drehung, Glitch-Streifen) kommt aus einem
 *   lokalen, deterministischen Generator. So bleibt die RNG-Sequenz der Spiellogik
 *   unberührt und Tests mit ?seed= sind reproduzierbar.
 * - Klänge nur über UI.sound().
 *
 * Global: FX. Abhängigkeiten: Phaser, CONFIG, UI (zur Laufzeit: UI.text, UI.sound),
 * Textures (optional, zur Laufzeit: erzeugt fehlende Partikel-Texturen).
 */

const FX = (() => {
  /** Gestaltung und Ablauf des Stempels (Zeiten in ms, Maße relativ zur Schriftgröße). */
  const STAMP = {
    RESOLUTION: 2,            // Textur doppelt aufgelöst: scharf auch in 1,8-facher Größe
    START_SCALE: 1.8,         // fällt aus dieser Größe ein
    DROP_MS: 140,             // Einfallzeit
    DROP_EASE: 'Back.easeOut',
    DROP_EASE_PARAMS: [1.3],  // leichtes Nachfedern = Gummi drückt sich ins Papier
    FADE_IN_MS: 60,
    FADE_OUT_MS: 380,
    ANGLE_JITTER: 1.6,        // ± Grad: kein Abdruck sitzt exakt gleich
    SHAKE: { duration: 150, intensity: 0.009 },
    INK_ALPHA: 0.94,          // Tinte deckt fast, Untergrund schimmert minimal durch
    LETTER_SPACING: 0.05,
    LINE_GAP: 0.28,
    PAD_X: 0.42,
    PAD_Y: 0.34,
    OUTER_LINE: 0.1,
    LINE_GAP_FRAME: 0.075,
    INNER_LINE: 0.045,
    CORNER: 0.12,
    MARGIN: 0.32,             // Rand der Textur für Schatten und Tintenspritzer
    SCREEN_SHARE: 0.94,       // maximal so viel der Bildschirmbreite (gedreht)
    MIN_SIZE: 14,
    SPECKS: 12,               // Tintenspritzer beim Aufprall
    GHOST_MS: 260,            // Druckwelle beim Aufprall
    CACHE_LIMIT: 12,          // gleichzeitig gehaltene Stempeltexturen
  };

  const GLITCH = { STEP_MS: 45, BARS: 9, COLORS: [0x00e5ff, 0xe2001a, 0xffffff, 0x091a33] };

  const CONFETTI = {
    COLORS: [0xe2001a, 0xf5c400, 0x1a73e8, 0x1e8e3e, 0xffffff, 0xfff176],
    GRAVITY: 760,
    DRAG: 1.7,                // Luftwiderstand (1/s) – Papier segelt statt zu fallen
    SPEED: { min: 260, max: 640 },
    LIFESPAN: { min: 2000, max: 2900 },
  };

  // ---------------------------------------------------------------------------
  // Hilfen
  // ---------------------------------------------------------------------------

  /** Deterministischer Zufallsgenerator (mulberry32) – nur für Optik, nie für Logik. */
  function makeRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** FNV-1a-Hash eines Strings (Texturschlüssel, Tinten-Seed). */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  const visualRandom = makeRandom(0x5eed2026);
  const between = (min, max) => min + visualRandom() * (max - min);

  /** Szene kann Objekte aufnehmen (auch während create(), nicht nach shutdown). */
  function isAlive(scene) {
    if (!scene || !scene.sys || !scene.add || !scene.sys.settings) return false;
    const status = scene.sys.settings.status;
    return status !== Phaser.Scenes.SHUTDOWN && status !== Phaser.Scenes.DESTROYED;
  }

  /** Schwebetexte je Szene und Ankerpunkt (zum Stapeln gleichzeitiger Texte). */
  const floatAnchors = new WeakMap();
  /** Liegende Stempel je Szene (Ecken in Bildschirmkoordinaten) – Schwebetexte weichen aus. */
  const activeStamps = new WeakMap();
  const FLOAT_STAMP_MARGIN = 8;
  const FLOAT_STAMP_RISE = 16; // kurzer Aufstieg neben einem Stempel

  /** Senkrechte Ausdehnung eines konvexen Polygons an Stelle x (oder null). */
  function verticalSpanAt(corners, x) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      if ((x < Math.min(a.x, b.x)) || (x > Math.max(a.x, b.x)) || a.x === b.x) continue;
      const y = a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    return min <= max ? { min, max } : null;
  }

  /**
   * Prüft, ob ein Schwebetext (Mitte sx/sy, Bildschirm, inklusive Aufstiegsweg) einen
   * liegenden Stempel überdecken würde, und liefert dann eine freie Startposition auf der
   * Seite, die der Aufrufer gewählt hat (Anker unter der Stempelmitte → darunter, sonst
   * darüber). Der Aufstieg wird dabei verkürzt, damit der Text nicht hineinwandert.
   * @returns {{y:number, direction:number, rise:number}|null} direction = Stapelrichtung
   */
  function stampClearance(scene, sx, sy, width, height, rise, viewHeight) {
    const stamps = activeStamps.get(scene);
    if (!stamps || stamps.size === 0) return null;
    let isOverlapping = false;
    let top = Infinity;
    let bottom = -Infinity;
    let centerY = 0;
    stamps.forEach((stamp) => {
      let isTouched = false;
      let stampTop = Infinity;
      let stampBottom = -Infinity;
      for (let i = 0; i <= 8; i++) {
        const span = verticalSpanAt(stamp.corners, sx - width / 2 + (width * i) / 8);
        if (!span) continue;
        stampTop = Math.min(stampTop, span.min);
        stampBottom = Math.max(stampBottom, span.max);
        const isClear = span.max < sy - height / 2 - rise - FLOAT_STAMP_MARGIN || span.min > sy + height / 2 + FLOAT_STAMP_MARGIN;
        if (!isClear) isTouched = true;
      }
      if (!isTouched) return;
      isOverlapping = true;
      top = Math.min(top, stampTop);
      bottom = Math.max(bottom, stampBottom);
      centerY = stamp.centerY;
    });
    if (!isOverlapping) return null;
    const travel = Math.min(rise, FLOAT_STAMP_RISE);
    const above = top - FLOAT_STAMP_MARGIN - height / 2;
    const below = bottom + FLOAT_STAMP_MARGIN + height / 2 + travel;
    const fitsAbove = above - height / 2 - travel >= 8;
    const fitsBelow = below + height / 2 <= viewHeight - 8;
    if (sy >= centerY && fitsBelow) return { y: below, direction: 1, rise: travel };
    if (fitsAbove) return { y: above, direction: -1, rise: travel };
    if (fitsBelow) return { y: below, direction: 1, rise: travel };
    return null;
  }

  function viewSize(scene) {
    const cam = scene.cameras && scene.cameras.main;
    return { width: cam ? cam.width : CONFIG.WIDTH, height: cam ? cam.height : CONFIG.HEIGHT };
  }

  /** Stellt sicher, dass eine Textur existiert (erzeugt bei Bedarf alle gemeinsamen Texturen). */
  function ensureTexture(scene, key) {
    if (scene.textures.exists(key)) return true;
    if (typeof Textures !== 'undefined' && typeof Textures.generateAll === 'function') Textures.generateAll(scene);
    return scene.textures.exists(key);
  }

  function cssColor(color) {
    return '#' + (color >>> 0).toString(16).padStart(6, '0').slice(-6);
  }

  function rgba(color, alpha) {
    return `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
  }

  /** Relative Helligkeit eines CSS-Farbwerts (#rgb/#rrggbb), 0 = schwarz, 1 = weiß. */
  function luminance(css) {
    const hex = String(css || '').replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.padEnd(6, '0');
    const value = parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(value)) return 0;
    return (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) / 255;
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /** Wert-Rauschen auf einem Gitter (bilinear, geglättet) – liefert f(x, y) ∈ [0, 1]. */
  function valueNoise(rand, width, height, cell) {
    const cols = Math.ceil(width / cell) + 2;
    const rows = Math.ceil(height / cell) + 2;
    const grid = new Float32Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    return (x, y) => {
      const gx = x / cell;
      const gy = y / cell;
      const ix = gx | 0;
      const iy = gy | 0;
      const fx = gx - ix;
      const fy = gy - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const i = iy * cols + ix;
      const a = grid[i];
      const b = grid[i + 1];
      const c = grid[i + cols];
      const d = grid[i + cols + 1];
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  }

  /** Canvas-Renderer? Dort wirkt tint nicht – Partikel brauchen vorgefärbte Texturen. */
  function isCanvasRenderer(scene) {
    const renderer = scene.sys && scene.sys.renderer;
    return Boolean(renderer && renderer.type === Phaser.CANVAS);
  }

  /** Partikeltextur in Wunschfarbe: WebGL färbt per tint, Canvas nutzt Textures.tinted(). */
  function particleLook(scene, key, color) {
    if (isCanvasRenderer(scene) && typeof Textures !== 'undefined' && typeof Textures.tinted === 'function') {
      return { key: Textures.tinted(scene, key, color), tint: 0xffffff };
    }
    return { key, tint: color };
  }

  /** Hängt ein Objekt an den Bildschirm (Container: inklusive Kinder). */
  function pinToScreen(obj) {
    if (obj.type === 'Container') obj.setScrollFactor(0, 0, true);
    else obj.setScrollFactor(0);
    return obj;
  }

  // ---------------------------------------------------------------------------
  // Stempel: Layout, Textur (Tinte + weicher Schatten), Animation
  // ---------------------------------------------------------------------------

  let measureContext = null;
  const stampCache = new Map(); // key → { uses, lastUsed }
  let stampClock = 0;

  function getMeasureContext() {
    if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
    return measureContext;
  }

  function stampFont(fontSize) {
    return `900 ${fontSize}px ${CONFIG.FONTS.STAMP}`;
  }

  function normalizeLabel(text) {
    const label = String(text === undefined || text === null ? '' : text)
      .toLocaleUpperCase('de-DE')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return label.length ? label : ['ABGELEHNT'];
  }

  /** Misst den Stempel (alle Maße in CSS-Pixeln). */
  function stampLayout(lines, fontSize) {
    const ctx = getMeasureContext();
    ctx.font = stampFont(fontSize);
    const spacing = fontSize * STAMP.LETTER_SPACING;
    const capMetrics = ctx.measureText('H');
    const capHeight = capMetrics.actualBoundingBoxAscent || fontSize * 0.72;
    const lineWidths = lines.map((line) => {
      const chars = Array.from(line);
      return chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
    });
    const lineGap = fontSize * STAMP.LINE_GAP;
    const textW = Math.max(...lineWidths);
    const textH = capHeight * lines.length + lineGap * (lines.length - 1);
    const t1 = Math.max(3, fontSize * STAMP.OUTER_LINE);
    const gap = Math.max(2, fontSize * STAMP.LINE_GAP_FRAME);
    const t2 = Math.max(1.5, fontSize * STAMP.INNER_LINE);
    const frame = t1 + gap + t2;
    const width = textW + 2 * (fontSize * STAMP.PAD_X + frame);
    const height = textH + 2 * (fontSize * STAMP.PAD_Y + frame);
    return {
      lines, lineWidths, fontSize, spacing, capHeight, lineGap, textW, textH, t1, gap, t2, width, height,
      font: stampFont(fontSize),
      corner: Math.max(2, fontSize * STAMP.CORNER),
      margin: Math.ceil(fontSize * STAMP.MARGIN),
    };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /** Zeichnet Doppelrahmen und Schrift (ctx bereits auf CSS-Pixel und Rand eingestellt). */
  function paintStampShapes(ctx, L) {
    ctx.lineWidth = L.t1;
    roundRectPath(ctx, L.t1 / 2, L.t1 / 2, L.width - L.t1, L.height - L.t1, L.corner);
    ctx.stroke();
    const inset = L.t1 + L.gap + L.t2 / 2;
    ctx.lineWidth = L.t2;
    roundRectPath(ctx, inset, inset, L.width - 2 * inset, L.height - 2 * inset, Math.max(1, L.corner - L.t1 - L.gap * 0.6));
    ctx.stroke();

    ctx.font = L.font;
    ctx.textBaseline = 'alphabetic';
    let baseline = (L.height - L.textH) / 2 + L.capHeight;
    L.lines.forEach((line, i) => {
      let cursor = (L.width - L.lineWidths[i]) / 2;
      Array.from(line).forEach((ch) => {
        ctx.fillText(ch, cursor, baseline);
        cursor += ctx.measureText(ch).width + L.spacing;
      });
      baseline += L.capHeight + L.lineGap;
    });
  }

  /**
   * Unregelmäßige Tinte: grobe Druckverteilung + feines Korn als Alpha-Rauschen,
   * dazu ausgesparte Flecken und abgenutzte Kratzer im Gummi.
   */
  function applyInkTexture(ctx, fw, fh, R, rand, fontSize) {
    // Struktur wächst mit der Schrift: kleine Stempel bekommen feineres Korn
    const k = Math.min(1.4, Math.max(0.6, fontSize / 46));
    const image = ctx.getImageData(0, 0, fw, fh);
    const data = image.data;
    const pressure = valueNoise(rand, fw, fh, 38 * R * k);
    const blotch = valueNoise(rand, fw, fh, 7 * R * k);
    const grain = valueNoise(rand, fw, fh, 1.7 * R * Math.sqrt(k));
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const i = (y * fw + x) * 4 + 3;
        const alpha = data[i];
        if (alpha === 0) continue;
        const p = pressure(x, y);
        const n = 0.55 * blotch(x, y) + 0.45 * grain(x, y);
        const threshold = 0.17 + 0.27 * (1 - p) * (1 - p); // wenig Druck → mehr Fehlstellen
        const keep = smoothstep(threshold - 0.05, threshold + 0.07, n);
        const tone = 0.78 + 0.22 * p;
        data[i] = Math.round(alpha * keep * tone * STAMP.INK_ALPHA);
      }
    }
    ctx.putImageData(image, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000000';
    const flecks = Math.round((fw * fh) / (R * R * k * k) / 1100);
    for (let n = 0; n < flecks; n++) {
      const rx = (0.5 + rand() * 1.7) * R * k;
      ctx.globalAlpha = 0.4 + rand() * 0.6;
      ctx.beginPath();
      ctx.ellipse(rand() * fw, rand() * fh, rx, rx * (0.45 + rand() * 0.7), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#000000';
    ctx.lineCap = 'round';
    for (let n = 0; n < 4; n++) {
      const x = rand() * fw;
      const y = rand() * fh;
      const length = (14 + rand() * 46) * R * k;
      const angle = (rand() - 0.5) * 0.7 + (rand() < 0.5 ? 0 : Math.PI / 2);
      ctx.globalAlpha = 0.35 + rand() * 0.4;
      ctx.lineWidth = (0.5 + rand() * 0.7) * R * Math.sqrt(k);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle) * length * 0.5 + (rand() - 0.5) * 6 * R,
        y + Math.sin(angle) * length * 0.5 + (rand() - 0.5) * 6 * R,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Emit-Zone: zufällige Punkte auf dem Stempelrahmen (lokal, Mitte = 0/0). */
  function stampPerimeter(width, height) {
    return {
      getRandomPoint(point) {
        // Umfang abwickeln: oben → rechts → unten → links
        const t = visualRandom() * 2 * (width + height);
        let x;
        let y;
        if (t < width) [x, y] = [t - width / 2, -height / 2];
        else if (t < width + height) [x, y] = [width / 2, t - width - height / 2];
        else if (t < 2 * width + height) [x, y] = [width / 2 - (t - width - height), height / 2];
        else [x, y] = [-width / 2, height / 2 - (t - 2 * width - height)];
        point.x = x;
        point.y = y;
        return point;
      },
    };
  }

  /** Entfernt die am längsten unbenutzten Stempeltexturen, falls der Cache voll ist. */
  function trimStampCache(scene) {
    if (stampCache.size < STAMP.CACHE_LIMIT) return;
    const idle = [...stampCache.entries()].filter(([, entry]) => entry.uses <= 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (stampCache.size >= STAMP.CACHE_LIMIT && idle.length) {
      const [key] = idle.shift();
      stampCache.delete(key);
      if (scene.textures.exists(key)) scene.textures.remove(key);
    }
  }

  /** Liefert den Texturschlüssel für den Stempel (Frames 'ink' und 'shadow'). */
  function stampTexture(scene, L, color) {
    const key = 'fx-stamp-' + hash(`${L.lines.join('\n')}|${L.fontSize}|${color}`).toString(36);
    if (!scene.textures.exists(key)) {
      trimStampCache(scene);
      const R = STAMP.RESOLUTION;
      const fw = Math.ceil((L.width + 2 * L.margin) * R);
      const fh = Math.ceil((L.height + 2 * L.margin) * R);
      const texture = scene.textures.createCanvas(key, fw, fh * 2);
      const ctx = texture.getContext();
      const css = cssColor(color);

      // 1) Tinte: Formen mit leichtem Ausbluten, dann Struktur
      ctx.save();
      ctx.scale(R, R);
      ctx.translate(L.margin, L.margin);
      ctx.fillStyle = css;
      ctx.strokeStyle = css;
      ctx.shadowColor = rgba(color, 0.5);
      ctx.shadowBlur = 1.1 * R;
      paintStampShapes(ctx, L);
      ctx.restore();
      applyInkTexture(ctx, fw, fh, R, makeRandom(hash(key)), L.fontSize);

      // 2) Weicher Schatten (nur während des Einfallens sichtbar): Formen weit außerhalb
      //    zeichnen, nur ihr unscharfer Schatten landet im zweiten Frame.
      const offset = 5000;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, fh, fw, fh);
      ctx.clip();
      ctx.translate(0, fh);
      ctx.scale(R, R);
      ctx.translate(L.margin - offset, L.margin);
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#000000';
      ctx.shadowColor = 'rgba(0, 0, 0, 1)';
      ctx.shadowBlur = Math.max(4, L.fontSize * 0.16) * R;
      ctx.shadowOffsetX = offset * R;
      paintStampShapes(ctx, L);
      ctx.restore();

      texture.add('ink', 0, 0, 0, fw, fh);
      texture.add('shadow', 0, 0, fh, fw, fh);
      texture.refresh();
      stampCache.set(key, { uses: 0, lastUsed: 0 });
    }
    if (!stampCache.has(key)) stampCache.set(key, { uses: 0, lastUsed: 0 });
    return key;
  }

  /** Ein Konfetti-Emitter (eine Textur, tint fest oder als Zufallsliste). */
  function makeConfettiEmitter(scene, x, y, { key, tint, count }) {
    const emitter = scene.add.particles(x, y, key, {
      emitting: false,
      speed: CONFETTI.SPEED,
      angle: { min: 205, max: 335 },
      gravityY: CONFETTI.GRAVITY,
      lifespan: CONFETTI.LIFESPAN,
      tint,
      scaleX: { min: 0.8, max: 1.3 },
      // Kippen um die Längsachse: Skalierung pendelt zwischen -1 und 1
      scaleY: {
        onEmit: (particle) => {
          particle.flutterPhase = visualRandom();
          particle.flutterSpeed = between(4, 9);
          return 1;
        },
        onUpdate: (particle, key, t) => {
          const lifeSeconds = particle.life / 1000;
          return Math.cos((t * lifeSeconds * particle.flutterSpeed + particle.flutterPhase) * Math.PI * 2);
        },
      },
      rotate: {
        onEmit: (particle) => {
          particle.spinStart = between(0, 360);
          particle.spinSpeed = between(-420, 420);
          return particle.spinStart;
        },
        onUpdate: (particle, key, t) => particle.spinStart + particle.spinSpeed * t * (particle.life / 1000),
      },
      // Luftwiderstand: Beschleunigung entgegen der aktuellen Geschwindigkeit
      accelerationX: { onEmit: () => 0, onUpdate: (particle) => -CONFETTI.DRAG * particle.velocityX },
      accelerationY: { onEmit: () => 0, onUpdate: (particle) => -CONFETTI.DRAG * particle.velocityY },
      alpha: { start: 1, end: 0, ease: 'Expo.easeIn' },
    });
    emitter.setDepth(CONFIG.DEPTH.FX);
    pinToScreen(emitter);
    emitter.explode(count);
    scene.time.delayedCall(CONFETTI.LIFESPAN.max + 150, () => emitter.destroy());
    return emitter;
  }

  // ---------------------------------------------------------------------------
  // Öffentliche API
  // ---------------------------------------------------------------------------

  return {
    /**
     * Kamera-Wackeln.
     * @param {Phaser.Scene} scene
     * @param {object} [opts]
     * @param {number|{x:number,y:number}} [opts.intensity=0.008]
     * @param {number} [opts.duration=220]
     * @param {boolean} [opts.force=false] laufendes Wackeln neu starten
     * @returns {Phaser.Cameras.Scene2D.Camera|null}
     */
    shake(scene, { intensity = 0.008, duration = 220, force = false } = {}) {
      if (!isAlive(scene) || !scene.cameras || !scene.cameras.main) return null;
      return scene.cameras.main.shake(duration, intensity, force);
    },

    /**
     * Kurzer Farbblitz über den ganzen Bildschirm (blockiert keine Eingaben).
     * @returns {Phaser.GameObjects.Rectangle|null}
     */
    flash(scene, { color = CONFIG.COLORS.DHBW_RED, alpha = 0.22, duration = 180 } = {}) {
      if (!isAlive(scene)) return null;
      const view = viewSize(scene);
      const rect = scene.add
        .rectangle(-view.width / 2, -view.height / 2, view.width * 2, view.height * 2, color, 1)
        .setOrigin(0)
        .setAlpha(alpha)
        .setDepth(CONFIG.DEPTH.FX);
      pinToScreen(rect);
      scene.tweens.add({
        targets: rect,
        alpha: 0,
        duration,
        ease: 'Quad.easeOut',
        onComplete: () => rect.destroy(),
      });
      return rect;
    },

    /**
     * Partikel-Explosion an einer Stelle (Weltkoordinaten).
     * @param {object} [opts] color, count, speed, lifespan, texture, gravity = 0,
     *   scale = 1, fixed = false (am Bildschirm haften)
     * @returns {Phaser.GameObjects.Particles.ParticleEmitter|null}
     */
    burst(scene, x, y, { color = 0xffffff, count = 18, speed = 180, lifespan = 600, texture = 'dot', gravity = 0, scale = 1, fixed = false } = {}) {
      if (!isAlive(scene)) return null;
      const baseKey = ensureTexture(scene, texture) ? texture : ensureTexture(scene, 'dot') ? 'dot' : null;
      if (!baseKey) return null;
      const look = particleLook(scene, baseKey, color);
      const emitter = scene.add.particles(x, y, look.key, {
        emitting: false,
        speed: { min: speed * 0.35, max: speed },
        angle: { min: 0, max: 360 },
        lifespan: { min: lifespan * 0.6, max: lifespan },
        scale: { start: scale * 1.15, end: 0 },
        alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
        gravityY: gravity,
        tint: look.tint,
      });
      emitter.setDepth(CONFIG.DEPTH.FX);
      if (fixed) pinToScreen(emitter);
      emitter.explode(count);
      scene.time.delayedCall(lifespan + 120, () => emitter.destroy());
      return emitter;
    },

    /**
     * Konfetti-Kanone (Bildschirmkoordinaten): Papierschnipsel fliegen hoch,
     * flattern (Drehung + Kippen) und segeln mit Luftwiderstand nach unten.
     * @returns {Phaser.GameObjects.Particles.ParticleEmitter|null}
     */
    confetti(scene, { x = 400, y = 160, count = 80 } = {}) {
      if (!isAlive(scene) || !ensureTexture(scene, 'confetti')) return null;
      // WebGL: ein Emitter mit zufälligem tint je Schnipsel; Canvas: ein Emitter je Farbe
      const groups = isCanvasRenderer(scene)
        ? CONFETTI.COLORS.map((color, i) => ({
          ...particleLook(scene, 'confetti', color),
          count: Math.floor(count / CONFETTI.COLORS.length) + (i < count % CONFETTI.COLORS.length ? 1 : 0),
        }))
        : [{ key: 'confetti', tint: CONFETTI.COLORS, count }];
      const emitters = groups.map((group) => makeConfettiEmitter(scene, x, y, group));
      return emitters[0] || null;
    },

    /**
     * Aufsteigender, verblassender Text (z. B. „+5 min · Fehlermeldung gegoogelt“).
     * Gleichzeitige Texte an derselben Stelle stapeln sich, statt sich zu überdecken; liegt dort
     * gerade ein Stempel, weicht der Text über (bzw. unter) den Stempel aus.
     * @param {object} [opts] color, size, rise, duration, bold, wrap = 420, fixed = false
     * @returns {Phaser.GameObjects.Text|null}
     */
    floatText(scene, x, y, text, { color = CONFIG.CSS.DANGER, size = 18, rise = 40, duration = 1100, bold = true, wrap = 420, fixed = false } = {}) {
      if (!isAlive(scene) || typeof UI === 'undefined') return null;
      const anchorKey = `${Math.round(x / 24)}:${Math.round(y / 24)}`;
      if (!floatAnchors.has(scene)) floatAnchors.set(scene, new Map());
      const anchors = floatAnchors.get(scene);
      const stackIndex = anchors.get(anchorKey) || 0;
      anchors.set(anchorKey, stackIndex + 1);

      const label = UI.text(scene, x, y, String(text), { size, color, bold, align: 'center', wrap, origin: 0.5 });
      const isLight = luminance(color) > 0.6;
      label.setStroke(isLight ? CONFIG.CSS.BG_DEEP : '#ffffff', Math.max(3, Math.round(size / 5)));
      label.setShadow(0, 2, 'rgba(0, 0, 0, 0.28)', 4, true, true);
      label.setDepth(CONFIG.DEPTH.FX);
      if (fixed) pinToScreen(label);

      // Auf dem Bildschirm halten (Kamera-Ausschnitt berücksichtigen) und einem liegenden
      // Stempel ausweichen – sonst steht Rot auf Rot (fail() setzt beide auf denselben Punkt).
      const cam = scene.cameras.main;
      const left = fixed ? 0 : cam.worldView.x;
      const top = fixed ? 0 : cam.worldView.y;
      const view = viewSize(scene);
      const halfW = label.width / 2;
      const halfH = label.height / 2;
      const clearance = stampClearance(scene, x - left, y - top, label.width, label.height, rise, view.height);
      const anchorY = clearance ? clearance.y + top : y;
      const direction = clearance ? clearance.direction : 1;
      const travel = clearance ? clearance.rise : rise;
      const startY = anchorY + direction * stackIndex * (label.height + 4);
      label.x = Phaser.Math.Clamp(x, left + halfW + 8, Math.max(left + halfW + 8, left + view.width - halfW - 8));
      label.y = Phaser.Math.Clamp(startY, top + halfH + travel + 8, Math.max(top + halfH + travel + 8, top + view.height - halfH - 8));

      label.once('destroy', () => {
        const remaining = (anchors.get(anchorKey) || 1) - 1;
        if (remaining <= 0) anchors.delete(anchorKey);
        else anchors.set(anchorKey, remaining);
      });

      label.setScale(0.7);
      scene.tweens.add({ targets: label, scale: 1, duration: 180, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: label, y: label.y - travel, duration, ease: 'Cubic.easeOut' });
      scene.tweens.add({
        targets: label,
        alpha: 0,
        delay: duration * 0.55,
        duration: duration * 0.45,
        ease: 'Quad.easeIn',
        onComplete: () => label.destroy(),
      });
      return label;
    },

    /**
     * Kurzes Aufpulsieren eines Objekts um seine Mitte (auch Container mit Ursprung links oben).
     * @param {object} [opts]
     * @param {number} [opts.scale=1.08]
     * @param {number} [opts.duration=120] Dauer eines Hin- bzw. Rückwegs
     * @param {number} [opts.repeat=1] zusätzliche Wiederholungen (Phaser-Semantik: 1 = zwei Pulse)
     * @returns {Phaser.Tweens.Tween|null}
     */
    pulse(scene, target, { scale = 1.08, duration = 120, repeat = 1 } = {}) {
      if (!isAlive(scene) || !target || !target.scene || typeof target.setScale !== 'function') return null;
      const previous = target.fxPulse;
      if (previous) {
        previous.tween.stop();
        previous.restore();
      }

      const base = { sx: target.scaleX, sy: target.scaleY, x: target.x, y: target.y };
      // Mittelpunkt in lokalen, unskalierten Koordinaten relativ zum Ursprung
      let pivot = { x: 0, y: 0 };
      if (target.type === 'Container') {
        const bounds = target.getBounds();
        const local = target.getWorldTransformMatrix().applyInverse(bounds.centerX, bounds.centerY);
        pivot = { x: local.x, y: local.y };
      } else if (typeof target.originX === 'number' && typeof target.width === 'number') {
        pivot = { x: (0.5 - target.originX) * target.width, y: (0.5 - target.originY) * target.height };
      }
      const cos = Math.cos(target.rotation || 0);
      const sin = Math.sin(target.rotation || 0);

      const apply = (k) => {
        const sx = base.sx * k;
        const sy = base.sy * k;
        const dx = (sx - base.sx) * pivot.x;
        const dy = (sy - base.sy) * pivot.y;
        target.setScale(sx, sy);
        target.setPosition(base.x - (cos * dx - sin * dy), base.y - (sin * dx + cos * dy));
      };
      const restore = () => {
        if (target.scene) {
          target.setScale(base.sx, base.sy);
          target.setPosition(base.x, base.y);
        }
        if (target.fxPulse && target.fxPulse.tween === tween) target.fxPulse = null;
      };

      const proxy = { k: 1 };
      const tween = scene.tweens.add({
        targets: proxy,
        k: scale,
        duration,
        yoyo: true,
        repeat: Math.max(0, repeat),
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          if (!target.scene) {
            tween.stop();
            return;
          }
          apply(proxy.k);
        },
        onComplete: restore,
        onStop: restore,
      });
      target.fxPulse = { tween, restore };
      return tween;
    },

    /**
     * Signatur-Effekt: Ein roter Gummistempel knallt schräg aufs Bild.
     * Fällt aus 1,8-facher Größe ein (Back.easeOut, 140 ms), Aufprall mit Shake, Klang,
     * Druckwelle und Tintenspritzern; bleibt `hold` ms und verblasst. Bildschirmkoordinaten.
     * Mehrzeilig mit '\n'. Zu breite Stempel werden automatisch verkleinert.
     * @param {Phaser.Scene} scene
     * @param {string} text z. B. 'ABGELEHNT' (wird in Großbuchstaben gesetzt)
     * @returns {Phaser.GameObjects.Container|null} Stempel-Container (zerstört sich selbst)
     */
    stamp(scene, text, { x = 400, y = 300, color = CONFIG.COLORS.DHBW_RED, angle = -12, size = 46, hold = 700, sound = true } = {}) {
      if (!isAlive(scene)) return null;
      const lines = normalizeLabel(text);
      const view = viewSize(scene);
      const finalAngle = angle + (visualRandom() * 2 - 1) * STAMP.ANGLE_JITTER;
      const rad = Phaser.Math.DegToRad(finalAngle);
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));

      // Zu breit für den Bildschirm? Dann Schrift verkleinern.
      let layout = stampLayout(lines, size);
      const rotatedWidth = layout.width * cos + layout.height * sin;
      const maxWidth = view.width * STAMP.SCREEN_SHARE;
      if (rotatedWidth > maxWidth) layout = stampLayout(lines, Math.max(STAMP.MIN_SIZE, Math.floor((size * maxWidth) / rotatedWidth)));

      const key = stampTexture(scene, layout, color);
      const cacheEntry = stampCache.get(key);
      cacheEntry.uses += 1;
      cacheEntry.lastUsed = ++stampClock;

      // Vollständig sichtbar halten (gedrehte Hüllbox)
      const halfW = (layout.width * cos + layout.height * sin) / 2;
      const halfH = (layout.width * sin + layout.height * cos) / 2;
      const px = halfW * 2 + 12 < view.width ? Phaser.Math.Clamp(x, halfW + 6, view.width - halfW - 6) : view.width / 2;
      const py = halfH * 2 + 12 < view.height ? Phaser.Math.Clamp(y, halfH + 6, view.height - halfH - 6) : view.height / 2;

      const R = STAMP.RESOLUTION;
      const shadow = scene.add.image(14, 18, key, 'shadow').setScale(1 / R).setAlpha(0.42);
      const ink = scene.add.image(0, 0, key, 'ink').setScale(1 / R);
      const container = scene.add.container(px, py, [shadow, ink]);
      container.setDepth(CONFIG.DEPTH.FX).setAngle(finalAngle).setScale(STAMP.START_SCALE).setAlpha(0);
      pinToScreen(container);
      container.isStamp = true;
      container.stampText = lines.join('\n');
      // Für ausweichende Schwebetexte: Endlage des Stempels in Bildschirmkoordinaten
      if (!activeStamps.has(scene)) activeStamps.set(scene, new Set());
      const registry = activeStamps.get(scene);
      const rc = Math.cos(rad);
      const rs = Math.sin(rad);
      const entry = {
        centerY: py,
        corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([ux, uy]) => {
          const lx = (ux * layout.width) / 2;
          const ly = (uy * layout.height) / 2;
          return { x: px + lx * rc - ly * rs, y: py + lx * rs + ly * rc };
        }),
      };
      registry.add(entry);
      container.once('destroy', () => {
        cacheEntry.uses = Math.max(0, cacheEntry.uses - 1);
        registry.delete(entry);
      });

      let hasImpacted = false;
      const impact = () => {
        if (hasImpacted || !container.scene) return;
        hasImpacted = true;
        FX.shake(scene, { ...STAMP.SHAKE, force: true });
        if (sound && typeof UI !== 'undefined') UI.sound('stamp');

        // Druckwelle: blasse Kopie dehnt sich kurz aus
        const ghost = scene.add.image(0, 0, key, 'ink').setScale(1 / R).setAlpha(0.32);
        container.addAt(ghost, 1);
        scene.tweens.add({
          targets: ghost,
          scale: 1.12 / R,
          alpha: 0,
          duration: STAMP.GHOST_MS,
          ease: 'Cubic.easeOut',
          onComplete: () => ghost.destroy(),
        });
        // Schatten verschwindet: die Tinte liegt jetzt flach auf dem Papier
        scene.tweens.add({ targets: shadow, alpha: 0, duration: 120, ease: 'Quad.easeOut' });

        // Tintenspritzer entlang des Rahmens (nur WebGL: braucht tint in Tintenfarbe)
        if (!isCanvasRenderer(scene) && ensureTexture(scene, 'dot')) {
          const specks = scene.add.particles(px, py, 'dot', {
            emitting: false,
            emitZone: { type: 'random', source: stampPerimeter(layout.width, layout.height) },
            speed: { min: 30, max: 120 },
            angle: { min: 0, max: 360 },
            lifespan: { min: 160, max: 320 },
            scale: { start: 0.55, end: 0 },
            alpha: { start: 0.9, end: 0 },
            tint: color,
          });
          specks.setDepth(CONFIG.DEPTH.FX).setAngle(finalAngle);
          pinToScreen(specks);
          specks.explode(STAMP.SPECKS);
          scene.time.delayedCall(420, () => specks.destroy());
        }

        // Halten, dann verblassen und aufräumen
        scene.time.delayedCall(hold, () => {
          if (!container.scene) return;
          registry.delete(entry); // verblassende Stempel müssen nicht mehr umgangen werden
          scene.tweens.add({
            targets: container,
            alpha: 0,
            scale: 1.03,
            duration: STAMP.FADE_OUT_MS,
            ease: 'Quad.easeIn',
            onComplete: () => container.destroy(),
          });
        });
      };

      scene.tweens.add({ targets: container, alpha: 1, duration: STAMP.FADE_IN_MS, ease: 'Linear' });
      scene.tweens.add({ targets: shadow, x: 3, y: 4, duration: STAMP.DROP_MS, ease: 'Quad.easeIn' });
      scene.tweens.add({
        targets: container,
        scale: 1,
        duration: STAMP.DROP_MS,
        ease: STAMP.DROP_EASE,
        easeParams: STAMP.DROP_EASE_PARAMS,
        onUpdate: () => {
          if (container.scaleX <= 1) impact();
        },
        onComplete: impact,
      });
      return container;
    },

    /**
     * Digitaler Glitch: horizontale Störstreifen, Farbversatz und seitliches Zittern.
     * @param {object} [opts] duration = 300, intensity = 1
     * @returns {Phaser.GameObjects.Container|null}
     */
    glitch(scene, { duration = 300, intensity = 1 } = {}) {
      if (!isAlive(scene)) return null;
      const view = viewSize(scene);
      const veil = scene.add.rectangle(0, 0, view.width, view.height, CONFIG.COLORS.BG_DEEP, 1).setOrigin(0).setAlpha(0);
      const bars = [];
      for (let i = 0; i < GLITCH.BARS; i++) bars.push(scene.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0));
      const layer = scene.add.container(0, 0, [veil, ...bars]).setDepth(CONFIG.DEPTH.FX);
      pinToScreen(layer);

      const shuffle = () => {
        if (!layer.scene) return;
        veil.setAlpha(visualRandom() < 0.5 ? between(0.06, 0.2) * intensity : 0);
        let tearY = between(0, view.height);
        bars.forEach((bar, index) => {
          const isTear = index < 2; // Farbversatz-Paar: Cyan/Rot leicht verschoben
          bar.setVisible(isTear || visualRandom() < 0.75);
          const h = isTear ? between(6, 22) : between(2, 16);
          const w = between(view.width * 0.25, view.width);
          const bx = isTear ? (index === 0 ? -6 : 6) + between(0, view.width - w) : between(-40, view.width - w * 0.6);
          const by = isTear ? tearY + index * 3 : between(0, view.height);
          bar.setPosition(bx, by).setSize(w, h);
          bar.fillColor = isTear ? GLITCH.COLORS[index] : GLITCH.COLORS[Math.floor(visualRandom() * GLITCH.COLORS.length)];
          bar.setAlpha(isTear ? 0.6 : between(0.25, 0.7) * Math.min(1, intensity));
          if (index === 1) tearY += between(-30, 30);
        });
      };
      shuffle();

      if (scene.cameras && scene.cameras.main) scene.cameras.main.shake(duration, { x: 0.011 * intensity, y: 0.0015 * intensity }, true);
      const steps = Math.max(1, Math.round(duration / GLITCH.STEP_MS));
      const timer = scene.time.addEvent({ delay: GLITCH.STEP_MS, repeat: Math.max(0, steps - 2), callback: shuffle });
      scene.time.delayedCall(duration, () => {
        timer.remove(false);
        layer.destroy();
      });
      return layer;
    },

    /**
     * Schreibmaschinen-Effekt: Text erscheint Zeichen für Zeichen. Der Text wird vorab
     * umbrochen, damit Wörter am Zeilenende nicht hin- und herspringen.
     * @param {Phaser.Scene} scene
     * @param {Phaser.GameObjects.Text} textObject
     * @param {string} fullText
     * @param {object} [opts] speed (ms pro Zeichen), onComplete, sound = false (Tippgeräusch)
     * @returns {{ skip: Function, stop: Function, isDone: Function }}
     */
    typewriter(scene, textObject, fullText, { speed = CONFIG.TIMING.INTRO_TYPEWRITER_MS, onComplete = null, sound = false } = {}) {
      const full = String(fullText === undefined || fullText === null ? '' : fullText);
      let isFinished = false;
      let elapsed = 0;
      let shown = 0;
      let soundCounter = 0;

      let display = full;
      if (textObject && typeof textObject.getWrappedText === 'function' && textObject.style && textObject.style.wordWrapWidth) {
        display = textObject.getWrappedText(full).join('\n');
      }
      const chars = Array.from(display);

      const detach = () => {
        if (scene && scene.events) {
          scene.events.off('update', onUpdate);
          scene.events.off('shutdown', stop);
        }
      };
      function stop() {
        if (isFinished) return;
        isFinished = true;
        detach();
      }
      const finish = () => {
        if (isFinished) return;
        isFinished = true;
        detach();
        if (textObject && textObject.scene) textObject.setText(full);
        if (typeof onComplete === 'function') onComplete();
      };
      function onUpdate(time, delta) {
        if (!textObject || !textObject.scene) {
          stop();
          return;
        }
        elapsed += delta;
        const count = speed > 0 ? Math.min(chars.length, Math.floor(elapsed / speed)) : chars.length;
        if (count > shown) {
          if (sound && typeof UI !== 'undefined') {
            for (let i = shown; i < count; i++) {
              if (chars[i].trim() && ++soundCounter % 3 === 0) {
                UI.sound('type');
                break;
              }
            }
          }
          shown = count;
          textObject.setText(chars.slice(0, count).join(''));
        }
        if (count >= chars.length) finish();
      }

      if (!textObject || !textObject.scene || !scene || !scene.events) {
        finish();
      } else {
        textObject.setText('');
        scene.events.on('update', onUpdate);
        scene.events.once('shutdown', stop);
        if (chars.length === 0 || speed <= 0) finish();
      }
      return { skip: finish, stop, isDone: () => isFinished };
    },

    /** Nur für Tests/Galerie: Anzahl gecachter Stempeltexturen. */
    getStampCacheSize() {
      return stampCache.size;
    },
  };
})();
