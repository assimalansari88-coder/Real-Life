// ===============================================================
//  مخطط المدينة — يستخدمه السيرفر (لمعرفة الجدران التي تمنع الرصاص)
//  والمتصفح (لرسم المدينة). بما أن الاثنين يستخدمان نفس الملف،
//  تكون المدينة متطابقة عند جميع اللاعبين.
// ===============================================================

export const HALF = 80;               // المدينة من -80 إلى 80 متر
export const ROADS = [-40, 0, 40];    // أماكن الشوارع (أفقياً وعمودياً)
export const ROAD_W = 8;              // عرض الشارع
export const BLOCKS = [[-80, -44], [-36, -4], [4, 36], [44, 80]]; // حدود المربعات بين الشوارع

// السجن: ساحة مسوّرة لها باب واحد يطل على الشارع
export const JAIL = {
  minX: -30, maxX: -10, minZ: -69, maxZ: -55,
  inside: { minX: -29.3, maxX: -10.7, minZ: -68.3, maxZ: -55.7 }, // المساحة التي يتحرك فيها السجين
  cell:   { x: -20, z: -64 },   // مكان السجين عند دخوله
  gate:   { x: -20, z: -55 },   // باب السجن
  exit:   { x: -20, z: -51.5 }, // أين يخرج الهارب
  gateWidth: 4,
};

export const SPAWNS = {
  cop:      { x: -62, z: -49 },   // أمام مركز الشرطة
  criminal: { x: 62,  z: 49 },    // أمام مخبأ المجرمين
};

export const POLICE_STATION = { x: -62, z: -64, w: 24, d: 14, h: 9 };
export const HIDEOUT        = { x: 64,  z: 66,  w: 22, d: 14, h: 7 };
export const PARK           = { minX: 4, maxX: 36, minZ: -36, maxZ: -4 };

// مولّد أرقام عشوائية "ثابت": يعطي نفس الأرقام كل مرة، لذلك تُبنى المدينة نفسها عند الكل
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

const COLORS = ['#e8d8c3', '#c9d6df', '#f2c6a0', '#b8c4a8', '#d9b8a3', '#a9b8c9', '#e6e1d3', '#c2a68c', '#d6c1d8', '#bfd8d2'];
const CAR_COLORS = ['#dc2626', '#2563eb', '#f5f5f4', '#16a34a', '#facc15', '#1f2937', '#9333ea', '#0891b2', '#78716c'];

