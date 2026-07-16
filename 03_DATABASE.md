# 🗄️ ฐานข้อมูล TimeCareHub

**DB:** `timecarehub` บน MySQL 8.4 (`127.0.0.1:3306`)
**User:** `timecarehub` — เข้าได้เฉพาะ DB นี้ ไม่ใช่ root
**ไฟล์ต้นฉบับ:** `db/schema.sql` → สร้างด้วย `npm run migrate`

---

## ภาพรวมความสัมพันธ์

```
users (1 บัญชี สลับ 2 บทบาท)
  │
  ├─1:1─→ caregiver_profiles   (โปรไฟล์ + สถานะ KYC + คะแนนดาว)
  │
  ├─1:N─→ jobs                 (งานที่โพส — employer_id)
  │
  └─1:N─→ job_applications     (งานที่กดขอรับ — caregiver_id)

jobs
  ├─1:N─→ job_applications     (1 งาน หลายคนกดขอ)
  ├─1:N─→ messages             (แชทผูกกับงาน)
  └─1:N─→ reviews              (ให้ดาวได้ 2 ฝั่ง ฝั่งละ 1 ครั้ง)
```

---

## 1. `users` — บัญชีผู้ใช้

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | INT PK | |
| `email` | VARCHAR(190) **UNIQUE** | ใช้ล็อกอิน |
| `password_hash` | VARCHAR(255) | bcrypt |
| `full_name` | VARCHAR(120) | |
| `phone` | VARCHAR(30) | |
| `active_role` | ENUM(`employer`,`caregiver`) | บทบาทที่กำลังใช้อยู่ — สลับได้ตลอด |
| `is_admin` | TINYINT(1) | 1 = แอดมิน |
| `created_at` | TIMESTAMP | |

> **สำคัญ:** ไม่มีตาราง caregiver แยก — ทุกคนสลับบทบาทได้ในบัญชีเดียว
> ตาม requirement ที่ตกลงกันในที่ประชุม

---

## 2. `caregiver_profiles` — โปรไฟล์ + KYC

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `user_id` | INT PK FK | 1:1 กับ users |
| `bio` | TEXT | แนะนำตัว |
| `experience_years` | INT | ประสบการณ์ (ปี) |
| `skills` | VARCHAR(500) | เช่น "ผู้ช่วยพยาบาล, ทำกายภาพ" |
| **`kyc_status`** | ENUM(`none`,`pending`,`approved`,`rejected`) | ⭐ ตัวคุมทุกอย่าง |
| `kyc_id_card` | VARCHAR(255) | ชื่อไฟล์รูปบัตร ปชช. |
| `kyc_selfie` | VARCHAR(255) | ชื่อไฟล์เซลฟี่คู่บัตร |
| `kyc_note` | VARCHAR(500) | เหตุผลที่แอดมินปฏิเสธ |
| `kyc_submitted_at` / `kyc_reviewed_at` | DATETIME | |
| `rating_avg` | DECIMAL(3,2) | คะแนนเฉลี่ย |
| `rating_count` | INT | จำนวนรีวิว |

### วงจร kyc_status

```
none ──ส่งเอกสาร──→ pending ──แอดมินกด──→ approved  ✅ รับงานได้ + เห็นพิกัดเป๊ะ
                        │
                        └──แอดมินกด──→ rejected ──แก้แล้วส่งใหม่──→ pending
```

**`approved` เท่านั้น** ถึงจะ:
1. กดขอรับงานได้ (`requireApprovedCaregiver`)
2. เห็นพิกัดเป๊ะ + ที่อยู่เต็ม (`src/geo.js`)

> โปรไฟล์ถูกสร้างอัตโนมัติตอนสมัคร (kyc_status = `none`) เพราะทุกคนสลับมาเป็นแคร์กิฟเวอร์ได้

---

## 3. `jobs` — งานที่โพส

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | INT PK | |
| `employer_id` | INT FK | คนโพส |
| `title` | VARCHAR(200) | |
| `elder_condition` | TEXT | อาการ/สภาพผู้สูงอายุ |
| `tasks` | TEXT | สิ่งที่ต้องช่วยทำ |
| `care_type` | ENUM(`hourly`,`daily`,`overnight`,`live_in`) | รายชั่วโมง / รายวัน / ค้างคืน / อยู่ประจำ |
| `start_date` / `end_date` | DATE | |
| `budget` | DECIMAL(10,2) | **งบที่ตั้งไว้** — ตกลงจริงในแชท |
| `budget_unit` | ENUM(`per_hour`,`per_day`,`per_month`,`total`) | |
| **`lat` / `lng`** | DECIMAL(10,7) | ⭐ พิกัดจริง — ถูก mask ก่อนส่งออก |
| **`address`** | VARCHAR(300) | ⭐ ที่อยู่เต็ม — เปิดเฉพาะคนที่ผ่าน KYC |
| `area_label` | VARCHAR(120) | ชื่อย่านคร่าว ๆ เช่น "ลาดพร้าว" — **เปิดให้ทุกคนเห็น** |
| `status` | ENUM(`open`,`matched`,`done`,`cancelled`) | |
| `assigned_caregiver_id` | INT FK NULL | คนที่ถูกเลือก |

