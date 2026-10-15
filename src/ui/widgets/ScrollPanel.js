/**
 * ScrollPanel.js – Scrollbarer Textbereich (UI.ScrollPanel), z. B. für die absurd lange
 * Nutzungsordnung in Kapitel 1.
 *
 * - Inhalt in einem Container mit GeometryMask. Die Masken-Graphics liegt NICHT im
 *   Container (Phaser rechnet Masken in Weltkoordinaten) und folgt dem Panel jedes Frame
 *   – auch wenn das Panel in einem Fenster, Handy oder bewegten Container steckt.
 * - Mausrad nur, wenn das oberste Objekt unter dem Zeiger zum Panel gehört (ein Modal
 *   darüber blockiert also), weiches Scrollen, Ziehen im Text, Scrollbalken (ziehen oder
 *   in die Spur klicken), Verlaufskanten oben/unten als Hinweis auf weiteren Text.
 * - Sehr lange Texte werden in mehrere Text-Objekte aufgeteilt, damit keine Textur die
 *   maximale GPU-Texturgröße überschreitet.
 * - Events: 'scroll'(progress 0..1) bei jeder Änderung, 'scrollend' EINMAL, sobald das
 *   Ende erreicht ist (nach setText() wieder scharf). Passt der Text ohne Scrollen, gilt
 *   das Ende im ersten Frame als erreicht.
 *
 * Positionierung über die linke obere Ecke (Container).
 *
 * Global: hängt UI.ScrollPanel an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js).
 */

