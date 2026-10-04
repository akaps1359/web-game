import { Combat } from '../engine/combat';
import { CONSUMABLES } from '../engine/registry';
import {
  chooseLoot,
  finishCombat,
  newRun,
  takeLoot,
  type RunState,
  type LootItem,
} from '../engine/run';
import { continueRift, enterRift, goHaven, moveTo, startGuardian } from '../engine/dungeon';
import { chooseEvent, leaveEvent } from '../engine/events';
import { endRun } from '../engine/run';
import { play, syncBattle } from '../director';
import { stage } from '../render/stage';
import { sound } from '../sound';
import { absorbRun, knownWeak, saveMeta } from './meta';
import { loadRun, saveRun } from './save';
import { store } from './store';

function run(): RunState {
  if (!store.run) throw new Error('진행 중인 판이 없습니다');
  return store.run;
}

/** 화면에 맞는 음악 */
function music() {
  const r = store.run;
  if (!r) {
    sound.music('title');
    return;
  }
  const act = Math.min(5, r.act);
  switch (r.screen) {
    case 'combat': {
      const cs = r.combat;
      const enc = cs?.enc ?? '';
      if (enc.startsWith('lord')) sound.music('lord', act);
      else if (r.rift) sound.music('rift', act);
      else if (cs?.kind === 'boss') sound.music('boss', act);
      else if (cs?.kind === 'elite') sound.music('elite', act);
      else sound.music('combat', act);
      break;
    }
    case 'event':
      sound.music('event', act);
      break;
    case 'merchant':
      sound.music('merchant', act);
      break;
    case 'camp':
      sound.music('camp', act);
      break;
    case 'shrine':
      sound.music('event', act);
      break;
    case 'haven':
      sound.music('haven', act);
      break;
    case 'gameover':
      sound.music('defeat', act);
      break;
    case 'victory':
      sound.music('victory', act);
      break;
    case 'reward':
      break;
    default:
      sound.music('explore', act);
  }
}

/** 상태 변경 후 공통 처리: 전투 연결, 연출, 저장 */
export async function refresh() {
  const r = store.run;
  if (r) {
    stage.setAct(Math.min(5, r.act));
    stage.setSanity(r.player.sanity);
    sound.sanity(r.player.sanity);
    stage.setDarkness(r.screen === 'dungeon' ? Math.max(0, (50 - r.light) / 50) : 0);
  } else stage.setAct(0);

  if (r?.screen === 'combat' && r.combat) {
    if (!store.combat || store.combat.s !== r.combat) {
      store.combat = new Combat(r);
      store.sel = null;
      store.focus = null;
      stage.showBattle(true);
      syncBattle(null);
    }
    music();
    saveRun(r);
    store.emit();
    const evs = store.combat.drain();
    await play(evs);
    if (store.combat?.over) await combatOver();
  } else {
    if (store.combat) {
      store.combat = null;
      stage.showBattle(false);
    }
    music();
    if (r) saveRun(r);
    if (r?.over) endOfRun();
    store.emit();
  }
}

async function combatOver() {
  const r = run();
  const won = r.combat?.phase === 'victory';
  finishCombat(r);
  store.combat = null;
  stage.showBattle(false);
  store.sel = null;
  if (won) {
    absorbRun(store.meta, r, false);
    saveMeta(store.meta);
  }
  await refresh();
}

function endOfRun() {
  const r = store.run;
  if (!r?.over || (r as RunState & { _metaDone?: boolean })._metaDone) return;
  (r as RunState & { _metaDone?: boolean })._metaDone = true;
  absorbRun(store.meta, r, true);
  saveMeta(store.meta);
  saveRun(null);
}

function fail(why: string | null): boolean {
  if (why) {
    store.toast(why, 'bad');
    sound.sfx('error');
    return true;
  }
  return false;
}

// ───────────── 시작 ─────────────

export async function newGame(origin: string, asc = 0) {
  store.run = newRun({ origin, asc, knownWeak: knownWeak(store.meta) });
  store.sheet = null;
  await refresh();
}

