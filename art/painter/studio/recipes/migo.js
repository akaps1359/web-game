// 유고스의 균류 (미고, 3층 일반) — 갑각과 균사로 된 날개 달린 것. 얼음 밑 광맥을 캐러 별 너머에서 왔다.
// 마디진 갑각 몸통이 앞으로 굽어 떠 있고, 등에선 막 날개 한 쌍이 박쥐처럼 펼쳐졌다(빛이 비치면 균사 무늬가 드러난다).
// 머리는 얼굴 없는 주름진 타원체 — 뇌처럼 접힌 균사 덩어리에 짧은 더듬이가 고리 모양으로 돋아 끝이 분홍빛으로 깜박인다.
// 앞다리 한 쌍은 외과 집게, 가운데 다리로는 금속 원통(유리창 너머로 사람의 뇌가 분홍빛으로 떠 있다)을 안고, 뒷다리는 늘어졌다.
const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map((x) => x * k);
const len = (a) => Math.hypot(...a);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const ry = (a) => (p) => [Math.cos(a) * p[0] + Math.sin(a) * p[2], p[1], -Math.sin(a) * p[0] + Math.cos(a) * p[2]];

export default function migo() {
  // 지역 좌표: x 오른쪽, y 위, z 앞(카메라 쪽). 살짝 오른쪽으로 돌린다
  const R = ry(-0.35);
  const G = (p) => R(p);
  const B = [];
  const line = (pts, raw = false) => {
    for (const p of pts) B.push(raw ? p : [...G(p), p[3]]);
    B.push([0, 0, 0, 0]);
  };
  // ── 몸통: 꼬리 마디 → 배 → 가슴 (앞으로 굽었다)
  line([
    [0.0, 0.55, -0.55, 0.07],
    [0.0, 0.8, -0.45, 0.13],
    [0.0, 1.08, -0.3, 0.19],
    [0.0, 1.38, -0.12, 0.23],
    [0.0, 1.65, 0.05, 0.21],
    [0.0, 1.85, 0.2, 0.15],
  ]);
  const NBODY = B.length;
  // ── 다리: 갑각 마디 (어깨 → 마디 → 마디 → 끝)
  const LEG = (pts, w) => line(pts.map((p, i) => [...p, w * (1 - (i / pts.length) * 0.6)]));
  const claws = [];
  for (const s of [-1, 1]) {
    // 앞다리: 외과 집게, 앞으로 높이 들었다
    const a0 = [s * 0.16, 1.72, 0.18];
    const a1 = [s * 0.48, 1.86, 0.42];
    const a2 = [s * 0.42, 1.55, 0.78];
    const a3 = [s * 0.3, 1.62, 1.05];
    LEG([a0, a1, a2, a3], 0.05);
    claws.push([a3, nrm(sub(a3, a2)), s]);
    // 가운데 다리: 원통을 안는다
    LEG([[s * 0.17, 1.42, 0.05], [s * 0.42, 1.25, 0.25], [s * 0.26, 1.02, 0.5], [s * 0.12, 1.0, 0.56]], 0.045);
    // 뒷다리: 늘어졌다
    LEG([[s * 0.16, 1.15, -0.2], [s * 0.42, 0.95, -0.1], [s * 0.36, 0.55, -0.15], [s * 0.3, 0.22, -0.05], [s * 0.28, 0.08, 0.05]], 0.045);
  }
  // 집게: 두 갈래로 벌어진 날
  for (const [a, d, s] of claws) {
    const side = nrm(cross(d, [0, 1, 0]));
    const up = cross(side, d);
    for (const k of [-1, 1]) {
      const b = add(add(a, d, 0.12), up, k * 0.06);
      const c = add(add(a, d, 0.25), up, k * 0.015);
      line([[...a, 0.035], [...b, 0.022], [...c, 0.004]]);
    }
  }
  // ── 날개: 등에서 나온 막 날개 (뼈)
  const P = [];
  for (const s of [-1, 1]) {
    const root = G([s * 0.12, 1.62, -0.15]);
    const U = nrm(G([s * 0.7, 0.68, -0.25]));
    const D = nrm(G([s * 0.55, -0.55, -0.6]));
    const V = nrm(sub(D, mul(U, dot(D, U))));
    const Wn = cross(U, V);
    const TH = [0.0, 0.42, 0.85, 1.25, 1.6];
    const LN = [1.55, 1.45, 1.25, 0.95, 0.5];
    const at = (th, rho) => add(add(root, add(mul(U, Math.cos(th) * rho), mul(V, Math.sin(th) * rho))), mul(Wn, -0.08 * rho * rho * 0.3));
    for (let i = 0; i < TH.length - 1; i++) {
      line([0, 0.4, 0.75, 1].map((t, j) => [...at(TH[i] + Math.sin(t * 2.5) * 0.03, LN[i] * t), [0.035, 0.024, 0.016, 0.006][j] * (i === 0 ? 1.3 : 0.8)]), true);
    }
    P.push([...root, s], [...U, 0.08], [...V, TH[4]], [...Wn, LN[4]], TH.slice(0, 4), LN.slice(0, 4));
  }
  // ── 머리와 원통
  const head = G([0.0, 2.12, 0.38]);
  const can = G([0.0, 1.05, 0.62]);
  const canAx = nrm(G([0.15, 1, -0.1]));
  // 더듬이 끝의 분홍 불빛
  const uL = [];
  const uLC = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const p = add(head, G([Math.cos(a) * 0.2, 0.1 + 0.08 * Math.sin(a * 2), Math.sin(a) * 0.18 + 0.05]));
    uL.push([...p, 0.012]);
    uLC.push([1.0, 0.5, 0.8, 0.6]);
  }
  uL.push([...can, 0.16]);
  uLC.push([1.0, 0.4, 0.75, 0.35]);
  const uP = [[NBODY, 0, 0, 0], ...P, [...head, 0], [...can, 0], [...canAx, 0]];
  if (uP.length > 16 || B.length > 160) throw new Error(`배열 초과 ${uP.length} ${B.length}`);
  return {
    preset: 'act3',
    cam: { pos: [0.6, 1.0, 6.4], target: [0.0, 1.35, 0.0], fov: 1.8 },
    light: {
      key: [-0.4, 0.55, -0.8],
      keyCol: [0.9, 1.05, 1.4],
      fill: [0.55, 0.2, 0.8],
      fillCol: [0.12, 0.1, 0.12],
      amb: [0.02, 0.018, 0.03],
      rimCol: [0.9, 0.8, 1.2],
      rim: 1.4,
      exposure: 1.4,
      glow: 0.1,
      pt: can,
      ptCol: [1.0, 0.4, 0.75],
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: { uB: B, uP, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
vec2 chainsK(vec3 p, int i0, int i1, float k) {
  float d = 1e5;
  for (int i = 0; i < 159; i++) {
    if (i < i0) continue;
    if (i + 1 >= i1) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    vec3 m = (a.xyz + b.xyz) * 0.5;
    float bound = length(p - m) - (length(a.xyz - b.xyz) * 0.5 + max(a.w, b.w));
    if (bound > d + k) continue;
    d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), k);
  }
  return vec2(d, 0.0);
}
float wingMem(vec3 p, int w) {
  int o = 1 + w * 6;
  vec3 root = uP[o].xyz;
  vec3 U = uP[o + 1].xyz;
  float curve = uP[o + 1].w;
  vec3 V = uP[o + 2].xyz;
  float TH4 = uP[o + 2].w;
  vec3 Wn = uP[o + 3].xyz;
  float LN4 = uP[o + 3].w;
  vec4 TH = uP[o + 4];
  vec4 LN = uP[o + 5];
  vec3 q = p - root;
  float x = dot(q, U);
  float y = dot(q, V);
  float rho = length(vec2(x, y));
  float zc = dot(q, Wn) + curve * rho * rho * 0.3;
  float th = atan(y, x);
  float t0 = TH.x, t1 = TH.y, l0 = LN.x, l1 = LN.y;
  if (th > TH.y) { t0 = TH.y; t1 = TH.z; l0 = LN.y; l1 = LN.z; }
  if (th > TH.z) { t0 = TH.z; t1 = TH.w; l0 = LN.z; l1 = LN.w; }
  if (th > TH.w) { t0 = TH.w; t1 = TH4; l0 = LN.w; l1 = LN4; }
  float f = clamp((th - t0) / (t1 - t0), 0.0, 1.0);
  float edge = mix(l0, l1, f) * (1.0 - 0.18 * sin(3.14159 * f)) - 0.02;
  edge -= 0.06 * smoothstep(0.55, 0.8, noise(vec3(th * 12.0, rho * 3.0, float(w) * 5.0)));
  float d2 = max(max(rho - edge, (TH.x - th) * rho), (th - TH4) * rho);
  float sheet = abs(zc) - 0.005;
  return max(d2 * 0.8, sheet);
}
// 머리: 뇌처럼 주름진 균사 타원체 + 고리 모양으로 돋은 짧은 더듬이
vec2 migoHead(vec3 p) {
  vec3 q = p - uP[13].xyz;
  if (length(q) > 0.6) return vec2(length(q) - 0.5, 2.0);
  q.yz = rot(0.35) * q.yz;
  float d = sdEllipsoid(q, vec3(0.2, 0.26, 0.21));
  // 주름 (골)
  float fold = ridge(q * 14.0 + 3.0);
  d += 0.018 * (1.0 - smoothstep(0.0, 0.35, fold));
  // 더듬이 고리 셋: 위로 갈수록 작다
  float ant = 1e5;
  for (int r = 0; r < 4; r++) {
    float fr = float(r);
    float y0 = -0.1 + fr * 0.1;
    float rr = sqrt(max(1.0 - pow(y0 / 0.26, 2.0), 0.05)) * 0.2;
    float n = 14.0 - fr * 2.0;
    vec3 pq = polarRep(q - vec3(0.0, y0, 0.0), n);
    vec3 b = vec3(rr * 0.95, 0.0, 0.0);
    vec3 t = b + vec3(0.07 - fr * 0.008, 0.045 + fr * 0.01, 0.0);
    ant = min(ant, sdRoundCone(pq, b, t, 0.01, 0.003));
  }
  return d < ant ? vec2(d, 2.0) : vec2(ant, 5.0);
}
// 뇌 원통: 금속 테 + 유리창
vec2 canister(vec3 p) {
  vec3 c = uP[14].xyz;
  vec3 ax = uP[15].xyz;
  vec3 q = p - c;
  vec3 s1 = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));
  vec3 s2 = cross(ax, s1);
  vec3 l = vec3(dot(q, s1), dot(q, ax), dot(q, s2));
  float body = sdCylinder(l, 0.17, 0.11) - 0.008;
  // 위아래 금속 마개와 테
  float caps = min(sdCylinder(l - vec3(0.0, 0.16, 0.0), 0.03, 0.125), sdCylinder(l + vec3(0.0, 0.16, 0.0), 0.03, 0.125));
  caps = min(caps, sdTorus(l, vec2(0.115, 0.012)));
  // 유리창: 앞면을 판다
  float win = max(abs(l.y) - 0.1, -l.z + 0.06);
  float metal = max(min(body, caps), -max(win, abs(l.x) - 0.07));
  metal = min(metal, caps);
  float glass = sdCylinder(l, 0.12, 0.1);
  // 단자
  metal = min(metal, sdCylinder(l - vec3(0.0, 0.21, 0.0), 0.03, 0.025));
  return metal < glass ? vec2(metal, 4.0) : vec2(glass, 6.0);
}

