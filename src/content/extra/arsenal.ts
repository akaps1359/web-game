import { reg } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import { josa } from '../../engine/josa';
import type { DmgType, EnemyUnit } from '../../engine/types';
import { guard, hit, reload, skill, spendAmmo } from '../lib';

/**
 * 무기고 (2026-10 장비 보강): 판짜기를 정하는 장비 여섯. 수치만 올리는 것이 아니라 쓰는 법이 달라지는 것.
 *  - 굴절 프리즘(무기): 기본 공격의 속성이 내 턴마다 바뀐다. 약점 사냥, 적응 변이 상대, 비술 틈 열기
 *  - 조명탄 권총(무기): 화염 한 발에 취약. 먼저 밝히고 큰 기술로 친다 (약화·취약을 읽는 검술·연금·결의와 잇는다)
 *  - 메아리 흉갑(방어구): 적의 차례가 끝나고 남은 방어도가 내 턴이 시작될 때 모든 적을 친다. 넘치게 막는 결의 덱
 *  - 속죄양의 털가죽(방어구): 내게 걸린 해로운 효과를 고른 적에게 떠넘긴다 (출혈·독·화상은 남의 계열이 읽을 거리가 된다)
 *  - 넘치는 성배(장신구): 가호에 막힌 피해가 고였다가 붕괴시키면 가호와 상관없이 쏟아진다. 3층부터의 정예·수호자전
 *  - 찢긴 해부도(장신구): 상처의 문법 키워드가 세 가지 이상 걸린 적에게 피해 +20%. 여러 계열을 섞는 덱
 * 무기·방어구 기본기의 수치 배열은 장비 강화 단계(0~2)별, 장신구 훅의 s.n = 강화 단계.
 * id는 'ar-' 접두사 (기본기는 'w-ar-'·'a-ar-'), 전투 vars 키는 'ar:'.
 */

const alive = (e: EnemyUnit | null | undefined): e is EnemyUnit => !!e && !e.dead && e.hp > 0;

// ───────────── 굴절 프리즘 ─────────────

/** 굴절의 순서 (물리·원소가 번갈아 오게) */
export const PRISM: readonly DmgType[] = ['slash', 'fire', 'pierce', 'arcane', 'blunt', 'void'];
const DMG_KO: Record<DmgType, string> = { slash: '참격', pierce: '관통', blunt: '타격', fire: '화염', arcane: '비전', void: '공허' };
/** 상태 칸 아이콘 = 화면의 속성 아이콘 (ui/text.ts DMG_ICON과 같은 그림) */
const DMG_ICON_GI: Record<DmgType, string> = {
  slash: 'gi:sword-wound',
  pierce: 'gi:arrowhead',
  blunt: 'gi:hammer-drop',
  fire: 'gi:flame',
  arcane: 'gi:magic-swirl',
  void: 'gi:portal',
};
/** 이 전투에서 굴절이 시작한 자리 (PRISM 인덱스, 전투 시작 때 무작위) */
export const PRISM_KEY = 'ar:prism';
export const prismStatus = (t: DmgType) => `ar-prism-${t}`;

/** 이번 턴 굴절 프리즘의 속성 (내 턴마다 다음 속성으로) */
export function prismType(c: Combat): DmgType {
  const start = c.s.vars[PRISM_KEY] ?? 0;
  return PRISM[(start + Math.max(0, c.s.turn - 1)) % PRISM.length];
}

/** 내 상태 칸에 이번 턴의 속성을 띄운다 (숫자만 바꾼다 — 턴마다 '+1'이 떠오르지 않게) */
function showPrism(c: Combat) {
  const now = prismType(c);
  for (const t of PRISM) if (t !== now) delete c.p.st[prismStatus(t)];
  c.p.st[prismStatus(now)] = 1;
  c.emit({ t: 'text', uid: 'p', text: `굴절: ${DMG_KO[now]}`, tone: 'info' });
}

