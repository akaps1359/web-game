import type { DmgType, SkillDef } from '../engine/types';
import type { RunState } from '../engine/run';
import { ENEMIES, EQUIPS, ESSENCES, RELICS, SKILLS } from '../engine/registry';
import { MAX_ASC } from '../engine/abyss';

/** 판을 넘어 유지되는 기록 */
export interface Meta {
  v: number;
  unlocked: string[];
  /** 도감: 적 id → 기록 */
  codex: Record<string, { seen: number; kills: number; weak: DmgType[] }>;
  /** 도감: 흡수해 본 정수 · 얻어 본 유물 · 얻어 본 장비 · 배워 본 스킬 */
  essences: string[];
  relics: string[];
  equips: string[];
  skills: string[];
  runs: number;
  wins: number;
  bestAct: number;
  /** 해금된 최고 심연 단계 */
  abyss: number;
  speed: 1 | 2;
  /** 이미 본 도움말 */
  tips: string[];
  /** 행동 전에 확인 창을 띄운다 */
  confirm: boolean;
}

const KEY = 'abyss.meta';

export function defaultMeta(): Meta {
  return { v: 1, unlocked: ['soldier'], codex: {}, essences: [], relics: [], equips: [], skills: [], runs: 0, wins: 0, bestAct: 1, abyss: 0, speed: 1, tips: [], confirm: true };
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultMeta(), ...JSON.parse(raw) };
  } catch {
    /* 저장소 사용 불가 */
  }
  return defaultMeta();
}

export function saveMeta(m: Meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* 무시 */
  }
}

/** 도감 → 새 판에 넘길 약점 지식 */
export function knownWeak(m: Meta): Record<string, DmgType[]> {
  const out: Record<string, DmgType[]> = {};
  for (const [id, e] of Object.entries(m.codex)) if (e.weak.length) out[id] = [...e.weak];
  return out;
}

/** 판 진행 상황을 메타에 반영 (전투 후, 판 종료 시) */
export function absorbRun(m: Meta, run: RunState, ended: boolean) {
  for (const id of run.seen) {
    m.codex[id] ??= { seen: 0, kills: 0, weak: [] };
  }
  for (const [id, n] of Object.entries(run.killed)) {
    m.codex[id] ??= { seen: 0, kills: 0, weak: [] };
    m.codex[id].kills = Math.max(m.codex[id].kills, n);
  }
  for (const [id, weak] of Object.entries(run.learned.weak)) {
    m.codex[id] ??= { seen: 0, kills: 0, weak: [] };
    m.codex[id].weak = [...new Set([...m.codex[id].weak, ...(weak as DmgType[])])];
  }
  for (const e of run.essences) if (!m.essences.includes(e.id)) m.essences.push(e.id);
  for (const r of run.relics) if (!m.relics.includes(r.id)) m.relics.push(r.id);
  for (const it of [...Object.values(run.equip), ...run.bag]) if (it && !m.equips.includes(it.id)) m.equips.push(it.id);
  for (const sk of run.skills) if (!m.skills.includes(sk.id)) m.skills.push(sk.id);
  m.bestAct = Math.max(m.bestAct, run.act);
  if (m.bestAct >= 2 && !m.unlocked.includes('hunter')) m.unlocked.push('hunter');
  if (m.bestAct >= 3 && !m.unlocked.includes('occultist')) m.unlocked.push('occultist');
  if (ended) {
    m.runs++;
    if (run.over?.won) {
      m.wins++;
      // 심연 단계: N단계를 깨면 N+1단계가 열린다
      m.abyss = Math.max(m.abyss, Math.min(MAX_ASC, (run.asc ?? 0) + 1));
    }
    for (const id of Object.keys(m.codex)) if (run.seen.includes(id)) m.codex[id].seen++;
  }
}

// ───────── 테스트용: 기억해 둔 기록 ─────────
// 전체 해금·초기화로 시험해 본 뒤 원래 진행 상황으로 돌아올 수 있게, 그 전 기록을 따로 보관한다.

const RESTORE_KEY = 'abyss.meta.restore';

export interface RestorePoint {
  /** 기억한 때 (ms) */
  at: number;
  meta: Meta;
}

export function loadRestorePoint(): RestorePoint | null {
  try {
    const raw = localStorage.getItem(RESTORE_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RestorePoint;
    return { at: r.at, meta: { ...defaultMeta(), ...r.meta } };
  } catch {
    return null;
  }
}

export function saveRestorePoint(m: Meta): RestorePoint {
  const r: RestorePoint = { at: Date.now(), meta: JSON.parse(JSON.stringify(m)) as Meta };
  try {
    localStorage.setItem(RESTORE_KEY, JSON.stringify(r));
  } catch {
    /* 무시 */
  }
  return r;
}

export function clearRestorePoint() {
  try {
    localStorage.removeItem(RESTORE_KEY);
  } catch {
    /* 무시 */
  }
}

/** 기억한 기록으로 되돌린 메타 (속도·확인 창 같은 설정은 지금 것을 둔다) */
export function restoredMeta(now: Meta, saved: Meta): Meta {
  return { ...defaultMeta(), ...JSON.parse(JSON.stringify(saved)), speed: now.speed, confirm: now.confirm };
}

/** 처음 상태의 메타 (설정은 지금 것을 둔다) */
export function blankMeta(now: Meta): Meta {
  return { ...defaultMeta(), speed: now.speed, confirm: now.confirm };
}

/** 스킬 도감에 싣는 것 — 기본 공격과 정수 기술은 뺀다 (정수 기술은 정수 도감에서 본다) */
export function codexSkills(): SkillDef[] {
  return [...SKILLS.values()].filter((d) => !d.tags.includes('basic') && d.school !== 'essence');
}

/** 테스트용: 도감(적·장비·정수·스킬·유물)과 최고 층·심연 단계를 모두 연다 */
export function unlockAllInfo(m: Meta) {
  for (const [id, d] of ENEMIES) {
    const rec = (m.codex[id] ??= { seen: 0, kills: 0, weak: [] });
    rec.seen = Math.max(1, rec.seen);
    rec.kills = Math.max(1, rec.kills);
    rec.weak = [...new Set([...rec.weak, ...d.weak])];
  }
  m.essences = [...ESSENCES.keys()];
  m.relics = [...RELICS.keys()];
  m.equips = [...EQUIPS.keys()];
  m.skills = [...new Set([...m.skills, ...codexSkills().map((d) => d.id)])];
  m.bestAct = Math.max(m.bestAct, 5);
  m.abyss = Math.max(m.abyss, MAX_ASC);
}
