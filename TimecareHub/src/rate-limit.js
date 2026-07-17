// ============================================================
//  ถังโทเคน (token bucket) — กันยิงรัว ใช้ร่วมกันทั้งฝั่ง socket และ REST
//
//  ทำไมไม่ใช้ express-rate-limit: มันดักได้แต่ HTTP request
//  แต่ข้อความในแชทวิ่งผ่าน WebSocket ซึ่งคือ "ต่อครั้งเดียวแล้วยิง event ได้ไม่จำกัด"
//  middleware ของ Express มองไม่เห็นเลยสักตัว → ต้องนับกันที่ชั้น event เอง
//
//  นับต่อ "ผู้ใช้" ไม่ใช่ต่อ socket — ไม่งั้นเปิด 10 แท็บก็ได้โควตา 10 เท่า
//
//  ⚠️ ถังเก็บใน RAM ของโปรเซสนี้ — กติกาเดียวกับทะเบียนออนไลน์ใน realtime.js
//     ใช้ได้เพราะ pm2 รัน timecarehub-8091 โปรเซสเดียว (fork mode)
//     ถ้าวันไหนแตกเป็น cluster ต้องย้ายไป Redis ไม่งั้นแต่ละโปรเซสนับคนละถัง = ปล่อยผ่านเป็นเท่าตัว
// ============================================================

// burst    = ยิงติด ๆ กันรวดเดียวได้กี่ครั้ง
// refillMs = เติมโทเคนคืน 1 ใบทุกกี่มิลลิวินาที (= อัตราที่ยั่งยืนในระยะยาว)
const LIMITS = {
  // คนพิมพ์เร็วส่งรัว 10 ข้อความติดได้ จากนั้นเหลือ ~1 ข้อความ/วินาที — เกินนี้คือบอทแล้ว
  send: { burst: 10, refillMs: 1000 },

  // "กำลังพิมพ์" หน้าเว็บหรี่ให้เหลือ 1 ครั้ง/2 วิอยู่แล้ว เผื่อไว้ให้หลายแท็บนิดหน่อย
  typing: { burst: 6, refillMs: 1500 },

  read: { burst: 10, refillMs: 1000 },

  // รูปหนักกว่าข้อความมาก (เขียนดิสก์ + กินแบนด์วิดท์) — ~6 รูป/นาที
  // พอสำหรับถ่ายซองยา 3-4 ใบส่งรวดเดียว แต่กันอัปรัวเป็นร้อยใบจนดิสก์เต็ม
  image: { burst: 5, refillMs: 10000 },
};

const IDLE_MS = 10 * 60 * 1000;   // ถังที่ไม่มีใครแตะเกิน 10 นาที = ทิ้งได้ เต็มอยู่แล้วแน่นอน

const buckets = new Map();   // 'send:42' → { tokens, last, exp }

// คืน true = ผ่าน, false = ยิงถี่เกินโควตา
function allow(kind, userId) {
  const rule = LIMITS[kind];
  if (!rule) throw new Error(`rate-limit: ไม่รู้จักประเภท '${kind}'`);

  const key = `${kind}:${userId}`;
  const now = Date.now();

  let b = buckets.get(key);
  if (!b) {
    b = { tokens: rule.burst, last: now, exp: 0 };
    buckets.set(key, b);
  }

  // เติมโทเคนตามเวลาที่ผ่านไปจริง — ไม่ต้องมี timer เดินเติมให้ทุกถัง คิดตอนใช้เอาก็พอ
  b.tokens = Math.min(rule.burst, b.tokens + (now - b.last) / rule.refillMs);
  b.last = now;
  b.exp = now + IDLE_MS;

  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// กวาดถังของคนที่เลิกใช้ไปแล้ว — ไม่งั้น Map โตตามจำนวนคนที่เคยเข้ามาทั้งหมด ไม่มีวันลด
// unref() = timer ตัวนี้ไม่ต้องรั้งโปรเซสไว้ตอนสั่งปิด
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.exp < now) buckets.delete(key);
}, 5 * 60 * 1000).unref();

module.exports = { allow };
