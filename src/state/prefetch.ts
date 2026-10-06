import { distances } from '../engine/dungeon';
import { ENCOUNTERS, ENEMIES } from '../engine/registry';
import { FINAL_ACT, type RunState } from '../engine/run';
import { artTextures, hasArt } from '../render/textures';

/**
 * 미리 받아 두기: 지도에서 노는 동안 곧 만날 적 그림과 음악을 뒤에서 조용히 받아 둔다.
 * 전투가 시작될 때 그림이 늦게 뜨거나 보스 음악이 늦게 붙지 않게. 한 번에 하나씩, 브라우저가 한가할 때만.
 * 전투 중이거나 앱이 가려져 있거나 데이터 절약 모드면 쉰다.
 */

const base = import.meta.env.BASE_URL;
/** 실제 음원 (OpenGameArt, CC0) */
export const TRACKS = {
  title: `${base}audio/title-haunting-piano.mp3`,
  boss: `${base}audio/boss-dramatic-encounter.mp3`,
  final: `${base}audio/final-endgame-choir.mp3`,
  haven: `${base}audio/haven-beach-dreams.mp3`,
};

type Job = { kind: 'art'; key: string } | { kind: 'url'; url: string };
const queue: Job[] = [];
const fetched = new Set<string>();
let busy = false;
let paused = false;

function saveData(): boolean {
  return !!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
}

function whenIdle(f: () => void) {
  const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(f, { timeout: 1500 });
  else setTimeout(f, 150);
}

function same(a: Job, b: Job) {
  return a.kind === 'art' ? b.kind === 'art' && a.key === b.key : b.kind === 'url' && a.url === b.url;
}

function push(job: Job) {
  if (job.kind === 'url' && fetched.has(job.url)) return;
  if (queue.some((j) => same(j, job))) return;
  queue.push(job);
}

function pump() {
  if (busy || paused || !queue.length || document.hidden) return;
  busy = true;
  whenIdle(() => {
    if (paused || document.hidden) {
      busy = false;
      return;
    }
    const job = queue.shift()!;
    const done = () => {
      busy = false;
      pump();
    };
    if (job.kind === 'art') {
      artTextures(job.key).then(done, done);
    } else {
      fetched.add(job.url);
      fetch(job.url, { priority: 'low' } as RequestInit)
        .then((r) => r.arrayBuffer())
        .catch(() => fetched.delete(job.url))
        .finally(done);
    }
  });
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => pump());

/** 전투 중에는 쉰다 (그림 처리와 내려받기가 전투 연출을 방해하지 않게) */
export function pausePrefetch(on: boolean) {
  paused = on;
  if (!on) pump();
}

function encArt(encId: string, out: string[]) {
  const enc = ENCOUNTERS.find((e) => e.id === encId);
  for (const m of enc?.enemies ?? []) {
    if (hasArt(m.id)) out.push(m.id);
    // 변신하는 수호자는 다음 모습 그림도
    const def = ENEMIES.get(m.id);
    def?.forms?.forEach((_, i) => {
      const k = `${m.id}@${i + 2}`;
      if (hasArt(k)) out.push(k);
    });
  }
}

/** 지도 화면에서: 두 걸음 안에 보이는 방의 적, 포탈을 찾았으면 층 수호자와 그 음악, 포탈 앞이면 거점 음악 */
export function prefetchFloor(run: RunState) {
  const f = run.floor;
  if (!f || saveData()) return;
  const d = distances(f, f.pos);
  const near = f.rooms.filter((r) => r.enc && !r.cleared && r.scouted && d[r.id] <= 2).sort((a, b) => d[a.id] - d[b.id]);
  const keys: string[] = [];
  for (const r of near) encArt(r.enc!, keys);
  const portal = f.rooms[f.portal];
  if (portal?.seen && f.bossEnc) {
    encArt(f.bossEnc, keys);
    push({ kind: 'url', url: f.act >= FINAL_ACT ? TRACKS.final : TRACKS.boss });
  }
  for (const k of keys) push({ kind: 'art', key: k });
  if (f.pos === f.portal && f.act < FINAL_ACT) push({ kind: 'url', url: TRACKS.haven });
  pump();
}
