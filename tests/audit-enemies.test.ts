import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES, EVENTS, FLOORS, STATUSES } from '../src/engine/registry';
import { gainRelic, newRun, startCombat, type RunState } from '../src/engine/run';
import { floorSignal, generateFloor, moveTo } from '../src/engine/dungeon';
import { chooseEvent, eventView, startEvent } from '../src/engine/events';
import type { EnemyUnit, MoveDef } from '../src/engine/types';

/**
 * 적·층 감사 (2026-10): 플레이어에게 보이는 적의 의도·특성·층의 법칙·이벤트 문구가 실제 동작과 맞는지.
 * 행동 전체를 훑는 검사 + 감사 중 찾아 고친 버그의 회귀 테스트.
 */

/** 그 층에 서 있는, 쓰러지지 않는 주인공 */
function runAt(act: number, seed = 11): RunState {
  const run = newRun({ seed, origin: 'soldier' });
  run.act = act;
  run.floor = generateFloor(run, act);
  run.player.maxHp = run.player.hp = 99999;
  run.player.sanity = run.player.maxSanity = 99999;
  run.player.gold = 500;
  run.light = 100;
  return run;
}

/** 적 하나만 나오는 조우 (조우가 없는 하수인을 불러낼 자리) */
const HOST: Record<number, string> = { 1: 'a1-thug', 2: 'a2-ghoul1', 3: 'a3-shantak', 4: 'a4-young', 5: 'a5-e-gug' };

/** 이 적이 들어 있는 전투를 연다. 조우가 없는 하수인은 같은 층 전투에 불러낸다 */
function combatWith(defId: string, seed = 11): { c: Combat; e: EnemyUnit } {
  const def = ENEMIES.get(defId)!;
  const run = runAt(def.act, seed);
  const enc = ENCOUNTERS.find((x) => x.enemies.some((s) => s.id === defId));
  const c = startCombat(run, enc?.id ?? HOST[def.act], { anomaly: null });
  const e = c.alive.find((x) => x.def === defId) ?? c.spawn(defId);
  if (!e) throw new Error(`${defId}: 전투에 넣을 수 없다`);
  return { c, e };
}

/** planIntent와 같은 계산으로 의도를 이 행동으로 정한다 */
function force(c: Combat, e: EnemyUnit, id: string): MoveDef {
  const m = c.moveDef(e, id);
  e.intent = {
    move: id,
    kind: m.intent,
    extra: m.extra,
    dmg: typeof m.dmg === 'function' ? m.dmg(c, e) : m.dmg,
    hits: typeof m.hits === 'function' ? m.hits(c, e) : m.hits,
    sanity: m.sanity,
    label: m.name,
    hidden: m.hidden,
    charging: m.charging,
  };
  return m;
}

/** 적의 차례처럼 그 행동을 실행한다 */
function act(c: Combat, e: EnemyUnit, id: string) {
  const m = force(c, e, id);
  c.s.phase = 'enemy';
  m.run(c, e);
}

/** 의도 말풍선이 피해 숫자를 보여 주는가 (Combat.tsx intentView와 같은 조건) */
function showsDamage(it: NonNullable<EnemyUnit['intent']>): boolean {
  return !!it.dmg && (it.kind === 'attack' || it.kind === 'charge' || !!it.extra?.includes('attack') || it.kind === 'horror' || it.kind === 'debuff');
}

const allMoves = () => [...ENEMIES.values()].flatMap((def) => Object.keys(def.moves).map((id) => ({ def, id })));

