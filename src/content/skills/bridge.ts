import { reg } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { EnemyUnit } from '../../engine/types';
import { combo, guard, hit, needAmmo, skill, spendAmmo } from '../lib';

/**
 * 계열을 잇는 글루 스킬 (상처의 문법 — 표는 src/content/keywords.ts, 안쪽 설계용).
 * 남의 계열이 남긴 것을 쓰는 스킬. 계열마다 스킬의 약 1/3이 이런 스킬이 되도록 채웠다 (검술·연금부터).
 * - 플레이어에게는 새 용어 없이 "출혈이 있으면 …"처럼 바로 읽히는 조건 한 줄만 보인다. 조건 하나, 효과 하나.
 * - 읽을 게 없어도 쓸 만한 기본 효과가 있다. 1차 키워드를 크게 터뜨리는 깊이 보상은 1차 계열에 남긴다.
 * - 행동력·재사용 대기를 돌려주지 않는다 (무한 고리 금지). 스스로 건 상태에 다시 반응하지 않고, 같은 버프는 겹쳐 커지지 않는다.
 * - 2차 생산을 맡은 것도 있다: 룬 새긴 칼날(검술의 인장), 예광탄(사격의 화상), 촉수의 인장(비술의 촉수), 전열 정비(결의의 탄약·조준).
 * id·상태 id는 'br-' 접두사.
 */

const alive = (t: EnemyUnit | null): t is EnemyUnit => !!t && !t.dead && t.hp > 0;
/** 약화나 취약 */
const exposed = (t: EnemyUnit) => (t.st.weak ?? 0) > 0 || (t.st.vuln ?? 0) > 0;

reg.statuses([
  {
    id: 'br-blood-scent',
    name: '피 냄새',
    icon: 'gi:fangs',
    kind: 'buff',
    desc: '출혈 중인 적에게 반격 피해 2배 (다음 내 턴이 시작되면 사라짐)',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.tags.includes('counter') && isEnemy(d.tgt) && (d.tgt.st.bleed ?? 0) > 0) d.mult *= 2;
      },
    },
    tickStart(c, u) {
      if (!isEnemy(u)) c.clear(u, 'br-blood-scent');
    },
  },
  {
    id: 'br-venom-barbs',
    name: '독가시',
    icon: 'gi:thorn-helix',
    kind: 'buff',
    desc: '반격이 맞힌 적에게 독 {n} (다음 내 턴이 시작되면 사라짐)',
    hooks: {
      onDamageDealt(c, s, d) {
        if (d.src !== s.unit || !d.tags.includes('counter') || d.hpLoss + d.blocked <= 0) return;
        if (isEnemy(d.tgt) && !d.tgt.dead && d.tgt.hp > 0) c.apply(d.tgt, 'poison', s.n, s.unit);
      },
    },
    tickStart(c, u) {
      if (!isEnemy(u)) c.clear(u, 'br-venom-barbs');
    },
  },
  {
    id: 'br-tentacle-sigil',
    name: '촉수의 인장',
    icon: 'gi:ringed-tentacle',
    kind: 'buff',
    desc: '촉수에 맞은 적은 인장 {n} (전투 동안)',
    hooks: {
      onDamageDealt(c, s, d) {
        if (d.src !== s.unit || !d.tags.includes('tentacle') || d.hpLoss + d.blocked <= 0) return;
        if (isEnemy(d.tgt) && !d.tgt.dead && d.tgt.hp > 0) c.apply(d.tgt, 'mark', s.n, s.unit);
      },
    },
  },
]);

/** 같은 버프를 다시 걸어도 수치가 쌓이지 않게 (지금보다 클 때만 올린다) */
function raise(c: Combat, id: string, n: number) {
  const cur = c.p.st[id] ?? 0;
  if (n > cur) c.apply(c.p, id, n - cur, c.p);
}

// ───────────── 검술: 독·인장·잃은 정신력·조준·반격·약화를 칼로 거둔다 ─────────────

