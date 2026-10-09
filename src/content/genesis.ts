import { reg } from '../engine/registry';
import { isEnemy, lvlVal, type Combat } from '../engine/combat';
import type { DmgType, EnemyUnit } from '../engine/types';
import { combo, guard, hit, reload, seized, skill } from './lib';

/**
 * 창세(genesis) 등급 — 희귀 위의 최상위. 세계가 처음 지어질 때 남은 것들.
 * 장비 칸마다 하나(무기·방어구·장신구), 계열마다 스킬 하나 — 모두 9개.
 *
 * 얻는 곳 (run.ts rollGenesis): 계층군주를 쓰러뜨리면 셋 중 하나를 고르고, 5층 정예·수호자가 아주 드물게 떨군다.
 * 판마다 하나뿐이다 (run.genesis). 상점·일반 전투·보통 정예 보상에는 나오지 않는다 — 스킬은 pool: false, 장비는 rollEquip이 뺀다.
 * 상태 id는 'g-' 접두사.
 */

const SUN_AMMO = 'g:sunAmmo';
const HATCH = 'g:hatch';
/** 알껍데기: 방어도가 깨질 때 힘을 얻는 횟수 (전투당) */
const HATCH_MAX = 3;
const DAYS = ['빛', '궁창', '뭍', '해와 별', '생명', '사람', '안식'] as const;
/** 이레의 해시계: 날마다의 수치 [기본, 강화마다 더] — 설명도 이 표로 만든다 */
export const DIAL = { barrier: [6, 3], heal: [4, 2], frenzy: [40, 10], ap: 1, str: 1, san: [6, 2] } as const;
const dial = (k: 'barrier' | 'heal' | 'frenzy' | 'san', lv: number) => DIAL[k][0] + DIAL[k][1] * lv;

// ───────────── 상태 ─────────────

reg.statuses([
  {
    id: 'g-sunset',
    name: '저무는 해',
    icon: 'gi:sunset',
    kind: 'buff',
    desc: '이번 턴 동안 탄약이 줄지 않고 관통 공격이 모두 치명타(피해 2배). 턴이 끝나면 탄약이 모두 떨어진다',
    hooks: {
      // 스킬 하나를 쓰는 동안 줄어든 탄약을 되돌린다 (재장전처럼 늘어난 것은 그대로)
      beforeSkill(c) {
        c.s.vars[SUN_AMMO] = c.s.ammo;
      },
      afterSkill(c) {
        const a = c.s.vars[SUN_AMMO];
        delete c.s.vars[SUN_AMMO];
        if (a !== undefined && c.s.ammo < a) c.s.ammo = a;
      },
      modDamageOut(_c, _s, d) {
        if (d.attack && d.type === 'pierce') {
          d.mult *= 2;
          d.crit = true;
        }
      },
    },
    tickEnd(c, u) {
      c.clear(u, 'g-sunset');
      delete c.s.vars[SUN_AMMO];
      if (c.s.ammo > 0) {
        c.s.ammo = 0;
        c.emit({ t: 'text', uid: 'p', text: '해가 졌다. 탄약이 모두 떨어졌다', tone: 'info' });
      }
    },
  },
  {
    id: 'g-flask',
    name: '호문쿨루스',
    icon: 'gi:bottled-shadow',
    kind: 'buff',
    desc: '내 턴이 끝날 때마다 체력이 가장 많은 적에게 독과 화상을 {n}씩 던진다',
    tickEnd(c, _u, n) {
      throwFlask(c, n);
    },
  },
  {
    id: 'g-pillar',
    name: '떠받친 하늘',
    icon: 'gi:atlas',
    kind: 'buff',
    desc: '적의 공격을 막아 낼 때마다 막아 낸 만큼 공격자에게 타격 피해를 되돌려준다 (다음 내 턴이 시작되면 사라짐)',
    hooks: {
      onDamageTaken(c, s, d) {
        // 적의 차례에 받은 공격만 — 반격·가시·되돌린 피해끼리 주고받으며 끝없이 오가지 않게
        if (d.tgt !== s.unit || !d.attack || d.blocked <= 0 || c.s.phase !== 'enemy') return;
        if (d.tags.includes('counter') || d.tags.includes('thorns') || d.tags.includes('reflect')) return;
        const src = d.src;
        if (!isEnemy(src) || src.dead || src.hp <= 0) return;
        c.damage({ src: s.unit, tgt: src, base: d.blocked, type: 'blunt', attack: true, tags: ['counter', 'reflect'] });
      },
    },
    tickStart(c, u) {
      if (!isEnemy(u)) c.clear(u, 'g-pillar');
    },
  },
  {
    id: 'g-day',
    name: '창세의 날',
    icon: 'gi:sundial',
    kind: 'buff',
    desc: '창세 {n}일째 (1 빛 · 2 궁창 · 3 뭍 · 4 해와 별 · 5 생명 · 6 사람 · 7 안식)',
  },
]);

