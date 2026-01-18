class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create() {
    this.ui = {};

    this.ui.dim = this.add
      .rectangle(480, 270, 960, 540, 0x000000, 0.7)
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(0);

    this.ui.hpText = this.add.text(16, 14, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#eaeaea"
    });

    this.ui.timeText = this.add.text(16, 40, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#eaeaea"
    });

    this.ui.scoreText = this.add.text(16, 66, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#eaeaea"
    });

    this.ui.boostText = this.add.text(16, 92, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#eaeaea"
    });

    this.ui.boostBar = this.add.graphics();

    this.ui.matchText = this.add.text(16, 134, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#eaeaea"
    });

    this.ui.weaponText = this.add.text(16, 160, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#eaeaea"
    });

    this.ui.centerMsg = this.add.text(480, 270, "", {
      fontFamily: "Arial",
      fontSize: "34px",
      color: "#ffffff",
      align: "center"
    }).setOrigin(0.5).setAlpha(0).setDepth(2);

    this.ui.subMsg = this.add.text(480, 330, "Press R to Restart", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#cfcfcf",
      align: "center"
    }).setOrigin(0.5).setAlpha(0).setDepth(2);

    this.ui.hpText.setDepth(0);
    this.ui.timeText.setDepth(0);
    this.ui.scoreText.setDepth(0);
    this.ui.boostText.setDepth(0);
    this.ui.boostBar.setDepth(0);
    this.ui.matchText.setDepth(0);
    this.ui.weaponText.setDepth(0);
    this.ui.dim.setDepth(1);
    this.ui.centerMsg.setDepth(2);
    this.ui.subMsg.setDepth(2);

    // Update UI frequently
    this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => this._refresh()
    });
  }

  _refresh() {
    this.ui.dim.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.ui.dim.width = this.scale.width;
    this.ui.dim.height = this.scale.height;

    const pHP = this.registry.get("playerHP");
    const aHP = this.registry.get("aiHP");
    const t = this.registry.get("timeLeft");
    const score = this.registry.get("score");

    this.ui.hpText.setText(`HP  You: ${pHP}    AI: ${aHP}`);
    this.ui.timeText.setText(`Time Left: ${t}s`);
    this.ui.scoreText.setText(`Score: ${score}`);

    // Match info
    const pW = this.registry.get("playerWins") || 0;
    const aW = this.registry.get("aiWins") || 0;
    const toWin = this.registry.get("winsToWin") || 3;
    const roundNum = this.registry.get("roundNumber") || 0;
    const maxRounds = this.registry.get("maxRounds") || (toWin * 2 - 1);
    this.ui.matchText.setText(
      `Match  You: ${pW}    AI: ${aW}   (First to ${toWin})   • Round ${roundNum}/${maxRounds}`
    );

    const pWpn = (this.registry.get("playerWeapon") || "normal");
    const aWpn = (this.registry.get("aiWeapon") || "normal");
    const pretty = (k) => {
      const s = String(k || "normal").toUpperCase();
      if (s === "NORMAL") return "NORMAL";
      if (s === "HEAVY") return "HEAVY";
      if (s === "SCATTER") return "SCATTER";
      if (s === "LONG") return "LONG";
      return s;
    };
    this.ui.weaponText.setText(`Weapon  You: ${pretty(pWpn)}    AI: ${pretty(aWpn)}`);

    // Boost UI
    const now = this.time.now;
    const activeUntil = this.registry.get("boostActiveUntil") || 0;
    const readyAt = this.registry.get("boostReadyAt") || 0;
    const cdMs = this.registry.get("boostCooldownMs") || 1;

    let label = "Boost: READY";
    let pct = 1;

    if (now < activeUntil) {
      const left = Math.ceil((activeUntil - now) / 100) / 10;
      label = `Boost: ACTIVE ${left.toFixed(1)}s`;
      pct = 1;
    } else if (now < readyAt) {
      const leftMs = readyAt - now;
      const left = Math.ceil(leftMs / 100) / 10;
      label = `Boost: COOLDOWN ${left.toFixed(1)}s`;
      pct = 1 - Phaser.Math.Clamp(leftMs / cdMs, 0, 1);
    }

    this.ui.boostText.setText(label);

    const x = 16;
    const y = 118;
    const w = 200;
    const h = 10;

    this.ui.boostBar.clear();
    this.ui.boostBar.lineStyle(2, 0xffffff, 0.35);
    this.ui.boostBar.strokeRect(x, y, w, h);
    this.ui.boostBar.fillStyle(0xffffff, 0.35);
    this.ui.boostBar.fillRect(x, y, Math.floor(w * pct), h);

    // Center overlay messages
    const active = this.registry.get("roundActive");
    const msg = this.registry.get("message") || "";
    const state = this.registry.get("gameState") || "";
    const overlayUp = (!active && !!msg) || state === "menu" || state === "betweenRounds" || state === "paused" || state === "summary";

    if (overlayUp && msg) {
      this.ui.dim.setAlpha(1);
      this.ui.centerMsg.setText(msg);
      const sub = this.registry.get("subMessage") || "Press R to Restart";
      this.ui.subMsg.setText(sub);

      const cx = this.scale.width / 2;
      const cy = this.scale.height / 2;
      this.ui.centerMsg.setPosition(cx, cy - 40);
      this.ui.subMsg.setPosition(cx, cy + 90);

      const b = this.ui.centerMsg.getBounds();
      this.ui.subMsg.y = Math.min(this.scale.height - 70, b.bottom + 28);

      this.ui.centerMsg.setAlpha(1);
      this.ui.subMsg.setAlpha(1);
    } else {
      this.ui.dim.setAlpha(0);
      this.ui.centerMsg.setAlpha(0);
      this.ui.subMsg.setAlpha(0);
    }
  }
}
