import { useState } from 'preact/hooks';
import { abandonRun, toTitle } from '../../state/actions';
import { blankMeta, clearRestorePoint, loadRestorePoint, restoredMeta, saveMeta, saveRestorePoint, unlockAllInfo } from '../../state/meta';
import { ORIGINS } from '../../engine/registry';
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
  const restore = loadRestorePoint();
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
                confirmThen({ title: '이번 여정을 포기할까요?', icon: 'gi:broken-skull', body: '되돌릴 수 없어요.', ok: '포기한다', danger: true, always: true }, () => {
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
          <button
            class="btn ghost"
            onClick={() =>
              confirmThen(
                { title: '모든 정보를 해금할까요?', icon: 'gi:book-cover', body: '도감(적·장비·정수·스킬·유물)과 약점, 최고 층, 심연 단계를 전부 열어요. 지금 기록은 따로 기억해 두어 되돌릴 수 있어요.', ok: '해금' },
                () => (unlockInfo(), force((x) => x + 1)),
              )
            }
          >
            모든 정보 해금
          </button>
          <button class="btn ghost" onClick={() => confirmThen({ title: '모든 캐릭터를 해금할까요?', icon: 'gi:padlock-open', body: '지금 기록은 따로 기억해 두어 되돌릴 수 있어요.', ok: '해금' }, () => (unlockOrigins(), force((x) => x + 1)))}>
            캐릭터 해금
          </button>
          <button
            class="btn ghost"
            onClick={() =>
              confirmThen(
                { title: '지금 기록을 기억할까요?', icon: 'gi:save', body: restore ? '이미 기억해 둔 기록을 지금 기록으로 바꿔요.' : '해금·초기화로 시험해 본 뒤 이 상태로 돌아올 수 있어요.', ok: '기억한다' },
                () => (remember(), force((x) => x + 1)),
              )
            }
          >
            지금 기록 기억하기
          </button>
          <button
            class="btn ghost"
            disabled={!restore}
            onClick={() =>
              restore &&
              confirmThen(
                { title: '기억한 기록으로 되돌릴까요?', icon: 'gi:backward-time', body: `${when(restore.at)}에 기억한 상태로 돌아가요. 그 뒤에 쌓인 기록(해금·도감·여정 횟수)은 사라져요. 진행 중인 여정과 설정은 그대로예요.`, ok: '되돌린다', always: true },
                () => (restoreMeta(), force((x) => x + 1)),
              )
            }
          >
            기억한 기록으로 되돌리기
          </button>
          <button
            class="btn danger"
            style={{ gridColumn: '1 / -1' }}
            onClick={() =>
              confirmThen(
                {
                  title: '모든 기록을 초기화할까요?',
                  icon: 'gi:trash-can',
                  body: '도감, 해금한 캐릭터, 여정 횟수, 본 도움말이 처음 상태로 돌아가요. 설정(속도·확인 창)은 남아요.' + (restore ? '' : ' 지금 기록은 자동으로 기억해 두어 되돌릴 수 있어요.'),
                  ok: '초기화',
                  danger: true,
                  always: true,
                },
                () => (resetMeta(), force((x) => x + 1)),
              )
            }
          >
            전체 초기화
          </button>
        </div>
        <div class="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          {restore ? `기억해 둔 기록: ${when(restore.at)} · 여정 ${restore.meta.runs}번 · 도감 ${Object.keys(restore.meta.codex).length}종` : '기억해 둔 기록 없음. 해금이나 초기화를 하면 그 전 기록을 자동으로 기억한다.'}
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

/** 해금·초기화 전에, 아직 기억해 둔 게 없으면 지금 기록을 기억한다 (나중에 되돌릴 수 있게) */
function keepOriginal() {
  if (!loadRestorePoint()) saveRestorePoint(store.meta);
}

function when(at: number): string {
  const d = new Date(at);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours() < 12 ? '오전' : '오후'} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function unlockInfo() {
  keepOriginal();
  unlockAllInfo(store.meta);
  saveMeta(store.meta);
  store.toast('모든 정보를 해금했다', 'good');
}

function unlockOrigins() {
  keepOriginal();
  store.meta.unlocked = [...ORIGINS.keys()];
  saveMeta(store.meta);
  store.toast('모든 캐릭터를 해금했다', 'good');
}

function remember() {
  saveRestorePoint(store.meta);
  store.toast('지금 기록을 기억했다', 'good');
}

function restoreMeta() {
  const r = loadRestorePoint();
  if (!r) return;
  store.meta = restoredMeta(store.meta, r.meta);
  saveMeta(store.meta);
  clearRestorePoint();
  store.toast('기억한 기록으로 되돌렸다', 'good');
}

function resetMeta() {
  keepOriginal();
  store.meta = blankMeta(store.meta);
  saveMeta(store.meta);
  store.toast('기록을 초기화했다', 'info');
}
