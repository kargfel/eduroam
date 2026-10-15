/**
 * TextInput.js – Einzeiliges Eingabefeld auf der Canvas (UI.TextInput).
 *
 * Das wichtigste Widget im Spiel: Kennung, Passwort, Identität, Domain … werden hier
 * getippt. Verhalten wie ein echtes <input>:
 *  - höchstens ein fokussiertes Feld pro Szene (Fokus-Registry je Szene),
 *    Klick daneben → blur, Escape → blur, Enter → submit
 *  - Tab/Shift+Tab = nächstes/vorheriges Feld in Erstellungsreihenfolge (bei offenem
 *    Modal nur Felder im obersten Dialog); ohne Fokus springt Tab ins erste Feld
 *  - Backspace/Delete, Pfeil links/rechts, Home/End; mit Umschalt markieren,
 *    Strg/Cmd+A markiert alles, Alt/Strg+Backspace löscht ein Wort, Doppelklick markiert ein Wort
 *  - druckbare Zeichen inkl. Umlaute, ß, @ und Sonderzeichen (auch AltGr unter Windows)
 *  - Einfügen per Strg/Cmd+V über ein window-'paste'-Event – nur solange fokussiert und
 *    die Szene aktiv ist; Kopieren/Ausschneiden (nicht bei verdeckten Passwörtern)
 *  - jedes getippte/eingefügte Zeichen läuft durch transformChar (Trolle wie y↔z), maxLength
 *  - Passwortmaske (•) mit optionalem Auge-Umschalter
 *  - langer Text scrollt zeichenweise horizontal mit, der Cursor bleibt sichtbar
 *    (ohne GeometryMask → funktioniert in beliebig verschachtelten/bewegten Containern)
 *  - blinkender Cursor über einen Szenen-Timer (pausiert mit der Szene)
 *
 * Tastatur: EIN keydown-Listener je Szene an scene.input.keyboard, Abmeldung bei
 * shutdown/destroy bzw. wenn das letzte Feld der Szene zerstört wird. Tastendrücke
 * erreichen nie ein unsichtbares oder zerstörtes Feld (Prüfung bei jedem Tastendruck).
 *
 * Layout: (x, y) = linke obere Ecke des Widgets. Mit Label liegt das Label oben und das
 * Feld beginnt LABEL_SPACE (22 px) tiefer; Hinweis/Fehlertext steht unter dem Feld.
 *
 * Global: keins – hängt UI.TextInput an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js);
 * zur Laufzeit optional UI.Modal (Tab-Reihenfolge, Eingabesperre unter Dialogen).
 */
