import process from 'node:process'

if (process.env.NIBOR_ACCESS_CONFIRMED !== '1') {
  console.error([
    'Deploy bloqueado por seguridad.',
    'Configura primero Cloudflare Access para nibor.com y autoriza solo el correo del propietario.',
    'Después confirma conscientemente en PowerShell:',
    "$env:NIBOR_ACCESS_CONFIRMED='1'; npm run deploy",
  ].join('\n'))
  process.exit(1)
}

console.log('Confirmación de Cloudflare Access recibida; deploy habilitado para esta ejecución.')
