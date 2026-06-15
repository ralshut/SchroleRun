class IntroScene extends Phaser.Scene {
  constructor() { super('IntroScene'); }

  create() {
    const W = 450, H = 800;

    // ── Hintergrund ──────────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x0d0507);

    // ── Goldener Schimmer (mehrere weiche Kreise) ─────────────────────────
    const glow = this.add.graphics().setAlpha(0);
    glow.fillStyle(0xff8c00, 0.08);
    glow.fillCircle(W / 2, H / 2, 280);
    glow.fillStyle(0xffd54f, 0.12);
    glow.fillCircle(W / 2, H / 2, 180);
    glow.fillStyle(0xfff0aa, 0.10);
    glow.fillCircle(W / 2, H / 2, 90);

    // ── Haupttitel ───────────────────────────────────────────────────────────
    const title = this.add.text(W / 2, -120, 'DER\nSCHORLEMEISTER', {
      fontFamily: 'Georgia, serif',
      fontSize: '46px',
      fontStyle: 'bold',
      color: '#ffd54f',
      stroke: '#1a0608',
      strokeThickness: 12,
      align: 'center',
      lineSpacing: 10,
    }).setOrigin(0.5).setScale(0.15).setAlpha(0).setDepth(2);

    // ── Untertitel ───────────────────────────────────────────────────────────
    const sub = this.add.text(W / 2, H / 2 + 66, '– Das letzte Abenteuer –', {
      fontFamily: 'Georgia, serif',
      fontSize: '21px',
      fontStyle: 'italic',
      color: '#e8b86d',
      stroke: '#1a0608',
      strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setDepth(2);

    // ── Zierlinien ───────────────────────────────────────────────────────────
    const lines = this.add.graphics().setAlpha(0).setDepth(2);
    lines.lineStyle(1.5, 0xffd54f, 0.65);
    const cy = H / 2 + 54;
    lines.lineBetween(28, cy, W / 2 - 160, cy);
    lines.lineBetween(W / 2 + 160, cy, W - 28, cy);

    // ── Tap-Hinweis ──────────────────────────────────────────────────────────
    const hint = this.add.text(W / 2, H - 88, '~ TIPPEN ZUM FORTFAHREN ~', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#dddddd',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(2);

    let tapped = false;

    const onTap = () => {
      if (tapped) return;
      tapped = true;
      this.cameras.main.fade(380, 0, 0, 0);
      this.time.delayedCall(380, () => this.scene.start('MenuScene'));
    };

    // ── Animationssequenz ────────────────────────────────────────────────────

    // Schimmer einblenden
    this.tweens.add({ targets: glow, alpha: 1, duration: 900, delay: 80 });

    // Titel fliegt von oben ein + zoomed rein (Back.easeOut = Überschwinger)
    this.tweens.add({
      targets: title,
      y: H / 2 - 44,
      scale: 1,
      alpha: 1,
      duration: 780,
      delay: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Kamerazittern beim Aufprall
        this.cameras.main.shake(210, 0.008);

        // Untertitel + Linien
        this.tweens.add({ targets: [sub, lines], alpha: 1, duration: 480, delay: 80 });

        // Sanftes Pulsieren des Titels
        this.time.delayedCall(300, () => {
          this.tweens.add({
            targets: title,
            alpha: 0.80,
            duration: 1600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        });

        // Tap-Hinweis erscheint und blinkt
        this.time.delayedCall(820, () => {
          this.tweens.add({
            targets: hint,
            alpha: { from: 0, to: 1 },
            duration: 560,
            onComplete: () => {
              this.tweens.add({
                targets: hint,
                alpha: 0,
                duration: 650,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
              });
            },
          });
          // Tap jetzt erlaubt
          this.input.on('pointerdown', onTap);
        });
      },
    });
  }
}
