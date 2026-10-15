/**
 * ch3SignalHunt.js – Reine Logik für Kapitel 3 „Die Signaljagd“.
 *
 * Enthält den Lageplan (Rotebühlplatz 41, Erdgeschoss – nicht maßstabsgetreu), das
 * Signal- und Bandbreitenmodell, Kollisionshilfen und eine Simulation. Die Szene ruft
 * pro Frame stepSim() mit der Tastatur-Eingabe auf, stellt den Zustand dar und übersetzt
 * die gelieferten Ereignisse in Effekte und GameState-Buchungen.
 *
 * Modell (bewusst einfach, aber fachlich ehrlich):
 *  - Signalqualität 0–1: quadratischer Abfall bis zur Reichweite des Access Points (AP)
 *    und Dämpfung je durchquerter Wand. Funklöcher (Treppenhaus, Aufzug, Tiefenhörsaal) = 0.
 *  - Durchsatz = maxRate × Qualität / (1 + Geräte am AP / SHARE_CLIENTS). Volle Balken
 *    heißen also nicht schnelles Internet, wenn 360 Geräte am selben AP hängen.
 *  - Roaming: Das Handy klebt am aktuellen AP („sticky client“) und wechselt erst bei
 *    deutlichem Vorteil. Jeder Wechsel kostet eine kurze 802.1X-Neuanmeldung.
 *  - Funkloch: kurze Gnadenfrist (Sprint möglich), danach Abbruch, der angefangene Block
 *    ist weg, und nach dem Verlassen folgt eine Neuverbindung.
 *
 * Ereignisse von stepSim() (Feld `type`): pickup, brezel-lover, crowd, slip, blocked,
 * shush, janitor, roam, roamed, grace-start, grace-saved, disconnect, reconnect-start,
 * reconnected, outage-warning, outage-start, outage-end, hint (id: hall|slow|deadzone),
 * trickle, stall-start, complete, expired, mercy.
 *
 * Global: Ch3Logic. Abhängigkeiten: CONFIG, CAMPUS (beim Laden); RNG optional zur Laufzeit
 * (createSim({ rng }) nimmt auch einen eigenen Generator, z. B. in Tests).
 * Kein Phaser, kein DOM.
 */

