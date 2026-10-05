// 공허의 눈 (4층 하수인) — 검은 별이 뜨는 눈. 허공에 뜬 거대한 눈알이 두꺼운 살 눈꺼풀 사이로 내려다본다.
// 흰자위는 검붉게 죽어 핏줄이 번지고, 보랏빛 홍채 한가운데 동공은 빛을 삼키는 구멍 (가장자리에 가는 빛 고리).
// 뒤로는 시신경과 찢긴 근육 가닥이 꼬리처럼 늘어지고, 주위를 검은 티끌이 맴돈다.
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const add = (a, b) => a.map((x, i) => x + b[i]);
const nrm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / l);
};

export default function voidEye({ seed = 1 } = {}) {
  const R = rng(seed * 409 + 2);
  const C = [0.0, 1.35, 0.0];
  const RAD = 0.5;
  const uB = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + R() * 0.4;
    const main = i === 0;
    const s = add(C, [Math.cos(a) * (main ? 0.0 : 0.26), -0.28 + Math.sin(a) * 0.16, -0.32]);
    const len = main ? 1.1 : 0.55 + R() * 0.55;
    const sway = (R() - 0.5) * 0.6;
    const P = [s, add(s, [Math.cos(a) * 0.1, -len * 0.35, -0.25]), add(s, [sway, -len * 0.7, -0.15]), add(s, [sway * 0.4 + Math.cos(a) * 0.15, -len, 0.05])];
    const n = 6;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      uB.push([...bez(P, t), (main ? 0.11 : 0.06) * Math.pow(1 - t, 0.8) + 0.006]);
    }
    uB.push([0, 0, 0, 0]);
  }
  const GAZE = nrm([0.12, -0.2, 1]);
  const uA = [
    [...C, RAD],
    [...GAZE, 0.2], // 시선, 홍채 각 (라디안)
    [0.55, 0.3, 1.0, 1.4], // 홍채 빛, 세기
  ];
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    const rr = RAD + 0.28 + R() * 0.35;
    uA.push([C[0] + Math.cos(a) * rr, C[1] + Math.sin(a) * rr * 0.8, C[2] + (R() - 0.5) * 0.3, 0.025 + R() * 0.035]);
  }
  const uL = [[...add(C, [GAZE[0] * RAD, GAZE[1] * RAD, GAZE[2] * RAD]), 0.12]];
  const uLC = [[0.6, 0.35, 1.0, 0.25]];

  return {
    preset: 'act4',
    cam: { pos: [0.5, 1.2, 5.6], target: [0.0, 1.05, 0], fov: 1.8 },
    light: { key: [-0.4, 0.75, -0.55], fillCol: [0.12, 0.08, 0.18], amb: [0.025, 0.02, 0.035], rim: 1.7, exposure: 1.3, glow: 0.05 },
    frame: { fill: 0.86, bottom: 0.05 },
    arrays: { uA, uB, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND

vec2 sdf(vec3 p) {
  vec4 C = uA[0];
  vec3 g = uA[1].xyz;
  vec3 q = p - C.xyz;
  // 눈알
  vec2 r = vec2(length(q) - C.w, 3.0);
  // 눈꺼풀: 눈알을 감싼 두꺼운 살 껍질, 시선 쪽에 아몬드꼴 틈
  vec3 up = normalize(cross(g, vec3(1.0, 0.0, 0.0)));
  vec3 side = normalize(cross(up, g));
  vec2 l2 = vec2(dot(q, side), dot(q, up));
  float lidShell = length(q) - C.w * 1.12;
  float slit = max(length(l2 - vec2(0.0, -0.34)) - 0.48, length(l2 - vec2(0.0, 0.3)) - 0.44);
  slit = max(slit, -dot(q, g));
  lidShell = smax(lidShell, -slit, 0.06);
  lidShell = max(lidShell, -(length(q) - C.w * 0.99));
  lidShell += 0.012 * (0.5 - ridge(p * 10.0));
  r = umin(r, vec2(lidShell, 1.0));
  // 시신경·근육 가닥
  r = usmin(r, vec2(chains(p, 0.06), 2.0), 0.1);
  // 맴도는 검은 티끌
  for (int i = 3; i < uAN; i++) {
    r = umin(r, vec2(length(p - uA[i].xyz) - uA[i].w, 2.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float vein = smoothstep(0.08, 0.0, ridge(p * 9.0));
  float g = fbm3(p * 5.0);
  vec3 alb = mix(vec3(0.02, 0.008, 0.016), vec3(0.06, 0.018, 0.035), g) * (1.0 - vein * 0.5);
  float rough = 0.35, spec = 0.9, irid = 0.1, sss = 0.35, wet = 0.7;
  vec3 emi = vec3(0.0);
  if (id > 2.5) {
    // 눈알: 죽은 검붉은 흰자위 + 핏줄, 작은 홍채, 빛을 삼키는 동공과 가는 빛 고리
    vec3 q = normalize(p - uA[0].xyz);
    vec3 gz = uA[1].xyz;
    float a = acos(clamp(dot(q, gz), -1.0, 1.0));
    float ir = uA[1].w;
    vec3 up = normalize(cross(gz, vec3(1.0, 0.0, 0.0)));
    vec3 side = normalize(cross(up, gz));
    float th = atan(dot(q, up), dot(q, side));
    float fib = 0.55 + 0.45 * noise(vec3(th * 7.0, a * 40.0, 1.0));
    float iris = smoothstep(ir, ir - 0.02, a);
    float pupil = smoothstep(ir * 0.5, ir * 0.45, a);
    float ring = smoothstep(0.012, 0.0, abs(a - ir * 0.52));
    float sclVein = smoothstep(0.06, 0.0, ridge(p * 14.0)) * smoothstep(ir, ir * 2.5, a);
    alb = mix(vec3(0.07, 0.015, 0.025), vec3(0.22, 0.03, 0.04), sclVein) * (1.0 - iris);
    vec4 IC = uA[2];
    emi = IC.rgb * IC.a * iris * (1.0 - pupil) * fib * (1.1 - a / ir * 0.6) + vec3(0.9, 0.75, 1.0) * ring * 1.5;
    rough = 0.08; spec = 1.3; sss = 0.2; wet = 1.0;
  } else if (id > 1.5) {
    alb = vec3(0.04, 0.012, 0.022) * (0.6 + 0.6 * g); sss = 0.5;
    emi = vec3(0.55, 0.3, 1.0) * vein * 0.06;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
