import { ENEMIES, ESSENCES } from '../../engine/registry';
import { store } from '../../state/store';
import { Icon, Sheet, showTip } from '../components';
import { DMG_COLOR, DMG_NAME } from '../text';

export function CodexSheet() {
  const close = () => {
    store.sheet = null;
    store.emit();
  };
  const codex = store.meta.codex;
  const enemies = [...ENEMIES.values()].filter((e) => e.tier !== 'minion');
  const known = enemies.filter((e) => codex[e.id]);
  return (
    <Sheet title={`도감 ${known.length}/${enemies.length}`} icon="gi:book-cover" onClose={close}>
      <div class="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        한 번 알아낸 약점은 다음 여정에서도 처음부터 보인다.
      </div>
      <div class="scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, flex: 1 }}>
        {enemies.map((e) => {
          const rec = codex[e.id];
          return (
            <button
              class="card"
              style={{ flexDirection: 'column', alignItems: 'center', padding: 8, gap: 4, opacity: rec ? 1 : 0.35 }}
              onClick={() =>
                rec
                  ? showTip({
                      title: e.name,
                      icon: e.icon,
                      sub: `${e.act}층 · ${e.tier === 'boss' ? '수호자' : e.tier === 'elite' ? '정예' : '일반'}`,
                      body: e.desc ?? '',
                      lines: [
                        { label: '처치', value: `${rec.kills}` },
                        { label: '알아낸 약점', value: rec.weak.length ? rec.weak.map((w) => DMG_NAME[w]).join(', ') : '없음' },
                        { label: '정수', value: ESSENCES.has(e.id) ? (store.meta.essences.includes(e.id) ? '흡수한 적 있음' : '있음') : '없음' },
                      ],
                    })
                  : showTip({ title: '???', icon: 'gi:help', body: '아직 만나지 못한 존재.' })
              }
            >
              <Icon name={rec ? e.icon : 'gi:help'} size={32} color={rec ? (e.eldritch ? '#4fffc4' : '#d8cfbf') : '#555'} />
              <span style={{ fontSize: 10.5, textAlign: 'center', lineHeight: 1.2 }}>{rec ? e.name : '???'}</span>
              {rec && rec.weak.length > 0 && (
                <span style={{ display: 'flex', gap: 2 }}>
                  {rec.weak.map((w) => (
                    <i style={{ width: 6, height: 6, borderRadius: 3, background: DMG_COLOR[w] }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
