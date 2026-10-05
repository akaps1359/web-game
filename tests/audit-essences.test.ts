import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat } from '../src/engine/combat';
import { ESSENCES, SKILLS } from '../src/engine/registry';
import { absorbEssence, newRun, removeEssence, type RunState } from '../src/engine/run';
import type { EncounterDef, EnemyUnit } from '../src/engine/types';

/**
 * 정수 감사: 설명(패시브·액티브)이 실제 동작과 맞는지, 흡수·사용·제거가 깨지지 않는지.
 * 보스(수호자·계층군주)와 균열 수호자의 정수는 항상 '수호자 정수'로 떨어진다 → 패시브 훅의 s.n = 2.
 */

type Drop = { id: string; color?: number; guardian?: boolean };

const FRONT_BACK: EncounterDef['enemies'] = [
  { id: 'thug', row: 0 },
  { id: 'drowned', row: 0 },
  { id: 'gulls', row: 1 },
  { id: 'lurker', row: 1 },
];

/** 튼튼한 주인공 + 정수 흡수 */
function hero(drops: Drop[], seed = 7): RunState {
  const run = newRun({ seed, origin: 'soldier' });
  run.player.level = 40;
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.gold = 999999;
  for (const d of drops) expect(absorbEssence(run, { color: 0, ...d }), d.id).toBeNull();
  return run;
}

/** 아무것도 하지 않는(기절한) 튼튼한 적들과 전투 */
function fight(run: RunState, enemies: EncounterDef['enemies'] = FRONT_BACK, opts: { calm?: boolean } = {}): Combat {
  // 처음 본 존재의 공포(정신 피해)가 패시브 측정에 끼어들지 않게
  for (const e of enemies) if (!run.seen.includes(e.id)) run.seen.push(e.id);
  const c = Combat.begin(run, { id: 'audit-essences', act: 1, kind: 'normal', enemies });
  for (const e of c.s.enemies) tough(e, opts.calm ?? true);
  return c;
}

function tough(e: EnemyUnit, calm = true) {
  e.hp = e.maxHp = 99999;
  e.block = 0;
  e.resist = {};
  e.maxPoise = e.poise = 0;
  if (calm) e.st.stun = 999;
}

/** 스킬을 슬롯에 넣고 행동력·대기를 채운 뒤 사용 */
function use(c: Combat, run: RunState, skillId: string, target?: string | null, slot = 0): string | null {
  const owned = run.skills.find((s) => s.id === skillId);
  if (!owned) throw new Error(`배우지 않은 스킬 ${skillId}`);
  if (!run.slots.includes(owned.uid)) run.slots[slot] = owned.uid;
  c.s.ap = 99;
  delete c.s.cd[owned.uid];
  return c.useSkill(owned.uid, target);
}

const uidOf = (run: RunState, skillId: string) => run.skills.find((s) => s.id === skillId)!.uid;
const passive = (id: string) => ESSENCES.get(id)!.passive.desc;

// ───────────── 코드 버그 ─────────────

describe('정수 감사 — 코드 버그', () => {
  it('되감기는 전투당 1회 기술의 대기를 초기화하지 않는다', () => {
    const run = hero([
      { id: 'bellkeeper', guardian: true },
      { id: 'time-warden', guardian: true },
    ]);
    const c = fight(run);
    expect(use(c, run, 'ess-bellkeeper-last', null, 0)).toBeNull();
    const last = uidOf(run, 'ess-bellkeeper-last');
    c.endTurn(); // 다음 턴 — 대기 99 → 98
    expect(c.s.cd[last]).toBe(98);
    expect(use(c, run, 'ess-time-warden-rewind', null, 1)).toBeNull();
    expect(c.s.cd[last] ?? 0).toBeGreaterThan(90);
    expect(c.blockReason(last)).not.toBeNull();
  });

  it('되감기는 대기 중인 보통 기술은 초기화한다', () => {
    const run = hero([
      { id: 'time-warden', guardian: true },
      { id: 'thug', color: 0 },
    ]);
    const c = fight(run);
    expect(use(c, run, 'ess-thug-pipe', c.row(0)[0].uid, 0)).toBeNull();
    const pipe = uidOf(run, 'ess-thug-pipe');
    expect(c.s.cd[pipe]).toBeGreaterThan(0);
    expect(use(c, run, 'ess-time-warden-rewind', null, 1)).toBeNull();
    expect(c.s.cd[pipe]).toBeUndefined();
  });

  it('시간 표류(이스의 방랑자)는 전투당 1회 기술의 대기를 줄이지 않는다', () => {
    const run = hero([
      { id: 'bellkeeper', guardian: true },
      { id: 'yith-wanderer', color: 0 },
    ]);
    const c = fight(run);
    expect(use(c, run, 'ess-bellkeeper-last', null, 0)).toBeNull();
    const last = uidOf(run, 'ess-bellkeeper-last');
    c.endTurn();
    c.endTurn();
    expect(c.s.cd[last]).toBe(97);
  });

  it('무리 근성(시궁쥐 떼)은 여러 번 타격하는 모든 스킬에 붙는다 (multi 태그가 없어도)', () => {
    const run = hero([{ id: 'rats', color: 0 }]);
    const c = fight(run);
    const e = c.row(0)[0];
    const bare = hero([]);
    const c0 = fight(bare);
    const e0 = c0.row(0)[0];
    // 출신이 주는 조준(관통 2배) 등은 빼고 비교
    c.p.st = {};
    c0.p.st = {};
    for (const def of SKILLS.values()) {
      const h = def.vals.hits;
      const hits = Array.isArray(h) ? h[0] : (h ?? 0);
      if (hits <= 1) continue;
      const owned = { uid: 'x', id: def.id, lvl: 0, runes: [] };
      const withRats = c.preview(c.p, e, 10, def.type ?? 'blunt', { skill: c.makeUse({ def, owned }) }) - c.p.str;
      const without = c0.preview(c0.p, e0, 10, def.type ?? 'blunt', { skill: c0.makeUse({ def, owned }) }) - c0.p.str;
      expect(withRats - without, def.id).toBe(1);
    }
  });

  it('썰매개의 목덜미 물기는 여러 번 타격하는 스킬이다 (multi 태그)', () => {
    expect(SKILLS.get('ess-sled-dog-nape')!.tags).toContain('multi');
  });
});

