// 잿빛 유충 (2층 하수인) — 재에 묻힌 것의 몸에서 떨어져 나온 유충. 쉬지 않고 재를 날라 어미를 덮는다.
// 사람 팔뚝보다 굵은 구더기가 몸을 말았다가 앞머리를 쳐들었다. 잿빛 껍질은 식어 가는 숯처럼 갈라져 틈마다 불씨가 비친다.
// 둥근 입 안쪽으로 이빨이 고리처럼 돋았고, 배 쪽엔 갓난아이 손가락 같은 짧은 다리들이 꼼지락댄다.
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map((v) => v * k);
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));

export default function ashLarva() {
  // 몸의 중심선: 꼬리(뒤쪽 바닥) → 몸을 말아 → 앞머리를 쳐들었다
  const P = [
    [0.42, 0.11, -0.28],
    [0.3, 0.13, -0.42],
    [0.06, 0.15, -0.45],
    [-0.18, 0.16, -0.32],
    [-0.3, 0.17, -0.08],
    [-0.24, 0.2, 0.14],
    [-0.08, 0.32, 0.26],
    [0.04, 0.48, 0.3],
    [0.1, 0.58, 0.38],
  ];
  const cr = (p0, p1, p2, p3, t) =>
    [0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t));
  const dense = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 20; k++) dense.push(cr(p0, P[i], P[i + 1], p3, k / 20));
  }
  dense.push(P[P.length - 1]);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(...sub(dense[i], dense[i - 1])));
  const N = 18;
  const seg = [];
  for (let i = 0; i < N; i++) {
    const target = (i / (N - 1)) * acc[acc.length - 1];
    let j = acc.findIndex((a) => a >= target);
    if (j < 0) j = dense.length - 1;
    const t = i / (N - 1);
    // 가운데가 가장 굵고(알이 찬 듯), 꼬리는 가늘고, 머리 쪽은 조금 좁다
    const r = 0.055 + 0.075 * Math.sin(Math.pow(t, 0.8) * Math.PI) * (1 - 0.25 * t) + 0.035 * Math.max(0, (t - 0.7) / 0.3);
    const pt = [...dense[j]];
    if (pt[1] < 0.25) pt[1] = Math.max(r * 0.92, pt[1] - 0.12 + r);
    seg.push([...pt, r]);
  }
  const head = seg[N - 1];
  const dir = norm(sub(seg[N - 1].slice(0, 3), seg[N - 2].slice(0, 3)));
  const mouth = add(head.slice(0, 3), mul(dir, head[3] * 0.85));
  return {
    preset: 'act2',
    cam: { pos: [0.35, 0.75, 3.1], target: [0.0, 0.28, 0.0], fov: 1.9 },
    light: {
      key: [-0.45, 0.65, -0.7],
      rim: 1.3,
      fillCol: [0.2, 0.12, 0.05],
      pt: add(mouth, mul(dir, 0.12)),
      ptCol: [0.6, 0.24, 0.07],
      exposure: 1.2,
    },
    frame: { fill: 0.92 },
    arrays: {
      uA: seg,
      uL: [[...add(mouth, mul(dir, -0.02)), 0.02]],
      uLC: [[1.0, 0.45, 0.12, 0.6]],
    },
    glsl: /* glsl */ `
const int NSEG = ${N};
const vec3 HEADC = ${v3(head.slice(0, 3))};
const vec3 HDIR = ${v3(dir)};
const float HR = ${head[3].toFixed(4)};

vec2 sdf(vec3 p) {
  float bound = sdBox(p - vec3(0.05, 0.3, -0.05), vec3(0.65, 0.4, 0.65));
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 마디진 몸: 마디 사이가 잘록하게 패였다
  float body = 1e5;
  float crease = 1e5;
  for (int i = 0; i < NSEG; i++) {
    vec4 s = uA[i];
    float d = length(p - s.xyz) - s.w;
    body = smin(body, d, s.w * 0.55);
    if (i > 0) {
      vec3 m = (s.xyz + uA[i - 1].xyz) * 0.5;
      crease = min(crease, length(p - m));
    }
  }
  body += 0.012 * smoothstep(0.06, 0.0, crease - 0.07);
  // 식어 가는 숯 같은 갈라진 껍질
  body += 0.004 * smoothstep(0.08, 0.0, ridge(p * 9.0)) + 0.003 * (fbm3(p * 30.0) - 0.5);
  // ── 머리: 둥근 입을 판다
  vec3 q = p - HEADC;
  float along = dot(q, HDIR);
  vec3 radial = q - HDIR * along;
  float mouthHole = max(length(radial) - HR * 0.55, -(along - HR * 0.15));
  body = smax(body, -mouthHole, 0.02);
  // 입술 둘레의 두툼한 고리
  float lip = length(vec2(length(radial) - HR * 0.62, along - HR * 0.72)) - HR * 0.16;
  body = smin(body, lip, 0.02);
  vec2 r = vec2(body, 1.0);
  // 입 속: 고리 모양으로 안쪽을 향한 이빨 두 줄, 그 안은 불씨
  float teeth = 1e5;
  vec3 up = normalize(cross(HDIR, vec3(1.0, 0.0, 0.0)));
  vec3 sd = normalize(cross(HDIR, up));
  for (int k = 0; k < 2; k++) {
    float depth = HR * (0.55 - float(k) * 0.25);
    float rr = HR * (0.5 - float(k) * 0.08);
    for (int i = 0; i < 10; i++) {
      float a = (float(i) + float(k) * 0.5) * 0.6283;
      vec3 dirR = up * cos(a) + sd * sin(a);
      vec3 base = HEADC + HDIR * depth + dirR * rr;
      teeth = min(teeth, sdRoundCone(p, base, base - dirR * HR * 0.28 + HDIR * HR * 0.05, HR * 0.07, HR * 0.008));
    }
  }
  r = umin(r, vec2(teeth, 2.0));
  r = umin(r, vec2(length(p - HEADC - HDIR * HR * 0.1) - HR * 0.42, 3.0));
  // ── 배 쪽의 짧은 다리들 (갓난아이 손가락 같다)
  float legs = 1e5;
  for (int i = 9; i < NSEG - 1; i += 2) {
    vec4 s = uA[i];
    vec3 t = normalize(uA[i + 1].xyz - s.xyz);
    vec3 side = normalize(cross(t, vec3(0.0, 1.0, 0.0)));
    vec3 down = normalize(cross(side, t));
    for (int k = 0; k < 2; k++) {
      float sx = k == 0 ? -1.0 : 1.0;
      vec3 b = s.xyz + side * sx * s.w * 0.55 - down * s.w * 0.7;
      vec3 m = b + side * sx * 0.025 - down * 0.03;
      vec3 e = m + side * sx * 0.012 - down * 0.022 - t * 0.018;
      legs = min(legs, sdRoundCone(p, b, m, 0.011, 0.008));
      legs = min(legs, sdRoundCone(p, m, e, 0.008, 0.005));
      legs = min(legs, sdSphere(p - m, 0.009));
    }
  }
  r = umin(r, vec2(legs, 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 잿빛 껍질: 위쪽은 하얗게 식은 재, 갈라진 틈에서 주황 불씨가 비친다
    float crack = smoothstep(0.022, 0.0, ridge(p * 11.0)) * smoothstep(0.4, 0.65, fbm3(p * 4.0));
    float crack2 = smoothstep(0.018, 0.0, ridge(p * 26.0 + 3.0)) * smoothstep(0.45, 0.7, fbm3(p * 6.0 + 2.0)) * 0.7;
    float top = smoothstep(-0.2, 0.8, n.y);
    vec3 alb = mix(vec3(0.05, 0.047, 0.044), vec3(0.17, 0.165, 0.158), top * top) * (0.7 + 0.5 * fbm3(p * 25.0));
    float glow = max(crack, crack2);
    vec3 emi = vec3(1.6, 0.5, 0.1) * glow * (0.5 + 0.8 * noise(p * 40.0));
    alb *= 1.0 - glow * 0.8;
    return Mat(alb, 0.9, 0.1, emi, 0.0, 0.3, 0.0);
  }
  if (id < 2.5) return Mat(vec3(0.17, 0.14, 0.09), 0.35, 0.8, vec3(0.08, 0.025, 0.005), 0.0, 0.3, 0.4);
  if (id < 3.5) return Mat(vec3(0.02), 0.9, 0.0, vec3(2.0, 0.6, 0.12) * (0.6 + 0.6 * noise(p * 60.0)), 0.0, 0.0, 0.0);
  // 작은 다리: 창백한 살
  return Mat(vec3(0.15, 0.12, 0.1), 0.5, 0.4, vec3(0.0), 0.0, 0.6, 0.3);
}
`,
  };
}
