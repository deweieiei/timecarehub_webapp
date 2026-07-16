const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('../db');
const { requireAuth } = require('../auth');
const { checkAccess, insertMessage, markRead, MSG_COLS } = require('../chat-core');
const realtime = require('../realtime');

const router = express.Router();

// รูปในแชทอยู่นอก public/ โดยตั้งใจ — เข้า URL ตรงไม่ได้ ต้องผ่าน GET /image/:id ที่เช็คสิทธิ์ก่อน
// (กติกาเดียวกับ uploads/kyc/ — รูปของคนไข้/ผู้สูงอายุก็คือข้อมูลส่วนบุคคล)
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const CHAT_DIR = path.join(UPLOAD_ROOT, 'chat');

const EXT_OF = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// ============================================================
//  ด่านตรวจสิทธิ์ — ใช้ก่อนทุก route ที่อ้างถึงห้องแชท
//  คู่สนทนาส่งมาทาง ?with= (GET/อัปโหลดรูป) หรือ body.to (ส่งข้อความ)
//  ⚠️ ต้องวางไว้ "ก่อน" multer เสมอ — คนไม่มีสิทธิ์จะได้ไม่ทันเขียนไฟล์ลงดิสก์
// ============================================================
async function chatGuard(req, res, next) {
  try {
    const wanted = req.query.with ?? req.body?.to;
    const access = await checkAccess(req.params.jobId, req.user.id, wanted);
    if (access.error) return res.status(access.status || 403).json({ error: access.error });
    req.otherId = access.otherId;
    next();
  } catch (e) {
    next(e);
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(CHAT_DIR, String(req.params.jobId));
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + EXT_OF[file.mimetype]),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (EXT_OF[file.mimetype]) return cb(null, true);
    // status: 400 → "คุณส่งของผิด" ไม่ใช่ "ระบบพัง" (ตัวจับ error ท้าย server.js อ่านค่านี้)
    cb(Object.assign(new Error('รองรับเฉพาะไฟล์รูป (JPG, PNG, WebP, GIF)'), { status: 400 }));
  },
});

// ============================================================
//  รายการห้องแชทของฉัน (รวมทั้งงานโพส และงานจ้างตรง)
// ============================================================
router.get('/threads', requireAuth, async (req, res) => {
  const me = req.user.id;

  const [rows] = await db.query(
    `SELECT t.job_id, t.title, t.status, t.hire_type,
            u.id AS other_id, u.full_name AS other_name, u.last_seen_at AS other_last_seen,
            lm.kind AS last_kind, lm.body AS last_message,
            lm.sender_id AS last_sender, lm.created_at AS last_at,
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
       -- ข้อความล่าสุดของคู่นี้ (โชว์ใต้ชื่อในรายการห้อง)
       LEFT JOIN messages lm ON lm.id = (
         SELECT m.id FROM messages m
          WHERE m.job_id = t.job_id
            AND m.sender_id IN (?, t.other_id) AND m.receiver_id IN (?, t.other_id)
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       )
      WHERE t.other_id <> ?
      ORDER BY last_at IS NULL, last_at DESC`,
    [me, me, me, me, me, me, me, me, me, me]
  );

  // สถานะออนไลน์ไม่ได้อยู่ใน DB — ของจริงอยู่ในทะเบียน socket (ดู src/realtime.js)
  res.json({
    items: rows.map((r) => ({ ...r, other_online: realtime.isOnline(r.other_id) })),
  });
});

// ============================================================
//  รูปในแชท — GET /api/chat/image/:id
//  ต้องมาก่อน '/:jobId' ไม่งั้นโดนกินไปก่อน
// ============================================================
router.get('/image/:id', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT sender_id, receiver_id, image_path FROM messages WHERE id = ? AND kind = 'image'",
      [req.params.id]
    );
    const msg = rows[0];
    if (!msg || !msg.image_path) return res.status(404).json({ error: 'ไม่พบรูปนี้' });

    // เห็นได้เฉพาะคนส่งกับคนรับ — คนอื่นเดา id เอาไม่ได้
    if (![msg.sender_id, msg.receiver_id].includes(req.user.id)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูรูปนี้' });
    }

    const file = path.resolve(UPLOAD_ROOT, msg.image_path);
    if (!file.startsWith(path.resolve(CHAT_DIR))) return res.status(400).json({ error: 'path ไม่ถูกต้อง' });

    // รูป 1 id = 1 ไฟล์ตายตัว ไม่มีวันเปลี่ยน → ให้เบราว์เซอร์ cache ยาวได้เลย
    // private = ห้าม proxy/CDN เก็บไว้แจกคนอื่น (รูปนี้ของ 2 คนนี้เท่านั้น)
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(file, (err) => {
      if (err) next(err);
    });
  } catch (e) {
    next(e);
  }
});

