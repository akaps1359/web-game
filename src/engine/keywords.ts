import { EQUIPS, RUNES, SKILLS } from './registry';
import type { Keyword, School, SkillDef } from './types';
import type { RunState } from './run';
import { runeSchool, skillSchools } from './schools';
import { josa } from './josa';

/**
 * 상처의 문법 — 계열을 잇는 키워드. 안쪽 설계용이다: 플레이어에게는 새 용어 없이 스킬 설명의 조건 한 줄로만 보인다.
 * 키워드마다 1차 생산 계열(지금 주인), 2차 생산 계열 하나(가끔·약하게), 읽는 계열(1차 계열 제외 둘 이상)을 정한다.
 * 스킬은 SkillDef.makes / SkillDef.reads로 무엇을 만들고 무엇을 읽는지 밝힌다. 표는 src/content/keywords.ts가 채운다.
 *
 * 실마리 보상(⑤): 지금 가진 스킬·무기·각인이 만드는 키워드를 읽는 스킬, 내가 읽는 키워드를 만드는 스킬은
 * 계열이 다르면 보상에 더 자주 나온다 (rollSkills · clueMult). 그 이유 한 줄은 clueReason.
 */

export interface KeywordDef {
  id: Keyword;
  /** 이름 (실마리 이유 문구에 쓴다, 예: '출혈') */
  name: string;
  /** 적에게 남는 것 / 나에게 남는 것 */
  side: 'enemy' | 'self';
  /** 1차 생산 계열 (지금 주인). 누구나 거는 공용 키워드는 'neutral' */
  primary: School;
  /** 2차 생산 계열 (가끔, 약하게 만든다) */
  secondary: School;
  /** 읽는 계열 (1차 계열 제외). 스킬 태그와 맞는지 테스트가 검사한다 */
  readers: School[];
  /** 누구나 만드는 키워드 (방어도: 방어구 기본기가 늘 만든다). 실마리는 1차 계열이 만든 것을 '읽는' 스킬 쪽만 센다 */
  universal?: boolean;
}

export const KEYWORDS = new Map<Keyword, KeywordDef>();

/** 각인이 만들거나 읽는 키워드 (각인도 실마리의 재료다) */
export const RUNE_KEYWORDS = new Map<string, { makes?: Keyword[]; reads?: Keyword[] }>();

export function regKeywords(defs: KeywordDef[]) {
  for (const d of defs) {
    if (KEYWORDS.has(d.id)) throw new Error(`중복 키워드: ${d.id}`);
    KEYWORDS.set(d.id, d);
  }
}

export function regRuneKeywords(m: Record<string, { makes?: Keyword[]; reads?: Keyword[] }>) {
  for (const [id, v] of Object.entries(m)) RUNE_KEYWORDS.set(id, v);
}

/** 사람의 기술 여섯 계열 (공용·정수 제외) */
export const SCHOOLS6: readonly School[] = ['blade', 'firearm', 'occult', 'alchemy', 'resolve', 'forbidden'];
const isSchool6 = (s: School) => SCHOOLS6.includes(s);

/** 이 스킬이 읽는 키워드 가운데 남의 계열 것 (그 키워드의 1차 계열이 이 스킬의 계열이 아니다). 공용 스킬·정수 기술은 늘 빈 배열 */
export function foreignReads(def: SkillDef): Keyword[] {
  if (!isSchool6(def.school)) return [];
  return (def.reads ?? []).filter((k) => {
    const kw = KEYWORDS.get(k);
    return !!kw && kw.primary !== def.school;
  });
}

/** 계열을 잇는 스킬인가 (글루): 남의 계열 키워드를 읽는다. 안쪽 판정용 (테스트·시뮬레이터) */
export function isBridge(def: SkillDef): boolean {
  return foreignReads(def).length > 0;
}

/** 계열을 잇는 스킬인가: 남의 키워드를 읽거나(글루) 두 계열로 치는 것(예전 합기, SkillDef.duo) */
export function crossesSchools(def: SkillDef): boolean {
  return isBridge(def) || !!def.duo;
}


