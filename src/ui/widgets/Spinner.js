/**
 * Spinner.js – Rotierender Lade-Bogen im Android-Stil (UI.Spinner).
 *
 * Der Bogen dreht sich und wächst/schrumpft dabei (Material-Prinzip: Kopf läuft vor,
 * Schwanz holt auf). Läuft nur zwischen start() und stop(); stop() blendet ihn aus.
 * Animation über das Update-Event der Szene → pausiert automatisch mit der Szene.
 *
 * Positionierung über die linke obere Ecke (Container, Größe size×size).
 *
 * Global: hängt UI.Spinner an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js).
 */

UI.Spinner = (() => {
  const TAU = Math.PI * 2;
  /** Taktung (ms): eine Umdrehung der Grundrotation, ein Wachsen-/Schrumpfen-Zyklus. */
  const ROTATION_MS = 1568;
  const CYCLE_MS = 1333;
  /** Bogenlänge zwischen kürzester und längster Ausdehnung (Bogenmaß). */
  const MIN_ARC = TAU * 0.05;
  const MAX_ARC = TAU * 0.75;

  const easeInOutCubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

  return class Spinner extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke
     * @param {number} y
     * @param {object} [opts]
     * @param {number} [opts.size=28]
     * @param {number} [opts.color=CONFIG.COLORS.PRIMARY]
     * @param {number} [opts.thickness=3]
     * @param {boolean} [opts.autoStart=true] sofort drehen
     * @param {boolean} [opts.track=false] blasse Kreisspur unter dem Bogen
     */
    constructor(scene, x, y, { size = 28, color = CONFIG.COLORS.PRIMARY, thickness = 3, autoStart = true, track = false } = {}) {
      super(scene, x, y);
      this.size = size;
      this.color = color;
      this.thickness = thickness;
      this.hasTrack = track;
      this.elapsed = 0;
      this.running = false;

      this.arc = new Phaser.GameObjects.Graphics(scene);
      this.arc.setPosition(size / 2, size / 2);
      this.add(this.arc);
      this.setSize(size, size);
      scene.add.existing(this);

      this.draw();
      if (autoStart) this.start();
      else this.setVisible(false);
    }

    /** Startet die Drehung und zeigt den Spinner. @returns {this} */
    start() {
      this.setVisible(true);
      if (!this.running && this.scene) {
        this.running = true;
        this.scene.events.on('update', this.handleUpdate, this);
      }
      return this;
    }

    /** Hält an und blendet den Spinner aus. @returns {this} */
    stop() {
      if (this.running && this.scene) this.scene.events.off('update', this.handleUpdate, this);
      this.running = false;
      this.setVisible(false);
      return this;
    }

    /** @returns {boolean} */
    isRunning() {
      return this.running;
    }

    /** Ändert die Farbe. @returns {this} */
    setColor(color) {
      this.color = color;
      this.draw();
      return this;
    }

    handleUpdate(time, delta) {
      this.elapsed += delta;
      this.draw();
    }

    draw() {
      const g = this.arc;
      const radius = (this.size - this.thickness) / 2;
      const cycles = this.elapsed / CYCLE_MS;
      const round = Math.floor(cycles);
      const phase = cycles - round;
      const sweep = MAX_ARC - MIN_ARC;
      // Kopf wächst in der ersten Zyklushälfte, Schwanz holt in der zweiten auf
      const head = easeInOutCubic(Math.min(1, phase * 2)) * sweep;
      const tail = easeInOutCubic(Math.max(0, phase * 2 - 1)) * sweep;
      const base = round * sweep + (this.elapsed / ROTATION_MS) * TAU - Math.PI / 2;
      const start = base + tail;
      const end = base + head + MIN_ARC;

      g.clear();
      if (this.hasTrack) {
        g.lineStyle(this.thickness, this.color, 0.16);
        g.strokeCircle(0, 0, radius);
      }
      g.lineStyle(this.thickness, this.color, 1);
      g.beginPath();
      g.arc(0, 0, radius, start, end, false);
      g.strokePath();
      // runde Enden
      g.fillStyle(this.color, 1);
      g.fillCircle(Math.cos(start) * radius, Math.sin(start) * radius, this.thickness / 2);
      g.fillCircle(Math.cos(end) * radius, Math.sin(end) * radius, this.thickness / 2);
    }

    preDestroy() {
      if (this.running && this.scene) this.scene.events.off('update', this.handleUpdate, this);
      this.running = false;
      super.preDestroy();
    }
  };
})();
