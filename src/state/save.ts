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

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
