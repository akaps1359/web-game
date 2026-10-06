import type { Combat } from '../engine/combat';
import type { DmgType, IntentKind, Rarity, School, SkillDef, SkillUse, Unit } from '../engine/types';
import type { RoomType } from '../engine/dungeon';
import { lvlVal } from '../engine/combat';

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
};

export const RARITY_COLOR: Record<Rarity, string> = {
  basic: '#8a8f96',
  common: '#cfc8b8',
  uncommon: '#6fb6ea',
  rare: '#f0c058',
  forbidden: '#4fffc4',
  boss: '#ff5a6e',
  special: '#d78cff',
};

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

// ───────────── 스킬 설명 ─────────────

export type Seg = { t: string; k?: 'num' | 'up' | 'down' };

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
      const v = opts.c.preview(opts.c.p, opts.target ?? null, base, opts.use.type ?? def.type ?? 'blunt', { attack: true, skill: opts.use });
      out.push({ t: String(v), k: v > base ? 'up' : v < base ? 'down' : 'num' });
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
