import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, MAX_ROW, type Combat } from '../../engine/combat';
import type { CineName, DmgType, EnemyUnit, MoveDef, Unit } from '../../engine/types';
import { cine, execute, setObjective, setUi } from '../lib';
import { DOOM, flipRows } from './common';

/**
 * 4층(별들의 궁정) 정예·수호자 패턴 (2026-10 확장) — 4층 전용 상태·상수·도구.
 * 적의 특성 훅은 플레이어의 턴·기술을 볼 수 없어서, 플레이어 쪽에서 일어나는 규칙은 플레이어에게 거는 상태로 짰다.
 *  - 문 너머의 존재 「모든 것이 하나」: 문과 살아 있는 구체마다 한 줄기씩 모이는 빛 (구체가 부서지면 준비하던 의도가 바로 줄어든다)
 *    「차원이 접힌다」: 힘을 모으는 동안 문이 전열로 끌려 나와 근접 공격이 닿는다 (화면이 기운다)
 *  - 검은 파라오: 가면을 쓴 동안 「자비」는 거짓 의도. 가면이 벗겨지면 「왕의 명령」 — 지목한 기술을 쓰지 않으면 벌
 *  - 별의 자손 군주 「흔들리는 대지」: 체력을 일정량 잃을 때마다 다음 행동이 뒤집기로 바뀐다 (누적 피해 문턱, 점점 오른다)
 *    「별을 부른다」: 내 턴이 두 번 끝나면 전열에 별이 떨어진다 — 군주는 뒤로 숨지만, 전열을 비우면 끌려 나와 제 별을 맞는다
 *  - 검은 별 「어둠」: 빛을 먹어 쌓이면 의도가 어둠에 묻히고(ui:dark) 3이면 일식. 화염·비전 공격으로 걷어 낸다
 *  - 정예: 웃는 가면(거짓 의도), 얽히는 뿌리(행동력), 몸 바꾸기(체력 비율 교환), 바람 타기(여러 번 때려 떨어뜨린다), 어둠 속 사냥(등불)
 * 화면 연출(cine·setUi)은 규칙과 따로다 — 규칙은 모두 여기 훅과 적 행동에 있고, 수치는 상수로 두어 설명 문구도 같은 상수를 쓴다.
 * 다른 층에 이미 있는 것(2층 거꾸로 매달림의 체력↔정신력 뒤바꿈, 3층 샨탁의 낚아채 떨어뜨리기, 5층 환영 뒤섞기)은 피했다.
 */

// ───────────── 공용 도구 ─────────────

/** 상태를 정확히 n으로 맞춘다 (결계에 막히지 않는 규칙 표시 — 별의 심판과 같은 방식) */
export function setSt(c: Combat, u: Unit, id: string, n: number) {
  const before = u.st[id] ?? 0;
  if (n > 0) u.st[id] = n;
  else delete u.st[id];
  if (n !== before) c.emit({ t: 'status', uid: u.uid, id, n: n - before });
}

/** 이 전투에서 처음일 때만 true (제4의 벽 연출을 한 번씩만) */
export function once(c: Combat, key: string): boolean {
  if (c.s.vars[key]) return false;
  c.s.vars[key] = 1;
  return true;
}

const alive = (c: Combat, def: string): EnemyUnit | undefined => c.alive.find((x) => x.def === def);

function skillName(c: Combat, uid: string): string {
  const owned = c.run.skills.find((s) => s.uid === uid);
  return (owned && SKILLS.get(owned.id)?.name) || '기술';
}

/** 받침에 맞는 조사 (을/를) */
function eul(word: string): string {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return '를';
  return (ch - 0xac00) % 28 ? '을' : '를';
}

/** 행동에 연출을 덧붙인다 (세기·개수가 필요한 연출 — MoveDef.cine은 n을 받지 못한다) */
export function withCine(m: MoveDef, name: CineName, n?: number): MoveDef {
  return {
    ...m,
    run(c, e) {
      cine(c, name, { uid: e.uid, n });
      m.run(c, e);
    },
  };
}

// ───────────── 문 너머의 존재 ─────────────

export const GATE = 'beyond-gate';
/** 문 너머의 존재를 이루는 구체들 */
export const GATE_ORBS = ['gate-orb-hunger', 'gate-orb-seal', 'gate-orb-gaze'];
/** 「모든 것이 하나」: 줄기마다 피해 / 정신 피해 */
export const UNISON_DMG = 7;
export const UNISON_SAN = 8;
/** 차원이 접힌 동안 화면이 기우는 각도 */
const FOLD_TILT = -9;

export const orbCount = (c: Combat): number => c.alive.filter((x) => GATE_ORBS.includes(x.def)).length;
/** 「모든 것이 하나」의 빛줄기 수: 문 하나 + 살아 있는 구체마다 하나 */
export const unisonHits = (c: Combat): number => 1 + orbCount(c);

/** 구체가 부서지면 문이 준비하던 「모든 것이 하나」의 빛줄기가 바로 줄어든다 */
export function recountUnison(c: Combat) {
  const gate = alive(c, GATE);
  if (!gate || gate.intent?.move !== 'oneness') return;
  const n = unisonHits(c);
  if ((gate.intent.hits ?? 1) <= n) return;
  gate.intent.hits = n;
  c.emit({ t: 'text', uid: gate.uid, text: '모이던 빛 한 줄기가 꺼졌다', tone: 'good' });
}

