class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // No external assets needed.
    // If you add any later, load them here.
  }

  create() {
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }
}
