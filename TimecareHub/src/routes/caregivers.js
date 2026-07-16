const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// ============================================================
//  ไดเรกทอรีแคร์กิฟเวอร์ — ผู้ว่าจ้างเดินดูโปรไฟล์แล้วจ้างตรงได้เลย
//  ไม่ต้องโพสงาน ไม่ต้องปักหมุด
//
//  ⭐ แสดงเฉพาะคนที่ kyc_status = 'approved' เท่านั้น
//     คนที่ยังไม่ยืนยันตัวตน จะไม่โผล่ให้ผู้ว่าจ้างเห็นเลย
// ============================================================

router.get('/', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  const params = [];

  let sql = `
    SELECT u.id, u.full_name,
           c.bio, c.experience_years, c.skills,
           c.area_label, c.lat, c.lng, c.rate, c.rate_unit
      FROM users u
      JOIN caregiver_profiles c ON c.user_id = u.id
     WHERE c.kyc_status = 'approved'
       AND u.id <> ?`;
  params.push(req.user.id);   // ไม่ต้องโชว์ตัวเอง

  if (q) {
    sql += ' AND (u.full_name LIKE ? OR c.skills LIKE ? OR c.area_label LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ' ORDER BY c.experience_years DESC LIMIT 100';

  const [rows] = await db.query(sql, params);
  res.json({ items: rows });
});

// โปรไฟล์แคร์กิฟเวอร์ 1 คน
router.get('/:id', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.full_name,
            c.bio, c.experience_years, c.skills,
            c.area_label, c.lat, c.lng, c.rate, c.rate_unit
       FROM users u
       JOIN caregiver_profiles c ON c.user_id = u.id
      WHERE u.id = ? AND c.kyc_status = 'approved'`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบแคร์กิฟเวอร์คนนี้' });
  res.json({ caregiver: rows[0] });
});

module.exports = router;
