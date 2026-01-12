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
  }

  init() {
    this.registry.set("roundActive", true);
    this.registry.set("message", "");
    this.registry.set("score", 0);

    this.registry.set("playerHP", 5);
    this.registry.set("aiHP", 5);

    this.registry.set("timeLeft", this.ROUND_SECONDS);
  }

  create() {
    // --- Inputs
    this.keys = this.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
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
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 200
    });

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
    this.physics.add.overlap(this.bullets, this.player, (bullet) => {
      if (!this.registry.get("roundActive")) return;
      if (!bullet.active) return;
      if (bullet.getData("owner") === "player") return;
      this._onTankHit("player", bullet);
    });

    this.physics.add.overlap(this.bullets, this.ai, (bullet) => {
      if (!this.registry.get("roundActive")) return;
      if (!bullet.active) return;
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
      "W/S move • A/D turn • SPACE fire (ricochets!) • R restart",
      { fontFamily: "Arial", fontSize: "14px", color: "#cfcfcf" }
    ).setAlpha(0.85);

    this.input.keyboard.on("keydown-F", () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });
  }

  update(time, delta) {
    const dt = delta / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.scene.restart();
      return;
    }

    if (!this.registry.get("roundActive")) return;

    // Always keep tanks visible/on-top (defensive)
    this.player.setVisible(true).setAlpha(1).setDepth(10);
    this.ai.setVisible(true).setAlpha(1).setDepth(10);

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
    spr.setMaxVelocity(this.TANK.maxSpeed, this.TANK.maxSpeed);
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

    const forward = new Phaser.Math.Vector2(1, 0).rotate(this.player.rotation);

    if (this.keys.w.isDown) {
      this.player.body.velocity.x += forward.x * this.TANK.accel * dt;
      this.player.body.velocity.y += forward.y * this.TANK.accel * dt;
    } else if (this.keys.s.isDown) {
      this.player.body.velocity.x -= forward.x * this.TANK.accel * dt * 0.75;
      this.player.body.velocity.y -= forward.y * this.TANK.accel * dt * 0.75;
    }

    this.player.body.velocity.x *= this.TANK.friction;
    this.player.body.velocity.y *= this.TANK.friction;

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

    const fwd = new Phaser.Math.Vector2(1, 0).rotate(a.rotation);

    if (dist < this.AI.retreatDist) {
      a.body.velocity.x -= fwd.x * this.TANK.accel * dt * 0.35;
      a.body.velocity.y -= fwd.y * this.TANK.accel * dt * 0.35;
      a.rotation += (Math.random() > 0.5 ? 1 : -1) * this.TANK.turnSpeed * 0.5 * dt;
    } else {
      if (Math.random() < this.AI.moveBias) {
        a.body.velocity.x += fwd.x * this.TANK.accel * dt * 0.65;
        a.body.velocity.y += fwd.y * this.TANK.accel * dt * 0.65;
      }
    }

    a.body.velocity.x *= this.TANK.friction;
    a.body.velocity.y *= this.TANK.friction;

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

  // Re-enable/reset pooled bullets after disableBody()
  _fireBullet(shooter, owner, time) {
    const dir = new Phaser.Math.Vector2(1, 0).rotate(shooter.rotation);
    const spawnOffset = 28;
    const x = shooter.x + dir.x * spawnOffset;
    const y = shooter.y + dir.y * spawnOffset;

    let bullet = this.bullets.get(x, y, "bullet");
    if (!bullet) return;

    // If this bullet was previously disabled, this re-enables its body properly.
    bullet.enableBody(true, x, y, true, true);

    bullet.setTexture("bullet");
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setDepth(5);

    bullet.setData("owner", owner);
    bullet.setData("bornAt", time);
    bullet.setData("alreadyHit", false);

    // Ensure body settings are re-applied (pooled objects can lose state)
    bullet.body.setAllowGravity(false);
    bullet.body.setCircle(4);
    bullet.setBounce(1, 1);

    bullet.body.reset(x, y);
    bullet.body.setVelocity(dir.x * this.BULLET.speed, dir.y * this.BULLET.speed);
  }

  _cleanupBullets(time) {
    this.bullets.children.iterate((b) => {
      if (!b || !b.active) return;
      const age = time - b.getData("bornAt");
      if (age > this.BULLET.lifeMs) {
        b.disableBody(true, true);
      }
    });
  }

  _onTankHit(which, bullet) {
    if (!bullet || !bullet.active) return;
    if (bullet.getData("alreadyHit")) return;
    bullet.setData("alreadyHit", true);

    bullet.disableBody(true, true);

    const tank = (which === "player") ? this.player : this.ai;

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