// ───────────── 메아리 흉갑 ─────────────

export const ECHO_PLATE = 'ar-echo-plate';
/** 적마다 되돌리는 피해의 상한 (강화 단계별) */
export const ECHO_CAP = [8, 11, 14];
/** 적의 차례가 끝난 뒤 남은 방어도 / 그때 굳건함이 있었는가 (방어도가 사라지지 않으면 되돌리지 않는다) */
const ECHO_KEY = 'ar:echo';
const ECHO_KEPT = 'ar:echoK';
const echoWorn = (c: Combat) => c.run.equip.armor?.id === ECHO_PLATE;
function noteBlock(c: Combat) {
  c.s.vars[ECHO_KEY] = c.p.block;
  c.s.vars[ECHO_KEPT] = (c.p.st.retain ?? 0) > 0 ? 1 : 0;
}

// ───────────── 속죄양의 털가죽 ─────────────

/** 떠넘길 수 있는 해로운 효과 (같은 수치가 나와 적에게 같은 뜻인 것). 수치가 같으면 이 순서대로 */
export const SINS = ['vuln', 'weak', 'frail', 'poison', 'bleed', 'burn'] as const;

// ───────────── 넘치는 성배 ─────────────

/** 적에게 고인 피해 (상태) */
export const GRAIL = 'ar-grail';
/**
 * 고이는 상한 (그 적 최대 체력의 %) · 쏟는 몫 [기본 %, 강화마다 %].
 * 쏟는 피해는 가호를 받지 않는다 (가호 안에서 쏟으면 넘치게 치는 덱은 어차피 붕괴한 턴의 두 배 상한을 채워 남는 것이 없었다).
 * 그래서 고이는 양을 4·5층 정예·수호자의 한 턴 가호(최대 체력의 12~20%)쯤으로 묶는다: 붕괴 한 번에 강화 0단계는 그 절반, 2단계는 한 턴치를 더 넣는다
 */
export const GRAIL_ROOM = 12;
export const GRAIL_POUR = [50, 25];
const GRAIL_TAG = 'ar-grail';
/** 붕괴해 쏟을 차례를 기다리는 적 */
const pourKey = (uid: string) => `ar:pour:${uid}`;

/**
 * 붕괴한 적의 고인 피해를 쏟는다 (기술이 끝난 뒤나 내 턴이 시작될 때). 가호와 상관없이 들어간다:
 * 주인 없는 피해(src null, 지속 피해 꼬리표 없음)라 가호의 상한·버팀 배율을 받지 않고 가호의 셈에도 들지 않는다. 쓰러뜨리면 내 처치다
 */
function pour(c: Combat, lvl: number) {
  for (const e of [...c.alive]) {
    const k = pourKey(e.uid);
    if (!c.s.vars[k]) continue;
    delete c.s.vars[k];
    const bank = e.st[GRAIL] ?? 0;
    if (bank <= 0 || c.over) continue;
    delete e.st[GRAIL];
    c.emit({ t: 'status', uid: e.uid, id: GRAIL, n: -bank });
    const n = Math.floor((bank * (GRAIL_POUR[0] + GRAIL_POUR[1] * lvl)) / 100);
    if (n <= 0) continue;
    c.emit({ t: 'text', uid: e.uid, text: '성배가 넘쳐 쏟아진다', tone: 'good' });
    c.damage({ src: null, tgt: e, base: n, type: 'true', tags: [GRAIL_TAG] });
  }
}

// ───────────── 찢긴 해부도 ─────────────

/** 상처의 문법에서 적에게 남는 것 (src/content/keywords.ts — 약화·취약은 따로 센다) */
export const WOUNDS = ['bleed', 'poison', 'burn', 'mark', 'doom', 'weak', 'vuln'] as const;
/** 이 적에게 걸린 상처의 가짓수 */
export const woundKinds = (e: EnemyUnit) => WOUNDS.filter((id) => (e.st[id] ?? 0) > 0).length;
/** 피해 보너스 [기본 %, 강화마다 %] — 정수 %로 셈한다 (1.2 + 0.1 같은 부동소수 오차로 피해가 1 깎이지 않게) */
export const ANATOMY_PCT = [20, 5];

