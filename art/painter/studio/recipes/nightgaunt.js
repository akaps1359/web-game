// 밤의 마귀 (3층 일반) — 얼굴이 없는 검은 날개. 얼어붙은 탑 꼭대기에서 소리 없이 내려온다.
// 고래 가죽처럼 매끈하고 고무 같은 검은 몸, 얼굴 자리엔 아무것도 없는 매끈한 달걀형 머리, 안쪽으로 휘어 마주 보는 뿔 한 쌍.
// 등 뒤로 치켜든 거대한 박쥐 날개(뒤에서 비친 빛에 막이 희미하게 보랏빛으로 비친다), 앞으로 내민 긴 팔과 간지럼 태우는 긴 손가락,
// 늘어진 다리, 끝이 화살촉 같은 가시 꼬리. 소리도 없고 눈도 없다.
// 몸·팔다리·뼈는 사슬(uB), 날개막은 날개 평면의 극좌표로 그린다(뼈 사이가 안쪽으로 패인 가장자리).
const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map((x) => x * k);
const len = (a) => Math.hypot(...a);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// 회전: 몸 전체를 앞으로 숙이고(급강하) 비튼다
const rx = (a) => (p) => [p[0], Math.cos(a) * p[1] - Math.sin(a) * p[2], Math.sin(a) * p[1] + Math.cos(a) * p[2]];
const ry = (a) => (p) => [Math.cos(a) * p[0] + Math.sin(a) * p[2], p[1], -Math.sin(a) * p[0] + Math.cos(a) * p[2]];
const rz = (a) => (p) => [Math.cos(a) * p[0] - Math.sin(a) * p[1], Math.sin(a) * p[0] + Math.cos(a) * p[1], p[2]];

