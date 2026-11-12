// ===============================================================
//  سيرفر لعبة "الحياة الواقعية"
//  - يعرض ملفات اللعبة للمتصفح
//  - يربط اللاعبين ببعض أونلاين (Socket.IO)
//  - هو "الحَكَم": يقرر من أُصيب، ومن انقبض عليه، ومن هرب
// ===============================================================
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { buildCity, rayBox, JAIL, SPAWNS } from './public/shared/city.js';
import { TEAM_MAX, TEAMS, WEAPONS, RULES } from './public/shared/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'node_modules/three/build'))); // مكتبة الرسم 3D
const server = http.createServer(app);
const io = new Server(server);

const city = buildCity();
const players = new Map();              // كل اللاعبين داخل اللعبة
const score = { cop: 0, criminal: 0 };  // الشرطة: عدد مرات القبض — المجرمون: عدد مرات الهروب

// ---------------- أدوات مساعدة ----------------
const now = () => Date.now();
const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const teamCount = team => [...players.values()].filter(p => p.team === team).length;
const lobbyInfo = () => ({ cop: teamCount('cop'), criminal: teamCount('criminal'), max: TEAM_MAX });
const message = (text, kind = 'info') => io.emit('msg', { text, kind });
const jitter = s => (Math.random() - 0.5) * s;

function teleport(p, x, z) {
  p.x = x; p.y = 0; p.z = z;
  p.tp++; // رقم النقل: نتجاهل أي حركة قديمة وصلت من اللاعب قبل النقل
  io.to(p.id).emit('teleport', { x, y: 0, z, tp: p.tp });
}

function spawn(p) {
  const s = SPAWNS[p.team];
  p.hp = RULES.maxHp; p.state = 'alive'; p.until = 0;
  teleport(p, s.x + jitter(6), s.z + jitter(2));
}

function sendToJail(cop, crim) {
  crim.state = 'jailed'; crim.until = now() + RULES.jailTime; crim.hp = RULES.maxHp;
  crim.wanted = 0; crim.progress = 0;
  teleport(crim, JAIL.cell.x + jitter(10), JAIL.cell.z + jitter(4));
  cop.arrests++; score.cop++;
  message(`🚔 ${cop.name} قبض على ${crim.name} وأخذه إلى السجن!`, 'cop');
  io.emit('sfx', { type: 'arrest', x: crim.x, z: crim.z });
}

function escape(p, helper) {
  p.state = 'alive'; p.until = 0; p.progress = 0;
  p.wanted = now() + RULES.wantedTime;
  teleport(p, JAIL.exit.x + jitter(4), JAIL.exit.z + Math.random() * 2);
  p.escapes++; score.criminal++;
  message(helper ? `🔓 ${helper.name} حرّر ${p.name} من السجن! الشرطة، أمسكوه!` : `🏃 ${p.name} كسر باب السجن وهرب! الشرطة، أمسكوه!`, 'criminal');
  io.emit('sfx', { type: 'escape', x: JAIL.gate.x, z: JAIL.gate.z });
}

