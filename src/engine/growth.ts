import { AFFIXES, EQUIPS, OMENS, PACTS, RELICS } from './registry';
import { Rng, deriveSeed } from './rng';
import { gainRelic, log, type RunState } from './run';
import type { HookSelf, Hooks } from './types';

/*
 * 성장 개편 (2026-10): 느리지만 넓게.
 * 피드백: "성장이 너무 빠른데 가짓수가 적어서 4층쯤 가면 아무것도 안 먹고 건너뛴다".
 * 봇 기준 5층 시작에 유물 17개·스킬 20개(장착 7칸)·레벨 11 — 4층 시작(레벨 9)에 스킬 칸이 다 열리고, 스킬 강화는 한 번뿐이라 동나고,
 * 유물은 층과 상관없는 같은 풀에서 나왔다. 보상을 건너뛰면 아무것도 없었다.
 *
 * - 징조 (발라트로의 블라인드 건너뛰기 태그, 슬레이 더 스파이어 「노래하는 그릇」): 보상을 고르지 않고 지나치면 미리 보인 징조를 받는다.
 *   정해진 때(다음 보상·다음 전투·다음 상점·다음 야영지·다음 장비)에 한 번 이루어진다. 건너뛰기가 곧 선택이 된다
 * - 장비 접사 (디아블로·데드 셀의 무작위 접사): 장비를 얻을 때 층에 따라 접사가 붙는다 — 깊은 층의 장비일수록 많이, 3층부터 2단계 접사
 * - 계약 (하데스의 혼돈 축복): 몇 전투 동안 저주를 견디면 그 뒤로 축복이 영원히. 신전·이벤트에서
 * - 유물 진화 (뱀파이어 서바이버즈의 무기 진화): 짝이 되는 두 유물을 지니고 층 수호자를 쓰러뜨리면 둘을 내주고 진화한 유물을 얻는다
 */

export const GROWTH = {
  /** 지닐 수 있는 징조 수 */
  omenCap: 3,
  /** 장비 접사 수 기대값 (층 인덱스): 정수 부분 + 나머지는 그 확률로 하나 더 */
  affixes: [0, 0.3, 0.6, 1, 1.4, 1.8],
  /** 2단계 접사가 나오는 층 */
  affixTier2: 3,
  /** 계약: 저주가 이어지는 전투 수 (이긴 전투) */
  pactFights: 3,
};

/** 성장 개편의 난수 흐름 (판마다 하나 — 예전 저장에는 없어 처음 쓸 때 만든다) */
function growthRng(run: RunState): Rng {
  if (typeof run.rng.growth !== 'number') run.rng.growth = deriveSeed(run.seed, 'growth');
  return new Rng(run.rng, 'growth');
}

// ───────────── 징조 ─────────────

export function omensOf(run: RunState): string[] {
  return run.omens ?? [];
}

export function hasOmen(run: RunState, id: string): boolean {
  return omensOf(run).includes(id);
}

/** 징조를 이룬다: 지니고 있으면 지우고 true */
export function useOmen(run: RunState, id: string): boolean {
  const i = omensOf(run).indexOf(id);
  if (i < 0) return false;
  run.omens!.splice(i, 1);
  const d = OMENS.get(id);
  if (d) log(run, `징조가 이루어졌다: ${d.name}`);
  return true;
}

/** 징조를 얻는다 (가득 차 있으면 false) */
export function gainOmen(run: RunState, id: string): boolean {
  if (!OMENS.has(id)) return false;
  run.omens ??= [];
  if (run.omens.length >= GROWTH.omenCap) return false;
  run.omens.push(id);
  log(run, `징조를 얻었다: ${OMENS.get(id)!.name}`);
  return true;
}

/** 건너뛰면 받을 징조 하나 (보상을 만들 때 정해 미리 보여 준다). 지닌 것과 겹치지 않게 */
export function rollOmen(run: RunState): string | undefined {
  const have = new Set(omensOf(run));
  const pool = [...OMENS.keys()].filter((id) => !have.has(id));
  if (!pool.length) return undefined;
  return growthRng(run).pick(pool);
}