describe('적 행동 — 전수 검사', () => {
  it('모든 적의 모든 행동을 플레이어에게 써도 오류가 나지 않는다 (사경 포함)', () => {
    const errors: string[] = [];
    for (const { def, id } of allMoves()) {
      for (const dying of [false, true]) {
        const tag = `${def.id}.${id}${dying ? ' (사경)' : ''}`;
        try {
          const { c, e } = combatWith(def.id);
          if (dying) {
            c.damage({ src: null, tgt: c.p, base: c.p.hp + 10, type: 'true', ignoreBlock: true });
            if (!c.dying) errors.push(`${tag}: 사경에 들지 않음`);
          }
          act(c, e, id);
          if (c.s.phase === 'defeat') errors.push(`${tag}: 패배`);
        } catch (err) {
          errors.push(`${tag}: ${(err as Error).message}`);
        }
      }
    }
    expect(errors).toEqual([]);
  });

  it('의도에 보이는 피해 숫자·횟수 그대로 맞고, 정신 공격은 정신력을 깎는다', () => {
    const wrong: string[] = [];
    for (const { def, id } of allMoves()) {
      const { c, e } = combatWith(def.id);
      // 눈먼 펭귄처럼 '이번 턴 쓴 기술 수'를 세는 행동을 위해 기술 하나를 쓴 셈 친다
      c.s.used = 1;
      const m = force(c, e, id);
      const it = e.intent!;
      if (it.charging) continue;
      const pv = it.dmg ? c.preview(e, c.p, it.dmg, 'blunt') : 0;
      const san = c.p.sanity;
      c.drain();
      c.s.phase = 'enemy';
      m.run(c, e);
      if (showsDamage(it)) {
        const hits = c.drain().filter((x) => x.t === 'dmg' && x.tgt === 'p' && x.src === e.uid && x.attack) as { amount: number }[];
        if (hits.length !== (it.hits ?? 1) || hits.some((x) => x.amount !== pv))
          wrong.push(`${def.id}.${id}: 표시 ${pv}×${it.hits ?? 1}, 실제 [${hits.map((x) => x.amount).join(',')}]`);
      }
      if (it.kind === 'horror' && (it.sanity ?? 0) > 0 && !(c.p.sanity < san)) wrong.push(`${def.id}.${id}: 정신 ${it.sanity}이라 했지만 정신력이 그대로`);
    }
    expect(wrong).toEqual([]);
  });

  it('부가 효과가 있는 행동에는 설명이 있다 (의도 말풍선은 숫자만 보여 준다)', () => {
    // 이 행동들의 부가 효과는 특성 설명이 알려 준다
    const byTrait: Record<string, string> = { 'star-pilgrim': '순례 걸음 (a5-pilgrim)', 'star-colour': '피해만큼 회복 (a4-leech)' };
    const missing: string[] = [];
    const visible = (st: Record<string, number>) => JSON.stringify(Object.entries(st).filter(([k]) => STATUSES.has(k) && !STATUSES.get(k)!.hidden));
    for (const { def, id } of allMoves()) {
      const { c, e } = combatWith(def.id);
      const m = c.moveDef(e, id);
      if (m.desc || m.charging) continue;
      if (!['attack', 'horror'].includes(m.intent)) {
        missing.push(`${def.id}.${id} [${m.name}]: ${m.intent} 행동인데 설명이 없다`);
        continue;
      }
      e.hp = Math.max(1, e.hp - 50);
      const before = { pst: visible(c.p.st), gold: c.p.gold, light: c.run.light, insight: c.p.insight, cd: JSON.stringify(c.s.cd), hp: e.hp, est: visible(e.st) };
      act(c, e, id);
      const diffs: string[] = [];
      if (visible(c.p.st) !== before.pst) diffs.push(`상태 ${visible(c.p.st)}`);
      if (c.p.gold !== before.gold) diffs.push('골드');
      if (c.run.light !== before.light) diffs.push('등불');
      if (c.p.insight !== before.insight) diffs.push('통찰');
      if (JSON.stringify(c.s.cd) !== before.cd) diffs.push('재사용 대기');
      // 변이(흡혈·재생)의 회복은 변이 설명이 알려 준다 (content/depth.ts)
      if (!e.dead && e.hp > before.hp && !byTrait[def.id] && !e.affix?.some((a) => a === 'mut-leech' || a === 'mut-regen')) diffs.push('회복');
      if (!e.dead && visible(e.st) !== before.est && !byTrait[def.id]) diffs.push(`자신 상태 ${visible(e.st)}`);
      if (diffs.length) missing.push(`${def.id}.${id} [${m.name}]: ${diffs.join(', ')}`);
    }
    expect(missing).toEqual([]);
  });

  it('차지(예고)한 피해·횟수와 이어지는 강공격의 피해·횟수가 같다', () => {
    const wrong: string[] = [];
    for (const def of ENEMIES.values()) {
      for (const [id, m] of Object.entries(def.moves)) {
        if (!m.charging || !m.dmg) continue;
        const { c, e } = combatWith(def.id);
        const preview = force(c, e, id);
        const pd = typeof preview.dmg === 'function' ? preview.dmg(c, e) : preview.dmg;
        const ph = (typeof preview.hits === 'function' ? preview.hits(c, e) : preview.hits) ?? 1;
        // 별의 태아는 모습(단계)마다 차지가 다르다
        if (def.id === 'star-fetus') e.mem.phase = ({ curl: 0, throb: 1, gather: 2 } as Record<string, number>)[id];
        e.mem.charge = 1;
        const next = def.ai(c, e);
        const r = c.moveDef(e, next);
        const rd = typeof r.dmg === 'function' ? r.dmg(c, e) : r.dmg;
        const rh = (typeof r.hits === 'function' ? r.hits(c, e) : r.hits) ?? 1;
        if (r.charging || rd !== pd || rh !== ph) wrong.push(`${def.id}.${id} → ${next}: 예고 ${pd}×${ph}, 실제 ${rd}×${rh}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('적 행동 — 감사에서 고친 것', () => {
  it('눈먼 펭귄: 의도에 지난 턴 기술 수를 ×N으로 보여 주지 않고, 실행할 때 이번 턴 기술 수만큼 쫀다', () => {
    const { c, e } = combatWith('blind-penguin');
    // 의도는 라운드 끝(지난 턴의 c.s.used가 남아 있을 때)에 정해진다
    c.s.used = 4;
    force(c, e, 'peck');
    expect(e.intent!.hits ?? 1).toBe(1);
    c.s.used = 2;
    c.drain();
    c.s.phase = 'enemy';
    c.moveDef(e, 'peck').run(c, e);
    expect(c.drain().filter((x) => x.t === 'dmg' && x.tgt === 'p' && x.src === e.uid).length).toBe(2);
  });

  it('동사한 탐사대원: 화상으로 쓰러뜨려도 화염처럼 산산조각 난다', () => {
    const { c, e } = combatWith('frozen-explorer');
    // 화상의 지속 피해 (statuses.ts burn.tickEnd와 같은 형태)
    c.damage({ src: null, tgt: e, base: e.hp + 99, type: 'true', tags: ['dot', 'burn'] });
    expect(e.dead).toBe(true);
    // 참격은 여전히 한 번 일어선다
    const b = combatWith('frozen-explorer', 12);
    b.c.damage({ src: b.c.p, tgt: b.e, base: b.e.hp + 99, type: 'slash', attack: true });
    expect(b.e.dead).toBe(false);
  });

  it('별의 유충의 헌신은 처치가 아니다 (처치 유물이 발동하지 않고 보상 없이 사라진다)', () => {
    const c = startCombat(runAt(4), 'a4-boss-starlord', { anomaly: null });
    const lord = c.alive.find((x) => x.def === 'starspawn-lord')!;
    const e = c.alive.find((x) => x.def === 'star-larva')!;
    lord.hp -= 50;
    gainRelic(c.run, 'x-casing-pouch');
    c.s.ammo = 0;
    const hp = lord.hp;
    act(c, e, 'offer');
    expect(lord.hp).toBe(hp + 12);
    expect(e.dead).toBe(true);
    expect(e.fled).toBe(true);
    expect(c.s.ammo).toBe(0);
  });

  it('적이 제 편을 해치우는 것(대사제의 봉헌, 구울 왕이 새끼를 삼킴)은 플레이어의 처치가 아니다', () => {
    // 대사제: 제물 하나를 죽여 힘 +2, 체력 18 회복
    const a = startCombat(runAt(2), 'a2-boss-priest', { anomaly: null });
    gainRelic(a.run, 'x-casing-pouch');
    a.s.ammo = 0;
    const priest = a.alive.find((x) => x.def === 'high-priest')!;
    const offerings = a.alive.filter((x) => x.def === 'offering').length;
    act(a, priest, 'offer');
    expect(a.alive.filter((x) => x.def === 'offering').length).toBe(offerings - 1);
    expect(priest.st.str).toBe(2);
    expect(a.s.ammo).toBe(0);
    // 구울 왕: 시체가 없으면 제 새끼를 삼킨다 (삼킨 새끼는 시체로 남지 않는다)
    const b = startCombat(runAt(2), 'a2-boss-ghoulking', { anomaly: null });
    gainRelic(b.run, 'x-casing-pouch');
    b.s.ammo = 0;
    const king = b.alive.find((x) => x.def === 'ghoul-king')!;
    king.hp -= 100;
    const hp = king.hp;
    act(b, king, 'feast');
    expect(king.hp).toBe(hp + 24);
    expect(b.alive.filter((x) => x.def === 'ghoul-pup').length).toBe(1);
    expect(b.s.ammo).toBe(0);
    expect(b.s.enemies.filter((x) => x.dead && !x.fled).length).toBe(0);
  });

  it('3층 혹한: 추가로 닳은 등불 때문에 어둠에 들어서면, 확인 화면이 알린 대로 정신력 -2를 치른다 (한 번만)', () => {
    const drop = (light: number) => {
      const run = runAt(3, 303);
      run.player.sanity = run.player.maxSanity = 100;
      const f = run.floor!;
      const to = f.rooms[f.pos].links[0];
      f.rooms[to].type = 'camp';
      run.light = light;
      expect(moveTo(run, to)).toBeNull();
      return 100 - run.player.sanity;
    };
    // 36 → 기본 소모 8 → 28 (아직 희미함) → 혹한 4 → 24 (어둠)
    expect(drop(36)).toBe(2);
    // 30 → 22 (기본 소모만으로 어둠: 엔진이 -2) → 18. 두 번 깎지 않는다
    expect(drop(30)).toBe(2);
    // 끝까지 희미함이면 그대로
    expect(drop(60)).toBe(0);
  });
});

describe('층과 이벤트', () => {
  it('모든 이벤트의 모든 선택지가 막힘 없이 끝나고, 이벤트 전투는 지금 층의 조우다', () => {
    const wrong: string[] = [];
    for (const ev of EVENTS.values()) {
      for (const act of ev.acts) {
        for (let seed = 1; seed <= 6; seed++) {
          const probe = runAt(act, seed);
          startEvent(probe, ev.id);
          const n = eventView(probe)!.choices.length;
          for (let i = 0; i < n; i++) {
            const run = runAt(act, seed);
            run.consumables = ['molotov', 'holy-water', null];
            startEvent(run, ev.id);
            let guard = 0;
            let idx = i;
            while (run.event && !run.event.done && guard++ < 5) {
              const view = eventView(run)!;
              const ch = view.choices[idx];
              if (!ch || ch.disabled) break;
              const why = chooseEvent(run, idx);
              if (why) wrong.push(`${ev.id}#${i}: ${why}`);
              idx = 0;
              if (run.event && !run.event.done && !eventView(run)!.choices.some((x) => !x.disabled)) wrong.push(`${ev.id}#${i}: 고를 수 있는 선택지가 없는 단계`);
            }
            const fight = run.event?.fight;
            if (fight) {
              const enc = ENCOUNTERS.find((x) => x.id === fight);
              if (!enc) wrong.push(`${ev.id}#${i}: 없는 조우 ${fight}`);
              else if (enc.act !== act) wrong.push(`${ev.id}#${i} (${act}층): ${fight}는 ${enc.act}층 조우`);
            }
          }
        }
      }
    }
    expect([...new Set(wrong)]).toEqual([]);
  });

  it('가진 것이 없어도 모든 이벤트에 고를 수 있는 선택지가 있다 (막다른 이벤트 없음)', () => {
    const stuck: string[] = [];
    for (const ev of EVENTS.values()) {
      for (const act of ev.acts) {
        const run = runAt(act);
        run.player.gold = 0;
        run.player.insight = 0;
        run.light = 0;
        run.consumables = run.consumables.map(() => null);
        run.madness = [];
        if (run.floor) run.floor.hours = 0;
        startEvent(run, ev.id);
        if (!eventView(run)!.choices.some((x) => !x.disabled)) stuck.push(`${ev.id} (${act}층)`);
      }
    }
    expect(stuck).toEqual([]);
  });

  it('계층군주의 숨은 조건이 차면 군주가 나타난다 (1·2·4층)', () => {
    const appears = (act: number, signals: (run: RunState) => void) => {
      const run = runAt(act, 50 + act);
      const f = run.floor!;
      // 군주 방은 이미 지나간 방에 나타난다
      for (const r of f.rooms) if (r.type === 'combat') r.cleared = true;
      signals(run);
      return f.lord.room >= 0 && f.rooms[f.lord.room].type === 'lord';
    };
    // 1층: 조수가 차오른 뒤 익사체가 있는 전투 승리 + 조수 3단계 이후
    expect(
      appears(1, (run) => {
        run.floor!.tide = 1;
        floorSignal(run, { t: 'combat', enc: 'a1-drowned2', kind: 'normal' });
        floorSignal(run, { t: 'combat', enc: 'a1-lurker', kind: 'normal' });
        floorSignal(run, { t: 'tide', tide: 3 });
        floorSignal(run, { t: 'tide', tide: 4 });
      }),
    ).toBe(true);
    // 2층: 종탑의 종을 울림(+2), 종이 울림(+1), 종이 두 번 울린 뒤 교단 신도 전투 승리(+1씩)
    expect(
      appears(2, (run) => {
        run.floor!.hours = 24;
        floorSignal(run, { t: 'event', id: 'a2-belfry' });
        floorSignal(run, { t: 'tide', tide: 2 });
        floorSignal(run, { t: 'combat', enc: 'a2-ghouls', kind: 'normal' });
        floorSignal(run, { t: 'combat', enc: 'a2-sermon', kind: 'normal' });
        floorSignal(run, { t: 'combat', enc: 'a2-cell', kind: 'normal' });
      }),
    ).toBe(true);
    // 4층: 유성이 떨어진 구덩이를 밟음(서로 다른 곳마다 +1), 조수 4단계(+1)
    expect(
      appears(4, (run) => {
        const f = run.floor!;
        const craters = f.rooms.filter((r) => r.meteor !== undefined).slice(0, 2);
        expect(craters.length).toBe(2);
        for (const r of craters) {
          f.vars['meteor' + r.id] = 1;
          floorSignal(run, { t: 'move', room: r.id });
          floorSignal(run, { t: 'move', room: r.id });
        }
        floorSignal(run, { t: 'tide', tide: 4 });
      }),
    ).toBe(true);
  });

  it('잃어버린 아이의 선물은 소모품 칸이 가득 차 있어도 사라지지 않는다 (보상 화면으로)', () => {
    let checked = false;
    for (let seed = 1; seed <= 40 && !checked; seed++) {
      const run = runAt(1, seed);
      run.consumables = run.consumables.map(() => 'bandage');
      startEvent(run, 'lost-child');
      chooseEvent(run, 0);
      if (!run.event?.result?.includes('소년')) continue;
      checked = true;
      expect(run.event.loot?.some((x) => x.kind === 'consumable')).toBe(true);
    }
    expect(checked).toBe(true);
  });

  it('4층 법칙의 문구대로: 조수는 12시간마다 두 단계, 유성에 맞으면 최대 체력 25% 피해와 정신력 손실', () => {
    const law = FLOORS.get(4)!.law;
    expect(law).toContain('12시간마다 두 단계');
    expect(law).toContain('정신력 -5');
    const run = runAt(4, 404);
    run.player.maxHp = run.player.hp = 100;
    run.player.sanity = run.player.maxSanity = 100;
    const f = run.floor!;
    const to = f.rooms[f.pos].links[0];
    f.rooms[to].type = 'empty';
    f.rooms[to].meteor = f.hours + 1;
    moveTo(run, to);
    expect(run.player.hp).toBe(75);
    expect(run.player.sanity).toBeLessThan(100);
    expect(f.tide).toBe(0);
    f.hours = 11;
    const back = f.rooms[to].links[0];
    f.rooms[back].type = 'empty';
    moveTo(run, back);
    expect(f.tide).toBe(2);
  });
});
