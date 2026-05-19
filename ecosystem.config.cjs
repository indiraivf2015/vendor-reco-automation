/**
 * PM2 ecosystem — Vendor Master Reconciliation API
 *
 * Usage (from repo root on the server):
 *   cd backend && npm ci && npm run build
 *   cd .. && pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'vendor-reco-backend',
      cwd: './backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      node_args: '--max-old-space-size=8192',
      env: {
        NODE_ENV: 'production',
        PORT: 8001,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
