/**
 * GameOverScene.js – Ende eines Laufs (Key 'GameOver', Daten = Ergebnis von finishRun).
 *
 * Sieg: „Verbunden!“ + Pointe „Ihr Passwort läuft in 3 Tagen ab.“ + Uhrzeit-Gag.
 * Niederlage: großer Stempel „RAGE-QUIT“ + Pointe mobile Daten (19,99 € für 1 GB).
 * Darunter Protokoll (Uhrzeit, Fehlversuche, Frust-Spitze, je Kapitel), hochzählender
 * Score mit Rang, Erfolge des Laufs, Highscore-Feier und der ernst gemeinte Tipp
 * (CAMPUS.realWorldTip). Buttons „Nochmal“ (Enter) und „Hauptmenü“.
 *
 * Global: GameOverScene.
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, CAMPUS, Scoring, UI (text, Button), FX,
 * MenuScene (Hintergrund, Zahlenformat).
 */

class GameOverScene extends Phaser.Scene {
  /** Layout (px). */
  static LAYOUT = Object.freeze({
    TITLE_Y: 26,
    TITLE_SIZE: 54,
    STAMP_Y: 56,
    STAMP_SIZE: 40,        // so groß, dass die schräge Unterkante die Zeile darunter frei lässt
    STAMP_ANGLE: -6,
    NOTICE_Y: 98,
    NOTICE_WIDTH: 440,
    NOTICE_HEIGHT: 42,
    LOSS_TEXT_Y: 126,
    GAG_Y: 151,
    CARD_Y: 178,
    CARD_HEIGHT: 200,
    CARD_LEFT_X: 40,
    CARD_RIGHT_X: 412,
    CARD_WIDTH: 348,
    CARD_PADDING: 20,
    ROW_HEIGHT: 26,
    ACHIEVEMENT_ROW: 17,
    MAX_ACHIEVEMENTS_SHOWN: 3,
    TIP_GAP: 12,           // Karten → Tipp
    TIP_X: 40,
    TIP_WIDTH: 720,
    TIP_PAD_X: 20,
    TIP_PAD_Y: 9,
    TIP_LABEL_HEIGHT: 17,
    TIP_SIZE: 13,
    TIP_SIZE_SMALL: 12,    // falls der Tipp sonst die Buttons verdrängt
    BUTTON_GAP_Y: 12,      // Tipp → Buttons
    BUTTON_WIDTH: 200,
    BUTTON_HEIGHT: 46,
    BUTTON_GAP: 20,
    HINT_GAP: 6,
    BOTTOM_MARGIN: 6,
  });

  /** Ablauf (ms). */
  static TIMING = Object.freeze({
    SCORE_DELAY_MS: 550,
    SCORE_COUNT_MS: 1500,
    TICK_EVERY_MS: 90,
    STAMP_DELAY_MS: 200,
    STAMP_HOLD_FOREVER: 24 * 60 * 60 * 1000,
  });

  /** Dauer der ersten Vorlesung (Spielminuten) – für den Uhrzeit-Gag. */
  static LECTURE_DURATION_MINUTES = 90;

  constructor() {
    super({ key: 'GameOver' });
  }

