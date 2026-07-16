// การเปิดเผยพิกัด 2 ระดับ (ตกลงในที่ประชุม 2026-07-14)
//
//   แคร์กิฟเวอร์ผ่าน KYC + แอดมินอนุมัติแล้ว → เห็นพิกัดเป๊ะ + ที่อยู่เต็ม
//   ยังไม่ผ่าน / ยังไม่ทำ KYC             → เห็นแค่จุดเบลอ + รัศมี ไม่เห็นที่อยู่
//
// เหตุผล: ที่อยู่บ้านที่มีผู้สูงอายุอยู่ลำพังเป็นข้อมูลอ่อนไหว
// ไม่ควรเปิดให้ใครก็ได้ที่สมัครเข้ามาเห็น

const FUZZ_RADIUS_M = 800;

// ปัดพิกัดลงกริดหยาบ ๆ แบบคงที่ (พิกัดเดิม = จุดเบลอเดิมเสมอ
// ไม่งั้นถ้าสุ่มใหม่ทุกครั้ง กด refresh หลาย ๆ ทีแล้วเฉลี่ย จะเดาตำแหน่งจริงได้)
function fuzz(lat, lng) {
  const GRID = 0.009; // ~1 กม.
  return {
    lat: Math.round(lat / GRID) * GRID,
    lng: Math.round(lng / GRID) * GRID,
  };
}

// แปลงแถวงานจาก DB ให้เหลือเฉพาะข้อมูลที่ผู้ใช้คนนี้มีสิทธิ์เห็น
function maskJob(job, viewer) {
  const isOwner = viewer && job.employer_id === viewer.id;
  const isAssigned = viewer && job.assigned_caregiver_id === viewer.id;
  const isApprovedCaregiver = viewer && viewer.kyc_status === 'approved';
  const canSeeExact = isOwner || isAssigned || isApprovedCaregiver || viewer?.is_admin;

  const out = { ...job };

  if (canSeeExact) {
    out.precise = true;
    return out;
  }

  const f = fuzz(Number(job.lat), Number(job.lng));
  out.lat = f.lat;
  out.lng = f.lng;
  out.precise = false;
  out.fuzz_radius_m = FUZZ_RADIUS_M;
  delete out.address;         // ซ่อนที่อยู่เต็ม
  delete out.employer_phone;  // ซ่อนเบอร์โทร
  return out;
}

module.exports = { maskJob, FUZZ_RADIUS_M };
