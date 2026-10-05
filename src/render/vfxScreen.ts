import { vignetteCanvas, type VignetteKind } from './vfxTextures';

/**
 * 화면 가장자리 비네트 (DOM). Pixi 캔버스는 HUD 아래에 있으므로,
 * 피격·정신 붕괴처럼 화면 전체가 반응해야 하는 순간에만 HUD 위로 가장자리를 물들인다.
 * 터치를 막지 않고 (pointer-events: none), 쉬는 동안에는 display: none.
 */

interface Layer {
  el: HTMLCanvasElement;
  anim: Animation | null;
}

let root: HTMLDivElement | null = null;
const layers = new Map<VignetteKind, Layer>();

function ensureRoot(): HTMLDivElement {
  if (root) return root;
  root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.className = 'vfx-vignette';
  Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '4', overflow: 'hidden' } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(root);
  return root;
}

function layer(kind: VignetteKind): Layer {
  let L = layers.get(kind);
  if (L) return L;
  const el = vignetteCanvas(kind);
  Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0', display: 'none', willChange: 'opacity' } satisfies Partial<CSSStyleDeclaration>);
  ensureRoot().appendChild(el);
  L = { el, anim: null };
  layers.set(kind, L);
  return L;
}

/**
 * 가장자리를 한 번 물들인다.
 * @param strength 최대 불투명도 (0~1)
 * @param ms 전체 길이
 * @param attack 최대치에 닿는 시점 (0~1)
 */
export function vignettePulse(kind: VignetteKind, strength: number, ms = 700, attack = 0.14) {
  if (typeof document === 'undefined' || strength <= 0) return;
  const L = layer(kind);
  let from = 0;
  if (L.anim) {
    from = Number(getComputedStyle(L.el).opacity) || 0;
    L.anim.cancel();
  }
  L.el.style.display = 'block';
  const peak = Math.min(1, Math.max(from, strength));
  if (typeof L.el.animate !== 'function') {
    L.el.style.display = 'none';
    return;
  }
  const anim = L.el.animate([{ opacity: from }, { opacity: peak, offset: attack }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  L.anim = anim;
  anim.onfinish = () => {
    if (L.anim === anim) {
      L.anim = null;
      L.el.style.display = 'none';
    }
  };
}

/**
 * DOM 요소를 잠깐 들썩인다 (플레이어 피격 시 HUD 패널).
 * transform 애니메이션만 쓰므로 레이아웃·스타일은 건드리지 않는다. 요소가 없으면 아무 일도 하지 않는다.
 */
export function jolt(selector: string, px: number, ms = 260) {
  if (typeof document === 'undefined' || px <= 0) return;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el || typeof el.animate !== 'function') return;
  const b = px * 0.55;
  el.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-px}px, ${px * 0.7}px)` },
      { transform: `translate(${b}px, ${-b * 0.5}px)` },
      { transform: `translate(${-b * 0.35}px, ${b * 0.25}px)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: ms, easing: 'ease-out' },
  );
}

export function clearVignettes() {
  for (const L of layers.values()) {
    L.anim?.cancel();
    L.anim = null;
    L.el.style.display = 'none';
  }
}
