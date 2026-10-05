import { reg, STATUSES } from '../../engine/registry';
import { lvlVal, type Combat } from '../../engine/combat';
import type { EnemyUnit, SkillUse } from '../../engine/types';
import { combo, dealt, detonate, guard, hit, needAmmo, reload, skill, spendAmmo } from '../lib';

/**
 * 재사용 대기 중인 다른 스킬 중 남은 대기가 가장 긴 것 (전투당 1회 스킬·대기를 되돌리는 스킬 제외).
 * 대기를 되돌리는 기술('refresh' — 임기응변·되감기)끼리 서로 되돌리면 한 턴에 끝없이 쓰는 고리가 된다.
 */
function longestCooldown(c: Combat, u: SkillUse | null): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [uid, n] of Object.entries(c.s.cd)) {
    if ((u && uid === u.owned.uid) || n <= bestN) continue;
    const info = c.skillInfo(uid);
    if (!info || lvlVal(info.def.cd, info.owned.lvl) >= 99 || info.def.tags.includes('refresh')) continue;
    best = uid;
    bestN = n;
  }
  return best;
}

// ───────────── 검술 — 출혈과 연계 ─────────────

reg.skills([
  skill({
    id: 'x-feint',
    name: '허초',
    icon: 'gi:quick-slash',
    school: 'blade',
    rarity: 'common',
    cost: 0,
    cd: [2, 1],
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed', 'combo'],
    vals: { dmg: [3, 4], bleed: [1, 2] },
    desc: '{D:dmg} 참격 피해, 출혈 {bleed}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'bleed', u.v('bleed'), c.p);
    },
  }),
  skill({
    id: 'x-crimson-veil',
    name: '핏빛 장막',
    icon: 'gi:heart-drop',
    school: 'blade',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'bleed'],
    vals: { blk: [5, 7], pct: [50, 75] },
    desc: '방어도 {B:blk} + 모든 적이 가진 출혈 합의 {pct}%',
    run: (c, u) => {
      const total = c.alive.reduce((sum, e) => sum + (e.st.bleed ?? 0), 0);
      guard(c, u, u.v('blk') + Math.floor((total * u.v('pct') * u.power) / 100));
    },
  }),
  skill({
    id: 'x-blood-chain',
    name: '피의 사슬',
    icon: 'gi:chained-heart',
    school: 'blade',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed', 'aoe'],
    vals: { dmg: [3, 4], pct: [50, 75] },
    desc: '{D:dmg} 참격 피해. 대상이 가진 출혈의 {pct}%를 다른 모든 적에게 퍼뜨린다',
    run: (c, u, t) => {
      hit(c, u, t);
      if (!t) return;
      // 대상이 쓰러져도 흩뿌려진 피는 남는다
      const n = Math.floor(((t.st.bleed ?? 0) * u.v('pct')) / 100);
      if (n > 0) for (const e of c.alive) if (e !== t) c.apply(e, 'bleed', n, c.p);
    },
  }),
  skill({
    id: 'x-flow-cut',
    name: '물 흐르듯',
    icon: 'gi:sword-slice',
    school: 'blade',
    rarity: 'uncommon',
    cost: 1,
    cd: [2, 1],
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'combo'],
    vals: { dmg: [6, 7] },
    desc: '{D:dmg} 참격 피해. 이번 턴 앞서 스킬을 2개 이상 썼으면 행동력 +1',
    run: (c, u, t) => {
      const flowing = combo(c) >= 2;
      hit(c, u, t);
      if (flowing && !u.echo && !c.over) {
        c.s.ap += 1;
        c.emit({ t: 'text', uid: 'p', text: '행동력 +1', tone: 'good' });
      }
    },
  }),
  skill({
    id: 'x-arterial',
    name: '동맥 절개',
    icon: 'gi:dripping-blade',
    school: 'blade',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed'],
    vals: { dmg: [4, 7] },
    desc: '{D:dmg} 참격 피해 후 대상의 출혈을 2배로',
    run: (c, u, t) => {
      hit(c, u, t);
      // 메아리(50%)라면 출혈 +50%
      const b = t && !t.dead ? (t.st.bleed ?? 0) : 0;
      const add = Math.floor(b * Math.min(1, u.power));
      if (t && add > 0) c.apply(t, 'bleed', add, c.p);
    },
  }),
  skill({
    id: 'x-afterimage',
    name: '잔영',
    icon: 'gi:sword-array',
    school: 'blade',
    rarity: 'rare',
    cost: [1, 0],
    cd: 3,
    range: 'self',
    target: 'self',
    type: 'slash',
    tags: ['buff', 'combo'],
    vals: { dmg: [3, 4] },
    desc: '이번 턴 동안 스킬을 쓸 때마다 무작위 적에게 {D:dmg} 참격 피해',
    run: (c, u) => void c.apply(c.p, 'x-afterimage', u.v('dmg'), c.p),
  }),
]);

