// ============================================================
//  Socket.IO — ข้อความสด, ใครออนไลน์, กำลังพิมพ์, อ่านแล้ว
//
//  หลักคิด: ไม่มี "ห้อง" ต่อแชท มีแค่ "ห้องส่วนตัวของแต่ละคน" → user:<id>
//  ทุก event ยิงเข้าห้องส่วนตัวของคนที่เกี่ยวข้องเท่านั้น (คนส่ง + คนรับ)
//  หน้าเว็บค่อยกรองเองว่าตรงกับห้องที่เปิดอยู่ไหม
//    → เปิดกี่แท็บก็ตรงกันหมด และรายการห้องแชทเด้งสดโดยไม่ต้องเปิดห้องนั้นค้างไว้
//
//  ข้อความทั้งหมดวิ่งผ่านท่อนี้ทางเดียว ไม่มีทางถอย REST แล้ว
//  (เน็ตที่บล็อก WebSocket socket.io ถอยไปใช้ HTTP long-polling ให้เองอยู่แล้ว
//   ไม่ต้องมีเส้นสำรองซ้ำซ้อน — มี 2 เส้นแปลว่าต้องกันยิงรัว 2 ที่ แล้ววันหนึ่งจะลืมที่นึง)
//
//  ⚠️ ทะเบียน "ใครออนไลน์" เก็บใน RAM ของโปรเซสนี้
//     ใช้ได้เพราะ pm2 รัน timecarehub-8091 โปรเซสเดียว (fork mode)
//     ถ้าวันไหนแตกเป็น cluster หลายโปรเซส ต้องย้ายไปเก็บที่ Redis ไม่งั้นจะเห็นออนไลน์ไม่ครบ
// ============================================================
const { Server } = require('socket.io');
const db = require('./db');
const { userIdFromCookieHeader } = require('./auth');
const { checkAccess, contactsOf, insertMessage, markRead } = require('./chat-core');
const { allow } = require('./rate-limit');

// userId → จำนวน socket ที่ต่ออยู่ (คนเดียวเปิดได้หลายแท็บ/หลายเครื่อง)
// ระหว่างช่วงผ่อนผันข้างล่าง คีย์จะยังอยู่โดยมีค่าเป็น 0 = "ยังนับว่าออนไลน์ แต่ไม่เหลือแท็บแล้ว"
const online = new Map();

// userId → timer นับถอยหลังก่อนประกาศว่าออฟไลน์
const offlineTimers = new Map();

// มือถือสลับ WiFi↔4G, เข้าลิฟต์, หรือหน้าจอดับแป๊บนึง = socket หลุดแล้วต่อกลับเองใน 2-3 วิ
// ถ้าประกาศ "ออฟไลน์" ทันทีที่หลุด จุดเขียวฝั่งเพื่อนจะกระพริบรัว ๆ
// และ contactsOf() (query UNION ก้อนใหญ่) จะถูกยิงซ้ำทุกครั้งที่กระพริบ
// → รอให้แน่ใจก่อนค่อยประกาศ ต่อกลับมาทันในช่วงนี้ = เพื่อนไม่รู้เรื่องเลย
const OFFLINE_GRACE_MS = 8000;

// สิทธิ์ในห้องแชทแทบไม่เปลี่ยนระหว่างที่นั่งคุยกันอยู่ แต่ checkAccess() ยิง 1-2 query ทุกครั้งที่ถูกเรียก
// ลำพัง "กำลังพิมพ์" อย่างเดียวก็ยิงทุก 2 วิต่อคนที่กำลังพิมพ์แล้ว → จำคำตอบไว้สั้น ๆ ต่อ socket
// 30 วิ = ถ้าถูกถอนสิทธิ์กลางคัน อย่างช้าที่สุดอีก 30 วิก็คุยต่อไม่ได้แล้ว รับได้
// (ไม่แคชข้ามคน: Map อยู่ใน socket.data ตายไปพร้อม socket — ไม่มีทางหยิบของคนอื่นมาใช้ผิด)
const ACCESS_TTL_MS = 30000;

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

