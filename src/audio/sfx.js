/**
 * sfx.js – WebAudio-Synthesizer für alle Spielklänge (keine Audiodateien).
 *
 * - Jeder Klang ist ein kleines „Rezept“ aus Stimmen (Oszillator oder Rauschen,
 *   Hüllkurve, optional Filter/Vibrato) in SOUND_PRESETS – zentral und leicht anpassbar.
 * - Der AudioContext entsteht erst nach der ersten Nutzergeste (unlock() bzw. eigene
 *   Gesten-Listener als Sicherheitsnetz). Vorher sind alle Klänge stille No-ops – so gibt es
 *   keine Autoplay-Warnungen und keinen „Klangstau“ nach dem Entsperren.
 * - Jede öffentliche Methode ist abgesichert und wirft NIE (ohne AudioContext, in Node,
 *   bei Audio-Fehlern). Verschluckte Fehler zählt getDebugInfo() (für Tests).
 * - Stumm: Storage-Settings (setMuted) oder erzwungen über RUNTIME.muted (ohne die
 *   Settings zu überschreiben).
 * - Warteschleifenmusik (Kapitel 5): „Für Elise“ durchs Telefonband-Filter, taktweise über
 *   die Audio-Uhr geplant (onended eines stummen Timer-Oszillators, kein setTimeout);
 *   stopHoldMusic() blendet kurz aus und plant nichts mehr nach. Endet der Lauf
 *   (GameState-Status won/lost/aborted), stoppt die Warteschleife automatisch.
 *
 * Global: SFX. Abhängigkeiten: RUNTIME, Storage (Settings), RNG (Rauschen, optional),
 * GameState/EVENTS (optional, Sicherheitsnetz für die Warteschleife).
 */

