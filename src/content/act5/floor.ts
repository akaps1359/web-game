import { reg } from '../../engine/registry';
import { connectSeen, reveal, shiftCorridors, type Room } from '../../engine/dungeon';
import { log, loseSanityRun, rng } from '../../engine/run';

/*
 * 5층 — 꿈꾸는 우주 (2026-10 개편: 일직선 최종층 → 정식 탐험 층).
 * 궁정의 바닥이 꺼지고 열린 우주. 꿈의 땅 조각들이 섬처럼 떠다니고, 한가운데 웅크린 별의 태아가 이 모든 것을 꿈꾼다.
 * 법칙 셋: 떠도는 섬(복도 연결이 바뀜) · 뒤집힌 꿈(회복 반전 구역) · 자장가(이동마다 정신력 -2, 붕괴시키면 +2).
 * 계층군주 '꿈을 먹는 자' — 이 층에서 잠들면 꿈을 갉아먹힌다. 포탈 비석의 수호자(별의 태아)를 쓰러뜨리면 승리 → victory 문장.
 */

/** 섬들이 떠도는 간격 (시간) */
const SHIFT_HOURS = 8;
/** 계층군주 진척: 야영지에서 잠을 잤다고 볼 최소 경과 시간 (수면 6 + 이동 1) */
const SLEPT_HOURS = 7;
/** 자장가: 방을 옮길 때마다 잃는 정신력 (통찰·의지 보정 전) */
export const MOVE_SANITY = 2;
/** 적을 붕괴시키면 되찾는 정신력 */
export const BREAK_SANITY = 2;

reg.floors([
  {
    act: 5,
    name: '꿈꾸는 우주',
    victory: '별의 태아는 태어나지 못했다. 우주는 아직 꿈에서 깨지 않았다.',
    law:
      `떠도는 섬: ${SHIFT_HOURS}시간마다 꿈의 섬들이 떠돌아 복도의 연결이 바뀐다.\n` +
      '뒤집힌 꿈: 회복 반전 구역(지도에 표시)에서 싸울 때는 내가 받는 회복이 피해가 된다.\n' +
      `자장가: 방을 옮길 때마다 정신력 -${MOVE_SANITY}. 적을 붕괴시키면 꿈에서 깨어나듯 정신력 +${BREAK_SANITY}.`,
    hooks: {
      onBreak(c) {
        c.gainSanity(BREAK_SANITY);
      },
    },
    setup(run, f) {
      // 회복 반전 구역: 전투가 벌어지는 방 중 몇 곳 (방의 약 12%, 최소 2곳)
      const r = rng(run, 'map');
      const cands = f.rooms.filter((x) => x.type === 'combat' || x.type === 'elite');
      const n = Math.min(cands.length, Math.max(2, Math.round(f.rooms.length * 0.12)));
      for (const room of r.sample(cands, n)) room.inverted = true;
      f.vars.nextShift = SHIFT_HOURS;
      f.vars.lordPos = f.start;
      f.vars.lordH = 0;
    },
    onMove(run, f) {
      // 자장가
      const s = loseSanityRun(run, MOVE_SANITY);
      if (run.over) return;
      if (s.madness) log(run, '자장가가 정신을 잠식했다. 광기에 사로잡혔다');
      else if (!f.vars.lullTold) {
        f.vars.lullTold = 1;
        log(run, `어디선가 자장가가 들린다. 1층부터 들려오던 그 목소리다. 걸음마다 정신이 깎인다 (정신력 -${s.lost})`);
      }

      // 떠도는 섬
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
      log(run, '섬들이 떠돌아 복도의 연결이 바뀌었다');
    },
    lord: {
      id: 'dream-eater',
      name: '꿈을 먹는 자',
      enc: 'lord-a5',
      goal: 5,
      warnings: [
        '잠결에 누군가 입맛을 다시는 소리를 들었다…',
        '꿈이 얇아진다. 무언가가 꿈 가장자리를 갉아먹고 있다',
        '기억 한 조각이 사라졌다. 그것이 이제 꿈 바로 곁까지 와 있다',
        '꿈을 먹는 자가 깨어났다 (지도에 표시)',
      ],
      hints: [
        '그것은 잠을 먹는다 — 이 층의 야영지에서 잠들거나, 낯선 침대에 눕거나, 일흔 계단을 내려가면 다가온다',
        '뒤집힌 꿈(회복 반전 구역)에서 이기면 그 흔들림을 맛본다',
        '정신력이 절반 아래인 채로 조수가 차오르면 — 흔들리는 꿈은 맛있다',
      ],
      // 숨겨진 조건: 이 층에서 잠들기(야영지 수면 +2, 낯선 침대 +2, 일흔 계단 +1),
      // 회복 반전 구역에서의 승리 +1, 정신력이 절반 이하인 채로 조수가 차오름 +1 (흔들리는 꿈은 맛있다)
      progress(run, f, e) {
        if (e.t === 'move') {
          const prev = f.rooms[f.vars.lordPos ?? f.start];
          const dh = f.hours - (f.vars.lordH ?? 0);
          f.vars.lordPos = f.pos;
          f.vars.lordH = f.hours;
          const sleepless = run.relics.some((x) => x.id === 'sleeper-scale');
          if (prev?.type === 'camp' && prev.cleared && dh >= SLEPT_HOURS && !sleepless) {
            log(run, '잠든 사이 무언가가 꿈을 한 입 베어 물었다');
            return 2;
          }
          return 0;
        }
        if (e.t === 'combat') return e.kind !== 'boss' && f.rooms[f.pos]?.inverted ? 1 : 0;
        if (e.t === 'tide') return run.player.sanity <= run.player.maxSanity / 2 ? 1 : 0;
        if (e.t === 'event') {
          if (e.id === 'a5-strange-bed' && e.choice === 'sleep') return 2;
          if (e.id === 'a5-seventy-steps' && e.choice === 'descend') return 1;
        }
        return 0;
      },
    },
  },
]);
