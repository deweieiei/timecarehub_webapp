// รันไฟล์ .sql ทุกไฟล์ในโฟลเดอร์ db/ เรียงตามชื่อ — `npm run migrate`
// รันซ้ำได้ปลอดภัย: ข้าม error ประเภท "มีอยู่แล้ว" (คอลัมน์ซ้ำ / คีย์ซ้ำ / ตารางมีแล้ว)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// error ที่แปลว่า "ของนี้มีอยู่แล้ว" — ข้ามได้ ไม่ใช่ความผิดพลาดจริง
const SKIP = new Set([
  'ER_DUP_FIELDNAME',   // คอลัมน์มีอยู่แล้ว
  'ER_DUP_KEYNAME',     // คีย์/FK มีอยู่แล้ว
  'ER_TABLE_EXISTS_ERROR',
  'ER_FK_DUP_NAME',
]);

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');

    // ตัดคอมเมนต์ออกก่อน แล้วแยกเป็นคำสั่งทีละอัน
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    let ran = 0;
    let skipped = 0;

    for (const stmt of statements) {
      try {
        await conn.query(stmt);
        ran++;
      } catch (e) {
        if (SKIP.has(e.code)) { skipped++; continue; }
        console.error(`\n❌ ${file} ล้มเหลว:\n${stmt.slice(0, 120)}...\n→ ${e.message}`);
        process.exit(1);
      }
    }
    console.log(`✅ ${file} — รัน ${ran} คำสั่ง, ข้าม ${skipped} (มีอยู่แล้ว)`);
  }

  const [rows] = await conn.query('SHOW TABLES');
  console.log('\nตารางในฐานข้อมูล:', rows.map((r) => Object.values(r)[0]).join(', '));

  await conn.end();
})().catch((e) => {
  console.error('❌ migrate ไม่สำเร็จ:', e.message);
  process.exit(1);
});