// ───────────── 사격 — 탄약, 조준, 붕괴 ─────────────

reg.skills([
  skill({
    id: 'x-quick-draw',
    name: '속사',
    icon: 'gi:gunshot',
    school: 'firearm',
    rarity: 'common',
    cost: 0,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun'],
    vals: { dmg: [3, 5] },
    desc: '탄약 1: {D:dmg} 관통 피해',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      hit(c, u, t);
    },
  }),
  skill({
    id: 'x-cover-reload',
    name: '엄폐 재장전',
    icon: 'gi:reload-gun-barrel',
    school: 'firearm',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'ammo'],
    vals: { blk: [3, 4], per: 2 },
    desc: '방어도 {B:blk}. 탄약을 가득 채우고, 채운 탄약 1발당 방어도 +{per}',
    run: (c, u) => {
      const before = c.s.ammo;
      reload(c);
      guard(c, u, u.v('blk') + Math.floor(Math.max(0, c.s.ammo - before) * u.v('per') * u.power));
    },
  }),
  skill({
    id: 'x-overwatch',
    name: '경계 사격',
    icon: 'gi:targeting',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    type: 'pierce',
    tags: ['block', 'ammo', 'gun', 'counter'],
    vals: { blk: [4, 6], dmg: [5, 6], max: [3, 4] },
    desc: '방어도 {B:blk}. 다음 내 턴까지 공격받을 때마다(최대 {max}회) 탄약 1을 써서 공격자에게 {D:dmg} 관통 피해',
    run: (c, u) => {
      guard(c, u);
      // 메아리(50%)는 횟수도 절반만
      const shots = Math.max(1, Math.floor(u.v('max') * Math.min(1, u.power)));
      c.s.vars.xOverwatchLeft = (c.s.vars.xOverwatchLeft ?? 0) + shots;
      if (!c.p.st['x-overwatch']) c.apply(c.p, 'x-overwatch', u.v('dmg'), c.p);
    },
  }),
  skill({
    id: 'x-weakpoint',
    name: '급소 사격',
    icon: 'gi:head-shot',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'aim'],
    vals: { dmg: [6, 8], poise: [1, 2] },
    desc: '탄약 1: {D:dmg} 관통 피해, 버팀 추가 -{poise}. 이 공격으로 붕괴시키면 조준 +1, 탄약 +2',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      const ds = hit(c, u, t);
      if (ds.some((d) => d.broke) && !c.over) {
        c.apply(c.p, 'aim', 1, c.p);
        c.s.ammo = Math.min(c.s.maxAmmo, c.s.ammo + 2);
      }
    },
  }),
  skill({
    id: 'x-ricochet',
    name: '도탄',
    icon: 'gi:bullet-impacts',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'multi'],
    vals: { dmg: [4, 5], bounce: [1, 2] },
    desc: '탄약 1: {D:dmg} 관통 피해. 이후 다른 무작위 적에게 {bounce}번 튕겨 {D:dmg} 피해',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      hit(c, u, t);
      let last = t;
      for (let i = 0; i < u.v('bounce'); i++) {
        const pool = c.alive.filter((e) => e !== last);
        if (!pool.length || c.over) break;
        const next = c.rng.pick(pool);
        c.damage({ src: c.p, tgt: next, base: u.v('dmg'), type: u.type ?? 'pierce', attack: true, skill: u, tags: ['ricochet'] });
        last = next;
      }
    },
  }),
  skill({
    id: 'x-execution',
    name: '처형 사격',
    icon: 'gi:target-shot',
    school: 'firearm',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun'],
    vals: { dmg: [6, 8] },
    desc: '탄약 1: {D:dmg} 관통 피해. 붕괴된 적에게는 3배',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      hit(c, u, t, { dmg: u.v('dmg') * (t && t.broken > 0 ? 3 : 1) });
    },
  }),
]);

