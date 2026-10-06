import { Combat } from '../engine/combat';
import { CONSUMABLES, SKILLS } from '../engine/registry';
import {
  chooseLoot,
  finishCombat,
  newRun,
  takeLoot,
  bottleEssence,
  type RunState,
  type LootItem,
} from '../engine/run';
import { closeReward, enterRift, moveTo, startGuardian } from '../engine/dungeon';
import { chooseEvent, leaveEvent } from '../engine/events';
import { endRun, takeBeginEvents } from '../engine/run';
import { play, syncBattle } from '../director';
import { stage } from '../render/stage';
import { sound } from '../sound';
import { absorbRun, knownWeak, saveMeta } from './meta';
import { essenceCap } from '../engine/run';
import { tipOnce } from '../ui/tips';
import { loadRun, saveRun } from './save';
import { store } from './store';
import { pausePrefetch, prefetchFloor } from './prefetch';

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
      // 조우 id = 곡의 씨앗 (수호자·정예·영주마다 주제와 악기 조합이 다르다)
      if (enc.startsWith('lord')) sound.music('lord', act, enc);
      else if (r.rift) sound.music('rift', act);
      else if (cs?.kind === 'boss') sound.music('boss', act, enc);
      else if (cs?.kind === 'elite') sound.music('elite', act, enc);
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
    stage.setAct(Math.min(5, r.act), r.screen === 'haven' ? 'haven' : undefined);
    stage.setSanity(r.player.sanity);
    sound.sanity(r.player.sanity);
    stage.setDarkness(r.screen === 'dungeon' ? Math.max(0, (50 - r.light) / 50) : 0);
    // 지도에서 노는 동안 곧 만날 적 그림·음악을 미리 받아 둔다 (전투 중에는 쉰다)
    pausePrefetch(r.screen === 'combat');
    if (r.screen === 'dungeon') prefetchFloor(r);
  } else stage.setAct(0);

  if (r?.screen === 'combat' && r.combat) {
    if (!store.combat || store.combat.s !== r.combat) {
      store.combat = new Combat(r);
      store.combat.events.push(...takeBeginEvents(r));
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
    // 음악 긴장도: 체력이 낮거나 수호자가 반쯤 쓰러졌을 때
    if (store.combat && !store.combat.over) {
      const c = store.combat;
      const boss = c.alive.find((e) => c.defOf(e).tier === 'boss');
      const low = Math.max(0, 1 - c.p.hp / c.p.maxHp);
      sound.intensity(Math.min(1, low * 0.6 + (boss && boss.hp < boss.maxHp / 2 ? 0.4 : 0)));
    }
    if (store.combat?.over) await combatOver();
    else tips();
  } else {
    if (store.combat) {
      store.combat = null;
      stage.showBattle(false);
    }
    music();
    if (r) saveRun(r);
    if (r?.over) endOfRun();
    store.emit();
    tips();
  }
}

async function combatOver() {
  const r = run();
  const won = r.combat?.phase === 'victory';
  const lv = r.player.level;
  const slots = r.slots.length;
  const cap = essenceCap(r);
  finishCombat(r);
  store.combat = null;
  stage.showBattle(false);
  store.sel = null;
  if (won) {
    absorbRun(store.meta, r, false);
    saveMeta(store.meta);
    if (r.player.level > lv) {
      sound.sfx('levelUp');
      store.toast(`레벨 ${r.player.level}!`, 'good', 3000);
      if (r.slots.length > slots) store.toast('스킬 슬롯 +1', 'good', 3000);
    }
    // 층 수호자를 쓰러뜨리면 정수 자리가 하나 는다
    if (essenceCap(r) > cap) store.toast(`정수 자리 +1 (${essenceCap(r)}자리)`, 'eldritch', 3000);
  }
  await refresh();
}

function tips() {
  const r = store.run;
  if (!r) return;
  if (r.screen === 'dungeon') {
    tipOnce('dungeon');
    if (r.light < 25) tipOnce('dark');
    if (r.player.sanity < 40) tipOnce('sanity');
  } else if (r.screen === 'combat') {
    tipOnce('combat');
    if ((r.player.st.dying ?? 0) > 0) tipOnce('dying');
  } else if (r.screen === 'reward' && r.reward?.items.some((i) => i.kind === 'essence')) tipOnce('essence');
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

/** 전투 중 선택지를 고른다 */
export async function pickChoice(option: string) {
  const c = store.combat;
  if (!c || store.busy) return;
  store.sel = null;
  if (fail(c.choose(option))) return;
  sound.sfx('sting');
  await refresh();
}

// ───────────── 보상 ─────────────

/** pick: 수호자 정수와 함께 배울 기술 (null이면 기술 없이) · replace: 정수 자리가 꽉 찼을 때 깨뜨릴 정수 */
export async function take(item: LootItem, pick: string | null = null, replace: string | null = null) {
  const r = run();
  if (fail(takeLoot(r, item, pick, replace))) return;
  sound.sfx(item.kind === 'essence' ? 'essence' : item.kind === 'gold' ? 'coin' : 'select');
  if (item.kind === 'essence') store.toast(`${replace ? '정수를 깨뜨리고 새 정수를 흡수했다' : '정수를 흡수했다'}${pick ? ` — 기술: ${SKILLS.get(pick)?.name ?? ''}` : ''}`, 'eldritch');
  await refresh();
}

/** 떨어진 정수를 병에 담는다 (나중에 신전에서 골드를 내고 새긴다) */
export async function bottle(item: LootItem) {
  const r = run();
  if (fail(bottleEssence(r, item))) return;
  sound.sfx('select');
  store.toast('정수를 병에 담았다', 'eldritch');
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
  const next = r.reward?.next;
  // 보상 화면이 아니면(두 번 눌림 등) 아무것도 하지 않는다
  if (!closeReward(r)) return;
  if (next === 'haven') sound.sfx('portal');
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
