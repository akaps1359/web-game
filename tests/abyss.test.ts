import { describe, expect, it } from 'vitest';
import '../src/content';
import GAME_ICONS from '@iconify-json/game-icons/icons.json';
import { Combat, type CombatEvent } from '../src/engine/combat';
import { MADNESS } from '../src/engine/registry';
import { camp } from '../src/engine/places';
import { openShop } from '../src/engine/shop';
import { advanceTime, descend, guardianRestHp, lightCost, startGuardian } from '../src/engine/dungeon';
import { essenceCap, finishCombat, newRun, startCombat, takeBeginEvents, type RunState } from '../src/engine/run';
import {
  ABYSS_LEVELS,
  ABYSS_TUNE,
  LV,
  MAX_ASC,
  abyssActive,
  abyssDmgMult,
  abyssEssenceDrop,
  abyssAmbushStrike,
  abyssHpMult,
  abyssLine,
} from '../src/engine/abyss';
import { ABYSS_RISE, WHISPERS } from '../src/content/abyss';
import { FROZEN_ROOM } from '../src/content/act3/anomalies';
import { absorbRun, defaultMeta, unlockAllInfo } from '../src/state/meta';
import { simulateRun, botAsc } from '../src/sim/runbot';

/**
 * 심연 단계 (2026-10 개편): 0~15, 단계마다 규칙 하나씩 쌓인다. 5·10·15단계는 특별한 규칙.
 * 단계표·수치 규칙 = engine/abyss.ts (단계 번호는 LV), 특별한 규칙 = content/abyss.ts
 */

const run = (asc: number, seed = 7, origin = 'soldier') => newRun({ seed, origin, asc });
/** JSON으로 저장했다가 불러온 판 (state/save.ts와 같은 방식) */
const reload = (r: RunState): RunState => JSON.parse(JSON.stringify(r)) as RunState;

function fight(r: RunState, enc: string, opts: { anomaly?: string | null; ambush?: boolean } = {}): Combat {
  r.player.maxHp = r.player.hp = 9999;
  return startCombat(r, enc, opts);
}

const unit = (c: Combat, def: string) => c.s.enemies.find((e) => e.def === def && !e.dead)!;

