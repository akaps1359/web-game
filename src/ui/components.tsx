import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import ICONS from 'virtual:icons';
import { store, type Tip } from '../state/store';
import type { Seg } from './text';
import { keywordsIn } from './glossary';

export function Icon({ name, size = 22, color, class: cls, style }: { name: string; size?: number; color?: string; class?: string; style?: Record<string, string | number> }) {
  const svg = ICONS[name.replace(/^gi:/, '')] ?? ICONS['help'] ?? '';
  return <span class={`ic ${cls ?? ''}`} style={{ width: size, height: size, color, ...style }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * 탭은 pointerup에서 처리한다. 그 사이 확인 창·설명 창이 뜨면, 브라우저가 터치 뒤에 보내는 click이
 * 같은 자리에 새로 뜬 창(바깥 = 닫기, 단추 = 확인)을 눌러 버린다 (안드로이드 크롬 등).
 * 그래서 처리한 터치는 touchend를 막아 click이 생기지 않게 한다. 렌더마다 press()가 새로 만들어지므로 모듈에 둔다.
 */
let swallowClick = false;

/** 탭 / 길게 누르기 */
export function press(onTap?: () => void, onLong?: () => void) {
  let timer = 0;
  let fired = false;
  let sx = 0;
  let sy = 0;
  /** 안쪽의 다른 단추(빼기·해제 등)를 누른 것이면 바깥 카드의 탭/길게 누르기는 무시 */
  let inner = false;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
  };
  return {
    onPointerDown(e: PointerEvent) {
      fired = false;
      swallowClick = false;
      sx = e.clientX;
      sy = e.clientY;
      clear();
      const own = (e.target as Element | null)?.closest?.('button, a, .chip');
      inner = !!own && own !== e.currentTarget;
      if (inner) return;
      if (onLong)
        timer = window.setTimeout(() => {
          fired = true;
          swallowClick = true;
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
      if (!fired && had && !inner) {
        swallowClick = true;
        onTap?.();
      }
    },
    onTouchEnd(e: TouchEvent) {
      if (swallowClick && e.cancelable) e.preventDefault();
      swallowClick = false;
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
        <KeywordList text={t.body} exclude={t.title} />
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

export function Sheet({ title, onClose, children, icon, fixed }: { title: string; onClose: () => void; children: ComponentChildren; icon?: string; fixed?: boolean }) {
  return (
    <div class="veil" onClick={onClose}>
      <div class={`sheet ${fixed ? 'fixed' : ''}`} onClick={(e) => e.stopPropagation()}>
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

/** 설명에 나온 상태이상·규칙 용어 풀이 (길게 누른 설명, 확인 창 아래에 붙는다) */
export function KeywordList({ text, exclude }: { text: string; exclude?: string }) {
  const ks = keywordsIn(text, exclude).slice(0, 6);
  if (!ks.length) return null;
  return (
    <div class="kw-list">
      {ks.map((k) => (
        <div class="kw">
          <Icon name={k.icon} size={16} color={k.color} />
          <div>
            <b style={{ color: k.color }}>{k.name}</b> {k.desc}
          </div>
        </div>
      ))}
    </div>
  );
}
