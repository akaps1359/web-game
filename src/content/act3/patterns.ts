import { reg } from '../../engine/registry';
import { josa } from '../../engine/josa';
import { isEnemy, MAX_ROW, unguarded, type Combat } from '../../engine/combat';
import { DMG_TYPES, type DamageCtx, type DmgType, type EnemyUnit } from '../../engine/types';
import { cine, execute, setObjective, setUi } from '../lib';
import { canReact, intentFor, refreshIntent, vanish } from './common';

/*
 * 3층 수호자·정예의 시그니처 메커니즘 (2026-10 패턴 확장).
 * 적의 특성(trait) 훅은 플레이어의 턴·기술을 볼 수 없어서, 플레이어 쪽에서 일어나는 규칙은 플레이어에게 거는 상태로 짰다.
 *  - 쇼고스 「흉내」: 숨은 상태 a3-ear가 이번 턴 마지막으로 쓴 기술을 기억한다 → throwBack()
 *  - 각도의 왕 「열린 각」: 화면의 금(ui:cracks) = 날카로운 각. 방어도로 메우고, 붕괴시키면 닫힌다
 *  - 산맥 너머의 것 「드러난 모습」: 보면(공격하면) 정신력, 대신 받는 피해 +50%
 *  - 깨어난 원로 「멈춘 칼날」: 멈춘 시간 속 칼날 다섯 — 원로를 때려 쳐낸다
 *    「얼음 감옥」: 내 기술 하나를 얼음 속에 가둔다 — 깨뜨리면 돌아오고, 못 깨면 기억이 부서진다
 *    「다섯 갈래의 몸」: 체력 UNFURL_AT(60%) 아래에서 펼쳐진다 — 팔 수만큼 때리고, 붕괴·큰 일격으로 팔을 자른다
 *  - 렝의 대거미 「몸속의 알」, 샨탁 「하늘에 매달림」, 고대인 해부학자 「절개선」, 시간에 얼어붙은 탐사대장 「멈춘 시간」
 * 수치는 전부 여기 상수로 두고 설명 문구도 같은 상수를 쓴다.
 */

const alive = (c: Combat, def: string): EnemyUnit | undefined => c.alive.find((x) => x.def === def);

/** 이 기술 사용(메아리 포함)을 가리키는 번호 — 기술 하나에 한 번만 세려고 쓴다 */
const useKey = (c: Combat): number => c.s.usedTotal + 1;

// ───────────── 쇼고스: 흉내 ─────────────

/** 쇼고스가 듣고 있다 (숨은 상태 — 기억만 한다) */
export const EAR = 'a3-ear';
/** 흉내: 공격 기술은 준 피해의 이 비율로 되던진다 */
export const MIMIC_RATE = 0.5;
/** 흉내 낼 것이 없을 때의 정신 피해 */
export const MIMIC_SCREAM = 8;

const MIM = {
  dmg: 'a3-mimDmg',
  blk0: 'a3-mimBlk0',
  type: 'a3-mimType',
  kind: 'a3-mimKind',
  val: 'a3-mimVal',
  ref: 'a3-mimRef',
  turn: 'a3-mimTurn',
} as const;
const TYPES: (DmgType | 'true')[] = [...DMG_TYPES, 'true'];

/** 흉내 낼 기술 이름 (이번 턴 마지막으로 쓴 기술) */
function mimicName(c: Combat): string {
  const ref = c.s.vars[MIM.ref] ?? -9;
  const key = ref === -1 ? 'weapon' : ref === -2 ? 'armor' : c.run.slots[ref];
  return (key && c.skillInfo(key)?.def.name) || '기술';
}

/**
 * 쇼고스의 흉내: 이번 턴 당신이 마지막으로 쓴 기술을 따라 한다.
 * 피해를 준 기술 → 준 피해의 절반을 같은 속성으로, 방어도만 얻은 기술 → 그만큼 방어도, 그 밖(또는 기술을 안 씀) → 테켈리-리 비명
 */
export function throwBack(c: Combat, e: EnemyUnit) {
  const v = c.s.vars;
  const kind = v[MIM.turn] === c.s.turn ? (v[MIM.kind] ?? 3) : 0;
  if (kind === 1 || kind === 2) {
    const name = mimicName(c);
    e.mem.copies = (e.mem.copies ?? 0) + 1;
    // 처음 흉내 낼 때만 가짜 시스템 창 — 그 뒤로는 화면이 일그러지기만 한다
    if (e.mem.copies === 1) cine(c, 'sysmsg', { text: `「${name}」의 복제가 완료되었습니다.` });
    else cine(c, 'glitch', { n: 2, uid: e.uid });
    c.emit({ t: 'text', uid: e.uid, text: `「${name}」… 테켈리-리!`, tone: 'eldritch' });
    if (kind === 1) {
      const dmg = Math.ceil((v[MIM.val] ?? 0) * MIMIC_RATE);
      const type = TYPES[v[MIM.type] ?? 2] ?? 'blunt';
      if (dmg > 0) c.damage({ src: e, tgt: c.p, base: dmg, type, tags: ['a3-mimic'] });
    } else c.gainBlock(e, v[MIM.val] ?? 0);
    return;
  }
  c.emit({ t: 'text', uid: e.uid, text: '흉내 낼 것이 없다. 테켈리-리!', tone: 'eldritch' });
  c.horror(e, MIMIC_SCREAM);
}

/** 쇼고스가 당신의 기술을 듣기 시작한다 (전투 시작 시) */
export function startListening(c: Combat) {
  c.p.st[EAR] = 1;
}

// ───────────── 각도의 왕: 열린 각 ─────────────

export const ANGLE = 'a3-angle';
export const MAX_ANGLES = 3;
/** 내 턴을 이 방어도 이상으로 끝내면 각 하나를 메운다 (회반죽) */
export const PLASTER = 12;
/** 메우지 못한 각 하나가 무는 피해 */
export const ANGLE_BITE = 6;
/** 각도의 왕이 후열에 숨어 각도가 비틀린 동안 화면이 기우는 정도 */
export const TILT = 8;

function syncCracks(c: Combat) {
  setUi(c, 'ui:cracks', Math.min(3, c.p.st[ANGLE] ?? 0));
}

/** 각도의 왕이 후열(각도 속)에 있으면 화면이 기운다 */
export function syncTilt(c: Combat) {
  const king = alive(c, 'angle-king');
  setUi(c, 'ui:tilt', king && king.row === 1 ? TILT : 0);
}

/** 열린 각이 모두 닫힌다 (사냥도 빗나간다) */
export function closeAngles(c: Combat, text: string) {
  if ((c.p.st[ANGLE] ?? 0) > 0) {
    c.clear(c.p, ANGLE);
    c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
  }
  setUi(c, 'ui:cracks', 0);
  cancelHunt(c);
}

/** 화면에 날카로운 각을 하나 연다 (최대 MAX_ANGLES). 열었으면 true */
export function openAngle(c: Combat, e: EnemyUnit): boolean {
  if ((c.p.st[ANGLE] ?? 0) >= MAX_ANGLES) return false;
  if (c.apply(c.p, ANGLE, 1, e) <= 0) return false;
  const n = c.p.st[ANGLE] ?? 0;
  cine(c, 'crack', { n: Math.min(3, n), uid: e.uid });
  syncCracks(c);
  c.emit({ t: 'text', uid: 'p', text: '유리에 날카로운 각이 생겼다', tone: 'eldritch' });
  return true;
}

/** 남은 모서리를 한꺼번에 연다 (체력이 절반 아래로 떨어진 각도의 왕이 한 번). 열었으면 true */
export function openAllAngles(c: Combat, e: EnemyUnit): boolean {
  const cur = c.p.st[ANGLE] ?? 0;
  if (cur >= MAX_ANGLES) return false;
  if (c.apply(c.p, ANGLE, MAX_ANGLES - cur, e) <= 0) return false;
  syncCracks(c);
  c.emit({ t: 'text', uid: 'p', text: '모든 모서리가 날카로워졌다', tone: 'eldritch' });
  return true;
}

