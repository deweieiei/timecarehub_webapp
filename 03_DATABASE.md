# 🗄️ ฐานข้อมูล TimeCareHub

**อัปเดตล่าสุด:** 2026-07-17 — รวม migration 002 (จ้างตรง) + 003 (โปรไฟล์) + **004 (ยกเครื่องแชท)** แล้ว

**DB:** `timecarehub` บน MySQL 8.4 (`127.0.0.1:3306`)
**User:** `timecarehub` — เข้าได้เฉพาะ DB นี้ ไม่ใช่ root
**ไฟล์ต้นฉบับ:** `TimecareHub/db/*.sql` → สร้าง/อัปเดตด้วย `npm run migrate`

> **โครงสร้าง DB ปัจจุบัน = schema.sql + 002 + 003 + 004 รวมกัน**
> `migrate.js` รันทุกไฟล์เรียงตามชื่อ และข้าม error "มีอยู่แล้ว" → รันซ้ำได้ปลอดภัย
> ⚠️ **อย่าแก้ไฟล์ .sql เก่าที่รันไปแล้ว** — เขียนไฟล์ใหม่เป็นเลขถัดไป (`005_xxx.sql`)

---

## ⚠️ เรื่อง timezone — อ่านก่อนแตะอะไรที่เกี่ยวกับ "เวลา"

**`src/db.js` สั่ง `SET time_zone = '+00:00'` ทุก connection — บรรทัดนั้นห้ามลบ**

เดิมเวลาที่โชว์บนเว็บ **ล้ำหน้าไป 7 ชั่วโมงทุกที่** (แก้ 2026-07-17) ปมคือ:

| | |
|---|---|
| MySQL ตั้ง `time_zone = SYSTEM` (เวลาไทย) | `NOW()` คืน `03:50` = 03:50 **เวลาไทย** |
| แต่ `db.js` ตั้ง `timezone: 'Z'` | mysql2 อ่านค่านั้นว่าเป็น 03:50 **UTC** |
| เบราว์เซอร์แปลง UTC → เวลาไทยอีกรอบ | โชว์ **10:50** ทั้งที่เพิ่งส่งข้อความไปเมื่อกี้ |

บังคับ session ของ DB ให้พูด UTC → 2 ฝั่งพูดภาษาเดียวกัน **และถูกต้องไม่ว่าเครื่องจะตั้ง timezone อะไรไว้**
(เครื่อง dev กับเครื่องจริงตั้งไม่เหมือนกันได้)

> **ผลข้างเคียงที่ต้องรู้:** แถว `profile_updated_at` **ที่เขียนไว้ก่อน 2026-07-17** จะโชว์เพี้ยน +7 ชม.
> จนกว่าเจ้าของจะกดบันทึกโปรไฟล์อีกครั้ง (คอลัมน์ DATETIME ของเก่าเก็บเวลาไทยไว้ แต่ตอนนี้ถูกอ่านเป็น UTC)
> คอลัมน์ TIMESTAMP ทั้งหมด (`created_at`, `last_seen_at`) **ไม่กระทบ** เพราะข้างในเก็บเป็น UTC อยู่แล้ว

---

## ภาพรวมความสัมพันธ์

```
users (1 บัญชี สลับ 2 บทบาท + โปรไฟล์ส่วนตัว)
  │
  ├─1:1─→ caregiver_profiles   (โปรไฟล์ฝั่งรับงาน + สถานะ KYC + เรต + คะแนนดาว)
  │
  ├─1:N─→ jobs                 (งานที่โพส / คำขอจ้างที่ส่ง — employer_id)
  │
  ├─1:N─→ jobs                 (คำขอจ้างที่ได้รับ — target_caregiver_id)
  │
  └─1:N─→ job_applications     (งานที่กดขอรับ — caregiver_id)

jobs
  ├─1:N─→ job_applications     (1 งาน หลายคนกดขอ — เฉพาะ hire_type='open')
  ├─1:N─→ messages             (แชทผูกกับงาน)
  └─1:N─→ reviews              (ให้ดาวได้ 2 ฝั่ง ฝั่งละ 1 ครั้ง — ⏸ ปิดอยู่)
```

