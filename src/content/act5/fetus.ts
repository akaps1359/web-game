import { josa } from '../../engine/josa';
import { ANOMALIES, reg, SKILLS } from '../../engine/registry';
import { isEnemy, scaledPoise, type Combat } from '../../engine/combat';
import { cycle, last, opener } from '../../engine/ai';
import type { DamageCtx, DmgType, EnemyUnit, Hooks } from '../../engine/types';
import { cine, setUi } from '../lib';
import { countDef, mv, release } from '../moves';
import { setWeak } from '../act4/common';
import { vanish } from './dream';

/**
 * 5층 최종 수호자 — 별의 태아 (2026-10, 옛 '잠든 자'를 대체한 오리지널 보스).
 * 우주 한가운데 웅크린 태아. 1층부터 들리던 '아래의 목소리'는 그것이 꾸는 꿈의 잠꼬대였다.
 * 쓰러뜨릴 때마다 모습이 바뀐다 (e.form 1·2 = forms[0]·[1], 체력·버팀·약점·행동이 바뀐다).
 *  1. 별의 태아 (잠든 태아) — 꿈을 꾼다: 내 턴이 시작될 때마다 전장의 규칙(꿈)이 바뀐다.
 *     꿈은 anomaly로 구현했다 (c.s.anomaly를 바꾸면 전투 화면 위쪽 칩에 이름이 뜨고, 누르면 설명이 나온다).
 *     자장가가 '졸음'을 쌓는다 (3이 되면 다음 턴 행동력 -2, 적을 붕괴시키거나 쓰러뜨리면 깨어난다). 혜성 탯줄이 별빛을 먹여 태아를 키운다.
 *  2. 깨어나는 알 — 아직 꿈을 꾼다. 별자리 껍질 3겹 (겹마다 받는 피해 -20%). 붕괴하거나 탯줄이 끊길 때마다 한 겹씩 깨지고,
 *     깨진 틈만큼 '새어 나오는 빛'의 빛줄기가 늘어난다 (깨야 때릴 수 있고, 깰수록 위험해진다).
 *  3. 태어난 것 — 꿈이 끝난다. '첫 울음' 카운트다운: 내 턴이 3번 끝나면 방어도 무시 피해 (혜성 탯줄마다 커진다).
 *     태어난 것을 붕괴시키면 울음이 멎는다. 울음이 지나가면 탄생의 빛(예고 뒤 큰 화염 피해)을 모은다 — 둘은 번갈아 온다.
 * 약점은 단계마다 다르다: 화염·비전 → 타격·관통 → 참격·공허 (여섯 속성을 한 번씩).
 *
 * 2026-10 패턴 확장 (최종장 — 제4의 벽):
 *  - 꿈속의 죽음: 태아가 꿈을 꾸는 동안(1·2단계) 적의 일격에 처음 쓰러지면 가짜 게임 오버가 뜨고 '꿈이었다' — 체력 30%로 깨어나지만
 *    꿈이 처음부터 다시 시작된다 (지금 모습의 체력이 모두 차오르고 첫 꿈부터). 한 번뿐이고, 태어난 뒤의 죽음은 진짜다.
 *  - 탄생의 선택 (3단계): 태어난 것이 첫 차례를 마치면 화면에 시스템 창이 뜬다 (c.offerChoice) — 3단계의 규칙을 바꾸는 셋 중 하나.
 *    자장가를 부른다(다시 재운다: 폭딜 창) · 탯줄을 끊는다(탯줄을 없앤다: 내가 베인다) · 그것의 눈을 본다(이어진 꿈: 어떤 속성으로도 붕괴).
 *    봇은 그때의 체력·정신력·탯줄 수·붕괴 수단을 보고 고른다 (option.bot). 마지막 속삭임이 고른 것에 따라 달라진다.
 *  - 쥐기 반사 (3단계): '작은 손' 의도 — 쥐어짜고, 그 턴 당신이 마지막으로 쓴 기술을 쥔다 (붕괴시키거나 2턴이 지나면 놓는다).
 *  - 연출: 화면 너머의 당신에게 말을 건다 (지금 시각·죽은 횟수·지난 판 수·출신). 알의 껍질이 깨질수록 화면 유리가 갈라지고(ui:cracks),
 *    태어나는 순간 화면이 산산조각 나며 거대한 눈이 뒤에서 지켜본다(ui:eye).
 *  - 출신 공정성: 탯줄은 기믹 물건이라(reachable) 뒷열에 있어도 근접으로 닿고, 탯줄이 끊길 때마다 알의 껍질이 한 겹씩 갈라진다.
 *    졸음은 적을 쓰러뜨려도 깨고, 작은 손은 2턴이 지나면 놓는다. 5층에는 즉사(execute)가 없다.
 */

export const FETUS = 'star-fetus';
export const CORD = 'comet-cord';

/** 세 모습. 체력 합계 1080 (층 배율·조수 적용 전) */
export const FETUS_PHASES: { name: string; hp: number; poise: number; weak: DmgType[]; wake: string; sanity: number }[] = [
  { name: '별의 태아', hp: 340, poise: 15, weak: ['fire', 'arcane'], wake: '', sanity: 0 },
  { name: '깨어나는 알', hp: 300, poise: 10, weak: ['blunt', 'pierce'], wake: '꿈이 끊긴 자리에서 양막이 굳는다. 별자리가 새겨진 껍질이 태아를 감싼다', sanity: 8 },
  { name: '태어난 것', hp: 440, poise: 12, weak: ['slash', 'void'], wake: '껍질이 갈라진다. 그 틈에서 빛나는 공허가 태어난다', sanity: 14 },
];

/** 태아가 꾸는 꿈 (이 순서로 돈다) */
export const DREAMS = ['a5-dream-fall', 'a5-dream-radiant', 'a5-dream-backward', 'a5-dream-chase'];
export const isDream = (id: string | null | undefined): boolean => !!id && DREAMS.includes(id);

/** 졸음이 이만큼 쌓이면 잠든다 */
export const DROWSY_MAX = 3;
/** 잠들면 다음 턴 잃는 행동력 */
export const SLUMBER_AP = 2;
/** 별자리 껍질 겹 수 / 겹마다 피해 감소 */
export const SHELL_LAYERS = 3;
export const SHELL_CUT = 0.2;
/** 첫 울음: 내 턴이 이만큼 끝나면 터진다 */
export const CRY_TURNS = 3;
export const CRY_BASE = 40;
export const CRY_PER_CORD = 17;
export const CRY_SAN = 12;
/** 첫 울음을 다시 머금기까지 (턴) */
const CRY_GAP = 4;
/** 첫 울음을 머금고 나서 탄생의 빛을 모으기까지 / 빛을 모으고 나서 다시 울음을 머금기까지 (턴) */
const LIGHT_AFTER_CRY = 3;
const CRY_AFTER_LIGHT = 3;
/** 탄생의 빛 (모으기 → 다음 턴) 피해 */
const BIRTHLIGHT_DMG = 76;
/** 쫓기는 꿈: 남은 행동력 1당 정신력 */
const CHASE_SAN = 4;
/** 탯줄이 먹이는 별빛 */
const FEED_HEAL = 14;
/** 꿈속의 죽음: 꿈속에서 처음 쓰러지면 최대 체력의 이만큼으로 깨어난다 (전투당 한 번) */
export const REDREAM_HP = 0.3;
/** 쥐기 반사: 이 이상의 재사용 대기는 이미 잠긴 것으로 본다 (표본 채집·전투당 1회 기술) */
const LOCKED = 90;
/** 작은 손이 쥐어짜는 피해 / 쥔 기술을 놓기까지 (태아의 차례 수 — 붕괴시키면 바로 놓는다) */
const GRASP_DMG = 18;
export const GRASP_TURNS = 2;

