import { describe, expect, it } from 'vitest';
import '../src/content';
import { FLOORS } from '../src/engine/registry';
import { generateFloor } from '../src/engine/dungeon';
import { newRun } from '../src/engine/run';

/** 지도 전체(보이든 말든)에서 시작 방에서 포탈까지 길이 있는가 */
function connected(f: { rooms: { id: number; links: number[] }[]; start: number; portal: number }) {
  const seen = new Set([f.start]);
  const q = [f.start];
  while (q.length) {
    const r = q.shift()!;
    for (const n of f.rooms[r].links) if (!seen.has(n)) (seen.add(n), q.push(n));
  }
  return seen.has(f.portal) && seen.size === f.rooms.length;
}

describe('점검: 지도 연결', () => {
  it('모든 층은 생성 직후와 시간이 흐른 뒤(회랑 비틀림·눈보라)에도 모든 방이 이어져 있다', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (let act = 1; act <= 5; act++) {
        const run = newRun({ seed, origin: 'soldier' });
        run.act = act;
        const f = generateFloor(run, act);
        run.floor = f;
        expect(connected(f)).toBe(true);
        const def = FLOORS.get(act);
        for (let step = 0; step < 30; step++) {
          f.hours += 2;
          def?.onMove?.(run, f);
          if (!connected(f)) throw new Error(`seed ${seed} act ${act} 이동 ${step}에서 끊김`);
        }
      }
    }
  });
});
