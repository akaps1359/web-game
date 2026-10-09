import type { Combat } from '../engine/combat';
import type { DmgType, IntentKind, Rarity, School, SkillDef, SkillUse, Unit } from '../engine/types';
import type { RoomType } from '../engine/dungeon';
import { DISGUISE_REVEAL, HIDDEN_REVEAL, INSIGHT_WEAK, INSIGHT_WEAK_CAP, lvlVal, WEAK_BONUS } from '../engine/combat';
import { WEAKPOINT } from '../engine/weakpoint';

export const DMG_NAME: Record<DmgType | 'true', string> = {
  slash: '참격',
  pierce: '관통',
  blunt: '타격',
  fire: '화염',
  arcane: '비전',
  void: '공허',
  true: '고정',
};

export const DMG_COLOR: Record<DmgType | 'true', string> = {
  slash: '#dfe5ea',
  pierce: '#f2d27a',
  blunt: '#d39a6a',
  fire: '#ff7a45',
  arcane: '#b98cff',
  void: '#4fffc4',
  true: '#ffffff',
};
/** 급소 (engine/weakpoint.ts) — 약점(네모)과 달리 둥근 금빛 고리 */
export const WP_COLOR = '#ffd23f';
/** 급소 규칙 한 문단 (용어 풀이·첫 안내) */
export const WP_RULE = `여정마다 바뀌는 숨은 약점. 일반·정예·수호자 존재마다 한 속성씩 숨어 있다. 드러난 급소만 노릴 수 있다 — 그 속성으로 맞히면 피해 ×${WEAKPOINT.mult}, 버팀 하나 더 (약점과 겹치면 둘 다). 맞혀서는 드러나지 않는다: 들여다보는 이벤트, 관찰·조명탄·기묘한 우상 같은 약점을 밝히는 것들, 통찰 ${WEAKPOINT.insight}으로 드러난다. 한 번 드러나면 이번 여정 내내 금빛 고리로 보인다 — 지도의 방 설명과 보상 카드에도. 다음 여정엔 다른 곳에 있다.`;

export const DMG_ICON: Record<DmgType, string> = {
  slash: 'gi:sword-wound',
  pierce: 'gi:arrowhead',
  blunt: 'gi:hammer-drop',
  fire: 'gi:flame',
  arcane: 'gi:magic-swirl',
  void: 'gi:portal',
};

export const SCHOOL_NAME: Record<School, string> = {
  blade: '검술',
  firearm: '사격',
  occult: '비술',
  alchemy: '연금',
  resolve: '결의',
  forbidden: '금기',
  essence: '정수',
  neutral: '공용',
};

export const SCHOOL_COLOR: Record<School, string> = {
  blade: '#d6dce2',
  firearm: '#e8c46a',
  occult: '#b48cff',
  alchemy: '#ff8a50',
  resolve: '#8fb8d8',
  forbidden: '#4fffc4',
  essence: '#e86a8a',
  neutral: '#a8a29a',
};

export const RARITY_NAME: Record<Rarity, string> = {
  basic: '기본',
  common: '일반',
  uncommon: '고급',
  rare: '희귀',
  forbidden: '금기',
  boss: '보스',
  special: '특수',
  genesis: '창세',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  basic: '#8a8f96',
  common: '#cfc8b8',
  uncommon: '#6fb6ea',
  rare: '#f0c058',
  forbidden: '#4fffc4',
  boss: '#ff5a6e',
  special: '#d78cff',
  // 창세: 오팔빛 흰색 — 이름은 무지갯빛으로 흐른다 (rarityClass → main.css .genesis-name)
  genesis: '#ffe3fa',
};

/** 이름에 붙이는 등급 연출 클래스 (창세는 무지갯빛 글자) */
export function rarityClass(r: Rarity | undefined): string {
  return r === 'genesis' ? 'genesis-name' : '';
}

