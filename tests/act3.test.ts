import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES, ESSENCES, EVENTS, FLOORS } from '../src/engine/registry';
import { absorbEssence, finishCombat, newRun, startCombat, type RunState } from '../src/engine/run';
import { floorSignal, generateFloor, moveTo } from '../src/engine/dungeon';
import { chooseEvent, eventView, leaveEvent, startEvent } from '../src/engine/events';
import { autoTurn } from '../src/sim/bot';
import { ENCASED, FROST } from '../src/content/act3/common';
import { CLOCK_CAP } from '../src/content/act3/enemies';
import { FROZEN_ROOM, THAWED_ROOM } from '../src/content/act3/anomalies';
import { BLIZZARD_HOURS, DARK_FROST, THAW_HOUR } from '../src/content/act3/floor';

/** 3층에 서 있는 튼튼한 주인공 */
function floor3(seed = 303, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.act = 3;
  run.floor = generateFloor(run, 3);
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = 8;
  run.player.maxAp = 4;
  run.light = 100;
  return run;
}

function fightToEnd(c: Combat) {
  let n = 0;
  while (!c.over && n++ < 300) autoTurn(c);
  return c;
}

const NEW_ENEMIES = [
  'blind-penguin',
  'frozen-explorer',
  'frost-wraith',
  'elder-hunter',
  'gnoph-keh',
  'sled-dog',
  'elder-vivisector',
  'beyond-peaks',
  'awakened-elder',
  'frozen-leader',
];

describe('3층 — 콘텐츠', () => {
  it('층 정의: 법칙 3개, 계층군주, 추적자, 균열 수호자, 수호자 셋', () => {
    const def = FLOORS.get(3)!;
    expect(def.name).toBe('얼어붙은 고대 도시');
    for (const word of ['혹한', '눈보라', '얼음 속의 것들']) expect(def.law).toContain(word);
    expect(def.lord?.enc).toBe('lord-a3');
    const encs = ENCOUNTERS.filter((e) => e.act === 3);
    expect(encs.some((e) => e.id === 'stalker-a3')).toBe(true);
    expect(encs.some((e) => e.id === 'rift-a3' && e.kind === 'elite')).toBe(true);
    expect(encs.filter((e) => e.kind === 'boss' && !/^(lord|stalker|rift)/.test(e.id)).length).toBe(3);
    expect(encs.filter((e) => e.kind === 'elite' && !/^(lord|stalker|rift)/.test(e.id)).length).toBe(3);
  });

  it('하수인을 뺀 모든 3층 적에게 정수가 있다', () => {
    for (const def of ENEMIES.values()) {
      if (def.act !== 3 || def.tier === 'minion') continue;
      expect(ESSENCES.has(def.id), def.id).toBe(true);
    }
    expect(ESSENCES.get('awakened-elder')?.lord).toBe(true);
  });

  it('새 정수를 흡수하면 액티브를 전투에서 쓸 수 있다', () => {
    for (const id of NEW_ENEMIES) {
      const run = floor3(11);
      run.player.level = 20;
      expect(absorbEssence(run, { id, color: 0, guardian: true }), id).toBeNull();
      const es = ESSENCES.get(id)!;
      const c = startCombat(run, 'a3-expedition');
      for (const a of es.actives) {
        const owned = run.skills.find((s) => s.id === a)!;
        expect(owned, a).toBeTruthy();
        // 슬롯에 넣고 행동력을 넉넉히
        run.slots[0] = owned.uid;
        c.s.ap = 10;
        delete c.s.cd[owned.uid];
        if (c.over) break;
        expect(c.useSkill(owned.uid, c.alive[0]?.uid), `${id}: ${a}`).toBeNull();
      }
    }
  });

  it('새 이벤트의 모든 선택지를 고를 수 있다', () => {
    const ids = [...EVENTS.values()].filter((e) => e.acts.includes(3) && e.id.startsWith('a3-')).map((e) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      const n = eventView((() => {
        const r = floor3();
        startEvent(r, id);
        return r;
      })())!.choices.length;
      for (let i = 0; i < n; i++) {
        const run = floor3(1000 + i);
        startEvent(run, id);
        const view = eventView(run)!;
        if (view.choices[i].disabled) continue;
        expect(chooseEvent(run, i), `${id} #${i}`).toBeNull();
        leaveEvent(run);
        if (run.screen === 'combat') {
          const c = fightToEnd(new Combat(run));
          expect(c.s.phase, `${id} #${i}`).toBe('victory');
        }
      }
    }
  });
});

