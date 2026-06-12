const GROUND_Y    = 704;
const TILE_SIZE   = 64;
const BASE_JUMP   = -420;
const HOLD_BOOST  = -350;
const MAX_HOLD    = 0.4;
const TERM_VEL    = 700;
const STATE_DUR   = 12;
const INVINCE_DUR = 1.5;

const APFEL_SMALL = { w: 56, h: 70 };
const APFEL_LARGE = { w: 72, h: 90 };

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create(data) {
    this.levelIdx       = data.level ?? 0;
    this.totalCoins     = data.totalCoins ?? 0;
    this.cfg            = LEVELS[this.levelIdx];
    this._gameOver      = false;
    this._flagTriggered = false;
    this.apfelState     = 'small';
    this.stateTimer     = 0;
    this.invTimer       = 0;
    this.flickerT       = 0;
    this.coinsCollected = 0;
    this.tapHeld        = false;
    this.holdTime       = 0;
    this.nextEnemyIdx   = 0;
    this._dying         = false;

    const W = 450, H = 800;
    const themes = ['grass', 'purple', 'sand'];
    const theme   = themes[this.levelIdx] ?? 'grass';

    // ── Backgrounds ──────────────────────────────────────────────────────────
    this.bgSprite = this.add.tileSprite(W/2, H/2, W, H, this.cfg.bgKey)
      .setScrollFactor(0).setDepth(-2);
    this.fgSprite = this.add.tileSprite(W/2, H/2, W, H, this.cfg.fgKey)
      .setScrollFactor(0).setDepth(-1);

    // ── Ground ────────────────────────────────────────────────────────────────
    this.groundGroup = this.physics.add.staticGroup();
    this.cfg.ground.forEach(([gx, tiles]) => {
      const w = tiles * TILE_SIZE;
      // Invisible physics body: top edge at GROUND_Y
      // Unsichtbarer Physik-Body: Oberkante exakt auf GROUND_Y
      const zone = this.add.rectangle(gx + w/2, GROUND_Y + 64, w, 128, 0x000000, 0);
      this.physics.add.existing(zone, true);
      this.groundGroup.add(zone);

      const TY = GROUND_Y;
      for (let i = 0; i < tiles; i++) {
        const tx = gx + i * TILE_SIZE;
        let topKey = `terrain_${theme}_block_top`;
        if (tiles === 1)        topKey = `terrain_${theme}_block`;
        else if (i === 0)       topKey = `terrain_${theme}_block_top_left`;
        else if (i === tiles-1) topKey = `terrain_${theme}_block_top_right`;
        this.add.image(tx, TY, topKey).setOrigin(0,0).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);

        let midKey = `terrain_${theme}_block_center`;
        if (i === 0)            midKey = `terrain_${theme}_block_left`;
        else if (i === tiles-1) midKey = `terrain_${theme}_block_right`;
        this.add.image(tx, TY + TILE_SIZE, midKey).setOrigin(0,0).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
      }
    });

    // ── Platforms (one-way) ───────────────────────────────────────────────────
    this.platformGroup = this.physics.add.staticGroup();
    this.cfg.platforms.forEach(([px, py, tiles]) => {
      const w = tiles * TILE_SIZE;
      const zone = this.add.rectangle(px + w/2, py + 20, w, 40, 0x000000, 0);
      this.physics.add.existing(zone, true);
      this.platformGroup.add(zone);

      for (let i = 0; i < tiles; i++) {
        const tx = px + i * TILE_SIZE;
        let platKey = `terrain_${theme}_horizontal_middle`;
        if (tiles === 1)       platKey = `terrain_${theme}_horizontal_middle`;
        else if (i === 0)      platKey = `terrain_${theme}_horizontal_left`;
        else if (i === tiles-1) platKey = `terrain_${theme}_horizontal_right`;
        this.add.image(tx, py, platKey).setOrigin(0,0).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
      }
    });

    // ── Coins ─────────────────────────────────────────────────────────────────
    this.coinGroup = this.physics.add.group();
    this.cfg.coins.forEach(([cx, cy]) => {
      const coin = this.coinGroup.create(cx, cy, 'coin_1');
      coin.setDisplaySize(32, 32).setOrigin(0.5).setDepth(2);
      coin.body.allowGravity = false;
      coin.body.setSize(28, 28);
      coin.play('coin_spin');
    });

    // ── Schorlen ──────────────────────────────────────────────────────────────
    this.schorleGroup = this.physics.add.group();
    this.cfg.schorleX.forEach(sx => {
      const s = this.schorleGroup.create(sx, GROUND_Y - 46, 'schorle');
      s.setDisplaySize(44, 58).setOrigin(0.5, 1).setDepth(2);
      s.body.allowGravity = false;
      s.body.setSize(36, 48);
      s._baseY = GROUND_Y - 46;
      s._bobT  = 0;
    });

    // ── Flag ──────────────────────────────────────────────────────────────────
    const fx = this.cfg.flagX;
    this.flagSprite = this.add.sprite(fx, GROUND_Y, 'flag_off')
      .setOrigin(0, 1).setDisplaySize(TILE_SIZE, TILE_SIZE * 2).setDepth(2);
    this.flagZone = this.add.rectangle(fx + TILE_SIZE/2, GROUND_Y - TILE_SIZE, TILE_SIZE, TILE_SIZE * 2);
    this.physics.add.existing(this.flagZone, true);

    // ── Decorations ───────────────────────────────────────────────────────────
    this.cfg.ground.forEach(([gx, tiles], idx) => {
      const w = tiles * TILE_SIZE;
      if (tiles >= 3)
        this.add.image(gx + 96, GROUND_Y, 'dec_bush').setOrigin(0.5,1).setDisplaySize(64,64).setDepth(2);
      if (tiles >= 5)
        this.add.image(gx + w - 160, GROUND_Y, 'dec_mushroom').setOrigin(0.5,1).setDisplaySize(48,48).setDepth(2);
    });

    // ── Enemies ───────────────────────────────────────────────────────────────
    this.enemyGroup = this.physics.add.group();

    // ── Animations ────────────────────────────────────────────────────────────
    this._createAnimations();

    // ── Player ────────────────────────────────────────────────────────────────
    this.player = this.physics.add.sprite(100, GROUND_Y, 'apfel_small_1');
    this.player.setOrigin(0, 1).setDepth(3);
    this.player.setMaxVelocity(800, TERM_VEL);
    this.player.body.setCollideWorldBounds(false);
    this._applyStateSize();

    // ── Colliders & overlaps ──────────────────────────────────────────────────
    this.physics.add.collider(this.player, this.groundGroup);
    this.physics.add.collider(this.player, this.platformGroup, null,
      (player, plat) => player.body.velocity.y >= 0 && player.body.bottom <= plat.body.top + 10,
      this
    );
    this.physics.add.overlap(this.player, this.coinGroup,    this._onCoin,    null, this);
    this.physics.add.overlap(this.player, this.schorleGroup, this._onSchorle, null, this);
    this.physics.add.overlap(this.player, this.enemyGroup,   this._onEnemy,   null, this);
    this.physics.add.overlap(this.player, this.flagZone,     this._onFlag,    null, this);

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, this.cfg.levelWidth, H);
    this.cameras.main.startFollow(this.player, false, 1, 0);

    // ── Input ─────────────────────────────────────────────────────────────────
    this.input.on('pointerdown', this._onPointerDown, this);
    this.input.on('pointerup',   this._onPointerUp,   this);
    if (this.input.keyboard) {
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.spaceKey.on('down', this._onPointerDown, this);
      this.spaceKey.on('up',   this._onPointerUp,   this);
    }

    // ── HUD ───────────────────────────────────────────────────────────────────
    this.scene.launch('HudScene', { gameScene: this });

    // ── Level title ───────────────────────────────────────────────────────────
    const titleTxt = this.add.text(W/2, 350, this.cfg.title, {
      fontFamily: 'Georgia, serif', fontSize: '38px',
      color: '#ffd54f', stroke: '#000', strokeThickness: 6,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(10);
    this.tweens.add({
      targets: titleTxt, alpha: 0, delay: 1500, duration: 800,
      onComplete: () => titleTxt.destroy(),
    });
  }

  // ── Animations ────────────────────────────────────────────────────────────

  _createAnimations() {
    const def = (key, frames, rate) => {
      if (!this.anims.exists(key)) this.anims.create({ key, frames, frameRate: rate, repeat: -1 });
    };
    def('apfel_small_run', [1,2,3,4].map(i => ({ key:`apfel_small_${i}` })), 10);
    ['full','half','empty'].forEach(v =>
      def(`apfel_large_${v}_run`, [1,2,3,4,5,6,7].map(i => ({ key:`apfel_large_${v}_${i}` })), 10));
    def('elw_walk', [{ key:'elw_1'},{ key:'elw_2'},{ key:'elw_3'},{ key:'elw_2'}], 6);
    def('coin_spin', [{ key:'coin_1'},{ key:'coin_2'},{ key:'coin_1'}], 5);
    if (!this.anims.exists('flag_wave'))
      this.anims.create({ key:'flag_wave', frames:[{ key:'flag_red_a'},{ key:'flag_red_b'}], frameRate:5, repeat:-1 });
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  _onPointerDown() {
    if (this._gameOver || this._dying) return;
    if (this.player.body.blocked.down) {
      this.player.setVelocityY(BASE_JUMP);
      this.holdTime = 0;
      this.sound.play('sfx_jump', { volume: 0.6 });
    }
    this.tapHeld = true;
  }

  _onPointerUp() { this.tapHeld = false; }

  // ── Overlap callbacks ─────────────────────────────────────────────────────

  _onCoin(player, coin) {
    coin.destroy();
    this.coinsCollected++;
    this.sound.play('sfx_coin', { volume: 0.7 });
  }

  _onSchorle(player, schorle) {
    schorle.destroy();
    this.apfelState = 'largeFull';
    this.stateTimer = STATE_DUR;
    // Kurze Unverwundbarkeit beim Wachsen, damit kein Durchfallen
    this.invTimer = 0.3;
    this._applyStateSize();
    this.sound.play('sfx_magic', { volume: 0.8 });
  }

  _onEnemy(player, enemy) {
    if (this.invTimer > 0 || this._dying) return;

    // Stomp: Spieler fällt von oben auf den Feind
    if (player.body.velocity.y > 20 && player.body.bottom <= enemy.body.top + 24) {
      enemy.destroy();
      this.player.setVelocityY(-300);
      this.sound.play('sfx_bump', { volume: 0.8 });
      return;
    }

    // Von der Seite getroffen
    const order = ['small','largeEmpty','largeHalf','largeFull'];
    const idx = order.indexOf(this.apfelState);
    if (idx <= 0) {
      // Kleiner Apfel → stirbt, aber erst mit kurzem Moment
      this.invTimer = 0.4;
      this.player.setTint(0xff4444);
      this.sound.play('sfx_hurt', { volume: 0.9 });
      this.time.delayedCall(400, () => this._die());
      return;
    }
    // Zustand verschlechtern
    this.apfelState = order[idx - 1];
    this.stateTimer = this.apfelState === 'small' ? 0 : STATE_DUR;
    this.invTimer   = INVINCE_DUR;
    this.flickerT   = 0;
    this._applyStateSize();
    this.sound.play('sfx_hurt', { volume: 0.9 });
  }

  _onFlag() {
    if (this._flagTriggered || this._gameOver) return;
    this._flagTriggered = true;
    this.flagSprite.play('flag_wave');
    this._removeInput();
    this.scene.stop('HudScene');
    this.time.delayedCall(400, () =>
      this.scene.start('WinScene', {
        level: this.levelIdx,
        coinsThisLevel: this.coinsCollected,
        totalCoins: this.totalCoins + this.coinsCollected,
      })
    );
  }

  // ── State / size ──────────────────────────────────────────────────────────

  _applyStateSize() {
    const large = this.apfelState !== 'small';
    const { w, h } = large ? APFEL_LARGE : APFEL_SMALL;
    const feetY = this.player ? this.player.y : GROUND_Y;

    const animMap = {
      small:      'apfel_small_run',
      largeFull:  'apfel_large_full_run',
      largeHalf:  'apfel_large_half_run',
      largeEmpty: 'apfel_large_empty_run',
    };
    // ZUERST die Animation starten, damit der korrekte Frame (und dessen
    // Quellgröße) aktiv ist – klein 169×229, groß 325×434. Sonst wird die
    // Skalierung am falschen Frame berechnet und der Apfel viel zu groß.
    this.player.play(animMap[this.apfelState], true);

    this.player.setDisplaySize(w, h);
    this.player.setOrigin(0, 1);
    this.player.y = feetY;

    // Arcade interpretiert setSize/setOffset in QUELL-Texturpixeln und
    // multipliziert intern mit der Sprite-Skalierung. Body-Maße deshalb als
    // Bruchteil der Frame-Quellgröße angeben – skalierungs-invariant.
    const fw = this.player.frame.realWidth;
    const fh = this.player.frame.realHeight;
    this.player.body.setSize(fw * 0.72, fh * 0.86, false);
    this.player.body.setOffset(fw * 0.14, fh * 0.10);

    // Body-Position sofort synchronisieren (Durchfallen beim Wachsen vermeiden)
    this.player.body.x = this.player.x + w * 0.14;
    this.player.body.y = feetY - h * 0.90;
  }

  _die() {
    if (this._gameOver) return;
    this._gameOver = true;
    this._dying    = true;
    this._removeInput();
    this.player.setVelocityX(0);
    this.player.setVelocityY(-300);
    this.player.setTint(0xff4444);
    this.sound.play('sfx_disappear', { volume: 0.9 });
    this.time.delayedCall(1400, () => {
      this.scene.stop('HudScene');
      this.scene.start('GameOverScene', { level: this.levelIdx, totalCoins: this.totalCoins });
    });
  }

  _removeInput() {
    this.tapHeld = false;
    this.input.off('pointerdown');
    this.input.off('pointerup');
    if (this.spaceKey) { this.spaceKey.off('down'); this.spaceKey.off('up'); }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(time, delta) {
    if (this._gameOver) return;
    const dt = delta / 1000;

    // Auto-run
    this.player.setVelocityX(this.cfg.scrollSpeed);

    // Hold-boost in der Luft
    if (this.tapHeld && !this.player.body.blocked.down) {
      this.holdTime += dt;
      if (this.holdTime < MAX_HOLD) {
        this.player.body.velocity.y = Math.max(
          this.player.body.velocity.y + HOLD_BOOST * dt,
          BASE_JUMP
        );
      }
    }

    // Absturz-Tod
    if (this.player.y > 1200) { this._die(); return; }

    // Power-up Timer: stufenweise abbauen
    if (this.apfelState !== 'small') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        const down = { largeFull:'largeHalf', largeHalf:'largeEmpty', largeEmpty:'small' };
        this.apfelState = down[this.apfelState];
        this.stateTimer = this.apfelState === 'small' ? 0 : STATE_DUR;
        this._applyStateSize();
      }
    }

    // Unverwundbarkeits-Flackern
    if (this.invTimer > 0) {
      this.invTimer -= dt;
      this.flickerT += dt;
      this.player.setAlpha(Math.floor(this.flickerT * 10) % 2 === 0 ? 1 : 0.15);
      if (this.invTimer <= 0) this.player.setAlpha(1);
    }

    // Feinde spawnen
    while (
      this.nextEnemyIdx < this.cfg.enemyX.length &&
      this.cfg.enemyX[this.nextEnemyIdx] < this.player.x + 900
    ) {
      const ex = this.cfg.enemyX[this.nextEnemyIdx++];
      if (ex > this.player.x - 100) {
        const e = this.enemyGroup.create(ex, GROUND_Y, 'elw_1');
        e.setOrigin(0.5, 1).setDisplaySize(56, 64).setDepth(3).setFlipX(true);
        e.body.allowGravity = false;
        e.body.setSize(40, 56);
        e.setVelocityX(-80);
        e.play('elw_walk');
      }
    }

    // Feinde außerhalb des Sichtfelds entfernen
    this.enemyGroup.getChildren().forEach(e => {
      if (e.x < this.cameras.main.scrollX - 300) e.destroy();
    });

    // Schorle-Bob-Animation
    this.schorleGroup.getChildren().forEach(s => {
      s._bobT = (s._bobT || 0) + dt;
      s.y = s._baseY + Math.sin(s._bobT * 2) * 6;
      s.body.reset(s.x, s.y);
    });

    // Parallax-Scrolling
    const scrollX = this.cameras.main.scrollX;
    this.bgSprite.tilePositionX = scrollX * 0.2;
    this.fgSprite.tilePositionX = scrollX * 0.5;
  }
}
