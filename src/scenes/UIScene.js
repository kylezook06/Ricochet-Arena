class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create() {
    this.ui = {};

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

    this.ui.centerMsg = this.add.text(480, 270, "", {
      fontFamily: "Arial",
      fontSize: "34px",
      color: "#ffffff",
      align: "center"
    }).setOrigin(0.5).setAlpha(0);

    this.ui.subMsg = this.add.text(480, 315, "Press R to Restart", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#cfcfcf"
    }).setOrigin(0.5).setAlpha(0);

    // Update UI frequently
    this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => this._refresh()
    });
  }

  _refresh() {
    const pHP = this.registry.get("playerHP");
    const aHP = this.registry.get("aiHP");
    const t = this.registry.get("timeLeft");
    const score = this.registry.get("score");

    this.ui.hpText.setText(`HP  You: ${pHP}    AI: ${aHP}`);
    this.ui.timeText.setText(`Time Left: ${t}s`);
    this.ui.scoreText.setText(`Score: ${score}`);

    const active = this.registry.get("roundActive");
    const msg = this.registry.get("message") || "";

    if (!active && msg) {
      this.ui.centerMsg.setText(msg);
      this.ui.centerMsg.setAlpha(1);
      this.ui.subMsg.setAlpha(1);
    } else {
      this.ui.centerMsg.setAlpha(0);
      this.ui.subMsg.setAlpha(0);
    }
  }
}
