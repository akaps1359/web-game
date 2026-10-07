import { describe, expect, it } from 'vitest';
import '../src/content';
import {
  DISGUISE_REVEAL,
  HIDDEN_REVEAL,
  ACT_SAN_MULT,
  INSIGHT_WEAK,
  INSIGHT_WEAK_CAP,
  MAX_MADNESS,
  WEAK_BONUS,
  shownIntentOf,
  type Combat,
} from '../src/engine/combat';
import { CONSUMABLES, ENEMIES, EQUIPS, EVENTS, MADNESS, SKILLS } from '../src/engine/registry';
import { absorbEssence, gainRelic, learnSkill, newRun, removeEssence, rollConsumable, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import { chooseEvent, eventView, startEvent } from '../src/engine/events';
import { INN_SANITY, MEDITATE_SANITY, PRAY_SANITY, inn } from '../src/engine/places';
import type { Intent } from '../src/engine/types';
import { INSIGHT_PRICE } from '../src/content/eventkit';
import { DARK_REVEAL, LIAR_REVEAL } from '../src/content/act4/patterns';
import { ILLUSION_SIGHT } from '../src/content/act5/dream';
import { FALSE_DOOR_SIGHT } from '../src/content/act5/enemies';
import { INSIGHT_STEPS } from '../src/ui/text';

/**
 * 통찰 (2026-10 개편, 2차): 대가 없이 들어오지 않는다 — 영구 대가를 치르는 선택·금기·수호자 유물만. 1점마다 보이는 것이 늘어난다.
 */

/** 유물·장비·층의 법칙이 섞이지 않는 깨끗한 판 */
function clean(seed = 7): RunState {
  const run = newRun({ seed, origin: 'soldier' });
  run.floor = null;
  run.relics = [];
  run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
  run.player.level = 20;
  return run;
}

function fight(insight: number, enc = 'a1-cult', knownWeak: Record<string, string[]> = {}): Combat {
  const run = clean();
  run.player.insight = insight;
  run.knownWeak = knownWeak;
  const c = startCombat(run, enc, { anomaly: null });
  c.snapshots = false;
  return c;
}

describe('이계 정수: 통찰을 주지 않는다 (수호자의 것도)', () => {
  it('보통이든 수호자(보스)의 것이든 최대 정신력 -5만', () => {
    const run = clean();
    const san = run.player.maxSanity;
    expect(absorbEssence(run, { id: 'lurker', color: 0 })).toBeNull();
    expect(absorbEssence(run, { id: 'fisherman', color: 0, guardian: true }, null)).toBeNull();
    expect(absorbEssence(run, { id: 'ash-buried', color: 0, guardian: true }, null)).toBeNull();
    expect(run.player.insight).toBe(0);
    expect(run.player.maxSanity).toBe(san - 15);
  });

  it('보통판을 수호자판으로 바꿔 흡수해도 대가는 한 번, 통찰은 없다', () => {
    const run = clean();
    const san = run.player.maxSanity;
    expect(absorbEssence(run, { id: 'fisherman', color: 0 })).toBeNull();
    expect(absorbEssence(run, { id: 'fisherman', color: 0, guardian: true }, null)).toBeNull();
    expect(run.player.insight).toBe(0);
    expect(run.player.maxSanity).toBe(san - 5);
  });

  it('돈을 내고 지우면 최대 정신력을 돌려받고, 다른 길로 얻은 통찰은 그대로', () => {
    const run = clean();
    run.player.gold = 9999;
    const san = run.player.maxSanity;
    absorbEssence(run, { id: 'fisherman', color: 0, guardian: true }, null);
    run.player.insight = 2;
    expect(removeEssence(run, run.essences[0].uid)).toBeNull();
    expect(run.player.insight).toBe(2);
    expect(run.player.maxSanity).toBe(san);
  });

  it('정수에는 통찰 스탯이 없다', async () => {
    const { ESSENCES } = await import('../src/engine/registry');
    for (const es of ESSENCES.values()) expect(es.stats.insight ?? 0, es.id).toBe(0);
  });
});

describe('통찰 1·2: 약점이 보인다', () => {
  it('통찰 0이면 도감에서 아는 것만, 1이면 적마다 아직 모르는 약점 하나, 2면 전부', () => {
    const c0 = fight(0);
    for (const e of c0.alive) expect(e.known).toEqual([]);
    const c1 = fight(1);
    for (const e of c1.alive) {
      expect(e.weak.length).toBeGreaterThan(1);
      expect(e.known.length).toBe(1);
      expect(e.weak).toContain(e.known[0]);
    }
    const c2 = fight(2);
    for (const e of c2.alive) expect([...e.known].sort()).toEqual([...e.weak].sort());
  });

  it('통찰 1은 도감 지식 위에 하나를 더 보여 준다', () => {
    const c = fight(1, 'a1-cult', { thug: ['pierce'] });
    const thug = c.alive.find((e) => e.def === 'thug')!;
    expect([...thug.known].sort()).toEqual(['arcane', 'pierce']);
  });

  it('전투 중에 통찰을 얻으면 바로 보이고, 같은 통찰로 두 번 보이지는 않는다', () => {
    const c = fight(0);
    c.gainInsight(1);
    for (const e of c.alive) expect(e.known.length).toBe(1);
    for (const e of c.alive) c.senseWeak(e);
    for (const e of c.alive) expect(e.known.length).toBe(1);
    // 나중에 나타난 적도 하나
    const late = c.spawn('initiate', 1)!;
    expect(late.known.length).toBe(1);
    c.gainInsight(1);
    for (const e of c.alive) expect([...e.known].sort()).toEqual([...e.weak].sort());
  });
});

describe('통찰 3: 숨겨진·거짓 의도 / 4: 4층의 어둠', () => {
  const lie: Intent = { move: 'stab', kind: 'attack', label: '찌른다', dmg: 9, disguise: { kind: 'block', label: '웅크린다' } };

  it('거짓 의도는 통찰 3(기본 reveal)부터 간파한다', () => {
    expect(DISGUISE_REVEAL).toBe(3);
    expect(HIDDEN_REVEAL).toBe(3);
    expect(shownIntentOf(lie, 2)!.move).toBe('_disguise');
    expect(shownIntentOf(lie, 2)!.kind).toBe('block');
    expect(shownIntentOf(lie, 3)!.move).toBe('stab');
    // 의도마다 따로 정한 문턱은 그대로
    const deep: Intent = { ...lie, disguise: { ...lie.disguise!, reveal: DARK_REVEAL } };
    expect(DARK_REVEAL).toBe(4);
    expect(shownIntentOf(deep, 3)!.move).toBe('_disguise');
    expect(shownIntentOf(deep, 4)!.move).toBe('stab');
  });

  it('캐릭터 화면·용어 풀이의 통찰 단계가 실제 문턱과 같다', () => {
    const at = (s: string) => INSIGHT_STEPS.find((x) => x.text.includes(s))!.at;
    expect(at('약점 하나')).toBe(1);
    expect(at('모두 보인다')).toBe(2);
    expect(at('거짓 의도')).toBe(DISGUISE_REVEAL);
    expect(at('4층의 어둠')).toBe(DARK_REVEAL);
    expect(at('5층의 환영')).toBe(ILLUSION_SIGHT);
    expect(at('파라오')).toBe(LIAR_REVEAL);
    expect(at('꿈의 문지기')).toBe(FALSE_DOOR_SIGHT);
  });
});

describe('약점 공격 피해: 누구나 +25%, 통찰 1당 +6% 더 (8까지)', () => {
  function target(insight: number) {
    const c = fight(insight);
    c.p.str = 0;
    const e = c.alive[0];
    e.weak = ['fire'];
    e.known = [];
    e.resist = {};
    e.st = {};
    e.block = 0;
    e.hp = e.maxHp = 9999;
    e.maxPoise = e.poise = 0;
    return { c, e };
  }
  const hitFor = (insight: number, type: 'fire' | 'slash' = 'fire', attack = true) => {
    const { c, e } = target(insight);
    return c.damage({ src: c.p, tgt: e, base: 100, type, attack }).amount;
  };

  it('약점을 찌르는 내 공격만 강해진다', () => {
    expect(WEAK_BONUS).toBe(0.25);
    expect(INSIGHT_WEAK).toBe(0.06);
    expect(INSIGHT_WEAK_CAP).toBe(8);
    expect(hitFor(0)).toBe(125);
    expect(hitFor(1)).toBe(131);
    expect(hitFor(5)).toBe(155);
    expect(hitFor(8)).toBe(173);
    expect(hitFor(12)).toBe(173); // 8에서 멈춘다
    expect(hitFor(5, 'slash')).toBe(100); // 약점이 아니면 그대로
    expect(hitFor(5, 'fire', false)).toBe(100); // 공격이 아닌 피해는 그대로
  });

  it('적이 플레이어를 칠 때는 상관없다', () => {
    const { c, e } = target(8);
    c.p.block = 0;
    const d = c.damage({ src: e, tgt: c.p, base: 10, type: 'fire', attack: true });
    const { c: c0, e: e0 } = target(0);
    c0.p.block = 0;
    expect(d.amount).toBe(c0.damage({ src: e0, tgt: c0.p, base: 10, type: 'fire', attack: true }).amount);
  });

  it('미리보기에는 알아낸 약점만 반영한다 (모르는 약점을 숫자로 흘리지 않는다)', () => {
    const { c, e } = target(5);
    expect(c.preview(c.p, e, 100, 'fire')).toBe(100);
    e.known = ['fire'];
    expect(c.preview(c.p, e, 100, 'fire')).toBe(155);
  });
});

describe('금기 「심연 응시」: 영구 대가, 판 전체 상한', () => {
  function gazer(): { run: RunState; uid: string } {
    const run = clean();
    const s = learnSkill(run, 'gaze-abyss')!;
    run.slots = [s.uid];
    run.player.maxSanity = run.player.sanity = 100;
    return { run, uid: s.uid };
  }

  it('최대 정신력 -8, 통찰 +1 — 전투당 한 번', () => {
    const { run, uid } = gazer();
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    expect(c.useSkill(uid)).toBeNull();
    expect(run.player.insight).toBe(1);
    expect(run.player.maxSanity).toBe(92);
    expect(run.gazed).toBe(1);
    expect(c.blockReason(uid)).not.toBeNull();
  });

  it('이 기술로 얻는 통찰은 판 전체에서 2까지 — 기술을 다시 배워도 이어진다', () => {
    const { run, uid } = gazer();
    for (let i = 0; i < 2; i++) {
      const c = startCombat(run, 'a1-cult', { anomaly: null });
      expect(c.useSkill(uid)).toBeNull();
      run.combat = null;
    }
    expect(run.player.insight).toBe(2);
    expect(run.player.maxSanity).toBe(84);
    run.skills = [];
    const again = learnSkill(run, 'gaze-abyss')!;
    run.slots = [again.uid];
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    expect(c.blockReason(again.uid)).toBe('더 들여다볼 심연이 없다');
  });

  it('내어 줄 정신이 없으면 쓸 수 없다 (최대 정신력 10 밑으로는 깎지 않는다)', () => {
    const { run, uid } = gazer();
    run.player.maxSanity = run.player.sanity = 17;
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    expect(c.blockReason(uid)).toBe('더 내어 줄 정신이 없다');
  });
});

describe('이벤트: 통찰은 영구 대가를 치르고, 막마다 많아야 두 번', () => {
  function richRun(seed: number, act: number): RunState {
    const run = newRun({ seed, origin: 'occultist' });
    run.act = act;
    run.floor = generateFloor(run, act);
    run.player.gold = 999;
    run.player.level = 12;
    run.player.maxHp = run.player.hp = 200;
    run.player.maxSanity = run.player.sanity = 100;
    run.light = 100;
    run.consumables = ['molotov', 'holy-water', 'bandage'];
    run.equip.weapon = { uid: 'w', id: 'crowbar', lvl: 0 };
    return run;
  }
  const negMad = (run: RunState) => run.madness.filter((m) => !MADNESS.get(m)?.virtue).length;

  /** 모든 이벤트의 모든 선택지를 여러 시드로 골라 보고, 통찰을 주는 것을 모은다 */
  function scan() {
    const found = new Map<string, { acts: number[]; hint: string; costs: Set<string> }>();
    const hintOnly = new Set<string>();
    for (const ev of EVENTS.values()) {
      for (const act of ev.acts) {
        for (let seed = 1; seed <= 6; seed++) {
          const probe = richRun(seed, act);
          startEvent(probe, ev.id);
          const n = eventView(probe)!.choices.length;
          for (let i = 0; i < n; i++) {
            const run = richRun(seed, act);
            startEvent(run, ev.id);
            const ch = eventView(run)!.choices[i];
            if (ch.disabled) continue;
            const before = { ins: run.player.insight, san: run.player.maxSanity, hp: run.player.maxHp, mad: negMad(run) };
            expect(chooseEvent(run, i)).toBeNull();
            const key = `${ev.id}:${ch.label}`;
            if (/통찰 \+/.test(ch.hint ?? '')) hintOnly.add(key);
            if (run.player.insight <= before.ins) continue;
            const costs = new Set<string>();
            if (run.player.maxSanity < before.san) costs.add('maxSanity');
            if (run.player.maxHp < before.hp) costs.add('maxHp');
            if (negMad(run) > before.mad) costs.add('madness');
            const f = found.get(key) ?? { acts: ev.acts, hint: ch.hint ?? '', costs: new Set<string>() };
            for (const x of costs) f.costs.add(x);
            if (!costs.size) f.costs.add('NONE');
            expect(run.player.insight - before.ins, key).toBe(1);
            expect(run.event?.result ?? '', key).toContain('통찰 +1');
            found.set(key, f);
          }
        }
      }
    }
    return { found, hintOnly };
  }

  it('통찰을 주는 선택지는 모두 +1이고 영구 대가가 있으며, 안내 문구가 효과와 맞다', () => {
    const { found, hintOnly } = scan();
    expect(found.size).toBeGreaterThan(0);
    for (const [key, f] of found) {
      expect(f.costs.has('NONE'), `${key}: 영구 대가 없음`).toBe(false);
      expect(f.hint, key).toContain('통찰 +1');
      if (f.costs.has('maxSanity')) expect(f.hint, key).toContain(`최대 정신력 -${INSIGHT_PRICE.maxSanity}`);
      if (f.costs.has('maxHp')) expect(f.hint, key).toContain(`최대 체력 -${INSIGHT_PRICE.maxHp}`);
      if (f.costs.has('madness')) expect(f.hint, key).toContain('광기');
    }
    // 통찰을 준다고 써 놓고 주지 않는 선택지는 없다
    for (const key of hintOnly) expect(found.has(key), key).toBe(true);
    // 막마다 많아야 두 개
    for (const act of [1, 2, 3, 4, 5]) {
      const n = [...found.values()].filter((f) => f.acts.includes(act)).length;
      expect(n, `${act}막`).toBeLessThanOrEqual(2);
    }
  });

  it('부서진 성상: 통찰 +1의 값은 최대 정신력 -8 — 여관에서 쉬어도 돌아오지 않는다', () => {
    const run = richRun(3, 1);
    startEvent(run, 'broken-idol');
    const idx = eventView(run)!.choices.findIndex((c) => c.label === '성상의 눈을 들여다본다');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(chooseEvent(run, idx)).toBeNull();
    expect(run.player.insight).toBe(1);
    expect(run.player.maxSanity).toBe(92);
    run.screen = 'haven';
    run.innUsed = false;
    run.player.sanity = 10;
    expect(inn(run)).toBeNull();
    // 여관은 깎인 최대치의 85%까지 (2026-10: 쉬는 곳의 정신력 회복도 줄였다)
    expect(run.player.sanity).toBe(Math.round(92 * INN_SANITY));
    expect(run.player.maxSanity).toBe(92);
  });

  it('산맥을 향한 창: 통찰 +1의 값은 광기 하나 — 광기가 한 번만 더 오면 끝나는 사람에겐 막힌다', () => {
    const run = richRun(4, 3);
    startEvent(run, 'a3-far-peaks');
    const idx = eventView(run)!.choices.findIndex((c) => c.label === '끝까지 바라본다');
    expect(chooseEvent(run, idx)).toBeNull();
    expect(run.player.insight).toBe(1);
    expect(negMad(run)).toBe(1);
    const deep = richRun(4, 3);
    deep.madness = [...MADNESS.values()].filter((m) => !m.virtue).slice(0, MAX_MADNESS - 1).map((m) => m.id);
    startEvent(deep, 'a3-far-peaks');
    expect(eventView(deep)!.choices[idx].disabled).toBeTruthy();
  });

  it('들여다보는 선택지는 통찰 대신 이 층 적들의 약점을 알려 주고, 다음 전투에서 바로 보인다', () => {
    const run = richRun(5, 2);
    startEvent(run, 'a2-confessional');
    const idx = eventView(run)!.choices.findIndex((c) => c.label === '칸막이 너머를 엿본다');
    const san = run.player.sanity;
    expect(chooseEvent(run, idx)).toBeNull();
    expect(run.player.insight).toBe(0);
    expect(run.player.sanity).toBeLessThan(san);
    expect(run.event!.result).toContain('약점을 알아냈다');
    const learned = Object.keys(run.learned.weak);
    expect(learned.length).toBeGreaterThan(3);
    for (const id of learned) expect(ENEMIES.get(id)!.act).toBe(2);
    // 다음 전투: 처음부터 약점이 보인다
    run.event = null;
    const c = startCombat(run, 'a2-cell', { anomaly: null });
    for (const e of c.alive) if (learned.includes(e.def)) expect([...e.known].sort()).toEqual([...e.weak].sort());
    // 이미 다 아는 것만 남았으면 대가도 없다
    const again = richRun(5, 2);
    again.knownWeak = { ...run.knownWeak };
    startEvent(again, 'a2-confessional');
    const s2 = again.player.sanity;
    expect(chooseEvent(again, idx)).toBeNull();
    expect(again.player.sanity).toBe(s2);
    expect(again.event!.result).toContain('이미 아는 것들뿐이었다');
  });
});

describe('경제 지표 (2026-10 2차): 정신력 회복은 줄이고, 통찰 물건은 하나만', () => {
  it('쉬는 곳의 회복: 명상 15, 기도 6, 여관 최대치의 75%까지', () => {
    expect(MEDITATE_SANITY).toBe(15);
    expect(PRAY_SANITY).toBe(6);
    expect(INN_SANITY).toBe(0.75);
    const run = clean();
    run.screen = 'haven';
    run.innUsed = false;
    run.player.maxSanity = 100;
    run.player.sanity = 5;
    expect(inn(run)).toBeNull();
    expect(run.player.sanity).toBe(75);
  });

  it('붕괴 압박: 적 정신 공격 배율과 광기 한도', () => {
    expect(ACT_SAN_MULT).toEqual([1, 1, 1.05, 1.05, 0.9, 0.85]);
    expect(MAX_MADNESS).toBe(5);
  });

  it('숫돌은 이기면 정신력 +1', () => {
    expect(EQUIPS.get('whetstone')!.desc).toContain('정신력 +1');
  });

  it('검은 양초는 전리품·상점에 나오지 않는다 (옛 저장을 위해 정의만 남는다)', () => {
    expect(CONSUMABLES.get('x-black-candle')!.rarity).toBe('special');
    const run = clean();
    for (let i = 0; i < 400; i++) expect(rollConsumable(run)).not.toBe('x-black-candle');
  });

  it('찢긴 금서 페이지는 통찰 대신 아직 배우지 않은 금기 스킬 하나', () => {
    const run = clean();
    const before = run.skills.length;
    gainRelic(run, 'forbidden-page');
    expect(run.player.insight).toBe(0);
    expect(run.skills.length).toBe(before + 1);
    expect(SKILLS.get(run.skills[run.skills.length - 1].id)!.school).toBe('forbidden');
  });

  it('각성: 계시는 통찰 +1', () => {
    const run = clean();
    MADNESS.get('revelation')!.onGain!(run);
    expect(run.player.insight).toBe(1);
  });
});
