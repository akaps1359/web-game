// 기어오는 혼돈의 화신 (4층 정예) — 천 개의 가면. 지난 일격을 기억했다가 메아리로 되돌려준다.
// 기름처럼 검은 팔과 힘줄이 엉킨 무더기가 땅을 짚고 이쪽으로 기어온다. 꼭대기엔 창백한 큰 가면 하나,
// 몸 곳곳엔 반쯤 파묻힌 작은 도자기 가면 수십 개 — 모두 눈구멍 속에서 같은 빛이 샌다.
// form (가면을 바꿔 쓴다): 0 두 얼굴 가면(자홍), 1 희극·비극 가면(호박), 2 반쪽 가면(청록), 3 카니발 가면(보라).
// 작은 가면·팔·덩어리는 자료 배열(uA, uB)로 넘기고 셰이더는 고리로 돈다.
import { rng } from '../../lib.js';

const GLOW = [
  [1.0, 0.3, 0.62],
  [1.0, 0.62, 0.2],
  [0.3, 1.0, 0.68],
  [0.6, 0.45, 1.0],
];

export default function chaosAvatar({ seed = 1, form = 0 } = {}) {
  const R = rng(seed * 389 + 41);
  const glow = GLOW[form];

  // ── 몸 덩어리 (uA 0..): 구 [x,y,z,r] ──
  const A = [];
  const blobs = [
    [0, 0.45, -0.2, 0.75],
    [-0.65, 0.4, 0.05, 0.5],
    [0.7, 0.42, 0.0, 0.52],
    [0, 1.05, -0.15, 0.62],
    [0.05, 1.6, 0.0, 0.48],
    [-0.35, 1.35, 0.15, 0.36],
    [0.38, 1.4, 0.18, 0.34],
    [0.08, 2.05, 0.28, 0.32], // 목
    [0.1, 2.32, 0.42, 0.24],
    [-0.5, 0.95, -0.35, 0.4],
    [0.55, 1.0, -0.3, 0.38],
  ];
  for (const b of blobs) A.push(b);
  const nBlob = A.length;
  // 작은 가면: [위치, 크기], [요, 피치, 롤, 금감]
  const cam = [0.6, 0.75, 8.6];
  const spots = [
    [-0.55, 1.15, 0.42, 0.13],
    [0.62, 1.25, 0.4, 0.12],
    [-0.2, 0.62, 0.62, 0.15],
    [0.35, 0.75, 0.58, 0.12],
    [-0.9, 0.55, 0.38, 0.11],
    [0.98, 0.6, 0.35, 0.1],
    [0.22, 1.72, 0.42, 0.11],
    [-0.33, 1.9, 0.3, 0.09],
    [0.62, 1.75, 0.15, 0.09],
    [-0.75, 1.5, 0.0, 0.1],
    [0.0, 1.3, 0.55, 0.1],
    [-1.25, 0.3, 0.45, 0.09],
    [1.3, 0.32, 0.4, 0.085],
  ];
  for (const s of spots) {
    const g = [cam[0] - s[0] + (R() - 0.5) * 3.5, cam[1] - s[1] + (R() - 0.5) * 2.5, cam[2] - s[2]];
    const yaw = Math.atan2(g[0], g[2]);
    const pitch = Math.atan2(g[1], Math.hypot(g[0], g[2]));
    A.push([s[0], s[1], s[2], s[3]], [yaw, pitch, (R() - 0.5) * 0.9, R()]);
  }
  const nAll = A.length;

  // ── 팔 (uB): 몸에서 뻗어 땅을 짚는다. 앞쪽 팔엔 긴 손가락 ──
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const arms = [
    { a: -2.2, reach: 2.1, h: 1.3, z: 0.0 },
    { a: -1.7, reach: 2.2, h: 1.1, z: 0.45 },
    { a: -1.15, reach: 1.9, h: 0.9, z: 0.9 },
    { a: -0.55, reach: 1.7, h: 0.7, z: 1.3 },
    { a: 0.2, reach: 1.8, h: 0.75, z: 1.45 },
    { a: 0.8, reach: 1.9, h: 0.9, z: 1.15 },
    { a: 1.35, reach: 2.1, h: 1.05, z: 0.7 },
    { a: 1.9, reach: 2.2, h: 1.25, z: 0.25 },
    { a: 2.4, reach: 1.8, h: 1.5, z: -0.2 },
  ];
  const hands = [];
  for (const [k, am] of arms.entries()) {
    const dirx = Math.sin(am.a * 0.62);
    const root = [dirx * 0.45, am.h, 0.1];
    const elbow = [dirx * am.reach * 0.62, am.h + 0.45 + R() * 0.3, am.z * 0.55 + 0.1];
    const wrist = [dirx * am.reach, 0.14, am.z + 0.15];
    const mid = [(root[0] + elbow[0]) / 2, (root[1] + elbow[1]) / 2 + 0.12, (root[2] + elbow[2]) / 2];
    const w = 0.085 + R() * 0.03;
    ch.push([...root, w * 1.6], [...mid, w * 1.1], [...elbow, w * 0.95], [(elbow[0] + wrist[0]) / 2, (elbow[1] + wrist[1]) / 2 + 0.05, (elbow[2] + wrist[2]) / 2, w * 0.75], [...wrist, w * 0.55]);
    brk();
    hands.push({ wrist, dirx, k });
  }
  // 손가락: 땅을 움켜쥔다 (앞쪽 다섯 팔만)
  for (const h of hands.filter((x) => x.k >= 2 && x.k <= 6)) {
    const fwd = [h.dirx * 0.7, 0, 0.7];
    const fl = Math.hypot(...fwd);
    const f = fwd.map((x) => x / fl);
    const side = [f[2], 0, -f[0]];
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 0.045;
      const b0 = [h.wrist[0] + side[0] * o, h.wrist[1], h.wrist[2] + side[2] * o];
      const b1 = [b0[0] + f[0] * 0.13 + side[0] * o, b0[1] + 0.05, b0[2] + f[2] * 0.13 + side[2] * o];
      const b2 = [b1[0] + f[0] * 0.13 + side[0] * o * 1.5, 0.015, b1[2] + f[2] * 0.13 + side[2] * o * 1.5];
      ch.push([...b0, 0.026], [...b1, 0.018], [...b2, 0.006]);
      brk();
    }
  }
  // 위로 휘젓는 촉수 셋
  for (let k = 0; k < 3; k++) {
    const bx = (k - 1) * 0.42;
    const base = [bx, 1.85, -0.25];
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      ch.push([base[0] + bx * t * 1.4 + Math.sin(t * 5 + k) * 0.12, base[1] + t * (1.0 + k * 0.15), base[2] - t * 0.3 + Math.cos(t * 4 + k) * 0.1, 0.07 * (1 - t) + 0.008]);
    }
    brk();
  }

  // 큰 가면 눈 뒤의 빛 + 흩날리는 불티
  const M = [0.1, 2.4, 0.7];
  const lights = [
    [M[0] - 0.095, M[1] + 0.03, M[2] + 0.1, 0.022],
    [M[0] + 0.105, M[1] + 0.045, M[2] + 0.1, 0.022],
  ];
  const lc = [
    [...glow, 1.6],
    [...glow, 1.6],
  ];
  for (let i = 0; i < 8; i++) {
    const a = R() * 6.28;
    lights.push([Math.cos(a) * (0.6 + R() * 1.6), 0.3 + R() * 2.6, 0.3 + R() * 0.8, 0.005 + R() * 0.008]);
    lc.push([...glow, 0.7]);
  }

  return {
    preset: 'act4',
    cam: { pos: cam, target: [0, 1.25, 0], fov: 1.8 },
    light: {
      key: [-0.3, 0.55, -0.8],
      keyCol: [1.1, 0.95, 0.85],
      fillCol: [0.1, 0.07, 0.14],
      amb: [0.016, 0.013, 0.02],
      rimCol: [0.9 + glow[0] * 0.3, 0.75 + glow[1] * 0.3, 0.7 + glow[2] * 0.3],
      rim: 1.3,
      exposure: 1.25,
      pt: [0.3, 1.9, 1.7],
      ptCol: [0.75, 0.7, 0.65],
    },
    frame: { fill: 0.94, bottom: 0.025 },
    arrays: { uA: A, uB: ch, uL: lights, uLC: lc, uP: [[nBlob, nAll, 0, 0], [...M, 0], [...glow, 0]] },
    glsl: /* glsl */ `
#define FORM ${form}

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

// 가면 하나 (앞이 +z, 크기 1 기준): x = 껍데기, y = 눈구멍 뒤의 빛
vec2 maskShape(vec3 q) {
  vec3 s = vec3(abs(q.x), q.y, q.z);
  float shell = abs(sdEllipsoid(q, vec3(0.78, 1.0, 0.62))) - 0.05;
  shell = max(shell, -q.z + 0.05);
  shell = smin(shell, sdRoundCone(q, vec3(0.0, 0.18, 0.6), vec3(0.0, -0.18, 0.7), 0.07, 0.11), 0.08);
  float eye = sdEllipsoid(s - vec3(0.32, 0.18, 0.5), vec3(0.2, 0.09, 0.3));
  shell = max(shell, -eye);
  float mouth = sdEllipsoid(q - vec3(0.0, -0.5, 0.5), vec3(0.22, 0.04, 0.3));
  shell = max(shell, -mouth);
  float back = sdEllipsoid(q - vec3(0.0, 0.0, 0.1), vec3(0.62, 0.8, 0.38));
  return vec2(shell, back);
}

vec3 maskLocal(vec3 p, vec4 a, vec4 b) {
  vec3 q = (p - a.xyz) / a.w;
  q.xz = rot(-b.x) * q.xz;
  q.yz = rot(-b.y) * q.yz;
  q.xy = rot(b.z) * q.xy;
  return q;
}

// 큰 가면 (형태마다 다르다), 크기 1 기준
vec2 bigMask(vec3 q) {
  vec3 s = vec3(abs(q.x), q.y, q.z);
  float shell = abs(sdEllipsoid(q, vec3(0.8, 1.05, 0.66))) - 0.045;
  shell = max(shell, -q.z + 0.08);
  float back = sdEllipsoid(q - vec3(0.0, 0.0, 0.12), vec3(0.64, 0.85, 0.4));
#if FORM == 0
  // 두 얼굴: 매끈한 얼굴 뒤로 또 하나의 얼굴이 비스듬히 겹쳐 있다
  shell = smin(shell, sdRoundCone(q, vec3(0.0, 0.15, 0.64), vec3(0.0, -0.2, 0.73), 0.06, 0.1), 0.08);
  shell = max(shell, -sdEllipsoid(s - vec3(0.31, 0.16, 0.5), vec3(0.17, 0.07, 0.3)));
  shell = max(shell, -sdEllipsoid(q - vec3(0.0, -0.52, 0.5), vec3(0.14, 0.025, 0.3)));
  vec3 q2 = q - vec3(-0.5, 0.08, -0.45);
  q2.xz = rot(1.0) * q2.xz;
  float s2 = max(abs(sdEllipsoid(q2, vec3(0.78, 1.0, 0.62))) - 0.04, -q2.z + 0.08);
  s2 = max(s2, -sdEllipsoid(vec3(abs(q2.x), q2.yz) - vec3(0.3, 0.16, 0.5), vec3(0.17, 0.07, 0.3)));
  shell = min(shell, s2);
#elif FORM == 1
  // 희극: 위로 휜 눈, 귀까지 찢어진 웃음
  shell = smin(shell, sdRoundCone(q, vec3(0.0, 0.15, 0.64), vec3(0.0, -0.2, 0.73), 0.06, 0.1), 0.08);
  vec3 e = s - vec3(0.32, 0.2, 0.5);
  e.y -= 0.35 * e.x * e.x / 0.04 * 0.04 - 0.06;
  shell = max(shell, -sdEllipsoid(e, vec3(0.2, 0.06, 0.3)));
  vec3 m = q - vec3(0.0, -0.45, 0.5);
  m.y -= 0.9 * m.x * m.x;
  shell = max(shell, -sdEllipsoid(m, vec3(0.5, 0.07, 0.4)));
#elif FORM == 2
  // 반쪽 가면: 오른쪽 반은 깨져 나갔다
  shell = smin(shell, sdRoundCone(q, vec3(0.0, 0.15, 0.64), vec3(0.0, -0.2, 0.73), 0.06, 0.1), 0.08);
  shell = max(shell, -sdEllipsoid(s - vec3(0.31, 0.16, 0.5), vec3(0.18, 0.08, 0.3)));
  shell = max(shell, -sdEllipsoid(q - vec3(0.0, -0.52, 0.5), vec3(0.2, 0.03, 0.3)));
  float brk = q.x - 0.03 - 0.07 * sin(q.y * 17.0) - 0.04 * sin(q.y * 41.0 + 1.0);
  shell = max(shell, brk);
#else
  // 카니발 가면: 눈만 덮는 금 테 가면, 위로 솟은 가시 장식. 그 아래 얼굴은 비었다
  float band = abs(sdEllipsoid(q - vec3(0.0, 0.15, 0.0), vec3(0.9, 0.42, 0.72))) - 0.05;
  band = max(band, -q.z + 0.15);
  band = max(band, -sdEllipsoid(s - vec3(0.33, 0.15, 0.5), vec3(0.2, 0.11, 0.4)));
  for (int i = 0; i < 5; i++) {
    float a = (float(i) - 2.0) * 0.38;
    vec3 b0 = vec3(sin(a) * 0.6, 0.45, 0.45 - abs(a) * 0.2);
    band = smin(band, sdRoundCone(q, b0, b0 + vec3(sin(a) * 0.55, 0.85 - abs(a) * 0.3, -0.15), 0.07, 0.01), 0.05);
  }
  shell = band;
#endif
  return vec2(shell, back);
}

vec2 sdf(vec3 p) {
  // 덩어리
  float d = 1e5;
  for (int i = 0; i < 64; i++) {
    if (i >= int(uP[0].x)) break;
    d = smin(d, length(p - uA[i].xyz) - uA[i].w, 0.32);
  }
  d = smin(d, chainR(p, 0, uBN, 0.05), 0.16);
  // 힘줄 결 (값싼 사인 변위)
  d += 0.008 * sin(p.y * 23.0 + sin(p.x * 7.0) * 3.0) * sin(p.x * 19.0 - p.z * 13.0);
  vec2 r = vec2(d, 1.0);
  // 작은 가면들
  float sh = 1e5;
  float bk = 1e5;
  for (int i = int(uP[0].x); i < int(uP[0].y); i += 2) {
    vec4 a = uA[i];
    float bound = length(p - a.xyz) - a.w * 1.3;
    if (bound > 0.05) { sh = min(sh, bound); continue; }
    vec2 m = maskShape(maskLocal(p, a, uA[i + 1])) * a.w;
    sh = min(sh, m.x);
    bk = min(bk, m.y);
  }
  // 큰 가면
  vec3 mq = (p - uP[1].xyz) / 0.33;
  mq.xz = rot(-0.1) * mq.xz;
  mq.yz = rot(0.3) * mq.yz;
  mq.xy = rot(0.14) * mq.xy;
  vec2 bm = bigMask(mq) * 0.33;
#if FORM == 2
  // 깨져 나간 쪽: 빛을 먹는 어둠, 그 안에서 눈 하나가 빛난다
  float vh = max(bm.y, -(mq.x - 0.03) * 0.33);
  bm.y = max(bm.y, (mq.x - 0.03) * 0.33);
  bm.y = min(bm.y, (length(mq - vec3(0.3, 0.16, 0.36)) - 0.075) * 0.33);
  r = umin(r, vec2(vh, 99.0));
#endif
#if FORM == 3
  // 가면 아래 얼굴은 비었다: 어둠 속에 눈 둘만
  float vh = bm.y;
  bm.y = (length(vec3(abs(mq.x), mq.yz) - vec3(0.33, 0.15, 0.38)) - 0.075) * 0.33;
  r = umin(r, vec2(vh, 99.0));
#endif
  r = umin(r, vec2(min(sh, bm.x), 2.0));
  r = umin(r, vec2(min(bk, bm.y), 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 G = uP[2].xyz;
  if (id < 1.5) {
    // 기름처럼 검고 젖은 살, 힘줄 사이로 희미한 빛
    float v = fbm3(p * 6.0);
    float vein = smoothstep(0.035, 0.0, ridge(p * 4.0 + v)) * smoothstep(0.62, 0.85, noise(p * 2.0));
    return Mat(vec3(0.012, 0.01, 0.013) * (0.6 + 0.8 * v), 0.18, 1.2, G * vein * 0.3, 0.45, 0.1, 0.85);
  }
  if (id < 2.5) {
    // 도자기 가면: 바랜 흰색, 드문 금 간 틈과 때
    float crack = smoothstep(0.02, 0.0, ridge(p * 9.0)) * smoothstep(0.66, 0.8, noise(p * 4.0));
    float dirt = fbm3(p * 14.0);
    vec3 alb = vec3(0.3, 0.28, 0.25) * (0.55 + 0.6 * dirt) * (1.0 - crack * 0.85);
#if FORM == 3
    float gild = step(length(p - uP[1].xyz), 0.6);
    vec3 V = normalize(uCamPos - p);
    vec3 Rf = reflect(-V, n);
    float env = 0.08 + 0.25 * smoothstep(-0.3, 0.8, Rf.y) + 1.4 * pow(max(dot(Rf, normalize(uKeyDir)), 0.0), 8.0) + 0.8 * pow(max(dot(Rf, normalize(uPtPos - p)), 0.0), 10.0);
    vec3 gem = vec3(1.0, 0.68, 0.26) * env * 0.35 * gild * (0.6 + 0.4 * dirt);
    alb = mix(alb, vec3(0.16, 0.1, 0.035), gild);
    return Mat(alb, mix(0.45, 0.25, gild), mix(0.5, 1.4, gild), G * crack * 0.4 + gem, 0.0, mix(0.25, 0.0, gild), 0.15);
#endif
    return Mat(alb, 0.45, 0.5, G * crack * 0.4, 0.0, 0.25, 0.15);
  }
  // 가면 뒤에서 새는 빛
  return Mat(vec3(0.0), 1.0, 0.0, G * 2.2, 0.0, 0.0, 0.0);
}
`,
  };
}
