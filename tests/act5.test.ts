import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat } from '../src/engine/combat';
import { ANOMALIES, ENCOUNTERS, ENEMIES, ESSENCES, EVENTS, FLOORS } from '../src/engine/registry';
import { finishCombat, newRun, startCombat, type RunState } from '../src/engine/run';
import { floorSignal, generateFloor, moveTo, startGuardian } from '../src/engine/dungeon';
import { chooseEvent, eventView, startEvent } from '../src/engine/events';
import { DMG_TYPES, type EnemyUnit } from '../src/engine/types';
import { autoTurn } from '../src/sim/bot';
import { CORD, CRY_BASE, CRY_PER_CORD, CRY_TURNS, DREAMS, FETUS, FETUS_PHASES, SHELL_LAYERS, SLUMBER_AP } from '../src/content/act5/fetus';
import { MOVE_SANITY } from '../src/content/act5/floor';

/** 5층에 서 있는 튼튼한 주인공 */
function floor5(seed = 505, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.act = 5;
  run.floor = generateFloor(run, 5);
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = 16;
  run.player.maxAp = 4;
  run.light = 100;
  return run;
}

function fetusOf(c: Combat): EnemyUnit {
  return c.s.enemies.find((e) => e.def === FETUS)!;
}

/** 지금 단계를 끝낸다 (방어 무시 피해) */
function slay(c: Combat, e: EnemyUnit) {
  c.damage({ src: c.p, tgt: e, base: e.hp + e.block + 9999, type: 'true', ignoreBlock: true });
}

/** 약점 공격 한 번으로 붕괴시킨다 */
function breakIt(c: Combat, e: EnemyUnit) {
  e.poise = 1;
  c.damage({ src: c.p, tgt: e, base: 1, type: e.weak[0], attack: true });
}

