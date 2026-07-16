# 🚀 Deploy & ดูแลระบบ

**อัปเดตล่าสุด:** 2026-07-17 — เปลี่ยนจาก `scp` มาเป็น **git pull** แล้ว และ path บน server เปลี่ยน

---

## ที่อยู่ของทุกอย่าง

| | |
|---|---|
| โค้ดบน Windows (แก้ที่นี่) | `C:\Users\DEW\Desktop\Linux\timecarehub\` |
| **git repo** | **https://github.com/deweieiei/timecarehub_webapp** (branch `main`) |
| โค้ดบน server | `/home/server_live/timecarehub/` ← เป็น git clone |
| **ตัวแอพที่รันจริง** | **`/home/server_live/timecarehub/TimecareHub/`** ⚠️ อยู่ในโฟลเดอร์ย่อย |
| SSH | `ssh server_live@192.168.1.35` (ใช้ SSH key ไม่ถามรหัส) |
| pm2 process | `timecarehub-8091` |
| nginx config | `/etc/nginx/sites-enabled/timecarehub.com.conf` (ไม่ต้องแตะ) |
| Log | `pm2 logs timecarehub-8091` |

> ### ⚠️ ทำไมแอพถึงอยู่ในโฟลเดอร์ย่อย
> เพราะ repo เก็บ **เอกสาร 00-07 ไว้ที่ราก** และ **โค้ดไว้ใน `TimecareHub/`**
> พอ clone ลง server ทั้งก้อน โครงสร้างเลยกลายเป็น `~/timecarehub/TimecareHub/server.js`
> (เอกสารเก่าเขียนว่า `~/timecarehub/server.js` — **อันนั้นใช้ไม่ได้แล้ว**)

---

## 🔥 Deploy — แก้โค้ดแล้วเอาขึ้น server

### 1. จากเครื่อง Windows — push ขึ้น GitHub ก่อน

```powershell
cd C:\Users\DEW\Desktop\Linux\timecarehub
git add -A
git commit -m "อธิบายสั้น ๆ ว่าแก้อะไร"
git push
```

### 2. บน server — ดึงลงมา

```bash
ssh server_live@192.168.1.35 "cd ~/timecarehub && git pull && pm2 restart timecarehub-8091"
```

**จบแค่นั้น** — ไม่ต้อง `scp` ทีละไฟล์อีกแล้ว

> ### 🔴 ยกเว้นรอบที่ **มี dependency ใหม่** หรือ **มีไฟล์ `.sql` ใหม่**
> คำสั่งข้างบน **ไม่พอ** — แอพจะพังตอน restart (`Cannot find module 'socket.io'`) หรือ query ล้ม (`Unknown column 'kind'`)
> ต้องเติม `npm install` และ `npm run migrate` เข้าไปด้วย:
>
> ```bash
> ssh server_live@192.168.1.35 "cd ~/timecarehub && git pull && cd TimecareHub && npm install && npm run migrate && pm2 restart timecarehub-8091"
> ```
>
> **🆕 รอบยกเครื่องแชท (2026-07-17) เข้าเงื่อนไขนี้ทั้ง 2 ข้อ** — มี `socket.io` ตัวใหม่ + `db/004_chat_upgrade.sql`
> คำสั่งยาวอันนี้ **สั่งซ้ำได้ปลอดภัย** (`npm install` ที่ไม่มีอะไรใหม่ = ไม่ทำอะไร · `migrate` ข้ามของที่มีอยู่แล้ว)
> — ถ้าไม่แน่ใจว่ารอบไหนต้องใช้อันไหน **ใช้อันยาวไปเลยก็ได้ ไม่เสียหาย**

#### ✅ เช็คหลัง deploy รอบแชท

```bash
# 1. แอพขึ้นจริง + Socket.IO ติด (ต้องได้ 200 ทั้งคู่)
curl -s -o /dev/null -w "health=%{http_code}\n"    http://127.0.0.1:8091/api/health
curl -s -o /dev/null -w "socket.io=%{http_code}\n" http://127.0.0.1:8091/socket.io/socket.io.js

