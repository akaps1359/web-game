import { isEnemy, type Combat } from '../../engine/combat';
import { reg } from '../../engine/registry';
import type { DamageCtx, EnemyUnit } from '../../engine/types';
import { aegisCap } from '../depth';

/*
 * 장비 접사 (2026-10 성장 개편, engine/growth.ts): 장비를 얻을 때 층에 따라 붙는 무작위 특성 — 디아블로·데드 셀의 접사처럼
 * 같은 사냥칼이라도 판마다 다르게. 깊은 층의 장비일수록 많이(1층 0.3개 → 5층 1.8개), 3층부터 2단계 접사(깊은 층의 장치를 다루는 것)가 섞인다.
 * 이름은 장비 이름 앞에 붙는 말 (예: '날선 사냥칼'). 장착한 동안 훅이 돈다 (HookSelf.kind 'affix', n = 장비 강화 단계)
 */

/** 이 내 공격이 적에게 가는가 (미리보기 포함) */
const mine = (c: Combat, d: DamageCtx): d is DamageCtx & { tgt: EnemyUnit } => d.src === c.p && d.attack && isEnemy(d.tgt);

/** 이번 턴에 이 접사가 이미 움직였는가 (한 턴에 한 번) */
function once(c: Combat, key: string): boolean {
  if (c.s.vars[key] === c.s.turn) return false;
  c.s.vars[key] = c.s.turn;
  return true;
}