describe('3층 — 법칙', () => {
  it('얼어붙은 방은 전투가 벌어지는 방에만, 3개 이상', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = floor3(seed);
      const frozen = run.floor!.rooms.filter((r) => r.frozen !== undefined);
      expect(frozen.length).toBeGreaterThanOrEqual(3);
      for (const r of frozen) {
        expect(['combat', 'elite']).toContain(r.type);
        expect(r.frozen).toBe(THAW_HOUR);
      }
    }
  });

  it('혹한: 등불이 1.5배 빨리 닳는다', () => {
    const run = floor3();
    const f = run.floor!;
    const to = f.rooms[f.pos].links[0];
    f.rooms[to].type = 'camp';
    run.light = 60;
    expect(moveTo(run, to)).toBeNull();
    expect(run.light).toBe(60 - 8 - 4);
  });

  it('눈보라: 들르지 않은 방의 내용이 다시 어둠에 묻힌다', () => {
    const run = floor3();
    const f = run.floor!;
    const to = f.rooms[f.pos].links[0];
    f.rooms[to].type = 'camp';
    // 이동한 뒤에도 등불이 닿지 않는 (도착한 방의 이웃이 아닌) 방
    const far = f.rooms.find((r) => !r.visited && r.id !== f.portal && r.id !== to && !f.rooms[to].links.includes(r.id))!;
    far.seen = far.scouted = true;
    const portal = f.rooms[f.portal];
    portal.seen = portal.scouted = true;
    f.hours = BLIZZARD_HOURS - 1;
    moveTo(run, to);
    expect(far.scouted).toBe(false);
    expect(portal.scouted).toBe(true);
    expect(f.vars.nextBlizzard).toBe(BLIZZARD_HOURS * 2);
  });

  it('얼음 속의 것들: 녹기 전엔 얼음에 갇히고, 녹은 뒤엔 굶주린다', () => {
    const run = floor3();
    const f = run.floor!;
    const room = f.rooms.find((r) => r.frozen !== undefined)!;
    const rule = FLOORS.get(3)!.roomAnomaly!;
    f.hours = THAW_HOUR - 1;
    expect(rule(run, f, room.id)).toBe(FROZEN_ROOM);
    f.hours = THAW_HOUR;
    expect(rule(run, f, room.id)).toBe(THAWED_ROOM);
    const plain = f.rooms.find((r) => r.frozen === undefined && r.type === 'combat');
    if (plain) expect(rule(run, f, plain.id)).toBeNull();
  });

  it('얼어붙은 방의 적은 첫 차례를 움직이지 못하고, 다음 차례에 깨어난다', () => {
    const run = floor3();
    const c = startCombat(run, 'a3-e-dogs', { anomaly: FROZEN_ROOM });
    for (const e of c.alive) {
      expect(e.st[ENCASED]).toBe(1);
      expect(e.intent?.kind).toBe('sleep');
    }
    const hp = c.p.hp;
    c.endTurn();
    expect(c.p.hp).toBe(hp);
    for (const e of c.alive) {
      expect(e.st[ENCASED]).toBeUndefined();
      expect(e.hist[e.hist.length - 1]).toBe('_wait');
      expect(e.intent?.kind).not.toBe('sleep');
    }
  });

  it('녹아내린 방의 적은 공격 피해 +25%', () => {
    const run = floor3();
    const a = startCombat(run, 'a3-e-dogs', { anomaly: null });
    const base = a.preview(a.alive[0], a.p, 20, 'blunt');
    const run2 = floor3();
    const b = startCombat(run2, 'a3-e-dogs', { anomaly: THAWED_ROOM });
    expect(b.preview(b.alive[0], b.p, 20, 'blunt')).toBe(Math.floor(base * 1.25));
  });

  it('어둠 속 전투는 동상을 안고 시작하고, 동상 5면 행동력 -1, 화염이 녹인다', () => {
    const run = floor3();
    run.light = 10;
    const c = startCombat(run, 'a3-e-dogs', { anomaly: null });
    expect(c.p.st[FROST]).toBe(DARK_FROST);
    // 화염에 닿으면 2 녹는다
    c.damage({ src: c.alive[0], tgt: c.p, base: 3, type: 'fire', attack: true });
    expect(c.p.st[FROST]).toBe(DARK_FROST - 2);
    c.apply(c.p, FROST, 5);
    c.endTurn();
    expect(c.p.st[FROST]).toBeUndefined();
    expect(c.s.ap).toBe(c.p.maxAp - 1);
  });

  it('계층군주: 숨은 조건(온기·해동)이 차면 깨어난 원로가 나타난다', () => {
    const run = floor3();
    const f = run.floor!;
    for (const r of f.rooms.slice(0, 6)) if (r.type === 'combat') r.cleared = true;
    floorSignal(run, { t: 'event', id: 'a3-frozen-shape', choice: 'melt' });
    floorSignal(run, { t: 'event', id: 'a3-murals', choice: 'revolt' });
    floorSignal(run, { t: 'tide', tide: 2 });
    expect(f.lord.room).toBe(-1);
    const camp = f.rooms.find((r) => r.type === 'camp')!;
    camp.cleared = true;
    floorSignal(run, { t: 'move', room: f.pos });
    floorSignal(run, { t: 'event', id: 'a3-tekeli-li', choice: 'answer' });
    expect(f.lord.room).toBeGreaterThanOrEqual(0);
    expect(f.rooms[f.lord.room].type).toBe('lord');
  });
});