// ── 틴달로스의 사냥 (막아야 하는 큰 위협 — 즉사는 아니다) ──
// 세 각이 모두 열리면 각도의 왕이 「틴달로스의 사냥」을 부른다: 다음 왕의 차례까지 사냥을 끊지 못하면 열린 모서리마다
// 사냥개가 튀어나와 문다 (최대 체력의 HUNT_BITE_PCT씩, 방어도 무시) + 출혈 HUNT_BLEED. 그 뒤 사냥개들은 왔던 각으로 돌아가며 각을 닫는다.
// 플레이어에게는 온전한 한 턴이 있다 (의도에 큰 공격, 화면 위에 호박색 목표 띠). 끊는 법은 셋 — 어느 빌드든 하나는 닿는다:
//  - 왕에게 피해 HUNT_DMG (그 사이 왕이 받는 피해를 센다 — 맞을 때마다 목표 띠의 남은 피해가 줄어든다)
//  - 방어도 PLASTER 이상으로 턴을 마쳐 각 하나를 메운다 (회반죽 — 방어구의 기본 방어로도 닿는다)
//  - 왕을 붕괴 (모든 각이 닫힌다)
// 풀리면 그 차례의 사냥은 헛돈다(왕이 아무것도 하지 않는다). 사냥이 끝나면 HUNT_GAP 턴 동안 다시 부르지 않는다.
// 전투 초반(HUNT_FROM 턴이 끝나기 전)에는 부르지 않는다.

export const HUNT = '틴달로스의 사냥';
/** 막지 못한 사냥: 열린 모서리 하나마다 최대 체력의 이 비율만큼 (방어도 무시) — 세 각이면 30% */
export const HUNT_BITE_PCT = 0.1;
/** 막지 못한 사냥의 후유증: 출혈 */
export const HUNT_BLEED = 3;
/** 목표 띠를 누르면 보이는, 막지 못했을 때의 대가 */
export const HUNT_FAIL = `열린 모서리마다 사냥개가 튀어나와 최대 체력의 ${Math.round(HUNT_BITE_PCT * 100)}%씩 피해 (세 각이면 ${Math.round(HUNT_BITE_PCT * 300)}%, 방어도 무시), 출혈 ${HUNT_BLEED}`;
/** 사냥을 끊는 피해 (사냥을 부른 뒤 왕이 받은 피해 — 출혈·독·화상도 센다). 어느 출신의 시작 덱으로도 한 턴에 닿는 정도 */
export const HUNT_DMG = 20;
/** 사냥이 끝난 뒤 다시 부르기까지 (턴) */
export const HUNT_GAP = 3;
/** 이 턴이 끝날 때부터 사냥을 부를 수 있다 — 해골은 빨라야 3턴째에 보인다 */
export const HUNT_FROM = 2;

/** 지금 사냥을 부를 수 있는가 (세 각이 모두 열렸고, 초반이 아니고, 지난 사냥 뒤 HUNT_GAP 턴이 지났다) */
export function huntReady(c: Combat, king: EnemyUnit): boolean {
  return !king.mem.hunt && (c.p.st[ANGLE] ?? 0) >= MAX_ANGLES && c.s.turn >= HUNT_FROM && c.s.turn - (king.mem.huntAt ?? -99) >= HUNT_GAP;
}

/** 목표 띠: 사냥을 끊는 셋 (왕에게 남은 피해는 맞을 때마다 줄어든다) */
function huntObjective(c: Combat, king: EnemyUnit) {
  const need = Math.max(0, HUNT_DMG - (king.mem.huntDmg ?? 0));
  setObjective(c, {
    text: `사냥을 끊어라: 왕에게 피해 ${need} · 방어도 ${PLASTER}로 턴 종료 · 붕괴 (1턴 남음)`,
    hit: { uid: king.uid, need },
    block: PLASTER,
    break: king.uid,
    fail: HUNT_FAIL,
  });
}

/** 사냥을 부른다 (의도를 정할 때). 처음엔 화면 너머로 경고한다 */
export function callHunt(c: Combat, king: EnemyUnit) {
  king.mem.hunt = 1;
  king.mem.huntDmg = 0;
  huntObjective(c, king);
  c.emit({ t: 'text', uid: king.uid, text: '모든 모서리가 열리자 사냥개들이 냄새를 맡았다', tone: 'eldritch' });
  if (!c.s.vars['a3-huntSeen']) {
    c.s.vars['a3-huntSeen'] = 1;
    cine(c, 'sysmsg', { text: '경고: 화면의 모서리 세 곳이 모두 열려 있습니다.' });
  }
}

/** 사냥을 부른 뒤 왕이 피해를 받았다 (적이 준 피해는 세지 않는다). HUNT_DMG를 채우면 사냥이 끊긴다 */
export function huntHit(c: Combat, king: EnemyUnit, n: number) {
  if (!king.mem.hunt || n <= 0) return;
  king.mem.huntDmg = (king.mem.huntDmg ?? 0) + n;
  if (king.mem.huntDmg >= HUNT_DMG) cancelHunt(c, '왕이 비틀거리자 사냥개들이 흩어졌다');
  else huntObjective(c, king);
}

/** 사냥이 빗나간다 (각 하나가 메워졌다·왕이 무너졌다·쓰러졌다). 내 턴에 풀리면 그 차례의 사냥은 헛돈다 */
export function cancelHunt(c: Combat, text?: string) {
  const king = c.s.enemies.find((x) => x.def === 'angle-king' && x.mem.hunt);
  if (!king) return;
  king.mem.hunt = 0;
  king.mem.huntAt = c.s.turn;
  setObjective(c, null);
  if (king.dead) return;
  if (text) c.emit({ t: 'text', uid: king.uid, text, tone: 'good' });
  // 붕괴했으면 그대로 (어차피 쉰다)
  if (king.broken !== 2 && king.intent?.move === 'hunt') {
    const m = c.moveDef(king, 'lost');
    king.intent = { move: 'lost', kind: m.intent, label: m.name };
  }
}

/** 사냥이 닿았다: 세 각이 아직 모두 열려 있으면 모서리마다 사냥개가 문다 (방어도 무시) + 출혈. 그 뒤 각은 모두 닫힌다 */
export function resolveHunt(c: Combat, king: EnemyUnit) {
  const pending = !!king.mem.hunt;
  king.mem.hunt = 0;
  king.mem.huntAt = c.s.turn;
  setObjective(c, null);
  const n = c.p.st[ANGLE] ?? 0;
  if (!pending || n < MAX_ANGLES) {
    c.emit({ t: 'text', uid: king.uid, text: '사냥개들이 메워진 모서리 앞에서 멈췄다', tone: 'good' });
    return;
  }
  c.emit({ t: 'text', uid: 'p', text: '모든 모서리에서 사냥개들이 튀어나왔다', tone: 'bad' });
  const bite = Math.ceil(c.p.maxHp * HUNT_BITE_PCT);
  for (let i = 0; i < n && !c.over; i++) c.damage({ src: king, tgt: c.p, base: bite, type: 'slash', ignoreBlock: true, tags: ['a3-hunt'] });
  if (c.over) return;
  c.apply(c.p, 'bleed', HUNT_BLEED, king);
  // 사냥개들은 왔던 각으로 돌아가며 그 각을 닫는다
  closeAngles(c, '사냥개들이 돌아가며 모서리가 모두 닫혔다');
}

// ───────────── 산맥 너머의 것: 드러난 모습 ─────────────

export const REVEALED = 'a3-revealed';
export const REVEAL_TURNS = 2;
/** 드러난 동안 받는 피해 배율 */
export const REVEAL_MULT = 1.5;
/** 드러난 것을 공격할 때마다(기술 하나마다) 그것을 보는 정신 피해 */
export const LOOK_SAN = 4;
/** 증기가 걷히기 시작할 때 / 드러났을 때 화면이 어두워지는 정도 */
export const DIM_UNVEIL = 35;
export const DIM_REVEAL = 60;

/** 형체가 드러난다: 2턴 동안 받는 피해 +50%, 대신 공격할 때마다 그것을 본다 */
export function reveal(c: Combat, e: EnemyUnit) {
  e.mem.revealAt = c.s.turn;
  e.mem.looks = 0;
  c.apply(e, REVEALED, REVEAL_TURNS, e);
  setUi(c, 'ui:eye', 1);
  setUi(c, 'ui:dark', DIM_REVEAL);
  c.emit({ t: 'text', uid: e.uid, text: '형체가 드러났다. 보면 보인다', tone: 'eldritch' });
}

/** 다시 보랏빛 증기에 가려진다 (드러난 모습·어두워진 화면 정리) */
export function veilAgain(c: Combat, e: EnemyUnit) {
  const was = (e.st[REVEALED] ?? 0) > 0;
  if (was) c.clear(e, REVEALED);
  setUi(c, 'ui:eye', 0);
  setUi(c, 'ui:dark', 0);
  if (!was) return;
  c.emit({ t: 'text', uid: e.uid, text: '다시 보랏빛 증기에 가려진다', tone: 'info' });
  // 처음 드러났던 모습이 가려질 때 한 번만, 당신이 무엇을 골랐는지 화면 너머로 말을 건다
  if (!e.mem.judged && !e.dead) {
    e.mem.judged = 1;
    const text = (e.mem.looks ?? 0) > 0 ? '{time}.\n당신은 그것을 보았다.\n이제 잊지 못한다.' : '{time}.\n당신은 끝내 보지 않았다.\n현명하다.';
    cine(c, 'whisper', { text });
  }
}

