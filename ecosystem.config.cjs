module.exports = {
  apps: [
    {
      name: "rpg-minigame",
      script: "server/static-server.mjs",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "4002",
        HOSTS: "127.0.0.1,::1",
      },
    },
  ],
};