(function () {
  const COLORS = CONFIG.COLORS;
  const CSS = CONFIG.CSS;

  /** Maße (px). */
  const LAYOUT = Object.freeze({
    LABEL_SPACE: 22,   // Höhe der Label-Zeile über dem Feld
    LABEL_SIZE: 13,
    MESSAGE_GAP: 5,    // Abstand Feld → Hinweis/Fehler
    MESSAGE_SIZE: 12,
    MESSAGE_SPACE: 20, // empfohlener Platz unter dem Feld für eine Hinweiszeile
    PADDING_X: 12,
    TOGGLE_WIDTH: 40,  // Auge-Umschalter rechts im Feld
    RADIUS: 6,
    FOCUS_HALO: 3,     // weicher Schein um den Fokusrahmen
    CARET_WIDTH: 2,
    CARET_EDGE: 3,     // Mindestabstand Cursor → rechter Innenrand
    CARET_HEIGHT_RATIO: 1.3,
  });

  /** Farben und Zeichen. */
  const STYLE = Object.freeze({
    BORDER: 0x9aa0a6,
    BORDER_HOVER: 0x5f6368,
    PLACEHOLDER: '#80868b',
    SELECTION: 0xc2d7fb,
    ICON: 0x5f6368,
    ICON_HOVER: 0x202124,
    HALO_ALPHA: 0.16,
    DISABLED_ALPHA: 0.55,
    MASK_CHAR: '•',
    ELLIPSIS: '…',
  });

  const TIMING = Object.freeze({
    CARET_BLINK_MS: 530,
    DOUBLE_CLICK_MS: 400,
    SHAKE_MS: 50,
  });

  /** Doppelklick nur, wenn beide Klicks höchstens so weit auseinander liegen (px). */
  const DOUBLE_CLICK_DISTANCE = 6;
  /** Unterhalb dieser effektiven Deckkraft gilt ein Feld als unsichtbar (Tasten werden ignoriert). */
  const MIN_VISIBLE_ALPHA = 0.05;
  const WORD_CHAR = /[\p{L}\p{N}_]/u;

  // ==================================================================== Hilfsfunktionen

  const Util = {
    /** Objekt und alle Eltern-Container existieren und sind sichtbar. */
    isDisplayed(gameObject) {
      let node = gameObject;
      while (node) {
        if (!node.scene || !node.visible) return false;
        node = node.parentContainer;
      }
      return true;
    },

    /** Produkt der Deckkraft entlang der Container-Kette. */
    effectiveAlpha(gameObject) {
      let alpha = 1;
      let node = gameObject;
      while (node) {
        alpha *= node.alpha;
        node = node.parentContainer;
      }
      return alpha;
    },

    /** Liegt `gameObject` (direkt oder verschachtelt) in `ancestor`? */
    isDescendant(gameObject, ancestor) {
      let node = gameObject;
      while (node) {
        if (node === ancestor) return true;
        node = node.parentContainer;
      }
      return false;
    },

    /** Oberster offener Dialog der Szene (falls Modal.js geladen ist). */
    topModal(scene) {
      return UI.Modal && typeof UI.Modal.getTop === 'function' ? UI.Modal.getTop(scene) : null;
    },

    /** Vorherige Cursorposition (überspringt UTF-16-Ersatzpaare, z. B. Emoji). */
    prevIndex(str, index) {
      if (index <= 0) return 0;
      const code = str.charCodeAt(index - 1);
      if (index >= 2 && code >= 0xdc00 && code <= 0xdfff) {
        const high = str.charCodeAt(index - 2);
        if (high >= 0xd800 && high <= 0xdbff) return index - 2;
      }
      return index - 1;
    },

    nextIndex(str, index) {
      if (index >= str.length) return str.length;
      const code = str.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff && index + 1 < str.length) {
        const low = str.charCodeAt(index + 1);
        if (low >= 0xdc00 && low <= 0xdfff) return index + 2;
      }
      return index + 1;
    },

    isWordChar(ch) {
      return WORD_CHAR.test(ch);
    },

    /** Wortanfang links von index (für Alt/Strg+Pfeil/Backspace). */
    wordStartBefore(str, index) {
      let i = index;
      while (i > 0 && !Util.isWordChar(str[i - 1])) i -= 1;
      while (i > 0 && Util.isWordChar(str[i - 1])) i -= 1;
      return i;
    },

    /** Wortende rechts von index. */
    wordEndAfter(str, index) {
      let i = index;
      while (i < str.length && !Util.isWordChar(str[i])) i += 1;
      while (i < str.length && Util.isWordChar(str[i])) i += 1;
      return i;
    },

    /** Ändert die Textfarbe nur bei Bedarf (setColor rendert den Text sonst neu). */
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
  };

  // ==================================================================== Fokus-Registry

  /** Szene → { scene, inputs[], focused, seenEvents, Handler } */
  const registries = new WeakMap();
  /** Alle aktiven Registries (für isAnyFocused() ohne Szene). */
  const activeRegistries = new Set();

  const Focus = {
    get(scene) {
      return (scene && registries.get(scene)) || null;
    },

    /** Legt die Registry einer Szene an und meldet die Szenen-Listener an. */
    ensure(scene) {
      let reg = registries.get(scene);
      if (reg) return reg;
      reg = { scene, inputs: [], focused: null, seenEvents: new WeakSet() };
      reg.onKeyDown = (event) => Focus.handleKeyDown(reg, event);
      reg.onPointerDown = (pointer, currentlyOver) => Focus.handlePointerDown(reg, currentlyOver);
      reg.onPointerDownOutside = () => {
        if (reg.focused) reg.focused.blur();
      };
      reg.onShutdown = () => Focus.teardown(scene);

      const keyboard = scene.input && scene.input.keyboard;
      if (keyboard) keyboard.on('keydown', reg.onKeyDown);
      if (scene.input) {
        scene.input.on('pointerdown', reg.onPointerDown);
        scene.input.on('pointerdownoutside', reg.onPointerDownOutside);
      }
      scene.events.once('shutdown', reg.onShutdown);
      scene.events.once('destroy', reg.onShutdown);
      registries.set(scene, reg);
      activeRegistries.add(reg);
      return reg;
    },

    /** Meldet alle Szenen-Listener ab (shutdown, destroy oder letztes Feld zerstört). */
    teardown(scene) {
      const reg = registries.get(scene);
      if (!reg) return;
      registries.delete(scene);
      activeRegistries.delete(reg);
      if (reg.focused) reg.focused.releaseFocusSilently();
      reg.focused = null;
      const keyboard = scene.input && scene.input.keyboard;
      if (keyboard) keyboard.off('keydown', reg.onKeyDown);
      if (scene.input) {
        scene.input.off('pointerdown', reg.onPointerDown);
        scene.input.off('pointerdownoutside', reg.onPointerDownOutside);
      }
      if (scene.events) {
        scene.events.off('shutdown', reg.onShutdown);
        scene.events.off('destroy', reg.onShutdown);
      }
    },

    register(input) {
      Focus.ensure(input.scene).inputs.push(input);
    },

    unregister(input, scene) {
      const reg = Focus.get(scene);
      if (!reg) return;
      const index = reg.inputs.indexOf(input);
      if (index >= 0) reg.inputs.splice(index, 1);
      if (reg.focused === input) reg.focused = null;
      if (reg.inputs.length === 0) Focus.teardown(scene);
    },

    handleKeyDown(reg, event) {
      // Phaser 3.90 verarbeitet die Tastatur-Queue eines Frames bei jedem neuen Event erneut
      // und filtert nur das zuletzt verarbeitete heraus → jedes Event nur einmal behandeln.
      if (!event || reg.seenEvents.has(event)) return;
      reg.seenEvents.add(event);
      let input = reg.focused;
      if (input && !input.canKeepFocus()) {
        input.blur();
        input = null;
      }
      if (input) {
        input.handleKeyDown(event);
        return;
      }
      // Kein Feld fokussiert: Tab springt ins erste (Shift+Tab ins letzte) Feld
      if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const list = Focus.focusable(reg);
        if (list.length > 0) {
          event.preventDefault();
          (event.shiftKey ? list[list.length - 1] : list[0]).focus();
        }
      }
    },

    handlePointerDown(reg, currentlyOver) {
      const input = reg.focused;
      if (!input) return;
      if (currentlyOver && currentlyOver.some((obj) => input.ownsObject(obj))) return;
      input.blur();
    },

    /** Fokussierbare Felder in Erstellungsreihenfolge (bei offenem Modal nur darin). */
    focusable(reg) {
      return reg.inputs.filter((input) => input.canFocus());
    },

    /** Fokus auf das nächste (direction 1) bzw. vorherige (−1) Feld, mit Umlauf. */
    cycle(reg, from, direction) {
      const list = Focus.focusable(reg);
      if (list.length === 0) return;
      let index = list.indexOf(from);
      if (index < 0) index = direction > 0 ? 0 : list.length - 1;
      else index = (index + direction + list.length) % list.length;
      const target = list[index];
      if (target !== from) target.focus();
    },
  };

  // ==================================================================== Widget

  class UITextInput extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke (inkl. Label)
     * @param {number} y
     * @param {object} [opts]
     * @param {number} [opts.width=300]
     * @param {number} [opts.height=40] Höhe des eigentlichen Feldes (ohne Label/Hinweis)
     * @param {string|null} [opts.label=null] Beschriftung über dem Feld
     * @param {string} [opts.placeholder='']
     * @param {string} [opts.value='']
     * @param {boolean} [opts.password=false] Eingabe als • verdecken
     * @param {boolean} [opts.showToggle=false] Auge-Umschalter (nur mit password)
     * @param {number} [opts.maxLength=64] 0/Infinity = unbegrenzt
     * @param {string} [opts.font='UI'] Rolle aus CONFIG.FONTS
     * @param {number} [opts.fontSize=16]
     * @param {string|null} [opts.hint=null] kleiner Text unter dem Feld
     * @param {Function|null} [opts.transformChar=null] (char, currentValue, input) => string|null;
     *        null = Zeichen verschlucken, String = stattdessen einfügen (darf mehrere Zeichen haben)
     * @param {Function|null} [opts.onChange=null] (value, input)
     * @param {Function|null} [opts.onSubmit=null] (value, input) – Enter
     * @param {Function|null} [opts.onFocus=null] (input)
     * @param {Function|null} [opts.onBlur=null] (input)
     * @param {boolean} [opts.disabled=false]
     * @param {string|null} [opts.error=null] Fehlermeldung von Anfang an
     */
    constructor(scene, x, y, opts = {}) {
      const {
        width = 300, height = 40, label = null, placeholder = '', value = '',
        password = false, showToggle = false, maxLength = 64, font = 'UI', fontSize = 16,
        hint = null, transformChar = null,
        onChange = null, onSubmit = null, onFocus = null, onBlur = null,
        disabled = false, error = null,
      } = opts;
      super(scene, x, y);

      this.fieldWidth = width;
      this.fieldHeight = height;
      this.isPassword = Boolean(password);
      this.isRevealed = false;
      this.hasToggle = this.isPassword && Boolean(showToggle);
      this.maxLength = maxLength > 0 ? maxLength : Infinity;
      this.transformChar = typeof transformChar === 'function' ? transformChar : null;
      this.onChange = onChange;
      this.onSubmit = onSubmit;
      this.onFocus = onFocus;
      this.onBlur = onBlur;
      this.enabled = !disabled;
      this.hasFocus = false;
      this.isHovered = false;
      this.isToggleHovered = false;
      this.value = '';
      this.caret = 0;        // Cursorposition (UTF-16-Index)
      this.anchor = 0;       // Markierungsanker; anchor !== caret → Markierung
      this.scrollStart = 0;  // erstes sichtbares Zeichen
      this.visibleEnd = 0;   // Ende des sichtbaren Ausschnitts
      this.caretVisible = false;
      this.caretTimer = null;
      this.lastPointerDownTime = -Infinity;
      this.lastPointerDownX = 0;
      this.hintMessage = hint || null;
      this.errorMessage = error || null;
      this.placeholderRaw = String(placeholder ?? '');
      this.boxY = label ? LAYOUT.LABEL_SPACE : 0;

      const midY = this.boxY + height / 2;
      const caretHeight = Math.round(Math.min(fontSize * LAYOUT.CARET_HEIGHT_RATIO, height - 8));

      this.box = scene.add.graphics();
      this.labelText = label
        ? UI.text(scene, 0, 0, String(label), { size: LAYOUT.LABEL_SIZE, color: CSS.TEXT_MUTED, bold: true })
        : null;
      this.selectionRect = scene.add.rectangle(LAYOUT.PADDING_X, midY, 1, caretHeight, STYLE.SELECTION)
        .setOrigin(0, 0.5)
        .setVisible(false);
      this.valueText = UI.text(scene, LAYOUT.PADDING_X, midY, '', { size: fontSize, font, origin: { x: 0, y: 0.5 } });
      this.placeholderText = UI.text(scene, LAYOUT.PADDING_X, midY, '', {
        size: fontSize, font, color: STYLE.PLACEHOLDER, origin: { x: 0, y: 0.5 },
      });
      this.caretRect = scene.add.rectangle(LAYOUT.PADDING_X, midY, LAYOUT.CARET_WIDTH, caretHeight, COLORS.PRIMARY)
        .setOrigin(0, 0.5)
        .setVisible(false);
      this.messageText = UI.text(scene, 2, this.boxY + height + LAYOUT.MESSAGE_GAP, '', {
        size: LAYOUT.MESSAGE_SIZE, color: CSS.TEXT_MUTED, wrap: width - 2, lineSpacing: 2,
      });

      this.hitRect = scene.add.rectangle(0, 0, width, this.boxY + height).setOrigin(0);
      this.hitRect.setInteractive({ cursor: 'text' });

      const parts = [this.box];
      if (this.labelText) parts.push(this.labelText);
      parts.push(this.selectionRect, this.valueText, this.placeholderText, this.caretRect, this.messageText, this.hitRect);
      this.add(parts);

      this.toggleIcon = null;
      this.toggleHit = null;
      if (this.hasToggle) {
        this.toggleIcon = scene.add.graphics();
        this.toggleHit = scene.add.rectangle(width - LAYOUT.TOGGLE_WIDTH, this.boxY, LAYOUT.TOGGLE_WIDTH, height)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true });
        this.add([this.toggleIcon, this.toggleHit]);
        this.toggleHit.on('pointerover', () => {
          this.isToggleHovered = true;
          this.drawToggleIcon();
        });
        this.toggleHit.on('pointerout', () => {
          this.isToggleHovered = false;
          this.drawToggleIcon();
        });
        this.toggleHit.on('pointerdown', (pointer) => {
          if (!this.enabled || (pointer && pointer.button !== 0)) return;
          UI.sound('click');
          this.setPasswordVisible(!this.isRevealed);
        });
      }

      this.hitRect.on('pointerover', () => {
        this.isHovered = true;
        this.refresh();
      });
      this.hitRect.on('pointerout', () => {
        this.isHovered = false;
        this.refresh();
      });
      this.hitRect.on('pointerdown', this.handlePointerDown, this);

      // Zwischenablage: Listener nur, solange das Feld fokussiert ist
      this.handlePaste = (event) => this.onClipboardPaste(event);
      this.handleCopy = (event) => this.onClipboardCopy(event, false);
      this.handleCut = (event) => this.onClipboardCopy(event, true);
      this.hasClipboardListeners = false;

      this.applyPlaceholder();
      this.setValue(value, { silent: true });
      Focus.register(this);
      this.layoutMessage();
      this.setEnabled(this.enabled);
      scene.add.existing(this);
    }

    // ================================================================ öffentliche API

    /** @returns {string} aktueller Inhalt (Klartext, auch bei Passwortfeldern) */
    getValue() {
      return this.value;
    }

    /**
     * Setzt den Inhalt (ohne transformChar), Cursor ans Ende.
     * @param {string} str
     * @param {{silent?: boolean}} [options] silent: kein 'change'-Event/onChange
     * @returns {this}
     */
    setValue(str, { silent = false } = {}) {
      let next = String(str ?? '').replace(/[\r\n]+/g, '');
      if (next.length > this.maxLength) next = next.slice(0, this.maxLength);
      const changed = next !== this.value;
      this.value = next;
      this.caret = next.length;
      this.anchor = this.caret;
      this.scrollStart = 0;
      this.updateDisplay();
      if (changed && !silent) this.emitChange();
      return this;
    }

    /**
     * Fokussiert das Feld (nur wenn aktiviert, sichtbar und nicht von einem Dialog verdeckt).
     * Der Cursor steht danach am Ende (bzw. bei `caretIndex`).
     * @param {{caretIndex?: number}} [options]
     * @returns {this}
     */
    focus({ caretIndex = null } = {}) {
      if (this.hasFocus || !this.canFocus()) return this;
      const reg = Focus.ensure(this.scene);
      if (reg.focused && reg.focused !== this) reg.focused.blur();
      if (!this.scene || !this.canFocus()) return this; // blur-Handler des alten Feldes könnte umbauen
      reg.focused = this;
      this.hasFocus = true;
      this.caret = caretIndex === null ? this.value.length : Phaser.Math.Clamp(caretIndex, 0, this.value.length);
      this.anchor = this.caret;
      this.addClipboardListeners();
      this.startCaretBlink();
      this.updateDisplay();
      this.refresh();
      this.emit('focus', this);
      if (this.scene && typeof this.onFocus === 'function') this.onFocus(this);
      return this;
    }

    /** Nimmt den Fokus weg (Event 'blur'). @returns {this} */
    blur() {
      if (!this.hasFocus) return this;
      this.releaseFocusSilently();
      this.updateDisplay();
      this.refresh();
      this.emit('blur', this);
      if (this.scene && typeof this.onBlur === 'function') this.onBlur(this);
      return this;
    }

    /** @returns {boolean} */
    isFocused() {
      return this.hasFocus;
    }

    /**
     * Fehlerzustand: roter Rahmen + Meldung unter dem Feld (ersetzt den Hinweis).
     * @param {string|null} msgOrNull null/'' = Fehler entfernen
     * @param {{shake?: boolean}} [options] shake: Feld kurz schütteln
     * @returns {this}
     */
    setError(msgOrNull, { shake = false } = {}) {
      this.errorMessage = msgOrNull ? String(msgOrNull) : null;
      this.layoutMessage();
      this.refresh();
      if (shake && this.errorMessage) this.shake();
      return this;
    }

    /** @returns {string|null} aktuelle Fehlermeldung */
    getError() {
      return this.errorMessage;
    }

    /**
     * Hinweistext unter dem Feld (sichtbar, solange kein Fehler gesetzt ist).
     * @param {string|null} str
     * @returns {this}
     */
    setHint(str) {
      this.hintMessage = str ? String(str) : null;
      this.layoutMessage();
      return this;
    }

    /**
     * Aktiviert/deaktiviert das Feld (deaktiviert = grau, kein Fokus).
     * @param {boolean} isEnabled
     * @returns {this}
     */
    setEnabled(isEnabled) {
      this.enabled = Boolean(isEnabled);
      if (!this.enabled) this.blur();
      if (this.hitRect.input) this.hitRect.input.cursor = this.enabled ? 'text' : false;
      if (this.toggleHit && this.toggleHit.input) this.toggleHit.input.cursor = this.enabled ? 'pointer' : false;
      if (!this.enabled && this.isHovered && this.scene) this.scene.input.resetCursor();
      this.refresh();
      return this;
    }

    /** @returns {boolean} */
    isEnabled() {
      return this.enabled;
    }

    /**
     * Passwort im Klartext zeigen (true) oder maskieren (false).
     * @param {boolean} isVisible
     * @returns {this}
     */
    setPasswordVisible(isVisible) {
      this.isRevealed = Boolean(isVisible);
      this.updateDisplay();
      this.drawToggleIcon();
      return this;
    }

    /** @returns {boolean} true, wenn ein Passwort gerade im Klartext steht */
    isPasswordVisible() {
      return this.isRevealed;
    }

    /**
     * Tauscht den Zeichen-Filter aus (z. B. wenn die Tastatur plötzlich auf EN steht).
     * @param {Function|null} fn (char, currentValue, input) => string|null
     * @returns {this}
     */
    setTransformChar(fn) {
      this.transformChar = typeof fn === 'function' ? fn : null;
      return this;
    }

    /** @param {string} str @returns {this} */
    setLabel(str) {
      if (this.labelText) this.labelText.setText(String(str ?? ''));
      return this;
    }

    /** @param {string} str @returns {this} */
    setPlaceholder(str) {
      this.placeholderRaw = String(str ?? '');
      this.applyPlaceholder();
      return this;
    }

    /** @param {number} length 0/Infinity = unbegrenzt @returns {this} */
    setMaxLength(length) {
      this.maxLength = length > 0 ? length : Infinity;
      if (this.value.length > this.maxLength) this.setValue(this.value.slice(0, this.maxLength));
      return this;
    }

    /** Markiert den gesamten Inhalt. @returns {this} */
    selectAll() {
      this.anchor = 0;
      this.caret = this.value.length;
      this.updateDisplay();
      return this;
    }

    /** @returns {number} Cursorposition */
    getCaretPosition() {
      return this.caret;
    }

    /** @param {number} index @returns {this} */
    setCaretPosition(index) {
      this.moveCaret(Phaser.Math.Clamp(Math.round(index), 0, this.value.length), false);
      return this;
    }

    /** Kurzes horizontales Schütteln (z. B. bei falscher Eingabe). @returns {this} */
    shake() {
      if (!this.scene || this.isShaking) return this;
      this.isShaking = true;
      const startX = this.x;
      this.scene.tweens.add({
        targets: this,
        x: startX + 5,
        duration: TIMING.SHAKE_MS,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          this.x = startX;
          this.isShaking = false;
        },
      });
      return this;
    }

    /**
     * Weltkoordinaten des eigentlichen Feldes (ohne Label/Hinweis) – praktisch für Tests.
     * @returns {Phaser.Geom.Rectangle}
     */
    getFieldBounds() {
      const matrix = this.getWorldTransformMatrix();
      const topLeft = matrix.transformPoint(0, this.boxY);
      const bottomRight = matrix.transformPoint(this.fieldWidth, this.boxY + this.fieldHeight);
      return new Phaser.Geom.Rectangle(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    }

    /** @returns {number} Gesamthöhe inkl. Label und Hinweis/Fehler */
    getTotalHeight() {
      return this.height;
    }

    // ================================================================ Fokus-Prüfungen

    /** Darf das Feld jetzt den Fokus bekommen? */
    canFocus() {
      if (!this.scene || !this.enabled || !Util.isDisplayed(this)) return false;
      const modal = Util.topModal(this.scene);
      return !modal || Util.isDescendant(this, modal);
    }

    /** Darf das fokussierte Feld weiter Tasten empfangen? */
    canKeepFocus() {
      return this.canFocus() && this.scene.sys.isActive();
    }

    /** Gehört das (unter dem Zeiger liegende) Objekt zu diesem Feld? */
    ownsObject(gameObject) {
      return gameObject === this.hitRect || (this.toggleHit !== null && gameObject === this.toggleHit);
    }

    /** Fokus-Zustand aufräumen, ohne Events auszulösen (destroy/teardown). */
    releaseFocusSilently() {
      const reg = Focus.get(this.scene);
      if (reg && reg.focused === this) reg.focused = null;
      this.hasFocus = false;
      this.anchor = this.caret;
      this.removeClipboardListeners();
      this.stopCaretBlink();
    }

    // ================================================================ Tastatur

    /** Verarbeitet ein keydown-Event (nur aufgerufen, wenn fokussiert und sichtbar). */
    handleKeyDown(event) {
      // Gerade ausgeblendet (z. B. Einblend-Tween bei alpha 0): Taste nicht annehmen
      if (Util.effectiveAlpha(this) < MIN_VISIBLE_ALPHA) return;
      if (event.isComposing) return;
      const key = event.key;
      const isAltGraph = (typeof event.getModifierState === 'function' && event.getModifierState('AltGraph'))
        || (event.ctrlKey && event.altKey);
      const isShortcut = (event.ctrlKey || event.metaKey) && !isAltGraph;
      const isWordJump = event.altKey || (event.ctrlKey && !event.metaKey);
      const isLineJump = event.metaKey;
      const extend = event.shiftKey;
      const reg = Focus.get(this.scene);

      switch (key) {
        case 'Tab':
          event.preventDefault();
          if (reg) Focus.cycle(reg, this, event.shiftKey ? -1 : 1);
          return;
        case 'Enter':
          event.preventDefault();
          if (!event.repeat) this.submit(); // gedrückt halten = nur ein submit
          return;
        case 'Escape':
          this.blur();
          return;
        case 'Backspace':
          event.preventDefault();
          this.deleteBackward(isLineJump ? 'line' : isWordJump ? 'word' : 'char');
          return;
        case 'Delete':
          event.preventDefault();
          this.deleteForward(isWordJump ? 'word' : 'char');
          return;
        case 'ArrowLeft':
          event.preventDefault();
          this.moveCaret(this.targetLeft(isLineJump, isWordJump, extend), extend);
          return;
        case 'ArrowRight':
          event.preventDefault();
          this.moveCaret(this.targetRight(isLineJump, isWordJump, extend), extend);
          return;
        case 'Home':
        case 'ArrowUp':
          event.preventDefault();
          this.moveCaret(0, extend);
          return;
        case 'End':
        case 'ArrowDown':
          event.preventDefault();
          this.moveCaret(this.value.length, extend);
          return;
        default:
          break;
      }

      if (isShortcut) {
        // Strg/Cmd+V/C/X: NICHT verhindern – der Browser feuert dann paste/copy/cut
        if (key.toLowerCase() === 'a') {
          event.preventDefault();
          this.selectAll();
        }
        return;
      }

      // Druckbares Zeichen (inkl. Leertaste, Umlaute, ß, @, €; Emoji = 1 Codepoint)
      if (key && Array.from(key).length === 1) {
        event.preventDefault();
        this.insertText(key);
      }
    }

    targetLeft(isLineJump, isWordJump, extend) {
      if (this.hasSelection() && !extend) return this.selectionRange()[0];
      if (isLineJump) return 0;
      if (isWordJump) return this.isMasked() ? 0 : Util.wordStartBefore(this.value, this.caret);
      return Util.prevIndex(this.value, this.caret);
    }

    targetRight(isLineJump, isWordJump, extend) {
      if (this.hasSelection() && !extend) return this.selectionRange()[1];
      if (isLineJump) return this.value.length;
      if (isWordJump) return this.isMasked() ? this.value.length : Util.wordEndAfter(this.value, this.caret);
      return Util.nextIndex(this.value, this.caret);
    }

    /** Enter: Events 'submit' und onSubmit. */
    submit() {
      const value = this.value;
      this.emit('submit', value, this);
      if (this.scene && typeof this.onSubmit === 'function') this.onSubmit(value, this);
    }

    // ================================================================ Bearbeiten

    hasSelection() {
      return this.anchor !== this.caret;
    }

    /** @returns {[number, number]} [start, end) der Markierung */
    selectionRange() {
      return [Math.min(this.anchor, this.caret), Math.max(this.anchor, this.caret)];
    }

    /** Passwort verdeckt? (dann keine Wort-Sprünge, kein Kopieren) */
    isMasked() {
      return this.isPassword && !this.isRevealed;
    }

    /** Entfernt die Markierung aus dem Wert; true, wenn etwas gelöscht wurde. */
    removeSelection() {
      if (!this.hasSelection()) return false;
      const [start, end] = this.selectionRange();
      this.value = this.value.slice(0, start) + this.value.slice(end);
      this.caret = start;
      this.anchor = start;
      return true;
    }

    /**
     * Fügt Text an der Cursorposition ein (wie Tippen): jedes Zeichen läuft durch
     * transformChar, maxLength wird beachtet, eine Markierung wird ersetzt.
     * @param {string} str
     * @returns {boolean} true, wenn sich der Wert geändert hat
     */
    insertText(str) {
      let changed = this.removeSelection();
      for (const char of Array.from(String(str ?? ''))) {
        if (this.value.length >= this.maxLength) break; // voll: transformChar nicht mehr fragen
        let output = char;
        if (this.transformChar) {
          const result = this.transformChar(char, this.value, this);
          if (result === null || result === false) continue; // Zeichen verschluckt
          if (result !== undefined) output = String(result);
        }
        for (const piece of Array.from(output)) {
          if (this.value.length + piece.length > this.maxLength) break;
          this.value = this.value.slice(0, this.caret) + piece + this.value.slice(this.caret);
          this.caret += piece.length;
          changed = true;
        }
      }
      this.anchor = this.caret;
      if (changed) UI.sound('type');
      this.afterEdit(changed);
      return changed;
    }

    /** Backspace: Markierung, Zeichen, Wort ('word') oder alles links ('line') löschen. */
    deleteBackward(unit = 'char') {
      if (this.removeSelection()) {
        this.afterEdit(true);
        return;
      }
      if (this.caret === 0) return;
      let start = Util.prevIndex(this.value, this.caret);
      if (unit === 'line' || (unit === 'word' && this.isMasked())) start = 0;
      else if (unit === 'word') start = Util.wordStartBefore(this.value, this.caret);
      this.value = this.value.slice(0, start) + this.value.slice(this.caret);
      this.caret = start;
      this.anchor = start;
      this.afterEdit(true);
    }

    /** Delete (Entf): Markierung, Zeichen oder Wort rechts vom Cursor löschen. */
    deleteForward(unit = 'char') {
      if (this.removeSelection()) {
        this.afterEdit(true);
        return;
      }
      if (this.caret >= this.value.length) return;
      let end = Util.nextIndex(this.value, this.caret);
      if (unit === 'word') end = this.isMasked() ? this.value.length : Util.wordEndAfter(this.value, this.caret);
      this.value = this.value.slice(0, this.caret) + this.value.slice(end);
      this.anchor = this.caret;
      this.afterEdit(true);
    }

    /** Cursor bewegen; extend = Markierung erweitern (Umschalt). */
    moveCaret(index, extend) {
      this.caret = Phaser.Math.Clamp(index, 0, this.value.length);
      if (!extend) this.anchor = this.caret;
      this.restartCaretBlink();
      this.updateDisplay();
    }

    afterEdit(changed) {
      this.restartCaretBlink();
      this.updateDisplay();
      if (changed) this.emitChange();
    }

    emitChange() {
      const value = this.value;
      this.emit('change', value, this);
      if (this.scene && typeof this.onChange === 'function') this.onChange(value, this);
    }

    // ================================================================ Zwischenablage

    addClipboardListeners() {
      if (this.hasClipboardListeners || typeof window === 'undefined') return;
      window.addEventListener('paste', this.handlePaste);
      window.addEventListener('copy', this.handleCopy);
      window.addEventListener('cut', this.handleCut);
      this.hasClipboardListeners = true;
    }

    removeClipboardListeners() {
      if (!this.hasClipboardListeners || typeof window === 'undefined') return;
      window.removeEventListener('paste', this.handlePaste);
      window.removeEventListener('copy', this.handleCopy);
      window.removeEventListener('cut', this.handleCut);
      this.hasClipboardListeners = false;
    }

    /** window-'paste' (Strg/Cmd+V): nur wenn fokussiert, sichtbar und die Szene aktiv ist. */
    onClipboardPaste(event) {
      if (!this.hasFocus || !this.canKeepFocus()) return;
      if (Util.effectiveAlpha(this) < MIN_VISIBLE_ALPHA) return;
      const data = event.clipboardData || (typeof window !== 'undefined' && window.clipboardData);
      const text = data ? data.getData('text') || data.getData('text/plain') || '' : '';
      event.preventDefault();
      // Einzeilig: Zeilenumbrüche entfernen, Tabs werden Leerzeichen
      const cleaned = text.replace(/[\r\n]+/g, '').replace(/\t/g, ' ');
      if (cleaned) this.insertText(cleaned);
    }

    /** window-'copy'/'cut': markierten Text liefern (nie bei verdecktem Passwort). */
    onClipboardCopy(event, isCut) {
      if (!this.hasFocus || !this.canKeepFocus() || !this.hasSelection() || this.isMasked()) return;
      if (!event.clipboardData) return;
      const [start, end] = this.selectionRange();
      event.clipboardData.setData('text/plain', this.value.slice(start, end));
      event.preventDefault();
      if (isCut && this.removeSelection()) this.afterEdit(true);
    }

    // ================================================================ Maus

    /** Klick ins Feld: fokussieren und Cursor an die Klickposition (Doppelklick = Wort). */
    handlePointerDown(pointer, localX) {
      if (!this.enabled || (pointer && pointer.button !== 0)) return;
      // Index im gerade sichtbaren Ausschnitt bestimmen, bevor der Fokus ihn verschiebt
      const index = this.indexFromLocalX(localX);
      const wasFocused = this.hasFocus;
      this.focus({ caretIndex: index });
      if (!this.hasFocus) return;
      const now = pointer && pointer.downTime !== undefined ? pointer.downTime : 0;
      const x = localX || 0;
      if (!wasFocused) {
        this.lastPointerDownTime = now;
        this.lastPointerDownX = x;
        return;
      }
      const isDoubleClick = now - this.lastPointerDownTime < TIMING.DOUBLE_CLICK_MS
        && Math.abs(x - this.lastPointerDownX) <= DOUBLE_CLICK_DISTANCE;
      this.lastPointerDownTime = isDoubleClick ? -Infinity : now;
      this.lastPointerDownX = x;
      if (isDoubleClick) {
        this.selectWordAt(index);
        return;
      }
      const extend = Boolean(pointer && pointer.event && pointer.event.shiftKey);
      this.moveCaret(index, extend);
    }

    /** Markiert das Wort an index (bei verdecktem Passwort: alles). */
    selectWordAt(index) {
      if (this.isMasked()) {
        this.selectAll();
        return;
      }
      let start = index;
      let end = index;
      while (start > 0 && Util.isWordChar(this.value[start - 1])) start -= 1;
      while (end < this.value.length && Util.isWordChar(this.value[end])) end += 1;
      if (start === end) {
        this.moveCaret(index, false);
        return;
      }
      this.anchor = start;
      this.caret = end;
      this.restartCaretBlink();
      this.updateDisplay();
    }

    /** Zeichenindex, der einer x-Position (lokal, px) am nächsten liegt. */
    indexFromLocalX(localX) {
      const display = this.getDisplayString();
      const target = (localX || 0) - LAYOUT.PADDING_X;
      this.syncMeasureFont();
      let best = this.scrollStart;
      let bestDistance = Infinity;
      for (let i = this.scrollStart; i <= this.visibleEnd; i = Util.nextIndex(display, i)) {
        const distance = Math.abs(this.measure(display.slice(this.scrollStart, i)) - target);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
        if (i >= display.length) break;
      }
      return best;
    }

    // ================================================================ Darstellung

    /** Angezeigter Text (Maske bei verdecktem Passwort, ein • je UTF-16-Einheit). */
    getDisplayString() {
      return this.isMasked() ? STYLE.MASK_CHAR.repeat(this.value.length) : this.value;
    }

    /** Text-Innenbreite (ohne Polster und Auge-Umschalter). */
    getInnerWidth() {
      const toggle = this.hasToggle ? LAYOUT.TOGGLE_WIDTH - LAYOUT.PADDING_X / 2 : 0;
      return Math.max(10, this.fieldWidth - 2 * LAYOUT.PADDING_X - toggle);
    }

    syncMeasureFont() {
      this.valueText.style.syncFont(this.valueText.canvas, this.valueText.context);
    }

    /** Breite eines Strings im Feld-Font (px). Vorher syncMeasureFont() aufrufen. */
    measure(str) {
      return str ? this.valueText.context.measureText(str).width : 0;
    }

    /** Scroll-Ausschnitt, sichtbarer Text, Cursor und Markierung neu berechnen. */
    updateDisplay() {
      if (!this.scene) return;
      const display = this.getDisplayString();
      const innerWidth = this.getInnerWidth();
      const limit = innerWidth - LAYOUT.CARET_EDGE;
      this.syncMeasureFont();

      if (!this.hasFocus) {
        // Ohne Fokus zeigt ein Feld (wie im Browser) den Textanfang
        this.scrollStart = 0;
      } else {
        // 1. Cursor muss sichtbar sein
        if (this.caret < this.scrollStart) this.scrollStart = this.caret;
        while (this.scrollStart < this.caret && this.measure(display.slice(this.scrollStart, this.caret)) > limit) {
          this.scrollStart = Util.nextIndex(display, this.scrollStart);
        }
        // 2. Nach dem Löschen: Text wieder auffüllen statt Leerraum rechts zu zeigen
        while (this.scrollStart > 0) {
          const previous = Util.prevIndex(display, this.scrollStart);
          if (this.measure(display.slice(previous)) > limit) break;
          this.scrollStart = previous;
        }
      }
      // 3. Sichtbares Ende
      let end = this.scrollStart;
      while (end < display.length) {
        const next = Util.nextIndex(display, end);
        if (this.measure(display.slice(this.scrollStart, next)) > innerWidth) break;
        end = next;
      }
      this.visibleEnd = end;
      this.valueText.setText(display.slice(this.scrollStart, end));
      this.placeholderText.setVisible(this.value.length === 0);

      // Cursor
      const caretX = LAYOUT.PADDING_X + this.measure(display.slice(this.scrollStart, this.caret));
      this.caretRect.x = Math.round(caretX) - 1;

      // Markierung (auf den sichtbaren Ausschnitt begrenzt)
      if (this.hasFocus && this.hasSelection()) {
        const [start, stop] = this.selectionRange();
        const from = Phaser.Math.Clamp(start, this.scrollStart, end);
        const to = Phaser.Math.Clamp(stop, this.scrollStart, end);
        const x1 = LAYOUT.PADDING_X + this.measure(display.slice(this.scrollStart, from));
        const x2 = LAYOUT.PADDING_X + this.measure(display.slice(this.scrollStart, to));
        this.selectionRect.setPosition(Math.round(x1), this.selectionRect.y);
        this.selectionRect.setSize(Math.max(1, Math.round(x2 - x1)), this.selectionRect.height);
        this.selectionRect.setVisible(x2 > x1);
      } else {
        this.selectionRect.setVisible(false);
      }
      this.updateCaretVisibility();
    }

    updateCaretVisibility() {
      this.caretRect.setVisible(this.hasFocus && this.caretVisible && !this.hasSelection());
    }

    /** Platzhalter mit „…“ kürzen, falls er nicht ins Feld passt. */
    applyPlaceholder() {
      this.placeholderText.setText(Util.ellipsize(this.placeholderText, this.placeholderRaw, this.getInnerWidth()));
    }

    /** Hinweis- bzw. Fehlerzeile setzen und Gesamthöhe aktualisieren. */
    layoutMessage() {
      const message = this.errorMessage || this.hintMessage || '';
      this.messageText.setText(message);
      Util.setTextColor(this.messageText, this.errorMessage ? CSS.DANGER : CSS.TEXT_MUTED);
      this.messageText.setVisible(message.length > 0);
      const messageHeight = message ? LAYOUT.MESSAGE_GAP + this.messageText.height : 0;
      this.setSize(this.fieldWidth, this.boxY + this.fieldHeight + messageHeight);
    }

    /** Rahmen, Fokus-Schein, Labelfarbe und Deckkraft passend zum Zustand. */
    refresh() {
      if (!this.scene) return;
      const g = this.box;
      const w = this.fieldWidth;
      const h = this.fieldHeight;
      const top = this.boxY;
      const hasError = Boolean(this.errorMessage);
      const accent = hasError ? COLORS.DANGER : COLORS.PRIMARY;
      g.clear();
      if (this.hasFocus) {
        const halo = LAYOUT.FOCUS_HALO;
        g.fillStyle(accent, STYLE.HALO_ALPHA);
        g.fillRoundedRect(-halo, top - halo, w + 2 * halo, h + 2 * halo, LAYOUT.RADIUS + halo);
      }
      g.fillStyle(this.enabled ? COLORS.SURFACE : COLORS.SURFACE_ALT, 1);
      g.fillRoundedRect(0, top, w, h, LAYOUT.RADIUS);
      const isStrong = this.hasFocus || hasError;
      const lineWidth = isStrong ? 2 : 1;
      let borderColor = STYLE.BORDER;
      if (isStrong) borderColor = accent;
      else if (this.isHovered && this.enabled) borderColor = STYLE.BORDER_HOVER;
      g.lineStyle(lineWidth, borderColor, 1);
      g.strokeRoundedRect(lineWidth / 2, top + lineWidth / 2, w - lineWidth, h - lineWidth, LAYOUT.RADIUS);

      if (this.labelText) {
        let labelColor = CSS.TEXT_MUTED;
        if (hasError) labelColor = CSS.DANGER;
        else if (this.hasFocus) labelColor = CSS.PRIMARY;
        Util.setTextColor(this.labelText, labelColor);
      }

      const alpha = this.enabled ? 1 : STYLE.DISABLED_ALPHA;
      [this.labelText, this.valueText, this.placeholderText, this.toggleIcon].forEach((part) => {
        if (part) part.setAlpha(alpha);
      });
      this.drawToggleIcon();
      this.updateCaretVisibility();
    }

    /** Auge-Symbol: offen = Klartext, durchgestrichen = verdeckt. */
    drawToggleIcon() {
      if (!this.toggleIcon) return;
      const g = this.toggleIcon;
      const cx = this.fieldWidth - LAYOUT.TOGGLE_WIDTH / 2;
      const cy = this.boxY + this.fieldHeight / 2;
      const color = this.isToggleHovered && this.enabled ? STYLE.ICON_HOVER : STYLE.ICON;
      g.clear();
      g.lineStyle(1.8, color, 1);
      g.strokeEllipse(cx, cy, 20, 12);
      g.fillStyle(color, 1);
      g.fillCircle(cx, cy, 3);
      if (!this.isRevealed) {
        // Strich mit weißem Rand, damit er sich vom Auge abhebt
        g.lineStyle(4, this.enabled ? COLORS.SURFACE : COLORS.SURFACE_ALT, 1);
        g.lineBetween(cx - 9, cy + 7, cx + 9, cy - 7);
        g.lineStyle(1.8, color, 1);
        g.lineBetween(cx - 9, cy + 7, cx + 9, cy - 7);
      }
    }

    // ================================================================ Cursor-Blinken

    startCaretBlink() {
      this.stopCaretBlink();
      if (!this.scene) return;
      this.caretVisible = true;
      this.caretTimer = this.scene.time.addEvent({
        delay: TIMING.CARET_BLINK_MS,
        loop: true,
        callback: () => {
          this.caretVisible = !this.caretVisible;
          this.updateCaretVisibility();
        },
      });
      this.updateCaretVisibility();
    }

    stopCaretBlink() {
      if (this.caretTimer) this.caretTimer.remove(false);
      this.caretTimer = null;
      this.caretVisible = false;
      if (this.caretRect && this.caretRect.scene) this.caretRect.setVisible(false);
    }

    /** Nach jeder Eingabe: Cursor sofort sichtbar, Blinkphase neu starten. */
    restartCaretBlink() {
      if (this.hasFocus) this.startCaretBlink();
    }

    // ================================================================ Aufräumen

    /** Räumt Fokus, Timer, DOM-Listener und Registry-Eintrag ab. */
    destroy(fromScene) {
      if (!this.scene) return;
      const scene = this.scene;
      this.releaseFocusSilently();
      Focus.unregister(this, scene);
      super.destroy(fromScene);
    }

    // ================================================================ statisch

    /** Nimmt allen Feldern der Szene den Fokus. */
    static blurAll(scene) {
      const reg = Focus.get(scene);
      if (reg && reg.focused) reg.focused.blur();
    }

    /** @returns {UITextInput|null} fokussiertes Feld der Szene */
    static getFocused(scene) {
      const reg = Focus.get(scene);
      return reg ? reg.focused : null;
    }

    /**
     * Wird gerade getippt? Praktisch für Kapitel-/HUD-Tastenkürzel, die beim Tippen
     * nicht auslösen sollen.
     * @param {Phaser.Scene} [scene] ohne Szene: irgendeine Szene
     * @returns {boolean}
     */
    static isAnyFocused(scene) {
      if (scene) return Boolean(UITextInput.getFocused(scene));
      for (const reg of activeRegistries) if (reg.focused) return true;
      return false;
    }

    /** @returns {UITextInput[]} alle Felder der Szene in Erstellungsreihenfolge */
    static getAll(scene) {
      const reg = Focus.get(scene);
      return reg ? reg.inputs.slice() : [];
    }
  }

  /** Maße für Layout-Berechnungen in Kapiteln (nur lesen). */
  UITextInput.LAYOUT = LAYOUT;
  /** Pflicht-Hinweis für Passwort-/Identitätsfelder (siehe Konventionen), z. B. als `hint`. */
  UITextInput.CREDENTIALS_HINT = 'Spiel – bitte keine echten Zugangsdaten eingeben';

  UI.TextInput = UITextInput;
})();