export const INTENT_ICON: Record<IntentKind, string> = {
  attack: 'gi:crossed-swords',
  block: 'gi:shield',
  buff: 'gi:biceps',
  debuff: 'gi:broken-bone',
  horror: 'gi:brain-tentacle',
  summon: 'gi:raise-zombie',
  charge: 'gi:lightning-frequency',
  advance: 'gi:boot-prints',
  retreat: 'gi:boot-prints',
  heal: 'gi:heart-plus',
  flee: 'gi:exit-door',
  stunned: 'gi:knocked-out-stars',
  sleep: 'gi:sleepy',
  unknown: 'gi:help',
  special: 'gi:star-swirl',
  death: 'gi:death-skull',
};

export const INTENT_COLOR: Record<IntentKind, string> = {
  attack: '#ff6a5a',
  block: '#8fc4ea',
  buff: '#f0b050',
  debuff: '#b48cff',
  horror: '#4fffc4',
  summon: '#e86a8a',
  charge: '#ffd040',
  advance: '#c8c2b4',
  retreat: '#c8c2b4',
  heal: '#6ee08a',
  flee: '#c8c2b4',
  stunned: '#ffe080',
  sleep: '#8a8f96',
  unknown: '#8a8f96',
  special: '#d78cff',
  death: '#ff2a3a',
};

/** 의도 표시의 아이콘 아래 짧은 이름 (범례·자세히 보기에도 쓴다) */
export const INTENT_NAME: Record<IntentKind, string> = {
  attack: '공격',
  charge: '준비',
  block: '방어',
  buff: '강화',
  debuff: '방해',
  horror: '정신',
  summon: '소환',
  advance: '전진',
  retreat: '후퇴',
  heal: '회복',
  flee: '도주',
  stunned: '붕괴',
  sleep: '잠',
  unknown: '???',
  special: '특수',
  death: '즉사',
};

/** 의도 종류의 뜻 (범례·용어집. 시스템 도움말이라 해라체) */
export const INTENT_MEANING: Record<IntentKind, string> = {
  attack: '나를 공격한다. 숫자는 내가 받을 피해다.',
  charge: '힘을 모은다. 다음 적의 차례엔 힘만 모으고 그다음 차례에 크게 공격한다. 그 전에 붕괴시키면 끊긴다.',
  block: '방어도를 쌓는다. 내 공격이 그만큼 먼저 막힌다.',
  buff: '자신이나 동료를 강하게 한다.',
  debuff: '나에게 해로운 상태를 건다.',
  horror: '정신력을 깎는다. 숫자는 잃을 정신력이다.',
  summon: '다른 존재를 불러낸다.',
  advance: '전열로 나온다.',
  retreat: '후열로 물러난다.',
  heal: '체력을 회복한다.',
  flee: '전투에서 달아난다.',
  stunned: '붕괴하거나 기절해서 다음 차례엔 행동하지 못한다.',
  sleep: '잠들어 아무것도 하지 않는다.',
  unknown: '의도가 가려져 보이지 않는다. 통찰이 높으면 보인다.',
  special: '이 적만의 특별한 행동이다. 누르면 설명이 나온다.',
  death: '즉사기다. 막지 못하면 사경 없이 그 자리에서 죽는다. 막는 법은 화면 위 붉은 띠에 있다.',
};

/** 관망(_wait): 아무것도 하지 않는 차례 */
export const INTENT_WAIT = '다음 차례엔 아무것도 하지 않는다.';

/** 받침: 0 없음 · 'l' ㄹ · 1 그 밖 */
export { josa } from '../engine/josa';

export const ROOM_ICON: Record<RoomType, string> = {
  start: 'gi:footsteps',
  combat: 'gi:crossed-swords',
  elite: 'gi:fanged-skull',
  treasure: 'gi:open-treasure-chest',
  event: 'gi:sparkles',
  camp: 'gi:campfire',
  merchant: 'gi:shop',
  shrine: 'gi:church',
  portal: 'gi:dungeon-gate',
  empty: 'gi:footsteps',
  lord: 'gi:crowned-skull',
};

