/**
 * theme.js – UI-Namespace und Text-Helfer.
 *
 * Definiert das globale Objekt UI. Alle Widgets (src/ui/widgets/*.js) hängen sich
 * als UI.Button, UI.TextInput … daran. Texte werden IMMER über UI.text() erzeugt,
 * damit Schrift, Farbe und Auflösung (scharf auf Retina) überall gleich sind.
 *
 * Global: UI. Abhängigkeiten: Phaser, CONFIG.
 */

const UI = {
  /** Text-Auflösung: auf HiDPI-Displays doppelt rendern, sonst wirkt Schrift unscharf. */
  TEXT_RESOLUTION: Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1),

  /**
   * Baut ein Phaser-Text-Style-Objekt.
   * @param {object} [opts]
   * @param {number} [opts.size=16]      Schriftgröße in px
   * @param {string} [opts.color]        CSS-Farbe, Standard CONFIG.CSS.TEXT
   * @param {string} [opts.font='UI']    Rolle aus CONFIG.FONTS (UI|PAPER|HAND|STAMP|MONO) oder freie font-family
   * @param {boolean} [opts.bold=false]
   * @param {boolean} [opts.italic=false]
   * @param {string} [opts.align='left'] 'left' | 'center' | 'right'
   * @param {number|null} [opts.wrap=null] Umbruchbreite in px
   * @param {number} [opts.lineSpacing=4]
   * @returns {Phaser.Types.GameObjects.Text.TextStyle}
   */
  textStyle({
    size = 16,
    color = CONFIG.CSS.TEXT,
    font = 'UI',
    bold = false,
    italic = false,
    align = 'left',
    wrap = null,
    lineSpacing = 4,
  } = {}) {
    const fontStyle = [italic ? 'italic' : '', bold ? 'bold' : ''].join(' ').trim() || 'normal';
    const style = {
      fontFamily: CONFIG.FONTS[font] || font,
      fontSize: `${size}px`,
      color,
      fontStyle,
      align,
      lineSpacing,
      resolution: UI.TEXT_RESOLUTION,
    };
    if (wrap) style.wordWrap = { width: wrap, useAdvancedWrap: true };
    return style;
  },

  /**
   * Erzeugt einen Text mit einheitlichem Stil. Ursprung standardmäßig links oben.
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} str
   * @param {object} [opts] wie textStyle(), zusätzlich origin (Zahl oder {x,y}) und depth
   * @returns {Phaser.GameObjects.Text}
   */
  text(scene, x, y, str, opts = {}) {
    const textObject = scene.add.text(x, y, str, UI.textStyle(opts));
    const origin = opts.origin ?? 0;
    if (typeof origin === 'number') textObject.setOrigin(origin);
    else textObject.setOrigin(origin.x ?? 0, origin.y ?? 0);
    if (opts.depth !== undefined) textObject.setDepth(opts.depth);
    return textObject;
  },

  /** x-Position, damit ein Element der Breite `width` horizontal zentriert ist. */
  centerX(width) {
    return Math.round((CONFIG.WIDTH - width) / 2);
  },

  /**
   * Spielt einen SFX-Klang, falls SFX geladen ist. Widgets rufen Klänge nur hierüber auf,
   * damit sie auch ohne Audio-Modul (Tests, Galerien) funktionieren.
   * @param {string} name Methodenname von SFX, z. B. 'click'
   */
  sound(name) {
    try {
      if (typeof SFX !== 'undefined' && typeof SFX[name] === 'function') SFX[name]();
    } catch (err) {
      // Audio ist Beiwerk: Ein Fehler hier darf das Spiel nie anhalten.
    }
  },
};
