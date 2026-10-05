// 얼어붙은 대원 (3층 하수인) — 탐사대장이 부르면 얼음 속에서 일어서는 대원들.
// 몸이 꺾일 만큼 웅크렸고, 입김이 얼어붙은 목도리로 코 아래를 칭칭 감았다. 바람 맞은 쪽은 두꺼운 상고대에 덮였고,
// 곡괭이를 땅에 끌며 걷는다. 시선은 하얗게 언 두 눈뿐.
// 몸은 frozen-explorer.js의 expedition()을 쓴다.
const { expedition } = await import(/* @vite-ignore */ `/art/painter/studio/recipes/frozen-explorer.js?t=${Date.now()}`);

export default function frozenCrewman({ seed = 1 } = {}) {
  return expedition({
    seed: seed + 40,
    yaw: 0.28,
    hunch: 0.6,
    lean: 0.42,
    tilt: -0.22,
    bow: 0.55,
    tool: 'pick',
    ice: 1.45,
    scarf: true,
    cam: { pos: [-0.8, 0.8, 6.2], target: [0.05, 0.95, 0.0], fov: 1.85 },
  });
}