export const ROOM_NAME: Record<RoomType, string> = {
  start: '시작 지점',
  combat: '소굴',
  elite: '강적의 소굴',
  treasure: '보물',
  event: '기묘한 일',
  camp: '야영지',
  merchant: '떠돌이 상인',
  shrine: '신전',
  portal: '포탈 비석',
  empty: '빈 방',
  lord: '계층군주',
};

export const ROOM_COLOR: Record<RoomType, string> = {
  start: '#8a8f96',
  combat: '#d86a5a',
  elite: '#ff4a5a',
  treasure: '#f0c058',
  event: '#b48cff',
  camp: '#ff9a4a',
  merchant: '#6ee0a0',
  shrine: '#8fc4ea',
  portal: '#4fffc4',
  empty: '#5a5f66',
  lord: '#ff2a6a',
};

// ───────────── 통찰 ─────────────

/** 받는 정신 피해가 통찰 1당 늘어나는 비율과, 그 상한 통찰 (엔진: Combat.loseSanity) */
const INSIGHT_SAN = 0.05;
const INSIGHT_SAN_CAP = 6;

/**
 * 통찰 단계 — 4는 4층 어둠(act4 DARK_REVEAL)·5층 환영(act5 ILLUSION_SIGHT),
 * 5는 검은 파라오의 자비(act4 LIAR_REVEAL)·꿈의 문지기의 문(act5 FALSE_DOOR_SIGHT). 값이 바뀌면 여기도
 */
export const INSIGHT_STEPS: { at: number; text: string }[] = [
  { at: 1, text: '전투를 시작할 때 적마다 약점 하나가 보인다' },
  { at: 2, text: '적의 약점이 모두 보인다' },
  { at: Math.max(HIDDEN_REVEAL, DISGUISE_REVEAL), text: '숨겨진 의도와 거짓 의도가 보인다' },
  { at: WEAKPOINT.insight, text: '적의 급소(판마다 바뀌는 숨은 약점)가 보인다' },
  { at: 4, text: '4층의 어둠 속 의도와 5층의 환영이 보인다' },
  { at: 5, text: '가장 깊은 속임수(검은 파라오의 자비, 꿈의 문지기의 문)가 보인다' },
];

/** 통찰 설명. n을 주면 지금 켜진 단계와 수치를 함께 */
export function insightText(n?: number): string {
  const has = n !== undefined;
  const k = n ?? 0;
  const pct = (x: number) => Math.round(x * 100);
  const lines = INSIGHT_STEPS.map((s) => `${has ? (k >= s.at ? '● ' : '○ ') : ''}${s.at}: ${s.text}`);
  lines.push(
    `약점 공격 피해 +${pct(WEAK_BONUS)}%, 통찰 1당 +${pct(INSIGHT_WEAK)}% 더 (${INSIGHT_WEAK_CAP}까지)${has ? `. 지금 +${pct(WEAK_BONUS + INSIGHT_WEAK * Math.min(INSIGHT_WEAK_CAP, k))}%` : ''}`,
    '금기 스킬과 공허의 유물·각인이 통찰에 비례해 강해진다',
    `대가: 받는 정신 피해 +${pct(INSIGHT_SAN)}%/통찰 (${INSIGHT_SAN_CAP}까지)${has ? `. 지금 +${pct(INSIGHT_SAN * Math.min(INSIGHT_SAN_CAP, k))}%` : ''}`,
  );
  return lines.join('\n');
}

