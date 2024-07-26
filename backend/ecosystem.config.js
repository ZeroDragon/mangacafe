module.exports = {
  apps: [
    {
      name: 'mangacafe',
      script: './server.mjs',
      instances: 1,
      max_memory_restart: '100M'
    }
  ]
}