const SFX = (() => {
  /** Gesamtlautstärke (angenehm leise; Kompressor verhindert Übersteuern). */
  const MASTER_VOLUME = 0.25;
  /** Untergrenze für exponentielle Rampen (0 ist dort nicht erlaubt). */
  const MIN_GAIN = 0.0001;
  /** Kleiner Vorlauf in Sekunden, damit Hüllkurven nicht angeschnitten werden. */
  const START_OFFSET = 0.005;
  /** Nachlauf nach dem Hüllkurvenende, bevor Quellen gestoppt werden. */
  const STOP_TAIL = 0.03;
  /** Standard-Anschlagzeit einer Stimme in Sekunden. */
  const DEFAULT_ATTACK = 0.008;
  /** Länge des (deterministischen) Rausch-Puffers in Sekunden und sein Seed. */
  const NOISE_SECONDS = 1;
  const NOISE_SEED = 'sfx-rauschen';
  /** Mindestabstand gleicher Klänge in Sekunden (Hover/Tippen/Ticken nicht stapeln). */
  const RATE_LIMIT = Object.freeze({ hover: 0.04, type: 0.018, tick: 0.05 });
  /** Tonhöhen-Variation beim Tippen – zyklisch statt zufällig (verschiebt den RNG-Strom nicht). */
  const TYPE_PITCHES = Object.freeze([1, 1.06, 0.95, 1.1, 0.98, 1.03, 0.92]);
  /** DOM-Gesten, die den AudioContext entsperren dürfen. */
  const UNLOCK_EVENTS = Object.freeze(['pointerdown', 'mousedown', 'touchstart', 'keydown']);
  /** Kompressor-Einstellungen (sanft, nur gegen Spitzen). */
  const COMPRESSOR = Object.freeze({ threshold: -16, knee: 10, ratio: 4, attack: 0.004, release: 0.2 });
  /** Status, bei denen die Warteschleife automatisch endet. */
  const RUN_END_STATUSES = Object.freeze(['won', 'lost', 'aborted']);

  /** Warteschleife: Dauer einer Sechzehntel, Lautstärken, Telefonband, Planungs-Vorlauf. */
  const HOLD = Object.freeze({
    STEP: 0.15,
    BUS_VOLUME: 0.85,
    MELODY_VOLUME: 0.24,
    BASS_VOLUME: 0.11,
    BASS_UNITS: 3,
    NOTE_LENGTH: 0.92, // Anteil der Notenlänge, der klingt (leicht abgesetzt)
    BASS_LENGTH: 0.95, // dito für die Bassnote
    LOW_CUT: 300,
    HIGH_CUT: 3400,
    LOOKAHEAD: 0.25,
    FADE_OUT: 0.12,
    FIRST_DELAY: 0.06,
  });

  /** Halbtonindex der Notennamen. */
  const NOTE_INDEX = Object.freeze({ C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 });

  /** Frequenz eines Notennamens wie 'A4' oder 'D#5' (A4 = 440 Hz). */
  function noteFreq(name) {
    const match = /^([A-G]#?)(-?\d)$/.exec(name);
    if (!match) return 440;
    const midi = (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * „Für Elise“ (Beethoven, gemeinfrei) – DER Warteschleifen-Klassiker. Taktweise:
   * [Note | null (Pause), Länge in Sechzehnteln, optional Bassnote].
   */
  const HOLD_BARS = Object.freeze([
    [['E5', 1], ['D#5', 1]],
    [['E5', 1], ['D#5', 1], ['E5', 1], ['B4', 1], ['D5', 1], ['C5', 1]],
    [['A4', 2, 'A3'], [null, 1], ['C4', 1], ['E4', 1], ['A4', 1]],
    [['B4', 2, 'E3'], [null, 1], ['E4', 1], ['G#4', 1], ['B4', 1]],
    [['C5', 2, 'A3'], [null, 1], ['E4', 1], ['E5', 1], ['D#5', 1]],
    [['E5', 1], ['D#5', 1], ['E5', 1], ['B4', 1], ['D5', 1], ['C5', 1]],
    [['A4', 2, 'A3'], [null, 1], ['C4', 1], ['E4', 1], ['A4', 1]],
    [['B4', 2, 'E3'], [null, 1], ['E4', 1], ['C5', 1], ['B4', 1]],
    [['A4', 4, 'A3'], [null, 2]],
  ]);

  /** Alarm: abwechselnd hoch/tief. */
  function buildAlarm() {
    const voices = [];
    for (let i = 0; i < 6; i++) {
      voices.push({
        at: i * 0.14,
        wave: 'square',
        freq: i % 2 === 0 ? 880 : 660,
        duration: 0.12,
        volume: 0.12,
        filter: { type: 'lowpass', freq: 2200 },
      });
    }
    return voices;
  }

  /** Modem: Wähltöne, Antwortton, Handshake-Zirpen und Rauschen (~1,9 s). */
  function buildModem() {
    const dtmf = [[697, 1209], [770, 1336], [852, 1477], [941, 1336]];
    const voices = [];
    dtmf.forEach(([low, high], i) => {
      voices.push({ at: i * 0.1, wave: 'sine', freq: low, duration: 0.08, volume: 0.1 });
      voices.push({ at: i * 0.1, wave: 'sine', freq: high, duration: 0.08, volume: 0.08 });
    });
    voices.push(
      { at: 0.45, wave: 'sine', freq: 2100, duration: 0.32, volume: 0.08 },
      { at: 0.82, wave: 'square', freq: 980, freqEnd: 1650, duration: 0.18, volume: 0.045, filter: { type: 'lowpass', freq: 3000 } },
      { at: 1.0, noise: true, duration: 0.55, volume: 0.2, filter: { type: 'bandpass', freq: 1800, freqEnd: 2600, q: 0.7 } },
      { at: 1.05, wave: 'sine', freq: 1650, duration: 0.25, volume: 0.05 },
      { at: 1.3, wave: 'sine', freq: 1850, duration: 0.25, volume: 0.05 },
      { at: 1.58, noise: true, duration: 0.3, volume: 0.11, filter: { type: 'lowpass', freq: 4000 } }
    );
    return voices;
  }

  /** Filter für die Posaune (gedämpftes Sägezahn-Blech). */
  const TROMBONE_FILTER = Object.freeze({ type: 'lowpass', freq: 1300 });

  /**
   * Klang-Rezepte. Stimme: { at (s), wave | noise, note | freq, freqEnd, duration (s),
   * volume (Spitze 0..1), attack (s), filter { type, freq, freqEnd, q }, vibrato { rate, depth } }.
   */
  const SOUND_PRESETS = Object.freeze({
    click: [{ wave: 'triangle', freq: 1250, freqEnd: 780, duration: 0.05, volume: 0.32 }],
    hover: [{ wave: 'sine', freq: 1650, duration: 0.03, volume: 0.07 }],
    type: [
      { noise: true, duration: 0.022, volume: 0.2, attack: 0.001, filter: { type: 'highpass', freq: 2600 } },
      { wave: 'square', freq: 210, duration: 0.012, volume: 0.035, attack: 0.001, filter: { type: 'lowpass', freq: 1500 } },
    ],
    error: [
      { wave: 'square', freq: 233, duration: 0.09, volume: 0.16, filter: { type: 'lowpass', freq: 1400 } },
      { at: 0.11, wave: 'square', freq: 175, duration: 0.16, volume: 0.16, filter: { type: 'lowpass', freq: 1200 } },
    ],
    fail: [
      { wave: 'triangle', note: 'G4', freqEnd: noteFreq('E4'), duration: 0.22, volume: 0.34 },
      { at: 0.22, wave: 'triangle', note: 'D#4', freqEnd: noteFreq('A#3'), duration: 0.4, volume: 0.34, vibrato: { rate: 6, depth: 6 } },
    ],
    success: [
      { wave: 'triangle', note: 'C5', duration: 0.12, volume: 0.28 },
      { at: 0.08, wave: 'triangle', note: 'E5', duration: 0.12, volume: 0.28 },
      { at: 0.16, wave: 'triangle', note: 'G5', duration: 0.28, volume: 0.3 },
      { at: 0.16, wave: 'sine', note: 'C6', duration: 0.32, volume: 0.1 },
    ],
    notify: [
      { wave: 'sine', note: 'G5', duration: 0.12, volume: 0.2 },
      { at: 0.1, wave: 'sine', note: 'C6', duration: 0.26, volume: 0.2 },
    ],
    popup: [
      { wave: 'sine', freq: 380, freqEnd: 820, duration: 0.09, volume: 0.24 },
      { at: 0.05, wave: 'sine', freq: 1200, duration: 0.05, volume: 0.07 },
    ],
    connect: [
      { wave: 'sine', note: 'E5', duration: 0.11, volume: 0.24 },
      { at: 0.09, wave: 'sine', note: 'A5', duration: 0.11, volume: 0.24 },
      { at: 0.18, wave: 'sine', note: 'E6', duration: 0.3, volume: 0.2 },
    ],
    disconnect: [
      { wave: 'sine', note: 'E6', duration: 0.1, volume: 0.18 },
      { at: 0.09, wave: 'sine', note: 'A5', duration: 0.1, volume: 0.2 },
      { at: 0.18, wave: 'triangle', note: 'E5', freqEnd: noteFreq('C5'), duration: 0.32, volume: 0.24 },
    ],
    pickup: [
      { wave: 'square', note: 'B5', duration: 0.07, volume: 0.12, filter: { type: 'lowpass', freq: 5000 } },
      { at: 0.07, wave: 'square', note: 'E6', duration: 0.2, volume: 0.12, filter: { type: 'lowpass', freq: 5000 } },
    ],
    alarm: buildAlarm(),
    // Dumpfer Gummistempel: tiefer Pitch-Drop-Schlag, etwas Mitten-„Körper“ (damit er auch auf
    // Laptop-/Beamer-Lautsprechern hörbar ist), gedämpftes Rauschen und leises Papier-Klacken
    stamp: [
      { wave: 'sine', freq: 150, freqEnd: 46, duration: 0.24, volume: 0.9, attack: 0.002 },
      { wave: 'triangle', freq: 260, freqEnd: 105, duration: 0.11, volume: 0.32, attack: 0.002 },
      { noise: true, duration: 0.14, volume: 0.7, attack: 0.001, filter: { type: 'lowpass', freq: 1600, freqEnd: 220 } },
      { noise: true, duration: 0.025, volume: 0.12, attack: 0.001, filter: { type: 'bandpass', freq: 2400, q: 1.2 } },
    ],
    modem: buildModem(),
    win: [
      { wave: 'triangle', note: 'C5', duration: 0.14, volume: 0.26 },
      { at: 0.13, wave: 'triangle', note: 'E5', duration: 0.14, volume: 0.26 },
      { at: 0.26, wave: 'triangle', note: 'G5', duration: 0.14, volume: 0.26 },
      { at: 0.39, wave: 'triangle', note: 'C6', duration: 0.62, volume: 0.28, vibrato: { rate: 5, depth: 4 } },
      { at: 0.39, wave: 'sine', note: 'G4', duration: 0.62, volume: 0.13 },
      { at: 0.39, wave: 'sine', note: 'E5', duration: 0.62, volume: 0.09 },
    ],
    // „Traurige Posaune“
    lose: [
      { wave: 'sawtooth', note: 'G4', duration: 0.3, volume: 0.16, filter: TROMBONE_FILTER },
      { at: 0.32, wave: 'sawtooth', note: 'F#4', duration: 0.3, volume: 0.16, filter: TROMBONE_FILTER },
      { at: 0.64, wave: 'sawtooth', note: 'F4', duration: 0.3, volume: 0.16, filter: TROMBONE_FILTER },
      { at: 0.96, wave: 'sawtooth', note: 'E4', duration: 0.85, volume: 0.16, filter: TROMBONE_FILTER, vibrato: { rate: 5.5, depth: 7 } },
    ],
    whoosh: [
      { noise: true, duration: 0.34, volume: 0.3, attack: 0.12, filter: { type: 'bandpass', freq: 350, freqEnd: 2600, q: 0.9 } },
    ],
    tick: [
      { noise: true, duration: 0.014, volume: 0.15, attack: 0.001, filter: { type: 'highpass', freq: 3800 } },
      { wave: 'square', freq: 2300, duration: 0.008, volume: 0.03, attack: 0.001 },
    ],
  });

  /** Interner Zustand. */
  const state = {
    initialized: false,
    mutedSetting: false,
    gestureSeen: false,
    contextFailed: false,
    ctx: null,
    master: null,
    noiseBuffer: null,
    listenersAttached: false,
    safetyNetAttached: false,
    lastPlayed: {},
    typeIndex: 0,
    played: 0,
    errors: 0,
    lastError: null,
    warned: new Set(),
    holdWanted: false,
    hold: null, // laufende Warteschleifen-Sitzung
    holdBarsTotal: 0,
  };

  // ---------------------------------------------------------------- Absicherung

  /** Merkt einen verschluckten Fehler (einmal pro Methode als Warnung in der Konsole). */
  function reportError(name, err) {
    state.errors++;
    state.lastError = `${name}: ${err && err.message ? err.message : err}`;
    if (state.warned.has(name)) return;
    state.warned.add(name);
    try {
      console.warn(`[SFX] ${state.lastError}`);
    } catch (ignored) {
      // Keine Konsole – egal.
    }
  }

  /** Umhüllt eine Methode so, dass sie nie wirft. */
  function guard(name, fn, fallback) {
    return function guarded(...args) {
      try {
        return fn(...args);
      } catch (err) {
        reportError(name, err);
        return typeof fallback === 'function' ? fallback() : fallback;
      }
    };
  }

  // ---------------------------------------------------------------- Zustand & Kontext

  /** @returns {boolean} effektiv stumm (Settings oder RUNTIME erzwungen) */
  function isMutedNow() {
    const forced = typeof RUNTIME !== 'undefined' && RUNTIME && RUNTIME.muted === true;
    return forced || state.mutedSetting;
  }

  /** Liest die Stummschaltung aus den Storage-Settings. */
  function readMutedSetting() {
    try {
      return typeof Storage !== 'undefined' && typeof Storage.getSettings === 'function' && Storage.getSettings().muted === true;
    } catch (err) {
      return false;
    }
  }

  function getAudioContextClass() {
    try {
      return globalThis.AudioContext || globalThis.webkitAudioContext || null;
    } catch (err) {
      return null;
    }
  }

  /** Deterministisches weißes Rauschen (über RNG.create, verschiebt den Spiel-Zufall nicht). */
  function createNoiseBuffer(ctx) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const generator = typeof RNG !== 'undefined' && typeof RNG.create === 'function' ? RNG.create(NOISE_SEED) : null;
    let lcg = 0x2545f491;
    for (let i = 0; i < length; i++) {
      if (generator) data[i] = generator.next() * 2 - 1;
      else {
        lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
        data[i] = lcg / 2147483648 - 1;
      }
    }
    return buffer;
  }

  /**
   * Liefert den AudioContext – legt ihn erst nach einer Nutzergeste an.
   * @returns {AudioContext|null}
   */
  function ensureContext() {
    if (state.ctx) return state.ctx;
    if (!state.gestureSeen || state.contextFailed) return null;
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) return null;
    try {
      const ctx = new AudioContextClass();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = COMPRESSOR.threshold;
      compressor.knee.value = COMPRESSOR.knee;
      compressor.ratio.value = COMPRESSOR.ratio;
      compressor.attack.value = COMPRESSOR.attack;
      compressor.release.value = COMPRESSOR.release;
      const master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      state.ctx = ctx;
      state.master = master;
      state.noiseBuffer = createNoiseBuffer(ctx);
      return ctx;
    } catch (err) {
      state.contextFailed = true; // nicht bei jedem Klang erneut versuchen
      reportError('AudioContext', err);
      return null;
    }
  }

  /** resume() ohne unbehandelte Promise-Ablehnung. */
  function resumeQuietly(ctx) {
    try {
      const result = ctx.resume();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (err) {
      // resume nicht möglich – nächster Versuch bei der nächsten Geste
    }
  }

  /** Gesten-Listener (Sicherheitsnetz, falls niemand unlock() aufruft). */
  function onGesture() {
    api.unlock();
  }

  function attachUnlockListeners() {
    if (state.listenersAttached || typeof globalThis.addEventListener !== 'function') return;
    state.listenersAttached = true;
    UNLOCK_EVENTS.forEach((type) => globalThis.addEventListener(type, onGesture, { capture: true, passive: true }));
  }

  function detachUnlockListeners() {
    if (!state.listenersAttached || typeof globalThis.removeEventListener !== 'function') return;
    state.listenersAttached = false;
    UNLOCK_EVENTS.forEach((type) => globalThis.removeEventListener(type, onGesture, { capture: true }));
  }

  /** Warteschleife automatisch beenden, wenn der Lauf endet (Kapitel vergisst stopHoldMusic). */
  function attachRunEndSafetyNet() {
    if (state.safetyNetAttached || typeof GameState === 'undefined' || typeof EVENTS === 'undefined') return;
    state.safetyNetAttached = true;
    GameState.on(EVENTS.STATE_CHANGED, (snapshot) => {
      if (state.holdWanted && snapshot && RUN_END_STATUSES.includes(snapshot.status)) api.stopHoldMusic();
    });
  }

  function ensureInit() {
    if (!state.initialized) api.init();
  }

  // ---------------------------------------------------------------- Synthese

  /** Trennt Knoten, ohne zu werfen. */
  function disconnectAll(nodes) {
    nodes.forEach((node) => {
      try {
        node.disconnect();
      } catch (err) {
        // schon getrennt
      }
    });
  }

  /**
   * Plant eine Stimme ein.
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {object} voice Rezept (siehe SOUND_PRESETS)
   * @param {number} baseTime Startzeit des Klangs (ctx-Zeit)
   * @param {number} [pitch=1] Tonhöhenfaktor
   * @returns {AudioScheduledSourceNode} Quelle (zum vorzeitigen Stoppen)
   */
  function scheduleVoice(ctx, destination, voice, baseTime, pitch = 1) {
    const start = baseTime + (voice.at || 0);
    const end = start + voice.duration;
    const attack = Math.min(voice.attack ?? DEFAULT_ATTACK, voice.duration / 2);
    const peak = Math.max(MIN_GAIN * 2, voice.volume ?? 0.3);
    const nodes = [];

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(MIN_GAIN, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + attack);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
    nodes.push(envelope);

    let source;
    const extraSources = [];
    if (voice.noise) {
      source = ctx.createBufferSource();
      source.buffer = state.noiseBuffer;
      source.loop = true;
    } else {
      source = ctx.createOscillator();
      source.type = voice.wave || 'sine';
      const frequency = (voice.note ? noteFreq(voice.note) : voice.freq) * pitch;
      source.frequency.setValueAtTime(frequency, start);
      if (voice.freqEnd) source.frequency.exponentialRampToValueAtTime(voice.freqEnd * pitch, end);
      if (voice.vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = voice.vibrato.rate;
        depth.gain.value = voice.vibrato.depth;
        lfo.connect(depth);
        depth.connect(source.frequency);
        lfo.start(start);
        lfo.stop(end + STOP_TAIL);
        nodes.push(lfo, depth);
        extraSources.push(lfo);
      }
    }
    nodes.push(source);

    let head = source;
    if (voice.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filter.type;
      filter.frequency.setValueAtTime(voice.filter.freq, start);
      if (voice.filter.freqEnd) filter.frequency.exponentialRampToValueAtTime(voice.filter.freqEnd, end);
      if (voice.filter.q) filter.Q.value = voice.filter.q;
      source.connect(filter);
      head = filter;
      nodes.push(filter);
    }
    head.connect(envelope);
    envelope.connect(destination);

    source.onended = () => disconnectAll(nodes);
    source.start(start);
    source.stop(end + STOP_TAIL);
    source.__extraSources = extraSources; // Vibrato-LFOs mitstoppen
    return source;
  }

  /** Spielt ein Rezept aus SOUND_PRESETS (No-op, wenn stumm oder ohne laufenden Kontext). */
  function play(name) {
    ensureInit();
    if (isMutedNow()) return;
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      resumeQuietly(ctx); // nach einer Geste klappt das; bis dahin Stille statt Klangstau
      return;
    }
    const now = ctx.currentTime;
    const minGap = RATE_LIMIT[name];
    if (minGap && now - (state.lastPlayed[name] ?? -Infinity) < minGap) return;
    state.lastPlayed[name] = now;
    let pitch = 1;
    if (name === 'type') {
      pitch = TYPE_PITCHES[state.typeIndex];
      state.typeIndex = (state.typeIndex + 1) % TYPE_PITCHES.length;
    }
    SOUND_PRESETS[name].forEach((voice) => scheduleVoice(ctx, state.master, voice, now + START_OFFSET, pitch));
    state.played++;
  }

  // ---------------------------------------------------------------- Warteschleife

  /** Stummer Oszillator als Wecker auf der Audio-Uhr: ruft onDone zum Zeitpunkt `when` auf. */
  function scheduleAudioTimer(ctx, destination, when, onDone) {
    const timer = ctx.createOscillator();
    const silent = ctx.createGain();
    silent.gain.value = 0;
    timer.connect(silent);
    silent.connect(destination); // verbunden, damit der Browser ihn sicher verarbeitet
    timer.onended = () => {
      disconnectAll([timer, silent]);
      try {
        onDone();
      } catch (err) {
        reportError('holdMusic', err);
      }
    };
    timer.start(ctx.currentTime);
    timer.stop(Math.max(ctx.currentTime + 0.01, when));
    return timer;
  }

  /** Plant Takt `barIndex` der Warteschleife und den Wecker für den nächsten Takt. */
  function scheduleHoldBar(session, barIndex, barStart) {
    if (state.hold !== session || !state.ctx) return;
    const ctx = state.ctx;
    const start = Math.max(barStart, ctx.currentTime + START_OFFSET);
    let time = start;
    for (const [note, units, bass] of HOLD_BARS[barIndex]) {
      const length = units * HOLD.STEP;
      if (note) {
        const melody = { wave: 'triangle', note, duration: length * HOLD.NOTE_LENGTH, volume: HOLD.MELODY_VOLUME };
        trackHoldSource(session, scheduleVoice(ctx, session.bus, melody, time));
      }
      if (bass) {
        const bassVoice = { wave: 'triangle', note: bass, duration: HOLD.BASS_UNITS * HOLD.STEP * HOLD.BASS_LENGTH, volume: HOLD.BASS_VOLUME };
        trackHoldSource(session, scheduleVoice(ctx, session.bus, bassVoice, time));
      }
      time += length;
    }
    session.bars++;
    state.holdBarsTotal++;
    const nextIndex = (barIndex + 1) % HOLD_BARS.length;
    const barEnd = time;
    session.timer = scheduleAudioTimer(ctx, session.bus, barEnd - HOLD.LOOKAHEAD, () =>
      scheduleHoldBar(session, nextIndex, barEnd)
    );
  }

  /** Merkt laufende Quellen der Sitzung (zum sauberen Stoppen). */
  function trackHoldSource(session, source) {
    session.sources.add(source);
    const previous = source.onended;
    source.onended = (event) => {
      session.sources.delete(source);
      if (previous) previous(event);
    };
  }

  /** Startet die Wiedergabe der Warteschleife, falls möglich (Kontext läuft, nicht stumm). */
  function startHoldPlayback() {
    if (state.hold || isMutedNow()) return;
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running') return; // startet nach unlock()
    const bus = ctx.createGain();
    bus.gain.value = HOLD.BUS_VOLUME;
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = HOLD.LOW_CUT;
    const highCut = ctx.createBiquadFilter();
    highCut.type = 'lowpass';
    highCut.frequency.value = HOLD.HIGH_CUT;
    bus.connect(lowCut);
    lowCut.connect(highCut);
    highCut.connect(state.master);
    const session = { bus, filters: [lowCut, highCut], sources: new Set(), timer: null, bars: 0 };
    state.hold = session;
    scheduleHoldBar(session, 0, ctx.currentTime + HOLD.FIRST_DELAY);
  }

  /** Beendet die Wiedergabe: kurz ausblenden, alle Quellen stoppen, nichts nachplanen. */
  function stopHoldPlayback() {
    const session = state.hold;
    if (!session) return;
    state.hold = null; // ab jetzt plant kein Wecker mehr nach
    const ctx = state.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const stopAt = now + HOLD.FADE_OUT;
    try {
      session.bus.gain.cancelScheduledValues(now);
      session.bus.gain.setValueAtTime(session.bus.gain.value, now);
      session.bus.gain.linearRampToValueAtTime(0, stopAt);
    } catch (err) {
      reportError('stopHoldMusic', err);
    }
    const stoppables = [...session.sources];
    if (session.timer) stoppables.push(session.timer);
    stoppables.forEach((source) => {
      [source, ...(source.__extraSources || [])].forEach((node) => {
        try {
          node.stop(stopAt + STOP_TAIL);
        } catch (err) {
          // schon gestoppt
        }
      });
    });
    session.sources.clear();
    // Bus und Filter nach dem Ausblenden abbauen (Wecker hängt direkt am Master).
    scheduleAudioTimer(ctx, state.master, stopAt + STOP_TAIL * 2, () => disconnectAll([session.bus, ...session.filters]));
  }

  // ---------------------------------------------------------------- öffentliche API

  const api = {
    /** Liest die Settings (muted) und richtet das Entsperren per Nutzergeste ein. Mehrfach aufrufbar. */
    init: guard('init', () => {
      state.mutedSetting = readMutedSetting();
      state.initialized = true;
      attachUnlockListeners();
      attachRunEndSafetyNet();
    }),

    /**
     * Nach einer Nutzergeste aufrufen: legt den AudioContext an bzw. setzt ihn fort.
     * @returns {Promise<boolean>} true, wenn Audio läuft (lehnt nie ab)
     */
    unlock: guard(
      'unlock',
      () => {
        ensureInit();
        state.gestureSeen = true;
        const ctx = ensureContext();
        if (!ctx) return Promise.resolve(false);
        const finish = () => {
          const isRunning = ctx.state === 'running';
          if (isRunning) {
            detachUnlockListeners();
            if (state.holdWanted) startHoldPlayback();
          }
          return isRunning;
        };
        if (ctx.state === 'running') return Promise.resolve(finish());
        let resumed;
        try {
          resumed = ctx.resume();
        } catch (err) {
          return Promise.resolve(false);
        }
        return Promise.resolve(resumed).then(
          () => {
            try {
              return finish();
            } catch (err) {
              reportError('unlock', err);
              return false;
            }
          },
          () => false
        );
      },
      () => Promise.resolve(false)
    ),

    /**
     * Stummschaltung setzen und in den Storage-Settings speichern.
     * @param {boolean} muted
     */
    setMuted: guard('setMuted', (muted) => {
      ensureInit();
      state.mutedSetting = Boolean(muted);
      try {
        if (typeof Storage !== 'undefined') Storage.setSettings({ muted: state.mutedSetting });
      } catch (err) {
        reportError('setMuted', err);
      }
      if (isMutedNow()) stopHoldPlayback();
      else if (state.holdWanted) startHoldPlayback();
    }),

    /** @returns {boolean} effektiv stumm (Settings oder RUNTIME.muted) */
    isMuted: guard(
      'isMuted',
      () => {
        ensureInit();
        return isMutedNow();
      },
      true
    ),

    /**
     * Schaltet die gespeicherte Stummschaltung um.
     * @returns {boolean} neuer effektiver Zustand (bei RUNTIME.muted immer true)
     */
    toggleMuted: guard(
      'toggleMuted',
      () => {
        ensureInit();
        api.setMuted(!state.mutedSetting);
        return isMutedNow();
      },
      true
    ),

    /** Startet die Warteschleifen-Melodie (idempotent; spielt, sobald Audio verfügbar und nicht stumm). */
    startHoldMusic: guard('startHoldMusic', () => {
      ensureInit();
      state.holdWanted = true;
      startHoldPlayback();
    }),

    /** Stoppt die Warteschleifen-Melodie sauber (kurzes Ausblenden, nichts wird nachgeplant). */
    stopHoldMusic: guard('stopHoldMusic', () => {
      state.holdWanted = false;
      stopHoldPlayback();
    }),

    /** @returns {boolean} Zusatz: Warteschleife ist eingeschaltet (gestartet und nicht gestoppt) */
    isHoldMusicPlaying: guard('isHoldMusicPlaying', () => state.holdWanted, false),

    /** Zusatz: Zustand für Tests und Fehlersuche. */
    getDebugInfo: guard(
      'getDebugInfo',
      () => ({
        hasContext: Boolean(state.ctx),
        contextState: state.ctx ? state.ctx.state : 'none',
        muted: isMutedNow(),
        played: state.played,
        errors: state.errors,
        lastError: state.lastError,
        holdMusicWanted: state.holdWanted,
        holdMusicActive: Boolean(state.hold),
        holdMusicSources: state.hold ? state.hold.sources.size : 0,
        holdMusicBars: state.holdBarsTotal,
      }),
      () => ({ errors: state.errors })
    ),

    /** Zusatz: Namen aller Klänge (für Galerien/Tests). */
    SOUND_NAMES: Object.freeze(Object.keys(SOUND_PRESETS)),
  };

  // Klang-Methoden: SFX.click(), SFX.stamp() …
  Object.keys(SOUND_PRESETS).forEach((name) => {
    api[name] = guard(name, () => play(name));
  });

  return api;
})();
