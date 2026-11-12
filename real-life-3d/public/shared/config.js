// ===============================================================
//  إعدادات اللعبة — غيّر الأرقام هنا لتغيير طريقة اللعب بسهولة
//  هذا الملف يستخدمه السيرفر والمتصفح معاً
// ===============================================================

export const TEAM_MAX = 5;               // عدد اللاعبين الأقصى في كل فريق

export const TEAMS = {
  cop:      { name: 'شرطي',  plural: 'الشرطة',   color: '#3b82f6', emoji: '🚓' },
  criminal: { name: 'مجرم',  plural: 'المجرمون', color: '#ef4444', emoji: '🦹' },
};

// الأسلحة: dmg = الضرر، cd = الوقت بين الطلقات (ملي ثانية)، range = المدى بالمتر
// mag = عدد الطلقات في المخزن، reload = وقت إعادة التعبئة، spread = انحراف الطلقة
// pellets = عدد الشظايا (للشوزن)، auto = إطلاق مستمر عند الضغط المطوّل
export const WEAPONS = {
  cop: [
    { id: 'pistol',  name: 'مسدس',  dmg: 22, cd: 330, range: 70, mag: 12, reload: 1300, spread: 0.008, pellets: 1, auto: false },
    { id: 'rifle',   name: 'رشاش',  dmg: 11, cd: 110, range: 90, mag: 30, reload: 2000, spread: 0.022, pellets: 1, auto: true  },
  ],
  criminal: [
    { id: 'pistol',  name: 'مسدس',  dmg: 22, cd: 330, range: 70, mag: 12, reload: 1300, spread: 0.008, pellets: 1, auto: false },
    { id: 'shotgun', name: 'شوزن',  dmg: 11, cd: 850, range: 28, mag: 6,  reload: 2200, spread: 0.07,  pellets: 7, auto: false },
  ],
};

export const RULES = {
  maxHp: 100,
  downedTime: 15000,     // كم يبقى المجرم ساقطاً على الأرض قبل أن يقوم (ملي ثانية)
  jailTime: 90000,       // مدة السجن
  breakoutTime: 6000,    // وقت الضغط المطوّل على E لكسر باب السجن
  respawnTime: 5000,     // وقت عودة الشرطي بعد سقوطه
  wantedTime: 60000,     // كم يبقى الهارب "مطلوباً" (يظهر للجميع)
  arrestDistance: 2.6,   // المسافة اللازمة للقبض
  gateDistance: 3.2,     // المسافة من باب السجن للتفاعل
  guardDistance: 7,      // إذا كان شرطي أقرب من هذا للباب يتوقف كسر الباب
  regenDelay: 6000,      // بعد كم ثانية بدون إصابة تبدأ الصحة بالتجدد
  regenPerSec: 6,
};

export const PLAYER = {
  radius: 0.4,           // نصف عرض اللاعب (للتصادم)
  height: 1.8,
  walkSpeed: 6,
  runSpeed: 10,
  jump: 7,
  gravity: 20,
};