// ───────────── 비술 — 인장, 보호막, 의식 ─────────────

reg.skills([
  skill({
    id: 'x-arcane-volley',
    name: '비전 연사',
    icon: 'gi:triorb',
    school: 'occult',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark', 'multi'],
    vals: { dmg: [2, 3], hits: 3 },
    desc: '{D:dmg} 비전 피해 {hits}회 (인장이 타격마다 피해를 더한다)',
    run: (c, u, t) => void hit(c, u, t),
  }),
  skill({
    id: 'x-seal',
    name: '봉인',
    icon: 'gi:circle-cage',
    school: 'occult',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['mark', 'debuff'],
    vals: { mark: [2, 3], need: 5 },
    desc: '인장 {mark}. 인장이 {need} 이상이면 모두 소모하고 기절 1',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'mark', u.v('mark'), c.p);
      const m = t.st.mark ?? 0;
      if (m >= u.v('need') && !t.dead) {
        c.apply(t, 'mark', -m);
        c.emit({ t: 'text', uid: t.uid, text: '봉인', tone: 'eldritch' });
        c.apply(t, 'stun', 1, c.p);
      }
    },
  }),
  skill({
    id: 'x-backlash',
    name: '역류',
    icon: 'gi:shield-impact',
    school: 'occult',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'barrier'],
    vals: { dmg: [4, 6] },
    desc: '보호막을 모두 소모해 {D:dmg} + 소모한 보호막만큼 비전 피해',
    run: (c, u, t) => {
      const b = c.p.st.barrier ?? 0;
      if (b > 0) c.apply(c.p, 'barrier', -b);
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(b * u.power) });
    },
  }),
  skill({
    id: 'x-echo-burst',
    name: '여진 폭발',
    icon: 'gi:bright-explosion',
    school: 'occult',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark', 'detonate'],
    vals: { base: [4, 6], per: [5, 6] },
    desc: '대상의 인장을 모두 터뜨려 {base} + 인장당 {per} 비전 피해. 터뜨린 인장의 절반(올림)을 다른 모든 적에게 새긴다',
    run: (c, u, t) => {
      if (!t) return;
      const marks = t.st.mark ?? 0;
      // 기본 + 인장당 피해 전체가 위력(메아리·절약 각인)을 따른다
      detonate(c, u, t, 0, Math.floor((u.v('base') + marks * u.v('per')) * u.power));
      const spread = Math.ceil(marks / 2);
      if (spread > 0) for (const e of c.alive) if (e !== t) c.apply(e, 'mark', spread, c.p);
    },
  }),
  skill({
    id: 'x-summoning-rite',
    name: '강령 의식',
    icon: 'gi:candles',
    school: 'occult',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    type: 'arcane',
    tags: ['ritual', 'aoe'],
    vals: { dmg: [14, 18] },
    desc: '의식을 시작한다: 다음 턴이 끝날 때 적 전체에 {D:dmg} 비전 피해',
    canUse: (c) => (c.p.st['x-rite'] ? '의식 진행 중' : null),
    run: (c, u) => {
      if (c.p.st['x-rite']) return;
      c.s.vars.xRiteDmg = u.v('dmg');
      c.apply(c.p, 'x-rite', 2, c.p);
    },
  }),
]);

// ───────────── 연금 — 독, 화상 ─────────────

