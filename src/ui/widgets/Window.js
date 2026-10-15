/**
 * Window.js – Fenster-Rahmen in drei Varianten (UI.Window):
 *
 * - 'browser': Tab-Leiste (aktiver Tab mit Favicon/Spinner), Navigation, Adressleiste mit
 *   Schloss (bzw. „Nicht sicher“ bei http://) und URL, Ladebalken über setLoading().
 * - 'os':      Titelleiste mit Minimieren/Maximieren/Schließen (Windows-Stil).
 * - 'paper':   Kopierpapier mit weichem Schatten, Lochung, Titel in Schreibmaschinenschrift.
 *
 * `content` ist ein Container an der linken oberen Ecke des Inhaltsbereichs; eigene Inhalte
 * dort hinein. Der Rahmen fängt Klicks ab (nichts darunter wird versehentlich ausgelöst).
 * Der Schließen-Knopf (closable) zerstört das Fenster NICHT, sondern meldet 'close' bzw.
 * ruft onClose(window) – was passiert, entscheidet das Kapitel.
 *
 * Positionierung über die linke obere Ecke (Container). Events: 'close', 'loading'(bool).
 *
 * Global: hängt UI.Window an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js),
 * optional UI.Spinner (Lade-Spinner im Tab).
 */

UI.Window = (() => {
  const C = CONFIG.COLORS;
  const BROWSER = {
    TABS_H: 38, TOOLBAR_H: 42, RADIUS: 10, TAB_X: 10, TAB_TOP: 7, TAB_MAX_W: 240, TAB_MIN_W: 132,
    TAB_RADIUS: 8, TAB_TINY_W: 84, NEW_TAB_SPACE: 44, ADDRESS_H: 30, ADDRESS_X: 100, MENU_W: 40,
    STRIP: 0xdee1e6, BORDER: 0xbcc0c6, ADDRESS: 0xf1f3f4,
    LOAD_TARGET: 0.86, LOAD_CREEP_MS: 4200,
  };
  const OS = { TITLE_H: 34, RADIUS: 8, BUTTON_W: 44, BAR: 0xf3f3f3, BORDER: 0xbcc0c6 };
  const PAPER = { PADDING: 24, PADDING_HOLES: 34, TITLE_SIZE: 19, TITLE_GAP: 16, HOLE_R: 4.2, HOLE_X: 11.5 };
  const CLOSE_HOVER = 0xe81123;
  const SHADOW = { LAYERS: 6, SPREAD: 14, OFFSET_Y: 7, ALPHA: 0.2 };

  /** Kürzt einen Text mit „…“, bis er in maxWidth passt (binäre Suche). */
  function fitText(textObject, str, maxWidth) {
    textObject.setText(str);
    if (textObject.width <= maxWidth || str.length <= 1) return;
    let lo = 0;
    let hi = str.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      textObject.setText(str.slice(0, mid).trimEnd() + '…');
      if (textObject.width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    textObject.setText(str.slice(0, lo).trimEnd() + '…');
  }

  /** Weicher Schlagschatten aus übereinanderliegenden, wachsenden Rechtecken. */
  function drawShadow(g, width, height, radius) {
    for (let i = 0; i < SHADOW.LAYERS; i++) {
      const grow = (SHADOW.SPREAD * (i + 1)) / SHADOW.LAYERS;
      g.fillStyle(0x000000, SHADOW.ALPHA / SHADOW.LAYERS);
      g.fillRoundedRect(-grow / 2, SHADOW.OFFSET_Y - grow / 2, width + grow, height + grow, radius + grow / 2);
    }
  }

  /** Zerlegt eine URL in Host und Rest (für die zweifarbige Adresszeile). */
  function splitUrl(url) {
    const match = /^([a-z][a-z0-9+.-]*:\/\/)?([^/?#]*)(.*)$/i.exec(url || '');
    return { scheme: (match && match[1]) || '', host: (match && match[2]) || '', rest: (match && match[3]) || '' };
  }

  return class AppWindow extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke
     * @param {number} y
     * @param {object} [opts]
     * @param {number} [opts.width=520]
     * @param {number} [opts.height=380]
     * @param {string} [opts.title='']
     * @param {'browser'|'os'|'paper'} [opts.variant='browser']
     * @param {string} [opts.url=''] nur 'browser'
     * @param {boolean} [opts.closable=false] Schließen-Knopf aktiv
     * @param {Function} [opts.onClose] (window) => void
     * @param {number} [opts.tilt=0] Drehung in Grad um die Mitte (Papier: ±2° wirken echt)
     * @param {boolean} [opts.holes=true] Lochung am linken Rand (nur 'paper')
     */
    constructor(scene, x, y, {
      width = 520, height = 380, title = '', variant = 'browser', url = '', closable = false, onClose = null,
      tilt = 0, holes = true,
    } = {}) {
      super(scene, x, y);
      this.windowWidth = width;
      this.windowHeight = height;
      this.variant = ['browser', 'os', 'paper'].includes(variant) ? variant : 'browser';
      this.title = String(title || '');
      this.url = String(url || '');
      this.closable = Boolean(closable);
      this.onCloseCallback = onClose;
      this.loading = false;
      this.loadTween = null;
      this.hasHoles = holes;
      this.tempMatrix = new Phaser.GameObjects.Components.TransformMatrix();
      this.tempParentMatrix = new Phaser.GameObjects.Components.TransformMatrix();

      const shadow = new Phaser.GameObjects.Graphics(scene);
      drawShadow(shadow, width, height, this.variant === 'paper' ? 2 : BROWSER.RADIUS);
      // Klickfänger: Eingaben im Fenster erreichen nichts darunter
      this.frameHit = scene.add.rectangle(0, 0, width, height, 0xffffff, 0).setOrigin(0).setInteractive();
      this.add([shadow, this.frameHit]);

      if (this.variant === 'browser') this.buildBrowser();
      else if (this.variant === 'os') this.buildOs();
      else this.buildPaper();

      this.content = new Phaser.GameObjects.Container(scene, this.contentRect.x, this.contentRect.y);
      this.add(this.content);
      if (this.loadingBar) this.bringToTop(this.loadingBar);
      this.setSize(width, height);
      scene.add.existing(this);
      if (tilt) this.setTilt(tilt);
    }

    // --- öffentliche API ----------------------------------------------------

    /** Inhaltsbereich in Weltkoordinaten. @returns {{x:number,y:number,width:number,height:number}} */
    getContentArea() {
      const m = this.getWorldTransformMatrix(this.tempMatrix, this.tempParentMatrix);
      const p = m.transformPoint(this.contentRect.x, this.contentRect.y, { x: 0, y: 0 });
      const scale = Math.hypot(m.a, m.b) || 1;
      return { x: p.x, y: p.y, width: this.contentRect.width * scale, height: this.contentRect.height * scale };
    }

    /** @returns {this} */
    setTitle(str) {
      this.title = String(str || '');
      const shown = this.variant === 'browser' ? this.title || 'Neuer Tab' : this.title;
      if (this.titleLabel) fitText(this.titleLabel, shown, this.titleMaxWidth);
      this.positionTitleSpinner();
      return this;
    }

    /** Neue Adresse (nur 'browser' sichtbar). @returns {this} */
    setUrl(str) {
      this.url = String(str || '');
      if (this.variant === 'browser') this.renderAddress();
      return this;
    }

    /** @returns {string} */
    getUrl() {
      return this.url;
    }

    /**
     * Ladezustand: Browser zeigt Ladebalken, Spinner im Tab und „Stopp“ statt „Neu laden“;
     * das OS-Fenster einen Spinner neben dem Titel. Papier hat keinen Ladezustand.
     * @param {boolean} isLoading
     * @returns {this}
     */
    setLoading(isLoading) {
      const next = Boolean(isLoading);
      if (next === this.loading) return this;
      this.loading = next;
      if (this.loadTween) {
        this.loadTween.stop();
        this.loadTween = null;
      }
      if (this.variant === 'browser') this.renderBrowserLoading();
      if (this.tabSpinner) {
        if (next) this.tabSpinner.start();
        else this.tabSpinner.stop();
      }
      if (this.favicon) this.favicon.setVisible(!next || !this.tabSpinner);
      this.emit('loading', next);
      return this;
    }

    /** @returns {boolean} */
    isLoading() {
      return this.loading;
    }

    /**
     * Dreht das Fenster um seine Mitte (die linke obere Ecke verschiebt sich entsprechend).
     * @param {number} degrees
     * @returns {this}
     */
    setTilt(degrees) {
      if (this.tiltBase === undefined) this.tiltBase = { x: this.x, y: this.y };
      const rad = Phaser.Math.DegToRad(degrees || 0);
      const cx = this.windowWidth / 2;
      const cy = this.windowHeight / 2;
      this.setRotation(rad);
      this.setPosition(
        this.tiltBase.x + cx - (cx * Math.cos(rad) - cy * Math.sin(rad)),
        this.tiltBase.y + cy - (cx * Math.sin(rad) + cy * Math.cos(rad))
      );
      return this;
    }

    // --- Aufbau: Browser ----------------------------------------------------

    buildBrowser() {
      const scene = this.scene;
      const w = this.windowWidth;
      const h = this.windowHeight;
      const B = BROWSER;
      const top = B.TABS_H + B.TOOLBAR_H;
      const g = new Phaser.GameObjects.Graphics(scene);

      // Rahmen: Tab-Leiste grau, Werkzeugleiste und Inhalt weiß
      g.fillStyle(B.STRIP, 1);
      g.fillRoundedRect(0, 0, w, h, B.RADIUS);
      g.fillStyle(C.SURFACE, 1);
      g.fillRoundedRect(0, B.TABS_H, w, h - B.TABS_H, { tl: 0, tr: 0, bl: B.RADIUS, br: B.RADIUS });
      g.lineStyle(1, C.BORDER, 1);
      g.lineBetween(1, top - 0.5, w - 1, top - 0.5);

      // Aktiver Tab mit geschwungenen „Füßen“ (Hohlkehlen links und rechts unten)
      const buttonsLeft = w - OS.BUTTON_W * 3;
      const tabW = Math.max(B.TAB_TINY_W, Math.min(Phaser.Math.Clamp(w * 0.42, B.TAB_MIN_W, B.TAB_MAX_W), buttonsLeft - B.TAB_X - B.NEW_TAB_SPACE));
      const tabX = B.TAB_X;
      const r = B.TAB_RADIUS;
      const base = B.TABS_H;
      g.fillStyle(C.SURFACE, 1);
      g.fillRoundedRect(tabX, B.TAB_TOP, tabW, base - B.TAB_TOP + 1, { tl: r, tr: r, bl: 0, br: 0 });
      g.beginPath();
      g.moveTo(tabX, base - r);
      g.lineTo(tabX, base + 0.5);
      g.lineTo(tabX - r, base + 0.5);
      g.arc(tabX - r, base - r, r, Math.PI / 2, 0, true);
      g.closePath();
      g.fillPath();
      g.beginPath();
      g.moveTo(tabX + tabW, base - r);
      g.lineTo(tabX + tabW, base + 0.5);
      g.lineTo(tabX + tabW + r, base + 0.5);
      g.arc(tabX + tabW + r, base - r, r, Math.PI / 2, Math.PI, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(1, B.BORDER, 1);
      g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, B.RADIUS);

      const tabMid = B.TAB_TOP + (B.TABS_H - B.TAB_TOP) / 2;
      // Tab-Inhalt: Favicon (DHBW-Rot) bzw. Spinner, Titel, kleines ×
      const faviconBox = new Phaser.GameObjects.Graphics(scene);
      faviconBox.fillStyle(C.DHBW_RED, 1);
      faviconBox.fillRoundedRect(tabX + 12, tabMid - 7, 14, 14, 3);
      const faviconLetter = UI.text(scene, tabX + 19, tabMid + 0.5, 'D', { size: 10, bold: true, color: '#ffffff', origin: 0.5 });
      this.favicon = new Phaser.GameObjects.Container(scene, 0, 0, [faviconBox, faviconLetter]);
      if (typeof UI.Spinner === 'function') {
        this.tabSpinner = new UI.Spinner(scene, tabX + 12, tabMid - 7, { size: 14, thickness: 2, color: C.PRIMARY, autoStart: false });
      }
      this.titleLabel = UI.text(scene, tabX + 34, tabMid, '', { size: 12.5, color: CONFIG.CSS.TEXT, origin: { x: 0, y: 0.5 } });
      this.titleMaxWidth = tabW - 34 - 26;
      fitText(this.titleLabel, this.title || 'Neuer Tab', this.titleMaxWidth);
      g.lineStyle(1.4, C.TEXT_MUTED, 1);
      const tx = tabX + tabW - 16;
      g.lineBetween(tx - 4, tabMid - 4, tx + 4, tabMid + 4);
      g.lineBetween(tx + 4, tabMid - 4, tx - 4, tabMid + 4);
      // Neuer Tab „+“
      const px = tabX + tabW + 22;
      g.lineBetween(px - 5.5, tabMid, px + 5.5, tabMid);
      g.lineBetween(px, tabMid - 5.5, px, tabMid + 5.5);

      // Fensterknöpfe rechts in der Tab-Leiste
      this.buildWindowButtons(g, B.TABS_H, w);

      // Werkzeugleiste: Zurück, Vor (inaktiv), Neu laden/Stopp, Adressfeld, Menü
      const toolMid = B.TABS_H + B.TOOLBAR_H / 2;
      g.lineStyle(1.8, C.TEXT_MUTED, 1);
      this.drawArrow(g, 20, toolMid, -1);
      g.lineStyle(1.8, C.TEXT_MUTED, 0.38);
      this.drawArrow(g, 48, toolMid, 1);
      this.reloadIcon = new Phaser.GameObjects.Graphics(scene);
      this.reloadIcon.setPosition(76, toolMid);
      const addressX = B.ADDRESS_X;
      const addressW = w - addressX - B.MENU_W;
      const addressY = toolMid - B.ADDRESS_H / 2;
      g.fillStyle(B.ADDRESS, 1);
      g.fillRoundedRect(addressX, addressY, addressW, B.ADDRESS_H, B.ADDRESS_H / 2);
      g.fillStyle(C.TEXT_MUTED, 1);
      [-5, 0, 5].forEach((dy) => g.fillCircle(w - B.MENU_W / 2 - 2, toolMid + dy, 1.6));

      this.addressIcon = new Phaser.GameObjects.Graphics(scene);
      this.addressIcon.setPosition(addressX + 17, toolMid);
      this.addressHost = UI.text(scene, addressX + 32, toolMid, '', { size: 13.5, color: CONFIG.CSS.TEXT, origin: { x: 0, y: 0.5 } });
      this.addressRest = UI.text(scene, addressX + 32, toolMid, '', { size: 13.5, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 0, y: 0.5 } });
      this.addressWarning = UI.text(scene, addressX + 30, toolMid, 'Nicht sicher', { size: 12.5, color: CONFIG.CSS.TEXT_MUTED, origin: { x: 0, y: 0.5 } });
      this.addressDivider = new Phaser.GameObjects.Graphics(scene);
      this.addressRight = addressX + addressW - 14;

      // Ladebalken an der Unterkante der Werkzeugleiste
      this.loadingBar = scene.add.rectangle(1, top - 3, w - 2, 3, C.PRIMARY, 1).setOrigin(0).setScale(0, 1).setVisible(false);

      const parts = [g, this.favicon, this.titleLabel, this.reloadIcon, this.addressIcon, this.addressHost, this.addressRest,
        this.addressWarning, this.addressDivider, this.loadingBar];
      if (this.tabSpinner) parts.splice(2, 0, this.tabSpinner);
      this.add(parts);
      this.addWindowButtonHits(B.TABS_H, w);

      this.drawReloadIcon();
      this.renderAddress();
      this.contentRect = { x: 1, y: top, width: w - 2, height: h - top - 1 };
    }

    /** Pfeil für Zurück (dir −1) / Vor (dir 1). */
    drawArrow(g, cx, cy, dir) {
      g.lineBetween(cx - 6 * dir, cy, cx + 6 * dir, cy);
      g.lineBetween(cx - 6 * dir, cy, cx - 1 * dir, cy - 5);
      g.lineBetween(cx - 6 * dir, cy, cx - 1 * dir, cy + 5);
    }

    drawReloadIcon() {
      const g = this.reloadIcon;
      if (!g) return;
      g.clear();
      g.lineStyle(1.8, C.TEXT_MUTED, 1);
      if (this.loading) {
        g.lineBetween(-5, -5, 5, 5);
        g.lineBetween(5, -5, -5, 5);
        return;
      }
      g.beginPath();
      g.arc(0, 0, 6, -Math.PI * 0.35, Math.PI * 1.55, false);
      g.strokePath();
      const tipX = Math.cos(-Math.PI * 0.35) * 6;
      const tipY = Math.sin(-Math.PI * 0.35) * 6;
      g.fillStyle(C.TEXT_MUTED, 1);
      g.fillTriangle(tipX + 3.6, tipY - 3.2, tipX + 2.2, tipY + 3.6, tipX - 3.4, tipY - 1.2);
    }

    /** Schloss bzw. Warnung + Host (dunkel) + Pfad (grau), gekürzt auf die Feldbreite. */
    renderAddress() {
      const { scheme, host, rest } = splitUrl(this.url);
      const isInsecure = /^http:\/\//i.test(this.url);
      const icon = this.addressIcon;
      icon.clear();
      let textX = this.addressHost.x;
      if (isInsecure) {
        // Warndreieck + „Nicht sicher |“
        icon.fillStyle(C.TEXT_MUTED, 1);
        icon.fillTriangle(0, -6, 6.5, 5.5, -6.5, 5.5);
        icon.fillStyle(BROWSER.ADDRESS, 1);
        icon.fillRect(-0.7, -2.2, 1.4, 4.2);
        icon.fillRect(-0.7, 3, 1.4, 1.3);
        // In schmalen Adressfeldern nur das Dreieck zeigen, damit die URL lesbar bleibt
        const showLabel = this.addressRight - (this.addressWarning.x + this.addressWarning.width + 16) > 110;
        this.addressWarning.setVisible(showLabel);
        const dividerX = showLabel ? this.addressWarning.x + this.addressWarning.width + 8 : this.addressWarning.x + 2;
        this.addressDivider.clear().lineStyle(1, C.TEXT_MUTED, 0.6).lineBetween(dividerX, this.addressHost.y - 8, dividerX, this.addressHost.y + 8);
        textX = dividerX + 8;
      } else {
        this.addressWarning.setVisible(false);
        this.addressDivider.clear();
        if (scheme || host) {
          // kleines Schloss
          icon.lineStyle(1.6, C.TEXT_MUTED, 1);
          icon.beginPath();
          icon.arc(0, -2.2, 2.9, Math.PI, 0, false);
          icon.strokePath();
          icon.fillStyle(C.TEXT_MUTED, 1);
          icon.fillRoundedRect(-4.6, -1.6, 9.2, 7.4, 1.6);
        }
      }
      const maxWidth = this.addressRight - textX;
      this.addressHost.setX(textX);
      fitText(this.addressHost, host || this.url, maxWidth);
      const restWidth = maxWidth - this.addressHost.width;
      this.addressRest.setX(textX + this.addressHost.width);
      if (host && rest && restWidth > 20 && !this.addressHost.text.endsWith('…')) {
        this.addressRest.setVisible(true);
        fitText(this.addressRest, rest, restWidth);
      } else {
        this.addressRest.setVisible(false);
      }
    }

    renderBrowserLoading() {
      const bar = this.loadingBar;
      this.drawReloadIcon();
      if (!bar || !this.scene) return;
      if (this.loading) {
        bar.setVisible(true).setAlpha(1).setScale(0.02, 1);
        // schnell anlaufen, dann zäh kriechen – wie jeder Browser über EDGE
        this.loadTween = this.scene.tweens.add({ targets: bar, scaleX: BROWSER.LOAD_TARGET, duration: BROWSER.LOAD_CREEP_MS, ease: 'Expo.easeOut' });
      } else {
        this.loadTween = this.scene.tweens.chain({
          targets: bar,
          tweens: [
            { scaleX: 1, duration: 160, ease: 'Quad.easeOut' },
            { alpha: 0, duration: 240, ease: 'Quad.easeIn' },
          ],
          onComplete: () => {
            bar.setVisible(false).setScale(0, 1).setAlpha(1);
            this.loadTween = null;
          },
        });
      }
    }

    // --- Aufbau: OS-Fenster ---------------------------------------------------

    buildOs() {
      const scene = this.scene;
      const w = this.windowWidth;
      const h = this.windowHeight;
      const g = new Phaser.GameObjects.Graphics(scene);
      g.fillStyle(C.SURFACE, 1);
      g.fillRoundedRect(0, 0, w, h, OS.RADIUS);
      g.fillStyle(OS.BAR, 1);
      g.fillRoundedRect(0, 0, w, OS.TITLE_H, { tl: OS.RADIUS, tr: OS.RADIUS, bl: 0, br: 0 });
      g.lineStyle(1, C.BORDER, 1);
      g.lineBetween(1, OS.TITLE_H - 0.5, w - 1, OS.TITLE_H - 0.5);
      g.lineStyle(1, OS.BORDER, 1);
      g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, OS.RADIUS);
      // kleines App-Symbol
      g.fillStyle(C.PRIMARY, 1);
      g.fillRoundedRect(12, OS.TITLE_H / 2 - 7, 14, 14, 3);
      g.fillStyle(C.SURFACE, 0.9);
      g.fillRect(15, OS.TITLE_H / 2 - 3, 8, 1.6);
      g.fillRect(15, OS.TITLE_H / 2 + 0.5, 5, 1.6);
      this.buildWindowButtons(g, OS.TITLE_H, w);

      this.titleLabel = UI.text(scene, 34, OS.TITLE_H / 2, '', { size: 13, color: CONFIG.CSS.TEXT, origin: { x: 0, y: 0.5 } });
      this.titleMaxWidth = w - 34 - OS.BUTTON_W * 3 - 12;
      fitText(this.titleLabel, this.title, this.titleMaxWidth);
      this.add([g, this.titleLabel]);
      if (typeof UI.Spinner === 'function') {
        this.tabSpinner = new UI.Spinner(scene, 0, OS.TITLE_H / 2 - 7, { size: 14, thickness: 2, color: C.PRIMARY, autoStart: false });
        this.add(this.tabSpinner);
        this.positionTitleSpinner();
      }
      this.addWindowButtonHits(OS.TITLE_H, w);
      this.contentRect = { x: 1, y: OS.TITLE_H, width: w - 2, height: h - OS.TITLE_H - 1 };
    }

    positionTitleSpinner() {
      if (this.variant === 'os' && this.tabSpinner && this.titleLabel) {
        this.tabSpinner.x = this.titleLabel.x + this.titleLabel.width + 10;
      }
    }

    // --- Aufbau: Papier -------------------------------------------------------

    buildPaper() {
      const scene = this.scene;
      const w = this.windowWidth;
      const h = this.windowHeight;
      const P = PAPER;
      const g = new Phaser.GameObjects.Graphics(scene);
      g.fillStyle(C.PAPER, 1);
      g.fillRect(0, 0, w, h);
      g.lineStyle(1, C.PAPER_SHADE, 1);
      g.strokeRect(0.5, 0.5, w - 1, h - 1);
      // Kopierer-Spur: ein ganz blasser Tonerstreifen
      g.fillStyle(C.INK, 0.035);
      g.fillRect(Math.round(w * 0.73), 1, 3, h - 2);
      // Lochung (Abheftlöcher): dezent, mit Schattenkante – kein Aufzählungspunkt
      const hasHoles = this.hasHoles && h >= 140;
      if (hasHoles) {
        const spread = Math.min(46, h * 0.14);
        [h / 2 - spread, h / 2 + spread].forEach((hy) => {
          g.fillStyle(C.PAPER_SHADE, 1);
          g.fillCircle(P.HOLE_X, hy, P.HOLE_R + 0.8);
          g.fillStyle(0x8a929e, 1);
          g.fillCircle(P.HOLE_X, hy, P.HOLE_R);
          g.fillStyle(0xb7bdc6, 1);
          g.fillCircle(P.HOLE_X + 0.6, hy + 0.9, P.HOLE_R - 1.2);
        });
      }
      const padLeft = hasHoles ? P.PADDING_HOLES : P.PADDING;
      this.add(g);

      let contentTop = P.PADDING;
      if (this.title) {
        this.titleLabel = UI.text(scene, padLeft, P.PADDING - 2, '', { size: P.TITLE_SIZE, font: 'PAPER', bold: true, color: CONFIG.CSS.INK });
        this.titleMaxWidth = w - padLeft - P.PADDING - (this.closable ? 18 : 0);
        fitText(this.titleLabel, this.title, this.titleMaxWidth);
        const ruleY = this.titleLabel.y + this.titleLabel.height + 7;
        g.lineStyle(1.5, C.INK, 0.75);
        g.lineBetween(padLeft, ruleY, w - P.PADDING, ruleY);
        g.lineStyle(0.75, C.INK, 0.5);
        g.lineBetween(padLeft, ruleY + 3, w - P.PADDING, ruleY + 3);
        this.add(this.titleLabel);
        contentTop = ruleY + P.TITLE_GAP;
      }
      if (this.closable) {
        const cx = w - 18;
        const cy = 18;
        g.lineStyle(1.8, C.INK_MUTED, 1);
        g.lineBetween(cx - 5, cy - 5, cx + 5, cy + 5);
        g.lineBetween(cx + 5, cy - 5, cx - 5, cy + 5);
        this.closeHit = this.scene.add.rectangle(cx - 14, cy - 14, 28, 28, 0x000000, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        this.closeHit.on('pointerup', this.handleClose, this);
        this.add(this.closeHit);
      }
      this.contentRect = { x: padLeft, y: contentTop, width: w - padLeft - P.PADDING, height: Math.max(0, h - contentTop - P.PADDING) };
    }

    // --- Fensterknöpfe (browser + os) ----------------------------------------

    buildWindowButtons(g, barHeight, w) {
      const bw = OS.BUTTON_W;
      const cy = barHeight / 2;
      const iconAlpha = 0.9;
      // Minimieren, Maximieren (nur Optik)
      g.lineStyle(1, C.TEXT, iconAlpha);
      const minX = w - bw * 2.5;
      g.lineBetween(minX - 5, cy, minX + 5, cy);
      const maxX = w - bw * 1.5;
      g.strokeRect(maxX - 4.5, cy - 4.5, 9, 9);
      // Schließen: eigener Layer (Hover-Rot)
      this.closeBg = new Phaser.GameObjects.Graphics(this.scene);
      this.closeGlyph = new Phaser.GameObjects.Graphics(this.scene);
      this.closeGlyph.setPosition(w - bw / 2, cy);
      this.closeBarHeight = barHeight;
      this.drawCloseButton(false);
    }

    addWindowButtonHits(barHeight, w) {
      this.add([this.closeBg, this.closeGlyph]);
      if (!this.closable) return;
      this.closeHit = this.scene.add.rectangle(w - OS.BUTTON_W, 0, OS.BUTTON_W, barHeight, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      this.closeHit.on('pointerover', () => this.drawCloseButton(true));
      this.closeHit.on('pointerout', () => this.drawCloseButton(false));
      this.closeHit.on('pointerup', this.handleClose, this);
      this.add(this.closeHit);
    }

    drawCloseButton(isHover) {
      const w = this.windowWidth;
      const bw = OS.BUTTON_W;
      const radius = this.variant === 'browser' ? BROWSER.RADIUS : OS.RADIUS;
      this.closeBg.clear();
      if (isHover) {
        this.closeBg.fillStyle(CLOSE_HOVER, 1);
        this.closeBg.fillRoundedRect(w - bw, 0, bw, this.closeBarHeight, { tl: 0, tr: radius, bl: 0, br: 0 });
      }
      const glyph = this.closeGlyph;
      glyph.clear();
      glyph.lineStyle(1.1, isHover ? 0xffffff : C.TEXT, this.closable ? 0.9 : 0.35);
      glyph.lineBetween(-5, -5, 5, 5);
      glyph.lineBetween(5, -5, -5, 5);
    }

    handleClose() {
      UI.sound('click');
      this.emit('close', this);
      if (typeof this.onCloseCallback === 'function') this.onCloseCallback(this);
    }

    preDestroy() {
      if (this.loadTween) {
        this.loadTween.stop();
        this.loadTween = null;
      }
      this.tempMatrix.destroy();
      this.tempParentMatrix.destroy();
      super.preDestroy();
    }
  };
})();
