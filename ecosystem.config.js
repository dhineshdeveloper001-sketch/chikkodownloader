module.exports = {
  apps: [
    {
      name: "chikko-downloader",
      script: "./dist/index.js",
      cwd: "./backend",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
