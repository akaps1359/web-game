import { useState } from 'preact/hooks';
import { ORIGINS, SKILLS, EQUIPS } from '../../engine/registry';
import { continueGame, newGame } from '../../state/actions';
import { hasSave } from '../../state/save';
import { store } from '../../state/store';
import { sound } from '../../sound';
import { Icon } from '../components';
import { SCHOOL_COLOR, SCHOOL_NAME } from '../text';

export function Title() {
  const [mode, setMode] = useState<'main' | 'origin'>('main');
  const [asc, setAsc] = useState(0);
  const meta = store.meta;
  const unlock = () => void sound.unlock();

  if (mode === 'origin') {
    return (
      <div class="screen" onPointerDown={unlock}>
        <div class="sheet-head" style={{ padding: '14px 14px 4px' }}>
          <button class="iconbtn" onClick={() => setMode('main')} aria-label="뒤로">
            <Icon name="gi:arrow-cursor" size={18} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <h2 class="title grow">출신을 고르세요</h2>
        </div>
        <div class="scroll" style={{ flex: 1, padding: '6px 14px' }}>
          <div class="list">
            {[...ORIGINS.values()].map((o) => {
              const locked = !meta.unlocked.includes(o.id);
              return (
                <button class={`card ${locked ? 'off' : ''}`} style={{ padding: 14 }} onClick={() => !locked && newGame(o.id, asc)}>
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
          {meta.abyss > 0 && (
            <div class="panel" style={{ marginTop: 14, padding: 12 }}>
              <div class="section-label" style={{ margin: '0 0 8px' }}>
                심연 단계
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button class="btn sm ghost" onClick={() => setAsc(Math.max(0, asc - 1))}>
                  −
                </button>
                <div class="num" style={{ fontSize: 22, color: 'var(--eldritch)', minWidth: 30, textAlign: 'center' }}>
                  {asc}
                </div>
                <button class="btn sm ghost" onClick={() => setAsc(Math.min(meta.abyss, asc + 1))}>
                  +
                </button>
                <div class="muted" style={{ fontSize: 12, flex: 1 }}>
                  {ascText(asc)}
                </div>
              </div>
            </div>
          )}
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

function ascText(n: number): string {
  if (n === 0) return '기본 난이도';
  const parts = ['적 피해 +10%'];
  if (n >= 7) parts.push('적 체력 +10%');
  if (n >= 15) parts.push('정예·수호자 체력 추가 +10%');
  return parts.join(', ');
}