/** 차원이 접힌다: 뒤에 있던 문이 전열로 끌려 나온다 (전열이 가득하면 맨 끝 구체 하나를 뒤로 밀어낸다) */
export function foldForward(c: Combat, e: EnemyUnit) {
  if (e.dead || e.row === 0) return;
  const front = c.row(0);
  if (front.length >= MAX_ROW) c.moveRow(front[front.length - 1], 1);
  if (!c.moveRow(e, 0)) return;
  setUi(c, 'ui:tilt', FOLD_TILT);
  c.emit({ t: 'text', uid: e.uid, text: '차원이 접혀 문이 코앞으로 쏟아진다. 근접 공격이 닿는다', tone: 'eldritch' });
  // 제4의 벽: 기울어진 화면을 기기 탓으로 돌린다 (처음 한 번)
  if (once(c, 'a4-fold')) cine(c, 'sysmsg', { uid: e.uid, text: '화면 회전 잠금이 해제되었습니다.' });
}

/** 접힌 차원이 펴진다 (차지가 끝났거나 붕괴로 끊긴 뒤): 문이 다시 뒤로 물러난다. 앞에 구체가 없으면 그대로 앞에 선다 */
export function unfold(c: Combat, e: EnemyUnit) {
  if (e.mem.charge) return;
  setUi(c, 'ui:tilt', 0);
  if (e.dead || e.row !== 0) return;
  if (!c.row(0).some((x) => x !== e) || c.row(1).length >= MAX_ROW) return;
  if (c.moveRow(e, 1)) c.emit({ t: 'text', uid: e.uid, text: '접힌 차원이 펴지며 문이 물러난다', tone: 'info' });
}

// ───────────── 검은 파라오 ─────────────

export const PHARAOH = 'black-pharaoh';
/** 가면을 쓴 파라오의 거짓 의도가 드러나는 통찰 */
export const LIAR_REVEAL = 5;
/** 왕의 명령 (n = 지목한 기술의 칸 번호) */
export const COMMAND = 'a4-command';
export const DEFY_SAN = 15;
export const DEFY_STR = 2;

/** 다음 내 턴에 쓸 수 있는 장착 기술의 칸 (0부터) */
function commandable(c: Combat): number[] {
  const out: number[] = [];
  c.run.slots.forEach((uid, i) => {
    if (!uid) return;
    const info = c.skillInfo(uid);
    // 대기는 내 턴이 시작될 때 1 줄어든다
    if (!info || (c.s.cd[uid] ?? 0) > 1 || c.costOf(info) > c.p.maxAp) return;
    if (info.def.canUse?.(c, c.makeUse(info))) return;
    out.push(i);
  });
  return out;
}

/** 왕의 명령: 다음 내 턴에 쓸 기술 하나를 지목한다. 지목할 것이 없거나 결계에 막히면 false */
export function issueCommand(c: Combat, e: EnemyUnit): boolean {
  if ((c.p.st[COMMAND] ?? 0) > 0) setSt(c, c.p, COMMAND, 0);
  delete e.mem.obeyed;
  const pool = commandable(c);
  if (!pool.length) return false;
  const i = c.rng.pick(pool);
  if (c.apply(c.p, COMMAND, i + 1, e) <= 0) return false;
  const name = skillName(c, c.run.slots[i]!);
  c.emit({ t: 'text', uid: e.uid, text: `왕의 명령: 「${name}」${eul(name)} 써라`, tone: 'eldritch' });
  // 제4의 벽: 게임의 도움말이 파라오의 명령을 대신 전한다 (처음 한 번)
  if (once(c, 'a4-cmd-tip')) cine(c, 'sysmsg', { uid: e.uid, text: `도움말: 지금은 「${name}」${eul(name)} 쓰는 것이 좋습니다.` });
  return true;
}

function obey(c: Combat) {
  setSt(c, c.p, COMMAND, 0);
  c.emit({ t: 'text', uid: 'p', text: '왕의 명령에 따랐다', tone: 'info' });
  const ph = alive(c, PHARAOH);
  if (!ph) return;
  ph.mem.obeyed = 1;
  if (ph.intent?.move === 'command') {
    ph.intent.kind = 'buff';
    ph.intent.label = '흡족해한다';
    delete ph.intent.extra;
  }
}

/** 파라오의 차례: 명령을 따랐으면 흡족해하고, 따르지 않았으면 벌한다 */
export function judgeCommand(c: Combat, e: EnemyUnit) {
  const ordered = (c.p.st[COMMAND] ?? 0) > 0;
  const pleased = !!e.mem.obeyed;
  delete e.mem.obeyed;
  if (!ordered) {
    c.emit({ t: 'text', uid: e.uid, text: pleased ? '흡족한 듯 웃는다' : '명령이 허공에 흩어졌다', tone: 'eldritch' });
    return;
  }
  setSt(c, c.p, COMMAND, 0);
  c.emit({ t: 'text', uid: e.uid, text: '명령을 어겼다. 왕이 노한다', tone: 'bad' });
  c.horror(e, DEFY_SAN);
  if (c.over || e.dead) return;
  c.apply(c.p, 'dread', 2, e);
  c.apply(e, 'str', DEFY_STR, e);
}

