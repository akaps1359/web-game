// 사냥하는 공포 (4층 균열 수호자) — 빛을 꺼리는 날개 달린 뱀. 휘감고, 급습하고, 빛을 가리고, 아가리를 벌려 삼킨다.
// 허공에서 고리를 그리며 똬리 튼 굵은 뱀의 몸(마디진 검은 비늘, 등가시), 뒤로 넓게 펼친 찢어진 박쥐 날개,
// 눈 없는 쐐기 머리가 이쪽으로 덮쳐 오며 아래턱을 활짝 벌렸다 — 바늘 이빨 줄, 목구멍 깊은 곳의 핏빛.
// 몸은 사슬(uB)로, 머리·턱·이빨은 머리 좌표계에서 코드로 그린다.
import { rng } from '../../lib.js';

const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function catmull(pts, n) {
  const out = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const p0 = pts[Math.max(0, s - 1)];
    const p1 = pts[s];
    const p2 = pts[s + 1];
    const p3 = pts[Math.min(pts.length - 1, s + 2)];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export default function huntingHorror({ seed = 1 } = {}) {
  const R = rng(seed * 557 + 23);
  // 머리 → 목 → 똬리 → 꼬리
  const ctrl = [
    [0.25, 3.25, 1.25],
    [0.18, 3.08, 0.62],
    [0.0, 2.72, 0.1],
    [-0.55, 2.2, -0.15],
    [-0.95, 1.55, 0.25],
    [-0.6, 0.95, 0.85],
    [0.3, 0.78, 1.0],
    [1.0, 1.2, 0.5],
    [1.12, 1.9, -0.2],
    [0.55, 2.2, -0.62],
    [-0.25, 1.95, -0.85],
    [-1.05, 1.35, -0.6],
    [-1.6, 0.8, -0.15],
    [-1.95, 0.55, 0.45],
    [-2.25, 0.7, 0.95],
  ];
  const spine = catmull(ctrl, 3);
  const N = spine.length;
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  for (let i = 1; i < N; i++) {
    const t = i / (N - 1);
    // 목은 가늘고, 몸통은 굵고, 꼬리는 채찍처럼
    const w = t < 0.12 ? 0.2 + t * 1.0 : t < 0.55 ? 0.32 + Math.sin(((t - 0.12) / 0.43) * Math.PI) * 0.06 : 0.32 * Math.pow(1 - (t - 0.55) / 0.45, 1.3) + 0.02;
    ch.push([...spine[i], w]);
  }
  brk();
  const nBody = ch.length;

  // 날개: 목 뒤 어깨에서 (막과 같은 틀)
  const W0 = [0.3, 2.78, -0.05];
  const S = norm([1.0, 0.78, -0.42]);
  let V = norm([0.15, -0.45, -0.9]);
  V = norm(add(V, S, -dot(V, S)));
  const L = 2.9;
  const H = 1.45;
  const trail = (u) => H * Math.sqrt(Math.max(0, 1 - ((u - L * 0.5) / (L * 0.5)) ** 2));
  for (const sx of [1, -1]) {
    const m = (v) => [v[0] * sx, v[1], v[2]];
    const P = (u, v) => m(add(add(W0, S, u), V, v));
    const wrist = P(L * 0.4, -0.03);
    ch.push([...P(0, 0), 0.11], [...P(L * 0.2, -0.05), 0.085], [...wrist, 0.065], [...P(L * 0.72, 0.03), 0.04], [...P(L, 0.0), 0.012]);
    brk();
    for (const f of [0.5, 0.66, 0.82, 0.95]) {
      const u = L * f;
      ch.push([...wrist, 0.045], [...P(u, trail(u) * 0.5), 0.028], [...P(u + 0.05, trail(u) - 0.04), 0.008]);
      brk();
    }
    ch.push([...wrist, 0.04], [...P(L * 0.44, -0.2), 0.008]);
    brk();
  }
  const nAll = ch.length;

  // 머리 좌표계: 머리는 첫 제어점에서 카메라 쪽 아래로 덮친다
  const head = ctrl[0];
  const fwd = norm([0.85, -0.28, 0.55]);
  const right = norm(cross([0, 1, 0], fwd)).map((x) => -x);
  const up = cross(fwd, right).map((x) => -x);

  // 목구멍의 핏빛 + 주위의 붉은 불티
  const throat = add(head, fwd, 0.08);
  const lights = [[...add(throat, up, -0.09), 0.12]];
  const lc = [[1.0, 0.18, 0.12, 1.0]];
  for (let i = 0; i < 10; i++) {
    const a = R() * 6.28;
    lights.push([Math.cos(a) * (1.0 + R() * 1.8), 0.4 + R() * 3.4, Math.sin(a) * 0.8 + 0.3, 0.005 + R() * 0.008]);
    lc.push([1.0, 0.3, 0.25, 0.7]);
  }

  return {
    preset: 'act4',
    cam: { pos: [0.6, 0.85, 10.2], target: [0, 2.0, 0], fov: 1.8 },
    light: {
      key: [-0.2, 0.6, -0.8],
      keyCol: [1.3, 0.75, 0.75],
      fillCol: [0.14, 0.06, 0.2],
      amb: [0.018, 0.01, 0.022],
      rimCol: [1.2, 0.55, 0.55],
      rim: 1.4,
      exposure: 1.25,
      pt: add(throat, fwd, 0.35),
      ptCol: [1.6, 0.25, 0.18],
    },
    frame: { fill: 0.93, bottom: 0.03 },
    arrays: {
      uB: ch,
      uL: lights,
      uLC: lc,
      uP: [
        [nBody, nAll, L, H],
        [...W0, 0],
        [...S, 0],
        [...V, 0],
        [...head, 1.45],
        [...right, 0],
        [...up, 0],
        [...fwd, 0],
      ],
    },
    glsl: /* glsl */ `
#define NO_GROUND

float chainR(vec3 p, int a, int b, float k) {
  float d = 1e5;
  for (int i = a; i < b - 1; i++) {
    vec4 s0 = uB[i];
    vec4 s1 = uB[i + 1];
    if (s0.w <= 0.0 || s1.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, s0.xyz, s1.xyz, s0.w, s1.w), k);
  }
  return d;
}

float wingD(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z) - uP[1].xyz;
  float L = uP[0].z;
  float H = uP[0].w;
  vec3 S = uP[2].xyz;
  vec3 V = uP[3].xyz;
  vec3 N = cross(S, V);
  float u = dot(q, S);
  float v = dot(q, V);
  float w = dot(q, N);
  w -= 0.14 * sin(clamp(u / L, 0.0, 1.0) * 3.14159) * sin(clamp(v / H, 0.0, 1.0) * 3.14159);
  float sc = 0.2 * (0.5 + 0.5 * cos(clamp(u / L, 0.0, 1.0) * 6.2831853 * 4.2 - 1.0));
  float e = length(vec2((u - L * 0.5) / (L * 0.5), v / (H - sc * smoothstep(0.3, 0.9, v / H)))) - 1.0;
  float d = max(e * min(L * 0.5, H) * 0.6, -v);
  // 찢긴 구멍
  float holes = sin(u * 6.1 + 1.3) * sin(v * 8.3 + u * 2.7) * sin(u * 2.3 - v * 5.1);
  d = max(d, (holes - 0.6) * 0.25);
  return max(d, abs(w) - 0.012);
}

// 머리 (머리 좌표계: x 오른쪽, y 위, z 앞)
vec2 headD(vec3 p) {
  float hs = uP[4].w;
  vec3 q0 = (p - uP[4].xyz) / hs;
  vec3 q = vec3(dot(q0, uP[5].xyz), dot(q0, uP[6].xyz), dot(q0, uP[7].xyz));
  vec3 s = vec3(abs(q.x), q.y, q.z);
  // 위턱: 길고 납작한 쐐기
  float up = sdEllipsoid(q - vec3(0.0, 0.06, 0.12), vec3(0.2, 0.12, 0.46));
  up = smin(up, sdEllipsoid(q - vec3(0.0, 0.1, -0.12), vec3(0.24, 0.17, 0.3)), 0.1);
  // 아래턱: 경첩에서 크게 벌어졌다
  vec3 j = q - vec3(0.0, -0.02, -0.12);
  j.yz = rot(0.85) * j.yz;
  float low = sdEllipsoid(j - vec3(0.0, -0.06, 0.3), vec3(0.17, 0.07, 0.42));
  // 입 안을 파낸다
  float mouth = sdEllipsoid(q - vec3(0.0, -0.06, 0.25), vec3(0.15, 0.1, 0.42));
  up = smax(up, -mouth, 0.03);
  vec3 jm = j - vec3(0.0, -0.01, 0.32);
  low = smax(low, -sdEllipsoid(jm, vec3(0.13, 0.05, 0.38)), 0.02);
  float d = min(up, low);
  // 이빨: 위턱 가장자리에서 아래로, 아래턱 가장자리에서 위로 (반복)
  vec3 tq = s - vec3(0.12, -0.06, 0.0);
  float cell = 0.07;
  float zi = clamp(floor(tq.z / cell + 0.5), -2.0, 8.0);
  vec3 tc = vec3(tq.x + zi * 0.006, tq.y, tq.z - zi * cell);
  float tooth = sdRoundCone(tc, vec3(0.0, 0.03, 0.0), vec3(-0.01, -0.13 + 0.03 * sin(zi * 2.3), 0.01), 0.018, 0.002);
  vec3 ls = vec3(abs(j.x), j.y, j.z) - vec3(0.11, -0.02, 0.0);
  float zj = clamp(floor(ls.z / cell + 0.5), 0.0, 9.0);
  vec3 lc = vec3(ls.x + zj * 0.004, ls.y, ls.z - zj * cell);
  float tooth2 = sdRoundCone(lc, vec3(0.0, -0.02, 0.0), vec3(-0.01, 0.12 + 0.03 * sin(zj * 1.7), 0.01), 0.016, 0.002);
  return vec2(d, min(tooth, tooth2)) * hs;
}

vec2 sdf(vec3 p) {
  float body = chainR(p, 0, int(uP[0].x), 0.06);
  // 비늘 마디
  body += 0.012 * (noise(p * 9.0) - 0.5) + 0.004 * sin(p.x * 31.0 + p.y * 17.0) * sin(p.z * 29.0 - p.y * 13.0);
  vec2 hd = headD(p);
  vec2 r = vec2(smin(body, hd.x, 0.12), 1.0);
  r = umin(r, vec2(chainR(p, int(uP[0].x), int(uP[0].y), 0.025), 1.0));
  r = umin(r, vec2(wingD(p), 2.0));
  r = umin(r, vec2(hd.y, 3.0));
  // 목구멍
  vec3 q0 = (p - uP[4].xyz) / uP[4].w;
  vec3 q = vec3(dot(q0, uP[5].xyz), dot(q0, uP[6].xyz), dot(q0, uP[7].xyz));
  r = umin(r, vec2(sdEllipsoid(q - vec3(0.0, -0.05, -0.02), vec3(0.12, 0.08, 0.22)) * uP[4].w, 99.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검은 비늘: 보랏빛 기름 광택, 배 쪽 마디는 어둡게 붉다
    float v = fbm3(p * 7.0);
    float scale = smoothstep(0.1, 0.0, abs(fract(p.x * 14.0 + floor(p.y * 14.0) * 0.5) - 0.5) - 0.38);
    vec3 alb = vec3(0.016, 0.012, 0.02) * (0.6 + 0.8 * v) * (1.0 - scale * 0.4);
    return Mat(alb, 0.25, 1.1, vec3(0.0), 0.35, 0.05, 0.75);
  }
  if (id < 2.5) {
    // 날개 막: 얇고 검붉다, 뒤에서 빛이 비친다
    float vein = smoothstep(0.05, 0.0, ridge(p * 3.0)) * 0.6;
    vec3 alb = mix(vec3(0.035, 0.01, 0.016), vec3(0.008, 0.004, 0.007), vein);
    return Mat(alb, 0.6, 0.35, vec3(0.0), 0.0, 0.85, 0.2);
  }
  // 누렇게 바랜 바늘 이빨
  return Mat(vec3(0.2, 0.17, 0.12), 0.35, 0.8, vec3(0.0), 0.0, 0.2, 0.4);
}
`,
  };
}
