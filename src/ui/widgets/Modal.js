/**
 * Modal.js – Systemdialog mit Abdunklung (UI.Modal).
 *
 * - Dunkelt den ganzen Bildschirm der Szene ab (schwarz, Alpha 0.55) und blockiert alle
 *   Eingaben darunter (Abdunklung und Panel sind interaktiv und liegen oben).
 * - Panel: weiß, Rundung 8 px, Icon (Textur `icon-<typ>` falls vorhanden, sonst eigenes
 *   Symbol per Graphics), Titel, Text, optional eigener Inhalt, Buttons rechtsbündig unten
 *   (passen sie nicht in eine Zeile, stehen sie untereinander in voller Breite).
 * - Höhe ergibt sich aus dem Inhalt; zentriert (unter der HUD-Leiste, falls die HUD läuft).
 * - Tiefe CONFIG.DEPTH.MODAL (gestapelte Dialoge jeweils etwas höher).
 * - Beim Öffnen: UI.TextInput.blurAll(scene) und offene Dropdowns schließen.
 * - Escape schließt nur, wenn closeOnEscape (Standard: wie closeOnBackdrop).
 *
 * Buttons: { text, variant, onClick(modal, button), keepOpen = false }. Ohne variant ist der
 * letzte Button 'primary', die anderen 'secondary'. onClick darf `false` liefern, um den
 * Dialog offen zu halten. onClose(result, modal) mit result = { reason, button, index },
 * reason: 'button' | 'backdrop' | 'escape' | 'api'.
 *
 * Global: keins – hängt UI.Modal an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js),
 * UI.Button (Laufzeit); optional UI.TextInput, UI.Dropdown.
 */