export async function continueGame() {
  const r = loadRun();
  if (!r) {
    store.toast('저장된 판이 없습니다', 'bad');
    return;
  }
  store.run = r;
  await refresh();
}

export async function toTitle() {
  if (store.run && !store.run.over) saveRun(store.run);
  store.run = null;
  store.combat = null;
  store.sheet = null;
  stage.showBattle(false);
  await refresh();
}

export async function abandonRun() {
  const r = store.run;
  if (!r) return;
  endRun(r, false, '심연에서 등을 돌렸다');
  await refresh();
}

// ───────────── 던전 ─────────────

export async function move(room: number) {
  if (store.busy) return;
  const r = run();
  const before = r.screen;
  if (fail(moveTo(r, room))) return;
  sound.sfx('footstep');
  if (before === 'dungeon' && r.screen !== 'dungeon') sound.sfx('door', { volume: 0.6 });
  await refresh();
}

export async function fightGuardian() {
  if (fail(startGuardian(run()))) return;
  sound.sfx('portal');
  await refresh();
}

export async function riftEnter() {
  if (fail(enterRift(run()))) return;
  sound.sfx('riftOpen');
  await refresh();
}

// ───────────── 전투 ─────────────

export async function useSkill(ref: string, target?: string | null) {
  const c = store.combat;
  if (!c || store.busy) return;
  const why = c.useSkill(ref, target ?? store.focus);
  if (fail(why)) return;
  store.sel = null;
  await refresh();
}

export async function useItem(idx: number, target?: string | null) {
  const r = run();
  const id = r.consumables[idx];
  if (!id) return;
  const def = CONSUMABLES.get(id);
  if (!def) return;
  if (store.combat) {
    if (store.busy) return;
    if (fail(store.combat.useConsumable(idx, target ?? store.focus))) return;
    store.sel = null;
    await refresh();
    return;
  }
  if (def.combat) {
    store.toast('전투 중에만 쓸 수 있다', 'bad');
    return;
  }
  r.consumables[idx] = null;
  def.use(r, null, null);
  store.toast(`${def.name} 사용`, 'good');
  sound.sfx('heal');
  await refresh();
}

export async function endTurn() {
  const c = store.combat;
  if (!c || store.busy) return;
  store.sel = null;
  if (fail(c.endTurn())) return;
  await refresh();
}

// ───────────── 보상 ─────────────

export async function take(item: LootItem) {
  const r = run();
  if (fail(takeLoot(r, item))) return;
  sound.sfx(item.kind === 'essence' ? 'essence' : item.kind === 'gold' ? 'coin' : 'select');
  if (item.kind === 'essence') store.toast('정수를 흡수했다', 'eldritch');
  await refresh();
}

export async function choose(idx: number, upgradeTarget?: string) {
  const r = run();
  if (fail(chooseLoot(r, idx, upgradeTarget))) return;
  sound.sfx('select');
  await refresh();
}

export async function leaveReward() {
  const r = run();
  const rw = r.reward;
  r.reward = null;
  switch (rw?.next) {
    case 'rift':
      continueRift(r);
      break;
    case 'haven':
      goHaven(r);
      sound.sfx('portal');
      break;
    case 'final':
      endRun(r, true, '잠든 자를 다시 잠재웠다');
      break;
    default:
      r.screen = 'dungeon';
  }
  await refresh();
}

// ───────────── 이벤트 ─────────────

export async function eventChoose(idx: number) {
  const r = run();
  if (fail(chooseEvent(r, idx))) return;
  sound.sfx('select');
  await refresh();
}

export async function eventLeave() {
  leaveEvent(run());
  await refresh();
}

/** 단순 상태 변경 (장비/스킬 관리 등) 후 저장 */
export async function apply(fn: (r: RunState) => string | null | void, okMsg?: string) {
  const r = run();
  const why = fn(r);
  if (typeof why === 'string' && fail(why)) return;
  if (okMsg) store.toast(okMsg, 'good');
  sound.sfx('select', { volume: 0.6 });
  await refresh();
}
