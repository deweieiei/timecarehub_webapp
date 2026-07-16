// ============================================================
//  Socket.IO — ข้อความสด, ใครออนไลน์, กำลังพิมพ์, อ่านแล้ว
//
//  หลักคิด: ไม่มี "ห้อง" ต่อแชท มีแค่ "ห้องส่วนตัวของแต่ละคน" → user:<id>
//  ทุก event ยิงเข้าห้องส่วนตัวของคนที่เกี่ยวข้องเท่านั้น (คนส่ง + คนรับ)
//  หน้าเว็บค่อยกรองเองว่าตรงกับห้องที่เปิดอยู่ไหม
//    → เปิดกี่แท็บก็ตรงกันหมด และรายการห้องแชทเด้งสดโดยไม่ต้องเปิดห้องนั้นค้างไว้
//
//  ⚠️ ทะเบียน "ใครออนไลน์" เก็บใน RAM ของโปรเซสนี้
//     ใช้ได้เพราะ pm2 รัน timecarehub-8091 โปรเซสเดียว (fork mode)
//     ถ้าวันไหนแตกเป็น cluster หลายโปรเซส ต้องย้ายไปเก็บที่ Redis ไม่งั้นจะเห็นออนไลน์ไม่ครบ
// ============================================================
const { Server } = require('socket.io');
const db = require('./db');
const { userIdFromCookieHeader } = require('./auth');
const { checkAccess, contactsOf, insertMessage, markRead } = require('./chat-core');

// userId → จำนวน socket ที่ต่ออยู่ (คนเดียวเปิดได้หลายแท็บ/หลายเครื่อง)
const online = new Map();

let io = null;

const room = (userId) => `user:${userId}`;
const isOnline = (userId) => online.has(Number(userId));

