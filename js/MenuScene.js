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

    // Julia – die Verfolgerin (aus dem Poster montiert)
    this.load.image('julia', 'assets/images/sprites/enemies/julia_chase.png');

    // Pokahontas – Prüfung des Willens (5 Stand-Zustände + 4 Tanz-Frames je Zustand)
    for (let i = 0; i <= 4; i++) {
      this.load.image(`pokahontas_${i}`, `assets/images/sprites/enemies/pokahontas_${i}.png`);
      for (let f = 1; f <= 4; f++)
        this.load.image(`pokahontas_d${i}_${f}`, `assets/images/sprites/enemies/pokahontas_d${i}_${f}.png`);
    }

    // Kampfstern – Jugger-Turnier
    this.load.image('kampfstern', 'assets/images/sprites/items/kampfstern.png');

    // Coins
    this.load.image('coin_1', 'assets/images/sprites/items/coin_01.png');
    this.load.image('coin_2', 'assets/images/sprites/items/coin_02.png');

    // Schorle
    this.load.image('schorle', 'assets/images/sprites/items/schorle_pickup.png');

    // Kenney ground and platform tiles
    const tileSfx = [
      'block', 'block_top', 'block_top_left', 'block_top_right',
      'block_center', 'block_left', 'block_right',
      'horizontal_middle', 'horizontal_left', 'horizontal_right'
    ];
    ['grass', 'purple', 'sand'].forEach(theme => {
      tileSfx.forEach(sfx => {
        const key = `terrain_${theme}_${sfx}`;
        this.load.image(key, `assets/images/sprites/tiles/${key}.png`);
      });
    });

    // Kenney decorations
    this.load.image('dec_bush', 'assets/images/sprites/tiles/bush.png');
    this.load.image('dec_mushroom', 'assets/images/sprites/tiles/mushroom_red.png');
    this.load.image('dec_sign_right', 'assets/images/sprites/tiles/sign_right.png');
    this.load.image('dec_sign_exit', 'assets/images/sprites/tiles/sign_exit.png');

    // Kenney flag
    this.load.image('flag_off', 'assets/images/sprites/tiles/flag_off.png');
    this.load.image('flag_red_a', 'assets/images/sprites/tiles/flag_red_a.png');
    this.load.image('flag_red_b', 'assets/images/sprites/tiles/flag_red_b.png');

    // Musik (MP3, je eine Datei pro Spielzustand)
    this.load.audio('music_title',     'assets/sounds/music_title.mp3');
    this.load.audio('music_levels',    'assets/sounds/music_levels.mp3');
    this.load.audio('music_gestorben', 'assets/sounds/music_gestorben.mp3');
    this.load.audio('music_abspann',   'assets/sounds/music_abspann.mp3');

    // Sounds (Kenney New Platformer Pack)
    this.load.audio('sfx_jump',      'assets/sounds/sfx_jump.ogg');
    this.load.audio('sfx_coin',      'assets/sounds/sfx_coin.ogg');
    this.load.audio('sfx_hurt',      'assets/sounds/sfx_hurt.ogg');
    this.load.audio('sfx_magic',     'assets/sounds/sfx_magic.ogg');
    this.load.audio('sfx_bump',      'assets/sounds/sfx_bump.ogg');
    this.load.audio('sfx_disappear', 'assets/sounds/sfx_disappear.ogg');
  }

  create() {
    const W = 450, H = 800;

    // ── Direktstart zum Testen: index.html?level=3 (1-basiert) ──────────────
    // 1 = Stärke, 2 = Geist, 3 = Jugger, 4 = Wille. Überspringt das Menü.
    const params = new URLSearchParams(window.location.search);
    if (params.has('level')) {
      const n = parseInt(params.get('level'), 10);
      if (!isNaN(n) && n >= 1 && n <= LEVELS.length) {
        this.scene.start('GameScene', { level: n - 1, totalCoins: 0 });
        return;
      }
    }

    // Titelmusik
    const bgMusic = this.sound.add('music_title', { loop: true, volume: 0.65 });
    bgMusic.play();
    this.events.once('shutdown', () => bgMusic.stop());

    // Title image fills screen
    const title = this.add.image(W / 2, H / 2, 'title_screen');
    title.setDisplaySize(W, H);

    // Titel-Schriftzug
    this.add.text(W / 2, 48, 'DER SCHORLEMEISTER', {
      fontFamily: 'Georgia, serif', fontSize: '33px', fontStyle: 'bold',
      color: '#ffd54f', stroke: '#000', strokeThickness: 7,
      align: 'center',
    }).setOrigin(0.5);

    // "Das letzte Abenteuer" direkt über dem Start-Text
    this.add.text(W / 2, H - 158, 'Das letzte Abenteuer', {
      fontFamily: 'Georgia, serif', fontSize: '24px', fontStyle: 'italic',
      color: '#ffffff', stroke: '#000', strokeThickness: 5,
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
