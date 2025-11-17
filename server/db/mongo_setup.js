/*
  Simple MongoDB setup/seed script.

  Usage:
    MONGODB_URI="your-mongodb-uri" node mongo_setup.js [--seed-email=email --seed-password=pass]

  Or create a .env with MONGODB_URI and run:
    node mongo_setup.js --seed-email=test@example.com --seed-password=pass123

  This will:
  - connect to the DB
  - ensure the `users` collection has an index on `email`
  - optionally create a test user
*/

require('dotenv').config();
const db = require('./mongo');

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--seed-email=')) out.seedEmail = arg.split('=')[1];
    if (arg.startsWith('--seed-password=')) out.seedPassword = arg.split('=')[1];
  }
  return out;
}

async function main() {
  const { seedEmail, seedPassword } = parseArgs();
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required. Set it in the environment or in a .env file.');
    process.exit(1);
  }
  try {
    await db.init();
    console.log('Connected to MongoDB and ensured indexes.');

    if (seedEmail && seedPassword) {
      const existing = await db.findUserByEmail(seedEmail);
      if (existing) {
        console.log('Seed user already exists:', seedEmail);
      } else {
        const user = await db.createUser({ email: seedEmail, password: seedPassword, name: 'Seed User' });
        console.log('Created seed user:', user);
      }
    } else {
      console.log('No seed user requested. To seed run with --seed-email and --seed-password');
    }
    process.exit(0);
  } catch (err) {
    console.error('Error setting up MongoDB:', err);
    process.exit(2);
  }
}

main();