reg.skills([
  skill({
    id: 'br-venom-tip',
    name: '독 묻은 칼끝',
    icon: 'gi:curvy-knife',
    school: 'blade',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'multi', 'poison'],
    makes: [],
    reads: ['poison'],
    vals: { dmg: [4, 5], hits: 2 },
    desc: '{D:dmg} 참격 피해 {hits}회. 대상이 독에 걸려 있으면 1회 추가',
    run: (c, u, t) => void hit(c, u, t, { hits: u.v('hits') + (t && (t.st.poison ?? 0) > 0 ? 1 : 0) }),
  }),
  skill({
    id: 'br-rune-blade',
    name: '룬 새긴 칼날',
    icon: 'gi:relic-blade',
    school: 'blade',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'mark'],
    makes: ['mark'],
    reads: ['mark'],
    vals: { dmg: [8, 10], per: [2, 3], mark: 1 },
    desc: '{D:dmg} 참격 피해, 인장 {mark}. 대상의 인장 1개당 피해 +{per}',
    run: (c, u, t) => {
      // 인장 비례 피해도 위력(메아리·절약 각인)을 따른다. 새기는 인장은 피해를 준 뒤에
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor((t?.st.mark ?? 0) * u.v('per') * u.power) });
      if (alive(t) && !c.over) c.apply(t, 'mark', u.v('mark'), c.p);
    },
  }),
  skill({
    id: 'br-mad-dance',
    name: '광기의 칼춤',
    icon: 'gi:spinning-blades',
    school: 'blade',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'multi', 'sanity'],
    makes: [],
    reads: ['sanity'],
    vals: { dmg: [5, 6], hits: 2, per: 20, max: 3 },
    desc: '{D:dmg} 참격 피해 {hits}회. 잃은 정신력 {per}마다 1회 추가 (최대 {max}회)',
    run: (c, u, t) => {
      const lost = Math.max(0, c.p.maxSanity - c.p.sanity);
      hit(c, u, t, { hits: u.v('hits') + Math.min(u.v('max'), Math.floor(lost / Math.max(1, u.v('per')))) });
    },
  }),
  skill({
    id: 'br-aimed-cut',
    name: '겨눈 일격',
    icon: 'gi:piercing-sword',
    school: 'blade',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'aim'],
    makes: [],
    reads: ['aim'],
    vals: { dmg: [10, 13] },
    desc: '{D:dmg} 참격 피해. 조준이 있으면 피해 2배',
    // 조준은 쓰지 않는다 (사격의 관통 공격이 쓸 조준을 빼앗지 않게 — 나눠 쓰는 자원은 읽기만)
    run: (c, u, t) => void hit(c, u, t, { dmg: u.v('dmg') * ((c.p.st.aim ?? 0) > 0 ? 2 : 1) }),
  }),
  skill({
    id: 'br-counter-cut',
    name: '맞받아 베기',
    icon: 'gi:sword-break',
    school: 'blade',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'counter'],
    makes: [],
    reads: ['counter'],
    vals: { dmg: [8, 11], per: 2 },
    desc: '{D:dmg} 참격 피해. 내 반격 1당 피해 +{per}',
    // 반격 비례 피해도 위력(메아리·절약 각인)을 따른다 (반격은 그대로 남는다)
    run: (c, u, t) => void hit(c, u, t, { dmg: u.v('dmg') + Math.floor((c.p.st.counter ?? 0) * u.v('per') * u.power) }),
  }),
  skill({
    id: 'br-exposed-cut',
    name: '허점 가르기',
    icon: 'gi:sword-wound',
    school: 'blade',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed'],
    makes: ['bleed'],
    reads: ['expose'],
    vals: { dmg: [5, 6], bleed: [3, 4] },
    desc: '{D:dmg} 참격 피해, 출혈 {bleed}. 대상이 약화나 취약 상태면 출혈 2배',
    run: (c, u, t) => {
      hit(c, u, t);
      if (alive(t) && !c.over) c.apply(t, 'bleed', u.v('bleed') * (exposed(t) ? 2 : 1), c.p);
    },
  }),
]);

// ───────────── 사격: 출혈·연계·파멸을 노리고, 화상을 가끔 남긴다 ─────────────

