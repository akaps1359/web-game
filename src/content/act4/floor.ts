import { reg } from '../../engine/registry';
import { hurtRun, log, loseSanityRun, rng } from '../../engine/run';

/** 유성이 떨어질 수 있는 방 */
const METEOR_ROOMS = ['combat', 'treasure', 'event', 'empty'];

reg.floors([
  {
    act: 4,
    name: '별들의 궁정',
    law:
      '별의 정렬 — 심연의 조수가 두 배로 빨리 차오른다. 유성 표시가 있는 방에는 정해진 시각에 유성이 떨어진다: ' +
      '그 순간 그 방에 있으면 최대 체력의 25% 피해, 아직 비우지 않은 방의 내용은 잿더미가 된다.',
    setup(run, f) {
      f.vars.tideMul = 2;
      const r = rng(run, 'map');
      const cands = f.rooms.filter((x) => x.id !== f.start && METEOR_ROOMS.includes(x.type));
      const n = Math.min(cands.length, r.int(3, 4));
      const span = Math.floor(24 / Math.max(1, n));
      r.sample(cands, n).forEach((room, i) => {
        room.meteor = Math.min(30, 6 + i * span + r.int(0, Math.max(0, span - 2)));
      });
    },
    onMove(run, f) {
      for (const room of f.rooms) {
        if (room.meteor === undefined || f.vars['meteor' + room.id]) continue;
        if (f.hours >= room.meteor) {
          f.vars['meteor' + room.id] = 1;
          if (f.pos === room.id) {
            const n = hurtRun(run, Math.round(run.player.maxHp * 0.25));
            const s = loseSanityRun(run, 5);
            log(run, `머리 위로 유성이 떨어졌다! 불길이 온몸을 핥고 지나간다 (체력 -${n})` + (s.madness ? ' — 정신이 무너졌다' : ''));
            if (run.over) return;
          } else {
            const ruined = !room.cleared && (room.type === 'combat' || room.type === 'treasure' || room.type === 'event');
            if (ruined) {
              room.type = 'empty';
              delete room.enc;
              delete room.event;
            }
            log(run, ruined ? '멀리서 유성이 떨어졌다. 그곳에 있던 것은 모두 잿더미가 되었다' : '멀리서 유성이 떨어졌다. 땅이 오래 울린다');
          }
        } else if (f.hours >= room.meteor - 2 && !f.vars['meteorWarn' + room.id]) {
          f.vars['meteorWarn' + room.id] = 1;
          log(
            run,
            f.pos === room.id
              ? '머리 위 하늘이 붉게 타오른다 — 이 방에 곧 유성이 떨어진다!'
              : `하늘 한쪽이 붉게 타오른다 — ${room.meteor}시에 유성이 떨어진다`,
          );
        }
      }
    },
    lord: {
      id: 'black-star',
      name: '검은 별',
      enc: 'lord-a4',
      goal: 3,
      warnings: [
        '별들이 하나씩 꺼지고 있다. 무언가가 빛을 먹는다…',
        '운석이 떨어진 자리마다 검은 빛이 새어 나온다',
        '하늘 한가운데 구멍이 열렸다. 그것이 이쪽을 내려다본다',
        '검은 별이 내려앉았다 — 지도에 표시됨',
      ],
      progress(_run, f, e) {
        // 숨겨진 조건: 유성이 떨어진 운석 구덩이를 밟는다(서로 다른 곳마다 +1), 조수가 4단계에 이른다(+1)
        if (e.t === 'move') {
          const room = f.rooms[e.room];
          if (room && room.meteor !== undefined && f.vars['meteor' + room.id] && !f.vars['crater' + room.id]) {
            f.vars['crater' + room.id] = 1;
            return 1;
          }
        }
        if (e.t === 'tide' && e.tide >= 4 && !f.vars.starTide) {
          f.vars.starTide = 1;
          return 1;
        }
        return 0;
      },
    },
  },
]);
