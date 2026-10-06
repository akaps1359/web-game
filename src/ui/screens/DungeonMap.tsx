import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { distances, type FloorState, type Room } from '../../engine/dungeon';
import { ORIGINS } from '../../engine/registry';
import { store } from '../../state/store';
import { Icon, press } from '../components';
import { ROOM_COLOR, ROOM_ICON } from '../text';

/** 이미 지도에 그려 본 방 (화면이 다시 열릴 때 새로 드러난 방만 잉크가 번지듯 나타나게) */
let drawn = { key: '', ids: new Set<number>() };

function floorKey(f: FloorState) {
  return `${f.act}:${f.start}:${f.rooms.length}`;
}

/** 방·복도마다 고정된 작은 흔들림 (격자처럼 보이지 않게, 같은 층에선 늘 같은 모양) */
function hash(a: number, b: number, c = 0) {
  let h = (a * 2654435761) ^ (b * 1597334677) ^ (c * 374761393);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 등불 밝기(0~100)에 따른 어둠 연출 값 */
export function lanternDark(light: number) {
  const l = Math.max(0, Math.min(100, light)) / 100;
  return {
    /** 등불이 또렷이 비추는 거리 (칸) */
    reach: 1.2 + l * 4.3,
    /** 빛이 닿지 않는 곳의 어둠 (0~1) */
    edge: 0.18 + (1 - l) * 0.62,
    /** 화면 어둠 원의 반지름 (지도 폭 대비) */
    radius: 0.32 + l * 0.85,
  };
}

const JITTER = 13;
const BEND = 16;

/**
 * 탐험 지도: 배경 위에 잉크로 그린 듯. 지나온 방은 체크, 지나온 길은 빛나는 발자취, 지금 위치는 핀.
 * 갈 수 있는 이웃 방은 길이 금빛으로 흐르고, 등불이 어두워질수록 먼 방은 어둠에 묻힌다.
 */
export function MapView({ target, walking, onRoom, onTip }: { target: number | null; walking: number | null; onRoom: (id: number) => void; onTip: (r: Room) => void }) {
  const run = store.run!;
  const f = run.floor!;
  const here = f.rooms[f.pos];
  const dist = distances(f, f.pos);
  const stalker = f.stalker?.active ? f.stalker : null;
  const origin = ORIGINS.get(run.origin);

  const key = floorKey(f);
  if (drawn.key !== key) drawn = { key, ids: new Set() };
  const fresh = new Set(f.rooms.filter((r) => r.seen && !drawn.ids.has(r.id)).map((r) => r.id));
  useEffect(() => {
    for (const r of f.rooms) if (r.seen) drawn.ids.add(r.id);
  });

  // 방의 중심 (SVG 단위: 한 칸 = 100)
  const X = (r: Room) => r.x * 100 + 50 + (hash(r.id, f.start, 1) - 0.5) * 2 * JITTER;
  const Y = (r: Room) => r.y * 100 + 50 + (hash(r.id, f.start, 2) - 0.5) * 2 * JITTER;
  const px = (r: Room) => X(r) / f.w;
  const py = (r: Room) => Y(r) / f.h;
  /** 두 방을 잇는 살짝 굽은 길 (어느 쪽에서 그려도 같은 곡선) */
  const road = (a: Room, b: Room) => {
    const [p, q] = a.id < b.id ? [a, b] : [b, a];
    const mx = (X(p) + X(q)) / 2;
    const my = (Y(p) + Y(q)) / 2;
    const dx = X(q) - X(p);
    const dy = Y(q) - Y(p);
    const len = Math.hypot(dx, dy) || 1;
    const k = (hash(p.id, q.id, 3) - 0.5) * 2 * BEND;
    const cx = mx - (dy / len) * k;
    const cy = my + (dx / len) * k;
    return `M${X(a).toFixed(1)} ${Y(a).toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${X(b).toFixed(1)} ${Y(b).toFixed(1)}`;
  };

  // 지나온 길: 이어진 방끼리만 (오래된 길일수록 옅게)
  const trail = (f.trail ?? []).filter((id) => f.rooms[id]);
  const steps: [Room, Room][] = [];
  for (let i = 1; i < trail.length; i++) {
    const a = f.rooms[trail[i - 1]];
    const b = f.rooms[trail[i]];
    if (a.id !== b.id && a.links.includes(b.id)) steps.push([a, b]);
  }

  const lamp = lanternDark(run.light);
  const pinRoom = walking !== null ? f.rooms[walking] : here;
  // 등불이 닿는 정도: 지금 방에서 멀수록 어둠에 묻힌다
  const fade = (r: Room) => {
    const d = Math.hypot(r.x - pinRoom.x, r.y - pinRoom.y);
    return Math.max(0.26, Math.min(1, 1 - (d - lamp.reach) * 0.32));
  };

  // 화면 전체 어둠의 중심을 핀 위치에 맞춘다
  const field = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = field.current;
      const scr = el?.closest('.screen') as HTMLElement | null;
      if (!el || !scr) return;
      const a = el.getBoundingClientRect();
      const s = scr.getBoundingClientRect();
      scr.style.setProperty('--lx', `${((a.left + (px(pinRoom) / 100) * a.width - s.left) / s.width) * 100}%`);
      scr.style.setProperty('--ly', `${((a.top + (py(pinRoom) / 100) * a.height - s.top) / s.height) * 100}%`);
      scr.style.setProperty('--lr', `${Math.round(a.width * lamp.radius)}px`);
      scr.style.setProperty('--dark', String(lamp.edge));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [pinRoom.id, run.light, key]);

  // 핀이 걸어간 뒤 살짝 튀어 오르는 연출
  const pinRef = useRef<HTMLDivElement>(null);
  const lastPos = useRef(pinRoom.id);
  useEffect(() => {
    if (lastPos.current !== pinRoom.id && pinRef.current) {
      const el = pinRef.current;
      el.classList.remove('land');
      void el.offsetWidth;
      el.classList.add('land');
    }
    lastPos.current = pinRoom.id;
  }, [pinRoom.id]);

  const seen = f.rooms.filter((r) => r.seen);
  const vb = `0 0 ${f.w * 100} ${f.h * 100}`;

  return (
    <div class="map-wrap">
      <div class="map-field" ref={field} style={{ aspectRatio: `${f.w} / ${f.h}` }}>
        {/* 드러난 곳 뒤에 깔리는 옅은 먹물 안개 (배경 그림 위에서도 길과 방이 읽히게) */}
        <svg class="mist" viewBox={vb} preserveAspectRatio="none">
          <defs>
            <filter id="mist-blur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="30" />
            </filter>
          </defs>
          <g filter="url(#mist-blur)">
            {seen.map((r) => (
              <circle cx={X(r)} cy={Y(r)} r={r.visited ? 78 : 62} />
            ))}
          </g>
        </svg>

        <svg class="corridors" viewBox={vb} preserveAspectRatio="none">
          {seen.flatMap((r) =>
            r.links
              .filter((l) => l > r.id && f.rooms[l].seen)
              .map((l) => {
                const o = f.rooms[l];
                const walked = r.visited && o.visited;
                const d = road(r, o);
                return (
                  <g style={{ opacity: (fade(r) + fade(o)) / 2 }}>
                    <path class="road-under" d={d} />
                    <path class={`road ${walked ? 'walked' : ''}`} d={d} />
                  </g>
                );
              }),
          )}
          <g class="trails">
            {steps.map(([a, b], i) => (
              <path class="trail" style={{ opacity: 0.25 + 0.75 * ((i + 1) / steps.length) }} d={road(a, b)} />
            ))}
          </g>
          {walking === null &&
            here.links
              .filter((l) => f.rooms[l].seen)
              .map((l) => <path class={`road next ${target === l ? 'picked' : ''}`} d={road(here, f.rooms[l])} />)}
        </svg>

        {seen.map((r) => {
          const adj = walking === null && here.links.includes(r.id);
          const cur = r.id === f.pos;
          const showStalker = stalker && stalker.room === r.id && (dist[r.id] <= 3 || r.visited);
          const known = r.scouted || r.rift;
          const icon = r.rift ? 'gi:magic-portal' : r.scouted ? ROOM_ICON[r.type] : 'gi:help';
          const color = r.rift ? '#c08cff' : r.scouted ? ROOM_COLOR[r.type] : '#a89878';
          // 다녀간 방은 체크 (상인·신전처럼 다시 쓸 수 있는 곳은 체크만 하고 색은 살린다)
          const done = r.visited && !cur;
          const reusable = r.type === 'merchant' || r.type === 'shrine' || r.type === 'portal' || (r.type === 'camp' && !r.cleared);
          const empty = r.scouted && r.type === 'empty' && !r.rift;
          return (
            <button
              key={r.id}
              class={`mroom ${cur ? 'cur' : ''} ${adj ? 'adj' : ''} ${known ? '' : 'unknown'} ${empty ? 'empty' : ''} ${done && !reusable ? 'done' : ''} ${r.rift ? 'rift' : ''} ${target === r.id ? 'target' : ''} ${fresh.has(r.id) ? 'fresh' : ''}`}
              style={`left:${px(r)}%;top:${py(r)}%;--rc:${color};--fade:${adj || cur || target === r.id ? 1 : fade(r)}`}
              aria-label={r.scouted ? r.type : '알 수 없는 방'}
              {...press(() => (adj && !store.busy ? onRoom(r.id) : onTip(r)), () => onTip(r))}
            >
              {empty ? <i class="dot" /> : <Icon name={icon} size={known ? 21 : 15} color={color} />}
              {done && (
                <span class="chk">
                  <Icon name="gi:check-mark" size={9} color="#1a1208" />
                </span>
              )}
              {(r.flooded || r.inverted || (r.meteor !== undefined && !f.vars['meteor' + r.id]) || (r.frozen !== undefined && !r.cleared)) && (
                <span class="mods">
                  {r.flooded && (f.act === 2 ? <Icon name="gi:burning-embers" size={10} color="#c9a27a" /> : <Icon name="gi:water-drop" size={10} color="#6fb6ea" />)}
                  {r.inverted && r.scouted && <Icon name="gi:cycle" size={10} color="#ff80c0" />}
                  {r.meteor !== undefined && !f.vars['meteor' + r.id] && <Icon name="gi:burning-meteor" size={10} color="#ff9a4a" />}
                  {r.frozen !== undefined && !r.cleared && (f.hours < r.frozen ? <Icon name="gi:ice-cube" size={10} color="#9fd8ff" /> : <Icon name="gi:melting-ice-cube" size={10} color="#ff8a6a" />)}
                </span>
              )}
              {showStalker && (
                <span class="stalker">
                  <Icon name="gi:evil-eyes" size={15} color="#ff3040" />
                </span>
              )}
            </button>
          );
        })}

        <div class="you" style={{ left: `${px(pinRoom)}%`, top: `${py(pinRoom)}%` }}>
          <div class="pin" ref={pinRef}>
            <i class="drop" />
            <Icon name={origin?.icon ?? 'gi:hood'} size={15} color="#2a1a06" />
          </div>
        </div>
      </div>
    </div>
  );
}
