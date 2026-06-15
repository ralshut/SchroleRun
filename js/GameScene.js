const GROUND_Y    = 704;
const TILE_SIZE   = 64;
const BASE_JUMP   = -520;   // mehr Sprungkraft (war -420)
const HOLD_BOOST  = -380;
const MAX_HOLD    = 0.42;
const TERM_VEL    = 760;

// ── Schorle-Treibstoff = Vorsprung vor Julia ───────────────────────────────
// Apfel startet KLEIN (wenig fuel). Schorle füllt voll auf → er wächst und
// zieht davon. Ohne Schorle verliert er EXPONENTIELL an Tempo (erst schnell,
// dann langsamer) und fällt zu Julia zurück.
const FUEL_START   = 0.12;   // klein zu Beginn
const FUEL_DRAIN_K = 0.15;   // exponentieller Zerfall pro Sekunde (Standard)
const ENEMY_FUEL_HIT = 0.30;
const INVINCE_DUR  = 0.6;

// Lauftempo = scrollSpeed · (FUEL_BASE + FUEL_GAIN·fuel). Gleichgewicht bei
// halbem Pegel: darüber gewinnt Apfel Boden, darunter fällt er zurück.
const FUEL_BASE = 0.60;
const FUEL_GAIN = 0.80;

// ── Verfolgung ─────────────────────────────────────────────────────────────
const JULIA_SCREEN_X     = 26;
const JULIA_INTRO        = 1.6;
const CATCH_DIST         = 54;
const PLAYER_MAX_SCREEN_X = 225;  // höchstens bis Bildmitte (W/2) vorlaufen
const PLAYER_START_X      = 240;

// ── Sprung-Komfort ─────────────────────────────────────────────────────────
const COYOTE      = 0.10;
const JUMP_BUFFER = 0.13;

