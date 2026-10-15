/**
 * ProgressBar.js – Abgerundeter, animierter Fortschrittsbalken (UI.ProgressBar).
 *
 * Die Füllung ist exakt die Spur-Form, rechts bei value·width abgeschnitten – dadurch
 * sehen auch sehr kleine Werte (1–5 %) sauber aus, ohne verzerrte Rundungen.
 * Zusätzlich gibt es einen unbestimmten Modus (laufendes Segment) für „lädt …“.
 *
 * Positionierung über die linke obere Ecke (Container). Event 'change'(value).
 *
 * Global: hängt UI.ProgressBar an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js).
 */

UI.ProgressBar = (() => {
  /** Animationsdauer: Grundzeit + Anteil je Wegstrecke (ms), begrenzt. */
  const ANIMATION = { BASE_MS: 180, PER_UNIT_MS: 620, MAX_MS: 700, EASE: 'Cubic.easeOut' };
  /** Unbestimmter Modus: Segmentbreite (Anteil) und Umlaufzeit. */
  const INDETERMINATE = { SEGMENT: 0.32, CYCLE_MS: 1300 };

  const clamp01 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  };

  return class ProgressBar extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke
     * @param {number} y
     * @param {object} [opts]
     * @param {number} [opts.width=200]
     * @param {number} [opts.height=14]
     * @param {number} [opts.value=0] 0..1
     * @param {number} [opts.color=CONFIG.COLORS.PRIMARY] Füllfarbe
     * @param {number} [opts.bgColor=CONFIG.COLORS.BORDER] Spurfarbe
     * @param {number} [opts.radius] Eckenradius, Standard height/2 (Pille)
     * @param {number} [opts.bgAlpha=1] Deckkraft der Spur
     */
    constructor(scene, x, y, { width = 200, height = 14, value = 0, color = CONFIG.COLORS.PRIMARY, bgColor = CONFIG.COLORS.BORDER, radius, bgAlpha = 1 } = {}) {
      super(scene, x, y);
      this.barWidth = Math.max(2, width);
      this.barHeight = Math.max(2, height);
      this.radius = Math.max(0, Math.min(radius === undefined || radius === null ? this.barHeight / 2 : radius, this.barHeight / 2, this.barWidth / 2));
      this.fillColor = color;
      this.trackColor = bgColor;
      this.trackAlpha = bgAlpha;
      this.value = clamp01(value);
      this.shownValue = this.value;
      this.valueTween = null;
      this.indeterminateTween = null;
      this.segmentStart = 0;

      this.track = new Phaser.GameObjects.Graphics(scene);
      this.fill = new Phaser.GameObjects.Graphics(scene);
      this.add([this.track, this.fill]);
      this.setSize(this.barWidth, this.barHeight);
      scene.add.existing(this);

      this.drawTrack();
      this.drawFill();
    }

    /**
     * Setzt den Wert (0..1), standardmäßig weich animiert.
     * @param {number} v01
     * @param {boolean} [animate=true]
     * @returns {this}
     */
    setValue(v01, animate = true) {
      const target = clamp01(v01);
      const changed = target !== this.value;
      this.value = target;
      this.stopValueTween();
      if (!animate || !this.scene || Math.abs(target - this.shownValue) < 0.0005) {
        this.shownValue = target;
        this.drawFill();
      } else {
        const distance = Math.abs(target - this.shownValue);
        this.valueTween = this.scene.tweens.addCounter({
          from: this.shownValue,
          to: target,
          duration: Math.min(ANIMATION.MAX_MS, ANIMATION.BASE_MS + distance * ANIMATION.PER_UNIT_MS),
          ease: ANIMATION.EASE,
          onUpdate: (tween) => {
            this.shownValue = tween.getValue();
            this.drawFill();
          },
          onComplete: () => {
            this.valueTween = null;
            this.shownValue = this.value;
            this.drawFill();
          },
        });
      }
      if (changed) this.emit('change', target);
      return this;
    }

    /** @returns {number} Zielwert 0..1 (nicht der gerade animierte Zwischenwert) */
    getValue() {
      return this.value;
    }

    /** @returns {number} aktuell dargestellter Wert 0..1 (während der Animation) */
    getDisplayedValue() {
      return this.shownValue;
    }

    /** Ändert die Füllfarbe. @returns {this} */
    setColor(color) {
      this.fillColor = color;
      this.drawFill();
      return this;
    }

    /** Ändert die Spurfarbe. @returns {this} */
    setTrackColor(color, alpha = this.trackAlpha) {
      this.trackColor = color;
      this.trackAlpha = alpha;
      this.drawTrack();
      return this;
    }

    /**
     * Unbestimmter Modus: ein Segment läuft durch die Spur (Dauer-Animation nur mit Anlass,
     * z. B. während eines Ladevorgangs).
     * @param {boolean} isOn
     * @returns {this}
     */
    setIndeterminate(isOn) {
      if (isOn && !this.indeterminateTween && this.scene) {
        this.stopValueTween();
        this.indeterminateTween = this.scene.tweens.addCounter({
          from: -INDETERMINATE.SEGMENT,
          to: 1,
          duration: INDETERMINATE.CYCLE_MS,
          ease: 'Sine.easeInOut',
          repeat: -1,
          onUpdate: (tween) => {
            this.segmentStart = tween.getValue();
            this.drawFill();
          },
        });
      } else if (!isOn && this.indeterminateTween) {
        this.indeterminateTween.stop();
        this.indeterminateTween = null;
        this.drawFill();
      }
      return this;
    }

    /** @returns {boolean} */
    isIndeterminate() {
      return Boolean(this.indeterminateTween);
    }

    // --- intern -------------------------------------------------------------

    stopValueTween() {
      if (this.valueTween) {
        this.valueTween.stop();
        this.valueTween = null;
      }
    }

    drawTrack() {
      this.track.clear();
      this.track.fillStyle(this.trackColor, this.trackAlpha);
      this.track.fillRoundedRect(0, 0, this.barWidth, this.barHeight, this.radius);
    }

    drawFill() {
      const g = this.fill;
      g.clear();
      if (this.indeterminateTween) {
        const from = Math.max(0, this.segmentStart) * this.barWidth;
        const to = Math.min(1, this.segmentStart + INDETERMINATE.SEGMENT) * this.barWidth;
        if (to - from > 0.5) this.fillShape(g, from, to);
        return;
      }
      const width = this.shownValue * this.barWidth;
      if (width > 0.25) this.fillShape(g, 0, width);
    }

    /** Füllt die Spur-Form zwischen x0 und x1 (exakter Ausschnitt der abgerundeten Form). */
    fillShape(g, x0, x1) {
      const W = this.barWidth;
      const H = this.barHeight;
      const r = this.radius;
      // vertikaler Einzug der Kontur an Stelle x (0 im geraden Mittelteil)
      const inset = (x) => {
        let dx = 0;
        if (x < r) dx = r - x;
        else if (x > W - r) dx = x - (W - r);
        else return 0;
        return r - Math.sqrt(Math.max(0, r * r - dx * dx));
      };
      const xs = [x0];
      const step = Math.max(0.5, r / 8);
      for (let x = Math.ceil(x0); x < x1; x += step) {
        if ((x < r || x > W - r) && x > x0) xs.push(x);
      }
      if (x0 < r && x1 > r) xs.push(r);
      if (x1 > W - r && x0 < W - r) xs.push(W - r);
      xs.push(x1);
      xs.sort((a, b) => a - b);

      const points = xs.map((x) => ({ x, y: inset(x) }));
      for (let i = xs.length - 1; i >= 0; i--) points.push({ x: xs[i], y: H - inset(xs[i]) });
      g.fillStyle(this.fillColor, 1);
      g.fillPoints(points, true, true);
    }

    preDestroy() {
      this.stopValueTween();
      if (this.indeterminateTween) {
        this.indeterminateTween.stop();
        this.indeterminateTween = null;
      }
      super.preDestroy();
    }
  };
})();
