// 얼굴 없는 파라오 (검은 파라오 2형태) — 황금 가면이 떨어지고, 그 아래엔 아무것도 없다.
// (import.meta를 쓰면 Vite가 HMR 클라이언트를 끼워 넣어 작업실 페이지가 다른 수정에 새로고침되므로 절대 경로를 쓴다)
const base = (await import(/* @vite-ignore */ `/art/painter/studio/recipes/black-pharaoh.js?t=${Date.now()}`)).default;

export default function facelessPharaoh(o = {}) {
  return base({ ...o, form: 1 });
}