// ---------------- الاتصال ----------------
io.on('connection', socket => {
  socket.emit('lobby', lobbyInfo());

  socket.on('join', data => {
    if (players.has(socket.id) || !data) return;
    const team = data.team === 'cop' ? 'cop' : data.team === 'criminal' ? 'criminal' : null;
    if (!team) return;
    if (teamCount(team) >= TEAM_MAX) { socket.emit('joinError', `فريق ${TEAMS[team].plural} ممتلئ (${TEAM_MAX}/${TEAM_MAX}). اختر الفريق الآخر.`); return; }
    const name = String(data.name || '').replace(/[<>]/g, '').trim().slice(0, 16) || `لاعب${Math.floor(Math.random() * 900 + 100)}`;
    const p = {
      id: socket.id, name, team, x: 0, y: 0, z: 0, ry: 0, moving: false, weapon: 0,
      hp: RULES.maxHp, state: 'alive', until: 0, wanted: 0, e: false, progress: 0, blocked: false,
      tp: 0, lastShot: 0, lastHit: 0, lastChat: 0,
      arrests: 0, escapes: 0, downs: 0,
    };
    players.set(socket.id, p);
    spawn(p);
    socket.emit('joined', { id: p.id, team, name });
    message(`👋 ${name} دخل اللعبة ك${TEAMS[team].name}`, team);
    io.emit('lobby', lobbyInfo());
  });

  // حركة اللاعب (يرسلها المتصفح 20 مرة في الثانية)
  socket.on('move', m => {
    const p = players.get(socket.id);
    if (!p || !m || m.tp !== p.tp) return;
    p.e = !!m.e;
    p.weapon = m.w === 1 ? 1 : 0;
    if (p.state === 'downed' || p.state === 'dead') return; // الساقط لا يتحرك
    if (![m.x, m.y, m.z, m.ry].every(Number.isFinite)) return;
    p.x = m.x; p.y = Math.max(0, Math.min(m.y, 20)); p.z = m.z; p.ry = m.ry; p.moving = !!m.m;
    if (p.state === 'jailed') { // السجين لا يخرج من الساحة
      const b = JAIL.inside;
      p.x = Math.max(b.minX, Math.min(b.maxX, p.x));
      p.z = Math.max(b.minZ, Math.min(b.maxZ, p.z));
    }
  });

  // إطلاق نار: السيرفر يتحقق من الإصابة
  socket.on('shoot', s => {
    const p = players.get(socket.id);
    if (!p || p.state !== 'alive' || !s || !Array.isArray(s.dirs)) return;
    const w = WEAPONS[p.team][s.w === 1 ? 1 : 0];
    const t = now();
    if (t - p.lastShot < w.cd - 40) return; // يطلق أسرع من المسموح
    p.lastShot = t;
    const o = { x: p.x, y: p.y + 1.45, z: p.z };
    const ends = [];
    let hits = 0;
    for (const raw of s.dirs.slice(0, w.pellets)) {
      if (!raw || ![raw.x, raw.y, raw.z].every(Number.isFinite)) continue;
      const len = Math.hypot(raw.x, raw.y, raw.z) || 1;
      const d = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
      let best = w.range, target = null;
      for (const c of city.colliders) { // الجدران والمباني توقف الرصاص
        const hit = rayBox(o, d, c.minX, 0, c.minZ, c.maxX, c.maxY, c.maxZ);
        if (hit !== null && hit < best) best = hit;
      }
      for (const q of players.values()) { // هل أصاب لاعباً من الفريق الآخر؟
        if (q === p || q.team === p.team || q.state !== 'alive') continue;
        const hit = rayBox(o, d, q.x - 0.45, q.y, q.z - 0.45, q.x + 0.45, q.y + 1.9, q.z + 0.45);
        if (hit !== null && hit < best) { best = hit; target = q; }
      }
      ends.push({ x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best, hit: !!target });
      if (target) { damage(target, p, w.dmg); hits++; }
    }
    io.emit('shot', { id: p.id, w: s.w === 1 ? 1 : 0, ends });
    if (hits) socket.emit('hitConfirm', { hits });
  });

  socket.on('chat', text => {
    const p = players.get(socket.id);
    if (!p || typeof text !== 'string' || now() - p.lastChat < 600) return;
    p.lastChat = now();
    const clean = text.trim().slice(0, 120);
    if (clean) io.emit('chat', { name: p.name, team: p.team, text: clean });
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (!p) return;
    players.delete(socket.id);
    message(`🚪 ${p.name} خرج من اللعبة`);
    io.emit('lobby', lobbyInfo());
  });
});

