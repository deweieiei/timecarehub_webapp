const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// ตัวเลขแดง ๆ บนแท็บ — หน้าเว็บเรียกทุก 15 วินาที
router.get('/', requireAuth, async (req, res) => {
  const me = req.user.id;

  const [[chat]] = await db.query(
    'SELECT COUNT(*) AS n FROM messages WHERE receiver_id = ? AND read_at IS NULL',
    [me]
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
