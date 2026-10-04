import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES, ESSENCES, SKILLS, STATUSES, EQUIPS, RELICS, EVENTS } from '../src/engine/registry';
import { newRun, startCombat, finishCombat, absorbEssence, takeLoot } from '../src/engine/run';
import { moveTo, startGuardian } from '../src/engine/dungeon';
import { autoTurn } from '../src/sim/bot';

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
  });

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
    expect(run.skills.some((s) => s.id === 'ess-thug-pipe')).toBe(true);
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
});