function damage(target, attacker, amount) {
  target.hp -= amount;
  target.lastHit = now();
  io.to(target.id).emit('hurt', { from: { x: attacker.x, z: attacker.z } });
  if (target.hp > 0) return;
  target.hp = 0;
  attacker.downs++;
  if (target.team === 'criminal') {
    target.state = 'downed'; target.until = now() + RULES.downedTime; target.progress = 0;
    message(`💥 ${attacker.name} أسقط المجرم ${target.name}! اقترب منه واضغط E للقبض عليه`, 'cop');
  } else {
    target.state = 'dead'; target.until = now() + RULES.respawnTime;
    message(`💥 ${attacker.name} أسقط الشرطي ${target.name}`, 'criminal');
  }
}

// ---------------- حلقة اللعبة: 20 مرة في الثانية ----------------
const TICK = 50;
setInterval(() => {
  const t = now(), dt = TICK / 1000;
  const list = [...players.values()];

  for (const p of list) {
    // انتهاء الأوقات
    if (p.state === 'downed' && t > p.until) { p.state = 'alive'; p.hp = 40; p.lastHit = t; }
    if (p.state === 'dead' && t > p.until) spawn(p);
    if (p.state === 'jailed' && t > p.until) {
      p.state = 'alive'; p.until = 0;
      teleport(p, JAIL.exit.x + jitter(4), JAIL.exit.z + 1);
      message(`⌛ انتهت محكومية ${p.name} وخرج من السجن`);
    }
    if (p.wanted && t > p.wanted) p.wanted = 0;
    // تجدد الصحة
    if (p.state === 'alive' && p.hp < RULES.maxHp && t - p.lastHit > RULES.regenDelay) p.hp = Math.min(RULES.maxHp, p.hp + RULES.regenPerSec * dt);

    // ----- زر E -----
    p.blocked = false;
    if (!p.e) { p.progress = 0; continue; }

    // الشرطي يقبض على مجرم ساقط
    if (p.team === 'cop' && p.state === 'alive') {
      const target = list.find(q => q.team === 'criminal' && q.state === 'downed' && dist2D(p, q) < RULES.arrestDistance);
      if (target) sendToJail(p, target);
      continue;
    }

    // المجرم عند باب السجن: يكسر الباب ليهرب أو ليحرر أصحابه
    if (p.team === 'criminal' && (p.state === 'jailed' || p.state === 'alive') && dist2D(p, JAIL.gate) < RULES.gateDistance) {
      const prisoners = list.filter(q => q.state === 'jailed');
      if (p.state === 'alive' && prisoners.length === 0) { p.progress = 0; continue; }
      const guard = list.some(q => q.team === 'cop' && q.state === 'alive' && dist2D(q, JAIL.gate) < RULES.guardDistance);
      if (guard) { p.blocked = true; continue; } // يوجد شرطي قريب: التقدم يتوقف
      p.progress += TICK;
      if (p.progress >= RULES.breakoutTime) {
        p.progress = 0;
        if (p.state === 'jailed') escape(p);
        else prisoners.forEach(q => escape(q, p));
      }
    } else p.progress = 0;
  }

  // أرسل حالة كل اللاعبين للجميع
  io.emit('state', {
    t, score,
    players: list.map(p => ({
      id: p.id, n: p.name, tm: p.team, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(3),
      m: p.moving, w: p.weapon, hp: Math.round(p.hp), st: p.state, u: p.until ? p.until - t : 0,
      wd: p.wanted ? 1 : 0, pr: p.progress, bl: p.blocked, a: p.arrests, es: p.escapes, dn: p.downs,
    })),
  });
}, TICK);

server.listen(PORT, () => {
  console.log('\n✅ سيرفر "الحياة الواقعية" يعمل!');
  console.log(`   افتح في متصفحك:  http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) for (const n of nets || []) {
    if (n.family === 'IPv4' && !n.internal) console.log(`   أصحابك على نفس الواي فاي:  http://${n.address}:${PORT}`);
  }
  console.log('   لإيقاف السيرفر اضغط Ctrl + C\n');
});