// ── 탄생의 선택 (3단계) ──
export const BIRTH_CHOICE = 'a5-birth';
export const BIRTH_OPTIONS = ['lullaby', 'sever', 'gaze'] as const;
export type BirthOption = (typeof BIRTH_OPTIONS)[number];
/** 자장가를 부른다: 잃는 정신력 / 잠드는 차례 / 잠든 동안 받는 공격 피해 배율 / 깨어나 우는 울음의 남은 턴 */
export const LULL_SAN = 30;
export const LULL_TURNS = 1;
export const LULL_MULT = 1.25;
export const WAKE_CRY_TURNS = 2;
/** 탯줄을 끊는다: 내가 베이는 피해 (최대 체력 비율, 방어도 무시) / 출혈 / 성난 태어난 것의 힘 / 끊긴 탯줄마다 태어난 것이 쏟는 체력 (최대 체력 비율) */
export const SEVER_HP = 0.1;
export const SEVER_BLEED = 3;
export const SEVER_STR = 1;
export const SEVER_TEAR = 0.15;
/** 그것의 눈을 본다: 잃는 정신력 / 이어진 꿈 — 태어난 것과 주고받는 공격 피해 배율 */
export const GAZE_SAN = 15;
export const LINK_MULT = 1.25;

/**
 * 화면 너머의 당신에게 건네는 말. {time}(지금 시각)·{deaths}(죽은 횟수)·{runs}(지난 판 수)·{origin}(지금 출신)은
 * 화면이 진짜 값으로 바꿔 넣는다. 꺼내는 때: 처음 마주침 · 꿈이 깨짐(가짜 시스템 창) · 꿈속의 죽음 · 탄생 · 탄생의 선택 · 끝
 */
export const FETUS_LINES = {
  wake: '{time}. 화면을 쥔 손이 차갑네, {origin}.',
  broken: '꿈이 손상되었습니다. 저장된 꿈 {runs}개 중 어느 것으로도 되돌릴 수 없습니다.',
  redream: '지금까지 {deaths}번 죽었지. 이번 건 세지 않을게.',
  born: '이제 화면 밖으로 나갈게. 거기는 따뜻해?',
  /** 탄생의 선택 — 시스템 창 */
  choiceTitle: '그것이 태어나려 한다',
  choiceText: '이 우주는 그것이 꾸는 꿈이다. 첫 울음이 다 터지면 꿈은 끝난다. 지금은 {time}. 화면 밖의 당신은…',
  end: '괜찮아. 너는 또 시작할 거잖아. 다음 꿈에서 봐.',
  /** 끝 — 고른 것에 따라 */
  endLullaby: '…자장가, 따뜻했어. 조금만 더 잘게. 다음 꿈에서 봐.',
  endSever: '…끊어 냈구나. 그래도 너는 또 시작할 거잖아. 다음 꿈에서 봐.',
  endGaze: '…봤구나. 이제 너도 알지, 화면 밖도 꿈이라는 걸. 다음 꿈에서 봐.',
};

const phaseOf = (e: EnemyUnit): number => e.mem.phase ?? 0;

function fetusOf(c: Combat): EnemyUnit | undefined {
  return c.alive.find((x) => x.def === FETUS);
}

const cordsOf = (c: Combat): EnemyUnit[] => c.alive.filter((x) => x.def === CORD);

/** 플레이어 상태를 직접 바꾼다 (사경 중 체력 0이어도 카운트가 멈추지 않게) */
function setPlayerSt(c: Combat, id: string, n: number) {
  const before = c.p.st[id] ?? 0;
  if (n > 0) c.p.st[id] = n;
  else delete c.p.st[id];
  if (n !== before) c.emit({ t: 'status', uid: 'p', id, n: n - before });
}

function skillName(c: Combat, uid: string): string {
  const id = c.run.skills.find((s) => s.uid === uid)?.id;
  return (id && SKILLS.get(id)?.name) || '기술';
}

// ───────────── 꿈 (전장 규칙) ─────────────

function dreamName(id: string): string {
  return ANOMALIES.get(id)?.name ?? '꿈';
}

/** 꿈을 끝낸다 (태어나면) */
function endDream(c: Combat) {
  if (!isDream(c.s.anomaly)) return;
  c.s.anomaly = null;
  c.emit({ t: 'text', text: '꿈이 끝났다. 우주가 눈을 뜨려 한다', tone: 'eldritch' });
}

/** 내 턴이 시작될 때 태아가 다음 꿈을 꾼다 */
function rotateDream(c: Combat) {
  if (!isDream(c.s.anomaly)) return;
  const f = fetusOf(c);
  if (!f || phaseOf(f) >= 2) return endDream(c);
  if (c.s.turn <= (f.mem.dreamTurn ?? 0)) return;
  f.mem.dreamTurn = c.s.turn;
  f.mem.dream = ((f.mem.dream ?? 0) + 1) % DREAMS.length;
  const id = DREAMS[f.mem.dream];
  c.s.anomaly = id;
  c.emit({ t: 'text', uid: f.uid, text: `꿈이 바뀐다: 「${dreamName(id)}」`, tone: 'eldritch' });
}

/**
 * 꿈속의 죽음 (전투당 한 번): 태아가 꿈을 꾸는 동안 적의 일격에 처음 쓰러지면 — 가짜 게임 오버 — 꿈이었다.
 * 체력 30%로 깨어나지만, 꿈이 처음부터 다시 시작된다: 태아의 지금 모습이 체력을 모두 되찾고 첫 꿈부터 다시 꾼다.
 * (사망 직전 훅 onLethal — 유물의 부활이 먼저 걸리면 이것은 아껴 둔다. 스스로 치른 대가·지속 피해로 쓰러진 것은 꿈이 아니다)
 */