reg.skills([
  skill({
    id: 'br-wound-sight',
    name: '상처 조준',
    icon: 'gi:target-laser',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'bleed'],
    makes: [],
    reads: ['bleed', 'ammo'],
    vals: { dmg: [9, 11] },
    desc: '탄약 1: {D:dmg} 관통 피해. 대상이 출혈 중이면 피해 2배',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      if (!t) return;
      if ((t.st.bleed ?? 0) <= 0) return void hit(c, u, t);
      // 상처를 겨눈다: 조준 하나를 잠시 빌려 치명타로 쏘고 남은 것은 거둔다 (가진 조준은 그대로)
      const before = c.p.st.aim ?? 0;
      c.apply(c.p, 'aim', 1, c.p);
      hit(c, u, t);
      const now = c.p.st.aim ?? 0;
      if (now > before) c.apply(c.p, 'aim', before - now);
    },
  }),
  skill({
    id: 'br-rhythm-shot',
    name: '리듬 사격',
    icon: 'gi:pistol-gun',
    school: 'firearm',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'aim', 'combo'],
    makes: ['aim'],
    reads: ['combo', 'ammo'],
    vals: { dmg: [8, 10], need: 2, aim: 1 },
    desc: '탄약 1: {D:dmg} 관통 피해. 이번 턴 앞서 스킬을 {need}개 이상 썼으면 조준 {aim}',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      const flowing = combo(c) >= u.v('need');
      spendAmmo(c, 1);
      hit(c, u, t);
      // 메아리 사본은 조준을 더 주지 않는다
      if (flowing && !u.echo && !c.over) c.apply(c.p, 'aim', u.v('aim'), c.p);
    },
  }),
  skill({
    id: 'br-execution-round',
    name: '집행 사격',
    icon: 'gi:heavy-bullets',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'doom'],
    makes: [],
    reads: ['doom', 'ammo'],
    vals: { dmg: [10, 12], pct: [50, 75] },
    desc: '탄약 1: {D:dmg} 관통 피해. 대상에게 걸린 파멸의 {pct}%만큼 피해 추가',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      // 파멸 비례 피해도 위력(메아리·절약 각인)을 따른다
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(((t?.st.doom ?? 0) * u.v('pct') * u.power) / 100) });
    },
  }),
  skill({
    id: 'br-tracer',
    name: '예광탄',
    icon: 'gi:fire-ray',
    school: 'firearm',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'burn'],
    makes: ['burn'],
    reads: ['ammo'],
    vals: { dmg: [7, 9], burn: [3, 4] },
    desc: '탄약 1: {D:dmg} 관통 피해, 화상 {burn}',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      hit(c, u, t);
      if (alive(t) && !c.over) c.apply(t, 'burn', u.v('burn'), c.p);
    },
  }),
]);

// ───────────── 비술: 방어도·연계·촉수·파멸을 인장으로 바꾼다 ─────────────

reg.skills([
  skill({
    id: 'br-shield-sigil',
    name: '방패 인장',
    icon: 'gi:eye-shield',
    school: 'occult',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark'],
    makes: ['mark'],
    reads: ['block'],
    vals: { dmg: [7, 9], per: 3, max: [4, 5] },
    desc: '{D:dmg} 비전 피해. 내 방어도 {per}당 인장 1 (최대 {max})',
    run: (c, u, t) => {
      hit(c, u, t);
      const n = Math.min(u.v('max'), Math.floor(c.p.block / Math.max(1, u.v('per'))));
      if (n > 0 && alive(t) && !c.over) c.apply(t, 'mark', n, c.p);
    },
  }),
  skill({
    id: 'br-chain-chant',
    name: '연쇄 영창',
    icon: 'gi:andromeda-chain',
    school: 'occult',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark', 'combo'],
    makes: ['mark'],
    reads: ['combo'],
    vals: { dmg: [7, 9], max: [4, 5] },
    desc: '{D:dmg} 비전 피해. 이번 턴 앞서 쓴 스킬 1개당 인장 1 (최대 {max})',
    run: (c, u, t) => {
      hit(c, u, t);
      const n = Math.min(u.v('max'), combo(c));
      if (n > 0 && alive(t) && !c.over) c.apply(t, 'mark', n, c.p);
    },
  }),
  skill({
    id: 'br-tentacle-sigil',
    name: '촉수의 인장',
    icon: 'gi:ringed-tentacle',
    school: 'occult',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['summon', 'tentacle', 'mark'],
    makes: ['tentacle', 'mark'],
    reads: ['tentacle'],
    vals: { n: [1, 2] },
    desc: '촉수 1. 이번 전투 동안 촉수에 맞은 적은 인장 {n}',
    run: (c, u) => {
      c.apply(c.p, 'tentacle', 1, c.p);
      raise(c, 'br-tentacle-sigil', u.v('n'));
    },
  }),
  skill({
    id: 'br-doom-sigil',
    name: '종말의 인장',
    icon: 'gi:wax-seal',
    school: 'occult',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark', 'doom'],
    makes: ['mark'],
    reads: ['doom'],
    vals: { dmg: [12, 15], div: [4, 3], max: 6 },
    desc: '{D:dmg} 비전 피해. 대상의 파멸 {div}당 인장 1 (최대 {max})',
    run: (c, u, t) => {
      hit(c, u, t);
      const n = Math.min(u.v('max'), Math.floor((t?.st.doom ?? 0) / Math.max(1, u.v('div'))));
      if (n > 0 && alive(t) && !c.over) c.apply(t, 'mark', n, c.p);
    },
  }),
]);

