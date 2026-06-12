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

    this.stateText = this.add.text(16, 44, 'SCHORLE', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffd54f',
      stroke: '#000',
      strokeThickness: 3,
    });

    // Schorle-Vorsprungsbalken (Hintergrund + Füllung)
    this.add.rectangle(16, 68, 160, 14, 0x000000, 0.5).setOrigin(0, 0);
    // Basisbreite 156, Füllung über scaleX (Breite 0 → Division durch 0).
    this.barFill = this.add.rectangle(18, 70, 156, 10, 0x9c27b0).setOrigin(0, 0);
  }

  update() {
    if (!this.gameScene || !this.gameScene.scene.isActive()) return;

    const gs = this.gameScene;
    this.coinText.setText(`Münzen: ${gs.coinsCollected}`);

    const fuel = Math.max(0, Math.min(1, gs.fuel ?? 0));
    // Farbe nach Pegel: voll lila → halb orange → leer rot (Julia kommt näher!)
    let color = 0x9c27b0;
    if      (fuel <= 0.40) color = 0xff9800;
    if      (fuel <= 0.12) color = 0xe53935;
    this.barFill.scaleX = fuel;
    this.barFill.setFillStyle(color);
    this.stateText.setColor(fuel <= 0.12 ? '#ff5555' : '#ffd54f');
  }
}