const Ch3Logic = (() => {
  // ===========================================================================
  // Hilfsfunktionen
  // ===========================================================================

  /** Friert ein Objekt samt aller Unterobjekte ein. */
  const deepFreeze = (obj) => {
    Object.values(obj).forEach((value) => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
    });
    return Object.freeze(obj);
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  };

  /**
   * Ersetzt Platzhalter {name} in einer Textvorlage.
   * @param {string} template
   * @param {object} vars
   * @returns {string}
   */
  function fill(template, vars = {}) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
  }

  // ===========================================================================
  // Geometrie und Kollision
  // ===========================================================================

  /** Punkt im Rechteck {x, y, w, h}? Linker/oberer Rand inklusive, rechter/unterer exklusiv. */
  function pointInRect(x, y, rect) {
    return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  }

  /** Überlappt der Kreis das Rechteck? Bloßes Berühren zählt nicht. */
  function circleIntersectsRect(cx, cy, radius, rect) {
    const nearestX = clamp(cx, rect.x, rect.x + rect.w);
    const nearestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy < radius * radius;
  }

  /**
   * Schneidet eine Strecke an einem Rechteck ab (Liang-Barsky).
   * @returns {[number, number]|null} Parameterbereich [t0, t1] innerhalb des Rechtecks oder null
   */
  function clipSegment(x1, y1, x2, y2, rect) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return null;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return null;
          if (t < t1) t1 = t;
        }
      }
    }
    return [t0, t1];
  }

  /** Berührt oder schneidet die Strecke das Rechteck? */
  function segmentIntersectsRect(x1, y1, x2, y2, rect) {
    return clipSegment(x1, y1, x2, y2, rect) !== null;
  }

  /** Erstes Hindernis, das der Kreis an (x, y) überlappt, sonst null. */
  function firstOverlap(x, y, radius, solids) {
    for (const solid of solids) {
      if (circleIntersectsRect(x, y, radius, solid)) return solid;
    }
    return null;
  }

  /**
   * Sucht die kleinste Querverschiebung (1…maxPx), bei der (x, y) frei wäre.
   * @param {'x'|'y'} axis Achse der Verschiebung
   * @returns {number} vorzeichenbehaftete Verschiebung oder 0
   */
  function findNudge(x, y, axis, radius, solids, maxPx) {
    for (let k = 1; k <= maxPx; k++) {
      for (const offset of [k, -k]) {
        const nx = axis === 'x' ? x + offset : x;
        const ny = axis === 'y' ? y + offset : y;
        if (!firstOverlap(nx, ny, radius, solids)) return offset;
      }
    }
    return 0;
  }

  /**
   * Bewegt einen Kreis achsenweise in kleinen Teilschritten (kein Tunneln durch Wände,
   * Gleiten an Wänden entlang). Mit Ecken-Hilfe rutscht man an knapp verfehlten
   * Türrahmen seitlich vorbei, statt hängen zu bleiben (nur ohne Quer-Eingabe).
   * @param {number} x Startpunkt
   * @param {number} y
   * @param {number} dx gewünschte Verschiebung
   * @param {number} dy
   * @param {number} radius
   * @param {Array<{x:number,y:number,w:number,h:number}>} solids Hindernisse
   * @param {number} [stepPx=2] maximale Teilschrittlänge
   * @param {number} [cornerAssistPx=0] maximale seitliche Ausweichstrecke an Ecken
   * @returns {{x:number, y:number, hitX:boolean, hitY:boolean, hitSolid:object|null}}
   */
  function moveCircle(x, y, dx, dy, radius, solids, stepPx = 2, cornerAssistPx = 0) {
    const startX = x;
    const startY = y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / stepPx));
    const stepX = dx / steps;
    const stepY = dy / steps;
    let hitX = false;
    let hitY = false;
    let isNudged = false;
    let hitSolid = null;
    /** Versucht, quer zur Laufrichtung um eine Ecke zu gleiten; true bei Erfolg. */
    const tryNudge = (axis, step) => {
      if (cornerAssistPx <= 0) return false;
      const probeX = axis === 'y' ? x + stepX : x;
      const probeY = axis === 'x' ? y + stepY : y;
      const offset = findNudge(probeX, probeY, axis, radius, solids, cornerAssistPx);
      if (offset === 0) return false;
      const shift = Math.sign(offset) * Math.min(Math.abs(offset), Math.abs(step));
      const nx = axis === 'x' ? x + shift : x;
      const ny = axis === 'y' ? y + shift : y;
      if (firstOverlap(nx, ny, radius, solids)) return false;
      x = nx;
      y = ny;
      isNudged = true;
      return true;
    };
    for (let i = 0; i < steps; i++) {
      if (stepX !== 0 && !hitX) {
        const blocker = firstOverlap(x + stepX, y, radius, solids);
        if (!blocker) {
          x += stepX;
        } else if (!(stepY === 0 && tryNudge('y', stepX))) {
          hitX = true;
          hitSolid = hitSolid || blocker;
        }
      }
      if (stepY !== 0 && !hitY) {
        const blocker = firstOverlap(x, y + stepY, radius, solids);
        if (!blocker) {
          y += stepY;
        } else if (!(stepX === 0 && tryNudge('x', stepY))) {
          hitY = true;
          hitSolid = hitSolid || blocker;
        }
      }
      if ((stepX === 0 || hitX) && (stepY === 0 || hitY)) break;
    }
    // Ohne Kollision exakt am Ziel landen (keine Rundungsdrift durch Teilschritte)
    if (!isNudged) {
      if (!hitX) x = startX + dx;
      if (!hitY) y = startY + dy;
    }
    return { x, y, hitX, hitY, hitSolid };
  }

  /**
   * Diagonale Schraffur-Linien („/“) innerhalb eines Rechtecks – für Funklöcher,
   * gesperrte Räume und die Baustelle.
   * @param {{x:number,y:number,w:number,h:number}} rect
   * @param {number} spacing Abstand der Linien (entlang x gemessen)
   * @param {number} [offset=0] Verschiebung des Musters
   * @returns {Array<{x1:number,y1:number,x2:number,y2:number}>}
   */
  function diagonalSegments(rect, spacing, offset = 0) {
    const segments = [];
    const yBottom = rect.y + rect.h + 1;
    const yTop = rect.y - 1;
    for (let c = rect.x + rect.y + offset; c <= rect.x + rect.w + rect.y + rect.h; c += spacing) {
      const x1 = c - yBottom;
      const x2 = c - yTop;
      const clip = clipSegment(x1, yBottom, x2, yTop, rect);
      if (!clip || clip[1] - clip[0] < 1e-6) continue;
      const [t0, t1] = clip;
      segments.push({
        x1: x1 + (x2 - x1) * t0,
        y1: yBottom + (yTop - yBottom) * t0,
        x2: x1 + (x2 - x1) * t1,
        y2: yBottom + (yTop - yBottom) * t1,
      });
    }
    return segments;
  }

  // ===========================================================================
  // Level: Lageplan Rotebühlplatz 41, EG (Weltkoordinaten, Spielfläche 800×600)
  // ===========================================================================

  const WALL_THICKNESS = 8;
  const hWall = (x1, x2, y) => ({ x: x1, y: y - WALL_THICKNESS / 2, w: x2 - x1, h: WALL_THICKNESS });
  const vWall = (x, y1, y2) => ({ x: x - WALL_THICKNESS / 2, y: y1, w: WALL_THICKNESS, h: y2 - y1 });

  /** Wände (Mittellinien siehe Kommentare). Türen sind Lücken. Wände dämpfen auch das Funksignal. */
  const WALLS = [
    // Außenmauern
    hWall(8, 596, 60), hWall(8, 596, 588), vWall(12, 56, 592), vWall(592, 56, 592),
    // y = 226: Nordtrakt ↔ Flur. Türen: Hörsaal 196–246, Bibliothek 360–410; Aufzug offen zur Treppe
    hWall(8, 196, 226), hWall(246, 268, 226), hWall(338, 360, 226), hWall(410, 596, 226),
    // y = 296: Flur ↔ Südtrakt. Türen: Mensa 40–90, Innenhof 520–570
    hWall(8, 40, 296), hWall(90, 520, 296), hWall(570, 596, 296),
    // x = 268: Hörsaal/Aufzug (mit Türrahmen der Treppe), Mensa ↔ Innenhof mit Tür 400–450
    vWall(268, 56, 236), vWall(268, 286, 400), vWall(268, 450, 592),
    // x = 338: Aufzug/Bibliothek (mit Türrahmen der Treppe)
    vWall(338, 56, 236), vWall(338, 286, 296),
    // WC ↔ Aufzug
    hWall(268, 338, 166),
    // Tiefenhörsaal (Treppe runter: Tür 60–110) und Mensaküche
    hWall(8, 60, 476), hWall(110, 268, 476), vWall(140, 476, 592),
  ].map((wall, index) => ({ id: `wall-${index}`, ...wall }));

  /** Gesperrte Räume (nicht begehbar, dämpfen das Signal nicht zusätzlich). */
  const BLOCKS = [
    { id: 'wc', x: 268, y: 56, w: 70, h: 110, label: 'WC\nDEFEKT' },
    { id: 'kueche', x: 140, y: 476, w: 128, h: 116, label: 'KÜCHE\nKEIN ZUTRITT' },
  ];

  /** Stuttgart-21-Baustelle im Innenhof: gesperrt (Bauzaun), funktechnisch aber durchlässig. */
  const S21 = { id: 's21', x: 340, y: 360, w: 160, h: 120 };

  const PARALLEL_COURSE = CAMPUS.course.slice(0, -1) + 'B';

  /** Räume (Reihenfolge = Priorität bei der Raumsuche; Funklöcher zuerst). */
  const ROOMS = [
    { id: 'aufzug', label: 'AUFZUG', x: 268, y: 166, w: 70, h: 60, isDeadzone: true, labelX: 273, labelY: 171, align: 'left' },
    { id: 'treppenhaus', label: 'TREPPE', x: 268, y: 226, w: 70, h: 70, isDeadzone: true, labelX: 303, labelY: 272 },
    { id: 'tiefenhoersaal', label: 'TIEFENHÖRSAAL\n(UG)', x: 8, y: 476, w: 132, h: 116, isDeadzone: true, labelX: 76, labelY: 500 },
    { id: 'wc', label: BLOCKS[0].label, x: 268, y: 56, w: 70, h: 110, isBlock: true, labelX: 303, labelY: 111 },
    { id: 'kueche', label: BLOCKS[1].label, x: 140, y: 476, w: 128, h: 116, isBlock: true, labelX: 204, labelY: 534 },
    { id: 'hoersaal', label: `HÖRSAAL · ${CAMPUS.lectureRoom.toUpperCase()}`, x: 8, y: 56, w: 260, h: 170, labelX: 22, labelY: 66, align: 'left' },
    { id: 'bibliothek', label: 'BIBLIOTHEK', x: 338, y: 56, w: 258, h: 170, labelX: 350, labelY: 66, align: 'left' },
    { id: 'flurWest', label: 'FLUR', x: 8, y: 226, w: 260, h: 70, labelX: 22, labelY: 234, align: 'left' },
    { id: 'flurOst', label: 'FLUR', x: 338, y: 226, w: 258, h: 70, labelX: 350, labelY: 234, align: 'left' },
    { id: 'mensa', label: 'MENSA', x: 8, y: 296, w: 260, h: 180, labelX: 100, labelY: 304, align: 'left' },
    { id: 'innenhof', label: 'INNENHOF', x: 268, y: 296, w: 328, h: 296, labelX: 282, labelY: 304, align: 'left' },
  ];

  /** Access Points: Position, Reichweite (px), Sendeleistung (0–1), Durchsatz allein am AP (MB/s). */
  const APS = [
    { id: 'hs', name: 'AP-HS', place: 'Hörsaal', x: 215, y: 72, range: 300, power: 1.0, maxRate: 1.5 },
    { id: 'bib', name: 'AP-BIB', place: 'Bibliothek', x: 556, y: 76, range: 300, power: 1.0, maxRate: 1.3 },
    { id: 'flur', name: 'AP-FLUR', place: 'Flur', x: 470, y: 250, range: 280, power: 0.9, maxRate: 0.8 },
    { id: 'mensa', name: 'AP-MENSA', place: 'Mensa', x: 112, y: 392, range: 260, power: 0.95, maxRate: 1.0 },
    { id: 'hof', name: 'AP-HOF', place: 'Innenhof', x: 430, y: 540, range: 260, power: 0.85, maxRate: 0.7 },
  ];

  /** Menschentrauben: teilen sich die Bandbreite „ihres“ APs. pauses[i] = Halt am Wegpunkt i (s). */
  const CROWDS = [
    { id: 'erstis', label: '180 Erstis · 360 Geräte', clients: 360, radius: 60, dots: 26,
      path: [{ x: 118, y: 140 }], speed: 0, pauses: [0], mode: 'pingpong' },
    { id: 'schlange', label: 'Schlange · 25 Geräte', clients: 25, radius: 26, dots: 9,
      path: [{ x: 205, y: 345 }], speed: 0, pauses: [0], mode: 'pingpong' }, // am Kaffeeautomaten
    { id: 'parallelkurs', label: `${PARALLEL_COURSE} (Netflix) · 30 Geräte`, clients: 30, radius: 24, dots: 9,
      path: [{ x: 170, y: 430 }, { x: 300, y: 425 }, { x: 312, y: 530 }, { x: 480, y: 536 }],
      speed: 28, pauses: [8, 0, 0, 8], mode: 'pingpong' },
    { id: 'lerngruppe', label: 'Lerngruppe · 6 Laptops', clients: 6, radius: 18, dots: 6,
      path: [{ x: 505, y: 262 }, { x: 385, y: 262 }, { x: 385, y: 190 }, { x: 410, y: 150 }],
      speed: 30, pauses: [10, 0, 0, 14], mode: 'pingpong' },
  ];

  /** Der Hausmeister wischt den westlichen Flur (Kehrwoche!) und hinterlässt eine nasse Spur. */
  const JANITOR = {
    path: [{ x: 52, y: 272 }, { x: 236, y: 272 }], speed: 32, pauses: [2.5, 2.5], mode: 'pingpong', radius: 9,
  };

  /** Fundsachen. Brezeln in Funklöchern sind Köder (Aufzug: mit Kaffee oder präzise im Sprint). */
  const PICKUPS = [
    { id: 'b1', type: 'brezel', x: 30, y: 104 },   // Hörsaal, letzte Reihe
    { id: 'b2', type: 'brezel', x: 34, y: 336 },   // Mensa
    { id: 'b3', type: 'brezel', x: 290, y: 566 },  // Innenhof Südwest
    { id: 'b4', type: 'brezel', x: 574, y: 318 },  // Innenhof Nordost
    { id: 'b5', type: 'brezel', x: 450, y: 200 },  // Bibliothek („Essen verboten“)
    { id: 'b6', type: 'brezel', x: 303, y: 194 },  // Aufzug (Funkloch)
    { id: 'b7', type: 'brezel', x: 40, y: 560 },   // Tiefenhörsaal (Funkloch)
    { id: 'k1', type: 'coffee', x: 246, y: 318 },  // Kaffeeautomat Mensa
    { id: 'k2', type: 'coffee', x: 574, y: 244 },  // Kaffeeautomat Flur Ost
    { id: 'r1', type: 'repeater', x: 574, y: 566 }, // Fundkiste im Innenhof
  ];

  const LEVEL = deepFreeze({
    map: { x: 8, y: 56, width: 588, height: 536 },
    wallThickness: WALL_THICKNESS,
    walls: WALLS,
    blocks: BLOCKS,
    s21: S21,
    solids: [...WALLS, ...BLOCKS, S21],
    rooms: ROOMS,
    aps: APS,
    crowds: CROWDS,
    janitor: JANITOR,
    pickups: PICKUPS,
    start: { x: 220, y: 180 },
    bestSpot: { x: 520, y: 120 },
  });

  // ===========================================================================
  // Balance (alle Werte an einer Stelle)
  // ===========================================================================

  const BALANCE = deepFreeze({
    FILE_SIZE_MB: 48,
    COUNTDOWN_S: 120,          // bis man mit dem Referat dran ist
    RETRY_COUNTDOWN_S: 90,     // nach Ablauf: „nach der Pause dran“
    MAX_EXPIRIES: 3,           // beim 3. Ablauf rettet der USB-Stick (keine Sackgasse)
    RESIDUAL_FACTOR: 0.5,      // so viel vom Fortschritt rettet der Browser-Cache mindestens …
    RESIDUAL_MIN: [0.3, 0.6],  // … und mindestens dieser Anteil der Datei (nie mehr als vorher)
    MAX_DT_MS: 50,             // größere Frame-Sprünge werden begrenzt
    PLAYER_RADIUS: 9,
    BASE_SPEED: 150,           // px/s
    COFFEE_SPEED_FACTOR: 1.6,
    CROWD_SPEED_FACTOR: 0.5,
    ACCEL: 14,                 // 1/s – wie schnell die Zielgeschwindigkeit erreicht wird
    ACCEL_WET: 2.2,            // auf nassem Boden: rutschig
    STEP_PX: 2,                // Teilschritt der Kollisionsprüfung
    CORNER_ASSIST_PX: 6,       // an Türrahmen bis zu 6 px seitlich vorbeigleiten
    MIN_QUALITY: 0.08,         // darunter: kein nutzbares Signal
    WALL_FACTOR: 0.55,         // Dämpfung je Wand
    BAR_THRESHOLDS: [0.08, 0.3, 0.55, 0.78],
    ROAM_MARGIN: 0.25,         // so viel besser muss ein anderer AP sein (sticky client)
    ROAM_S: 0.8,               // Neuanmeldung beim AP-Wechsel
    GRACE_S: 0.9,              // im Funkloch hält die Verbindung noch so lange
    RECONNECT_S: 2.5,
    CHUNK_LOSS_MB: 2,          // angefangener Block beim Abbruch
    SHARE_CLIENTS: 10,         // so viele Geräte halbieren den Durchsatz
    SLOW_RATE: 0.25,           // MB/s – darunter kriecht der Ladebalken (Frust tröpfelt)
    TRICKLE_INTERVAL_S: 5,
    TRICKLE_FRUST: 1,
    HALL_NUDGE_S: 5,
    SLOW_HINT_S: 25,
    DEADZONE_HINT_AFTER: 2,
    STALL_AT: 0.99,
    STALL_S: 3,
    BREZEL_GOAL: 5,
    PICKUP_RADIUS: 10,
    COFFEE: { S: 8, RESPAWN_S: 25 },
    REPEATER: { S: 30, FACTOR: 1.4, BONUS: 0.2, RESPAWN_S: 45 },
    OUTAGE: { AP_ID: 'bib', AT_MIN: 0.45, AT_MAX: 0.6, WARNING_S: 5, DURATION_S: 15 },
    JANITOR: { RADIUS: 9, KNOCKBACK_PX: 14, PUSH_SPEED: 140, PUSH_COOLDOWN_S: 0.4, ANGRY_COOLDOWN_S: 4 },
    WET: { DURATION_S: 4, STEP_S: 0.25, RADIUS: 20 },
    COOLDOWNS: { BLOCKED_S: 6, SLIP_S: 3, CROWD_S: 4 },
    /** Frust/Zeit je Ereignis – die Szene bucht genau diese Werte (eine Quelle der Wahrheit). */
    FEEDBACK: {
      DISCONNECT_FRUST: CONFIG.FRUSTRATION.SMALL,
      DISCONNECT_MINUTES: CONFIG.PENALTY_MINUTES.SMALL,
      EXPIRY_FRUST: CONFIG.FRUSTRATION.MEDIUM,
      EXPIRY_MINUTES: CONFIG.PENALTY_MINUTES.MEDIUM,
      HALL_FRUST: CONFIG.FRUSTRATION.TINY,   // trifft fast jeden Erstspieler beim Lesen – nur ein Stupser
      STALL_FRUST: CONFIG.FRUSTRATION.SMALL,
      JANITOR_FRUST: CONFIG.FRUSTRATION.TINY,
      BREZEL_RELIEF: CONFIG.FRUSTRATION.TINY,
    },
  });

  // ===========================================================================
  // Texte (Deutsch, trocken; Platzhalter {name} füllt fill())
  // ===========================================================================

  const TEXTS = deepFreeze({
    SSID: CAMPUS.wifi.ssid,
    FILE_NAMES: ['Referat_final.pptx', 'Referat_final_v2.pptx', 'Referat_FINAL_echt.pptx', 'Referat_final_v7(1).pptx'],
    PROFESSOR: 'Prof. Dr. Häberle',
    /** HUD-Aufgabe (höchstens ca. 45 Zeichen, sonst kürzt die HUD). */
    OBJECTIVES: {
      READY: 'Download der Folien starten',
      RUNNING: 'Ort mit Signal und wenig Geräten suchen',
      DISCONNECTED: 'Raus aus dem Funkloch!',
      RECONNECTING: 'Kurz warten: WLAN verbindet neu',
      OUTAGE: 'AP startet neu: anderen AP suchen',
      STALL: 'Warten … hängt bei 99 %',
      /** Index = Zahl der abgelaufenen Fristen − 1 (danach rettet der USB-Stick). */
      RETRY: ['Zweiter Anlauf: Folien laden', 'Letzter Anlauf: ab in die Bibliothek!'],
      DONE: 'Folien geladen – ab ins Referat!',
    },
    /**
     * Android-Karte: Statuszeile (fett) und Detailzeile darunter. Beide passen in die
     * Kartenbreite (164 px bei 13 px Schrift) – längere Texte würde die Szene kürzen.
     */
    STATUS: {
      READY: 'Bereit',
      CONNECTED: 'Verbunden',
      ROAMING: 'Neu anmelden …',
      GRACE: 'Kein Signal!',
      GRACE_DETAIL: 'Abbruch in {s} s',
      LOST: 'Getrennt (Funkloch)',
      RECONNECTING: ['Verbinden …', 'Authentifizierung …', 'IP-Adresse abrufen …'],
      OUTAGE_WARNING: '{ap} startet in {s} s neu',
      STALLING: 'Virenscan läuft …',
      DONE: 'Download fertig',
      DEVICES: '{ap} · {n} Geräte',
      DEVICE_SINGLE: '{ap} · nur du',
      NO_AP: 'kein Access Point',
    },
    START_DIALOG: {
      TITLE: 'Download starten?',
      BUTTON: 'Herunterladen',
      TEXT:
        '{file} · {size}\n\n' +
        'Geschätzte Dauer hier im Hörsaal: {eta} – du bist aber schon in {countdown} Minuten dran.\n\n' +
        'Lauf mit den Pfeiltasten oder WASD dorthin, wo das Signal stark ist und wenige Geräte ' +
        'am Access Point hängen. Rot schraffiert = Funkloch.',
    },
    EXPIRED_DIALOG: {
      TITLE: 'Zu spät!',
      BUTTON: 'Weiter laden',
      TEXT:
        '{prof}: „Ohne Folien? Dann sind Sie nach der Pause dran.“\n\n' +
        'Die Moodle-Sitzung ist abgelaufen, der Download startet neu. Aus dem Browser-Cache ' +
        'gerettet: {residual} von {size}. Neue Frist: {countdown} Minuten.\n\n' +
        'Mitleids-Tipp: In der Bibliothek (oben rechts) lädt es am schnellsten. Die Heatmap ' +
        'der Fachschaft zeigt dir jetzt den Weg.',
    },
    MERCY_DIALOG: {
      TITLE: 'Plan B: USB-Stick',
      BUTTON: 'Danke, Mia!',
      TEXT:
        'Mia aus deinem Kurs hat die Folien auf ihrem USB-Stick. Analog schlägt eduroam.\n\n' +
        'Merke: Volle Balken heißen nicht schnelles Internet. Entscheidend ist, wie viele ' +
        'Geräte sich den Access Point teilen.',
    },
    REASONS: {
      DISCONNECT: 'Funkloch: Verbindung getrennt',
      EXPIRED: 'Zu spät: Referat ohne Folien',
      MERCY: 'Dritte Frist verpasst',
      HALL: 'Volle Balken, kein Internet',
      STALL: 'Hängt bei 99 %',
      JANITOR: 'Hausmeister angerempelt',
      TRICKLE: 'Ladebalken kriecht',
      BREZEL: 'Brezel {n}/{goal}',
      BREZEL_EXTRA: 'Noch eine Brezel',
    },
    STAMPS: { EXPIRED: 'ZU SPÄT' },
    HINTS: {
      HALL: 'Volle Balken – aber {n} Geräte am selben Access Point. Raus hier!',
      SLOW: 'Mitleids-Tipp: Die Fachschaft hat eine WLAN-Heatmap gemalt. Grün = schnell.',
      DEADZONE: 'Mitleids-Tipp: Rot = Funkloch. Treppe nur im Sprint – oder außen rum über den Innenhof.',
    },
    TOASTS: {
      COFFEE: 'Kaffee vom Automaten: {s} s lang schneller. Wechselgeld gibt’s keins.',
      REPEATER: 'Repeater aus der Fundkiste: verstärkt schwaches Signal ({s} s). Gegen volle APs hilft er nicht.',
      S21: 'S21-Baustelle: gesperrt bis voraussichtlich 20??. Bitte außen rum.',
      SHUSH: 'Pssst! In der Bibliothek wird nicht gerannt.',
      OUTAGE_WARNING: 'Wartungsfenster: {ap} startet in {s} s neu (Firmware-Update).',
      OUTAGE_START: '{ap} startet neu. Wartungsfenster: jetzt.',
      OUTAGE_END: '{ap} ist zurück. Neue Firmware: 1.0.0-final-final2.',
      BREZEL_LOVER: 'Fünf Brezeln! Der Frust schmilzt wie Butter auf Laugengebäck.',
      DONE: 'Download abgeschlossen: {file}',
    },
    FLOATS: {
      SLIP: 'Rutschig!',
      SAVED: 'Puh – gerade noch!',
      BLOCKED: 'Gesperrt',
      CROWD: '„Sorry, darf ich mal?“',
      SIGNAL_LOST: 'Signal weg!',
      LOST_MB: '−{mb} (Block verworfen)',
      RECONNECTED: 'Wieder verbunden',
      COFFEE: 'Kaffee!',
      REPEATER: 'Repeater!',
    },
    JANITOR_LINES: [
      'Hausmeister: „Obacht, frisch gwischt!“',
      'Hausmeister: „Ha noi, mei Kehrwoch!“',
      'Hausmeister: „Net uff mein frisch gwischte Boda!“',
    ],
    PICKUP_NOTES: {
      b5: 'Brezel in der Bibliothek? Die Aufsicht guckt streng.',
      b6: 'Aufzug-Brezel: liegt hier seit 2019. So lange ist der Aufzug schon kaputt.',
      b7: 'Tiefenhörsaal-Brezel: Der Name ist Programm.',
    },
    SIGN_S21: { TITLE: 'S21-BAUSTELLE', SUBTITLE: 'Fertigstellung:', YEARS: ['2019', '2021', '2025'], NEXT: '20??' },
    ANNOTATIONS: {
      DEADZONE: 'Funkloch!',
      BEST: 'Bester Empfang!',
      HEATMAP: 'WLAN-Heatmap der Fachschaft',
      JANITOR: 'Hausmeister',
      PLAYER: 'Du',
      REBOOT: 'Neustart …',
    },
    SIDEBAR: {
      DOWNLOAD_OF: '{done} von {size}',
      STALLING_ETA: 'Gleich fertig …',
      DONE_ETA: 'Download abgeschlossen',
      RATE_NONE: '–',
      POSTIT_TITLE: 'Referat Gruppe 3',
      POSTIT_LINE: 'Du bist dran in',
      POSTIT_PAUSED: 'Prof. wartet …',
      INVENTORY_TITLE: 'FUNDSACHEN',
      BREZELS: 'Brezeln',
      BREZEL_EXTRA: '+{n}',
      COFFEE: 'Kaffee',
      REPEATER: 'Repeater',
      NONE: '–',
      SECONDS: '{s} s',
      HELP: 'Pfeiltasten/WASD: laufen\nRot schraffiert: Funkloch\nViele Geräte = langsam\nBrezel = weniger Frust',
    },
  });

  // ===========================================================================
  // Zufall
  // ===========================================================================

  /** Ist der globale RNG (src/core/rng.js) geladen und benutzbar? */
  function hasGlobalRng() {
    return typeof RNG !== 'undefined' && RNG !== null && typeof RNG.next === 'function';
  }

  /** Deterministischer Ersatz (nur falls weder rng noch RNG verfügbar sind). */
  function createFallbackRng(seed = 7) {
    let state = seed >>> 0;
    const next = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      float: (min, max) => min + next() * (max - min),
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      pick: (array) => (array && array.length ? array[Math.floor(next() * array.length)] : undefined),
    };
  }

  function resolveRng(rng) {
    if (rng && typeof rng.next === 'function') return rng;
    if (hasGlobalRng()) return RNG;
    return createFallbackRng();
  }

  // ===========================================================================
  // Welt: Räume, Wege, Signal, Bandbreite
  // ===========================================================================

  /** Raum an (x, y) oder null. Funklöcher und Sperrräume haben Vorrang. */
  function findRoom(x, y, level = LEVEL) {
    return level.rooms.find((room) => pointInRect(x, y, room)) || null;
  }

  function roomIdAt(x, y, level = LEVEL) {
    const room = findRoom(x, y, level);
    return room ? room.id : null;
  }

  /** Funkloch an (x, y) oder null. */
  function findDeadzone(x, y, level = LEVEL) {
    return level.rooms.find((room) => room.isDeadzone && pointInRect(x, y, room)) || null;
  }

  function apById(level, id) {
    return level.aps.find((ap) => ap.id === id) || null;
  }

  /** Reihenfolge der Wegpunkte: Pendeln (0…n−1…1) oder Schleife. */
  function pathOrder(entity) {
    const count = entity.path.length;
    if (count <= 1) return [0];
    const forward = Array.from({ length: count }, (_, i) => i);
    if (entity.mode === 'loop') return forward;
    return forward.concat(forward.slice(1, -1).reverse());
  }

  /** Dauer eines vollständigen Umlaufs in Sekunden (0 bei stehenden Objekten). */
  function cycleLength(entity) {
    if (entity.path.length <= 1 || !entity.speed) return 0;
    const order = pathOrder(entity);
    let total = 0;
    for (let i = 0; i < order.length; i++) {
      const from = entity.path[order[i]];
      const to = entity.path[order[(i + 1) % order.length]];
      total += (entity.pauses[order[i]] || 0) + Math.hypot(to.x - from.x, to.y - from.y) / entity.speed;
    }
    return total;
  }

  /**
   * Position eines Objekts (Menschentraube, Hausmeister) zur Zeit t.
   * @param {object} entity { path, speed, pauses, mode }
   * @param {number} t Sekunden (auch negativ erlaubt)
   * @returns {{x:number, y:number}}
   */
  function pathPosition(entity, t) {
    const points = entity.path;
    if (points.length <= 1 || !entity.speed) return { x: points[0].x, y: points[0].y };
    const order = pathOrder(entity);
    const cycle = cycleLength(entity);
    let rest = ((t % cycle) + cycle) % cycle;
    for (let i = 0; i < order.length; i++) {
      const from = points[order[i]];
      const to = points[order[(i + 1) % order.length]];
      const pause = entity.pauses[order[i]] || 0;
      if (rest < pause) return { x: from.x, y: from.y };
      rest -= pause;
      const travel = Math.hypot(to.x - from.x, to.y - from.y) / entity.speed;
      if (rest < travel) {
        const f = rest / travel;
        return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
      }
      rest -= travel;
    }
    return { x: points[order[0]].x, y: points[order[0]].y };
  }

  /** Anzahl der Wände zwischen zwei Punkten. */
  function countWallsBetween(x1, y1, x2, y2, walls) {
    let count = 0;
    for (const wall of walls) {
      if (segmentIntersectsRect(x1, y1, x2, y2, wall)) count += 1;
    }
    return count;
  }

  /**
   * Signalqualität eines APs an (x, y), ohne Funklöcher.
   * @returns {number} 0–1
   */
  function signalQuality(ap, x, y, walls, balance = BALANCE) {
    const distance = Math.hypot(x - ap.x, y - ap.y);
    if (distance >= ap.range) return 0;
    const base = ap.power * (1 - (distance / ap.range) ** 2);
    return base * balance.WALL_FACTOR ** countWallsBetween(ap.x, ap.y, x, y, walls);
  }

  /**
   * Signal aller APs an (x, y).
   * @param {number} x
   * @param {number} y
   * @param {object} [opts] { level, balance, offlineIds = [], repeaterActive = false }
   * @returns {{deadzone: string|null, perAp: Object<string, number>, bestApId: string|null, bestQuality: number}}
   */
  function evaluateSignal(x, y, { level = LEVEL, balance = BALANCE, offlineIds = [], repeaterActive = false } = {}) {
    const deadzone = findDeadzone(x, y, level);
    const perAp = {};
    let bestApId = null;
    let bestQuality = 0;
    for (const ap of level.aps) {
      let quality = 0;
      if (!deadzone && !offlineIds.includes(ap.id)) {
        quality = signalQuality(ap, x, y, level.walls, balance);
        if (repeaterActive && quality > 0) {
          quality = Math.min(1, quality * balance.REPEATER.FACTOR + balance.REPEATER.BONUS);
        }
      }
      perAp[ap.id] = quality;
      if (quality > bestQuality) {
        bestQuality = quality;
        bestApId = ap.id;
      }
    }
    if (bestQuality < balance.MIN_QUALITY) bestApId = null;
    return { deadzone: deadzone ? deadzone.id : null, perAp, bestApId, bestQuality };
  }

  /** Qualität → Balken 0–4. */
  function barsFor(quality, thresholds = BALANCE.BAR_THRESHOLDS) {
    return thresholds.filter((threshold) => quality >= threshold).length;
  }

  /**
   * Geräte je AP: Jede Menschentraube hängt am stärksten AP an ihrer Position.
   * @param {Array<{id:string, x:number, y:number, clients?:number}>} crowdPositions
   * @returns {Object<string, number>}
   */
  function computeApLoads(crowdPositions, level = LEVEL, balance = BALANCE, offlineIds = []) {
    const loads = {};
    level.aps.forEach((ap) => {
      loads[ap.id] = 0;
    });
    for (const crowd of crowdPositions) {
      const definition = level.crowds.find((c) => c.id === crowd.id);
      const clients = crowd.clients !== undefined ? crowd.clients : (definition ? definition.clients : 0);
      const signal = evaluateSignal(crowd.x, crowd.y, { level, balance, offlineIds });
      if (signal.bestApId) loads[signal.bestApId] += clients;
    }
    return loads;
  }

  /**
   * Durchsatz in MB/s.
   * @param {object} ap
   * @param {number} quality 0–1
   * @param {number} load andere Geräte am AP
   */
  function downloadRate(ap, quality, load, balance = BALANCE) {
    if (!ap || !(quality > 0)) return 0;
    return (ap.maxRate * quality) / (1 + load / balance.SHARE_CLIENTS);
  }

  // ===========================================================================
  // Formatierung (deutsches Dezimalkomma)
  // ===========================================================================

  const formatNumber = (value, digits = 1) => value.toFixed(digits).replace('.', ',');

  /** 23.44 → "23,4 MB" */
  function formatMB(mb) {
    return `${formatNumber(Math.max(0, mb), 1)} MB`;
  }

  /** Dateigröße kompakt: 48 → "48 MB", 47.5 → "47,5 MB" (ganze Zahlen ohne „,0“). */
  function formatSize(mb) {
    const value = Math.max(0, mb);
    return Number.isInteger(value) ? `${value} MB` : formatMB(value);
  }

  /** 1.26 → "1,3 MB/s", 0.031 → "31 kB/s" */
  function formatRate(rate) {
    const value = Math.max(0, rate || 0);
    if (value < 0.1) return `${Math.round(value * 1000)} kB/s`;
    return `${formatNumber(value, 1)} MB/s`;
  }

  /** Sekunden → "31 Sek." / "26 Min." / "3 Std." / "4 Tage"; nicht endlich → "unbekannt". */
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return 'unbekannt';
    if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} Sek.`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} Min.`;
    if (seconds < 48 * 3600) return `${Math.round(seconds / 3600)} Std.`;
    return `${Math.round(seconds / 86400)} Tage`;
  }

  /** Restzeit-Anzeige wie im Android-Download-Manager. */
  function formatEta(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return 'Restzeit: unbekannt';
    return `Noch ca. ${formatDuration(seconds)}`;
  }

  /** 135 → "2:15" (aufgerundet, nie negativ). */
  function formatCountdown(seconds) {
    const total = Math.max(0, Math.ceil((Number(seconds) || 0) - 1e-9));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  // ===========================================================================
  // Simulation
  // ===========================================================================

  /**
   * Legt eine neue Simulation an (Phase 'ready': nichts bewegt sich bis startSim()).
   * @param {object} [opts] { rng, level = LEVEL, balance = BALANCE }
   * @returns {object} Simulationszustand (veränderbar)
   */
  function createSim({ rng = null, level = LEVEL, balance = BALANCE } = {}) {
    const random = resolveRng(rng);
    const sim = {
      level,
      balance,
      rng: random,
      phase: 'ready',          // ready | running | stalling | done
      isFrozen: false,         // true, solange ein Dialog offen ist
      forceWet: null,          // Testhilfe: true/false erzwingt (k)einen nassen Boden
      t: 0,                    // Laufzeit des Downloads (s)
      worldT: 0,               // Zeit für Menschentrauben und Hausmeister (s)
      fileName: random.pick(TEXTS.FILE_NAMES),
      sizeMB: balance.FILE_SIZE_MB,
      progressMB: 0,
      countdownS: balance.COUNTDOWN_S,
      countdownTotalS: balance.COUNTDOWN_S,
      expiries: 0,
      disconnects: 0,
      brezels: 0,
      player: { x: level.start.x, y: level.start.y, vx: 0, vy: 0, facing: -Math.PI / 2 },
      room: null,
      inCrowd: null,
      isWet: false,
      effects: { coffeeS: 0, repeaterS: 0 },
      pickups: level.pickups.map((p) => ({ id: p.id, type: p.type, x: p.x, y: p.y, isTaken: false, respawnAt: null })),
      crowdPhases: level.crowds.map((crowd) => random.float(0, Math.max(cycleLength(crowd), 0.001))),
      janitorPhase: random.float(0, cycleLength(level.janitor)),
      crowds: [],
      janitor: null,
      wetTrail: [],
      offlineIds: [],
      outage: {
        state: 'pending',      // pending | warning | active | done
        at: random.float(balance.OUTAGE.AT_MIN, balance.OUTAGE.AT_MAX),
        timer: 0,
        apId: balance.OUTAGE.AP_ID,
      },
      hints: { hall: false, slow: false, deadzone: false, shush: false, brezelLover: false },
      slowS: 0,
      trickleS: 0,
      stallS: 0,
      cooldowns: { janitorPush: 0, janitorAngry: 0, blocked: 0, slip: 0, crowd: 0 },
      connection: { state: 'connected', apId: null, timer: 0 }, // connected|roaming|grace|lost|reconnecting
      signal: null,
      loads: {},
      quality: 0,
      load: 0,
      rate: 0,
      potentialRate: 0,
    };
    updateWorld(sim);
    updateSignal(sim);
    sim.connection.apId = sim.signal.bestApId;
    updateRates(sim);
    sim.room = roomIdAt(sim.player.x, sim.player.y, level);
    return sim;
  }

  /** Startet Countdown und Download (aus Phase 'ready'). */
  function startSim(sim) {
    if (sim.phase === 'ready') sim.phase = 'running';
    return sim;
  }

  /** Positionen der Menschentrauben, des Hausmeisters und seiner nassen Spur. */
  function updateWorld(sim) {
    const level = sim.level;
    sim.crowds = level.crowds.map((crowd, index) => {
      const pos = pathPosition(crowd, sim.worldT + sim.crowdPhases[index]);
      return { id: crowd.id, x: pos.x, y: pos.y, radius: crowd.radius, clients: crowd.clients };
    });
    const janitorPos = pathPosition(level.janitor, sim.worldT + sim.janitorPhase);
    sim.janitor = { x: janitorPos.x, y: janitorPos.y, radius: sim.balance.JANITOR.RADIUS };
    const wet = sim.balance.WET;
    const samples = Math.floor(wet.DURATION_S / wet.STEP_S);
    sim.wetTrail = [];
    for (let k = 0; k <= samples; k++) {
      const age = k * wet.STEP_S;
      const pos = pathPosition(level.janitor, sim.worldT + sim.janitorPhase - age);
      sim.wetTrail.push({ x: pos.x, y: pos.y, age });
    }
  }

  /** Menschentraube, in der (x, y) steht, sonst null. */
  function crowdAt(sim, x, y) {
    const margin = sim.balance.PLAYER_RADIUS * 0.5;
    return sim.crowds.find((crowd) => Math.hypot(crowd.x - x, crowd.y - y) < crowd.radius + margin) || null;
  }

  /** Ist der Boden an (x, y) nass (frisch gewischt)? */
  function isWetAt(sim, x, y) {
    if (sim.forceWet === true) return true;
    if (sim.forceWet === false) return false;
    const radius = sim.balance.WET.RADIUS;
    return sim.wetTrail.some((spot) => Math.hypot(spot.x - x, spot.y - y) < radius);
  }

  function tickTimers(sim, dt) {
    const cooldowns = sim.cooldowns;
    Object.keys(cooldowns).forEach((key) => {
      cooldowns[key] = Math.max(0, cooldowns[key] - dt);
    });
    sim.effects.coffeeS = Math.max(0, sim.effects.coffeeS - dt);
    sim.effects.repeaterS = Math.max(0, sim.effects.repeaterS - dt);
  }

  function movePlayer(sim, dt, input, events) {
    const B = sim.balance;
    const player = sim.player;
    let ix = Math.sign(input.dx || 0);
    let iy = Math.sign(input.dy || 0);
    if (ix !== 0 && iy !== 0) {
      ix *= Math.SQRT1_2;
      iy *= Math.SQRT1_2;
    }
    const isMoving = ix !== 0 || iy !== 0;

    const crowd = crowdAt(sim, player.x, player.y);
    if (crowd && sim.inCrowd !== crowd.id && isMoving && sim.cooldowns.crowd <= 0) {
      events.push({ type: 'crowd', crowdId: crowd.id, x: player.x, y: player.y });
      sim.cooldowns.crowd = B.COOLDOWNS.CROWD_S;
    }
    sim.inCrowd = crowd ? crowd.id : null;

    const isWet = isWetAt(sim, player.x, player.y);
    if (isWet && !sim.isWet && sim.cooldowns.slip <= 0 && Math.hypot(player.vx, player.vy) > B.BASE_SPEED * 0.3) {
      events.push({ type: 'slip', x: player.x, y: player.y });
      sim.cooldowns.slip = B.COOLDOWNS.SLIP_S;
    }
    sim.isWet = isWet;

    const speed = B.BASE_SPEED
      * (sim.effects.coffeeS > 0 ? B.COFFEE_SPEED_FACTOR : 1)
      * (crowd ? B.CROWD_SPEED_FACTOR : 1);
    const blend = 1 - Math.exp(-(isWet ? B.ACCEL_WET : B.ACCEL) * dt);
    player.vx += (ix * speed - player.vx) * blend;
    player.vy += (iy * speed - player.vy) * blend;
    if (crowd) {
      // In der Traube kommt man einfach nicht schneller durch.
      const velocity = Math.hypot(player.vx, player.vy);
      if (velocity > speed) {
        player.vx *= speed / velocity;
        player.vy *= speed / velocity;
      }
    }
    if (!ix && Math.abs(player.vx) < 0.5) player.vx = 0;
    if (!iy && Math.abs(player.vy) < 0.5) player.vy = 0;

    const result = moveCircle(player.x, player.y, player.vx * dt, player.vy * dt, B.PLAYER_RADIUS, sim.level.solids,
      B.STEP_PX, B.CORNER_ASSIST_PX);
    player.x = result.x;
    player.y = result.y;
    if (result.hitX) player.vx = 0;
    if (result.hitY) player.vy = 0;
    if (isMoving) player.facing = Math.atan2(iy, ix);
    if (result.hitSolid && result.hitSolid.id === 's21' && sim.cooldowns.blocked <= 0) {
      events.push({ type: 'blocked', what: 's21', x: player.x, y: player.y });
      sim.cooldowns.blocked = B.COOLDOWNS.BLOCKED_S;
    }

    const room = roomIdAt(player.x, player.y, sim.level);
    if (room !== sim.room) {
      if (room === 'bibliothek' && sim.effects.coffeeS > 0 && !sim.hints.shush) {
        sim.hints.shush = true;
        events.push({ type: 'shush', x: player.x, y: player.y });
      }
      sim.room = room;
    }
  }

  function handleJanitor(sim, events) {
    const B = sim.balance;
    const J = B.JANITOR;
    const player = sim.player;
    const janitor = sim.janitor;
    const dx = player.x - janitor.x;
    const dy = player.y - janitor.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= B.PLAYER_RADIUS + J.RADIUS || sim.cooldowns.janitorPush > 0) return;
    const nx = distance > 0.001 ? dx / distance : 0;
    const ny = distance > 0.001 ? dy / distance : -1;
    const push = moveCircle(player.x, player.y, nx * J.KNOCKBACK_PX, ny * J.KNOCKBACK_PX, B.PLAYER_RADIUS, sim.level.solids, B.STEP_PX);
    player.x = push.x;
    player.y = push.y;
    player.vx = nx * J.PUSH_SPEED;
    player.vy = ny * J.PUSH_SPEED;
    sim.cooldowns.janitorPush = J.PUSH_COOLDOWN_S;
    const isAngry = sim.cooldowns.janitorAngry <= 0;
    if (isAngry) sim.cooldowns.janitorAngry = J.ANGRY_COOLDOWN_S;
    events.push({ type: 'janitor', isAngry, x: janitor.x, y: janitor.y });
  }

  function collectPickups(sim, events) {
    const B = sim.balance;
    const player = sim.player;
    const reach = B.PLAYER_RADIUS + B.PICKUP_RADIUS;
    for (const item of sim.pickups) {
      if (item.isTaken || Math.hypot(item.x - player.x, item.y - player.y) >= reach) continue;
      item.isTaken = true;
      const base = { type: 'pickup', kind: item.type, id: item.id, x: item.x, y: item.y };
      if (item.type === 'brezel') {
        sim.brezels += 1;
        events.push({ ...base, count: sim.brezels, inDeadzone: Boolean(findDeadzone(item.x, item.y, sim.level)) });
        if (sim.brezels >= B.BREZEL_GOAL && !sim.hints.brezelLover) {
          sim.hints.brezelLover = true;
          events.push({ type: 'brezel-lover', count: sim.brezels });
        }
      } else if (item.type === 'coffee') {
        sim.effects.coffeeS = B.COFFEE.S;
        item.respawnAt = sim.t + B.COFFEE.RESPAWN_S;
        events.push(base);
      } else if (item.type === 'repeater') {
        sim.effects.repeaterS = B.REPEATER.S;
        item.respawnAt = sim.t + B.REPEATER.RESPAWN_S;
        events.push(base);
      }
    }
  }

  function respawnPickups(sim) {
    for (const item of sim.pickups) {
      if (item.isTaken && item.respawnAt !== null && sim.t >= item.respawnAt) {
        item.isTaken = false;
        item.respawnAt = null;
      }
    }
  }

  function updateOutage(sim, dt, events) {
    const O = sim.balance.OUTAGE;
    const outage = sim.outage;
    if (outage.state === 'pending') {
      const isOnTarget = sim.connection.state === 'connected' && sim.connection.apId === outage.apId;
      if (isOnTarget && sim.progressMB >= sim.sizeMB * outage.at) {
        outage.state = 'warning';
        outage.timer = O.WARNING_S;
        events.push({ type: 'outage-warning', apId: outage.apId, seconds: O.WARNING_S });
      }
    } else if (outage.state === 'warning') {
      outage.timer -= dt;
      if (outage.timer <= 0) {
        outage.state = 'active';
        outage.timer = O.DURATION_S;
        sim.offlineIds = [outage.apId];
        events.push({ type: 'outage-start', apId: outage.apId, seconds: O.DURATION_S });
      }
    } else if (outage.state === 'active') {
      outage.timer -= dt;
      if (outage.timer <= 0) {
        outage.state = 'done';
        outage.timer = 0;
        sim.offlineIds = [];
        events.push({ type: 'outage-end', apId: outage.apId });
      }
    }
  }

  function updateSignal(sim) {
    sim.signal = evaluateSignal(sim.player.x, sim.player.y, {
      level: sim.level,
      balance: sim.balance,
      offlineIds: sim.offlineIds,
      repeaterActive: sim.effects.repeaterS > 0,
    });
    sim.loads = computeApLoads(sim.crowds, sim.level, sim.balance, sim.offlineIds);
  }

  /** Zustandsautomat der WLAN-Verbindung. */
  function updateConnection(sim, dt, events) {
    const B = sim.balance;
    const connection = sim.connection;
    const signal = sim.signal;
    const hasSignal = !signal.deadzone && signal.bestApId !== null;
    const currentQuality = () => (connection.apId ? signal.perAp[connection.apId] || 0 : 0);
    const startGrace = () => {
      connection.state = 'grace';
      connection.timer = B.GRACE_S;
      events.push({ type: 'grace-start', deadzone: signal.deadzone });
    };
    const startRoam = (to) => {
      const from = connection.apId;
      connection.state = 'roaming';
      connection.apId = to;
      connection.timer = B.ROAM_S;
      events.push({ type: 'roam', from, to });
    };

    switch (connection.state) {
      case 'connected': {
        if (!hasSignal) {
          startGrace();
          break;
        }
        const current = currentQuality();
        const isBetter = signal.bestApId !== connection.apId && signal.bestQuality - current >= B.ROAM_MARGIN;
        if (current < B.MIN_QUALITY || isBetter) startRoam(signal.bestApId);
        break;
      }
      case 'roaming':
        if (!hasSignal) {
          startGrace();
          break;
        }
        connection.timer -= dt;
        if (connection.timer <= 0) {
          connection.state = 'connected';
          connection.timer = 0;
          events.push({ type: 'roamed', apId: connection.apId });
        }
        break;
      case 'grace':
        if (hasSignal) {
          events.push({ type: 'grace-saved' });
          if (currentQuality() >= B.MIN_QUALITY) {
            connection.state = 'connected';
            connection.timer = 0;
          } else {
            startRoam(signal.bestApId);
          }
          break;
        }
        connection.timer -= dt;
        if (connection.timer <= 0) {
          connection.state = 'lost';
          connection.apId = null;
          connection.timer = 0;
          sim.disconnects += 1;
          const lostMB = Math.min(sim.progressMB, B.CHUNK_LOSS_MB);
          sim.progressMB -= lostMB;
          events.push({ type: 'disconnect', deadzone: signal.deadzone, lostMB, count: sim.disconnects });
          if (!sim.hints.deadzone && sim.disconnects >= B.DEADZONE_HINT_AFTER) {
            sim.hints.deadzone = true;
            events.push({ type: 'hint', id: 'deadzone' });
          }
        }
        break;
      case 'lost':
        if (hasSignal) {
          connection.state = 'reconnecting';
          connection.apId = signal.bestApId;
          connection.timer = B.RECONNECT_S;
          events.push({ type: 'reconnect-start', apId: connection.apId });
        }
        break;
      case 'reconnecting':
        if (!hasSignal) {
          connection.state = 'lost';
          connection.apId = null;
          connection.timer = 0;
          break;
        }
        connection.timer -= dt;
        if (connection.timer <= 0) {
          connection.state = 'connected';
          connection.timer = 0;
          events.push({ type: 'reconnected', apId: connection.apId });
        }
        break;
      default:
        break;
    }
  }

  function updateRates(sim) {
    const connection = sim.connection;
    const ap = connection.apId ? apById(sim.level, connection.apId) : null;
    sim.quality = ap ? sim.signal.perAp[ap.id] || 0 : 0;
    sim.load = ap ? sim.loads[ap.id] || 0 : 0;
    sim.potentialRate = ap ? downloadRate(ap, sim.quality, sim.load, sim.balance) : 0;
    sim.rate = connection.state === 'connected' ? sim.potentialRate : 0;
  }

  function updateDownload(sim, dt, events) {
    if (sim.rate <= 0) return;
    const B = sim.balance;
    sim.progressMB = Math.min(sim.sizeMB, sim.progressMB + sim.rate * dt);
    if (sim.progressMB >= sim.sizeMB * B.STALL_AT) {
      sim.progressMB = sim.sizeMB * B.STALL_AT;
      sim.phase = 'stalling';
      sim.stallS = B.STALL_S;
      sim.rate = 0;
      events.push({ type: 'stall-start' });
    }
  }

  function updateHints(sim, dt, events) {
    const B = sim.balance;
    if (!sim.hints.hall && sim.t >= B.HALL_NUDGE_S) {
      sim.hints.hall = true;
      if (sim.room === 'hoersaal') events.push({ type: 'hint', id: 'hall', clients: sim.load });
    }
    if (sim.phase !== 'running' || sim.rate >= B.SLOW_RATE) return;
    sim.slowS += dt;
    sim.trickleS += dt;
    if (sim.trickleS >= B.TRICKLE_INTERVAL_S) {
      sim.trickleS -= B.TRICKLE_INTERVAL_S;
      events.push({ type: 'trickle', amount: B.TRICKLE_FRUST });
    }
    if (!sim.hints.slow && sim.slowS >= B.SLOW_HINT_S) {
      sim.hints.slow = true;
      events.push({ type: 'hint', id: 'slow' });
    }
  }

  function updateCountdown(sim, dt, events) {
    const B = sim.balance;
    sim.countdownS -= dt;
    if (sim.countdownS > 0) return;
    sim.expiries += 1;
    if (sim.expiries >= B.MAX_EXPIRIES) {
      // Keine Sackgasse: Beim letzten Ablauf rettet der USB-Stick der Kommilitonin.
      sim.countdownS = 0;
      sim.phase = 'done';
      sim.progressMB = sim.sizeMB;
      sim.rate = 0;
      events.push({ type: 'mercy', expiries: sim.expiries });
      return;
    }
    const minShare = B.RESIDUAL_MIN[Math.min(sim.expiries - 1, B.RESIDUAL_MIN.length - 1)];
    const residual = Math.max(sim.progressMB * B.RESIDUAL_FACTOR, Math.min(sim.progressMB, sim.sizeMB * minShare));
    sim.progressMB = residual;
    sim.countdownS = B.RETRY_COUNTDOWN_S;
    sim.countdownTotalS = B.RETRY_COUNTDOWN_S;
    events.push({ type: 'expired', expiries: sim.expiries, residualMB: residual, countdownS: sim.countdownS });
  }

  /**
   * Ein Simulationsschritt.
   * @param {object} sim aus createSim()
   * @param {number} dtMs vergangene Zeit (wird auf BALANCE.MAX_DT_MS begrenzt)
   * @param {{dx:number, dy:number}} [input] Richtung je Achse (−1, 0, 1)
   * @returns {Array<object>} Ereignisse dieses Schritts
   */
  function stepSim(sim, dtMs, input = {}) {
    const events = [];
    if (sim.isFrozen || sim.phase === 'ready') return events;
    const B = sim.balance;
    const dt = clamp(Number(dtMs) || 0, 0, B.MAX_DT_MS) / 1000;
    if (dt <= 0) return events;

    sim.worldT += dt;
    updateWorld(sim);
    if (sim.phase === 'done') return events;

    tickTimers(sim, dt);
    movePlayer(sim, dt, input || {}, events);
    handleJanitor(sim, events);
    collectPickups(sim, events);

    if (sim.phase === 'stalling') {
      sim.stallS -= dt;
      if (sim.stallS <= 0) {
        sim.phase = 'done';
        sim.progressMB = sim.sizeMB;
        sim.rate = 0;
        events.push({ type: 'complete' });
      }
      return events;
    }

    sim.t += dt;
    respawnPickups(sim);
    updateOutage(sim, dt, events);
    updateSignal(sim);
    updateConnection(sim, dt, events);
    updateRates(sim);
    updateDownload(sim, dt, events);
    updateHints(sim, dt, events);
    if (sim.phase === 'running') updateCountdown(sim, dt, events);
    return events;
  }

  /**
   * Löst die Simulation wie ein perfekter Spieler: zum besten Platz, Download voll.
   * @returns {Array<object>} [{ type: 'complete', solvedBy: 'debug' }]
   */
  function solveSim(sim) {
    startSim(sim);
    sim.isFrozen = false;
    const best = sim.level.bestSpot;
    Object.assign(sim.player, { x: best.x, y: best.y, vx: 0, vy: 0 });
    sim.offlineIds = [];
    sim.outage.state = 'done';
    sim.outage.timer = 0;
    updateSignal(sim);
    sim.connection = { state: 'connected', apId: sim.signal.bestApId, timer: 0 };
    updateRates(sim);
    sim.room = roomIdAt(best.x, best.y, sim.level);
    sim.progressMB = sim.sizeMB;
    sim.phase = 'done';
    sim.rate = 0;
    return [{ type: 'complete', solvedBy: 'debug' }];
  }

  /** Flacher, JSON-tauglicher Zustand für Tests und getDebugInfo(). */
  function getSnapshot(sim) {
    return {
      phase: sim.phase,
      isFrozen: sim.isFrozen,
      t: round(sim.t, 2),
      player: { x: round(sim.player.x, 1), y: round(sim.player.y, 1) },
      room: sim.room,
      inCrowd: sim.inCrowd,
      isWet: sim.isWet,
      connection: sim.connection.state,
      apId: sim.connection.apId,
      quality: round(sim.quality, 3),
      bars: barsFor(sim.quality, sim.balance.BAR_THRESHOLDS),
      load: sim.load,
      rate: round(sim.rate, 3),
      progress: round(sim.progressMB / sim.sizeMB, 4),
      progressMB: round(sim.progressMB, 2),
      sizeMB: sim.sizeMB,
      countdownS: round(sim.countdownS, 2),
      expiries: sim.expiries,
      disconnects: sim.disconnects,
      brezels: sim.brezels,
      coffeeS: round(sim.effects.coffeeS, 2),
      repeaterS: round(sim.effects.repeaterS, 2),
      outage: { state: sim.outage.state, apId: sim.outage.apId, timer: round(sim.outage.timer, 2) },
      offlineIds: [...sim.offlineIds],
      hints: { ...sim.hints },
      fileName: sim.fileName,
    };
  }

  /**
   * Brutto-Frust (Prozentpunkte), den die Szene für diese Ereignisse bucht –
   * für Balance-Tests (ohne Erleichterungen durch Brezeln und Kapitelabschluss).
   */
  function estimateFrustration(events, balance = BALANCE) {
    const F = balance.FEEDBACK;
    let total = 0;
    for (const event of events) {
      if (event.type === 'disconnect') total += F.DISCONNECT_FRUST;
      else if (event.type === 'expired' || event.type === 'mercy') total += F.EXPIRY_FRUST;
      else if (event.type === 'hint' && event.id === 'hall') total += F.HALL_FRUST;
      else if (event.type === 'stall-start') total += F.STALL_FRUST;
      else if (event.type === 'janitor' && event.isAngry) total += F.JANITOR_FRUST;
      else if (event.type === 'trickle') total += event.amount;
    }
    return total;
  }

  return Object.freeze({
    LEVEL,
    BALANCE,
    TEXTS,
    // Hilfen
    fill,
    clamp,
    // Geometrie
    pointInRect,
    circleIntersectsRect,
    clipSegment,
    segmentIntersectsRect,
    moveCircle,
    diagonalSegments,
    // Welt
    findRoom,
    roomIdAt,
    findDeadzone,
    apById,
    pathPosition,
    cycleLength,
    countWallsBetween,
    signalQuality,
    evaluateSignal,
    barsFor,
    computeApLoads,
    downloadRate,
    crowdAt,
    isWetAt,
    // Formatierung
    formatNumber,
    formatMB,
    formatSize,
    formatRate,
    formatDuration,
    formatEta,
    formatCountdown,
    // Simulation
    hasGlobalRng,
    createSim,
    startSim,
    stepSim,
    solveSim,
    getSnapshot,
    estimateFrustration,
  });
})();
