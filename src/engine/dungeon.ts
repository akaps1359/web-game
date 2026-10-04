import { ENCOUNTERS, EVENTS, FLOORS, type FloorSignal } from './registry';
import {
  endRun,
  log,
  loseSanityRun,
  rng,
  startCombat,
  type RewardState,
  type RunState,
  rollConsumable,
  rollRelic,
  rollEquip,
} from './run';
import { startEvent } from './events';
import { openShop, type ShopState } from './shop';
import type { EncounterDef } from './types';

export type RoomType = 'start' | 'combat' | 'elite' | 'treasure' | 'event' | 'camp' | 'merchant' | 'shrine' | 'portal' | 'empty' | 'lord';

export interface Room {
  id: number;
  x: number;
  y: number;
  type: RoomType;
  links: number[];
  /** 지도에 드러남 */
  seen: boolean;
  /** 내용이 보임 */
  scouted: boolean;
  visited: boolean;
  /** 내용 소모됨 */
  cleared: boolean;
  enc?: string;
  event?: string;
  zone?: number;
  flooded?: boolean;
  inverted?: boolean;
  /** 이 시각이 되면 유성 낙하 */
  meteor?: number;
  rift?: boolean;
}

export interface FloorState {
  act: number;
  w: number;
  h: number;
  rooms: Room[];
  pos: number;
  start: number;
  portal: number;
  hours: number;
  tide: number;
  rifts: number;
  lord: { progress: number; warned: number; room: number; defeated: boolean };
  stalker: { room: number; active: boolean; beaten: number } | null;
  fights: number;
  recentEnc: string[];
  bossEnc: string;
  /** 층별 법칙 변수 */
  vars: Record<string, number>;
  shops?: Record<string, ShopState>;
}

export const GRID_W = 7;
export const GRID_H = 9;
export const LIGHT_PER_MOVE = 8;
export const HOURS_PER_TIDE = 12;

// ───────────── 생성 ─────────────

export function generateFloor(run: RunState, act: number): FloorState {
  if (act >= 5) return finalFloor(run);
  const r = rng(run, 'map');
  for (let attempt = 0; ; attempt++) {
    const target = r.int(22, 27) + (act >= 3 ? 2 : 0);
    const rooms: Room[] = [];
    const at = new Map<string, number>();
    const key = (x: number, y: number) => `${x},${y}`;
    const add = (x: number, y: number) => {
      const room: Room = { id: rooms.length, x, y, type: 'empty', links: [], seen: false, scouted: false, visited: false, cleared: false };
      rooms.push(room);
      at.set(key(x, y), room.id);
      return room;
    };
    const link = (a: Room, b: Room) => {
      if (!a.links.includes(b.id)) a.links.push(b.id);
      if (!b.links.includes(a.id)) b.links.push(a.id);
    };
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const free = (room: Room) =>
      dirs
        .map(([dx, dy]) => [room.x + dx, room.y + dy])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !at.has(key(x, y)));

    const start = add(r.int(0, GRID_W - 1), r.int(0, GRID_H - 1));
    while (rooms.length < target) {
      const growable = rooms.filter((x) => free(x).length > 0);
      if (!growable.length) break;
      // 가지가 적은 방을 선호 → 복도형 구조
      const from = r.weighted(growable, (x) => (x.links.length <= 1 ? 3 : x.links.length === 2 ? 1.5 : 0.6));
      const [nx, ny] = r.pick(free(from));
      link(from, add(nx, ny));
    }
    // 고리 추가
    for (const a of rooms) {
      for (const [dx, dy] of dirs) {
        const bi = at.get(key(a.x + dx, a.y + dy));
        if (bi === undefined || a.links.includes(bi)) continue;
        if (r.chance(0.1)) link(a, rooms[bi]);
      }
    }
    const dist = bfs(rooms, start.id);
    const maxD = Math.max(...dist);
    if (maxD < 6 && attempt < 20) continue;

    const f: FloorState = {
      act,
      w: GRID_W,
      h: GRID_H,
      rooms,
      pos: start.id,
      start: start.id,
      portal: -1,
      hours: 0,
      tide: 0,
      rifts: 0,
      lord: { progress: 0, warned: 0, room: -1, defeated: false },
      stalker: null,
      fights: 0,
      recentEnc: [],
      bossEnc: '',
      vars: {},
    };
    assignRooms(run, f, dist);
    start.type = 'start';
    start.cleared = true;
    const bosses = ENCOUNTERS.filter((e) => e.act === act && e.kind === 'boss' && !e.id.startsWith('lord'));
    f.bossEnc = bosses.length ? r.pick(bosses).id : '';
    reveal(run, f, start.id);
    if (run.relics.some((x) => x.id === 'rusty-compass')) {
      const portalRoom = f.rooms[f.portal];
      portalRoom.seen = portalRoom.scouted = true;
    }
    return f;
  }
}