// ───────────── 깨어난 원로: 멈춘 칼날 ─────────────

export const BLADES = 'a3-blades';
export const BLADE_N = 5;
export const BLADE_DMG = 6;
/** 펼쳐진 원로(다섯 갈래의 몸)의 「멈춘 시간」은 칼날이 이만큼 더 많다 */
export const BLADE_EXTRA = 2;

// ───────────── 깨어난 원로: 수치 (2026-10 「계층군주를 훨씬 어렵게」) ─────────────
// 계층군주는 숨은 조건을 채워야 나오는 선택 보스다 — 층 수호자보다 확실히 어렵게 (봇 승률 목표: 봇 ~40% · 1.5배 ~65% · 2.5배 ~88%).
// 아래 수치는 첫 값이다. 설명 문구가 모두 이 상수를 쓰니 수치만 바꾸면 된다.

/** 체력 (층·수호자 배율 전 — 실제로는 × ACT_HP_MULT[3] × BOSS_HP_MULT). '어렵게' 뒤 1000 → 1080 (GDD 10.8) */
export const ELDER_HP = 1080;
/** 원로의 버팀 — 강한 덱이 붕괴로 큰 공격을 너무 쉽게 끊지 않게 (13 → 16) */
export const ELDER_POISE = 16;
/** 「다섯 갈래 촉수」(펼치기 전): 타격당 피해 × 횟수 */
export const TENTACLE_DMG = 8;
export const TENTACLE_HITS = 3;
/** 「해부의 손길」 피해 · 출혈 · 약화 */
export const DISSECT_DMG = 16;
export const DISSECT_BLEED = 3;
export const DISSECT_WEAK = 1;
/** 「수억 년의 기억」 정신 피해 · 공포 */
export const MEMORY_SAN = 16;
export const MEMORY_DREAD = 1;
/** 「막날개를 펼친다」 → 「별을 건너온 날개」 피해 */
export const STARFALL_DMG = 54;

// ───────────── 깨어난 원로: 얼음 감옥 ─────────────
// 「얼음 속에 가둔다」(의도에 미리 보인다): 지금 쓸 수 있는 장착 기술 중 행동력이 가장 큰 것 하나를 얼음 감옥(하수인)에 가둔다.
// 무기·방어구 기본기는 장착 칸에 없어 가두지 않는다. 장착 기술이 둘 미만이면 가두지 않는다 (하나는 늘 남는다).
// 갇힌 기술은 재사용 대기 99로 잠긴다 — 표본 채집과 같은 표식 mem.specimen이라 대기를 되돌리는 기술·각인도 건드리지 않는다.
//  - 얼음 감옥을 깨뜨리면(어떻게 쓰러지든) 곧바로 돌아온다. 내 화염 피해(화상 포함)는 두 배로 녹인다 — 화염 없이도 깰 수 있는 체력
//  - 내 턴 ICE_TURNS번 안에 깨뜨리지 못하면 기억이 얼음과 함께 부서진다: 이번 전투가 끝날 때까지 쓸 수 없다 (「부서진 기억」)
//    원로는 부서진 기억 하나를 제 몸에 얼려 품는다 — 품은 동안에는 더 가두지 않는다 (부서진 기억은 전투마다 하나)
//  - 감옥은 한 번에 하나. 원로가 쓰러지면 얼음이 녹아 갇힌 기술이 돌아온다
//  - 화면 위 호박색 목표 띠(처치 목표)가 막는 법을 보이고, 봇도 이 목표를 보고 감옥을 먼저 깬다
// 목표가 걸리면 심연 압력(content/depth.ts)은 목표가 겨누는 적(얼음 감옥)의 가호만 쉬게 한다 — 원로의 가호는 그대로다.

/** 얼음 감옥 (하수인 id) */
export const ICE_PRISON = 'a3-ice-prison';
/** 플레이어 상태: 기억 하나가 얼음 감옥에 갇혔다 (수치 = 남은 내 턴) */
export const ICE = 'a3-iced';
/** 플레이어 상태: 얼음과 함께 부서진 기억 (이번 전투 동안 잠긴다) */
export const SHATTERED = 'a3-shattered';
/** 깨뜨려야 하는 내 턴 수 */
export const ICE_TURNS = 3;
/** 얼음 감옥 체력 (층 배율 전 — 실제로는 × ACT_HP_MULT[3]). 어느 출신이든 시작 덱 무기 기본 공격으로 기한 안에 깬다 */
export const ICE_HP = 22;
/** 내 화염 피해(화상 포함)가 얼음 감옥에 주는 피해 배율 */
export const ICE_FIRE_MULT = 2;
/** 이 턴의 의도부터 가둘 수 있다 — 빨라야 3번째 차례 (처음 두 턴엔 오지 않는다) */
export const ICE_FROM = 2;
/** 목표 띠를 누르면 보이는, 깨뜨리지 못했을 때의 대가 */
export const ICE_FAIL = '갇힌 기억이 얼음과 함께 부서진다. 이번 전투가 끝날 때까지 그 기술을 쓸 수 없다';

/** 이 이상의 재사용 대기는 잠긴 것(빼앗김·전투당 1회를 이미 씀)으로 본다 */
const LOCKED = 90;
/** 부서진 기억이 있던 장착 칸 + 1 (c.s.vars — 원로가 쓰러져도 잠금을 이어 간다) */
const SHARD = 'a3-shard';

const elderOf = (c: Combat): EnemyUnit | undefined => alive(c, 'awakened-elder');

/** 화면·로그에 쓰는 기술 이름 */
function memName(c: Combat, uid: string | null | undefined): string {
  return (uid && c.skillInfo(uid)?.def.name) || '기술';
}

/** 플레이어에게 '규칙' 상태를 직접 건다 (결계에 막히지 않고, 사경 중에도 그대로). 0이면 지운다 */
function setRule(c: Combat, id: string, n: number) {
  const before = c.p.st[id] ?? 0;
  if (n > 0) c.p.st[id] = n;
  else delete c.p.st[id];
  if (n !== before) c.emit({ t: 'status', uid: 'p', id, n: n - before });
}

/** 가둘 수 있는 장착 기술 (다른 적이 쥔 것·잠긴 것 제외 — 무기·방어구 기본기는 장착 칸에 없다) */
function memories(c: Combat): { uid: string; i: number }[] {
  const held = new Set(c.alive.filter((x) => (x.mem.specimen ?? 0) > 0).map((x) => x.mem.specimen - 1));
  return c.run.slots
    .map((uid, i) => ({ uid, i }))
    .filter((x): x is { uid: string; i: number } => !!x.uid && !held.has(x.i) && (c.s.cd[x.uid] ?? 0) < LOCKED && !!c.skillInfo(x.uid));
}

/** 지금 쓸 수 있는 것 가운데 행동력이 가장 큰 기술 (쓸 수 있는 것이 없으면 대기 중인 것 가운데서). 같으면 무작위 */
function pickMemory(c: Combat): { uid: string; i: number } | null {
  const all = memories(c);
  if (!all.length) return null;
  const ready = all.filter((x) => (c.s.cd[x.uid] ?? 0) <= 0);
  const pool = ready.length ? ready : all;
  const cost = (x: { uid: string }) => {
    const info = c.skillInfo(x.uid);
    return info ? c.costOf(info) : 0;
  };
  const top = Math.max(...pool.map(cost));
  return c.rng.pick(pool.filter((x) => cost(x) === top));
}

/** 살아 있는 얼음 감옥 */
export const prisonOf = (c: Combat): EnemyUnit | undefined => alive(c, ICE_PRISON);

/**
 * 지금 「얼음 속에 가둔다」를 쓸 수 있는가: 초반이 아니고(ICE_FROM), 부서진 기억을 품고 있지 않고, 감옥이 없고,
 * 감옥이 설 자리가 있고, 가둘 수 있는 장착 기술이 둘 이상 (하나는 늘 남는다)
 */
export function canImprison(c: Combat, e: EnemyUnit): boolean {
  if (c.s.turn < ICE_FROM || (e.mem.specimen ?? 0) > 0 || prisonOf(c)) return false;
  if (c.row(0).length >= MAX_ROW && c.row(1).length >= MAX_ROW) return false;
  return memories(c).length >= 2;
}

