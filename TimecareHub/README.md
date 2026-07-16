# TimeCareHub — โค้ดแอพ

แพลตฟอร์มจับคู่ **ผู้ว่าจ้าง** กับ **แคร์กิฟเวอร์ (ผู้ดูแลผู้สูงอายุ)** — MVP เป็นเว็บ

📚 **เอกสารทั้งหมดอยู่ที่โฟลเดอร์แม่** → [../README.md](../README.md)

---

## รันอยู่ที่ไหน

| | |
|---|---|
| เครื่อง | serverlive `192.168.1.35` |
| โฟลเดอร์ | `/home/server_live/timecarehub/TimecareHub/` |
| Port | `8091` (nginx proxy มาให้แล้ว) |
| URL | http://192.168.1.35:8091 · https://timecarehub.com (ต้องแก้ hosts) |
| pm2 | `timecarehub-8091` |
| git | https://github.com/deweieiei/timecarehub_webapp |

## Deploy

```powershell
# บนเครื่อง Windows
git add -A && git commit -m "..." && git push

# ดึงลง server
ssh server_live@192.168.1.35 "cd ~/timecarehub && git pull && pm2 restart timecarehub-8091"
```
> แก้แค่ `public/` (HTML/CSS/JS) → **ไม่ต้อง restart** Express เสิร์ฟไฟล์สด
> รายละเอียดเต็ม → [../06_DEPLOY.md](../06_DEPLOY.md)

---

## Stack

```
Frontend : HTML + JS ธรรมดา (ไม่มี framework ไม่ต้อง build)
Map      : Leaflet + OpenStreetMap (ฟรี ไม่ต้องใช้ API key)
Backend  : Node.js 22 + Express
Database : MySQL 8.4
Auth     : JWT ใน httpOnly cookie + bcrypt
```

## โครงไฟล์

```
TimecareHub/
├── server.js              จุดเริ่มต้น (Express, port 8091)
├── .env                   รหัส DB + JWT secret — 🔴 ไม่อยู่บน git มีที่เดียวบน server
├── db/
│   ├── schema.sql         ตารางหลัก 6 ตาราง
│   ├── 002_direct_hire.sql   เพิ่มระบบจ้างตรง
│   ├── 003_user_profile.sql  เพิ่มโปรไฟล์ผู้ใช้ 31 คอลัมน์
│   ├── migrate.js         npm run migrate — รันไฟล์ .sql เรียงตามชื่อ ข้ามอันที่มีแล้ว
│   └── seed.js            npm run seed — แคร์กิฟเวอร์ตัวอย่าง 5 คน
├── src/
│   ├── db.js              MySQL pool
│   ├── auth.js            JWT + middleware เช็คสิทธิ์
│   ├── geo.js             ⭐ ตรรกะเปิดเผยพิกัด 2 ระดับ
│   └── routes/            auth · profile · jobs · caregivers · hires · kyc · chat · notifications · reviews(⏸)
├── public/
│   ├── index.html         เข้าสู่ระบบ / สมัคร
│   ├── choose.html        เลือกบทบาท
│   ├── employer.html      หน้าผู้ว่าจ้าง
│   ├── caregiver.html     หน้าแคร์กิฟเวอร์
│   ├── profile.html       โปรไฟล์บัญชีผู้ใช้
│   ├── admin.html         หน้าแอดมิน
│   └── js/                frame(กรอบร่วม) · employer · caregiver · chat · profile
└── uploads/kyc/           รูปบัตร ปชช. — 🔴 ไม่อยู่บน git · อยู่นอก public/ เข้า URL ตรงไม่ได้
```

---

## ⭐ ตรรกะสำคัญ: พิกัด GPS 2 ระดับ (`src/geo.js`)

| สถานะแคร์กิฟเวอร์ | เห็นอะไร |
|---|---|
| ยืนยันตัวตนแล้ว (`approved`) | 📍 พิกัดเป๊ะ + ที่อยู่เต็ม + เบอร์โทร |
| ยังไม่ยืนยันตัวตน | ⭕ วงกลมรัศมี 800 ม. — ไม่เห็นที่อยู่ ไม่เห็นเบอร์ |