// ───────────── 설명과 동작이 같은지 ─────────────

describe('정수 감사 — 굳건함 설명', () => {
  for (const [id, skillId] of [
    ['dhole', 'ess-dhole-burrow'],
    ['sleepwalker', 'ess-sleepwalker-dream'],
    ['crab', 'ess-crab-shell'],
    ['star-fetus', 'ess-star-fetus-shell'],
    ['cradle-warden', 'ess-cradle-warden-wall'],
  ] as const) {
    it(`${skillId}: 설명한 턴 수만큼 방어도가 유지된다`, () => {
      const run = hero([{ id, guardian: true }]);
      const c = fight(run);
      c.p.block = 0;
      expect(use(c, run, skillId)).toBeNull();
      const def = SKILLS.get(skillId)!;
      const turns = (def.vals.retain as number | undefined) ?? 1;
      if (turns === 1) expect(def.desc).toContain('다음 턴까지 방어도 유지');
      else expect(def.desc).toContain('{retain}턴 동안 방어도 유지');
      const blk = c.p.block;
      expect(blk).toBeGreaterThan(0);
      for (let i = 0; i < turns; i++) {
        c.endTurn();
        expect(c.p.block, `${i + 1}턴 뒤`).toBe(blk);
      }
      c.endTurn();
      expect(c.p.block).toBe(0);
    });
  }
});

