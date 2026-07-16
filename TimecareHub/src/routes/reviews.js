const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// ให้ดาวหลังงานเสร็จ — ให้ได้ทั้ง 2 ฝั่ง แต่คนละ 1 ครั้งต่องาน
router.post('/:jobId', requireAuth, async (req, res) => {
  const rating = Number(req.body.rating);
  const comment = req.body.comment || null;
  if (!(rating >= 1 && rating <= 5)) {
    return res.status(400).json({ error: 'ให้ดาว 1-5 เท่านั้น' });
  }

  const [jobs] = await db.query('SELECT * FROM jobs WHERE id = ?', [req.params.jobId]);
  const job = jobs[0];
  if (!job) return res.status(404).json({ error: 'ไม่พบงานนี้' });
  if (job.status !== 'done') return res.status(400).json({ error: 'ให้ดาวได้หลังงานเสร็จแล้วเท่านั้น' });

  const isEmployer = job.employer_id === req.user.id;
  const isCaregiver = job.assigned_caregiver_id === req.user.id;
  if (!isEmployer && !isCaregiver) return res.status(403).json({ error: 'คุณไม่ได้เกี่ยวข้องกับงานนี้' });

  const revieweeId = isEmployer ? job.assigned_caregiver_id : job.employer_id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      'INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (?,?,?,?,?)',
      [job.id, req.user.id, revieweeId, rating, comment]
    );

    // อัปเดตคะแนนเฉลี่ยของแคร์กิฟเวอร์ (คำนวณใหม่จากรีวิวทั้งหมด ไม่ใช่บวกเพิ่ม —
    // กันค่าเพี้ยนถ้ามีการลบรีวิวทีหลัง)
    await conn.query(
      `UPDATE caregiver_profiles c
          SET rating_avg = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE reviewee_id = c.user_id),
              rating_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = c.user_id)
        WHERE c.user_id = ?`,
      [revieweeId]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'คุณให้ดาวงานนี้ไปแล้ว' });
    console.error(e);
    res.status(500).json({ error: 'ให้ดาวไม่สำเร็จ' });
  } finally {
    conn.release();
  }
});

// ดูรีวิวของผู้ใช้คนหนึ่ง
router.get('/user/:userId', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT r.rating, r.comment, r.created_at, u.full_name AS reviewer_name, j.title AS job_title
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       JOIN jobs j  ON j.id = r.job_id
      WHERE r.reviewee_id = ?
      ORDER BY r.created_at DESC
      LIMIT 50`,
    [req.params.userId]
  );
  res.json({ items: rows });
});

module.exports = router;
