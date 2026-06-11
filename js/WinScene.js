class WinScene extends Phaser.Scene {
  constructor() { super('WinScene'); }

  create(data) {
    const W = 450, H = 800;
    const level = data.level ?? 0;
    const totalCoins = data.totalCoins ?? 0;
    const isLastLevel = level >= LEVELS.length - 1;

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.8);

    if (isLastLevel) {
      this.add.text(W / 2, 200, 'SCHORLEMEISTER!', {
        fontFamily: 'Georgia, serif', fontSize: '40px', fontStyle: 'bold',
        color: '#ffd54f', stroke: '#000', strokeThickness: 7,
      }).setOrigin(0.5);

      this.add.text(W / 2, 270, '🍷 Apfel hat es geschafft! 🍷', {
        fontFamily: 'Arial, sans-serif', fontSize: '20px',
        color: '#ffffff', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
    } else {
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

    if (isLastLevel) {
      const menuBtn = this.add.text(W / 2, 500, '[ Zum Menü ]', {
        fontFamily: 'Arial, sans-serif', fontSize: '26px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      menuBtn.on('pointerover', () => menuBtn.setColor('#ffd54f'));
      menuBtn.on('pointerout',  () => menuBtn.setColor('#ffffff'));
      menuBtn.on('pointerdown', () => this.scene.start('MenuScene'));
    } else {
      const nextBtn = this.add.text(W / 2, 500, '[ Nächstes Level ]', {
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
}