function bfs(rooms: Room[], from: number): number[] {
  const d = rooms.map(() => Infinity);
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of rooms[cur].links) {
      if (d[n] === Infinity) {
        d[n] = d[cur] + 1;
        q.push(n);
      }
    }
  }
  return d;
}

export function distances(f: FloorState, from: number): number[] {
  return bfs(f.rooms, from);
}

function assignRooms(run: RunState, f: FloorState, dist: number[]) {
  const r = rng(run, 'map');
  const rooms = f.rooms;
  const maxD = Math.max(...dist);
  const open = new Set(rooms.map((x) => x.id).filter((id) => id !== f.start));
  const take = (filter: (x: typeof rooms[number]) => boolean, prefer?: (x: typeof rooms[number]) => number) => {
    let cands = [...open].map((id) => rooms[id]).filter(filter);
    if (!cands.length) cands = [...open].map((id) => rooms[id]);
    if (!cands.length) return null;
    const pick = prefer ? r.weighted(cands, prefer) : r.pick(cands);
    open.delete(pick.id);
    return pick;
  };

  // 포탈: 가장 먼 곳 근처
  const portal = take((x) => dist[x.id] >= maxD - 1, (x) => (dist[x.id] === maxD ? 3 : 1))!;
  portal.type = 'portal';
  f.portal = portal.id;

  const elites = f.act >= 3 ? 3 : 2;
  for (let i = 0; i < elites; i++) {
    const room = take((x) => dist[x.id] >= 3 && !x.links.some((l) => rooms[l].type === 'elite'));
    if (room) room.type = 'elite';
  }
  const midLo = Math.floor(maxD * 0.35);
  const midHi = Math.ceil(maxD * 0.65);
  const camp1 = take((x) => dist[x.id] >= midLo && dist[x.id] <= midHi);
  if (camp1) camp1.type = 'camp';
  const camp2 = take((x) => dist[x.id] >= maxD - 3 && x.links.length > 0);
  if (camp2) camp2.type = 'camp';
  const merchant = take((x) => dist[x.id] >= 2);
  if (merchant) merchant.type = 'merchant';
  const shrine = take((x) => dist[x.id] >= 3);
  if (shrine) shrine.type = 'shrine';
  const treasures = rooms.length >= 26 ? 3 : 2;
  for (let i = 0; i < treasures; i++) {
    const room = take((x) => dist[x.id] >= 2, (x) => (x.links.length === 1 ? 4 : 1));
    if (room) room.type = 'treasure';
  }
  for (let i = 0; i < 5; i++) {
    const room = take((x) => dist[x.id] >= 1);
    if (room) room.type = 'event';
  }
  const rest = [...open];
  const combats = Math.round(rest.length * 0.72);
  r.shuffle(rest);
  rest.forEach((id, i) => {
    rooms[id].type = i < combats ? 'combat' : 'empty';
  });

  // 구역 (1층 법칙 등)
  const zones = FLOORS.get(f.act)?.zones?.length ?? 0;
  if (zones > 0) {
    const cx = (GRID_W - 1) / 2;
    const cy = (GRID_H - 1) / 2;
    for (const room of rooms) {
      const ang = Math.atan2(room.y - cy, room.x - cx);
      room.zone = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * zones) % zones;
    }
  }
  // 이벤트 배정
  const evPool = [...EVENTS.values()].filter((e) => e.acts.includes(f.act) && (!e.when || e.when(run)));
  const used = new Set<string>();
  for (const room of rooms.filter((x) => x.type === 'event')) {
    const cands = evPool.filter((e) => !used.has(e.id));
    if (!cands.length) {
      room.type = 'combat';
      continue;
    }
    const ev = r.weighted(cands, (e) => e.weight ?? 1);
    used.add(ev.id);
    room.event = ev.id;
  }
}

