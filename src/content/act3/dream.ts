import { reg, STATUSES } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { EnemyUnit, MoveDef } from '../../engine/types';

/**
 * 3층(꿈의 경계) 공용 헬퍼와 전용 상태.
 * - 환영: 숨겨진 상태 'a3-illusion' + mem.illu. 공격받으면 흩어지고(보상 없음), 실제 피해 대신 정신 피해를 준다.
 * - 통찰 강탈 / 등불 갉아먹기: 빼앗은 것은 mem에 보관했다가 처치하면 돌려준다 (특성 훅).
 */

/** 통찰이 이 이상이면 환영의 정체가 이름에 드러난다 */
export const ILLUSION_SIGHT = 4;

/** 숨겨진 의도 (통찰 5 이상만 보임) */
export const hid = (m: MoveDef): MoveDef => ({ ...m, hidden: true });

export const isIllusion = (e: EnemyUnit): boolean => !!e.mem.illu;

export const isAsleep = (e: EnemyUnit): boolean => (e.mem.asleep ?? 0) > 0;

/** 진짜 적들 (환영 제외) */
export function realAlive(c: Combat): EnemyUnit[] {
  return c.alive.filter((x) => !isIllusion(x));
}

/** 보상 없이 사라진다 (환영이 흩어짐, 삼켜짐 등) */
export function vanish(c: Combat, e: EnemyUnit, text = '환영이 흩어졌다') {
  if (e.dead) return;
  e.dead = true;
  e.fled = true;
  e.block = 0;
  c.emit({ t: 'text', uid: e.uid, text, tone: 'eldritch' });
  c.emit({ t: 'death', uid: e.uid });
}

/**
 * src의 환영을 만든다. 체력·버팀·상태까지 똑같이 베껴 겉보기로는 구별할 수 없다.
 * onSpawn은 c.s.vars.a3Illu 플래그로 건너뛸 수 있다.
 */
export function spawnIllusion(c: Combat, src: EnemyUnit, turns = 3): EnemyUnit | null {
  const prev = c.s.vars.a3Illu;
  c.s.vars.a3Illu = 1;
  let copy: EnemyUnit | null = null;
  try {
    copy = c.spawn(src.def, src.row);
  } finally {
    if (prev === undefined) delete c.s.vars.a3Illu;
    else c.s.vars.a3Illu = prev;
  }
  if (!copy) return null;
  copy.mem = { illu: 1 };
  // 파멸 등으로 '죽더라도' 처치 보상·처치 판정이 나지 않게 (fled/minion은 보상 계산에서 제외되는 표식)
  copy.fled = true;
  copy.minion = true;
  copy.hp = src.hp;
  copy.maxHp = src.maxHp;
  copy.block = src.block;
  copy.poise = src.poise;
  copy.maxPoise = src.maxPoise;
  copy.known = [...src.known];
  copy.scale = src.scale;
  copy.form = src.form;
  copy.name = c.p.insight >= ILLUSION_SIGHT ? `${src.name}의 환영` : src.name;
  copy.st = {};
  for (const [k, v] of Object.entries(src.st)) if (!STATUSES.get(k)?.hidden) copy.st[k] = v;
  copy.st['a3-illusion'] = turns;
  if (c.s.phase === 'player') c.planIntent(copy);
  c.emit({ t: 'text', uid: copy.uid, text: c.p.insight >= ILLUSION_SIGHT ? '환영이다' : '형체가 겹쳐 보인다', tone: 'eldritch' });
  return copy;
}

/**
 * 같은 무리의 자리를 뒤섞는다 (진짜가 어디 있는지 헷갈리게).
 * 열 배치도 무리 안에서 섞는다 — 열마다 인원수는 그대로라 칸 제한을 넘지 않는다.
 */
