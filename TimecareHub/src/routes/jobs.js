const express = require('express');
const db = require('../db');
const { requireAuth, requireApprovedCaregiver } = require('../auth');
const { maskJob } = require('../geo');
const { photoUrl } = require('../photo');

const router = express.Router();

const CARE_TYPES = ['hourly', 'daily', 'overnight', 'live_in'];
const BUDGET_UNITS = ['per_hour', 'per_day', 'per_month', 'total'];

// ---------- ผู้ว่าจ้าง: โพสงาน ----------
router.post('/', requireAuth, async (req, res) => {
  const {
    title, elder_condition, tasks, care_type, start_date, end_date,
    budget, budget_unit, lat, lng, address, area_label,
  } = req.body;

  if (!title || !budget || lat == null || lng == null) {
    return res.status(400).json({ error: 'ต้องกรอกหัวข้องาน งบประมาณ และปักหมุดตำแหน่ง' });
  }
  if (!CARE_TYPES.includes(care_type)) return res.status(400).json({ error: 'ประเภทงานไม่ถูกต้อง' });
  if (!BUDGET_UNITS.includes(budget_unit)) return res.status(400).json({ error: 'หน่วยงบไม่ถูกต้อง' });

  const [r] = await db.query(
    `INSERT INTO jobs
       (employer_id, title, elder_condition, tasks, care_type, start_date, end_date,
        budget, budget_unit, lat, lng, address, area_label)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      req.user.id, title, elder_condition || null, tasks || null, care_type,
      start_date || null, end_date || null, budget, budget_unit,
      lat, lng, address || null, area_label || null,
    ]
  );
  res.json({ ok: true, id: r.insertId });
});

// ---------- แคร์กิฟเวอร์: หางานตามรัศมี ----------
// GET /api/jobs?lat=..&lng=..&radius_km=10
// พิกัดที่ส่งกลับถูก mask ตามสถานะ KYC ของคนที่เรียก (ดู src/geo.js)
router.get('/', requireAuth, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.min(Number(req.query.radius_km) || 20, 100);

  let sql = `
    SELECT j.*, u.full_name AS employer_name,
           (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id) AS applicant_count
      FROM jobs j
      JOIN users u ON u.id = j.employer_id
     WHERE j.status = 'open' AND j.hire_type = 'open'`;
  const params = [];

  // สูตร Haversine — คำนวณระยะทางบนผิวโลก
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    sql = `
      SELECT * FROM (
        SELECT j.*, u.full_name AS employer_name,
               (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id) AS applicant_count,
               (6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(j.lat)) *
                COS(RADIANS(j.lng) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(j.lat))))) AS distance_km
          FROM jobs j
          JOIN users u ON u.id = j.employer_id
         WHERE j.status = 'open' AND j.hire_type = 'open'
      ) t
      WHERE t.distance_km <= ?
      ORDER BY t.distance_km ASC
      LIMIT 100`;
    params.push(lat, lng, lat, radius);
  } else {
    sql += ' ORDER BY j.created_at DESC LIMIT 100';
  }

  const [rows] = await db.query(sql, params);
  res.json({ items: rows.map((j) => maskJob(j, req.user)) });
});

// ---------- งานของฉัน (ทั้ง 2 บทบาท) ----------
router.get('/mine', requireAuth, async (req, res) => {
  const [posted] = await db.query(
    `SELECT j.*, (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id) AS applicant_count,
            cg.full_name AS caregiver_name
       FROM jobs j
       LEFT JOIN users cg ON cg.id = j.assigned_caregiver_id
      WHERE j.employer_id = ? AND j.hire_type = 'open'
      ORDER BY j.created_at DESC`,
    [req.user.id]
  );

  const [applied] = await db.query(
    `SELECT j.*, a.status AS my_application_status, a.created_at AS applied_at,
            u.full_name AS employer_name
       FROM job_applications a
       JOIN jobs j  ON j.id = a.job_id
       JOIN users u ON u.id = j.employer_id
      WHERE a.caregiver_id = ?
      ORDER BY a.created_at DESC`,
    [req.user.id]
  );

  res.json({
    posted,
    applied: applied.map((j) => maskJob(j, req.user)),
  });
});

// ---------- รายละเอียดงาน 1 ตัว ----------
router.get('/:id', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT j.*, u.full_name AS employer_name, u.phone AS employer_phone
       FROM jobs j JOIN users u ON u.id = j.employer_id
      WHERE j.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบงานนี้' });
  res.json({ job: maskJob(rows[0], req.user) });
});

// ---------- แคร์กิฟเวอร์: กดขอรับงาน (ต้อง approved) ----------
router.post('/:id/apply', requireAuth, requireApprovedCaregiver, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  const job = rows[0];
  if (!job) return res.status(404).json({ error: 'ไม่พบงานนี้' });
  if (job.status !== 'open') return res.status(400).json({ error: 'งานนี้ปิดรับแล้ว' });
  if (job.employer_id === req.user.id) {
    return res.status(400).json({ error: 'ขอรับงานที่ตัวเองโพสไม่ได้' });
  }

  try {
    await db.query(
      'INSERT INTO job_applications (job_id, caregiver_id, message) VALUES (?,?,?)',
      [job.id, req.user.id, req.body.message || null]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'คุณกดขอรับงานนี้ไปแล้ว' });
    throw e;
  }
});

// ---------- ผู้ว่าจ้าง: ดูรายชื่อคนที่กดขอรับ ----------
router.get('/:id/applicants', requireAuth, async (req, res) => {
  const [jobs] = await db.query('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  const job = jobs[0];
  if (!job) return res.status(404).json({ error: 'ไม่พบงานนี้' });
  if (job.employer_id !== req.user.id) return res.status(403).json({ error: 'ไม่ใช่งานของคุณ' });

  const [rows] = await db.query(
    `SELECT a.id, a.status, a.message, a.created_at,
            u.id AS caregiver_id, u.full_name, u.phone, u.photo_path,
            c.bio, c.experience_years, c.skills, c.rating_avg, c.rating_count
       FROM job_applications a
       JOIN users u ON u.id = a.caregiver_id
       LEFT JOIN caregiver_profiles c ON c.user_id = u.id
      WHERE a.job_id = ?
      ORDER BY c.rating_avg DESC, a.created_at ASC`,
    [job.id]
  );

  // เลือกคนเข้าบ้านทั้งที ควรได้เห็นหน้าเขาก่อน — ไม่ใช่แค่ตัวอักษรย่อในวงกลม
  res.json({
    items: rows.map(({ photo_path, ...a }) => ({ ...a, photo_url: photoUrl(a.caregiver_id, photo_path) })),
  });
});

// ---------- ผู้ว่าจ้าง: เลือกแคร์กิฟเวอร์ 1 คน ----------
router.post('/:id/choose/:caregiverId', requireAuth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [jobs] = await conn.query('SELECT * FROM jobs WHERE id = ? FOR UPDATE', [req.params.id]);
    const job = jobs[0];
    if (!job) throw Object.assign(new Error('ไม่พบงานนี้'), { status: 404 });
    if (job.employer_id !== req.user.id) throw Object.assign(new Error('ไม่ใช่งานของคุณ'), { status: 403 });
    if (job.status !== 'open') throw Object.assign(new Error('งานนี้เลือกคนไปแล้ว'), { status: 400 });

    const [apps] = await conn.query(
      'SELECT * FROM job_applications WHERE job_id = ? AND caregiver_id = ?',
      [job.id, req.params.caregiverId]
    );
    if (!apps.length) throw Object.assign(new Error('คนนี้ไม่ได้กดขอรับงานนี้'), { status: 400 });

    await conn.query(
      "UPDATE jobs SET status = 'matched', assigned_caregiver_id = ? WHERE id = ?",
      [req.params.caregiverId, job.id]
    );
    await conn.query(
      "UPDATE job_applications SET status = 'accepted' WHERE job_id = ? AND caregiver_id = ?",
      [job.id, req.params.caregiverId]
    );
    await conn.query(
      "UPDATE job_applications SET status = 'rejected' WHERE job_id = ? AND caregiver_id <> ?",
      [job.id, req.params.caregiverId]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(e.status || 500).json({ error: e.message || 'เลือกแคร์กิฟเวอร์ไม่สำเร็จ' });
  } finally {
    conn.release();
  }
});

// ---------- ปิดงาน (ผู้ว่าจ้างกดเมื่องานเสร็จ) ----------
router.post('/:id/complete', requireAuth, async (req, res) => {
  const [jobs] = await db.query('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  const job = jobs[0];
  if (!job) return res.status(404).json({ error: 'ไม่พบงานนี้' });
  if (job.employer_id !== req.user.id) return res.status(403).json({ error: 'ไม่ใช่งานของคุณ' });
  if (job.status !== 'matched') return res.status(400).json({ error: 'งานนี้ยังไม่ได้จับคู่' });

  await db.query("UPDATE jobs SET status = 'done' WHERE id = ?", [job.id]);
  res.json({ ok: true });
});

// ---------- ยกเลิกงาน (ใช้ได้ทั้งงานโพส + งานจ้างตรง เพราะอยู่ตาราง jobs เดียวกัน) ----------
// ก่อนจับคู่ (open/offered) → ถอนทิ้งเลย ไม่เก็บประวัติ (ลบแถว) — เฉพาะฝั่งผู้ว่าจ้าง
// หลังจับคู่ (matched)      → ต้องมีเหตุผล เก็บเป็น cancelled ไว้ในประวัติ — ผู้ว่าจ้าง หรือแคร์กิฟเวอร์ที่รับงาน
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const [jobs] = await db.query('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  const job = jobs[0];
  if (!job) return res.status(404).json({ error: 'ไม่พบงานนี้' });

  const isEmployer = job.employer_id === req.user.id;
  const isWorker = job.assigned_caregiver_id === req.user.id || job.target_caregiver_id === req.user.id;
  if (!isEmployer && !isWorker) return res.status(403).json({ error: 'ยกเลิกงานนี้ไม่ได้ — ไม่ใช่งานของคุณ' });

  // ก่อนจับคู่ → ถอนทิ้ง ไม่เก็บประวัติ (แคร์กิฟเวอร์ยังไม่ผูกกับงาน ให้ถอนได้เฉพาะผู้ว่าจ้าง)
  if (job.status === 'open' || job.status === 'offered') {
    if (!isEmployer) return res.status(403).json({ error: 'ยังไม่ได้ตอบรับงาน — ถอนได้เฉพาะฝั่งผู้ว่าจ้าง' });
    await db.query('DELETE FROM jobs WHERE id = ?', [job.id]);
    return res.json({ ok: true, deleted: true });
  }

  // หลังจับคู่ → ต้องมีเหตุผล เก็บลงประวัติ
  if (job.status === 'matched') {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'ต้องบอกเหตุผลในการยกเลิกงานที่จับคู่แล้ว' });
    await db.query(
      "UPDATE jobs SET status = 'cancelled', cancel_reason = ?, cancelled_by = ? WHERE id = ?",
      [reason.slice(0, 500), req.user.id, job.id]
    );
    return res.json({ ok: true, status: 'cancelled' });
  }

  return res.status(400).json({ error: 'งานนี้จบไปแล้ว ยกเลิกไม่ได้' });
});

// ---------- แคร์กิฟเวอร์: ถอนคำขอรับงาน (ก่อนผู้ว่าจ้างเลือก) — ไม่เก็บประวัติ ----------
router.post('/:id/withdraw', requireAuth, async (req, res) => {
  const [apps] = await db.query(
    'SELECT * FROM job_applications WHERE job_id = ? AND caregiver_id = ?',
    [req.params.id, req.user.id]
  );
  const app = apps[0];
  if (!app) return res.status(404).json({ error: 'ไม่พบคำขอรับงานนี้' });
  if (app.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ถูกตัดสินไปแล้ว ถอนไม่ได้' });

  await db.query('DELETE FROM job_applications WHERE id = ?', [app.id]);
  res.json({ ok: true });
});

module.exports = router;
