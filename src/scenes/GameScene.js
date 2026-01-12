class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");

    // Gameplay constants
    this.ARENA = { x: 80, y: 60, w: 800, h: 420 };

    this.ROUND_SECONDS = 90; // fits your 1–2 min target (tweak to 120 if desired)

    this.TANK = {
      turnSpeed: 2.8,      // radians/sec-ish, applied per dt
      accel: 260,          // px/sec^2
      maxSpeed: 220,       // px/sec
      friction: 0.985      // velocity damping per frame
    };

    this.BULLET = {
      speed: 420,
      lifeMs: 2200,
      cooldownMs: 260
    };

    this.AI = {
      fireCooldownMs: 420,
      moveBias: 0.85,         // chance to thrust forward each tick
      wobble: 0.65,           // small turning noise
      retreatDist: 140        // if too close, briefly retreat/turn away
    };
  }

  init() {
    // Round state in registry so UIScene can read it.
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

    // --- Arena walls (invisible physics, visible outlines)
    this._createArena();

    // --- Tanks (placeholder art via Graphics -> textures)
    this._createTankTextures();

    this.player = this._spawnTank(
      this.ARENA.x + 140,
      this.ARENA.y + this.ARENA.h / 2,
      "tank_player",
      0x4ee1ff
    );

    this.ai = this._spawnTank(
      this.ARENA.x + this.ARENA.w - 140,
      this.ARENA.y + this.ARENA.h / 2,
      "tank_ai",
      0xff6b6b
    );

    // --- Bullets group
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 200,
      runChildUpdate: false
    });

    // --- Collisions
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.ai, this.walls);

    // Bullets collide with walls (bounce)
    this.physics.add.collider(this.bullets, this.walls, (bullet) => {
      // tiny speed clamp so they don't go wild after multiple bounces
      const b = bullet.body;
      const sp = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
      const max = this.BULLET.speed * 1.05;
      if (sp > max) {
        const s = max / sp;
        b.velocity.x *= s;
        b.velocity.y *= s;
      }
    });

    // Bullets hit tanks
    this.physics.add.overlap(this.bullets, this.player, (bullet, tank) => {
      if (!this.registry.get("roundActive")) return;
      if (bullet.getData("owner") === "player") return; // ignore friendly fire
      this._onTankHit("player", bullet);
    });

    this.physics.add.overlap(this.bullets, this.ai, (bullet, tank) => {
      if (!this.registry.get("roundActive")) return;
      if (bullet.getData("owner") === "ai") return;
      this._onTankHit("ai", bullet);
    });

    // --- Timers
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

    // --- Instructions text (in-world, small)
    const hint = this.add.text(
      this.ARENA.x,
      this.ARENA.y + this.ARENA.h + 18,
      "W/S move • A/D turn • SPACE fire (ricochets!) • R restart",
      { fontFamily: "Arial", fontSize: "14px", color: "#cfcfcf" }
    );
    hint.setAlpha(0.85);

    // camera
    this.cameras.main.setBounds(0, 0, 960, 540);
  }

  update(time, delta) {
    const dt = delta / 1000;

    // Restart key always available
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.scene.restart();
      return;
    }

    if (!this.registry.get("roundActive")) {
      // still let bullets finish bouncing for a moment, but you can also freeze them if desired
      return;
    }

    this._updatePlayer(dt, time);
    this._updateAI(dt, time);

    this._cleanupBullets(time);
  }

  // -----------------------------
  // Arena / Art
  // -----------------------------
  _createArena() {
    // Visual outline
    const g = this.add.graphics();
    g.lineStyle(4, 0x2c2c2c, 1);
    g.strokeRect(this.ARENA.x, this.ARENA.y, this.ARENA.w, this.ARENA.h);

    // Physics walls as immovable bodies
    this.walls = this.physics.add.staticGroup();

    // Create 4 thin rectangles as static bodies
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

    // Make walls invisible but collidable
    this.walls.children.iterate(w => w.setVisible(false));
  }

  _createTankTextures() {
    // Player tank texture
    if (!this.textures.exists("tank_player")) {
      const tg = this.make.graphics({ x: 0, y: 0, add: false });

      // Body
      tg.fillStyle(0x4ee1ff, 1);
      tg.fillRoundedRect(0, 0, 40, 26, 6);

      // Turret base
      tg.fillStyle(0x2a2a2a, 1);
      tg.fillCircle(20, 13, 7);

      // Barrel
      tg.fillStyle(0x2a2a2a, 1);
      tg.fillRect(20, 11, 18, 4);

      tg.generateTexture("tank_player", 40, 26);
      tg.destroy();
    }

    // AI tank texture
    if (!this.textures.exists("tank_ai")) {
      const tg = this.make.graphics({ x: 0, y: 0, add: false });

      tg.fillStyle(0xff6b6b, 1);
      tg.fillRoundedRect(0, 0, 40, 26, 6);

      tg.fillStyle(0x2a2a2a, 1);
      tg.fillCircle(20, 13, 7);

      tg.fillStyle(0x2a2a2a, 1);
      tg.fillRect(20, 11, 18, 4);

      tg.generateTexture("tank_ai", 40, 26);
      tg.destroy();
    }

    // Bullet texture
    if (!this.textures.exists("bullet")) {
      const bg = this.make.graphics({ x: 0, y: 0, add: false });
      bg.fillStyle(0xf5f5f5, 1);
      bg.fillCircle(4, 4, 4);
      bg.generateTexture("bullet", 8, 8);
      bg.destroy();
    }
  }

  _spawnTank(x, y, texKey, tint) {
    const spr = this.physics.add.image(x, y, texKey);
    spr.setDamping(false);
    spr.setDrag(0, 0);
    spr.setMaxVelocity(this.TANK.maxSpeed, this.TANK.maxSpeed);
    spr.setCollideWorldBounds(false);

    // Arcade body uses axis-aligned size by default; make it a bit tighter
    spr.body.setCircle(13, (spr.width / 2) - 13, (spr.height / 2) - 13);

    spr.setData("tint", tint);
    spr.setData("invulnUntil", 0);

    return spr;
  }

  // -----------------------------
  // Player
  // -----------------------------
  _updatePlayer(dt, time) {
    // Turning
    let turn = 0;
    if (this.keys.a.isDown) turn -= 1;
    if (this.keys.d.isDown) turn += 1;
    this.player.rotation += turn * this.TANK.turnSpeed * dt;

    // Thrust forward/back
    const forward = new Phaser.Math.Vector2(1, 0).rotate(this.player.rotation);
    if (this.keys.w.isDown) {
      this.player.body.velocity.x += forward.x * this.TANK.accel * dt;
      this.player.body.velocity.y += forward.y * this.TANK.accel * dt;
    } else if (this.keys.s.isDown) {
      this.player.body.velocity.x -= forward.x * this.TANK.accel * dt * 0.75;
      this.player.body.velocity.y -= forward.y * this.TANK.accel * dt * 0.75;
    }

    // Friction
    this.player.body.velocity.x *= this.TANK.friction;
    this.player.body.velocity.y *= this.TANK.friction;

    // Fire
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

    // vector to player
    const dx = p.x - a.x;
    const dy = p.y - a.y;

    const dist = Math.sqrt(dx * dx + dy * dy);
    const desiredAngle = Math.atan2(dy, dx);

    // shortest signed angle difference
    let diff = Phaser.Math.Angle.Wrap(desiredAngle - a.rotation);

    // wobble makes it feel less perfect (arcade-ish)
    diff += (Math.random() - 0.5) * this.AI.wobble * dt;

    // turn toward player (clamped)
    const maxTurn = this.TANK.turnSpeed * 0.9 * dt;
    diff = Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
    a.rotation += diff;

    // movement: mostly forward; if too close, "retreat" by turning away a bit and easing off
    const fwd = new Phaser.Math.Vector2(1, 0).rotate(a.rotation);

    if (dist < this.AI.retreatDist) {
      // drift away: slight reverse thrust and sideways turn impulse
      a.body.velocity.x -= fwd.x * this.TANK.accel * dt * 0.35;
      a.body.velocity.y -= fwd.y * this.TANK.accel * dt * 0.35;
      a.rotation += (Math.random() > 0.5 ? 1 : -1) * this.TANK.turnSpeed * 0.5 * dt;
    } else {
      if (Math.random() < this.AI.moveBias) {
        a.body.velocity.x += fwd.x * this.TANK.accel * dt * 0.65;
        a.body.velocity.y += fwd.y * this.TANK.accel * dt * 0.65;
      }
    }

    // friction
    a.body.velocity.x *= this.TANK.friction;
    a.body.velocity.y *= this.TANK.friction;

    // Fire if roughly facing player
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
  _fireBullet(shooter, owner, time) {
    const bullet = this.bullets.get(shooter.x, shooter.y, "bullet");
    if (!bullet) return;

    bullet.setActive(true).setVisible(true);
    bullet.setDepth(5);
    bullet.setCircle(4, 0, 0);
    bullet.setBounce(1, 1);
    bullet.setCollideWorldBounds(false);

    bullet.setData("owner", owner);
    bullet.setData("bornAt", time);

    // Launch from barrel direction
    const dir = new Phaser.Math.Vector2(1, 0).rotate(shooter.rotation);
    const spawnOffset = 28;
    bullet.x = shooter.x + dir.x * spawnOffset;
    bullet.y = shooter.y + dir.y * spawnOffset;

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
    // despawn bullet immediately
    bullet.disableBody(true, true);

    const now = this.time.now;

    // tiny invuln to prevent double-hit overlaps in same frame
    const tank = (which === "player") ? this.player : this.ai;
    const invulnUntil = tank.getData("invulnUntil") || 0;
    if (now < invulnUntil) return;
    tank.setData("invulnUntil", now + 120);

    // damage
    if (which === "player") {
      const hp = this.registry.get("playerHP") - 1;
      this.registry.set("playerHP", hp);
      this._flashTank(tank);

      if (hp <= 0) this._endRound(false, "DESTROYED — You Lose");
    } else {
      const hp = this.registry.get("aiHP") - 1;
      this.registry.set("aiHP", hp);
      this._flashTank(tank);

      // score for hits
      this.registry.set("score", this.registry.get("score") + 100);

      if (hp <= 0) this._endRound(true, "AI DESTROYED — You Win!");
    }
  }

  _flashTank(tank) {
    // quick flash effect (no shaders)
    tank.setAlpha(0.35);
    this.time.delayedCall(80, () => tank.setAlpha(1));
  }

  _endRound(win, message) {
    if (!this.registry.get("roundActive")) return;

    this.registry.set("roundActive", false);
    this.registry.set("message", message);

    // Time bonus on win
    if (win) {
      const t = this.registry.get("timeLeft");
      this.registry.set("score", this.registry.get("score") + t * 10);
    }

    // Freeze tanks (optional)
    this.player.body.setVelocity(0, 0);
    this.ai.body.setVelocity(0, 0);
  }
}