describe('정수 감사 — 수호자 정수 패시브 수치 (s.n = 2)', () => {
  const kill = (c: Combat) => c.kill(c.alive[0]);

  it('심해 혼혈: 턴 종료 시 체력 2 회복', () => {
    expect(passive('fisherman')).toContain('체력 2 회복');
    const run = hero([{ id: 'fisherman', guardian: true }]);
    const c = fight(run);
    c.p.hp = 100;
    c.endTurn();
    expect(c.p.hp).toBe(102);
  });

  it('대사제: 처치할 때마다 힘 +2', () => {
    expect(passive('high-priest')).toContain('힘 +2');
    const run = hero([{ id: 'high-priest', guardian: true }]);
    const c = fight(run);
    kill(c);
    expect(c.p.st.str).toBe(2);
  });

  it('구울 왕: 전투 시작 시 방어도 20', () => {
    expect(passive('ghoul-king')).toContain('방어도 20');
    const run = hero([{ id: 'ghoul-king', guardian: true }]);
    const c = fight(run);
    expect(c.p.block).toBe(20);
  });

  it('재에 묻힌 것 / 별의 자손 군주: 조수 1단계당 공격 피해 +2', () => {
    expect(passive('ash-buried')).toContain('+2');
    expect(passive('starspawn-lord')).toMatch(/\+2 \(최대 \+8\)/);
    for (const id of ['ash-buried', 'starspawn-lord']) {
      const run = hero([{ id, guardian: true }]);
      const c = fight(run);
      const e = c.alive[0];
      const at = (tide: number) => {
        run.floor!.tide = tide;
        return c.preview(c.p, e, 10, 'void');
      };
      expect(at(1) - at(0), id).toBe(2);
      if (id === 'starspawn-lord') expect(at(9) - at(0)).toBe(8);
    }
  });

  it('종지기: 3번째 턴마다 적 전체에 비전 피해 12, 약화 1', () => {
    expect(passive('bellkeeper')).toContain('비전 피해 12');
    const run = hero([{ id: 'bellkeeper', guardian: true }]);
    const c = fight(run);
    const hp = c.alive.map((e) => e.hp);
    c.endTurn();
    c.endTurn();
    expect(c.s.turn).toBe(3);
    c.alive.forEach((e, i) => expect(hp[i] - e.hp).toBe(12));
  });

  it('거꾸로 된 성인: 쓰러질 피해를 받으면 체력 24로 버틴다', () => {
    expect(passive('inverted-saint')).toContain('체력 24');
    const run = hero([{ id: 'inverted-saint', guardian: true }]);
    const c = fight(run);
    c.loseHp(c.p, 999999);
    expect(c.p.hp).toBe(24);
  });

  it('쇼고스: 턴 종료 시 체력 4 회복', () => {
    expect(passive('shoggoth')).toContain('체력 4 회복');
    const run = hero([{ id: 'shoggoth', guardian: true }]);
    const c = fight(run);
    c.p.hp = 100;
    c.endTurn();
    expect(c.p.hp).toBe(104);
  });

  it('각도의 왕: 매 턴 첫 공격 피해 +8', () => {
    expect(passive('angle-king')).toContain('+8');
    const run = hero([{ id: 'angle-king', guardian: true }]);
    const c = fight(run);
    expect(c.preview(c.p, c.alive[0], 10, 'slash') - 10 - c.p.str).toBe(8);
  });

  it('산맥 너머의 것: 정신력을 잃은 만큼 방어도 (전투마다 최대 60)', () => {
    expect(passive('beyond-peaks')).toContain('최대 60');
    const run = hero([{ id: 'beyond-peaks', guardian: true }]);
    const c = fight(run);
    c.p.block = 0;
    c.loseSanity(500);
    expect(c.p.block).toBe(60);
  });

  it('문 너머의 존재 / 별의 태아: 전투 시작 시 보호막 16 / 20', () => {
    expect(passive('beyond-gate')).toContain('보호막 16');
    expect(passive('star-fetus')).toContain('보호막 20');
    expect(fight(hero([{ id: 'beyond-gate', guardian: true }])).p.st.barrier).toBe(16);
    const c = fight(hero([{ id: 'star-fetus', guardian: true }]));
    expect(c.p.st.barrier).toBe(20);
    expect(c.p.st.ward).toBe(1);
  });

  it('검은 파라오: 전투 시작 시 파멸 10 (+4 = 14), 내가 거는 파멸 +4', () => {
    expect(passive('black-pharaoh')).toContain('파멸 10');
    expect(passive('black-pharaoh')).toContain('파멸 +4');
    const run = hero([{ id: 'black-pharaoh', guardian: true }]);
    const c = fight(run);
    for (const e of c.alive) expect(e.st.doom).toBe(14);
  });

  it('검은 별: 전투 시작 시 의식 2', () => {
    expect(passive('black-star')).toContain('의식 2');
    const c = fight(hero([{ id: 'black-star', guardian: true }]));
    expect(c.p.st.ritual).toBe(2);
  });

  it('사냥하는 공포: 등불 50 미만이면 공격 피해 +6, 이상이면 방어도 8', () => {
    expect(passive('hunting-horror')).toContain('+6');
    expect(passive('hunting-horror')).toContain('방어도 8');
    const run = hero([{ id: 'hunting-horror', guardian: true }]);
    run.light = 100;
    const c = fight(run);
    expect(c.p.block).toBe(8);
    run.light = 20;
    expect(c.preview(c.p, c.alive[0], 10, 'slash') - 10 - c.p.str).toBe(6);
  });

  it('꿈을 먹는 자: 처치할 때마다 정신력 +8, 체력 8 회복', () => {
    expect(passive('dream-eater')).toContain('정신력 +8');
    expect(passive('dream-eater')).toContain('체력 8 회복');
    const run = hero([{ id: 'dream-eater', guardian: true }]);
    const c = fight(run);
    c.p.hp = 100;
    c.p.sanity = 100;
    kill(c);
    expect(c.p.hp).toBe(108);
    expect(c.p.sanity).toBe(108);
  });

  it('문턱의 존재: 턴에 맞는 속성 공격 피해 +40%', () => {
    expect(passive('liminal')).toContain('+40%');
    const run = hero([{ id: 'liminal', guardian: true }]);
    const c = fight(run);
    expect(c.s.turn % 2).toBe(1);
    expect(c.preview(c.p, c.alive[0], 100 - c.p.str, 'slash')).toBe(140);
    expect(c.preview(c.p, c.alive[0], 100 - c.p.str, 'fire')).toBe(100);
  });
});

// ───────────── 흡수 · 사용 · 제거 ─────────────

