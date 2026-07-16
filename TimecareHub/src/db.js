const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'Z',   // "เวลาที่อ่านจาก DB คือ UTC" — ต้องคู่กับ SET time_zone ข้างล่างเสมอ
});

// ============================================================
//  ⚠️ บรรทัดล่างนี้สำคัญมาก อย่าลบ — เคยทำให้เวลาทุกที่ในเว็บล้ำหน้าไป 7 ชม. มาแล้ว
//
//  ปมคือ: MySQL ตั้ง time_zone = SYSTEM (เวลาไทย) → NOW() คืน '03:50' ซึ่งคือ 03:50 เวลาไทย
//         แต่ข้างบนเราสั่ง timezone:'Z' = "อ่านทุกเวลาว่าเป็น UTC" → mysql2 เข้าใจเป็น 03:50 UTC
//         เบราว์เซอร์แปลง UTC เป็นเวลาไทยอีกรอบ → โชว์ 10:50 ทั้งที่เพิ่งส่งข้อความไปเมื่อกี้
//
//  แก้โดยบังคับ session ของ DB ให้พูด UTC → 2 ฝั่งพูดภาษาเดียวกัน
//  วิธีนี้ถูกต้องไม่ว่าเครื่อง server จะตั้ง timezone อะไรไว้ (เครื่องจริงกับเครื่อง dev ตั้งไม่เหมือนกันได้)
//
//  mysql2 คิวคำสั่งต่อ 1 connection ตามลำดับ → SET นี้วิ่งก่อน query แรกของคนที่ขอ connection เสมอ
// ============================================================
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

module.exports = pool;
