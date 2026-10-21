/** 전투 무대의 적 배치 — Pixi 무대(battle.ts)와 화면의 이름표·의도 표시(Combat.tsx)가 같이 쓴다. 순수 계산 (DOM·Pixi 없음) */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Anchor {
  x: number;
  /** 발 위치 */
  y: number;
  size: number;
  /** 이 적이 차지한 가로 칸 너비 (이름표 폭) */
  slot?: number;
}

/**
 * 가운데에 세울 적 (수호자, 수호자가 없으면 하나뿐인 정예). 없으면 null.
 * tierOf: 적 종류(def id) → 등급
 */
export function leadOf(list: { uid: string; def: string; dead: boolean }[], tierOf: (def: string) => string | undefined): string | null {
  const alive = list.filter((e) => !e.dead);
  const boss = alive.find((e) => tierOf(e.def) === 'boss');
  if (boss) return boss.uid;
  const elites = alive.filter((e) => tierOf(e.def) === 'elite');
  return elites.length === 1 ? elites[0].uid : null;
}

/** 가운데 선 수호자가 이름표 자리로 차지하는 몫 — 그림은 칸 전체 크기로 그리되, 양옆 적의 자리에 조금씩 걸쳐 선다 */
const LEAD_FOOT = 0.6;

/**
 * 적 배치 — 한 줄에 칸을 나눠 겹치지 않게 (DOM 오버레이와 공유).
 * 후열은 전열 사이사이에 끼워 넣고, 조금 위로 올리고 작게 그려 뒤에 있는 느낌만 준다.
 * 세로로 두 줄을 쌓으면 폰(사파리 주소창·툴바가 있는 화면)에서 이름표·의도가 서로 겹친다.
 * 이끄는 적(lead: 수호자·정예)이 있으면 그 적이 한가운데에 서고, 나머지는 오른쪽·왼쪽에 번갈아 (무게가 가벼운 쪽으로) 선다.
 * 수호자 그림은 양옆 적의 자리에 조금 걸쳐도 된다 (이름표는 겹치지 않는다) — 한쪽에만 하수인이 있어도 가운데에서 너무 작아지지 않게.
 */
export function layoutEnemies(rect: Rect, list: { uid: string; row: 0 | 1; scale: number; dead: boolean; lead?: boolean }[]): Map<string, Anchor> {
  const out = new Map<string, Anchor>();
  const alive = list.filter((e) => !e.dead);
  if (!alive.length) return out;
  const PLATE = 78; // 발밑 이름표·체력·버팀·상태 한 줄 높이 (4 + 이름 16 + 체력 11 + 버팀 16 + 상태 20 + 틈) — 모자라면 상태 아이콘이 아래 내 정보 칸을 덮는다
  const INTENT = 34; // 머리 위 의도 표시
  const HEAD = 1.25; // 형체 높이 ÷ 크기 (그림 기준)
  const feet = rect.y + rect.h - PLATE;
  const lift = Math.min(rect.h * 0.13, 46);
  const weight = (e: (typeof alive)[number]) => Math.max(0.6, e.scale) * (e.row === 1 ? 0.82 : 1);
  const usable = rect.w * 0.96;
  // slot: 그림 크기를 정하는 칸 너비, plate: 이름표가 쓰는 칸 너비 (보통 같다)
  const place = (e: (typeof alive)[number], x: number, slot: number, plate = slot) => {
    const y = feet - (e.row === 1 ? lift : 0);
    const room = (y - rect.y - INTENT) / HEAD; // 의도 표시가 화면 위로 넘치지 않을 만큼
    const base = Math.min(rect.h * 0.5, rect.w * 0.42) * Math.max(0.6, e.scale) * (e.row === 1 ? 0.84 : 1);
    const size = Math.max(36, Math.min(base, slot * 1.02, room));
    out.set(e.uid, { x, y, size, slot: plate });
  };
  const lead = alive.length > 1 ? alive.find((e) => e.lead) : undefined;
  if (lead) {
    const right: typeof alive = [];
    const left: typeof alive = [];
    let wr = 0;
    let wl = 0;
    for (const e of alive) {
      if (e === lead) continue;
      if (wr <= wl) {
        right.push(e);
        wr += weight(e);
      } else {
        left.push(e);
        wl += weight(e);
      }
    }
    const lw = weight(lead);
    const k = usable / 2 / ((lw * LEAD_FOOT) / 2 + Math.max(wl, wr));
    const cx = rect.x + rect.w / 2;
    const foot = lw * k * LEAD_FOOT;
    place(lead, cx, lw * k, foot);
    let xr = cx + foot / 2;
    for (const e of right) {
      const s = weight(e) * k;
      place(e, xr + s / 2, s);
      xr += s;
    }
    let xl = cx - foot / 2;
    for (const e of left) {
      const s = weight(e) * k;
      place(e, xl - s / 2, s);
      xl -= s;
    }
    return out;
  }
  const front = alive.filter((e) => e.row === 0);
  const back = alive.filter((e) => e.row === 1);
  // 왼쪽부터: 전열·후열을 번갈아, 남는 쪽은 뒤에 (가운데가 비지 않게 바깥 → 안쪽 순서는 그대로)
  const order: typeof alive = [];
  for (let i = 0; i < Math.max(front.length, back.length); i++) {
    if (back[i] && i % 2 === 1) order.push(back[i]);
    if (front[i]) order.push(front[i]);
    if (back[i] && i % 2 === 0) order.push(back[i]);
  }
  const weights = order.map(weight);
  const W = weights.reduce((a, b) => a + b, 0);
  const left = rect.x + (rect.w - usable) / 2;
  let acc = 0;
  order.forEach((e, i) => {
    place(e, left + ((acc + weights[i] / 2) / W) * usable, (usable / W) * weights[i]);
    acc += weights[i];
  });
  return out;
}
