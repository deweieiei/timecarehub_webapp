// ============================================================
//  หัวใจของแชท — ใช้ร่วมกันทั้ง REST (src/routes/chat.js) และ Socket.IO (src/realtime.js)
//
//  ⚠️ กฎเหล็ก: การเช็คสิทธิ์ "ใครคุยกับใครได้" ต้องอยู่ในไฟล์นี้ที่เดียว
//     ถ้าแยกไปเขียนซ้ำ 2 ที่ วันหนึ่งมันจะเช็คไม่ตรงกัน แล้วรูหลุดจะโผล่ทางที่ลืมแก้
// ============================================================
const db = require('./db');

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

// ฝั่งแคร์กิฟเวอร์คู่สนทนาถูกล็อกไว้แล้ว (คือผู้ว่าจ้างของงานนี้)
// ฝั่งผู้ว่าจ้างคุยได้หลายคน → ต้องบอกมาว่าจะคุยกับใคร แล้วเราเช็คว่าคุยด้วยได้จริงไหม
async function resolveOther(ctx, jobId, wanted) {
  if (!ctx.isEmployer) return { otherId: ctx.otherId };

  // งานจ้างตรง: คู่สนทนามีคนเดียว — ล็อกตามงาน ไม่ฟังค่าที่ส่งมา
  if (ctx.job.hire_type === 'direct') {
    if (!ctx.job.target_caregiver_id) return { error: 'งานนี้ยังไม่ได้ส่งถึงใคร', status: 400 };
    return { otherId: ctx.job.target_caregiver_id };
  }

  // งานโพส: ส่งหาได้เฉพาะคนที่กดขอรับงานนี้ไว้
  const otherId = Number(wanted);
  if (!otherId) return { error: 'ต้องระบุว่าจะคุยกับใคร', status: 400 };

  const [apps] = await db.query(
    'SELECT 1 FROM job_applications WHERE job_id = ? AND caregiver_id = ?',
    [jobId, otherId]
  );
  if (!apps.length) return { error: 'คนนี้ไม่ได้กดขอรับงานนี้', status: 403 };

  return { otherId };
}

// ด่านเดียวจบ: เช็คว่า me คุยกับ wanted ในงาน jobId ได้ไหม → คืน { otherId } หรือ { error, status }
async function checkAccess(jobId, me, wanted) {
  const ctx = await counterpart(jobId, me);
  if (ctx.error) return ctx;
  return resolveOther(ctx, jobId, wanted);
}

// รายชื่อ "คู่สนทนาทั้งหมดของฉัน" — ใช้ตอนกระจายสถานะออนไลน์ (บอกเฉพาะคนที่เคยคุยกัน)
async function contactsOf(me) {
  const [rows] = await db.query(
    `SELECT DISTINCT other_id FROM (
       SELECT IF(j.employer_id = ?, a.caregiver_id, j.employer_id) AS other_id
         FROM jobs j
         JOIN job_applications a ON a.job_id = j.id
        WHERE j.hire_type = 'open' AND (j.employer_id = ? OR a.caregiver_id = ?)
       UNION
       SELECT IF(j.employer_id = ?, j.target_caregiver_id, j.employer_id)
         FROM jobs j
        WHERE j.hire_type = 'direct' AND (j.employer_id = ? OR j.target_caregiver_id = ?)
     ) t
     WHERE other_id IS NOT NULL AND other_id <> ?`,
    [me, me, me, me, me, me, me]
  );
  return rows.map((r) => r.other_id);
}

// รูปร่างข้อความที่ส่งให้หน้าเว็บ — ทุกทางต้องใช้ชุดคอลัมน์เดียวกัน
// (ไม่ส่ง image_path ออกไป — หน้าเว็บเรียกรูปผ่าน /api/chat/image/:id เท่านั้น)
const MSG_COLS = 'id, job_id, sender_id, receiver_id, kind, body, image_w, image_h, created_at, read_at';

async function messageById(id) {
  const [rows] = await db.query(`SELECT ${MSG_COLS} FROM messages WHERE id = ?`, [id]);
  return rows[0] || null;
}

// บันทึกข้อความ → คืน row เต็มกลับไป (ทั้ง REST และ socket ใช้ตัวนี้)
async function insertMessage({ jobId, from, to, kind = 'text', body = null, imagePath = null, imageW = null, imageH = null }) {
  const [r] = await db.query(
    'INSERT INTO messages (job_id, sender_id, receiver_id, kind, body, image_path, image_w, image_h) VALUES (?,?,?,?,?,?,?,?)',
    [jobId, from, to, kind, body, imagePath, imageW, imageH]
  );
  return messageById(r.insertId);
}

// ทำเครื่องหมาย "อ่านแล้ว" → คืน id ที่เพิ่งเปลี่ยน (ว่างแปลว่าอ่านหมดแล้ว ไม่ต้องแจ้งใคร)
async function markRead(jobId, me, otherId) {
  const [rows] = await db.query(
    'SELECT id FROM messages WHERE job_id = ? AND receiver_id = ? AND sender_id = ? AND read_at IS NULL',
    [jobId, me, otherId]
  );
  if (!rows.length) return [];

  await db.query(
    'UPDATE messages SET read_at = NOW() WHERE job_id = ? AND receiver_id = ? AND sender_id = ? AND read_at IS NULL',
    [jobId, me, otherId]
  );
  return rows.map((r) => r.id);
}

module.exports = { counterpart, resolveOther, checkAccess, contactsOf, insertMessage, messageById, markRead, MSG_COLS };
