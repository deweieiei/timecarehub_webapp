require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const http = require('http');
const path = require('path');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/profile', require('./src/routes/profile'));      // โปรไฟล์บัญชีผู้ใช้ (ใช้ร่วม 2 บทบาท)
app.use('/api/kyc', require('./src/routes/kyc'));
app.use('/api/jobs', require('./src/routes/jobs'));            // ระบบโพสงาน (ใครก็กดขอรับได้)
app.use('/api/caregivers', require('./src/routes/caregivers')); // ไดเรกทอรีแคร์กิฟเวอร์
app.use('/api/hires', require('./src/routes/hires'));           // จ้างตรง (ผู้จ้างเลือกคนเอง)
app.use('/api/chat', require('./src/routes/chat'));
app.use('/api/notifications', require('./src/routes/notifications'));

// ⏸ ปิดระบบให้ดาว/รีวิวไว้ก่อน (ตกลงกัน 2026-07-14 — เดโมยังไม่ต้องใช้)
//    โค้ดกับตาราง reviews ยังอยู่ครบ เปิดกลับได้ทันทีแค่เอาคอมเมนต์ออก
// app.use('/api/reviews', require('./src/routes/reviews'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'timecarehub' }));

app.use(express.static(path.join(__dirname, 'public')));

// ตัวจับ error สุดท้าย — multer และ throw จาก route จะตกมาที่นี่
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'ไฟล์ใหญ่เกิน 8 MB' });
  }
  // err.status = ตั้งใจปัดตกเอง (ผู้ใช้ส่งของผิด) → อย่าตอบ 500 ให้เขาคิดว่าระบบพัง
  if (err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในระบบ' });
});

const PORT = Number(process.env.PORT || 8091);

// HOST=0.0.0.0 → เปิดให้เข้าตรงทาง LAN ได้ (http://192.168.1.35:8091) สะดวกตอนเดโม
// HOST=127.0.0.1 → ปิดวง LAN บังคับให้เข้าผ่าน nginx (HTTPS) อย่างเดียว — ปลอดภัยกว่า ใช้ตอนขึ้นจริง
const HOST = process.env.HOST || '0.0.0.0';

// ต้องสร้าง http server เองแทน app.listen() เพราะ Socket.IO ขอเกาะตัวเดียวกันกับ Express
// (ใช้พอร์ต 8091 ร่วมกัน ไม่ได้เปิดพอร์ตใหม่ → nginx กับ firewall ไม่ต้องแก้อะไรเลย)
const server = http.createServer(app);
require('./src/realtime').init(server);

server.listen(PORT, HOST, () => {
  console.log(`TimeCareHub รันอยู่ที่ http://${HOST}:${PORT} (แชทสดผ่าน Socket.IO)`);
});
