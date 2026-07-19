const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// เก็บแจ้งเตือนย้อนหลังแค่นี้พอ — กระดิ่งไม่ใช่ประวัติงาน ประวัติจริงอยู่ที่แท็บภารกิจของฉัน
const INBOX_LIMIT = 40;

// ตัวเลขแดง ๆ บนแท็บ + กระดิ่ง — หน้าเว็บเรียกทุก 15 วินาที
router.get('/', requireAuth, async (req, res) => {
  const me = req.user.id;
  const role = ['employer', 'caregiver'].includes(req.query.role) ? req.query.role : null;

  // แชท: นับข้อความที่ยังไม่อ่าน — กรองตามบทบาทที่เปิดอยู่ให้ตรงกับรายการห้อง (ดู /api/chat/threads)
  //   employer  → เฉพาะห้องที่ฉันเป็นผู้ว่าจ้าง (j.employer_id = me)
  //   caregiver → เฉพาะห้องที่ฉันเป็นแคร์กิฟเวอร์ (j.employer_id <> me)
  //
  // งานที่จบแล้วไม่นับด้วย — ห้องแชทของงานที่จบถูกซ่อนไปแล้ว (ข้อ 10)
  // ถ้ายังนับอยู่ เลขแดงบนแท็บแชทจะค้างโดยที่ผู้ใช้กดเข้าไปอ่านไม่ได้เลยสักทาง
  const roleCond = role === 'employer' ? 'AND j.employer_id = ?'
    : role === 'caregiver' ? 'AND j.employer_id <> ?'
    : '';
  const [[chat]] = await db.query(
    `SELECT COUNT(*) AS n
       FROM messages m JOIN jobs j ON j.id = m.job_id
      WHERE m.receiver_id = ? AND m.read_at IS NULL AND j.status <> 'done' ${roleCond}`,
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

  // กระดิ่ง: แจ้งเตือนที่ยังไม่ได้เปิดอ่าน
  const [[alerts]] = await db.query(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [me]
  );

  res.json({
    chat: chat.n,
    applicants: applicants.n,
    offers: offers.n,
    alerts: alerts.n,
  });
});

// ---------- รายการในกระดิ่ง ----------
router.get('/list', requireAuth, async (req, res) => {
  const [items] = await db.query(
    `SELECT n.id, n.job_id, n.type, n.title, n.body, n.created_at, n.read_at,
            j.status AS job_status, j.hire_type
       FROM notifications n
       LEFT JOIN jobs j ON j.id = n.job_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ?`,
    [req.user.id, INBOX_LIMIT]
  );
  res.json({ items });
});

// ---------- เปิดกระดิ่ง = อ่านหมดแล้ว ----------
// ไม่ทำทีละอัน: เปิดแผ่นขึ้นมาก็เห็นทุกอันพร้อมกันอยู่แล้ว การให้กดอ่านทีละอันคือความรำคาญเปล่า ๆ
router.post('/read', requireAuth, async (req, res) => {
  await db.query(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
    [req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
