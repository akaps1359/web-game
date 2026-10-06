import { reg, STATUSES } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { EnemyUnit, Unit } from '../../engine/types';
import { cine, setUi } from '../lib';

/**
 * 2층 정예·수호자 패턴 (2026-10 확장) — 플레이어에게 거는 2층 전용 상태와 공용 도구.
 * - 침묵의 서약 (대사제): 말(기술)을 셀 때마다 줄고, 0이 되는 순간 행동력이 남아 있으면 말을 끊긴다 (Time Eater식 행동 수 규칙)
 * - 속죄 (대고행자): 기술을 쓸 때마다 체력을 잃는다
 * - 뒤엉킨 기억 (성가대장): 기술 이름이 뒤섞여 보이고, 쓴 기술은 그 턴에 다시 쓸 수 없다
 * - 고해 (살아있는 성유물함): 공격하지 않으면 죄를 사하고, 공격하면 신성모독
 * - 거꾸로 매달림 (거꾸로 매달린 성인): 체력 피해와 정신력 손실이 뒤바뀐다
 * - 공명 (종지기의 대종): 방금 울린 종은 깨지기 쉽다
 * 화면 연출(cine·setUi)은 규칙과 따로 — 규칙은 모두 여기 훅과 적 행동에 있다.
 */

export const VOW = 'a2-vow';
/** 침묵의 서약: 이 수만큼 말하면 서약이 새로 시작된다 */
export const VOW_WORDS = 8;
/** 말을 끊길 때 대사제가 얻는 힘 */
export const VOW_STR = 2;

export const PENANCE = 'a2-penance';
export const PENANCE_HP = 3;

export const TANGLED = 'a2-tangled';

export const CONFESSION = 'a2-confession';
export const ABSOLVE_SAN = 10;
export const SACRILEGE_SAN = 6;
export const SACRILEGE_BLOCK = 15;

export const HANGED = 'a2-hanged';

export const RESONANCE = 'a2-resonance';
/** 공명하는 대종이 받는 피해 배율 / 잠잠한 대종이 받는 피해 배율 */
export const RING_MULT = 1.5;
export const SILENT_MULT = 0.5;

/** 상태를 정확히 n으로 맞춘다 (결계에 막히지 않는 규칙 표시 — 별의 심판과 같은 방식) */
export function setSt(c: Combat, u: Unit, id: string, n: number) {
  const before = u.st[id] ?? 0;
  if (n > 0) u.st[id] = n;
  else delete u.st[id];
  if (n !== before) c.emit({ t: 'status', uid: u.uid, id, n: n - before });
}

/** 의도를 이 행동으로 바꿔 보여 준다 (planIntent와 같은 계산 — AI를 거치지 않아 행동 순서가 흐트러지지 않는다) */
export function setIntent(c: Combat, e: EnemyUnit, id: string) {
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
    disguise: m.disguise,
  };
}

/** 이 전투에서 처음일 때만 true (제4의 벽 연출을 한 번씩만) */
export function once(c: Combat, key: string): boolean {
  if (c.s.vars[key]) return false;
  c.s.vars[key] = 1;
  return true;
}

// ───────────── 침묵의 서약 ─────────────

/** 말을 끊는다: 남은 행동력을 잃고 이번 턴엔 기술을 쓸 수 없다, 대사제 힘 +2 */
function excommunicate(c: Combat, priest: EnemyUnit) {
  const lost = c.s.ap;
  c.s.ap = 0;
  // 이미 침묵 중이면 더 걸지 않는다 (침묵이 다음 턴까지 늘어나지 않게)
  if (!((c.p.st.silence ?? 0) > 0)) c.apply(c.p, 'silence', 1, priest);
  c.apply(priest, 'str', VOW_STR, priest);
  c.emit({ t: 'fx', name: 'horror', src: priest.uid, tgt: 'p' });
  c.emit({ t: 'text', uid: 'p', text: `파문 — 말을 끊겼다 (행동력 -${lost})`, tone: 'bad' });
  if (once(c, 'a2-cut')) cine(c, 'sysmsg', { uid: priest.uid, text: '입력이 거부되었습니다. 침묵하십시오.' });
}

// ───────────── 고해 ─────────────

function sacrilege(c: Combat) {
  setSt(c, c.p, CONFESSION, 0);
  setUi(c, 'ui:eye', 0);
  const r = c.alive.find((x) => x.def === 'reliquary');
  c.emit({ t: 'text', uid: 'p', text: '신성모독', tone: 'bad' });
  cine(c, 'eye', { uid: r?.uid });
  if (r) c.gainBlock(r, SACRILEGE_BLOCK);
  c.loseSanity(SACRILEGE_SAN, true);
}

function absolve(c: Combat) {
  setSt(c, c.p, CONFESSION, 0);
  setUi(c, 'ui:eye', 0);
  c.emit({ t: 'text', uid: 'p', text: '죄를 사함받았다', tone: 'good' });
  c.gainSanity(ABSOLVE_SAN);
  for (const id of Object.keys(c.p.st)) {
    if (id === 'dying' || id === CONFESSION) continue;
    if (STATUSES.get(id)?.kind === 'debuff') c.clear(c.p, id);
  }
}

