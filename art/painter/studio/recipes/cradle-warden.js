// 요람의 수문장 (5층 정예) — 별이 태어나는 성운의 요람을 지키는 운석의 거상. 그 몸의 각도는 어느 것도 맞지 않는다.
// 깎인 운석 덩어리들이 서로 닿지 않은 채 사람 꼴로 떠 있다. 틈마다 보랏빛 빛이 그것들을 붙들고,
// 몇 덩어리는 같은 돌이 두 번, 서로 다른 각도로 겹쳐 있다 (맞지 않는 기하학). 머리는 작은 다면체, 가운데 가로로 갈라진 빛.
// 거대한 두 주먹은 땅에 닿을 듯 늘어졌고, 등 뒤로는 작은 운석들이 비스듬한 고리를 그리며 돈다 (요람의 문).
// 표면: 녹은 껍질(융용각), 엄지로 누른 듯한 자국, 깨진 면엔 비트만슈테텐 무늬.
import { rng } from '../../lib.js';

export default function cradleWarden({ seed = 1 } = {}) {
  const R = rng(seed * 313 + 29);
  // [x, y, z, 크기]: 0 몸통, 1 골반, 2 머리, 3·4 어깨, 5·6 위팔, 7·8 아래팔, 9·10 주먹, 11·12 넓적다리, 13·14 정강이
  const A = [
    [0, 2.15, 0, 0.72],
    [0, 1.25, 0.02, 0.46],
    [0.02, 3.08, 0.12, 0.27],
    [-0.98, 2.55, -0.02, 0.4],
    [1.0, 2.6, 0.0, 0.42],
    [-1.25, 1.88, 0.12, 0.32],
    [1.28, 1.9, 0.08, 0.3],
    [-1.32, 1.18, 0.32, 0.31],
    [1.36, 1.2, 0.28, 0.32],
    [-1.3, 0.5, 0.45, 0.42],
    [1.35, 0.52, 0.42, 0.44],
    [-0.42, 0.7, 0.05, 0.33],
    [0.44, 0.72, 0.02, 0.33],
    [-0.5, 0.2, 0.15, 0.3],
    [0.52, 0.2, 0.12, 0.3],
  ];
  const nBody = A.length;
  // 등 뒤의 운석 고리 (요람의 문)
  const ring = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R() * 0.2;
    const rr = 2.05 + (R() - 0.5) * 0.25;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * 0.92;
    // 고리를 기울인다 (뒤로)
    ring.push([x, 2.2 + y * 0.95, -0.9 + y * 0.28 + (R() - 0.5) * 0.2, 0.06 + R() * 0.09]);
  }
  for (const r of ring) A.push(r);
  // 틈의 빛: 덩어리 사이
  const uL = [];
  const uLC = [];
  const pairs = [[0, 1], [0, 2], [0, 3], [0, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [8, 10], [1, 11], [1, 12], [11, 13], [12, 14]];
  for (const [a, b] of pairs) {
    const m = [0, 1, 2].map((j) => (A[a][j] + A[b][j]) / 2);
    uL.push([m[0], m[1], m[2] + 0.05, 0.07]);
    uLC.push([0.75, 0.55, 1.0, 1.0]);
  }
  // 머리의 갈라진 빛
  uL.push([A[2][0], A[2][1] - 0.02, A[2][2] + 0.25, 0.02]);
  uLC.push([0.85, 0.75, 1.0, 1.5]);
  const f3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;
  return {
    preset: 'act5',
    cam: { pos: [1.0, -0.4, 9.8], target: [0.0, 1.8, 0], fov: 1.8 },
    light: {
      key: [-0.45, 0.6, -0.65],
      keyCol: [0.85, 0.85, 1.15],
      fill: [0.6, 0.0, 0.8],
      fillCol: [0.06, 0.05, 0.1],
      amb: [0.008, 0.007, 0.014],
      rimCol: [0.85, 0.75, 1.25],
      rim: 2.0,
      glow: 0.07,
      exposure: 1.2,
      pt: [0.0, 1.75, 0.6],
      ptCol: [1.0, 0.7, 1.6],
    },
    frame: { fill: 0.92 },
    arrays: { uA: A, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
const int NBODY = ${nBody};

vec3 h3(float i) { return vec3(hash11(i * 1.31 + 0.7), hash11(i * 2.77 + 3.1), hash11(i * 4.13 + 5.9)); }

/** 깎인 다면체 바위: 무작위 면 14개의 교집합 (+ 잡음 변위) */
float rock(vec3 q, float s, float id) {
  float d = length(q) - s * 1.25;
  if (d > 0.3) return d;
  float m = -1e5;
  for (int i = 0; i < 9; i++) {
    vec3 n = normalize(h3(id * 17.0 + float(i)) * 2.0 - 1.0);
    float off = s * (0.55 + 0.45 * hash11(id * 7.0 + float(i) * 3.3));
    m = max(m, dot(q, n) - off);
  }
  m = max(m, length(q) - s * 1.2);
  return m;
}

mat3 rmat(float id) {
  vec3 a = h3(id * 5.0 + 1.0) * 6.2831;
  float c1 = cos(a.x), s1 = sin(a.x), c2 = cos(a.y), s2 = sin(a.y), c3 = cos(a.z), s3 = sin(a.z);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, c1, s1, 0.0, -s1, c1);
  mat3 ry = mat3(c2, 0.0, -s2, 0.0, 1.0, 0.0, s2, 0.0, c2);
  mat3 rz = mat3(c3, s3, 0.0, -s3, c3, 0.0, 0.0, 0.0, 1.0);
  return rx * ry * rz;
}

vec2 sdf(vec3 p) {
  float d = 1e5;
  float best = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i >= uAN) break;
    vec4 a = uA[i];
    float fi = float(i);
    vec3 q = rmat(fi) * (p - a.xyz);
    // 몸통 덩어리는 세로로 길쭉하게
    if (i == 0) q *= vec3(0.85, 0.75, 1.3);
    if (i == 5 || i == 6 || i == 7 || i == 8 || i == 13 || i == 14) q *= vec3(1.25, 0.8, 1.25);
    if (i == 9 || i == 10) q *= vec3(0.9, 1.0, 0.9);
    float r = rock(q, a.w, fi);
    // 맞지 않는 기하학: 몇 덩어리는 같은 돌이 다른 각도로 한 번 더 겹친다
    if (i == 0 || i == 4 || i == 9 || i == 2) {
      vec3 q2 = rmat(fi + 40.0) * (p - a.xyz - vec3(0.06, 0.04, 0.05) * a.w * 2.0);
      r = min(r, rock(q2 * 1.06, a.w * 0.92, fi));
    }
    if (r < d) {
      d = r;
      best = fi;
    }
  }
  // 엄지로 누른 듯한 자국
  d += 0.012 * (fbm3(p * 7.0) - 0.5);
  return vec2(d, best < float(NBODY) - 0.5 ? (best == 2.0 ? 2.0 : 1.0) : 3.0);
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  // 융용각: 검고 기름진 껍질, 군데군데 벗겨진 곳은 비트만슈테텐 무늬의 금속
  float crust = smoothstep(0.25, 0.45, fbm3(p * 3.0));
  vec3 pp = p * 30.0;
  float wid = smoothstep(0.85, 0.95, abs(sin(dot(pp, vec3(1.0, 0.3, 0.2))))) + smoothstep(0.85, 0.95, abs(sin(dot(pp, vec3(-0.3, 1.0, 0.5)))));
  vec3 metal = vec3(0.08, 0.08, 0.09) * (0.85 + 0.25 * wid);
  vec3 alb = mix(metal, vec3(0.02, 0.018, 0.022), crust);
  float rough = mix(0.35, 0.75, crust);
  float spec = mix(1.2, 0.3, crust);
  // 보랏빛 균열: 틈을 붙드는 빛이 바위 속으로 스며든다
  float cr = smoothstep(0.035, 0.0, ridge(p * 2.2 + 3.0)) * smoothstep(0.55, 0.75, noise(p * 1.7));
  vec3 emi = vec3(0.6, 0.4, 1.0) * cr * 1.6;
  // 틈을 마주한 면이 보랏빛으로 물든다
  emi += vec3(0.45, 0.3, 0.8) * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.12;
  if (id > 1.5 && id < 2.5) {
    // 머리: 가운데 가로로 갈라진 빛
    vec3 q = p - uA[2].xyz;
    float slit = smoothstep(0.03, 0.0, abs(q.y + 0.01 * sin(q.x * 30.0))) * smoothstep(0.2, 0.05, abs(q.x)) * step(0.0, q.z);
    emi += vec3(0.9, 0.8, 1.0) * slit * 4.0;
  }
  if (id > 2.5) {
    // 고리의 작은 운석: 가장자리가 희미하게 빛난다
    emi += vec3(0.55, 0.4, 0.95) * pow(1.0 - max(dot(n, V), 0.0), 2.0) * 0.5;
  }
  return Mat(alb, rough, spec, emi, 0.15, 0.0, 0.25);
}
`,
  };
}