// ───────────── 검은 파라오: 심판의 상형문자 (즉사 퍼즐) ─────────────

/** 상형문자 (플레이어 상태, n = 남은 상형문자 수). 순서·남은 턴은 퍼즐 목표(c.s.obj)와 파라오의 mem에 */
export const GLYPHS = 'a4-glyphs';
export const GLYPH_COUNT = 3;
/** 상형문자를 지울 수 있는 내 턴 수 */
export const GLYPH_TURNS = 2;
/** 심판이 끝난 뒤 다시 새기기까지 / 전투마다 최대 횟수 */
export const GLYPH_GAP = 6;
export const GLYPH_MAX = 2;
/** 상형문자를 모두 지우면 파라오가 비틀거린다 (버팀) */
export const GLYPH_STAGGER = 4;
export const JUDGMENT = '신들의 심판';

const TYPE_NAME: Record<DmgType, string> = { slash: '참격', pierce: '관통', blunt: '타격', fire: '화염', arcane: '비전', void: '공허' };

/**
 * 지금 낼 수 있는 피해 속성: 무기 기본 공격 + 장착한 공격 기술 (공허 각인을 새긴 기술은 공허).
 * 상형문자를 지우는 두 턴 안에 쓸 수 없는 기술(빼앗겨 잠긴 기술, 전투당 1회 기술, 행동력이 모자란 기술)은 뺀다
 */