// ───────────── 연금: 출혈·인장을 독과 불로 옮기고, 조준·반격에 독과 불을 싣는다 ─────────────

reg.skills([
  skill({
    id: 'br-clot-catalyst',
    name: '응혈 촉매',
    icon: 'gi:chemical-drop',
    school: 'alchemy',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'poison', 'bleed'],
    makes: ['poison'],
    reads: ['bleed'],
    vals: { dmg: [3, 4], poison: [3, 5] },
    desc: '{D:dmg} 관통 피해, 독 {poison}. 대상의 출혈만큼 독 추가',
    // 남의 키워드는 읽기만 한다 (출혈은 남는다 — 검술의 혈류 폭발이 쓸 것을 빼앗지 않게)
    run: (c, u, t) => {
      if (!t) return;
      hit(c, u, t);
      // 메아리(50%)·절약(75%)이면 더하는 양도 그만큼만 (촉매와 같은 방식)
      if (alive(t) && !c.over) c.apply(t, 'poison', u.v('poison') + Math.floor((t.st.bleed ?? 0) * Math.min(1, u.power)), c.p);
    },
  }),
  skill({
    id: 'br-incendiary',
    name: '소이탄 장전',
    icon: 'gi:inferno-bomb',
    school: 'alchemy',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'fire',
    tags: ['attack', 'ammo', 'gun', 'burn', 'aim'],
    makes: ['burn'],
    reads: ['ammo', 'aim'],
    vals: { dmg: [6, 8], burn: [3, 4] },
    desc: '탄약 1: {D:dmg} 화염 피해, 화상 {burn}. 조준이 있으면 화상 2배',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      // 조준은 쓰지 않는다 (사격이 쓸 조준을 빼앗지 않게)
      const aimed = (c.p.st.aim ?? 0) > 0;
      hit(c, u, t);
      if (alive(t) && !c.over) c.apply(t, 'burn', u.v('burn') * (aimed ? 2 : 1), c.p);
    },
  }),
  skill({
    id: 'br-venom-barbs',
    name: '독가시',
    icon: 'gi:thorn-helix',
    school: 'alchemy',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'poison'],
    makes: ['block', 'poison'],
    reads: ['counter'],
    vals: { blk: [8, 10], poison: [2, 3] },
    desc: '방어도 {B:blk}. 다음 내 턴까지 반격이 맞힌 적에게 독 {poison}',
    run: (c, u) => {
      guard(c, u);
      if (!c.over) raise(c, 'br-venom-barbs', u.v('poison'));
    },
  }),
  skill({
    id: 'br-kindle-sigil',
    name: '불붙는 인장',
    icon: 'gi:fire-ring',
    school: 'alchemy',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'fire',
    tags: ['attack', 'burn', 'mark'],
    makes: ['burn'],
    reads: ['mark'],
    vals: { dmg: [8, 10] },
    desc: '{D:dmg} 화염 피해. 대상의 인장 1개당 화상 1',
    // 남의 키워드는 읽기만 한다 (인장은 남는다 — 비술의 인장 폭발이 쓸 것을 빼앗지 않게)
    run: (c, u, t) => {
      if (!t) return;
      const m = t.st.mark ?? 0;
      hit(c, u, t);
      // 메아리(50%)·절약(75%)이면 거는 양도 그만큼만
      const n = Math.floor(m * Math.min(1, u.power));
      if (n > 0 && alive(t) && !c.over) c.apply(t, 'burn', n, c.p);
    },
  }),
]);

// ───────────── 결의: 출혈·보호막·촉수·약화를 방패로 받고, 총잡이에게 탄을 건넨다 ─────────────

