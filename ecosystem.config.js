module.exports = {
  apps: [
    {
      name: 'metro-tracker-api',
      script: './backend/server.js',
      instances: 'max', // Scale to all available CPU cores
      exec_mode: 'cluster', // Enables clustering for high concurrency
      env: {
        NODE_ENV: 'development',
        PORT: 4000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 80 // Or whichever production port is desired
      }
    }
  ]
};