describe('단계표', () => {
  it('1~15단계가 하나씩, 5·10·15단계만 특별하다', () => {
    expect(MAX_ASC).toBe(15);
    expect(ABYSS_LEVELS.map((l) => l.n)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(new Set(Object.values(LV)).size).toBe(15);
    expect(ABYSS_LEVELS.filter((l) => l.star).map((l) => [l.n, l.star])).toEqual([
      [5, 1],
      [10, 2],
      [15, 3],
    ]);
    expect([LV.voice, LV.rise, LV.tide]).toEqual([5, 10, 15]);
    const icons = (GAME_ICONS as { icons: Record<string, unknown> }).icons;
    for (const l of ABYSS_LEVELS) {
      expect(l.name.length, `${l.n}`).toBeGreaterThan(0);
      expect(l.desc.length, `${l.n}`).toBeGreaterThan(0);
      expect(icons[l.icon.replace(/^gi:/, '')], `${l.n} 아이콘 ${l.icon}`).toBeTruthy();
      // 문장 가이드: 긴 줄표를 쓰지 않는다
      expect(l.desc.includes('—'), `${l.n}: ${l.desc}`).toBe(false);
      // 한눈에 읽히게: 한 줄 효과는 짧게, 설명은 두 문장까지
      expect(l.short.length, `${l.n}: ${l.short}`).toBeLessThanOrEqual(18);
      expect(l.desc.split('.').filter((x) => x.trim()).length, `${l.n}: ${l.desc}`).toBeLessThanOrEqual(2);
    }
  });

  it('규칙은 쌓인다: n단계에는 1~n단계 규칙이 모두 켜진다', () => {
    expect(abyssActive(0)).toEqual([]);
    for (let n = 1; n <= MAX_ASC; n++) {
      const a = abyssActive(n);
      expect(a.map((l) => l.n)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(abyssActive(n - 1).every((l) => a.includes(l))).toBe(true);
    }
  });

  it('진행 중인 판의 한 줄', () => {
    expect(abyssLine(run(0))).toContain('0단계');
    const r = run(7);
    expect(abyssLine(r)).toContain('7단계');
    expect(abyssLine(r)).toContain('규칙 7개');
    expect(abyssLine(r)).toContain(MADNESS.get(r.abyss!.whisper!)!.name);
  });
});

describe('단계별 규칙', () => {
  it('굶주린 것들: 적의 공격 피해 +10% (미리보기·실제 모두)', () => {
    const a = fight(run(LV.dmg - 1), 'a1-rats');
    const b = fight(run(LV.dmg), 'a1-rats');
    const pa = a.preview(a.alive[0], a.p, 100, 'blunt');
    const pb = b.preview(b.alive[0], b.p, 100, 'blunt');
    expect(pb / pa).toBeCloseTo(1 + ABYSS_TUNE.enemyDmg, 1);
  });

  it('어둠 속의 것들: 어둠 속에서 기습당하면 행동력 -1 대신 내 첫 턴 전에 적의 차례가 한 번 온다', () => {
    expect(abyssAmbushStrike(run(LV.ambush))).toBe(true);
    expect(abyssAmbushStrike(run(LV.ambush - 1))).toBe(false);
    const enemyTurns = (c: Combat) => takeBeginEvents(c.run).filter((e: CombatEvent) => e.t === 'turn' && e.side === 'enemy').length;

    // 그 아래 단계: 원래대로 행동력 -1
    const old = fight(run(LV.ambush - 1), 'a1-butcher', { ambush: true });
    expect(enemyTurns(old)).toBe(0);
    expect(old.s.ap).toBe(old.p.maxAp - 1);
    expect(unit(old, 'butcher').hist).toEqual([]);

    const c = fight(run(LV.ambush), 'a1-butcher', { ambush: true });
    expect(enemyTurns(c)).toBe(1);
    expect(unit(c, 'butcher').hist.length).toBe(1);
    expect(c.s.phase).toBe('player');
    expect(c.s.turn).toBe(1);
    expect(c.s.ap).toBe(c.p.maxAp);
    // 다음 의도가 다시 정해져 있다
    expect(unit(c, 'butcher').intent).not.toBeNull();

    // 기습이 아니면 그대로
    const calm = fight(run(LV.ambush), 'a1-butcher');
    expect(enemyTurns(calm)).toBe(0);
    expect(unit(calm, 'butcher').hist).toEqual([]);
  });

  it('어둠 속의 것들: 얼음에 갇힌 적은 먼저 덮치지 못한다 (3층 얼어붙은 방)', () => {
    const c = fight(run(LV.ambush, 13), 'a3-shantak', { anomaly: FROZEN_ROOM, ambush: true });
    expect(c.p.hp).toBe(c.p.maxHp);
    expect(c.s.phase).toBe('player');
  });

  it('값을 올린 상인: 상점 값 +15%', () => {
    const prices = (asc: number) => {
      const r = run(asc, 11);
      openShop(r, 'haven');
      return r.shop!.items.map((x) => [x.id, x.price] as const);
    };
    const a = prices(LV.shop - 1);
    const b = prices(LV.shop);
    expect(b.map((x) => x[0])).toEqual(a.map((x) => x[0]));
    b.forEach(([, p], i) => expect(Math.abs(p - a[i][1] * (1 + ABYSS_TUNE.shop))).toBeLessThanOrEqual(1.5));
  });

  it('얕은 잠: 야영지 수면 회복이 줄어든다', () => {
    const slept = (asc: number) => {
      const r = run(asc, 5);
      const f = r.floor!;
      const room = f.rooms.find((x) => x.type === 'camp')!;
      f.pos = room.id;
      r.screen = 'camp';
      r.player.hp = 1;
      expect(camp(r, 'sleep')).toBeNull();
      return (r.player.hp - 1) / r.player.maxHp;
    };
    expect(slept(LV.sleep - 1)).toBeCloseTo(0.3, 1);
    expect(slept(LV.sleep)).toBeCloseTo(ABYSS_TUNE.sleep, 1);
  });

  it('아래의 목소리: 층마다 다른 광기 하나, 그 층에서만, 광기 한도에는 세지 않는다', () => {
    expect(run(LV.voice - 1).abyss?.whisper).toBeUndefined();
    const r = run(LV.voice);
    const first = r.abyss!.whisper!;
    expect(WHISPERS).toContain(first);
    expect(r.madness).toEqual([]);
    expect(r.log.some((l) => l.includes('목소리'))).toBe(true);
    // 같은 시드면 같은 목소리 (판의 시드에서 뽑는다)
    expect(run(LV.voice).abyss!.whisper).toBe(first);
    // 층을 내려가면 다른 목소리로 바뀐다
    const heard = [first];
    for (let i = 0; i < 4; i++) {
      r.screen = 'haven';
      descend(r);
      const w = r.abyss!.whisper!;
      expect(heard).not.toContain(w);
      heard.push(w);
    }
    expect(r.abyss!.heard).toEqual(heard);
    expect(r.madness).toEqual([]);
  });

  it('아래의 목소리: 그 광기가 전투에 걸린다 (편집증 → 전투 시작 시 공포 2)', () => {
    const r = run(LV.voice);
    r.abyss!.whisper = 'paranoia';
    const c = fight(r, 'a1-rats');
    expect(c.p.st.dread ?? 0).toBeGreaterThanOrEqual(2);
    // 그 단계 아래에서는 걸리지 않는다 (목소리가 남아 있어도)
    const low = run(LV.voice - 1);
    low.abyss = { whisper: 'paranoia' };
    expect(fight(low, 'a1-rats').p.st.dread ?? 0).toBe(0);
  });

  it('빈손: 시작 골드·소모품 없이 내려간다', () => {
    const a = run(LV.start - 1);
    const b = run(LV.start);
    expect(a.player.gold).toBeGreaterThan(0);
    expect(a.consumables.some(Boolean)).toBe(true);
    expect(b.player.gold).toBe(0);
    expect(b.consumables.every((x) => x === null)).toBe(true);
  });

  it('질긴 것들·완고한 것들: 적의 체력 +5%, 정예·수호자는 +10% 더', () => {
    const hp = (asc: number) => unit(fight(run(asc), 'a1-boss-lightkeeper'), 'lightkeeper').maxHp;
    const base = hp(LV.hp - 1);
    expect(hp(LV.hp) / base).toBeCloseTo(1 + ABYSS_TUNE.enemyHp, 1);
    expect(hp(LV.eliteHp) / base).toBeCloseTo(1 + ABYSS_TUNE.enemyHp + ABYSS_TUNE.eliteBossHp, 1);
    const top = run(LV.eliteHp);
    expect(abyssHpMult(top, 'normal')).toBeCloseTo(1 + ABYSS_TUNE.enemyHp);
    expect(abyssHpMult(top, 'minion')).toBeCloseTo(1 + ABYSS_TUNE.enemyHp);
    expect(abyssHpMult(top, 'elite')).toBeCloseTo(1 + ABYSS_TUNE.enemyHp + ABYSS_TUNE.eliteBossHp);
    expect(abyssHpMult(run(LV.hp - 1), 'boss')).toBe(1);
  });

  it('기름 먹는 어둠: 이동마다 등불이 더 닳는다', () => {
    expect(lightCost(run(LV.light)) - lightCost(run(LV.light - 1))).toBe(ABYSS_TUNE.light);
  });

  it('옅어진 정수: 일반 적·정예의 정수 확률이 줄고, 수호자는 그대로', () => {
    expect(abyssEssenceDrop(run(LV.essence - 1), 'normal')).toBe(1);
    expect(abyssEssenceDrop(run(LV.essence), 'normal')).toBe(ABYSS_TUNE.essenceDrop);
    expect(abyssEssenceDrop(run(LV.essence), 'elite')).toBe(ABYSS_TUNE.essenceDrop);
    expect(abyssEssenceDrop(run(LV.essence), 'boss')).toBe(1);
  });

  it('두 번째 모습: 층 수호자는 한 번 다시 일어선다 (체력·힘·버팀), 두 번째는 진짜로 쓰러진다', () => {
    const before = fight(run(LV.rise - 1), 'a1-boss-lightkeeper');
    expect(unit(before, 'lightkeeper').st[ABYSS_RISE]).toBeUndefined();

    const c = fight(run(LV.rise), 'a1-boss-lightkeeper');
    const boss = unit(c, 'lightkeeper');
    expect(boss.st[ABYSS_RISE]).toBe(1);
    // 하수인(등명기)에게는 없다
    expect(c.s.enemies.filter((e) => e !== boss).every((e) => !e.st[ABYSS_RISE])).toBe(true);
    const str0 = boss.st.str ?? 0;
    boss.poise = 0;
    c.kill(boss);
    expect(boss.dead).toBe(false);
    expect(boss.hp).toBe(Math.ceil(boss.maxHp * ABYSS_TUNE.riseHp));
    expect(boss.st.str ?? 0).toBe(str0 + ABYSS_TUNE.riseStr);
    expect(boss.st[ABYSS_RISE]).toBeUndefined();
    expect(boss.poise).toBe(boss.maxPoise);
    expect(c.over).toBe(false);
    // 다시 일어서는 동안 처치 수는 오르지 않는다
    expect(c.run.stats.kills).toBe(0);
    c.kill(boss);
    expect(boss.dead).toBe(true);
  });

  it('두 번째 모습: 계층군주도 일어서지만, 최종 수호자 별의 태아는 빼고, 정예는 아니다', () => {
    expect(unit(fight(run(LV.rise), 'lord-a5'), 'dream-eater').st[ABYSS_RISE]).toBe(1);
    expect(unit(fight(run(LV.rise), 'a5-boss-fetus'), 'star-fetus').st[ABYSS_RISE]).toBeUndefined();
    expect(fight(run(LV.rise), 'a1-butcher').alive.every((e) => !e.st[ABYSS_RISE])).toBe(true);
  });

  it('사나운 수호자: 수호자 전투에서만 적의 공격 피해가 더 오른다', () => {
    const lo = run(LV.bossDmg - 1);
    const hi = run(LV.bossDmg);
    expect(abyssDmgMult(hi, 'boss') / abyssDmgMult(lo, 'boss')).toBeCloseTo(1 + ABYSS_TUNE.bossDmg);
    expect(abyssDmgMult(hi, 'elite')).toBeCloseTo(abyssDmgMult(lo, 'elite'));
    expect(abyssDmgMult(hi, 'normal')).toBeCloseTo(abyssDmgMult(lo, 'normal'));
    const a = fight(run(LV.bossDmg - 1), 'a1-boss-queen');
    const b = fight(run(LV.bossDmg), 'a1-boss-queen');
    const pa = a.preview(unit(a, 'queen'), a.p, 100, 'slash');
    const pb = b.preview(unit(b, 'queen'), b.p, 100, 'slash');
    expect(pb / pa).toBeCloseTo(1 + ABYSS_TUNE.bossDmg, 1);
  });

  it('좁아진 그릇: 정수 자리 -1', () => {
    expect(essenceCap(run(LV.slots - 1))).toBe(4);
    expect(essenceCap(run(LV.slots))).toBe(4 - ABYSS_TUNE.slots);
    const r = run(LV.slots);
    r.stats.bosses = 2;
    expect(essenceCap(r)).toBe(6 - ABYSS_TUNE.slots);
  });

  it('인색한 심연: 전투에서 얻는 골드 -25%', () => {
    const gold = (asc: number) => {
      const r = run(asc, 9);
      const c = fight(r, 'a1-rats');
      for (const e of c.alive) c.kill(e);
      c.endTurn();
      expect(c.s.phase).toBe('victory');
      return finishCombat(r)!.gold;
    };
    const lo = gold(LV.gold - 1);
    expect(Math.abs(gold(LV.gold) - lo * ABYSS_TUNE.gold)).toBeLessThanOrEqual(1);
  });

  it('수호자 앞 숨 고르기는 어느 단계에서나 체력 전부', () => {
    const r = run(MAX_ASC, 9);
    r.floor!.pos = r.floor!.portal;
    r.player.hp = 1;
    expect(guardianRestHp(r)).toBe(r.player.maxHp);
    expect(startGuardian(r)).toBeNull();
    expect(r.player.hp).toBe(r.player.maxHp);
  });

  it('물러나지 않는 조수: 새 층은 지난 층 조수의 절반에서 시작하고, 거기서 다시 차오른다', () => {
    for (const asc of [LV.tide - 1, LV.tide]) {
      const r = run(asc, 3);
      r.floor!.tide = 5;
      r.screen = 'haven';
      descend(r);
      const f = r.floor!;
      const base = asc >= LV.tide ? Math.floor(5 * ABYSS_TUNE.tideCarry) : 0;
      expect(f.act).toBe(2);
      expect(f.tide).toBe(base);
      expect(f.vars.tideBase ?? 0).toBe(base);
      advanceTime(r, 12);
      expect(f.tide).toBe(base + 1);
    }
  });
});

describe('해금', () => {
  const ended = (asc: number, won: boolean): RunState => {
    const r = run(asc);
    r.over = { won, reason: won ? '귀환' : '쓰러졌다' };
    return r;
  };

  it('처음엔 0단계만, N단계를 깨면 N+1단계가 열린다', () => {
    const m = defaultMeta();
    expect(m.abyss).toBe(0);
    absorbRun(m, ended(0, false), true);
    expect(m.abyss).toBe(0);
    absorbRun(m, ended(0, true), true);
    expect(m.abyss).toBe(1);
    // 1단계를 깨야 2단계
    absorbRun(m, ended(1, true), true);
    expect(m.abyss).toBe(2);
    // 낮은 단계를 깨도 내려가지 않는다
    absorbRun(m, ended(0, true), true);
    expect(m.abyss).toBe(2);
    // 진 판, 아직 끝나지 않은 판은 열지 않는다
    absorbRun(m, ended(2, false), true);
    absorbRun(m, ended(2, true), false);
    expect(m.abyss).toBe(2);
  });

  it('최고 단계 위로는 열리지 않는다', () => {
    const m = defaultMeta();
    m.abyss = MAX_ASC;
    absorbRun(m, ended(MAX_ASC, true), true);
    expect(m.abyss).toBe(MAX_ASC);
  });

  it('테스트 모드: 모든 정보 해금은 심연 최고 단계까지 연다', () => {
    const m = defaultMeta();
    unlockAllInfo(m);
    expect(m.abyss).toBe(MAX_ASC);
  });
});

describe('저장·불러오기', () => {
  it('단계와 목소리·남은 조수가 저장을 넘어 이어진다', () => {
    const r = run(MAX_ASC, 21);
    r.floor!.tide = 4;
    r.screen = 'haven';
    descend(r);
    const back = reload(r);
    expect(back.asc).toBe(MAX_ASC);
    expect(back.abyss).toEqual(r.abyss);
    expect(back.floor!.tide).toBe(r.floor!.tide);
    expect(back.floor!.vars.tideBase).toBe(r.floor!.vars.tideBase);
    advanceTime(back, 12);
    expect(back.floor!.tide).toBe(r.floor!.vars.tideBase! + 1);
    // 불러온 판에서도 다음 층의 목소리는 겹치지 않는다 (같은 판을 두 번 불러와도 같은 목소리)
    const again = reload(r);
    again.screen = back.screen = 'haven';
    descend(back);
    descend(again);
    expect(back.abyss!.whisper).toBe(again.abyss!.whisper);
    expect(r.abyss!.heard).not.toContain(back.abyss!.whisper);
  });

  it('전투 중에 저장했다 불러와도 수호자의 두 번째 모습과 공격 배율이 그대로', () => {
    const r = run(Math.max(LV.bossDmg, LV.rise));
    const c = fight(r, 'a1-boss-queen');
    const before = c.preview(unit(c, 'queen'), c.p, 100, 'slash');
    const back = reload(r);
    const c2 = new Combat(back);
    const boss = unit(c2, 'queen');
    expect(boss.st[ABYSS_RISE]).toBe(1);
    expect(c2.preview(boss, c2.p, 100, 'slash')).toBe(before);
    c2.kill(boss);
    expect(boss.dead).toBe(false);
  });

  it('예전 저장(심연 상태 없음)도 그대로 돈다', () => {
    const r = reload(run(0));
    delete (r as Partial<RunState>).abyss;
    const c = fight(r, 'a1-rats');
    expect(c.over).toBe(false);
    expect(abyssLine(r)).toContain('0단계');
  });
});

describe('봇', () => {
  it('최고 단계에서도 판이 끝까지 돈다', () => {
    botAsc.value = MAX_ASC;
    try {
      for (const origin of ['soldier', 'hunter', 'occultist']) {
        const res = simulateRun(4242, origin);
        expect(res.reason, origin).not.toBe('시간 초과');
        expect(res.act).toBeGreaterThanOrEqual(1);
      }
    } finally {
      botAsc.value = 0;
    }
  }, 120000);
});