describe('5층 — 꿈꾸는 우주', () => {
  it('층 정의: 법칙은 세 줄 이하, 승리 문장, 군주·추적자·균열 수호자·최종 수호자', () => {
    const f = FLOORS.get(5)!;
    expect(f.name).toBe('꿈꾸는 우주');
    expect(f.law.split('\n').length).toBeLessThanOrEqual(3);
    expect(f.victory).toContain('별의 태아');
    const ids = ENCOUNTERS.filter((e) => e.act === 5).map((e) => e.id);
    for (const id of ['lord-a5', 'stalker-a5', 'rift-a5', 'a5-boss-fetus']) expect(ids, id).toContain(id);
    const bosses = ENCOUNTERS.filter((e) => e.act === 5 && e.kind === 'boss' && !e.id.startsWith('lord'));
    expect(bosses.map((e) => e.id)).toEqual(['a5-boss-fetus']);
  });

  it('5층 조우에는 5층 적만 나오고, 옛 잠든 자·3층 id가 남아 있지 않다', () => {
    for (const enc of ENCOUNTERS.filter((e) => e.act === 5)) {
      expect(enc.id.startsWith('a3-'), enc.id).toBe(false);
      for (const s of enc.enemies) expect(ENEMIES.get(s.id)?.act, `${enc.id}: ${s.id}`).toBe(5);
    }
    for (const id of ['sleeper', 'sleeper-tentacle', 'rlyeh-warden', 'ash-pilgrim']) {
      expect(ENEMIES.has(id), id).toBe(false);
      expect(ESSENCES.has(id), id).toBe(false);
    }
    for (const ev of EVENTS.values()) if (ev.acts.includes(5)) expect(ev.id.startsWith('a5-'), ev.id).toBe(true);
  });

  it('꿈의 문지기는 이제 정예다 (수호자 정수 확정 드롭 없음, 액티브 2개)', () => {
    expect(ENEMIES.get('dream-gatekeeper')?.tier).toBe('elite');
    expect(ESSENCES.get('dream-gatekeeper')?.actives.length).toBe(2);
    expect(ENCOUNTERS.find((e) => e.id === 'a5-elite-gatekeeper')?.kind).toBe('elite');
  });

  it('5층 적은 4층보다 단단하다 (일반 적 기본 체력)', () => {
    const avgHp = (act: number) => {
      const l = [...ENEMIES.values()].filter((e) => e.act === act && e.tier === 'normal');
      return l.reduce((s, e) => s + (e.hp[0] + e.hp[1]) / 2, 0) / l.length;
    };
    expect(avgHp(5)).toBeGreaterThan(avgHp(4));
  });

  it('자장가: 방을 옮길 때마다 정신력을 잃는다', () => {
    const run = floor5();
    run.player.sanity = run.player.maxSanity = 100;
    run.player.insight = 0;
    run.player.will = 0;
    const f = run.floor!;
    const to = f.rooms[f.pos].links[0];
    f.rooms[to].cleared = true;
    f.rooms[to].type = 'empty';
    expect(moveTo(run, to)).toBeNull();
    expect(run.player.sanity).toBe(100 - MOVE_SANITY);
  });

  it('회복 반전 구역이 표시되고, 꿈을 먹는 자는 정신력이 흔들릴 때만 조수를 탄다', () => {
    const run = floor5();
    const f = run.floor!;
    expect(f.rooms.filter((r) => r.inverted).length).toBeGreaterThanOrEqual(2);
    run.player.insight = 10;
    floorSignal(run, { t: 'tide', tide: 1 });
    expect(f.lord.progress).toBe(0);
    run.player.sanity = Math.floor(run.player.maxSanity / 3);
    floorSignal(run, { t: 'tide', tide: 2 });
    expect(f.lord.progress).toBe(1);
  });

  it('끝나지 않는 자장가: 엿들으면 별의 태아의 모든 약점을 안다', () => {
    const run = floor5();
    run.screen = 'event';
    startEvent(run, 'a5-starry-rite');
    expect(eventView(run)?.choices.length).toBeGreaterThan(0);
    expect(chooseEvent(run, 0)).toBeNull();
    expect(run.knownWeak[FETUS]).toEqual([...DMG_TYPES]);
  });

  it('별을 삼킨 것은 붕괴하면 삼킨 별을 토해 동료를 태운다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-swallow-pilgrims');
    const sw = c.s.enemies.find((e) => e.def === 'star-swallower')!;
    const others = c.alive.filter((e) => e !== sw);
    const before = others.map((e) => e.hp);
    breakIt(c, sw);
    expect(sw.broken).toBe(2);
    others.forEach((e, i) => expect(e.hp, e.def).toBeLessThan(before[i]));
  });

  it('성운 해파리는 시간이 지나면 갓 태어난 별을 낳는다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-e-jelly');
    let born = false;
    for (let i = 0; i < 6 && !c.over; i++) {
      c.endTurn();
      if (c.s.enemies.some((e) => e.def === 'newborn-star')) born = true;
    }
    expect(born).toBe(true);
  });
});

