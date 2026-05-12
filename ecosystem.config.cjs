module.exports = {
  apps: [
    {
      name: "api",
      cwd: "./apps/api",
      script: "dist/index.js",
      env: { NODE_ENV: "production" },
      max_memory_restart: "500M",
      autorestart: true
    },
    {
      name: "worker-scanner",
      cwd: "./apps/workers/scanner",
      script: "dist/index.js",
      env: { NODE_ENV: "production" },
      max_memory_restart: "500M",
      autorestart: true
    },
    {
      name: "worker-detector",
      cwd: "./apps/workers/detector",
      script: "dist/index.js",
      env: { NODE_ENV: "production" },
      max_memory_restart: "500M",
      autorestart: true
    },
    {
      name: "worker-risk-analyzer",
      cwd: "./apps/workers/risk-analyzer",
      script: "dist/index.js",
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
      autorestart: true
    },
    {
      name: "worker-validator-refresh",
      cwd: "./apps/workers/validator-refresh",
      script: "dist/index.js",
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
      autorestart: true
    }
  ]
};