describe('3층 — 적의 기믹', () => {
  it('눈먼 펭귄은 이번 턴 쓴 기술 수만큼 쫀다 (안 쓰면 못 찾는다)', () => {
    const count = (used: number) => {
      const run = floor3();
      run.player.maxAp = 9;
      const c = startCombat(run, 'a3-e-penguins', { anomaly: null });
      c.s.ap = 9;
      for (const e of c.alive) c.planIntent(e);
      for (const e of c.alive) e.intent = { move: 'peck', kind: 'attack', dmg: 2, hits: 1, label: '부리' };
      for (let i = 0; i < used; i++) {
        delete c.s.cd.armor;
        expect(c.useSkill('armor')).toBeNull();
      }
      c.drain();
      c.endTurn();
      return c.drain().filter((ev) => ev.t === 'dmg' && ev.tgt === 'p' && ev.src?.startsWith('e')).length;
    };
    expect(count(0)).toBe(0);
    expect(count(2)).toBe(4);
    expect(count(3)).toBe(6);
  });

  it('동사한 탐사대원은 다시 일어서지만, 타격·화염에는 부서진다', () => {
    const run = floor3();
    const c = startCombat(run, 'a3-e-explorer', { anomaly: null });
    const ex = c.alive.find((e) => e.def === 'frozen-explorer')!;
    c.damage({ src: c.p, tgt: ex, base: 9999, type: 'slash', attack: true });
    expect(ex.dead).toBe(false);
    expect(ex.hp).toBe(Math.ceil(ex.maxHp * 0.4));
    c.damage({ src: c.p, tgt: ex, base: 9999, type: 'slash', attack: true });
    expect(ex.dead).toBe(true);

    const run2 = floor3();
    const c2 = startCombat(run2, 'a3-e-explorer', { anomaly: null });
    const ex2 = c2.alive.find((e) => e.def === 'frozen-explorer')!;
    c2.damage({ src: c2.p, tgt: ex2, base: 9999, type: 'blunt', attack: true });
    expect(ex2.dead).toBe(true);
  });

  it('고대인 사냥꾼은 기술 하나를 빼앗고, 쓰러뜨리면 돌려준다', () => {
    const run = floor3();
    const c = startCombat(run, 'a3-hunters', { anomaly: null });
    const h = c.alive.find((e) => e.def === 'elder-hunter')!;
    c.moveDef(h, 'collect').run(c, h);
    const slot = h.mem.specimen - 1;
    expect(slot).toBeGreaterThanOrEqual(0);
    const uid = run.slots[slot]!;
    expect(c.s.cd[uid]).toBe(99);
    expect(c.blockReason(uid)).not.toBeNull();
    c.damage({ src: c.p, tgt: h, base: 9999, type: 'pierce', attack: true });
    expect(h.dead).toBe(true);
    expect(c.s.cd[uid]).toBeUndefined();
  });

  it('쇼고스 노예는 주인이 약해지면 반란을 일으키고, 주인이 쓰러지면 흘러가 버린다', () => {
    const run = floor3();
    const c = startCombat(run, 'lord-a3');
    const elder = c.alive.find((e) => e.def === 'awakened-elder')!;
    const thrall = c.alive.find((e) => e.def === 'shoggoth-thrall')!;
    elder.poise = 0; // 버팀을 걷어 피해가 그대로 들어가게 (버팀이 남은 적은 절반만 받는다)
    c.damage({ src: c.p, tgt: elder, base: Math.ceil(elder.maxHp * 0.55), type: 'slash', attack: true });
    expect(thrall.mem.rebel).toBe(1);
    expect(thrall.intent?.move).toBe('revolt');
    const hp = elder.hp;
    c.moveDef(thrall, 'revolt').run(c, thrall);
    expect(elder.hp).toBeLessThan(hp);
    c.damage({ src: c.p, tgt: elder, base: 99999, type: 'slash', attack: true });
    expect(elder.dead).toBe(true);
    expect(thrall.fled).toBe(true);
    expect(c.alive.length).toBe(0);
  });

  it('시간에 얼어붙은 탐사대장: 한 턴에 받는 피해에 상한, 붕괴하면 상한이 없다', () => {
    const run = floor3();
    const c = startCombat(run, 'rift-a3', { anomaly: null });
    const lead = c.alive.find((e) => e.def === 'frozen-leader')!;
    const hp0 = lead.hp;
    for (let i = 0; i < 4; i++) c.damage({ src: c.p, tgt: lead, base: 40, type: 'slash', attack: true });
    expect(hp0 - lead.hp).toBeLessThanOrEqual(CLOCK_CAP);
    c.breakEnemy(lead);
    const hp1 = lead.hp;
    c.damage({ src: c.p, tgt: lead, base: 60, type: 'slash', attack: true });
    expect(hp1 - lead.hp).toBeGreaterThan(60);
  });

  it('산맥 너머의 것: 방어도가 정신 피해를 먼저 막고, 잃은 정신력만큼 회복한다', () => {
    const run = floor3();
    run.player.sanity = run.player.maxSanity = 100;
    const c = startCombat(run, 'a3-boss-peaks');
    const b = c.alive[0];
    b.hp -= 100;
    // 방어도가 충분하면 정신력을 잃지 않는다
    c.p.block = 50;
    const san0 = c.p.sanity;
    c.moveDef(b, 'gaze').run(c, b);
    expect(c.p.sanity).toBe(san0);
    expect(c.p.block).toBe(50 - 18);
    // 방어도가 없으면 정신력을 잃고, 그만큼 회복한다
    c.p.block = 0;
    const hp = b.hp;
    c.moveDef(b, 'gaze').run(c, b);
    const lost = san0 - c.p.sanity;
    expect(lost).toBeGreaterThan(0);
    expect(b.hp).toBe(hp + lost);
  });

  it('3층의 모든 조우를 봇이 이기고, 보상까지 받는다', () => {
    for (const enc of ENCOUNTERS.filter((e) => e.act === 3)) {
      const run = floor3(77);
      const c = fightToEnd(startCombat(run, enc.id, { anomaly: null }));
      expect(c.s.phase, enc.id).toBe('victory');
      expect(finishCombat(run), enc.id).not.toBeNull();
    }
  });
});
