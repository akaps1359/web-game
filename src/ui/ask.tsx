import type { ComponentChildren } from 'preact';
import { store } from '../state/store';
import { sound } from '../sound';
import { Icon } from './components';
import { apply } from '../state/actions';

/** 행동 확인 창 — 사고, 고르고, 떠나는 모든 행동 전에 한 번 묻는다 (설정에서 끌 수 있음) */
export interface Ask {
  title: string;
  body?: ComponentChildren;
  icon?: string;
  color?: string;
  lines?: { label: string; value: string; color?: string }[];
  /** 확인 단추 글자 (기본 '확인') */
  ok?: string;
  danger?: boolean;
  /** 설정에서 확인 창을 꺼도 묻는다 (되돌릴 수 없는 큰 결정) */
  always?: boolean;
}

let pending: { ask: Ask; resolve: (ok: boolean) => void } | null = null;

export function ask(a: Ask): Promise<boolean> {
  if (!a.always && store.meta.confirm === false) return Promise.resolve(true);
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ask: a, resolve };
    store.emit();
  });
}

/** 확인을 받은 뒤에만 실행한다 */
export async function confirmThen(a: Ask, fn: () => unknown): Promise<void> {
  if (await ask(a)) await fn();
}

export function AskView() {
  if (!pending) return null;
  const { ask: a, resolve } = pending;
  const done = (ok: boolean) => {
    pending = null;
    sound.sfx('click', { volume: 0.5 });
    resolve(ok);
    store.emit();
  };
  return (
    <div class="veil" style={{ zIndex: 70, alignItems: 'center' }} onClick={() => done(false)}>
      <div class="panel ask" onClick={(e) => e.stopPropagation()}>
        <div class="tip-head">
          {a.icon && <Icon name={a.icon} size={34} color={a.color ?? (a.danger ? 'var(--bad)' : 'var(--brass-2)')} />}
          <div class="t" style={{ color: a.color }}>
            {a.title}
          </div>
        </div>
        {a.body && <div class="tip-body">{a.body}</div>}
        {a.lines && (
          <div class="tip-lines">
            {a.lines.map((l) => (
              <div>
                <span class="muted">{l.label}</span>
                <span style={{ color: l.color }}>{l.value}</span>
              </div>
            ))}
          </div>
        )}
        <div class="ask-btns">
          <button class="btn ghost" onClick={() => done(false)}>
            취소
          </button>
          <button class={`btn ${a.danger ? 'danger' : ''}`} onClick={() => done(true)}>
            {a.ok ?? '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 확인을 받은 뒤 상태를 바꾼다 (actions.apply와 같은 꼴) */
export function applyAsk(a: Ask, fn: Parameters<typeof apply>[0], okMsg?: string): Promise<void> {
  return confirmThen(a, () => apply(fn, okMsg));
}
