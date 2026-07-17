const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('../db');
const { requireAuth } = require('../auth');
const { checkAccess, insertMessage, markRead, MSG_COLS } = require('../chat-core');
const { allow } = require('../rate-limit');
const realtime = require('../realtime');

const router = express.Router();

// จำนวนข้อความต่อหน้า — เปิดห้องได้เท่านี้ก่อน แล้วเลื่อนขึ้นค่อยขอเพิ่ม
// (ของเดิมดึงทั้งห้องทุกครั้ง คุยกันสัก 500 ข้อความแล้วเน็ตหลุด-ต่อใหม่ 5 รอบ = ดึงและวาดใหม่ 2,500 ฟอง)
const PAGE_SIZE = 50;

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
//  คู่สนทนาส่งมาทาง ?with= เสมอ
//    — อ่านจาก body ไม่ได้: route ที่เหลือเป็น multipart ซึ่งกว่า body จะถูกแกะ multer ก็เขียนไฟล์ไปแล้ว
//      (ข้อความล้วนไม่ผ่านทางนี้แล้ว ไปทาง socket หมด)
//  ⚠️ ต้องวางไว้ "ก่อน" multer เสมอ — คนไม่มีสิทธิ์จะได้ไม่ทันเขียนไฟล์ลงดิสก์
// ============================================================
async function chatGuard(req, res, next) {
  try {
    const access = await checkAccess(req.params.jobId, req.user.id, req.query.with);
    if (access.error) return res.status(access.status || 403).json({ error: access.error });
    req.otherId = access.otherId;
    next();
  } catch (e) {
    next(e);
  }
}

// ด่านกันยิงรูปรัว — ⚠️ ต้องวางไว้ "ก่อน" multer เหมือน chatGuard
// ไม่งั้นไฟล์ถูกเขียนลงดิสก์ไปแล้วค่อยมาปฏิเสธทีหลัง = กันอะไรไม่ได้เลย
function imageLimit(req, res, next) {
  if (!allow('image', req.user.id)) {
    return res.status(429).json({ error: 'ส่งรูปถี่เกินไป พักสักครู่แล้วลองใหม่' });
  }
  next();
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
//  อ่านข้อความ — GET /api/chat/:jobId?with=<userId>&before=<msgId>
//
//  ไม่มี before = เปิดห้อง → ได้ข้อความล่าสุด PAGE_SIZE อัน
//  มี before    = เลื่อนขึ้นไปดูของเก่า → ได้อีก PAGE_SIZE อันที่เก่ากว่านั้น
// ============================================================
router.get('/:jobId', requireAuth, chatGuard, async (req, res) => {
  const me = req.user.id;
  const jobId = req.params.jobId;

  // ใช้ id เป็นหมุด ไม่ใช่ created_at — id เป็น AUTO_INCREMENT เดินตามลำดับที่บันทึกจริง
  // ส่วน created_at ละเอียดแค่ระดับวินาที: 2 ข้อความในวินาทีเดียวกันจะหาจุดตัดไม่ได้ แล้วจะวนซ้ำหรือข้าม
  const before = Number(req.query.before) || 0;

  const params = [jobId, me, req.otherId, req.otherId, me];
  if (before) params.push(before);
  params.push(PAGE_SIZE + 1);   // ขอเกินมา 1 แถว ไว้ดูว่ายังมีของเก่าเหลืออีกไหม (ไม่ต้อง COUNT ซ้ำ)

  const [rows] = await db.query(
    `SELECT ${MSG_COLS}
       FROM messages
      WHERE job_id = ?
        AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        ${before ? 'AND id < ?' : ''}
      ORDER BY id DESC
      LIMIT ?`,
    params
  );

  const has_more = rows.length > PAGE_SIZE;
  if (has_more) rows.pop();
  rows.reverse();   // query ไล่จากใหม่→เก่าเพื่อเอาหน้าล่าสุด แต่หน้าเว็บวาดจากเก่า→ใหม่

  // เปิดอ่านแล้ว = ลบ badge "ข้อความใหม่" + บอกคนส่งว่าอ่านแล้ว (ติ๊กน้ำเงิน)
  // ทำเฉพาะตอนเปิดห้องเท่านั้น — เลื่อนดูของเก่าไม่ต้องยิงซ้ำ อ่านหมดไปตั้งแต่รอบแรกแล้ว
  if (!before) {
    const readIds = await markRead(jobId, me, req.otherId);
    if (readIds.length) {
      realtime.emitToBoth(me, req.otherId, 'chat:read', {
        job_id: Number(jobId),
        by: me,
        ids: readIds,
        at: new Date().toISOString(),
      });
    }
  }

  const [[other]] = await db.query('SELECT last_seen_at FROM users WHERE id = ?', [req.otherId]);

  res.json({
    items: rows,
    has_more,
    me,
    other_id: req.otherId,
    other_online: realtime.isOnline(req.otherId),
    other_last_seen: other?.last_seen_at || null,
  });
});

// ============================================================
//  ส่งรูป — POST /api/chat/:jobId/image?with=<userId>   (multipart: image)
//  ทำไมไม่ส่งผ่าน socket: ไฟล์ใหญ่ ยิงผ่าน WebSocket แล้วบล็อกข้อความอื่นทั้งเส้น
//  ส่งขึ้นทาง HTTP แล้วค่อยให้ socket เด้งบอกทั้ง 2 ฝั่งว่ามีรูปใหม่
//
//  ⚠️ ข้อความล้วนไม่มีเส้น REST แล้ว — วิ่งผ่าน socket ('chat:send') ทางเดียว
//     เหลือแต่รูปที่ยังต้องมาทางนี้ เพราะเหตุผลข้างบน
// ============================================================
router.post('/:jobId/image', requireAuth, imageLimit, chatGuard, upload.single('image'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'ยังไม่ได้เลือกรูป' });

  try {
    const relPath = path.relative(UPLOAD_ROOT, req.file.path).split(path.sep).join('/');
    const size = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 && n < 65535 ? Math.round(n) : null;
    };

    const { duplicate, ...msg } = await insertMessage({
      jobId: Number(req.params.jobId),
      from: req.user.id,
      to: req.otherId,
      kind: 'image',
      imagePath: relPath,
      imageW: size(req.body.w),
      imageH: size(req.body.h),
      clientId: req.body.client_id,
    });

    // อัปซ้ำด้วย client_id เดิม (ผู้ใช้กดส่งใหม่เพราะรอบก่อนค้าง) = ของเดิมอยู่ใน DB แล้ว
    // ไฟล์ที่เพิ่งเขียนลงดิสก์รอบนี้ไม่มีใครอ้างถึง → เก็บกวาดทิ้งเลย อย่าปล่อยให้กลายเป็นรูปกำพร้า
    if (duplicate) fs.unlink(req.file.path, () => {});

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