/** 보상의 선택을 고르지 않고 지나친다: 미리 보인 징조를 받는다. 받은 징조 id (못 받았으면 null) */
export function forgoChoice(run: RunState): string | null {
  const rw = run.reward;
  if (!rw?.choice?.length || rw.chosen || !rw.omen) return null;
  rw.chosen = true;
  return gainOmen(run, rw.omen) ? rw.omen : null;
}

/**
 * 화면을 그릴 때 써도 판이 바뀌지 않는 난수 (이 층·이 방에서 늘 같은 값) — 이벤트의 후보처럼 볼 때마다 같아야 하는 것.
 * 판의 난수 상자를 건드리지 않는다 (tests/exploit-economy: 이벤트 화면을 다시 그려도 판이 바뀌지 않는다)
 */
export function placeRng(run: RunState, key: string): Rng {
  return new Rng({ s: deriveSeed(run.seed, `${key}:${run.act}:${run.floor?.pos ?? -1}`) }, 's');
}

// ───────────── 장비 접사 ─────────────

/** 이 장비에 붙일 접사 (층에 따라 개수, 3층부터 2단계). extra: 대장장이의 징조 등으로 하나 더 */
export function rollAffixes(run: RunState, equipId: string, extra = 0): string[] {
  const def = EQUIPS.get(equipId);
  if (!def || def.rarity === 'basic' || def.rarity === 'genesis') return [];
  const r = growthRng(run);
  const act = Math.min(5, Math.max(1, run.act));
  const want = GROWTH.affixes[act] ?? 0;
  let n = Math.floor(want) + (r.chance(want - Math.floor(want)) ? 1 : 0) + extra;
  const out: string[] = [];
  while (n-- > 0) {
    const pool = [...AFFIXES.values()].filter((a) => !out.includes(a.id) && (a.tier === 1 || act >= GROWTH.affixTier2) && (!a.slots || a.slots.includes(def.slot)));
    if (!pool.length) break;
    out.push(r.pick(pool).id);
  }
  return out;
}

/** 이미 붙은 접사에 n개를 더한다 (대장장이의 징조·재련) */
export function moreAffixes(run: RunState, equipId: string, have: string[], n: number): string[] {
  const def = EQUIPS.get(equipId);
  if (!def || n <= 0) return have;
  const r = growthRng(run);
  const act = Math.min(5, Math.max(1, run.act));
  const out = [...have];
  for (let i = 0; i < n; i++) {
    const pool = [...AFFIXES.values()].filter((a) => !out.includes(a.id) && (a.tier === 1 || act >= GROWTH.affixTier2) && (!a.slots || a.slots.includes(def.slot)));
    if (!pool.length) break;
    out.push(r.pick(pool).id);
  }
  return out;
}

/** 장착한 장비의 접사 훅 */
export function* affixHooks(run: RunState): Generator<[Hooks, HookSelf]> {
  for (const slot of ['weapon', 'armor', 'trinket1', 'trinket2'] as const) {
    const it = run.equip[slot];
    for (const id of it?.aff ?? []) {
      const d = AFFIXES.get(id);
      if (d?.hooks) yield [d.hooks, { kind: 'affix', id, unit: run.player, n: it!.lvl }];
    }
  }
}

/** '날선 · 굳센 사냥칼' */
export function equipName(it: { id: string; aff?: string[] }): string {
  const name = EQUIPS.get(it.id)?.name ?? it.id;
  const pre = (it.aff ?? []).map((a) => AFFIXES.get(a)?.name).filter(Boolean);
  return pre.length ? `${pre.join(' · ')} ${name}` : name;
}

// ───────────── 계약 ─────────────

/** 계약 후보 n개 (저주와 축복의 짝 — 같은 저주·축복이 두 번 나오지 않게, 이미 맺은 축복은 빼고). r: 쓸 난수 (없으면 판의 성장 흐름) */
export function rollPacts(run: RunState, n: number, r: Rng = growthRng(run)): { curse: string; boon: string }[] {
  const taken = new Set((run.pacts ?? []).map((p) => p.boon));
  const curses = r.shuffle([...PACTS.values()].filter((p) => p.kind === 'curse').map((p) => p.id));
  const boons = r.shuffle([...PACTS.values()].filter((p) => p.kind === 'boon' && !taken.has(p.id)).map((p) => p.id));
  const out: { curse: string; boon: string }[] = [];
  for (let i = 0; i < n && i < curses.length && i < boons.length; i++) out.push({ curse: curses[i], boon: boons[i] });
  return out;
}

