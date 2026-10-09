import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import type { EnemyUnit } from '../../engine/types';
import { guard, hit, needAmmo, skill, spendAmmo } from '../lib';

/**
 * 계열 기술 보강 (2026-10): 계열마다 하나씩, 깊은 층의 장치(가호·변이·각성·붕괴 내성)와 맞물리는 것들.
 *  - 상처 벌리기(검술, 흔함): 출혈이 버팀을 깎는다 — 출혈 덱의 붕괴 수단
 *  - 저지 사격(사격, 고급): 힘을 모으는 적(차지·심연 모으기)의 버팀을 크게 깎는다 — 큰 공격 끊기
 *  - 연쇄 반응(연금, 희귀): 모든 적의 출혈·독·화상이 한 번 더 돈다 — 검술의 출혈을 읽는 글루 (남의 키워드는 읽기만, 수치를 줄이지 않는다)
 *  - 결계 찢기(비술, 고급): 결계(봉인 문양 변이·각성한 수호자)를 모두 찢고 그만큼 인장
 *  - 철벽의 맹세(결의, 희귀): 다음 내 턴까지 적의 공격으로 잃는 체력에 상한 — 나의 가호
 *  - 광기의 계시(금기): 지닌 광기만큼 세지는 공허 — 광기를 끌어안는 판
 * 모두 행동력·재사용 대기를 돌려주지 않는다. 추가 피해·방어도는 위력(메아리·절약 각인)을 따른다.
 * id는 'ar-' 접두사, 상태 id도 'ar-', 전투 vars 키는 'ar:'.
 */

const alive = (e: EnemyUnit | null | undefined): e is EnemyUnit => !!e && !e.dead && e.hp > 0;

/**
 * 큰 공격을 앞두고 힘을 모으는 중인가: 의도가 준비(차지)이거나, 모은 힘을 아직 터뜨리지 않았다
 * (moves.ts mv.charge의 mem.charge, 각성한 수호자가 심연을 모은 mem.abc — content/depth.ts). 붕괴하면 둘 다 풀린다
 */
export function gathering(e: EnemyUnit): boolean {
  const it = e.intent;
  return !!it?.charging || it?.kind === 'charge' || !!e.mem.charge || !!e.mem.abc;
}

// ───────────── 상태 ─────────────

/** 철벽의 맹세: 수치 = 이번에 잃을 수 있는 체력의 합. 잃은 몫은 전투 vars에 센다 */
export const VOW = 'ar-vow';
const VOW_LOST = 'ar:vow';

reg.statuses([
  {
    id: VOW,
    name: '맹세',
    icon: 'gi:locked-fortress',
    kind: 'buff',
    desc: '다음 내 턴이 올 때까지 적의 공격으로 잃는 체력은 모두 합쳐 {n}까지',
    hooks: {
      // 방어도·보호막이 먼저 막고, 그 뒤 체력으로 들어가는 몫이 남은 한도를 넘지 않게 (미리보기도 같은 숫자 — 상태는 바꾸지 않는다)
      modDamageFinal(c, s, d) {
        if (d.tgt !== s.unit || !d.attack || !isEnemy(d.src)) return;
        const left = Math.max(0, s.n - (c.s.vars[VOW_LOST] ?? 0));
        const soak = d.ignoreBlock ? 0 : s.unit.block + (s.unit.st.barrier ?? 0);
        d.cap = d.cap === undefined ? left + soak : Math.min(d.cap, left + soak);
      },
      onDamageTaken(c, s, d) {
        if (d.tgt !== s.unit || !d.attack || !isEnemy(d.src) || d.hpLoss <= 0) return;
        c.s.vars[VOW_LOST] = (c.s.vars[VOW_LOST] ?? 0) + d.hpLoss;
      },
    },
    tickStart(c, u) {
      if (!isEnemy(u)) delete c.s.vars[VOW_LOST];
      c.clear(u, VOW);
    },
  },
]);

// ───────────── 기술 ─────────────