export function shuffleGroup(c: Combat, group: EnemyUnit[]) {
  if (group.length < 2) return;
  const rows = c.rng.shuffle(group.map((x) => x.row));
  group.forEach((x, k) => {
    if (x.row !== rows[k]) {
      x.row = rows[k];
      c.emit({ t: 'row', uid: x.uid, row: x.row });
    }
  });
  const idx = group.map((x) => c.s.enemies.indexOf(x)).filter((i) => i >= 0).sort((a, b) => a - b);
  const order = c.rng.shuffle([...group]);
  idx.forEach((ix, k) => {
    c.s.enemies[ix] = order[k];
  });
  c.emit({ t: 'row', uid: group[0].uid, row: group[0].row });
}

/** 통찰 강탈. holder가 보관하고, holder를 쓰러뜨리면 돌려받는다. 통찰이 없으면 정신 피해 */
export function stealInsight(c: Combat, e: EnemyUnit, n: number, holder: EnemyUnit = e): number {
  if (isIllusion(e)) return 0;
  const k = Math.min(n, c.p.insight);
  if (k <= 0) {
    c.loseSanity(4, true);
    return 0;
  }
  c.p.insight -= k;
  holder.mem.brain = (holder.mem.brain ?? 0) + k;
  c.emit({ t: 'insight', delta: -k });
  c.emit({ t: 'text', uid: holder.uid, text: `통찰 -${k} (빼앗김)`, tone: 'eldritch' });
  return k;
}

/** 등불 갉아먹기. 처치하면 돌려받는다 */
export function stealLight(c: Combat, e: EnemyUnit, n: number) {
  if (isIllusion(e)) return;
  const k = Math.min(n, c.run.light);
  if (k <= 0) return;
  c.run.light -= k;
  e.mem.light = (e.mem.light ?? 0) + k;
  c.emit({ t: 'text', uid: 'p', text: `등불 -${k}`, tone: 'bad' });
}

/** 피해 없이 버팀만 깎는다 (0이 되면 붕괴) */
export function chipPoise(c: Combat, e: EnemyUnit, n: number) {
  if (e.dead || e.broken > 0 || e.maxPoise <= 0 || n <= 0) return;
  e.poise = Math.max(0, e.poise - n);
  if (e.poise === 0) c.breakEnemy(e);
  else c.emit({ t: 'text', uid: e.uid, text: `버팀 -${n}`, tone: 'info' });
}

/** 적의 전열과 후열을 통째로 뒤바꾼다 */
export function swapRows(c: Combat) {
  const front = c.row(0);
  const back = c.row(1);
  if (!back.length) return;
  for (const x of front) {
    x.row = 1;
    c.emit({ t: 'row', uid: x.uid, row: 1 });
  }
  for (const x of back) {
    x.row = 0;
    c.emit({ t: 'row', uid: x.uid, row: 0 });
  }
}

/** 잠든 적을 깨운다. startled면 놀라서 힘 +3 */
export function wake(c: Combat, e: EnemyUnit, startled: boolean) {
  if (!isAsleep(e) || e.dead) return;
  e.mem.asleep = 0;
  if (e.st['a3-asleep']) c.clear(e, 'a3-asleep');
  if (startled) {
    c.apply(e, 'str', 3, e);
    c.emit({ t: 'text', uid: e.uid, text: '놀라 깨어났다!', tone: 'bad' });
  } else c.emit({ t: 'text', uid: e.uid, text: '눈을 떴다', tone: 'info' });
  if (c.s.phase === 'player' && e.broken !== 2 && !e.dead) c.planIntent(e);
}

/** 원형질 조각을 삼킨다: 조각마다 체력 회복, 삼켰다면 힘 +1. 조각이 없으면 방어도 */
export function absorbBlobs(c: Combat, e: EnemyUnit, healPer: number, maxN: number) {
  const blobs = c.alive.filter((x) => x.def === 'shoggoth-blob' && !isIllusion(x)).slice(0, maxN);
  if (!blobs.length) {
    c.gainBlock(e, 8);
    return;
  }
  for (const b of blobs) {
    vanish(c, b, '삼켜졌다');
    c.heal(e, healPer);
  }
  c.apply(e, 'str', 1, e);
}

