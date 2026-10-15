/**
 * Phone.js – Smartphone-Rahmen (UI.Phone) für die Kapitel 2, 4 und 5.
 *
 * Dunkles, abgerundetes Gehäuse mit Seitentasten und Kamera-Insel, Statusleiste mit
 * Uhrzeit (live aus GameState.getClockLabel(), sonst '07:30'), Mobilfunk („E“ wie EDGE),
 * WLAN-Symbol je Zustand (off / connecting animiert / connected / no-internet mit „!“)
 * und Akku mit Prozentangabe. Inhalte kommen in `screen` (Container an der linken oberen
 * Ecke des Bildschirms unter der Statusleiste); der Inhalt wird auf den Bildschirm
 * maskiert (Maske in Weltkoordinaten, folgt dem Handy auch beim Vibrieren).
 *
 * Extras für Kapitel 5: Die Power-Taste rechts ist klickbar – Events 'power-down',
 * 'power-up'(gehaltene ms), 'power-press' (kurz) und 'power-longpress' (nach
 * powerLongPressMs). setScreenOn(false) schaltet den Bildschirm schwarz.
 *
 * Positionierung über die linke obere Ecke des Gehäuses (Container).
 *
 * Global: hängt UI.Phone an. Abhängigkeiten: Phaser, CONFIG, UI (theme.js);
 * optional GameState (Uhr) und Textures.drawWifiFan (WLAN-Symbol) – beide mit Fallback.
 */

