const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { photoUrl } = require('../photo');
const { ageFrom, num } = require('../util');

const router = express.Router();

// ============================================================
//  ไดเรกทอรีแคร์กิฟเวอร์ — ผู้ว่าจ้างหาคนแล้วยิงคำขอจ้างตรงได้เลย
//
//  ⭐ แสดงเฉพาะคนที่ kyc_status = 'approved' เท่านั้น
//     คนที่ยังไม่ยืนยันตัวตน ไม่โผล่ให้ผู้ว่าจ้างเห็นเลย
//
//  หาได้ 2 แบบ — ล้อกับฝั่งแคร์กิฟเวอร์หางาน (src/routes/jobs.js) ให้เป็นคู่กัน:
//    1) ส่งพิกัด+รัศมีมา → เจอเฉพาะคนที่รับงานแถวนั้น เรียงจากใกล้ไปไกล
//    2) ไม่ส่งพิกัดมา    → เห็นทุกคน เรียงตามประสบการณ์
// ============================================================

// คอลัมน์ที่คนล็อกอินแล้วเห็นได้ — แคร์กิฟเวอร์กรอกมาเพื่อให้ผู้ว่าจ้างเห็นอยู่แล้ว
//
// ⚠️ ห้ามเติม u.* หรือคอลัมน์อ่อนไหว (national_id, addr_*, emergency_*) ลงในนี้
//    ลิสต์นี้ถูกใช้ทั้งหน้ารายการและหน้าบัตร — เผลอเติมทีเดียวหลุดทั้ง 2 ที่
const LIST_COLS = `u.id, u.full_name, u.photo_path,
       c.bio, c.experience_years, c.skills, c.area_label,
       c.lat, c.lng, c.service_radius_km, c.rate, c.rate_unit,
       c.rating_avg, c.rating_count`;

// path ในดิสก์ไม่ใช่เรื่องที่หน้าเว็บต้องรู้ → แปลงเป็น URL ก่อนส่งออกเสมอ
// DECIMAL จาก mysql2 มาเป็นสตริง → แปลงเป็นตัวเลข ไม่งั้น Leaflet ปักหมุดไม่ขึ้น
function shape(row) {
  const { photo_path, ...c } = row;
  return {
    ...c,
    lat: num(c.lat),
    lng: num(c.lng),
    rate: num(c.rate),
    rating_avg: num(c.rating_avg),
    distance_km: num(c.distance_km),
    photo_url: photoUrl(c.id, photo_path),
  };
}

// ---------- ค้นหา: GET /api/caregivers?lat=..&lng=..&radius_km=10&q=.. ----------
router.get('/', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.min(Number(req.query.radius_km) || 20, 100);
  const near = Number.isFinite(lat) && Number.isFinite(lng);

  const where = ["c.kyc_status = 'approved'", 'u.id <> ?'];
  const params = [req.user.id];   // ไม่ต้องโชว์ตัวเอง

  if (q) {
    where.push('(u.full_name LIKE ? OR c.skills LIKE ? OR c.area_label LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  // สูตร Haversine ตัวเดียวกับฝั่งหางาน — คำนวณระยะทางบนผิวโลก
  // คนที่ยังไม่ปักหมุด lat/lng จะได้ distance_km = NULL → ตกเงื่อนไข <= ? ไปเองโดยปริยาย
  const distance = near
    ? `(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(c.lat)) *
        COS(RADIANS(c.lng) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(c.lat))))) AS distance_km`
    : 'NULL AS distance_km';

  const sql = `
    SELECT * FROM (
      SELECT ${LIST_COLS}, ${distance}
        FROM users u
        JOIN caregiver_profiles c ON c.user_id = u.id
       WHERE ${where.join(' AND ')}
    ) t
    ${near ? 'WHERE t.distance_km <= ? ORDER BY t.distance_km ASC' : 'ORDER BY t.experience_years DESC'}
    LIMIT 100`;

  // ลำดับ params ต้องตรงกับลำดับ ? ในสตริง SQL: ระยะทาง (ใน SELECT) → เงื่อนไข WHERE → รัศมี
  const [rows] = await db.query(sql, [
    ...(near ? [lat, lng, lat] : []),
    ...params,
    ...(near ? [radius] : []),
  ]);

  res.json({ items: rows.map(shape) });
});

// ---------- บัตรแคร์กิฟเวอร์ 1 ใบ — หน้าที่ผู้ว่าจ้างกดเข้ามาดูก่อนตัดสินใจจ้าง ----------
//
// ⚠️ เลขบัตรประชาชน: ปิดบังในตัว SQL เลย — เลขตัวเต็มไม่เคยออกมาถึงโค้ด Node ด้วยซ้ำ
//    ผู้ว่าจ้างเห็นแค่ 2 หลักท้าย + หลักตรวจสอบ (x-xxxx-xxxxx-12-3)
//    พอให้เอาไปทาบกับบัตรตัวจริงตอนเจอหน้ากันว่าใช่คนเดียวกันไหม
//    แต่ไม่พอให้ใครเอาไปสวมรอยที่อื่น (พี่ดิวเลือกแบบนี้ 2026-07-17)
router.get('/:id', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${LIST_COLS},
            u.gender, u.nationality, u.birth_date,
            c.kyc_reviewed_at,
            IF(u.national_id IS NULL, NULL,
               CONCAT('x-xxxx-xxxxx-', SUBSTRING(u.national_id, 11, 2), '-', RIGHT(u.national_id, 1))
            ) AS national_id_masked
       FROM users u
       JOIN caregiver_profiles c ON c.user_id = u.id
      WHERE u.id = ? AND c.kyc_status = 'approved'`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบแคร์กิฟเวอร์คนนี้' });

  // ส่งอายุ ไม่ส่งวันเกิด — ผู้ว่าจ้างอยากรู้แค่ว่าอายุเท่าไหร่ ไม่ต้องรู้ว่าเกิดวันไหน
  const { birth_date, ...c } = shape(rows[0]);
  res.json({ caregiver: { ...c, age: ageFrom(birth_date) } });
});

module.exports = router;