reg.skills([
  skill({
    id: 'x-miasma',
    name: '독안개',
    icon: 'gi:poison-cloud',
    school: 'alchemy',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'all',
    tags: ['poison', 'aoe', 'debuff'],
    vals: { poison: [3, 4] },
    desc: '적 전체에 독 {poison}',
    run: (c, u) => {
      for (const e of c.alive) c.apply(e, 'poison', u.v('poison'), c.p);
    },
  }),
  skill({
    id: 'x-plague-fire',
    name: '역병의 불',
    icon: 'gi:fire-bomb',
    school: 'alchemy',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'front',
    type: 'fire',
    tags: ['attack', 'aoe', 'poison', 'burn'],
    vals: { dmg: [4, 5] },
    desc: '전열의 모든 적에게 {D:dmg} 화염 피해. 독에 걸린 적은 독 수치의 절반만큼 추가 피해',
    run: (c, u) => {
      const row = c.row(0).length ? c.row(0) : c.row(1);
      for (const e of [...row]) {
        if (c.over) break;
        const extra = Math.floor(((e.st.poison ?? 0) / 2) * u.power);
        c.damage({ src: c.p, tgt: e, base: u.v('dmg') + extra, type: u.type ?? 'fire', attack: true, skill: u });
      }
    },
  }),
  skill({
    id: 'x-ignite',
    name: '점화',
    icon: 'gi:burning-embers',
    school: 'alchemy',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'fire',
    tags: ['attack', 'poison', 'burn'],
    vals: { dmg: [3, 4], pct: [50, 75] },
    desc: '대상이 가진 독의 {pct}%를 화상으로 바꾼 뒤 {D:dmg} 화염 피해',
    run: (c, u, t) => {
      if (!t) return;
      const n = Math.ceil(((t.st.poison ?? 0) * u.v('pct')) / 100);
      if (n > 0) {
        c.apply(t, 'poison', -n);
        c.apply(t, 'burn', n, c.p);
      }
      hit(c, u, t);
    },
  }),
  skill({
    id: 'x-venom-coat',
    name: '독 바르기',
    icon: 'gi:dripping-knife',
    school: 'alchemy',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff', 'poison'],
    vals: { n: [2, 3] },
    desc: '이번 턴 공격이 체력 피해를 줄 때마다 독 {n}',
    run: (c, u) => void c.apply(c.p, 'x-venom', u.v('n'), c.p),
  }),
  skill({
    id: 'x-volatile',
    name: '휘발성 혼합물',
    icon: 'gi:fizzing-flask',
    school: 'alchemy',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'fire',
    tags: ['attack', 'burn', 'aoe'],
    vals: { mul: [2, 3] },
    desc: '화상이 가장 높은 적의 화상을 모두 터뜨려 적 전체에 (화상 × {mul}) 화염 피해',
    canUse: (c) => (c.alive.some((e) => (e.st.burn ?? 0) > 0) ? null : '화상 중인 적이 없다'),
    run: (c, u) => {
      let t: EnemyUnit | null = null;
      for (const e of c.alive) if ((e.st.burn ?? 0) > (t?.st.burn ?? 0)) t = e;
      const b = t?.st.burn ?? 0;
      if (!t || b <= 0) return;
      c.emit({ t: 'fx', name: 'detonate', tgt: t.uid });
      c.clear(t, 'burn');
      const dmg = Math.floor(b * u.v('mul') * u.power);
      for (const e of [...c.alive]) {
        if (c.over) break;
        c.damage({ src: c.p, tgt: e, base: dmg, type: u.type ?? 'fire', attack: true, skill: u, tags: ['volatile'] });
      }
    },
  }),
]);

// ───────────── 결의 — 방어, 반격, 버티기 ─────────────

