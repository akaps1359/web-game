import type { Combat } from '../engine/combat';
import type { DmgType, IntentKind, Rarity, School, SkillDef, SkillUse, Unit } from '../engine/types';
import type { RoomType } from '../engine/dungeon';
import { DISGUISE_REVEAL, HIDDEN_REVEAL, INSIGHT_WEAK, INSIGHT_WEAK_CAP, lvlVal } from '../engine/combat';

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
    `1당 약점 공격 피해 +${pct(INSIGHT_WEAK)}% (${INSIGHT_WEAK_CAP}까지)${has ? ` — 지금 +${pct(INSIGHT_WEAK * Math.min(INSIGHT_WEAK_CAP, k))}%` : ''}`,
    '금기 스킬과 공허의 유물·각인이 통찰에 비례해 강해진다',
    `대가: 받는 정신 피해 +${pct(INSIGHT_SAN)}%/통찰 (${INSIGHT_SAN_CAP}까지)${has ? ` — 지금 +${pct(INSIGHT_SAN * Math.min(INSIGHT_SAN_CAP, k))}%` : ''}`,
  );
  return lines.join('\n');
}

/** 한 줄짜리 통찰 풀이 (용어 풀이 목록용 — 줄바꿈이 보이지 않는 곳) */
export function insightBrief(): string {
  const steps = INSIGHT_STEPS.map((s) => `[${s.at}] ${s.text}`).join(' ');
  return `${steps}. 1당 약점 공격 피해 +${Math.round(INSIGHT_WEAK * 100)}% (${INSIGHT_WEAK_CAP}까지), 금기 스킬이 강해진다. 대신 받는 정신 피해가 1당 ${Math.round(INSIGHT_SAN * 100)}% 늘어난다 (${INSIGHT_SAN_CAP}까지).`;
}

/** 통찰을 얻는 길 */
export const INSIGHT_SOURCES = '얻기 어렵다 — 수호자의 이계 정수, 그리고 영구한 대가(최대 정신력·최대 체력·광기)를 치르는 선택으로만.';

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
