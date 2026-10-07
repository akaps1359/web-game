import { reg } from '../../engine/registry';
import { lightCost, reveal } from '../../engine/dungeon';
import type { FloorState } from '../../engine/dungeon';
import { log, loseSanityRun, rng, type RunState } from '../../engine/run';
import { FROST } from './common';
import { FROZEN_ROOM, THAWED_ROOM } from './anomalies';

/*
 * 3층 — 얼어붙은 고대 도시.
 * 법칙:
 *  - 혹한: 등불이 1.5배 빨리 닳는다 (f.vars.coldLight = 추가 소모 %, 이동 화면이 이 값을 읽어 보여 준다).
 *          등불이 25 미만일 때 벌어진 전투는 동상을 안고 시작한다.
 *  - 눈보라: 10시간마다 눈보라가 몰아쳐, 들르지 않은 방들이 다시 어둠에 묻힌다 (내용이 지워진다).
 *  - 얼음 속의 것들: 얼어붙은 방(room.frozen = 녹는 시각)의 적은 그 시각 전엔 얼음에 갇혀 첫 차례를 움직이지 못하고,
 *          지나면 녹아 깨어나 굶주린 채 덤빈다 (anomalies.ts).
 * 계층군주 '깨어난 원로' — 숨은 조건: 온기와 해동 (아래 lord.progress 참고).
 */

/** 혹한: 이동마다 추가로 닳는 등불 (기본 소모의 %) */
export const COLD_LIGHT = 50;
/** 눈보라 간격 (시간) */
export const BLIZZARD_HOURS = 10;
/** 얼어붙은 방이 녹는 시각 */
export const THAW_HOUR = 24;
/** 어둠 속 전투가 안고 시작하는 동상 */
export const DARK_FROST = 3;

/** 얼어붙을 수 있는 방 */
const FREEZABLE = ['combat', 'elite'];

/** 이번 이동에 더 닳는 등불 */
export function coldExtra(run: RunState, f: FloorState): number {
  return Math.ceil((lightCost(run) * (f.vars.coldLight ?? 0)) / 100);
}

/** 눈보라: 들르지 않은 방의 내용이 다시 어둠에 묻힌다 (포탈 비석·계층군주는 그대로) */
function blizzard(run: RunState, f: FloorState) {
  let buried = 0;
  for (const room of f.rooms) {
    if (room.visited || !room.scouted || room.id === f.portal || room.type === 'lord') continue;
    room.scouted = false;
    buried++;
  }
  // 지금 서 있는 곳의 이웃은 등불이 닿는 만큼 다시 보인다
  reveal(run, f, f.pos);
  log(run, buried > 0 ? '눈보라가 몰아쳐 들르지 않은 방들이 다시 눈에 묻혔다' : '눈보라가 도시를 훑고 지나갔다');
}

