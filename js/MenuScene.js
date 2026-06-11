class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  preload() {
    this.load.image('title_screen', 'assets/images/ui/title_screen.png');
    this.load.image('logo', 'assets/images/ui/logo.png');

    // Preload all game assets here so GameScene doesn't need its own preload
    // Backgrounds
    this.load.image('wald_bg',  'assets/images/backgrounds/wald_bg.png');
    this.load.image('wald_fg',  'assets/images/backgrounds/wald_fg.png');
    this.load.image('wein_bg',  'assets/images/backgrounds/wein_bg.png');
    this.load.image('wein_fg',  'assets/images/backgrounds/wein_fg.png');
    this.load.image('party_bg', 'assets/images/backgrounds/party_bg.png');
    this.load.image('party_fg', 'assets/images/backgrounds/party_fg.png');

    // Apfel – small
    for (let i = 1; i <= 4; i++)
      this.load.image(`apfel_small_${i}`, `assets/images/sprites/apfel/apfel_small_run_0${i}.png`);

    // Apfel – large variants (7 frames used, frame 8 = landing, skipped for run anim)
    ['full', 'half', 'empty'].forEach(v => {
      for (let i = 1; i <= 8; i++) {
        const n = String(i).padStart(2, '0');
        this.load.image(`apfel_large_${v}_${i}`, `assets/images/sprites/apfel/apfel_large_${v}_run_${n}.png`);
      }
    });

    // Elwetrische
    for (let i = 1; i <= 3; i++)
      this.load.image(`elw_${i}`, `assets/images/sprites/enemies/elwetrische_0${i}.png`);

    // Coins
    this.load.image('coin_1', 'assets/images/sprites/items/coin_01.png');
    this.load.image('coin_2', 'assets/images/sprites/items/coin_02.png');

    // Schorle
    this.load.image('schorle', 'assets/images/sprites/items/schorle_pickup.png');

    // Ground & platform tiles
    this.load.image('tile_ground',   'assets/images/sprites/tiles/tile_06.png');
    this.load.image('tile_platform', 'assets/images/sprites/tiles/tile_03.png');

    // Decorations
    this.load.image('tree_1', 'assets/images/sprites/tiles/tree_01.png');
    this.load.image('tree_2', 'assets/images/sprites/tiles/tree_02.png');
    this.load.image('tree_3', 'assets/images/sprites/tiles/tree_03.png');
    this.load.image('mushroom', 'assets/images/sprites/tiles/tile_04.png');
    this.load.image('bush',     'assets/images/sprites/tiles/tile_05.png');
  }

  create() {
    const W = 450, H = 800;

    // Title image fills screen
    const title = this.add.image(W / 2, H / 2, 'title_screen');
    title.setDisplaySize(W, H);

    // Dark overlay for readability
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.35);

    // Logo
    const logo = this.add.image(W / 2, 160, 'logo');
    logo.setDisplaySize(Math.min(W * 0.7, logo.width), logo.height * (Math.min(W * 0.7, logo.width) / logo.width));

    // Title text
    this.add.text(W / 2, 300, 'SCHORLEMEISTER', {
      fontFamily: 'Georgia, serif',
      fontSize: '36px',
      color: '#ffd54f',
      stroke: '#000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(W / 2, 345, 'Jump \'n\' Run', {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Pulsing start text
    const startText = this.add.text(W / 2, H - 120, 'TIPPEN ZUM STARTEN', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      alpha: 0,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.input.once('pointerdown', () => {
      this.scene.start('GameScene', { level: 0, totalCoins: 0 });
    });
  }
}