export default function nightgaunt() {
  const PIV = [0, 1.3, 0];
  const LIFT = [0, 0.55, 0];
  const RD = (d) => ry(0.35)(rx(0.28)(rz(-0.1)(d)));
  const G = (p) => add(add(RD(sub(p, PIV)), PIV), LIFT);
  const B = [];
  const line = (pts) => {
    for (const p of pts) B.push(p[3] > 0 ? [...G(p), p[3]] : p);
    B.push([0, 0, 0, 0]);
  };
  const HEAD = [0.0, 2.42, 0.2];
  // ── 몸통: 골반 → 배 → 가슴 → 목 (앞으로 숙였다)
  line([
    [0.0, 1.3, -0.05, 0.11],
    [0.0, 1.55, 0.0, 0.085],
    [0.0, 1.85, 0.05, 0.15],
    [0.0, 2.05, 0.08, 0.13],
    [0.0, 2.22, 0.14, 0.065],
  ]);
  // 어깨
  line([[-0.24, 2.05, 0.04, 0.085], [0.0, 2.08, 0.06, 0.1], [0.24, 2.05, 0.04, 0.085]]);
  // ── 팔: 앞으로 길게 내밀어 아래를 더듬는다 (손가락 넷, 마디가 길다)
  const hands = [];
  for (const s of [-1, 1]) {
    const sh = [s * 0.26, 2.04, 0.05];
    const el = [s * 0.46, 1.95, 0.45];
    const wr = [s * 0.32, 1.95, 1.0 + (s > 0 ? 0.15 : 0)];
    line([[...sh, 0.07], [...lerp(sh, el, 0.5), 0.05], [...el, 0.04], [...lerp(el, wr, 0.5), 0.034], [...wr, 0.03]]);
    for (let f = 0; f < 3; f++) {
      const sp = (f - 1) * 0.055;
      const k1 = add(wr, [s * sp * 1.4 + s * 0.02, -0.03, 0.17 + 0.04 * (1 - Math.abs(f - 1))]);
      const k2 = add(k1, [s * sp * 1.1, -0.1, 0.2]);
      const k3 = add(k2, [s * sp * 0.6, -0.2, 0.06]);
      line([[...wr, 0.022], [...k1, 0.014], [...k2, 0.011], [...k3, 0.003]]);
    }
    hands.push(wr);
  }
  // ── 다리: 아래로 늘어져 흔들린다, 발가락은 갈고리
  for (const s of [-1, 1]) {
    const hp = [s * 0.12, 1.28, -0.04];
    const kn = [s * 0.18, 0.88, 0.12 - (s > 0 ? 0.1 : 0)];
    const an = [s * 0.16, 0.5, -0.32];
    const ft = [s * 0.17, 0.32, -0.22];
    line([[...hp, 0.09], [...lerp(hp, kn, 0.45), 0.075], [...kn, 0.05], [...lerp(kn, an, 0.5), 0.045], [...an, 0.032], [...ft, 0.022]]);
    for (const f of [-1, 1]) {
      const t1 = add(ft, [s * 0.02 + f * 0.035, -0.06, 0.08]);
      line([[...ft, 0.018], [...t1, 0.01], [...add(t1, [0, -0.07, -0.02]), 0.002]]);
    }
  }
  // ── 꼬리: 엉덩이 뒤에서 아래로 늘어졌다가 휘어 올라간다, 끝은 화살촉
  const tail = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    tail.push([0.25 * Math.sin(t * 3.0) + t * 0.1, 1.25 - 0.95 * Math.sin(t * 2.2) + t * 0.35, -0.1 - t * 0.55, 0.06 * (1 - t) + 0.012]);
  }
  line(tail);
  const tt = tail[tail.length - 1];
  const tp = tail[tail.length - 2];
  const td = nrm(sub(tt, tp));
  const barbTip = add(tt, td, 0.22);
  const side = nrm(cross(td, [0, 0, 1]));
  line([[...add(tt, side, 0.09), 0.012], [...barbTip, 0.002]]);
  line([[...add(tt, side, -0.09), 0.012], [...barbTip, 0.002]]);
  line([[...add(tt, side, 0.09), 0.012], [...tt, 0.02], [...add(tt, side, -0.09), 0.012]]);
  // ── 뿔: 정수리 옆에서 뒤로 솟았다가 안쪽으로 휘어 서로 마주 본다
  for (const s of [-1, 1]) {
    const h0 = add(HEAD, [s * 0.08, 0.12, -0.08]);
    line([
      [...h0, 0.04],
      [...add(h0, [s * 0.12, 0.14, -0.1]), 0.032],
      [...add(h0, [s * 0.16, 0.32, -0.12]), 0.024],
      [...add(h0, [s * 0.1, 0.46, -0.06]), 0.016],
      [...add(h0, [-s * 0.01, 0.52, 0.02]), 0.006],
    ]);
  }
  const NBODY = B.length;

  // ── 날개: 등에서 나와 위로 크게 치켜들었다
  const wings = [];
  const P = [];
  for (const s of [-1, 1]) {
    const root = G([s * 0.16, 1.98, -0.14]);
    const U = nrm(RD(s < 0 ? [s * 0.6, 0.8, -0.1] : [s * 0.85, 0.45, -0.3])); // 날개 앞전 방향 (왼쪽은 더 높이)
    const D = nrm(RD([s * 0.55, -0.6, -0.35])); // 날개 아래쪽
    const V = nrm(sub(D, mul(U, dot(D, U))));
    const Wn = cross(U, V);
    const TH = [0.0, 0.45, 0.95, 1.45, 1.85];
    const LN = [2.5, 2.35, 2.0, 1.45, 0.75];
    const CURVE = 0.12;
    const at0 = (th, rho) => add(add(root, add(mul(U, Math.cos(th) * rho), mul(V, Math.sin(th) * rho))), mul(Wn, -CURVE * rho * rho * 0.3));
    // 날개뼈는 이미 월드 좌표: line()의 변환을 피하려고 G의 역을 쓰지 않고 직접 넣는다
    const at = at0;
    // 팔뼈(앞전)와 손가락뼈
    for (let i = 0; i < TH.length - 1; i++) {
      const pts = [0, 0.33, 0.66, 1].map((t, j) => [...at(TH[i] + Math.sin(t * 2.5) * 0.04, LN[i] * t), [0.075, 0.05, 0.03, 0.012][j] * (i === 0 ? 1.25 : 0.85)]);
      for (const q of pts) B.push(q);
      B.push([0, 0, 0, 0]);
    }
    // 엄지 갈고리
    const tb = at(TH[0], LN[0] * 0.33);
    B.push([...tb, 0.03], [...add(tb, [s * 0.04, 0.12, 0.1]), 0.004], [0, 0, 0, 0]);
    P.push([...root, s], [...U, CURVE], [...V, TH[4]], [...Wn, LN[4]], TH.slice(0, 4), LN.slice(0, 4));
  }
  const hc = G(HEAD);
  const hx = RD([1, 0, 0]);
  const hy = RD([0, Math.cos(0.5), Math.sin(0.5)]);
  const hz = RD([0, -Math.sin(0.5), Math.cos(0.5)]);
  const uP = [[NBODY, 0, 0, 0], ...P, [...hc, 0], [...hx, 0], [...hy, 0], [...hz, 0]].slice(0, 16);
  if (P.length !== 12) throw new Error('wing params');

  return {
    preset: 'act3',
    cam: { pos: [0.9, 0.9, 9.8], target: [0.0, 2.2, 0.0], fov: 1.8 },
    light: {
      key: [-0.3, 0.55, -0.85],
      keyCol: [0.9, 1.05, 1.5],
      fill: [0.5, 0.15, 0.85],
      fillCol: [0.08, 0.06, 0.15],
      amb: [0.015, 0.014, 0.03],
      rimCol: [0.7, 0.75, 1.3],
      rim: 2.6,
      exposure: 1.5,
      glow: 0.08,
    },
    frame: { fill: 0.94, bottom: 0.03 },
    arrays: { uB: B, uP },
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

// 날개막: 뿌리 기준 평면 극좌표 (θ, ρ). 뼈 사이 가장자리는 안쪽으로 패였다
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
  // 뼈 사이 칸 찾기
  float t0 = TH.x, t1 = TH.y, l0 = LN.x, l1 = LN.y;
  if (th > TH.y) { t0 = TH.y; t1 = TH.z; l0 = LN.y; l1 = LN.z; }
  if (th > TH.z) { t0 = TH.z; t1 = TH.w; l0 = LN.z; l1 = LN.w; }
  if (th > TH.w) { t0 = TH.w; t1 = TH4; l0 = LN.w; l1 = LN4; }
  float f = clamp((th - t0) / (t1 - t0), 0.0, 1.0);
  float edge = mix(l0, l1, f) * (1.0 - 0.28 * sin(3.14159 * f)) - 0.02;
  // 찢긴 구멍 몇 개
  float d2 = max(max(rho - edge, (TH.x - th) * rho), (th - TH4) * rho);
  float sheet = abs(zc) - 0.008 - 0.006 * (1.0 - rho / 2.5);
  return max(d2 * 0.8, sheet);
}

