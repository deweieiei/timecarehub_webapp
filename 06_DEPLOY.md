# 🚀 Deploy & ดูแลระบบ

## ที่อยู่ของทุกอย่าง

| | |
|---|---|
| โค้ดบน Windows (แก้ที่นี่) | `C:\Users\DEW\Desktop\timecarehub\` |
| โค้ดบน server (ที่รันจริง) | `/home/server_live/timecarehub/` |
| SSH | `ssh server_live@192.168.1.35` (ใช้ SSH key ไม่ถามรหัส) |
| pm2 process | **`timecarehub-8091`** |
| nginx config | `/etc/nginx/sites-enabled/timecarehub.com.conf` |
| Log | `pm2 logs timecarehub-8091` |

---

## แก้โค้ดแล้ว deploy ใหม่

รันจาก **PowerShell/CMD บนเครื่อง Windows**

```powershell
cd C:\Users\DEW\Desktop\timecarehub
scp -r public src db server.js package.json server_live@192.168.1.35:~/timecarehub/
ssh server_live@192.168.1.35 "pm2 restart timecarehub-8091"
```

> **แก้แค่หน้าเว็บ** (HTML/CSS/JS) → ส่งแค่ `public` ก็พอ **ไม่ต้อง restart** (Express เสิร์ฟไฟล์สด)
> ```powershell
> scp -r public server_live@192.168.1.35:~/timecarehub/
> ```

> **แก้ backend** (`src/`, `server.js`) → ต้อง `pm2 restart`

---

## แก้ schema ฐานข้อมูล

```powershell
scp db\schema.sql server_live@192.168.1.35:~/timecarehub/db/
ssh server_live@192.168.1.35 "cd ~/timecarehub && npm run migrate"
```
> `schema.sql` ใช้ `CREATE TABLE IF NOT EXISTS` — รันซ้ำได้ไม่พัง **แต่ไม่แก้ตารางที่มีอยู่แล้ว**
> ถ้าจะเพิ่ม/แก้คอลัมน์ ต้องเขียน `ALTER TABLE` เอง หรือ drop แล้วสร้างใหม่ (ข้อมูลหาย)

---

## คำสั่ง pm2 ที่ใช้บ่อย

```bash
pm2 list                        # ดูว่ามีอะไรรันอยู่
pm2 logs timecarehub-8091       # ดู log สด (Ctrl+C ออก)
pm2 logs timecarehub-8091 --lines 100
pm2 restart timecarehub-8091
pm2 stop timecarehub-8091
pm2 save                        # จำ process list ไว้ (รีบูตแล้วขึ้นเอง)
pm2 monit                       # ดู CPU/RAM สด
```

---

## ตั้งค่าใน `.env` (บน server เท่านั้น ไม่ commit)

```bash
PORT=8091
HOST=0.0.0.0          # 0.0.0.0 = เข้าตรงทาง LAN ได้ | 127.0.0.1 = บังคับผ่าน nginx เท่านั้น
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=timecarehub
DB_PASS=***
DB_NAME=timecarehub
JWT_SECRET=***        # สุ่มมาแล้ว 32 bytes
```

> เปลี่ยน `.env` แล้วต้อง `pm2 restart timecarehub-8091` เสมอ

---

## 🔧 แก้ปัญหา

### เว็บเปิดไม่ขึ้น

```bash
# 1. app รันอยู่ไหม
pm2 list

# 2. ฟังพอร์ตอยู่ไหม
ss -tln | grep 8091

# 3. ตอบไหม
curl http://127.0.0.1:8091/api/health
# ควรได้ {"ok":true,"service":"timecarehub"}

# 4. ดู error
pm2 logs timecarehub-8091 --lines 50
```

### เปิดจากเครื่องอื่นใน LAN ไม่ได้ (แต่บน server เองได้)

เช็คว่า `.env` ตั้ง `HOST=0.0.0.0` แล้วหรือยัง — ถ้าเป็น `127.0.0.1` จะเข้าได้เฉพาะบนเครื่อง server

```bash
ss -tln | grep 8091
# 0.0.0.0:8091  ✅ เข้าจาก LAN ได้
# 127.0.0.1:8091 ❌ เข้าได้แค่บนเครื่อง server
```

### เชื่อม DB ไม่ได้ (`ER_ACCESS_DENIED_ERROR`)

```bash
mysql -u timecarehub -p timecarehub -e "SELECT 1;"
```
ถ้าเข้าไม่ได้ = รหัสใน `.env` ผิด

### แผนที่ไม่ขึ้น (พื้นที่ว่างเปล่า)

Leaflet + แผนที่ OSM โหลดจากอินเทอร์เน็ต — **เครื่องที่เปิดเว็บต้องต่อเน็ตได้**
(ตัว server ไม่ต้องต่อเน็ต แต่เบราว์เซอร์ของคนดูต้องต่อ)
เปิด DevTools (F12) → แท็บ Console ดูว่ามี error โหลด `unpkg.com` / `tile.openstreetmap.org` ไหม

### รูป KYC ไม่ขึ้นในหน้าแอดมิน

- ล็อกอินด้วยบัญชีแอดมินหรือยัง (`is_admin = 1`)
- ไฟล์อยู่จริงไหม: `ls ~/timecarehub/uploads/kyc/`

---

## 💾 สำรองข้อมูล

```bash
# ฐานข้อมูล
mysqldump -u timecarehub -p timecarehub > ~/backup_timecarehub_$(date +%F).sql

# รูป KYC
tar czf ~/backup_uploads_$(date +%F).tar.gz -C ~/timecarehub uploads/

# กู้คืน DB
mysql -u timecarehub -p timecarehub < ~/backup_timecarehub_2026-07-14.sql
```

---

## ✅ เช็คลิสต์ก่อนขึ้นจริง (production)

- [ ] เปลี่ยนรหัสผ่าน SSH ของ `server_live` (`passwd`) — **อันเก่าหลุดในแชท AI แล้ว**
- [ ] ลบบัญชีทดสอบ `emp@test.com` / `cg@test.com`
- [ ] ตั้ง `HOST=127.0.0.1` ใน `.env` → บังคับให้ทุกคนเข้าผ่าน HTTPS
- [ ] เปลี่ยน SSL จาก self-signed เป็นของจริง (Let's Encrypt) ถ้าจะเปิดสู่อินเทอร์เน็ต
- [ ] เพิ่ม rate limit ที่ `/api/auth/login` (กันเดารหัสผ่านรัว ๆ)
- [ ] เพิ่ม CSRF token
- [ ] ตั้ง cron สำรอง DB อัตโนมัติ