  /** @param {object} data Ergebnis von GameState.finishRun (+ startChapter, failsByChapter) */
  create(data = {}) {
    this.result = GameOverScene.normalizeResult(data);
    this.isLeaving = false;
    this.buttonRects = {};
    this.isScoreDone = false;

    // Falls die Szene direkt gestartet wurde: HUD/Kapitel sicher beenden
    ['HUD'].concat(CONFIG.CHAPTERS.map((c) => c.key)).forEach((key) => {
      const scene = this.scene.get(key);
      if (scene && (scene.sys.isActive() || scene.sys.isPaused())) this.scene.stop(key);
    });

    this.cameras.main.setBackgroundColor(CONFIG.CSS.BG);
    MenuScene.drawBackdrop(this);

    if (this.result.won) this.buildWinHeader();
    else this.buildLossHeader();
    this.buildProtocolCard();
    this.buildScoreCard();
    const tipBottom = this.buildTip();
    this.buildButtons(tipBottom + GameOverScene.LAYOUT.BUTTON_GAP_Y);

    this.seenKeyEvents = new WeakSet(); // Phaser 3.90 meldet keydowns teils mehrfach
    this.input.keyboard.on('keydown', this.handleKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.time.delayedCall(GameOverScene.TIMING.SCORE_DELAY_MS, () => this.countScore());
  }

  // ---------------------------------------------------------------------------
  // Kopfbereich
  // ---------------------------------------------------------------------------

  buildWinHeader() {
    const L = GameOverScene.LAYOUT;
    UI.sound('win');
    const title = UI.text(this, CONFIG.WIDTH / 2 + 20, L.TITLE_Y, 'Verbunden!', {
      size: L.TITLE_SIZE,
      bold: true,
      color: CONFIG.CSS.WHITE,
      origin: { x: 0.5, y: 0 },
    });
    const iconX = title.x - title.width / 2 - 34;
    const iconY = L.TITLE_Y + title.height / 2;
    if (this.textures.exists('icon-wifi-4')) {
      this.add.image(iconX, iconY, 'icon-wifi-4').setDisplaySize(48, 48).setTint(CONFIG.COLORS.SUCCESS);
    } else {
      // Ohne Textur: WLAN-Fächer aus der Boot-Animation, halb so groß
      const fan = this.add.graphics();
      BootScene.drawWifiFan(fan, 0, 0, 4, { color: CONFIG.COLORS.SUCCESS });
      fan.setPosition(iconX, iconY + 18).setScale(0.5);
    }

    // Pointe als System-Benachrichtigung
    const noticeX = UI.centerX(L.NOTICE_WIDTH);
    const notice = this.add.graphics();
    notice.fillStyle(CONFIG.COLORS.SURFACE, 1);
    notice.fillRoundedRect(noticeX, L.NOTICE_Y, L.NOTICE_WIDTH, L.NOTICE_HEIGHT, 10);
    const noticeIconX = noticeX + 26;
    const noticeMidY = L.NOTICE_Y + L.NOTICE_HEIGHT / 2;
    if (this.textures.exists('icon-warning')) {
      this.add.image(noticeIconX, noticeMidY, 'icon-warning').setDisplaySize(24, 24).setTint(CONFIG.COLORS.WARNING);
    }
    UI.text(this, noticeX + 48, noticeMidY, 'Ihr Passwort läuft in 3 Tagen ab.', {
      size: 16,
      bold: true,
      color: CONFIG.CSS.TEXT,
      origin: { x: 0, y: 0.5 },
    });
    UI.text(this, CONFIG.WIDTH / 2, L.GAG_Y, GameOverScene.lectureGag(this.result.clockMinutes), {
      size: 15,
      color: CONFIG.CSS.TEXT_INVERSE,
      origin: { x: 0.5, y: 0 },
    }).setAlpha(0.85);
  }

  buildLossHeader() {
    const L = GameOverScene.LAYOUT;
    const T = GameOverScene.TIMING;
    UI.sound('lose');
    this.time.delayedCall(T.STAMP_DELAY_MS, () => {
      try {
        FX.stamp(this, 'RAGE-QUIT', {
          x: CONFIG.WIDTH / 2,
          y: L.STAMP_Y,
          angle: L.STAMP_ANGLE,
          size: L.STAMP_SIZE,
          hold: T.STAMP_HOLD_FOREVER,
        });
      } catch (err) {
        console.error('[GameOver] Stempel fehlgeschlagen:', err);
      }
    });
    UI.text(this, CONFIG.WIDTH / 2, L.LOSS_TEXT_Y, 'Handy in die Ecke gepfeffert. Frust: 100 %.', {
      size: 17,
      bold: true,
      color: CONFIG.CSS.WHITE,
      origin: { x: 0.5, y: 0 },
    });
    UI.text(this, CONFIG.WIDTH / 2, L.GAG_Y, 'Plan B: mobile Daten. 19,99 € für 1 GB – reicht bis Mittwoch.', {
      size: 15,
      color: CONFIG.CSS.HAZARD,
      origin: { x: 0.5, y: 0 },
    });
  }

  // ---------------------------------------------------------------------------
  // Protokoll (links) und Punkte (rechts)
  // ---------------------------------------------------------------------------

  /** Papier-Protokoll: Uhrzeit, Fehlversuche, Frust-Spitze, Fehlversuche je Kapitel. */
  buildProtocolCard() {
    const L = GameOverScene.LAYOUT;
    const r = this.result;
    const x = L.CARD_LEFT_X;
    const y = L.CARD_Y;
    this.add.rectangle(x + 6, y + 8, L.CARD_WIDTH, L.CARD_HEIGHT, CONFIG.COLORS.SHADOW, 0.35).setOrigin(0);
    this.add.rectangle(x, y, L.CARD_WIDTH, L.CARD_HEIGHT, CONFIG.COLORS.PAPER).setOrigin(0);
    const left = x + L.CARD_PADDING;
    const right = x + L.CARD_WIDTH - L.CARD_PADDING;
    UI.text(this, left, y + 16, 'PROTOKOLL', { font: 'STAMP', size: 13, color: CONFIG.CSS.DHBW_RED });

    const late = Math.floor(r.minutesLate);
    const rows = [
      ['Uhrzeit', late >= 1 ? `${r.clockLabel} (+${HUDScene.formatLate(late)})` : r.clockLabel],
      ['Fehlversuche', String(r.totalFails)],
      ['Frust-Spitze', `${Math.round(r.frustrationPeak)} %`],
    ];
    rows.forEach(([label, value], index) => {
      const rowY = y + 44 + index * L.ROW_HEIGHT;
      UI.text(this, left, rowY, label, { font: 'PAPER', size: 15, color: CONFIG.CSS.INK_MUTED });
      UI.text(this, right, rowY, value, { font: 'PAPER', size: 15, bold: true, color: CONFIG.CSS.INK, origin: { x: 1, y: 0 } });
    });

    // Fehlversuche je Kapitel als kleine Tabelle K1 … K5
    const tableY = y + 44 + rows.length * L.ROW_HEIGHT + 8;
    this.add.rectangle(left, tableY - 4, right - left, 1, CONFIG.COLORS.INK, 0.25).setOrigin(0);
    UI.text(this, left, tableY + 2, 'Fehlversuche je Kapitel', { font: 'PAPER', size: 13, color: CONFIG.CSS.INK_MUTED });
    const cellWidth = (right - left) / CONFIG.CHAPTERS.length;
    CONFIG.CHAPTERS.forEach(({ id }, index) => {
      const cx = left + cellWidth * index + cellWidth / 2;
      const fails = r.failsByChapter[id];
      UI.text(this, cx, tableY + 24, `K${id}`, { font: 'PAPER', size: 12, color: CONFIG.CSS.INK_MUTED, origin: { x: 0.5, y: 0 } });
      UI.text(this, cx, tableY + 40, fails === null || fails === undefined ? '–' : String(fails), {
        font: 'PAPER', size: 17, bold: true, color: fails ? CONFIG.CSS.DHBW_RED : CONFIG.CSS.INK, origin: { x: 0.5, y: 0 },
      });
    });
  }

  /** Punkte (zählen hoch), Rang, Highscore, Erfolge des Laufs. */
  buildScoreCard() {
    const L = GameOverScene.LAYOUT;
    const r = this.result;
    const x = L.CARD_RIGHT_X;
    const y = L.CARD_Y;
    const left = x + L.CARD_PADDING;
    const graphics = this.add.graphics();
    graphics.fillStyle(CONFIG.COLORS.BG_ALT, 1);
    graphics.fillRoundedRect(x, y, L.CARD_WIDTH, L.CARD_HEIGHT, 10);
    graphics.lineStyle(1, CONFIG.COLORS.WHITE, 0.12);
    graphics.strokeRoundedRect(x, y, L.CARD_WIDTH, L.CARD_HEIGHT, 10);

    UI.text(this, left, y + 14, 'PUNKTE', { size: 11, bold: true, color: CONFIG.CSS.TEXT_INVERSE }).setAlpha(0.7);
    this.scoreText = UI.text(this, left, y + 28, '0', { font: 'MONO', size: 40, bold: true, color: CONFIG.CSS.WHITE });
    this.rankText = UI.text(this, left, y + 76, r.rank, { size: 18, bold: true, color: CONFIG.CSS.HAZARD }).setAlpha(0);
    this.highscoreText = UI.text(this, left, y + 100, '', { size: 13, color: CONFIG.CSS.TEXT_INVERSE }).setAlpha(0);

    const achievements = r.runAchievements;
    const listY = y + 126;
    UI.text(this, left, listY, achievements.length ? `Erfolge in diesem Lauf (${achievements.length})` : 'Keine Erfolge in diesem Lauf', {
      size: 12,
      bold: true,
      color: CONFIG.CSS.TEXT_INVERSE,
    }).setAlpha(0.7);
    const shown = achievements.slice(0, L.MAX_ACHIEVEMENTS_SHOWN);
    shown.forEach((achievement, index) => {
      const rowY = listY + 18 + index * L.ACHIEVEMENT_ROW;
      HUDScene.drawStar(this.add.graphics(), left + 6, rowY + 8, 6, CONFIG.COLORS.HAZARD);
      HUDScene.setTruncatedText(
        UI.text(this, left + 18, rowY, '', { size: 13, color: CONFIG.CSS.WHITE }),
        achievement.isNewGlobal ? `${achievement.title} · neu` : achievement.title,
        L.CARD_WIDTH - 2 * L.CARD_PADDING - 18,
      );
    });
    if (achievements.length > shown.length) {
      // „+ N weitere“ rechts oben neben der Überschrift, damit die Karte nicht überläuft
      UI.text(this, x + L.CARD_WIDTH - L.CARD_PADDING, listY, `+ ${achievements.length - shown.length} weitere`, {
        size: 12,
        color: CONFIG.CSS.TEXT_INVERSE,
        origin: { x: 1, y: 0 },
      }).setAlpha(0.7);
    }
  }

  /**
   * Ernst gemeinter Hinweis, wie es wirklich geht. Höhe richtet sich nach dem Text.
   * @returns {number} Unterkante des Kastens
   */
  buildTip() {
    const L = GameOverScene.LAYOUT;
    const top = L.CARD_Y + L.CARD_HEIGHT + L.TIP_GAP;
    const textTop = top + L.TIP_PAD_Y + L.TIP_LABEL_HEIGHT;
    const tip = UI.text(this, L.TIP_X + L.TIP_PAD_X, textTop, CAMPUS.realWorldTip, {
      size: L.TIP_SIZE,
      color: CONFIG.CSS.TEXT_INVERSE,
      wrap: L.TIP_WIDTH - 2 * L.TIP_PAD_X,
      lineSpacing: 2,
    }).setDepth(1);
    // Platz für Buttons und Hinweis lassen – notfalls Schrift verkleinern
    const reserved = L.BUTTON_GAP_Y + L.BUTTON_HEIGHT + L.HINT_GAP + 14 + L.BOTTOM_MARGIN;
    if (textTop + tip.height + L.TIP_PAD_Y + reserved > CONFIG.HEIGHT) tip.setFontSize(L.TIP_SIZE_SMALL);
    const height = Math.round(textTop + tip.height + L.TIP_PAD_Y - top);

    this.add.rectangle(L.TIP_X, top, L.TIP_WIDTH, height, CONFIG.COLORS.BG_DEEP, 0.9).setOrigin(0);
    this.add.rectangle(L.TIP_X, top, 5, height, CONFIG.COLORS.PRIMARY).setOrigin(0);
    UI.text(this, L.TIP_X + L.TIP_PAD_X, top + L.TIP_PAD_Y, 'Ernst gemeint', {
      size: 12,
      bold: true,
      color: CONFIG.CSS.HAZARD,
      depth: 1,
    });
    return top + height;
  }

  /**
   * „Nochmal“ und „Hauptmenü“ nebeneinander, darunter der Tastatur-Hinweis.
   * @param {number} top Oberkante der Buttons
   */
  buildButtons(top) {
    const L = GameOverScene.LAYOUT;
    const total = 2 * L.BUTTON_WIDTH + L.BUTTON_GAP;
    const x = UI.centerX(total);
    const y = Math.min(top, CONFIG.HEIGHT - L.BOTTOM_MARGIN - 14 - L.HINT_GAP - L.BUTTON_HEIGHT);
    const specs = [
      { id: 'retry', text: 'Nochmal', variant: 'primary', onClick: () => this.retry() },
      { id: 'menu', text: 'Hauptmenü', variant: 'secondary', onClick: () => this.toMenu() },
    ];
    specs.forEach((spec, index) => {
      const bx = x + index * (L.BUTTON_WIDTH + L.BUTTON_GAP);
      new UI.Button(this, bx, y, {
        text: spec.text,
        variant: spec.variant,
        width: L.BUTTON_WIDTH,
        height: L.BUTTON_HEIGHT,
        onClick: spec.onClick,
      });
      this.buttonRects[spec.id] = { x: bx, y, width: L.BUTTON_WIDTH, height: L.BUTTON_HEIGHT };
    });
    UI.text(this, CONFIG.WIDTH / 2, y + L.BUTTON_HEIGHT + L.HINT_GAP, 'Enter: Nochmal', {
      size: 12,
      color: CONFIG.CSS.TEXT_INVERSE,
      origin: { x: 0.5, y: 0 },
    }).setAlpha(0.55);
  }

  // ---------------------------------------------------------------------------
  // Ablauf
  // ---------------------------------------------------------------------------

  /** Score zählt hoch, dann Rang und ggf. Highscore-Feier. */
  countScore() {
    const T = GameOverScene.TIMING;
    const target = Math.max(0, Math.round(this.result.score));
    let lastTickAt = 0;
    this.tweens.addCounter({
      from: 0,
      to: target,
      duration: target > 0 ? T.SCORE_COUNT_MS : 1,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        this.scoreText.setText(MenuScene.formatNumber(tween.getValue()));
        if (this.time.now - lastTickAt >= T.TICK_EVERY_MS) {
          lastTickAt = this.time.now;
          UI.sound('tick');
        }
      },
      onComplete: () => this.revealRank(),
    });
  }