---

## 1. `users` — บัญชีผู้ใช้ + โปรไฟล์ส่วนตัว

### คอลัมน์หลัก (จาก `schema.sql`)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | INT PK | |
| `email` | VARCHAR(190) **UNIQUE** | ใช้ล็อกอิน — เปลี่ยนเองไม่ได้ |
| `password_hash` | VARCHAR(255) | bcrypt |
| `full_name` | VARCHAR(120) | |
| `phone` | VARCHAR(30) | |
| `active_role` | ENUM(`employer`,`caregiver`) | บทบาทที่กำลังใช้อยู่ — สลับได้ตลอด |
| `is_admin` | TINYINT(1) | 1 = แอดมิน |
| `created_at` | TIMESTAMP | |
| 🆕 `last_seen_at` | TIMESTAMP NULL | ครั้งล่าสุดที่ปิดแชทไป → ใช้ตอบ **"เห็นล่าสุดเมื่อ..."**<br>⚠️ **"ออนไลน์อยู่ตอนนี้" ไม่ได้อ่านจากคอลัมน์นี้** — ของจริงดูจาก socket ที่ต่อค้างอยู่ใน RAM (`src/realtime.js`) |

> **สำคัญ:** ไม่มีตาราง caregiver แยก — ทุกคนสลับบทบาทได้ในบัญชีเดียว
>
> 🆕 **`last_seen_at` เป็น TIMESTAMP ไม่ใช่ DATETIME โดยตั้งใจ** — ให้เหมือน `created_at` เป๊ะ ๆ
> 2 ชนิดนี้ MySQL แปลง timezone ไม่เหมือนกัน ใช้คนละชนิดเมื่อไหร่ เวลาที่โชว์จะเพี้ยนกันเอง

### 🆕 คอลัมน์โปรไฟล์ (จาก `003_user_profile.sql`) — **NULL ได้ทุกช่อง**

เก็บไว้ใน `users` เพราะเป็นข้อมูล **"ของคน"** ไม่ใช่ "ของบทบาท" — 1 บัญชีสลับ 2 บทบาทใช้ชุดเดียวกัน

| กลุ่ม | คอลัมน์ |
|---|---|
| **ส่วนตัว** | `title_prefix` · `nickname` · `birth_date` · `gender` ENUM(male,female,other,undisclosed) · `nationality` · `religion` · `marital_status` ENUM(single,married,divorced,widowed) · `blood_type` ENUM(A,B,AB,O) · `about_me` |
| **🔒 บัตรประชาชน** | **`national_id`** VARCHAR(13) · `national_id_issue_date` · `national_id_expiry_date` |
| **ติดต่อ** | `phone_alt` · `line_id` |
| **ที่อยู่ตามบัตร** | `addr_line` · `addr_subdistrict` · `addr_district` · `addr_province` · `addr_postcode` |
| **ที่อยู่ปัจจุบัน** | `cur_same_as_addr` TINYINT(1) DEFAULT 1 · `cur_addr_line` · `cur_addr_subdistrict` · `cur_addr_district` · `cur_addr_province` · `cur_addr_postcode` |
| **ผู้ติดต่อฉุกเฉิน** | `emergency_name` · `emergency_relation` · `emergency_phone` |
| **อื่น ๆ** | `occupation` · `education` · `profile_updated_at` |

> ### ⚠️ `national_id` = ข้อมูลอ่อนไหวสูงสุดตาม PDPA
> **`/api/profile` เป็น route เดียวในระบบที่ได้รับอนุญาตให้ส่งออก และส่งให้เจ้าของบัญชีเท่านั้น**
> route อื่น ๆ **ห้ามใช้ `SELECT u.*`** เด็ดขาด ต้องระบุคอลัมน์ที่ต้องการเอง
>
> **ไม่เก็บ "อายุ" เก็บ `birth_date` แทน** — อายุคำนวณสดตอนอ่าน ไม่งั้นปีหน้าค่าจะผิดเอง

