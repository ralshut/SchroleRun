const GROUND_Y    = 704;
const TILE_SIZE   = 64;
const BASE_JUMP   = -420;
const HOLD_BOOST  = -350;
const MAX_HOLD    = 0.4;
const TERM_VEL    = 700;

// ── Schorle-Treibstoff = Vorsprung vor Julia ───────────────────────────────
// Voll = Apfel groß & schnell, bleibt ihr voraus. Leer = klein & langsam,
// er fällt zum linken Bildrand zurück, wo Julia ihn schnappt.
const FUEL_START      = 0.9;
const FUEL_DRAIN      = 0.05;    // pro Sekunde
const ENEMY_FUEL_HIT  = 0.30;    // Treffer kostet ~eine Stufe
const INVINCE_DUR     = 0.6;

// Lauftempo = scrollSpeed · (FUEL_BASE + FUEL_GAIN·fuel).
// Gleichgewicht (Tempo = Welt) liegt bei halbem Pegel: über der Hälfte
// gewinnt Apfel Boden, darunter fällt er zu Julia zurück.
const FUEL_BASE = 0.60;
const FUEL_GAIN = 0.80;

// ── Verfolgung ─────────────────────────────────────────────────────────────
const JULIA_SCREEN_X     = 26;   // Julias Ruheposition am linken Rand
const JULIA_INTRO        = 1.6;   // Sekunden, in denen sie ins Bild läuft
const CATCH_DIST         = 54;    // erwischt, wenn Apfels linke Kante näher
// Apfel darf höchstens bis zur Bildmitte vorlaufen – sonst sieht man die
// kommenden Löcher zu spät und fällt sofort rein.
const PLAYER_MAX_SCREEN_X = 225;  // = W/2
const PLAYER_START_X      = 200;  // komfortabler Startabstand zu Julia

