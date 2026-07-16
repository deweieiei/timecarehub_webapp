const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// แชทผูกกับ "งาน" — คุยได้ 2 กรณี
//   1. งานโพส (hire_type='open')   : ผู้ว่าจ้าง ↔ คนที่กดขอรับงานนั้น
//   2. งานจ้างตรง (hire_type='direct'): ผู้ว่าจ้าง ↔ แคร์กิฟเวอร์ที่ถูกส่งคำขอไปหา
async function counterpart(jobId, userId) {
  const [jobs] = await db.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
  const job = jobs[0];
  if (!job) return { error: 'ไม่พบงานนี้', status: 404 };

  if (job.employer_id === userId) return { job, isEmployer: true };

  // งานจ้างตรง — คู่สนทนาคือผู้ว่าจ้าง ไม่ต้องกดขอรับงานก่อน
  if (job.hire_type === 'direct') {
    if (job.target_caregiver_id !== userId) return { error: 'งานนี้ไม่ได้ส่งถึงคุณ', status: 403 };
    return { job, isEmployer: false, otherId: job.employer_id };
  }

  // งานโพส — ต้องกดขอรับงานก่อนถึงจะคุยได้
  const [apps] = await db.query(
    'SELECT 1 FROM job_applications WHERE job_id = ? AND caregiver_id = ?',
    [jobId, userId]
  );
  if (!apps.length) return { error: 'ต้องกดขอรับงานนี้ก่อนจึงจะคุยได้', status: 403 };

  return { job, isEmployer: false, otherId: job.employer_id };
}

// รายการห้องแชทของฉัน (รวมทั้งงานโพส และงานจ้างตรง)
router.get('/threads', requireAuth, async (req, res) => {
  const me = req.user.id;

  const [rows] = await db.query(
    `SELECT t.job_id, t.title, t.status, t.hire_type,
            u.id AS other_id, u.full_name AS other_name,
            (SELECT m.body FROM messages m
              WHERE m.job_id = t.job_id
                AND (m.sender_id IN (?, t.other_id) AND m.receiver_id IN (?, t.other_id))
              ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            (SELECT MAX(m.created_at) FROM messages m
              WHERE m.job_id = t.job_id
                AND (m.sender_id IN (?, t.other_id) AND m.receiver_id IN (?, t.other_id))) AS last_at,
            (SELECT COUNT(*) FROM messages m
              WHERE m.job_id = t.job_id AND m.receiver_id = ? AND m.sender_id = t.other_id
                AND m.read_at IS NULL) AS unread
       FROM (
         -- งานโพส: คู่สนทนามาจากตารางการกดขอรับงาน
         SELECT j.id AS job_id, j.title, j.status, j.hire_type,
                IF(j.employer_id = ?, a.caregiver_id, j.employer_id) AS other_id
           FROM jobs j
           JOIN job_applications a ON a.job_id = j.id
          WHERE j.hire_type = 'open' AND (j.employer_id = ? OR a.caregiver_id = ?)

         UNION

         -- งานจ้างตรง: คู่สนทนาคือคู่ของงานนั้นเลย
         SELECT j.id, j.title, j.status, j.hire_type,
                IF(j.employer_id = ?, j.target_caregiver_id, j.employer_id)
           FROM jobs j
          WHERE j.hire_type = 'direct' AND (j.employer_id = ? OR j.target_caregiver_id = ?)
       ) t
       JOIN users u ON u.id = t.other_id
      WHERE t.other_id <> ?
      ORDER BY last_at IS NULL, last_at DESC`,
    [me, me, me, me, me, me, me, me, me, me, me, me]
  );

  res.json({ items: rows });
});

// อ่านข้อความ — GET /api/chat/:jobId?with=<userId>
router.get('/:jobId', requireAuth, async (req, res) => {
  const ctx = await counterpart(req.params.jobId, req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  const otherId = ctx.isEmployer
    ? Number(req.query.with) || ctx.job.target_caregiver_id   // งานจ้างตรงรู้คู่สนทนาอยู่แล้ว
    : ctx.otherId;
  if (!otherId) return res.status(400).json({ error: 'ต้องระบุว่าจะคุยกับใคร' });

  const [rows] = await db.query(
    `SELECT id, sender_id, receiver_id, body, created_at
       FROM messages
      WHERE job_id = ?
        AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      ORDER BY created_at ASC`,
    [req.params.jobId, req.user.id, otherId, otherId, req.user.id]
  );

  // เปิดอ่านแล้ว = ลบ badge "ข้อความใหม่"
  await db.query(
    'UPDATE messages SET read_at = NOW() WHERE job_id = ? AND receiver_id = ? AND sender_id = ? AND read_at IS NULL',
    [req.params.jobId, req.user.id, otherId]
  );

  res.json({ items: rows, me: req.user.id, other_id: otherId });
});

// ส่งข้อความ
router.post('/:jobId', requireAuth, async (req, res) => {
  const ctx = await counterpart(req.params.jobId, req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'พิมพ์ข้อความก่อนส่ง' });

  const otherId = ctx.isEmployer
    ? Number(req.body.to) || ctx.job.target_caregiver_id
    : ctx.otherId;
  if (!otherId) return res.status(400).json({ error: 'ต้องระบุผู้รับ' });

  // งานโพส: ผู้ว่าจ้างส่งหาได้เฉพาะคนที่กดขอรับงานนี้ไว้
  if (ctx.isEmployer && ctx.job.hire_type === 'open') {
    const [apps] = await db.query(
      'SELECT 1 FROM job_applications WHERE job_id = ? AND caregiver_id = ?',
      [req.params.jobId, otherId]
    );
    if (!apps.length) return res.status(403).json({ error: 'คนนี้ไม่ได้กดขอรับงานนี้' });
  }

  await db.query(
    'INSERT INTO messages (job_id, sender_id, receiver_id, body) VALUES (?,?,?,?)',
    [req.params.jobId, req.user.id, otherId, body]
  );
  res.json({ ok: true });
});

module.exports = router;