---

## 2. `caregiver_profiles` — โปรไฟล์ฝั่งรับงาน + KYC

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `user_id` | INT PK FK | 1:1 กับ users |
| `bio` | TEXT | แนะนำตัว |
| `experience_years` | INT | ประสบการณ์ (ปี) |
| `skills` | VARCHAR(500) | เช่น "ผู้ช่วยพยาบาล, ทำกายภาพ" |
| **`kyc_status`** | ENUM(`none`,`pending`,`approved`,`rejected`) | ⭐ ตัวคุมทุกอย่าง |
| `kyc_id_card` | VARCHAR(255) | ชื่อไฟล์รูปบัตร ปชช. — ⏸ ไม่ได้ใช้ในโหมดเดโม |
| `kyc_selfie` | VARCHAR(255) | ชื่อไฟล์เซลฟี่คู่บัตร — ⏸ ไม่ได้ใช้ในโหมดเดโม |
| `kyc_note` | VARCHAR(500) | เหตุผลที่แอดมินปฏิเสธ |
| `kyc_submitted_at` / `kyc_reviewed_at` | DATETIME | |
| `rating_avg` | DECIMAL(3,2) | คะแนนเฉลี่ย — ⏸ เป็น 0 เสมอ (รีวิวปิดอยู่) |
| `rating_count` | INT | จำนวนรีวิว — ⏸ เป็น 0 เสมอ |
| 🆕 `area_label` | VARCHAR(120) | ย่านที่รับงาน เช่น "ลาดพร้าว" |
| 🆕 `lat` / `lng` | DECIMAL(10,7) | พิกัดคร่าว ๆ ของแคร์กิฟเวอร์ |
| 🆕 `rate` | DECIMAL(10,2) | เรตที่รับ |
| 🆕 `rate_unit` | ENUM(`per_hour`,`per_day`,`per_month`) | |

> 🆕 = เพิ่มจาก `002_direct_hire.sql` — ข้อมูลที่ผู้ว่าจ้างเห็นในไดเรกทอรี "หาคนดูแล"

### วงจร kyc_status

```
none ──กดยืนยันตัวตน──→ approved  ✅ รับงานได้ + เห็นพิกัดเป๊ะ + โผล่ในไดเรกทอรี
                            │
                            └──แอดมินเพิกถอน──→ none
```

> ⚠️ **นี่คือวงจรของ "โหมดเดโม"** — ของจริงที่ออกแบบไว้คือ
> `none → pending (ส่งเอกสาร) → approved / rejected (แอดมินกด)`
> สถานะ `pending` / `rejected` ยังมีใน ENUM แต่ตอนนี้ไม่มีอะไรทำให้เกิดขึ้น

**`approved` เท่านั้น** ถึงจะ:
1. กดขอรับงานได้ (`requireApprovedCaregiver`)
2. เห็นพิกัดเป๊ะ + ที่อยู่เต็ม (`src/geo.js`)
3. **โผล่ในไดเรกทอรีให้ผู้ว่าจ้างเห็น** (`/api/caregivers`)
4. **ถูกจ้างตรงได้** (`/api/hires` เช็คก่อนส่งคำขอ)

> โปรไฟล์ถูกสร้างอัตโนมัติตอนสมัคร (kyc_status = `none`) เพราะทุกคนสลับมาเป็นแคร์กิฟเวอร์ได้

---

