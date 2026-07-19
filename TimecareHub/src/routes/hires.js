const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { notify } = require('../notify');
const { num, readTime } = require('../util');

const router = express.Router();

// ============================================================
//  จ้างตรง — ผู้ว่าจ้างส่งคำขอไปหาแคร์กิฟเวอร์ที่เลือกไว้
//
//  เก็บในตาราง jobs เหมือนงานปกติ แต่ hire_type = 'direct'
//  ทำแบบนี้เพื่อให้ "แชท / ปิดงาน" ใช้โค้ดชุดเดียวกับระบบโพสงานเดิมได้เลย
//
//  วงจร: offered ──แคร์กิฟเวอร์กดรับ──→ matched ──ผู้จ้างปิดงาน──→ done
//                └──แคร์กิฟเวอร์ปฏิเสธ──→ declined
// ============================================================

const CARE_TYPES = ['hourly', 'daily', 'overnight', 'live_in'];
const BUDGET_UNITS = ['per_hour', 'per_day', 'per_month', 'total'];

// คำขอที่ถูกปฏิเสธ ให้ผู้ว่าจ้างเห็นนานเท่านี้แล้วซ่อน (ตกลงกับพี่ดิว ข้อ 8)
// ซ่อน ไม่ใช่ลบ — ประวัติยังอยู่ใน DB ครบ เผื่อวันหลังอยากทำหน้าสถิติ/ย้อนดู
const DECLINE_VISIBLE_HOURS = 24;

// DECIMAL จาก mysql2 มาเป็นสตริง → Leaflet ปักหมุดไม่ขึ้น ต้องแปลงก่อนส่งออกทุกครั้ง
const shape = (j) => ({ ...j, lat: num(j.lat), lng: num(j.lng) });

// ---------- ผู้ว่าจ้าง: ส่งคำขอจ้าง ----------
router.post('/', requireAuth, async (req, res) => {
  const {
    caregiver_id, title, care_type, budget, budget_unit,
    start_date, end_date, start_time, end_time,
    elder_condition, tasks, address, lat, lng, area_label,
  } = req.body;

  if (!caregiver_id || !title || !budget) {
    return res.status(400).json({ error: 'ต้องระบุแคร์กิฟเวอร์ หัวข้องาน และงบประมาณ' });
  }
  if (!CARE_TYPES.includes(care_type)) return res.status(400).json({ error: 'ประเภทงานไม่ถูกต้อง' });
  if (!BUDGET_UNITS.includes(budget_unit)) return res.status(400).json({ error: 'หน่วยงบไม่ถูกต้อง' });
  if (Number(caregiver_id) === req.user.id) return res.status(400).json({ error: 'จ้างตัวเองไม่ได้' });

  // ปักหมุดหรือไม่ปักก็ได้ (งานจ้างตรงคุยกันตัวต่อตัวอยู่แล้ว) แต่ถ้าปัก ต้องมีครบทั้งคู่
  // มีด้านเดียว = ปักหมุดบนแผนที่ไม่ได้ แถมทำให้คำนวณระยะทางเพี้ยน
  const pinLat = lat === '' || lat == null ? null : Number(lat);
  const pinLng = lng === '' || lng == null ? null : Number(lng);
  if ((pinLat === null) !== (pinLng === null)) {
    return res.status(400).json({ error: 'พิกัดไม่ครบ — ต้องมีทั้งละติจูดและลองจิจูด' });
  }
  if (pinLat !== null && (!Number.isFinite(pinLat) || Math.abs(pinLat) > 90)) {
    return res.status(400).json({ error: 'ค่าละติจูดไม่ถูกต้อง' });
  }
  if (pinLng !== null && (!Number.isFinite(pinLng) || Math.abs(pinLng) > 180)) {
    return res.status(400).json({ error: 'ค่าลองจิจูดไม่ถูกต้อง' });
  }

  // ต้องเป็นแคร์กิฟเวอร์ที่ยืนยันตัวตนแล้วเท่านั้น
  const [cg] = await db.query(
    "SELECT user_id FROM caregiver_profiles WHERE user_id = ? AND kyc_status = 'approved'",
    [caregiver_id]
  );
  if (!cg.length) return res.status(400).json({ error: 'แคร์กิฟเวอร์คนนี้ยังไม่ได้ยืนยันตัวตน' });

  // กันส่งคำขอซ้ำไปหาคนเดิมที่ยังไม่ตอบ
  const [dup] = await db.query(
    "SELECT id FROM jobs WHERE employer_id = ? AND target_caregiver_id = ? AND status = 'offered'",
    [req.user.id, caregiver_id]
  );
  if (dup.length) return res.status(409).json({ error: 'คุณส่งคำขอจ้างคนนี้ไปแล้ว กำลังรอเขาตอบอยู่' });

  const [r] = await db.query(
    `INSERT INTO jobs
       (employer_id, hire_type, target_caregiver_id, title, elder_condition, tasks,
        care_type, start_date, end_date, start_time, end_time,
        budget, budget_unit, address, lat, lng, area_label, status, status_changed_at)
     VALUES (?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered', NOW())`,
    [
      req.user.id, caregiver_id, title, elder_condition || null, tasks || null,
      care_type, start_date || null, end_date || null, readTime(start_time), readTime(end_time),
      budget, budget_unit, address || null, pinLat, pinLng, area_label || null,
    ]
  );

  await notify(caregiver_id, {
    jobId: r.insertId,
    type: 'offer_received',
    title: 'มีคำขอจ้างส่งมาถึงคุณ',
    body: `${req.user.full_name} เสนองาน "${title}"`,
  });

  res.json({ ok: true, id: r.insertId });
});

