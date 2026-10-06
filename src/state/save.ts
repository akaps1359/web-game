import { SAVE_VERSION, type RunState } from '../engine/run';

const KEY = 'abyss.run';

/** 마지막으로 저장한 때 (실제 플레이 시간 누적용) */
let lastTick = 0;
/** 이 이상 아무것도 안 한 시간은 플레이 시간에 넣지 않는다 (자리를 비웠거나 며칠 뒤 이어하기) */
const IDLE_MS = 3 * 60_000;

export function saveRun(run: RunState | null) {
  const now = Date.now();
  if (run) {
    const dt = now - lastTick;
    if (lastTick && dt > 0 && dt < IDLE_MS) run.stats.playMs = (run.stats.playMs ?? 0) + dt;
  }
  lastTick = now;
  try {
    if (!run || run.over) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    /* 저장 실패는 무시 (사파리 개인정보 보호 모드 등) */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== SAVE_VERSION) return null;
    run.knownWeak ??= {};
    return run;
  } catch {
    return null;
  }
}

/** 이어할 수 있는 판이 있는지 (저장 형식이 바뀐 옛 판은 없는 것으로 친다 — '이어하기'가 헛돌지 않게) */
export function hasSave(): boolean {
  return loadRun() !== null;
}
