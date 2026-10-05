// 우주에서 온 색 (4층 일반) — 형체가 없는 빛깔. 운석 조각 같은 유리질 구슬 덩어리를 중심으로,
// 지구에 없는 빛깔이 안개처럼 일렁이며 번진다 (자홍·보라·청록이 서로 스며 어떤 색이라고 부를 수 없다).
// 아래로는 빛의 실뿌리가 늘어져 무언가의 생기를 빨아들이고, 그 끝에 잿빛으로 말라 버린 가지들이 있다.
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const add = (a, b) => a.map((x, i) => x + b[i]);

export default function starColour({ seed = 1 } = {}) {
  const R = rng(seed * 1213 + 6);
  const C = [0.0, 1.55, 0.0];
  // 유리질 구슬 (uA): 가운데 덩어리
  const uA = [[...C, 0.0]];
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2;
    const e = (R() - 0.5) * 2.2;
    const d = 0.08 + R() * 0.2;
    uA.push([C[0] + Math.cos(a) * Math.cos(e) * d, C[1] + Math.sin(e) * d, C[2] + Math.sin(a) * Math.cos(e) * d, 0.09 + R() * 0.1]);
  }
  // 빛의 실뿌리 (uB): 가운데에서 아래로 늘어져 땅을 더듬는다
  const uB = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.4;
    const s = add(C, [Math.cos(a) * 0.12, -0.1, Math.sin(a) * 0.1]);
    const out = 0.4 + R() * 0.7;
    const e = [Math.cos(a) * out, 0.05, Math.sin(a) * out * 0.6];
    const P = [s, add(s, [Math.cos(a) * 0.15, -0.5, 0.0]), add(e, [(R() - 0.5) * 0.3, 0.45, 0.0]), e];
    for (let k = 0; k < 6; k++) {
      const t = k / 5;
      uB.push([...bez(P, t), 0.014 * (1 - t) + 0.003]);
    }
    uB.push([0, 0, 0, 0]);
  }
  // 말라 버린 잿빛 가지 (실뿌리 끝)
  for (let i = 0; i < 4; i++) {
    const a = R() * Math.PI * 2;
    const b = [Math.cos(a) * (0.6 + R() * 0.4), 0.0, Math.sin(a) * 0.4];
    const h = 0.35 + R() * 0.35;
    uB.push([...b, 0.035], [...add(b, [(R() - 0.5) * 0.2, h * 0.6, 0]), 0.02], [...add(b, [(R() - 0.5) * 0.35, h, (R() - 0.5) * 0.1]), 0.006]);
    uB.push([0, 0, 0, 0]);
  }
  const roots = 9 * 7;
  const uP = [[roots, 0, 0, 0]];
  const uL = [[...C, 0.35]];
  const uLC = [[0.8, 0.4, 1.0, 0.18]];

  return {
    preset: 'act4',
    cam: { pos: [0.3, 1.25, 7.4], target: [0.0, 1.25, 0], fov: 1.8 },
    light: { key: [-0.4, 0.7, -0.6], fillCol: [0.12, 0.08, 0.18], amb: [0.02, 0.018, 0.03], rim: 1.5, exposure: 1.3, glow: 0.1 },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uA, uB, uP, uL, uLC },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 48
#define VOLUME_FAR 16.0

/** 이 세상에 없는 색: 위치와 시선에 따라 자홍·보라·청록 사이를 미끄러진다 */
vec3 alienHue(vec3 p) {
  float h = fbm3(p * 1.3 + vec3(uSeed));
  vec3 a = vec3(0.85, 0.22, 0.75);
  vec3 b = vec3(0.45, 0.3, 1.0);
  vec3 c = vec3(0.35, 0.85, 0.75);
  return mix(mix(a, b, smoothstep(0.3, 0.55, h)), c, smoothstep(0.6, 0.8, h));
}

vec2 sdf(vec3 p) {
  // 유리질 구슬 덩어리
  float d = 1e5;
  for (int i = 1; i < uAN; i++) d = smin(d, length(p - uA[i].xyz) - uA[i].w, 0.05);
  vec2 r = vec2(d, 1.0);
  // 실뿌리 (빛남) / 마른 가지
  float roots = 1e5;
  float twigs = 1e5;
  int nr = int(uP[0].x + 0.5);
  for (int i = 0; i < uBN - 1; i++) {
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    float s = sdRoundCone(p, a.xyz, b.xyz, a.w, b.w);
    if (i < nr) roots = min(roots, s); else twigs = min(twigs, s);
  }
  r = umin(r, vec2(roots, 2.0));
  r = umin(r, vec2(twigs, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 hue = alienHue(p);
  if (id < 1.5) {
    // 속에서 빛나는 유리 구슬
    float crack = smoothstep(0.06, 0.0, ridge(p * 9.0));
    return Mat(vec3(0.012), 0.05, 1.4, hue * (0.03 + crack * 0.5), 1.0, 0.0, 0.8);
  }
  if (id < 2.5) return Mat(vec3(0.0), 1.0, 0.0, hue * 0.5 * smoothstep(-0.1, 1.3, p.y), 0.0, 0.0, 0.0);
  // 잿빛으로 말라 버린 가지
  return Mat(vec3(0.09, 0.09, 0.085) * (0.6 + 0.6 * noise(p * 20.0)), 0.9, 0.1, vec3(0.0), 0.0, 0.0, 0.0);
}

vec4 volume(vec3 p) {
  // 일렁이는 색의 안개: 가운데 짙고, 바깥으로 갈래져 흩어진다
  vec3 q = p - uA[0].xyz;
  float r = length(q * vec3(1.0, 1.15, 1.0));
  float n = fbm3(p * 1.9 + vec3(0.0, uSeed * 0.3, 0.0));
  float n2 = noise(p * 4.5 + 2.0);
  float shape = smoothstep(1.35, 0.15, r + (n - 0.5) * 0.9);
  float dens = shape * smoothstep(0.3, 0.7, n * 0.7 + n2 * 0.3) * 2.6 + smoothstep(0.45, 0.0, r) * 3.0;
  return vec4(alienHue(p) * dens * 0.2, dens * 0.8);
}
`,
  };
}
