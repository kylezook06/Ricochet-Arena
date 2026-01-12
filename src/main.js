(() => {
  const config = {
    type: Phaser.AUTO,
    width: 960,
    height: 540,
    backgroundColor: "#141414",
    physics: {
      default: "arcade",
      arcade: {
        debug: false
      }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BootScene, GameScene, UIScene]
  };

  new Phaser.Game(config);
})();
