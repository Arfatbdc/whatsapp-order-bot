require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const token = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

pool.query(
  'UPDATE stores SET whatsapp_token = $1 WHERE whatsapp_phone_id = $2 RETURNING id',
  [token, phoneId]
).then(r => {
  if (r.rows[0]) console.log('Token updated for store:', r.rows[0].id);
  else console.log('No store found with phone_id:', phoneId);
  pool.end();
}).catch(e => {
  console.error('Error:', e.message);
  pool.end();
});
