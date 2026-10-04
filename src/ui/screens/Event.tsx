import { eventView } from '../../engine/events';
import { eventChoose, eventLeave } from '../../state/actions';
import { store } from '../../state/store';
import { Icon } from '../components';
import { RunHud } from '../Hud';

export function EventScreen() {
  const run = store.run!;
  const view = eventView(run);
  if (!view) return <div class="screen" />;
  const done = run.event?.done;
  return (
    <div class="screen">
      <RunHud />
      <div class="scroll" style={{ flex: 1, padding: '16px 16px 8px' }}>
        <div class="hero-icon">
          <Icon name={view.icon} size={56} color="#d8c8a8" />
        </div>
        <h2 class="title" style={{ textAlign: 'center', margin: '12px 0 14px' }}>
          {view.title}
        </h2>
        <div class="flavor panel" style={{ padding: 16 }}>
          {view.text}
        </div>
        <div class="list" style={{ marginTop: 14 }}>
          {view.choices.map((ch, i) => (
            <button class={`btn wide choice-btn ${ch.disabled ? 'off' : ''}`} onClick={() => eventChoose(i)}>
              <span>{ch.label}</span>
              {(ch.hint || ch.disabled) && <span class="hint">{ch.disabled || ch.hint}</span>}
            </button>
          ))}
        </div>
      </div>
      {done && (
        <div class="footer">
          <button class="btn wide" onClick={() => eventLeave()}>
            {run.event?.fight ? '맞서 싸운다' : '계속'}
          </button>
        </div>
      )}
    </div>
  );
}