UI.Phone = (() => {
  const C = CONFIG.COLORS;
  const LAYOUT = {
    BEZEL: 10, RADIUS: 40, SCREEN_RADIUS: 30, STATUS_H: 30, NAV_H: 22,
    ISLAND_W: 50, ISLAND_H: 18, SIDE_KEY: 3.5, STATUS_PAD: 18, CLIP_RADIUS: 4,
    WIFI_GROUP_W: 18, // WLAN-Fächer (±7,5 px um die Spitze) + Platz für das „!“
    VOLUME_KEYS: [[0.19, 0.07], [0.28, 0.07]], // [Anteil Höhe oben, Anteil Länge]
    POWER_KEY: [0.23, 0.1],
  };
  const HOUSING = { EDGE: 0x050608, RIM: 0x3b4049, GLASS: 0x14161b, KEY: 0x2c3038, KEY_PRESSED: 0x1b1e23 };
  const THEMES = {
    light: { screen: C.SURFACE, ink: C.TEXT, inkCss: CONFIG.CSS.TEXT },
    dark: { screen: 0x121316, ink: 0xf1f3f4, inkCss: '#f1f3f4' },
  };
  const WIFI = { RADIUS: 10.5, EMPTY_ALPHA: 0.28, CONNECTING_STEP_MS: 320 };
  const WIFI_STATES = ['off', 'connecting', 'connected', 'no-internet'];
  const CLOCK_REFRESH_MS = 1000;
  const CLOCK_FALLBACK = '07:30';
  const LOW_BATTERY = 15;
  const VIBRATE = { DURATION: 340, AMPLITUDE: 3.2, CYCLES: 7 };
  const SCREEN_FADE_MS = 160;

  const clampPercent = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  };

  /** Einfacher Ersatz, falls Textures.drawWifiFan fehlt: vier Balken. */
  function drawFallbackFan(g, cx, cy, radius, level, color, emptyAlpha) {
    for (let i = 0; i < 4; i++) {
      const h = (radius * (i + 1)) / 4;
      g.fillStyle(color, i < level ? 1 : emptyAlpha);
      g.fillRect(cx - radius * 0.7 + i * radius * 0.38, cy - h, radius * 0.26, h);
    }
  }

  return class Phone extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x linke obere Ecke
     * @param {number} y
     * @param {object} [opts]
     * @param {number} [opts.width=300]
     * @param {number} [opts.height=540]
     * @param {number} [opts.battery=23] Prozent
     * @param {'light'|'dark'} [opts.theme='light']
     * @param {string|null} [opts.network='E'] Mobilfunk-Kürzel (null = ausblenden)
     * @param {boolean} [opts.clipScreen=true] Inhalt auf den Bildschirm maskieren
     * @param {number} [opts.powerLongPressMs=1200] ab dann gilt die Power-Taste als lang gedrückt
     */
    constructor(scene, x, y, {
      width = 300, height = 540, battery = 23, theme = 'light', network = 'E', clipScreen = true, powerLongPressMs = 1200,
    } = {}) {
      super(scene, x, y);
      this.phoneWidth = width;
      this.phoneHeight = height;
      this.palette = THEMES[theme] || THEMES.light;
      this.statusInk = this.palette.ink;
      this.network = network;
      this.battery = clampPercent(battery);
      this.wifiState = 'off';
      this.wifiLevel = 0;
      this.connectingStep = 1;
      this.connectingTimer = null;
      this.screenOn = true;
      this.powerLongPressMs = powerLongPressMs;
      this.isPowerPressed = false;
      this.vibrateTween = null;
      this.lastMaskState = '';
      this.tempMatrix = new Phaser.GameObjects.Components.TransformMatrix();
      this.tempParentMatrix = new Phaser.GameObjects.Components.TransformMatrix();

      const B = LAYOUT.BEZEL;
      this.screenRect = { x: B, y: B, width: width - 2 * B, height: height - 2 * B };
      this.screenAreaRect = {
        x: B,
        y: B + LAYOUT.STATUS_H,
        width: width - 2 * B,
        height: height - 2 * B - LAYOUT.STATUS_H - LAYOUT.NAV_H,
      };

      // Gehäuse, Tasten, Bildschirm
      this.housing = new Phaser.GameObjects.Graphics(scene);
      this.powerKey = new Phaser.GameObjects.Graphics(scene);
      this.screenBg = new Phaser.GameObjects.Graphics(scene);
      this.statusBg = new Phaser.GameObjects.Graphics(scene);
      this.drawHousing();
      this.drawPowerKey();
      this.drawScreen();

      this.screen = new Phaser.GameObjects.Container(scene, this.screenAreaRect.x, this.screenAreaRect.y);

      // Statusleiste
      const statusY = B + LAYOUT.STATUS_H / 2;
      this.clockText = UI.text(scene, B + LAYOUT.STATUS_PAD + 4, statusY, CLOCK_FALLBACK, {
        size: 13, bold: true, color: this.palette.inkCss, origin: { x: 0, y: 0.5 },
      });
      this.networkText = UI.text(scene, 0, statusY, network || '', { size: 10, bold: true, color: this.palette.inkCss, origin: { x: 1, y: 0.5 } });
      this.cellGfx = new Phaser.GameObjects.Graphics(scene);
      this.wifiGfx = new Phaser.GameObjects.Graphics(scene);
      this.batteryText = UI.text(scene, 0, statusY, '', { size: 11.5, bold: true, color: this.palette.inkCss, origin: { x: 1, y: 0.5 } });
      this.batteryGfx = new Phaser.GameObjects.Graphics(scene);
      this.statusIcons = [this.clockText, this.networkText, this.cellGfx, this.wifiGfx, this.batteryText, this.batteryGfx];

      this.navBar = new Phaser.GameObjects.Graphics(scene);
      this.island = new Phaser.GameObjects.Graphics(scene);
      this.screenOff = new Phaser.GameObjects.Graphics(scene);
      this.screenOff.fillStyle(0x000000, 1);
      this.screenOff.fillRoundedRect(B, B, width - 2 * B, height - 2 * B, LAYOUT.SCREEN_RADIUS);
      this.screenOff.setAlpha(0).setVisible(false);
      this.drawNavBar();
      this.drawIsland();

      // Power-Taste (Klickfläche etwas größer als die Taste)
      const [powerTop, powerLength] = LAYOUT.POWER_KEY;
      this.powerHit = scene.add
        .rectangle(width - 6, height * powerTop - 8, 16, height * powerLength + 16, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

      this.add([
        this.housing, this.powerKey, this.screenBg, this.screen, this.statusBg, ...this.statusIcons,
        this.navBar, this.screenOff, this.island, this.powerHit,
      ]);
      this.setSize(width, height);
      scene.add.existing(this);

      // Bildschirm-Maske (Weltkoordinaten, nicht im Container)
      if (clipScreen) {
        this.maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
        this.maskShape.fillStyle(0xffffff, 1);
        const r = LAYOUT.CLIP_RADIUS;
        this.maskShape.fillRoundedRect(0, 0, this.screenAreaRect.width, this.screenAreaRect.height, { tl: 0, tr: 0, bl: r, br: r });
        this.screen.setMask(this.maskShape.createGeometryMask());
        this.syncMask();
        scene.events.on('postupdate', this.syncMask, this);
      }

      this.powerHit.on('pointerdown', this.handlePowerDown, this);
      scene.input.on('pointerup', this.handlePowerUp, this);
      scene.input.on('pointerupoutside', this.handlePowerUp, this);

      this.drawBattery();
      this.drawCell();
      this.drawWifi();
      this.layoutStatusIcons();
      this.updateClock();
      this.clockTimer = scene.time.addEvent({ delay: CLOCK_REFRESH_MS, loop: true, callback: this.updateClock, callbackScope: this });
    }

    // --- öffentliche API ----------------------------------------------------

    /** Bildschirmbereich unter der Statusleiste in Weltkoordinaten. */
    getScreenArea() {
      return this.toWorldRect(this.screenAreaRect);
    }

    /** Klickfläche der Power-Taste in Weltkoordinaten (für Tests/Tutorials). */
    getPowerButtonArea() {
      return this.toWorldRect({ x: this.powerHit.x, y: this.powerHit.y, width: this.powerHit.width, height: this.powerHit.height });
    }

    /**
     * WLAN-Symbol in der Statusleiste.
     * @param {'off'|'connecting'|'connected'|'no-internet'} state
     * @param {number} [level] 0–4 Bänder; ohne Angabe: bisheriger Pegel bzw. 4 (voll)
     * @returns {this}
     */
    setWifiState(state, level) {
      if (!WIFI_STATES.includes(state)) return this;
      this.wifiState = state;
      if (level !== undefined && level !== null) this.wifiLevel = Math.max(0, Math.min(4, Math.round(Number(level) || 0)));
      else if (this.wifiLevel === 0 && state !== 'off') this.wifiLevel = 4;

      if (state === 'connecting' && !this.connectingTimer && this.scene) {
        this.connectingStep = 1;
        this.connectingTimer = this.scene.time.addEvent({
          delay: WIFI.CONNECTING_STEP_MS,
          loop: true,
          callback: () => {
            this.connectingStep = (this.connectingStep % 4) + 1;
            this.drawWifi();
          },
        });
      } else if (state !== 'connecting' && this.connectingTimer) {
        this.connectingTimer.remove(false);
        this.connectingTimer = null;
      }
      this.drawWifi();
      return this;
    }

    /** @returns {{state: string, level: number}} */
    getWifiState() {
      return { state: this.wifiState, level: this.wifiLevel };
    }

    /** Akkustand in Prozent (≤ 15 % rot). @returns {this} */
    setBattery(percent) {
      this.battery = clampPercent(percent);
      this.drawBattery();
      this.layoutStatusIcons();
      return this;
    }

    /** @returns {number} */
    getBattery() {
      return this.battery;
    }

    /** Kurzes Vibrieren (seitliches Zittern des ganzen Handys). @returns {this} */
    vibrate() {
      if (!this.scene) return this;
      if (this.vibrateTween) {
        this.vibrateTween.stop();
        this.x = this.vibrateBaseX;
      }
      this.vibrateBaseX = this.x;
      this.vibrateTween = this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: VIBRATE.DURATION,
        onUpdate: (tween) => {
          const t = tween.getValue();
          this.x = this.vibrateBaseX + Math.sin(t * Math.PI * 2 * VIBRATE.CYCLES) * VIBRATE.AMPLITUDE * (1 - t);
        },
        onComplete: () => {
          this.x = this.vibrateBaseX;
          this.vibrateTween = null;
        },
      });
      return this;
    }

    /**
     * Bildschirm an/aus (schwarz, inklusive Statusleiste).
     * @param {boolean} isOn
     * @param {{animate?: boolean}} [opts]
     * @returns {this}
     */
    setScreenOn(isOn, { animate = true } = {}) {
      this.screenOn = Boolean(isOn);
      const overlay = this.screenOff;
      if (this.screenTween) this.screenTween.stop();
      overlay.setVisible(true);
      const target = this.screenOn ? 0 : 1;
      if (!animate || !this.scene) {
        overlay.setAlpha(target).setVisible(!this.screenOn);
        return this;
      }
      this.screenTween = this.scene.tweens.add({
        targets: overlay,
        alpha: target,
        duration: SCREEN_FADE_MS,
        ease: 'Quad.easeOut',
        onComplete: () => {
          overlay.setVisible(!this.screenOn);
          this.screenTween = null;
        },
      });
      return this;
    }

    /** @returns {boolean} */
    isScreenOn() {
      return this.screenOn;
    }

    /**
     * Hintergrund der Statusleiste (z. B. farbige App-Leiste). null = Bildschirmfarbe.
     * Die Schriftfarbe passt sich automatisch an (hell auf dunkel).
     * @returns {this}
     */
    setStatusBarColor(color = null) {
      this.statusBarColor = color;
      const bg = color === null ? this.palette.screen : color;
      const r = (bg >> 16) & 255;
      const g = (bg >> 8) & 255;
      const b = bg & 255;
      const isDark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
      this.statusInk = color === null ? this.palette.ink : isDark ? 0xffffff : C.TEXT;
      const inkCss = '#' + this.statusInk.toString(16).padStart(6, '0');
      [this.clockText, this.networkText, this.batteryText].forEach((t) => t.setColor(inkCss));
      this.drawScreen();
      this.drawBattery();
      this.drawCell();
      this.drawWifi();
      return this;
    }

    /** Aktuell angezeigte Uhrzeit (für Tests). @returns {string} */
    getClockText() {
      return this.clockText.text;
    }

    // --- Zeichnen -----------------------------------------------------------

    drawHousing() {
      const g = this.housing;
      const w = this.phoneWidth;
      const h = this.phoneHeight;
      const R = LAYOUT.RADIUS;
      g.clear();
      // Seitentasten (ragen leicht heraus)
      g.fillStyle(HOUSING.KEY, 1);
      LAYOUT.VOLUME_KEYS.forEach(([top, length]) => g.fillRoundedRect(-LAYOUT.SIDE_KEY, h * top, LAYOUT.SIDE_KEY + 2, h * length, 1.5));
      // Rahmen: dunkle Kante, Metallrand, Glas
      g.fillStyle(HOUSING.EDGE, 1);
      g.fillRoundedRect(0, 0, w, h, R);
      g.fillStyle(HOUSING.RIM, 1);
      g.fillRoundedRect(1.5, 1.5, w - 3, h - 3, R - 1.5);
      g.fillStyle(HOUSING.GLASS, 1);
      g.fillRoundedRect(3.5, 3.5, w - 7, h - 7, R - 3.5);
    }

    drawPowerKey() {
      const g = this.powerKey;
      const [top, length] = LAYOUT.POWER_KEY;
      const inset = this.isPowerPressed ? 1.6 : 0;
      g.clear();
      g.fillStyle(this.isPowerPressed ? HOUSING.KEY_PRESSED : HOUSING.KEY, 1);
      g.fillRoundedRect(this.phoneWidth - 2 - inset, this.phoneHeight * top, LAYOUT.SIDE_KEY + 2, this.phoneHeight * length, 1.5);
    }

    drawScreen() {
      const B = LAYOUT.BEZEL;
      const g = this.screenBg;
      g.clear();
      g.fillStyle(this.palette.screen, 1);
      g.fillRoundedRect(B, B, this.phoneWidth - 2 * B, this.phoneHeight - 2 * B, LAYOUT.SCREEN_RADIUS);
      const s = this.statusBg;
      s.clear();
      if (this.statusBarColor !== null && this.statusBarColor !== undefined) {
        s.fillStyle(this.statusBarColor, 1);
        s.fillRoundedRect(B, B, this.phoneWidth - 2 * B, LAYOUT.STATUS_H, { tl: LAYOUT.SCREEN_RADIUS, tr: LAYOUT.SCREEN_RADIUS, bl: 0, br: 0 });
      }
    }

    drawIsland() {
      const g = this.island;
      const cx = this.phoneWidth / 2;
      const cy = LAYOUT.BEZEL + LAYOUT.STATUS_H / 2;
      const w = LAYOUT.ISLAND_W;
      const h = LAYOUT.ISLAND_H;
      g.clear();
      g.fillStyle(0x000000, 1);
      g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
      // Kameralinse mit Lichtreflex
      const lx = cx + w / 2 - h / 2;
      g.fillStyle(0x1a2638, 1);
      g.fillCircle(lx, cy, 4.6);
      g.fillStyle(0x0a0f18, 1);
      g.fillCircle(lx, cy, 2.6);
      g.fillStyle(0x6f8fbf, 0.85);
      g.fillCircle(lx - 1.4, cy - 1.4, 1.1);
    }

    drawNavBar() {
      const g = this.navBar;
      const cx = this.phoneWidth / 2;
      const y = this.phoneHeight - LAYOUT.BEZEL - LAYOUT.NAV_H / 2;
      g.clear();
      g.fillStyle(this.palette.ink, 0.55);
      g.fillRoundedRect(cx - 48, y - 2.25, 96, 4.5, 2.25);
    }

    drawWifi() {
      const g = this.wifiGfx;
      const ink = this.statusInk;
      g.clear();
      const level = this.wifiState === 'connecting' ? this.connectingStep : this.wifiState === 'off' ? 0 : this.wifiLevel;
      const fan = typeof Textures !== 'undefined' && typeof Textures.drawWifiFan === 'function' ? Textures.drawWifiFan : drawFallbackFan;
      fan(g, 0, 0, WIFI.RADIUS, level, ink, WIFI.EMPTY_ALPHA);
      if (this.wifiState === 'off') {
        // durchgestrichen: deutlich „aus“
        g.lineStyle(1.8, ink, 1);
        g.lineBetween(-7.8, -10.4, 6.6, 1.2);
      } else if (this.wifiState === 'no-internet') {
        // kleines Ausrufezeichen rechts neben dem Fächer
        g.fillStyle(ink, 1);
        g.fillRoundedRect(8.2, -9.6, 2.2, 6.6, 1.1);
        g.fillCircle(9.3, -0.6, 1.25);
      }
    }

    drawCell() {
      const g = this.cellGfx;
      g.clear();
      if (!this.network) {
        this.networkText.setVisible(false);
        return;
      }
      // EDGE-Empfang: ein Balken von vier
      const heights = [3.5, 5.8, 8.1, 10.4];
      heights.forEach((h, i) => {
        g.fillStyle(this.statusInk, i < 1 ? 1 : 0.28);
        g.fillRoundedRect(i * 3.9, -h, 2.7, h, 0.8);
      });
    }

    drawBattery() {
      const g = this.batteryGfx;
      const ink = this.statusInk;
      const w = 21;
      const h = 10.5;
      g.clear();
      g.lineStyle(1.2, ink, 0.5);
      g.strokeRoundedRect(0.6, -h / 2 + 0.6, w - 1.2, h - 1.2, 2.8);
      g.fillStyle(ink, 0.5);
      g.fillRoundedRect(w + 0.8, -2.2, 1.8, 4.4, 0.9);
      if (this.battery > 0) {
        const fillW = Math.max(1.6, (w - 4.4) * (this.battery / 100));
        g.fillStyle(this.battery <= LOW_BATTERY ? C.DANGER : ink, 1);
        g.fillRoundedRect(2.2, -h / 2 + 2.2, fillW, h - 4.4, 1.3);
      }
      this.batteryText.setText(`${this.battery} %`);
      this.batteryText.setColor(this.battery <= LOW_BATTERY ? CONFIG.CSS.DANGER : '#' + ink.toString(16).padStart(6, '0'));
    }

    /**
     * Ordnet die Symbole rechts in der Statusleiste von rechts nach links an. Wird es neben
     * der Kamera-Insel zu eng, entfallen zuerst Mobilfunk, dann die Prozentzahl – das
     * WLAN-Symbol bleibt immer sichtbar (es ist spielrelevant).
     */
    layoutStatusIcons() {
      const cy = LAYOUT.BEZEL + LAYOUT.STATUS_H / 2;
      const islandRight = this.phoneWidth / 2 + LAYOUT.ISLAND_W / 2 + 5;
      const pad = this.phoneWidth < 260 ? LAYOUT.STATUS_PAD - 6 : LAYOUT.STATUS_PAD;
      const place = (showPercent) => {
        let right = this.phoneWidth - LAYOUT.BEZEL - pad;
        const layout = { battery: right - 23.4 };
        right -= 23.4 + 5;
        layout.percent = right;
        if (showPercent) right -= this.batteryText.width + 10;
        layout.wifi = right - 10.5;
        layout.wifiLeft = layout.wifi - 7.5;
        right -= LAYOUT.WIFI_GROUP_W + 7;
        layout.cell = right;
        layout.cellLeft = right - 15 - 2 - this.networkText.width;
        return layout;
      };
      let showPercent = true;
      let layout = place(true);
      if (layout.wifiLeft < islandRight) {
        showPercent = false;
        layout = place(false);
      }
      this.batteryGfx.setPosition(layout.battery, cy);
      this.batteryText.setVisible(showPercent).setPosition(layout.percent, cy + 0.5);
      this.wifiGfx.setPosition(layout.wifi, cy + 5.6);
      const showCell = Boolean(this.network) && layout.cellLeft > islandRight;
      this.cellGfx.setVisible(showCell).setPosition(layout.cell - 14.4, cy + 5.4);
      this.networkText.setVisible(showCell).setPosition(layout.cell - 14.4 - 2.5, cy);
    }

    updateClock() {
      let label = CLOCK_FALLBACK;
      if (typeof GameState !== 'undefined' && GameState && typeof GameState.getClockLabel === 'function') {
        try {
          const value = GameState.getClockLabel();
          if (value) label = String(value);
        } catch (err) {
          label = CLOCK_FALLBACK;
        }
      }
      const match = /(\d{1,2}:\d{2})\s*$/.exec(label); // „Tag 2, 07:31“ → „07:31“
      if (match) label = match[1];
      if (this.clockText.text !== label) this.clockText.setText(label);
    }

    // --- intern -------------------------------------------------------------

    toWorldRect(rect) {
      const m = this.getWorldTransformMatrix(this.tempMatrix, this.tempParentMatrix);
      const p = m.transformPoint(rect.x, rect.y, { x: 0, y: 0 });
      const scale = Math.hypot(m.a, m.b) || 1;
      return { x: p.x, y: p.y, width: rect.width * scale, height: rect.height * scale };
    }

    /** Masken-Graphics folgt der Weltposition des Bildschirms (auch beim Vibrieren). */
    syncMask() {
      if (!this.maskShape || !this.scene) return;
      const m = this.screen.getWorldTransformMatrix(this.tempMatrix, this.tempParentMatrix);
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

    handlePowerDown() {
      if (this.isPowerPressed || !this.scene) return;
      this.isPowerPressed = true;
      this.hasLongPressed = false;
      this.powerDownAt = this.scene.time.now;
      this.drawPowerKey();
      UI.sound('click');
      this.emit('power-down');
      this.longPressTimer = this.scene.time.delayedCall(this.powerLongPressMs, () => {
        if (!this.isPowerPressed) return;
        this.hasLongPressed = true;
        this.emit('power-longpress');
      });
    }

    handlePowerUp() {
      if (!this.isPowerPressed || !this.scene) return;
      this.isPowerPressed = false;
      if (this.longPressTimer) {
        this.longPressTimer.remove(false);
        this.longPressTimer = null;
      }
      this.drawPowerKey();
      const heldMs = this.scene.time.now - this.powerDownAt;
      this.emit('power-up', heldMs);
      if (!this.hasLongPressed) this.emit('power-press', heldMs);
    }

    preDestroy() {
      const scene = this.scene;
      if (scene) {
        scene.events.off('postupdate', this.syncMask, this);
        scene.input.off('pointerup', this.handlePowerUp, this);
        scene.input.off('pointerupoutside', this.handlePowerUp, this);
      }
      [this.clockTimer, this.connectingTimer, this.longPressTimer].forEach((timer) => timer && timer.remove(false));
      [this.vibrateTween, this.screenTween].forEach((tween) => tween && tween.stop());
      if (this.screen) this.screen.clearMask(true);
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