# 2. คอลัมน์ใหม่มาครบ (ต้องเห็น kind · image_path · image_w · image_h)
mysql -u timecarehub -p timecarehub -e "DESCRIBE messages;"

# 3. ไม่มี error ค้าง
pm2 logs timecarehub-8091 --lines 30 --nostream
```

**ทดสอบของจริง:** เปิด 2 เบราว์เซอร์ (ปกติ + ไม่ระบุตัวตน) ล็อกอินคนละฝั่ง เปิดห้องแชทเดียวกัน
→ พิมพ์ฝั่งหนึ่ง **อีกฝั่งต้องเด้งทันทีโดยไม่ต้องกดรีเฟรช** · ติ๊กต้องเปลี่ยนเป็น ✓✓ ตอนอีกฝั่งเปิดอ่าน

> **ถ้าข้อความไม่เด้ง แต่กดรีเฟรชแล้วเห็น** = socket ต่อไม่ติด → เปิด DevTools ดู console
> (ตัวส่งข้อความมีทางสำรองเป็น REST จึงยังส่งได้อยู่ แต่ออนไลน์/กำลังพิมพ์/ติ๊กสด จะไม่ทำงาน)

> **แก้แค่หน้าเว็บ** (HTML/CSS/JS ใน `public/`) → **ไม่ต้อง `pm2 restart`** Express เสิร์ฟไฟล์สด กด refresh เห็นเลย
> ```bash
> ssh server_live@192.168.1.35 "cd ~/timecarehub && git pull"
> ```
>
> **แก้ backend** (`src/`, `server.js`) → **ต้อง restart** ไม่งั้นยังรันโค้ดเก่าใน RAM

---

## 🗄️ แก้ schema ฐานข้อมูล

เขียนไฟล์ `.sql` ใหม่ในโฟลเดอร์ `TimecareHub/db/` **ตั้งชื่อขึ้นต้นด้วยเลขเรียงกัน** (`004_xxx.sql`)

```bash
ssh server_live@192.168.1.35 "cd ~/timecarehub && git pull && cd TimecareHub && npm run migrate"
```

`migrate.js` รันไฟล์ `.sql` ทุกไฟล์เรียงตามชื่อ และ **ข้าม error ประเภท "มีอยู่แล้ว" ให้เอง** → รันซ้ำได้ปลอดภัย ไม่ต้องกลัวข้อมูลหาย

| ไฟล์ | ทำอะไร |
|---|---|
| `schema.sql` | ตารางหลัก 6 ตาราง (`CREATE TABLE IF NOT EXISTS`) |
| `002_direct_hire.sql` | เพิ่มระบบจ้างตรง — `hire_type`, `target_caregiver_id`, `messages.read_at` |
| `003_user_profile.sql` | เพิ่มโปรไฟล์บัญชีผู้ใช้ 31 คอลัมน์ใน `users` |
| 🆕 `004_chat_upgrade.sql` | รูปในแชท (`messages.kind` · `image_path` · `image_w/h`) + `users.last_seen_at` |

> ### 🐛 `npm run migrate` บน **DB เปล่า** ยังพังอยู่ (บั๊กเก่า ยังไม่ได้แก้)
> `migrate.js` เรียงไฟล์ตามชื่อ → ตัวเลขมาก่อนตัวอักษร → **`schema.sql` ถูกรันเป็นไฟล์สุดท้าย**
> เจอตอนตั้ง DB ใหม่จากศูนย์: `002` จะล้มเพราะ *"Table 'jobs' doesn't exist"*
>
> **DB บน server ไม่กระทบ** (ตารางมีครบอยู่แล้ว migrate จึงข้ามให้หมด) — เจอเฉพาะตอนสร้าง DB ใหม่
> **วิธีเลี่ยงตอนนี้:** ยัด `schema.sql` เข้าไปเองก่อน แล้วค่อย migrate
> ```bash
> mysql -u timecarehub -p timecarehub < TimecareHub/db/schema.sql && cd TimecareHub && npm run migrate
> ```
> **วิธีแก้ถาวร:** เปลี่ยนชื่อ `schema.sql` → `001_schema.sql` (ยังไม่ได้ทำ — รอพี่ดิวเคาะ)

> ⚠️ **อย่าแก้ไฟล์ `.sql` เก่าที่รันไปแล้ว** — server รันไปแล้วมันจะไม่รันซ้ำให้
> ถ้าจะเปลี่ยนอะไร ให้เขียนไฟล์ `ALTER TABLE` ใหม่เป็นเลขถัดไป

---

## 📦 ข้อมูลตัวอย่าง

```bash
ssh server_live@192.168.1.35 "cd ~/timecarehub/TimecareHub && npm run seed"
```
สร้างแคร์กิฟเวอร์ตัวอย่าง 5 คน (`care1@demo.com` – `care5@demo.com` รหัส `password123`)
รันซ้ำได้ — มีอยู่แล้วจะอัปเดตทับ ไม่สร้างซ้ำ

---

## 🔴 ของสำคัญที่ **ไม่ได้อยู่บน git** — ลบแล้วหายถาวร

| ไฟล์ | ทำไมไม่อยู่บน git | ลบแล้วเกิดอะไร |
|---|---|---|
| `~/timecarehub/TimecareHub/.env` | มีรหัส DB + JWT secret ตัวจริง (repo เป็น **public**) | **แอพต่อ DB ไม่ได้อีกเลย** |
| `~/timecarehub/TimecareHub/uploads/` | รูปบัตร ปชช. + เซลฟี่ของผู้ใช้จริง | รูปหายหมด |

### 🛟 มีสำรองอยู่ที่

```
~/timecarehub-backup-2026-07-16-1948/    ← .env + uploads
~/timecarehub.old/                        ← โฟลเดอร์เดิมทั้งดุ้น (ก่อนย้ายมาใช้ git)
```

### ⚠️ ถ้าจะลบ/ย้ายโฟลเดอร์ timecarehub — **สำรอง 2 อันนี้ก่อนเสมอ**

```bash
B=~/timecarehub-backup-$(date +%F-%H%M)
mkdir -p "$B"
cp ~/timecarehub/TimecareHub/.env "$B"/
cp -r ~/timecarehub/TimecareHub/uploads "$B"/
```

> 💡 **แนะนำ: อย่าใช้ `rm -rf` ให้ใช้ `mv` เปลี่ยนชื่อแทน**
> `mv ~/timecarehub ~/timecarehub.old` — พังเมื่อไหร่เปลี่ยนชื่อกลับ จบใน 1 คำสั่ง
> (`rmdir` ลบได้แค่โฟลเดอร์ว่างเปล่า ถ้ามีไฟล์อยู่มันจะขึ้น `Directory not empty` — ไม่ได้พัง มันแค่ปฏิเสธ)

---

## ⚙️ ตั้งค่าใน `.env` (บน server เท่านั้น ห้าม commit)

อยู่ที่ `~/timecarehub/TimecareHub/.env` — คัดลอกโครงจาก `.env.example`

```bash
PORT=8091
HOST=0.0.0.0          # 0.0.0.0 = เข้าตรงทาง LAN ได้ | 127.0.0.1 = บังคับผ่าน nginx เท่านั้น
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=timecarehub
DB_PASS=***
DB_NAME=timecarehub
JWT_SECRET=***        # สุ่ม 32 bytes: openssl rand -hex 32
```

> เปลี่ยน `.env` แล้วต้อง `pm2 restart timecarehub-8091` เสมอ
> เปลี่ยน `JWT_SECRET` = ทุกคนที่ล็อกอินค้างไว้จะหลุดหมด ต้องล็อกอินใหม่

---

## 🔧 คำสั่ง pm2 ที่ใช้บ่อย

```bash
pm2 list                          # ดูว่ามีอะไรรันอยู่
pm2 logs timecarehub-8091         # ดู log สด (Ctrl+C ออก)
pm2 logs timecarehub-8091 --lines 100
pm2 restart timecarehub-8091
pm2 save                          # จำ process list ไว้ รีบูตแล้วขึ้นเอง
pm2 monit                         # ดู CPU/RAM สด
```

### ถ้าต้องตั้ง pm2 ใหม่ (เช่นย้าย path)

```bash
pm2 delete timecarehub-8091
cd ~/timecarehub/TimecareHub && pm2 start server.js --name timecarehub-8091
pm2 save                          # ⚠️ อย่าลืม! ไม่งั้นรีบูตแล้วไม่ขึ้น
```

---

## 🩺 แก้ปัญหา

### เว็บเปิดไม่ขึ้น

```bash
pm2 list                                        # 1. app รันอยู่ไหม
ss -tln | grep 8091                             # 2. ฟังพอร์ตอยู่ไหม
curl http://127.0.0.1:8091/api/health           # 3. ตอบไหม → {"ok":true,"service":"timecarehub"}
pm2 logs timecarehub-8091 --lines 50            # 4. ดู error
```

### เชื่อม DB ไม่ได้ (`ER_ACCESS_DENIED_ERROR`)

`.env` หายหรือรหัสผิด — เอาตัวสำรองมาใส่กลับ

```bash
cp ~/timecarehub-backup-*/.env ~/timecarehub/TimecareHub/.env
chmod 600 ~/timecarehub/TimecareHub/.env
pm2 restart timecarehub-8091
```

### `git pull` ขึ้น "local changes would be overwritten"

มีคนแก้ไฟล์บน server ตรง ๆ (ไม่ควรทำ — แก้บนเครื่อง Windows แล้ว push เสมอ)

```bash
cd ~/timecarehub
git status              # ดูว่าไฟล์ไหนถูกแก้
git diff                # ดูว่าแก้อะไร — ถ้ามีของสำคัญ copy เก็บไว้ก่อน
git checkout -- .       # ทิ้งของที่แก้บน server แล้วเอาของบน git ทับ
git pull
```

### เปิดจากเครื่องอื่นใน LAN ไม่ได้ (แต่บน server เองได้)

```bash
ss -tln | grep 8091
# 0.0.0.0:8091   ✅ เข้าจาก LAN ได้
# 127.0.0.1:8091 ❌ เข้าได้แค่บนเครื่อง server → แก้ HOST ใน .env
```

### แผนที่ไม่ขึ้น (พื้นที่ว่างเปล่า)

Leaflet + แผนที่ OSM โหลดจากอินเทอร์เน็ต — **เครื่องที่เปิดเว็บต้องต่อเน็ตได้**
(ตัว server ไม่ต้องต่อเน็ต แต่เบราว์เซอร์ของคนดูต้องต่อ)
เปิด DevTools (F12) → Console ดูว่ามี error โหลด `unpkg.com` / `tile.openstreetmap.org` ไหม

---

## 💾 สำรองข้อมูล

```bash
# ฐานข้อมูล
mysqldump -u timecarehub -p timecarehub > ~/backup_timecarehub_$(date +%F).sql

