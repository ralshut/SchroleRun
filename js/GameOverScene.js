class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  create(data) {
    const W = 450, H = 800;
    const level = data.level ?? 0;
    const totalCoins = data.totalCoins ?? 0;
    const reason = data.reason ?? 'fell';

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78);

    const bgMusic = this.sound.add('music_gestorben', { loop: true, volume: 0.60 });
    bgMusic.play();
    this.events.once('shutdown', () => bgMusic.stop());

    let headline = 'Apfel ist gefallen!';
    let sub = 'In die Pfalz-Lücke gestürzt!';
    if (reason === 'caught') {
      headline = 'Julia hat dich!';
      sub = 'Erwischt, bevor du Schorlemeister\nwerden konntest …';
    } else if (reason === 'quiz') {
      headline = 'Falsch gemischt!';
      sub = 'Die Schorle ergoss sich über dich –\nProbe nicht bestanden.';
    }

    this.add.text(W / 2, 250, headline, {
      fontFamily: 'Georgia, serif', fontSize: '34px', fontStyle: 'bold',
      color: '#ff5555', stroke: '#000', strokeThickness: 6, align: 'center',
    }).setOrigin(0.5);

    this.add.text(W / 2, 305, sub, {
      fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'italic',
      color: '#ffffff', stroke: '#000', strokeThickness: 4, align: 'center',
      wordWrap: { width: 400 },
    }).setOrigin(0.5);

    this.add.text(W / 2, 360, `Münzen gesammelt: ${totalCoins}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '20px',
      color: '#ffd54f', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Retry button
    const retryBtn = this.add.text(W / 2, 450, '[ Nochmal ]', {
      fontFamily: 'Arial, sans-serif', fontSize: '26px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    retryBtn.on('pointerover', () => retryBtn.setColor('#ffd54f'));
    retryBtn.on('pointerout',  () => retryBtn.setColor('#ffffff'));
    retryBtn.on('pointerdown', () => {
      this.scene.start('GameScene', { level, totalCoins: 0 });
    });

    // Menu button
    const menuBtn = this.add.text(W / 2, 530, '[ Zum Menü ]', {
      fontFamily: 'Arial, sans-serif', fontSize: '22px',
      color: '#aaaaaa', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
    menuBtn.on('pointerout',  () => menuBtn.setColor('#aaaaaa'));
    menuBtn.on('pointerdown', () => this.scene.start('MenuScene'));
  }
}
