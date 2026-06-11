const GROUND_Y    = 700;
const TILE_SIZE   = 64;
const BASE_JUMP   = -420;
const HOLD_BOOST  = -350;
const MAX_HOLD    = 0.4;
const TERM_VEL    = 700;
const STATE_DUR   = 12;
const INVINCE_DUR = 1.5;

const APFEL_SMALL = { w: 56, h: 70 };
const APFEL_LARGE = { w: 72, h: 90 };   // etwas kleiner als vorher

const GROUND_TILE_H = 72; // Höhe des Boden-Tiles in Pixeln (inkl. Erde)

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

    const W = 450, H = 800;

    // ── Backgrounds ──────────────────────────────────────────────────────────
    this.bgSprite = this.add.tileSprite(W/2, H/2, W, H, this.cfg.bgKey)
      .setScrollFactor(0).setDepth(-2);
    this.fgSprite = this.add.tileSprite(W/2, H/2, W, H, this.cfg.fgKey)
      .setScrollFactor(0).setDepth(-1);

    // ── Ground (solid from all sides) ────────────────────────────────────────
    this.groundGroup = this.physics.add.staticGroup();
    this.cfg.ground.forEach(([gx, tiles]) => {
      const w = tiles * TILE_SIZE;
      // Physics zone — top edge at GROUND_Y
      const zone = this.add.zone(gx + w/2, GROUND_Y + GROUND_TILE_H/2, w, GROUND_TILE_H + 128);
      this.physics.add.existing(zone, true);
      this.groundGroup.add(zone);
      // Visual: repeating ground tiles
      for (let t = 0; t < tiles; t++) {
        this.add.image(gx + t * TILE_SIZE + TILE_SIZE/2, GROUND_Y + GROUND_TILE_H/2, 'tile_ground')
          .setDisplaySize(TILE_SIZE, GROUND_TILE_H).setDepth(1);
      }
    });

    // ── Platforms (one-way: passable from below) ──────────────────────────────
    this.platformGroup = this.physics.add.staticGroup();
    const PLAT_H = 40;
    this.cfg.platforms.forEach(([px, py, tiles]) => {
      const w = tiles * TILE_SIZE;
      // Physics zone — top edge at py
      const zone = this.add.zone(px + w/2, py + PLAT_H/2, w, PLAT_H);
      this.physics.add.existing(zone, true);
      this.platformGroup.add(zone);
      // Visual: platform tiles
      for (let t = 0; t < tiles; t++) {
        this.add.image(px + t * TILE_SIZE + TILE_SIZE/2, py + PLAT_H/2, 'tile_platform')
          .setDisplaySize(TILE_SIZE, PLAT_H).setDepth(1);
      }
    });

    // ── Coins ────────────────────────────────────────────────────────────────
    this.coinGroup = this.physics.add.group();
    this.cfg.coins.forEach(([cx, cy]) => {
      const coin = this.coinGroup.create(cx, cy, 'coin_1');
      coin.setDisplaySize(32, 32).setOrigin(0.5).setDepth(2);
      coin.body.allowGravity = false;
      coin.body.setSize(32, 32);
      coin.play('coin_spin');
    });

    // ── Schorlen ─────────────────────────────────────────────────────────────
    this.schorleGroup = this.physics.add.group();
    this.cfg.schorleX.forEach(sx => {
      const s = this.schorleGroup.create(sx, GROUND_Y - 32, 'schorle');
      s.setDisplaySize(44, 58).setOrigin(0.5, 1).setDepth(2);
      s.body.allowGravity = false;
      s.body.setSize(36, 52).setOffset(4, 6);
      s._baseY = GROUND_Y - 32;
      s._bobT  = 0;
    });

    // ── Flag ─────────────────────────────────────────────────────────────────
    const fx = this.cfg.flagX;
    const flagGfx = this.add.graphics().setDepth(2);
    flagGfx.fillStyle(0x888888); flagGfx.fillRect(fx, GROUND_Y - 200, 8, 200);
    flagGfx.fillStyle(0xdd2222);
    flagGfx.fillTriangle(fx+8, GROUND_Y-200, fx+8, GROUND_Y-140, fx+68, GROUND_Y-170);
    this.flagZone = this.add.rectangle(fx + 34, GROUND_Y - 100, 68, 200);
    this.physics.add.existing(this.flagZone, true);

    // ── Enemies ───────────────────────────────────────────────────────────────
    this.enemyGroup = this.physics.add.group();

    // ── Animations ───────────────────────────────────────────────────────────
    this._createAnimations();

    // ── Player ───────────────────────────────────────────────────────────────
    this.player = this.physics.add.sprite(100, GROUND_Y - 2, 'apfel_small_1');
    this.player.setOrigin(0, 1).setDepth(3);
    this.player.setMaxVelocity(800, TERM_VEL);
    this._applyStateSize();

    // ── Colliders & overlaps ──────────────────────────────────────────────────
    this.physics.add.collider(this.player, this.groundGroup);
    // Platforms: one-way — only collide when falling onto the top surface
    this.physics.add.collider(this.player, this.platformGroup, null,
      (player, plat) => player.body.velocity.y >= 0 && player.body.bottom <= plat.body.top + 10,
      this
    );
    this.physics.add.overlap(this.player, this.coinGroup,    this._onCoin,    null, this);
    this.physics.add.overlap(this.player, this.schorleGroup, this._onSchorle, null, this);
    this.physics.add.overlap(this.player, this.enemyGroup,   this._onEnemy,   null, this);
    this.physics.add.overlap(this.player, this.flagZone,     this._onFlag,    null, this);

    // ── Camera ───────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, this.cfg.levelWidth, H);
    this.cameras.main.startFollow(this.player, false, 1, 0);

    // ── Input ─────────────────────────────────────────────────────────────────
    this.input.on('pointerdown', this._onPointerDown, this);
    this.input.on('pointerup',   this._onPointerUp,   this);

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
    def('apfel_small_run',
      [1,2,3,4].map(i => ({ key: `apfel_small_${i}` })), 10);
    ['full','half','empty'].forEach(v =>
      def(`apfel_large_${v}_run`,
        [1,2,3,4,5,6,7].map(i => ({ key: `apfel_large_${v}_${i}` })), 10));
    def('elw_walk',
      [{ key:'elw_1'},{ key:'elw_2'},{ key:'elw_3'},{ key:'elw_2'}], 6);
    def('coin_spin',
      [{ key:'coin_1'},{ key:'coin_2'},{ key:'coin_1'}], 5);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  _onPointerDown() {
    if (this._gameOver) return;
    if (this.player.body.blocked.down) {
      this.player.setVelocityY(BASE_JUMP);
      this.holdTime = 0;
    }
    this.tapHeld = true;
  }

  _onPointerUp() { this.tapHeld = false; }

  // ── Overlap callbacks ─────────────────────────────────────────────────────

  _onCoin(player, coin) {
    coin.destroy();
    this.coinsCollected++;
  }

  _onSchorle(player, schorle) {
    schorle.destroy();
    this.apfelState = 'largeFull';
    this.stateTimer = STATE_DUR;
    this._applyStateSize();
  }

  _onEnemy(player, enemy) {
    if (this.invTimer > 0) return;

    // Stomp: Spieler fällt von oben auf den Feind
    const stomping = player.body.velocity.y > 20
                  && player.body.bottom < enemy.body.top + 28;
    if (stomping) {
      enemy.destroy();
      this.player.setVelocityY(-300); // kleiner Absprung nach Stomp
      return;
    }

    // Von der Seite getroffen → Zustand verschlechtern
    const order = ['small','largeEmpty','largeHalf','largeFull'];
    const idx = order.indexOf(this.apfelState);
    if (idx <= 0) { this._die(); return; }
    this.apfelState = order[idx - 1];
    this.stateTimer = this.apfelState === 'small' ? 0 : STATE_DUR;
    this.invTimer   = INVINCE_DUR;
    this.flickerT   = 0;
    this._applyStateSize();
  }

  _onFlag() {
    if (this._flagTriggered || this._gameOver) return;
    this._flagTriggered = true;
    this.input.off('pointerdown'); this.input.off('pointerup');
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
    const bw = Math.round(w * 0.72);
    const bh = Math.round(h * 0.88);
    const ox = Math.round(w * 0.14);
    const oy = Math.round(h * 0.12);

    this.player.setDisplaySize(w, h);
    this.player.setOrigin(0, 1);
    this.player.y = feetY;
    this.player.body.setSize(bw, bh);
    this.player.body.setOffset(ox, oy);

    // Sofortiges Sync der Physik-Body-Position (verhindert 1-Frame-Glitch beim Größenwechsel)
    this.player.body.x = this.player.x + ox;
    this.player.body.y = feetY - h + oy;

    const animMap = {
      small:      'apfel_small_run',
      largeFull:  'apfel_large_full_run',
      largeHalf:  'apfel_large_half_run',
      largeEmpty: 'apfel_large_empty_run',
    };
    this.player.play(animMap[this.apfelState], true);
  }

  _die() {
    if (this._gameOver) return;
    this._gameOver = true;
    this.tapHeld = false;
    this.input.off('pointerdown'); this.input.off('pointerup');
    this.player.setVelocityX(0);
    this.player.setVelocityY(-250);
    this.player.setTint(0xff4444);
    this.time.delayedCall(1400, () => {
      this.scene.stop('HudScene');
      this.scene.start('GameOverScene', { level: this.levelIdx, totalCoins: this.totalCoins });
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(time, delta) {
    if (this._gameOver) return;
    const dt = delta / 1000;

    // Auto-run
    this.player.setVelocityX(this.cfg.scrollSpeed);

    // Hold-boost while in air
    if (this.tapHeld && !this.player.body.blocked.down) {
      this.holdTime += dt;
      if (this.holdTime < MAX_HOLD) {
        this.player.body.velocity.y = Math.max(
          this.player.body.velocity.y + HOLD_BOOST * dt,
          BASE_JUMP
        );
      }
    }

    // Fall death
    if (this.player.y > 1200) { this._die(); return; }

    // Power-up timer downgrade
    if (this.apfelState !== 'small') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        const down = { largeFull:'largeHalf', largeHalf:'largeEmpty', largeEmpty:'small' };
        this.apfelState = down[this.apfelState];
        this.stateTimer = this.apfelState === 'small' ? 0 : STATE_DUR;
        this._applyStateSize();
      }
    }

    // Invincibility flicker
    if (this.invTimer > 0) {
      this.invTimer -= dt;
      this.flickerT += dt;
      this.player.setAlpha(Math.floor(this.flickerT * 10) % 2 === 0 ? 1 : 0.15);
      if (this.invTimer <= 0) this.player.setAlpha(1);
    }

    // Enemy spawn
    while (
      this.nextEnemyIdx < this.cfg.enemyX.length &&
      this.cfg.enemyX[this.nextEnemyIdx] < this.player.x + 900
    ) {
      const ex = this.cfg.enemyX[this.nextEnemyIdx++];
      if (ex > this.player.x - 100) {
        const e = this.enemyGroup.create(ex, GROUND_Y, 'elw_1');
        e.setOrigin(0.5, 1).setDisplaySize(56, 64).setDepth(3).setFlipX(true);
        e.body.allowGravity = false;
        e.body.setSize(40, 56).setOffset(8, 8);
        e.setVelocityX(-80);
        e.play('elw_walk');
      }
    }

    // Enemy cleanup
    this.enemyGroup.getChildren().forEach(e => {
      if (e.x < this.cameras.main.scrollX - 300) e.destroy();
    });

    // Schorle bob
    this.schorleGroup.getChildren().forEach(s => {
      s._bobT = (s._bobT || 0) + dt;
      s.y = s._baseY + Math.sin(s._bobT * 2) * 6;
      s.body.reset(s.x, s.y);
    });

    // Parallax
    const scrollX = this.cameras.main.scrollX;
    this.bgSprite.tilePositionX = scrollX * 0.2;
    this.fgSprite.tilePositionX = scrollX * 0.5;
  }
}
