class IntroScene extends Phaser.Scene {
  constructor() { super('IntroScene'); }

  preload() {
    // SVG wird bei 2× Größe gerastert → pixelscharfe Darstellung
    // Aspect ratio: 158.23×154.57mm ≈ 1.024:1 (fast quadratisch)
    this.load.svg('logo', 'assets/images/ui/logo.svg', { width: 600, height: 586 });
  }

  create() {
    const W = 450, H = 800;
    const CX = W / 2;

    // Anzeigegröße: 300×293 (halbe Render-Auflösung → scharf)
    const LOGO_W = 300, LOGO_H = 293;
    const LOGO_Y = 295;

    // ── Hintergrund ──────────────────────────────────────────────────────────
    this.add.rectangle(CX, H / 2, W, H, 0x06020a);

    // ── Sonnenstrahlen (entstehen beim Aufprall) ──────────────────────────
    const rays = this.add.graphics().setAlpha(0).setDepth(1);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const spread = Math.PI / 26;
      rays.fillStyle(0xffd54f, 0.20);
      const r = 680;
      rays.fillTriangle(
        CX, LOGO_Y,
        CX + Math.cos(a - spread) * r, LOGO_Y + Math.sin(a - spread) * r,
        CX + Math.cos(a + spread) * r, LOGO_Y + Math.sin(a + spread) * r
      );
    }

    // ── Goldener Schimmer hinter Logo ────────────────────────────────────
    const glow = this.add.graphics().setAlpha(0).setDepth(2);
    glow.fillStyle(0xff8800, 0.07); glow.fillCircle(CX, LOGO_Y, 300);
    glow.fillStyle(0xffd54f, 0.11); glow.fillCircle(CX, LOGO_Y, 190);
    glow.fillStyle(0xfff5cc, 0.14); glow.fillCircle(CX, LOGO_Y, 100);

    // ── Schockwelle ───────────────────────────────────────────────────────
    const ring = this.add.graphics().setAlpha(0).setDepth(2);

    // ── Logo (SVG, weiß auf transparentem Hintergrund) ───────────────────
    const logo = this.add.image(CX, -260, 'logo')
      .setDisplaySize(LOGO_W, LOGO_H)
      .setAlpha(0)
      .setDepth(4);

    // ── Untertitel ────────────────────────────────────────────────────────
    const SUB_Y  = LOGO_Y + LOGO_H / 2 + 46;
    const LINE_Y = LOGO_Y + LOGO_H / 2 + 34;

    const sub = this.add.text(CX, SUB_Y, '– Das letzte Abenteuer –', {
      fontFamily: 'Georgia, serif', fontSize: '22px', fontStyle: 'italic',
      color: '#e8b86d', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setDepth(4);

    // ── Dekolinien ────────────────────────────────────────────────────────
    const deco = this.add.graphics().setAlpha(0).setDepth(4);
    deco.lineStyle(1.5, 0xffd54f, 0.65);
    deco.lineBetween(26, LINE_Y, CX - 155, LINE_Y);
    deco.lineBetween(CX + 155, LINE_Y, W - 26, LINE_Y);

    // ── Tap-Hinweis ───────────────────────────────────────────────────────
    const hint = this.add.text(CX, H - 72, '~ TIPPEN ZUM FORTFAHREN ~', {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold',
      color: '#dddddd', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(4);

    let tapped = false;
    const onTap = () => {
      if (tapped) return;
      tapped = true;
      this.cameras.main.fade(380, 0, 0, 0);
      this.time.delayedCall(380, () => this.scene.start('MenuScene'));
    };

    // ════════════════════════════════════════════════════════════════════════
    // Animations-Sequenz
    // ════════════════════════════════════════════════════════════════════════

    // Schimmer blendet sanft ein
    this.tweens.add({ targets: glow, alpha: 1, duration: 1000, delay: 60 });

    // Logo fliegt von oben herein
    this.tweens.add({
      targets: logo,
      y: LOGO_Y,
      alpha: 1,
      duration: 700,
      delay: 280,
      ease: 'Back.easeOut',
      onComplete: () => {

        // Kamerazittern + Blitz
        this.cameras.main.shake(260, 0.012);
        this.cameras.main.flash(160, 255, 210, 80, false);

        // Strahlenburst
        this.tweens.add({
          targets: rays, alpha: 1, duration: 160,
          onComplete: () => {
            this.tweens.add({ targets: rays, alpha: 0, duration: 1100, delay: 120, ease: 'Cubic.easeIn' });
          },
        });

        // Schockwellen-Ring
        const maxR = 340;
        let progress = 0;
        this.time.addEvent({
          delay: 14, repeat: 36,
          callback: () => {
            progress += 1 / 36;
            const r = progress * maxR;
            ring.clear();
            ring.lineStyle(3 * (1 - progress * 0.7), 0xffd54f, 1 - progress);
            ring.strokeCircle(CX, LOGO_Y, r);
            ring.setAlpha(1 - progress);
          },
        });

        // Scale-Punch beim Aufprall
        this.tweens.add({ targets: logo, scaleX: 1.08, scaleY: 1.08, duration: 90, yoyo: true });

        // Sanftes Schweben + Pulsieren
        this.time.delayedCall(300, () => {
          this.tweens.add({ targets: logo, y: LOGO_Y - 7, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.tweens.add({ targets: logo, alpha: 0.86, duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        });

        // Untertitel + Dekolinien
        this.tweens.add({ targets: [sub, deco], alpha: 1, duration: 520, delay: 200 });

        // Tap-Hinweis
        this.time.delayedCall(950, () => {
          this.tweens.add({
            targets: hint, alpha: 1, duration: 540,
            onComplete: () => {
              this.tweens.add({ targets: hint, alpha: 0, duration: 680, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            },
          });
          this.input.on('pointerdown', onTap);
        });
      },
    });
  }
}