/** 호문쿨루스의 플라스크: 체력이 가장 많은 적에게 독과 화상 */
function throwFlask(c: Combat, n: number) {
  if (c.over || n <= 0) return;
  let t: EnemyUnit | null = null;
  for (const e of c.alive) if (!t || e.hp > t.hp) t = e;
  if (!t) return;
  c.emit({ t: 'text', uid: t.uid, text: '호문쿨루스가 플라스크를 던졌다', tone: 'info' });
  c.apply(t, 'poison', n, c.p);
  if (!t.dead && !c.over) c.apply(t, 'burn', n, c.p);
}

/**
 * 참된 이름 — 이 존재를 무너뜨리는 속성.
 * 속성 순서를 요구하는 퍼즐(검은 파라오의 상형문자)이 걸려 있으면 그 속성, 아니면 아는 약점, 모르는 약점(맞히면 밝혀진다), 약점이 없으면 비전
 */
export function trueName(c: Combat, t: EnemyUnit): DmgType {
  const want = c.s.obj?.types?.[0];
  if (want) return want;
  return t.weak.find((w) => t.known.includes(w)) ?? t.weak[0] ?? 'arcane';
}

// ───────────── 스킬 ─────────────

reg.skills([
  // ── 장비 기본기 (수치 배열은 장비 강화 단계 0~2) ──
  skill({
    id: 'w-g-tablet',
    name: '참된 이름',
    icon: 'gi:stone-tablet',
    school: 'neutral',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'basic', 'reveal'],
    vals: { dmg: [8, 10, 12] },
    desc: '대상의 참된 이름을 부른다: 약점 속성으로 {D:dmg} 피해 (상형문자가 속성을 요구하면 그 속성으로). 모르는 약점이면 밝혀낸다. 이 공격으로 붕괴시키면 행동력 +1',
    run: (c, u, t) => {
      if (!t) return;
      const before = t.broken;
      hit(c, u, t, { type: trueName(c, t) });
      if (before === 0 && t.broken === 2 && !t.dead && !c.over) {
        c.s.ap += 1;
        c.emit({ t: 'text', uid: 'p', text: '이름을 불렀다 (행동력 +1)', tone: 'good' });
      }
    },
  }),
  skill({
    id: 'a-g-egg',
    name: '껍질 두르기',
    icon: 'gi:egg-defense',
    school: 'resolve',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'self',
    target: 'self',
    tags: ['block', 'basic', 'retain'],
    makes: ['block'],
    reads: [],
    vals: { blk: [8, 10, 12] },
    desc: '방어도 {B:blk}. 다음 턴이 시작돼도 방어도가 사라지지 않고 껍질처럼 겹겹이 쌓인다',
    run: (c, u) => {
      guard(c, u);
      if (!c.over && (c.p.st.retain ?? 0) < 1) c.apply(c.p, 'retain', 1, c.p);
    },
  }),

  // ── 계열마다 하나 ──
  skill({
    id: 'g-gaebyeok',
    name: '개벽',
    icon: 'gi:lightning-slashes',
    school: 'blade',
    rarity: 'genesis',
    pool: false,
    cost: 2,
    cd: [3, 2],
    range: 'melee',
    target: 'all',
    type: 'slash',
    tags: ['attack', 'combo', 'aoe', 'multi', 'bleed'],
    makes: ['bleed'],
    reads: ['combo'],
    vals: { dmg: [6, 8], max: [3, 4], bleed: [2, 3] },
    desc: '하늘과 땅을 가른다: 전열과 후열의 모든 적에게 {D:dmg} 참격 피해. 이번 턴 앞서 쓴 스킬 1개당 한 번 더 벤다 (최대 {max}번 더). 체력 피해를 줄 때마다 출혈 {bleed}',
    run: (c, u) => {
      const ds = hit(c, u, null, { hits: 1 + Math.min(combo(c), u.v('max')) });
      // 출혈은 맞은 적마다 한 번에 (벤 횟수만큼)
      const cuts = new Map<EnemyUnit, number>();
      for (const d of ds) if (d.hpLoss > 0 && isEnemy(d.tgt)) cuts.set(d.tgt, (cuts.get(d.tgt) ?? 0) + 1);
      for (const [e, n] of cuts) if (!e.dead && e.hp > 0) c.apply(e, 'bleed', n * u.v('bleed'), c.p);
    },
  }),
  skill({
    id: 'g-sunfall',
    name: '해 떨구기',
    icon: 'gi:sunset',
    school: 'firearm',
    rarity: 'genesis',
    pool: false,
    cost: 1,
    cd: [4, 3],
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'aim'],
    makes: ['ammo'],
    reads: [],
    vals: { dmg: [12, 15] },
    desc: '하늘에 둘씩 뜬 해를 쏘아 떨군다: 탄약을 가득 채우고 {D:dmg} 관통 피해. 그 뒤 이번 턴이 끝날 때까지 탄약이 줄지 않고 모든 관통 공격이 치명타(피해 2배). 턴이 끝나면 탄약이 모두 떨어진다',
    run: (c, u, t) => {
      reload(c);
      hit(c, u, t);
      if (!c.over) c.apply(c.p, 'g-sunset', 1, c.p);
    },
  }),
  skill({
    id: 'g-elder-sign',
    name: '옛 표식',
    icon: 'gi:star-pupil',
    school: 'occult',
    rarity: 'genesis',
    pool: false,
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark', 'detonate'],
    makes: ['mark'],
    reads: ['mark'],
    vals: { base: [8, 10], per: [6, 8], grow: [1, 2] },
    desc: '대상의 인장을 터뜨려 {base} + 인장당 {per} 비전 피해. 태초에 새겨진 표식은 지워지지 않는다. 터뜨린 인장은 그대로 남고 {grow} 더 새겨진다',
    run: (c, u, t) => {
      if (!t) return;
      const marks = t.st.mark ?? 0;
      // 인장 폭발처럼 인장을 잠시 걷어 낸 채 터뜨린다 (인장이 이 폭발에 피해를 더하지 않게)
      if (marks > 0) c.apply(t, 'mark', -marks);
      c.emit({ t: 'fx', name: 'detonate', tgt: t.uid });
      c.damage({ src: c.p, tgt: t, base: Math.floor((u.v('base') + marks * u.v('per')) * u.power), type: u.type ?? 'arcane', attack: true, skill: u, tags: ['detonate'] });
      if (c.over || t.dead || t.hp <= 0) return;
      // 지워지지 않는다: 결계도 되돌아오는 인장은 막지 못한다
      if (marks > 0) {
        t.st.mark = (t.st.mark ?? 0) + marks;
        c.emit({ t: 'status', uid: t.uid, id: 'mark', n: marks });
      }
      c.apply(t, 'mark', u.v('grow'), c.p);
    },
  }),
  skill({
    id: 'g-homunculus',
    name: '호문쿨루스',
    icon: 'gi:bottled-shadow',
    school: 'alchemy',
    rarity: 'genesis',
    pool: false,
    cost: [1, 0],
    cd: 99,
    range: 'self',
    target: 'self',
    tags: ['summon', 'poison', 'burn'],
    makes: ['poison', 'burn'],
    reads: [],
    vals: { n: [4, 5] },
    desc: '플라스크에서 작은 생명을 빚는다. 호문쿨루스는 태어나자마자 체력이 가장 많은 적에게 독과 화상을 {n}씩 던진다. 이번 전투 동안 내 턴이 끝날 때마다 다시 던진다. 전투당 1회',
    run: (c, u) => {
      const n = u.v('n');
      if (!c.p.st['g-flask']) c.apply(c.p, 'g-flask', n, c.p);
      throwFlask(c, n);
    },
  }),
  skill({
    id: 'g-sky-pillar',
    name: '하늘 떠받치기',
    icon: 'gi:atlas',
    school: 'resolve',
    rarity: 'genesis',
    pool: false,
    cost: 1,
    cd: [2, 1],
    range: 'self',
    target: 'self',
    tags: ['block', 'counter'],
    makes: ['block', 'counter'],
    reads: [],
    vals: { blk: [12, 15] },
    desc: '갈라진 하늘이 다시 내려앉지 못하게 어깨로 받친다: 방어도 {B:blk}. 다음 내 턴까지 적의 공격을 막아 낼 때마다 막아 낸 만큼 공격자에게 타격 피해를 되돌려준다',
    run: (c, u) => {
      guard(c, u);
      if (!c.over && !c.p.st['g-pillar']) c.apply(c.p, 'g-pillar', 1, c.p);
    },
  }),
  skill({
    id: 'g-before-genesis',
    name: '창세 이전',
    icon: 'gi:eclipse',
    school: 'forbidden',
    rarity: 'genesis',
    pool: false,
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'sanity', 'insight'],
    makes: ['sanity'],
    reads: [],
    vals: { dmg: [16, 20], pct: [20, 25], per: 5, max: 4, san: 3 },
    desc: '정신력 {san} 소모. 대상을 빛이 있기 전의 무(無)로 되돌린다: 방어도를 무시하고 {D:dmg} 공허 피해. 그 뒤 체력이 최대 체력의 {pct}% + 통찰×{per}%(통찰 {max}까지) 이하로 남으면 소멸한다. 수호자는 소멸하지 않는 대신 피해가 2배',
    run: (c, u, t) => {
      if (!t) return;
      c.loseSanity(u.v('san'));
      if (c.over || t.dead) return;
      const boss = c.defOf(t).tier === 'boss';
      hit(c, u, t, { dmg: u.v('dmg') * (boss ? 2 : 1), ignoreBlock: true });
      if (boss || c.over || t.dead || t.hp <= 0) return;
      const pct = u.v('pct') + u.v('per') * Math.min(Math.max(0, c.p.insight), u.v('max'));
      if (t.hp * 100 <= t.maxHp * pct) {
        c.emit({ t: 'text', uid: t.uid, text: '창세 이전으로 소멸했다', tone: 'eldritch' });
        c.kill(t);
      }
    },
  }),
]);