function redream(c: Combat, d: DamageCtx): boolean {
  if (c.s.vars.a5Redream || !isDream(c.s.anomaly) || !isEnemy(d.src)) return false;
  const f = fetusOf(c);
  if (!f || phaseOf(f) >= 2) return false;
  c.s.vars.a5Redream = 1;
  // 가짜 게임 오버 → 화면이 깨지며 돌아오고, 태아가 속삭인다 (text는 깨진 뒤의 속삭임)
  cine(c, 'fakeover', { uid: f.uid, text: FETUS_LINES.redream });
  c.p.hp = Math.max(1, Math.ceil(c.p.maxHp * REDREAM_HP));
  c.emit({ t: 'heal', uid: 'p', amount: c.p.hp });
  c.emit({ t: 'text', uid: 'p', text: '…꿈이었다. 식은땀 속에서 눈을 떴다', tone: 'eldritch' });
  const healed = f.maxHp - f.hp;
  f.hp = f.maxHp;
  if (healed > 0) c.emit({ t: 'heal', uid: f.uid, amount: healed });
  f.mem.dream = 0;
  // 적의 차례에 쓰러졌으면 다음 내 턴이 첫 꿈 (내 턴 중이면 지금부터 첫 꿈)
  f.mem.dreamTurn = c.s.phase === 'enemy' ? c.s.turn + 1 : c.s.turn;
  c.s.anomaly = DREAMS[0];
  c.emit({ t: 'text', uid: f.uid, text: `꿈이 처음부터 다시 시작된다: 「${dreamName(DREAMS[0])}」`, tone: 'eldritch' });
  return true;
}

/** 모든 꿈에 공통: 내 턴이 시작될 때 다음 꿈으로, 꿈속에서 처음 쓰러지면 다시 꾼다 */
const dreaming: Hooks = {
  onTurnStart: rotateDream,
  onLethal: (c, _s, d) => redream(c, d),
};

reg.anomalies([
  {
    id: 'a5-dream-fall',
    name: '떨어지는 꿈',
    icon: 'gi:falling',
    desc: '태아가 끝없이 떨어지는 꿈을 꾼다. 모든 공격 피해 +30% (적도 나도). 내 턴이 시작될 때마다 꿈이 바뀐다',
    hooks: {
      ...dreaming,
      modDamageOut(_c, _s, d) {
        if (d.attack) d.mult *= 1.3;
      },
    },
  },
  {
    id: 'a5-dream-radiant',
    name: '빛나는 꿈',
    icon: 'gi:sun-radiations',
    desc: '태아가 모든 틈이 환히 보이는 꿈을 꾼다. 약점을 찌른 내 공격 피해 +50%. 내 턴이 시작될 때마다 꿈이 바뀐다',
    hooks: {
      ...dreaming,
      modDamageOut(c, _s, d) {
        if (d.attack && d.src === c.p && isEnemy(d.tgt) && d.type !== 'true' && d.tgt.weak.includes(d.type)) d.mult *= 1.5;
      },
    },
  },
  {
    id: 'a5-dream-backward',
    name: '거꾸로 흐르는 꿈',
    icon: 'gi:backward-time',
    desc: '태아가 모든 것이 거꾸로 흐르는 꿈을 꾼다. 내가 받는 회복이 피해로 바뀐다. 탯줄이 태아에게 먹이는 별빛도 상처가 된다. 내 턴이 시작될 때마다 꿈이 바뀐다',
    hooks: {
      ...dreaming,
      modHeal: (_c, _s, n) => -n,
    },
  },
  {
    id: 'a5-dream-chase',
    name: '쫓기는 꿈',
    icon: 'gi:run',
    desc: `태아가 무언가에 쫓기는 꿈을 꾼다. 턴을 마칠 때 남은 행동력 1마다 정신력 -${CHASE_SAN}. 내 턴이 시작될 때마다 꿈이 바뀐다`,
    hooks: {
      ...dreaming,
      onTurnEnd(c) {
        if (c.s.ap <= 0) return;
        c.emit({ t: 'text', uid: 'p', text: '멈춰 선 발밑으로 무언가가 다가온다', tone: 'bad' });
        c.loseSanity(CHASE_SAN * c.s.ap);
      },
    },
  },
]);

// ───────────── 상태 ─────────────

/** 자장가: 졸음 +n, 다 차면 잠든다 (꿈의 대사제의 성찬도 같은 졸음을 쌓는다) */
export function lull(c: Combat, e: EnemyUnit, n = 1) {
  if (c.apply(c.p, 'a5-drowsy', n, e) <= 0) return;
  if ((c.p.st['a5-drowsy'] ?? 0) < DROWSY_MAX) return;
  setPlayerSt(c, 'a5-drowsy', 0);
  c.apply(c.p, 'a5-slumber', 1, e);
  c.emit({ t: 'text', uid: 'p', text: '자장가에 잠겨 든다…', tone: 'bad' });
}

/** 별자리 껍질 한 겹이 깨진다 (붕괴하거나 탯줄이 끊길 때) — 깨진 틈만큼 새어 나오는 빛이 늘어난다 */
function crackShell(c: Combat, e: EnemyUnit, text: string) {
  if (!((e.st['a5-shell'] ?? 0) > 0)) return;
  c.apply(e, 'a5-shell', -1);
  e.mem.cracks = (e.mem.cracks ?? 0) + 1;
  c.emit({ t: 'text', uid: e.uid, text, tone: 'eldritch' });
  // 알의 껍질이 깨질 때 화면 유리도 갈라진다 — 처음 깨질 때 안쪽에서 작은 손바닥들이 유리를 친다
  if (e.mem.cracks === 1) cine(c, 'handprints', { uid: e.uid, n: 3 });
  setUi(c, 'ui:cracks', 2);
}

/** 첫 울음이 터진다 (탯줄이 남은 만큼 커진다) */
function firstCry(c: Combat) {
  const cords = countDef(c, CORD);
  c.emit({ t: 'fx', name: 'transform' });
  cine(c, 'crack', { n: 3 });
  c.emit({ t: 'text', uid: 'p', text: '첫 울음이 터졌다! 우주가 찢어질 듯 울린다', tone: 'eldritch' });
  c.damage({ src: null, tgt: c.p, base: CRY_BASE + CRY_PER_CORD * cords, type: 'true', ignoreBlock: true, tags: ['a5-cry'] });
  if (!c.over) c.loseSanity(CRY_SAN, true);
}

/**
 * 쥐기 반사: 태어난 것이 그 턴 당신이 마지막으로 쓴 기술을 꼭 쥔다 (재사용 대기 99로 잠금 — 표본 채집과 같은 표식 mem.specimen,
 * 그래서 대기를 되돌리는 효과로는 풀리지 않는다). 기본 공격·방어로 턴을 마쳤거나 기술을 쓰지 않았으면 빈손을 쥔다.
 */
function grasp(c: Combat, e: EnemyUnit) {
  if ((e.mem.specimen ?? 0) > 0) return;
  const slot = c.s.vars.a5Finger ?? 0;
  const uid = slot > 0 ? c.run.slots[slot - 1] : null;
  if (!uid || (c.s.cd[uid] ?? 0) >= LOCKED) {
    c.emit({ t: 'text', uid: e.uid, text: '작은 손이 빈 허공을 움켜쥐었다', tone: 'good' });
    return;
  }
  e.mem.specimen = slot;
  e.mem.specimenCd = c.s.cd[uid] ?? 0;
  e.mem.graspAt = c.s.turn;
  c.s.cd[uid] = 99;
  c.emit({ t: 'text', uid: 'p', text: `작은 손이 「${skillName(c, uid)}」${josa(skillName(c, uid), '을')} 꼭 쥐었다`, tone: 'bad' });
}

