/**
 * Button.js – Schaltfläche im Stil echter Systemdialoge (UI.Button).
 *
 * Varianten: 'primary' (System-Blau), 'secondary' (weiß mit Rahmen), 'danger' (Rot),
 * 'success' (Grün), 'ghost' (Text-Button ohne Fläche), 'link' (unterstrichener Link).
 * Mit `onDark: true` werden 'ghost' und 'link' für dunklen Hintergrund eingefärbt.
 *
 * - Positionierung über die linke obere Ecke; `width: 'auto'` misst die Beschriftung.
 * - Klickfläche ist ein Rectangle-Kind (Container-Hit-Areas sind in Phaser versetzt).
 * - Ein Klick zählt beim Loslassen, wenn der Druck auch auf dem Button begann.
 * - Zu lange Beschriftungen werden verkleinert statt abgeschnitten.
 * - Klänge nur über UI.sound('click').
 *
 * Global: keins – hängt UI.Button an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js).
 */
(function () {
  const COLORS = CONFIG.COLORS;

  /** Maße (px). */
  const LAYOUT = Object.freeze({
    RADIUS: 7,
    PADDING_X: 16,       // Innenabstand links/rechts
    MIN_AUTO_WIDTH: 88,  // Mindestbreite bei width: 'auto'
    MIN_FONT_SIZE: 12,   // kleiner wird die Schrift beim Einpassen nicht
    LINE_HEIGHT_RATIO: 1.25, // Zeilenhöhe relativ zur Schriftgröße (für zweizeilige Beschriftung)
    WRAP_MARGIN_Y: 8,    // Mindest-Innenabstand oben+unten bei zwei Zeilen
    ICON_SIZE: 20,
    ICON_GAP: 8,
    PRESS_OFFSET: 1,     // Inhalt rutscht beim Drücken nach unten
    SHADOW_OFFSET: 2,
    UNDERLINE_RATIO: 0.38, // Abstand Unterstreichung ↔ Textmitte relativ zur Texthöhe
  });

  /** Optik unabhängig von der Variante. */
  const STYLE = Object.freeze({
    SHADOW_COLOR: COLORS.SHADOW,
    SHADOW_ALPHA: 0.16,
    DISABLED_ALPHA: 0.45,
    FONT_WEIGHT: '600',
    LINK_FONT_WEIGHT: 'normal',
  });

  /**
   * Farben je Variante. fill/hover/press: Flächenfarbe (fehlt = transparent),
   * *Alpha: Deckkraft der Fläche, text/textHover: Schrift, border/borderHover: Rahmen.
   */
  const VARIANTS = Object.freeze({
    primary: { fill: COLORS.PRIMARY, hover: 0x1967d2, press: COLORS.PRIMARY_DARK, text: COLORS.WHITE, shadow: true },
    secondary: {
      fill: COLORS.SURFACE, hover: 0xf3f7fe, press: 0xe3edfd, text: COLORS.PRIMARY,
      border: 0xc4c7c5, borderHover: 0x9ebef5,
    },
    danger: { fill: COLORS.DANGER, hover: 0xc80017, press: 0xa80014, text: COLORS.WHITE, shadow: true },
    success: { fill: COLORS.SUCCESS, hover: 0x188038, press: 0x137333, text: COLORS.WHITE, shadow: true },
    ghost: { hover: COLORS.PRIMARY, hoverAlpha: 0.08, press: COLORS.PRIMARY, pressAlpha: 0.16, text: COLORS.PRIMARY },
    link: { text: COLORS.PRIMARY, textHover: COLORS.PRIMARY_DARK, underline: true },
  });

  /** Abweichende Farben für dunklen Hintergrund (Option onDark). */
  const DARK_VARIANTS = Object.freeze({
    ghost: {
      hover: COLORS.WHITE, hoverAlpha: 0.1, press: COLORS.WHITE, pressAlpha: 0.18, text: COLORS.TEXT_INVERSE,
      border: COLORS.WHITE, borderAlpha: 0.4, borderHover: COLORS.WHITE,
    },
    link: { text: 0x8ab4f8, textHover: 0xaecbfa, underline: true },
  });

  const ELLIPSIS = '…';

  /** 0xRRGGBB → '#rrggbb' */
  const toCss = (color) => '#' + color.toString(16).padStart(6, '0');

  /** Setzt Größe UND Hit-Area eines interaktiven Rectangles (die Hit-Area ist eine Kopie). */
  const setHitSize = (rect, width, height) => {
    rect.setSize(width, height);
    if (rect.input && rect.input.hitArea) rect.input.hitArea.setSize(width, height);
  };

  /** Ändert die Textfarbe nur bei Bedarf (setColor rendert den Text sonst neu). */
  const setTextColor = (textObject, css) => {
    if (textObject.style.color !== css) textObject.setColor(css);
  };

  class UIButton extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke
     * @param {number} y
     * @param {object} [opts]
     * @param {string} [opts.text='']
     * @param {number|'auto'} [opts.width=180] 'auto' = Breite aus der Beschriftung (mind. minWidth)
     * @param {number} [opts.height=44]
     * @param {string} [opts.variant='primary'] 'primary'|'secondary'|'danger'|'success'|'ghost'|'link'
     * @param {number} [opts.fontSize=17]
     * @param {string|null} [opts.icon=null] Textur-Key links neben dem Text (wird in Textfarbe getönt)
     * @param {Function|null} [opts.onClick=null] (button) => void
     * @param {boolean} [opts.disabled=false]
     * @param {boolean} [opts.sound=true] Klick-Klang über UI.sound('click')
     * @param {boolean} [opts.onDark=false] 'ghost'/'link' hell für dunklen Hintergrund
     * @param {number} [opts.minWidth=88] Mindestbreite bei width: 'auto'
     */
    constructor(scene, x, y, opts = {}) {
      const {
        text = '', width = 180, height = 44, variant = 'primary', fontSize = 17, icon = null,
        onClick = null, disabled = false, sound = true, onDark = false, minWidth = LAYOUT.MIN_AUTO_WIDTH,
      } = opts;
      super(scene, x, y);

      this.isAutoWidth = width === 'auto';
      this.minWidth = minWidth;
      this.baseFontSize = fontSize;
      this.variantName = VARIANTS[variant] ? variant : 'primary';
      this.isOnDark = Boolean(onDark);
      this.onClick = typeof onClick === 'function' ? onClick : null;
      this.playsSound = sound !== false;
      this.enabled = !disabled;
      this.isHovered = false;
      this.isPressed = false;
      this.setSize(this.isAutoWidth ? minWidth : width, height);

      this.bg = scene.add.graphics();
      this.content = scene.add.container(0, 0);
      this.labelString = String(text ?? '');
      this.label = UI.text(scene, 0, 0, this.labelString, { size: fontSize, origin: { x: 0, y: 0.5 }, align: 'center', lineSpacing: 0 });
      this.underline = scene.add.rectangle(0, 0, 1, 1, COLORS.PRIMARY).setOrigin(0, 0);
      this.iconImage = null;
      if (icon && scene.textures.exists(icon)) {
        this.iconImage = scene.add.image(0, 0, icon).setDisplaySize(LAYOUT.ICON_SIZE, LAYOUT.ICON_SIZE);
      }
      this.content.add([this.label, this.underline]);
      if (this.iconImage) this.content.add(this.iconImage);

      this.hitRect = scene.add.rectangle(0, 0, this.width, this.height).setOrigin(0);
      this.hitRect.setInteractive({ useHandCursor: true });
      this.add([this.bg, this.content, this.hitRect]);

      this.hitRect.on('pointerover', this.handlePointerOver, this);
      this.hitRect.on('pointerout', this.handlePointerOut, this);
      this.hitRect.on('pointerdown', this.handlePointerDown, this);
      this.hitRect.on('pointerup', this.handlePointerUp, this);

      this.layoutContent();
      this.setEnabled(this.enabled);
      scene.add.existing(this);
    }

    // ------------------------------------------------------------------ öffentliche API

    /**
     * Aktiviert/deaktiviert den Button (deaktiviert = blasser, kein Klick, kein Hand-Cursor).
     * @param {boolean} isEnabled
     * @returns {this}
     */
    setEnabled(isEnabled) {
      this.enabled = Boolean(isEnabled);
      if (!this.enabled) this.isPressed = false;
      const input = this.hitRect.input;
      if (input) {
        input.cursor = this.enabled ? 'pointer' : false;
        // Cursor sofort anpassen, falls die Maus gerade darüber steht
        if (this.isHovered && this.scene) {
          if (this.enabled) this.scene.input.manager.setCursor(input);
          else this.scene.input.resetCursor();
        }
      }
      this.refresh();
      return this;
    }

    /** @returns {boolean} */
    isEnabled() {
      return this.enabled;
    }

    /**
     * Ändert die Beschriftung (passt Schriftgröße bzw. Auto-Breite neu an).
     * @param {string} str
     * @returns {this}
     */
    setText(str) {
      this.labelString = String(str ?? '');
      this.label.setText(this.labelString);
      this.layoutContent();
      this.refresh();
      return this;
    }

    /** @returns {string} aktuelle Beschriftung (ungekürzt) */
    getText() {
      return this.labelString;
    }

    /**
     * Wechselt die Variante ('primary'|'secondary'|'danger'|'success'|'ghost'|'link').
     * @param {string} variant
     * @returns {this}
     */
    setVariant(variant) {
      if (VARIANTS[variant]) {
        this.variantName = variant;
        this.layoutContent();
        this.refresh();
      }
      return this;
    }

    /** @returns {string} */
    getVariant() {
      return this.variantName;
    }

    /**
     * Setzt den Klick-Handler (ersetzt den bisherigen).
     * @param {Function|null} fn (button) => void
     * @returns {this}
     */
    setOnClick(fn) {
      this.onClick = typeof fn === 'function' ? fn : null;
      return this;
    }

    /**
     * Löst einen Klick programmatisch aus (wie ein echter Klick, nur wenn aktiviert).
     * @returns {this}
     */
    click() {
      if (this.enabled) this.handleClick();
      return this;
    }

    // ------------------------------------------------------------------ intern

    /** Farbschema der aktuellen Variante (ggf. Dunkel-Variante). */
    getStyle() {
      return (this.isOnDark && DARK_VARIANTS[this.variantName]) || VARIANTS[this.variantName];
    }

    /** Ordnet Icon, Text und Unterstreichung an; passt zu lange Beschriftungen ein. */
    layoutContent() {
      const style = this.getStyle();
      const weight = style.underline ? STYLE.LINK_FONT_WEIGHT : STYLE.FONT_WEIGHT;
      if (this.label.style.fontStyle !== weight) this.label.setFontStyle(weight);
      this.label.setWordWrapWidth(null);
      this.label.setText(this.labelString);
      this.label.setFontSize(this.baseFontSize);

      const iconSpace = this.iconImage ? LAYOUT.ICON_SIZE + LAYOUT.ICON_GAP : 0;
      if (this.isAutoWidth) {
        const autoWidth = Math.max(this.minWidth, Math.ceil(this.label.width + iconSpace + 2 * LAYOUT.PADDING_X));
        this.setSize(autoWidth, this.height);
        setHitSize(this.hitRect, autoWidth, this.height);
      }
      const available = this.width - 2 * LAYOUT.PADDING_X - iconSpace;
      const isMultiLine = this.fitLabel(available, !style.underline);

      const total = iconSpace + this.label.width;
      let left = Math.round((this.width - total) / 2);
      const middle = Math.round(this.height / 2);
      if (this.iconImage) {
        this.iconImage.setPosition(left + LAYOUT.ICON_SIZE / 2, middle);
        left += iconSpace;
      }
      this.label.setPosition(left, middle);

      this.underline.setVisible(Boolean(style.underline) && !isMultiLine);
      this.underline.setPosition(left, Math.round(middle + this.label.height * LAYOUT.UNDERLINE_RATIO));
      this.underline.setSize(Math.max(1, Math.round(this.label.width)), 1);
    }

    /**
     * Passt die Beschriftung in `available` px ein: erst verkleinern, dann (falls die Höhe
     * reicht) zweizeilig umbrechen, als letzte Lösung mit „…“ kürzen.
     * @returns {boolean} true, wenn die Beschriftung zweizeilig ist
     */
    fitLabel(available, canWrap) {
      const label = this.label;
      for (let size = this.baseFontSize; size >= LAYOUT.MIN_FONT_SIZE; size -= 1) {
        label.setWordWrapWidth(null);
        label.setFontSize(size);
        if (label.width <= available) return false;
        const fitsTwoLines = 2 * size * LAYOUT.LINE_HEIGHT_RATIO + LAYOUT.WRAP_MARGIN_Y <= this.height;
        if (canWrap && fitsTwoLines) {
          label.setWordWrapWidth(available, true);
          if (label.width <= available + 0.5 && label.getWrappedText().length <= 2) return true;
        }
      }
      // Notlösung: kleinste Schrift, einzeilig, gekürzt
      label.setWordWrapWidth(null);
      label.setFontSize(LAYOUT.MIN_FONT_SIZE);
      const context = label.context;
      label.style.syncFont(label.canvas, context);
      let text = this.labelString;
      while (text.length > 1 && context.measureText(text + ELLIPSIS).width > available) text = text.slice(0, -1);
      label.setText(text.trimEnd() + ELLIPSIS);
      return false;
    }

    /** Zeichnet Fläche, Rahmen und Farben passend zum Zustand (normal/hover/press/disabled). */
    refresh() {
      const style = this.getStyle();
      const state = !this.enabled ? 'normal' : this.isPressed ? 'press' : this.isHovered ? 'hover' : 'normal';
      const w = this.width;
      const h = this.height;
      const radius = Math.min(LAYOUT.RADIUS, h / 2, w / 2);
      const g = this.bg;
      g.clear();

      let fill = style.fill;
      let fillAlpha = 1;
      if (state === 'hover' && style.hover !== undefined) {
        fill = style.hover;
        fillAlpha = style.hoverAlpha ?? 1;
      } else if (state === 'press' && style.press !== undefined) {
        fill = style.press;
        fillAlpha = style.pressAlpha ?? 1;
      }

      if (style.shadow && state !== 'press') {
        g.fillStyle(STYLE.SHADOW_COLOR, STYLE.SHADOW_ALPHA);
        g.fillRoundedRect(0, LAYOUT.SHADOW_OFFSET, w, h, radius);
      }
      if (fill !== undefined) {
        g.fillStyle(fill, fillAlpha);
        g.fillRoundedRect(0, 0, w, h, radius);
      }
      if (style.border !== undefined) {
        const isActive = state !== 'normal' && style.borderHover !== undefined;
        g.lineStyle(1, isActive ? style.borderHover : style.border, isActive ? 1 : style.borderAlpha ?? 1);
        g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, radius);
      }

      const textColor = state !== 'normal' && style.textHover !== undefined ? style.textHover : style.text;
      setTextColor(this.label, toCss(textColor));
      this.underline.setFillStyle(textColor, 1);
      if (this.iconImage) this.iconImage.setTint(textColor);

      this.content.y = state === 'press' ? LAYOUT.PRESS_OFFSET : 0;
      const alpha = this.enabled ? 1 : STYLE.DISABLED_ALPHA;
      this.bg.setAlpha(alpha);
      this.content.setAlpha(alpha);
    }

    handlePointerOver() {
      this.isHovered = true;
      this.refresh();
    }

    handlePointerOut() {
      this.isHovered = false;
      this.isPressed = false;
      this.refresh();
    }

    handlePointerDown(pointer) {
      if (!this.enabled || (pointer && pointer.button !== 0)) return;
      this.isPressed = true;
      this.refresh();
    }

    handlePointerUp() {
      if (!this.isPressed) return;
      this.isPressed = false;
      this.refresh();
      if (this.enabled) this.handleClick();
    }

    /** Klang, Callback, Event – in dieser Reihenfolge; der Callback darf den Button zerstören. */
    handleClick() {
      if (this.playsSound) UI.sound('click');
      if (this.onClick) this.onClick(this);
      if (this.scene) this.emit('click', this);
    }
  }

  /** Maße für Layout-Berechnungen in Kapiteln (nur lesen). */
  UIButton.LAYOUT = LAYOUT;

  UI.Button = UIButton;
})();
