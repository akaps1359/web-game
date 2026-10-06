import { reg } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { EnemyUnit } from '../../engine/types';
import { combo, detonate, guard, hit, needAmmo, reload, skill, spendAmmo } from '../lib';

/**
 * 합기(合技) — 두 계열의 스킬을 하나씩 가지고 있을 때만 보상·상점에 나오는 희귀 스킬 (SkillDef.duo).
 * 한쪽 계열이 쌓은 것을 다른 쪽 계열이 거두거나 키운다. 6계열의 모든 짝 15종.
 * - 행동력을 주거나 재사용 대기를 되돌리는 합기는 없다 (무한 고리 방지).
 * - 스스로 건 상태에 다시 반응하지 않는다. 메아리(위력 50%)로 두 번 발동해도 같은 효과가 겹쳐 커지지 않게 상태는 '큰 쪽'만 남긴다.
 * - 금기 쪽은 통찰 대신 정신력(소모·잃은 양)·촉수·파멸을 엮는다.
 */

const RIPOSTE = 'duo-blood-riposte';
const PLAGUE = 'duo-plague';

/** 메아리·절약 각인처럼 위력이 1보다 작을 때만 줄인다 (상태 수치 변환용 — 강화 위력으로 늘리지는 않는다) */
const scale = (n: number, power: number) => Math.floor(n * Math.min(1, power));

/** 지금보다 클 때만 그 값까지 올린다 (같은 버프를 두 번 걸어 수치가 쌓이지 않게) */
function raise(c: Combat, id: string, n: number) {
  const cur = c.p.st[id] ?? 0;
  if (n > cur) c.apply(c.p, id, n - cur, c.p);
}

const alive = (t: EnemyUnit | null): t is EnemyUnit => !!t && !t.dead && t.hp > 0;

reg.statuses([
  {
    id: RIPOSTE,
    name: '피의 응수',
    icon: 'gi:spiked-shield',
    kind: 'buff',
    desc: '방어도로 공격을 막을 때마다 공격자에게 막은 피해의 {n}%만큼 출혈 (다음 내 턴이 시작되면 사라짐)',
    hooks: {
      onDamageTaken(c, s, d) {
        if (!d.attack || d.blocked <= 0) return;
        const src = d.src;
        if (!isEnemy(src) || src.dead || src.hp <= 0) return;
        c.apply(src, 'bleed', Math.max(1, Math.floor((d.blocked * s.n) / 100)), s.unit);
      },
    },
    tickStart(c, u) {
      if (!isEnemy(u)) c.clear(u, RIPOSTE);
    },
  },
  {
    id: PLAGUE,
    name: '역병 촉수',
    icon: 'gi:suckered-tentacle',
    kind: 'buff',
    desc: '촉수에 맞은 적은 독 {n} (전투 동안)',
    hooks: {
      onDamageDealt(c, s, d) {
        if (d.src !== s.unit || !d.tags.includes('tentacle') || d.hpLoss + d.blocked <= 0) return;
        if (isEnemy(d.tgt) && !d.tgt.dead && d.tgt.hp > 0) c.apply(d.tgt, 'poison', s.n, s.unit);
      },
    },
  },
]);