vec2 sdf(vec3 p) {
  int nb = int(uP[0].x + 0.5);
  float body = chainsK(p, 0, nb, 0.12).x;
  // 마디 홈
  if (body < 0.05) body += 0.012 * smoothstep(0.6, 1.0, sin(p.y * 32.0 + p.z * 10.0)) - 0.012 * smoothstep(0.55, 0.85, fbm3(p * 11.0));
  vec2 r = vec2(body, 1.0);
  float legs = chainsK(p, nb, uBN, 0.03).x;
  // 갑각 다리: 균사 혹과 가는 가시
  if (legs < 0.03) legs -= 0.008 * smoothstep(0.6, 0.9, fbm3(p * 16.0)) + 0.004 * smoothstep(0.75, 0.95, noise(p * 90.0));
  r = umin(r, vec2(legs, 1.0));
  r = umin(r, migoHead(p));
  r = umin(r, vec2(min(wingMem(p, 0), wingMem(p, 1)), 3.0));
  r = umin(r, canister(p));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float v = fbm3(p * 9.0);
  if (id < 1.5) {
    // 갑각: 탁한 장밋빛 갈색, 균사가 번진 얼룩
    float myc = smoothstep(0.45, 0.75, fbm3(p * 4.0 + 7.0));
    vec3 alb = mix(vec3(0.065, 0.04, 0.042), vec3(0.11, 0.1, 0.09), myc) * (0.6 + 0.6 * v);
    return Mat(alb, 0.4, 0.8, vec3(0.0), 0.1, 0.3, 0.35);
  }
  if (id < 2.5) {
    // 주름진 머리: 골 깊은 곳에서 분홍빛이 스민다
    vec3 q = p - uP[13].xyz;
    float fold = ridge(q * 14.0 + 3.0);
    vec3 alb = vec3(0.09, 0.065, 0.065) * (0.6 + 0.6 * v);
    return Mat(alb, 0.55, 0.5, vec3(1.0, 0.4, 0.7) * smoothstep(0.08, 0.0, fold) * smoothstep(0.55, 0.8, noise(q * 9.0)) * 0.12, 0.0, 0.5, 0.35);
  }
  if (id < 3.5) {
    // 막 날개: 얇고 탁한 회보라, 균사 핏줄
    float vein = smoothstep(0.05, 0.0, ridge(p * 6.0 + 2.0));
    return Mat(vec3(0.035, 0.028, 0.032) * (1.0 - vein * 0.5), 0.55, 0.25, vec3(0.0), 0.1, 0.5, 0.05);
  }
  if (id < 4.5) return Mat(vec3(0.08, 0.08, 0.09) * (0.8 + 0.4 * noise(p * 80.0)), 0.25, 1.4, vec3(0.0), 0.0, 0.0, 0.4);
  if (id < 5.5) return Mat(vec3(0.1, 0.09, 0.085), 0.5, 0.5, vec3(1.0, 0.45, 0.7) * 0.03, 0.0, 0.4, 0.2);
  // 유리 속의 뇌: 분홍빛 액체 속에 떠 있다
  vec3 q = p - uP[14].xyz;
  float brain = smoothstep(0.08, 0.05, length(q * vec3(1.0, 1.25, 1.0))) * (0.6 + 0.4 * smoothstep(0.1, 0.0, ridge(q * 60.0)));
  return Mat(vec3(0.02, 0.01, 0.015), 0.02, 2.0, vec3(1.0, 0.35, 0.72) * (0.35 + 1.2 * brain), 0.0, 0.0, 1.0);
}
`,
  };
}
