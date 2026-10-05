import { useState } from 'preact/hooks';
import { abandonRun, toTitle } from '../../state/actions';
import { defaultMeta, saveMeta } from '../../state/meta';
import { ENEMIES, ESSENCES, ORIGINS, RELICS } from '../../engine/registry';
import { confirmThen } from '../ask';
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
        <button
          class="btn ghost"
          onClick={() => {
            store.meta.confirm = !store.meta.confirm;
            saveMeta(store.meta);
            force((x) => x + 1);
          }}
        >
          행동 확인 창: {store.meta.confirm ? '켜짐' : '꺼짐'}
        </button>
        {inRun && (
          <>
            <button class="btn" onClick={() => confirmThen({ title: '저장하고 처음 화면으로 갈까요?', icon: 'gi:exit-door', ok: '나간다' }, () => (close(), toTitle()))}>
              저장하고 처음으로
            </button>
            <button
              class="btn danger"
              onClick={() =>
                confirmThen({ title: '이번 여정을 포기할까요?', icon: 'gi:broken-skull', body: '되돌릴 수 없다.', ok: '포기한다', danger: true, always: true }, () => {
                  close();
                  return abandonRun();
                })
              }
            >
              여정 포기
            </button>
          </>
        )}
        <div class="section-label" style={{ marginBottom: 0 }}>테스트용</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button class="btn ghost" onClick={() => confirmThen({ title: '모든 정보를 해금할까요?', icon: 'gi:book-cover', body: '도감의 모든 존재와 약점, 정수·유물 기록, 최고 층, 심연 단계를 전부 연다.', ok: '해금' }, () => (unlockInfo(), force((x) => x + 1)))}>
            모든 정보 해금
          </button>
          <button class="btn ghost" onClick={() => confirmThen({ title: '모든 캐릭터를 해금할까요?', icon: 'gi:padlock-open', ok: '해금' }, () => (unlockOrigins(), force((x) => x + 1)))}>
            캐릭터 해금
          </button>
          <button
            class="btn danger"
            style={{ gridColumn: '1 / -1' }}
            onClick={() =>
              confirmThen({ title: '모든 기록을 초기화할까요?', icon: 'gi:trash-can', body: '도감, 해금한 캐릭터, 여정 횟수, 본 도움말이 처음 상태로 돌아간다. 설정(속도·확인 창)은 남는다.', ok: '초기화', danger: true, always: true }, () => (resetMeta(), force((x) => x + 1)))
            }
          >
            기록 초기화
          </button>
        </div>
        <div class="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
          아이콘: game-icons.net (Lorc, Delapouite 외 기여자, CC BY 3.0)
          <br />
          음악: 「Haunting piano」 Emma_MA · 「Dramatic Boss Encounter」「Epic Endgame Cinematic」 cynicmusic · 「The Beach Where Dreams Die」 Chloe Wolfe (OpenGameArt, CC0). 그 외 음악·효과음은 실시간 생성
          <br />
          진행 상황은 이 기기의 브라우저에 자동 저장된다.
        </div>
      </div>
    </Sheet>
  );
}

// ───────── 테스트용 ─────────

function unlockInfo() {
  const m = store.meta;
  for (const [id, d] of ENEMIES) {
    const rec = (m.codex[id] ??= { seen: 0, kills: 0, weak: [] });
    rec.seen = Math.max(1, rec.seen);
    rec.kills = Math.max(1, rec.kills);
    rec.weak = [...new Set([...rec.weak, ...d.weak])];
  }
  m.essences = [...ESSENCES.keys()];
  m.relics = [...RELICS.keys()];
  m.bestAct = Math.max(m.bestAct, 5);
  m.abyss = Math.max(m.abyss, 15);
  saveMeta(m);
  store.toast('모든 정보를 해금했다', 'good');
}

function unlockOrigins() {
  store.meta.unlocked = [...ORIGINS.keys()];
  saveMeta(store.meta);
  store.toast('모든 캐릭터를 해금했다', 'good');
}

function resetMeta() {
  const { speed, confirm } = store.meta;
  store.meta = { ...defaultMeta(), speed, confirm };
  saveMeta(store.meta);
  store.toast('기록을 초기화했다', 'info');
}