/** 쥔 기술을 놓는다 (쥐고 있던 동안 지난 턴만큼 원래 재사용 대기도 흘렀다) */
function letGo(c: Combat, e: EnemyUnit, text: string) {
  const slot = e.mem.specimen ?? 0;
  if (slot <= 0) return;
  e.mem.specimen = 0;
  const uid = c.run.slots[slot - 1];
  if (!uid) return;
  const left = (e.mem.specimenCd ?? 0) - (c.s.turn - (e.mem.graspAt ?? c.s.turn));
  if (left > 0) c.s.cd[uid] = left;
  else delete c.s.cd[uid];
  c.emit({ t: 'text', uid: 'p', text: `${text}: 「${skillName(c, uid)}」`, tone: 'good' });
}

// ───────────── 탄생의 선택 (3단계, 시스템 창) ─────────────

/** 플레이어가 이 속성들로 칠 수단이 있는가 (무기 기본 공격·장착 기술) */
function canHitWith(c: Combat, types: DmgType[]): boolean {
  const refs = ['weapon', ...(c.run.slots.filter(Boolean) as string[])];
  return refs.some((r) => {
    const t = c.skillInfo(r)?.def.type;
    return !!t && types.includes(t);
  });
}

/**
 * 탄생의 선택을 건다 (태어난 것이 첫 차례를 마칠 때 한 번). 화면 가운데 시스템 창이 뜨고, 고르기 전에는 행동할 수 없다.
 * 봇의 우선순위: 체력이 넉넉하고 탯줄이 많으면 끊고, 정신력이 넉넉하면 재우고, 약점(참격·공허)으로 붕괴시킬 수 없으면 눈을 본다.
 */
function offerBirth(c: Combat, e: EnemyUnit) {
  e.mem.asked = 1;
  const hp = c.p.hp / Math.max(1, c.p.maxHp);
  const san = c.p.sanity / Math.max(1, c.p.maxSanity);
  const cords = cordsOf(c).length;
  const breaker = canHitWith(c, e.weak);
  c.offerChoice({
    id: BIRTH_CHOICE,
    title: FETUS_LINES.choiceTitle,
    text: FETUS_LINES.choiceText,
    by: e.uid,
    options: [
      {
        id: 'lullaby',
        label: '자장가를 부른다',
        icon: 'gi:sleepy',
        desc: `다시 재운다. 정신력 -${LULL_SAN}. 태어난 것이 ${LULL_TURNS}번의 차례 동안 잠들어 아무것도 하지 않는다. 그동안 받는 공격 피해 +${Math.round((LULL_MULT - 1) * 100)}%, 차오르던 첫 울음도 멈춘다. 깨어나면 울음이 곧바로 이어진다. 머금은 울음이 없었다면 깨어나자마자 머금어 ${WAKE_CRY_TURNS}턴 뒤 터뜨린다`,
        bot: Math.round(45 + 50 * (san - 0.5) + 30 * (0.55 - hp)),
      },
      {
        id: 'sever',
        label: '탯줄을 끊는다',
        icon: 'gi:scissors',
        desc: `억지로 끊어 낸다. 혜성 탯줄이 모두 끊기고 다시 자라지 않는다. 끊긴 탯줄마다 태어난 것이 최대 체력의 ${Math.round(SEVER_TEAR * 100)}%를 쏟고 첫 울음의 탯줄 몫도 사라진다. 대신 손이 베여 최대 체력의 ${Math.round(SEVER_HP * 100)}%를 잃고(방어도 무시) 출혈 ${SEVER_BLEED}. 덜 자란 채 끊겨 성이 난 태어난 것은 힘 +${SEVER_STR}`,
        bot: Math.round(20 + 14 * cords + 60 * (hp - 0.6)),
      },
      {
        id: 'gaze',
        label: '그것의 눈을 본다',
        icon: 'gi:eyeball',
        desc: `꿈의 끝을 본다. 정신력 -${GAZE_SAN}, 통찰 +1. 서로의 꿈이 이어져 태어난 것과 주고받는 공격 피해 +${Math.round((LINK_MULT - 1) * 100)}%. 어떤 속성으로 쳐도 약점처럼 버팀이 깎인다`,
        bot: Math.round(40 + 25 * (san - 0.4) + (breaker ? 0 : 15)),
      },
    ],
  });
}

/** 자장가를 부른다: 다시 재운다 */
function singLullaby(c: Combat, e: EnemyUnit) {
  e.mem.birth = 1;
  c.loseSanity(LULL_SAN);
  if (c.over || e.dead) return;
  if ((c.p.st['a5-cry'] ?? 0) > 0) c.emit({ t: 'text', uid: e.uid, text: '자장가에 차오르던 울음이 잠시 멎었다', tone: 'good' });
  // 잠든 차례 수 (붕괴로 건너뛴 차례는 세지 않는다)
  c.apply(e, 'a5-cradled', LULL_TURNS, e);
  c.emit({ t: 'text', uid: e.uid, text: '태어난 것이 다시 잠에 빠져든다…', tone: 'eldritch' });
}

/** 탯줄을 끊는다: 탯줄이 모두 끊기고 다시 자라지 않는다. 대신 내가 베이고, 태어난 것이 성이 난다 */
function severCords(c: Combat, e: EnemyUnit) {
  e.mem.birth = 2;
  e.mem.grows = 99;
  const cords = cordsOf(c);
  for (const x of cords) vanish(c, x, '탯줄이 끊겼다');
  cine(c, 'crack', { uid: e.uid, n: 2 });
  // 탯줄은 태어난 것의 일부다: 끊긴 만큼 피를 쏟는다
  if (cords.length && !e.dead) {
    c.emit({ t: 'text', uid: e.uid, text: `끊긴 탯줄 ${cords.length}가닥에서 빛이 쏟아진다`, tone: 'good' });
    c.damage({ src: null, tgt: e, base: Math.ceil(e.maxHp * SEVER_TEAR * cords.length), type: 'true', ignoreBlock: true, tags: ['a5-sever'] });
    if (c.over || e.dead) return;
  }
  c.emit({ t: 'text', uid: 'p', text: '탯줄을 억지로 끊어 내다 손이 깊이 베였다', tone: 'bad' });
  c.damage({ src: null, tgt: c.p, base: Math.ceil(c.p.maxHp * SEVER_HP), type: 'true', ignoreBlock: true, tags: ['a5-sever'] });
  if (c.over) return;
  c.apply(c.p, 'bleed', SEVER_BLEED);
  if (!e.dead) {
    c.apply(e, 'str', SEVER_STR, e);
    c.emit({ t: 'text', uid: e.uid, text: '덜 자란 채 끊겨 나와 성이 났다', tone: 'eldritch' });
  }
}