/** 계약을 맺는다: 저주가 GROWTH.pactFights전투 동안, 그 뒤로 축복 */
export function acceptPact(run: RunState, curse: string, boon: string): string | null {
  const c = PACTS.get(curse);
  const b = PACTS.get(boon);
  if (c?.kind !== 'curse' || b?.kind !== 'boon') return '그런 계약은 없다';
  if ((run.pacts ?? []).some((p) => p.boon === boon)) return '이미 맺은 계약이다';
  run.pacts ??= [];
  run.pacts.push({ curse, boon, left: GROWTH.pactFights });
  log(run, `계약을 맺었다: ${c.name} → ${b.name}`);
  return null;
}

/** 계약의 훅: 남은 저주, 이루어진 축복 */
export function* pactHooks(run: RunState): Generator<[Hooks, HookSelf]> {
  for (const pc of run.pacts ?? []) {
    const d = PACTS.get(pc.left > 0 ? pc.curse : pc.boon);
    if (d?.hooks) yield [d.hooks, { kind: 'pact', id: d.id, unit: run.player, n: 1 }];
  }
}

/** 전투에서 이겼다: 저주가 하나씩 줄고, 다 견디면 축복이 이루어진다 */
export function tickPacts(run: RunState) {
  for (const pc of run.pacts ?? []) {
    if (pc.left <= 0) continue;
    pc.left--;
    if (pc.left === 0) {
      const b = PACTS.get(pc.boon);
      b?.onGain?.(run);
      log(run, `계약이 이루어졌다: ${b?.name ?? pc.boon}`);
    }
  }
}

/** 신전의 계약 (신전마다 한 번, 몇 번을 다시 열어도 같은 둘) */
export function shrinePacts(run: RunState): { curse: string; boon: string }[] | string {
  const f = run.floor;
  if (!f) return '제단이 없다';
  const key = `pact${f.pos}`;
  if (f.vars[key]) return '이미 계약을 맺었다';
  f.offers ??= {};
  const saved = (f.offers[key] ??= rollPacts(run, 2).map((p) => `${p.curse}|${p.boon}`));
  const out = saved.map((x) => {
    const [curse, boon] = x.split('|');
    return { curse, boon };
  });
  return out.length ? out : '제단이 응답하지 않는다';
}

/** 신전에서 계약을 맺는다 (idx: shrinePacts의 순서) */
export function signShrinePact(run: RunState, idx: number): string | null {
  const offers = shrinePacts(run);
  if (typeof offers === 'string') return offers;
  const o = offers[idx];
  if (!o) return '그런 계약은 없다';
  const why = acceptPact(run, o.curse, o.boon);
  if (why) return why;
  run.floor!.vars[`pact${run.floor!.pos}`] = 1;
  return null;
}

// ───────────── 유물 진화 ─────────────

/** 지금 진화할 수 있는 유물 id (짝이 되는 두 유물을 지녔고, 아직 진화한 것을 갖지 않았다) */
export function evolutionsReady(run: RunState): string[] {
  const owned = new Set(run.relics.map((r) => r.id));
  return [...RELICS.values()].filter((d) => d.evolve && !owned.has(d.id) && d.evolve.every((x) => owned.has(x))).map((d) => d.id);
}

/** 진화: 두 유물을 내주고 진화한 유물을 얻는다 */
export function evolveRelic(run: RunState, id: string): string | null {
  const d = RELICS.get(id);
  if (!d?.evolve) return '진화할 수 없다';
  if (!evolutionsReady(run).includes(id)) return '짝이 되는 유물이 없다';
  run.relics = run.relics.filter((r) => !d.evolve!.includes(r.id));
  gainRelic(run, id);
  log(run, `유물이 진화했다: ${d.name}`);
  return null;
}