reg.skills([
  skill({
    id: 'x-faith-shield',
    name: '신념의 방패',
    icon: 'gi:templar-shield',
    school: 'resolve',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'sanity'],
    vals: { blk: [6, 8], th: 60 },
    desc: '방어도 {B:blk}. 정신력이 {th} 이상이면 결계 1',
    run: (c, u) => {
      guard(c, u);
      if (c.p.sanity >= u.v('th')) c.apply(c.p, 'ward', 1, c.p);
    },
  }),
  skill({
    id: 'x-vengeance',
    name: '응보',
    icon: 'gi:mailed-fist',
    school: 'resolve',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [5, 6], pct: [20, 30] },
    desc: '{D:dmg} + 잃은 체력의 {pct}% 타격 피해',
    run: (c, u, t) => void hit(c, u, t, { dmg: u.v('dmg') + Math.floor(((c.p.maxHp - c.p.hp) * u.v('pct') * u.power) / 100) }),
  }),
  skill({
    id: 'x-thorn-mail',
    name: '가시 돋친 각오',
    icon: 'gi:crown-of-thorns',
    school: 'resolve',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'thorns'],
    vals: { blk: [5, 7], thorns: [2, 3] },
    desc: '방어도 {B:blk}, 가시 {thorns} (전투 동안 누적)',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'thorns', u.v('thorns'), c.p);
    },
  }),
  skill({
    id: 'x-iron-skin',
    name: '강철 피부',
    icon: 'gi:heart-armor',
    school: 'resolve',
    rarity: 'uncommon',
    cost: 1,
    cd: 99,
    range: 'self',
    target: 'self',
    tags: ['block', 'harden'],
    vals: { n: [3, 4] },
    desc: '경화 {n}: 이번 전투 동안 매 턴 종료 시 방어도 {n}. 전투당 1회',
    run: (c, u) => void c.apply(c.p, 'harden', u.v('n'), c.p),
  }),
  skill({
    id: 'x-fortify',
    name: '요새화',
    icon: 'gi:defensive-wall',
    school: 'resolve',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'barrier'],
    vals: { blk: [4, 6] },
    desc: '현재 방어도를 모두 보호막으로 바꾸고 방어도 {B:blk}',
    run: (c, u) => {
      const b = c.p.block;
      if (b > 0) {
        c.p.block = 0;
        c.apply(c.p, 'barrier', b, c.p);
      }
      guard(c, u);
    },
  }),
]);

// ───────────── 금기 — 촉수, 통찰, 파멸, 낮은 정신력 ─────────────

reg.skills([
  skill({
    id: 'x-tentacle-lash',
    name: '촉수 채찍',
    icon: 'gi:curled-tentacle',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'sanity', 'tentacle'],
    vals: { dmg: [5, 7], per: [3, 4], san: 2 },
    desc: '정신력 {san} 소모. {D:dmg} + 촉수 1개당 {per} 공허 피해',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(u.v('per') * (c.p.st.tentacle ?? 0) * u.power) });
    },
  }),
  skill({
    id: 'x-void-siphon',
    name: '공허 흡입',
    icon: 'gi:extraction-orb',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'insight', 'sanity'],
    vals: { dmg: [6, 8] },
    desc: '방어도를 무시하고 {D:dmg} + 통찰 공허 피해. 준 체력 피해의 절반만큼 정신력 회복',
    run: (c, u, t) => {
      const ds = hit(c, u, t, { dmg: u.v('dmg') + c.p.insight, ignoreBlock: true });
      const n = Math.floor(dealt(ds) / 2);
      if (n > 0) c.gainSanity(n);
    },
  }),
  skill({
    id: 'x-doom-chorus',
    name: '종말의 합창',
    icon: 'gi:triple-skulls',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff', 'sanity', 'insight', 'aoe'],
    vals: { doom: [6, 9], per: 2, san: 6 },
    desc: '정신력 {san} 소모. 적 전체에 파멸 {doom} + 통찰×{per}',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      const n = u.v('doom') + u.v('per') * c.p.insight;
      for (const e of c.alive) c.apply(e, 'doom', n, c.p);
    },
  }),
  skill({
    id: 'x-unleash',
    name: '촉수 해방',
    icon: 'gi:kraken-tentacle',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'random',
    type: 'void',
    tags: ['attack', 'tentacle', 'multi'],
    vals: { dmg: [4, 5], hits: 3 },
    desc: '촉수를 모두 거둬들인다. 촉수 1개당 무작위 적에게 {D:dmg} 공허 피해 {hits}회',
    canUse: (c) => ((c.p.st.tentacle ?? 0) > 0 ? null : '촉수가 없다'),
    run: (c, u) => {
      const n = c.p.st.tentacle ?? 0;
      if (n <= 0) return;
      c.clear(c.p, 'tentacle');
      c.emit({ t: 'fx', name: 'tentacle', src: 'p', tgt: c.alive[0]?.uid });
      hit(c, u, null, { hits: n * u.v('hits') });
    },
  }),
  skill({
    id: 'x-shattered-mind',
    name: '부서진 이성',
    icon: 'gi:brainstorm',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'sanity'],
    vals: { dmg: [4, 6], pct: [20, 30], san: 2 },
    desc: '정신력 {san} 소모. {D:dmg} + 잃은 정신력의 {pct}% 공허 피해',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      const lost = Math.max(0, c.p.maxSanity - c.p.sanity);
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor((lost * u.v('pct') * u.power) / 100) });
    },
  }),
]);

