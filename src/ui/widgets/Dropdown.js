/**
 * Dropdown.js – Auswahlliste im Android-/Systemdialog-Stil (UI.Dropdown).
 *
 * - Feld wie UI.TextInput (Label oben, Fokusrahmen, Fehler-/Hinweiszeile darunter).
 * - Die offene Liste ist ein eigenes Top-Level-Objekt (nicht im Container) auf
 *   CONFIG.DEPTH.DROPDOWN – bzw. knapp über dem Container, falls dieser selbst höher liegt
 *   (z. B. Dropdown in einem Modal). Position aus der Weltmatrix des Feldes, d. h. sie
 *   stimmt auch in verschobenen/verschachtelten Containern und folgt ihnen, solange offen.
 * - Öffnet nach unten, bei Platzmangel nach oben (unter der HUD-Leiste bleibt sie frei).
 * - Ab maxVisible Einträgen scrollbar (Mausrad über der Liste, Pfeiltasten), Scrollbalken.
 * - Hover-Markierung, gewählter Eintrag mit Haken; Klick außerhalb schließt.
 * - Deaktivierte Optionen sind grau; Klick darauf lässt die Liste offen und zeigt
 *   UI.toast(option.hint), falls vorhanden.
 * - Tastatur bei offener Liste: Pfeil hoch/runter, Enter/Leertaste wählt, Escape/Tab schließt.
 *
 * Optionen: [{ value, label, disabled = false, hint = null }] – reine Strings sind auch erlaubt.
 *
 * Global: keins – hängt UI.Dropdown an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js);
 * zur Laufzeit optional UI.toast, UI.TextInput.
 */
