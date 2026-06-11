class HudScene extends Phaser.Scene {
  constructor() { super('HudScene'); }

  create(data) {
    this.gameScene = data.gameScene;

    this.coinText = this.add.text(16, 16, 'Münzen: 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 4,
    });

    this.stateText = this.add.text(16, 44, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffd54f',
      stroke: '#000',
      strokeThickness: 3,
    });

    // Power-up bar background
    this.add.rectangle(86, 74, 140, 12, 0x000000, 0.5).setOrigin(0.5, 0.5);

    this.barFill = this.add.rectangle(16, 68, 0, 12, 0x9c27b0).setOrigin(0, 0);
  }

  update() {
    if (!this.gameScene || !this.gameScene.scene.isActive()) return;

    const gs = this.gameScene;
    this.coinText.setText(`Münzen: ${gs.coinsCollected}`);

    const state = gs.apfelState;
    const stateLabels = {
      small:      '',
      largeFull:  'Schorle voll',
      largeHalf:  'Schorle halb',
      largeEmpty: 'Schorle leer',
    };
    const barColors = {
      largeFull:  0x9c27b0,
      largeHalf:  0xff9800,
      largeEmpty: 0x9e9e9e,
    };

    this.stateText.setText(stateLabels[state] || '');

    if (state !== 'small') {
      const ratio = Math.max(0, gs.stateTimer / STATE_DUR);
      this.barFill.setDisplaySize(140 * ratio, 12);
      this.barFill.setFillStyle(barColors[state] || 0x9c27b0);
    } else {
      this.barFill.setDisplaySize(0, 12);
    }
  }
}