UI.ScrollPanel = (() => {
  const SCROLLBAR = { WIDTH: 5, HIT_WIDTH: 16, MARGIN: 4, MIN_THUMB: 28, GUTTER: 10 };
  const FADE_HEIGHT = 18;
  const SMOOTH_MS = 70;           // Zeitkonstante des weichen Scrollens
  const SNAP_PX = 0.4;            // ab hier gilt das Ziel als erreicht
  const END_TOLERANCE_PX = 1;     // so nah am Ende zählt als „unten“
  const SAFE_TEXTURE_PX = 3800;   // max. Höhe eines Text-Objekts in Geräte-Pixeln

  /** Verlaufstextur (Panel-Farbe → transparent) je Hintergrundfarbe, einmal pro Spiel. */
  function fadeTexture(scene, color) {
    const key = `ui-scrollfade-${(color >>> 0).toString(16)}`;
    if (scene.textures.exists(key)) return key;
    const texture = scene.textures.createCanvas(key, 4, 32);
    const ctx = texture.getContext();
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    const gradient = ctx.createLinearGradient(0, 0, 0, 32);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4, 32);
    texture.refresh();
    return key;
  }

  return class ScrollPanel extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke
     * @param {number} y
     * @param {object} [opts]
     * @param {number} [opts.width=320]
     * @param {number} [opts.height=240]
     * @param {string} [opts.text='']
     * @param {string} [opts.font='UI'] Rolle aus CONFIG.FONTS
     * @param {number} [opts.fontSize=14]
     * @param {string} [opts.color=CONFIG.CSS.TEXT]
     * @param {number} [opts.padding=12]
     * @param {number} [opts.bgColor=CONFIG.COLORS.SURFACE]
     * @param {Function} [opts.onScroll] (progress) => void
     * @param {Function} [opts.onScrollEnd] () => void, einmalig
     * @param {number|null} [opts.borderColor=CONFIG.COLORS.BORDER] null = kein Rahmen
     * @param {number} [opts.lineSpacing=4]
     * @param {number} [opts.wheelSpeed=1] Faktor auf die Mausrad-Distanz
     */
    constructor(scene, x, y, {
      width = 320, height = 240, text = '', font = 'UI', fontSize = 14, color = CONFIG.CSS.TEXT, padding = 12,
      bgColor = CONFIG.COLORS.SURFACE, onScroll = null, onScrollEnd = null, borderColor = CONFIG.COLORS.BORDER,
      lineSpacing = 4, wheelSpeed = 1,
    } = {}) {
      super(scene, x, y);
      this.panelWidth = width;
      this.panelHeight = height;
      this.padding = padding;
      this.textStyleOptions = {
        size: fontSize, color, font, lineSpacing, wrap: Math.max(20, width - 2 * padding - SCROLLBAR.GUTTER),
      };
      this.onScrollCallback = onScroll;
      this.onScrollEndCallback = onScrollEnd;
      this.wheelSpeed = wheelSpeed;

      this.scrollY = 0;
      this.targetY = 0;
      this.maxScroll = 0;
      this.contentHeight = 0;
      this.hasReachedEnd = false;
      this.lastProgress = null;
      this.drag = null;
      this.knownChildCount = 0;
      this.textObjects = [];
      this.thumbLength = 0;
      this.lastMaskState = '';
      this.tempMatrix = new Phaser.GameObjects.Components.TransformMatrix();
      this.tempParentMatrix = new Phaser.GameObjects.Components.TransformMatrix();

      // Aufbau (Reihenfolge = Zeichenreihenfolge)
      this.bg = scene.add.rectangle(0, 0, width, height, bgColor, 1).setOrigin(0).setInteractive();
      this.content = new Phaser.GameObjects.Container(scene, 0, 0);
      const fadeKey = fadeTexture(scene, bgColor);
      this.fadeTop = scene.add.image(1, 1, fadeKey).setOrigin(0).setDisplaySize(width - 2, FADE_HEIGHT).setVisible(false);
      this.fadeBottom = scene.add.image(1, height - 1, fadeKey).setOrigin(0, 0).setFlipY(true).setDisplaySize(width - 2, FADE_HEIGHT);
      this.fadeBottom.y = height - 1 - FADE_HEIGHT;
      this.fadeBottom.setVisible(false);
      this.trackGfx = new Phaser.GameObjects.Graphics(scene);
      this.thumbGfx = new Phaser.GameObjects.Graphics(scene);
      this.trackHit = scene.add.rectangle(width - SCROLLBAR.HIT_WIDTH, 0, SCROLLBAR.HIT_WIDTH, height, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      this.add([this.bg, this.content, this.fadeTop, this.fadeBottom, this.trackGfx, this.thumbGfx, this.trackHit]);
      if (borderColor !== null && borderColor !== undefined) {
        this.border = new Phaser.GameObjects.Graphics(scene);
        this.border.lineStyle(1, borderColor, 1);
        this.border.strokeRect(0.5, 0.5, width - 1, height - 1);
        this.add(this.border);
      }

      // Maske in Weltkoordinaten (nicht im Container!)
      this.maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
      this.maskShape.fillStyle(0xffffff, 1);
      this.maskShape.fillRect(0, 0, width, height);
      this.content.setMask(this.maskShape.createGeometryMask());

      this.setSize(width, height);
      scene.add.existing(this);

      // Eingaben
      this.bg.on('pointerdown', this.handleContentDown, this);
      this.trackHit.on('pointerdown', this.handleTrackDown, this);
      scene.input.on('wheel', this.handleWheel, this);
      scene.input.on('pointermove', this.handlePointerMove, this);
      scene.input.on('pointerup', this.handlePointerUp, this);
      scene.input.on('pointerupoutside', this.handlePointerUp, this);
      scene.events.on('postupdate', this.handlePostUpdate, this);

      this.setText(text);
      this.syncMask();
    }

    // --- öffentliche API ----------------------------------------------------

    /** @returns {number} Scroll-Fortschritt 0..1 (1 = unten bzw. kein Scrollen nötig) */
    getProgress() {
      if (this.maxScroll <= 0) return 1;
      return Math.min(1, Math.max(0, this.scrollY / this.maxScroll));
    }

    /**
     * Springt zu einem Fortschritt (0 = oben, 1 = unten).
     * @param {number} p01
     * @param {{animate?: boolean}} [opts] animate = weich scrollen
     * @returns {this}
     */
    scrollTo(p01, { animate = false } = {}) {
      const p = Math.min(1, Math.max(0, Number(p01) || 0));
      this.setTarget(p * this.maxScroll, !animate);
      return this;
    }

    /**
     * Scrollt um px Pixel (positiv = nach unten).
     * @param {number} px
     * @param {{animate?: boolean}} [opts]
     * @returns {this}
     */
    scrollBy(px, { animate = false } = {}) {
      this.setTarget(this.targetY + (Number(px) || 0), !animate);
      return this;
    }

    /**
     * Ersetzt den Text, scrollt nach oben und macht 'scrollend' wieder scharf.
     * @param {string} str
     * @returns {this}
     */
    setText(str) {
      this.fullText = String(str === undefined || str === null ? '' : str);
      this.textObjects.forEach((t) => t.destroy());
      this.textObjects = this.buildTextObjects(this.fullText);
      this.textObjects.forEach((t, i) => this.content.addAt(t, i));
      this.hasReachedEnd = false;
      this.lastProgress = null;
      this.scrollY = 0;
      this.targetY = 0;
      this.refresh();
      return this;
    }

    /** @returns {string} */
    getText() {
      return this.fullText;
    }

    /**
     * Erstes Text-Objekt des Inhalts. Bei sehr langen Texten ist der Text auf mehrere
     * Objekte verteilt → getTextObjects().
     * @returns {Phaser.GameObjects.Text}
     */
    getTextObject() {
      return this.textObjects[0];
    }

    /** @returns {Phaser.GameObjects.Text[]} alle Text-Objekte (lückenlos untereinander) */
    getTextObjects() {
      return this.textObjects.slice();
    }

    /**
     * Container des Inhalts (Koordinaten relativ zur linken oberen Panel-Ecke, ungescrollt).
     * Eigene Kinder hinzufügen und danach refresh() aufrufen (passiert sonst im nächsten Frame).
     * @returns {Phaser.GameObjects.Container}
     */
    getContent() {
      return this.content;
    }

    /** Misst die Inhaltshöhe neu und aktualisiert Scrollbalken/Kanten. @returns {this} */
    refresh() {
      this.knownChildCount = this.content.list.length;
      let bottom = 0;
      this.content.list.forEach((child) => {
        if (!child.visible) return;
        let childBottom;
        if (child.type === 'Container') {
          childBottom = child.y + (child.height || 0);
          if (!child.height && child.list.length) {
            const bounds = child.getBounds();
            const scale = this.getWorldScale();
            childBottom = child.y + bounds.height / scale;
          }
        } else {
          const height = child.displayHeight || 0;
          const originY = typeof child.originY === 'number' ? child.originY : 0;
          childBottom = child.y + (1 - originY) * height;
        }
        bottom = Math.max(bottom, childBottom);
      });
      this.contentHeight = bottom + this.padding;
      this.maxScroll = Math.max(0, Math.ceil(this.contentHeight - this.panelHeight));
      this.targetY = Math.min(this.targetY, this.maxScroll);
      this.scrollY = Math.min(this.scrollY, this.maxScroll);
      this.drawScrollbar();
      this.applyScroll();
      return this;
    }

    /** @returns {boolean} true, sobald das Ende einmal erreicht wurde */
    isAtEnd() {
      return this.hasReachedEnd;
    }

    // --- Aufbau -------------------------------------------------------------

    /** Erzeugt ein oder mehrere Text-Objekte (lange Texte werden zeilenweise gestückelt). */
    buildTextObjects(str) {
      const scene = this.scene;
      // Erst leer anlegen: Höhe aus den umbrochenen Zeilen abschätzen, ohne vorher eine
      // womöglich zu große Textur für den Gesamttext zu erzeugen.
      const first = UI.text(scene, this.padding, this.padding, '', this.textStyleOptions);
      const resolution = first.style.resolution || 1;
      const lineHeight = first.style.metrics ? first.style.metrics.fontSize : this.textStyleOptions.size * 1.2;
      const spacing = this.textStyleOptions.lineSpacing;
      const maxLines = Math.max(1, Math.floor((SAFE_TEXTURE_PX / resolution + spacing) / (lineHeight + spacing)));
      const lines = str ? first.getWrappedText(str) : [''];
      if (lines.length <= maxLines) {
        first.setText(str);
        return [first];
      }

      first.setText(lines.slice(0, maxLines).join('\n'));
      const objects = [first];
      let y = this.padding + first.height + spacing;
      for (let start = maxLines; start < lines.length; start += maxLines) {
        const chunk = UI.text(scene, this.padding, y, lines.slice(start, start + maxLines).join('\n'), this.textStyleOptions);
        objects.push(chunk);
        y += chunk.height + spacing;
      }
      return objects;
    }

    drawScrollbar() {
      const trackLength = this.panelHeight - 2 * SCROLLBAR.MARGIN;
      const x = this.panelWidth - SCROLLBAR.MARGIN - SCROLLBAR.WIDTH;
      const hasOverflow = this.maxScroll > 0;
      this.trackGfx.clear();
      this.thumbGfx.clear();
      this.trackHit.setVisible(hasOverflow);
      if (!hasOverflow) return;
      this.trackGfx.fillStyle(CONFIG.COLORS.TEXT_MUTED, 0.12);
      this.trackGfx.fillRoundedRect(x, SCROLLBAR.MARGIN, SCROLLBAR.WIDTH, trackLength, SCROLLBAR.WIDTH / 2);
      this.thumbLength = Math.max(SCROLLBAR.MIN_THUMB, (this.panelHeight / this.contentHeight) * trackLength);
      this.thumbGfx.fillStyle(CONFIG.COLORS.TEXT_MUTED, 0.6);
      this.thumbGfx.fillRoundedRect(x, 0, SCROLLBAR.WIDTH, this.thumbLength, SCROLLBAR.WIDTH / 2);
    }

    /** Überträgt scrollY auf Inhalt, Daumen, Kanten; sendet 'scroll' und ggf. 'scrollend'. */
    applyScroll() {
      this.content.y = -Math.round(this.scrollY);
      const trackLength = this.panelHeight - 2 * SCROLLBAR.MARGIN;
      const progress = this.getProgress();
      this.thumbGfx.y = SCROLLBAR.MARGIN + (trackLength - this.thumbLength) * (this.maxScroll > 0 ? progress : 0);
      this.fadeTop.setVisible(this.maxScroll > 0 && this.scrollY > 1);
      this.fadeBottom.setVisible(this.maxScroll > 0 && this.scrollY < this.maxScroll - 1);

      if (this.lastProgress !== null && Math.abs(progress - this.lastProgress) > 1e-6) {
        this.emit('scroll', progress);
        if (typeof this.onScrollCallback === 'function') this.onScrollCallback(progress);
      }
      this.lastProgress = progress;
      this.checkEnd();
    }

    checkEnd() {
      if (this.hasReachedEnd || !this.scene) return;
      const isAtBottom = this.maxScroll <= 0 || this.scrollY >= this.maxScroll - END_TOLERANCE_PX;
      if (!isAtBottom) return;
      this.hasReachedEnd = true;
      // erst im nächsten Frame melden, falls das Ende schon im Konstruktor erreicht ist
      if (!this.isConstructed) {
        this.pendingEnd = true;
        return;
      }
      this.emit('scrollend');
      if (typeof this.onScrollEndCallback === 'function') this.onScrollEndCallback();
    }

    // --- Scroll-Logik -------------------------------------------------------

    setTarget(y, immediate) {
      this.targetY = Math.min(this.maxScroll, Math.max(0, y));
      if (immediate) {
        this.scrollY = this.targetY;
        this.applyScroll();
      }
    }

    getWorldScale() {
      const m = this.getWorldTransformMatrix(this.tempMatrix, this.tempParentMatrix);
      return Math.hypot(m.a, m.b) || 1;
    }

    /** Folgt die Masken-Graphics der Weltposition des Panels (inkl. Eltern-Containern). */
    syncMask() {
      const m = this.getWorldTransformMatrix(this.tempMatrix, this.tempParentMatrix);
      const d = m.decomposeMatrix();
      let root = this;
      while (root.parentContainer) root = root.parentContainer;
      const state = `${d.translateX}|${d.translateY}|${d.rotation}|${d.scaleX}|${d.scaleY}|${root.scrollFactorX}|${root.scrollFactorY}`;
      if (state === this.lastMaskState) return;
      this.lastMaskState = state;
      this.maskShape.setPosition(d.translateX, d.translateY);
      this.maskShape.setRotation(d.rotation);
      this.maskShape.setScale(d.scaleX, d.scaleY);
      this.maskShape.setScrollFactor(root.scrollFactorX, root.scrollFactorY);
    }

    /** Ist das Panel samt aller Eltern sichtbar und aktiv? */
    isShown() {
      let node = this;
      while (node) {
        if (!node.visible || !node.active) return false;
        node = node.parentContainer;
      }
      return true;
    }

    /** Gehört das oberste Objekt unter dem Zeiger zu diesem Panel? */
    ownsObject(gameObject) {
      let node = gameObject;
      while (node) {
        if (node === this) return true;
        node = node.parentContainer;
      }
      return false;
    }

    // --- Eingabe-Handler ----------------------------------------------------

    handleWheel(pointer, currentlyOver, deltaX, deltaY) {
      if (!this.isShown() || this.maxScroll <= 0 || !deltaY) return;
      const top = currentlyOver && currentlyOver[0];
      if (!top || !this.ownsObject(top)) return;
      if (top !== this.bg && top !== this.trackHit) {
        // Kind im Inhalt: nur wenn der Zeiger wirklich im Panel ist (Inhalt ragt maskiert heraus)
        const bounds = this.bg.getBounds();
        if (!bounds.contains(pointer.worldX, pointer.worldY)) return;
      }
      this.setTarget(this.targetY + deltaY * this.wheelSpeed, false);
    }

    handleContentDown(pointer) {
      if (this.maxScroll <= 0) return;
      this.drag = { mode: 'content', startY: pointer.y, startScroll: this.targetY };
    }

    handleTrackDown(pointer, localX, localY) {
      if (this.maxScroll <= 0) return;
      const thumbTop = this.thumbGfx.y;
      if (localY < thumbTop || localY > thumbTop + this.thumbLength) {
        // Klick in die Spur: eine Seite in Richtung Klick
        const page = this.panelHeight - 2 * this.padding;
        this.setTarget(this.targetY + (localY < thumbTop ? -page : page), false);
      }
      this.drag = { mode: 'thumb', startY: pointer.y, startScroll: this.targetY };
    }

    handlePointerMove(pointer) {
      if (!this.drag) return;
      if (!pointer.isDown) {
        this.drag = null;
        return;
      }
      const delta = (pointer.y - this.drag.startY) / this.getWorldScale();
      if (this.drag.mode === 'content') {
        this.setTarget(this.drag.startScroll - delta, true);
      } else {
        const trackLength = this.panelHeight - 2 * SCROLLBAR.MARGIN;
        const free = Math.max(1, trackLength - this.thumbLength);
        this.setTarget(this.drag.startScroll + delta * (this.maxScroll / free), true);
      }
    }

    handlePointerUp() {
      this.drag = null;
    }

    handlePostUpdate(time, delta) {
      if (!this.scene) return;
      this.isConstructed = true;
      this.syncMask();
      if (this.content.list.length !== this.knownChildCount) this.refresh();
      if (this.pendingEnd) {
        this.pendingEnd = false;
        this.emit('scrollend');
        if (typeof this.onScrollEndCallback === 'function') this.onScrollEndCallback();
      }
      if (Math.abs(this.targetY - this.scrollY) > SNAP_PX) {
        const k = 1 - Math.exp(-delta / SMOOTH_MS);
        this.scrollY += (this.targetY - this.scrollY) * k;
        if (Math.abs(this.targetY - this.scrollY) <= SNAP_PX) this.scrollY = this.targetY;
        this.applyScroll();
      } else if (this.scrollY !== this.targetY) {
        this.scrollY = this.targetY;
        this.applyScroll();
      }
    }

    preDestroy() {
      const scene = this.scene;
      if (scene) {
        scene.input.off('wheel', this.handleWheel, this);
        scene.input.off('pointermove', this.handlePointerMove, this);
        scene.input.off('pointerup', this.handlePointerUp, this);
        scene.input.off('pointerupoutside', this.handlePointerUp, this);
        scene.events.off('postupdate', this.handlePostUpdate, this);
      }
      if (this.content) this.content.clearMask(true);
      if (this.maskShape) {
        this.maskShape.destroy();
        this.maskShape = null;
      }
      this.tempMatrix.destroy();
      this.tempParentMatrix.destroy();
      super.preDestroy();
    }
  };
})();