**ทำไม:** ที่อยู่บ้านที่มีผู้สูงอายุอยู่ลำพัง = ข้อมูลอ่อนไหว ไม่ควรเปิดให้ใครก็ได้ที่สมัครเข้ามาเห็น
และเป็นแรงจูงใจให้แคร์กิฟเวอร์รีบยืนยันตัวตน

**หมายเหตุทางเทคนิค:** จุดเบลอใช้วิธี **"ปัดลงกริด ~1 กม." ไม่ใช่สุ่ม**
เพราะถ้าสุ่มใหม่ทุกครั้ง คนไม่หวังดีกด refresh หลายรอบแล้วเอามาเฉลี่ย จะเดาตำแหน่งจริงได้
วิธีนี้พิกัดเดิมได้จุดเบลอเดิมเสมอ → เดาไม่ได้

---

## ระบบจ้างงาน 2 แบบ (วิ่งคู่กัน ใช้ตาราง `jobs` ร่วมกัน แยกด้วย `hire_type`)

| | **โพสงาน** (`open`) | **จ้างตรง** (`direct`) |
|---|---|---|
| ปักหมุด GPS | ✅ ต้อง | ❌ ไม่ต้อง |
| ใครเลือก | ผู้ว่าจ้างเลือกจากคนที่มากดขอรับ | แคร์กิฟเวอร์กดรับ/ปฏิเสธ |
| วงจร | `open → matched → done` | `offered → matched → done` / `declined` |
| route | `/api/jobs` | `/api/hires` + `/api/caregivers` |

---

## ติดตั้งบนเครื่องใหม่

```bash
npm install
cp .env.example .env    # แล้วใส่ค่าจริง
npm run migrate         # สร้าง/อัปเดตตาราง
npm run seed            # ข้อมูลตัวอย่าง (ไม่บังคับ)
npm start
```

## บัญชีทดสอบ (`password123` ทุกบัญชี)

| อีเมล | เป็นอะไร |
|---|---|
| `emp@test.com` | ผู้ว่าจ้าง + **แอดมิน** |
| `care1@demo.com` … `care5@demo.com` | แคร์กิฟเวอร์ ยืนยันตัวตนแล้ว มีเรต/ย่านครบ |

**ตั้งบัญชีตัวเองเป็นแอดมิน:**
```bash
mysql -u timecarehub -p timecarehub -e "UPDATE users SET is_admin=1 WHERE email='อีเมลของคุณ';"
```

---

## ⚠️ ต้องรู้ก่อนแตะโค้ด

| เรื่อง | รายละเอียด |
|---|---|
| **KYC เป็นโหมดเดโม** | `src/routes/kyc.js` — กดปุ่มเดียวผ่าน ไม่มี multer ไม่มีคิวแอดมิน<br>⭐ แต่ `kyc_status` ยังคุม GPS 2 ระดับเหมือนเดิม · คอลัมน์ `kyc_id_card`/`kyc_selfie` ยังอยู่ครบ |
| **รีวิวปิดอยู่** | `server.js` คอมเมนต์ `app.use('/api/reviews', ...)` ไว้ — เอาคอมเมนต์ออกก็กลับมา |
| **`national_id` อ่อนไหวมาก** | `/api/profile` เป็น route เดียวที่ส่งออกได้ (เจ้าของบัญชีเท่านั้น)<br>**route อื่นห้าม `SELECT u.*`** ต้องระบุคอลัมน์เอง |
| **`STATUS_TH` ต้องครบ 6 ค่า** | `frame.js` — ขาดตัวไหน ป้ายขึ้น `undefined` (เคยพลาดมาแล้วกับ `offered`/`declined`) |
| **`.env` ลบแล้วจบ** | ไม่อยู่บน git ไม่มีที่อื่น — สำรองก่อนแตะโฟลเดอร์เสมอ |

## ยังไม่มี

- ❌ จ่ายเงินในระบบ / escrow — จ่ายกันเองนอกแอพ
- ❌ Push notification จริง (มีแค่ตัวเลขแดงบนแท็บ poll ทุก 15 วิ)
- ❌ ~~Flutter app~~ — **ยกเลิกแล้ว 2026-07-17**
- ❌ ระบบตั๋ว / โมเดลรายได้
- ❌ rate limit, CSRF token, SSL ของจริง