/** 키워드 이름들 (예: '출혈·독') */
export function keywordNames(ks: readonly Keyword[]): string {
  return ks.map((k) => KEYWORDS.get(k)?.name ?? k).join('·');
}

// ───────────── 실마리 보상 ─────────────

/**
 * 실마리 보상 수치. per: 맞물리는 키워드 하나마다 가중치 +per배 · cap: 가중치 상한 ·
 * guaranteed: 정예·수호자 보상의 스킬 하나는 실마리 후보에서 뽑는다 (후보가 있을 때) · everyChoice: 보통 전투의 고르는 보상도.
 * unlinked: 남의 키워드를 읽는데 지금 판과 맞물리지 않는 스킬의 가중치 배율 (읽을 게 없는 스킬은 덜 나온다 — 출신 계열 풀이 남의 조건 스킬로 묽어지지 않게).
 * 시뮬레이터가 바꿔 볼 수 있게 객체로 둔다 (SIM_CLUE=off → per 0, 보장 없음 · SIM_CLUE_ALL=1 → everyChoice · SIM_CLUE_UNLINKED=0.7)
 */
export const CLUE = { per: 0.5, cap: 2, guaranteed: true, everyChoice: false, unlinked: 0.5 };

/** 실마리의 재료 하나: 가진 스킬 · 장착한 무기의 기본 공격 · 각인 */
export interface ClueSource {
  kind: 'skill' | 'weapon' | 'rune';
  id: string;
  /** 화면 이름 (스킬 이름 · 무기 이름 · 각인 이름) */
  name: string;
  /** 이 재료가 치는 계열들 (engine/schools.ts의 skillSchools — 합기는 두 계열, 새긴 계열 각인도). 무계열 각인은 빈 배열 */
  schools: School[];
  /** 장착한 것인가 (지금은 늘 그렇다 — 장착한 것만 재료로 센다) */
  equipped: boolean;
  makes: Keyword[];
  reads: Keyword[];
}

/**
 * 실마리의 재료: 지금 쓰는 것 — 장착한 스킬(정수 기술 제외)·무기의 기본 공격·스킬에 새긴 각인.
 * 가방에만 든 스킬·각인은 세지 않는다 (판이 길어지면 모든 것이 실마리가 되어 이유가 흐려진다)
 */
export function clueSources(run: RunState): ClueSource[] {
  const out: ClueSource[] = [];
  const equipped = new Set(run.slots.filter((x): x is string => !!x));
  for (const s of run.skills) {
    const d = SKILLS.get(s.id);
    if (!d || d.school === 'essence' || s.from || !equipped.has(s.uid)) continue;
    if (!d.makes?.length && !d.reads?.length) continue;
    out.push({ kind: 'skill', id: d.id, name: d.name, schools: skillSchools(run, s), equipped: equipped.has(s.uid), makes: d.makes ?? [], reads: d.reads ?? [] });
  }
  const w = run.equip.weapon;
  const wd = w ? EQUIPS.get(w.id) : undefined;
  const ws = wd?.skill ? SKILLS.get(wd.skill) : undefined;
  if (wd && ws && (ws.makes?.length || ws.reads?.length)) {
    out.push({ kind: 'weapon', id: wd.id, name: wd.name, schools: skillSchools(run, { id: ws.id, runes: [] }), equipped: true, makes: ws.makes ?? [], reads: ws.reads ?? [] });
  }
  const socketed = new Set(run.skills.filter((s) => equipped.has(s.uid)).flatMap((s) => s.runes));
  for (const id of socketed) {
    const k = RUNE_KEYWORDS.get(id);
    const r = RUNES.get(id);
    if (!k || !r) continue;
    const sc = runeSchool(id);
    out.push({ kind: 'rune', id, name: r.name, schools: sc ? [sc] : [], equipped: socketed.has(id), makes: k.makes ?? [], reads: k.reads ?? [] });
  }
  return out;
}

