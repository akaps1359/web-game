import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { ENCASED, frozenIntent } from './common';

/**
 * 3층 전용 전장 규칙 — 법칙 '얼음 속의 것들'.
 * 얼어붙은 방(room.frozen)의 전투: 녹기 전이면 적이 얼음에 갇혀 첫 차례를 움직이지 못하고,
 * 녹은 뒤면 굶주린 채 깨어나 사납다. (floor.ts의 roomAnomaly가 고른다)
 */
export const FROZEN_ROOM = 'a3-frozen-room';
export const THAWED_ROOM = 'a3-thawed-room';
/** 녹아 깨어난 것들의 공격 피해 배율 */
export const THAW_DMG = 1.25;

reg.anomalies([
  {
    id: FROZEN_ROOM,
    name: '얼음 속의 것들',
    icon: 'gi:ice-cubes',
    desc: '적들이 아직 얼음 속에 갇혀 있다 — 첫 차례에 움직이지 못한다',
    hooks: {
      onCombatStart(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) {
          c.emit({ t: 'text', text: '얼음 속에서 무언가가 아직 잠들어 있다', tone: 'info' });
          return;
        }
        c.apply(e, ENCASED, 1, null);
      },
      onTurnStart(c) {
        // 첫 턴에는 얼음에 갇힌 적의 의도를 '얼음 속에 갇힘'으로 보여 준다 (실제 행동은 상태가 막는다)
        if (c.s.turn !== 1) return;
        for (const e of c.alive) if ((e.st[ENCASED] ?? 0) > 0 && e.broken !== 2) e.intent = frozenIntent();
      },
    },
  },
  {
    id: THAWED_ROOM,
    name: '녹아내린 굶주림',
    icon: 'gi:melting-ice-cube',
    desc: `얼음이 녹아 깨어난 것들이 굶주려 있다 — 적의 공격 피해 +${Math.round((THAW_DMG - 1) * 100)}%`,
    hooks: {
      onCombatStart(c, s) {
        if (!isEnemy(s.unit)) c.emit({ t: 'text', text: '녹아내린 얼음 위로 굶주린 것들이 기어 나온다', tone: 'bad' });
      },
      modDamageOut(_c, _s, d) {
        if (d.attack && isEnemy(d.src)) d.mult *= THAW_DMG;
      },
    },
  },
]);