// ───────────── 장비 ─────────────

reg.equips([
  {
    id: 'g-tablet',
    name: '이름 짓는 점토판',
    icon: 'gi:stone-tablet',
    slot: 'weapon',
    rarity: 'genesis',
    skill: 'w-g-tablet',
    desc: '기본 공격: 원거리, 대상의 약점 속성으로 친다 (모르는 약점은 밝혀낸다). 붕괴시키면 행동력 +1. 하늘이 아직 이름을 얻기 전에 구운 판. 이것으로 부른 이름이 곧 그것이 된다',
  },
  {
    id: 'g-egg',
    name: '태초의 알껍데기',
    icon: 'gi:egg-defense',
    slot: 'armor',
    rarity: 'genesis',
    skill: 'a-g-egg',
    maxHp: 10,
    desc: `기본 방어: 방어도 8, 다음 턴이 시작돼도 방어도가 남는다. 방어도가 뚫려 몸이 다칠 때마다 힘 +1 (전투당 ${HATCH_MAX}번). 최대 체력 +10. 세계가 깨고 나온 알의 조각. 안에서 아직 무언가 자란다`,
    hooks: {
      onDamageTaken(c, s, d) {
        // 껍질(방어도)이 이 공격에 다 깨지고 몸까지 다쳤다
        if (d.tgt !== s.unit || !d.attack || !isEnemy(d.src) || d.blocked <= 0 || d.hpLoss <= 0 || c.p.block > 0) return;
        const n = c.s.vars[HATCH] ?? 0;
        if (n >= HATCH_MAX) return;
        c.s.vars[HATCH] = n + 1;
        c.apply(c.p, 'str', 1, c.p);
        c.emit({ t: 'text', uid: 'p', text: '껍질이 깨지며 안에서 무언가 자란다 (힘 +1)', tone: 'good' });
      },
    },
  },
  {
    id: 'g-sundial',
    name: '이레의 해시계',
    icon: 'gi:sundial',
    slot: 'trinket',
    rarity: 'genesis',
    desc: `턴마다 창세의 하루가 흐른다. 1일 빛: 적 전체의 약점과 급소가 드러난다 · 2일 궁창: 보호막 ${DIAL.barrier[0]} · 3일 뭍: 체력 ${DIAL.heal[0]} 회복 · 4일 해와 별: 이번 턴 공격 피해 +${DIAL.frenzy[0]}% · 5일 생명: 행동력 +${DIAL.ap} · 6일 사람: 힘 +${DIAL.str} · 7일 안식: 정신력 +${DIAL.san[0]}, 재사용 대기가 모두 풀린다. 여드레째에 다시 첫날. 강화마다 보호막 +${DIAL.barrier[1]}, 회복 +${DIAL.heal[1]}, 피해 +${DIAL.frenzy[1]}%, 정신력 +${DIAL.san[1]}`,
    hooks: {
      onTurnStart(c, s) {
        const day = ((c.s.turn - 1) % 7) + 1;
        const lv = s.n;
        // 지금이 며칠째인지 내 상태 칸에 (숫자만 바꾼다 — 매 턴 '+1'이 떠오르지 않게)
        c.p.st['g-day'] = day;
        c.emit({ t: 'text', uid: 'p', text: `창세 ${day}일째: ${DAYS[day - 1]}`, tone: 'good' });
        switch (day) {
          case 1:
            for (const e of c.alive) c.expose(e);
            break;
          case 2:
            c.apply(c.p, 'barrier', dial('barrier', lv), c.p);
            break;
          case 3:
            c.heal(c.p, dial('heal', lv));
            break;
          case 4:
            c.apply(c.p, 'frenzy', dial('frenzy', lv), c.p);
            break;
          case 5:
            c.s.ap += DIAL.ap;
            break;
          case 6:
            c.apply(c.p, 'str', DIAL.str, c.p);
            break;
          default: {
            c.gainSanity(dial('san', lv));
            // 안식: 쉬고 나면 기술이 돌아온다 (전투당 1회 기술과 빼앗겨 잠긴 기술은 그대로)
            for (const uid of Object.keys(c.s.cd)) {
              const info = c.skillInfo(uid);
              if (!info || lvlVal(info.def.cd, info.owned.lvl) >= 99 || seized(c, uid)) continue;
              delete c.s.cd[uid];
            }
          }
        }
      },
    },
  },
]);