/** 한 줄짜리 통찰 풀이 (용어 풀이 목록용 — 줄바꿈이 보이지 않는 곳) */
export function insightBrief(): string {
  const steps = INSIGHT_STEPS.map((s) => `[${s.at}] ${s.text}`).join(' ');
  return `${steps}. 1당 약점 공격 피해 +${Math.round(INSIGHT_WEAK * 100)}% 더 (${INSIGHT_WEAK_CAP}까지), 금기 스킬이 강해진다. 대신 받는 정신 피해가 1당 ${Math.round(INSIGHT_SAN * 100)}% 늘어난다 (${INSIGHT_SAN_CAP}까지).`;
}

/** 통찰을 얻는 길 */
export const INSIGHT_SOURCES = '대가 없이는 얻을 수 없다. 영구한 대가(최대 정신력·최대 체력·광기)를 치르는 선택, 금기의 봉헌, 수호자 유물로만 얻는다.';

// ───────────── 스킬 설명 ─────────────

export type Seg = { t: string; k?: 'num' | 'up' | 'down' };

/**
 * 같은 대상을 여러 번 때리는 스킬인가 — 고정 가산(힘·'+N')은 스킬 한 번에 대상마다 첫 타격에만 붙으므로
 * 미리보기에서 '이후 타격'과 '첫 타'를 나눠 보여 준다 (도탄처럼 다른 적에게 튕기는 스킬은 대상마다 첫 타라 제외)
 */
export function hitsSameTarget(def: SkillDef, lvl: number): boolean {
  const hits = def.vals.hits;
  if (hits !== undefined && lvlVal(hits, lvl) > 1) return true;
  return def.tags.includes('multi') && def.vals.bounce === undefined;
}

/** 템플릿 {key} / {D:key} / {B:key}를 수치로 바꾼다 */
export function skillDesc(def: SkillDef, lvl: number, opts: { c?: Combat | null; target?: Unit | null; use?: SkillUse | null } = {}): Seg[] {
  const out: Seg[] = [];
  const re = /\{(?:([DB]):)?([a-zA-Z]+)\}/g;
  let last = 0;
  const raw = (key: string) => {
    if (opts.use) return opts.use.v(key);
    const v = def.vals[key];
    return v === undefined ? 0 : lvlVal(v, lvl);
  };
  for (const m of def.desc.matchAll(re)) {
    if (m.index! > last) out.push({ t: def.desc.slice(last, m.index) });
    const kind = m[1];
    const base = raw(m[2]);
    if (kind === 'D' && opts.c && opts.use) {
      const type = opts.use.type ?? def.type ?? 'blunt';
      const v = opts.c.preview(opts.c.p, opts.target ?? null, base, type, { attack: true, skill: opts.use });
      // 여러 번 때리는 스킬: 고정 가산은 대상마다 첫 타에만 — '이후 타격(첫 타 N)'으로
      const rest = hitsSameTarget(def, lvl) ? opts.c.preview(opts.c.p, opts.target ?? null, base, type, { attack: true, skill: opts.use, repeat: true }) : v;
      out.push({ t: String(rest), k: rest > base ? 'up' : rest < base ? 'down' : 'num' });
      if (rest !== v) out.push({ t: `(첫 타 ${v})`, k: v > rest ? 'up' : 'down' });
    } else if (kind === 'B' && opts.c && opts.use) {
      const v = opts.c.previewBlock(base, opts.use);
      out.push({ t: String(v), k: v > base ? 'up' : v < base ? 'down' : 'num' });
    } else {
      out.push({ t: String(base), k: 'num' });
    }
    last = m.index! + m[0].length;
  }
  if (last < def.desc.length) out.push({ t: def.desc.slice(last) });
  return out;
}

export function plain(segs: Seg[]): string {
  return segs.map((s) => s.t).join('');
}

/** 상태 설명의 {n} 치환 */
export function statusText(desc: string, n: number): string {
  return desc.replace(/\{n\}/g, String(n));
}

export function hours(h: number): string {
  const day = Math.floor(h / 24);
  const hr = h % 24;
  return day > 0 ? `${day}일 ${hr}시간` : `${hr}시간`;
}