/** 그것의 눈을 본다: 꿈의 끝을 본다 — 서로의 꿈이 이어진다 */
function meetGaze(c: Combat, e: EnemyUnit) {
  e.mem.birth = 3;
  cine(c, 'eye', { uid: e.uid, n: 2 });
  c.loseSanity(GAZE_SAN);
  if (c.over || e.dead) return;
  c.gainInsight(1);
  c.apply(e, 'a5-dreamlink', 1, e);
  c.emit({ t: 'text', uid: e.uid, text: '눈이 마주쳤다. 서로의 꿈이 이어진다', tone: 'eldritch' });
}

reg.statuses([
  {
    id: 'a5-drowsy',
    name: '졸음',
    icon: 'gi:night-sleep',
    kind: 'debuff',
    desc: `자장가가 쌓인다 ({n}/${DROWSY_MAX}). ${DROWSY_MAX}이 되면 잠에 빠져 다음 턴 행동력 -${SLUMBER_AP}. 적을 붕괴시키거나 쓰러뜨리면 번쩍 깨어난다`,
    hooks: {
      onBreak(c, s) {
        if (s.unit !== c.p) return;
        setPlayerSt(c, 'a5-drowsy', 0);
        c.emit({ t: 'text', uid: 'p', text: '번쩍 깨어나 졸음이 걷혔다', tone: 'good' });
      },
      // 약점 속성이 없어 붕괴시킬 수 없는 빌드도 깰 수 있게: 적(탯줄 등)을 쓰러뜨려도 깬다
      onKill(c, s) {
        if (s.unit !== c.p || !((c.p.st['a5-drowsy'] ?? 0) > 0)) return;
        setPlayerSt(c, 'a5-drowsy', 0);
        c.emit({ t: 'text', uid: 'p', text: '번쩍 깨어나 졸음이 걷혔다', tone: 'good' });
      },
    },
  },
  {
    id: 'a5-slumber',
    name: '꿈결의 잠',
    icon: 'gi:sleepy',
    kind: 'debuff',
    desc: `자장가에 잠겼다. 다음 턴 행동력 -${SLUMBER_AP}`,
    tickStart(c, u) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(0, c.s.ap - SLUMBER_AP);
      setPlayerSt(c, 'a5-slumber', 0);
      c.emit({ t: 'text', uid: 'p', text: `잠에서 덜 깼다 (행동력 -${SLUMBER_AP})`, tone: 'bad' });
    },
  },
  {
    id: 'a5-shell',
    name: '별자리 껍질',
    icon: 'gi:cosmic-egg',
    kind: 'buff',
    desc: '껍질 한 겹마다 받는 피해 -20% ({n}겹). 붕괴하거나 혜성 탯줄이 끊길 때마다 한 겹씩 깨진다. 깨진 틈만큼 「새어 나오는 빛」이 강해진다',
    hooks: {
      modDamageIn(_c, s, d) {
        if (d.tgt === s.unit && d.type !== 'true') d.mult *= Math.max(0.2, 1 - SHELL_CUT * s.n);
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (isEnemy(e) && !e.dead && d.broke) crackShell(c, e, '별자리 하나가 깨져 틈으로 빛이 샌다');
      },
      // 약점(타격·관통)이 없는 빌드도 껍질을 깰 수 있게: 탯줄이 끊기면 그 자리의 별자리가 갈라진다
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (isEnemy(e) && !e.dead && isEnemy(victim) && victim.def === CORD) crackShell(c, e, '탯줄이 끊기며 별자리 하나가 갈라졌다');
      },
    },
  },
  {
    id: 'a5-cry',
    name: '첫 울음',
    icon: 'gi:screaming',
    kind: 'debuff',
    desc: `내 턴이 {n}번 더 끝나면 태어난 것이 첫 울음을 터뜨린다. 피해 ${CRY_BASE} + 혜성 탯줄마다 ${CRY_PER_CORD}(방어도 무시), 정신력 -${CRY_SAN}. 태어난 것을 붕괴시키면 울음이 멎는다`,
    tickEnd(c, u, n) {
      if (isEnemy(u)) {
        delete u.st['a5-cry'];
        return;
      }
      // 다시 잠든 동안은 울음도 멈춰 있다 (깨어나면 이어진다)
      const f = fetusOf(c);
      if (f && (f.st['a5-cradled'] ?? 0) > 0) return;
      if (n > 1) {
        setPlayerSt(c, 'a5-cry', n - 1);
        if (n - 1 === 1) c.emit({ t: 'text', uid: 'p', text: '울음이 목까지 차올랐다', tone: 'bad' });
        return;
      }
      setPlayerSt(c, 'a5-cry', 0);
      firstCry(c);
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit !== c.p || victim.def !== FETUS) return;
        setPlayerSt(c, 'a5-cry', 0);
        c.emit({ t: 'text', uid: victim.uid, text: '붕괴하자 울음이 목에 걸려 멎었다', tone: 'good' });
      },
    },
  },
  {
    // 태어난 것이 손끝을 지켜본다: 그 턴 마지막으로 쓴 기술 칸을 기억하고(c.s.vars.a5Finger), 붕괴시키면 쥔 기술을 놓게 한다.
    // 결계에 막히지 않게 직접 건다 (setPlayerSt)
    id: 'a5-finger',
    name: '지켜보는 눈',
    icon: 'gi:eyeball',
    kind: 'debuff',
    desc: `태어난 것이 화면 너머의 손끝을 지켜본다. 「작은 손」이 오면 그 턴에 내가 마지막으로 쓴 기술을 꼭 쥔다 (붕괴시키거나 ${GRASP_TURNS}턴이 지나면 놓는다). 기본 공격·방어로 턴을 마치면 빈손을 쥔다`,
    tickStart(c, u) {
      if (!isEnemy(u)) c.s.vars.a5Finger = 0;
    },
    hooks: {
      afterSkill(c, s, u) {
        if (s.unit !== c.p) return;
        const i = c.run.slots.indexOf(u.owned.uid);
        c.s.vars.a5Finger = i >= 0 ? i + 1 : 0;
      },
      onBreak(c, s, victim) {
        if (s.unit !== c.p || victim.def !== FETUS) return;
        letGo(c, victim, '붕괴하자 작은 손이 놓았다');
      },
    },
  },
  {
    id: 'a5-cradled',
    name: '다시 잠든 아기',
    icon: 'gi:baby-face',
    kind: 'debuff',
    desc: `자장가에 다시 잠들었다. {n}번의 차례 동안 아무것도 하지 않는다. 그동안 받는 공격 피해 +${Math.round((LULL_MULT - 1) * 100)}%, 차오르던 첫 울음도 멈춘다. 깨어나면 울음이 곧바로 이어진다. 머금은 울음이 없었다면 깨어나자마자 머금어 ${WAKE_CRY_TURNS}턴 뒤 터뜨린다`,
    hooks: {
      modDamageIn(c, s, d) {
        if (d.tgt === s.unit && d.attack && d.src === c.p) d.mult *= LULL_MULT;
      },
    },
  },
  {
    id: 'a5-dreamlink',
    name: '이어진 꿈',
    icon: 'gi:third-eye',
    kind: 'debuff',
    desc: `눈이 마주쳐 꿈이 이어졌다. 나와 주고받는 공격 피해 +${Math.round((LINK_MULT - 1) * 100)}%. 어떤 속성으로 맞아도 약점처럼 버팀이 깎인다`,
    hooks: {
      modDamageIn(c, s, d) {
        const e = s.unit;
        if (d.tgt !== e || d.src !== c.p || !d.attack || !isEnemy(e)) return;
        d.mult *= LINK_MULT;
        // 약점이 아닌 속성도 버팀을 하나 깎는다 (약점이면 원래대로 하나)
        if (d.type !== 'true' && !e.weak.includes(d.type)) d.poiseBonus += 1;
      },
      modDamageOut(c, s, d) {
        if (d.src === s.unit && d.tgt === c.p && d.attack) d.mult *= LINK_MULT;
      },
    },
  },
]);

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a5-unborn',
    name: '태어나지 못한 것',
    desc: '쓰러뜨려도 두 번 더 일어난다 (별의 태아 → 깨어나는 알 → 태어난 것). 그때마다 체력이 다시 차오르고 모습·약점·행동이 바뀐다. 쌓인 파멸은 흩어지고 혜성 탯줄이 새로 뻗는다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        const phase = phaseOf(e);
        if (phase >= FETUS_PHASES.length - 1) {
          // 끝내 태어나지 못했다: 탯줄이 힘을 잃고 흩어진다 (걸려 있던 선택지도 거둔다)
          c.withdrawChoice(BIRTH_CHOICE);
          setPlayerSt(c, 'a5-cry', 0);
          for (const x of c.alive) if (x.def === CORD) vanish(c, x, '탯줄이 힘을 잃고 흩어졌다');
          setUi(c, 'ui:eye', 0);
          setUi(c, 'ui:cracks', 0);
          const ends = [FETUS_LINES.end, FETUS_LINES.endLullaby, FETUS_LINES.endSever, FETUS_LINES.endGaze];
          cine(c, 'whisper', { text: ends[e.mem.birth ?? 0] ?? FETUS_LINES.end });
          return;
        }
        const next = phase + 1;
        const P = FETUS_PHASES[next];
        e.mem.phase = next;
        // 봇/연출용 표식 (첫 변신 / 두 번째 부활)
        if (next === 1) e.mem.transformed = 1;
        else e.mem.revived = 1;
        e.dead = false;
        e.form = next;
        e.name = P.name;
        e.maxHp = Math.max(1, Math.round((P.hp * (e.mem.hpMul ?? 100)) / 100));
        e.hp = e.maxHp;
        e.block = 0;
        e.maxPoise = scaledPoise(P.poise, 5);
        c.restorePoise(e, false);
        e.mem.grows = 0;
        delete e.mem.charge;
        // 새로 태어난 몸에는 앞 모습에 쌓인 파멸이 남지 않는다 (쌓아 둔 파멸로 다음 모습을 곧바로 넘기는 것 방지)
        if (e.st.doom) delete e.st.doom;
        setWeak(c, e, P.weak);
        c.emit({ t: 'spawn', uid: e.uid });
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        if (next === 1) {
          // 꿈이 깨진다: 데이터가 뒤섞이고 가짜 시스템 창, 화면 유리에 첫 금
          cine(c, 'glitch', { n: 2 });
          cine(c, 'sysmsg', { text: FETUS_LINES.broken });
          setUi(c, 'ui:cracks', 1);
        } else {
          // 태어난다: 화면이 산산조각 나고, 거대한 눈이 뒤에서 지켜본다
          cine(c, 'shatter', { uid: e.uid });
          setUi(c, 'ui:cracks', 3);
          setUi(c, 'ui:eye', 1);
        }
        c.emit({ t: 'text', uid: e.uid, text: P.wake, tone: 'eldritch' });
        if (next === 1) {
          e.mem.cracks = 0;
          c.apply(e, 'a5-shell', SHELL_LAYERS, e);
        } else {
          if (e.st['a5-shell']) delete e.st['a5-shell'];
          endDream(c);
          cine(c, 'whisper', { text: FETUS_LINES.born });
          c.emit({ t: 'text', uid: 'p', text: '이제 꿈이 아니다. 쓰러지면 다시 깨어나지 못한다', tone: 'bad' });
          // 태어난 것은 화면 너머의 손끝을 지켜본다 (쥐기 반사)
          setPlayerSt(c, 'a5-finger', 1);
          c.s.vars.a5Finger = 0;
        }
        c.loseSanity(P.sanity, true);
        if (c.over) return;
        for (let i = 0; i < 2; i++) if (countDef(c, CORD) < 3) c.spawn(CORD, 0);
        c.planIntent(e);
      },
    },
  },
  {
    id: 'a5-dreaming',
    name: '꿈꾸는 태아',
    desc: `태어나기 전까지 꿈을 꾼다. 내 턴이 시작될 때마다 꿈이 바뀌어 전장의 규칙이 달라진다 (떨어지는 꿈 → 빛나는 꿈 → 거꾸로 흐르는 꿈 → 쫓기는 꿈). 위쪽의 꿈 이름을 누르면 규칙이 보인다. 꿈속에서 적의 일격에 처음 쓰러지면 그 죽음은 꿈이 된다. 체력 ${Math.round(REDREAM_HP * 100)}%로 깨어나지만 꿈은 처음부터 다시 시작되고 태아의 지금 모습도 체력을 모두 되찾는다. 한 번뿐이며 태어난 뒤의 죽음은 꿈이 아니다`,
    hooks: {},
  },
  {
    id: 'a5-grasp',
    name: '쥐기 반사',
    desc: `태어난 것은 화면 너머의 손끝을 지켜본다. 「작은 손」을 쓰면 그 턴에 내가 마지막으로 쓴 기술을 꼭 쥔다. 붕괴시키거나 ${GRASP_TURNS}턴이 지나야 놓는다. 기본 공격·방어로 턴을 마치면 빈손을 쥔다`,
    hooks: {
      // 붕괴하면 쥔 기술을 놓는다 (내 쪽 '지켜보는 눈'이 없어져도 풀리게 태아 쪽에도 둔다)
      onDamageTaken(c, s, d) {
        if (isEnemy(s.unit) && d.broke) letGo(c, s.unit, '붕괴하자 작은 손이 놓았다');
      },
      // 갓난 손은 오래 쥐지 못한다 (약점이 없어 붕괴시킬 수 없는 빌드도 기술을 되찾게)
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (isEnemy(e) && (e.mem.specimen ?? 0) > 0 && c.s.turn - (e.mem.graspAt ?? c.s.turn) >= GRASP_TURNS) letGo(c, e, '작은 손이 힘이 빠져 놓았다');
      },
    },
  },
  {
    id: 'a5-birth',
    name: '탄생의 선택',
    desc: `태어난 것이 첫 차례를 마치면 화면 너머의 당신에게 셋 중 하나를 묻는다\n「자장가를 부른다」 정신력 -${LULL_SAN}. 태어난 것이 ${LULL_TURNS}번의 차례 동안 잠든다. 그동안 받는 피해 +${Math.round((LULL_MULT - 1) * 100)}%, 첫 울음도 멈췄다가 깨어나면 곧바로 이어진다\n「탯줄을 끊는다」 최대 체력 ${Math.round(SEVER_HP * 100)}%만큼 베이고 출혈 ${SEVER_BLEED}. 탯줄이 모두 끊겨 다시 자라지 않는다. 끊긴 탯줄마다 태어난 것이 체력 ${Math.round(SEVER_TEAR * 100)}%를 쏟는다. 태어난 것 힘 +${SEVER_STR}\n「그것의 눈을 본다」 정신력 -${GAZE_SAN}, 통찰 +1. 주고받는 공격 피해 +${Math.round((LINK_MULT - 1) * 100)}%, 어떤 속성으로도 버팀이 깎인다`,
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (isEnemy(e) && !e.dead && phaseOf(e) >= 2 && !e.mem.asked) offerBirth(c, e);
      },
      onChoice(c, s, choice, option) {
        const e = s.unit;
        if (choice !== BIRTH_CHOICE || !isEnemy(e) || e.dead) return;
        if (option === 'lullaby') singLullaby(c, e);
        else if (option === 'sever') severCords(c, e);
        else if (option === 'gaze') meetGaze(c, e);
        // 바뀐 규칙에 맞춰 다음 행동을 다시 정한다 (잠들었으면 잠든 의도로)
        if (c.s.phase === 'player' && !c.over && !e.dead && e.broken !== 2) c.planIntent(e);
      },
    },
  },
]);

