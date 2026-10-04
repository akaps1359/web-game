import { reg } from '../../engine/registry';
import { reveal, shiftCorridors, type FloorState, type Room } from '../../engine/dungeon';
import { log, rng } from '../../engine/run';

/** 회랑이 뒤틀리는 간격 (시간) */
const SHIFT_HOURS = 8;
/** 계층군주 진척: 야영지에서 잠을 잤다고 볼 최소 경과 시간 (수면 6 + 이동 1) */
const SLEPT_HOURS = 7;

/** from → to 최단 경로 위의 방들을 지도에 드러낸다 (내용은 그대로 미지) */
export function revealPath(f: FloorState, from: number, to: number) {
  const prev = new Map<number, number>();
  const q = [from];
  const seen = new Set([from]);
  while (q.length) {
    const cur = q.shift()!;
    if (cur === to) break;
    for (const n of f.rooms[cur].links) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      q.push(n);
    }
  }
  if (!seen.has(to)) return;
  for (let at = to; at !== from; at = prev.get(at)!) f.rooms[at].seen = true;
}

/** 드러난 방이 드러난 길만으로 현재 위치와 이어지도록 끊긴 곳의 경로를 드러낸다 (회랑이 뒤틀린 뒤 지도 정리) */
export function connectSeen(f: FloorState) {
  for (let guard = 0; guard < f.rooms.length; guard++) {
    const reach = new Set([f.pos]);
    const q = [f.pos];
    while (q.length) {
      const cur = q.shift()!;
      for (const n of f.rooms[cur].links) {
        if (reach.has(n) || !f.rooms[n].seen) continue;
        reach.add(n);
        q.push(n);
      }
    }
    const cut = f.rooms.find((r) => r.seen && !reach.has(r.id));
    if (!cut) return;
    revealPath(f, f.pos, cut.id);
  }
}

reg.floors([
  {
    act: 3,
    name: '꿈의 경계',
    law:
      '뒤틀린 회랑 — 8시간마다 복도의 연결이 바뀐다.\n' +
      '회복 반전 구역 — 표시된 방의 전투에서는 회복이 피해가 된다.\n' +
      '꿈의 안개 — 전투의 4번째 턴마다 적의 의도가 흐려진다 (통찰 5 이상이면 보이고, 차지는 숨겨지지 않는다). 적을 붕괴시키면 꿈에서 깨듯 정신력 +2.',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn % 4 !== 0 || c.p.insight >= 5) return;
        let any = false;
        for (const e of c.alive) {
          const it = e.intent;
          if (!it || it.hidden || it.charging || it.kind === 'stunned') continue;
          it.hidden = true;
          any = true;
        }
        if (any) c.emit({ t: 'text', text: '꿈이 짙어진다 — 적의 의도가 흐려졌다', tone: 'eldritch' });
      },
      onBreak(c) {
        c.gainSanity(2);
      },
    },
    setup(run, f) {
      // 회복 반전 구역: 방의 약 20% (전투가 벌어지는 방 중에서)
      const r = rng(run, 'map');
      const cands = f.rooms.filter((x) => x.type === 'combat' || x.type === 'elite');
      const n = Math.min(cands.length, Math.max(3, Math.round(f.rooms.length * 0.2)));
      for (const room of r.sample(cands, n)) room.inverted = true;
      f.vars.nextShift = SHIFT_HOURS;
      f.vars.lordPos = f.start;
      f.vars.lordH = 0;
    },
    onMove(run, f) {
      if (f.hours < (f.vars.nextShift ?? SHIFT_HOURS)) return;
      f.vars.nextShift = f.hours + SHIFT_HOURS;
      // 나무 모양 미궁에서는 끊으면 고립되는 복도가 많아 한 번의 시도로는 아무것도 안 바뀔 때가 많다 → 바뀔 때까지 몇 번 더
      const sig = () => f.rooms.map((r) => [...r.links].sort((a, b) => a - b).join(',')).join('|');
      const before = sig();
      for (let i = 0; i < 6 && sig() === before; i++) shiftCorridors(run, f, 3);
      if (sig() === before) {
        // 고리가 하나도 없는 미궁은 어떤 복도도 끊을 수 없다 → 이웃한 두 방 사이에 새 통로를 뚫고 다시 비튼다
        const pairs: [Room, Room][] = [];
        for (const a of f.rooms)
          for (const b of f.rooms) if (a.id < b.id && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1 && !a.links.includes(b.id)) pairs.push([a, b]);
        if (!pairs.length) return;
        const [a, b] = rng(run, 'map').pick(pairs);
        a.links.push(b.id);
        b.links.push(a.id);
        shiftCorridors(run, f, 3);
      }
      reveal(run, f, f.pos);
      connectSeen(f);
      log(run, '회랑이 뒤틀렸다 — 복도의 연결이 바뀌었다');
    },
    lord: {
      id: 'dream-eater',
      name: '꿈을 먹는 자',
      enc: 'lord-a3',
      goal: 5,
      warnings: [
        '잠결에 누군가 입맛을 다시는 소리를 들었다…',
        '꿈이 얇아진다. 무언가가 당신의 꿈을 갉아먹고 있다',
        '기억 한 조각이 사라졌다. 그것은 이제 당신의 꿈 바로 곁에 있다',
        '꿈을 먹는 자가 깨어났다 — 지도에 표시됨',
      ],
      // 숨겨진 조건: 이 층에서 잠들기(야영지 수면 +2, 낯선 침대 +2, 일흔 계단 +1),
      // 회복 반전 구역에서의 승리 +1, 통찰 4 이상인 채로 조수가 차오름 +1
      progress(run, f, e) {
        if (e.t === 'move') {
          const prev = f.rooms[f.vars.lordPos ?? f.start];
          const dh = f.hours - (f.vars.lordH ?? 0);
          f.vars.lordPos = f.pos;
          f.vars.lordH = f.hours;
          const sleepless = run.relics.some((x) => x.id === 'sleeper-scale');
          if (prev?.type === 'camp' && prev.cleared && dh >= SLEPT_HOURS && !sleepless) {
            log(run, '잠든 사이, 무언가가 당신의 꿈을 한 입 베어 물었다');
            return 2;
          }
          return 0;
        }
        if (e.t === 'combat') return e.kind !== 'boss' && f.rooms[f.pos]?.inverted ? 1 : 0;
        if (e.t === 'tide') return run.player.insight >= 4 ? 1 : 0;
        if (e.t === 'event') {
          if (e.id === 'a3-strange-bed' && e.choice === 'sleep') return 2;
          if (e.id === 'a3-seventy-steps' && e.choice === 'descend') return 1;
        }
        return 0;
      },
    },
  },
]);