// เขียนเวลา "เห็นล่าสุด" ลง DB — ใช้ตอนเขาออฟไลน์ไปแล้ว
async function touchLastSeen(userId) {
  try {
    await db.query('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [userId]);
  } catch (e) {
    console.error('last_seen_at ไม่สำเร็จ:', e.message);
  }
}

// บอกเฉพาะคนที่เคยคุยกับเรา ว่าเราออนไลน์/ออฟไลน์แล้ว — คนอื่นไม่เกี่ยว ไม่ต้องรู้
//
// ไม่ส่งเวลา "เห็นล่าสุด" ติดไปด้วยโดยตั้งใจ: คนรับ event เห็นกับตาอยู่แล้วว่าอีกฝั่งเพิ่งหลุดตอนนี้
// → ให้หน้าเว็บจับเวลาด้วยนาฬิกาตัวเอง จบ ไม่ต้องเอาเวลาจาก Node ไปปนกับเวลาจาก MySQL
//   (2 นาฬิกานี้ตั้ง timezone คนละแบบได้ ปนกันเมื่อไหร่ "เห็นล่าสุด" จะเพี้ยนแบบหาต้นตอยาก)
async function broadcastPresence(userId, isNowOnline) {
  try {
    const contacts = await contactsOf(userId);
    if (!contacts.length) return;
    io.to(contacts.map(room)).emit('presence', { user_id: userId, online: isNowOnline });
  } catch (e) {
    console.error('broadcast presence ไม่สำเร็จ:', e.message);
  }
}

// ส่ง event ให้ "ทั้งสองฝั่งของบทสนทนา" (ทุกแท็บที่เปิดอยู่)
function toBoth(a, b, event, payload) {
  io.to([room(a), room(b)]).emit(event, payload);
}

function init(server) {
  io = new Server(server, {
    // ต่อไม่ติดแบบ WebSocket (เน็ตบางที่บล็อก) socket.io จะถอยไปใช้ HTTP long-polling ให้เอง
    // nginx บนเครื่อง serverlive มี header ของ WebSocket อยู่ใน snippets/proxy-common.conf แล้ว
    pingTimeout: 25000,
    maxHttpBufferSize: 1e6,   // แชทส่งแต่ข้อความ — รูปไปทาง HTTP POST ไม่ผ่านท่อนี้
  });

  // ด่านตรวจตอนต่อเข้ามา — ใช้ cookie ตัวเดียวกับเว็บ (ไม่มี token แยก)
  io.use((socket, next) => {
    const userId = userIdFromCookieHeader(socket.handshake.headers.cookie);
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const me = socket.data.userId;

    socket.join(room(me));

    // socket แรกของคนนี้ = เพิ่งออนไลน์ → ค่อยประกาศ (เปิดแท็บที่ 2 ไม่ต้องประกาศซ้ำ)
    const wasOffline = !online.has(me);
    online.set(me, (online.get(me) || 0) + 1);
    if (wasOffline) broadcastPresence(me, true);

    // ---------- ส่งข้อความ ----------
    socket.on('chat:send', async (payload = {}, cb) => {
      const ack = typeof cb === 'function' ? cb : () => {};
      try {
        const jobId = Number(payload.jobId);
        const body = String(payload.body || '').trim();
        if (!jobId) return ack({ error: 'ไม่รู้ว่าจะส่งเข้างานไหน' });
        if (!body) return ack({ error: 'พิมพ์ข้อความก่อนส่ง' });
        if (body.length > 4000) return ack({ error: 'ข้อความยาวเกินไป' });

        const access = await checkAccess(jobId, me, payload.to);
        if (access.error) return ack({ error: access.error });

        const msg = await insertMessage({ jobId, from: me, to: access.otherId, kind: 'text', body });

        // client_id = เลขอ้างอิงที่หน้าเว็บสร้างเอง — ส่งกลับไปให้มันจับคู่กับฟองข้อความที่โชว์ล่วงหน้า
        const row = { ...msg, client_id: payload.client_id || null };
        toBoth(me, access.otherId, 'chat:new', row);
        ack({ ok: true, message: row });
      } catch (e) {
        console.error('chat:send ล้ม:', e);
        ack({ error: 'ส่งข้อความไม่สำเร็จ' });
      }
    });

    // ---------- กำลังพิมพ์ ----------
    // ไม่ได้ "บันทึก" สถานะไว้ที่ไหน แค่เคาะบอกอีกฝั่ง — หลุดหายก็ไม่มีใครเดือดร้อน
    // แต่ยังต้องเช็คสิทธิ์ทุกครั้ง ไม่งั้นใครก็ยิงกวนคนอื่นได้ (หน้าเว็บหรี่ให้เหลือ 1 ครั้ง/2 วิ อยู่แล้ว)
    socket.on('chat:typing', async (payload = {}) => {
      try {
        const jobId = Number(payload.jobId);
        if (!jobId) return;
        const access = await checkAccess(jobId, me, payload.to);
        if (access.error) return;

        io.to(room(access.otherId)).emit('chat:typing', {
          job_id: jobId,
          from: me,
          on: !!payload.on,
        });
      } catch { /* ปล่อยผ่าน — เรื่องเล็ก */ }
    });

    // ---------- อ่านแล้ว ----------
    socket.on('chat:read', async (payload = {}) => {
      try {
        const jobId = Number(payload.jobId);
        if (!jobId) return;
        const access = await checkAccess(jobId, me, payload.otherId);
        if (access.error) return;

        const ids = await markRead(jobId, me, access.otherId);
        if (!ids.length) return;   // อ่านไปหมดแล้ว ไม่ต้องกวนใคร

        toBoth(me, access.otherId, 'chat:read', {
          job_id: jobId,
          by: me,
          ids,
          at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('chat:read ล้ม:', e.message);
      }
    });

    socket.on('disconnect', () => {
      const left = (online.get(me) || 1) - 1;
      if (left > 0) return online.set(me, left);   // ยังเหลือแท็บอื่นเปิดอยู่ = ยังออนไลน์

      online.delete(me);
      touchLastSeen(me);
      broadcastPresence(me, false);
    });
  });

  return io;
}

// ให้ฝั่ง REST เรียกใช้ได้ (อัปโหลดรูปไปทาง HTTP แต่ต้องเด้งเข้าแชทสด)
function emitToBoth(a, b, event, payload) {
  if (io) toBoth(a, b, event, payload);
}

module.exports = { init, isOnline, emitToBoth };