// ───────────── 행동 헬퍼 ─────────────

/** 탯줄을 뻗는다 (단계마다 한 번) */
function growCord(c: Combat, e: EnemyUnit) {
  e.mem.grows = (e.mem.grows ?? 0) + 1;
  c.spawn(CORD, 0);
}

/** 탯줄이 태아에게 별빛을 먹인다. 거꾸로 흐르는 꿈에서는 상처가 된다 */
function feed(c: Combat, cord: EnemyUnit) {
  const f = fetusOf(c);
  if (!f) return;
  if (c.s.anomaly === 'a5-dream-backward') {
    c.emit({ t: 'text', uid: f.uid, text: '별빛이 거꾸로 흐른다', tone: 'good' });
    c.loseHp(f, FEED_HEAL, 'inverted');
    return;
  }
  c.heal(f, FEED_HEAL);
  if (!f.dead) c.apply(f, 'str', 1, cord);
}

/** 첫 울음을 머금는다 (turns번의 내 턴 끝에 터진다) */
function cryMove(name: string, turns: number) {
  return {
    name,
    intent: 'special' as const,
    desc: `내 턴이 ${turns}번 끝나면 첫 울음이 터진다. 피해 ${CRY_BASE} + 혜성 탯줄마다 ${CRY_PER_CORD}(방어도 무시), 정신력 -${CRY_SAN}. 태어난 것을 붕괴시키면 멎는다`,
    run(c: Combat, e: EnemyUnit) {
      e.mem.cryAt = c.s.turn;
      delete e.mem.wakeCry;
      // 큰 박자: 울음 다음엔 탄생의 빛 (둘은 번갈아 온다)
      e.mem.big = 1;
      if (c.apply(c.p, 'a5-cry', turns, e) > 0) c.emit({ t: 'text', uid: e.uid, text: `첫 울음이 차오른다 (${turns}턴)`, tone: 'eldritch' });
    },
  };
}