reg.skills([
  skill({
    id: 'br-blood-scent',
    name: '피 냄새',
    icon: 'gi:fangs',
    school: 'resolve',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'counter'],
    makes: ['block', 'counter'],
    reads: ['bleed'],
    vals: { blk: [7, 10], counter: [3, 4] },
    desc: '방어도 {B:blk}, 반격 {counter} (다음 내 턴까지). 출혈 중인 적에게는 반격 피해 2배',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'counter', u.v('counter'), c.p);
      if (!c.over && !c.p.st['br-blood-scent']) c.apply(c.p, 'br-blood-scent', 1, c.p);
    },
  }),
  skill({
    id: 'br-rampart',
    name: '성벽',
    icon: 'gi:crenulated-shield',
    school: 'resolve',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'barrier'],
    makes: ['block'],
    reads: ['barrier'],
    vals: { blk: [8, 10] },
    desc: '방어도 {B:blk}. 내 보호막의 절반만큼 방어도 추가',
    // 남의 키워드는 읽기만 한다 (보호막은 남는다)
    run: (c, u) => void guard(c, u, u.v('blk') + Math.floor(((c.p.st.barrier ?? 0) / 2) * u.power)),
  }),
  skill({
    id: 'br-tentacle-wall',
    name: '촉수 방벽',
    icon: 'gi:interlaced-tentacles',
    school: 'resolve',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'tentacle'],
    makes: ['block'],
    reads: ['tentacle'],
    vals: { blk: [8, 10], per: [4, 5] },
    desc: '방어도 {B:blk}. 내 촉수 1개당 방어도 +{per}',
    run: (c, u) => void guard(c, u, u.v('blk') + Math.floor((c.p.st.tentacle ?? 0) * u.v('per') * u.power)),
  }),
  skill({
    id: 'br-overawe',
    name: '위압',
    icon: 'gi:angry-eyes',
    school: 'resolve',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block'],
    makes: ['block'],
    reads: ['expose'],
    vals: { blk: [7, 9], per: [3, 4] },
    desc: '방어도 {B:blk}. 약화나 취약 상태인 적 1명당 방어도 +{per}',
    run: (c, u) => void guard(c, u, u.v('blk') + Math.floor(c.alive.filter(exposed).length * u.v('per') * u.power)),
  }),
  skill({
    id: 'br-regroup',
    name: '전열 정비',
    icon: 'gi:ammo-box',
    school: 'resolve',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'ammo', 'aim'],
    makes: ['block', 'ammo', 'aim'],
    reads: [],
    vals: { blk: [7, 9], ammo: 2, aim: 1 },
    desc: '방어도 {B:blk}, 탄약 +{ammo}, 조준 {aim}',
    run: (c, u) => {
      guard(c, u);
      if (c.over) return;
      c.s.ammo = Math.min(c.s.maxAmmo, c.s.ammo + u.v('ammo'));
      // 메아리 사본은 조준을 더 주지 않는다
      if (!u.echo) c.apply(c.p, 'aim', u.v('aim'), c.p);
    },
  }),
]);

// ───────────── 금기: 화상을 파멸로, 보호막을 공허로 ─────────────

reg.skills([
  skill({
    id: 'br-void-mirror',
    name: '공허 반사',
    icon: 'gi:mirror-mirror',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe', 'sanity', 'barrier'],
    makes: ['sanity'],
    reads: ['barrier'],
    vals: { dmg: [7, 9], pct: [50, 75], san: 2 },
    desc: '정신력 {san} 소모. 적 전체에 {D:dmg} 공허 피해. 내 보호막의 {pct}%만큼 피해 추가',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      if (c.over) return;
      // 보호막 비례 피해도 위력(메아리·절약 각인)을 따른다 (보호막은 그대로 남는다)
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(((c.p.st.barrier ?? 0) * u.v('pct') * u.power) / 100) });
    },
  }),
  skill({
    id: 'br-crumbling',
    name: '무너지는 자',
    icon: 'gi:broken-skull',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'sanity', 'doom'],
    makes: ['doom', 'sanity'],
    reads: ['burn'],
    vals: { dmg: [10, 13], doom: [10, 14], san: 2 },
    desc: '정신력 {san} 소모. {D:dmg} 공허 피해. 대상이 화상 중이면 파멸 {doom}',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      if (!t || c.over) return;
      hit(c, u, t);
      if (alive(t) && !c.over && (t.st.burn ?? 0) > 0) c.apply(t, 'doom', u.v('doom'), c.p);
    },
  }),
]);
