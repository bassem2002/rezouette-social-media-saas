// Crée un utilisateur de développement à UUID fixe pour tester l'OAuth Meta
// tant que JWT n'est pas implémenté. Utilise `pg` directement (aucune
// compilation TS requise). Idempotent : ON CONFLICT DO NOTHING.
require('dotenv/config')
const { Client } = require('pg')

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL manquant dans .env')
  }

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO users (id, email, "passwordHash", name, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [DEV_USER_ID, 'dev@zernio.local', 'no-auth-placeholder', 'Dev User'],
    )
    console.log('✅ Dev user prêt. userId =', DEV_USER_ID)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('❌ Seed échoué:', err.message)
  process.exit(1)
})