// เช็คสิทธิ์แบบมีแคช — ตัวจริงอยู่ที่ chat-core.js ที่เดียวเหมือนเดิม ตรงนี้แค่จำคำตอบไว้
function accessFor(socket, jobId, wanted) {
  const key = `${jobId}:${wanted ?? ''}`;
  const hit = socket.data.access.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;

  // เก็บเป็น promise ไม่ใช่ค่าที่ resolve แล้ว — พิมพ์รัว ๆ ยิงพร้อมกัน 3 event
  // จะได้ query รอบเดียว ไม่ใช่ 3 รอบพร้อมกันเพราะยังไม่มีใครเขียนแคชลงไป
  const val = checkAccess(jobId, socket.data.userId, wanted).catch((e) => {
    // DB สะดุดชั่วคราว — ทิ้งแคชทันที ไม่งั้นจำความล้มเหลวไว้ยาว 30 วิ แล้วพังซ้ำทุก event
    socket.data.access.delete(key);
    throw e;
  });
  socket.data.access.set(key, { val, exp: Date.now() + ACCESS_TTL_MS });
  return val;
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
    socket.data.access = new Map();

    socket.join(room(me));

    // เพิ่งหลุดไปแล้วต่อกลับมาทันช่วงผ่อนผัน → ยกเลิกคิวประกาศออฟไลน์ทิ้ง
    // เพื่อนยังไม่เคยรู้ว่าเราหลุด ก็ไม่ต้องประกาศว่าเรากลับมา (online ยังมีคีย์เราอยู่ → wasOffline = false)
    const grace = offlineTimers.get(me);
    if (grace) {
      clearTimeout(grace);
      offlineTimers.delete(me);
    }

    // socket แรกของคนนี้ = เพิ่งออนไลน์จริง ๆ → ค่อยประกาศ (เปิดแท็บที่ 2 ไม่ต้องประกาศซ้ำ)
    const wasOffline = !online.has(me);
    online.set(me, (online.get(me) || 0) + 1);
    if (wasOffline) broadcastPresence(me, true);

    // ---------- ส่งข้อความ ----------
    socket.on('chat:send', async (payload = {}, cb) => {
      const ack = typeof cb === 'function' ? cb : () => {};
      try {
        // กันยิงรัวก่อนอย่างอื่นเสมอ — ด่านนี้ต้องถูกที่สุด ห้ามแตะ DB ก่อนผ่านตรงนี้
        if (!allow('send', me)) return ack({ error: 'ส่งข้อความถี่เกินไป พักสักครู่แล้วลองใหม่' });

        const jobId = Number(payload.jobId);
        const body = String(payload.body || '').trim();
        if (!jobId) return ack({ error: 'ไม่รู้ว่าจะส่งเข้างานไหน' });
        if (!body) return ack({ error: 'พิมพ์ข้อความก่อนส่ง' });
        if (body.length > 4000) return ack({ error: 'ข้อความยาวเกินไป' });

        const access = await accessFor(socket, jobId, payload.to);
        if (access.error) return ack({ error: access.error });

        // client_id = เลขอ้างอิงที่หน้าเว็บสร้างเอง ใช้ 2 อย่าง:
        //   1. ส่งกลับไปให้มันจับคู่กับฟองข้อความที่โชว์ล่วงหน้า
        //   2. กันบันทึกซ้ำตอนผู้ใช้กดส่งใหม่เพราะ ack รอบก่อนหายไป (ดู db/005)
        const { duplicate, ...msg } = await insertMessage({
          jobId, from: me, to: access.otherId, kind: 'text', body,
          clientId: payload.client_id,
        });

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
    // แต่ยังต้องเช็คสิทธิ์ทุกครั้ง ไม่งั้นใครก็ยิงกวนคนอื่นได้ (ตอนนี้เช็คจากแคช แทบไม่แตะ DB แล้ว)
    socket.on('chat:typing', async (payload = {}) => {
      try {
        if (!allow('typing', me)) return;

        const jobId = Number(payload.jobId);
        if (!jobId) return;
        const access = await accessFor(socket, jobId, payload.to);
        if (access.error) return;

        io.to(room(access.otherId)).emit('chat:typing', {
          job_id: jobId,
          from: me,
          on: !!payload.on,
        });
      } catch { /* ปล่อยผ่าน — เรื่องเล็ก */ }
    });

    // ---------- อ่านแล้ว ----------
    // ต้อง ack กลับทุกทางออก: หน้าเว็บรอ ack ตัวนี้ก่อนค่อยดึงเลขแดงมาใหม่
    // (ยิง refreshBadges พร้อมกันเลยจะได้เลขเก่ากลับมา เพราะ UPDATE ยังไม่ลง)
    socket.on('chat:read', async (payload = {}, cb) => {
      const ack = typeof cb === 'function' ? cb : () => {};
      try {
        if (!allow('read', me)) return ack({ ok: false });

        const jobId = Number(payload.jobId);
        if (!jobId) return ack({ ok: false });
        const access = await accessFor(socket, jobId, payload.otherId);
        if (access.error) return ack({ ok: false });

        const ids = await markRead(jobId, me, access.otherId);
        if (!ids.length) return ack({ ok: true });   // อ่านไปหมดแล้ว ไม่ต้องกวนใคร

        toBoth(me, access.otherId, 'chat:read', {
          job_id: jobId,
          by: me,
          ids,
          at: new Date().toISOString(),
        });
        ack({ ok: true });
      } catch (e) {
        console.error('chat:read ล้ม:', e.message);
        ack({ ok: false });
      }
    });

    socket.on('disconnect', () => {
      const left = (online.get(me) || 1) - 1;
      online.set(me, left);
      if (left > 0) return;   // ยังเหลือแท็บอื่นเปิดอยู่ = ยังออนไลน์

      // ไม่มีแท็บเหลือแล้ว แต่ยังไม่ประกาศทันที — คงสถานะออนไลน์ไว้ก่อน เผื่อเน็ตแค่สะดุด
      offlineTimers.set(me, setTimeout(() => {
        offlineTimers.delete(me);
        if ((online.get(me) || 0) > 0) return;   // ต่อกลับมาแล้ว ไม่ต้องทำอะไร

        online.delete(me);
        touchLastSeen(me);
        broadcastPresence(me, false);
      }, OFFLINE_GRACE_MS));
    });
  });

  return io;
}

// ให้ฝั่ง REST เรียกใช้ได้ (อัปโหลดรูปไปทาง HTTP แต่ต้องเด้งเข้าแชทสด)
function emitToBoth(a, b, event, payload) {
  if (io) toBoth(a, b, event, payload);
}

module.exports = { init, isOnline, emitToBoth };
