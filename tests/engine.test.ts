import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES, ESSENCES, SKILLS, STATUSES, EQUIPS, RELICS, EVENTS, FLOORS } from '../src/engine/registry';
import { newRun, startCombat, finishCombat, absorbEssence, takeLoot, winRun, FINAL_ACT, type RunState } from '../src/engine/run';
import { advanceTime, enterRift, generateFloor, goHaven, moveTo, startGuardian } from '../src/engine/dungeon';
import { leaveHaven } from '../src/engine/places';
import { autoTurn } from '../src/sim/bot';

/** 테스트용: 그 층에 걸맞게 튼튼한 주인공 */
function sturdy(run: RunState, act: number) {
  run.player.maxHp = run.player.hp = 99999;
  run.player.sanity = run.player.maxSanity = 99999;
  run.player.str = (act - 1) * 4;
  run.player.maxAp = 3 + (act >= 3 ? 1 : 0);
}

const isSpecial = (id: string) => /^(lord|stalker|rift)/.test(id);

describe('콘텐츠 무결성', () => {
  it('조우의 적이 모두 존재', () => {
    for (const enc of ENCOUNTERS) for (const e of enc.enemies) expect(ENEMIES.has(e.id), `${enc.id}: ${e.id}`).toBe(true);
  });
  it('정수의 액티브 스킬이 모두 존재', () => {
    for (const es of ESSENCES.values()) {
      expect(es.actives.length).toBe(es.colors.length);
      for (const a of es.actives) expect(SKILLS.has(a), `${es.id}: ${a}`).toBe(true);
    }
  });
  it('장비의 기본기가 모두 존재', () => {
    for (const eq of EQUIPS.values()) if (eq.skill) expect(SKILLS.has(eq.skill), eq.id).toBe(true);
  });
  it('스킬 설명의 {키}가 vals에 있음', () => {
    for (const s of SKILLS.values()) {
      for (const m of s.desc.matchAll(/\{(?:[DB]:)?([a-z]+)\}/g)) expect(s.vals[m[1]] !== undefined, `${s.id}: ${m[1]}`).toBe(true);
    }
  });
  it('상태/유물/이벤트 등록', () => {
    expect(STATUSES.size).toBeGreaterThan(20);
    expect(RELICS.size).toBeGreaterThan(20);
    expect(EVENTS.size).toBeGreaterThan(5);
  });
  it('조우 id가 겹치지 않음', () => {
    const seen = new Set<string>();
    for (const e of ENCOUNTERS) {
      expect(seen.has(e.id), `중복 조우 id: ${e.id}`).toBe(false);
      seen.add(e.id);
    }
  });
  it('층마다 정의 · 일반/정예 조우 · 수호자가 있고, 군주 조우는 lord- 로 시작한다', () => {
    for (let act = 1; act <= FINAL_ACT; act++) {
      expect(FLOORS.has(act), `${act}층 정의`).toBe(true);
      const encs = ENCOUNTERS.filter((e) => e.act === act);
      expect(encs.some((e) => e.kind === 'normal' && !e.early && (e.weight ?? 1) > 0), `${act}층 일반 조우`).toBe(true);
      expect(encs.some((e) => e.kind === 'elite' && !isSpecial(e.id)), `${act}층 정예 조우`).toBe(true);
      expect(encs.some((e) => e.kind === 'boss' && !isSpecial(e.id)), `${act}층 수호자 조우`).toBe(true);
      // 군주 조우가 lord- 로 시작하지 않으면 수호자로 취급되어 군주를 잡는 순간 층이 끝나 버린다
      const lord = FLOORS.get(act)?.lord;
      if (lord) expect(encs.some((e) => e.id === lord.enc && e.kind === 'boss' && e.id.startsWith('lord')), `${act}층 군주 조우 ${lord.enc}`).toBe(true);
    }
  });
  it('이벤트는 1~5층에만', () => {
    for (const ev of EVENTS.values()) for (const a of ev.acts) expect(a >= 1 && a <= FINAL_ACT, `${ev.id}: ${a}`).toBe(true);
  });
});

