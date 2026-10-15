/**
 * Toast.js – Kurze Android-Benachrichtigung unten mittig (UI.toast, UI.Toast).
 *
 * Dunkle Pille (Mittelpunkt der untersten Pille bei y ≈ HEIGHT − 64), weißer Text,
 * bei Varianten ein farbiges Symbol links ('error', 'success', 'warning').
 * Mehrere Toasts stapeln sich nach oben (der älteste unten); verschwindet einer,
 * rutschen die anderen nach. Höchstens MAX_STACK gleichzeitig – sonst geht der älteste.
 * Toasts blockieren keine Eingaben, liegen auf CONFIG.DEPTH.TOAST und nutzen nur
 * Szenen-Zeit (pausieren also mit der Szene).
 *
 * Global: keins – hängt UI.toast (Funktion) und UI.Toast (Klasse) an.
 * Abhängigkeiten: Phaser, CONFIG, UI (theme.js).
 */
(function () {
  const COLORS = CONFIG.COLORS;

  /** Maße (px). */
  const LAYOUT = Object.freeze({
    BASE_CENTER_Y: CONFIG.HEIGHT - 64, // Mitte der untersten (einzeiligen) Pille
    MAX_WIDTH: 560,
    MIN_WIDTH: 120,
    PADDING_X: 20,
    PADDING_Y: 10,
    FONT_SIZE: 15,
    ICON_RADIUS: 9,
    ICON_GAP: 10,
    GAP: 8,           // Abstand zwischen gestapelten Toasts
    MAX_RADIUS: 21,
    RISE: 14,         // Einblenden von unten
    MAX_STACK: 4,
  });

  const STYLE = Object.freeze({
    BG: 0x323232,
    BG_ALPHA: 0.96,
    SHADOW_ALPHA: 0.28,
    TEXT: '#ffffff',
  });

  const TIMING = Object.freeze({ FADE_IN_MS: 180, FADE_OUT_MS: 220, MOVE_MS: 180 });

  /** Symbol je Variante (auf dunklem Grund gut lesbare Töne). */
  const VARIANTS = Object.freeze({
    default: null,
    error: { color: 0xf28b82, symbol: '!', ink: 0x3c0d0a },
    success: { color: 0x81c995, symbol: 'check', ink: 0x0d3b1a },
    warning: { color: COLORS.HAZARD, symbol: '!', ink: 0x3a2e00 },
  });

  /** Szene → Toasts in Erstellungsreihenfolge (ältester zuerst = unten). */
  const stacks = new WeakMap();

  const Stack = {
    of(scene) {
      let stack = stacks.get(scene);
      if (!stack) {
        stack = [];
        stacks.set(scene, stack);
      }
      return stack;
    },

    remove(toast, scene) {
      const stack = stacks.get(scene);
      if (!stack) return;
      const index = stack.indexOf(toast);
      if (index >= 0) stack.splice(index, 1);
    },

    /** Positionen neu berechnen: ältester unten, jeder weitere darüber. */
    layout(scene, animate) {
      const stack = stacks.get(scene);
      if (!stack) return;
      let bottom = LAYOUT.BASE_CENTER_Y + Stack.singleLineHeight() / 2;
      stack.forEach((toast) => {
        const targetY = Math.round(bottom - toast.toastHeight);
        toast.moveTo(targetY, animate);
        bottom = targetY - LAYOUT.GAP;
      });
    },

    singleLineHeight() {
      return Math.round(LAYOUT.FONT_SIZE * 1.25) + 2 * LAYOUT.PADDING_Y;
    },
  };

  class UIToast extends Phaser.GameObjects.Container {
    /**
     * Lieber UI.toast(scene, text, opts) benutzen.
     * @param {Phaser.Scene} scene
     * @param {string} text
     * @param {{duration?: number, variant?: string}} [opts]
     */
    constructor(scene, text, { duration = CONFIG.TIMING.TOAST_MS, variant = 'default' } = {}) {
      super(scene, 0, 0);
      this.variantName = Object.prototype.hasOwnProperty.call(VARIANTS, variant) ? variant : 'default';
      this.isDismissed = false;
      this.targetY = null;
      this.moveTween = null;

      const def = VARIANTS[this.variantName];
      const iconSpace = def ? LAYOUT.ICON_RADIUS * 2 + LAYOUT.ICON_GAP : 0;
      const wrapWidth = LAYOUT.MAX_WIDTH - 2 * LAYOUT.PADDING_X - iconSpace;
      this.textObject = UI.text(scene, 0, 0, String(text), {
        size: LAYOUT.FONT_SIZE, color: STYLE.TEXT, wrap: wrapWidth, align: 'center', lineSpacing: 3,
      });
      const width = Math.round(Math.max(LAYOUT.MIN_WIDTH, this.textObject.width + iconSpace + 2 * LAYOUT.PADDING_X));
      const height = Math.round(Math.max(Stack.singleLineHeight(), this.textObject.height + 2 * LAYOUT.PADDING_Y));
      this.toastWidth = width;
      this.toastHeight = height;
      this.setSize(width, height);

      const radius = Math.min(height / 2, LAYOUT.MAX_RADIUS);
      const bg = scene.add.graphics();
      bg.fillStyle(COLORS.SHADOW, STYLE.SHADOW_ALPHA);
      bg.fillRoundedRect(0, 2, width, height, radius);
      bg.fillStyle(STYLE.BG, STYLE.BG_ALPHA);
      bg.fillRoundedRect(0, 0, width, height, radius);
      this.add(bg);

      const contentLeft = Math.round((width - (iconSpace + this.textObject.width)) / 2);
      if (def) this.add(this.createIcon(def, contentLeft + LAYOUT.ICON_RADIUS, height / 2));
      this.textObject.setPosition(contentLeft + iconSpace, Math.round((height - this.textObject.height) / 2));
      this.add(this.textObject);

      this.setDepth(CONFIG.DEPTH.TOAST);
      this.setPosition(Math.round((CONFIG.WIDTH - width) / 2), LAYOUT.BASE_CENTER_Y);
      scene.add.existing(this);

      // In den Stapel; zu viele → ältesten sofort ausblenden
      const stack = Stack.of(scene);
      stack.push(this);
      while (stack.length > LAYOUT.MAX_STACK) stack[0].dismiss();
      Stack.layout(scene, true);

      // Einblenden von unten
      this.setAlpha(0);
      this.y = this.targetY + LAYOUT.RISE;
      this.moveTo(this.targetY, true);
      scene.tweens.add({ targets: this, alpha: 1, duration: TIMING.FADE_IN_MS, ease: 'Quad.easeOut' });

      this.timer = scene.time.delayedCall(Math.max(0, duration), () => this.dismiss());
    }

    /** Blendet den Toast aus (die übrigen rutschen nach). Mehrfachaufruf ist harmlos. @returns {this} */
    dismiss() {
      if (this.isDismissed || !this.scene) return this;
      this.isDismissed = true;
      const scene = this.scene;
      if (this.timer) this.timer.remove(false);
      Stack.remove(this, scene);
      Stack.layout(scene, true);
      scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: TIMING.FADE_OUT_MS,
        ease: 'Quad.easeIn',
        onComplete: () => this.destroy(),
      });
      return this;
    }

    /** @returns {string} angezeigter Text */
    getText() {
      return this.textObject.text;
    }

    /** Fährt (optional animiert) an die Stapel-Position. */
    moveTo(targetY, animate) {
      this.targetY = targetY;
      if (this.moveTween) {
        this.moveTween.stop();
        this.moveTween = null;
      }
      if (!animate || !this.scene) {
        this.y = targetY;
        return;
      }
      if (this.y === targetY) return;
      this.moveTween = this.scene.tweens.add({
        targets: this,
        y: targetY,
        duration: TIMING.MOVE_MS,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.moveTween = null;
        },
      });
    }

    /** Farbiger Kreis mit „!“ bzw. Haken. */
    createIcon(def, cx, cy) {
      const scene = this.scene;
      const holder = scene.add.container(cx, cy);
      const g = scene.add.graphics();
      g.fillStyle(def.color, 1);
      g.fillCircle(0, 0, LAYOUT.ICON_RADIUS);
      holder.add(g);
      if (def.symbol === 'check') {
        g.lineStyle(2.2, def.ink, 1);
        g.beginPath();
        g.moveTo(-4.5, 0.5);
        g.lineTo(-1.2, 3.8);
        g.lineTo(4.5, -3.2);
        g.strokePath();
      } else {
        g.fillStyle(def.ink, 1);
        g.fillRoundedRect(-1.3, -5.5, 2.6, 7, 1);
        g.fillCircle(0, 4.4, 1.5);
      }
      return holder;
    }

    destroy(fromScene) {
      if (!this.scene) return;
      const scene = this.scene;
      if (this.timer) this.timer.remove(false);
      if (this.moveTween) this.moveTween.stop();
      this.moveTween = null;
      const wasInStack = (stacks.get(scene) || []).includes(this);
      Stack.remove(this, scene);
      super.destroy(fromScene);
      if (wasInStack && !fromScene) Stack.layout(scene, true);
    }

    /** Alle Toasts der Szene ausblenden. */
    static dismissAll(scene) {
      const stack = stacks.get(scene);
      if (stack) stack.slice().forEach((toast) => toast.dismiss());
    }

    /** @returns {UIToast[]} sichtbare (nicht ausblendende) Toasts, ältester zuerst */
    static getActive(scene) {
      const stack = stacks.get(scene);
      return stack ? stack.slice() : [];
    }
  }

  UI.Toast = UIToast;

  /**
   * Zeigt einen Toast unten mittig.
   * @param {Phaser.Scene} scene
   * @param {string} text
   * @param {{duration?: number, variant?: 'default'|'error'|'success'|'warning'}} [opts]
   * @returns {UIToast|null} der Toast-Container (null bei leerem Text oder ohne Szene)
   */
  UI.toast = function toast(scene, text, opts = {}) {
    if (!scene || !scene.sys || !scene.add) return null;
    const str = text === undefined || text === null ? '' : String(text);
    if (!str) return null;
    return new UIToast(scene, str, opts || {});
  };
})();