/** 목표 띠: 얼음 감옥을 깨뜨려라 (남은 체력은 맞을 때마다 줄어든다) */
function iceObjective(c: Combat, prison: EnemyUnit) {
  const uid = c.run.slots[(prison.mem.specimen ?? 0) - 1];
  const left = Math.max(1, prison.mem.left ?? ICE_TURNS);
  setObjective(c, {
    text: `얼음 감옥을 깨뜨려라: 「${memName(c, uid)}」 (${left}턴 남음)`,
    hit: { uid: prison.uid, need: Math.max(0, prison.hp) },
    kill: [prison.uid],
    fail: ICE_FAIL,
  });
}

/** 갇힌 기술의 잠금을 다시 건다 (대기가 매 턴 줄어 숫자로 보이지 않게 — 버튼엔 ✕) */
function keepIced(c: Combat) {
  for (const x of c.alive) {
    if (x.def !== ICE_PRISON) continue;
    const uid = c.run.slots[(x.mem.specimen ?? 0) - 1];
    if (uid) c.s.cd[uid] = 99;
  }
}

/** 부서진 기억의 잠금을 다시 건다 (원로가 쓰러진 뒤에도 — 이번 전투가 끝날 때까지) */
function keepShard(c: Combat) {
  const uid = c.run.slots[(c.s.vars[SHARD] ?? 0) - 1];
  if (uid) c.s.cd[uid] = 99;
}

/** 「얼음 속에 가둔다」: 기술 하나를 얼음 감옥에 가둔다. 가뒀으면 true. 처음엔 화면 너머로 가짜 시스템 창 */
export function imprison(c: Combat, e: EnemyUnit): boolean {
  const pick = canImprison(c, e) ? pickMemory(c) : null;
  const prison = pick ? c.spawn(ICE_PRISON, 0) : null;
  if (!pick || !prison) {
    c.emit({ t: 'text', uid: e.uid, text: '얼음이 맺히다 흩어진다', tone: 'info' });
    return false;
  }
  prison.mem.specimen = pick.i + 1;
  prison.mem.specimenCd = c.s.cd[pick.uid] ?? 0;
  prison.mem.specimenAt = c.s.turn;
  prison.mem.left = ICE_TURNS;
  // 적의 차례에 생기면 그 라운드에는 움직이지 않는다 — 다음 라운드의 차례 끝부터 센다 (내 턴 ICE_TURNS번)
  prison.mem.born = c.s.turn;
  c.s.cd[pick.uid] = 99;
  setRule(c, ICE, ICE_TURNS);
  iceObjective(c, prison);
  const name = memName(c, pick.uid);
  c.emit({ t: 'text', uid: 'p', text: `「${name}」${josa(name, '이')} 얼음 속에 갇혔다`, tone: 'bad' });
  if (!c.s.vars['a3-iceSeen']) {
    c.s.vars['a3-iceSeen'] = 1;
    cine(c, 'sysmsg', { uid: e.uid, text: `「${name}」의 기억이 얼음 속에 보관되었습니다.` });
  } else cine(c, 'glitch', { n: 1, uid: prison.uid });
  return true;
}

/** 갇힌 기술을 돌려준다 (감옥이 깨졌다·녹았다). 갇혀 있던 동안 지난 턴만큼 원래 대기가 줄어 있다 */
export function freeMemory(c: Combat, prison: EnemyUnit, text: (name: string) => string) {
  const i = (prison.mem.specimen ?? 0) - 1;
  prison.mem.specimen = 0;
  if (c.s.obj?.kill?.includes(prison.uid)) setObjective(c, null);
  if (!c.alive.some((x) => x !== prison && x.def === ICE_PRISON)) setRule(c, ICE, 0);
  const uid = i >= 0 ? c.run.slots[i] : null;
  if (!uid) return;
  const left = Math.max(0, (prison.mem.specimenCd ?? 0) - (c.s.turn - (prison.mem.specimenAt ?? c.s.turn)));
  if (left > 0) c.s.cd[uid] = left;
  else delete c.s.cd[uid];
  c.emit({ t: 'text', uid: 'p', text: text(memName(c, uid)), tone: 'good' });
}

/** 기한이 다 됐다: 갇힌 기억이 얼음과 함께 부서진다 — 이번 전투 동안 잠긴다 (원로가 부서진 기억을 품는다) */
export function shatterPrison(c: Combat, prison: EnemyUnit) {
  const i = (prison.mem.specimen ?? 0) - 1;
  prison.mem.specimen = 0;
  if (c.s.obj?.kill?.includes(prison.uid)) setObjective(c, null);
  setRule(c, ICE, 0);
  vanish(c, prison, '기억과 함께 부서졌다');
  const uid = i >= 0 ? c.run.slots[i] : null;
  if (!uid) return;
  c.s.cd[uid] = 99;
  c.s.vars[SHARD] = i + 1;
  // 원로가 품는다: 표본 채집과 같은 표식이라 대기를 되돌리는 기술·각인이 건드리지 않는다
  const elder = elderOf(c);
  if (elder && !elder.mem.specimen) elder.mem.specimen = i + 1;
  setRule(c, SHATTERED, 1);
  cine(c, 'crack', { n: 2 });
  cine(c, 'glitch', { n: 2 });
  const name = memName(c, uid);
  c.emit({ t: 'text', uid: 'p', text: `「${name}」의 기억이 얼음과 함께 부서졌다`, tone: 'bad' });
}

/** 원로가 쓰러졌다: 남은 얼음 감옥이 녹아 갇힌 기술이 돌아온다 */
export function meltPrisons(c: Combat) {
  for (const x of c.alive.filter((p) => p.def === ICE_PRISON)) {
    freeMemory(c, x, (n) => `얼음이 녹아 「${n}」${josa(n, '을')} 되찾았다`);
    vanish(c, x, '녹아내렸다');
  }
}

/** 내 쪽에서 온 피해 (내 공격·가시·반격·내가 건 지속 피해) — 버팀·가호와 같은 기준 */
const fromPlayer = (c: Combat, d: Pick<DamageCtx, 'src' | 'tags'>) => d.src === c.p || (d.src === null && d.tags.includes('dot'));

/** 얼음 감옥: 내 화염 피해(화상 포함)는 ICE_FIRE_MULT배로 녹인다 (미리보기도 같은 숫자 — 상태는 바꾸지 않는다) */
export function meltHarder(c: Combat, prison: EnemyUnit, d: DamageCtx) {
  if (d.tgt !== prison || !fromPlayer(c, d) || !(d.type === 'fire' || d.tags.includes('burn'))) return;
  d.amount *= ICE_FIRE_MULT;
  d.bare *= ICE_FIRE_MULT;
}

/** 얼음 감옥이 맞았다: 목표 띠의 남은 피해를 줄인다 */
export function prisonHit(c: Combat, prison: EnemyUnit) {
  if (prison.dead || prison.hp <= 0 || !c.s.obj?.kill?.includes(prison.uid)) return;
  iceObjective(c, prison);
}

/** 얼음 감옥의 차례가 끝났다: 남은 턴을 센다. 기한이 다 되면 기억과 함께 부서진다 */
export function iceTick(c: Combat, prison: EnemyUnit) {
  // 생긴 라운드에는 세지 않는다 (적의 차례에 생기면 원래 이 라운드에 움직이지 않는다)
  if (prison.dead || c.s.turn <= (prison.mem.born ?? -1)) return;
  const left = (prison.mem.left ?? ICE_TURNS) - 1;
  prison.mem.left = left;
  if (left > 0) {
    setRule(c, ICE, left);
    if (c.s.obj?.kill?.includes(prison.uid)) iceObjective(c, prison);
    c.emit({ t: 'text', uid: prison.uid, text: left > 1 ? '얼음이 더 단단히 굳는다' : '얼음에 금이 가기 시작한다', tone: 'bad' });
    return;
  }
  shatterPrison(c, prison);
}

// ───────────── 깨어난 원로: 다섯 갈래의 몸 (2막) ─────────────
// 체력이 UNFURL_AT 아래로 떨어지면 막날개와 다섯 팔을 펼친다 (형태 1 '펼쳐진 원로', 팔 ARM_MAX).
//  - 「다섯 갈래 촉수」는 남은 팔마다 ARM_DMG씩 한 번 — 팔을 잘라 낼수록 약해진다
//  - 붕괴시키면 팔 ARM_BREAK_CUT개, 내 공격 한 번에 ARM_CUT 이상(버팀에 깎이기 전 — unguarded)이면 팔 1개가 잘린다
//  - 잘린 팔은 원로의 차례 ARM_REGROW번마다 하나씩 다시 자란다 (최대 ARM_MAX)
//  - 새 행동 「다섯 별의 기도」: 한 차례 힘을 모은 뒤 「다섯 별의 응답」(PRAYER_DMG). 붕괴시키면 끊긴다
//  - 「멈춘 시간」의 칼날이 BLADE_EXTRA개 더 (BLADE_N + BLADE_EXTRA)