// ───────────── 상태 ─────────────

reg.statuses([
  ...PRISM.map((t, i) => ({
    id: prismStatus(t),
    name: `굴절: ${DMG_KO[t]}`,
    icon: DMG_ICON_GI[t],
    kind: 'buff' as const,
    desc: `이번 턴 굴절 프리즘이 ${DMG_KO[t]}${josa(DMG_KO[t], '으로')} 친다. 다음 턴엔 ${DMG_KO[PRISM[(i + 1) % PRISM.length]]}`,
  })),
  {
    id: GRAIL,
    name: '고인 피해',
    icon: 'gi:pouring-chalice',
    kind: 'debuff',
    desc: '가호에 막혀 고인 피해 {n}. 붕괴하면 넘치는 성배가 이것을 가호와 상관없이 쏟는다',
  },
]);

// 메아리 흉갑: 적의 차례가 하나 끝날 때마다 내 방어도를 적어 둔다. 마지막 적의 차례 뒤의 값이 '남은 방어도'다
// (적의 차례 끝을 내 장비 훅은 듣지 못한다 — 공용 규칙은 모든 유닛의 훅에 걸린다)
reg.rules([
  {
    id: 'ar-echo',
    hooks: {
      onUnitTurnEnd(c, s) {
        if (isEnemy(s.unit) && echoWorn(c)) noteBlock(c);
      },
    },
  },
]);

// ───────────── 기본기 ─────────────

reg.skills([
  skill({
    id: 'w-ar-prism',
    name: '굴절광',
    icon: 'gi:prism',
    school: 'occult',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'ranged',
    target: 'single',
    // 속성은 턴마다 다르다 (prismType) — 정해진 속성이 없어 미리보기·속성 퍼즐은 이 기본기를 속성 없는 공격으로 본다
    tags: ['attack', 'basic'],
    makes: [],
    reads: [],
    vals: { dmg: [5, 7, 9] },
    desc: '이번 턴의 굴절 속성으로 {D:dmg} 피해. 속성은 내 턴마다 참격·화염·관통·비전·타격·공허 순서로 바뀐다',
    run: (c, u, t) => void hit(c, u, t, { type: prismType(c) }),
  }),
  skill({
    id: 'w-ar-flare',
    name: '조명탄',
    icon: 'gi:distress-signal',
    school: 'firearm',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'ranged',
    target: 'single',
    type: 'fire',
    tags: ['attack', 'basic', 'ammo', 'gun', 'debuff'],
    makes: ['ammo', 'expose'],
    reads: ['ammo'],
    vals: { dmg: [4, 5, 6], vuln: 1 },
    desc: '탄약 1 소모, {D:dmg} 화염 피해, 취약 {vuln}. 탄약이 없으면 쏘지 않고 재장전',
    run: (c, u, t) => {
      if (c.s.ammo <= 0) return reload(c);
      spendAmmo(c, 1);
      hit(c, u, t);
      // 화염이라 조준(관통 치명)을 쓰지 않는다 — 밝혀 둔 적에게 큰 관통 기술이 조준을 실어 들어간다
      if (alive(t) && !c.over) c.apply(t, 'vuln', u.v('vuln'), c.p);
    },
  }),
  skill({
    id: 'a-ar-echo',
    name: '흉갑 버티기',
    icon: 'gi:breastplate',
    school: 'resolve',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'self',
    target: 'self',
    tags: ['block', 'basic'],
    makes: ['block'],
    reads: [],
    // echo는 설명에 보이는 값 — 실제로 되돌리는 것은 장비 훅(ECHO_CAP[강화 단계])
    vals: { blk: [6, 8, 10], echo: ECHO_CAP },
    desc: '방어도 {B:blk}. 적의 차례가 끝난 뒤 남은 방어도만큼 내 턴이 시작될 때 모든 적에게 타격 피해 (적마다 최대 {echo})',
    run: (c, u) => void guard(c, u),
  }),
  skill({
    id: 'a-ar-scapegoat',
    name: '죄 떠넘기기',
    icon: 'gi:animal-hide',
    school: 'neutral',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'ranged',
    target: 'single',
    tags: ['block', 'basic', 'debuff'],
    makes: ['block'],
    reads: [],
    vals: { blk: [4, 6, 8], n: [1, 1, 2] },
    desc: '방어도 {B:blk}. 내게 걸린 약화·취약·허약·출혈·독·화상 가운데 가장 많이 쌓인 {n}가지를 대상에게 그대로 옮긴다',
    run: (c, u, t) => {
      guard(c, u);
      if (!t || c.over) return;
      const picks = SINS.filter((id) => (c.p.st[id] ?? 0) > 0)
        .sort((a, b) => (c.p.st[b] ?? 0) - (c.p.st[a] ?? 0) || SINS.indexOf(a) - SINS.indexOf(b))
        .slice(0, Math.max(1, u.v('n')));
      for (const id of picks) {
        const n = c.p.st[id] ?? 0;
        if (n <= 0 || c.over) continue;
        // 내 쪽에서는 사라진다. 대상의 결계가 막으면 그대로 흩어진다
        c.apply(c.p, id, -n);
        if (alive(t)) c.apply(t, id, n, c.p);
      }
    },
  }),
]);