(function () {
  const COLORS = CONFIG.COLORS;
  const CSS = CONFIG.CSS;

  /** Maße (px). */
  const LAYOUT = Object.freeze({
    RADIUS: 8,
    PADDING: 24,
    ICON_SIZE: 32,
    ICON_GAP: 14,
    TITLE_SIZE: 19,
    TEXT_SIZE: 15,
    SECTION_GAP: 14,
    BUTTON_HEIGHT: 40,
    BUTTON_GAP: 8,
    BUTTON_MIN_WIDTH: 96,
    BUTTON_FONT_SIZE: 15,
    BUTTONS_TOP_GAP: 22,
    SCREEN_MARGIN: 12,
    BACKDROP_BLEED: 60, // Abdunklung größer als der Bildschirm (Screenshake!)
    STACK_DEPTH_STEP: 2,
  });

  const STYLE = Object.freeze({
    BACKDROP_COLOR: COLORS.SHADOW,
    BACKDROP_ALPHA: 0.55,
    BODY_COLOR: '#3c4043',
    SHADOW_ALPHA: 0.22,
    START_SCALE: 0.94,
  });

  const TIMING = Object.freeze({ OPEN_MS: 170, CLOSE_MS: 130 });

  /** Icon-Typen: Farbe + Symbol für den Graphics-Fallback. */
  const ICONS = Object.freeze({
    info: { color: COLORS.PRIMARY, symbol: 'i' },
    warning: { color: COLORS.WARNING, symbol: '!' },
    error: { color: COLORS.DANGER, symbol: 'x' },
    success: { color: COLORS.SUCCESS, symbol: 'check' },
    question: { color: COLORS.PRIMARY, symbol: '?' },
  });

  /** Szene → Stapel offener Dialoge (unten → oben). */
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
    remove(modal, scene) {
      const stack = stacks.get(scene);
      if (!stack) return;
      const index = stack.indexOf(modal);
      if (index >= 0) stack.splice(index, 1);
    },
  };

  /** Bereich, in dem der Dialog zentriert wird: unter der HUD-Leiste, falls sie läuft. */
  const centerArea = (scene) => {
    let isHudCovering = false;
    try {
      isHudCovering = scene.sys.settings.key !== 'HUD' && Boolean(scene.scene.isActive('HUD'));
    } catch (err) {
      isHudCovering = false;
    }
    return isHudCovering ? CONFIG.PLAY_AREA : { x: 0, y: 0, width: CONFIG.WIDTH, height: CONFIG.HEIGHT };
  };

  class UIModal extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} [opts]
     * @param {string} [opts.title='']
     * @param {string} [opts.text='']
     * @param {string|null} [opts.icon=null] 'info'|'warning'|'error'|'success'|'question'
     * @param {number} [opts.width=460]
     * @param {Array<object>} [opts.buttons=[{ text: 'OK', variant: 'primary' }]]
     * @param {boolean} [opts.closeOnBackdrop=false] Klick auf die Abdunklung schließt
     * @param {boolean} [opts.closeOnEscape=closeOnBackdrop]
     * @param {Function|null} [opts.content=null] (container, innerWidth, modal) => Höhe in px
     * @param {Function|null} [opts.onClose=null] (result, modal)
     * @param {boolean} [opts.sound=true] UI.sound('popup') beim Öffnen
     */
    constructor(scene, opts = {}) {
      const {
        title = '', text = '', icon = null, width = 460,
        buttons = [{ text: 'OK', variant: 'primary' }],
        closeOnBackdrop = false, closeOnEscape = closeOnBackdrop,
        content = null, onClose = null, sound = true,
      } = opts;
      super(scene, 0, 0);

      this.panelWidth = width;
      this.closeOnBackdrop = Boolean(closeOnBackdrop);
      this.closeOnEscape = Boolean(closeOnEscape);
      this.onClose = typeof onClose === 'function' ? onClose : null;
      this.isOpenFlag = true;
      this.buttons = [];
      this.seenEvents = new WeakSet();

      const stack = Stack.of(scene);
      this.setDepth(CONFIG.DEPTH.MODAL + stack.length * LAYOUT.STACK_DEPTH_STEP);
      stack.push(this);

      // Eingaben darunter beenden
      if (UI.TextInput && typeof UI.TextInput.blurAll === 'function') UI.TextInput.blurAll(scene);
      if (UI.Dropdown && typeof UI.Dropdown.closeAll === 'function') UI.Dropdown.closeAll(scene);

      // Abdunklung: fängt alle Klicks ab
      const bleed = LAYOUT.BACKDROP_BLEED;
      this.backdrop = scene.add.rectangle(-bleed, -bleed, CONFIG.WIDTH + 2 * bleed, CONFIG.HEIGHT + 2 * bleed,
        STYLE.BACKDROP_COLOR, STYLE.BACKDROP_ALPHA).setOrigin(0);
      this.backdrop.setInteractive();
      this.backdrop.on('pointerdown', () => {
        if (this.closeOnBackdrop) this.close({ reason: 'backdrop' });
      });
      this.add(this.backdrop);

      // Panel: äußerer Container in der Mitte (für den Skalier-Effekt), innerer ab links oben
      // (Name „panelBody“, weil „body“ in Phaser für Physik reserviert ist)
      this.panel = scene.add.container(0, 0);
      this.panelBody = scene.add.container(0, 0);
      this.panel.add(this.panelBody);
      this.add(this.panel);

      const innerWidth = width - 2 * LAYOUT.PADDING;
      let y = LAYOUT.PADDING;

      // Kopfzeile: Icon + Titel
      const iconObject = icon ? this.createIcon(icon, LAYOUT.PADDING, y) : null;
      const titleX = LAYOUT.PADDING + (iconObject ? LAYOUT.ICON_SIZE + LAYOUT.ICON_GAP : 0);
      this.titleText = null;
      let headerHeight = iconObject ? LAYOUT.ICON_SIZE : 0;
      if (title) {
        this.titleText = UI.text(scene, titleX, y, String(title), {
          size: LAYOUT.TITLE_SIZE, bold: true, color: CSS.TEXT, wrap: width - LAYOUT.PADDING - titleX,
        });
        if (iconObject && this.titleText.height < LAYOUT.ICON_SIZE) {
          this.titleText.y = y + Math.round((LAYOUT.ICON_SIZE - this.titleText.height) / 2);
        }
        headerHeight = Math.max(headerHeight, this.titleText.y - y + this.titleText.height);
        this.panelBody.add(this.titleText);
      }
      if (iconObject) this.panelBody.add(iconObject);
      if (headerHeight > 0) y += headerHeight + LAYOUT.SECTION_GAP;

      // Text
      this.messageText = null;
      if (text) {
        this.messageText = UI.text(scene, LAYOUT.PADDING, y, String(text), {
          size: LAYOUT.TEXT_SIZE, color: STYLE.BODY_COLOR, wrap: innerWidth, lineSpacing: 5,
        });
        this.panelBody.add(this.messageText);
        y += this.messageText.height + LAYOUT.SECTION_GAP;
      }

      // Eigener Inhalt
      this.content = scene.add.container(LAYOUT.PADDING, y);
      this.panelBody.add(this.content);
      if (typeof content === 'function') {
        const result = content(this.content, innerWidth, this);
        const contentHeight = typeof result === 'number' ? result : this.content.getBounds().height;
        if (contentHeight > 0) y += contentHeight + LAYOUT.SECTION_GAP;
      }

      // Buttons
      y += LAYOUT.BUTTONS_TOP_GAP - LAYOUT.SECTION_GAP;
      y = this.layoutButtons(Array.isArray(buttons) ? buttons : [], y, innerWidth);
      const panelHeight = Math.round(y + LAYOUT.PADDING);

      // Hintergrund ganz nach unten; Panel-Fläche schluckt Klicks (sonst träfen sie die Abdunklung)
      const background = scene.add.graphics();
      background.fillStyle(COLORS.SHADOW, STYLE.SHADOW_ALPHA * 0.5);
      background.fillRoundedRect(-2, 2, width + 4, panelHeight + 6, LAYOUT.RADIUS + 2);
      background.fillStyle(COLORS.SHADOW, STYLE.SHADOW_ALPHA);
      background.fillRoundedRect(0, 2, width, panelHeight + 1, LAYOUT.RADIUS);
      background.fillStyle(COLORS.SURFACE, 1);
      background.fillRoundedRect(0, 0, width, panelHeight, LAYOUT.RADIUS);
      this.panelHit = scene.add.rectangle(0, 0, width, panelHeight).setOrigin(0);
      this.panelHit.setInteractive();
      this.panelBody.addAt([background, this.panelHit], 0);
      this.panelHeight = panelHeight;

      // Zentrieren (nie über den oberen Rand bzw. unter die HUD)
      const area = centerArea(scene);
      const centerX = Math.round(area.x + area.width / 2);
      const minCenterY = area.y + LAYOUT.SCREEN_MARGIN + panelHeight / 2;
      const centerY = Math.round(Math.max(minCenterY, area.y + area.height / 2));
      this.panel.setPosition(centerX, centerY);
      this.panelBody.setPosition(-Math.round(width / 2), -Math.round(panelHeight / 2));

      // Escape
      this.handleKeyDown = (event) => this.onKeyDown(event);
      if (scene.input && scene.input.keyboard) scene.input.keyboard.on('keydown', this.handleKeyDown);

      scene.add.existing(this);

      // Einblenden (nicht bei 0 starten: Alpha 0 wäre nicht klickbar → Eingaben gingen durch)
      this.backdrop.setAlpha(0.02);
      this.panel.setAlpha(0.02).setScale(STYLE.START_SCALE);
      scene.tweens.add({ targets: this.backdrop, alpha: 1, duration: TIMING.OPEN_MS, ease: 'Quad.easeOut' });
      scene.tweens.add({ targets: this.panel, alpha: 1, scale: 1, duration: TIMING.OPEN_MS, ease: 'Cubic.easeOut' });
      if (sound) UI.sound('popup');
    }

    // ================================================================ öffentliche API

    /**
     * Schließt den Dialog (blendet aus und zerstört sich danach). Mehrfachaufruf ist harmlos.
     * @param {{reason?: string, button?: object, index?: number}} [info]
     * @returns {this}
     */
    close(info = {}) {
      if (!this.isOpenFlag) return this;
      this.isOpenFlag = false;
      const scene = this.scene;
      Stack.remove(this, scene);
      this.detachKeyboard();
      const result = {
        reason: info.reason || 'api',
        button: info.button || null,
        index: info.index !== undefined ? info.index : -1,
      };
      if (scene) {
        if (UI.Dropdown && typeof UI.Dropdown.closeAll === 'function') UI.Dropdown.closeAll(scene);
        if (UI.TextInput && typeof UI.TextInput.getFocused === 'function') {
          const focused = UI.TextInput.getFocused(scene);
          let node = focused;
          while (node && node !== this) node = node.parentContainer;
          if (focused && node === this) focused.blur();
        }
        scene.tweens.killTweensOf([this.backdrop, this.panel]); // laufendes Einblenden abbrechen
        scene.tweens.add({
          targets: [this.backdrop, this.panel],
          alpha: 0,
          duration: TIMING.CLOSE_MS,
          ease: 'Quad.easeIn',
          onComplete: () => this.destroy(),
        });
      }
      this.emit('close', result, this);
      if (this.onClose) this.onClose(result, this);
      return this;
    }

    /** @returns {boolean} false, sobald close() aufgerufen wurde */
    isOpen() {
      return this.isOpenFlag;
    }

    /** @returns {UI.Button[]} die Buttons in Reihenfolge der Konfiguration */
    getButtons() {
      return this.buttons.slice();
    }

    /** Ändert den Text des Dialogs (ohne Neu-Layout – nur für gleich lange Texte gedacht). */
    setText(str) {
      if (this.messageText) this.messageText.setText(String(str ?? ''));
      return this;
    }

    // ================================================================ intern

    /** Buttons rechtsbündig in einer Zeile oder (zu breit) untereinander; liefert neues y. */
    layoutButtons(specs, y, innerWidth) {
      if (specs.length === 0) return y - LAYOUT.BUTTONS_TOP_GAP; // kein Abstand für fehlende Buttons
      const scene = this.scene;
      const created = specs.map((spec, index) => {
        const variant = spec.variant || (index === specs.length - 1 ? 'primary' : 'secondary');
        const button = new UI.Button(scene, 0, 0, {
          text: spec.text || 'OK',
          variant,
          width: 'auto',
          minWidth: LAYOUT.BUTTON_MIN_WIDTH,
          height: LAYOUT.BUTTON_HEIGHT,
          fontSize: LAYOUT.BUTTON_FONT_SIZE,
          icon: spec.icon || null,
          onClick: () => this.handleButton(spec, index),
        });
        return button;
      });
      const totalWidth = created.reduce((sum, button) => sum + button.width, 0) + LAYOUT.BUTTON_GAP * (created.length - 1);
      if (totalWidth <= innerWidth) {
        let x = LAYOUT.PADDING + innerWidth - totalWidth;
        created.forEach((button) => {
          button.setPosition(x, y);
          x += button.width + LAYOUT.BUTTON_GAP;
        });
        y += LAYOUT.BUTTON_HEIGHT;
      } else {
        // Zu breit: untereinander, volle Breite, Reihenfolge wie konfiguriert
        created.forEach((button, index) => {
          const fullWidth = new UI.Button(scene, LAYOUT.PADDING, y, {
            text: specs[index].text || 'OK',
            variant: button.getVariant(),
            width: innerWidth,
            height: LAYOUT.BUTTON_HEIGHT,
            fontSize: LAYOUT.BUTTON_FONT_SIZE,
            icon: specs[index].icon || null,
            onClick: () => this.handleButton(specs[index], index),
          });
          button.destroy();
          created[index] = fullWidth;
          y += LAYOUT.BUTTON_HEIGHT + LAYOUT.BUTTON_GAP;
        });
        y -= LAYOUT.BUTTON_GAP;
      }
      this.buttons = created;
      this.panelBody.add(created);
      return y;
    }

    handleButton(spec, index) {
      if (!this.isOpenFlag) return; // Ausblenden läuft bereits
      let keepOpen = Boolean(spec.keepOpen);
      if (typeof spec.onClick === 'function') {
        const result = spec.onClick(this, spec);
        if (result === false) keepOpen = true;
      }
      if (!keepOpen && this.isOpenFlag) this.close({ reason: 'button', button: spec, index });
    }

    onKeyDown(event) {
      if (!event || this.seenEvents.has(event)) return;
      this.seenEvents.add(event);
      if (event.key !== 'Escape' || !this.isOpenFlag || !this.closeOnEscape) return;
      if (UIModal.getTop(this.scene) !== this) return; // nur der oberste Dialog
      // Escape gehört zuerst einer offenen Auswahlliste
      if (event.uiConsumedBy || (UI.Dropdown && UI.Dropdown.isAnyOpen && UI.Dropdown.isAnyOpen(this.scene))) return;
      this.close({ reason: 'escape' });
    }

    detachKeyboard() {
      const scene = this.scene;
      if (scene && scene.input && scene.input.keyboard) scene.input.keyboard.off('keydown', this.handleKeyDown);
    }

    /** Icon aus Textur `icon-<typ>` (eingefärbt) oder als Graphics-Fallback. */
    createIcon(type, x, y) {
      const def = ICONS[type];
      if (!def) return null;
      const scene = this.scene;
      const size = LAYOUT.ICON_SIZE;
      const key = `icon-${type}`;
      if (scene.textures.exists(key)) {
        return scene.add.image(x + size / 2, y + size / 2, key).setDisplaySize(size, size).setTint(def.color);
      }
      const holder = scene.add.container(x + size / 2, y + size / 2);
      const g = scene.add.graphics();
      holder.add(g);
      const r = size / 2;
      const white = COLORS.WHITE;
      if (type === 'warning') {
        g.fillStyle(def.color, 1);
        g.fillTriangle(0, -r + 1, r - 1, r - 3, -r + 1, r - 3);
        g.fillStyle(white, 1);
        g.fillRoundedRect(-1.75, -7, 3.5, 11, 1.5);
        g.fillCircle(0, 8, 2);
        return holder;
      }
      g.fillStyle(def.color, 1);
      g.fillCircle(0, 0, r);
      g.fillStyle(white, 1);
      g.lineStyle(3, white, 1);
      if (def.symbol === 'i') {
        g.fillCircle(0, -7, 2.2);
        g.fillRoundedRect(-1.75, -3, 3.5, 12, 1.5);
      } else if (def.symbol === 'x') {
        g.lineBetween(-6.5, -6.5, 6.5, 6.5);
        g.lineBetween(6.5, -6.5, -6.5, 6.5);
      } else if (def.symbol === 'check') {
        g.beginPath();
        g.moveTo(-7, 0.5);
        g.lineTo(-2, 5.5);
        g.lineTo(7.5, -5);
        g.strokePath();
      } else {
        holder.add(UI.text(scene, 0, 1, def.symbol, { size: 21, bold: true, color: '#ffffff', origin: 0.5 }));
      }
      return holder;
    }

    /** Räumt Tastatur-Listener und Stapel-Eintrag ab. */
    destroy(fromScene) {
      if (!this.scene) return;
      const scene = this.scene;
      this.isOpenFlag = false;
      Stack.remove(this, scene);
      this.detachKeyboard();
      super.destroy(fromScene);
    }

    // ================================================================ statisch

    /** Schließt alle offenen Dialoge der Szene (oberster zuerst). */
    static closeAll(scene) {
      const stack = stacks.get(scene);
      if (!stack) return;
      stack.slice().reverse().forEach((modal) => modal.close({ reason: 'api' }));
    }

    /** @returns {boolean} */
    static isAnyOpen(scene) {
      const stack = stacks.get(scene);
      return Boolean(stack) && stack.length > 0;
    }

    /** @returns {UIModal|null} oberster offener Dialog der Szene */
    static getTop(scene) {
      const stack = stacks.get(scene);
      return stack && stack.length > 0 ? stack[stack.length - 1] : null;
    }
  }

  /** Maße für Layout-Berechnungen in Kapiteln (nur lesen). */
  UIModal.LAYOUT = LAYOUT;

  UI.Modal = UIModal;
})();
