// 뼈지네 (2층) — 납골당의 뼈를 껍데기 삼아 재 속을 기는 지네. 수도사들은 "회개하지 않는 혀"라 불렀다.
// 바닥에 똬리를 틀었다가 앞몸을 S자로 곧추세워 덮칠 자세. 마디마다 척추뼈 같은 뼈 판(뒤로 뻗은 가시)을 덧댔고,
// 다리는 갈비뼈처럼 휜 뼈다. 머리 아래엔 서로를 향해 휜 거대한 독니, 작은 핏빛 눈이 무리 지어 박혔다.
const YAW = -0.95;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map((v) => v * k);
const len = (a) => Math.hypot(...a);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export default function boneCentipede() {
  const P = [
    [-0.6, 0.05, -0.35],
    [-0.45, 0.05, -0.62],
    [-0.1, 0.05, -0.68],
    [0.25, 0.05, -0.5],
    [0.38, 0.06, -0.18],
    [0.22, 0.1, 0.06],
    [0.02, 0.3, 0.12],
    [-0.06, 0.62, 0.06],
    [0.0, 0.92, 0.12],
    [0.06, 1.08, 0.32],
    [0.07, 1.06, 0.5],
  ];
  const cr = (p0, p1, p2, p3, t) =>
    [0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t));
  // 촘촘히 보간한 뒤 길이로 고르게 24마디
  const dense = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 30; k++) dense.push(cr(p0, P[i], P[i + 1], p3, k / 30));
  }
  dense.push(P[P.length - 1]);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + len(sub(dense[i], dense[i - 1])));
  const total = acc[acc.length - 1];
  const N = 24;
  const segs = [];
  for (let i = 0; i < N; i++) {
    const target = (i / (N - 1)) * total;
    let j = acc.findIndex((a) => a >= target);
    if (j < 0) j = dense.length - 1;
    segs.push(dense[j]);
  }
  const A = [];
  const SIDE = [];
  const DORS = [];
  const LEGS = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const T = norm(sub(segs[Math.min(N - 1, i + 1)], segs[Math.max(0, i - 1)]));
    const ty = Math.abs(T[1]);
    const D0 = norm([0, 1 - ty * 0.9, -ty]);
    const S = norm(cross(T, D0));
    const D = cross(S, T);
    const r = 0.048 + 0.045 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.85) + (i === N - 1 ? 0.01 : 0);
    A.push([...segs[i], r]);
    SIDE.push([...S, 0]);
    DORS.push([...D, 0]);
    for (const s of [-1, 1]) {
      const c = segs[i];
      const base = add(c, mul(S, s * r * 0.9));
      const low = c[1] < 0.2;
      let knee;
      let tip;
      if (low) {
        knee = add(add(base, mul(S, s * 0.11)), [0, 0.07, 0]);
        tip = [knee[0] + S[0] * s * 0.07 - T[0] * 0.03, 0.008, knee[2] + S[2] * s * 0.07 - T[2] * 0.03];
      } else {
        const curl = Math.min(1, (c[1] - 0.2) / 0.6);
        knee = add(add(base, mul(S, s * 0.1)), mul(D, -0.03));
        tip = add(add(add(knee, mul(S, s * (0.05 - 0.04 * curl))), mul(T, -0.06)), mul(D, -0.07 - 0.03 * curl));
      }
      LEGS.push([...knee, 0], [...tip, 0]);
    }
  }
  const head = segs[N - 1];
  const cam = [0.3, 0.65, 4.2];
  // 머리의 눈 무리 (지역 좌표 → 세계)
  const hT = norm(sub(segs[N - 1], segs[N - 2]));
  const hS = SIDE[N - 1];
  const hD = DORS[N - 1];
  const eyes = [];
  for (const s of [-1, 1]) {
    for (const [a, b, c] of [
      [0.028, 0.03, 0.035],
      [0.042, 0.022, 0.025],
      [0.036, 0.04, 0.018],
    ]) {
      eyes.push(add(add(add(head, mul(hS, s * a)), mul(hD, b)), mul(hT, c)));
    }
  }
  return {
    preset: 'act2',
    cam: { pos: cam, target: [0.0, 0.5, 0.0], fov: 1.85 },
    light: {
      key: [-0.45, 0.65, -0.7],
      rim: 1.35,
      fillCol: [0.22, 0.12, 0.05],
      pt: toWorld([0.3, 0.3, 0.6]),
      ptCol: [0.7, 0.36, 0.12],
      exposure: 1.2,
    },
    frame: { fill: 0.92 },
    arrays: {
      uA: A,
      uB: [...SIDE, ...DORS, ...LEGS],
      uL: eyes.map((e) => [...toWorld(e), 0.0045]),
      uLC: eyes.map(() => [1.0, 0.15, 0.08, 1.2]),
    },
    glsl: /* glsl */ `
const float YAW = ${YAW.toFixed(4)};
const int NSEG = ${N};

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  float bound = sdBox(p - vec3(-0.1, 0.55, -0.15), vec3(0.75, 0.65, 0.75));
  if (bound > 0.3) return vec2(bound, 1.0);
  float flesh = 1e5;
  float bone = 1e5;
  float legs = 1e5;
  for (int i = 0; i < NSEG; i++) {
    vec4 a = uA[i];
    vec3 c = a.xyz;
    float r = a.w;
    float dc = length(p - c);
    if (dc > r + 0.32) {
      flesh = min(flesh, dc - r - 0.2);
      continue;
    }
    vec3 S = uB[i].xyz;
    vec3 D = uB[NSEG + i].xyz;
    vec3 T = cross(D, S);
    vec3 q = p - c;
    vec3 lq = vec3(dot(q, S), dot(q, D), dot(q, T));
    // 마디 사이의 검붉은 살
    flesh = smin(flesh, sdEllipsoid(lq, vec3(r * 0.95, r * 0.68, r * 1.25)), 0.03);
    // 등의 뼈 판: 넓적하고, 가장자리가 아래로 휘었다
    vec3 pq = lq - vec3(0.0, r * 0.35, -r * 0.1);
    pq.y += pq.x * pq.x / (r * 2.4);
    float plate = sdEllipsoid(pq, vec3(r * 1.45, r * 0.45, r * 1.15));
    plate = max(plate, -sdEllipsoid(pq - vec3(0.0, -r * 0.35, 0.0), vec3(r * 1.3, r * 0.4, r * 1.25)));
    // 배 쪽 뼈 판 (조금 좁다)
    vec3 vq = lq - vec3(0.0, -r * 0.3, -r * 0.05);
    vq.y -= vq.x * vq.x / (r * 2.6);
    float vplate = sdEllipsoid(vq, vec3(r * 1.0, r * 0.32, r * 1.05));
    vplate = max(vplate, -sdEllipsoid(vq - vec3(0.0, r * 0.28, 0.0), vec3(r * 0.9, r * 0.3, r * 1.15)));
    plate = min(plate, vplate);
    // 뒤로 뻗은 가시 (척추뼈의 극돌기)
    plate = smin(plate, sdRoundCone(lq, vec3(0.0, r * 0.6, 0.0), vec3(0.0, r * 1.75, -r * 1.2), r * 0.26, r * 0.04), r * 0.15);
    // 옆으로 튀어나온 돌기
    vec3 la = vec3(abs(lq.x), lq.y, lq.z);
    plate = smin(plate, sdRoundCone(la, vec3(r * 1.2, r * 0.3, 0.0), vec3(r * 1.8, r * 0.1, -r * 0.4), r * 0.16, r * 0.04), r * 0.1);
    bone = min(bone, plate);
    // 다리 두 개: 갈비뼈처럼 휜 뼈
    for (int s = 0; s < 2; s++) {
      vec3 base = c + S * (s == 0 ? -1.0 : 1.0) * r * 0.9;
      vec3 kn = uB[2 * NSEG + i * 4 + s * 2].xyz;
      vec3 tp = uB[2 * NSEG + i * 4 + s * 2 + 1].xyz;
      float lg = sdRoundCone(p, base, kn, r * 0.22, 0.009);
      lg = min(lg, sdRoundCone(p, kn, tp, 0.009, 0.0015));
      lg = min(lg, sdSphere(p - kn, 0.012));
      legs = min(legs, lg);
    }
  }
  // ── 머리: 납작한 머리판, 아래로 휜 거대한 독니, 더듬이
  vec4 h = uA[NSEG - 1];
  vec3 hS = uB[NSEG - 1].xyz;
  vec3 hD = uB[2 * NSEG - 1].xyz;
  vec3 hT = normalize(h.xyz - uA[NSEG - 2].xyz);
  vec3 hq = p - h.xyz;
  vec3 lh = vec3(dot(hq, hS), dot(hq, hD), dot(hq, hT));
  float head = sdEllipsoid(lh - vec3(0.0, 0.0, 0.03), vec3(0.075, 0.035, 0.07));
  bone = smin(bone, head, 0.02);
  float fang = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 f0 = vec3(sx * 0.045, -0.025, 0.05);
    vec3 f1 = vec3(sx * 0.075, -0.045, 0.12);
    vec3 f2 = vec3(sx * 0.05, -0.05, 0.19);
    vec3 f3 = vec3(sx * 0.012, -0.04, 0.21);
    float fg = sdRoundCone(lh, f0, f1, 0.022, 0.016);
    fg = min(fg, sdRoundCone(lh, f1, f2, 0.016, 0.009));
    fg = min(fg, sdRoundCone(lh, f2, f3, 0.009, 0.0015));
    fang = min(fang, fg);
    // 더듬이: 길게 뒤로 휘었다
    vec3 a0 = vec3(sx * 0.04, 0.02, 0.08);
    vec3 a1 = vec3(sx * 0.12, 0.12, 0.13);
    vec3 a2 = vec3(sx * 0.2, 0.2, 0.05);
    vec3 a3 = vec3(sx * 0.25, 0.22, -0.08);
    float an = sdRoundCone(lh, a0, a1, 0.006, 0.004);
    an = min(an, sdRoundCone(lh, a1, a2, 0.004, 0.003));
    an = min(an, sdRoundCone(lh, a2, a3, 0.003, 0.0012));
    legs = min(legs, an);
  }
  // 작은 큰턱
  vec3 la2 = vec3(abs(lh.x), lh.y, lh.z);
  fang = min(fang, sdRoundCone(la2, vec3(0.02, -0.02, 0.08), vec3(0.012, -0.03, 0.12), 0.01, 0.003));
  flesh += 0.002 * (fbm3(p * 40.0) - 0.5);
  bone += 0.0025 * (fbm3(p * 35.0) - 0.5);
  vec2 r = vec2(flesh, 1.0);
  r = umin(r, vec2(bone, 2.0));
  r = umin(r, vec2(legs, 3.0));
  r = umin(r, vec2(fang, 4.0));
  // 독니 사이의 어두운 입
  r = umin(r, vec2(sdEllipsoid(lh - vec3(0.0, -0.03, 0.09), vec3(0.025, 0.012, 0.02)), 99.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  float ash = smoothstep(0.3, 0.9, n.y + 0.4 * (fbm3(lp * 9.0) - 0.5));
  if (id < 1.5) {
    // 마디 사이의 검붉은 살: 젖어 번들거린다
    vec3 alb = vec3(0.04, 0.012, 0.011) * (0.6 + 0.6 * fbm3(lp * 25.0));
    return Mat(alb, 0.3, 0.8, vec3(0.0), 0.0, 0.5, 0.7);
  }
  if (id < 2.5) {
    // 누렇게 바랜 뼈 판: 갈라진 금, 핏자국, 위에 쌓인 재
    float stain = fbm3(lp * 12.0);
    float crack = smoothstep(0.06, 0.0, ridge(lp * 30.0)) * 0.6;
    vec3 alb = mix(vec3(0.3, 0.27, 0.2), vec3(0.15, 0.125, 0.09), smoothstep(0.35, 0.75, stain));
    alb *= 1.0 - crack;
    float blood = smoothstep(0.62, 0.8, fbm3(lp * 8.0 + 5.0));
    alb = mix(alb, vec3(0.08, 0.012, 0.008), blood * 0.8);
    alb = mix(alb, vec3(0.12, 0.115, 0.11), ash * 0.45);
    return Mat(alb, mix(0.6, 0.3, blood), 0.4 + blood * 0.5, vec3(0.0), 0.0, 0.25, blood * 0.5);
  }
  if (id < 3.5) {
    vec3 alb = mix(vec3(0.2, 0.18, 0.13), vec3(0.04, 0.03, 0.025), smoothstep(0.25, 0.02, lp.y));
    return Mat(alb, 0.5, 0.4, vec3(0.0), 0.0, 0.2, 0.1);
  }
  // 독니: 검붉게 반들거리고 끝은 검다
  return Mat(vec3(0.06, 0.015, 0.012), 0.2, 1.2, vec3(0.0), 0.0, 0.1, 0.6);
}
`,
  };
}
