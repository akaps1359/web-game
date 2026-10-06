import './styles/main.css';
import './styles/screens.css';
import './content';
import { render } from 'preact';
import { App } from './ui/App';
import { stage } from './render/stage';
import { refresh } from './state/actions';
import { sound } from './sound';
import { attachAudio } from './audioBridge';
import { setOnLook } from './render/battle';
import { store } from './state/store';
import { TRACKS } from './state/prefetch';

// iOS: 핀치 확대 / 길게 눌러 선택 방지
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// 오디오는 첫 터치에서 잠금 해제 (iOS는 touchend/click 제스처가 확실함)
for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, () => void sound.unlock(), { capture: true });

// 누를 수 있는 것은 무엇이든 누르는 순간 짧은 소리 (눌렸는지 바로 알 수 있게). 막힌 단추는 둔탁한 소리
const PRESSABLE = 'button, a, [role="button"], .card, .chip, .tab, .skill-tile, .room, .slot-item, .enemy-hit, .skill, .chip-anom, .st';
document.addEventListener(
  'pointerdown',
  (e) => {
    const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
    if (!el) return;
    const off = (el as HTMLButtonElement).disabled || el.classList.contains('off') || el.getAttribute('aria-disabled') === 'true';
    sound.sfx(off ? 'error' : 'click', { volume: off ? 0.25 : 0.45 });
  },
  { capture: true, passive: true },
);

/** 핵심 장면은 실제 음원 (OpenGameArt, CC0) */
function registerTracks(audio: { registerTrack(mood: string, url: string, opts?: { act?: number; volume?: number }): void }) {
  audio.registerTrack('title', TRACKS.title);
  audio.registerTrack('boss', TRACKS.boss);
  audio.registerTrack('boss', TRACKS.final, { act: 5 });
  audio.registerTrack('haven', TRACKS.haven);
}

/** 첫 화면(index.html)을 걷어낸다 */
function hideSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('gone')) return;
  el.classList.add('gone');
  setTimeout(() => el.remove(), 700);
}

async function boot() {
  // 무슨 일이 있어도 오래 가리고 있지는 않게
  setTimeout(hideSplash, 6000);
  render(<App />, document.getElementById('app')!);
  // 적 그림이 늦게 불러와지면 의도 표시 위치를 다시 잡는다
  setOnLook(() => store.emit());
  if (import.meta.env.DEV) {
    // 개발용 디버그 핸들 (브라우저 콘솔에서 상태 확인)
    const [{ store }, actions, textures] = await Promise.all([import('./state/store'), import('./state/actions'), import('./render/textures')]);
    (window as unknown as { __game: unknown }).__game = { store, actions, stage, textures };
  }
  try {
    await stage.init(document.getElementById('stage')!);
  } catch (err) {
    console.error('그래픽 초기화 실패', err);
  }
  const mods = import.meta.glob('./audio/index.ts');
  const load = mods['./audio/index.ts'];
  if (load) {
    load()
      .then((m) => {
        const audio = (m as { audio?: Parameters<typeof attachAudio>[0] & Parameters<typeof registerTracks>[0] }).audio;
        if (audio) {
          registerTracks(audio);
          attachAudio(audio);
        }
        void refresh();
      })
      .catch((err) => console.warn('오디오 모듈을 불러오지 못함', err));
  }
  await refresh();
  // 그래픽과 첫 화면이 준비된 뒤에 걷어낸다 (배경이 비어 보이지 않게)
  requestAnimationFrame(hideSplash);
}

void boot();
