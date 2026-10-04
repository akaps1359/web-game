import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import ICONS from 'virtual:icons';
import { store, type Tip } from '../state/store';
import type { Seg } from './text';

export function Icon({ name, size = 22, color, class: cls, style }: { name: string; size?: number; color?: string; class?: string; style?: Record<string, string | number> }) {
  const svg = ICONS[name.replace(/^gi:/, '')] ?? ICONS['help'] ?? '';
  return <span class={`ic ${cls ?? ''}`} style={{ width: size, height: size, color, ...style }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** 탭 / 길게 누르기 */
export function press(onTap?: () => void, onLong?: () => void) {
  let timer = 0;
  let fired = false;
  let sx = 0;
  let sy = 0;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
  };
  return {
    onPointerDown(e: PointerEvent) {
      fired = false;
      sx = e.clientX;
      sy = e.clientY;
      clear();
      if (onLong)
        timer = window.setTimeout(() => {
          fired = true;
          timer = 0;
          onLong();
          if (navigator.vibrate) navigator.vibrate(10);
        }, 380);
    },
    onPointerMove(e: PointerEvent) {
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 12) clear();
    },
    onPointerUp() {
      const had = !!timer || !onLong;
      clear();
      if (!fired && had) onTap?.();
    },
    onPointerCancel: clear,
    onContextMenu(e: Event) {
      e.preventDefault();
    },
  };
}

export function showTip(t: Tip) {
  store.tip = t;
  store.emit();
}

export function TipView() {
  const t = store.tip;
  if (!t) return null;
  const close = () => {
    store.tip = null;
    store.emit();
  };
  return (
    <div class="veil" style={{ background: 'rgba(0,0,0,0.35)', alignItems: 'flex-end' }} onClick={close}>
      <div class="tip panel" onClick={close}>
        <div class="tip-head">
          {t.icon && <Icon name={t.icon} size={34} color={t.color ?? 'var(--brass-2)'} />}
          <div>
            <div class="t" style={{ color: t.color }}>
              {t.title}
            </div>
            {t.sub && <div class="s">{t.sub}</div>}
          </div>
        </div>
        <div class="tip-body">{t.body}</div>
        {t.lines && (
          <div class="tip-lines">
            {t.lines.map((l) => (
              <div>
                <span class="muted">{l.label}</span>
                <span style={{ color: l.color }}>{l.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Bar({ kind, value, max, label, block = 0 }: { kind: 'hp' | 'san'; value: number; max: number; label?: string; block?: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div class={`bar ${kind} ${block > 0 ? 'block-on' : ''}`}>
      <i class="lag" style={{ width: `${pct}%` }} />
      <i class="val" style={{ width: `${pct}%` }} />
      <span>{label ?? `${value}/${max}`}</span>
    </div>
  );
}

export function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s) => (s.k ? <b class={s.k === 'num' ? 'kv' : s.k}>{s.t}</b> : s.t))}
    </>
  );
}

export function Sheet({ title, onClose, children, icon }: { title: string; onClose: () => void; children: ComponentChildren; icon?: string }) {
  return (
    <div class="veil" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          {icon && <Icon name={icon} size={24} color="var(--brass-2)" />}
          <h2 class="title grow">{title}</h2>
          <button class="iconbtn" onClick={onClose} aria-label="닫기">
            <Icon name="gi:cross-mark" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  return (
    <div class="toasts">
      {store.toasts.map((t) => (
        <div key={t.id} class={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Stat({ icon, color, value, sub, onClick }: { icon: string; color: string; value: string | number; sub?: string; onClick?: () => void }) {
  return (
    <button class="stat" onClick={onClick}>
      <Icon name={icon} size={16} color={color} />
      <span class="num" style={{ color }}>
        {value}
      </span>
      {sub && <span class="muted" style={{ fontSize: 11 }}>{sub}</span>}
    </button>
  );
}
