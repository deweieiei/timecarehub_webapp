const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { photoUrl } = require('../photo');
const { num } = require('../util');

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

const RATE_UNITS = ['per_hour', 'per_day', 'per_month'];

// ต้องตรงกับ <select> ในหน้าบัตรแคร์กิฟเวอร์ (public/js/caregiver.js)
const RADII = [5, 10, 20, 30, 50];

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

// อ่านค่าจากฟอร์มบัตรแคร์กิฟเวอร์ → คืนค่าที่ตรวจแล้ว (โยน error ถ้าไม่ผ่าน)
// ทุกช่องว่างได้หมด ยกเว้นตอนกดยืนยันตัวตนที่บังคับให้ปักหมุดก่อน (ดู /verify)
function readCard(body) {
  const blank = (v) => v === '' || v === null || v === undefined;

  const lat = blank(body.lat) ? null : Number(body.lat);
  const lng = blank(body.lng) ? null : Number(body.lng);

  // มีด้านเดียวไม่ได้ — ครึ่งพิกัดปักหมุดไม่ได้ แถมทำให้เงื่อนไขรัศมีเพี้ยน
  if ((lat === null) !== (lng === null)) throw bad('พิกัดไม่ครบ — ต้องมีทั้งละติจูดและลองจิจูด');
  if (lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) throw bad('ค่าละติจูดไม่ถูกต้อง');
  if (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180)) throw bad('ค่าลองจิจูดไม่ถูกต้อง');

  const rate = blank(body.rate) ? null : Number(body.rate);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) throw bad('เรตที่รับต้องเป็นตัวเลขไม่ติดลบ');

  const exp = Number(body.experience_years);
  const radius = Number(body.service_radius_km);

  return {
    bio: body.bio || null,
    experience_years: Number.isFinite(exp) && exp >= 0 ? Math.min(Math.round(exp), 80) : 0,
    skills: body.skills || null,
    area_label: body.area_label || null,
    lat,
    lng,
    service_radius_km: RADII.includes(radius) ? radius : 10,
    rate,
    rate_unit: RATE_UNITS.includes(body.rate_unit) ? body.rate_unit : 'per_day',
  };
}

function saveCard(userId, f) {
  return db.query(
    `UPDATE caregiver_profiles
        SET bio = ?, experience_years = ?, skills = ?, area_label = ?,
            lat = ?, lng = ?, service_radius_km = ?, rate = ?, rate_unit = ?
      WHERE user_id = ?`,
    [f.bio, f.experience_years, f.skills, f.area_label,
      f.lat, f.lng, f.service_radius_km, f.rate, f.rate_unit, userId]
  );
}

// ---------- สถานะ + บัตรของฉัน ----------
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.kyc_status, c.bio, c.experience_years, c.skills,
            c.area_label, c.lat, c.lng, c.service_radius_km, c.rate, c.rate_unit,
            u.photo_path
       FROM users u
       LEFT JOIN caregiver_profiles c ON c.user_id = u.id
      WHERE u.id = ?`,
    [req.user.id]
  );
  const p = rows[0] || {};

  res.json({
    kyc_status: p.kyc_status || 'none',
    bio: p.bio,
    experience_years: p.experience_years,
    skills: p.skills,
    area_label: p.area_label,
    lat: num(p.lat),
    lng: num(p.lng),
    service_radius_km: p.service_radius_km ?? 10,
    rate: num(p.rate),
    rate_unit: p.rate_unit,
    photo_url: photoUrl(req.user.id, p.photo_path),
  });
});

// ---------- บันทึกบัตร (ไม่แตะสถานะ KYC) ----------
// ต้องมีเส้นนี้แยก เพราะคนที่ยืนยันตัวตนไปแล้วก็ยังต้องย้ายหมุด/แก้เรต/เปลี่ยนทักษะได้
// (ของเดิมมีแต่ /verify ซึ่งปุ่มถูก disable ทิ้งหลังผ่าน = แก้บัตรตัวเองไม่ได้อีกเลย)
router.post('/profile', requireAuth, async (req, res, next) => {
  try {
    await saveCard(req.user.id, readCard(req.body));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- ⭐ ยืนยันตัวตน (โหมดเดโม) — กดปุ่มเดียว ผ่านทันที + บันทึกบัตร ----------
//    บัตรใบนี้คือสิ่งที่ผู้ว่าจ้างเห็นในไดเรกทอรี "หาคนดูแล"
router.post('/verify', requireAuth, async (req, res, next) => {
  try {
    const f = readCard(req.body);

    // ไม่มีหมุด = ไม่โผล่ในผลค้นหาตามรัศมีของผู้ว่าจ้างเลยสักครั้ง
    // ปล่อยผ่านไปก็เท่ากับยืนยันตัวตนเสร็จแล้วนั่งรองานที่ไม่มีวันมา — บังคับปักตั้งแต่ตรงนี้
    if (f.lat === null) throw bad('ปักหมุดย่านที่รับงานก่อน แล้วค่อยกดยืนยันตัวตน');

    await saveCard(req.user.id, f);
    await db.query(
      `UPDATE caregiver_profiles
          SET kyc_status = 'approved', kyc_note = NULL,
              kyc_submitted_at = NOW(), kyc_reviewed_at = NOW()
        WHERE user_id = ?`,
      [req.user.id]
    );

    res.json({ ok: true, kyc_status: 'approved' });
  } catch (e) {
    next(e);
  }
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