# .env + รูป KYC
tar czf ~/backup_files_$(date +%F).tar.gz -C ~/timecarehub/TimecareHub .env uploads/

# กู้คืน DB
mysql -u timecarehub -p timecarehub < ~/backup_timecarehub_2026-07-14.sql
```

---

## ✅ เช็คลิสต์ก่อนขึ้นจริง (production)

- [ ] **เปลี่ยนรหัสผ่าน SSH ของ `server_live` และ `root`** (`passwd`) — อันเก่าหลุดในแชท AI
- [ ] **ทำ repo เป็น private** หรือย้ายเอกสาร 00-07 ออกจาก repo — ตอนนี้ IP + ผังเครื่องอยู่บน GitHub สาธารณะ
- [ ] ลบบัญชีทดสอบ `care1@demo.com` – `care5@demo.com`
- [ ] เปิด **KYC ของจริง** กลับมา (ตอนนี้กดปุ่มเดียวผ่าน — ดู `src/routes/kyc.js`)
- [ ] ตั้ง `HOST=127.0.0.1` ใน `.env` → บังคับให้ทุกคนเข้าผ่าน HTTPS
- [ ] เปลี่ยน SSL จาก self-signed เป็นของจริง (Let's Encrypt) ถ้าจะเปิดสู่อินเทอร์เน็ต
- [ ] เพิ่ม rate limit ที่ `/api/auth/login` (กันเดารหัสผ่านรัว ๆ)
- [ ] เพิ่ม CSRF token
- [ ] ตั้ง cron สำรอง DB อัตโนมัติ