// ───────────── 장비 ─────────────

reg.equips([
  // ── 무기 ──
  {
    id: 'ar-prism',
    name: '굴절 프리즘',
    icon: 'gi:prism',
    slot: 'weapon',
    rarity: 'uncommon',
    skill: 'w-ar-prism',
    desc: '기본 공격: 원거리. 속성이 내 턴마다 참격·화염·관통·비전·타격·공허 순서로 바뀐다. 시작하는 속성은 전투마다 다르고 이번 턴의 속성은 내 상태 칸에 뜬다. 금 간 유리 속에서 빛이 여섯 갈래로 꺾인다',
    hooks: {
      onCombatStart(c) {
        c.s.vars[PRISM_KEY] = c.rng.int(0, PRISM.length - 1);
      },
      onTurnStart(c) {
        showPrism(c);
      },
    },
  },
  {
    id: 'ar-flare-pistol',
    name: '조명탄 권총',
    icon: 'gi:distress-signal',
    slot: 'weapon',
    rarity: 'rare',
    skill: 'w-ar-flare',
    desc: '기본 공격: 원거리 화염(탄약 1), 맞은 적은 취약 1. 붉은 빛이 닿은 자리마다 숨어 있던 살이 드러난다',
  },

  // ── 방어구 ──
  {
    id: ECHO_PLATE,
    name: '메아리 흉갑',
    icon: 'gi:breastplate',
    slot: 'armor',
    rarity: 'rare',
    skill: 'a-ar-echo',
    desc: `기본 방어: 방어도 6. 적의 차례가 끝난 뒤 남은 방어도만큼 내 턴이 시작될 때 모든 적에게 타격 피해 (적마다 최대 ${ECHO_CAP[0]}, 강화마다 +${ECHO_CAP[1] - ECHO_CAP[0]}). 쓰이지 않은 방어가 쇳소리로 되돌아온다`,
    hooks: {
      // 기준값: 적이 아무도 움직이지 않아도 남은 방어도를 안다
      onTurnEnd(c) {
        noteBlock(c);
      },
      // 적의 공격이 방어도를 깎을 때마다 (공격한 적이 제 차례 안에 쓰러져도 남은 방어도가 맞게)
      onDamageTaken(c, s, d) {
        if (c.s.phase === 'enemy' && d.tgt === s.unit) c.s.vars[ECHO_KEY] = c.p.block;
      },
      onTurnStart(c, s) {
        const left = c.s.vars[ECHO_KEY] ?? 0;
        const kept = c.s.vars[ECHO_KEPT] ?? 0;
        delete c.s.vars[ECHO_KEY];
        delete c.s.vars[ECHO_KEPT];
        // 굳건함으로 방어도가 남았으면 사라진 것이 없다
        if (left <= 0 || kept) return;
        const n = Math.min(left, ECHO_CAP[Math.min(s.n, ECHO_CAP.length - 1)]);
        c.emit({ t: 'text', uid: 'p', text: '흉갑이 울린다', tone: 'good' });
        for (const e of [...c.alive]) {
          if (c.over) break;
          c.damage({ src: c.p, tgt: e, base: n, type: 'blunt', tags: ['ar-echo'] });
        }
      },
    },
  },
  {
    id: 'ar-scapegoat',
    name: '속죄양의 털가죽',
    icon: 'gi:animal-hide',
    slot: 'armor',
    rarity: 'uncommon',
    skill: 'a-ar-scapegoat',
    desc: '기본 방어: 방어도 4, 내게 걸린 약화·취약·허약·출혈·독·화상 가운데 가장 많이 쌓인 것을 고른 적에게 모두 떠넘긴다 (강화 2단계: 두 가지). 털마다 남의 죄가 엉겨 붙어 있다',
  },

  // ── 장신구 ──
  {
    id: 'ar-overflow-grail',
    name: '넘치는 성배',
    icon: 'gi:pouring-chalice',
    slot: 'trinket',
    rarity: 'rare',
    desc: `가호에 막혀 들어가지 못한 내 공격 피해가 그 적에게 고인다 (그 적 최대 체력의 ${GRAIL_ROOM}%까지). 그 적을 붕괴시키면 고인 피해의 ${GRAIL_POUR[0]}%를 가호와 상관없이 쏟는다 (강화마다 +${GRAIL_POUR[1]}%)`,
    hooks: {
      // 가호(content/depth.ts)는 내 쪽 피해에 상한(d.cap)을 건다 — 상한이 깎아 낸 몫이 고인다
      onDamageDealt(c, s, d) {
        if (d.src !== s.unit || !d.attack || !isEnemy(d.tgt) || d.cap === undefined || d.tags.includes(GRAIL_TAG)) return;
        const e = d.tgt;
        if (!alive(e)) return;
        const over = Math.max(0, Math.floor((d.base + d.add) * d.mult)) - d.amount;
        if (over <= 0) return;
        const now = e.st[GRAIL] ?? 0;
        const n = Math.min(Math.floor((e.maxHp * GRAIL_ROOM) / 100), now + over);
        if (n <= now) return;
        e.st[GRAIL] = n;
        c.emit({ t: 'status', uid: e.uid, id: GRAIL, n: n - now });
      },
      onBreak(c, _s, e) {
        if ((e.st[GRAIL] ?? 0) > 0) c.s.vars[pourKey(e.uid)] = 1;
      },
      afterSkill(c, s) {
        pour(c, s.n);
      },
      // 적의 차례에 붕괴시켰으면 (반격·지속 피해) 내 턴이 시작될 때
      onTurnStart(c, s) {
        pour(c, s.n);
      },
    },
  },
  {
    id: 'ar-anatomy',
    name: '찢긴 해부도',
    icon: 'gi:anatomy',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: `출혈·독·화상·인장·파멸·약화·취약 가운데 세 가지 이상에 걸린 적에게 주는 공격 피해 +${ANATOMY_PCT[0]}% (강화마다 +${ANATOMY_PCT[1]}%)`,
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && isEnemy(d.tgt) && woundKinds(d.tgt) >= 3) d.mult *= (100 + ANATOMY_PCT[0] + ANATOMY_PCT[1] * s.n) / 100;
      },
    },
  },
]);
