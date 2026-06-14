class WinScene extends Phaser.Scene {
  constructor() { super('WinScene'); }

  create(data) {
    const W = 450, H = 800;
    const level      = data.level ?? 0;
    const totalCoins = data.totalCoins ?? 0;
    const isLastLevel = level >= LEVELS.length - 1;

    if (isLastLevel) {
      this._runEndingCutscene(W, H, totalCoins);
      return;
    }

    // ── Zwischenscreen ──────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.8);

    this.add.text(W / 2, 220, 'Level geschafft!', {
      fontFamily: 'Georgia, serif', fontSize: '36px',
      color: '#88ff88', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(W / 2, 290, `Weiter: ${LEVELS[level + 1].title}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '20px',
      color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(W / 2, 380, `Münzen gesamt: ${totalCoins}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '22px',
      color: '#ffd54f', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    const nextBtn = this.add.text(W / 2, 500, '[ Nächste Prüfung ]', {
      fontFamily: 'Arial, sans-serif', fontSize: '26px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    nextBtn.on('pointerover', () => nextBtn.setColor('#ffd54f'));
    nextBtn.on('pointerout',  () => nextBtn.setColor('#ffffff'));
    nextBtn.on('pointerdown', () => {
      this.scene.start('GameScene', { level: level + 1, totalCoins });
    });
  }

  // ── Abschluss-Cutscene ──────────────────────────────────────────────────
  _runEndingCutscene(W, H, totalCoins) {
    const groundY = Math.round(H * 0.64);

    // Hintergrund
    this.add.image(W / 2, H / 2, 'title_screen').setDisplaySize(W, H);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.42);

    // Apfel-Lauf-Animation sicherstellen (falls GameScene nicht lief)
    if (!this.anims.exists('apfel_large_full_run'))
      this.anims.create({
        key: 'apfel_large_full_run',
        frames: [1,2,3,4,5,6,7].map(i => ({ key:`apfel_large_full_${i}` })),
        frameRate: 10, repeat: -1,
      });

    // ── Apfel läuft von links ────────────────────────────────────────────
    const apfel = this.add.sprite(-80, groundY, 'apfel_large_full_1')
      .setOrigin(0.5, 1).setDisplaySize(90, 112).setDepth(5);
    apfel.play('apfel_large_full_run');

    // ── Julia läuft von rechts (gespiegelt) ─────────────────────────────
    const jh = 130;
    const julia = this.add.image(W + 80, groundY, 'julia')
      .setOrigin(0.5, 1).setDisplaySize(Math.round(jh * 300 / 1125), jh)
      .setDepth(5).setFlipX(true);

    // ── Herz-Grafik ──────────────────────────────────────────────────────
    const heartGfx = this.add.graphics().setDepth(9);
    const hObj = { r: 0 };
    const hx = W / 2, hy = groundY - 62;

    const drawHeart = () => {
      const r = hObj.r;
      heartGfx.clear();
      if (r < 1) return;
      heartGfx.fillStyle(0xff1744, 1);
      heartGfx.fillCircle(hx - r * 0.50, hy - r * 0.18, r * 0.54);
      heartGfx.fillCircle(hx + r * 0.50, hy - r * 0.18, r * 0.54);
      heartGfx.fillTriangle(
        hx - r * 1.00, hy - r * 0.10,
        hx + r * 1.00, hy - r * 0.10,
        hx,            hy + r * 0.82
      );
    };

    const seq = (ms, fn) => this.time.delayedCall(ms, fn);

    // t = 0ms : Beide laufen aufeinander zu
    this.tweens.add({ targets: apfel, x: W * 0.35, duration: 1300, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: julia, x: W * 0.65, duration: 1300, ease: 'Quad.easeOut' });

    // t = 1300ms : Apfel hält an
    seq(1300, () => apfel.stop());

    // t = 1650ms : Herz wächst über die Charaktere
    seq(1650, () => {
      this.tweens.add({
        targets: hObj, r: 92, duration: 680, ease: 'Back.easeOut',
        onUpdate: drawHeart,
      });
    });

    // t = 2050ms : Charaktere verschwinden ins Herz
    seq(2050, () => {
      this.tweens.add({ targets: [apfel, julia], alpha: 0, duration: 380 });
    });

    // t = 2550ms : Herz pulsiert (einmal)
    seq(2550, () => {
      this.tweens.add({
        targets: hObj, r: 118, duration: 220, yoyo: true,
        ease: 'Sine.easeInOut', onUpdate: drawHeart,
      });
    });

    // t = 3200ms : Herz schwindet, Texte blenden ein
    seq(3200, () => {
      this.tweens.add({ targets: heartGfx, alpha: 0, duration: 700 });

      const fadeIn = (obj, delay = 0) =>
        this.tweens.add({ targets: obj, alpha: 1, duration: 650, delay });

      const t1 = this.add.text(W / 2, 190, 'SCHORLEMEISTER!', {
        fontFamily: 'Georgia, serif', fontSize: '42px', fontStyle: 'bold',
        color: '#ffd54f', stroke: '#000', strokeThickness: 8,
      }).setOrigin(0.5).setAlpha(0);
      fadeIn(t1, 0);

      const t2 = this.add.text(W / 2, 248, 'Alle Prüfungen bestanden!', {
        fontFamily: 'Georgia, serif', fontSize: '20px', fontStyle: 'italic',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setAlpha(0);
      fadeIn(t2, 200);

      const t3 = this.add.text(W / 2, 640, 'Apfel ist Schorlemeister –\nund bekommt Julia! 🍷❤️', {
        fontFamily: 'Georgia, serif', fontSize: '22px', fontStyle: 'bold',
        color: '#ffd54f', stroke: '#000', strokeThickness: 6, align: 'center',
      }).setOrigin(0.5).setAlpha(0);
      fadeIn(t3, 400);
    });

    // t = 4300ms : Münzen-Zähler + Menü-Button erscheinen
    seq(4300, () => {
      this.add.text(W / 2, 715, `Münzen gesamt: ${totalCoins}`, {
        fontFamily: 'Arial, sans-serif', fontSize: '20px',
        color: '#ffffff', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);

      const menuBtn = this.add.text(W / 2, 764, '[ Zum Menü ]', {
        fontFamily: 'Arial, sans-serif', fontSize: '24px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      menuBtn.on('pointerover', () => menuBtn.setColor('#ffd54f'));
      menuBtn.on('pointerout',  () => menuBtn.setColor('#ffffff'));
      menuBtn.on('pointerdown', () => this.scene.start('MenuScene'));
    });
  }
}