const APFEL_SMALL = { w: 56, h: 70 };
const APFEL_LARGE = { w: 72, h: 90 };

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create(data) {
    this.levelIdx       = data.level ?? 0;
    this.totalCoins     = data.totalCoins ?? 0;
    this.cfg            = LEVELS[this.levelIdx];
    this.mode           = this.cfg.mode ?? 'run';
    this.drainK         = this.cfg.drain ?? FUEL_DRAIN_K;
    this._gameOver      = false;
    this._flagTriggered = false;
    this.apfelState     = 'small';
    this.fuel           = FUEL_START;
    this.invTimer       = 0;
    this.flickerT       = 0;
    this.coinsCollected = 0;
    this.tapHeld        = false;
    this.holdTime       = 0;
    this.nextEnemyIdx   = 0;
    this._dying         = false;

    this.coyoteTimer    = 0;
    this.jumpBuffer     = 0;
    this.juliaIntroT    = 0;

    // Interaktions-Pause (Quiz / Versuchung)
    this._pause       = false;
    this._quizActive  = false;
    this._quizDone    = false;
    this._tempActive  = false;
    this._tempDone    = false;

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

    // ── Schorlen ([x,y]-Paare) ─────────────────────────────────────────────────
    this.schorleGroup = this.physics.add.group();
    (this.cfg.schorle || []).forEach(([sx, sy]) => {
      const s = this.schorleGroup.create(sx, sy, 'schorle');
      s.setDisplaySize(56, 74).setOrigin(0.5, 1).setDepth(2);
      s.body.allowGravity = false;
      s.body.setSize(46, 62);
      s._baseY = sy;
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
    this.player = this.physics.add.sprite(PLAYER_START_X, GROUND_Y, 'apfel_small_1');
    this.player.setOrigin(0, 1).setDepth(3);
    this.player.setMaxVelocity(800, TERM_VEL);
    this.player.body.setCollideWorldBounds(false);
    this._applyStateSize();

    // ── Kampfstern (nur Jugger) ────────────────────────────────────────────────
    if (this.mode === 'jugger') {
      this.chainGfx = this.add.graphics().setDepth(2);
      this.star = this.add.image(this.player.x, GROUND_Y - 40, 'kampfstern')
        .setDisplaySize(34, 34).setDepth(4);
      this._swinging = false;   // gerade im Schwung?
      this._swingT   = 0;       // Fortschritt im Schwung
      this._swingCD  = 0;       // Abklingzeit bis zum nächsten Schwung
    }

    // ── Julia – die Verfolgerin ────────────────────────────────────────────────
    this.julia = this.add.image(-80, GROUND_Y, 'julia')
      .setOrigin(0.5, 1).setDepth(4);
    const jh = 82;
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

    // ── Camera (Autoscroll) ────────────────────────────────────────────────────
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

    // ── Musik ─────────────────────────────────────────────────────────────────
    this._bgMusic = this.sound.add('music_levels', { loop: true, volume: 0.55 });
    this._bgMusic.play();
    this.events.once('shutdown', () => {
      this._bgMusic.stop();
      if (this._fightMusic) { this._fightMusic.stop(); this._fightMusic = null; }
    });

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
    // Pokahontas-Tanz: 5 Bekleidungs-Stufen × 4 Lauf-Frames → Tanz-Loop
    for (let lvl = 0; lvl <= 4; lvl++)
      def(`poka_dance_${lvl}`, [1,2,3,4].map(fn => ({ key:`pokahontas_d${lvl}_${fn}` })), 8);
    if (!this.anims.exists('flag_wave'))
      this.anims.create({ key:'flag_wave', frames:[{ key:'flag_red_a'},{ key:'flag_red_b'}], frameRate:5, repeat:-1 });
  }

  // ── Input-Router ────────────────────────────────────────────────────────────

  _onPointerDown(pointer) {
    if (this._gameOver || this._dying) return;
    if (this._quizActive) return;            // Quiz-Buttons regeln das selbst
    if (this._tempActive) {                  // während Versuchung: nur Springen erlaubt
      this.jumpBuffer = JUMP_BUFFER;
      this.tapHeld = true;
      return;
    }
    if (this.mode === 'jugger') { this._startSwing(); return; }
    // Lauf-Modus: Sprung puffern
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

  // ── Jugger: Kette schleudern ────────────────────────────────────────────────
  // Tippen löst EINEN Bogen-Schwung aus. Nur während der Schwung den Stern nach
  // vorn führt, trifft er. In Ruhe hängt der Stern HINTER Apfel – Dauerdrücken
  // hilft nicht, und es gibt eine Abklingzeit gegen Spammen.
  _startSwing() {
    if (this._swinging || this._swingCD > 0) return;
    this._swinging = true;
    this._swingT   = 0;
    this.sound.play('sfx_bump', { volume: 0.6 });
  }

  // Trifft der Stern an (sx,sy) einen Gegner? Zerschlägt ihn; sammelt auch
  // Schorle ein. Läuft in update() (vor dem Physik-Schritt) – sicher.
  _hitWithStar(sx, sy) {
    const R = 46;
    this.enemyGroup.getChildren().slice().forEach(e => {
      if (e.active && Phaser.Math.Distance.Between(sx, sy, e.x, e.body.center.y) < R) {
        e.destroy();
        this.sound.play('sfx_disappear', { volume: 0.5 });
      }
    });
    this.schorleGroup.getChildren().slice().forEach(s => {
      if (s.active && Phaser.Math.Distance.Between(sx, sy, s.x, s.y - 20) < R) {
        s.destroy();
        this.fuel = 1;
        this.sound.play('sfx_magic', { volume: 0.7 });
      }
    });
  }

  // ── Overlap callbacks ─────────────────────────────────────────────────────

  _onCoin(player, coin) {
    coin.destroy();
    this.coinsCollected++;
    this.sound.play('sfx_coin', { volume: 0.7 });
  }

  _onSchorle(player, schorle) {
    schorle.destroy();
    this.fuel = 1;
    // WICHTIG: Größe NICHT hier ändern. Dieser Callback läuft mitten im
    // Physik-Schritt; den Body hier zu vergrößern stört die Boden-Kollision
    // und Apfel fällt durch den Boden. update() lässt ihn im nächsten Frame
    // sauber (vor dem Physik-Schritt) wachsen. Kein Blinken beim Einsammeln.
    this.sound.play('sfx_magic', { volume: 0.8 });
  }

  _onEnemy(player, enemy) {
    if (this.invTimer > 0 || this._dying || this._pause) return;

    // Stomp (nur Lauf-Modus)
    if (this.mode !== 'jugger' &&
        player.body.velocity.y > 20 && player.body.bottom <= enemy.body.top + 24) {
      enemy.destroy();
      this.player.setVelocityY(-300);
      this.sound.play('sfx_bump', { volume: 0.8 });
      return;
    }

    // Treffer: kostet Schorle-Vorsprung und schubst Richtung Julia.
    // Größe ebenfalls erst in update() ändern (nicht im Physik-Schritt).
    this.fuel = Math.max(0, this.fuel - ENEMY_FUEL_HIT);
    if (!this._tempActive) this.player.x -= 30;
    this.invTimer = INVINCE_DUR;
    this.flickerT = 0;
    this.sound.play('sfx_hurt', { volume: 0.9 });
    if (this.mode === 'jugger') enemy.destroy();
  }

  // ── State / size ──────────────────────────────────────────────────────────

  _stateFromFuel(f) {
    if (f > 0.66) return 'largeFull';
    if (f > 0.40) return 'largeHalf';
    if (f > 0.12) return 'largeEmpty';
    return 'small';
  }

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

  _lockPlayerSize() {
    const { w, h } = (this.apfelState !== 'small') ? APFEL_LARGE : APFEL_SMALL;
    this.player.setDisplaySize(w, h);
    this.player.setOrigin(0, 1);
    const fw = this.player.frame.realWidth;
    const fh = this.player.frame.realHeight;
    this.player.body.setSize(fw * 0.72, fh * 0.86, false);
    this.player.body.setOffset(fw * 0.14, fh * 0.10);
  }

  // ── Brücken-Quiz ────────────────────────────────────────────────────────────

  _startQuiz() {
    this._quizActive = true;
    this._pause = true;
    this.player.setVelocity(0, 0);
    this.tapHeld = false;

    // Brückenwächter (kleines Männchen) auf der Brücke
    this._waechter = this.add.image(this.player.x + 150, GROUND_Y, 'apfel_small_1')
      .setOrigin(0.5, 1).setDisplaySize(48, 60).setDepth(3)
      .setFlipX(true).setTint(0x88dd88);

    const W = 450;
    const q = this.cfg.quiz;
    const ui = [];
    const dim = this.add.rectangle(W/2, 400, W, 800, 0x000000, 0.55)
      .setScrollFactor(0).setDepth(20);
    ui.push(dim);

    // Frage fällt von oben
    const qTxt = this.add.text(W/2, -60, q.question, {
      fontFamily: 'Georgia, serif', fontSize: '21px', fontStyle: 'bold',
      color: '#ffd54f', stroke: '#000', strokeThickness: 5, align: 'center',
      wordWrap: { width: 410 },
    }).setScrollFactor(0).setOrigin(0.5).setDepth(21);
    ui.push(qTxt);
    this.tweens.add({ targets: qTxt, y: 150, duration: 700, ease: 'Bounce.easeOut' });

    q.options.forEach((opt, i) => {
      const y = 300 + i * 78;
      const bg = this.add.rectangle(W/2, y, 380, 60, 0x3b2a55, 0.95)
        .setStrokeStyle(3, 0xffd54f).setScrollFactor(0).setDepth(21)
        .setInteractive({ useHandCursor: true });
      const tx = this.add.text(W/2, y, opt, {
        fontFamily: 'Arial, sans-serif', fontSize: '20px', fontStyle: 'bold',
        color: '#ffffff', align: 'center', wordWrap: { width: 360 },
      }).setScrollFactor(0).setOrigin(0.5).setDepth(22);
      bg.on('pointerover', () => bg.setFillStyle(0x5a4080, 0.95));
      bg.on('pointerout',  () => bg.setFillStyle(0x3b2a55, 0.95));
      bg.on('pointerdown', () => this._answerQuiz(i));
      ui.push(bg, tx);
    });

    this._quizUI = ui;
  }

  _answerQuiz(idx) {
    if (!this._quizActive) return;
    const correct = idx === this.cfg.quiz.correct;
    this._quizActive = false;
    this._quizUI.forEach(o => o.destroy());
    if (this._waechter) { this._waechter.destroy(); this._waechter = null; }

    if (correct) {
      this._quizDone = true;
      this._pause = false;
      this.sound.play('sfx_magic', { volume: 0.8 });
      const t = this.add.text(225, 200, 'Richtig! Weiter geht\'s!', {
        fontFamily: 'Georgia, serif', fontSize: '26px', fontStyle: 'bold',
        color: '#88ff88', stroke: '#000', strokeThickness: 5,
      }).setScrollFactor(0).setOrigin(0.5).setDepth(22);
      this.time.delayedCall(900, () => t.destroy());
    } else {
      // Schorle ergießt sich über Apfel → Level verloren
      this.sound.play('sfx_hurt', { volume: 0.9 });
      const splash = this.add.image(this.player.x + 8, GROUND_Y - 260, 'schorle')
        .setOrigin(0.5, 1).setDisplaySize(70, 92).setDepth(12);
      this.tweens.add({
        targets: splash, y: GROUND_Y - 40, duration: 600, ease: 'Quad.easeIn',
        onComplete: () => {
          this.player.setTint(0x66aaff);
          this._lose('quiz');
        },
      });
    }
  }

  // ── Prüfung des Willens: Pokahontas ─────────────────────────────────────────

  _startTemptation() {
    this._tempActive  = true;
    this._clothes     = 4;
    this._tempWaveCount = 0;
    this._tempScrollX = this.worldScroll;   // Scroll einfrieren
    this.julia.setVisible(false);

    // Kampfmusik statt Level-Musik
    this._bgMusic.stop();
    this._fightMusic = this.sound.add('music_fight', { loop: true, volume: 0.7 });
    this._fightMusic.play();

    // Apfel weiter links positionieren (mehr Platz zum Kämpfen)
    this.player.x = this._tempScrollX + 90;
    this.player.setVelocity(0, 0);
    this.tapHeld = false;

    // Erhöhte Plattform für Pokahontas – Monsterchen laufen darunter durch
    const pokaX  = this._tempScrollX + 290;
    const platTop = GROUND_Y - 155;
    this._pokaPlat = this.add.rectangle(pokaX, platTop, 170, 22, 0x7a5c2e)
      .setOrigin(0.5, 1).setDepth(4);

    this._poka = this.add.image(pokaX, platTop, 'pokahontas_4')
      .setOrigin(0.5, 1).setDisplaySize(122, 165).setDepth(5);
    this._pokaDance = this.tweens.add({
      targets: this._poka, angle: { from: -6, to: 6 },
      duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this._tempHint = this.add.text(225, 130,
      'Pokahontas tanzt!\nFür je 5 Dämonen verliert sie ein Kleid …', {
      fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'bold',
      color: '#ffd54f', stroke: '#000', strokeThickness: 5, align: 'center',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(22);

    // Monsterchen mit variablen Abständen (380–1050 ms), 25 insgesamt
    this._tempDrops   = [];
    this._tempWalking = false;
    const spawnNext = () => {
      if (!this._tempActive || this._tempWaveCount >= 25) return;
      this._spawnTempEnemy();
      this._tempWaveTimer = this.time.delayedCall(Phaser.Math.Between(380, 1050), spawnNext);
    };
    this._tempWaveTimer = this.time.delayedCall(500, spawnNext);
  }

  _spawnTempEnemy() {
    if (!this._tempActive) return;
    const e = this.enemyGroup.create(this._tempScrollX + 490, GROUND_Y + 3, 'elw_1');
    e.setOrigin(0.5, 1).setDisplaySize(56, 64).setDepth(3).setFlipX(true);
    e.body.allowGravity = false;
    e.body.setSize(40, 56);
    e.setVelocityX(-130);   // schneller als normal
    e.play('elw_walk');

    this._tempWaveCount++;
    if (this._tempWaveCount % 5 === 0 && this._clothes > 0) {
      this.time.delayedCall(1100, () => this._undressWave());
    }
    // Nach dem 6., 14. und 22. Monster fällt eine Schorle vom Himmel
    if ([6, 14, 22].includes(this._tempWaveCount)) {
      this.time.delayedCall(400, () => this._dropTempSchorle());
    }
  }

  _dropTempSchorle() {
    if (!this._tempActive) return;
    const sx = this._tempScrollX + Phaser.Math.Between(110, 200);
    const s = this.physics.add.image(sx, GROUND_Y - 310, 'schorle')
      .setDisplaySize(56, 74).setDepth(6);
    this.physics.add.collider(s, this.groundGroup);
    this.physics.add.overlap(this.player, s, () => {
      if (s.active) { s.destroy(); this._collectSchorle(); }
    });
    this._tempDrops.push(s);
  }

  _undressWave() {
    if (!this._tempActive || this._clothes <= 0) return;
    this._clothes--;
    this._poka.setTexture(`pokahontas_${this._clothes}`);
    this.sound.play('sfx_coin', { volume: 0.8 });
    if (this._tempHint) {
      this._tempHint.setText(this._clothes > 0
        ? `Weiter kämpfen! Noch ${this._clothes} Kleidungsstück${this._clothes > 1 ? 'e' : ''} …`
        : 'Sie ist nackt! Fast geschafft!');
    }
    if (this._clothes <= 0) {
      if (this._tempWaveTimer) { this._tempWaveTimer.remove(); this._tempWaveTimer = null; }
      this.time.delayedCall(1800, () => this._endTemptation());
    }
  }

  _endTemptation() {
    this.sound.play('sfx_disappear', { volume: 0.8 });
    if (this._pokaDance) this._pokaDance.stop();
    if (this._tempWaveTimer) { this._tempWaveTimer.remove(); this._tempWaveTimer = null; }
    if (this._tempHint) this._tempHint.setText('Bestanden!');
    if (this._tempDrops) { this._tempDrops.forEach(s => s && s.active && s.destroy()); this._tempDrops = []; }

    // Kampfmusik ausblenden, Level-Musik wieder einblenden
    if (this._fightMusic) {
      this.tweens.add({ targets: this._fightMusic, volume: 0, duration: 600,
        onComplete: () => { if (this._fightMusic) { this._fightMusic.stop(); this._fightMusic = null; } } });
    }
    this._bgMusic.play();

    this.tweens.add({
      targets: this._poka, alpha: 0, scaleY: 0, duration: 700,
      onComplete: () => {
        [this._poka, this._pokaPlat, this._tempHint].forEach(o => o && o.destroy());
        this._poka = this._pokaPlat = this._tempHint = null;

        // Apfel läuft langsam nach rechts bevor Julia wiederkommt,
        // damit er nicht sofort gefangen wird
        this._tempWalking = true;
        this.time.delayedCall(1800, () => {
          this._tempWalking = false;
          this._tempActive  = false;
          this._tempDone    = true;
          this.juliaIntroT  = 0;   // Julia läuft frisch von links ein
          this.julia.setVisible(true);
        });
      },
    });
  }

  // ── Verlieren / Gewinnen ────────────────────────────────────────────────────

  _lose(reason) {
    if (this._gameOver) return;
    this._gameOver = true;
    this._dying    = true;
    this._removeInput();
    this.player.setVelocityX(0);
    if (reason === 'fell') {
      this.player.setTint(0xff4444);
      this.sound.play('sfx_disappear', { volume: 0.9 });
    } else if (reason !== 'quiz') {
      this.sound.play('sfx_hurt', { volume: 0.9 });
    }
    this.time.delayedCall(reason === 'fell' ? 1100 : 1000, () => {
      this.scene.stop('HudScene');
      this.scene.start('GameOverScene', {
        level: this.levelIdx,
        totalCoins: this.totalCoins + this.coinsCollected,
        reason,
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
    if (this._gameOver) { this._lockPlayerSize(); return; }
    const dt = delta / 1000;
    this._lockPlayerSize();

    // Während Quiz/Versuchung: alles eingefroren, nur Kamera/Animationen ruhen.
    if (this._pause) {
      this.player.setVelocityX(0);
      this.cameras.main.scrollX = this.worldScroll;
      return;
    }

    // ── Quiz / Versuchung auslösen ───────────────────────────────────────────
    if (this.cfg.quiz && !this._quizDone && !this._quizActive &&
        this.worldScroll >= this.cfg.quiz.x) { this._startQuiz(); return; }
    if (this.cfg.temptation && !this._tempDone && !this._tempActive &&
        this.worldScroll >= this.cfg.temptation.x) { this._startTemptation(); return; }

    // ── Autoscroll (während Versuchung eingefroren) ──────────────────────────
    if (this._tempActive) {
      this.worldScroll = this._tempScrollX;
    } else {
      this.worldScroll = Math.min(this.worldScroll + this.cfg.scrollSpeed * dt, this.maxScroll);
    }
    this.cameras.main.scrollX = this.worldScroll;

    // ── Schorle-Pegel: exponentieller Zerfall (erst schnell, dann langsam) ────
    this.fuel = Math.max(0, this.fuel - this.fuel * this.drainK * dt);
    this._refreshStateFromFuel();

    // Während Versuchung: kein Schorle-Vorrat mehr = verloren
    if (this._tempActive && !this._tempWalking && this.apfelState === 'small') {
      this._lose('caught'); return;
    }

    if (this._tempActive) {
      this.player.setVelocityX(this._tempWalking ? 110 : 0);
    } else {
      const factor = FUEL_BASE + FUEL_GAIN * this.fuel;
      this.player.setVelocityX(this.cfg.scrollSpeed * factor);
    }

    // ── Sprung (nicht im Jugger) ─────────────────────────────────────────────
    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    this.coyoteTimer = onGround ? COYOTE : Math.max(0, this.coyoteTimer - dt);
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.mode !== 'jugger') {
      this._tryJump();
      if (this.tapHeld && !onGround) {
        this.holdTime += dt;
        if (this.holdTime < MAX_HOLD) {
          this.player.body.velocity.y = Math.max(
            this.player.body.velocity.y + HOLD_BOOST * dt, BASE_JUMP
          );
        }
      }
    }

    // ── Kampfstern (Jugger) ──────────────────────────────────────────────────
    if (this.mode === 'jugger') {
      this._updateStar(dt);
    }

    // Nicht über die Bildmitte hinaus
    const screenX = this.player.x - this.worldScroll;
    if (screenX > PLAYER_MAX_SCREEN_X) {
      this.player.x = this.worldScroll + PLAYER_MAX_SCREEN_X;
      if (this.player.body.velocity.x > this.cfg.scrollSpeed)
        this.player.setVelocityX(this.cfg.scrollSpeed);
    }

    // ── Julia (während Versuchung unsichtbar + kein Fang-Check) ─────────────
    if (!this._tempActive) {
      this.juliaIntroT += dt;
      let jsx = JULIA_SCREEN_X;
      if (this.juliaIntroT < JULIA_INTRO)
        jsx = Phaser.Math.Linear(-80, JULIA_SCREEN_X, this.juliaIntroT / JULIA_INTRO);
      this.julia.x = this.worldScroll + jsx;
      this.julia.y = GROUND_Y + Math.sin(time / 110) * 4;

      if (this.juliaIntroT >= JULIA_INTRO && (this.player.x - this.worldScroll) < CATCH_DIST) {
        this._lose('caught'); return;
      }
    }

    if (this.player.y > 1100) { this._lose('fell'); return; }
    if (this.worldScroll >= this.maxScroll - 1) { this._win(); return; }

    // ── Unverwundbarkeits-Flackern ───────────────────────────────────────────
    if (this.invTimer > 0) {
      this.invTimer -= dt;
      this.flickerT += dt;
      this.player.setAlpha(Math.floor(this.flickerT * 10) % 2 === 0 ? 1 : 0.25);
      if (this.invTimer <= 0) this.player.setAlpha(1);
    }

    // ── Feinde ───────────────────────────────────────────────────────────────
    if (!this._tempActive) {
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

  // Kampfstern an einer Kette. In Ruhe hängt er hinten-oben (hinter Apfel).
  // Ein Schwung führt ihn über den Kopf nach vorn-unten – nur dabei trifft er.
  _updateStar(dt) {
    const pivotX = this.player.x + 30;   // Hand/Oberkörper
    const pivotY = GROUND_Y - 56;
    const radius = 76;
    const REST = -150, FRONT = 38;        // Winkel hinten-oben → vorn-unten

    let angDeg;
    if (this._swinging) {
      this._swingT += dt;
      const D = 0.42;
      const p = Math.min(1, this._swingT / D);
      angDeg = Phaser.Math.Linear(REST, FRONT, p);
      const ang = Phaser.Math.DegToRad(angDeg);
      this._hitWithStar(pivotX + Math.cos(ang) * radius, pivotY + Math.sin(ang) * radius);
      if (p >= 1) { this._swinging = false; this._swingCD = 0.28; }
    } else {
      if (this._swingCD > 0) this._swingCD -= dt;
      angDeg = REST;
    }

    const ang = Phaser.Math.DegToRad(angDeg);
    const sx = pivotX + Math.cos(ang) * radius;
    const sy = pivotY + Math.sin(ang) * radius;
    this.star.setPosition(sx, sy).setDepth(4);
    this.chainGfx.clear();
    this.chainGfx.lineStyle(3, 0x999999, 1);
    this.chainGfx.lineBetween(pivotX, pivotY, sx, sy);
  }
}