reg.skills([
  // ───────── 검술 × 사격: 연계가 방아쇠를 당긴다 ─────────
  skill({
    id: 'duo-bayonet',
    name: '총검 난무',
    icon: 'gi:bayonet',
    school: 'blade',
    duo: ['blade', 'firearm'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'combo', 'ammo', 'gun', 'multi'],
    vals: { dmg: [7, 9], dmgshot: [5, 6], max: [3, 4] },
    desc: '{D:dmg} 참격 피해. 이어서 이번 턴 앞서 쓴 스킬 1개당 탄약 1을 써 대상을 쏜다: {dmgshot} 관통 피해 (최대 {max}발, 조준이 실린다)',
    run: (c, u, t) => {
      const shots = Math.min(u.v('max'), combo(c));
      hit(c, u, t);
      for (let i = 0; i < shots; i++) {
        if (!alive(t) || c.over || c.s.ammo <= 0) break;
        spendAmmo(c, 1);
        c.damage({ src: c.p, tgt: t, base: u.v('dmgshot'), type: u.type ?? 'pierce', attack: true, skill: u, tags: ['bayonet'] });
      }
    },
  }),

  // ───────── 검술 × 비술: 흐르는 피로 인장을 그린다 ─────────
  skill({
    id: 'duo-blood-sigil',
    name: '혈인',
    icon: 'gi:rune-sword',
    school: 'occult',
    duo: ['blade', 'occult'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'bleed', 'mark', 'multi'],
    vals: { dmg: [4, 5], hits: 2, max: [6, 8] },
    desc: '대상의 출혈만큼 인장을 새긴 뒤(최대 {max}) {D:dmg} 비전 피해 {hits}회 (인장이 타격마다 피해를 더한다, 출혈은 남는다)',
    run: (c, u, t) => {
      if (!t) return;
      const n = Math.min(u.v('max'), scale(t.st.bleed ?? 0, u.power));
      if (n > 0) c.apply(t, 'mark', n, c.p);
      hit(c, u, t);
    },
  }),

  // ───────── 검술 × 연금: 상처에 독을 흘려 넣는다 ─────────
  skill({
    id: 'duo-venom-blood',
    name: '독혈 베기',
    icon: 'gi:dripping-sword',
    school: 'blade',
    duo: ['blade', 'alchemy'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed', 'poison'],
    vals: { dmg: [6, 8], bleed: [2, 3] },
    desc: '{D:dmg} 참격 피해, 출혈 {bleed}. 그 뒤 대상의 출혈만큼 독',
    run: (c, u, t) => {
      hit(c, u, t);
      if (!alive(t)) return;
      c.apply(t, 'bleed', u.v('bleed'), c.p);
      const n = scale(t.st.bleed ?? 0, u.power);
      if (n > 0 && alive(t)) c.apply(t, 'poison', n, c.p);
    },
  }),

  // ───────── 검술 × 결의: 막아 낸 칼끝이 되돌아간다 ─────────
  skill({
    id: 'duo-blood-riposte',
    name: '피의 응수',
    icon: 'gi:spiked-shield',
    school: 'resolve',
    duo: ['blade', 'resolve'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'bleed', 'counter'],
    vals: { blk: [7, 9], pct: [50, 75] },
    desc: '방어도 {B:blk}. 다음 내 턴까지 방어도로 공격을 막을 때마다 공격자에게 막은 피해의 {pct}%만큼 출혈',
    run: (c, u) => {
      guard(c, u);
      raise(c, RIPOSTE, scale(u.v('pct'), u.power));
    },
  }),

  // ───────── 검술 × 금기: 흘린 피를 심연에 바친다 ─────────
  skill({
    id: 'duo-blood-offering',
    name: '피의 제물',
    icon: 'gi:cut-palm',
    school: 'forbidden',
    duo: ['blade', 'forbidden'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed', 'sanity', 'doom'],
    vals: { dmg: [6, 8], bleed: 2, mul: [3, 4], san: 3 },
    desc: '정신력 {san} 소모. {D:dmg} 참격 피해, 출혈 {bleed}. 그 뒤 대상의 출혈 × {mul}만큼 파멸 (파멸이 체력 이상이면 그 적의 차례가 끝날 때 즉사)',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      hit(c, u, t);
      if (!alive(t)) return;
      c.apply(t, 'bleed', u.v('bleed'), c.p);
      const n = scale((t.st.bleed ?? 0) * u.v('mul'), u.power);
      if (n > 0 && alive(t)) c.apply(t, 'doom', n, c.p);
    },
  }),

  // ───────── 사격 × 비술: 인장마다 한 발, 그리고 폭발 ─────────
  skill({
    id: 'duo-sigil-round',
    name: '인장탄',
    icon: 'gi:silver-bullet',
    school: 'firearm',
    duo: ['firearm', 'occult'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'mark', 'detonate', 'multi'],
    vals: { dmg: [5, 6], max: [5, 6], per: [3, 4] },
    desc: '대상의 인장 1개당 탄약 1을 써 {D:dmg} 관통 피해 (최소 1발, 최대 {max}발). 그 뒤 인장을 모두 터뜨려 인장당 {per} 비전 피해',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      if (!t) return;
      const shots = Math.max(1, Math.min(u.v('max'), t.st.mark ?? 0));
      for (let i = 0; i < shots; i++) {
        if (!alive(t) || c.over || c.s.ammo <= 0) break;
        spendAmmo(c, 1);
        c.damage({ src: c.p, tgt: t, base: u.v('dmg'), type: u.type ?? 'pierce', attack: true, skill: u, tags: ['sigil-round'] });
      }
      // 폭발 피해도 위력(메아리·절약 각인)을 따른다
      if (alive(t) && !c.over) detonate(c, u, t, Math.floor(u.v('per') * u.power));
    },
  }),

  // ───────── 사격 × 연금: 독이 오른 몸은 버티지 못한다 ─────────
  skill({
    id: 'duo-neurotoxin',
    name: '신경독탄',
    icon: 'gi:skull-with-syringe',
    school: 'firearm',
    duo: ['firearm', 'alchemy'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'poison'],
    vals: { dmg: [7, 9], poison: [3, 4], div: 3, max: 4 },
    desc: '탄약 1: 대상에게 독 {poison}을 묻힌 뒤 {D:dmg} 관통 피해. 대상의 독 {div}당 버팀 추가 -1 (최대 {max})',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      if (!t) return;
      c.apply(t, 'poison', u.v('poison'), c.p);
      const poise = Math.min(u.v('max'), Math.floor((t.st.poison ?? 0) / Math.max(1, u.v('div'))));
      hit(c, u, t, { poise });
    },
  }),

  // ───────── 사격 × 결의: 엄폐하고, 방패 뒤에서 겨눈 한 발 ─────────
  skill({
    id: 'duo-cover-snipe',
    name: '엄폐 저격',
    icon: 'gi:barricade',
    school: 'firearm',
    duo: ['firearm', 'resolve'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'block'],
    vals: { blk: [5, 6], dmg: [5, 6], pct: [60, 80] },
    desc: '방어도 {B:blk}. 이어서 탄약 1: {D:dmg} + 현재 방어도의 {pct}% 관통 피해 (방어도는 그대로, 조준이 실린다)',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      guard(c, u);
      spendAmmo(c, 1);
      // 방어도 비례 피해도 위력(메아리·절약 각인)을 따른다
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor((c.p.block * u.v('pct') * u.power) / 100) });
    },
  }),

  // ───────── 사격 × 금기: 무너질수록 또렷해지는 조준선 ─────────
  skill({
    id: 'duo-mad-aim',
    name: '광인의 조준',
    icon: 'gi:dead-eye',
    school: 'firearm',
    duo: ['firearm', 'forbidden'],
    rarity: 'rare',
    cost: 0,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff', 'aim', 'ammo', 'sanity'],
    vals: { san: 5, aim: 1, per: [20, 15], max: 3 },
    desc: '정신력 {san} 소모. 탄약을 가득 채우고 조준 {aim} + 잃은 정신력 {per}마다 1 (최대 {max})',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      if (c.over) return;
      if (c.s.ammo < c.s.maxAmmo) reload(c);
      const lost = Math.max(0, c.p.maxSanity - c.p.sanity);
      const n = scale(Math.min(u.v('max'), u.v('aim') + Math.floor(lost / Math.max(1, u.v('per')))), u.power);
      if (n > 0) c.apply(c.p, 'aim', n, c.p);
    },
  }),

  // ───────── 비술 × 연금: 썩어 가는 살에 인장이 피어난다 ─────────
  skill({
    id: 'duo-transmute-circle',
    name: '연성진',
    icon: 'gi:circle-sparks',
    school: 'occult',
    duo: ['occult', 'alchemy'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'all',
    type: 'arcane',
    tags: ['attack', 'aoe', 'mark', 'poison', 'burn'],
    vals: { dmg: [4, 5], pct: [50, 75], max: 6 },
    desc: '모든 적에게 각자 가진 (독 + 화상)의 {pct}%만큼 인장을 새기고(최대 {max}) {D:dmg} 비전 피해 (인장이 피해를 더한다)',
    run: (c, u, t) => {
      for (const e of c.alive) {
        const n = Math.min(u.v('max'), scale((((e.st.poison ?? 0) + (e.st.burn ?? 0)) * u.v('pct')) / 100, u.power));
        if (n > 0) c.apply(e, 'mark', n, c.p);
      }
      hit(c, u, t);
    },
  }),

  // ───────── 비술 × 결의: 터뜨린 인장이 방벽이 된다 ─────────
  skill({
    id: 'duo-sigil-bulwark',
    name: '인장 방벽',
    icon: 'gi:rosa-shield',
    school: 'resolve',
    duo: ['occult', 'resolve'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark', 'detonate', 'block'],
    vals: { base: [5, 6], per: [4, 5], blk: [4, 5], blkper: [3, 4] },
    desc: '대상의 인장을 모두 터뜨려 {base} + 인장당 {per} 비전 피해. 방어도 {B:blk} + 터뜨린 인장 1개당 {blkper}',
    run: (c, u, t) => {
      if (!t) return;
      const marks = t.st.mark ?? 0;
      // 기본·인장당 피해도 위력(메아리·절약 각인)을 따른다 (방어도 수치는 u.v가 위력을 이미 반영)
      detonate(c, u, t, Math.floor(u.v('per') * u.power), Math.floor(u.v('base') * u.power));
      guard(c, u, u.v('blk') + marks * u.v('blkper'));
    },
  }),

  // ───────── 비술 × 금기: 인장을 따라 심연이 스며든다 ─────────
  skill({
    id: 'duo-abyss-brand',
    name: '심연의 낙인',
    icon: 'gi:burning-eye',
    school: 'forbidden',
    duo: ['occult', 'forbidden'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'mark', 'sanity', 'multi'],
    vals: { dmg: [5, 6], san: 3, max: 8 },
    desc: '정신력 {san} 소모. 대상의 인장 1개당 {D:dmg} 공허 피해 1회 (최소 1회, 최대 {max}회 · 방어도 무시 · 인장은 남는다)',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      if (!t || c.over) return;
      hit(c, u, t, { hits: Math.max(1, Math.min(u.v('max'), t.st.mark ?? 0)), ignoreBlock: true });
    },
  }),

  // ───────── 연금 × 결의: 방패에 바른 독 ─────────
  skill({
    id: 'duo-venom-shield',
    name: '독 바른 방패',
    icon: 'gi:acid-shield',
    school: 'alchemy',
    duo: ['alchemy', 'resolve'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'block', 'poison'],
    vals: { blk: [5, 6], dmg: [5, 6], pct: [40, 60] },
    desc: '방어도 {B:blk}. 이어서 {D:dmg} 타격 피해, 현재 방어도의 {pct}%만큼 독 (방어도는 그대로)',
    run: (c, u, t) => {
      guard(c, u);
      hit(c, u, t);
      if (!alive(t)) return;
      const n = scale((c.p.block * u.v('pct')) / 100, u.power);
      if (n > 0) c.apply(t, 'poison', n, c.p);
    },
  }),

  // ───────── 연금 × 금기: 독을 머금은 촉수 ─────────
  skill({
    id: 'duo-plague-tentacle',
    name: '역병 촉수',
    icon: 'gi:suckered-tentacle',
    school: 'forbidden',
    duo: ['alchemy', 'forbidden'],
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['summon', 'sanity', 'poison', 'tentacle', 'aoe'],
    vals: { n: 1, san: 4, poison: [2, 3] },
    desc: '정신력 {san} 소모. 적 전체에 독 {poison}, 촉수 {n} (내 턴이 끝날 때 무작위 적 공격). 이번 전투 동안 촉수에 맞은 적은 독 {poison}',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      if (c.over) return;
      for (const e of c.alive) c.apply(e, 'poison', u.v('poison'), c.p);
      c.apply(c.p, 'tentacle', u.v('n'), c.p);
      raise(c, PLAGUE, u.v('poison'));
    },
  }),

  // ───────── 결의 × 금기: 무너진 정신을 방패로 삼는다 ─────────
  skill({
    id: 'duo-zealot-shield',
    name: '광신의 방패',
    icon: 'gi:black-hand-shield',
    school: 'resolve',
    duo: ['resolve', 'forbidden'],
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'sanity'],
    vals: { blk: [6, 8], pct: [25, 35], san: 2 },
    desc: '정신력 {san} 소모. 방어도 {B:blk} + 잃은 정신력의 {pct}%',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      if (c.over) return;
      const lost = Math.max(0, c.p.maxSanity - c.p.sanity);
      // 잃은 정신력 비례 방어도도 위력(메아리·절약 각인)을 따른다
      guard(c, u, u.v('blk') + Math.floor((lost * u.v('pct') * u.power) / 100));
    },
  }),
]);