vec2 sdf(vec3 p) {
  int nb = int(uP[0].x + 0.5);
  float body = chainsK(p, 0, nb, 0.06).x;
  // 머리: 얼굴 없는 매끈한 달걀형, 앞으로 숙였다
  vec3 hq0 = p - uP[13].xyz;
  vec3 hq = vec3(dot(hq0, uP[14].xyz), dot(hq0, uP[15].xyz), 0.0);
  hq.z = dot(hq0, normalize(cross(uP[14].xyz, uP[15].xyz)));
  float head = sdEllipsoid(hq, vec3(0.11, 0.17, 0.12));
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.1, 0.03), vec3(0.075, 0.1, 0.08)), 0.05);
  // 눈썹뼈 같은 둔덕만 희미하게
  head = smin(head, sdEllipsoid(hq - vec3(0.0, 0.03, 0.08), vec3(0.1, 0.035, 0.05)), 0.04);
  body = smin(body, head, 0.06);
  // 갈비와 근육의 결
  vec2 r = vec2(body, 1.0);
  float bones = chainsK(p, nb, uBN, 0.025).x;
  r = umin(r, vec2(bones, 2.0));
  float mem = min(wingMem(p, 0), wingMem(p, 1));
  r = umin(r, vec2(mem, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  // 고래 가죽 같은 검은 고무 살갗: 젖은 광택, 희미한 보랏빛 기름막
  float v = fbm3(p * 8.0);
  if (id < 1.5) return Mat(vec3(0.016, 0.015, 0.02) * (0.7 + 0.6 * v), 0.38, 0.8, vec3(0.0), 0.2, 0.15, 0.45);
  if (id < 2.5) return Mat(vec3(0.016, 0.014, 0.02) * (0.7 + 0.6 * v), 0.3, 1.0, vec3(0.0), 0.15, 0.2, 0.5);
  // 날개막: 얇아서 뒤에서 비친 빛이 핏줄째 비친다
  float vein = smoothstep(0.06, 0.0, ridge(p * 3.0 + 1.3)) * 0.6 + smoothstep(0.05, 0.0, ridge(p * 7.0 + 4.0)) * 0.3;
  vec3 alb = vec3(0.03, 0.02, 0.035) * (1.0 - vein * 0.6);
  return Mat(alb * 0.6, 0.45, 0.6, vec3(0.0), 0.1, 0.8, 0.25);
}
`,
  };
}
