// 별의 태아 2단계 — 깨어나는 알. 본체는 star-fetus.js (form 1)
// (import.meta를 쓰면 Vite가 HMR 클라이언트를 끼워 넣어 작업실 페이지가 새로고침되므로 절대 경로를 쓴다)
const base = (await import(/* @vite-ignore */ `/art/painter/studio/recipes/star-fetus.js?t=${Date.now()}`)).default;

export default function starFetusEgg(o = {}) {
  return base({ ...o, form: 1 });
}
