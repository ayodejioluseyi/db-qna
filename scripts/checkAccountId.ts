import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' }); // load .env.local creds

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  });

  // Step 1: Show which tables have account_id
  const [tables]: any = await conn.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];

  for (const row of tables) {
    const table = row[tableKey];
    const [cols]: any = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const hasAccountId = cols.some((c: any) => c.Field === 'account_id');
    console.log(`${table}: ${hasAccountId ? '✅ has account_id' : '❌ no account_id'}`);
  }

  // Step 2: Pull distinct account_ids from the tables we care about
  const [restaurantIds]: any = await conn.query(
    'SELECT DISTINCT account_id FROM restaurant WHERE account_id IS NOT NULL LIMIT 50'
  );
  console.log('\nDistinct account_ids in restaurant:', restaurantIds);

  const [userIds]: any = await conn.query(
    'SELECT DISTINCT account_id FROM user WHERE account_id IS NOT NULL LIMIT 50'
  );
  console.log('\nDistinct account_ids in user:', userIds);

  await conn.end();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
});
