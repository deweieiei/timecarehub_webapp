// สร้างแคร์กิฟเวอร์ตัวอย่าง 5 คน (ยืนยันตัวตนแล้วทุกคน) — `npm run seed`
// รันซ้ำได้: ถ้ามีอยู่แล้วจะอัปเดตข้อมูลทับ ไม่สร้างซ้ำ
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const PASSWORD = 'password123';

const CAREGIVERS = [
  {
    email: 'care1@demo.com', full_name: 'สมหญิง ดูแลดี', phone: '081-234-5601',
    experience_years: 5, skills: 'ผู้ช่วยพยาบาล, ให้อาหารทางสายยาง, จัดยา',
    bio: 'จบผู้ช่วยพยาบาล ดูแลผู้สูงอายุมา 5 ปี ถนัดดูแลผู้ป่วยเบาหวานและความดัน ใจเย็น พูดจาไพเราะค่ะ',
    area_label: 'ลาดพร้าว', lat: 13.8161, lng: 100.5601, service_radius_km: 20, rate: 700, rate_unit: 'per_day',
  },
  {
    email: 'care2@demo.com', full_name: 'บุญมี ใจเย็น', phone: '081-234-5602',
    experience_years: 8, skills: 'ดูแลผู้ป่วยติดเตียง, ทำกายภาพบำบัด, พลิกตัว',
    bio: 'ประสบการณ์ 8 ปี เชี่ยวชาญผู้ป่วยติดเตียงโดยเฉพาะ ทำแผลกดทับได้ พลิกตัวทุก 2 ชม. ตามมาตรฐาน',
    area_label: 'บางกะปิ', lat: 13.7657, lng: 100.6470, service_radius_km: 10, rate: 900, rate_unit: 'per_day',
  },
  {
    email: 'care3@demo.com', full_name: 'วิภา อ่อนโยน', phone: '081-234-5603',
    experience_years: 3, skills: 'ทำอาหารผู้สูงอายุ, พาไปหาหมอ, ทำความสะอาด',
    bio: 'ทำอาหารอ่อน อาหารเบาหวานได้ ขับรถเป็น พาไปหาหมอตามนัดได้ มีรถส่วนตัวค่ะ',
    area_label: 'จตุจักร', lat: 13.8000, lng: 100.5530, service_radius_km: 20, rate: 600, rate_unit: 'per_day',
  },
  {
    email: 'care4@demo.com', full_name: 'ประยูร มั่นคง', phone: '081-234-5604',
    experience_years: 10, skills: 'ผู้ช่วยพยาบาล, วัดความดัน/น้ำตาล, ดูแลผู้ป่วยอัลไซเมอร์',
    bio: 'ผู้ชาย อายุ 45 แข็งแรง ยกและประคองผู้สูงอายุตัวใหญ่ได้ ประสบการณ์ 10 ปี ทำงานโรงพยาบาลมาก่อน',
    area_label: 'รามคำแหง', lat: 13.7570, lng: 100.6445, service_radius_km: 30, rate: 1000, rate_unit: 'per_day',
  },
  {
    email: 'care5@demo.com', full_name: 'กนกวรรณ ยิ้มแย้ม', phone: '081-234-5605',
    experience_years: 2, skills: 'ดูแลทั่วไป, ค้างคืนได้, เป็นเพื่อนคุย',
    bio: 'อายุ 28 ค่ะ รับงานค้างคืนได้ ถนัดเป็นเพื่อนคุย พาเดินออกกำลังกาย ราคาย่อมเยา',
    area_label: 'ดินแดง', lat: 13.7700, lng: 100.5540, service_radius_km: 10, rate: 550, rate_unit: 'per_day',
  },
];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  const hash = await bcrypt.hash(PASSWORD, 10);

  for (const c of CAREGIVERS) {
    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [c.email]);
    let id;

    if (existing.length) {
      id = existing[0].id;
      await conn.query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [c.full_name, c.phone, id]);
    } else {
      const [r] = await conn.query(
        'INSERT INTO users (email, password_hash, full_name, phone, active_role) VALUES (?,?,?,?,?)',
        [c.email, hash, c.full_name, c.phone, 'caregiver']
      );
      id = r.insertId;
      await conn.query('INSERT INTO caregiver_profiles (user_id) VALUES (?)', [id]);
    }

    // ยืนยันตัวตนให้เลย (โหมดเดโม)
    await conn.query(
      `UPDATE caregiver_profiles
          SET bio = ?, experience_years = ?, skills = ?,
              area_label = ?, lat = ?, lng = ?, service_radius_km = ?, rate = ?, rate_unit = ?,
              kyc_status = 'approved', kyc_submitted_at = NOW(), kyc_reviewed_at = NOW()
        WHERE user_id = ?`,
      [c.bio, c.experience_years, c.skills, c.area_label, c.lat, c.lng, c.service_radius_km, c.rate, c.rate_unit, id]
    );

    console.log(`✅ ${c.full_name.padEnd(20)} ${c.email.padEnd(18)} ${c.area_label}`);
  }

  console.log(`\nแคร์กิฟเวอร์ตัวอย่าง ${CAREGIVERS.length} คน พร้อมใช้ — รหัสผ่านทุกคน: ${PASSWORD}`);
  await conn.end();
})().catch((e) => {
  console.error('❌ seed ไม่สำเร็จ:', e.message);
  process.exit(1);
});