export function dealableTypes(c: Combat): DmgType[] {
  const out: DmgType[] = [];
  for (const ref of ['weapon', ...c.run.slots.filter((x): x is string => !!x)]) {
    const info = c.skillInfo(ref);
    if (!info?.def.type || !info.def.tags.includes('attack')) continue;
    if (ref !== 'weapon' && ((c.s.cd[ref] ?? 0) > GLYPH_TURNS || c.costOf(info) > c.p.maxAp)) continue;
    const t: DmgType = info.owned.runes.includes('void-rune') ? 'void' : info.def.type;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** 새길 상형문자: 낼 수 있는 속성 중에서만 (셋이 넘으면 서로 다르게, 모자라면 겹쳐서) */
export function chooseGlyphs(c: Combat): DmgType[] {
  const pool = dealableTypes(c);
  if (!pool.length) return [];
  const order = c.rng.shuffle([...pool]);
  return Array.from({ length: GLYPH_COUNT }, (_, i) => order[i] ?? c.rng.pick(pool));
}

function glyphText(types: DmgType[], turns: number): string {
  return `상형문자: ${types.map((t) => TYPE_NAME[t]).join(' → ')} (${turns > 0 ? `${turns}턴 남음` : '심판이 내린다'})`;
}

/** 새길 수 있는가: 둘째 턴이 끝난 뒤 계획할 때부터(새기는 것은 셋째 턴), 별의 심판이 걸려 있지 않을 때, 지난 심판 뒤 GLYPH_GAP턴, 전투마다 GLYPH_MAX번 */
export function canInscribe(c: Combat, e: EnemyUnit): boolean {
  if (e.mem.glyphs || (e.mem.judges ?? 0) >= GLYPH_MAX) return false;
  if (c.s.turn < 2 || (c.p.st[DOOM] ?? 0) > 0) return false;
  if (c.s.turn - (e.mem.judgedAt ?? -99) < GLYPH_GAP) return false;
  return dealableTypes(c).length > 0;
}

/** 심판의 상형문자를 새긴다: 퍼즐 목표(속성 순서)와 남은 턴을 건다 */
export function inscribe(c: Combat, e: EnemyUnit): boolean {
  const types = chooseGlyphs(c);
  if (!types.length) return false;
  e.mem.glyphs = 1;
  e.mem.glyphTurns = GLYPH_TURNS;
  e.mem.judges = (e.mem.judges ?? 0) + 1;
  setSt(c, c.p, GLYPHS, types.length);
  setObjective(c, { text: glyphText(types, GLYPH_TURNS), types, lethal: true });
  c.emit({ t: 'text', uid: e.uid, text: '심판의 상형문자를 새긴다', tone: 'eldritch' });
  // 처음엔 화면 유리에 붉은 상형문자가 새겨진다 (제4의 벽), 다음부터는 짧게
  if (once(c, 'a4-glyph-cine')) cine(c, 'scrawl', { uid: e.uid, text: types.map((t) => TYPE_NAME[t]).join(' · ') });
  else cine(c, 'glitch', { uid: e.uid, n: 1 });
  return true;
}

/** 심판을 거둔다 (풀림·붕괴·처치·실행 모두) */
function endGlyphs(c: Combat, e: EnemyUnit) {
  delete e.mem.glyphs;
  delete e.mem.glyphTurns;
  e.mem.judgedAt = c.s.turn;
  setSt(c, c.p, GLYPHS, 0);
  if (c.s.obj?.types) setObjective(c, null);
}

/** 앞의 상형문자 하나를 지운다. 다 지우면 심판이 흩어지고 파라오가 비틀거린다 (의도도 바로 바뀐다) */
function eraseGlyph(c: Combat, e: EnemyUnit) {
  const rest = (c.s.obj?.types ?? []).slice(1);
  if (rest.length) {
    setSt(c, c.p, GLYPHS, rest.length);
    setObjective(c, { text: glyphText(rest, e.mem.glyphTurns ?? 0), types: rest, lethal: true });
    c.emit({ t: 'text', uid: e.uid, text: '상형문자 하나가 지워졌다', tone: 'good' });
    return;
  }
  endGlyphs(c, e);
  c.emit({ t: 'text', uid: e.uid, text: '상형문자가 모두 지워졌다. 심판이 흩어진다', tone: 'good' });
  if (e.broken === 0 && e.maxPoise > 0) {
    e.poise = Math.max(0, e.poise - GLYPH_STAGGER);
    if (e.poise === 0) c.breakEnemy(e);
    else c.emit({ t: 'text', uid: e.uid, text: `비틀거린다 (버팀 -${GLYPH_STAGGER})`, tone: 'info' });
  }
  if (!e.dead && e.broken !== 2 && e.intent?.move === 'judgment') c.planIntent(e);
}

/** 신들의 심판: 아직 기한이 남았으면 모래시계만 흐르고, 기한이 다했는데 상형문자가 남아 있으면 즉사 (결계가 한 번 막는다) */
export function judge(c: Combat, e: EnemyUnit) {
  if (!e.mem.glyphs) {
    c.emit({ t: 'text', uid: e.uid, text: '심판이 흩어졌다', tone: 'info' });
    return;
  }
  if ((e.mem.glyphTurns ?? 0) > 0) {
    c.emit({ t: 'text', uid: e.uid, text: '모래시계가 흐른다. 심판이 다가온다', tone: 'eldritch' });
    return;
  }
  endGlyphs(c, e);
  // 결계가 막으면 다음 패턴으로 이어진다 (엔진이 '결계가 죽음을 막았다'를 띄운다)
  execute(c, e, JUDGMENT);
}

// ───────────── 별의 자손 군주 ─────────────

export const LORD = 'starspawn-lord';
/** 흔들리는 대지 (n = 뒤집을 때까지 더 잃어야 하는 체력) */
export const QUAKE = 'a4-quake';
/** 첫 문턱은 최대 체력의 15%, 뒤집을 때마다 5%p씩 오른다 */
export const QUAKE_FIRST = 0.15;
export const QUAKE_STEP = 0.05;
export const FLIP_DMG = 12;
export const FLIP_BLOCK = 16;
/** 떨어지는 별 (n = 남은 내 턴 수) */
export const STARFALL = 'a4-starfall';
export const STAR_TURNS = 2;
/** 별이 떨어지면: 당신에게 피해 (방어도가 막는다, 조수·힘에 따라 바뀌지 않는다) / 전열의 적은 저마다 최대 체력의 비율 (최소치) */
export const STAR_DMG = 45;
export const STAR_PCT = 0.2;
export const STAR_MIN = 60;

export const quakeNeed = (e: EnemyUnit): number => Math.max(1, Math.round(e.maxHp * (QUAKE_FIRST + QUAKE_STEP * (e.mem.flips ?? 0))));

export function armQuake(c: Combat, e: EnemyUnit) {
  setSt(c, e, QUAKE, quakeNeed(e));
}

/** 대지를 뒤집는다: 덮치고, 모든 적의 열을 바꾸고, 방어도. 흔들림 때문에 뒤집었다면 문턱이 올라 다시 차오른다 */
export function overturn(c: Combat, e: EnemyUnit) {
  const reactive = !!e.mem.overturn;
  delete e.mem.overturn;
  c.enemyAttack(e, { type: 'blunt' });
  if (c.over || e.dead) return;
  flipRows(c);
  c.gainBlock(e, FLIP_BLOCK);
  if (reactive) {
    e.mem.flips = (e.mem.flips ?? 0) + 1;
    armQuake(c, e);
  }
}

/** 별을 부른다 (이미 떨어지는 중이면 아무 일도 없다). 결계에 막힐 수 있다 */
export function callStar(c: Combat, e: EnemyUnit) {
  if ((c.p.st[STARFALL] ?? 0) > 0) return;
  if (c.apply(c.p, STARFALL, STAR_TURNS, e) <= 0) return;
  c.emit({ t: 'text', uid: 'p', text: `하늘에서 별 하나가 끌려 내려온다. 내 턴이 ${STAR_TURNS}번 끝나면 전열에 떨어진다`, tone: 'eldritch' });
}

function scatterStar(c: Combat, text: string) {
  if (!((c.p.st[STARFALL] ?? 0) > 0)) return;
  setSt(c, c.p, STARFALL, 0);
  c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

/** 별이 떨어진다: 전열의 적은 저마다 큰 피해(방어도 무시, 내 처치로 치지 않는다), 당신도 피해 (방어도가 먼저 막는다) */
function starfall(c: Combat) {
  setSt(c, c.p, STARFALL, 0);
  const lord = alive(c, LORD);
  if (!lord) return;
  cine(c, 'impact', { uid: lord.uid });
  cine(c, 'crack', { n: 2 });
  c.emit({ t: 'text', text: '별이 전열에 떨어졌다!', tone: 'eldritch' });
  for (const x of c.row(0)) {
    if (c.over) return;
    c.damage({ src: lord, tgt: x, base: Math.max(STAR_MIN, Math.round(x.maxHp * STAR_PCT)), type: 'true', ignoreBlock: true, tags: ['a4-star'] });
  }
  if (c.over) return;
  // 설명에 적힌 그대로의 피해 (방어도가 먼저 막는다)
  c.damage({ src: null, tgt: c.p, base: STAR_DMG, type: 'true', tags: ['a4-star'] });
}

// ───────────── 검은 별 ─────────────

export const BLACK_STAR = 'black-star';
export const VOID_EYE = 'void-eye';
/** 어둠 (n 1~3) */
export const DARK = 'a4-dark';
export const DARK_MAX = 3;
/** 어둠에 묻힌 의도가 보이는 통찰 */
export const DARK_REVEAL = 4;
export const ECLIPSE_SAN = 16;
export const ECLIPSE_STR = 2;
/** 어둠 단계별 화면의 어두움 (%) */
const DARK_UI = [0, 25, 50, 70];
const SHROUD = '어둠 속';

export function syncDark(c: Combat) {
  setUi(c, 'ui:dark', DARK_UI[Math.min(DARK_MAX, c.p.st[DARK] ?? 0)]);
}

/** 어둠 2 이상: 적의 의도가 어둠에 묻힌다 (힘을 모으는 것·일식·붕괴는 보인다) */
function shroud(c: Combat) {
  for (const e of c.alive) {
    const it = e.intent;
    if (!it || it.charging || e.mem.charge || it.move === 'eclipse' || it.move.startsWith('_')) continue;
    it.disguise = { kind: 'unknown', label: SHROUD, reveal: DARK_REVEAL };
  }
}

function unshroud(c: Combat) {
  for (const e of c.alive) {
    const it = e.intent;
    if (!it?.disguise || it.disguise.label !== SHROUD) continue;
    const own = c.moveDef(e, it.move).disguise;
    if (own) it.disguise = own;
    else delete it.disguise;
  }
}

/** 어둠을 쌓는다 (최대 3, 결계에 막힐 수 있다) */
export function addDark(c: Combat, src: EnemyUnit, n: number) {
  if (c.over || n <= 0) return;
  const cur = c.p.st[DARK] ?? 0;
  const add = Math.min(DARK_MAX - cur, n);
  if (add <= 0) return;
  if (c.apply(c.p, DARK, add, src) <= 0) return;
  const now = c.p.st[DARK] ?? 0;
  syncDark(c);
  // 제4의 벽: 정말로 화면이 어두워진다
  if (once(c, 'a4-dark-msg')) cine(c, 'sysmsg', { uid: src.uid, text: '주변이 어두워 화면 밝기를 자동으로 낮췄습니다.' });
  c.emit({
    t: 'text',
    uid: 'p',
    text: now >= DARK_MAX ? '빛이 거의 남지 않았다. 일식이 온다' : now >= 2 ? '어둠 속에서 아무것도 보이지 않는다' : '빛이 먹혀 든다',
    tone: 'eldritch',
  });
  if (now >= 2) shroud(c);
}

/** 어둠을 걷어 낸다. 일식을 준비하던 별은 다시 생각한다 */
export function lighten(c: Combat, n: number) {
  const cur = c.p.st[DARK] ?? 0;
  if (cur <= 0 || n <= 0) return;
  c.apply(c.p, DARK, -Math.min(n, cur));
  const now = c.p.st[DARK] ?? 0;
  syncDark(c);
  c.emit({ t: 'text', uid: 'p', text: '빛이 돌아온다', tone: 'good' });
  if (now < DARK_MAX) {
    for (const e of c.alive) {
      if (e.intent?.move !== 'eclipse' || e.broken === 2) continue;
      c.planIntent(e);
      c.emit({ t: 'text', uid: e.uid, text: '일식이 흩어졌다', tone: 'good' });
    }
  }
  if (now >= 2) shroud(c);
  else unshroud(c);
}

/** 일식: 정신 피해·공포·힘, 그 뒤 배를 채운 별이 어둠을 1까지 물린다 */
export function eclipse(c: Combat, e: EnemyUnit) {
  // 제4의 벽: 지금 화면 너머의 시각을 안다
  if (once(c, 'a4-eclipse')) cine(c, 'whisper', { uid: e.uid, text: '{time}.\n네 방의 불도 꺼 주마.' });
  c.horror(e, ECLIPSE_SAN);
  if (c.over || e.dead) return;
  c.apply(c.p, 'dread', 2, e);
  c.apply(e, 'str', ECLIPSE_STR, e);
  const cur = c.p.st[DARK] ?? 0;
  if (cur > 1) {
    c.apply(c.p, DARK, 1 - cur);
    syncDark(c);
    unshroud(c);
  }
}

// ───────────── 정예 ─────────────

export const MOTHER = 'thousand-mother';
/** 천 마리 새끼의 어머니: 얽힌 뿌리 (n = 남은 턴) */
export const ENTANGLE = 'a4-entangle';
export const ROOT_TURNS = 2;

export function entangle(c: Combat, e: EnemyUnit) {
  const cur = c.p.st[ENTANGLE] ?? 0;
  if (cur >= ROOT_TURNS) return;
  if (c.apply(c.p, ENTANGLE, ROOT_TURNS - cur, e) > 0) c.emit({ t: 'text', uid: 'p', text: '검은 뿌리가 발목을 휘감았다', tone: 'bad' });
}

/** 이스의 방랑자: 몸 바꾸기 — 체력 비율이 이만큼(최대) 서로 뒤바뀐다, 이 차이 이상 벌어지면 준비한다, 전투마다 시도 횟수 */
export const SWAP_CAP = 0.25;
export const SWAP_GAP = 0.2;
export const SWAP_MAX = 2;
/** 준비하는 동안 이만큼(최대 체력 비율) 피해를 받으면 몸 바꾸기가 끊긴다 — 붕괴시킬 약점이 없는 출신도 끊을 수 있게 */
export const SWAP_BREAK = 0.06;

export const swapBreakNeed = (e: EnemyUnit): number => Math.max(1, Math.round(e.maxHp * SWAP_BREAK));

/** 몸 바꾸기를 준비하던 방랑자가 피해를 받는다: 쌓여 문턱을 넘으면 끊긴다 */
export function shakeReach(c: Combat, e: EnemyUnit, n: number) {
  if (e.mem.charge !== 2 || n <= 0 || e.hp <= 0) return;
  e.mem.reachHit = (e.mem.reachHit ?? 0) + n;
  if (e.mem.reachHit < swapBreakNeed(e)) return;
  delete e.mem.charge;
  delete e.mem.reachHit;
  c.emit({ t: 'text', uid: e.uid, text: '몸 바꾸기가 끊겼다', tone: 'good' });
  if (c.s.phase === 'player' && e.broken !== 2) c.planIntent(e);
}

export function bodySwap(c: Combat, e: EnemyUnit) {
  delete e.mem.charge;
  delete e.mem.reachHit;
  const gap = Math.min(SWAP_CAP, c.p.hp / Math.max(1, c.p.maxHp) - e.hp / Math.max(1, e.maxHp));
  if (gap <= 0 || c.dying) {
    c.emit({ t: 'text', uid: e.uid, text: '바꿀 만한 몸이 아니다', tone: 'info' });
    return;
  }
  const take = Math.max(1, Math.round(gap * c.p.maxHp));
  const give = Math.max(1, Math.round(gap * e.maxHp));
  c.emit({ t: 'text', uid: 'p', text: '몸이 뒤바뀌었다. 상처가 고스란히 넘어온다', tone: 'eldritch' });
  c.loseHp(c.p, take, 'a4-bodyswap');
  if (!c.over && !e.dead) c.heal(e, give);
}

/** 별 사이를 걷는 자: 바람 타기 (n = 떨어뜨리려면 더 맞혀야 하는 공격 수) */
export const WINDRIDE = 'a4-windride';
export const RIDE_HITS = 3;

export function rideWind(c: Combat, e: EnemyUnit) {
  setSt(c, e, WINDRIDE, RIDE_HITS);
  c.emit({ t: 'text', uid: e.uid, text: '별바람을 타고 떠올랐다', tone: 'eldritch' });
}

/** 사냥하는 공포: 어둠 속 사냥 — 등불이 25 모자랄 때마다 한 번 더 문다 (1~5번) */
export const HUNT_DMG = 6;
export const huntHits = (c: Combat): number => Math.max(1, Math.min(5, 1 + Math.floor((100 - c.run.light) / 25)));
/** 화염 피해를 받을 때마다 밝아지는 등불 */
export const FIRE_LIGHT = 5;

/** 화면의 어둠이 등불을 따라간다 (등불 70 이상이면 밝다) */
export function syncLampDark(c: Combat) {
  setUi(c, 'ui:dark', Math.max(0, Math.min(70, 70 - c.run.light)));
}

/** 불꽃이 어둠을 밀어낸다 (화염 피해·화상, 다른 공격은 내 턴마다 한 번): 등불이 밝아지고, 준비하던 사냥의 횟수도 줄어든다 */
export function flare(c: Combat, e: EnemyUnit) {
  if (c.run.light >= 100) return;
  c.run.light = Math.min(100, c.run.light + FIRE_LIGHT);
  c.emit({ t: 'text', uid: 'p', text: `빛에 움찔한다 (등불 +${FIRE_LIGHT})`, tone: 'good' });
  syncLampDark(c);
  if (e.intent?.move === 'hunt') e.intent.hits = huntHits(c);
}

// ───────────── 상태 등록 ─────────────

reg.statuses([
  {
    id: GLYPHS,
    name: '심판의 상형문자',
    icon: 'gi:eye-of-horus',
    kind: 'debuff',
    desc: `검은 파라오가 새긴 상형문자 {n}개. 위 띠에 적힌 속성으로 파라오를 차례대로 맞히면 앞에서부터 하나씩 지워진다 (틀린 속성은 아무 일도 없다). 기한 안에 모두 지우지 못하면 「${JUDGMENT}」: 사경 없이 즉사 (결계가 한 번 막는다). 파라오를 붕괴시키거나 기절시켜도 지워진다`,
    hooks: {
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.attack || d.amount <= 0 || !isEnemy(d.tgt) || d.tgt.def !== PHARAOH) return;
        const e = d.tgt;
        if (!e.mem.glyphs || c.s.obj?.types?.[0] !== d.type) return;
        eraseGlyph(c, e);
      },
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        const e = alive(c, PHARAOH);
        if (!e?.mem.glyphs) return;
        e.mem.glyphTurns = Math.max(0, (e.mem.glyphTurns ?? 0) - 1);
        const types = c.s.obj?.types ?? [];
        if (types.length) setObjective(c, { text: glyphText(types, e.mem.glyphTurns), types, lethal: true });
        if (e.mem.glyphTurns === 0) c.emit({ t: 'text', uid: e.uid, text: '모래가 다 떨어졌다. 신들의 심판이 내린다', tone: 'bad' });
      },
      onBreak(c, s, victim) {
        if (s.unit !== c.p || victim.def !== PHARAOH || !victim.mem.glyphs) return;
        endGlyphs(c, victim);
        c.emit({ t: 'text', uid: victim.uid, text: '붕괴하자 상형문자도 무너졌다', tone: 'good' });
      },
      // 기절시키면 읊던 심판이 끊긴다 (수호자 기절 규칙에 막혀 기절하지 않으면 그대로)
      onApplied(c, s, target, id) {
        if (s.unit !== c.p || id !== 'stun' || !isEnemy(target) || target.def !== PHARAOH || !target.mem.glyphs) return;
        endGlyphs(c, target);
        c.emit({ t: 'text', uid: target.uid, text: '기절해 읊던 심판이 끊겼다', tone: 'good' });
        if (target.broken !== 2 && target.intent?.move === 'judgment') c.planIntent(target);
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === PHARAOH && victim.mem.glyphs) endGlyphs(c, victim);
      },
    },
  },
  {
    id: COMMAND,
    name: '왕의 명령',
    icon: 'gi:pointing',
    kind: 'debuff',
    desc: `검은 파라오가 {n}번째 칸의 기술을 지목했다. 이번 턴에 그 기술을 쓰면 왕이 흡족해한다. 쓰지 않으면 파라오의 차례에 정신 피해 ${DEFY_SAN}, 공포 2, 파라오 힘 +${DEFY_STR}`,
    hooks: {
      onTurnStart(c, s) {
        if (s.unit !== c.p) return;
        const uid = c.run.slots[s.n - 1];
        const ph = alive(c, PHARAOH);
        if (uid && ph?.intent?.move === 'command') ph.intent.label = `명령: 「${skillName(c, uid)}」`;
      },
      afterSkill(c, s, u) {
        if (s.unit !== c.p || u.echo) return;
        if (u.owned.uid === c.run.slots[s.n - 1]) obey(c);
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === PHARAOH) setSt(c, c.p, COMMAND, 0);
      },
    },
  },
  {
    id: QUAKE,
    name: '흔들리는 대지',
    icon: 'gi:earth-crack',
    kind: 'buff',
    desc: '체력을 {n} 더 잃으면 고통에 몸부림치며 다음 행동이 「대지를 뒤집는다」로 바뀐다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.tgt !== e || e.hp <= 0 || d.hpLoss <= 0 || e.mem.overturn) return;
        const left = (e.st[QUAKE] ?? 0) - d.hpLoss;
        if (left > 0) {
          setSt(c, e, QUAKE, left);
          return;
        }
        setSt(c, e, QUAKE, 0);
        e.mem.overturn = 1;
        // 내 턴에 무너뜨렸다면 군주가 하려던 행동은 다음 차례로 미뤄진다 (사라지지 않는다)
        if (c.s.phase === 'player') e.mem.postpone = 1;
        c.emit({ t: 'text', uid: e.uid, text: '고통에 몸부림친다. 대지를 뒤집으려 한다', tone: 'eldritch' });
        if (e.broken !== 2) c.planIntent(e);
      },
    },
  },
  {
    id: STARFALL,
    name: '떨어지는 별',
    icon: 'gi:meteor-impact',
    kind: 'debuff',
    desc: `별의 자손 군주가 끌어내린 별. 내 턴이 {n}번 더 끝나면 전열에 떨어진다. 전열의 적은 저마다 방어도를 무시하고 최대 체력의 ${Math.round(STAR_PCT * 100)}%(최소 ${STAR_MIN}) 피해. 나에게는 피해 ${STAR_DMG} (방어도가 먼저 막는다). 전열이 비면 뒤에 숨은 군주가 끌려 나온다. 군주를 붕괴시키거나 쓰러뜨리면 별이 흩어진다`,
    tickEnd(c, u, n) {
      if (isEnemy(u)) {
        setSt(c, u, STARFALL, 0);
        return;
      }
      if (n > 1) {
        setSt(c, u, STARFALL, n - 1);
        c.emit({ t: 'text', uid: 'p', text: '별이 바로 위에서 타오른다. 다음 내 턴이 끝나면 전열에 떨어진다', tone: 'bad' });
        return;
      }
      starfall(c);
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.def === LORD) scatterStar(c, '붕괴하자 별이 흩어졌다');
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === LORD) scatterStar(c, '군주가 쓰러지자 별이 흩어졌다');
      },
    },
  },
  {
    id: DARK,
    name: '어둠',
    icon: 'gi:night-sky',
    kind: 'debuff',
    desc: `검은 별이 빛을 먹었다 (최대 ${DARK_MAX}). 2 이상이면 적의 의도가 어둠에 묻힌다. 힘을 모으는 것과 일식은 보인다. 통찰 ${DARK_REVEAL}이면 모두 보인다. ${DARK_MAX}이 되면 검은 별이 일식을 일으킨다. 어둠을 1씩 걷어 내는 법: 검은 별을 화염이나 비전으로 공격 (내 턴마다 한 번), 공허의 눈을 쓰러뜨림, 검은 별을 붕괴시킴`,
    hooks: {
      onTurnStart(c, s) {
        if (s.unit !== c.p) return;
        syncDark(c);
        if (s.n >= 2) shroud(c);
      },
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.attack || d.amount <= 0 || !isEnemy(d.tgt) || d.tgt.def !== BLACK_STAR) return;
        if (d.type !== 'fire' && d.type !== 'arcane') return;
        if (c.s.vars['a4-lit'] === c.s.turn) return;
        c.s.vars['a4-lit'] = c.s.turn;
        lighten(c, 1);
      },
      // 화염·비전이 없는 출신도 어둠을 걷을 수 있게: 빛을 먹던 눈이 감기거나, 별이 무너지면 빛이 돌아온다
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === VOID_EYE && !victim.fled) lighten(c, 1);
      },
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.def === BLACK_STAR) lighten(c, 1);
      },
    },
  },
  {
    id: ENTANGLE,
    name: '얽힌 뿌리',
    icon: 'gi:tree-roots',
    kind: 'debuff',
    desc: '검은 뿌리가 발목을 휘감았다. 내 턴이 시작될 때 행동력 -1 ({n}턴). 화염이나 참격 기술을 쓰거나 어머니를 공격해 피해를 주면 끊어진다',
    tickStart(c, u) {
      if (isEnemy(u)) {
        setSt(c, u, ENTANGLE, 0);
        return;
      }
      c.s.ap = Math.max(1, c.s.ap - 1);
      c.emit({ t: 'text', uid: 'p', text: '뿌리가 발을 붙든다 (행동력 -1)', tone: 'bad' });
      c.apply(u, ENTANGLE, -1);
    },
    hooks: {
      afterSkill(c, s, u) {
        if (s.unit !== c.p || !((c.p.st[ENTANGLE] ?? 0) > 0)) return;
        const t = u.type ?? u.def.type;
        if (t !== 'fire' && t !== 'slash') return;
        setSt(c, c.p, ENTANGLE, 0);
        c.emit({ t: 'text', uid: 'p', text: '뿌리를 끊어 냈다', tone: 'good' });
      },
      // 화염·참격이 없는 출신도: 뿌리의 주인을 때리면 움찔하며 풀린다
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.attack || d.amount <= 0 || !isEnemy(d.tgt) || d.tgt.def !== MOTHER) return;
        if (!((c.p.st[ENTANGLE] ?? 0) > 0)) return;
        setSt(c, c.p, ENTANGLE, 0);
        c.emit({ t: 'text', uid: 'p', text: '어머니가 움찔하자 뿌리가 풀렸다', tone: 'good' });
      },
    },
  },
  {
    id: WINDRIDE,
    name: '바람 타기',
    icon: 'gi:whirlwind',
    kind: 'buff',
    desc: '별바람을 타고 떠 있다. 받는 공격 피해 -50%. 공격을 {n}번 더 맞으면 바람에서 떨어져 붕괴한다. 자기 차례가 오면 바람이 잦아든다',
    hooks: {
      modDamageIn(_c, s, d) {
        if (d.attack && d.tgt === s.unit) d.mult *= 0.5;
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.tgt !== e || e.hp <= 0 || !d.attack || d.src !== c.p) return;
        const left = (e.st[WINDRIDE] ?? 0) - 1;
        if (left > 0) {
          setSt(c, e, WINDRIDE, left);
          return;
        }
        setSt(c, e, WINDRIDE, 0);
        c.emit({ t: 'text', uid: e.uid, text: '바람에서 떨어졌다!', tone: 'good' });
        cine(c, 'impact', { uid: e.uid });
        if (e.broken === 0) c.breakEnemy(e);
      },
    },
    tickStart(c, u) {
      if (!isEnemy(u)) {
        setSt(c, u, WINDRIDE, 0);
        return;
      }
      setSt(c, u, WINDRIDE, 0);
      c.emit({ t: 'text', uid: u.uid, text: '바람이 잦아든다', tone: 'info' });
    },
  },
]);