describe('전투', () => {
  it('모든 조우를 봇이 끝까지 진행할 수 있다', () => {
    for (const enc of ENCOUNTERS) {
      const run = newRun({ seed: 42, origin: 'soldier' });
      run.act = enc.act;
      run.player.maxHp = run.player.hp = 99999;
      run.player.sanity = run.player.maxSanity = 99999;
      // 층에 걸맞은 성장치 (시작 장비만으로는 후반 적을 상대할 수 없다)
      run.player.str = (enc.act - 1) * 4;
      run.player.maxAp = 3 + (enc.act >= 3 ? 1 : 0);
      const c = startCombat(run, enc.id, { anomaly: enc.anomaly ?? null });
      let guard = 0;
      while (!c.over && guard++ < 300) autoTurn(c);
      expect(c.over, enc.id).toBe(true);
      expect(c.s.phase, enc.id).toBe('victory');
    }
    // 조우가 150개를 넘고 후반 전투가 길어, 다른 테스트 파일과 병렬로 돌면 기본 5초를 넘길 수 있다
  }, 60_000);

  it('사경: 체력 0이면 정신력으로 버틴다', () => {
    const run = newRun({ seed: 7, origin: 'soldier' });
    const c = startCombat(run, 'a1-thug');
    const e = c.alive[0];
    c.damage({ src: e, tgt: c.p, base: 999, type: 'blunt', attack: true });
    expect(c.p.hp).toBe(0);
    expect(c.dying).toBe(true);
    expect(c.over).toBe(false);
    c.heal(c.p, 10);
    expect(c.dying).toBe(false);
    expect(c.p.hp).toBe(10);
  });

  it('약점 공격으로 버팀이 깎이고 붕괴한다', () => {
    const run = newRun({ seed: 3, origin: 'soldier' });
    const c = startCombat(run, 'a1-thug');
    const e = c.alive[0];
    for (let i = 0; i < e.maxPoise; i++) c.damage({ src: c.p, tgt: e, base: 1, type: 'pierce', attack: true });
    expect(e.broken).toBe(2);
    expect(e.intent?.kind).toBe('stunned');
  });
});