## 3. `jobs` — งานที่โพส **และ** คำขอจ้างตรง

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | INT PK | |
| `employer_id` | INT FK | คนโพส / คนส่งคำขอจ้าง |
| 🆕 **`hire_type`** | ENUM(`open`,`direct`) DEFAULT `open` | ⭐ **ตัวแยกว่าเป็นงานแบบไหน** |
| 🆕 `target_caregiver_id` | INT FK NULL | คนที่ถูกยิงคำขอจ้างตรงไปหา (`direct` เท่านั้น) |
| `title` | VARCHAR(200) | |
| `elder_condition` | TEXT | อาการ/สภาพผู้สูงอายุ |
| `tasks` | TEXT | สิ่งที่ต้องช่วยทำ |
| `care_type` | ENUM(`hourly`,`daily`,`overnight`,`live_in`) | รายชั่วโมง / รายวัน / ค้างคืน / อยู่ประจำ |
| `start_date` / `end_date` | DATE | |
| `budget` | DECIMAL(10,2) | **งบที่ตั้งไว้** — ตกลงจริงในแชท |
| `budget_unit` | ENUM(`per_hour`,`per_day`,`per_month`,`total`) | |
| **`lat` / `lng`** | DECIMAL(10,7) **NULL ได้** | ⭐ พิกัดจริง — ถูก mask ก่อนส่งออก<br>🆕 งานจ้างตรงไม่ต้องปักหมุด → เป็น NULL |
| **`address`** | VARCHAR(300) | ⭐ ที่อยู่เต็ม — เปิดเฉพาะคนที่ยืนยันตัวตนแล้ว |
| `area_label` | VARCHAR(120) | ชื่อย่านคร่าว ๆ — **เปิดให้ทุกคนเห็น** |
| **`status`** | ENUM(`open`,🆕`offered`,`matched`,`done`,🆕`declined`,`cancelled`) | |
| `assigned_caregiver_id` | INT FK NULL | คนที่ถูกเลือก / คนที่กดรับ |
| `created_at` | TIMESTAMP | |

### วงจร status — แยกตาม hire_type

```
hire_type = 'open'  (โพสงาน)
  open ──ผู้ว่าจ้างเลือกคน──→ matched ──กดงานเสร็จ──→ done

hire_type = 'direct' (จ้างตรง)
  offered ──แคร์กิฟเวอร์กดรับ────→ matched ──กดงานเสร็จ──→ done
       └──แคร์กิฟเวอร์ปฏิเสธ──→ declined
```

> ⚠️ **หน้าเว็บต้องแปลสถานะให้ครบทั้ง 6 ค่า** (`STATUS_TH` ใน `frame.js` + `.badge-*` ใน `style.css`)
> ขาดตัวไหน ป้ายจะขึ้นคำว่า `undefined` — เคยพลาดมาแล้วกับ `offered`/`declined`

> **การค้นหาตามรัศมี** ใช้สูตร Haversine คำนวณสด ๆ ใน SQL (เฉพาะ `hire_type='open'`)
> ยังไม่ได้ใช้ spatial index — พอไหวถึงหลักหมื่นงาน ถ้าเยอะกว่านั้นค่อยเปลี่ยนไปใช้ `POINT` + `SPATIAL INDEX`

---

## 4. `job_applications` — การกดขอรับงาน (เฉพาะ `hire_type='open'`)

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

> **งานจ้างตรงไม่ใช้ตารางนี้เลย** — คู่สนทนารู้จากคอลัมน์ `target_caregiver_id` ในตาราง `jobs` โดยตรง

---

