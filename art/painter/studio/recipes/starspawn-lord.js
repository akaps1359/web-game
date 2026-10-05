// 별의 자손 군주 (4층 수호자) — 별에서 내려온 자손들의 왕. 그 꿈은 잠든 자에게 닿아 있다.
// 산처럼 웅크린 거인: 뒤로 쓸려 올라간 두족류의 머리에 별 조각 왕관이 박혀 있고, 짙은 눈두덩 아래 청록 눈빛,
// 수염처럼 늘어져 말려 드는 얼굴 촉수, 등 뒤로 펼친 막 날개(뒤에서 오는 빛이 막을 비춘다),
// 한 손은 땅을 짚고 한 손은 갈퀴를 펼쳐 치켜들었다. 비늘 가죽엔 별자리처럼 희미한 빛 점.
// 형체 대부분은 자료 배열(uA 타원체·왕관, uB 사슬)로 넘기고 셰이더는 고리로 돈다.
import { rng } from '../../lib.js';

const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export default function starspawnLord({ seed = 1 } = {}) {
  const R = rng(seed * 613 + 29);

  // ── 몸 타원체 (uA: [중심, k], [반지름, 0]) ──
  const ell = [];
  const E = (c, r, k = 0.25) => ell.push([...c, k], [...r, 0]);
  E([0, 1.1, -0.5], [0.6, 0.5, 0.55]); // 골반
  E([0, 1.65, -0.2], [0.66, 0.66, 0.6]); // 배
  E([0, 2.3, 0.12], [1.02, 0.7, 0.72]); // 가슴
  E([0, 2.7, -0.45], [0.95, 0.62, 0.62]); // 등 혹
  E([1.05, 2.5, 0.06], [0.48, 0.42, 0.44], 0.3); // 어깨
  E([-1.05, 2.5, 0.06], [0.48, 0.42, 0.44], 0.3);
  E([0, 2.68, 0.58], [0.36, 0.32, 0.36], 0.3); // 목
  E([0, 3.0, 0.82], [0.42, 0.46, 0.46], 0.22); // 얼굴
  E([0, 3.42, 0.6], [0.36, 0.5, 0.42], 0.2); // 머리 덮개
  E([0, 3.86, 0.28], [0.24, 0.38, 0.27], 0.18); // 덮개 끝
  E([0, 3.17, 1.08], [0.3, 0.07, 0.13], 0.08); // 눈두덩
  E([0.74, 1.0, 0.15], [0.3, 0.5, 0.34], 0.2); // 허벅지
  E([-0.74, 1.0, 0.15], [0.3, 0.5, 0.34], 0.2);
  E([0.86, 0.45, 0.42], [0.19, 0.4, 0.21], 0.12); // 정강이
  E([-0.86, 0.45, 0.42], [0.19, 0.4, 0.21], 0.12);
  E([0.9, 0.11, 0.72], [0.22, 0.11, 0.36], 0.1); // 발
  E([-0.9, 0.11, 0.72], [0.22, 0.11, 0.36], 0.1);
  const palmG = [-1.22, 0.2, 1.18];
  E(palmG, [0.24, 0.12, 0.26], 0.12); // 땅 짚은 손
  const palmU = [1.55, 3.55, 0.85];
  E(palmU, [0.2, 0.24, 0.12], 0.12); // 치켜든 손
  const nBody = ell.length;
  // 왕관: 별 조각 가시 (uA: [밑동, 반지름], [끝, 반지름])
  const crownBase = [0, 3.62, 0.48];
  for (let i = 0; i < 7; i++) {
    const a = -1.25 + (i / 6) * 2.5;
    const base = [crownBase[0] + Math.sin(a) * 0.3, crownBase[1] + Math.cos(a) * 0.12 - Math.abs(a) * 0.1, crownBase[2] - Math.cos(a) * 0.08];
    const len = (0.5 + R() * 0.35) * (1 - Math.abs(a) * 0.25);
    const dir = norm([Math.sin(a) * 0.9, 0.9 + R() * 0.2, -0.45 + (R() - 0.5) * 0.3]);
    ell.push([...base, 0.06 + R() * 0.02], [...add(base, dir, len), 0.004]);
  }
  const nCrown = ell.length;

  // ── 사슬 (uB) ── 살갗(팔·촉수·날개뼈) → 발톱
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  // 팔: 땅 짚은 팔, 치켜든 팔
  ch.push([-1.08, 2.5, 0.1, 0.33], [-1.5, 1.62, 0.38, 0.25], [-1.3, 0.55, 0.95, 0.17], [...palmG, 0.14]);
  brk();
  ch.push([1.08, 2.5, 0.1, 0.33], [1.66, 2.5, 0.32, 0.24], [1.6, 3.25, 0.7, 0.16], [...palmU, 0.13]);
  brk();
  // 얼굴 촉수: 입가에서 늘어져 끝이 말린다
  for (let k = 0; k < 7; k++) {
    const u = (k / 6) * 2 - 1;
    const base = [u * 0.3, 2.86 - Math.abs(u) * 0.08, 1.08 - Math.abs(u) * 0.12];
    const len = (1.25 - Math.abs(u) * 0.45) * (0.85 + R() * 0.3);
    const curl = (R() < 0.5 ? -1 : 1) * (0.15 + R() * 0.2);
    const M = 8;
    for (let i = 0; i < M; i++) {
      const t = i / (M - 1);
      const x = base[0] + u * 0.25 * t + curl * Math.sin(t * 3.2) * t;
      const y = base[1] - len * t + Math.max(0, t - 0.75) * 0.6 * len;
      const z = base[2] + 0.18 * t - Math.max(0, t - 0.7) * 0.5 + Math.sin(t * 4 + k) * 0.04;
      ch.push([x, y, z, 0.075 * Math.pow(1 - t, 0.85) + 0.012]);
    }
    brk();
  }
  // 날개 뼈 (막 평면과 같은 틀)
  const W0 = [0.55, 3.05, -0.65];
  const S = norm([0.8, 0.72, -0.28]);
  let V = norm([0.25, -0.45, -0.85]);
  V = norm(add(V, S, -dot(V, S)));
  const L = 3.0;
  const H = 1.55;
  const trail = (u) => H * Math.sqrt(Math.max(0, 1 - ((u - L * 0.5) / (L * 0.5)) ** 2));
  for (const sx of [1, -1]) {
    const m = (v) => [v[0] * sx, v[1], v[2]];
    const P = (u, v) => m(add(add(W0, S, u), V, v));
    const wrist = P(L * 0.42, -0.02);
    ch.push([...P(0, 0), 0.13], [...P(L * 0.2, -0.04), 0.1], [...wrist, 0.08], [...P(L * 0.75, 0.02), 0.05], [...P(L, 0.0), 0.02]);
    brk();
    for (const f of [0.55, 0.72, 0.88]) {
      const u = L * f;
      ch.push([...wrist, 0.06], [...P(u, trail(u) * 0.55), 0.035], [...P(u + 0.04, trail(u) - 0.05), 0.012]);
      brk();
    }
    // 날개 엄지 발톱
    ch.push([...wrist, 0.05], [...P(L * 0.47, -0.22), 0.012]);
    brk();
  }
  const nSkin = ch.length;
  // 발톱: 땅 짚은 손 (땅으로 파고든다), 치켜든 손 (펼쳤다), 발
  for (let i = 0; i < 4; i++) {
    const a = -0.9 + i * 0.6;
    const b0 = add(palmG, [Math.sin(a) * 0.18, 0.02, Math.cos(a) * 0.16]);
    const b1 = add(b0, [Math.sin(a) * 0.22, 0.05, Math.cos(a) * 0.2]);
    const b2 = add(b1, [Math.sin(a) * 0.12, -0.2, Math.cos(a) * 0.1]);
    ch.push([...b0, 0.055], [...b1, 0.04], [...b2, 0.006]);
    brk();
  }
  for (let i = 0; i < 4; i++) {
    const a = -0.75 + i * 0.5;
    const b0 = add(palmU, [Math.sin(a) * 0.14, 0.12, 0.04]);
    const b1 = add(b0, [Math.sin(a) * 0.2, 0.22, 0.08]);
    const b2 = add(b1, [Math.sin(a) * 0.08, 0.16, 0.16]);
    ch.push([...b0, 0.05], [...b1, 0.035], [...b2, 0.005]);
    brk();
  }
  const nClaw = ch.length;

  // 눈: 눈두덩 아래 깊은 곳의 청록 빛 (형체 없이 빛만)
  const lights = [
    [-0.16, 3.07, 1.2, 0.02],
    [0.16, 3.07, 1.2, 0.02],
    [-0.29, 3.12, 1.1, 0.011],
    [0.29, 3.12, 1.1, 0.011],
  ];
  const lc = [
    [0.4, 1.0, 0.9, 2.2],
    [0.4, 1.0, 0.9, 2.2],
    [0.4, 1.0, 0.9, 1.4],
    [0.4, 1.0, 0.9, 1.4],
  ];
  // 떠도는 별빛
  for (let i = 0; i < 10; i++) {
    const a = R() * 6.28;
    lights.push([Math.cos(a) * (1.4 + R() * 1.4), 0.5 + R() * 3.6, Math.sin(a) * 0.8 + 0.4, 0.006 + R() * 0.01]);
    lc.push(R() < 0.6 ? [0.5, 1.0, 0.9, 0.8] : [1.0, 0.85, 0.5, 0.8]);
  }

  return {
    preset: 'act4',
    cam: { pos: [0.9, 0.9, 11.5], target: [0, 2.25, 0], fov: 1.8 },
    light: {
      key: [-0.25, 0.55, -0.8],
      keyCol: [1.1, 1.05, 0.75],
      fillCol: [0.1, 0.16, 0.2],
      amb: [0.015, 0.025, 0.03],
      rimCol: [0.8, 1.1, 1.0],
      rim: 1.3,
      exposure: 1.25,
      pt: [0.2, 1.7, 2.3],
      ptCol: [0.5, 1.4, 1.25],
    },
    frame: { fill: 0.93, bottom: 0.025 },
    arrays: {
      uA: ell,
      uB: ch,
      uL: lights,
      uLC: lc,
      uP: [
        [nBody, nCrown, nSkin, nClaw],
        [...W0, L],
        [...S, H],
        [...V, 0],
      ],
    },
    glsl: /* glsl */ `
float ellR(vec3 p, int a, int b) {
  float d = 1e5;
  for (int i = a; i < b; i += 2) d = smin(d, sdEllipsoid(p - uA[i].xyz, uA[i + 1].xyz), uA[i].w);
  return d;
}
float coneR(vec3 p, int a, int b) {
  float d = 1e5;
  for (int i = a; i < b; i += 2) d = min(d, sdRoundCone(p, uA[i].xyz, uA[i + 1].xyz, uA[i].w, uA[i + 1].w));
  return d;
}
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

// 날개 막: 날개 틀 (W0, S, V) 안의 반타원, 뒷가장자리는 뼈 사이로 파였다
float wingD(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z) - uP[1].xyz;
  float L = uP[1].w;
  float H = uP[2].w;
  vec3 S = uP[2].xyz;
  vec3 V = uP[3].xyz;
  vec3 N = cross(S, V);
  float u = dot(q, S);
  float v = dot(q, V);
  float w = dot(q, N);
  // 막이 바람에 살짝 부푼다
  w -= 0.12 * sin(clamp(u / L, 0.0, 1.0) * 3.14159) * sin(clamp(v / H, 0.0, 1.0) * 3.14159);
  float sc = 0.16 * (0.5 + 0.5 * cos(clamp(u / L, 0.0, 1.0) * 6.2831853 * 3.4 - 0.9));
  float e = length(vec2((u - L * 0.5) / (L * 0.5), v / (H - sc * smoothstep(0.3, 0.9, v / H)))) - 1.0;
  float d = max(e * min(L * 0.5, H) * 0.6, -v);
  return max(d, abs(w) - 0.012);
}

vec2 sdf(vec3 p) {
  float body = ellR(p, 0, int(uP[0].x));
  body = smin(body, chainR(p, 0, int(uP[0].z), 0.04), 0.14);
  // 눈구멍
  body = smax(body, -sdEllipsoid(vec3(abs(p.x), p.y, p.z) - vec3(0.17, 3.07, 1.12), vec3(0.075, 0.04, 0.06)), 0.03);
  // 가죽 주름과 근육 결
  body += 0.03 * (noise(p * 4.5) - 0.5) + 0.006 * sin(p.y * 31.0 + sin(p.x * 9.0) * 2.0) * sin(p.x * 23.0 + p.z * 17.0);
  vec2 r = vec2(body, 1.0);
  r = umin(r, vec2(chainR(p, int(uP[0].z), int(uP[0].w), 0.02), 2.0));
  r = umin(r, vec2(coneR(p, int(uP[0].x), int(uP[0].y)), 3.0));
  r = umin(r, vec2(wingD(p), 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검푸른 비늘 가죽: 젖은 광택, 별자리 같은 희미한 빛 점
    float sc = fbm3(p * 5.0);
    float cell = smoothstep(0.0, 0.25, ridge(p * 11.0));
    vec3 alb = mix(vec3(0.012, 0.024, 0.026), vec3(0.03, 0.045, 0.04), sc) * (0.7 + 0.3 * cell);
    // 배 쪽은 조금 밝은 회녹색
    alb = mix(alb, vec3(0.04, 0.05, 0.042), smoothstep(0.2, 0.9, n.z) * smoothstep(2.4, 1.2, p.y) * 0.5);
    // 어깨·머리에만 별자리처럼 드문 빛 점
    vec3 g = p * 11.0;
    float spot = step(0.975, hash31(floor(g))) * smoothstep(0.25, 0.05, length(fract(g) - 0.5));
    vec3 emi = vec3(0.3, 1.0, 0.85) * spot * 1.2 * smoothstep(2.1, 2.9, p.y);
    return Mat(alb, 0.5, 0.5, emi, 0.12, 0.25, 0.45);
  }
  if (id < 2.5) return Mat(vec3(0.012, 0.012, 0.014), 0.2, 1.3, vec3(0.0), 0.1, 0.0, 0.6);
  if (id < 3.5) {
    // 별 조각 왕관: 검은 수정, 속에서 청록 빛이 끝으로 몰린다
    float tip = smoothstep(3.95, 4.3, p.y);
    return Mat(vec3(0.01, 0.014, 0.016), 0.08, 1.6, vec3(0.3, 1.0, 0.9) * tip * 1.4, 0.3, 0.2, 0.7);
  }
  // 날개 막: 얇고 검푸르다, 뒤에서 빛이 비친다, 핏줄
  float vein = smoothstep(0.05, 0.0, ridge(p * 3.5)) * 0.7;
  vec3 alb = mix(vec3(0.012, 0.022, 0.026), vec3(0.004, 0.007, 0.008), vein);
  return Mat(alb, 0.55, 0.4, vec3(0.0), 0.0, 0.9, 0.25);
}
`,
  };
}