/** 원로의 팔 (원로에게 거는 상태, 수치 = 남은 팔) */
export const ARMS = 'a3-arms';
/** 이 체력 비율 아래로 떨어지면 펼친다 (잃은 체력 그대로 — 버팀과 상관없이) */
export const UNFURL_AT = 0.6;
/** 팔의 최대 수 (펼칠 때 이만큼) */
export const ARM_MAX = 5;
/** 펼친 뒤 「다섯 갈래 촉수」의 팔 하나당 피해 */
export const ARM_DMG = 6;
/** 붕괴시키면 잘리는 팔 */
export const ARM_BREAK_CUT = 2;
/** 내 공격 한 번에 이만큼(버팀에 깎이기 전) 피해를 주면 팔 하나가 잘린다 */
export const ARM_CUT = 20;
/** 잘린 팔이 다시 자라는 데 걸리는 원로의 차례 */
export const ARM_REGROW = 3;
/** 「다섯 별의 기도」 → 「다섯 별의 응답」 피해 */
export const PRAYER_DMG = 60;

/** 펼쳐진 원로인가 */
export const unfurled = (e: EnemyUnit): boolean => !!e.mem.unfurled;
/** 남은 팔 */
export const armsOf = (e: EnemyUnit): number => e.st[ARMS] ?? 0;

/** 다섯 갈래로 펼친다 (한 번). 내 턴이면 새 모습으로 다음 행동을 다시 정한다 (힘을 모으는 중이거나 무너져 있으면 그대로) */
export function unfurl(c: Combat, e: EnemyUnit) {
  if (unfurled(e) || e.dead || e.hp <= 0) return;
  e.mem.unfurled = 1;
  e.form = 1;
  e.name = '펼쳐진 원로';
  e.mem.armT = 0;
  // 지금 무너져 있다면 그 붕괴는 이미 센 것으로 (펼치기 전의 붕괴로 팔이 잘리지 않게)
  if (e.broken === 2) e.mem.armBk = 1;
  c.apply(e, ARMS, ARM_MAX - armsOf(e), e);
  c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
  cine(c, 'shatter', { uid: e.uid });
  cine(c, 'whisper', { uid: e.uid, text: '다섯 팔, 다섯 눈, 다섯 날개.\n너희는 고작 둘씩 지녔구나.' });
  c.emit({ t: 'text', uid: e.uid, text: '막날개와 다섯 갈래의 팔이 활짝 펼쳐진다', tone: 'eldritch' });
  if (c.s.phase === 'player' && e.broken !== 2 && !e.mem.charge) c.planIntent(e);
}

/** 팔을 자른다. 「다섯 갈래 촉수」를 노리던 차례면 의도의 횟수도 다시 센다 (팔이 다 잘렸으면 그 차례는 헛돈다) */
export function cutArms(c: Combat, e: EnemyUnit, n: number, text: string) {
  const k = Math.min(n, armsOf(e));
  if (k <= 0 || e.dead || e.hp <= 0) return;
  c.apply(e, ARMS, -k);
  c.emit({ t: 'text', uid: e.uid, text: `${text} (팔 -${k})`, tone: 'good' });
  // 하나라도 잘리면 다시 자라기까지 처음부터 센다
  e.mem.armT = 0;
  if (e.intent?.move !== 'tentacles') return;
  if (armsOf(e) > 0) refreshIntent(c, e);
  else if (canReact(c, e)) e.intent = intentFor(c, e, 'stump');
}

/** 붕괴로 팔이 잘린다 (붕괴 하나에 한 번 — 피해로 무너졌든 버팀만 깎여 무너졌든) */
export function severOnBreak(c: Combat, e: EnemyUnit) {
  if (e.mem.armBk) return;
  e.mem.armBk = 1;
  cutArms(c, e, ARM_BREAK_CUT, '무너지며 팔이 잘려 나갔다');
}

/** 내 공격 한 번이 팔을 자를 만큼 큰가 (버팀에 깎이기 전 피해 — 가호에 막힌 몫은 빼고) */
export function bigCut(c: Combat, d: DamageCtx): boolean {
  return d.src === c.p && d.attack && unguarded(d) >= ARM_CUT;
}

/** 원로의 차례가 끝났다: 잘린 팔이 ARM_REGROW 차례마다 하나씩 다시 자란다 */
export function regrowArms(c: Combat, e: EnemyUnit) {
  if (!unfurled(e) || e.dead) return;
  if (armsOf(e) >= ARM_MAX) {
    e.mem.armT = 0;
    return;
  }
  e.mem.armT = (e.mem.armT ?? 0) + 1;
  if (e.mem.armT < ARM_REGROW) return;
  e.mem.armT = 0;
  if (c.apply(e, ARMS, 1, e) > 0) c.emit({ t: 'text', uid: e.uid, text: '잘린 자리에서 팔이 다시 돋는다', tone: 'bad' });
}

// ───────────── 렝의 대거미: 몸속의 알 ─────────────

export const EGGS = 'a3-eggs';
export const EGG_TURNS = 2;
export const HATCH_DMG = 5;
export const HATCH_N = 2;
/** 이미 알이 있는데 또 심으려 하면 대신 거는 독 */
export const EGG_POISON = 3;
/** 알은 어미와 이어져 있다: 알이 있는 동안 대거미에게 이만큼 피해를 주면 알이 함께 죽는다 (어느 출신이든 무기 기본 공격으로 두 턴 안에 닿는다) */
export const EGG_LINK_DMG = 20;
const EGG_HURT = 'a3-eggHurt';

