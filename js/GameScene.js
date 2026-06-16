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

// Fester unsichtbarer Physik-Body (Mittelwert, nie geändert)
const APFEL_BODY_W = Math.round(APFEL_LARGE.w * 0.72);  // 52
const APFEL_BODY_H = Math.round(APFEL_LARGE.h * 0.86);  // 77

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create(data) {
    this.levelIdx       = data.level ?? 0;
    this.totalCoins     = data.totalCoins ?? 0;
    this.cfg            = LEVELS[this.levelIdx];
    this.mode           = this.cfg.mode ?? 'run';
    this.kinder         = this.game.registry.get('kinder') ?? false;
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
    this._stompWindow   = 0;

    // Interaktions-Pause (Quiz / Versuchung)
    this._pause        = false;
    this._countingDown = false;
    this._quizActive   = false;
    this._quizDone     = false;
    this._tempActive   = false;
    this._tempDone     = false;

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
      s.setDisplaySize(74, 74).setOrigin(0.5, 1).setDepth(2);
      s.body.allowGravity = false;
      s.body.setSize(62, 62);
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
    // Unsichtbarer fester Physik-Body – Größe bleibt immer APFEL_BODY_W×APFEL_BODY_H,
    // unabhängig von Animations-Frame oder State (small/large). Das verhindert
    // Boden-Clipping und fehlende Schorle-Overlaps durch schwankende Frame-Maße.
    if (!this.textures.exists('_hitbox')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 1, 1);
      g.generateTexture('_hitbox', 1, 1); g.destroy();
    }
    this.player = this.physics.add.sprite(PLAYER_START_X, GROUND_Y, '_hitbox');
    this.player.setOrigin(0, 1).setAlpha(0);
    this.player.setDisplaySize(APFEL_BODY_W, APFEL_BODY_H);
    this.player.setMaxVelocity(800, TERM_VEL);
    this.player.body.setCollideWorldBounds(false);
    this.player.body.setSize(1, 1);  // 1×1 source × scale = APFEL_BODY_W×APFEL_BODY_H Weltpixel

    // Visuelle Darstellung: folgt dem Physik-Body, wechselt Animation/Größe je State
    this.playerVisual = this.add.sprite(PLAYER_START_X, GROUND_Y, 'apfel_small_1');
    this.playerVisual.setOrigin(0, 1).setDepth(3);
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
    // Canvas normalisiert 355×399 → 80×90px anzeigen
    this.julia = this.add.sprite(-80, GROUND_Y, 'julia_run_1')
      .setOrigin(0.5, 1).setDepth(4).setDisplaySize(80, 90);
    this.julia.play('julia_run');

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

    // ── Level-Intro ────────────────────────────────────────────────────────────
    if (new URLSearchParams(window.location.search).has('fight') && this.cfg.temptation) {
      // Debug-Skip: kein Intro, direkt in den Pokahontas-Kampf
      this.worldScroll = this.cfg.temptation.x;
      this.cameras.main.scrollX = this.worldScroll;
      this.time.delayedCall(300, () => this._startTemptation());
    } else {
      this._countingDown = true;
      this._showLevelIntro();
    }
  }

  // ── Level-Intro: Beschreibung + 3-2-1-Countdown ─────────────────────────

  _showLevelIntro() {
    const W = 450, H = 800;

    const overlay = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.72)
      .setScrollFactor(0).setDepth(50).setAlpha(0);

    const badgeTxt = this.add.text(W/2, 272, `– Prüfung ${this.levelIdx + 1} von ${LEVELS.length} –`, {
      fontFamily: 'Georgia, serif', fontSize: '16px',
      color: '#e8b86d', stroke: '#000', strokeThickness: 4,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(51).setAlpha(0);

    const titleTxt = this.add.text(W/2, 334, this.cfg.title, {
      fontFamily: 'Georgia, serif', fontSize: '32px', fontStyle: 'bold',
      color: '#ffd54f', stroke: '#000', strokeThickness: 7, align: 'center',
      wordWrap: { width: 400 },
    }).setScrollFactor(0).setOrigin(0.5).setDepth(51).setAlpha(0);

    const subTxt = this.add.text(W/2, 400, this.cfg.subtitle ?? '', {
      fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'italic',
      color: '#ffffff', stroke: '#000', strokeThickness: 4, align: 'center',
      wordWrap: { width: 390 },
    }).setScrollFactor(0).setOrigin(0.5).setDepth(51).setAlpha(0);

    const countTxt = this.add.text(W/2, 570, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '96px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000', strokeThickness: 14,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(52).setAlpha(0);

    const introElems = [overlay, badgeTxt, titleTxt, subTxt];

    if (this.levelIdx === 0) {
      const tipTxt = this.add.text(W/2, 466, 'Sammle Schorle –\nsonst holt Julia dich ein!', {
        fontFamily: 'Georgia, serif', fontSize: '17px', fontStyle: 'italic',
        color: '#88ee88', stroke: '#000', strokeThickness: 4, align: 'center',
      }).setScrollFactor(0).setOrigin(0.5).setDepth(51).setAlpha(0);
      introElems.push(tipTxt);
    }

    // Einblenden
    this.tweens.add({ targets: introElems, alpha: 1, duration: 420 });

    // 3 – 2 – 1 nach der Lesezeit
    const READ_MS = 2300;
    const tick = (n, delay) => {
      this.time.delayedCall(delay, () => {
        countTxt.setText(`${n}`).setAlpha(1).setScale(1.7);
        this.tweens.add({
          targets: countTxt, scale: 1.0, duration: 580, ease: 'Back.easeOut',
        });
        this.sound.play('sfx_bump', { volume: 0.30 });
      });
    };
    tick(3, READ_MS);
    tick(2, READ_MS + 700);
    tick(1, READ_MS + 1400);

    // Ausblenden + Spiel freischalten
    this.time.delayedCall(READ_MS + 1950, () => {
      this.tweens.add({
        targets: [...introElems, countTxt], alpha: 0, duration: 260,
        onComplete: () => {
          introElems.forEach(o => o.destroy());
          countTxt.destroy();
          this._countingDown = false;
          this.jumpBuffer = 0;
          this.tapHeld    = false;
        },
      });
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
    def('julia_run', [1,2,3,4,5].map(i => ({ key:`julia_run_${i}` })), 8);
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
    if (!schorle || !schorle.active) return;
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
    // _stompWindow erlaubt mehrere Monster im selben Physik-Step zu stompen:
    // nach dem ersten Stomp ist velocity.y bereits -300 (Abprall), deshalb
    // reicht die velocity-Prüfung für gleichzeitig überlappende Feinde nicht.
    const isStomp = this.mode !== 'jugger' && (
      this._stompWindow > 0 ||
      (player.body.velocity.y > 20 && player.body.bottom <= enemy.body.top + 24)
    );
    if (isStomp) {
      enemy.destroy();
      this.player.setVelocityY(-300);
      this._stompWindow = 150;
      this.sound.play('sfx_bump', { volume: 0.8 });
      if (this._tempActive && this.kinder) this._onKinderKill();
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
    this.playerVisual.play(animMap[this.apfelState], true);
    const { w, h } = (this.apfelState !== 'small') ? APFEL_LARGE : APFEL_SMALL;
    this.playerVisual.setDisplaySize(w, h);
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
          this.playerVisual.setTint(0x66aaff);
          this._lose('quiz');
        },
      });
    }
  }

  // ── Prüfung des Willens: Pokahontas ─────────────────────────────────────────

  _startTemptation() {
    this._tempActive  = true;
    this._clothes     = 5;
    this._tempWaveCount = 0;
    this._tempScrollX = this.worldScroll;   // Scroll einfrieren
    this.fuel = 1;                          // Schorle-Vorrat auffüllen
    this.julia.setVisible(false);

    // Kampfmusik statt Level-Musik
    this._bgMusic.stop();
    this._fightMusic = this.sound.add('music_fight', { loop: true, volume: 0.7 });
    this._fightMusic.play();

    // Apfel weiter links positionieren (mehr Platz zum Kämpfen)
    this.player.x = this._tempScrollX + 90;
    this.player.setVelocity(0, 0);
    this.tapHeld = false;

    if (this.kinder) { this._startKinderTemptation(); return; }

    // Erhöhte Plattform für Pokahontas – 3 Terrain-Kacheln statt Rechteck
    const pokaX   = this._tempScrollX + 290;
    const platTop = GROUND_Y - 155;
    const theme   = this.cfg.tileTheme ?? 'grass';
    const pLeft   = pokaX - TILE_SIZE * 1.5;
    this._pokaPlat = [
      this.add.image(pLeft,              platTop, `terrain_${theme}_horizontal_left`)  .setOrigin(0,1).setDisplaySize(TILE_SIZE,TILE_SIZE).setDepth(4),
      this.add.image(pLeft + TILE_SIZE,  platTop, `terrain_${theme}_horizontal_middle`).setOrigin(0,1).setDisplaySize(TILE_SIZE,TILE_SIZE).setDepth(4),
      this.add.image(pLeft + TILE_SIZE*2,platTop, `terrain_${theme}_horizontal_right`) .setOrigin(0,1).setDisplaySize(TILE_SIZE,TILE_SIZE).setDepth(4),
    ];

    this._poka = this.add.image(pokaX, platTop - TILE_SIZE, 'pokahontas_4')
      .setOrigin(0.5, 1).setDisplaySize(122, 165).setDepth(5);
    this._pokaDance = this.tweens.add({
      targets: this._poka, angle: { from: -6, to: 6 },
      duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this._tempHint = this.add.text(225, 130, 'Noch 5 Elwetrische', {
      fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'bold',
      color: '#ffd54f', stroke: '#000', strokeThickness: 5, align: 'center',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(22);

    // Monsterchen mit variablen Abständen (1000–3000 ms), 25 insgesamt.
    // Breites Intervall → 1–2 Monster gleichzeitig, echte Lücken bleiben.
    this._tempDrops   = [];
    this._tempWalking = false;
    this._undressing  = false;
    const spawnNext = () => {
      if (!this._tempActive || this._tempWaveCount >= 25) return;
      if (this._undressing) {
        // Kurz warten bis Überblendung durch ist, dann weitermachen
        this._tempWaveTimer = this.time.delayedCall(200, spawnNext);
        return;
      }
      this._spawnTempEnemy();
      this._tempWaveTimer = this.time.delayedCall(Phaser.Math.Between(1000, 3000), spawnNext);
    };
    this._tempWaveTimer = this.time.delayedCall(500, spawnNext);
  }

  // ── Kinderversion: Willens-Prüfung ─────────────────────────────────────────

  _startKinderTemptation() {
    this._kinderKills     = 0;
    this._kinderShrinking = false;
    this._tempDrops       = [];
    this._tempWalking     = false;

    const pokaX   = this._tempScrollX + 290;
    const platTop = GROUND_Y - 155;
    const theme   = this.cfg.tileTheme ?? 'grass';
    const pLeft   = pokaX - TILE_SIZE * 1.5;
    this._pokaPlat = [
      this.add.image(pLeft,               platTop, `terrain_${theme}_horizontal_left`)  .setOrigin(0,1).setDisplaySize(TILE_SIZE,TILE_SIZE).setDepth(4),
      this.add.image(pLeft + TILE_SIZE,   platTop, `terrain_${theme}_horizontal_middle`).setOrigin(0,1).setDisplaySize(TILE_SIZE,TILE_SIZE).setDepth(4),
      this.add.image(pLeft + TILE_SIZE*2, platTop, `terrain_${theme}_horizontal_right`) .setOrigin(0,1).setDisplaySize(TILE_SIZE,TILE_SIZE).setDepth(4),
    ];

    this._bossX   = pokaX;
    this._platTop = platTop;

    // Großes Boss-Monster (Elwetrische skaliert) – Stage 4 = größte Form
    this._poka = this.add.sprite(pokaX, platTop, 'elw_1')
      .setOrigin(0.5, 1).setDisplaySize(168, 192).setDepth(5);
    this._poka.play('elw_walk');
    this._pokaDance = this.tweens.add({
      targets: this._poka, angle: { from: -8, to: 8 },
      duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this._tempHint = this.add.text(225, 130,
      'Das Bossmonster schickt Minions!\nBesiege 25 Monsterchen!', {
      fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'bold',
      color: '#ffd54f', stroke: '#000', strokeThickness: 5, align: 'center',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(22);

    const spawnNext = () => {
      if (!this._tempActive || this._kinderKills >= 25) return;
      if (this._kinderShrinking) {
        this._tempWaveTimer = this.time.delayedCall(200, spawnNext);
        return;
      }
      if (this.enemyGroup.countActive() < 3) this._spawnKinderEnemy();
      this._tempWaveTimer = this.time.delayedCall(Phaser.Math.Between(800, 1800), spawnNext);
    };
    this._tempWaveTimer = this.time.delayedCall(500, spawnNext);
  }

  _spawnKinderEnemy() {
    if (!this._tempActive) return;
    const spawnX = this._bossX + Phaser.Math.Between(-24, 24);
    const e = this.enemyGroup.create(spawnX, this._platTop - 10, 'elw_1');
    e.setOrigin(0.5, 1).setDisplaySize(56, 64).setDepth(3).setFlipX(true);
    e.body.allowGravity = true;
    e.body.setSize(40, 56);
    e.setVelocity(-130, 0);
    e.play('elw_walk');
    this.physics.add.collider(e, this.groundGroup);
  }

  _onKinderKill() {
    this._kinderKills++;
    const kills     = this._kinderKills;
    const prevStage = 4 - Math.floor((kills - 1) / 5);
    const newStage  = 4 - Math.floor(kills / 5);

    if (this._tempHint) {
      const rem = Math.max(0, 25 - kills);
      this._tempHint.setText(rem > 0
        ? `Töte die Monsterchen!\nNoch ${rem} übrig …`
        : 'Fast geschafft!');
    }

    if (newStage < prevStage && kills < 25) this._kinderShrink(newStage);

    if (kills >= 25) {
      if (this._tempWaveTimer) { this._tempWaveTimer.remove(); this._tempWaveTimer = null; }
      this.time.delayedCall(800, () => this._endTemptation());
      return;
    }

    if ([6, 13, 18].includes(kills)) {
      this.time.delayedCall(400, () => this._dropTempSchorle());
    }
  }

  _kinderShrink(stage) {
    // stage 0 = kleinst (50×56), stage 4 = größt (168×192)
    const BOSS_SIZES = [[50, 56], [68, 78], [100, 116], [134, 154], [168, 192]];
    this._kinderShrinking = true;
    this.physics.world.pause();
    if (this._pokaDance) this._pokaDance.pause();

    this.tweens.add({
      targets: this._poka, alpha: 0, duration: 300,
      onComplete: () => {
        const [bw, bh] = BOSS_SIZES[Math.max(0, stage)] ?? [50, 56];
        this._poka.setDisplaySize(bw, bh);
        this.sound.play('sfx_disappear', { volume: 0.6 });
        this.tweens.add({
          targets: this._poka, alpha: 1, duration: 300, delay: 100,
          onComplete: () => {
            if (this._pokaDance) this._pokaDance.resume();
            this.physics.world.resume();
            this._kinderShrinking = false;
          },
        });
      },
    });
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
    // Nach dem 8., 16. und 23. Monster fällt eine Schorle vom Himmel
    if ([8, 16, 23].includes(this._tempWaveCount)) {
      this.time.delayedCall(400, () => this._dropTempSchorle());
    }
  }

  _dropTempSchorle() {
    if (!this._tempActive) return;
    const sx = this.player.x;
    // Kein physics.add.image: Physics-Bodys landen im Quadtree und lösen
    // fälschlicherweise _onSchorle(player, undefined) für schorleGroup aus.
    // Stattdessen: normales Image + Tween-Fall + manuelle Nähe-Prüfung in update().
    const s = this.add.image(sx, GROUND_Y - 310, 'schorle')
      .setDisplaySize(74, 74).setOrigin(0.5, 1).setDepth(6);
    this.tweens.add({
      targets: s, y: GROUND_Y, duration: 900, ease: 'Quad.easeIn',
    });
    this._tempDrops.push(s);
  }

  _undressWave() {
    if (!this._tempActive || this._clothes <= 0) return;
    this._clothes--;
    const newClothes = this._clothes;

    // Physik einfrieren + Dance-Tween anhalten
    this.physics.world.pause();
    this._undressing = true;
    if (this._pokaDance) this._pokaDance.pause();

    // Ausblenden → Textur wechseln → Einblenden
    this.tweens.add({
      targets: this._poka, alpha: 0, duration: 380,
      onComplete: () => {
        this._poka.setTexture(`pokahontas_${Math.min(newClothes, 4)}`);
        this.sound.play('sfx_magic', { volume: 0.8 });
        if (this._tempHint) {
          this._tempHint.setText(newClothes > 0
            ? `Noch ${newClothes} Elwetrische`
            : 'Sie ist nackt! Fast geschafft!');
        }
        this.tweens.add({
          targets: this._poka, alpha: 1, duration: 380, delay: 250,
          onComplete: () => {
            if (this._pokaDance) this._pokaDance.resume();
            this.physics.world.resume();
            this._undressing = false;
            if (newClothes <= 0) {
              if (this._tempWaveTimer) { this._tempWaveTimer.remove(); this._tempWaveTimer = null; }
              this.time.delayedCall(1800, () => this._endTemptation());
            } else {
              const fastCount = Math.min(3, 5 - newClothes);
              for (let i = 0; i < fastCount; i++) {
                this.time.delayedCall(i * 400, () => {
                  if (!this._tempActive) return;
                  const fe = this.enemyGroup.create(this._tempScrollX + 500, GROUND_Y + 3, 'elw_1');
                  fe.setOrigin(0.5, 1).setDisplaySize(56, 64).setDepth(3).setFlipX(true);
                  fe.body.allowGravity = false;
                  fe.body.setSize(40, 56);
                  fe.setVelocityX(-210);
                  fe.play('elw_walk');
                });
              }
            }
          },
        });
      },
    });
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
        if (this._pokaPlat) { this._pokaPlat.forEach(t => t.destroy()); }
        [this._poka, this._tempHint].forEach(o => o && o.destroy());
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
    if (reason === 'caught') {
      // Julia zeigt Greif-Pose wenn sie Apfel erwischt
      this.julia.stop();
      this.julia.setTexture('julia_catch').setDisplaySize(110, 90);
      this.sound.play('sfx_hurt', { volume: 0.9 });
    } else if (reason === 'poka_schorle') {
      // Kampftod: Schorle leer – Kampfmusik sofort stoppen
      if (this._fightMusic) { this._fightMusic.stop(); this._fightMusic = null; }
      this.playerVisual.setTint(0xff4444);
      this.sound.play('sfx_disappear', { volume: 0.9 });
    } else if (reason === 'fell') {
      this.playerVisual.setTint(0xff4444);
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
    // Visual folgt dem Physik-Body (jeder Frame, auch im Game-Over-Freeze)
    this.playerVisual.setPosition(this.player.x, this.player.y);
    if (this._gameOver) return;
    const dt = delta / 1000;

    // Während Quiz/Versuchung: alles eingefroren, nur Kamera/Animationen ruhen.
    if (this._pause || this._countingDown) {
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
    // Im Pokahontas-Kampf läuft Schorle langsamer ab (40 % der normalen Rate)
    const activeDrainK = (this._tempActive && !this._tempWalking)
      ? this.drainK * 0.4
      : this.drainK;
    this.fuel = Math.max(0, this.fuel - this.fuel * activeDrainK * dt);
    this._refreshStateFromFuel();

    // Während Versuchung: kein Schorle-Vorrat mehr = verloren
    if (this._tempActive && !this._tempWalking && this.apfelState === 'small') {
      this._lose('poka_schorle'); return;
    }

    if (this._tempActive) {
      this.player.setVelocityX(this._tempWalking ? 110 : 0);

      // Temp-Schorle-Drops: manuelle Nähe-Prüfung (kein Physics-Body)
      if (this._tempDrops) {
        const pcx = this.player.x + 36;
        this._tempDrops.forEach((s, i) => {
          if (!s || !s.active) return;
          if (Math.abs(pcx - s.x) < 52 && s.y > GROUND_Y - 120) {
            s.destroy();
            this._tempDrops[i] = null;
            this.fuel = 1;
            this.sound.play('sfx_magic', { volume: 0.8 });
          }
        });
      }
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
    if (this._stompWindow > 0) this._stompWindow = Math.max(0, this._stompWindow - dt);

    if (this.invTimer > 0) {
      this.invTimer -= dt;
      this.flickerT += dt;
      this.playerVisual.setAlpha(Math.floor(this.flickerT * 10) % 2 === 0 ? 1 : 0.25);
      if (this.invTimer <= 0) this.playerVisual.setAlpha(1);
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
