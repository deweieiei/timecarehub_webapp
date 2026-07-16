-- ============================================================
--  รอบที่ 3 — โปรไฟล์บัญชีผู้ใช้ (ใช้ร่วมกันทั้ง 2 บทบาท)
--
--  เก็บไว้ในตาราง users เพราะเป็นข้อมูล "ของคน" ไม่ใช่ "ของบทบาท"
--  (1 บัญชีสลับ 2 บทบาท → ชื่อ/บัตร/ที่อยู่ ใช้ชุดเดียวกัน)
--
--  ⚠️ ใส่ฟิลด์ไว้เยอะก่อนตามที่พี่ดิวสั่ง — ตัดออกทีหลังได้
--     ทุกคอลัมน์ NULL ได้หมด บัญชีเก่าจึงไม่พังและไม่ต้องกรอกย้อนหลัง
--
--  รันซ้ำได้ — migrate.js ข้าม error "คอลัมน์มีอยู่แล้ว" ให้เอง
-- ============================================================

-- ---------- ข้อมูลส่วนตัว ----------
ALTER TABLE users ADD COLUMN title_prefix   VARCHAR(30)  NULL;   -- นาย / นาง / นางสาว
ALTER TABLE users ADD COLUMN nickname       VARCHAR(60)  NULL;
ALTER TABLE users ADD COLUMN birth_date     DATE         NULL;   -- เก็บวันเกิด ไม่เก็บอายุ (อายุคำนวณสด)
ALTER TABLE users ADD COLUMN gender         ENUM('male','female','other','undisclosed') NULL;
ALTER TABLE users ADD COLUMN nationality    VARCHAR(60)  NULL;
ALTER TABLE users ADD COLUMN religion       VARCHAR(60)  NULL;
ALTER TABLE users ADD COLUMN marital_status ENUM('single','married','divorced','widowed') NULL;
ALTER TABLE users ADD COLUMN blood_type     ENUM('A','B','AB','O') NULL;

-- ---------- บัตรประชาชน ----------
-- ⚠️ ข้อมูลอ่อนไหวตาม PDPA — ห้าม SELECT ออกไปนอก /api/profile
--    ทุก route อื่นต้องระบุคอลัมน์ที่ต้องการเอง ห้ามใช้ SELECT u.*
ALTER TABLE users ADD COLUMN national_id             VARCHAR(13) NULL;
ALTER TABLE users ADD COLUMN national_id_issue_date  DATE        NULL;
ALTER TABLE users ADD COLUMN national_id_expiry_date DATE        NULL;

-- ---------- ช่องทางติดต่อเพิ่ม (phone/email มีอยู่แล้ว) ----------
ALTER TABLE users ADD COLUMN phone_alt VARCHAR(30) NULL;
ALTER TABLE users ADD COLUMN line_id   VARCHAR(60) NULL;

-- ---------- ที่อยู่ตามบัตรประชาชน ----------
ALTER TABLE users ADD COLUMN addr_line        VARCHAR(200) NULL;  -- บ้านเลขที่ หมู่ ซอย ถนน
ALTER TABLE users ADD COLUMN addr_subdistrict VARCHAR(100) NULL;  -- ตำบล / แขวง
ALTER TABLE users ADD COLUMN addr_district    VARCHAR(100) NULL;  -- อำเภอ / เขต
ALTER TABLE users ADD COLUMN addr_province    VARCHAR(100) NULL;
ALTER TABLE users ADD COLUMN addr_postcode    VARCHAR(10)  NULL;

-- ---------- ที่อยู่ปัจจุบัน (ที่ติดต่อได้จริง) ----------
-- cur_same_as_addr = 1 → ใช้ที่อยู่ตามบัตร ไม่ต้องกรอกซ้ำ
ALTER TABLE users ADD COLUMN cur_same_as_addr    TINYINT(1)   NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN cur_addr_line       VARCHAR(200) NULL;
ALTER TABLE users ADD COLUMN cur_addr_subdistrict VARCHAR(100) NULL;
ALTER TABLE users ADD COLUMN cur_addr_district   VARCHAR(100) NULL;
ALTER TABLE users ADD COLUMN cur_addr_province   VARCHAR(100) NULL;
ALTER TABLE users ADD COLUMN cur_addr_postcode   VARCHAR(10)  NULL;

-- ---------- ผู้ติดต่อฉุกเฉิน ----------
-- แอพดูแลผู้สูงอายุ = คนเข้าบ้านคนแปลกหน้า ทั้ง 2 ฝั่งควรมีคนติดต่อได้เวลาเกิดเรื่อง
ALTER TABLE users ADD COLUMN emergency_name     VARCHAR(120) NULL;
ALTER TABLE users ADD COLUMN emergency_relation VARCHAR(60)  NULL;
ALTER TABLE users ADD COLUMN emergency_phone    VARCHAR(30)  NULL;

-- ---------- อื่น ๆ ----------
ALTER TABLE users ADD COLUMN occupation VARCHAR(120) NULL;
ALTER TABLE users ADD COLUMN education  VARCHAR(120) NULL;
ALTER TABLE users ADD COLUMN about_me   TEXT         NULL;

-- ครั้งล่าสุดที่กดบันทึกโปรไฟล์ — เอาไว้เช็คว่ากรอกแล้วหรือยัง
ALTER TABLE users ADD COLUMN profile_updated_at DATETIME NULL;
