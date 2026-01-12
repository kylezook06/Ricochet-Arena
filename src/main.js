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
    scene: [BootScene, GameScene, UIScene]
  };

  new Phaser.Game(config);
})();
