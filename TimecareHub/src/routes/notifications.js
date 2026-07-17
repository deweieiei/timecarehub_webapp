const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// ตัวเลขแดง ๆ บนแท็บ — หน้าเว็บเรียกทุก 15 วินาที
router.get('/', requireAuth, async (req, res) => {
  const me = req.user.id;
  const role = ['employer', 'caregiver'].includes(req.query.role) ? req.query.role : null;

  // แชท: นับข้อความที่ยังไม่อ่าน — กรองตามบทบาทที่เปิดอยู่ให้ตรงกับรายการห้อง (ดู /api/chat/threads)
  //   employer  → เฉพาะห้องที่ฉันเป็นผู้ว่าจ้าง (j.employer_id = me)
  //   caregiver → เฉพาะห้องที่ฉันเป็นแคร์กิฟเวอร์ (j.employer_id <> me)
  const roleCond = role === 'employer' ? 'AND j.employer_id = ?'
    : role === 'caregiver' ? 'AND j.employer_id <> ?'
    : '';
  const [[chat]] = await db.query(
    `SELECT COUNT(*) AS n
       FROM messages m JOIN jobs j ON j.id = m.job_id
      WHERE m.receiver_id = ? AND m.read_at IS NULL ${roleCond}`,
    role ? [me, me] : [me]
  );

  // ฝั่งผู้ว่าจ้าง: มีคนมากดขอรับงานที่ฉันโพส แต่ฉันยังไม่ได้เลือกใคร
  const [[applicants]] = await db.query(
    `SELECT COUNT(*) AS n
       FROM job_applications a
       JOIN jobs j ON j.id = a.job_id
      WHERE j.employer_id = ? AND j.status = 'open' AND a.status = 'pending'`,
    [me]
  );

  // ฝั่งแคร์กิฟเวอร์: มีคำขอจ้างตรงส่งมาหาฉัน ยังไม่ได้ตอบ
  const [[offers]] = await db.query(
    "SELECT COUNT(*) AS n FROM jobs WHERE hire_type = 'direct' AND target_caregiver_id = ? AND status = 'offered'",
    [me]
  );

  res.json({
    chat: chat.n,
    applicants: applicants.n,
    offers: offers.n,
  });
});

module.exports = router;