// ───────────── 공용 — 열, 약점, 재사용 대기, 연계 ─────────────

reg.skills([
  skill({
    id: 'x-grapple',
    name: '갈고리 던지기',
    icon: 'gi:harpoon-chain',
    school: 'neutral',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'pull', 'debuff'],
    vals: { dmg: [4, 6], vuln: [1, 2] },
    desc: '{D:dmg} 관통 피해. 대상이 후열에 있으면 전열로 끌어당기고 취약 {vuln} (전열에 자리가 있을 때)',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead && t.row === 1 && c.moveRow(t, 0)) c.apply(t, 'vuln', u.v('vuln'), c.p);
    },
  }),
  skill({
    id: 'x-exploit',
    name: '약점 간파',
    icon: 'gi:eye-target',
    school: 'neutral',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    tags: ['attack', 'reveal'],
    vals: { dmg: [6, 8] },
    desc: '대상의 밝혀진 약점 속성으로 {D:dmg} 피해 (모르면 타격)',
    run: (c, u, t) => {
      if (!t) return;
      const known = t.known.filter((w) => t.weak.includes(w));
      hit(c, u, t, { type: u.type ?? known[0] ?? 'blunt' });
    },
  }),
  skill({
    id: 'x-improvise',
    name: '임기응변',
    icon: 'gi:backward-time',
    school: 'neutral',
    rarity: 'uncommon',
    cost: [1, 0],
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['energy', 'refresh'],
    vals: {},
    desc: '재사용 대기가 가장 많이 남은 다른 스킬 하나를 즉시 쓸 수 있게 한다 (전투당 1회 스킬·대기를 되돌리는 스킬 제외)',
    canUse: (c) => (longestCooldown(c, null) ? null : '대기 중인 스킬이 없다'),
    run: (c, u) => {
      // 메아리 사본은 되돌리지 않는다
      const uid = u.echo ? null : longestCooldown(c, u);
      if (!uid) return;
      delete c.s.cd[uid];
      c.emit({ t: 'text', uid: 'p', text: '임기응변', tone: 'good' });
    },
  }),
  skill({
    id: 'x-composure',
    name: '평정',
    icon: 'gi:yin-yang',
    school: 'neutral',
    rarity: 'common',
    cost: 0,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'combo'],
    vals: { blk: [2, 3], per: [3, 4] },
    desc: '방어도 {B:blk} + 이번 턴 앞서 쓴 스킬 1개당 {per}',
    run: (c, u) => void guard(c, u, u.v('blk') + Math.floor(u.v('per') * combo(c) * u.power)),
  }),
  skill({
    id: 'x-opportunist',
    name: '허점 찌르기',
    icon: 'gi:knife-thrust',
    school: 'neutral',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'debuff'],
    vals: { dmg: [3, 4], per: [2, 3] },
    desc: '{D:dmg} 관통 피해 + 대상에게 걸린 해로운 효과 1종류당 {per}',
    run: (c, u, t) => {
      if (!t) return;
      const kinds = Object.keys(t.st).filter((id) => (t.st[id] ?? 0) > 0 && STATUSES.get(id)?.kind === 'debuff').length;
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(u.v('per') * kinds * u.power) });
    },
  }),
]);
