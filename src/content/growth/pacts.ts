import { isEnemy } from '../../engine/combat';
import { reg } from '../../engine/registry';

/*
 * 계약 (2026-10 성장 개편, engine/growth.ts): 하데스 혼돈의 축복처럼 — 저주를 GROWTH.pactFights전투 견디면 그 뒤로 축복이 영원히.
 * 신전의 제단과 이벤트(심연의 공증인)에서 저주와 축복의 짝을 둘 내밀고, 하나를 맺거나 둘 다 물린다.
 * 저주는 이긴 전투마다 하나씩 준다 (engine/run.ts finishCombat → tickPacts). 축복은 같은 것을 두 번 맺지 못한다
 */
reg.pacts([
  // ── 저주 (계약이 이루어지기 전까지) ──
  {
    id: 'curse-frail',
    kind: 'curse',
    name: '쇠약',
    icon: 'gi:broken-heart',
    desc: '주는 피해 -15%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (d.src === c.p && d.tgt !== c.p) d.mult *= 0.85;
      },
    },
  },
  {
    id: 'curse-exposed',
    kind: 'curse',
    name: '노출',
    icon: 'gi:shattered-glass',
    desc: '적의 공격으로 받는 피해 +20%',
    hooks: {
      modDamageIn(c, _s, d) {
        if (d.tgt === c.p && isEnemy(d.src) && d.attack) d.mult *= 1.2;
      },
    },
  },
  {
    id: 'curse-sluggish',
    kind: 'curse',
    name: '굼뜸',
    icon: 'gi:snail',
    desc: '전투 첫 턴 행동력 -1',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn === 1) c.s.ap = Math.max(1, c.s.ap - 1);
      },
    },
  },
  {
    id: 'curse-bleeding',
    kind: 'curse',
    name: '새는 피',
    icon: 'gi:heart-drop',
    desc: '내 턴이 시작될 때 체력 2를 잃는다',
    hooks: {
      onTurnStart(c) {
        c.loseHp(c.p, 2, 'curse');
      },
    },
  },
  {
    id: 'curse-dread',
    kind: 'curse',
    name: '불길한 예감',
    icon: 'gi:screaming',
    desc: '전투 시작 시 정신력 -5',
    hooks: {
      onCombatStart(c) {
        c.loseSanity(5);
      },
    },
  },
  {
    id: 'curse-stubborn',
    kind: 'curse',
    name: '완고한 적',
    icon: 'gi:stone-wall',
    desc: '전투 시작 시 버팀이 있는 모든 적의 버팀 +2',
    hooks: {
      onCombatStart(c) {
        for (const e of c.alive) {
          if (e.maxPoise <= 0) continue;
          e.maxPoise += 2;
          e.poise += 2;
        }
      },
    },
  },
  // ── 축복 (저주를 다 견딘 뒤로 영원히) ──
  {
    id: 'boon-vigor',
    kind: 'boon',
    name: '강건함',
    icon: 'gi:heart-plus',
    desc: '최대 체력 +12',
    onGain(run) {
      run.player.maxHp += 12;
      run.player.hp += 12;
    },
  },
  {
    id: 'boon-might',
    kind: 'boon',
    name: '완력',
    icon: 'gi:muscle-up',
    desc: '힘 +1',
    onGain(run) {
      run.player.str += 1;
    },
  },
  {
    id: 'boon-agility',
    kind: 'boon',
    name: '날렵함',
    icon: 'gi:feathered-wing',
    desc: '민첩 +1',
    onGain(run) {
      run.player.dex += 1;
    },
  },
  {
    id: 'boon-will',
    kind: 'boon',
    name: '강철 의지',
    icon: 'gi:brain',
    desc: '의지 +1 (받는 정신 피해 -5%)',
    onGain(run) {
      run.player.will += 1;
    },
  },
  {
    id: 'boon-guard',
    kind: 'boon',
    name: '보호',
    icon: 'gi:shield-echoes',
    desc: '전투 첫 턴 방어도 10',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn === 1) c.gainBlock(c.p, 10);
      },
    },
  },
  {
    id: 'boon-keen',
    kind: 'boon',
    name: '예리함',
    icon: 'gi:sharp-smile',
    desc: '약점을 찌르는 공격 피해 +10%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (d.src === c.p && d.attack && isEnemy(d.tgt) && d.type !== 'true' && d.tgt.weak.includes(d.type) && (!c.previewing || d.tgt.known.includes(d.type))) d.mult *= 1.1;
      },
    },
  },
  {
    id: 'boon-breaker',
    kind: 'boon',
    name: '파쇄',
    icon: 'gi:hammer-break',
    desc: '적을 붕괴시키면 방어도 6',
    hooks: {
      onBreak(c) {
        c.gainBlock(c.p, 6);
      },
    },
  },
  {
    id: 'boon-wealth',
    kind: 'boon',
    name: '풍요',
    icon: 'gi:gold-bar',
    desc: '적이 쓰러질 때마다 골드 +4 (하수인 제외)',
    hooks: {
      onKill(c, _s, victim) {
        if (!victim.minion) c.run.player.gold += 4;
      },
    },
  },
  {
    id: 'boon-mend',
    kind: 'boon',
    name: '아묾',
    icon: 'gi:healing',
    desc: '전투에서 이기면 체력 5 회복',
    hooks: {
      onCombatEnd(c, _s, won) {
        if (won) c.heal(c.p, 5);
      },
    },
  },
]);