// ============================================================
//  อ่านข้อความ — GET /api/chat/:jobId?with=<userId>
// ============================================================
router.get('/:jobId', requireAuth, chatGuard, async (req, res) => {
  const me = req.user.id;

  const [rows] = await db.query(
    `SELECT ${MSG_COLS}
       FROM messages
      WHERE job_id = ?
        AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      ORDER BY created_at ASC, id ASC`,
    [req.params.jobId, me, req.otherId, req.otherId, me]
  );

  // เปิดอ่านแล้ว = ลบ badge "ข้อความใหม่" + บอกคนส่งว่าอ่านแล้ว (ติ๊กน้ำเงิน)
  const readIds = await markRead(req.params.jobId, me, req.otherId);
  if (readIds.length) {
    realtime.emitToBoth(me, req.otherId, 'chat:read', {
      job_id: Number(req.params.jobId),
      by: me,
      ids: readIds,
      at: new Date().toISOString(),
    });
  }

  const [[other]] = await db.query('SELECT last_seen_at FROM users WHERE id = ?', [req.otherId]);

  res.json({
    items: rows,
    me,
    other_id: req.otherId,
    other_online: realtime.isOnline(req.otherId),
    other_last_seen: other?.last_seen_at || null,
  });
});

// ============================================================
//  ส่งข้อความ — POST /api/chat/:jobId
//  ปกติหน้าเว็บส่งผ่าน socket ('chat:send') เส้นนี้เป็นทางสำรองไว้เผื่อ socket ต่อไม่ติด
// ============================================================
router.post('/:jobId', requireAuth, chatGuard, async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'พิมพ์ข้อความก่อนส่ง' });
  if (body.length > 4000) return res.status(400).json({ error: 'ข้อความยาวเกินไป' });

  const msg = await insertMessage({
    jobId: Number(req.params.jobId),
    from: req.user.id,
    to: req.otherId,
    kind: 'text',
    body,
  });

  const row = { ...msg, client_id: req.body.client_id || null };
  realtime.emitToBoth(req.user.id, req.otherId, 'chat:new', row);
  res.json({ ok: true, message: row });
});

// ============================================================
//  ส่งรูป — POST /api/chat/:jobId/image?with=<userId>   (multipart: image)
//  ทำไมไม่ส่งผ่าน socket: ไฟล์ใหญ่ ยิงผ่าน WebSocket แล้วบล็อกข้อความอื่นทั้งเส้น
//  ส่งขึ้นทาง HTTP แล้วค่อยให้ socket เด้งบอกทั้ง 2 ฝั่งว่ามีรูปใหม่
// ============================================================
router.post('/:jobId/image', requireAuth, chatGuard, upload.single('image'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'ยังไม่ได้เลือกรูป' });

  try {
    const relPath = path.relative(UPLOAD_ROOT, req.file.path).split(path.sep).join('/');
    const size = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 && n < 65535 ? Math.round(n) : null;
    };

    const msg = await insertMessage({
      jobId: Number(req.params.jobId),
      from: req.user.id,
      to: req.otherId,
      kind: 'image',
      imagePath: relPath,
      imageW: size(req.body.w),
      imageH: size(req.body.h),
    });

    const row = { ...msg, client_id: req.body.client_id || null };
    realtime.emitToBoth(req.user.id, req.otherId, 'chat:new', row);
    res.json({ ok: true, message: row });
  } catch (e) {
    // บันทึกลง DB ไม่ผ่าน = ไฟล์ที่เพิ่งเขียนไปกลายเป็นขยะ เก็บกวาดซะ
    fs.unlink(req.file.path, () => {});
    next(e);
  }
});

module.exports = router;
