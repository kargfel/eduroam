/**
 * Checkbox.js – Kontrollkästchen mit Beschriftung (UI.Checkbox).
 *
 * Android-Optik: abgerundetes Kästchen, angehakt in System-Blau mit weißem Haken,
 * dezenter Hover-Schein. Klick auf Kästchen ODER Beschriftung schaltet um (wie <label>).
 * Optional `width` für umbrechende Beschriftungen, `color` für dunklen Hintergrund.
 *
 * Global: keins – hängt UI.Checkbox an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js).
 */
(function () {
  const COLORS = CONFIG.COLORS;
  const CSS = CONFIG.CSS;

  /** Maße (px). */
  const LAYOUT = Object.freeze({
    BOX: 20,
    RADIUS: 4,
    GAP: 10,         // Kästchen ↔ Beschriftung
    HIT_PADDING: 4,  // Klickfläche etwas größer als sichtbar
    HALO_RADIUS: 17,
    CHECK_WIDTH: 2.6,
  });

  const STYLE = Object.freeze({
    BORDER: 0x5f6368,
    BORDER_HOVER: 0x202124,
    HALO_ALPHA: 0.1,
    DISABLED_ALPHA: 0.45,
  });

  const TIMING = Object.freeze({ POP_MS: 90, POP_SCALE: 1.15 });

  class UICheckbox extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke
     * @param {number} y
     * @param {object} [opts]
     * @param {string} [opts.label='']
     * @param {boolean} [opts.checked=false]
     * @param {number} [opts.fontSize=15]
     * @param {Function|null} [opts.onChange=null] (checked, checkbox)
     * @param {boolean} [opts.disabled=false]
     * @param {number|null} [opts.width=null] Gesamtbreite → Beschriftung bricht um
     * @param {string|null} [opts.color=null] CSS-Farbe der Beschriftung (Standard CONFIG.CSS.TEXT)
     * @param {boolean} [opts.sound=true]
     */
    constructor(scene, x, y, opts = {}) {
      const {
        label = '', checked = false, fontSize = 15, onChange = null,
        disabled = false, width = null, color = null, sound = true,
      } = opts;
      super(scene, x, y);

      this.checked = Boolean(checked);
      this.enabled = !disabled;
      this.onChange = onChange;
      this.playsSound = sound !== false;
      this.isHovered = false;
      this.isPressed = false;
      this.fixedWidth = width;
      this.labelColor = color || CSS.TEXT;

      const textX = LAYOUT.BOX + LAYOUT.GAP;
      this.labelText = UI.text(scene, textX, 0, String(label ?? ''), {
        size: fontSize, color: this.labelColor, wrap: width ? width - textX : null,
      });
      this.boxGraphics = scene.add.graphics();
      this.hitRect = scene.add.rectangle(0, 0, 1, 1).setOrigin(0);
      this.hitRect.setInteractive({ useHandCursor: true });
      this.add([this.boxGraphics, this.labelText, this.hitRect]);

      this.hitRect.on('pointerover', () => {
        this.isHovered = true;
        this.draw();
      });
      this.hitRect.on('pointerout', () => {
        this.isHovered = false;
        this.isPressed = false;
        this.draw();
      });
      this.hitRect.on('pointerdown', (pointer) => {
        if (!this.enabled || (pointer && pointer.button !== 0)) return;
        this.isPressed = true;
      });
      this.hitRect.on('pointerup', () => {
        if (!this.isPressed) return;
        this.isPressed = false;
        if (this.enabled) this.toggle();
      });

      this.layout();
      this.setEnabled(this.enabled);
      scene.add.existing(this);
    }

    // ================================================================ öffentliche API

    /** @returns {boolean} */
    isChecked() {
      return this.checked;
    }

    /**
     * @param {boolean} isChecked
     * @param {{silent?: boolean}} [options] silent: kein 'change'-Event/onChange
     * @returns {this}
     */
    setChecked(isChecked, { silent = false } = {}) {
      const next = Boolean(isChecked);
      if (next === this.checked) return this;
      this.checked = next;
      this.draw();
      this.pop();
      if (!silent) {
        this.emit('change', next, this);
        if (this.scene && typeof this.onChange === 'function') this.onChange(next, this);
      }
      return this;
    }

    /** Umschalten wie ein Klick (mit Klang und Event). @returns {this} */
    toggle() {
      if (this.playsSound) UI.sound('click');
      return this.setChecked(!this.checked);
    }

    /**
     * Aktiviert/deaktiviert (deaktiviert = blasser, kein Umschalten).
     * @param {boolean} isEnabled
     * @returns {this}
     */
    setEnabled(isEnabled) {
      this.enabled = Boolean(isEnabled);
      if (!this.enabled) this.isPressed = false;
      if (this.hitRect.input) this.hitRect.input.cursor = this.enabled ? 'pointer' : false;
      if (!this.enabled && this.isHovered && this.scene) this.scene.input.resetCursor();
      const alpha = this.enabled ? 1 : STYLE.DISABLED_ALPHA;
      this.boxGraphics.setAlpha(alpha);
      this.labelText.setAlpha(alpha);
      this.draw();
      return this;
    }

    /** @returns {boolean} */
    isEnabled() {
      return this.enabled;
    }

    /** @param {string} str @returns {this} */
    setLabel(str) {
      this.labelText.setText(String(str ?? ''));
      this.layout();
      return this;
    }

    // ================================================================ intern

    /** Kästchen auf die erste Textzeile zentrieren, Klickfläche über alles legen. */
    layout() {
      const lines = Math.max(1, this.labelText.getWrappedText ? this.labelText.getWrappedText().length : 1);
      const lineSpacing = this.labelText.lineSpacing || 0;
      const lineHeight = (this.labelText.height - lineSpacing * (lines - 1)) / lines;
      const rowHeight = Math.max(LAYOUT.BOX, Math.round(lineHeight));
      this.labelText.y = Math.round((rowHeight - lineHeight) / 2);
      this.boxGraphics.setPosition(LAYOUT.BOX / 2, rowHeight / 2);

      const hasLabel = this.labelText.text.length > 0;
      const contentWidth = hasLabel ? this.labelText.x + this.labelText.width : LAYOUT.BOX;
      const totalWidth = this.fixedWidth ? Math.max(this.fixedWidth, LAYOUT.BOX) : contentWidth;
      const totalHeight = Math.max(rowHeight, this.labelText.y + this.labelText.height);
      this.setSize(totalWidth, totalHeight);

      const pad = LAYOUT.HIT_PADDING;
      this.hitRect.setPosition(-pad, -pad);
      this.hitRect.setSize(totalWidth + 2 * pad, totalHeight + 2 * pad);
      if (this.hitRect.input && this.hitRect.input.hitArea) {
        this.hitRect.input.hitArea.setSize(totalWidth + 2 * pad, totalHeight + 2 * pad);
      }
      this.draw();
    }

    /** Zeichnet das Kästchen um den Ursprung (damit der Pop-Effekt aus der Mitte kommt). */
    draw() {
      const g = this.boxGraphics;
      const half = LAYOUT.BOX / 2;
      const isActive = this.isHovered && this.enabled;
      g.clear();
      if (isActive) {
        g.fillStyle(COLORS.PRIMARY, STYLE.HALO_ALPHA);
        g.fillCircle(0, 0, LAYOUT.HALO_RADIUS);
      }
      if (this.checked) {
        g.fillStyle(COLORS.PRIMARY, 1);
        g.fillRoundedRect(-half, -half, LAYOUT.BOX, LAYOUT.BOX, LAYOUT.RADIUS);
        g.lineStyle(LAYOUT.CHECK_WIDTH, COLORS.WHITE, 1);
        g.beginPath();
        g.moveTo(-5.5, 0.5);
        g.lineTo(-1.5, 4.5);
        g.lineTo(5.5, -4);
        g.strokePath();
      } else {
        g.fillStyle(COLORS.SURFACE, 1);
        g.fillRoundedRect(-half, -half, LAYOUT.BOX, LAYOUT.BOX, LAYOUT.RADIUS);
        g.lineStyle(2, isActive ? STYLE.BORDER_HOVER : STYLE.BORDER, 1);
        g.strokeRoundedRect(-half + 1, -half + 1, LAYOUT.BOX - 2, LAYOUT.BOX - 2, LAYOUT.RADIUS - 1);
      }
    }

    /** Kurzer Pop beim Umschalten (Bewegung antwortet auf die Aktion). */
    pop() {
      if (!this.scene) return;
      this.scene.tweens.killTweensOf(this.boxGraphics);
      this.boxGraphics.setScale(1);
      this.scene.tweens.add({
        targets: this.boxGraphics,
        scale: TIMING.POP_SCALE,
        duration: TIMING.POP_MS,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => this.boxGraphics.setScale(1),
      });
    }
  }

  UI.Checkbox = UICheckbox;
})();
