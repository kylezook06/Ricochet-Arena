class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");

    // Gameplay constants
    this.ARENA = { x: 80, y: 60, w: 800, h: 420 };

    this.ROUND_SECONDS = 90; // 1–2 min target

    this.TANK = {
      turnSpeed: 2.8,
      accel: 260,
      maxSpeed: 220,
      friction: 0.985
    };

    this.BOOST = {
      multiplier: 1.75,
      durationMs: 650,
      cooldownMs: 2500
    };

    this.BULLET = {
      speed: 420,
      lifeMs: 2200,
      cooldownMs: 260
    };

    this.AI = {
      fireCooldownMs: 420,
      moveBias: 0.85,
      wobble: 0.65,
      retreatDist: 140
    };

    this.LAYOUTS = [
      [
        { x: 0.50, y: 0.50, w: 80, h: 80 },
        { x: 0.50, y: 0.33, w: 140, h: 18 },
        { x: 0.50, y: 0.67, w: 140, h: 18 },
        { x: 0.25, y: 0.50, w: 18, h: 160 },
        { x: 0.75, y: 0.50, w: 18, h: 160 }
      ],
      [
        { x: 0.35, y: 0.40, w: 220, h: 18 },
        { x: 0.65, y: 0.60, w: 220, h: 18 },
        { x: 0.35, y: 0.60, w: 18, h: 160 },
        { x: 0.65, y: 0.40, w: 18, h: 160 }
      ],
      [
        { x: 0.33, y: 0.33, w: 40, h: 40 },
        { x: 0.67, y: 0.33, w: 40, h: 40 },
        { x: 0.33, y: 0.67, w: 40, h: 40 },
        { x: 0.67, y: 0.67, w: 40, h: 40 },
        { x: 0.50, y: 0.50, w: 50, h: 50 }
      ],
      [
        { x: 0.30, y: 0.30, w: 140, h: 18 },
        { x: 0.70, y: 0.70, w: 140, h: 18 },
        { x: 0.70, y: 0.30, w: 18, h: 140 },
        { x: 0.30, y: 0.70, w: 18, h: 140 }
      ]
    ];
  }

  init() {
    this.registry.set("roundActive", false);
    this.registry.set("gameState", "menu");
    this.registry.set("message", "PRESS SPACE TO START");
    this.registry.set("subMessage", "Press SPACE to start • P/ESC pause • R restart");
    this.registry.set("score", 0);

    this.registry.set("playerHP", 5);
    this.registry.set("aiHP", 5);

    this.registry.set("timeLeft", this.ROUND_SECONDS);

    this.boostActiveUntil = 0;
    this.boostReadyAt = 0;

    this.registry.set("boostActiveUntil", 0);
    this.registry.set("boostReadyAt", 0);
    this.registry.set("boostCooldownMs", this.BOOST.cooldownMs);
  }

  create() {
    // --- Inputs
    this.keys = this.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      r: Phaser.Input.Keyboard.KeyCodes.R
    });

    // --- Arena walls
    this._createArena();

    // --- Placeholder textures
    this._createTankTextures();

    // --- Tanks
    this.player = this._spawnTank(
      this.ARENA.x + 140,
      this.ARENA.y + this.ARENA.h / 2,
      "tank_player"
    );

    this.ai = this._spawnTank(
      this.ARENA.x + this.ARENA.w - 140,
      this.ARENA.y + this.ARENA.h / 2,
      "tank_ai"
    );

    // --- Bullets pool
    this.bullets = this.physics.add.group();

    // --- Obstacles (static blocks inside arena)
    this._createObstacles();

    // --- Collisions
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.ai, this.walls);

    // Bullets bounce off walls
    this.physics.add.collider(this.bullets, this.walls, (bullet) => {
      const b = bullet.body;
      if (!b) return;

      const sp = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
      const max = this.BULLET.speed * 1.05;
      if (sp > max) {
        const s = max / sp;
        b.velocity.x *= s;
        b.velocity.y *= s;
      }
    });

    // Bullets hit tanks
    this.physics.add.overlap(this.bullets, this.player, (obj1, obj2) => {
      if (!this.registry.get("roundActive")) return;
      const bullet = this._resolveBullet(obj1, obj2);
      if (!bullet || !bullet.active) return;
      if (bullet.getData("owner") === "player") return;
      this._onTankHit("player", bullet);
    });

    this.physics.add.overlap(this.bullets, this.ai, (obj1, obj2) => {
      if (!this.registry.get("roundActive")) return;
      const bullet = this._resolveBullet(obj1, obj2);
      if (!bullet || !bullet.active) return;
      if (bullet.getData("owner") === "ai") return;
      this._onTankHit("ai", bullet);
    });

    // --- Timers / cooldowns
    this.lastPlayerShotAt = 0;
    this.lastAiShotAt = 0;

    this.roundTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.registry.get("roundActive")) return;
        const t = Math.max(0, this.registry.get("timeLeft") - 1);
        this.registry.set("timeLeft", t);
        if (t <= 0) this._endRound(false, "TIME UP — You Lose");
      }
    });

    // Hint
    this.add.text(
      this.ARENA.x,
      this.ARENA.y + this.ARENA.h + 18,
      "W/S move • A/D turn • SHIFT boost • SPACE fire (ricochets!) • R restart",
      { fontFamily: "Arial", fontSize: "14px", color: "#cfcfcf" }
    ).setAlpha(0.85);

    this.input.keyboard.on("keydown-F", () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });

    // Freeze world until player starts
    this.physics.world.pause();
  }

  update(time, delta) {
    const dt = delta / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.scene.restart();
      return;
    }

    if (this.registry.get("gameState") === "menu") {
      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
        this._startRound();
      }
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.p) || Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      const state = this.registry.get("gameState");
      if (state === "playing") this._pauseGame();
      else if (state === "paused") this._resumeGame();
    }

    if (this.registry.get("gameState") === "paused") return;

    if (!this.registry.get("roundActive")) return;

    if (!this.player || !this.ai || !this.player.body || !this.ai.body) {
      return;
    }

    // Always keep tanks visible/on-top (defensive)
    this.player.setVisible(true).setAlpha(1).setDepth(10);
    this.ai.setVisible(true).setAlpha(1).setDepth(10);

    // Defensive: keep physics bodies enabled + movable
    this.player.body.enable = true;
    this.ai.body.enable = true;
    this.player.body.moves = true;
    this.ai.body.moves = true;

    this._updatePlayer(dt, time);
    this._updateAI(dt, time);

    this._cleanupBullets(time);
  }

  // -----------------------------
  // Arena / Art
  // -----------------------------
  _createArena() {
    const g = this.add.graphics();
    g.lineStyle(4, 0x2c2c2c, 1);
    g.strokeRect(this.ARENA.x, this.ARENA.y, this.ARENA.w, this.ARENA.h);
    g.setDepth(0);

    this.walls = this.physics.add.staticGroup();
    const thickness = 20;

    // Top
    this.walls.create(this.ARENA.x + this.ARENA.w / 2, this.ARENA.y - thickness / 2, null)
      .setDisplaySize(this.ARENA.w + thickness * 2, thickness)
      .refreshBody();

    // Bottom
    this.walls.create(this.ARENA.x + this.ARENA.w / 2, this.ARENA.y + this.ARENA.h + thickness / 2, null)
      .setDisplaySize(this.ARENA.w + thickness * 2, thickness)
      .refreshBody();

    // Left
    this.walls.create(this.ARENA.x - thickness / 2, this.ARENA.y + this.ARENA.h / 2, null)
      .setDisplaySize(thickness, this.ARENA.h + thickness * 2)
      .refreshBody();

    // Right
    this.walls.create(this.ARENA.x + this.ARENA.w + thickness / 2, this.ARENA.y + this.ARENA.h / 2, null)
      .setDisplaySize(thickness, this.ARENA.h + thickness * 2)
      .refreshBody();

    this.walls.children.iterate(w => w.setVisible(false));
  }

  _startRound() {
    this.registry.set("roundActive", true);
    this.registry.set("gameState", "playing");
    this.registry.set("message", "");
    this.registry.set("subMessage", "P/ESC pause • R restart");

    this.registry.set("playerHP", 5);
    this.registry.set("aiHP", 5);
    this.registry.set("timeLeft", this.ROUND_SECONDS);

    if (this.bullets) {
      this.bullets.children.iterate((b) => {
        if (b && typeof b.destroy === "function") b.destroy();
      });
      if (typeof this.bullets.clear === "function") {
        this.bullets.clear(true, true);
      }
    }

    this.player.body.setVelocity(0, 0);
    this.ai.body.setVelocity(0, 0);

    this.physics.world.resume();
  }

  _pauseGame() {
    if (!this.registry.get("roundActive")) return;

    this.registry.set("roundActive", false);
    this.registry.set("gameState", "paused");
    this.registry.set("message", "PAUSED");
    this.registry.set("subMessage", "Press P/ESC to resume • R restart");

    this.player.body.setVelocity(0, 0);
    this.ai.body.setVelocity(0, 0);
    this.physics.world.pause();
  }

  _resumeGame() {
    if (this.registry.get("gameState") !== "paused") return;

    this.registry.set("roundActive", true);
    this.registry.set("gameState", "playing");
    this.registry.set("message", "");
    this.registry.set("subMessage", "P/ESC pause • R restart");

    this.physics.world.resume();
  }

  _createObstacles() {
    if (this.obstacles && typeof this.obstacles.destroy === "function") {
      this.obstacles.destroy(true);
    }
    if (this.obstacleGraphics) {
      this.obstacleGraphics.destroy();
    }

    this.obstacleGraphics = this.add.graphics();
    this.obstacleGraphics.setDepth(1);

    this.obstacles = this.physics.add.staticGroup();

    const layoutIndex = Phaser.Math.Between(0, this.LAYOUTS.length - 1);
    this.registry.set("layoutIndex", layoutIndex);

    const blocks = this.LAYOUTS[layoutIndex];

    blocks.forEach((b) => {
      const x = this.ARENA.x + b.x * this.ARENA.w;
      const y = this.ARENA.y + b.y * this.ARENA.h;

      this.obstacleGraphics.fillStyle(0x202020, 1);
      this.obstacleGraphics.fillRect(x - b.w / 2, y - b.h / 2, b.w, b.h);

      this.obstacleGraphics.lineStyle(2, 0x3a3a3a, 1);
      this.obstacleGraphics.strokeRect(x - b.w / 2, y - b.h / 2, b.w, b.h);

      const o = this.obstacles.create(x, y, null);
      o.setDisplaySize(b.w, b.h);
      o.refreshBody();
      o.setVisible(false);
    });

    this.physics.add.collider(this.player, this.obstacles);
    this.physics.add.collider(this.ai, this.obstacles);

    this.physics.add.collider(this.bullets, this.obstacles, (bullet) => {
      const body = bullet && bullet.body;
      if (!body) return;

      const sp = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y);
      const max = this.BULLET.speed * 1.05;
      if (sp > max) {
        const s = max / sp;
        body.velocity.x *= s;
        body.velocity.y *= s;
      }
    });
  }

  _createTankTextures() {
    if (!this.textures.exists("tank_player")) {
      const tg = this.make.graphics({ x: 0, y: 0, add: false });
      tg.fillStyle(0x4ee1ff, 1);
      tg.fillRoundedRect(0, 0, 40, 26, 6);
      tg.fillStyle(0x2a2a2a, 1);
      tg.fillCircle(20, 13, 7);
      tg.fillRect(20, 11, 18, 4);
      tg.generateTexture("tank_player", 40, 26);
      tg.destroy();
    }

    if (!this.textures.exists("tank_ai")) {
      const tg = this.make.graphics({ x: 0, y: 0, add: false });
      tg.fillStyle(0xff6b6b, 1);
      tg.fillRoundedRect(0, 0, 40, 26, 6);
      tg.fillStyle(0x2a2a2a, 1);
      tg.fillCircle(20, 13, 7);
      tg.fillRect(20, 11, 18, 4);
      tg.generateTexture("tank_ai", 40, 26);
      tg.destroy();
    }

    if (!this.textures.exists("bullet")) {
      const bg = this.make.graphics({ x: 0, y: 0, add: false });
      bg.fillStyle(0xf5f5f5, 1);
      bg.fillCircle(4, 4, 4);
      bg.generateTexture("bullet", 8, 8);
      bg.destroy();
    }
  }

  _spawnTank(x, y, texKey) {
    const spr = this.physics.add.image(x, y, texKey);
    spr.setDepth(10);
    spr.setVisible(true);
    spr.setAlpha(1);
    spr.setMaxVelocity(
      this.TANK.maxSpeed * this.BOOST.multiplier,
      this.TANK.maxSpeed * this.BOOST.multiplier
    );
    spr.body.setCircle(13, (spr.width / 2) - 13, (spr.height / 2) - 13);
    spr.setData("invulnUntil", 0);
    return spr;
  }

  // -----------------------------
  // Player
  // -----------------------------
  _updatePlayer(dt, time) {
    let turn = 0;
    if (this.keys.a.isDown) turn -= 1;
    if (this.keys.d.isDown) turn += 1;
    this.player.rotation += turn * this.TANK.turnSpeed * dt;

    const now = time;
    const isBoosting = now < (this.boostActiveUntil || 0);

    if (Phaser.Input.Keyboard.JustDown(this.keys.shift)) {
      const readyAt = this.boostReadyAt || 0;
      if (now >= readyAt && !isBoosting) {
        this.boostActiveUntil = now + this.BOOST.durationMs;
        this.boostReadyAt = now + this.BOOST.cooldownMs;

        this.registry.set("boostActiveUntil", this.boostActiveUntil);
        this.registry.set("boostReadyAt", this.boostReadyAt);
      }
    }

    const boostingNow = now < (this.boostActiveUntil || 0);
    const mult = boostingNow ? this.BOOST.multiplier : 1;

    const speedForward = this.TANK.maxSpeed * mult;
    const speedBack = this.TANK.maxSpeed * 0.7 * mult;

    let desiredSpeed = 0;
    if (this.keys.w.isDown) desiredSpeed = speedForward;
    else if (this.keys.s.isDown) desiredSpeed = -speedBack;

    if (desiredSpeed !== 0) {
      this.physics.velocityFromRotation(
        this.player.rotation,
        desiredSpeed,
        this.player.body.velocity
      );
    } else {
      this.player.body.velocity.scale(this.TANK.friction);
    }

    if (this.keys.space.isDown) {
      if (time - this.lastPlayerShotAt >= this.BULLET.cooldownMs) {
        this.lastPlayerShotAt = time;
        this._fireBullet(this.player, "player", time);
      }
    }
  }

  // -----------------------------
  // AI
  // -----------------------------
  _updateAI(dt, time) {
    const p = this.player;
    const a = this.ai;

    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const desiredAngle = Math.atan2(dy, dx);
    let diff = Phaser.Math.Angle.Wrap(desiredAngle - a.rotation);

    diff += (Math.random() - 0.5) * this.AI.wobble * dt;

    const maxTurn = this.TANK.turnSpeed * 0.9 * dt;
    diff = Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
    a.rotation += diff;

    let desiredSpeed = 0;

    if (dist < this.AI.retreatDist) {
      desiredSpeed = -this.TANK.maxSpeed * 0.35;
      a.rotation += (Math.random() > 0.5 ? 1 : -1) * this.TANK.turnSpeed * 0.5 * dt;
    } else {
      if (Math.random() < this.AI.moveBias) {
        desiredSpeed = this.TANK.maxSpeed * 0.55;
      }
    }

    if (desiredSpeed !== 0) {
      this.physics.velocityFromRotation(a.rotation, desiredSpeed, a.body.velocity);
    } else {
      a.body.velocity.scale(this.TANK.friction);
    }

    const facing = Math.abs(Phaser.Math.Angle.Wrap(desiredAngle - a.rotation));
    if (facing < 0.35) {
      if (time - this.lastAiShotAt >= this.AI.fireCooldownMs) {
        this.lastAiShotAt = time;
        this._fireBullet(a, "ai", time);
      }
    }
  }

  // -----------------------------
  // Bullets / Combat
  // -----------------------------

  _resolveBullet(obj1, obj2) {
    const isBullet = (obj) => obj && obj.texture && obj.texture.key === "bullet" && obj.body;

    if (isBullet(obj1)) return obj1;
    if (isBullet(obj2)) return obj2;
    return null;
  }

  _fireBullet(shooter, owner, time) {
    const dir = new Phaser.Math.Vector2(1, 0).rotate(shooter.rotation);
    const spawnOffset = 28;
    const x = shooter.x + dir.x * spawnOffset;
    const y = shooter.y + dir.y * spawnOffset;

    const bullet = this.bullets.create(x, y, "bullet");
    if (!bullet) return;

    bullet.setDepth(5);

    bullet.setData("owner", owner);
    bullet.setData("bornAt", time);

    bullet.body.setAllowGravity(false);
    bullet.body.setCircle(4);
    bullet.setBounce(1, 1);

    bullet.body.setVelocity(dir.x * this.BULLET.speed, dir.y * this.BULLET.speed);
  }

  _cleanupBullets(time) {
    this.bullets.children.iterate((b) => {
      if (!b) return;
      const bornAt = b.getData("bornAt");
      if (bornAt == null) return;
      const age = time - bornAt;
      if (age > this.BULLET.lifeMs) {
        b.destroy();
      }
    });
  }

  _onTankHit(which, bullet) {
    if (!bullet || !bullet.texture || bullet.texture.key !== "bullet") return;
    const tank = (which === "player") ? this.player : this.ai;

    const now = this.time.now;
    const invulnUntil = tank.getData("invulnUntil") || 0;
    if (now < invulnUntil) {
      if (bullet) bullet.destroy();
      return;
    }
    tank.setData("invulnUntil", now + 120);

    if (bullet) bullet.destroy();

    tank.setDepth(10);
    tank.setVisible(true);
    tank.setAlpha(1);

    if (which === "player") {
      const hp = this.registry.get("playerHP") - 1;
      this.registry.set("playerHP", hp);
      this._flashTank(tank);
      if (hp <= 0) this._endRound(false, "DESTROYED — You Lose");
    } else {
      const hp = this.registry.get("aiHP") - 1;
      this.registry.set("aiHP", hp);
      this._flashTank(tank);

      this.registry.set("score", this.registry.get("score") + 100);

      if (hp <= 0) this._endRound(true, "AI DESTROYED — You Win!");
    }
  }

  _flashTank(tank) {
    tank.setVisible(true);
    tank.setAlpha(0.35);
    this.time.delayedCall(80, () => {
      tank.setVisible(true);
      tank.setAlpha(1);
    });
  }

  _endRound(win, message) {
    if (!this.registry.get("roundActive")) return;

    this.registry.set("roundActive", false);
    this.registry.set("message", message);

    if (win) {
      const t = this.registry.get("timeLeft");
      this.registry.set("score", this.registry.get("score") + t * 10);
    }

    this.player.body.setVelocity(0, 0);
    this.ai.body.setVelocity(0, 0);
  }
}