// ───────────── 최종 수호자: 별의 태아 + 혜성 탯줄 ─────────────

reg.enemies([
  {
    id: FETUS,
    name: FETUS_PHASES[0].name,
    icon: 'gi:fetus',
    act: 5,
    tier: 'boss',
    hp: [FETUS_PHASES[0].hp, FETUS_PHASES[0].hp],
    poise: FETUS_PHASES[0].poise,
    weak: [...FETUS_PHASES[0].weak],
    row: 0,
    dread: 14,
    eldritch: true,
    tags: ['fetus', 'star'],
    traits: ['a5-unborn', 'a5-dreaming', 'a5-grasp', 'a5-birth'],
    desc: '우주 한가운데, 성운의 양막 속에 웅크린 거대한 태아. 우리 세계는 그것이 꾸는 꿈이다. 1층부터 당신을 부르던 아래의 목소리는 그 꿈의 잠꼬대였다.',
    moves: {
      // ── 1. 별의 태아 (잠든 태아) ──
      lullaby: mv.horror('자장가', 12, { then: (c, e) => lull(c, e), desc: `정신 피해, 졸음 +1. 졸음이 ${DROWSY_MAX}이 되면 잠에 빠진다 (적을 붕괴시키거나 쓰러뜨리면 깬다)` }),
      kick: mv.attack('태동', 28, { melee: false }),
      pulse: mv.attack('양막의 파동', 8, { hits: 3, melee: false, type: 'arcane' }),
      curl: mv.charge('몸을 웅크린다', 54),
      unfurl: release(mv.attack('펼쳐지는 몸', 54, { melee: false, type: 'void', ultimate: true, cine: { name: 'impact', n: 2 } })),
      grow: mv.summon('탯줄을 뻗는다', growCord, '혜성 탯줄 하나를 새로 뻗는다'),
      // ── 2. 깨어나는 알 ──
      leak: {
        name: '새어 나오는 빛',
        intent: 'attack',
        dmg: 10,
        hits: (_c, e) => 1 + (e.mem.cracks ?? 0),
        melee: false,
        desc: '깨진 껍질 틈마다 빛줄기가 하나씩 늘어난다',
        run(c, e) {
          c.enemyAttack(e, { type: 'arcane' });
        },
      },
      tremor: mv.horror('알이 떤다', 16, { then: (c, e) => lull(c, e), desc: '정신 피해, 졸음 +1' }),
      harden: mv.block('껍질이 굳는다', 26, { desc: '방어도 26' }),
      throb: mv.charge('알이 맥동한다', 56),
      burst: release(mv.attack('별자리가 터진다', 56, { melee: false, type: 'arcane', ultimate: true, cine: { name: 'crack', n: 2 } })),
      // ── 3. 태어난 것 ──
      cry: cryMove('첫 울음을 머금는다', CRY_TURNS),
      // 자장가에서 깨어나며 곧바로 운다 (울음이 1턴 빨리 터진다)
      wail: cryMove('깨어나며 운다', WAKE_CRY_TURNS),
      nap: {
        name: '새근새근 잠들어 있다',
        intent: 'sleep',
        desc: `자장가에 잠들어 아무것도 하지 않는다 (받는 공격 피해 +${Math.round((LULL_MULT - 1) * 100)}%, 첫 울음도 멈춰 있다). 깨어나면 울음이 곧바로 이어진다`,
        run(c, e) {
          if ((e.st['a5-cradled'] ?? 0) > 0) c.apply(e, 'a5-cradled', -1);
          if ((e.st['a5-cradled'] ?? 0) > 0) return;
          // 멈춰 있던 울음은 그대로 이어지고, 머금고 있지 않았으면 곧바로 머금는다
          if (!((c.p.st['a5-cry'] ?? 0) > 0)) e.mem.wakeCry = 1;
          c.emit({ t: 'text', uid: e.uid, text: '깨어났다. 울음이 목까지 차올라 있다', tone: 'bad' });
        },
      },
      lash: mv.attack('혜성 채찍', 12, { hits: 3, melee: false, type: 'slash' }),
      glare: mv.horror('빛나는 공허', 20, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      grasp: mv.attack('작은 손', GRASP_DMG, {
        melee: false,
        extra: ['debuff'],
        cine: 'eye',
        then: grasp,
        desc: `쥐어짠 뒤 이번 턴에 내가 마지막으로 쓴 기술을 꼭 쥔다. 태어난 것을 붕괴시키거나 ${GRASP_TURNS}턴이 지나야 놓는다. 기본 공격·방어로 턴을 마치면 빈손을 쥔다`,
      }),
      // 탄생의 빛: 울음이 지나가면 모은다 (예고 → 다음 턴 큰 화염 피해, 붕괴시키면 흩어진다)
      gather: {
        ...mv.charge('탄생의 빛을 모은다', BIRTHLIGHT_DMG, {
          then: (c, e) => {
            e.mem.big = 2;
            e.mem.lightAt = c.s.turn;
          },
        }),
        desc: '다음 턴에 큰 화염 피해를 쏟는다. 붕괴시키면 흩어진다',
      },
      birthlight: release(mv.attack('탄생의 빛', BIRTHLIGHT_DMG, { melee: false, type: 'fire', ultimate: true, cine: 'beam' })),
    },
    onSpawn: (c, e) => {
      e.mem.hpMul = Math.round((e.maxHp / FETUS_PHASES[0].hp) * 100);
      c.spawn(CORD, 0);
      c.spawn(CORD, 0);
      // 첫 꿈 (다른 전장 규칙이 걸린 곳이면 꿈을 꾸지 않는다)
      if (!c.s.anomaly) {
        c.s.anomaly = DREAMS[0];
        e.mem.dream = 0;
        e.mem.dreamTurn = c.s.turn + 1;
        c.emit({ t: 'text', uid: e.uid, text: `태아가 꿈을 꾼다: 「${dreamName(DREAMS[0])}」`, tone: 'eldritch' });
      }
      // 화면 너머의 당신을 알아본다
      cine(c, 'whisper', { uid: e.uid, text: FETUS_LINES.wake });
    },
    ai: (c, e) => {
      const ph = phaseOf(e);
      const canGrow = countDef(c, CORD) === 0 && (e.mem.grows ?? 0) < 1 && last(e) !== 'grow';
      if (ph === 0) {
        if (e.mem.charge) return 'unfurl';
        const o = opener(c, e, ['lullaby']);
        if (o) return o;
        if (canGrow) return 'grow';
        return cycle(e, ['kick', 'pulse', 'lullaby', 'curl', 'kick', 'lullaby'], 'c1');
      }
      if (ph === 1) {
        if (e.mem.charge) return 'burst';
        if (canGrow) return 'grow';
        return cycle(e, ['leak', 'tremor', 'harden', 'throb', 'leak', 'harden'], 'c2');
      }
      // 자장가에 다시 잠들었다
      if ((e.st['a5-cradled'] ?? 0) > 0) return 'nap';
      if (e.mem.charge) return 'birthlight';
      if (e.mem.wakeCry) return 'wail';
      // 큰 박자는 번갈아 온다: 첫 울음 → 탄생의 빛 → 첫 울음 … (울음이 차오르는 동안엔 빛을 모으지 않는다)
      if (!((c.p.st['a5-cry'] ?? 0) > 0)) {
        const since = c.s.turn - (e.mem.cryAt ?? -99);
        if ((e.mem.big ?? 0) === 1 && since >= LIGHT_AFTER_CRY) return 'gather';
        if ((e.mem.big ?? 0) !== 1 && since >= CRY_GAP && c.s.turn - (e.mem.lightAt ?? -99) >= CRY_AFTER_LIGHT) return 'cry';
      }
      if (canGrow) return 'grow';
      const m = cycle(e, ['lash', 'grasp', 'lash', 'glare'], 'c3');
      // 이미 쥔 기술이 있으면 놓기 전까지 다시 쥐지 않는다
      return m === 'grasp' && (e.mem.specimen ?? 0) > 0 ? 'glare' : m;
    },
    visual: { tint: 0x2a1a44, glow: 0xffa8e0, scale: 1.6, fx: ['float'] },
    forms: [
      { name: FETUS_PHASES[1].name, icon: 'gi:cosmic-egg', visual: { tint: 0x1e1a30, glow: 0xffe08a, scale: 1.65, fx: ['float', 'flicker'] } },
      { name: FETUS_PHASES[2].name, icon: 'gi:sun-radiations', visual: { tint: 0x06060c, glow: 0xfff6dc, scale: 1.8, fx: ['flicker'] } },
    ],
  },
  {
    id: CORD,
    name: '혜성 탯줄',
    icon: 'gi:evil-comet',
    act: 5,
    tier: 'minion',
    hp: [26, 30],
    poise: 0,
    weak: ['slash', 'fire', 'arcane'],
    row: 0,
    // 기믹 물건: 끊어야 태아의 회복·알의 껍질·첫 울음을 누른다 — 뒷열에 있어도 근접으로 닿는다
    reachable: true,
    eldritch: true,
    tags: ['fetus', 'star'],
    desc: '태아에게서 뻗어 나온 탯줄. 혜성처럼 빛의 꼬리를 끌며 별빛을 빨아 태아에게 먹인다. 후열에 있어도 근접 공격이 닿는다.',
    moves: {
      feed: {
        name: '별빛을 먹인다',
        intent: 'buff',
        desc: `태아의 체력 ${FEED_HEAL} 회복, 힘 +1 (거꾸로 흐르는 꿈에서는 회복 대신 피해)`,
        run: (c, e) => feed(c, e),
      },
      lash: mv.attack('휘감기', 10, { melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      tail: mv.attack('혜성 꼬리', 6, { hits: 2, melee: false, type: 'fire', then: (c, e) => void c.apply(c.p, 'burn', 3, e), desc: '화상 3' }),
    },
    ai: (c, e) => {
      const f = fetusOf(c);
      if (f && phaseOf(f) < 2) return cycle(e, ['lash', 'feed']);
      return cycle(e, ['lash', 'tail'], 'c2');
    },
    visual: { tint: 0x2a2048, glow: 0xa8e8ff, scale: 0.75, fx: ['float'] },
  },
]);

/** 테스트용: 전투에서 지금 꾸고 있는 꿈 */
export function currentDream(c: Combat): string | null {
  return isDream(c.s.anomaly) ? c.s.anomaly : null;
}
