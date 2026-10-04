import { EVENTS, need, type EventChoice } from './registry';
import { startCombat, type LootItem, type RunState } from './run';

export interface EventState {
  id: string;
  stage: string;
  vars: Record<string, number>;
  /** 마지막 선택의 결과 문장 */
  result: string | null;
  /** 끝났으면 '계속' 버튼만 */
  done: boolean;
  /** 끝난 뒤 이어질 전투 */
  fight?: string;
  /** 끝난 뒤 받을 보상 */
  loot?: LootItem[];
}

export function startEvent(run: RunState, id: string) {
  need(EVENTS, id, '이벤트');
  run.event = { id, stage: 'start', vars: {}, result: null, done: false };
  run.screen = 'event';
}

export function eventView(run: RunState): { title: string; icon: string; text: string; choices: EventChoice[] } | null {
  const ev = run.event;
  if (!ev) return null;
  const def = need(EVENTS, ev.id, '이벤트');
  const stage = def.stages[ev.stage] ?? def.stages.start;
  const view = stage(run, ev);
  return { title: def.title, icon: def.icon, text: ev.done && ev.result ? ev.result : view.text, choices: ev.done ? [] : view.choices };
}

export function chooseEvent(run: RunState, idx: number): string | null {
  const ev = run.event;
  const view = eventView(run);
  if (!ev || !view) return '이벤트가 없다';
  const ch = view.choices[idx];
  if (!ch) return '잘못된 선택';
  if (ch.disabled) return ch.disabled;
  ev.result = null;
  ch.go(run, ev);
  return null;
}

/** '계속' — 전투나 보상으로 이어지거나 던전으로 */
export function leaveEvent(run: RunState) {
  const ev = run.event;
  run.event = null;
  if (run.over) return;
  if (ev?.fight) {
    startCombat(run, ev.fight);
    return;
  }
  if (ev?.loot?.length) {
    run.reward = { source: 'event', gold: 0, xp: 0, items: ev.loot, choice: null, chosen: true, next: 'dungeon' };
    run.screen = 'reward';
    return;
  }
  run.screen = 'dungeon';
}

// ── 콘텐츠용 헬퍼 ──

export function goto(ev: EventState, stage: string) {
  ev.stage = stage;
}

export function finish(ev: EventState, text: string, opts: { fight?: string; loot?: LootItem[] } = {}) {
  ev.done = true;
  ev.result = text;
  if (opts.fight) ev.fight = opts.fight;
  if (opts.loot) ev.loot = opts.loot;
}