// ───────────── 상태 등록 ─────────────

reg.statuses([
  {
    id: VOW,
    name: '침묵의 서약',
    icon: 'gi:lips',
    kind: 'debuff',
    desc: `남은 말 {n}. 기술(기본기 포함)을 쓸 때마다 1씩 줄고, 0이 되면 서약이 ${VOW_WORDS}로 새로 시작된다. 0이 되는 순간 행동력이 남아 있으면 대사제가 말을 끊는다 — 남은 행동력을 잃고 이번 턴엔 기술을 쓸 수 없으며, 대사제 힘 +${VOW_STR}`,
    hooks: {
      afterSkill(c, s, u) {
        if (u.echo || s.unit !== c.p) return;
        const priest = c.alive.find((x) => x.def === 'high-priest');
        if (!priest) {
          setSt(c, c.p, VOW, 0);
          return;
        }
        const left = s.n - 1;
        if (left > 0) {
          setSt(c, c.p, VOW, left);
          return;
        }
        setSt(c, c.p, VOW, VOW_WORDS);
        if (c.s.ap > 0) excommunicate(c, priest);
        else c.emit({ t: 'text', uid: priest.uid, text: '말씀을 맺었다 — 서약이 새로 시작된다', tone: 'info' });
      },
    },
  },
  {
    id: PENANCE,
    name: '속죄',
    icon: 'gi:whiplash',
    kind: 'debuff',
    decay: true,
    desc: `기술(기본기 포함)을 쓸 때마다 체력 ${PENANCE_HP}를 잃는다 (방어 무시, {n}턴)`,
    hooks: {
      afterSkill(c, s, u) {
        if (u.echo || s.unit !== c.p) return;
        c.loseHp(c.p, PENANCE_HP, 'penance');
      },
    },
  },
  {
    id: TANGLED,
    name: '뒤엉킨 기억',
    icon: 'gi:musical-notes',
    kind: 'debuff',
    decay: true,
    desc: '기술 이름과 설명이 뒤섞여 보인다. 쓴 기술은 이번 턴에 다시 쓸 수 없다 ({n}턴)',
    hooks: {
      // 재사용 대기가 없는 기술(기본기 포함)도 이번 턴엔 한 번만
      modCd(_c, _s, _def, cd) {
        return Math.max(cd, 1);
      },
      onTurnEnd(c, s) {
        if (s.n <= 1) setUi(c, 'ui:scramble', 0);
      },
    },
  },
  {
    id: CONFESSION,
    name: '고해',
    icon: 'gi:prayer',
    kind: 'debuff',
    desc: `이번 턴 공격하지 않으면 턴이 끝날 때 죄를 사함받는다 (정신력 +${ABSOLVE_SAN}, 해로운 효과 모두 제거). 공격하는 순간 신성모독 — 성유물함 방어도 ${SACRILEGE_BLOCK}, 정신력 -${SACRILEGE_SAN}`,
    hooks: {
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.attack || !isEnemy(d.tgt) || c.s.phase !== 'player' || !c.p.st[CONFESSION]) return;
        sacrilege(c);
      },
      onTurnEnd(c, s) {
        if (s.unit === c.p && c.p.st[CONFESSION]) absolve(c);
      },
    },
  },
  {
    id: HANGED,
    name: '거꾸로 매달림',
    icon: 'gi:tarot-12-the-hanged-man',
    kind: 'debuff',
    decay: true,
    desc: '피가 머리로 쏠린다 — 체력 피해는 정신력을, 정신력 손실은 체력을 깎는다 ({n}턴). 사경 중엔 그대로',
    hooks: {
      onDamageTaken(c, s, d) {
        const p = c.p;
        if (s.unit !== p || d.tgt !== p || d.hpLoss <= 0 || d.tags.includes('hanged') || c.dying || c.over) return;
        const n = d.hpLoss;
        p.hp += n;
        d.hpLoss = 0;
        // 넘겨받은 정신력 손실은 다시 체력으로 돌리지 않는다
        c.s.vars['a2-hang'] = 1;
        try {
          c.loseSanity(n);
        } finally {
          delete c.s.vars['a2-hang'];
        }
      },
      modSanityLoss(c, s, amount) {
        if (!c || c.previewing || c.dying || c.over || s.unit !== c.p || c.s.vars['a2-hang']) return amount;
        const n = Math.floor(amount);
        if (n > 0) c.loseHp(c.p, n, 'hanged');
        return 0;
      },
    },
  },
  {
    id: RESONANCE,
    name: '공명',
    icon: 'gi:sound-waves',
    kind: 'debuff',
    desc: `방금 울린 종이 떨고 있다 — 받는 피해 +${Math.round((RING_MULT - 1) * 100)}%. 종이 다시 잠잠해지면 사라진다`,
  },
]);
