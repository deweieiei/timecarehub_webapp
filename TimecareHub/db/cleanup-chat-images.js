// ============================================================
//  กวาดรูปแชทที่ไม่มีข้อความอ้างถึงแล้ว
//     ดูเฉย ๆ ไม่ลบ : npm run cleanup:chat
//     ลบจริง        : npm run cleanup:chat -- --delete
//
//  รูปกำพร้าเกิดได้ 2 ทาง:
//    1. ลบงานหรือลบผู้ใช้ → แถวใน messages หายไปทาง ON DELETE CASCADE ที่ชั้น DB
//       CASCADE ทำในตัว MySQL เอง Node ไม่มีทางรู้ว่าแถวไหนหายไป → ไฟล์ค้างบนดิสก์ตลอดกาล
//    2. อัปโหลดขึ้นมาแล้วโปรเซสตายก่อนบันทึกลง DB (ตัวจับ error ปกติเก็บกวาดให้อยู่แล้ว
//       แต่ถ้าโดน kill กลางคันมันไม่ได้ทำงาน)
//
//  ค่าเริ่มต้นคือ "ดูเฉย ๆ" โดยตั้งใจ — ลบไฟล์รูปคนไข้ผิดตัวแล้วเอาคืนไม่ได้
//  รันมือเป็นครั้งคราวก็พอ หรือใส่ cron รายเดือนบน serverlive
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const CHAT_DIR = path.join(__dirname, '..', 'uploads', 'chat');
const APPLY = process.argv.includes('--delete');

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

(async () => {
  if (!fs.existsSync(CHAT_DIR)) {
    console.log('ยังไม่มีโฟลเดอร์ uploads/chat — ไม่มีอะไรให้กวาด');
    return;
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  const [rows] = await conn.query('SELECT image_path FROM messages WHERE image_path IS NOT NULL');
  await conn.end();

  // image_path เก็บเป็น path เทียบจาก uploads/ เช่น 'chat/12/a1b2....jpg'
  const alive = new Set(rows.map((r) => r.image_path));
  console.log(`รูปที่ยังมีข้อความอ้างถึง: ${alive.size} ไฟล์\n`);

  let orphans = 0;
  let bytes = 0;

  for (const dir of fs.readdirSync(CHAT_DIR)) {
    const full = path.join(CHAT_DIR, dir);
    if (!fs.statSync(full).isDirectory()) continue;

    for (const name of fs.readdirSync(full)) {
      const rel = `chat/${dir}/${name}`;
      if (alive.has(rel)) continue;

      const file = path.join(full, name);
      orphans++;
      bytes += fs.statSync(file).size;
      console.log(`${APPLY ? '🗑  ลบ ' : '•  พบ '} ${rel}`);
      if (APPLY) fs.unlinkSync(file);
    }

    // โฟลเดอร์ของงานที่ไม่เหลือรูปแล้ว เก็บทิ้งไปด้วย
    if (APPLY && !fs.readdirSync(full).length) fs.rmdirSync(full);
  }

  if (!orphans) {
    console.log('✅ ไม่มีรูปกำพร้า — สะอาดอยู่แล้ว');
    return;
  }

  console.log(`\n${APPLY ? '✅ ลบแล้ว' : 'พบ'} ${orphans} ไฟล์ (${mb(bytes)} MB)`);
  if (!APPLY) console.log('→ ถ้าตรวจแล้วโอเค สั่งลบจริงด้วย: npm run cleanup:chat -- --delete');
})().catch((e) => {
  console.error('❌ กวาดรูปไม่สำเร็จ:', e.message);
  process.exit(1);
});