export function buildCity() {
  const r = seeded(20240611);
  const buildings = [];   // { x, z, w, d, h, color, kind }
  const cars = [];        // { x, z, w, d, h, color, alongZ, police }
  const trees = [];       // { x, z, size }
  const crates = [];      // { x, z, s }
  const walls = [];       // جدران السجن { x, z, w, d, h }
  let gate = null;

  BLOCKS.forEach(([x0, x1], i) => BLOCKS.forEach(([z0, z1], j) => {
    // ----- المربعات الخاصة -----
    if (i === 0 && j === 0) { buildings.push({ ...POLICE_STATION, color: '#f1f5f9', kind: 'police' }); return; }
    if (i === 3 && j === 3) {
      buildings.push({ ...HIDEOUT, color: '#8b5e3c', kind: 'hideout' });
      [[50, 57], [51.4, 57.2], [50.6, 58.5], [76, 56], [76, 57.4], [77.3, 56.6]].forEach(([x, z]) => crates.push({ x, z, s: 1.3 }));
      return;
    }
    if (i === 1 && j === 0) {
      const { minX, maxX, minZ, maxZ, gate: g, gateWidth } = JAIL;
      const t = 0.6, h = 5;
      walls.push({ x: (minX + maxX) / 2, z: minZ, w: maxX - minX + t, d: t, h });           // الجدار الخلفي
      walls.push({ x: minX, z: (minZ + maxZ) / 2, w: t, d: maxZ - minZ, h });               // الجدار الأيسر
      walls.push({ x: maxX, z: (minZ + maxZ) / 2, w: t, d: maxZ - minZ, h });               // الجدار الأيمن
      const leftEnd = g.x - gateWidth / 2, rightStart = g.x + gateWidth / 2;
      walls.push({ x: (minX + leftEnd) / 2, z: maxZ, w: leftEnd - minX + t, d: t, h });     // الجدار الأمامي (يسار الباب)
      walls.push({ x: (rightStart + maxX) / 2, z: maxZ, w: maxX - rightStart + t, d: t, h }); // الجدار الأمامي (يمين الباب)
      gate = { x: g.x, z: maxZ, w: gateWidth, d: 0.3, h };
      buildings.push({ x: -6.5, z: -73, w: 3.4, d: 3.4, h: 9, color: '#9ca3af', kind: 'tower' }); // برج الحراسة
      return;
    }
    if (i === 2 && j === 1) { // الحديقة
      for (let k = 0; k < 40; k++) {
        const x = x0 + 2 + r() * (x1 - x0 - 4), z = z0 + 2 + r() * (z1 - z0 - 4);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (Math.hypot(x - cx, z - cz) < 7) continue;                 // بعيداً عن النافورة
        if (Math.abs(x - cx) < 2 || Math.abs(z - cz) < 2) continue;  // اترك الممرات فاضية
        if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 3.5)) continue;
        trees.push({ x, z, size: 0.8 + r() * 0.6 });
      }
      return;
    }
    // ----- مربع عادي: مبانٍ -----
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const central = Math.abs(cx) < 40 && Math.abs(cz) < 40;
    if (r() < 0.25) {
      buildings.push({ x: cx, z: cz, w: 24 + r() * 4, d: 24 + r() * 4, h: (central ? 22 : 10) + r() * 14, color: COLORS[Math.floor(r() * COLORS.length)], kind: 'normal' });
      return;
    }
    for (const ox of [x0 + 10, x0 + 26]) for (const oz of [z0 + 10, z0 + 26]) {
      if (r() < 0.15) continue;
      buildings.push({
        x: ox + (r() - 0.5) * 2, z: oz + (r() - 0.5) * 2,
        w: 9 + r() * 5, d: 9 + r() * 5,
        h: (central ? 16 : 7) + r() * (central ? 24 : 14),
        color: COLORS[Math.floor(r() * COLORS.length)], kind: 'normal',
      });
    }
  }));

  // ----- سيارات مركونة على جوانب الشوارع -----
  const avoid = [[JAIL.gate.x, -40], [SPAWNS.cop.x, -40], [SPAWNS.criminal.x, 40]];
  for (const road of ROADS) for (const side of [-3, 3]) for (let k = 0; k < 4; k++) {
    const along = -76 + r() * 152;
    if (ROADS.some(rr => Math.abs(along - rr) < 8)) continue; // ليس عند التقاطعات
    const color = CAR_COLORS[Math.floor(r() * CAR_COLORS.length)];
    if (r() < 0.5) { // شارع عمودي (يمتد على محور z)
      if (avoid.some(([ax, az]) => Math.abs(road + side - ax) < 6 && Math.abs(along - az) < 6)) continue;
      cars.push({ x: road + side, z: along, w: 1.9, d: 4.2, h: 1.5, color, alongZ: true });
    } else {         // شارع أفقي (يمتد على محور x)
      if (avoid.some(([ax, az]) => Math.abs(along - ax) < 7 && Math.abs(road + side - az) < 6)) continue;
      cars.push({ x: along, z: road + side, w: 4.2, d: 1.9, h: 1.5, color, alongZ: false });
    }
  }
  // سيارات الشرطة أمام المركز
  cars.push({ x: -75, z: -50, w: 1.9, d: 4.2, h: 1.5, color: '#ffffff', alongZ: true, police: true });
  cars.push({ x: -49, z: -50, w: 1.9, d: 4.2, h: 1.5, color: '#ffffff', alongZ: true, police: true });
  // فان المجرمين
  cars.push({ x: 76, z: 49, w: 2.2, d: 5, h: 2.3, color: '#3f3f46', alongZ: true, van: true });

  const fountain = { x: (PARK.minX + PARK.maxX) / 2, z: (PARK.minZ + PARK.maxZ) / 2, w: 6, d: 6, h: 0.9 };

  // ----- قائمة كل الأشياء الصلبة (للتصادم ولإيقاف الرصاص) -----
  const box = (o, kind) => ({ minX: o.x - o.w / 2, maxX: o.x + o.w / 2, minZ: o.z - o.d / 2, maxZ: o.z + o.d / 2, maxY: o.h, kind });
  const colliders = [
    ...buildings.map(b => box(b, 'building')),
    ...walls.map(w => box(w, 'wall')),
    box(gate, 'gate'),
    ...cars.map(c => box(c, 'car')),
    ...trees.map(t => box({ x: t.x, z: t.z, w: 0.7, d: 0.7, h: 7 }, 'tree')),
    ...crates.map(c => box({ x: c.x, z: c.z, w: c.s, d: c.s, h: c.s }, 'crate')),
    box(fountain, 'fountain'),
  ];

  return { buildings, cars, trees, crates, walls, gate, fountain, colliders };
}

// هل الشعاع (الطلقة) يصطدم بصندوق؟ يرجع المسافة أو null
export function rayBox(o, d, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0, tmax = Infinity;
  const mins = [minX, minY, minZ], maxs = [maxX, maxY, maxZ], os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(ds[a]) < 1e-9) { if (os[a] < mins[a] || os[a] > maxs[a]) return null; continue; }
    let t1 = (mins[a] - os[a]) / ds[a], t2 = (maxs[a] - os[a]) / ds[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// دفع اللاعب خارج الأشياء الصلبة (يستخدم لمنع المشي داخل الجدران)
export function pushOut(pos, radius, colliders) {
  for (const c of colliders) {
    if (pos.y >= c.maxY) continue;
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const dist2 = dx * dx + dz * dz;
    if (dist2 >= radius * radius) continue;
    if (dist2 > 1e-8) {
      const dist = Math.sqrt(dist2), k = (radius - dist) / dist;
      pos.x += dx * k; pos.z += dz * k;
    } else { // اللاعب داخل الصندوق: أخرجه من أقرب جهة
      const opts = [[c.minX - radius - pos.x, 0], [c.maxX + radius - pos.x, 0], [0, c.minZ - radius - pos.z], [0, c.maxZ + radius - pos.z]];
      opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      pos.x += opts[0][0]; pos.z += opts[0][1];
    }
  }
  pos.x = Math.max(-HALF + radius, Math.min(HALF - radius, pos.x));
  pos.z = Math.max(-HALF + radius, Math.min(HALF - radius, pos.z));
}