(function () {
  const COLORS = CONFIG.COLORS;
  const CSS = CONFIG.CSS;

  /** Maße (px). */
  const LAYOUT = Object.freeze({
    LABEL_SPACE: 22,   // wie UI.TextInput, damit Formulare bündig sind
    LABEL_SIZE: 13,
    MESSAGE_GAP: 5,
    MESSAGE_SIZE: 12,
    PADDING_X: 12,
    CHEVRON_SPACE: 34, // Platz für den Pfeil rechts
    RADIUS: 6,
    FOCUS_HALO: 3,
    ITEM_HEIGHT: 38,
    LIST_PADDING: 6,   // Innenabstand oben/unten in der Liste
    LIST_GAP: 4,       // Abstand Feld ↔ Liste
    SCREEN_MARGIN: 8,  // Mindestabstand zum Bildschirmrand
    CHECK_SPACE: 30,   // Platz rechts für den Haken
    SCROLLBAR_WIDTH: 4,
    SCROLLBAR_MIN: 18,
    NUDGE: 4,          // Wackeln bei deaktivierter Option
  });

  const STYLE = Object.freeze({
    BORDER: 0x9aa0a6,
    BORDER_HOVER: 0x5f6368,
    PLACEHOLDER: '#80868b',
    HOVER: 0xf1f3f4,
    SELECTED: 0xe8f0fe,
    SELECTED_HOVER: 0xd2e3fc,
    DISABLED_TEXT: '#a8abaf',
    CHEVRON: 0x5f6368,
    SCROLL_THUMB: 0xbdc1c6,
    LIST_BORDER: 0xdadce0,
    SHADOW_COLOR: COLORS.SHADOW,
    SHADOW_ALPHA: 0.14,
    HALO_ALPHA: 0.16,
    DISABLED_ALPHA: 0.55,
    ELLIPSIS: '…',
  });

  const TIMING = Object.freeze({ FADE_MS: 90, NUDGE_MS: 45 });
  /** Mausrad: so viele Pixel Delta ergeben eine Zeile. */
  const WHEEL_PIXELS_PER_ROW = 50;

  /** Szene → Set aller Dropdowns (für closeAll). */
  const dropdownsByScene = new WeakMap();

  const Util = {
    isDisplayed(gameObject) {
      let node = gameObject;
      while (node) {
        if (!node.scene || !node.visible) return false;
        node = node.parentContainer;
      }
      return true;
    },

    setTextColor(textObject, css) {
      if (textObject.style.color !== css) textObject.setColor(css);
    },

    /** Kürzt einen String mit „…“ auf maxWidth (gemessen im Font von textObject). */
    ellipsize(textObject, str, maxWidth) {
      const context = textObject.context;
      textObject.style.syncFont(textObject.canvas, context);
      if (context.measureText(str).width <= maxWidth) return str;
      let low = 0;
      let high = str.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (context.measureText(str.slice(0, mid) + STYLE.ELLIPSIS).width <= maxWidth) low = mid;
        else high = mid - 1;
      }
      return str.slice(0, low).trimEnd() + STYLE.ELLIPSIS;
    },

    /** Optionen vereinheitlichen: { value, label, disabled, hint }. */
    normalizeOptions(options) {
      if (!Array.isArray(options)) return [];
      return options.map((option) => {
        if (option && typeof option === 'object') {
          return {
            value: option.value,
            label: option.label !== undefined && option.label !== null ? String(option.label) : String(option.value),
            disabled: Boolean(option.disabled),
            hint: option.hint ? String(option.hint) : null,
          };
        }
        return { value: option, label: String(option), disabled: false, hint: null };
      });
    },

    /** Belegt die HUD-Szene gerade den oberen Bildschirmrand? */
    isHudCovering(scene) {
      try {
        return scene.sys.settings.key !== 'HUD' && Boolean(scene.scene.isActive('HUD'));
      } catch (err) {
        return false;
      }
    },
  };

  class UIDropdown extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke (inkl. Label)
     * @param {number} y
     * @param {object} [opts]
     * @param {number} [opts.width=300]
     * @param {number} [opts.height=40] Höhe des Feldes
     * @param {string|null} [opts.label=null]
     * @param {string} [opts.placeholder='Bitte auswählen']
     * @param {Array<object|string>} [opts.options=[]] [{ value, label, disabled, hint }]
     * @param {*} [opts.value=null] vorausgewählter Wert
     * @param {number} [opts.maxVisible=6] sichtbare Zeilen, darüber scrollt die Liste
     * @param {number} [opts.fontSize=16]
     * @param {Function|null} [opts.onChange=null] (value, option)
     * @param {boolean} [opts.disabled=false]
     * @param {string|null} [opts.hint=null] kleiner Text unter dem Feld
     * @param {string|null} [opts.error=null]
     */
    constructor(scene, x, y, opts = {}) {
      const {
        width = 300, height = 40, label = null, placeholder = 'Bitte auswählen', options = [],
        value = null, maxVisible = 6, fontSize = 16, onChange = null,
        disabled = false, hint = null, error = null,
      } = opts;
      super(scene, x, y);

      this.fieldWidth = width;
      this.fieldHeight = height;
      this.boxY = label ? LAYOUT.LABEL_SPACE : 0;
      this.placeholder = String(placeholder ?? '');
      this.maxVisible = Math.max(1, Math.floor(maxVisible));
      this.fontSize = fontSize;
      this.onChange = onChange;
      this.enabled = !disabled;
      this.isHovered = false;
      this.options = Util.normalizeOptions(options);
      this.value = null;
      this.hintMessage = hint || null;
      this.errorMessage = error || null;
      this.popup = null;      // offene Liste (Top-Level-Container) oder null
      this.popupState = null; // { rows, first, hover, openUp, width, height, wheel }
      this.rowViews = [];
      this.hintToast = null;
      this.seenEvents = new WeakSet();
      this.tempMatrix = new Phaser.GameObjects.Components.TransformMatrix();
      this.tempParentMatrix = new Phaser.GameObjects.Components.TransformMatrix();

      const midY = this.boxY + height / 2;
      this.box = scene.add.graphics();
      this.labelText = label
        ? UI.text(scene, 0, 0, String(label), { size: LAYOUT.LABEL_SIZE, color: CSS.TEXT_MUTED, bold: true })
        : null;
      this.valueText = UI.text(scene, LAYOUT.PADDING_X, midY, '', { size: fontSize, origin: { x: 0, y: 0.5 } });
      this.chevron = scene.add.graphics();
      this.messageText = UI.text(scene, 2, this.boxY + height + LAYOUT.MESSAGE_GAP, '', {
        size: LAYOUT.MESSAGE_SIZE, color: CSS.TEXT_MUTED, wrap: width - 2, lineSpacing: 2,
      });
      this.hitRect = scene.add.rectangle(0, 0, width, this.boxY + height).setOrigin(0);
      this.hitRect.setInteractive({ useHandCursor: true });

      const parts = [this.box];
      if (this.labelText) parts.push(this.labelText);
      parts.push(this.valueText, this.chevron, this.messageText, this.hitRect);
      this.add(parts);

      this.hitRect.on('pointerover', () => {
        this.isHovered = true;
        this.refresh();
      });
      this.hitRect.on('pointerout', () => {
        this.isHovered = false;
        this.refresh();
      });
      this.hitRect.on('pointerdown', (pointer) => {
        if (!this.enabled || (pointer && pointer.button !== 0)) return;
        if (this.isOpen()) this.close();
        else this.open();
      });

      // Listener, die nur bei offener Liste aktiv sind
      this.handleScenePointerDown = (pointer, currentlyOver) => this.onScenePointerDown(currentlyOver);
      this.handleWheel = (pointer, currentlyOver, deltaX, deltaY) => this.onWheel(pointer, deltaY);
      this.handleKeyDown = (event) => this.onKeyDown(event);
      this.handlePreRender = () => this.syncPopup();

      let registry = dropdownsByScene.get(scene);
      if (!registry) {
        registry = new Set();
        dropdownsByScene.set(scene, registry);
      }
      registry.add(this);

      this.setValue(value, { silent: true });
      this.layoutMessage();
      this.setEnabled(this.enabled);
      scene.add.existing(this);
    }

    // ================================================================ öffentliche API

    /** @returns {*} gewählter Wert oder null */
    getValue() {
      return this.value;
    }

    /** @returns {{value, label, disabled, hint}|null} gewählte Option */
    getSelectedOption() {
      return this.options.find((option) => option.value === this.value) || null;
    }

    /**
     * Wählt den Wert (auch deaktivierte Optionen, programmatisch). Unbekannt → null.
     * @param {*} value
     * @param {{silent?: boolean}} [options] silent: kein 'change'-Event/onChange
     * @returns {this}
     */
    setValue(value, { silent = false } = {}) {
      const option = this.options.find((entry) => entry.value === value) || null;
      const next = option ? option.value : null;
      const changed = next !== this.value;
      this.value = next;
      this.updateField();
      if (this.popup) this.renderRows();
      if (changed && !silent) this.emitChange(option);
      return this;
    }

    /**
     * Ersetzt die Optionen. Ist der bisherige Wert nicht mehr dabei, wird er null (ohne Event).
     * Eine offene Liste wird neu aufgebaut.
     * @param {Array<object|string>} options
     * @returns {this}
     */
    setOptions(options) {
      const wasOpen = this.isOpen();
      if (wasOpen) this.close();
      this.options = Util.normalizeOptions(options);
      if (!this.options.some((option) => option.value === this.value)) this.value = null;
      this.updateField();
      if (wasOpen) this.open();
      return this;
    }

    /** @returns {Array<{value, label, disabled, hint}>} Kopie der Optionen */
    getOptions() {
      return this.options.map((option) => ({ ...option }));
    }

    /** Öffnet die Liste (nur wenn aktiviert und sichtbar). @returns {this} */
    open() {
      if (this.popup || !this.enabled || !this.scene || !Util.isDisplayed(this)) return this;
      UIDropdown.closeAll(this.scene, this);
      if (UI.TextInput && typeof UI.TextInput.blurAll === 'function') UI.TextInput.blurAll(this.scene);
      this.buildPopup();
      this.setOpenListeners(true);
      this.refresh();
      UI.sound('click');
      this.emit('open', this);
      return this;
    }

    /** Schließt die Liste. @returns {this} */
    close() {
      if (!this.popup) return this;
      this.setOpenListeners(false);
      this.popup.destroy();
      this.popup = null;
      this.popupState = null;
      this.rowViews = [];
      this.scrollThumb = null;
      if (this.scene) {
        this.refresh();
        this.emit('close', this);
      }
      return this;
    }

    /** @returns {boolean} */
    isOpen() {
      return this.popup !== null;
    }

    /**
     * Fehlerzustand: roter Rahmen + Meldung unter dem Feld.
     * @param {string|null} msgOrNull
     * @returns {this}
     */
    setError(msgOrNull) {
      this.errorMessage = msgOrNull ? String(msgOrNull) : null;
      this.layoutMessage();
      this.refresh();
      return this;
    }

    /** @param {string|null} str Hinweis unter dem Feld @returns {this} */
    setHint(str) {
      this.hintMessage = str ? String(str) : null;
      this.layoutMessage();
      return this;
    }

    /**
     * Aktiviert/deaktiviert das Dropdown (deaktiviert = grau, schließt die Liste).
     * @param {boolean} isEnabled
     * @returns {this}
     */
    setEnabled(isEnabled) {
      this.enabled = Boolean(isEnabled);
      if (!this.enabled) this.close();
      if (this.hitRect.input) this.hitRect.input.cursor = this.enabled ? 'pointer' : false;
      if (!this.enabled && this.isHovered && this.scene) this.scene.input.resetCursor();
      this.refresh();
      return this;
    }

    /** @returns {boolean} */
    isEnabled() {
      return this.enabled;
    }

    /**
     * Weltkoordinaten des Feldes (ohne Label/Hinweis) – praktisch für Tests.
     * @returns {Phaser.Geom.Rectangle}
     */
    getFieldBounds() {
      const rect = this.getFieldWorldRect();
      return new Phaser.Geom.Rectangle(rect.x, rect.y, rect.width, rect.height);
    }

    /**
     * Weltkoordinaten der Zeile von Option `index` in der offenen Liste (scrollt sie
     * bei Bedarf in den sichtbaren Bereich). null, wenn die Liste zu ist.
     * @param {number} index Index in den Optionen
     * @returns {Phaser.Geom.Rectangle|null}
     */
    getOptionBounds(index) {
      if (!this.popup || index < 0 || index >= this.options.length) return null;
      this.ensureRowVisible(index);
      const row = index - this.popupState.first;
      return new Phaser.Geom.Rectangle(
        this.popup.x,
        this.popup.y + LAYOUT.LIST_PADDING + row * LAYOUT.ITEM_HEIGHT,
        this.popupState.width,
        LAYOUT.ITEM_HEIGHT
      );
    }

    /** @returns {Phaser.GameObjects.Container|null} die offene Liste (für Tests) */
    getPopup() {
      return this.popup;
    }

    /** @returns {number} Gesamthöhe inkl. Label und Hinweis/Fehler */
    getTotalHeight() {
      return this.height;
    }

    // ================================================================ Liste aufbauen

    /** Feld-Rechteck in Weltkoordinaten (berücksichtigt alle Eltern-Container). */
    getFieldWorldRect() {
      const matrix = this.getWorldTransformMatrix(this.tempMatrix, this.tempParentMatrix);
      const topLeft = matrix.transformPoint(0, this.boxY);
      const bottomRight = matrix.transformPoint(this.fieldWidth, this.boxY + this.fieldHeight);
      return {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
        bottom: bottomRight.y,
      };
    }

    /** Tiefe der Liste: DROPDOWN bzw. knapp über dem obersten Eltern-Container. */
    getPopupDepth() {
      let root = this;
      while (root.parentContainer) root = root.parentContainer;
      const base = CONFIG.DEPTH.DROPDOWN;
      return root.depth >= base ? root.depth + 1 : base;
    }

    buildPopup() {
      const scene = this.scene;
      const anchor = this.getFieldWorldRect();
      const total = this.options.length;
      const wanted = Math.max(1, Math.min(total, this.maxVisible));
      const topLimit = (Util.isHudCovering(scene) ? CONFIG.PLAY_AREA.y : 0) + LAYOUT.SCREEN_MARGIN;
      const bottomLimit = CONFIG.HEIGHT - LAYOUT.SCREEN_MARGIN;
      const heightFor = (rows) => rows * LAYOUT.ITEM_HEIGHT + 2 * LAYOUT.LIST_PADDING;
      const spaceBelow = bottomLimit - (anchor.bottom + LAYOUT.LIST_GAP);
      const spaceAbove = anchor.y - LAYOUT.LIST_GAP - topLimit;
      const openUp = heightFor(wanted) > spaceBelow && spaceAbove > spaceBelow;
      const space = openUp ? spaceAbove : spaceBelow;
      const fitting = Math.floor((space - 2 * LAYOUT.LIST_PADDING) / LAYOUT.ITEM_HEIGHT);
      const rows = Phaser.Math.Clamp(fitting, 1, wanted);
      const width = Math.round(anchor.width);
      const height = heightFor(rows);

      const selectedIndex = this.options.findIndex((option) => option.value === this.value);
      const first = Phaser.Math.Clamp(selectedIndex - Math.floor(rows / 2), 0, Math.max(0, total - rows));
      this.popupState = { rows, first, hover: -1, openUp, width, height, wheel: 0 };

      const popup = scene.add.container(0, 0).setDepth(this.getPopupDepth());
      const bg = scene.add.graphics();
      bg.fillStyle(STYLE.SHADOW_COLOR, STYLE.SHADOW_ALPHA * 0.6);
      bg.fillRoundedRect(-1, 1, width + 2, height + 4, LAYOUT.RADIUS + 1);
      bg.fillStyle(STYLE.SHADOW_COLOR, STYLE.SHADOW_ALPHA);
      bg.fillRoundedRect(0, 1, width, height + 1, LAYOUT.RADIUS);
      bg.fillStyle(COLORS.SURFACE, 1);
      bg.fillRoundedRect(0, 0, width, height, LAYOUT.RADIUS);
      bg.lineStyle(1, STYLE.LIST_BORDER, 1);
      bg.strokeRoundedRect(0.5, 0.5, width - 1, height - 1, LAYOUT.RADIUS);
      // Fängt Klicks auf Rand/Polster ab, damit sie nicht als „außerhalb“ zählen
      const blocker = scene.add.rectangle(0, 0, width, height).setOrigin(0).setInteractive();
      popup.add([bg, blocker]);

      this.rowViews = [];
      const textWidth = width - LAYOUT.PADDING_X - LAYOUT.CHECK_SPACE;
      for (let row = 0; row < rows; row += 1) {
        const top = LAYOUT.LIST_PADDING + row * LAYOUT.ITEM_HEIGHT;
        const highlight = scene.add.rectangle(0, top, width, LAYOUT.ITEM_HEIGHT, STYLE.HOVER).setOrigin(0).setVisible(false);
        const text = UI.text(scene, LAYOUT.PADDING_X, top + LAYOUT.ITEM_HEIGHT / 2, '', {
          size: this.fontSize, origin: { x: 0, y: 0.5 },
        });
        const check = scene.add.graphics();
        const hit = scene.add.rectangle(0, top, width, LAYOUT.ITEM_HEIGHT).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => this.setHover(this.popupState ? this.popupState.first + row : -1));
        hit.on('pointerout', () => {
          if (this.popupState && this.popupState.hover === this.popupState.first + row) this.setHover(-1);
        });
        hit.on('pointerup', () => {
          if (this.popupState) this.choose(this.popupState.first + row);
        });
        popup.add([highlight, text, check, hit]);
        this.rowViews.push({ highlight, text, check, hit, top, textWidth, shownLabel: null });
      }
      this.scrollThumb = null;
      if (total > rows) {
        this.scrollThumb = scene.add.graphics();
        popup.add(this.scrollThumb);
      }

      this.popup = popup;
      this.syncPopup();
      this.renderRows();
      popup.setAlpha(0.01);
      scene.tweens.add({ targets: popup, alpha: 1, duration: TIMING.FADE_MS, ease: 'Quad.easeOut' });
    }

    /** Liste am Feld ausrichten (folgt bewegten Containern); schließt, wenn das Feld verschwindet. */
    syncPopup() {
      if (!this.popup) return;
      if (!this.scene || !Util.isDisplayed(this)) {
        this.close();
        return;
      }
      const anchor = this.getFieldWorldRect();
      const state = this.popupState;
      const x = Math.round(anchor.x);
      const y = Math.round(state.openUp ? anchor.y - LAYOUT.LIST_GAP - state.height : anchor.bottom + LAYOUT.LIST_GAP);
      if (this.popup.x !== x || this.popup.y !== y) this.popup.setPosition(x, y);
    }

    /** Zeilen mit den Optionen ab `first` befüllen (Virtualisierung statt Maske). */
    renderRows() {
      if (!this.popup) return;
      const state = this.popupState;
      this.rowViews.forEach((view, row) => {
        const index = state.first + row;
        const option = this.options[index];
        if (!option) {
          view.highlight.setVisible(false);
          view.text.setVisible(false);
          view.check.clear();
          return;
        }
        const isSelected = this.value !== null && option.value === this.value;
        const isHover = index === state.hover && !option.disabled;
        view.highlight.setVisible(isSelected || isHover);
        view.highlight.setFillStyle(isSelected ? (isHover ? STYLE.SELECTED_HOVER : STYLE.SELECTED) : STYLE.HOVER, 1);
        if (view.shownLabel !== option.label) {
          view.text.setText(Util.ellipsize(view.text, option.label, view.textWidth));
          view.shownLabel = option.label;
        }
        view.text.setVisible(true);
        let color = CSS.TEXT;
        if (option.disabled) color = STYLE.DISABLED_TEXT;
        else if (isSelected) color = CSS.PRIMARY;
        Util.setTextColor(view.text, color);
        if (view.hit.input) view.hit.input.cursor = option.disabled ? 'not-allowed' : 'pointer';
        view.check.clear();
        if (isSelected) {
          const cx = state.width - LAYOUT.CHECK_SPACE / 2 - 2;
          const cy = view.top + LAYOUT.ITEM_HEIGHT / 2;
          view.check.lineStyle(2.4, COLORS.PRIMARY, 1);
          view.check.beginPath();
          view.check.moveTo(cx - 6, cy);
          view.check.lineTo(cx - 2, cy + 4);
          view.check.lineTo(cx + 6, cy - 5);
          view.check.strokePath();
        }
      });
      this.drawScrollbar();
    }

    drawScrollbar() {
      if (!this.scrollThumb) return;
      const state = this.popupState;
      const total = this.options.length;
      const track = state.height - 2 * LAYOUT.LIST_PADDING;
      const thumbHeight = Math.max(LAYOUT.SCROLLBAR_MIN, Math.round((track * state.rows) / total));
      const maxFirst = Math.max(1, total - state.rows);
      const thumbY = LAYOUT.LIST_PADDING + Math.round(((track - thumbHeight) * state.first) / maxFirst);
      const g = this.scrollThumb;
      g.clear();
      g.fillStyle(STYLE.SCROLL_THUMB, 1);
      g.fillRoundedRect(state.width - LAYOUT.SCROLLBAR_WIDTH - 3, thumbY, LAYOUT.SCROLLBAR_WIDTH, thumbHeight, LAYOUT.SCROLLBAR_WIDTH / 2);
    }

    // ================================================================ Interaktion

    setHover(index) {
      if (!this.popupState || this.popupState.hover === index) return;
      this.popupState.hover = index;
      this.renderRows();
    }

    /** Scrollt um `delta` Zeilen (positiv = nach unten). */
    scrollRows(delta) {
      if (!this.popupState) return;
      const state = this.popupState;
      const maxFirst = Math.max(0, this.options.length - state.rows);
      const first = Phaser.Math.Clamp(state.first + delta, 0, maxFirst);
      if (first === state.first) return;
      state.first = first;
      this.renderRows();
    }

    /** Scrollt so, dass Option `index` sichtbar ist. */
    ensureRowVisible(index) {
      const state = this.popupState;
      if (!state) return;
      if (index < state.first) this.scrollRows(index - state.first);
      else if (index >= state.first + state.rows) this.scrollRows(index - (state.first + state.rows - 1));
    }

    /** Option wählen (Klick/Enter). Deaktiviert: Liste bleibt offen, Hinweis als Toast. */
    choose(index) {
      const option = this.options[index];
      if (!option || !this.popup) return;
      if (option.disabled) {
        this.rejectOption(index, option);
        return;
      }
      const changed = option.value !== this.value;
      this.value = option.value;
      this.updateField();
      UI.sound('click');
      this.close();
      if (changed) this.emitChange(option);
    }

    rejectOption(index, option) {
      UI.sound('error');
      const row = index - this.popupState.first;
      const view = this.rowViews[row];
      if (view && this.scene) {
        this.scene.tweens.killTweensOf(view.text);
        view.text.x = LAYOUT.PADDING_X;
        this.scene.tweens.add({
          targets: view.text,
          x: LAYOUT.PADDING_X + LAYOUT.NUDGE,
          duration: TIMING.NUDGE_MS,
          yoyo: true,
          repeat: 1,
          onComplete: () => {
            view.text.x = LAYOUT.PADDING_X;
          },
        });
      }
      // Gleichen Hinweis nicht stapeln, solange er noch sichtbar ist
      const isToastVisible = this.hintToast && this.hintToast.scene && this.hintToast.hintText === option.hint
        && !this.hintToast.isDismissed;
      if (option.hint && !isToastVisible && typeof UI.toast === 'function') {
        this.hintToast = UI.toast(this.scene, option.hint);
        if (this.hintToast) this.hintToast.hintText = option.hint;
      }
    }

    emitChange(option) {
      const value = this.value;
      this.emit('change', value, option || null);
      if (this.scene && typeof this.onChange === 'function') this.onChange(value, option || null);
    }

    /** Klick irgendwo in der Szene, während die Liste offen ist. */
    onScenePointerDown(currentlyOver) {
      if (!this.popup) return;
      const top = currentlyOver && currentlyOver[0];
      if (top && (top === this.hitRect || top.parentContainer === this.popup)) return;
      this.close();
    }

    onWheel(pointer, deltaY) {
      if (!this.popup || !this.scene) return;
      const point = pointer.positionToCamera(this.scene.cameras.main);
      const { x, y } = this.popup;
      const state = this.popupState;
      const isInside = point.x >= x && point.x <= x + state.width && point.y >= y && point.y <= y + state.height;
      if (!isInside) return;
      state.wheel += deltaY;
      const steps = Math.trunc(state.wheel / WHEEL_PIXELS_PER_ROW);
      if (steps !== 0) {
        state.wheel -= steps * WHEEL_PIXELS_PER_ROW;
        this.scrollRows(steps);
      }
    }

    onKeyDown(event) {
      if (!this.popup || !event || this.seenEvents.has(event)) return;
      this.seenEvents.add(event);
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.moveHover(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.moveHover(-1);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (this.popupState.hover >= 0) this.choose(this.popupState.hover);
          break;
        case 'Escape':
        case 'Tab':
          if (event.key === 'Tab') event.preventDefault();
          // Markierung für andere Listener (z. B. Modal): Escape schloss nur die Liste
          event.uiConsumedBy = 'dropdown';
          this.close();
          break;
        default:
          break;
      }
    }

    /** Tastatur-Markierung zur nächsten aktivierten Option bewegen. */
    moveHover(direction) {
      const state = this.popupState;
      const total = this.options.length;
      if (!state || total === 0) return;
      let index = state.hover;
      if (index < 0) index = this.options.findIndex((option) => option.value === this.value);
      for (let step = 0; step < total; step += 1) {
        index = index < 0 ? (direction > 0 ? 0 : total - 1) : Phaser.Math.Clamp(index + direction, 0, total - 1);
        if (!this.options[index].disabled) break;
        if ((direction > 0 && index === total - 1) || (direction < 0 && index === 0)) break;
      }
      if (this.options[index] && !this.options[index].disabled) {
        this.ensureRowVisible(index);
        this.setHover(index);
      }
    }

    setOpenListeners(isOn) {
      const scene = this.scene;
      if (!scene) return;
      const method = isOn ? 'on' : 'off';
      if (scene.input) {
        scene.input[method]('pointerdown', this.handleScenePointerDown);
        scene.input[method]('wheel', this.handleWheel);
        if (scene.input.keyboard) scene.input.keyboard[method]('keydown', this.handleKeyDown);
      }
      if (scene.events) scene.events[method]('prerender', this.handlePreRender);
    }

    // ================================================================ Darstellung

    updateField() {
      if (!this.scene) return;
      const option = this.getSelectedOption();
      const maxWidth = this.fieldWidth - LAYOUT.PADDING_X - LAYOUT.CHEVRON_SPACE;
      const label = option ? option.label : this.placeholder;
      this.valueText.setText(Util.ellipsize(this.valueText, label, maxWidth));
      Util.setTextColor(this.valueText, option ? CSS.TEXT : STYLE.PLACEHOLDER);
    }

    layoutMessage() {
      const message = this.errorMessage || this.hintMessage || '';
      this.messageText.setText(message);
      Util.setTextColor(this.messageText, this.errorMessage ? CSS.DANGER : CSS.TEXT_MUTED);
      this.messageText.setVisible(message.length > 0);
      const messageHeight = message ? LAYOUT.MESSAGE_GAP + this.messageText.height : 0;
      this.setSize(this.fieldWidth, this.boxY + this.fieldHeight + messageHeight);
    }

    refresh() {
      if (!this.scene) return;
      const g = this.box;
      const w = this.fieldWidth;
      const h = this.fieldHeight;
      const top = this.boxY;
      const hasError = Boolean(this.errorMessage);
      const isOpen = this.isOpen();
      const accent = hasError ? COLORS.DANGER : COLORS.PRIMARY;
      g.clear();
      if (isOpen) {
        const halo = LAYOUT.FOCUS_HALO;
        g.fillStyle(accent, STYLE.HALO_ALPHA);
        g.fillRoundedRect(-halo, top - halo, w + 2 * halo, h + 2 * halo, LAYOUT.RADIUS + halo);
      }
      g.fillStyle(this.enabled ? COLORS.SURFACE : COLORS.SURFACE_ALT, 1);
      g.fillRoundedRect(0, top, w, h, LAYOUT.RADIUS);
      const isStrong = isOpen || hasError;
      const lineWidth = isStrong ? 2 : 1;
      let borderColor = STYLE.BORDER;
      if (isStrong) borderColor = accent;
      else if (this.isHovered && this.enabled) borderColor = STYLE.BORDER_HOVER;
      g.lineStyle(lineWidth, borderColor, 1);
      g.strokeRoundedRect(lineWidth / 2, top + lineWidth / 2, w - lineWidth, h - lineWidth, LAYOUT.RADIUS);

      // Pfeil: ▼ geschlossen, ▲ offen
      const cx = w - LAYOUT.CHEVRON_SPACE / 2;
      const cy = top + h / 2;
      const c = this.chevron;
      c.clear();
      c.fillStyle(isOpen ? COLORS.PRIMARY : STYLE.CHEVRON, 1);
      if (isOpen) c.fillTriangle(cx - 5, cy + 3, cx + 5, cy + 3, cx, cy - 3);
      else c.fillTriangle(cx - 5, cy - 3, cx + 5, cy - 3, cx, cy + 3);

      if (this.labelText) {
        let labelColor = CSS.TEXT_MUTED;
        if (hasError) labelColor = CSS.DANGER;
        else if (isOpen) labelColor = CSS.PRIMARY;
        Util.setTextColor(this.labelText, labelColor);
      }
      const alpha = this.enabled ? 1 : STYLE.DISABLED_ALPHA;
      [this.labelText, this.valueText, this.chevron].forEach((part) => {
        if (part) part.setAlpha(alpha);
      });
    }

    // ================================================================ Aufräumen

    /** Schließt die Liste (Top-Level-Objekt!) und meldet alle Listener ab. */
    destroy(fromScene) {
      if (!this.scene) return;
      const scene = this.scene;
      this.close();
      const registry = dropdownsByScene.get(scene);
      if (registry) registry.delete(this);
      super.destroy(fromScene);
    }

    // ================================================================ statisch

    /**
     * Schließt alle offenen Dropdowns der Szene (z. B. wenn ein Modal aufgeht).
     * @param {Phaser.Scene} scene
     * @param {UIDropdown} [except] dieses nicht schließen
     */
    static closeAll(scene, except = null) {
      const registry = dropdownsByScene.get(scene);
      if (!registry) return;
      Array.from(registry).forEach((dropdown) => {
        if (dropdown !== except) dropdown.close();
      });
    }

    /** @returns {boolean} ist in der Szene gerade eine Liste offen? */
    static isAnyOpen(scene) {
      const registry = dropdownsByScene.get(scene);
      return Boolean(registry) && Array.from(registry).some((dropdown) => dropdown.isOpen());
    }
  }

  /** Maße für Layout-Berechnungen in Kapiteln (nur lesen). */
  UIDropdown.LAYOUT = LAYOUT;

  UI.Dropdown = UIDropdown;
})();
