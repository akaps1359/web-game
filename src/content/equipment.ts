import { reg } from '../engine/registry';
import { isEnemy } from '../engine/combat';

/**
 * 장비. 무기는 기본 공격, 방어구는 기본 방어를 정한다.
 * 훅의 s.n = 강화 단계(0~2).
 */
reg.equips([
  // ── 무기 ──
  { id: 'saber', name: '군용 사브르', icon: 'gi:saber-slash', slot: 'weapon', rarity: 'common', skill: 'w-saber', desc: '기본 공격: 참격' },
  {
    id: 'knife',
    name: '사냥칼',
    icon: 'gi:bowie-knife',
    slot: 'weapon',
    rarity: 'common',
    skill: 'w-knife',
    desc: '기본 공격: 참격 + 출혈',
  },
  {
    id: 'hatchet',
    name: '손도끼',
    icon: 'gi:wood-axe',
    slot: 'weapon',
    rarity: 'common',
    skill: 'w-hatchet',
    desc: '기본 공격: 참격, 출혈 중인 적에게 추가 피해',
  },
  {
    id: 'revolver',
    name: '군용 리볼버',
    icon: 'gi:revolver',
    slot: 'weapon',
    rarity: 'common',
    skill: 'w-revolver',
    desc: '기본 공격: 원거리 관통(탄약 1)',
  },
  {
    id: 'shotgun',
    name: '단신 산탄총',
    icon: 'gi:sawed-off-shotgun',
    slot: 'weapon',
    rarity: 'uncommon',
    skill: 'w-shotgun',
    desc: '기본 공격: 전열 관통 2회(탄약 1)',
  },
  {
    id: 'harpoon',
    name: '고래잡이 작살총',
    icon: 'gi:harpoon-trident',
    slot: 'weapon',
    rarity: 'uncommon',
    skill: 'w-harpoon',
    desc: '기본 공격: 원거리 관통, 후열의 적을 끌어당김',
  },
  {
    id: 'cane',
    name: '신사의 지팡이',
    icon: 'gi:wizard-staff',
    slot: 'weapon',
    rarity: 'common',
    skill: 'w-cane',
    desc: '기본 공격: 타격, 버팀 추가 감소',
  },
  { id: 'crowbar', name: '쇠지렛대', icon: 'gi:crowbar', slot: 'weapon', rarity: 'common', skill: 'w-crowbar', desc: '기본 공격: 강한 타격' },
  {
    id: 'athame',
    name: '의식용 단검',
    icon: 'gi:sacrificial-dagger',
    slot: 'weapon',
    rarity: 'common',
    skill: 'w-athame',
    desc: '기본 공격: 비전 + 인장',
  },
  { id: 'torch', name: '타르 횃불', icon: 'gi:torch', slot: 'weapon', rarity: 'common', skill: 'w-torch', desc: '기본 공격: 화염 + 화상' },
  {
    id: 'tome',
    name: '이름 없는 금서',
    icon: 'gi:evil-book',
    slot: 'weapon',
    rarity: 'rare',
    skill: 'w-tome',
    desc: '기본 공격: 원거리 공허(통찰 비례), 정신력 1 소모',
  },

  // ── 방어구 ──
  { id: 'coat', name: '트렌치코트', icon: 'gi:trench-body-armor', slot: 'armor', rarity: 'common', skill: 'a-coat', desc: '기본 방어: 방어도 5' },
  {
    id: 'leather',
    name: '가죽 갑옷',
    icon: 'gi:leather-armor',
    slot: 'armor',
    rarity: 'common',
    skill: 'a-leather',
    maxHp: 4,
    desc: '기본 방어: 방어도 6. 최대 체력 +4',
  },
  {
    id: 'robe',
    name: '성직자 로브',
    icon: 'gi:robe',
    slot: 'armor',
    rarity: 'common',
    skill: 'a-robe',
    desc: '기본 방어: 방어도 4 + 정신력 회복',
  },
  {
    id: 'chainmail',
    name: '사슬 조끼',
    icon: 'gi:chain-mail',
    slot: 'armor',
    rarity: 'uncommon',
    skill: 'a-chain',
    desc: '기본 방어: 방어도 + 반격',
  },
  {
    id: 'cloak',
    name: '그림자 망토',
    icon: 'gi:cloak',
    slot: 'armor',
    rarity: 'uncommon',
    skill: 'a-cloak',
    desc: '기본 방어: 방어도 + 회피 (재사용 2턴)',
  },
  {
    id: 'diving',
    name: '심해 잠수복',
    icon: 'gi:diving-helmet',
    slot: 'armor',
    rarity: 'rare',
    skill: 'a-diving',
    maxHp: 8,
    desc: '기본 방어: 방어도 8. 최대 체력 +8. 등불 소모 +2',
  },

  // ── 장신구 ──
  {
    id: 'pocket-watch',
    name: '멈춘 회중시계',
    icon: 'gi:pocket-watch',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: '3의 배수 턴 시작 시 행동력 +1',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn % 3 === 0) {
          c.s.ap += 1;
          c.emit({ t: 'text', uid: 'p', text: '째깍 — 행동력 +1', tone: 'good' });
        }
      },
    },
  },
  {
    id: 'silver-cross',
    name: '은 십자가',
    icon: 'gi:gothic-cross',
    slot: 'trinket',
    rarity: 'common',
    desc: '받는 정신 피해 -1 (강화마다 -1 추가)',
    hooks: { modSanityLoss: (_c, s, n) => Math.max(0, n - 1 - s.n) },
  },
  {
    id: 'bandolier',
    name: '탄띠',
    icon: 'gi:ammo-box',
    slot: 'trinket',
    rarity: 'common',
    desc: '최대 탄약 +2. 전투 시작 시 조준 1',
    hooks: {
      onCombatStart(c) {
        c.s.maxAmmo += 2;
        c.s.ammo = c.s.maxAmmo;
        c.apply(c.p, 'aim', 1, c.p);
      },
    },
  },
  {
    id: 'whetstone',
    name: '숫돌',
    icon: 'gi:stone-block',
    slot: 'trinket',
    rarity: 'common',
    desc: '참격 공격 피해 +1 (강화마다 +1)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && d.type === 'slash') d.add += 1 + s.n;
      },
    },
  },
  {
    id: 'lucky-coin',
    name: '행운의 동전',
    icon: 'gi:two-coins',
    slot: 'trinket',
    rarity: 'common',
    desc: '전투 승리 시 골드 +8',
    hooks: {
      onCombatEnd(c, s, won) {
        if (won) c.s.bonusGold += 8 + 4 * s.n;
      },
    },
  },
  {
    id: 'ether-vial',
    name: '에테르 약병',
    icon: 'gi:vial',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: '전투 시작 시 보호막 6 (강화마다 +3)',
    hooks: {
      onCombatStart(c, s) {
        c.apply(c.p, 'barrier', 6 + 3 * s.n, c.p);
      },
    },
  },
  {
    id: 'bloodstone',
    name: '혈석 반지',
    icon: 'gi:skull-ring',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: '적을 처치하면 체력 2 회복 (강화마다 +1)',
    hooks: {
      onKill(c, s) {
        c.heal(c.p, 2 + s.n);
      },
    },
  },
  {
    id: 'eye-amulet',
    name: '눈의 부적',
    icon: 'gi:eye-shield',
    slot: 'trinket',
    rarity: 'common',
    desc: '전투 시작 시 모든 적의 약점 1개 공개',
    hooks: {
      onCombatStart(c) {
        for (const e of c.alive) {
          const hidden = e.weak.filter((w) => !e.known.includes(w));
          if (hidden.length) e.known.push(hidden[0]);
        }
      },
    },
  },
  {
    id: 'storm-lantern',
    name: '방풍 등',
    icon: 'gi:old-lantern',
    slot: 'trinket',
    rarity: 'common',
    desc: '이동 시 등불 소모 -3',
  },
  {
    id: 'rosary',
    name: '묵주',
    icon: 'gi:prayer-beads',
    slot: 'trinket',
    rarity: 'common',
    desc: '전투 승리 시 정신력 +3 (강화마다 +1)',
    hooks: {
      onCombatEnd(c, s, won) {
        if (won) c.gainSanity(3 + s.n);
      },
    },
  },
  {
    id: 'occult-ring',
    name: '오컬트 반지',
    icon: 'gi:ring',
    slot: 'trinket',
    rarity: 'common',
    desc: '비전 공격 피해 +2 (강화마다 +1)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && d.type === 'arcane') d.add += 2 + s.n;
      },
    },
  },
  {
    id: 'powder-horn',
    name: '화약통',
    icon: 'gi:powder-bag',
    slot: 'trinket',
    rarity: 'common',
    desc: '화염 공격 피해 +2 (강화마다 +1)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && d.type === 'fire') d.add += 2 + s.n;
      },
    },
  },
  {
    id: 'brass-knuckles',
    name: '놋쇠 너클',
    icon: 'gi:brass-knuckles',
    slot: 'trinket',
    rarity: 'common',
    desc: '타격 공격 피해 +2 (강화마다 +1)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && d.type === 'blunt') d.add += 2 + s.n;
      },
    },
  },
  {
    id: 'hunters-mark',
    name: '사냥꾼의 표식',
    icon: 'gi:hunting-horn',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: '붕괴된 적에게 주는 피해 +25% (강화마다 +10%)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (isEnemy(d.tgt) && d.tgt.broken > 0) d.mult *= 1.25 + 0.1 * s.n;
      },
    },
  },
  {
    id: 'void-shard',
    name: '공허의 파편',
    icon: 'gi:crystal-shine',
    slot: 'trinket',
    rarity: 'rare',
    desc: '공허 피해 +3. 매 전투 시작 시 정신력 -2',
    hooks: {
      onCombatStart(c) {
        c.loseSanity(2);
      },
      modDamageOut(_c, s, d) {
        if (d.type === 'void') d.add += 3 + s.n;
      },
    },
  },
]);