/** 최종층: 일직선 */
function finalFloor(run: RunState): FloorState {
  const rooms: Room[] = [];
  const types: Room['type'][] = ['start', 'event', 'camp', 'elite', 'camp', 'portal'];
  types.forEach((type, i) => {
    rooms.push({
      id: i,
      x: 3,
      y: GRID_H - 1 - Math.min(GRID_H - 1, Math.round(i * 1.6)),
      type,
      links: [],
      seen: false,
      scouted: false,
      visited: false,
      cleared: type === 'start',
    });
  });
  for (let i = 0; i < rooms.length - 1; i++) {
    rooms[i].links.push(i + 1);
    rooms[i + 1].links.push(i);
  }
  const evs = [...EVENTS.values()].filter((e) => e.acts.includes(5));
  if (evs.length) rooms[1].event = rng(run, 'map').pick(evs).id;
  else rooms[1].type = 'empty';
  const f: FloorState = {
    act: 5,
    w: GRID_W,
    h: GRID_H,
    rooms,
    pos: 0,
    start: 0,
    portal: rooms.length - 1,
    hours: 0,
    tide: 0,
    rifts: 0,
    lord: { progress: 0, warned: 0, room: -1, defeated: false },
    stalker: null,
    fights: 0,
    recentEnc: [],
    bossEnc: ENCOUNTERS.find((e) => e.act === 5 && e.kind === 'boss')?.id ?? '',
    vars: {},
  };
  for (const room of rooms) room.seen = room.scouted = true;
  reveal(run, f, 0);
  return f;
}

// ───────────── 시야 ─────────────

function needsEnc(room: Room) {
  return room.type === 'combat' || room.type === 'elite';
}

export function reveal(run: RunState, f: FloorState, id: number) {
  const r = rng(run, 'map');
  const room = f.rooms[id];
  room.seen = room.visited = room.scouted = true;
  if (needsEnc(room) && !room.enc) room.enc = pickEncounter(run, f, room);
  for (const n of room.links) {
    const nr = f.rooms[n];
    nr.seen = true;
    if (!nr.scouted) {
      if (run.light >= 75) nr.scouted = true;
      else if (run.light >= 25 && r.chance(0.5)) nr.scouted = true;
    }
    if (nr.scouted && needsEnc(nr) && !nr.enc) nr.enc = pickEncounter(run, f, nr);
  }
  // 포탈 비석의 울림
  const portal = f.rooms[f.portal];
  if (portal && !portal.seen && distances(f, id)[f.portal] <= 2) {
    portal.seen = portal.scouted = true;
    log(run, '포탈 비석의 울림이 느껴진다');
  }
}

export function pickEncounter(run: RunState, f: FloorState, room: Room): string {
  const r = rng(run, 'map');
  const kind = room.type === 'elite' ? 'elite' : 'normal';
  let pool = ENCOUNTERS.filter((e) => e.act === f.act && e.kind === kind && !e.id.startsWith('rift') && !e.id.startsWith('stalker'));
  if (kind === 'normal') {
    const early = pool.filter((e) => e.early);
    pool = f.fights < 3 && early.length ? early : pool.filter((e) => !e.early || f.fights >= 6);
  }
  const zones = FLOORS.get(f.act)?.zones;
  const zoneTag = zones && room.zone !== undefined ? zones[room.zone]?.tag : undefined;
  const fresh = pool.filter((e) => !f.recentEnc.includes(e.id));
  if (fresh.length) pool = fresh;
  if (!pool.length) return ENCOUNTERS.find((e) => e.act === f.act)?.id ?? '';
  const pick = r.weighted(pool, (e) => (e.weight ?? 1) * (zoneTag && e.zone === zoneTag ? 4 : 1));
  f.fights++;
  f.recentEnc.push(pick.id);
  if (f.recentEnc.length > 3) f.recentEnc.shift();
  return pick.id;
}