// ── Sprung-Komfort ─────────────────────────────────────────────────────────
const COYOTE      = 0.10;   // Gnadenfrist nach Verlassen des Bodens
const JUMP_BUFFER = 0.13;   // gepufferter Tap kurz vor der Landung

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
    this.apfelState     = 'largeFull';
    this.fuel           = FUEL_START;
    this.invTimer       = 0;
    this.flickerT       = 0;
    this.coinsCollected = 0;
    this.tapHeld        = false;
    this.holdTime       = 0;
    this.nextEnemyIdx   = 0;
    this._dying         = false;

    // Verfolgungs-/Autoscroll-Zustand
    this.coyoteTimer    = 0;
    this.jumpBuffer     = 0;
    this.juliaIntroT    = 0;

    const W = 450, H = 800;
    this.worldScroll = 0;
    this.maxScroll   = Math.max(0, this.cfg.levelWidth - W);

    const theme = this.cfg.tileTheme ?? 'grass';

    // ── Backgrounds ──────────────────────────────────────────────────────────
    this.bgSprite = this.add.tileSprite(W/2, H/2, W, H, this.cfg.bgKey)
      .setScrollFactor(0).setDepth(-2);
    this.fgSprite = this.add.tileSprite(W/2, H/2, W, H, this.cfg.fgKey)
      .setScrollFactor(0).setDepth(-1);

    // ── Ground ────────────────────────────────────────────────────────────────
    this.groundGroup = this.physics.add.staticGroup();
    this.cfg.ground.forEach(([gx, tiles]) => {
      const w = tiles * TILE_SIZE;
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
        if (i === 0)            platKey = `terrain_${theme}_horizontal_left`;
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

    // ── Decorations ───────────────────────────────────────────────────────────
    this.cfg.ground.forEach(([gx, tiles]) => {
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
    this.player = this.physics.add.sprite(PLAYER_START_X, GROUND_Y, 'apfel_large_full_1');
    this.player.setOrigin(0, 1).setDepth(3);
    this.player.setMaxVelocity(800, TERM_VEL);
    this.player.body.setCollideWorldBounds(false);
    this._applyStateSize();

    // ── Julia – die Verfolgerin ────────────────────────────────────────────────
    // Läuft von links ins Bild und bleibt dann am linken Rand.
    this.julia = this.add.image(-80, GROUND_Y, 'julia')
      .setOrigin(0.5, 1).setDepth(4);
    // Nicht größer als Apfel (groß = 90px hoch); Breite proportional (300×1125)
    const jh = 84;
    this.julia.setDisplaySize(jh * 300 / 1125, jh);

    // ── Colliders & overlaps ──────────────────────────────────────────────────
    this.physics.add.collider(this.player, this.groundGroup);
    this.physics.add.collider(this.player, this.platformGroup, null,
      (player, plat) => player.body.velocity.y >= 0 && player.body.bottom <= plat.body.top + 10,
      this
    );
    this.physics.add.overlap(this.player, this.coinGroup,    this._onCoin,    null, this);
    this.physics.add.overlap(this.player, this.schorleGroup, this._onSchorle, null, this);
    this.physics.add.overlap(this.player, this.enemyGroup,   this._onEnemy,   null, this);

    // ── Camera (Autoscroll – folgt NICHT dem Spieler) ──────────────────────────
    this.cameras.main.setBounds(0, 0, this.cfg.levelWidth, H);
    this.cameras.main.scrollX = 0;

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

    // ── Level title + Untertitel ───────────────────────────────────────────────
    const titleTxt = this.add.text(W/2, 320, this.cfg.title, {
      fontFamily: 'Georgia, serif', fontSize: '30px', fontStyle: 'bold',
      color: '#ffd54f', stroke: '#000', strokeThickness: 6, align: 'center',
      wordWrap: { width: 420 },
    }).setScrollFactor(0).setOrigin(0.5).setDepth(10);
    const subTxt = this.add.text(W/2, 366, this.cfg.subtitle ?? '', {
      fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'italic',
      color: '#ffffff', stroke: '#000', strokeThickness: 4, align: 'center',
      wordWrap: { width: 420 },
    }).setScrollFactor(0).setOrigin(0.5).setDepth(10);
    this.tweens.add({
      targets: [titleTxt, subTxt], alpha: 0, delay: 2000, duration: 800,
      onComplete: () => { titleTxt.destroy(); subTxt.destroy(); },
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
    // Sprung puffern – die eigentliche Auslösung passiert in update(), sobald
    // Coyote-Zeit + Puffer zusammenpassen. Das verhindert verschluckte Sprünge.
    this.jumpBuffer = JUMP_BUFFER;
    this.tapHeld = true;
  }

  _onPointerUp() { this.tapHeld = false; }

  _tryJump() {
    if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
      this.player.setVelocityY(BASE_JUMP);
      this.holdTime    = 0;
      this.jumpBuffer  = 0;
      this.coyoteTimer = 0;
      this.sound.play('sfx_jump', { volume: 0.6 });
    }
  }

  // ── Overlap callbacks ─────────────────────────────────────────────────────

  _onCoin(player, coin) {
    coin.destroy();
    this.coinsCollected++;
    this.sound.play('sfx_coin', { volume: 0.7 });
  }

  _onSchorle(player, schorle) {
    schorle.destroy();
    // Schorle füllt den Vorsprung wieder voll auf.
    this.fuel = 1;
    this.invTimer = Math.max(this.invTimer, 0.2);
    this._refreshStateFromFuel(true);
    this.sound.play('sfx_magic', { volume: 0.8 });
  }

  _onEnemy(player, enemy) {
    if (this.invTimer > 0 || this._dying) return;

    // Stomp: von oben drauf – Gegner besiegt, kein Schaden.
    if (player.body.velocity.y > 20 && player.body.bottom <= enemy.body.top + 24) {
      enemy.destroy();
      this.player.setVelocityY(-300);
      this.sound.play('sfx_bump', { volume: 0.8 });
      return;
    }

    // Seitlicher Treffer: kostet Schorle-Vorsprung und schubst Richtung Julia.
    this.fuel = Math.max(0, this.fuel - ENEMY_FUEL_HIT);
    this.player.x -= 30;
    this.invTimer = INVINCE_DUR;
    this.flickerT = 0;
    this._refreshStateFromFuel(true);
    this.sound.play('sfx_hurt', { volume: 0.9 });
  }

  // ── State / size ──────────────────────────────────────────────────────────

  _stateFromFuel(f) {
    if (f > 0.66) return 'largeFull';
    if (f > 0.40) return 'largeHalf';
    if (f > 0.12) return 'largeEmpty';
    return 'small';
  }

  // Leitet den Sicht-/Größenzustand aus dem Schorle-Pegel ab. Nur bei echtem
  // Wechsel wird die Animation neu gestartet (force=true erzwingt es z. B.
  // nach einem Schorle-Pickup).
  _refreshStateFromFuel(force = false) {
    const ns = this._stateFromFuel(this.fuel);
    if (ns !== this.apfelState || force) {
      this.apfelState = ns;
      this._applyStateSize();
    }
  }

  _applyStateSize() {
    const animMap = {
      largeFull:  'apfel_large_full_run',
      largeHalf:  'apfel_large_half_run',
      largeEmpty: 'apfel_large_empty_run',
      small:      'apfel_small_run',
    };
    this.player.play(animMap[this.apfelState], true);
    this._lockPlayerSize();
  }

  // Sperrt Anzeigegröße UND Physik-Body jeden Frame – die Apfel-Frames haben
  // unterschiedliche Quellgrößen; durch setDisplaySize(w,h) je Frame kürzt
  // sich die Skalierung in der Body-Rechnung exakt weg (Body-Höhe = 0.86·h).
  _lockPlayerSize() {
    const { w, h } = (this.apfelState !== 'small') ? APFEL_LARGE : APFEL_SMALL;
    this.player.setDisplaySize(w, h);
    this.player.setOrigin(0, 1);
    const fw = this.player.frame.realWidth;
    const fh = this.player.frame.realHeight;
    this.player.body.setSize(fw * 0.72, fh * 0.86, false);
    this.player.body.setOffset(fw * 0.14, fh * 0.10);
  }

  // ── Verlieren / Gewinnen ────────────────────────────────────────────────────

  _caught() {
    if (this._gameOver) return;
    this._gameOver = true;
    this._dying    = true;
    this._removeInput();
    this.player.setVelocityX(0);
    this.sound.play('sfx_hurt', { volume: 0.9 });
    this.time.delayedCall(900, () => {
      this.scene.stop('HudScene');
      this.scene.start('GameOverScene', {
        level: this.levelIdx,
        totalCoins: this.totalCoins + this.coinsCollected,
        reason: 'caught',
      });
    });
  }

  _fell() {
    if (this._gameOver) return;
    this._gameOver = true;
    this._dying    = true;
    this._removeInput();
    this.player.setVelocityX(0);
    this.player.setTint(0xff4444);
    this.sound.play('sfx_disappear', { volume: 0.9 });
    this.time.delayedCall(1100, () => {
      this.scene.stop('HudScene');
      this.scene.start('GameOverScene', {
        level: this.levelIdx,
        totalCoins: this.totalCoins + this.coinsCollected,
        reason: 'fell',
      });
    });
  }

  _win() {
    if (this._flagTriggered || this._gameOver) return;
    this._flagTriggered = true;
    this._removeInput();
    this.flagSprite.play('flag_wave');
    this.time.delayedCall(500, () => {
      this.scene.stop('HudScene');
      this.scene.start('WinScene', {
        level: this.levelIdx,
        coinsThisLevel: this.coinsCollected,
        totalCoins: this.totalCoins + this.coinsCollected,
      });
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
    if (this._gameOver) {
      this._lockPlayerSize();
      return;
    }
    const dt = delta / 1000;

    // Größe/Body jeden Frame sperren (Frame-Quellgrößen schwanken).
    this._lockPlayerSize();

    // ── Autoscroll: Welt zieht mit konstantem Tempo nach rechts ──────────────
    this.worldScroll = Math.min(this.worldScroll + this.cfg.scrollSpeed * dt, this.maxScroll);
    this.cameras.main.scrollX = this.worldScroll;

    // ── Schorle-Pegel sinkt stetig; Größe/Tempo folgen ───────────────────────
    this.fuel = Math.max(0, this.fuel - FUEL_DRAIN * dt);
    this._refreshStateFromFuel();

    // Lauftempo abhängig vom Schorle-Vorsprung: voll → schneller als die Welt
    // (gewinnt Boden), leer → langsamer (fällt nach links zu Julia zurück).
    const factor = FUEL_BASE + FUEL_GAIN * this.fuel;
    this.player.setVelocityX(this.cfg.scrollSpeed * factor);

    // Coyote-Zeit + gepufferter Sprung
    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    this.coyoteTimer = onGround ? COYOTE : Math.max(0, this.coyoteTimer - dt);
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    this._tryJump();

    // Hold-boost in der Luft
    if (this.tapHeld && !onGround) {
      this.holdTime += dt;
      if (this.holdTime < MAX_HOLD) {
        this.player.body.velocity.y = Math.max(
          this.player.body.velocity.y + HOLD_BOOST * dt, BASE_JUMP
        );
      }
    }

    // Apfel darf nicht aus dem rechten Bildrand laufen
    const screenX = this.player.x - this.worldScroll;
    if (screenX > PLAYER_MAX_SCREEN_X) {
      this.player.x = this.worldScroll + PLAYER_MAX_SCREEN_X;
      if (this.player.body.velocity.x > this.cfg.scrollSpeed)
        this.player.setVelocityX(this.cfg.scrollSpeed);
    }

    // ── Julia: erst ins Bild laufen, dann am linken Rand bleiben ──────────────
    this.juliaIntroT += dt;
    let jsx = JULIA_SCREEN_X;
    if (this.juliaIntroT < JULIA_INTRO)
      jsx = Phaser.Math.Linear(-80, JULIA_SCREEN_X, this.juliaIntroT / JULIA_INTRO);
    this.julia.x = this.worldScroll + jsx;
    this.julia.y = GROUND_Y + Math.sin(time / 110) * 4;

    // Erwischt? (erst wenn sie wirklich im Bild ist)
    if (this.juliaIntroT >= JULIA_INTRO && (this.player.x - this.worldScroll) < CATCH_DIST) {
      this._caught();
      return;
    }

    // Absturz in eine Lücke
    if (this.player.y > 1100) { this._fell(); return; }

    // Ziel erreicht → Prüfung bestanden
    if (this.worldScroll >= this.maxScroll - 1) { this._win(); return; }

    // ── Unverwundbarkeits-Flackern ───────────────────────────────────────────
    if (this.invTimer > 0) {
      this.invTimer -= dt;
      this.flickerT += dt;
      this.player.setAlpha(Math.floor(this.flickerT * 10) % 2 === 0 ? 1 : 0.25);
      if (this.invTimer <= 0) this.player.setAlpha(1);
    }

    // ── Feinde spawnen ───────────────────────────────────────────────────────
    while (
      this.nextEnemyIdx < this.cfg.enemyX.length &&
      this.cfg.enemyX[this.nextEnemyIdx] < this.worldScroll + 900
    ) {
      const ex = this.cfg.enemyX[this.nextEnemyIdx++];
      if (ex > this.worldScroll - 100) {
        const e = this.enemyGroup.create(ex, GROUND_Y + 3, 'elw_1');
        e.setOrigin(0.5, 1).setDisplaySize(56, 64).setDepth(3).setFlipX(true);
        e.body.allowGravity = false;
        e.body.setSize(40, 56);
        e.setVelocityX(-80);
        e.play('elw_walk');
      }
    }
    this.enemyGroup.getChildren().forEach(e => {
      if (e.x < this.worldScroll - 300) e.destroy();
    });

    // ── Schorle-Bob ──────────────────────────────────────────────────────────
    this.schorleGroup.getChildren().forEach(s => {
      s._bobT = (s._bobT || 0) + dt;
      s.y = s._baseY + Math.sin(s._bobT * 2) * 6;
      s.body.reset(s.x, s.y);
    });

    // ── Parallax ─────────────────────────────────────────────────────────────
    this.bgSprite.tilePositionX = this.worldScroll * 0.2;
    this.fgSprite.tilePositionX = this.worldScroll * 0.5;
  }
}