  revealRank() {
    const r = this.result;
    this.scoreText.setText(MenuScene.formatNumber(r.score));
    this.isScoreDone = true;
    this.tweens.add({ targets: [this.rankText, this.highscoreText], alpha: 1, duration: 260 });
    if (r.isNewHighscore) {
      // Feier mit Konfetti nur beim Sieg – nach einem Rage-Quit wäre das Hohn
      this.highscoreText.setText(r.won ? 'Neuer Highscore!' : 'Neuer Highscore! (Trostpreis)')
        .setColor(CONFIG.CSS.HAZARD).setFontStyle('bold');
      UI.sound('success');
      try {
        if (r.won) {
          FX.confetti(this, { x: GameOverScene.LAYOUT.CARD_RIGHT_X + GameOverScene.LAYOUT.CARD_WIDTH / 2, y: GameOverScene.LAYOUT.CARD_Y + 40 });
        }
        FX.pulse(this, this.scoreText, { scale: 1.12, duration: 140, repeat: 1 });
      } catch (err) {
        console.error('[GameOver] Highscore-Effekt fehlgeschlagen:', err);
      }
    } else if (r.highscore) {
      this.highscoreText.setText(`Highscore: ${MenuScene.formatNumber(r.highscore.score)} (${r.highscore.rank})`);
    } else {
      this.highscoreText.setText('');
    }
  }