reg.skills([
  // ── 검술 ──
  skill({
    id: 'ar-open-wound',
    name: '상처 벌리기',
    icon: 'gi:ragged-wound',
    school: 'blade',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed'],
    makes: [],
    reads: ['bleed'],
    vals: { dmg: [7, 9], per: [4, 3], max: 2 },
    desc: '{D:dmg} 참격 피해. 대상의 출혈 {per}당 버팀 추가 -1 (최대 {max})',
    run: (c, u, t) => {
      // 출혈은 그대로 남는다 (혈류 폭발이 쓸 것을 빼앗지 않는다)
      const bleed = t?.st.bleed ?? 0;
      hit(c, u, t, { poise: Math.min(u.v('max'), Math.floor(bleed / Math.max(1, u.v('per')))) });
    },
  }),

  // ── 사격 ──
  skill({
    id: 'ar-stopping-shot',
    name: '저지 사격',
    icon: 'gi:on-target',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun'],
    makes: [],
    reads: ['ammo'],
    vals: { dmg: [8, 10], poise: 1, bonus: [2, 3] },
    desc: '탄약 1: {D:dmg} 관통 피해, 버팀 추가 -{poise}. 대상이 힘을 모으는 중이면 버팀 추가 -{bonus} 더',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      hit(c, u, t, { poise: u.v('poise') + (t && gathering(t) ? u.v('bonus') : 0) });
    },
  }),

  // ── 연금 ──
  skill({
    id: 'ar-chain-reaction',
    name: '연쇄 반응',
    icon: 'gi:boiling-bubbles',
    school: 'alchemy',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'fire',
    tags: ['attack', 'aoe', 'bleed', 'poison', 'burn'],
    makes: [],
    reads: ['bleed', 'poison', 'burn'],
    vals: { dmg: [4, 6] },
    desc: '적 전체에 {D:dmg} 화염 피해. 그 뒤 모든 적의 출혈·독·화상이 한 번 더 피해를 준다 (수치는 줄지 않는다)',
    run: (c, u, t) => {
      hit(c, u, t);
      // 자기 차례가 시작될 때 도는 지속 피해와 같은 피해 (독은 방어도를 무시한다). 수치는 그대로 — 출혈은 검술의 것이라 읽기만 한다
      for (const e of [...c.alive]) {
        for (const k of ['bleed', 'poison', 'burn'] as const) {
          if (c.over || !alive(e)) break;
          // 위력(메아리·절약 각인)을 따른다
          const n = Math.floor((e.st[k] ?? 0) * u.power);
          if (n > 0) c.damage({ src: null, tgt: e, base: n, type: 'true', ignoreBlock: k === 'poison', tags: ['dot', k] });
        }
      }
    },
  }),

  // ── 비술 ──
  skill({
    id: 'ar-ward-rend',
    name: '결계 찢기',
    icon: 'gi:breaking-chain',
    school: 'occult',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark'],
    makes: ['mark'],
    reads: [],
    vals: { dmg: [8, 10], mark: 2, per: [2, 3] },
    desc: '대상의 결계를 모두 찢고 {D:dmg} 비전 피해, 인장 {mark}. 찢은 결계 1겹마다 인장 {per} 더',
    run: (c, u, t) => {
      if (!t) return;
      // 결계부터 찢는다 (인장이 결계에 막히지 않게)
      const ward = t.st.ward ?? 0;
      if (ward > 0) {
        c.apply(t, 'ward', -ward);
        c.emit({ t: 'text', uid: t.uid, text: '결계가 찢어졌다', tone: 'good' });
      }
      hit(c, u, t);
      if (alive(t) && !c.over) c.apply(t, 'mark', u.v('mark') + ward * u.v('per'), c.p);
    },
  }),

  // ── 결의 ──
  skill({
    id: 'ar-iron-vow',
    name: '철벽의 맹세',
    icon: 'gi:locked-fortress',
    school: 'resolve',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['block'],
    makes: ['block'],
    reads: [],
    vals: { blk: [6, 8], pct: [20, 15] },
    desc: '방어도 {B:blk}. 다음 내 턴이 올 때까지 적의 공격으로 잃는 체력은 모두 합쳐 최대 체력의 {pct}%까지',
    run: (c, u) => {
      guard(c, u);
      if (c.over) return;
      // 위력이 낮으면(메아리·절약 각인) 한도가 그만큼 느슨하다. 이미 맹세했으면 더 단단한 쪽만 남는다
      const cap = Math.max(1, Math.floor((c.p.maxHp * u.v('pct')) / 100 / Math.max(0.25, u.power)));
      const cur = c.p.st[VOW] ?? 0;
      if (!cur) c.apply(c.p, VOW, cap, c.p);
      else if (cap < cur) c.apply(c.p, VOW, cap - cur, c.p);
    },
  }),

  // ── 금기 ──
  skill({
    id: 'ar-mad-revelation',
    name: '광기의 계시',
    icon: 'gi:spiral-tentacle',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'sanity'],
    makes: ['sanity'],
    reads: [],
    vals: { dmg: [9, 12], per: [5, 7], san: 3 },
    desc: '정신력 {san} 소모. {D:dmg} + 지닌 광기 1개당 {per} 공허 피해',
    run: (c, u, t) => {
      // 정신력이 무너지며 얻은 광기도 이 일격에 실린다
      c.loseSanity(u.v('san'));
      if (!t || c.over) return;
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(u.v('per') * c.run.madness.length * u.power) });
    },
  }),
]);
