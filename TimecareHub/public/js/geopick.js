// ตัวปักหมุดบนแผนที่ — หมุดค้างกลางจอ ผู้ใช้เลื่อน/ซูมแผนที่ใต้หมุดเอา
//
// ทำไมไม่ให้แตะปัก: บนมือถือนิ้วบังจุดที่จะปักพอดี เล็งยากมาก
// เลื่อนแผนที่ใต้หมุดที่ค้างอยู่กลางจอแทน → เห็นตลอดว่าหมุดจะลงตรงไหน
//
// ใช้ร่วมกัน 3 ที่:
//   • โพสงาน            — บ้านผู้สูงอายุ         (public/js/employer.js)
//   • บัตรแคร์กิฟเวอร์    — ย่านที่รับงาน          (public/js/caregiver.js)
//   • หาคนดูแล          — จุดตั้งต้นค้นหาคนใกล้ ๆ  (public/js/employer.js)
//
// หน้าหางานของแคร์กิฟเวอร์ไม่ได้ใช้ตัวนี้ — ที่นั่นใช้หมุดลากได้ (drop-pin) คนละแบบกัน

const NOMINATIM = 'https://nominatim.openstreetmap.org';

// วาง HTML นี้ลงหน้าก่อน แล้วค่อยเรียก createPicker() ตอน element อยู่ใน DOM แล้ว
const pickerBox = ({ id = 'pickMap', tall = false } = {}) => `
  <div class="map-wrap pick-wrap">
    <div id="${id}" class="${tall ? 'tall' : ''}"></div>
    <div class="pick-pin" aria-hidden="true"></div>
    <button type="button" class="map-locate" data-locate title="ใช้ตำแหน่งของฉัน">
      <span>◎</span> ตำแหน่งของฉัน
    </button>
  </div>`;

// createPicker({ onMove })
//   onMove({ lat, lng, area, loading }) — เรียก 2 จังหวะต่อการเลื่อน 1 ครั้ง:
//     loading: true  → หมุดหยุดแล้ว รู้พิกัดแล้ว แต่ยังอ่านชื่อย่านไม่เสร็จ
//     loading: false → อ่านชื่อย่านเสร็จ (area = '' ถ้าอ่านไม่ได้)
function createPicker({ id = 'pickMap', center = BKK, zoom = 13, autoLocate = true, onMove } = {}) {
  const map = L.map(id).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

  const wrap = $(`#${id}`).closest('.pick-wrap');
  const pin = wrap.querySelector('.pick-pin');
  const locateBtn = wrap.querySelector('[data-locate]');

  let area = '';        // ชื่อย่านที่อ่านได้จากหมุดล่าสุด
  let touched = false;  // ผู้ใช้ลงมือจัดแผนที่เองแล้วหรือยัง
  let timer = null;
  let ctl = null;

  map.once('dragstart zoomstart', () => { touched = true; });
  map.on('movestart', () => pin.classList.add('lift'));
  map.on('moveend', () => { pin.classList.remove('lift'); readPin(); });

  // ---------- อ่านพิกัด + ชื่อย่าน จากจุดกึ่งกลางแผนที่ ----------
  function readPin() {
    const c = map.getCenter();
    onMove?.({ lat: c.lat, lng: c.lng, area, loading: true });

    // เลื่อนทีเดียว moveend ยิงได้หลายรอบ — หน่วงไว้ แล้วยกเลิกรอบเก่าทิ้ง
    // (Nominatim ขอไม่เกิน 1 ครั้ง/วินาที)
    clearTimeout(timer);
    ctl?.abort();
    timer = setTimeout(async () => {
      ctl = new AbortController();
      try {
        const r = await fetch(
          `${NOMINATIM}/reverse?format=jsonv2&zoom=16&accept-language=th&lat=${c.lat}&lon=${c.lng}`,
          { signal: ctl.signal }
        );
        const a = (await r.json()).address || {};
        area = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || a.city || a.county || '';
      } catch (err) {
        if (err.name === 'AbortError') return;   // มีรอบใหม่มาแทนแล้ว อย่าเขียนทับของใหม่
        area = '';
      }
      onMove?.({ lat: c.lat, lng: c.lng, area, loading: false });
    }, 600);
  }

  // ---------- ปุ่ม "ตำแหน่งของฉัน" ----------
  locateBtn.onclick = () => {
    if (!navigator.geolocation) return toast('เครื่องนี้หาตำแหน่งอัตโนมัติไม่ได้ — เลื่อนแผนที่เอาเองได้เลย', 4200);

    touched = true;
    locateBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        locateBtn.disabled = false;
        map.setView([p.coords.latitude, p.coords.longitude], 16);
      },
      (err) => {
        locateBtn.disabled = false;
        toast(err.code === err.PERMISSION_DENIED
          ? 'ยังไม่ได้อนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ในเบราว์เซอร์ก่อน'
          : 'หาตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง', 4200);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // เปิดหน้ามาแล้วเลื่อนไปที่ตำแหน่งเครื่องให้เลย จะได้ไม่ต้องลากมาจากกลางกรุงเทพทุกครั้ง
  // แต่ถ้าผู้ใช้ลงมือจัดแผนที่เองไปแล้วระหว่างรอ GPS อย่าไปแย่งจอเขา
  if (autoLocate) {
    navigator.geolocation?.getCurrentPosition((p) => {
      if (!touched) map.setView([p.coords.latitude, p.coords.longitude], 16);
    });
  }

  readPin();

  return {
    map,
    center: () => map.getCenter(),
    area: () => area,
    setView: (latlng, z) => map.setView(latlng, z),

    // พิมพ์ชื่อที่/ย่าน แล้วให้แผนที่เลื่อนไปให้ — คืน true ถ้าเจอ
    // btn: ปุ่มที่กดมา (ถ้าส่งมา จะถูก disable + เปลี่ยนข้อความระหว่างค้นหาให้)
    async search(q, btn) {
      if (!q) {
        toast('พิมพ์ชื่อสถานที่หรือย่านก่อน แล้วค่อยกดค้นหา');
        return false;
      }
      touched = true;

      const label = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = 'กำลังค้นหา…'; }
      try {
        const r = await fetch(
          `${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=th&accept-language=th&q=${encodeURIComponent(q)}`
        );
        const hits = await r.json();
        if (!hits.length) {
          toast('ไม่พบที่นี่ — ลองพิมพ์สั้นลง เช่น ชื่อซอย/ถนน/ย่าน หรือเลื่อนแผนที่เอง', 4600);
          return false;
        }
        map.setView([Number(hits[0].lat), Number(hits[0].lon)], 16);
        return true;
      } catch {
        toast('ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง');
        return false;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = label; }
      }
    },
  };
}