  retry() {
    if (this.isLeaving) return;
    this.isLeaving = true;
    UI.sound('click');
    this.scene.start('Game', { startChapter: this.result.startChapter });
  }

  toMenu() {
    if (this.isLeaving) return;
    this.isLeaving = true;
    UI.sound('click');
    this.scene.start('Menu');
  }

  /** @param {KeyboardEvent} event */
  handleKeyDown(event) {
    if (!event || this.seenKeyEvents.has(event)) return;
    this.seenKeyEvents.add(event);
    if (event.repeat) return;
    if (event.key === 'Enter') this.retry();
  }

  /**
   * Mittelpunkt eines Buttons (für Tests).
   * @param {'retry'|'menu'} id
   * @returns {{x: number, y: number}|null}
   */
  getButtonCenter(id) {
    const rect = this.buttonRects && this.buttonRects[id];
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  }

  handleShutdown() {
    if (this.input && this.input.keyboard) this.input.keyboard.off('keydown', this.handleKeyDown, this);
  }

  // ---------------------------------------------------------------------------
  // Statische Helfer
  // ---------------------------------------------------------------------------

  /**
   * Ergänzt fehlende Felder, damit die Szene auch mit unvollständigen Daten startet.
   * @param {object} data
   * @returns {object}
   */
  static normalizeResult(data) {
    const clockMinutes = typeof data.clockMinutes === 'number' ? data.clockMinutes : CONFIG.CLOCK.START_MINUTES;
    const score = Math.max(0, Math.round(Number(data.score) || 0));
    const failsByChapter = data.failsByChapter || {};
    const stats = data.chapterStats || {};
    CONFIG.CHAPTERS.forEach(({ id }) => {
      if (failsByChapter[id] === undefined) {
        failsByChapter[id] = stats[id] && typeof stats[id].fails === 'number' ? stats[id].fails : null;
      }
    });
    return {
      won: Boolean(data.won),
      reason: data.reason || null,
      score,
      rank: data.rank || (typeof Scoring !== 'undefined' ? Scoring.rankTitle(score) : ''),
      isNewHighscore: Boolean(data.isNewHighscore),
      highscore: data.highscore || null,
      clockMinutes,
      clockLabel: data.clockLabel || (typeof Scoring !== 'undefined' ? Scoring.formatClock(clockMinutes) : ''),
      minutesLate: typeof data.minutesLate === 'number'
        ? data.minutesLate
        : Math.max(0, clockMinutes - CONFIG.CLOCK.LECTURE_MINUTES),
      totalFails: Number(data.totalFails) || 0,
      frustration: Number(data.frustration) || 0,
      frustrationPeak: Number(data.frustrationPeak) || 0,
      runAchievements: Array.isArray(data.runAchievements) ? data.runAchievements : [],
      chapterStats: stats,
      failsByChapter,
      startChapter: GameScene.clampChapterId(data.startChapter || 1),
    };
  }