reg.floors([
  {
    act: 3,
    name: '얼어붙은 고대 도시',
    law:
      `혹한: 등불이 1.5배 빨리 닳는다. 등불이 25 미만일 때 벌어진 전투는 동상 ${DARK_FROST}을 안고 시작한다. 동상이 쌓이면 얻는 방어도가 줄고 5가 되면 몸이 얼어붙는다. 화염이 녹인다.\n` +
      `눈보라: ${BLIZZARD_HOURS}시간마다 눈보라가 몰아쳐 들르지 않은 방들이 다시 어둠에 묻힌다.\n` +
      `얼음 속의 것들: 얼어붙은 방(얼음 표시)의 적은 ${THAW_HOUR}시간이 지나기 전에는 얼음에 갇혀 첫 차례를 움직이지 못한다. 그 뒤에는 녹아 깨어나 굶주린 채 덤빈다 (공격 피해 +25%).`,
    hooks: {
      onCombatStart(c, s) {
        if (s.unit !== c.p || c.run.light >= 25) return;
        c.apply(c.p, FROST, DARK_FROST, null);
        c.emit({ t: 'text', uid: 'p', text: `어둠 속의 냉기가 스민다 (동상 ${DARK_FROST})`, tone: 'bad' });
      },
    },
    setup(run, f) {
      f.vars.coldLight = COLD_LIGHT;
      f.vars.nextBlizzard = BLIZZARD_HOURS;
      // 얼어붙은 방: 전투가 벌어지는 방의 약 30% (최소 3). 깊은 곳(시작에서 먼 곳)일수록 잘 언다
      const r = rng(run, 'map');
      const cands = f.rooms.filter((x) => FREEZABLE.includes(x.type));
      const n = Math.min(cands.length, Math.max(3, Math.round(cands.length * 0.3)));
      const sx = f.rooms[f.start];
      const ranked = cands
        .map((room) => ({ room, k: Math.abs(room.x - sx.x) + Math.abs(room.y - sx.y) + r.next() * 5 }))
        .sort((a, b) => b.k - a.k);
      for (const { room } of ranked.slice(0, n)) room.frozen = THAW_HOUR;
    },
    onMove(run, f) {
      // 혹한: 등불이 더 닳는다 (엔진이 기본 소모를 뺀 뒤)
      const extra = coldExtra(run, f);
      if (extra > 0) {
        const before = run.light;
        run.light = Math.max(0, run.light - extra);
        // 엔진은 기본 소모만 뺀 등불로 '어둠 속 이동(정신력 -2)'을 판정한다. 혹한의 추가 소모로 어둠에 들어섰다면
        // 이동 확인 화면이 미리 알려 준 대로 여기서 같은 대가를 치른다
        if (before >= 25 && run.light < 25) {
          const res = loseSanityRun(run, 2);
          if (res.madness) log(run, '어둠이 정신을 갉아먹는다… 광기에 사로잡혔다');
          if (run.over) return;
        }
      }
      if (!f.vars.coldTold) {
        f.vars.coldTold = 1;
        log(run, `숨이 얼어붙는다. 추위 속에서는 등불이 빨리 닳는다 (이동마다 등불 -${extra} 더)`);
      }
      // 눈보라 (야영·이벤트로 시간이 많이 흘렀어도 한 번만 몰아친다)
      const next = f.vars.nextBlizzard ?? BLIZZARD_HOURS;
      if (f.hours >= next) {
        f.vars.nextBlizzard = (Math.floor(f.hours / BLIZZARD_HOURS) + 1) * BLIZZARD_HOURS;
        blizzard(run, f);
      } else if (f.hours >= next - 2 && f.vars.blizzardWarned !== next) {
        f.vars.blizzardWarned = next;
        log(run, `바람이 거세진다. 곧 눈보라가 몰아친다 (${next}시간째)`);
      }
      // 해동
      if (f.hours >= THAW_HOUR && !f.vars.thawTold) {
        f.vars.thawTold = 1;
        if (f.rooms.some((x) => x.frozen !== undefined && !x.cleared)) log(run, '도시 곳곳에서 얼음이 갈라지는 소리가 난다. 얼어붙어 있던 것들이 깨어났다');
      }
    },
    roomAnomaly(_run, f, roomId) {
      const room = f.rooms[roomId];
      if (room?.frozen === undefined) return null;
      return f.hours < room.frozen ? FROZEN_ROOM : THAWED_ROOM;
    },
    lord: {
      id: 'awakened-elder',
      name: '깨어난 원로',
      enc: 'lord-a3',
      goal: 5,
      warnings: [
        '얼음 깊은 곳에서 쩍 하고 갈라지는 소리가 났다…',
        '벽화 속 별 모양 머리들이 모두 같은 쪽으로 돌아가 있다',
        '멀리서 피리 소리가 들린다. 테켈리-리… 다른 피리 소리가 거기에 답한다',
        '깨어난 원로가 얼음을 깨고 나왔다 (지도에 표시)',
      ],
      // 숨겨진 조건 (온기와 해동): 야영지에서 불을 피움 +1 (야영지마다), 얼어붙은 방의 얼음을 깨뜨림(녹기 전에 승리) +1,
      // 하루가 지나 얼음이 녹기 시작함 +1, 반란의 벽화를 읽음 +1, 얼음 속의 형체를 녹임 +2, 피리 소리에 대답함 +1,
      // 해부 천막의 난로에 불을 붙임 +1
      progress(run, f, e) {
        if (e.t === 'move') {
          let n = 0;
          for (const room of f.rooms) {
            if (room.type !== 'camp' || !room.cleared || f.vars['warm' + room.id]) continue;
            f.vars['warm' + room.id] = 1;
            n++;
          }
          if (n > 0) log(run, '모닥불의 온기가 발밑의 얼음 깊숙이 스며든다');
          return n;
        }
        if (e.t === 'tide') return e.tide === 2 ? 1 : 0;
        if (e.t === 'combat') {
          const room = f.rooms[f.pos];
          return e.kind !== 'boss' && !run.rift && room?.frozen !== undefined && f.hours < room.frozen ? 1 : 0;
        }
        if (e.t === 'event') {
          if (e.id === 'a3-murals' && e.choice === 'revolt') return 1;
          if (e.id === 'a3-frozen-shape' && e.choice === 'melt') return 2;
          if (e.id === 'a3-tekeli-li' && e.choice === 'answer') return 1;
          if (e.id === 'a3-lake-camp' && e.choice === 'stove') return 1;
        }
        return 0;
      },
    },
  },
]);