// ───────────── 3층 전용 상태 ─────────────

reg.statuses([
  {
    id: 'a3-illusion',
    name: '환영',
    icon: 'gi:two-shadows',
    kind: 'buff',
    hidden: true,
    desc: '실체가 없다. 공격받으면 흩어진다 ({n}턴)',
    hooks: {
      // 실제 공격만 바꾼다 (의도 미리보기에는 진짜처럼 보인다)
      modDamageOut(_c, s, d) {
        if (d.src !== s.unit || !d.move) return;
        d.mult = 0;
        d.attack = false;
        d.tags = [...d.tags, 'a3-illusory'];
      },
      onDamageDealt(c, s, d) {
        if (d.src !== s.unit || d.tgt !== c.p || !d.tags.includes('a3-illusory')) return;
        c.emit({ t: 'text', uid: 'p', text: '실체 없는 일격 — 정신이 흔들린다', tone: 'eldritch' });
        c.loseSanity(Math.max(2, Math.round(d.base / 2)), true);
      },
      // 환영이 거는 해로운 효과는 진짜가 아니다
      modApply(_c, s, target, _id, n) {
        return target === s.unit ? n : 0;
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || d.src === e) return;
        if (d.attack || d.hpLoss > 0 || d.blocked > 0) vanish(c, e);
      },
    },
    tickEnd(c, u, n) {
      if (!isEnemy(u)) return;
      if (n <= 1) vanish(c, u, '환영이 옅어져 사라졌다');
      else c.apply(u, 'a3-illusion', -1);
    },
  },
  {
    id: 'a3-asleep',
    name: '잠듦',
    icon: 'gi:sleepy',
    kind: 'debuff',
    desc: '행동하지 않는다. 피해를 받으면 놀라 깨어나 힘 +3. {n}턴 뒤 스스로 깨어난다 (꿈을 먹는 자의 곁에서는 깨어나지 못한다)',
  },
  {
    id: 'a3-pilgrimage',
    name: '순례',
    icon: 'gi:pilgrim-hat',
    kind: 'buff',
    desc: '꿈의 문까지 {n}걸음. 다 걸으면 사라지고(보상 없음) 남은 동료는 힘 +2, 체력 10 회복. 붕괴·기절 중에는 걷지 못한다',
  },
  {
    id: 'a3-lives',
    name: '남은 목숨',
    icon: 'gi:hollow-cat',
    kind: 'buff',
    desc: '쓰러져도 {n}번 더 되살아난다 (체력 40%, 힘 +2, 약점이 바뀐다)',
  },
  {
    id: 'a3-timeworn',
    name: '시간 상실',
    icon: 'gi:backward-time',
    kind: 'debuff',
    desc: '다음 턴 행동력 -{n}',
    tickStart(c, u, n) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(1, c.s.ap - n);
      c.emit({ t: 'text', uid: 'p', text: `시간을 잃었다 (행동력 -${n})`, tone: 'bad' });
      c.clear(u, 'a3-timeworn');
    },
  },
  {
    id: 'a3-phase-dream',
    name: '꿈결',
    icon: 'gi:fluffy-swirl',
    kind: 'buff',
    desc: '꿈에 잠겨 있다: 참격·관통·타격 피해 60% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.type === 'slash' || d.type === 'pierce' || d.type === 'blunt') d.mult *= 0.4;
      },
    },
  },
  {
    id: 'a3-phase-real',
    name: '현실',
    icon: 'gi:stone-block',
    kind: 'buff',
    desc: '현실에 발을 딛고 있다: 화염·비전·공허 피해 60% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.type === 'fire' || d.type === 'arcane' || d.type === 'void') d.mult *= 0.4;
      },
    },
  },
]);
