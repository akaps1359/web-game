import { useState } from 'preact/hooks';
import { abandonRun, toTitle } from '../../state/actions';
import { saveMeta } from '../../state/meta';
import { store } from '../../state/store';
import { audioSettings, setAudioSettings } from '../../audioBridge';
import { Sheet } from '../components';

export function SettingsSheet() {
  const [, force] = useState(0);
  const close = () => {
    store.sheet = null;
    saveMeta(store.meta);
    store.emit();
  };
  const a = audioSettings();
  const inRun = !!store.run && !store.run.over;
  return (
    <Sheet title="설정" icon="gi:settings-knobs" onClose={close}>
      <div class="scroll" style={{ display: 'grid', gap: 14, paddingBottom: 6 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>배경음악 {Math.round(a.music * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={a.music} onInput={(e) => (setAudioSettings({ music: Number((e.target as HTMLInputElement).value) }), force((x) => x + 1))} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>효과음 {Math.round(a.sfx * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={a.sfx} onInput={(e) => (setAudioSettings({ sfx: Number((e.target as HTMLInputElement).value) }), force((x) => x + 1))} />
        </label>
        <button class="btn ghost" onClick={() => (setAudioSettings({ muted: !a.muted }), force((x) => x + 1))}>
          {a.muted ? '소리 켜기' : '소리 끄기'}
        </button>
        <button
          class="btn ghost"
          onClick={() => {
            store.meta.speed = store.meta.speed === 1 ? 2 : 1;
            saveMeta(store.meta);
            force((x) => x + 1);
          }}
        >
          전투 연출 속도: x{store.meta.speed}
        </button>
        {inRun && (
          <>
            <button class="btn" onClick={() => (close(), toTitle())}>
              저장하고 처음으로
            </button>
            <button
              class="btn danger"
              onClick={() => {
                if (confirm('이번 여정을 포기할까요? 되돌릴 수 없습니다.')) {
                  close();
                  void abandonRun();
                }
              }}
            >
              여정 포기
            </button>
          </>
        )}
        <div class="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
          아이콘: game-icons.net (Lorc, Delapouite 외 기여자, CC BY 3.0)
          <br />
          진행 상황은 이 기기의 브라우저에 자동 저장된다.
        </div>
      </div>
    </Sheet>
  );
}