/** 실마리 하나: 이 스킬이 재료(src)의 키워드를 쓴다(reads) / 재료가 쓰는 키워드를 이 스킬이 만든다(feeds) */
export interface ClueLink {
  kw: Keyword;
  dir: 'reads' | 'feeds';
  src: ClueSource;
}

/**
 * 이 스킬이 지금 판의 무엇과 맞물리는가. 계열이 다른 것끼리만 센다 — 실마리는 계열을 잇는 다리다
 * (같은 계열의 맞물림은 출신 계열 가중치가 이미 챙긴다).
 * 방어도처럼 누구나 만드는 키워드는 1차 계열 스킬이 만든 것을 '쓰는' 쪽만 센다 (연막의 방어도로 방패 강타를 권하지 않게)
 */
export function clueLinks(run: RunState, def: SkillDef, sources: ClueSource[] = clueSources(run)): ClueLink[] {
  const out: ClueLink[] = [];
  if (def.school === 'essence') return out;
  const reads = def.reads ?? [];
  const makes = def.makes ?? [];
  if (!reads.length && !makes.length) return out;
  for (const src of sources) {
    if (src.kind === 'skill' && src.id === def.id) continue;
    // 이 스킬의 계열을 재료가 이미 친다면 같은 계열끼리다 (합기는 두 계열, 계열 각인을 새긴 스킬은 그 계열로도 친다)
    if (src.schools.includes(def.school)) continue;
    for (const k of reads) {
      const kw = KEYWORDS.get(k);
      if (src.makes.includes(k) && (!kw?.universal || src.schools.includes(kw.primary))) out.push({ kw: k, dir: 'reads', src });
    }
    for (const k of makes) if (!KEYWORDS.get(k)?.universal && src.reads.includes(k)) out.push({ kw: k, dir: 'feeds', src });
  }
  return out;
}

/** 실마리 가중치 배율: 맞물리는 키워드 하나마다 +per, 상한 cap. 맞물림이 없으면 1 (남의 키워드를 읽는 스킬이면 unlinked) */
export function clueMult(links: readonly ClueLink[], def?: SkillDef): number {
  const kinds = new Set(links.map((l) => `${l.dir}:${l.kw}`)).size;
  if (kinds) return Math.min(CLUE.cap, 1 + CLUE.per * kinds);
  return def && isBridge(def) ? CLUE.unlinked : 1;
}

/** 이 스킬이 지금 판의 실마리인가 */
export function isClue(run: RunState, def: SkillDef, sources?: ClueSource[]): boolean {
  return clueLinks(run, def, sources).length > 0;
}

/**
 * 보상 카드에 붙일 이유 한 줄 (화면 연결용). 실마리가 아니면 null.
 * 짧은 명사형으로 (해요체 금지, docs/TEXT_STYLE.md): '가진 「톱날 베기」의 출혈을 읽음' · '가진 「혈류 폭발」이 읽을 출혈을 만듦' · '가진 무기 「사냥칼」의 출혈을 읽음'.
 * 읽는 쪽을 먼저, 스킬 → 무기 → 각인 순으로 하나만 고른다 (강하다는 말은 하지 않는다)
 */
export function clueReason(run: RunState, skillId: string): string | null {
  const def = SKILLS.get(skillId);
  if (!def) return null;
  const links = clueLinks(run, def);
  if (!links.length) return null;
  const rank = (l: ClueLink) => (l.dir === 'reads' ? 0 : 10) + (l.src.kind === 'skill' ? (l.src.equipped ? 0 : 1) : l.src.kind === 'weapon' ? 2 : 3);
  const best = links.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  const name = KEYWORDS.get(best.kw)?.name ?? best.kw;
  const who = best.src.kind === 'weapon' ? `가진 무기 「${best.src.name}」` : `가진 「${best.src.name}」`;
  const obj = `${name}${josa(name, '을')}`;
  return best.dir === 'reads' ? `${who}의 ${obj} 읽음` : `${who}${josa(best.src.name, '이')} 읽을 ${obj} 만듦`;
}
