// 날아다니는 폴립 (4층 일반) — 날개 없이 바람을 부리며 떠다니는 반쯤 보이지 않는 것.
// 거대한 해파리 같은 폴립 몸통이 허공에 떠 있고, 아래로는 입 둘레의 촉수들이 늘어진다.
// 몸의 절반은 이 세계에 없다 — 살갗이 군데군데 사라져 구멍이 뚫리고, 그 가장자리가 차가운 빛으로 탄다.
// 주위로 휘감아 도는 바람 (부피 안개).
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const add = (a, b) => a.map((x, i) => x + b[i]);

export default function flyingPolyp({ seed = 1 } = {}) {
  const R = rng(seed * 2221 + 8);
  const uB = [];
  // 입 둘레 촉수: 늘어져 아래로 흔들린다
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + R() * 0.3;
    const s = [Math.cos(a) * 0.42, 1.25, Math.sin(a) * 0.35];
    const len = 0.7 + R() * 0.7;
    const sway = (R() - 0.5) * 0.6;
    const P = [s, add(s, [Math.cos(a) * 0.15, -len * 0.3, Math.sin(a) * 0.1]), add(s, [sway, -len * 0.7, 0.1]), add(s, [sway * 0.5 + Math.cos(a) * 0.12, -len, 0.15])];
    const n = 6;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      uB.push([...bez(P, t), 0.075 * Math.pow(1 - t, 0.8) + 0.006]);
    }
    uB.push([0, 0, 0, 0]);
  }
  const uA = [
    [0.0, 2.0, 0.0, 0.0], // 몸 중심
    [0.75, 0.7, 0.62, 0.0], // 몸 반지름
    [0.5, 0.05, 0.0, 0.0], // 사라짐 문턱
    [0.6, 0.8, 1.0, 0.9], // 가장자리 빛
  ];

  return {
    preset: 'act4',
    cam: { pos: [0.4, 1.3, 8.2], target: [0.0, 1.55, 0], fov: 1.8 },
    light: { key: [-0.4, 0.7, -0.6], fillCol: [0.12, 0.1, 0.18], amb: [0.025, 0.025, 0.035], rim: 1.7, exposure: 1.3 },
    frame: { fill: 0.9, bottom: 0.04 },
    arrays: { uA, uB },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 36
#define VOLUME_FAR 16.0

vec2 sdf(vec3 p) {
  vec3 c = uA[0].xyz;
  vec3 rr = uA[1].xyz;
  vec3 q = p - c;
  // 종 모양 몸통: 위가 둥글고 아래 입 쪽이 오므라든다, 주름진 갓
  float bell = sdEllipsoid(q, rr * vec3(1.0 + 0.12 * smoothstep(0.2, -0.5, q.y), 1.0, 1.0));
  bell += 0.04 * sin(atan(q.z, q.x) * 9.0 + q.y * 3.0) * smoothstep(-0.2, -0.7, q.y);
  bell = smin(bell, sdEllipsoid(q - vec3(0.0, -0.62, 0.0), vec3(0.42, 0.25, 0.36)), 0.15);
  bell += 0.02 * (fbm3(p * 4.0) - 0.5);
  // 반쯤 사라진 몸: 아래로 갈수록 잡음 경계로 갉아먹혀 허공에 풀린다
  float vanish = noise(p * 2.6 + vec3(0.0, uSeed, 0.0)) * 0.7 + noise(p * 6.0) * 0.3;
  float fade = vanish - uA[2].x + smoothstep(-0.2, 0.6, q.y) * 0.5;
  vec2 r = vec2(max(bell, -fade * 0.5), 1.0);
  float t = chains(p, 0.04);
  t = max(t, -(vanish - uA[2].x + 0.15) * 0.5);
  r = usmin(r, vec2(t, 1.0), 0.06);
  // 입 속 어둠
  r = umin(r, vec2(sdEllipsoid(q - vec3(0.0, -0.7, 0.0), vec3(0.22, 0.12, 0.18)), 99.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float vanish = noise(p * 2.6 + vec3(0.0, uSeed, 0.0)) * 0.7 + noise(p * 6.0) * 0.3;
  vec3 q = p - uA[0].xyz;
  float fade = vanish - uA[2].x + smoothstep(-0.2, 0.6, q.y) * 0.5;
  // 원래 살갗 근처에서만 (잘린 단면 전체가 아니라 그 가장자리만) 빛난다
  float bell = sdEllipsoid(q, uA[1].xyz * vec3(1.0 + 0.12 * smoothstep(0.2, -0.5, q.y), 1.0, 1.0));
  bell = min(bell, sdEllipsoid(q - vec3(0.0, -0.62, 0.0), vec3(0.42, 0.25, 0.36)));
  float onSkin = smoothstep(0.06, 0.0, abs(bell));
  float cutFace = smoothstep(0.02, 0.0, abs(fade)) * (1.0 - onSkin);
  float edge = smoothstep(0.04, 0.0, abs(fade)) * onSkin;
  float g = fbm3(p * 5.0);
  vec3 alb = mix(vec3(0.03, 0.038, 0.05), vec3(0.075, 0.09, 0.11), g);
  float vein = smoothstep(0.05, 0.0, ridge(p * 3.5));
  alb *= 1.0 - cutFace * 0.85;
  vec3 emi = uA[3].rgb * uA[3].a * edge + vec3(0.45, 0.6, 0.85) * vein * 0.12 * (1.0 - cutFace);
  return Mat(alb, 0.25, 0.9, emi, 0.3, 0.85, 0.6);
}

vec4 volume(vec3 p) {
  // 몸을 휘감아 도는 바람: 나선 띠 + 잡음
  vec3 q = p - uA[0].xyz + vec3(0.0, 0.4, 0.0);
  float rad = length(q.xz);
  float ang = atan(q.z, q.x);
  float spiral = sin(ang * 2.0 + q.y * 3.5 - rad * 2.0);
  float band = smoothstep(0.55, 0.95, spiral) * smoothstep(0.5, 0.95, rad) * smoothstep(1.9, 1.0, rad) * smoothstep(1.6, 0.0, abs(q.y));
  float n = fbm3(p * 2.2);
  float dens = band * smoothstep(0.35, 0.7, n) * 0.9;
  return vec4(vec3(0.55, 0.7, 0.9) * dens * 0.35, dens * 0.9);
}
`,
  };
}