// ---------- แคร์กิฟเวอร์: คำขอจ้างที่เข้ามาหาฉัน ----------
router.get('/incoming', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT j.*, u.full_name AS employer_name, u.phone AS employer_phone
       FROM jobs j
       JOIN users u ON u.id = j.employer_id
      WHERE j.hire_type = 'direct' AND j.target_caregiver_id = ?
      ORDER BY FIELD(j.status, 'offered', 'matched', 'done', 'declined'), j.created_at DESC`,
    [req.user.id]
  );
  res.json({ items: rows.map(shape) });
});

// ---------- ผู้ว่าจ้าง: คำขอจ้างที่ฉันส่งไป ----------
// คำขอที่ถูกปฏิเสธจะโชว์ 24 ชม. แล้วหายไปเอง (ข้อ 8) —
// นับจาก status_changed_at ไม่ใช่ created_at: คำขอที่ส่งไปเมื่อวานแล้วเพิ่งโดนปฏิเสธเมื่อกี้
// ต้องยังอยู่ให้เห็น ไม่ใช่โผล่มาแล้วหายทันทีในวินาทีเดียวกัน
router.get('/sent', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT j.*, u.full_name AS caregiver_name
       FROM jobs j
       JOIN users u ON u.id = j.target_caregiver_id
      WHERE j.hire_type = 'direct' AND j.employer_id = ?
        AND NOT (j.status = 'declined'
                 AND j.status_changed_at IS NOT NULL
                 AND j.status_changed_at < NOW() - INTERVAL ? HOUR)
      ORDER BY j.created_at DESC`,
    [req.user.id, DECLINE_VISIBLE_HOURS]
  );
  res.json({ items: rows.map(shape), decline_visible_hours: DECLINE_VISIBLE_HOURS });
});

// ---------- แคร์กิฟเวอร์: ตอบรับ / ปฏิเสธ ----------
router.post('/:id/respond', requireAuth, async (req, res) => {
  const { decision } = req.body;
  if (!['accept', 'decline'].includes(decision)) {
    return res.status(400).json({ error: 'ต้องเป็น accept หรือ decline' });
  }

  const [rows] = await db.query("SELECT * FROM jobs WHERE id = ? AND hire_type = 'direct'", [req.params.id]);
  const job = rows[0];
  if (!job) return res.status(404).json({ error: 'ไม่พบคำขอจ้างนี้' });
  if (job.target_caregiver_id !== req.user.id) return res.status(403).json({ error: 'คำขอนี้ไม่ได้ส่งถึงคุณ' });
  if (job.status !== 'offered') return res.status(400).json({ error: 'คำขอนี้ตอบไปแล้ว' });

  // เหตุผลตอนปฏิเสธ (ไม่บังคับ) — ใช้คอลัมน์ cancel_reason ร่วมกับการยกเลิกงาน
  // เป็นข้อมูลชนิดเดียวกัน ("ทำไมงานนี้ถึงไม่เกิด") และงานหนึ่งจบได้ทางเดียวเท่านั้น ทับกันไม่ได้
  const reason = String(req.body.reason || '').trim().slice(0, 500) || null;

  if (decision === 'accept') {
    await db.query(
      "UPDATE jobs SET status = 'matched', assigned_caregiver_id = ?, status_changed_at = NOW() WHERE id = ?",
      [req.user.id, job.id]
    );
    await notify(job.employer_id, {
      jobId: job.id,
      type: 'offer_accepted',
      title: 'แคร์กิฟเวอร์ตอบรับงานแล้ว',
      body: `${req.user.full_name} รับงาน "${job.title}" — คุยรายละเอียดต่อในแชทได้เลย`,
    });
  } else {
    await db.query(
      "UPDATE jobs SET status = 'declined', cancel_reason = ?, cancelled_by = ?, status_changed_at = NOW() WHERE id = ?",
      [reason, req.user.id, job.id]
    );
    await notify(job.employer_id, {
      jobId: job.id,
      type: 'offer_declined',
      title: 'คำขอจ้างถูกปฏิเสธ',
      body: `${req.user.full_name} ปฏิเสธงาน "${job.title}"${reason ? ` — เหตุผล: ${reason.slice(0, 200)}` : ''}`
        + ` · รายการนี้จะแสดงอีก ${DECLINE_VISIBLE_HOURS} ชม. แล้วซ่อนไปเอง`,
    });
  }

  res.json({ ok: true, status: decision === 'accept' ? 'matched' : 'declined' });
});

module.exports = router;