function killEggs(c: Combat, text: string) {
  if ((c.p.st[EGGS] ?? 0) <= 0) return;
  c.clear(c.p, EGGS);
  delete c.s.vars[EGG_HURT];
  c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

/** 알을 심는다. 이미 알이 있으면 독 */
export function implantEggs(c: Combat, e: EnemyUnit) {
  if ((c.p.st[EGGS] ?? 0) > 0) {
    c.apply(c.p, 'poison', EGG_POISON, e);
    return;
  }
  if (c.apply(c.p, EGGS, EGG_TURNS, e) > 0) {
    c.s.vars[EGG_HURT] = 0;
    c.emit({ t: 'text', uid: 'p', text: '살 속에 무언가를 심었다', tone: 'bad' });
  }
}

/** 알이 있는 동안 어미가 받은 피해 (적이 준 피해는 세지 않는다). EGG_LINK_DMG를 채우면 알이 함께 죽는다 */
export function broodHurt(c: Combat, n: number) {
  if ((c.p.st[EGGS] ?? 0) <= 0 || n <= 0) return;
  const hurt = (c.s.vars[EGG_HURT] ?? 0) + n;
  if (hurt >= EGG_LINK_DMG) killEggs(c, '어미가 비명을 지르자 몸속의 알이 함께 죽었다');
  else c.s.vars[EGG_HURT] = hurt;
}

function hatch(c: Combat) {
  c.clear(c.p, EGGS);
  cine(c, 'swarm');
  c.emit({ t: 'text', uid: 'p', text: '알이 부화해 새끼들이 살을 찢고 기어 나온다', tone: 'bad' });
  c.loseHp(c.p, HATCH_DMG, 'a3-hatch');
  for (let i = 0; i < HATCH_N && !c.over; i++) c.spawn('leng-spiderling', 0);
}

// ───────────── 샨탁: 하늘에 매달림 ─────────────

export const ALOFT = 'a3-aloft';
/** 이번 턴 샨탁을 이만큼 맞히면 발톱에서 빠져나온다 (피해량이 아니라 맞힌 횟수 — 샨탁이 참격에 강해도 어느 출신이든 무기 기본 공격 셋으로 닿는다) */
export const ESCAPE_HITS = 3;
export const FALL_DMG = 12;

/** 움켜쥐고 날아오른다 */
export function liftUp(c: Combat, e: EnemyUnit) {
  if ((c.p.st[ALOFT] ?? 0) > 0) return;
  if (c.apply(c.p, ALOFT, ESCAPE_HITS, e) > 0) c.emit({ t: 'text', uid: 'p', text: '하늘 높이 들어 올려졌다', tone: 'bad' });
}

// ───────────── 고대인 해부학자: 절개선 ─────────────

export const INCISION = 'a3-incision';
export const INCISE_N = 2;
export const MAX_INCISION = 4;
export const VIVISECT_BASE = 28;
export const CUT_DMG = 5;

/** 「생체 해부」의 피해: 기본 + 절개선마다 CUT_DMG */
export const vivisectDmg = (c: Combat): number => VIVISECT_BASE + CUT_DMG * Math.min(MAX_INCISION, c.p.st[INCISION] ?? 0);

/** 절개선을 긋는다 (최대 MAX_INCISION). 처음 그을 때 화면 유리에 붉은 글씨 */
export function incise(c: Combat, e: EnemyUnit) {
  const add = Math.min(INCISE_N, MAX_INCISION - (c.p.st[INCISION] ?? 0));
  if (add <= 0 || c.apply(c.p, INCISION, add, e) <= 0) return;
  if (!e.mem.scrawled) {
    e.mem.scrawled = 1;
    cine(c, 'scrawl', { text: '여기를 자른다' });
  }
  refreshVivisect(c);
}

/** 이미 정해 둔 「생체 해부」 의도의 피해를 절개선 수에 맞춘다 */
function refreshVivisect(c: Combat) {
  for (const e of c.alive) {
    if (e.def !== 'elder-vivisector' || !e.intent) continue;
    if (e.intent.move === 'vivisect' || e.intent.move === 'table') e.intent.dmg = vivisectDmg(c);
  }
}

/** 절개선이 벌어져 사라진다 (생체 해부) / 아문다 (회복) */
export function closeIncisions(c: Combat, text: string) {
  if ((c.p.st[INCISION] ?? 0) <= 0) return;
  c.clear(c.p, INCISION);
  c.emit({ t: 'text', uid: 'p', text, tone: 'info' });
  refreshVivisect(c);
}

// ── 완전 해부 (즉사 퍼즐 — 3층의 즉사기는 이것 하나) ──
// 절개선이 MAX_INCISION개 다 그어진 채로 해부대를 펼치려 하면 「완전 해부」를 건다: 해부대에 눕힌다(준비) → 완전 해부(실행).
// 걸린 순간부터 플레이어 턴이 두 번 온전히 있다 (그 턴 시작부터 해골 의도와 붉은 목표 띠가 보인다). 막는 법은 넷 —
// 세 출신의 시작 덱 어느 것으로도 닿는다 (무기 기본 공격 × 행동력 3 × 2턴 ≥ FULL_DMG, 방어구 기본기 × 3 ≥ FULL_BLOCK):
//  - 해부학자에게 피해 FULL_DMG (걸린 뒤 받은 피해를 센다 — 출혈·독·화상 포함)
//  - 방어도 FULL_BLOCK 이상으로 내 턴을 마친다
//  - 체력을 회복한다 (절개선이 아문다)
//  - 해부학자를 붕괴시킨다
// 막으면 절개선이 아물고 해부학자는 다른 행동을 고른다 (내 턴이 끝날 때 막았다면 그 차례는 메스를 거둔다).
// 실행되면 사경 없이 죽는다 — 결계가 한 번 막는다(절개선이 아문다). 전투마다 FULL_MAX번까지, 끝난 뒤 FULL_GAP 턴은 다시 걸지 않는다.

export const FULL = '완전 해부';
export const FULL_DMG = 18;
export const FULL_BLOCK = 12;
export const FULL_MAX = 2;
export const FULL_GAP = 3;

const vivisectorOf = (c: Combat): EnemyUnit | undefined => c.s.enemies.find((x) => x.def === 'elder-vivisector' && x.mem.full);

/** 지금 완전 해부를 걸 수 있는가 (절개선이 다 그어졌고, 초반이 아니고, 전투마다 FULL_MAX번까지, 지난번 뒤 FULL_GAP 턴) */
export function fullReady(c: Combat, e: EnemyUnit): boolean {
  return (
    !e.mem.full &&
    (c.p.st[INCISION] ?? 0) >= MAX_INCISION &&
    (e.mem.fulls ?? 0) < FULL_MAX &&
    c.s.turn >= 2 &&
    c.s.turn - (e.mem.fullAt ?? -99) >= FULL_GAP
  );
}

/** 붉은 목표 띠 (남은 피해는 맞을 때마다 줄어든다) */
function fullObjective(c: Combat, e: EnemyUnit) {
  const need = Math.max(0, FULL_DMG - (e.mem.fullDmg ?? 0));
  const left = (e.mem.fullStage ?? 1) >= 2 ? 1 : 2;
  setObjective(c, {
    text: `완전 해부를 막아라: 해부학자에게 피해 ${need} · 방어도 ${FULL_BLOCK}로 턴 종료 · 회복 · 붕괴 (${left}턴 남음)`,
    hit: { uid: e.uid, need },
    block: FULL_BLOCK,
    break: e.uid,
    lethal: true,
  });
}

/** 완전 해부를 건다 (해부대를 펼치려는데 절개선이 다 그어져 있다 — 의도를 정할 때). 처음엔 화면 너머로 */
export function declareFull(c: Combat, e: EnemyUnit) {
  e.mem.full = 1;
  e.mem.fullStage = 1;
  e.mem.fullDmg = 0;
  e.mem.fulls = (e.mem.fulls ?? 0) + 1;
  fullObjective(c, e);
  c.emit({ t: 'text', uid: e.uid, text: '절개선이 모두 그어졌다. 완전 해부를 준비한다', tone: 'eldritch' });
  if (!c.s.vars['a3-fullSeen']) {
    c.s.vars['a3-fullSeen'] = 1;
    cine(c, 'whisper', { text: '움직이지 마라.\n전부 열어 보고 싶다.' });
  }
}

/** 해부대에 눕혔다 (준비 차례): 다음 차례에 완전 해부 */
export function layOnTable(c: Combat, e: EnemyUnit) {
  if (!e.mem.full) return;
  e.mem.fullStage = 2;
  fullObjective(c, e);
  c.emit({ t: 'text', uid: e.uid, text: '해부대가 펼쳐지고 메스가 절개선을 따라 내려온다', tone: 'bad' });
}

/** 완전 해부를 막았다: 목표를 지우고 절개선이 아문다. 해부학자는 다시 의도를 정한다 (내 턴이 끝날 때 막았다면 그 차례는 메스를 거둔다) */
export function cancelFull(c: Combat, text: string, atTurnEnd = false) {
  const e = vivisectorOf(c);
  if (!e) return;
  e.mem.full = 0;
  e.mem.fullStage = 0;
  e.mem.fullAt = c.s.turn;
  setObjective(c, null);
  closeIncisions(c, '해부가 흐트러지며 절개선이 아물었다');
  if (e.dead) return;
  c.emit({ t: 'text', uid: e.uid, text, tone: 'good' });
  if (e.broken === 2) return;
  if (atTurnEnd || c.s.phase !== 'player') {
    const m = c.moveDef(e, 'withdraw');
    e.intent = { move: 'withdraw', kind: m.intent, label: m.name };
  } else c.planIntent(e);
}

/** 완전 해부가 걸린 뒤 해부학자가 받은 피해 (적이 준 피해는 세지 않는다). FULL_DMG를 채우면 막힌다 */
export function fullHit(c: Combat, e: EnemyUnit, n: number) {
  if (!e.mem.full || n <= 0) return;
  e.mem.fullDmg = (e.mem.fullDmg ?? 0) + n;
  if (e.mem.fullDmg >= FULL_DMG) cancelFull(c, '해부학자가 비틀거려 메스를 떨어뜨렸다');
  else fullObjective(c, e);
}

/** 완전 해부: 막지 못했으면 사경 없이 죽는다 (결계가 한 번 막는다 — 절개선이 아문다) */
export function resolveFull(c: Combat, e: EnemyUnit) {
  const pending = !!e.mem.full;
  e.mem.full = 0;
  e.mem.fullStage = 0;
  e.mem.fullAt = c.s.turn;
  setObjective(c, null);
  if (!pending) {
    c.emit({ t: 'text', uid: e.uid, text: '메스를 거둔다', tone: 'info' });
    return;
  }
  if (execute(c, e, FULL)) return;
  closeIncisions(c, '결계가 메스를 막아 절개선이 아물었다');
}

// ───────────── 시간에 얼어붙은 탐사대장: 멈춘 시간 ─────────────

export const STOPPED = 'a3-stopped';
export const WOUNDS = 'a3-wounds';
export const STOP_TURNS = 2;

/** 시간을 멈춘다. 걸었으면 true */
export function stopTime(c: Combat, e: EnemyUnit): boolean {
  if ((c.p.st[STOPPED] ?? 0) > 0) return false;
  if (c.apply(c.p, STOPPED, STOP_TURNS, e) <= 0) return false;
  c.emit({ t: 'text', uid: 'p', text: '모든 것이 멈췄다', tone: 'eldritch' });
  return true;
}

/** 시간이 다시 흐른다: 쌓인 상처가 한꺼번에 터진다 (방어도가 먼저 막는다) */
function resumeTime(c: Combat) {
  const n = c.p.st[WOUNDS] ?? 0;
  c.clear(c.p, STOPPED);
  c.clear(c.p, WOUNDS);
  c.emit({ t: 'text', uid: 'p', text: n > 0 ? '시간이 다시 흐르며 멈춰 있던 상처가 한꺼번에 터진다' : '시간이 다시 흐른다', tone: n > 0 ? 'bad' : 'info' });
  if (n <= 0 || c.over) return;
  cine(c, 'crack', { n: 2 });
  c.damage({ src: alive(c, 'frozen-leader') ?? null, tgt: c.p, base: n, type: 'blunt', tags: ['a3-wounds'] });
}

/** 멈춘 시계가 부서진다: 쌓인 상처가 흩어진다 */
function shatterClock(c: Combat, text: string) {
  if ((c.p.st[STOPPED] ?? 0) <= 0 && (c.p.st[WOUNDS] ?? 0) <= 0) return;
  c.clear(c.p, STOPPED);
  c.clear(c.p, WOUNDS);
  cine(c, 'shatter');
  c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

// ───────────── 상태 등록 ─────────────

reg.statuses([
  {
    id: EAR,
    name: '테켈리-리',
    icon: 'gi:echo-ripples',
    kind: 'buff',
    hidden: true,
    desc: '쇼고스가 내가 쓰는 기술을 듣고 있다',
    hooks: {
      beforeSkill(c, s, u) {
        if (s.unit !== c.p || u.echo) return;
        c.s.vars[MIM.dmg] = 0;
        c.s.vars[MIM.blk0] = c.p.block;
      },
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.skill || d.amount <= 0) return;
        c.s.vars[MIM.dmg] = (c.s.vars[MIM.dmg] ?? 0) + d.amount;
        c.s.vars[MIM.type] = Math.max(0, TYPES.indexOf(d.type));
      },
      afterSkill(c, s, u) {
        if (s.unit !== c.p) return;
        const v = c.s.vars;
        const dealt = v[MIM.dmg] ?? 0;
        const blk = Math.max(0, c.p.block - (v[MIM.blk0] ?? c.p.block));
        v[MIM.kind] = dealt > 0 ? 1 : blk > 0 ? 2 : 3;
        v[MIM.val] = dealt > 0 ? dealt : blk;
        v[MIM.ref] = u.basic === 'weapon' ? -1 : u.basic === 'armor' ? -2 : c.run.slots.indexOf(u.owned.uid);
        v[MIM.turn] = c.s.turn;
      },
    },
  },
  {
    id: ANGLE,
    name: '열린 각',
    icon: 'gi:cracked-glass',
    kind: 'debuff',
    desc: `화면에 날카로운 각 {n}개가 열려 있다. 내 턴이 끝날 때 방어도가 ${PLASTER} 이상이면 회반죽으로 각 하나를 메운다. 남은 각마다 모서리에서 이빨이 튀어나와 ${ANGLE_BITE} 피해 (방어도가 먼저 막는다). 각도의 왕을 붕괴시키면 모든 각이 닫힌다. 세 각이 모두 열리면 「${HUNT}」이 온다`,
    hooks: {
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        let n = s.n;
        if (c.p.block >= PLASTER) {
          c.apply(c.p, ANGLE, -1);
          n--;
          c.emit({ t: 'text', uid: 'p', text: '회반죽으로 각 하나를 메웠다', tone: 'good' });
          // 세 각 가운데 하나라도 메우면 사냥이 빗나간다
          if (n < MAX_ANGLES) cancelHunt(c, '사냥개들이 메워진 모서리 앞에서 멈췄다');
        }
        syncCracks(c);
        if (n <= 0) return;
        const king = alive(c, 'angle-king');
        c.emit({ t: 'text', uid: 'p', text: '모서리에서 이빨이 튀어나왔다', tone: 'bad' });
        for (let i = 0; i < n && !c.over; i++) c.damage({ src: king ?? null, tgt: c.p, base: ANGLE_BITE, type: 'slash', tags: ['a3-angle'] });
      },
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.def === 'angle-king') closeAngles(c, '각도의 왕이 무너져 열린 각이 모두 닫혔다');
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === 'angle-king') closeAngles(c, '열린 각이 모두 닫혔다');
      },
    },
  },
  {
    id: REVEALED,
    name: '드러난 모습',
    icon: 'gi:eye-target',
    kind: 'debuff',
    desc: `증기가 걷혀 형체가 드러났다. 내 턴 {n}번 동안 받는 피해 +${Math.round((REVEAL_MULT - 1) * 100)}%. 대신 이것을 공격하는 기술을 쓸 때마다 그 모습을 본다: 정신 피해 ${LOOK_SAN} (방어도로 막을 수 없다)`,
    hooks: {
      modDamageIn(_c, s, d) {
        if (isEnemy(s.unit)) d.mult *= REVEAL_MULT;
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.hp <= 0 || d.src !== c.p || !d.skill || !d.attack) return;
        const key = useKey(c);
        if (e.mem.looked === key) return;
        e.mem.looked = key;
        e.mem.looks = (e.mem.looks ?? 0) + 1;
        c.emit({ t: 'text', uid: 'p', text: '그것을 보았다', tone: 'eldritch' });
        c.horror(e, LOOK_SAN);
      },
    },
    tickEnd(c, u, n) {
      if (!isEnemy(u)) {
        c.clear(u, REVEALED);
        return;
      }
      // 막 드러난 차례에는 줄지 않는다 (당신의 턴 REVEAL_TURNS번 동안 드러나 있다)
      if (u.mem.revealAt === c.s.turn) return;
      if (n > 1) c.apply(u, REVEALED, -1);
      else veilAgain(c, u);
    },
  },
  {
    id: BLADES,
    name: '멈춘 칼날',
    icon: 'gi:thrown-knife',
    kind: 'debuff',
    desc: `멈춘 시간 속에서 칼날 {n}개가 이쪽을 겨누고 있다. 깨어난 원로를 때리는 기술을 쓸 때마다 하나를 쳐낸다. 내 턴이 끝나면 시간이 다시 흘러 남은 칼날마다 ${BLADE_DMG} 피해 (방어도가 먼저 막는다). 펼쳐진 원로는 칼날을 ${BLADE_EXTRA}개 더 세운다`,
    hooks: {
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.skill || !isEnemy(d.tgt) || d.tgt.def !== 'awakened-elder' || d.amount <= 0) return;
        const key = useKey(c);
        if (c.s.vars['a3-parried'] === key) return;
        c.s.vars['a3-parried'] = key;
        c.apply(c.p, BLADES, -1);
        c.emit({ t: 'text', uid: 'p', text: '칼날 하나를 쳐냈다', tone: 'good' });
      },
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        const n = s.n;
        c.clear(c.p, BLADES);
        c.emit({ t: 'text', uid: 'p', text: '시간이 다시 흐른다', tone: 'bad' });
        const elder = alive(c, 'awakened-elder');
        for (let i = 0; i < n && !c.over; i++) c.damage({ src: elder ?? null, tgt: c.p, base: BLADE_DMG, type: 'pierce', tags: ['a3-blades'] });
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === 'awakened-elder') c.clear(c.p, BLADES);
      },
    },
  },
  {
    id: ICE,
    name: '갇힌 기억',
    icon: 'gi:imprisoned',
    kind: 'debuff',
    desc: `장착 기술 하나가 얼음 감옥에 갇혀 쓸 수 없다. 얼음 감옥을 깨뜨리면 곧바로 돌아온다. 내 화염 피해는 ${ICE_FIRE_MULT}배로 녹인다. {n}턴 안에 깨뜨리지 못하면 얼음과 함께 부서져 이번 전투가 끝날 때까지 쓸 수 없다`,
    tickStart(c, u) {
      if (!isEnemy(u)) keepIced(c);
    },
    tickEnd(c, u) {
      if (isEnemy(u)) c.clear(u, ICE);
    },
  },
  {
    id: SHATTERED,
    name: '부서진 기억',
    icon: 'gi:brain-freeze',
    kind: 'debuff',
    desc: '얼음과 함께 부서진 기억. 이번 전투가 끝날 때까지 그 기술을 쓸 수 없다',
    tickStart(c, u) {
      if (!isEnemy(u)) keepShard(c);
    },
    tickEnd(c, u) {
      if (isEnemy(u)) c.clear(u, SHATTERED);
    },
    hooks: {
      // 대기를 되돌리는 효과가 풀어 버려도 기술을 쓰고 나면 다시 잠긴다
      afterSkill(c, s) {
        if (s.unit === c.p) keepShard(c);
      },
    },
  },
  {
    id: ARMS,
    name: '다섯 갈래의 팔',
    icon: 'gi:curled-tentacle',
    kind: 'buff',
    desc: `펼쳐진 팔 {n}개. 「다섯 갈래 촉수」가 팔마다 한 번씩 피해 ${ARM_DMG}. 붕괴시키면 팔 ${ARM_BREAK_CUT}개, 내 공격 한 번에 피해 ${ARM_CUT} 이상(버팀에 깎이기 전)을 주면 팔 1개가 잘린다. 잘린 팔은 원로의 차례 ${ARM_REGROW}번마다 하나씩 다시 자란다 (최대 ${ARM_MAX})`,
  },
  {
    id: EGGS,
    name: '몸속의 알',
    icon: 'gi:egg-clutch',
    kind: 'debuff',
    desc: `살 속에 거미알이 심겼다. 내 턴이 {n}번 더 끝나면 부화해 새끼 거미 ${HATCH_N}마리가 살을 찢고 나온다 (피해 ${HATCH_DMG}, 방어도 무시). 알은 어미와 이어져 있다. 그 사이 렝의 대거미에게 피해 ${EGG_LINK_DMG}을 주면 알이 함께 죽는다 (출혈·독·화상 포함). 체력을 회복하거나 화염 기술을 쓰거나 화염에 닿아도 알이 죽는다. 어미를 쓰러뜨려도 마찬가지다`,
    hooks: {
      afterSkill(c, s, u) {
        if (s.unit === c.p && (u.type ?? u.def.type) === 'fire') killEggs(c, '불길에 알이 타 죽었다');
      },
      onDamageTaken(c, s, d) {
        if (s.unit === c.p && d.tgt === c.p && d.type === 'fire' && d.amount > 0) killEggs(c, '불길에 알이 타 죽었다');
      },
      modHeal(c, s, amount) {
        if (c && !c.previewing && s.unit === c.p && amount > 0) killEggs(c, '새살이 돋으며 알이 밀려 나왔다');
        return amount;
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === 'leng-broodmother') killEggs(c, '어미가 쓰러지자 알이 굳어 버렸다');
      },
    },
    tickEnd(c, u, n) {
      if (isEnemy(u)) {
        c.clear(u, EGGS);
        return;
      }
      if (n > 1) c.apply(u, EGGS, -1);
      else hatch(c);
    },
  },
  {
    id: ALOFT,
    name: '하늘에 매달림',
    icon: 'gi:feathered-wing',
    kind: 'debuff',
    desc: `샨탁의 발톱에 매달려 하늘 높이 들렸다. 샨탁을 공격으로 {n}번 더 맞히면 빠져나온다. 여러 번 때리는 기술은 맞힌 만큼 센다. 회피당한 공격은 세지 않는다. 빠져나오지 못하면 내 턴이 끝날 때 떨어진다: 피해 ${FALL_DMG} (방어도가 먼저 막는다), 다음 턴 행동력 -1`,
    hooks: {
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.attack || !isEnemy(d.tgt) || d.tgt.def !== 'shantak' || d.amount <= 0) return;
        if ((c.p.st[ALOFT] ?? 0) > 1) {
          c.apply(c.p, ALOFT, -1);
          return;
        }
        c.clear(c.p, ALOFT);
        c.emit({ t: 'text', uid: 'p', text: '발톱에서 빠져나왔다!', tone: 'good' });
      },
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        c.clear(c.p, ALOFT);
        const sh = alive(c, 'shantak') ?? null;
        cine(c, 'impact');
        c.emit({ t: 'text', uid: 'p', text: '높은 곳에서 떨어졌다', tone: 'bad' });
        c.damage({ src: sh, tgt: c.p, base: FALL_DMG, type: 'blunt', tags: ['a3-fall'] });
        if (!c.over) c.apply(c.p, 'a3-timeworn', 1, sh);
      },
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim) || victim.def !== 'shantak' || (c.p.st[ALOFT] ?? 0) <= 0) return;
        c.clear(c.p, ALOFT);
        c.emit({ t: 'text', uid: 'p', text: '샨탁과 함께 내려앉았다', tone: 'good' });
      },
    },
    tickEnd(c, u) {
      if (isEnemy(u)) c.clear(u, ALOFT);
    },
  },
  {
    id: INCISION,
    name: '절개선',
    icon: 'gi:stitched-wound',
    kind: 'debuff',
    desc: `해부학자가 그어 둔 절개선 {n}개. 「생체 해부」의 피해가 절개선마다 +${CUT_DMG} (최대 ${MAX_INCISION}개). 생체 해부가 끝나면 절개선은 모두 벌어져 사라진다. ${MAX_INCISION}개가 다 그어진 채로 해부대를 펼치면 「${FULL}」가 온다. 체력을 회복하면 모두 아문다`,
    hooks: {
      modHeal(c, s, amount) {
        if (c && !c.previewing && s.unit === c.p && amount > 0) {
          closeIncisions(c, '절개선이 아물었다');
          cancelFull(c, '절개선이 아물어 완전 해부가 무너졌다');
        }
        return amount;
      },
      onTurnEnd(c, s) {
        // 완전 해부: 방어도를 갖춰 턴을 마치면 메스가 닿지 않는다
        if (s.unit === c.p && c.p.block >= FULL_BLOCK) cancelFull(c, '몸을 지켜 메스가 닿지 않는다', true);
      },
    },
  },
  {
    id: STOPPED,
    name: '멈춘 시간',
    icon: 'gi:stopwatch',
    kind: 'debuff',
    desc: '시간이 멈췄다. 적의 공격 피해가 들어오지 않고 「멈춘 상처」로 쌓인다. 내 턴이 {n}번 더 끝나면 시간이 다시 흘러 쌓인 상처가 한꺼번에 터진다 (방어도가 먼저 막는다). 탐사대장을 붕괴시키거나 쓰러뜨리면 멈춘 시계가 부서져 쌓인 상처가 사라진다',
    hooks: {
      // 미리보기에도 0으로 보인다 (지금은 들어오지 않는다) — 상태는 바꾸지 않는다
      modDamageIn(c, s, d) {
        if (s.unit === c.p && d.attack && isEnemy(d.src)) d.cap = 0;
      },
      onDamageTaken(c, s, d) {
        if (s.unit !== c.p || d.tgt !== c.p || !d.attack || !isEnemy(d.src)) return;
        // 멈추지 않았다면 들어왔을 피해 (회피 등으로 0이 된 것은 쌓이지 않는다)
        const n = Math.max(0, Math.floor((d.base + d.add) * d.mult));
        if (n <= 0) return;
        if (c.apply(c.p, WOUNDS, n, null) > 0) c.emit({ t: 'text', uid: 'p', text: `상처가 멈췄다 (+${n})`, tone: 'eldritch' });
      },
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        if (s.n > 1) c.apply(c.p, STOPPED, -1);
        else resumeTime(c);
      },
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.def === 'frozen-leader') shatterClock(c, '멈춘 시계가 부서져 쌓인 상처가 흩어진다');
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === 'frozen-leader') shatterClock(c, '시계의 주인이 쓰러져 쌓인 상처가 흩어진다');
      },
    },
    tickEnd(c, u) {
      if (isEnemy(u)) c.clear(u, STOPPED);
    },
  },
  {
    id: WOUNDS,
    name: '멈춘 상처',
    icon: 'gi:time-trap',
    kind: 'debuff',
    desc: '멈춘 시간 속에 쌓인 피해 {n}. 시간이 다시 흐르면 한꺼번에 터진다 (방어도가 먼저 막는다). 탐사대장을 붕괴시키면 사라진다',
    tickEnd(c, u) {
      // 멈춘 시간 없이 남은 상처는 없다 (적에게 붙거나 홀로 남으면 지운다)
      if (isEnemy(u) || (u.st[STOPPED] ?? 0) <= 0) c.clear(u, WOUNDS);
    },
  },
]);
