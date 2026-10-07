import { useState } from 'preact/hooks';
import { ORIGINS, SKILLS, EQUIPS } from '../../engine/registry';
import { continueGame, newGame } from '../../state/actions';
import { hasSave } from '../../state/save';
import { store } from '../../state/store';
import { sound } from '../../sound';
import { Icon } from '../components';
import { SCHOOL_COLOR, SCHOOL_NAME, josa } from '../text';
import { confirmThen } from '../ask';
import { AbyssPicker } from '../abyss';
import { MAX_ASC } from '../../engine/abyss';

export function Title() {
  const [mode, setMode] = useState<'main' | 'origin'>('main');
  const meta = store.meta;
  // 처음엔 열린 가장 깊은 단계를 고른다
  const [pick, setAsc] = useState(() => Math.max(0, Math.min(MAX_ASC, meta.abyss)));
  const asc = Math.min(pick, meta.abyss);
  const unlock = () => void sound.unlock();

  if (mode === 'origin') {
    const picker = <AbyssPicker value={asc} max={Math.min(MAX_ASC, meta.abyss)} onChange={setAsc} />;
    const startBody = (save: boolean) => [asc > 0 ? `심연 ${asc}단계예요. 규칙 ${asc}개가 켜져요.` : '', save ? '저장된 여정은 사라져요.' : ''].filter(Boolean).join('\n') || undefined;
    return (
      <div class="screen" onPointerDown={unlock}>
        <div class="sheet-head" style={{ padding: '14px 14px 4px' }}>
          <button class="iconbtn" onClick={() => setMode('main')} aria-label="뒤로">
            <Icon name="gi:return-arrow" size={18} />
          </button>
          <h2 class="title grow">출신 선택</h2>
        </div>
        <div class="scroll" style={{ flex: 1, padding: '6px 14px' }}>
          {/* 심연 단계가 하나라도 열렸으면 먼저 고른다 (출신을 누르면 바로 시작 확인 창이 뜨므로) */}
          {meta.abyss > 0 && <div style={{ marginBottom: 12 }}>{picker}</div>}
          <div class="list">
            {[...ORIGINS.values()].map((o) => {
              const locked = !meta.unlocked.includes(o.id);
              return (
                <button class={`card ${locked ? 'off' : ''}`} style={{ padding: 14 }} onClick={() => !locked && confirmThen({ title: `${o.name}${josa(o.name, '으로')} 여정을 시작할까요?`, icon: o.icon, body: startBody(hasSave()), ok: '시작한다', danger: hasSave() }, () => newGame(o.id, asc))}>
                  <div class="badge" style={{ width: 56, height: 56 }}>
                    <Icon name={locked ? 'gi:padlock' : o.icon} size={34} color={locked ? 'var(--ink-3)' : 'var(--brass-2)'} />
                  </div>
                  <div class="body">
                    <div class="name serif" style={{ fontSize: 18 }}>
                      {o.name}
                    </div>
                    <div class="meta">
                      체력 {o.hp} · 정신력 {o.sanity} · {o.schools.map((s) => SCHOOL_NAME[s]).join('/')}
                    </div>
                    <div class="desc">{locked ? o.unlock : o.desc}</div>
                    {!locked && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {[o.equip.weapon, o.equip.armor].filter(Boolean).map((id) => (
                          <span class="chip">
                            <Icon name={EQUIPS.get(id!)!.icon} size={13} />
                            {EQUIPS.get(id!)!.name}
                          </span>
                        ))}
                        {o.skills.map((id) => {
                          const s = SKILLS.get(id)!;
                          return (
                            <span class="chip" style={{ color: SCHOOL_COLOR[s.school] }}>
                              <Icon name={s.icon} size={13} />
                              {s.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {/* 아직 아무 단계도 열리지 않았으면 아래에 둔다 (판을 깨면 열린다는 것만 알린다) */}
          {meta.abyss <= 0 && <div style={{ margin: '14px 0 8px' }}>{picker}</div>}
        </div>
      </div>
    );
  }

  const save = hasSave();
  return (
    <div class="screen" onPointerDown={unlock}>
      <div class="screen-center" style={{ justifyContent: 'flex-end', paddingBottom: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 'auto', marginTop: '18vh' }}>
          <div class="title" style={{ fontSize: 58, color: '#e8f8f0', textShadow: '0 0 24px rgba(79,255,196,0.45), 0 4px 18px #000' }}>
            심연행
          </div>
          <div class="num" style={{ letterSpacing: '0.5em', color: 'var(--eldritch)', opacity: 0.75, fontSize: 13, marginTop: 4 }}>
            ABYSSBOUND
          </div>
          <div class="muted serif" style={{ marginTop: 18, fontSize: 14 }}>
            안개 낀 항구 아래, 태어나지 않은 것이 꿈을 꾼다
          </div>
        </div>
        {save && (
          <button class="btn wide" onClick={() => continueGame()}>
            <Icon name="gi:footsteps" size={18} />
            이어하기
          </button>
        )}
        <button class={`btn wide ${save ? 'ghost' : ''}`} onClick={() => setMode('origin')}>
          <Icon name="gi:dungeon-gate" size={18} />
          새로운 여정
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button class="btn ghost" style={{ flex: 1 }} onClick={() => ((store.sheet = { kind: 'codex' }), store.emit())}>
            <Icon name="gi:book-cover" size={18} />
            도감
          </button>
          <button class="btn ghost" style={{ flex: 1 }} onClick={() => ((store.sheet = { kind: 'settings' }), store.emit())}>
            <Icon name="gi:settings-knobs" size={18} />
            설정
          </button>
        </div>
        <div class="muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 6 }}>
          여정 {meta.runs}회 · 귀환 {meta.wins}회 · 최고 {meta.bestAct}층
        </div>
      </div>
    </div>
  );
}