// ───────────── 이동 ─────────────

export function moveBlock(run: RunState, to: number): string | null {
  const f = run.floor;
  if (!f) return '층이 없다';
  if (run.screen !== 'dungeon') return '지금은 이동할 수 없다';
  if (run.rift) return '균열 안에서는 이동할 수 없다';
  if (!f.rooms[f.pos].links.includes(to)) return '연결되지 않은 방';
  return null;
}

export function moveTo(run: RunState, to: number): string | null {
  const why = moveBlock(run, to);
  if (why) return why;
  const f = run.floor!;
  const dest = f.rooms[to];
  const cost = dest.flooded ? 2 : 1;
  advanceTime(run, cost);
  if (run.over) return null;
  run.light = Math.max(0, run.light - lightCost(run));
  if (run.light < 25) {
    const res = loseSanityRun(run, 2);
    if (res.madness) log(run, '어둠이 정신을 갉아먹는다… 광기에 사로잡혔다');
    if (run.over) return null;
  }
  f.pos = to;
  run.stats.rooms++;
  reveal(run, f, to);
  floorSignal(run, { t: 'move', room: to });
  FLOORS.get(f.act)?.onMove?.(run, f);
  if (run.over) return null;
  moveStalker(run, f);
  if (run.screen !== 'dungeon') return null;
  enterRoom(run, to);
  return null;
}

export function lightCost(run: RunState): number {
  const has = (id: string) => Object.values(run.equip).some((x) => x?.id === id);
  let cost = LIGHT_PER_MOVE;
  if (has('storm-lantern')) cost -= 3;
  if (has('diving')) cost += 2;
  if (run.relics.some((r) => r.id === 'lighthouse-lens')) cost *= 2;
  return Math.max(1, cost);
}

export function advanceTime(run: RunState, hours: number) {
  const f = run.floor;
  if (!f) return;
  f.hours += hours;
  run.stats.hours += hours;
  const tide = Math.floor(f.hours / HOURS_PER_TIDE) * (f.vars.tideMul ?? 1);
  while (f.tide < tide) {
    f.tide++;
    log(run, `심연의 조수가 차오른다 (${f.tide}단계) — 적이 강해진다`);
    floorSignal(run, { t: 'tide', tide: f.tide });
  }
  for (let i = 0; i < hours; i++) maybeOpenRift(run, f);
  if (f.tide >= 4 && !f.stalker && f.act < 5) {
    const d = distances(f, f.pos);
    let far = 0;
    for (let i = 0; i < d.length; i++) if (d[i] !== Infinity && d[i] > d[far]) far = i;
    f.stalker = { room: far, active: true, beaten: 0 };
    log(run, '무언가가 당신을 쫓기 시작했다');
  }
}

function maybeOpenRift(run: RunState, f: FloorState) {
  if (f.tide < 2 || f.rifts >= 2 || f.act >= 5) return;
  const r = rng(run, 'map');
  if (!r.chance(0.05 + 0.04 * (f.tide - 2))) return;
  const cands = f.rooms.filter((x) => x.id !== f.pos && x.id !== f.start && x.type !== 'portal' && x.type !== 'lord' && !x.rift);
  if (!cands.length) return;
  const room = r.weighted(cands, (x) => (x.seen ? 2 : 1));
  room.rift = true;
  room.seen = true;
  f.rifts++;
  log(run, '어딘가에서 공간이 찢어지는 소리가 났다 — 균열이 열렸다');
}

function moveStalker(run: RunState, f: FloorState) {
  const s = f.stalker;
  if (!s?.active) return;
  if (s.room !== f.pos) {
    // 한 칸 다가온다
    const d = distances(f, f.pos);
    const next = f.rooms[s.room].links.reduce((best, n) => (d[n] < d[best] ? n : best), s.room);
    s.room = next;
  }
  if (s.room === f.pos) {
    const enc = ENCOUNTERS.find((e) => e.id.startsWith('stalker') && e.act === f.act);
    s.active = false;
    s.beaten++;
    if (enc) {
      log(run, '추적자가 당신을 따라잡았다!');
      startCombat(run, enc.id);
    }
  }
}

