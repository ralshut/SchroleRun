class WinScene extends Phaser.Scene {
  constructor() { super('WinScene'); }

  create(data) {
    const W = 450, H = 800;
    const level = data.level ?? 0;
    const totalCoins = data.totalCoins ?? 0;
    const isLastLevel = level >= LEVELS.length - 1;

    if (isLastLevel) {
      // ── Abspann: Apfel findet zu Julia ───────────────────────────────────
      const poster = this.add.image(W / 2, H / 2, 'title_screen');
      poster.setDisplaySize(W, H);
      this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.35);

      this.add.text(W / 2, 90, 'SCHORLEMEISTER!', {
        fontFamily: 'Georgia, serif', fontSize: '40px', fontStyle: 'bold',
        color: '#ffd54f', stroke: '#000', strokeThickness: 8,
      }).setOrigin(0.5);

      this.add.text(W / 2, 140, 'Alle Prüfungen bestanden!', {
        fontFamily: 'Georgia, serif', fontSize: '20px', fontStyle: 'italic',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5);

      this.add.text(W / 2, 640, 'Apfel ist Schorlemeister –\nund bekommt Julia! 🍷❤️', {
        fontFamily: 'Georgia, serif', fontSize: '22px', fontStyle: 'bold',
        color: '#ffd54f', stroke: '#000', strokeThickness: 6, align: 'center',
      }).setOrigin(0.5);

      this.add.text(W / 2, 710, `Münzen gesamt: ${totalCoins}`, {
        fontFamily: 'Arial, sans-serif', fontSize: '20px',
        color: '#ffffff', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);

      const menuBtn = this.add.text(W / 2, 760, '[ Zum Menü ]', {
        fontFamily: 'Arial, sans-serif', fontSize: '24px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      menuBtn.on('pointerover', () => menuBtn.setColor('#ffd54f'));
      menuBtn.on('pointerout',  () => menuBtn.setColor('#ffffff'));
      menuBtn.on('pointerdown', () => this.scene.start('MenuScene'));
      return;
    }

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.8);

    {
      const nextTitle = LEVELS[level + 1].title;
      this.add.text(W / 2, 220, 'Level geschafft!', {
        fontFamily: 'Georgia, serif', fontSize: '36px',
        color: '#88ff88', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5);

      this.add.text(W / 2, 290, `Weiter: ${nextTitle}`, {
        fontFamily: 'Arial, sans-serif', fontSize: '20px',
        color: '#ffffff', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
    }

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
}
