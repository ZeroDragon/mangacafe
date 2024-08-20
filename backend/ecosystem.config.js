module.exports = {
  apps: [
    {
      name: 'mangacafe',
      script: './src/index.mjs',
      instances: 1,
      max_memory_restart: '100M',
      cron_restart: '0 0 * * *'
    }
  ]
}