describe('최종 수호자 — 별의 태아', () => {
  it('포탈 비석에서 별의 태아가 나오고, 혜성 탯줄 둘과 함께 꿈을 꾸기 시작한다', () => {
    const run = floor5();
    const f = run.floor!;
    expect(f.bossEnc).toBe('a5-boss-fetus');
    f.pos = f.portal;
    run.screen = 'dungeon';
    expect(startGuardian(run)).toBeNull();
    const c = new Combat(run);
    expect(fetusOf(c).name).toBe(FETUS_PHASES[0].name);
    expect(c.alive.filter((e) => e.def === CORD).length).toBe(2);
    expect(c.s.anomaly).toBe(DREAMS[0]);
    for (const id of DREAMS) expect(ANOMALIES.has(id), id).toBe(true);
  });

  it('내 턴이 시작될 때마다 꿈이 정해진 순서로 바뀐다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const seen = [c.s.anomaly];
    for (let i = 0; i < DREAMS.length; i++) {
      c.endTurn();
      seen.push(c.s.anomaly);
    }
    expect(seen).toEqual([...DREAMS, DREAMS[0]]);
  });

  it('거꾸로 흐르는 꿈에서는 회복이 피해가 된다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    c.s.anomaly = 'a5-dream-backward';
    c.p.hp = 500;
    c.heal(c.p, 10);
    expect(c.p.hp).toBe(490);
  });

  it('자장가가 세 번 쌓이면 잠들어 다음 턴 행동력을 잃고, 적을 붕괴시키면 깨어난다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = fetusOf(c);
    const lullaby = c.moveDef(f, 'lullaby');
    lullaby.run(c, f);
    lullaby.run(c, f);
    expect(c.p.st['a5-drowsy']).toBe(2);
    // 적(태아)을 붕괴시키면 번쩍 깨어난다
    breakIt(c, f);
    expect(c.p.st['a5-drowsy'] ?? 0).toBe(0);
    for (let i = 0; i < 3; i++) lullaby.run(c, f);
    expect(c.p.st['a5-slumber']).toBe(1);
    c.endTurn();
    if (!c.over) expect(c.s.ap).toBe(c.p.maxAp - SLUMBER_AP);
  });

  it('세 모습: 알은 별자리 껍질을 두르고, 태어난 것은 꿈을 끝내고 첫 울음을 머금는다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = fetusOf(c);
    // 1 → 2: 깨어나는 알
    slay(c, f);
    expect(f.dead).toBe(false);
    expect(f.form).toBe(1);
    expect(f.name).toBe(FETUS_PHASES[1].name);
    expect(f.weak).toEqual(FETUS_PHASES[1].weak);
    expect(f.st['a5-shell']).toBe(SHELL_LAYERS);
    expect(DREAMS).toContain(c.s.anomaly);
    // 껍질은 피해를 줄이고, 붕괴할 때마다 한 겹씩 깨진다
    const full = c.preview(c.p, f, 100, 'void');
    breakIt(c, f);
    expect(f.st['a5-shell']).toBe(SHELL_LAYERS - 1);
    expect(f.mem.cracks).toBe(1);
    expect(c.preview(c.p, f, 100, 'void')).toBeGreaterThan(full);
    // 2 → 3: 태어난 것
    slay(c, f);
    expect(f.form).toBe(2);
    expect(f.name).toBe(FETUS_PHASES[2].name);
    expect(f.st['a5-shell'] ?? 0).toBe(0);
    expect(c.s.anomaly).toBeNull();
    expect(f.intent?.move).toBe('cry');
    // 적의 차례: 첫 울음을 머금는다
    c.endTurn();
    expect(c.p.st['a5-cry']).toBe(CRY_TURNS);
    // 붕괴시키면 울음이 멎는다
    breakIt(c, f);
    expect(c.p.st['a5-cry'] ?? 0).toBe(0);
  });

  it('첫 울음은 방어도를 무시하고 혜성 탯줄마다 커진다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = fetusOf(c);
    slay(c, f);
    slay(c, f);
    c.p.block = 999;
    c.p.st['a5-cry'] = 1;
    const cords = c.alive.filter((e) => e.def === CORD).length;
    c.drain();
    c.endTurn();
    const hit = c.drain().find((ev) => ev.t === 'dmg' && ev.tags.includes('a5-cry'));
    expect(hit && hit.t === 'dmg' ? hit.amount : -1).toBe(CRY_BASE + CRY_PER_CORD * cords);
  });

  it('마지막 모습을 쓰러뜨리면 탯줄도 흩어지고 승리한다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = fetusOf(c);
    slay(c, f);
    slay(c, f);
    slay(c, f);
    expect(f.dead).toBe(true);
    expect(c.alive.length).toBe(0);
    c.endTurn();
    expect(c.s.phase).toBe('victory');
    const rw = finishCombat(run);
    expect(rw?.next).toBe('final');
    expect(rw?.items.some((it) => it.kind === 'essence' && it.id === FETUS && it.guardian)).toBe(true);
  });

  it('봇이 세 모습을 모두 넘어 별의 태아를 쓰러뜨린다', () => {
    const run = floor5(77);
    const c = startCombat(run, 'a5-boss-fetus');
    let n = 0;
    while (!c.over && n++ < 300) autoTurn(c);
    expect(c.s.phase).toBe('victory');
    expect(fetusOf(c).mem.phase).toBe(2);
  });
});