describe('런', () => {
  it('정수 흡수와 한도', () => {
    const run = newRun({ seed: 11, origin: 'hunter' });
    expect(absorbEssence(run, { id: 'thug', color: 0 })).toBeNull();
    // 보통 정수는 본질로만 (기술은 수호자 정수에서)
    expect(run.skills.some((s) => s.id === 'ess-thug-pipe')).toBe(false);
    expect(run.essences[0].core).toBe(true);
    // 레벨 1 → 한도 1
    expect(absorbEssence(run, { id: 'dog', color: 0 })).not.toBeNull();
  });

  it('던전을 탐험하고 보스까지 갈 수 있다', () => {
    const run = newRun({ seed: 1234, origin: 'soldier' });
    run.player.maxHp = run.player.hp = 9999;
    const f = run.floor!;
    expect(f.rooms.length).toBeGreaterThanOrEqual(20);
    // 포탈까지 BFS 경로로 이동
    const prev = new Map<number, number>();
    const q = [f.pos];
    const seen = new Set([f.pos]);
    while (q.length) {
      const cur = q.shift()!;
      for (const n of f.rooms[cur].links) if (!seen.has(n)) {
        seen.add(n);
        prev.set(n, cur);
        q.push(n);
      }
    }
    const path: number[] = [];
    for (let at = f.portal; at !== f.pos; at = prev.get(at)!) path.unshift(at);
    for (const step of path) {
      if (run.screen === 'combat') {
        const c = new Combat(run);
        while (!c.over) autoTurn(c);
        finishCombat(run);
      }
      if (run.screen === 'reward') {
        for (const it of run.reward!.items) takeLoot(run, it);
        run.reward = null;
        run.screen = 'dungeon';
      }
      if (run.screen !== 'dungeon') {
        run.screen = 'dungeon';
        run.event = null;
      }
      expect(moveTo(run, step)).toBeNull();
    }
    if (run.screen === 'combat') {
      const c = new Combat(run);
      while (!c.over) autoTurn(c);
      finishCombat(run);
      run.screen = 'dungeon';
    }
    expect(f.pos).toBe(f.portal);
    run.screen = 'dungeon';
    expect(startGuardian(run)).toBeNull();
    const c = new Combat(run);
    let n = 0;
    while (!c.over && n++ < 300) autoTurn(c);
    expect(c.s.phase).toBe('victory');
  });

  it('4층 수호자 → 거점 → 5층은 정식 탐험 층', () => {
    const run = newRun({ seed: 505, origin: 'soldier' });
    run.act = 4;
    run.floor = generateFloor(run, 4);
    sturdy(run, 4);
    const boss = ENCOUNTERS.find((e) => e.act === 4 && e.kind === 'boss' && !isSpecial(e.id))!;
    const c = startCombat(run, boss.id);
    let n = 0;
    while (!c.over && n++ < 300) autoTurn(c);
    expect(c.s.phase).toBe('victory');
    expect(finishCombat(run)?.next).toBe('haven');
    goHaven(run);
    leaveHaven(run);
    expect(run.act).toBe(5);
    expect(run.screen).toBe('dungeon');
    const f = run.floor!;
    expect(f.act).toBe(5);
    expect(f.rooms.length).toBeGreaterThanOrEqual(20);
    expect(f.rooms.filter((r) => r.type === 'portal').length).toBe(1);
    for (const t of ['combat', 'elite', 'camp', 'merchant', 'shrine', 'treasure'] as const) expect(f.rooms.some((r) => r.type === t), t).toBe(true);
    const bossEnc = ENCOUNTERS.find((e) => e.id === f.bossEnc);
    expect(bossEnc?.act).toBe(5);
    expect(bossEnc?.kind).toBe('boss');
    expect(isSpecial(f.bossEnc)).toBe(false);
  });

  it('5층 수호자를 쓰러뜨리면 승리한다', () => {
    const run = newRun({ seed: 77, origin: 'soldier' });
    run.act = 5;
    run.floor = generateFloor(run, 5);
    sturdy(run, 5);
    const f = run.floor;
    f.pos = f.portal;
    run.screen = 'dungeon';
    expect(startGuardian(run)).toBeNull();
    expect(run.screen).toBe('combat');
    const c = new Combat(run);
    let n = 0;
    while (!c.over && n++ < 400) autoTurn(c);
    expect(c.s.phase).toBe('victory');
    expect(finishCombat(run)?.next).toBe('final');
    winRun(run);
    expect(run.over?.won).toBe(true);
    expect(run.screen).toBe('victory');
    expect(run.over?.reason).toBeTruthy();
  });

  it('추적자·균열 수호자·군주가 없는 층에서는 그 시스템이 조용히 꺼진다', () => {
    const act = 5;
    const removed = ENCOUNTERS.filter((e) => e.act === act && /^(stalker|rift)/.test(e.id));
    for (const e of removed) ENCOUNTERS.splice(ENCOUNTERS.indexOf(e), 1);
    const def = FLOORS.get(act)!;
    const lord = def.lord;
    def.lord = undefined;
    try {
      const run = newRun({ seed: 2024, origin: 'soldier' });
      run.act = act;
      run.floor = generateFloor(run, act);
      run.player.insight = 6;
      advanceTime(run, 120);
      const f = run.floor!;
      expect(f.tide).toBeGreaterThanOrEqual(4);
      expect(f.stalker).toBeNull();
      expect(f.rifts).toBe(0);
      expect(f.rooms.some((r) => r.type === 'lord')).toBe(false);
      // 이미 열린 균열(옛 상태 등)에 들어가려 해도 막히지 않고 균열이 닫힌다
      f.rooms[f.pos].rift = true;
      expect(enterRift(run)).not.toBeNull();
      expect(f.rooms[f.pos].rift).toBe(false);
      expect(run.screen).toBe('dungeon');
      expect(run.rift).toBeNull();
    } finally {
      ENCOUNTERS.push(...removed);
      def.lord = lord;
    }
  });

  it('수호자 조우가 없으면 포탈 비석이 그냥 길을 연다', () => {
    const run = newRun({ seed: 31, origin: 'soldier' });
    const f = run.floor!;
    f.bossEnc = '';
    f.pos = f.portal;
    expect(startGuardian(run)).toBeNull();
    expect(run.screen).toBe('haven');
  });
});
