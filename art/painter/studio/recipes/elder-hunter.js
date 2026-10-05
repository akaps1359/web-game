// 고대인 사냥꾼 (3층 일반) — 통 같은 몸통에 별 모양 머리, 접었다 펴는 막날개. 얼음 위를 낮게 날며 표본을 모은다.
// 몸을 눕혀 왼쪽 앞으로 미끄러져 날아든다. 쥘부채 같은 막날개 둘을 위로 V자로 펼쳤고,
// 다섯 갈래 촉수 팔은 앞으로 뻗어 표본(당신)을 움켜쥐려 한다. 발 촉수는 뒤로 길게 늘어진다.
// 몸은 awakened-elder.js의 elderThing()을 쓴다.
const { elderThing } = await import(/* @vite-ignore */ `/art/painter/studio/recipes/awakened-elder.js?t=${Date.now()}`);

export default function elderHunter({ seed = 1 } = {}) {
  // 몸 좌표: +y = 머리(나는 방향), +x = 등(위), -x = 배(아래)
  const arm = (a, tip, w) => (t) => {
    const d = [Math.cos(a), 0, Math.sin(a)];
    const p0 = [d[0] * 0.36, 1.25, d[2] * 0.36];
    const p1 = [d[0] * 0.7 - 0.25, 1.5, d[2] * 0.7];
    const m = 1 - t;
    const b = [0, 1, 2].map((i) => m * m * p0[i] + 2 * m * t * p1[i] + t * t * tip[i]);
    return [b[0] + Math.sin(t * 6 + a) * w, b[1] + Math.cos(t * 5 + a) * w, b[2] + Math.sin(t * 4 + a) * w];
  };
  const arms = [
    { path: arm(Math.PI + 0.2, [-0.95, 2.45, 0.35], 0.05), fingers: 'grab' },
    { path: arm(Math.PI - 0.9, [-0.75, 2.6, -0.5], 0.05), fingers: 'spread' },
    { path: arm(Math.PI + 1.1, [-0.55, 2.35, 0.9], 0.06), fingers: 'spread' },
    { path: arm(-0.6, [-0.2, 2.2, -0.95], 0.06), fingers: 'grab' },
    { path: arm(0.9, [-0.25, 2.15, 1.05], 0.06), fingers: 'spread' },
  ];
  return elderThing({
    seed: seed + 5,
    origin: [0.95, 0.55, 0],
    rot: [0.45, 0.1, 1.2],
    scale: 1.0,
    feet: 'trail',
    arms,
    wings: [
      { a: -1.05, y: 1.35, len: 1.75, phi0: -1.45, phi1: 0.15, back: 0.0, lift: 0.0, tilt: 0 },
      { a: 0.85, y: 1.35, len: 1.7, phi0: -1.45, phi1: 0.1, back: 0.0, lift: 0.0, tilt: 0 },
    ],
    head: { tilt: 0.55, stalk: 0.3 },
    ice: 0.35,
    frostTop: 3.0,
    wet: 0.5,
    wingGlow: 0.7,
    noGround: true,
    cam: { pos: [0.3, 0.9, 8.6], target: [0.1, 1.35, 0], fov: 1.75 },
    light: { key: [-0.2, 0.75, -0.62], rim: 2.2 },
    frame: { fill: 0.94, bottom: 0.06 },
  });
}
