/**
 * PlaceholderChapterScene.js – Ersatz-Kapitel für noch fehlende Kapitel-Szenen.
 *
 * main.js registriert für jedes Kapitel N, dessen Szenen-Klasse (ChN…Scene) noch nicht
 * existiert, makePlaceholderChapter(N). So bleibt der komplette Spielablauf (Intro, HUD,
 * Kapitelwechsel, GameOver) jederzeit spielbar und testbar.
 *
 * Globals: PlaceholderChapterScene (Basisklasse), makePlaceholderChapter(chapterId).
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, UI (text, Button), ChapterScene.
 */

class PlaceholderChapterScene extends ChapterScene {
  /** Layout der „Kapitel in Arbeit“-Karte (px). */
  static LAYOUT = Object.freeze({
    CARD_WIDTH: 520,
    CARD_HEIGHT: 300,
    CARD_ANGLE: -1,     // Grad – Papier liegt minimal schräg
    SHADOW_OFFSET: 8,
    SHADOW_ALPHA: 0.35,
    PADDING: 32,
    BUTTON_WIDTH: 200,
    BUTTON_HEIGHT: 44,
    BUTTON_GAP: 16,
    BUTTON_OFFSET_Y: 40, // Abstand der Buttons unter der Karte
  });

  create() {
    this.initChapter();
    const L = PlaceholderChapterScene.LAYOUT;
    const area = this.area;
    const cardX = Math.round(area.x + (area.width - L.CARD_WIDTH) / 2);
    const cardY = Math.round(area.y + (area.height - L.CARD_HEIGHT) / 2) - L.BUTTON_OFFSET_Y;

    // Papierkarte mit Schatten (leicht schräg)
    const card = this.add.container(cardX + L.CARD_WIDTH / 2, cardY + L.CARD_HEIGHT / 2);
    const halfW = L.CARD_WIDTH / 2;
    const halfH = L.CARD_HEIGHT / 2;
    card.add(this.add.rectangle(-halfW + L.SHADOW_OFFSET, -halfH + L.SHADOW_OFFSET, L.CARD_WIDTH, L.CARD_HEIGHT,
      CONFIG.COLORS.SHADOW, L.SHADOW_ALPHA).setOrigin(0));
    card.add(this.add.rectangle(-halfW, -halfH, L.CARD_WIDTH, L.CARD_HEIGHT, CONFIG.COLORS.PAPER).setOrigin(0));

    const left = -halfW + L.PADDING;
    const wrap = L.CARD_WIDTH - 2 * L.PADDING;
    card.add(UI.text(this, left, -halfH + L.PADDING,
      `KAPITEL ${this.chapterId} VON ${CONFIG.CHAPTERS.length} · IN ARBEIT`,
      { font: 'STAMP', size: 13, color: CONFIG.CSS.DHBW_RED }));
    card.add(UI.text(this, left, -halfH + L.PADDING + 26, this.chapter.title,
      { font: 'PAPER', size: 28, bold: true, color: CONFIG.CSS.INK }));
    card.add(UI.text(this, left, -halfH + L.PADDING + 78,
      'Dieses Kapitel wird gerade noch gebaut.\n\n' +
      `Geplant: ${this.chapter.short}. Bis dahin genügt ein Klick auf „Abschließen“ – ` +
      'oder ein simulierter Fehlversuch, damit der Frust nicht zu kurz kommt.',
      { font: 'PAPER', size: 15, color: CONFIG.CSS.INK, wrap, lineSpacing: 6 }));
    card.setAngle(L.CARD_ANGLE);

    // Buttons unter der Karte (gerade, damit sie klar als Bedienelemente erkennbar sind)
    const buttonsWidth = 2 * L.BUTTON_WIDTH + L.BUTTON_GAP;
    const buttonsX = Math.round(area.x + (area.width - buttonsWidth) / 2);
    const buttonsY = cardY + L.CARD_HEIGHT + L.BUTTON_OFFSET_Y - L.BUTTON_HEIGHT / 2;
    this.completeButton = new UI.Button(this, buttonsX, buttonsY, {
      text: 'Abschließen',
      variant: 'success',
      width: L.BUTTON_WIDTH,
      height: L.BUTTON_HEIGHT,
      onClick: () => this.succeed({ placeholder: true }),
    });
    this.failButton = new UI.Button(this, buttonsX + L.BUTTON_WIDTH + L.BUTTON_GAP, buttonsY, {
      text: 'Fehlversuch',
      variant: 'secondary',
      width: L.BUTTON_WIDTH,
      height: L.BUTTON_HEIGHT,
      onClick: () => this.fail('Platzhalter sagt nein', { minutes: CONFIG.PENALTY_MINUTES.SMALL }),
    });

    this.setObjective(`${this.chapter.short} (Platzhalter: „Abschließen“ klicken)`);
  }

  /** Löst das Platzhalter-Kapitel sofort. */
  debugSolve() {
    this.succeed({ placeholder: true, solvedBy: 'debug' });
  }

  /** @returns {object} Zustand für Tests */
  getDebugInfo() {
    return { ...super.getDebugInfo(), placeholder: true, step: this.isFinished ? 'done' : 'waiting' };
  }
}

/**
 * Liefert eine Szenen-Klasse (Key aus CONFIG.CHAPTERS) für ein noch fehlendes Kapitel.
 * @param {number} chapterId 1–5
 * @returns {typeof PlaceholderChapterScene}
 */
const makePlaceholderChapter = (chapterId) => {
  const PlaceholderChapter = class extends PlaceholderChapterScene {
    constructor() {
      super(chapterId);
    }
  };
  Object.defineProperty(PlaceholderChapter, 'name', { value: `PlaceholderChapter${chapterId}` });
  return PlaceholderChapter;
};