## 5. `messages` — แชท

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` / `job_id` / `sender_id` / `receiver_id` | INT | |
| 🆕 `kind` | ENUM('text','image') | `text` → ใช้ `body` · `image` → ใช้ `image_path` |
| `body` | TEXT **NULL** | ข้อความรูปไม่มีตัวอักษร → ต้องว่างได้ (เดิมเป็น NOT NULL) |
| 🆕 `image_path` | VARCHAR(255) NULL | เทียบจาก `uploads/` เช่น `chat/12/a1b2-....jpg`<br>🔴 **ห้ามส่งค่านี้ออกไปให้หน้าเว็บ** — ให้เรียกรูปผ่าน `/api/chat/image/:id` เท่านั้น |
| 🆕 `image_w` / `image_h` | SMALLINT UNSIGNED NULL | ขนาดรูป — จองพื้นที่กันหน้ากระตุกตอนรูปยังโหลดไม่เสร็จ ไม่ได้เอาไปตรวจอะไร |
| `read_at` | DATETIME NULL | NULL = ยังไม่อ่าน → ตัวเลขแดงบนแท็บ **+ ติ๊ก ✓ / ✓✓ ในห้องแชท** |
| `created_at` | TIMESTAMP | |
| — | 🆕 **INDEX (receiver_id, read_at)** | นับข้อความที่ยังไม่อ่าน ยิงบ่อยมาก (ทุก 15 วิ ต่อคนที่เปิดเว็บอยู่) |

**แชทผูกกับ "งาน"** ไม่ใช่ผูกกับคู่คน — เพราะคนคู่เดิมอาจคุยกันหลายงาน ต้องแยกห้อง

**ใครคุยกับใครได้:**
- งานโพส (`open`) — ผู้ว่าจ้าง ↔ แคร์กิฟเวอร์ที่**กดขอรับงานนั้นไว้** (คุยได้ตั้งแต่ยังไม่ถูกเลือก เพราะต้องต่อรองก่อน)
- งานจ้างตรง (`direct`) — ผู้ว่าจ้าง ↔ คนที่ถูกส่งคำขอไปหา (คุยได้เลย ไม่ต้องกดอะไรก่อน)

> ⭐ ตรรกะนี้เขียนไว้ที่ **`src/chat-core.js` ที่เดียว** — ทั้ง REST และ Socket.IO เรียกตัวเดียวกัน
> **ห้ามเขียนเช็คสิทธิ์ซ้ำที่อื่น** ไม่งั้นวันหนึ่งมันจะเช็คไม่ตรงกัน แล้วรูหลุดจะโผล่ทางที่ลืมแก้

**รูปในแชทเก็บเป็นไฟล์ ไม่ยัดลง DB** → `uploads/chat/<job_id>/<uuid>.<ext>` (ดู [02_ARCHITECTURE.md](02_ARCHITECTURE.md))

---

## 6. `reviews` — ให้ดาว ⏸ **ปิดอยู่**

> `server.js` คอมเมนต์ `app.use('/api/reviews', ...)` ไว้ — ตารางกับโค้ดยังอยู่ครบ เปิดกลับได้ทันที

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `job_id` / `reviewer_id` / `reviewee_id` | INT FK | |
| `rating` | TINYINT | **CHECK 1-5** |
| `comment` | VARCHAR(500) | |
| — | **UNIQUE (job_id, reviewer_id)** | ให้ดาวงานเดิมซ้ำไม่ได้ |

**ให้ดาวได้เมื่อ `jobs.status = 'done'` เท่านั้น** และให้ได้ทั้ง 2 ฝั่ง

**คะแนนเฉลี่ยคำนวณใหม่ทั้งหมดทุกครั้ง** (ไม่ใช่บวกเพิ่ม) เพื่อกันค่าเพี้ยนถ้ามีการลบรีวิวทีหลัง

---

## คำสั่งที่ใช้บ่อย

```bash
ssh server_live@192.168.1.35
cd ~/timecarehub/TimecareHub          # ⚠️ แอพอยู่ในโฟลเดอร์ย่อย

# เข้า DB
mysql -u timecarehub -p timecarehub

# ตั้งบัญชีตัวเองเป็นแอดมิน
mysql -u timecarehub -p timecarehub -e "UPDATE users SET is_admin=1 WHERE email='อีเมลคุณ';"

# ลบบัญชีทดสอบ (FK จะลบต่อเป็นทอด ๆ ให้เอง)
mysql -u timecarehub -p timecarehub -e "DELETE FROM users WHERE email LIKE '%@demo.com';"

# สร้างข้อมูลตัวอย่างใหม่
npm run seed

# อัปเดต schema หลังแก้/เพิ่มไฟล์ .sql
npm run migrate
```

> ⚠️ **ล้าง DB ทั้งหมดแล้วสร้างใหม่** — ข้อมูลหายหมด สำรองก่อน
> ```bash
> mysqldump -u timecarehub -p timecarehub > ~/backup_$(date +%F).sql
> mysql -u timecarehub -p timecarehub -e "DROP TABLE IF EXISTS reviews, messages, job_applications, jobs, caregiver_profiles, users;"
> npm run migrate && npm run seed
> ```