// ───────────── 방 진입 ─────────────

export function enterRoom(run: RunState, id: number) {
  const f = run.floor!;
  const room = f.rooms[id];
  if (room.cleared && room.type !== 'merchant' && room.type !== 'shrine') return;
  const r = rng(run, 'map');
  switch (room.type) {
    case 'combat':
    case 'elite': {
      if (!room.enc) room.enc = pickEncounter(run, f, room);
      room.cleared = true;
      startCombat(run, room.enc, { ambush: run.light < 25 && r.chance(0.5) });
      break;
    }
    case 'portal':
      // 수호자 전투는 확인 후 시작 (UI에서 startGuardian 호출)
      break;
    case 'lord':
      break;
    case 'treasure': {
      room.cleared = true;
      run.reward = treasureReward(run);
      run.screen = 'reward';
      break;
    }
    case 'event': {
      room.cleared = true;
      if (room.event && EVENTS.has(room.event)) startEvent(run, room.event);
      break;
    }
    case 'camp':
      run.screen = 'camp';
      break;
    case 'merchant':
      openShop(run, 'merchant', id);
      break;
    case 'shrine':
      run.screen = 'shrine';
      break;
    case 'empty': {
      room.cleared = true;
      const roll = r.next();
      if (roll < 0.12) {
        const g = r.int(6, 15);
        run.player.gold += g;
        log(run, `잔해를 뒤져 ${g} 골드를 찾았다`);
      } else if (roll < 0.2) {
        run.light = Math.min(100, run.light + 15);
        log(run, '낡은 등유통을 찾았다 (등불 +15)');
      }
      break;
    }
    default:
      break;
  }
}

/** 포탈 비석 / 계층군주 전투 시작 */
export function startGuardian(run: RunState): string | null {
  const f = run.floor;
  if (!f) return '층이 없다';
  const room = f.rooms[f.pos];
  if (room.type === 'portal') {
    if (!f.bossEnc) return '수호자가 없다';
    startCombat(run, f.bossEnc);
    return null;
  }
  if (room.type === 'lord') {
    const lord = FLOORS.get(f.act)?.lord;
    if (!lord) return '군주가 없다';
    room.cleared = true;
    startCombat(run, lord.enc);
    return null;
  }
  return '여기에는 수호자가 없다';
}

function treasureReward(run: RunState): RewardState {
  const r = rng(run, 'loot');
  const items: RewardState['items'] = [];
  const gold = r.int(20, 40);
  run.player.gold += gold;
  if (r.chance(0.7)) {
    const relic = rollRelic(run);
    if (relic) items.push({ kind: 'relic', id: relic });
  } else {
    const eq = rollEquip(run, 'elite');
    if (eq) items.push({ kind: 'equip', id: eq });
  }
  if (r.chance(0.5)) {
    const c = rollConsumable(run);
    if (c) items.push({ kind: 'consumable', id: c });
  }
  if (r.chance(0.35)) items.push({ kind: 'oil', id: 'oil', n: 25 });
  return { source: 'treasure', gold, xp: 0, items, choice: null, chosen: true, next: 'dungeon' };
}

// ───────────── 균열 ─────────────

export function enterRift(run: RunState): string | null {
  const f = run.floor;
  if (!f) return '층이 없다';
  const room = f.rooms[f.pos];
  if (!room.rift) return '균열이 없다';
  const r = rng(run, 'map');
  const rules = ['rule-inverted', 'rule-revive', 'rule-tax', 'rule-doom', 'rule-fog', 'rule-frenzy'];
  const normals = ENCOUNTERS.filter((e) => e.act === f.act && e.kind === 'normal' && !e.early);
  const elites = ENCOUNTERS.filter((e) => e.act === f.act && e.kind === 'elite' && !e.id.startsWith('stalker'));
  const guardians = ENCOUNTERS.filter((e) => e.act === f.act && e.id.startsWith('rift'));
  if (!normals.length || !guardians.length) return '균열이 불안정하다';
  const encs = [r.pick(normals).id, (r.chance(0.5) && elites.length ? r.pick(elites) : r.pick(normals)).id, r.pick(guardians).id];
  run.rift = { room: room.id, stage: 0, rule: r.pick(rules), encs };
  room.rift = false;
  log(run, '균열 속으로 발을 들였다. 수호자를 쓰러뜨리기 전에는 나갈 수 없다');
  startCombat(run, encs[0], { anomaly: run.rift.rule });
  return null;
}

