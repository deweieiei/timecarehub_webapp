const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

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

// ---------- ผู้ว่าจ้าง: ส่งคำขอจ้าง ----------
router.post('/', requireAuth, async (req, res) => {
  const { caregiver_id, title, care_type, budget, budget_unit, start_date, end_date, elder_condition, tasks, address } = req.body;

  if (!caregiver_id || !title || !budget) {
    return res.status(400).json({ error: 'ต้องระบุแคร์กิฟเวอร์ หัวข้องาน และงบประมาณ' });
  }
  if (!CARE_TYPES.includes(care_type)) return res.status(400).json({ error: 'ประเภทงานไม่ถูกต้อง' });
  if (!BUDGET_UNITS.includes(budget_unit)) return res.status(400).json({ error: 'หน่วยงบไม่ถูกต้อง' });
  if (Number(caregiver_id) === req.user.id) return res.status(400).json({ error: 'จ้างตัวเองไม่ได้' });

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
        care_type, start_date, end_date, budget, budget_unit, address, status)
     VALUES (?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered')`,
    [
      req.user.id, caregiver_id, title, elder_condition || null, tasks || null,
      care_type, start_date || null, end_date || null, budget, budget_unit, address || null,
    ]
  );

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
  res.json({ items: rows });
});

// ---------- ผู้ว่าจ้าง: คำขอจ้างที่ฉันส่งไป ----------
router.get('/sent', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT j.*, u.full_name AS caregiver_name
       FROM jobs j
       JOIN users u ON u.id = j.target_caregiver_id
      WHERE j.hire_type = 'direct' AND j.employer_id = ?
      ORDER BY j.created_at DESC`,
    [req.user.id]
  );
  res.json({ items: rows });
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

  if (decision === 'accept') {
    await db.query(
      "UPDATE jobs SET status = 'matched', assigned_caregiver_id = ? WHERE id = ?",
      [req.user.id, job.id]
    );
  } else {
    await db.query("UPDATE jobs SET status = 'declined' WHERE id = ?", [job.id]);
  }

  res.json({ ok: true, status: decision === 'accept' ? 'matched' : 'declined' });
});

module.exports = router;
