import { ENCOUNTERS, ENEMIES, reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { log, rng, type RunState } from '../../engine/run';
import type { FloorState } from '../../engine/dungeon';
import { hasTag } from './enemies';

/** 한 번 울릴 때마다 교단 신도 힘 +1, 최대 */
export const MAX_BELLS = 4;

/** 지금까지 울린 종의 효과 (12시간마다 1번 + 종탑에서 직접 울린 횟수 − 끊어낸 밧줄) */
export function bellsRung(f: FloorState): number {
  const n = Math.floor(f.hours / 12) + (f.vars.bellAdd ?? 0) - (f.vars.bellMute ?? 0);
  return Math.max(0, Math.min(MAX_BELLS, n));
}

/** 새로 12시간이 지났으면 종소리를 기록한다 (이동·이벤트 후 호출) */
export function tollCheck(run: RunState, f: FloorState) {
  const n = Math.floor(f.hours / 12);
  if (n <= (f.vars.bells ?? 0)) return;
  f.vars.bells = n;
  const eff = bellsRung(f);
  if (n <= MAX_BELLS) log(run, `수도원의 종이 울린다 (${n}번째) — 교단 신도들의 힘 +${eff}`);
  else log(run, '종이 또 울린다. 이제는 몇 번째인지 셀 수도 없다');
}

/** 교단 신도가 섞인 조우인가 */
function cultEncounter(id: string): boolean {
  const enc = ENCOUNTERS.find((e) => e.id === id);
  return !!enc && enc.enemies.some((s) => ENEMIES.get(s.id)?.tags?.includes('cult'));
}

/** 재에 파묻힐 수 있는 방 종류 */
const ASHABLE: string[] = ['combat', 'elite', 'treasure', 'event', 'empty'];

reg.floors([
  {
    act: 2,
    name: '잿빛 수도원',
    law:
      '종소리 — 12시간마다 수도원의 종이 울리고, 울릴 때마다 모든 교단 신도의 힘이 1씩 오른다 (최대 4). ' +
      '잿더미 — 재에 파묻힌 방은 들어가는 데 2시간이 걸린다. 그곳의 전투에선 화염이 강해지고, 재의 것들이 날뛴다.',
    hooks: {
      onCombatStart(c, s) {
        const f = c.run.floor;
        if (!f) return;
        const n = bellsRung(f);
        if (n <= 0) return;
        if (s.unit === c.p) {
          if (c.alive.some((e) => hasTag(e, 'cult'))) c.emit({ t: 'text', text: `종이 ${n}번 울렸다 — 교단 신도 힘 +${n}`, tone: 'eldritch' });
          return;
        }
        const e = s.unit;
        if (!isEnemy(e) || e.mem.bell || !hasTag(e, 'cult')) return;
        e.mem.bell = 1;
        c.apply(e, 'str', n, null);
      },
      onUnitTurnStart(c, s) {
        // 전투 중에 불려 온 신도에게도 종소리가 깃든다
        const e = s.unit;
        const f = c.run.floor;
        if (!f || !isEnemy(e) || e.mem.bell || !hasTag(e, 'cult')) return;
        e.mem.bell = 1;
        const n = bellsRung(f);
        if (n > 0) c.apply(e, 'str', n, null);
      },
    },
    setup(run, f) {
      // 재는 아래쪽(남쪽) 회랑으로 흘러내려 쌓인다 — 특수한 방을 뺀 방의 약 25%가 재에 파묻힌다.
      // 엔진은 room.flooded인 방에 들어가는 데 2시간을 쓴다. 2층에선 이 깃발이 '재에 파묻힌 방'을 뜻한다
      const r = rng(run, 'map');
      const cands = f.rooms.filter((x) => ASHABLE.includes(x.type));
      const n = Math.round(cands.length * 0.25);
      const ranked = cands.map((room) => ({ room, k: room.y + r.next() * 4 })).sort((a, b) => b.k - a.k);
      for (const { room } of ranked.slice(0, n)) room.flooded = true;
      f.vars.bells = 0;
    },
    onMove(run, f) {
      tollCheck(run, f);
      if (f.rooms[f.pos]?.flooded && !f.vars.ashSeen) {
        f.vars.ashSeen = 1;
        log(run, '무릎까지 쌓인 미지근한 재를 헤치고 나아간다 — 재에 파묻힌 방은 지나는 데 2시간이 걸린다');
      }
    },
    roomAnomaly(_run, f, roomId) {
      return f.rooms[roomId]?.flooded ? 'a2-ashen' : null;
    },
    lord: {
      id: 'bellkeeper',
      name: '종지기',
      enc: 'lord-a2',
      goal: 5,
      warnings: [
        '종소리가 재에 덮인 것처럼 뭉개져 들린다…',
        '종이 울리지 않을 때에도 귓속의 종소리가 멎지 않는다',
        '종탑의 밧줄이 저절로 당겨진다. 누군가 당신의 발걸음을 세고 있다',
        '종지기가 종탑에서 내려왔다 — 지도에 표시됨',
      ],
      progress(_run, f, e) {
        // 종이 울릴 때마다, 종탑의 종을 직접 울렸을 때, 그리고 종이 두 번 울린 뒤 교단 신도를 쓰러뜨릴 때마다
        if (e.t === 'tide') return 1;
        if (e.t === 'event' && e.id === 'a2-belfry') return 2;
        if (e.t === 'combat' && e.kind !== 'boss' && Math.floor(f.hours / 12) >= 2 && cultEncounter(e.enc)) return 1;
        return 0;
      },
    },
  },
]);
