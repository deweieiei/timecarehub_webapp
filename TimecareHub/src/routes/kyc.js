const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

// ============================================================
//  ⚠️ โหมดเดโม — KYC แบบกดปุ่มเดียวผ่านเลย
//
//  ของเดิม: อัปรูปบัตร ปชช. + เซลฟี่ → เข้าคิว → แอดมินกดอนุมัติ
//  ตอนนี้ : กดปุ่ม "ยืนยันตัวตน" → approved ทันที (ไม่มีไฟล์ ไม่มีแอดมิน)
//
//  เหตุผล: เดโมยาก — ต้องหารูปมาอัป แล้วต้องสลับไปล็อกอินเป็นแอดมินอีกรอบ
//
//  ⭐ สิ่งที่ "ไม่ได้" ถอดออก: kyc_status ยังคุม GPS 2 ระดับเหมือนเดิม
//     none/pending → เห็นพิกัดเบลอ + กดขอรับงานไม่ได้
//     approved     → เห็นพิกัดเป๊ะ + ที่อยู่เต็ม + กดขอรับงานได้
//
//  🔁 จะเปิด KYC จริงกลับมา: ดู db/schema.sql (คอลัมน์ kyc_id_card / kyc_selfie
//     ยังอยู่ครบ ไม่ได้ลบ) แล้วเอาโค้ดอัปโหลด+คิวแอดมินกลับมาใส่ที่ไฟล์นี้
// ============================================================

// สถานะ + โปรไฟล์ของฉัน
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM caregiver_profiles WHERE user_id = ?', [req.user.id]);
  const p = rows[0] || {};
  res.json({
    kyc_status: p.kyc_status || 'none',
    bio: p.bio,
    experience_years: p.experience_years,
    skills: p.skills,
    area_label: p.area_label,
    rate: p.rate,
    rate_unit: p.rate_unit,
  });
});

// ⭐ ยืนยันตัวตน (โหมดเดโม) — กดปุ่มเดียว ผ่านทันที + บันทึกโปรไฟล์
//    โปรไฟล์นี้คือสิ่งที่ผู้ว่าจ้างเห็นในไดเรกทอรี "หาคนดูแล"
router.post('/verify', requireAuth, async (req, res) => {
  const { bio, experience_years, skills, area_label, rate, rate_unit } = req.body;
  const RATE_UNITS = ['per_hour', 'per_day', 'per_month'];

  await db.query(
    `UPDATE caregiver_profiles
        SET bio = ?, experience_years = ?, skills = ?,
            area_label = ?, rate = ?, rate_unit = ?,
            kyc_status = 'approved', kyc_note = NULL,
            kyc_submitted_at = NOW(), kyc_reviewed_at = NOW()
      WHERE user_id = ?`,
    [
      bio || null,
      Number(experience_years) || 0,
      skills || null,
      area_label || null,
      rate ? Number(rate) : null,
      RATE_UNITS.includes(rate_unit) ? rate_unit : 'per_day',
      req.user.id,
    ]
  );

  res.json({ ok: true, kyc_status: 'approved' });
});

// ---------- แอดมิน ----------

// รายชื่อแคร์กิฟเวอร์ทั้งหมด + สถานะ (แทนที่คิวอนุมัติเดิม)
router.get('/caregivers', requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
            c.bio, c.experience_years, c.skills, c.kyc_status,
            c.kyc_reviewed_at, c.rating_avg, c.rating_count,
            (SELECT COUNT(*) FROM job_applications a WHERE a.caregiver_id = u.id) AS applied_count
       FROM users u
       JOIN caregiver_profiles c ON c.user_id = u.id
      ORDER BY c.kyc_status = 'approved' DESC, u.created_at DESC`
  );
  res.json({ items: rows });
});

// แอดมินเพิกถอนการยืนยันตัวตน (เผื่ออยากโชว์ตอนเดโมว่าคุมได้)
router.post('/revoke/:userId', requireAuth, requireAdmin, async (req, res) => {
  await db.query(
    "UPDATE caregiver_profiles SET kyc_status = 'none', kyc_reviewed_at = NOW() WHERE user_id = ?",
    [req.params.userId]
  );
  res.json({ ok: true });
});

module.exports = router;
