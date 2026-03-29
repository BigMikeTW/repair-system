module.exports = {
  apps: [
    {
      name: 'repair-system-api',
      script: './backend/src/index.js',
      cwd: '/var/www/repair-system',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: '/var/log/repair-system/error.log',
      out_file: '/var/log/repair-system/out.log',
      log_file: '/var/log/repair-system/combined.log',
      time: true,
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
    }
  ]
};
