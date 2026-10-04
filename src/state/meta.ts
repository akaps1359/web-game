import type { DmgType } from '../engine/types';
import type { RunState } from '../engine/run';

/** 판을 넘어 유지되는 기록 */
export interface Meta {
  v: number;
  unlocked: string[];
  /** 도감: 적 id → 기록 */
  codex: Record<string, { seen: number; kills: number; weak: DmgType[] }>;
  essences: string[];
  relics: string[];
  runs: number;
  wins: number;
  bestAct: number;
  /** 해금된 최고 심연 단계 */
  abyss: number;
  speed: 1 | 2;
}

const KEY = 'abyss.meta';

export function defaultMeta(): Meta {
  return { v: 1, unlocked: ['soldier'], codex: {}, essences: [], relics: [], runs: 0, wins: 0, bestAct: 1, abyss: 0, speed: 1 };
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
  m.bestAct = Math.max(m.bestAct, run.act);
  if (m.bestAct >= 2 && !m.unlocked.includes('hunter')) m.unlocked.push('hunter');
  if (m.bestAct >= 3 && !m.unlocked.includes('occultist')) m.unlocked.push('occultist');
  if (ended) {
    m.runs++;
    if (run.over?.won) {
      m.wins++;
      m.abyss = Math.max(m.abyss, Math.min(15, run.asc + 1));
    }
    for (const id of Object.keys(m.codex)) if (run.seen.includes(id)) m.codex[id].seen++;
  }
}
