// ============================================================
//  แจ้งเตือนในแอพ — กระดิ่งบนหัวเว็บ
//
//  ใช้ตอน "งานของฉันมีอะไรเปลี่ยนไปโดยที่ฉันไม่ได้เป็นคนทำ" (ตกลงกับพี่ดิว ข้อ 6)
//  เช่น อีกฝ่ายยกเลิกงาน / ตอบรับ / ปฏิเสธ / ปิดงาน / มีคนมากดขอรับงานของเรา
//
//  ⚠️ กฎ: ไม่แจ้งเตือนคนที่เป็นคนกดเอง — เขาเพิ่งกดปุ่มนั้นกับมือ เห็น toast ไปแล้ว
//     คนเรียกต้องส่ง userId ของ "อีกฝ่าย" มาเสมอ
//
//  แจ้งเตือนล้มไม่ควรทำให้การกระทำหลักล้มตาม — ยกเลิกงานสำเร็จแล้วแต่เขียนแจ้งเตือนพลาด
//  ต้องไม่กลายเป็น 500 ที่ทำให้ผู้ใช้กดยกเลิกซ้ำอีกรอบ → ที่นี่กลืน error เองทั้งหมด
// ============================================================
const db = require('./db');
const realtime = require('./realtime');

async function notify(userId, { jobId = null, type, title, body = null }) {
  if (!userId) return;

  try {
    const [r] = await db.query(
      'INSERT INTO notifications (user_id, job_id, type, title, body) VALUES (?,?,?,?,?)',
      [userId, jobId, type, String(title).slice(0, 200), body ? String(body).slice(0, 500) : null]
    );

    // เด้งสดให้คนที่เปิดเว็บค้างอยู่ — ไม่ต้องรอรอบ poll 15 วิ
    realtime.emitTo(userId, 'notify', {
      id: r.insertId,
      job_id: jobId,
      type,
      title,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    });
  } catch (e) {
    console.error('บันทึกแจ้งเตือนไม่สำเร็จ:', e.message);
  }
}

// แจ้งหลายคนพร้อมกัน (เช่น ผู้ว่าจ้างถอนประกาศ → บอกผู้สมัครทุกคน)
async function notifyMany(userIds, payload) {
  await Promise.all([...new Set(userIds.filter(Boolean))].map((id) => notify(id, payload)));
}

module.exports = { notify, notifyMany };
