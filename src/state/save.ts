import { SAVE_VERSION, type RunState } from '../engine/run';

const KEY = 'abyss.run';

export function saveRun(run: RunState | null) {
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