const STAT_KEYS = ['maxHp', 'str', 'dex', 'will', 'maxSanity', 'insight'] as const;
const statsOf = (run: RunState) => Object.fromEntries(STAT_KEYS.map((k) => [k, run.player[k]])) as Record<(typeof STAT_KEYS)[number], number>;

describe('정수 감사 — 모든 정수 흡수·사용·제거', () => {
  it('색마다 흡수할 수 있고 그 색의 액티브를 배운다', () => {
    for (const es of ESSENCES.values()) {
      es.actives.forEach((a, color) => {
        const run = hero([{ id: es.id, color }]);
        expect(run.skills.some((s) => s.id === a), `${es.id} ${color}`).toBe(true);
      });
    }
  });

  it('대상이 첫 타격에 쓰러지거나 적이 하나뿐이어도 모든 액티브가 깨지지 않는다', () => {
    for (const es of ESSENCES.values()) {
      for (const a of es.actives) {
        for (const enemies of [FRONT_BACK, [{ id: 'thug', row: 0 as const }]]) {
          const run = hero([{ id: es.id, guardian: true }]);
          const c = fight(run, enemies, { calm: false });
          for (const e of c.s.enemies) e.hp = 1;
          if (enemies.length > 1) c.kill(c.s.enemies[0]); // 시체 하나
          const def = SKILLS.get(a)!;
          const t = def.target === 'single' ? c.validTargets(def)[0]?.uid : null;
          const why = use(c, run, a, t);
          expect(why === null || typeof why === 'string', a).toBe(true);
          if (!c.over) c.endTurn();
        }
      }
    }
  });

  it('모든 액티브를 전열·후열 적에게 써도 깨지지 않고, 제거하면 스탯이 돌아온다', () => {
    for (const es of ESSENCES.values()) {
      const run = newRun({ seed: 99, origin: 'soldier' });
      run.player.level = 40;
      run.player.gold = 999999;
      run.player.maxHp = run.player.hp = 9999;
      run.player.sanity = run.player.maxSanity = 9999;
      const before = statsOf(run);
      expect(absorbEssence(run, { id: es.id, color: 0, guardian: true }), es.id).toBeNull();
      const owned = run.essences.find((x) => x.id === es.id)!;
      const learned = run.skills.filter((s) => s.from === owned.uid);
      expect(learned.map((s) => s.id).sort(), es.id).toEqual([...es.actives].sort());

      const c = fight(run, [...FRONT_BACK, { id: 'rats', row: 1 }], { calm: false });
      // 시체 하나 (시체를 먹는 기술용)
      c.kill(c.row(1)[c.row(1).length - 1]);
      learned.forEach((s, i) => (run.slots[i] = s.uid));
      for (const s of learned) {
        const def = SKILLS.get(s.id)!;
        const targets = def.target === 'single' ? c.validTargets(def).map((e) => e.uid) : [null];
        // 근접 기술이면 후열을 고를 수 없다 — 대신 후열이 비었을 때를 시험
        let ok = 0;
        for (const t of targets) {
          if (c.over) break;
          c.s.ap = 99;
          delete c.s.cd[s.uid];
          const why = c.useSkill(s.uid, t);
          if (why === null) ok++;
          else expect(typeof why, `${s.id}: ${why}`).toBe('string');
        }
        expect(ok, `${s.id}을(를) 한 번도 쓰지 못했다`).toBeGreaterThan(0);
        for (const e of c.alive) if (e.hp < 1000) tough(e, false);
      }
      expect(c.over, es.id).toBe(false);
      for (let i = 0; i < 4 && !c.over; i++) c.endTurn();
      // 되살아나는 적(익사체 등)이 있으니 모두 쓰러질 때까지
      for (let i = 0; i < 10 && c.alive.length; i++) for (const e of [...c.alive]) c.kill(e);
      c.endTurn(); // 승리 판정 (onCombatEnd 패시브까지)
      expect(c.s.phase, es.id).toBe('victory');

      // 제거 (계층정수는 무료 교체 경로로만 지울 수 있다)
      expect(removeEssence(run, owned.uid, !!es.lord), es.id).toBeNull();
      expect(run.skills.some((s) => s.from === owned.uid), es.id).toBe(false);
      expect(run.slots.some((u) => learned.some((s) => s.uid === u)), es.id).toBe(false);
      const after = statsOf(run);
      for (const k of ['maxHp', 'str', 'dex', 'will'] as const) expect(after[k], `${es.id} ${k}`).toBe(before[k]);
      if (!es.lord) {
        expect(after.maxSanity, `${es.id} maxSanity`).toBe(before.maxSanity);
        // 이계 정수의 통찰 +1은 흡수의 대가로 남는다
        expect(after.insight, `${es.id} insight`).toBe(before.insight + (es.eldritch ? 1 : 0));
      }
    }
  });
});
