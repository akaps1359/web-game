import { reg, STATUSES } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { EnemyUnit, MoveDef } from '../../engine/types';

/**
 * 5층(꿈꾸는 우주) — 꿈의 땅 공용 헬퍼와 전용 상태. (2026-10 개편 때 3층 '꿈의 경계'에서 옮겨 왔고, id 접두사도 a3- → a5- 로 바꿨다)
 * - 환영: 숨겨진 상태 'a5-illusion' + mem.illu. 공격받으면 흩어지고(보상 없음), 실제 피해 대신 정신 피해를 준다.
 * - 등불 갉아먹기: 빼앗은 것은 mem에 보관했다가 처치하면 돌려준다 (특성 훅).
 * - 잠듦/순례/남은 목숨/꿈결·현실: 몽유병자·별빛 순례자·토성의 고양이·문턱의 존재 전용.
 */

/** 통찰이 이 이상이면 환영의 정체가 이름에 드러난다 */
export const ILLUSION_SIGHT = 4;

/** 숨겨진 의도 (통찰 HIDDEN_REVEAL = 3 이상만 보임) */
export const hid = (m: MoveDef): MoveDef => ({ ...m, hidden: true });

export const isIllusion = (e: EnemyUnit): boolean => !!e.mem.illu;

export const isAsleep = (e: EnemyUnit): boolean => (e.mem.asleep ?? 0) > 0;

/** 진짜 적들 (환영 제외) */
export function realAlive(c: Combat): EnemyUnit[] {
  return c.alive.filter((x) => !isIllusion(x));
}

/** 보상 없이 사라진다 (환영이 흩어짐, 삼켜짐, 별빛이 되어 흩어짐 등) */
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
 * onSpawn은 c.s.vars.a5Illu 플래그로 건너뛸 수 있다.
 */
export function spawnIllusion(c: Combat, src: EnemyUnit, turns = 3): EnemyUnit | null {
  const prev = c.s.vars.a5Illu;
  c.s.vars.a5Illu = 1;
  let copy: EnemyUnit | null = null;
  try {
    copy = c.spawn(src.def, src.row);
  } finally {
    if (prev === undefined) delete c.s.vars.a5Illu;
    else c.s.vars.a5Illu = prev;
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
  copy.st['a5-illusion'] = turns;
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

/** 등불 갉아먹기. 처치하면 돌려받는다 */
export function stealLight(c: Combat, e: EnemyUnit, n: number) {
  if (isIllusion(e)) return;
  const k = Math.min(n, c.run.light);
  if (k <= 0) return;
  c.run.light -= k;
  e.mem.light = (e.mem.light ?? 0) + k;
  c.emit({ t: 'text', uid: 'p', text: `등불 -${k}`, tone: 'bad' });
}

/** 잠든 적을 깨운다. startled면 놀라서 힘 +3 */
export function wake(c: Combat, e: EnemyUnit, startled: boolean) {
  if (!isAsleep(e) || e.dead) return;
  e.mem.asleep = 0;
  if (e.st['a5-asleep']) c.clear(e, 'a5-asleep');
  if (startled) {
    c.apply(e, 'str', 3, e);
    c.emit({ t: 'text', uid: e.uid, text: '놀라 깨어났다!', tone: 'bad' });
  } else c.emit({ t: 'text', uid: e.uid, text: '눈을 떴다', tone: 'info' });
  if (c.s.phase === 'player' && e.broken !== 2 && !e.dead) c.planIntent(e);
}

// ───────────── 꿈의 땅 전용 상태 ─────────────

reg.statuses([
  {
    id: 'a5-illusion',
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
        d.tags = [...d.tags, 'a5-illusory'];
      },
      onDamageDealt(c, s, d) {
        if (d.src !== s.unit || d.tgt !== c.p || !d.tags.includes('a5-illusory')) return;
        c.emit({ t: 'text', uid: 'p', text: '실체 없는 일격에 정신이 흔들린다', tone: 'eldritch' });
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
      else c.apply(u, 'a5-illusion', -1);
    },
  },
  {
    id: 'a5-asleep',
    name: '잠듦',
    icon: 'gi:sleepy',
    kind: 'debuff',
    desc: '행동하지 않는다. 피해를 받으면 놀라 깨어나 힘 +3. {n}턴 뒤 스스로 깨어난다 (꿈을 먹는 자의 곁에서는 깨어나지 못한다)',
  },
  {
    id: 'a5-pilgrimage',
    name: '순례',
    icon: 'gi:pilgrim-hat',
    kind: 'buff',
    desc: '요람까지 {n}걸음. 다 걸으면 별빛이 되어 사라지고(보상 없음) 남은 동료는 힘 +2, 체력 20 회복. 붕괴·기절 중에는 걷지 못한다',
  },
  {
    id: 'a5-lives',
    name: '남은 목숨',
    icon: 'gi:hollow-cat',
    kind: 'buff',
    desc: '쓰러져도 {n}번 더 되살아난다 (체력 40%, 힘 +2, 약점이 바뀐다)',
  },
  {
    id: 'a5-phase-dream',
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
    id: 'a5-phase-real',
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
