/* Игровые данные: блоки, оружие, гонщики, константы баланса */
(function (G) {
  'use strict';

  // Шесть типов блоков на поле «три в ряд». Индекс = тип блока.
  const GEMS = [
    {
      key: 'fuel', name: 'Топливо', color: '#ff8a1f', dark: '#c2410c', glow: 'rgba(255,138,31,.85)',
      short: 'Скорость +',
      desc: 'Впрыск топлива: каждый блок усиливает набор скорости. Сила впрыска зависит от «Разгона».'
    },
    {
      key: 'nitro', name: 'Нитро', color: '#22e3ff', dark: '#0e7490', glow: 'rgba(34,227,255,.85)',
      short: 'Баллон +',
      desc: 'Наполняет баллон закиси азота. Полный баллон даёт рывок поверх максимальной скорости.'
    },
    {
      key: 'ammo', name: 'Боезапас', color: '#ff3355', dark: '#9f1239', glow: 'rgba(255,51,85,.85)',
      short: 'Заряд +',
      desc: 'Заряжает оружие. Когда заряд полон и цель в зоне поражения — гонщик стреляет.'
    },
    {
      key: 'shield', name: 'Броня', color: '#4f7dff', dark: '#1e3a8a', glow: 'rgba(79,125,255,.85)',
      short: 'Щит +',
      desc: 'Навешивает бронепластины: щит поглощает урон до того, как он дойдёт до прочности.'
    },
    {
      key: 'repair', name: 'Ремкомплект', color: '#2fdc74', dark: '#15803d', glow: 'rgba(47,220,116,.85)',
      short: 'Прочность +',
      desc: 'Полевой ремонт: восстанавливает прочность. Повреждённый мотоцикл теряет максимальную скорость.'
    },
    {
      key: 'grip', name: 'Сцепление', color: '#b75cff', dark: '#6b21a8', glow: 'rgba(183,92,255,.85)',
      short: 'Контроль +',
      desc: 'Свежая резина и контроль: поднимает допустимую скорость в поворотах и шанс увернуться от атаки.'
    }
  ];
  const NOVA = 6; // особый «радужный» блок, не принадлежит ни одному типу

  const SPECIALS = {
    row: { name: 'Линия', desc: 'Собери 4 в ряд по горизонтали — сжигает всю строку.' },
    col: { name: 'Столб', desc: 'Собери 4 в ряд по вертикали — сжигает весь столбец.' },
    bomb: { name: 'Бомба', desc: 'Собери уголком (Г или Т) — взрывает всё вокруг.' },
    nova: { name: 'Сверхновая', desc: 'Собери 5 в ряд — поменяй с любым блоком, чтобы сжечь все блоки этого цвета.' }
  };

  /*
   * Оружие. Характеристики:
   *  dmg    — урон за попадание
   *  range  — дальность (в клетках трека)
   *  dir    — сектор: front (вперёд), rear (назад), both (круговой)
   *  charge — ёмкость заряда (сколько «Боезапаса» нужно для выстрела)
   *  acc    — точность (базовый шанс попадания)
   *  effect — дополнительные эффекты:
   *     slow   — сброс скорости цели
   *     burn   — поджог: {dmg, turns} урон каждый ход
   *     lock   — ЭМИ: замораживает N блоков на поле цели на 3 хода
   *     pull   — гарпун: забирает скорость цели себе
   *     aoe    — бьёт всех в зоне
   *     pierce — игнорирует щит
   *     knock  — отбрасывает цель на N клеток назад
   *     strip  — сдирает сцепление цели
   */
  const WEAPONS = [
    { id: 'mg', name: 'Пулемёт «Шершень»', dmg: 9, range: 5, dir: 'front', charge: 5, acc: 0.9,
      effect: {}, fx: 'bullets', color: '#ffd23f', desc: 'Дешёвый и скорострельный. Заряжается быстрее всех.' },
    { id: 'shotgun', name: 'Дробовик «Гром»', dmg: 19, range: 2, dir: 'both', charge: 8, acc: 0.95,
      effect: { slow: 1 }, fx: 'pellets', color: '#ffb347', desc: 'Страшен в упор: бьёт и вперёд, и назад.' },
    { id: 'rocket', name: 'Ракета «Гарпия»', dmg: 27, range: 10, dir: 'front', charge: 13, acc: 0.82,
      effect: { slow: 1.5 }, fx: 'rocket', color: '#ff5a36', desc: 'Самонаводящаяся ракета для охоты на лидеров.' },
    { id: 'emp', name: 'ЭМИ-пушка «Импульс»', dmg: 8, range: 7, dir: 'both', charge: 10, acc: 0.85,
      effect: { lock: 6, slow: 1 }, fx: 'pulse', color: '#5ef2ff', desc: 'Электроимпульс замораживает блоки на поле жертвы.' },
    { id: 'oil', name: 'Маслосброс «Слик»', dmg: 4, range: 5, dir: 'rear', charge: 7, acc: 0.9,
      effect: { slow: 3.5, strip: true }, fx: 'oil', color: '#7c6cff', desc: 'Пятно масла под колёса преследователя — тот теряет скорость и сцепление.' },
    { id: 'flame', name: 'Огнемёт «Дракон»', dmg: 10, range: 3, dir: 'front', charge: 8, acc: 0.95,
      effect: { burn: { dmg: 5, turns: 3 } }, fx: 'flame', color: '#ff7b00', desc: 'Поджигает цель: урон продолжается ещё 3 хода.' },
    { id: 'harpoon', name: 'Гарпун «Кракен»', dmg: 10, range: 7, dir: 'front', charge: 9, acc: 0.85,
      effect: { pull: 1.5 }, fx: 'hook', color: '#c0c8d8', desc: 'Цепляется за жертву и крадёт её скорость.' },
    { id: 'mines', name: 'Мины «Ёж»', dmg: 14, range: 4, dir: 'rear', charge: 11, acc: 0.8,
      effect: { aoe: true }, fx: 'mines', color: '#ff2d55', desc: 'Рассыпает мины позади — подрывает всех преследователей в зоне.' },
    { id: 'rail', name: 'Рельсотрон «Копьё»', dmg: 33, range: 16, dir: 'front', charge: 17, acc: 0.75,
      effect: { pierce: true }, fx: 'beam', color: '#9d7bff', desc: 'Пробивает любую броню насквозь. Долго заряжается.' },
    { id: 'chain', name: 'Цепь «Кистень»', dmg: 15, range: 1, dir: 'both', charge: 6, acc: 0.95,
      effect: { knock: 2 }, fx: 'chain', color: '#d6d3d1', desc: 'Удар в ближнем бою отбрасывает соперника назад.' }
  ];

  // Редкие пушки — только в магазине гаража
  WEAPONS.push(
    { id: 'grad', name: 'Кассетные ракеты «Град»', dmg: 16, range: 9, dir: 'front', charge: 14, acc: 0.78, shop: true,
      effect: { aoe: true }, fx: 'rocket', color: '#ff8c42', desc: 'Залп кассетных ракет накрывает всех впереди в зоне поражения.' },
    { id: 'tesla', name: 'Тесла-пушка «Шаровая молния»', dmg: 14, range: 6, dir: 'both', charge: 12, acc: 0.9, shop: true,
      effect: { chain: 3, lock: 2 }, fx: 'pulse', color: '#7df9ff', desc: 'Молния перескакивает на трёх ближайших соперников и замораживает блоки.' },
    { id: 'gravity', name: 'Гравиган «Якорь»', dmg: 12, range: 8, dir: 'both', charge: 11, acc: 0.9, shop: true,
      effect: { slow: 3, pull: 2 }, fx: 'pulse', color: '#b388ff', desc: 'Гравитационный якорь гасит скорость цели и передаёт её стрелку.' },
    { id: 'plasma', name: 'Плазмомёт «Сверхновая»', dmg: 30, range: 12, dir: 'front', charge: 15, acc: 0.86, shop: true,
      effect: { pierce: true, burn: { dmg: 6, turns: 3 } }, fx: 'beam', color: '#ff4fd8', desc: 'Сгусток плазмы прожигает броню и поджигает мотоцикл.' }
  );
  const RARITY = {
    common: { name: 'Обычное', color: '#a8b3c7', price: 60 },
    rare: { name: 'Редкое', color: '#4f9dff', price: 115 },
    epic: { name: 'Эпическое', color: '#b75cff', price: 195 },
    legend: { name: 'Легендарное', color: '#ffb000', price: 310 }
  };
  const W_RARITY = { mg: 'common', shotgun: 'common', oil: 'common', chain: 'common', flame: 'common',
    rocket: 'rare', emp: 'rare', harpoon: 'rare', mines: 'rare', grad: 'rare',
    rail: 'epic', tesla: 'epic', gravity: 'epic', plasma: 'legend' };
  WEAPONS.forEach(w => { w.rarity = W_RARITY[w.id]; w.price = RARITY[w.rarity].price; });

  /* Экономика «Славы» ★ */
  const ECON = {
    prize: [60, 50, 42, 36, 31, 27, 24, 21, 18, 16, 14, 12, 10, 8, 6, 5], // призовые за место
    fameHit: 2, fameCrash: 8, fameCombo: 2,                              // зрелищность в гонке
    statMax: 20,
    statCost: v => 20 + 4 * v,                                           // +1 к характеристике
    wmods: {
      cal: { name: 'Калибр', desc: '+12% урона', icon: '💥' },
      mag: { name: 'Магазин', desc: '−1 к ёмкости заряда (быстрее стреляет)', icon: '🔋' },
      aim: { name: 'Прицел', desc: '+4% точности', icon: '🎯' }
    },
    wmodCost: [40, 70, 105],                                             // уровни 1..3
    crew: {
      mech: { name: 'Механик', icon: '🔧', desc: 'Пит-стоп +8 прочности и ремкомплекты +15% за уровень; на 3-м уровне ремонт после аварии на ход быстрее' },
      gun: { name: 'Оружейник', icon: '🎯', desc: 'Старт гонки с заряженным на 25% за уровень оружием' },
      armor: { name: 'Бронетехник', icon: '🛡', desc: 'Старт гонки со щитом +8 за уровень' },
      nitro: { name: 'Нитро-инженер', icon: '⚡', desc: 'Старт с +2 нитро и рывок +0,4 клетки за уровень' }
    },
    crewCost: [50, 90, 140],
    sellBack: 0.5                                                         // продажа старой пушки
  };
  // Боевая версия оружия с учётом тюнинга
  function makeWeapon(id, mods) {
    const b = WEAPONS.find(w => w.id === id), m = mods || {};
    return Object.assign({}, b, {
      dmg: Math.round(b.dmg * (1 + 0.12 * (m.cal || 0))),
      charge: Math.max(3, b.charge - (m.mag || 0)),
      acc: Math.min(0.99, b.acc + 0.04 * (m.aim || 0)),
      mods: { cal: m.cal || 0, mag: m.mag || 0, aim: m.aim || 0 }
    });
  }

  const RACERS = [
    { name: 'Бритва', color: '#ff3b3b' }, { name: 'Гадюка', color: '#2fdc74' },
    { name: 'Молот', color: '#ff9f1c' }, { name: 'Призрак', color: '#e0e7ff' },
    { name: 'Вольт', color: '#22e3ff' }, { name: 'Кобра', color: '#c6f432' },
    { name: 'Шторм', color: '#4f7dff' }, { name: 'Клык', color: '#ff4fa3' },
    { name: 'Рысь', color: '#ffd23f' }, { name: 'Бархан', color: '#d4a373' },
    { name: 'Тайфун', color: '#00c2a8' }, { name: 'Ржавый', color: '#b5541c' },
    { name: 'Феникс', color: '#ff6b35' }, { name: 'Сокол', color: '#9aa5b1' },
    { name: 'Дизель', color: '#7c6cff' }, { name: 'Ведьма', color: '#b75cff' }
  ];

  /*
   * Баланс. Каждая характеристика (1..20) отвечает за свою «фазу» гонки:
   *   Разгон        — сколько скорости даёт ход и каждый блок «Топлива» (восстановление после поворотов, ударов, аварий)
   *   Макс.скорость — потолок скорости на прямых и сила нитро-рывка
   *   Маневренность — допустимая скорость в поворотах и шанс уклонения от атак
   * Сумма характеристик у всех гонщиков одинакова, а коэффициенты подобраны
   * симуляцией (sim/sim.js) так, чтобы вклад каждой характеристики в итоговое место был одинаков.
   */
  const CFG = {
    LAPS: 2,
    CELLS_PER_LAP: 72,
    STAT_TOTAL: 33,
    STAT_MIN: 3,
    STAT_MAX: 20,
    MAX_HP: 100,

    vmaxBase: 3.2, vmaxPer: 0.33,        // макс. скорость = base + per * Скорость
    accBase: 0.3, accPer: 0.08,           // прирост скорости за ход
    fuelPer: 0.32,                        // каждый блок топлива = +32% к приросту
    drag: 0.16,                              // сопротивление: доля скорости, теряемая за ход
    cornerBase: 4.4, cornerPer: 0.18,    // предел в повороте = base + per * Маневр
    hairpinPenalty: 1.6,                  // крутой поворот снижает предел
    gripPer: 0.4,                         // каждое очко сцепления поднимает предел
    gripMax: 8,
    dodgePer: 0.013,                      // шанс уклонения на единицу маневренности
    gripDodge: 0.01,
    skidDamage: 4,                        // урон за единицу превышения в повороте
    skidKeep: 0.6,                        // после заноса остаётся 60% от предела
    brakePower: 2.5,                      // сколько скорости можно сбросить тормозами за ход
    ammoPer: 2,                           // заряд за каждый блок «Боезапаса»
    nitroMax: 8,
    nitroBase: 2, nitroPer: 0.15,         // рывок нитро в клетках
    shieldPer: 2, shieldMax: 36,
    repairPer: 2,
    hpSpeedFactor: 0.3,                   // при 0 прочности теряется 30% макс. скорости
    hitSlowPer: 0.05,                     // потеря скорости от полученного урона
    crashSkip: 2, crashHp: 60,
    lockTurns: 3,
    dmgMul: 1.7
  };

  G.RARITY = RARITY; G.ECON = ECON; G.makeWeapon = makeWeapon;
  G.GEMS = GEMS; G.NOVA = NOVA; G.SPECIALS = SPECIALS; G.WEAPONS = WEAPONS; G.RACERS = RACERS; G.CFG = CFG;
})(typeof window !== 'undefined' ? window : globalThis);
