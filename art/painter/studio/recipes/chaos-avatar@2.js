// 기어오는 혼돈의 화신 — 희극·비극 가면 (호박빛). 본체는 chaos-avatar.js
// (import.meta를 쓰면 Vite가 HMR 클라이언트를 끼워 넣어 작업실 페이지가 새로고침되므로 절대 경로를 쓴다)
const base = (await import(/* @vite-ignore */ `/art/painter/studio/recipes/chaos-avatar.js?t=${Date.now()}`)).default;

export default function chaosAvatarDrama(o = {}) {
  return base({ ...o, form: 1 });
}
