import './styles/main.css';
import './styles/screens.css';
import './content';
import { render } from 'preact';
import { App } from './ui/App';
import { stage } from './render/stage';
import { refresh } from './state/actions';
import { sound } from './sound';
import { attachAudio } from './audioBridge';

// iOS: 핀치 확대 / 길게 눌러 선택 방지
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// 오디오는 첫 터치에서 잠금 해제
document.addEventListener('pointerdown', () => void sound.unlock(), { capture: true });

async function boot() {
  render(<App />, document.getElementById('app')!);
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
        const audio = (m as { audio?: Parameters<typeof attachAudio>[0] }).audio;
        if (audio) attachAudio(audio);
        void refresh();
      })
      .catch((err) => console.warn('오디오 모듈을 불러오지 못함', err));
  }
  await refresh();
}

void boot();
