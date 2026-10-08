import { MADNESS, reg } from '../engine/registry';
import { isEnemy, type Combat } from '../engine/combat';
import { FINAL_ACT, log, type RunState } from '../engine/run';
import { Rng, deriveSeed } from '../engine/rng';
import { ABYSS_RULES, ABYSS_TUNE as T, LV } from '../engine/abyss';
import type { EnemyUnit } from '../engine/types';

/*
 * 심연 단계의 특별한 규칙 (5·10·15단계). 단계표와 수치 규칙은 engine/abyss.ts.
 *  5 ★ 아래의 목소리 — 1층부터 들리던 '아래의 목소리'(별의 태아의 잠꼬대)가 층마다 광기 하나를 속삭인다.
 *       그 층에 있는 동안만 걸리고(run.abyss.whisper), 광기 한도에는 세지 않는다. 한 판에서 같은 목소리는 다시 들리지 않는다.
 *       출신 공정성: 막기·특정 속성·특정 계열에 기대는 광기(자기혐오·혈액공포증)와 전투 밖에서만 듣는 광기(불면증)는 뺐다.
 * 10 ★★ 두 번째 모습 — 층 수호자와 계층군주는 처음 쓰러지는 순간 심연이 다시 일으켜 세운다 (체력 일부, 버팀이 차오른다).
 *       전투를 시작할 때 '심연의 손' 상태로 미리 보인다. 특성의 죽음 처리보다 먼저라, 하수인·기믹은 그대로 이어진다.
 *       별의 태아는 이미 세 번 태어나므로 제외한다.
 * 15 ★★★ 물러나지 않는 조수 — 층을 내려가도 조수가 다 빠지지 않는다. 판 전체가 시간과의 싸움이 된다
 *       (새 층의 조수 = 지난 층 조수 × tideCarry, 내림 — dungeon.ts advanceTime의 f.vars.tideBase).
 */

/**
 * 아래의 목소리가 속삭이는 광기: 전투에 걸리고, 출신에 치우치지 않고, 설명 한 줄로 이해되는 것만.
 * (실어증·강박은 매 전투·매 턴 손을 묶어 너무 답답해서 뺐다)
 */
export const WHISPERS = ['paranoia', 'nyctophobia', 'tremor', 'hallucination', 'voices', 'fragile-mind', 'craving', 'x-phantom-pain', 'x-foreboding'];

/** 10단계: 수호자에게 걸리는 '심연의 손' (쓰러지면 한 번 다시 일어선다) */
export const ABYSS_RISE = 'abyss-rise';

/** 심연 전용 난수 (판의 시드에서 따로 뽑는다 — 지도·전리품 난수의 흐름을 건드리지 않게) */
function abyssRng(run: RunState): Rng {
  if (typeof run.rng.abyss !== 'number') run.rng.abyss = deriveSeed(run.seed, 'abyss');
  return new Rng(run.rng, 'abyss');
}

/** 다시 일어설 수 있는 적: 층 수호자·계층군주 (최종 수호자 별의 태아 제외, 환영·하수인 제외) */
export function canRise(c: Combat, e: EnemyUnit): boolean {
  const def = c.defOf(e);
  if (def.tier !== 'boss' || e.minion || e.fled || e.mem.illu) return false;
  const finalGuardian = def.act >= FINAL_ACT && !c.s.enc.startsWith('lord');
  return !finalGuardian;
}

reg.statuses([
  {
    id: ABYSS_RISE,
    name: '심연의 손',
    icon: 'gi:grasping-claws',
    kind: 'buff',
    desc: `쓰러지면 체력 ${Math.round(T.riseHp * 100)}%로 한 번 다시 일어선다${T.riseStr > 0 ? `. 힘 +${T.riseStr}` : ''}`,
  },
]);

ABYSS_RULES.push(
  {
    n: LV.voice,
    floor(run) {
      const st = (run.abyss ??= {});
      const heard = (st.heard ??= []);
      const ok = (id: string) => MADNESS.has(id) && !run.madness.includes(id);
      const fresh = WHISPERS.filter((id) => ok(id) && !heard.includes(id));
      const pool = fresh.length ? fresh : WHISPERS.filter(ok);
      if (!pool.length) {
        delete st.whisper;
        return;
      }
      const id = abyssRng(run).pick(pool);
      st.whisper = id;
      heard.push(id);
      const d = MADNESS.get(id)!;
      log(run, `아래에서 목소리가 들린다. 이 층에 있는 동안 「${d.name}」: ${d.desc}`);
    },
  },
  {
    n: LV.rise,
    hooks: {
      onCombatStart(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || !canRise(c, e) || e.st[ABYSS_RISE]) return;
        e.st[ABYSS_RISE] = 1;
        c.emit({ t: 'status', uid: e.uid, id: ABYSS_RISE, n: 1 });
      },
    },
    rise(c, e) {
      if (!(e.st[ABYSS_RISE] > 0) || !canRise(c, e)) return false;
      delete e.st[ABYSS_RISE];
      c.emit({ t: 'status', uid: e.uid, id: ABYSS_RISE, n: -1 });
      e.dead = false;
      e.hp = Math.max(1, Math.ceil(e.maxHp * T.riseHp));
      e.block = 0;
      c.restorePoise(e, false);
      delete e.mem.charge;
      // 봇·다른 규칙이 보는 '다시 일어선' 표식 (망자의 귀환과 같다)
      e.mem.revived = 1;
      c.emit({ t: 'spawn', uid: e.uid });
      c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
      c.emit({ t: 'text', uid: e.uid, text: '심연이 다시 일으켜 세웠다', tone: 'eldritch' });
      if (T.riseStr > 0) c.apply(e, 'str', T.riseStr, e);
      if (c.s.phase === 'player') c.planIntent(e);
      return true;
    },
  },
  {
    n: LV.tide,
    floor(run, f, prev) {
      if (!prev || prev.act >= f.act) return;
      const base = Math.floor(prev.tide * T.tideCarry);
      if (base <= 0) return;
      f.vars.tideBase = base;
      f.tide = base;
      log(run, `조수가 다 물러가지 않았다. 조수 ${base}단계에서 시작한다`);
    },
  },
);