export function continueRift(run: RunState) {
  const rift = run.rift;
  if (!rift) return;
  rift.stage++;
  if (rift.stage >= rift.encs.length) {
    run.rift = null;
    run.screen = 'dungeon';
    return;
  }
  startCombat(run, rift.encs[rift.stage], { anomaly: rift.rule });
}

// ───────────── 신호 / 계층군주 ─────────────

export function floorSignal(run: RunState, sig: FloorSignal) {
  const f = run.floor;
  if (!f) return;
  const lord = FLOORS.get(f.act)?.lord;
  if (!lord || f.lord.defeated || f.lord.room >= 0) return;
  if (sig.t === 'combat' && sig.enc === lord.enc) {
    f.lord.defeated = true;
    return;
  }
  f.lord.progress += lord.progress(run, f, sig);
  const stage = Math.floor((f.lord.progress / lord.goal) * lord.warnings.length);
  while (f.lord.warned < Math.min(stage, lord.warnings.length - 1)) {
    log(run, lord.warnings[f.lord.warned]);
    f.lord.warned++;
  }
  if (f.lord.progress >= lord.goal) {
    const r = rng(run, 'map');
    const cands = f.rooms.filter((x) => x.id !== f.pos && x.cleared && x.type !== 'portal' && x.type !== 'start');
    const room = cands.length ? r.pick(cands) : f.rooms.find((x) => x.id !== f.pos && x.type === 'empty');
    if (!room) return;
    room.type = 'lord';
    room.cleared = false;
    room.seen = room.scouted = true;
    f.lord.room = room.id;
    log(run, lord.warnings[lord.warnings.length - 1]);
  }
}

// ───────────── 층 전환 ─────────────

export function goHaven(run: RunState) {
  run.screen = 'haven';
  run.innUsed = false;
  run.shop = null;
}

export function descend(run: RunState) {
  run.act++;
  if (run.act > 5) {
    endRun(run, true, '잠든 자를 다시 잠재웠다');
    return;
  }
  if (!ENCOUNTERS.some((e) => e.act === run.act)) {
    endRun(run, true, `${run.act}층은 아직 봉인되어 있다 (개발 중)`);
    return;
  }
  run.light = 100;
  run.floor = generateFloor(run, run.act);
  run.screen = 'dungeon';
  log(run, `${run.act}층으로 내려왔다`);
}

/** 3층 법칙: 복도 연결이 뒤틀림 (연결성 유지) */
export function shiftCorridors(run: RunState, f: FloorState, count: number) {
  const r = rng(run, 'map');
  for (let i = 0; i < count; i++) {
    const a = r.pick(f.rooms);
    if (a.links.length < 2) continue;
    const b = f.rooms[r.pick(a.links)];
    if (b.links.length < 2) continue;
    a.links = a.links.filter((x) => x !== b.id);
    b.links = b.links.filter((x) => x !== a.id);
    const d = distances(f, f.start);
    if (d.some((x) => x === Infinity)) {
      a.links.push(b.id);
      b.links.push(a.id);
      continue;
    }
    // 새 통로: 격자상 이웃 중 연결 안 된 곳
    const nbs = f.rooms.filter((x) => Math.abs(x.x - a.x) + Math.abs(x.y - a.y) === 1 && !a.links.includes(x.id) && x.id !== b.id);
    if (nbs.length) {
      const c = r.pick(nbs);
      a.links.push(c.id);
      c.links.push(a.id);
    }
  }
}

export type { EncounterDef };
