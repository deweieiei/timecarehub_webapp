-- ============================================================
--  รอบที่ 4 — ยกเครื่องระบบแชท
--    1. ส่งรูปได้           → messages.kind + image_path + image_w/h
--    2. สถานะส่งแล้ว/อ่านแล้ว → messages.read_at (มีแล้วตั้งแต่รอบ 2 — รอบนี้แค่ทำดัชนีให้)
--    3. ผู้ใช้ออนไลน์        → users.last_seen_at
--
--  รันซ้ำได้ — migrate.js จะข้าม error "คอลัมน์มีอยู่แล้ว" ให้เอง
-- ============================================================

-- ---------- messages: รองรับรูปภาพ ----------
-- kind = 'text'  → ใช้ body
--      = 'image' → ใช้ image_path (body เป็น NULL)
ALTER TABLE messages ADD COLUMN kind ENUM('text','image') NOT NULL DEFAULT 'text' AFTER receiver_id;

-- path ไฟล์ เทียบจากโฟลเดอร์ uploads/ เช่น 'chat/12/a1b2....jpg'
-- 🔴 ไฟล์อยู่นอก public/ — เข้า URL ตรงไม่ได้ ต้องผ่าน GET /api/chat/image/:id ที่เช็คสิทธิ์ก่อน
ALTER TABLE messages ADD COLUMN image_path VARCHAR(255) NULL AFTER body;

-- ขนาดรูป — เอาไว้กันหน้ากระตุก (จองพื้นที่ไว้ก่อนรูปโหลดเสร็จ) ไม่ได้ใช้ตรวจอะไร
ALTER TABLE messages ADD COLUMN image_w SMALLINT UNSIGNED NULL AFTER image_path;
ALTER TABLE messages ADD COLUMN image_h SMALLINT UNSIGNED NULL AFTER image_w;

-- ข้อความรูปไม่มีตัวอักษร → body ต้องว่างได้
ALTER TABLE messages MODIFY body TEXT NULL;

-- นับข้อความที่ยังไม่อ่าน (badge + ติ๊กอ่านแล้ว) ยิงบ่อยมาก — ใส่ดัชนีให้
ALTER TABLE messages ADD INDEX idx_unread (receiver_id, read_at);

-- ---------- users: ออนไลน์ / เห็นล่าสุดเมื่อ ----------
-- "ออนไลน์อยู่ตอนนี้" ไม่ได้อ่านจากคอลัมน์นี้ — ของจริงดูจาก socket ที่ต่ออยู่ (src/realtime.js)
-- คอลัมน์นี้ใช้ตอบ "เห็นล่าสุดเมื่อ..." ตอนที่เขาออฟไลน์ไปแล้ว
--
-- ⚠️ ใช้ TIMESTAMP ไม่ใช่ DATETIME โดยตั้งใจ — ให้เหมือน messages.created_at เป๊ะ ๆ
--    2 ชนิดนี้ MySQL แปลง timezone ไม่เหมือนกัน ถ้าใช้คนละชนิดแล้วเครื่องตั้ง tz ไม่ใช่ UTC
--    เวลาที่โชว์จะเพี้ยนกันเอง (อันหนึ่งตรง อีกอันเลื่อน 7 ชม.) — ใช้ชนิดเดียวกันไว้ก่อน ปลอดภัยกว่า
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMP NULL DEFAULT NULL;