  /**
   * Uhrzeit-Gag für den Sieg-Bildschirm.
   * @param {number} minutes Uhrzeit beim Verbinden
   * @returns {string}
   */
  static lectureGag(minutes) {
    const start = CONFIG.CLOCK.LECTURE_MINUTES;
    const end = start + GameOverScene.LECTURE_DURATION_MINUTES;
    if (minutes < start) {
      return `Und das ${GameOverScene.formatDuration(start - minutes)} vor Vorlesungsbeginn. Respekt.`;
    }
    if (minutes < end) {
      return `Die Vorlesung läuft schon seit ${GameOverScene.formatDuration(minutes - start)}. Ohne dich.`;
    }
    return `Die Vorlesung ist seit ${GameOverScene.formatDuration(minutes - end)} vorbei.`;
  }

  /**
   * „1 Minute“, „25 Minuten“, „2 Stunden und 5 Minuten“.
   * @param {number} minutes
   * @returns {string}
   */
  static formatDuration(minutes) {
    const total = Math.max(1, Math.round(minutes));
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    const minuteText = (n) => `${n} ${n === 1 ? 'Minute' : 'Minuten'}`;
    if (hours === 0) return minuteText(rest);
    const hourText = `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`;
    return rest ? `${hourText} und ${minuteText(rest)}` : hourText;
  }
}