### วงจร status

```
open ──ผู้ว่าจ้างเลือกคน──→ matched ──กดงานเสร็จ──→ done ──→ ให้ดาวได้
```

> **การค้นหาตามรัศมี** ใช้สูตร Haversine คำนวณสด ๆ ใน SQL
> ยังไม่ได้ใช้ spatial index — พอไหวถึงหลักหมื่นงาน ถ้าเยอะกว่านั้นค่อยเปลี่ยนไปใช้ `POINT` + `SPATIAL INDEX`

---

## 4. `job_applications` — การกดขอรับงาน

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | INT PK | |
| `job_id` | INT FK | |
| `caregiver_id` | INT FK | |
| `message` | VARCHAR(500) | ข้อความแนะนำตัว/เสนอราคา |
| `status` | ENUM(`pending`,`accepted`,`rejected`) | |
| — | **UNIQUE (job_id, caregiver_id)** | ⭐ กดขอซ้ำไม่ได้ |

**1 งาน หลายคนกดขอได้** → ผู้ว่าจ้างเลือก 1 คน
ตอนเลือก: คนนั้น → `accepted`, ที่เหลือ → `rejected` อัตโนมัติ (ใน transaction เดียว)

---

## 5. `messages` — แชท

| คอลัมน์ | ชนิด |
|---|---|
| `id` / `job_id` / `sender_id` / `receiver_id` | INT |
| `body` | TEXT |
| `created_at` | TIMESTAMP |

**แชทผูกกับ "งาน"** ไม่ใช่ผูกกับคู่คน — เพราะคนคู่เดิมอาจคุยกันหลายงาน ต้องแยกห้อง

**ใครคุยกับใครได้:** ผู้ว่าจ้าง ↔ แคร์กิฟเวอร์ที่กดขอรับงานนั้นไว้
(คุยได้ตั้งแต่ยังไม่ถูกเลือก เพราะต้องต่อรองเวลา/ราคากันก่อน)

---

## 6. `reviews` — ให้ดาว

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `job_id` / `reviewer_id` / `reviewee_id` | INT FK | |
| `rating` | TINYINT | **CHECK 1-5** |
| `comment` | VARCHAR(500) | |
| — | **UNIQUE (job_id, reviewer_id)** | ให้ดาวงานเดิมซ้ำไม่ได้ |

**ให้ดาวได้เมื่อ `jobs.status = 'done'` เท่านั้น** และให้ได้ทั้ง 2 ฝั่ง (ผู้ว่าจ้าง ↔ แคร์กิฟเวอร์)

**คะแนนเฉลี่ยคำนวณใหม่ทั้งหมดทุกครั้ง** (ไม่ใช่บวกเพิ่ม):
```sql
UPDATE caregiver_profiles c
   SET rating_avg = (SELECT ROUND(AVG(rating),2) FROM reviews WHERE reviewee_id = c.user_id),
       rating_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = c.user_id)
 WHERE c.user_id = ?
```
> ทำแบบนี้เพื่อกันค่าเพี้ยนถ้ามีการลบรีวิวทีหลัง

---

## คำสั่งที่ใช้บ่อย

```bash
# เข้า DB
mysql -u timecarehub -p timecarehub

# ตั้งบัญชีตัวเองเป็นแอดมิน
mysql -u timecarehub -p timecarehub -e "UPDATE users SET is_admin=1 WHERE email='อีเมลคุณ';"

# ลบข้อมูลทดสอบทั้งหมด (FK จะลบต่อเป็นทอด ๆ ให้เอง)
mysql -u timecarehub -p timecarehub -e "DELETE FROM users WHERE email IN ('emp@test.com','cg@test.com');"

# ล้าง DB ทั้งหมดแล้วสร้างใหม่
mysql -u timecarehub -p timecarehub -e "DROP TABLE IF EXISTS reviews, messages, job_applications, jobs, caregiver_profiles, users;"
cd ~/timecarehub && npm run migrate
```