reg.affixes([
  // ── 1단계 ──
  {
    id: 'aff-keen',
    name: '날선',
    icon: 'gi:sharp-axe',
    tier: 1,
    slots: ['weapon'],
    desc: '약점을 찌르는 공격 피해 +15%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (mine(c, d) && d.type !== 'true' && d.tgt.weak.includes(d.type) && (!c.previewing || d.tgt.known.includes(d.type))) d.mult *= 1.15;
      },
    },
  },
  {
    id: 'aff-heavy',
    name: '묵직한',
    icon: 'gi:hammer-break',
    tier: 1,
    slots: ['weapon'],
    desc: '붕괴한 적에게 주는 공격 피해 +20%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (mine(c, d) && d.tgt.broken > 0) d.mult *= 1.2;
      },
    },
  },
  {
    id: 'aff-bleed',
    name: '피를 부르는',
    icon: 'gi:bleeding-wound',
    tier: 1,
    slots: ['weapon'],
    desc: '매 턴 처음 적중한 공격이 출혈 2를 남긴다',
    hooks: {
      onDamageDealt(c, _s, d) {
        if (mine(c, d) && d.amount > 0 && !d.tgt.dead && once(c, 'aff-bleed')) c.apply(d.tgt, 'bleed', 2, c.p);
      },
    },
  },
  {
    id: 'aff-burn',
    name: '그을린',
    icon: 'gi:flaming-arrow',
    tier: 1,
    slots: ['weapon'],
    desc: '매 턴 처음 적중한 공격이 화상 2를 남긴다',
    hooks: {
      onDamageDealt(c, _s, d) {
        if (mine(c, d) && d.amount > 0 && !d.tgt.dead && once(c, 'aff-burn')) c.apply(d.tgt, 'burn', 2, c.p);
      },
    },
  },
  {
    id: 'aff-vamp',
    name: '흡혈의',
    icon: 'gi:vampire-dracula',
    tier: 1,
    slots: ['weapon', 'trinket'],
    desc: '적을 쓰러뜨리면 체력 4 회복 (하수인 제외)',
    hooks: {
      onKill(c, _s, victim) {
        if (!victim.minion) c.heal(c.p, 4);
      },
    },
  },
  {
    id: 'aff-guard',
    name: '굳센',
    icon: 'gi:checked-shield',
    tier: 1,
    slots: ['armor', 'trinket'],
    desc: '전투 첫 턴 방어도 +8',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn === 1) c.gainBlock(c.p, 8);
      },
    },
  },
  {
    id: 'aff-steady',
    name: '단단한',
    icon: 'gi:stone-block',
    tier: 1,
    slots: ['armor'],
    desc: '내 턴이 끝날 때 방어도 3',
    hooks: {
      onTurnEnd(c) {
        c.gainBlock(c.p, 3);
      },
    },
  },
  {
    id: 'aff-thorn',
    name: '가시 돋친',
    icon: 'gi:thorny-tentacle',
    tier: 1,
    slots: ['armor'],
    desc: '근접 공격을 받으면 공격자에게 3 피해',
    hooks: {
      onDamageTaken(c, _s, d) {
        if (d.tgt === c.p && d.melee && d.attack && isEnemy(d.src) && !d.src.dead) c.damage({ src: c.p, tgt: d.src, base: 3, type: 'true', tags: ['thorns'] });
      },
    },
  },
  {
    id: 'aff-ward',
    name: '축성된',
    icon: 'gi:holy-symbol',
    tier: 1,
    slots: ['armor', 'trinket'],
    desc: '전투 시작 시 결계 1 (해로운 효과 1회 무효)',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'ward', 1, c.p);
      },
    },
  },
  {
    id: 'aff-calm',
    name: '차분한',
    icon: 'gi:meditation',
    tier: 1,
    slots: ['armor', 'trinket'],
    desc: '받는 정신 피해 -15%',
    hooks: {
      modSanityLoss(_c, _s, n) {
        return n * 0.85;
      },
    },
  },
  {
    id: 'aff-gold',
    name: '탐욕의',
    icon: 'gi:coins',
    tier: 1,
    slots: ['trinket'],
    desc: '적이 쓰러질 때마다 골드 +3 (하수인 제외)',
    hooks: {
      onKill(c, _s, victim) {
        if (!victim.minion) c.run.player.gold += 3;
      },
    },
  },
  {
    id: 'aff-sight',
    name: '꿰뚫는',
    icon: 'gi:third-eye',
    tier: 1,
    slots: ['trinket'],
    desc: '전투 시작 시 무작위 적 하나의 약점 하나가 드러난다',
    hooks: {
      onCombatStart(c) {
        const hidden = c.alive.filter((e) => e.weak.some((w) => !e.known.includes(w)));
        if (!hidden.length) return;
        const e = c.rng.pick(hidden);
        const w = c.rng.pick(e.weak.filter((x) => !e.known.includes(x)));
        e.known.push(w);
        c.emit({ t: 'reveal', uid: e.uid, dtype: w });
      },
    },
  },
  // ── 2단계 (3층부터: 깊은 층의 장치를 다룬다) ──
  {
    id: 'aff-abyss',
    name: '심연을 가르는',
    icon: 'gi:broadsword',
    tier: 2,
    slots: ['weapon'],
    desc: '가호를 지닌 적(3층부터의 정예·수호자)에게 주는 공격 피해 +15%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (mine(c, d) && aegisCap(d.tgt) > 0) d.mult *= 1.15;
      },
    },
  },
  {
    id: 'aff-purge',
    name: '정화의',
    icon: 'gi:holy-symbol',
    tier: 2,
    slots: ['weapon', 'trinket'],
    desc: '변이를 지닌 적에게 주는 공격 피해 +15%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (mine(c, d) && (d.tgt.affix?.length ?? 0) > 0) d.mult *= 1.15;
      },
    },
  },
  {
    id: 'aff-breaker',
    name: '부수는',
    icon: 'gi:shattered-glass',
    tier: 2,
    slots: ['weapon'],
    desc: '적을 붕괴시키면 그 적에게 피해 10',
    hooks: {
      onBreak(c, _s, victim) {
        if (!victim.dead) c.damage({ src: c.p, tgt: victim, base: 10, type: 'true', tags: ['affix'] });
      },
    },
  },
  {
    id: 'aff-quick',
    name: '날랜',
    icon: 'gi:running-ninja',
    tier: 2,
    slots: ['trinket'],
    desc: '전투 첫 턴 행동력 +1',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn === 1) c.s.ap += 1;
      },
    },
  },
  {
    id: 'aff-mend',
    name: '아무는',
    icon: 'gi:healing',
    tier: 2,
    slots: ['armor'],
    desc: '전투에서 이기면 체력 6 회복',
    hooks: {
      onCombatEnd(c, _s, won) {
        if (won) c.heal(c.p, 6);
      },
    },
  },
  {
    id: 'aff-tenacious',
    name: '끈질긴',
    icon: 'gi:weight-lifting-up',
    tier: 2,
    slots: ['weapon', 'trinket'],
    desc: '붕괴 내성이 쌓인 적의 버팀을 깎을 때, 턴마다 한 번 1 더 깎는다',
    hooks: {
      // 버팀 추가 감소로 (내 쪽 훅 — 적의 modPoiseLoss에는 내 장비가 닿지 않는다). 미리보기에서는 쓰지 않은 것으로 둔다
      modDamageOut(c, _s, d) {
        if (!mine(c, d) || !(d.tgt.st.tolerance ?? 0)) return;
        const key = `aff-tenacious:${d.tgt.uid}`;
        if (c.s.vars[key] === c.s.turn) return;
        d.poiseBonus += 1;
        if (!c.previewing) c.s.vars[key] = c.s.turn;
      },
    },
  },
]);
