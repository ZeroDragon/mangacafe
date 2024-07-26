import { readFileSync } from 'fs'

// Lee el archivo .env para cargar las variables de entorno
// no se usa otra estrategia porque esta funciona para el CI/CD
readFileSync('../.env', 'utf8')
  .split('\n')
  .filter(line => line.length > 0)
  .map(line => line.split(' '))
  .forEach(([variable, ...value]) => {
    process.env[variable] = value.join(' ')
  })
