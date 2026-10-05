// 샨탁 (3층 정예) — 코끼리보다 큰, 말 머리를 한 비늘 덮인 새. 산맥 너머 고원으로 가는 길을 지킨다.
// 얼음 위에 갈고리 발톱을 박고 몸을 일으켜, 비늘 덮인 거대한 날개를 위로 치켜들었다. 긴 목을 S자로 굽혀
// 말의 두개골 같은 길쭉한 머리를 내밀고 아래턱을 벌려 비늘 긁는 울음을 낸다. 작은 눈은 희미한 녹색.
// 몸통·목·다리·꼬리·날개뼈는 사슬(uB), 머리는 머리 좌표계에서 직접, 날개막은 날개 평면의 극좌표.
const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map((x) => x * k);
const len = (a) => Math.hypot(...a);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

export default function shantak() {
  // 지역 좌표(x 앞, y 위, z 옆) → 월드: 비스듬히 이쪽을 향한다
  const yaw = 0.5;
  const W = (p) => [Math.cos(yaw) * p[0] - Math.sin(yaw) * p[2], p[1], Math.sin(yaw) * p[0] + Math.cos(yaw) * p[2]];
  const B = [];
  const line = (pts) => {
    for (const p of pts) B.push([...W(p), p[3]]);
    B.push([0, 0, 0, 0]);
  };
  // ── 꼬리 → 엉덩이 → 배 → 가슴 (몸을 일으켜 가슴이 높다)
  line([
    [-3.0, 0.35, 0.3, 0.04],
    [-2.6, 0.5, 0.2, 0.09],
    [-2.1, 0.8, 0.05, 0.16],
    [-1.55, 1.25, 0.0, 0.32],
    [-0.9, 1.75, 0.0, 0.5],
    [-0.35, 2.25, 0.0, 0.52],
    [0.05, 2.7, 0.0, 0.42],
  ]);
  // ── 목: 가슴에서 위로 솟았다가 앞으로 꺾여 내려온다 (S자)
  const neck = [
    [0.05, 2.75, 0.0, 0.32],
    [0.25, 3.35, 0.0, 0.2],
    [0.2, 3.95, 0.0, 0.16],
    [0.55, 4.3, 0.0, 0.15],
    [1.05, 4.25, 0.0, 0.15],
  ];
  line(neck);
  // 목덜미의 갈기 같은 비늘 가시
  const maneAt = [[0.0, 2.9, 0], [0.12, 3.25, 0], [0.12, 3.6, 0], [0.18, 3.95, 0], [0.38, 4.28, 0], [0.62, 4.45, 0]];
  // 넓적다리 살은 몸통에 녹여 붙인다
  for (const s of [-1, 1]) line([[-1.35, 1.4, s * 0.38, 0.34], [-0.95, 1.05, s * 0.55, 0.2]]);
  const NBODY = B.length;
  // ── 다리: 정강이 → 비늘 덮인 발목 → 갈고리 발가락
  for (const s of [-1, 1]) {
    const hip = [-1.35, 1.35, s * 0.42];
    const kn = [-0.75, 0.95, s * 0.6];
    const an = [-1.2, 0.45, s * 0.58];
    const ft = [-0.95, 0.08, s * 0.6];
    line([[...lerp(hip, kn, 0.55), 0.16], [...kn, 0.11], [...an, 0.07], [...ft, 0.06]]);
    for (const [dx, dz, l] of [[1, 0, 0.42], [0.85, 0.45, 0.36], [0.85, -0.45, 0.36], [-1, 0, 0.25]]) {
      const d = nrm([dx, 0, dz * s]);
      const t1 = add(ft, add(mul(d, l * 0.6), [0, -0.03, 0]));
      const t2 = add(ft, add(mul(d, l), [0, -0.08, 0]));
      t1[1] = Math.max(t1[1], 0.05);
      t2[1] = Math.max(t2[1], 0.0);
      line([[...ft, 0.045], [...t1, 0.032], [...t2, 0.004]]);
    }
  }
  maneAt.forEach((m, i) => {
    const b = add(m, [-0.18, 0.08, 0]);
    B.push([...W(b), 0.07], [...W(add(b, [-0.22 - 0.04 * i, 0.26, 0])), 0.004], [0, 0, 0, 0]);
  });
  // ── 날개: 어깨에서 위로 치켜든 거대한 비늘 날개
  const P = [];
  for (const s of [-1, 1]) {
    const rootL = [-0.25, 2.65, s * 0.32];
    const root = W(rootL);
    const U = nrm(W(nrm([-0.2, 0.75, s * 0.75]))); // 앞전: 위로, 바깥으로
    const D = nrm(W(nrm(s > 0 ? [-0.8, -0.3, s * 0.4] : [-0.75, -0.2, -0.75]))); // 막이 펼쳐지는 쪽: 뒤로 (먼 날개는 바깥으로 더 펼친다)
    const V = nrm(sub(D, mul(U, dot(D, U))));
    const Wn = cross(U, V);
    const TH = [0.0, 0.5, 1.0, 1.5, 1.95];
    const LN = [4.6, 4.3, 3.6, 2.6, 1.5];
    const CURVE = 0.06 * s;
    const at = (th, rho) => add(add(root, add(mul(U, Math.cos(th) * rho), mul(V, Math.sin(th) * rho))), mul(Wn, -CURVE * rho * rho * 0.3));
    for (let i = 0; i < TH.length - 1; i++) {
      const pts = [0, 0.3, 0.65, 1].map((t, j) => [...at(TH[i] + Math.sin(t * 2.5) * 0.03, LN[i] * t), [0.16, 0.1, 0.06, 0.02][j] * (i === 0 ? 1.2 : 0.75)]);
      for (const q of pts) B.push(q);
      B.push([0, 0, 0, 0]);
    }
    // 날개 마디의 갈고리 엄지
    const tb = at(TH[0], LN[0] * 0.3);
    B.push([...tb, 0.07], [...add(tb, W([0.25, 0.12, s * 0.15])), 0.035], [...add(tb, W([0.38, -0.05, s * 0.18])), 0.005], [0, 0, 0, 0]);
    P.push([...root, s], [...U, CURVE], [...V, TH[4]], [...Wn, LN[4]], TH.slice(0, 4), LN.slice(0, 4));
  }
  // ── 머리: 목 끝에서 아래로 숙인 말 머리 (주둥이 방향, 위 방향)
  const headL = [1.2, 4.17, 0.0];
  const hd = nrm(W([0.85, -0.5, 0.0]));
  const hu = nrm(sub(W([0.65, 0.75, 0]), mul(hd, dot(W([0.65, 0.75, 0]), hd))));
  const hs = cross(hd, hu);
  const head = W(headL);
  // 눈 (작고 흐린 녹색)
  const eyeL = (s) => add(add(add(head, hd, 0.12), hu, 0.12), hs, s * 0.17);
  const uL = [
    [...eyeL(-1), 0.03],
    [...eyeL(1), 0.03],
  ];
  const uLC = [
    [0.55, 1.0, 0.65, 1.5],
    [0.55, 1.0, 0.65, 1.5],
  ];
  const uP = [[NBODY, 0, 0, 0], ...P, [...head, 0], [...hd, 0], [...hu, 0]];
  if (uP.length > 16) throw new Error('uP');
  return {
    preset: 'act3',
    cam: { pos: [0.4, 0.6, 17.0], target: [-0.4, 2.8, 0.0], fov: 1.8 },
    light: {
      key: [-0.45, 0.6, -0.7],
      keyCol: [0.9, 1.1, 1.45],
      fill: [0.6, 0.2, 0.8],
      fillCol: [0.1, 0.2, 0.15],
      amb: [0.018, 0.024, 0.03],
      rimCol: [0.7, 1.0, 1.15],
      rim: 1.3,
      exposure: 1.4,
      glow: 0.1,
    },
    frame: { fill: 0.95, bottom: 0.025 },
    arrays: { uB: B, uP, uL, uLC },
    glsl: /* glsl */ `
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
vec2 vor2(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int k = 0; k < 27; k++) {
    vec3 o = vec3(float(k % 3), float((k / 3) % 3), float(k / 9)) - 1.0;
    vec3 h = vec3(hash31(i + o), hash31(i + o + 17.3), hash31(i + o + 41.7));
    vec3 r = o + 0.2 + 0.6 * h - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
// 날개막 (밤의 마귀와 같은 방식)
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
  float edge = mix(l0, l1, f) * (1.0 - 0.22 * sin(3.14159 * f)) - 0.04;
  // 찢어진 가장자리
  edge -= 0.12 * smoothstep(0.55, 0.8, noise(vec3(th * 9.0, rho * 1.5, float(w) * 5.0)));
  float d2 = max(max(rho - edge, (TH.x - th) * rho), (th - TH4) * rho);
  float sheet = abs(zc) - 0.015 - 0.012 * (1.0 - rho / 3.6);
  return max(d2 * 0.8, sheet);
}
// 말 머리: 머리 좌표 (x 주둥이, y 위, z 옆)
vec2 horseHead(vec3 p) {
  vec3 c = uP[13].xyz;
  vec3 hd = uP[14].xyz;
  vec3 hu = uP[15].xyz;
  vec3 hs = cross(hd, hu);
  vec3 q0 = p - c;
  vec3 q = vec3(dot(q0, hd), dot(q0, hu), dot(q0, hs));
  q /= 1.3;
  if (length(q) > 1.6) return vec2((length(q) - 1.4) * 1.3, 1.0);
  // 뒤통수와 볼
  float d = sdEllipsoid(q - vec3(0.0, 0.02, 0.0), vec3(0.32, 0.28, 0.24));
  // 길고 납작한 얼굴: 옆이 좁은 쐐기
  vec3 fq = q;
  fq.z *= 1.35;
  d = smin(d, sdRoundCone(fq, vec3(0.1, 0.05, 0.0), vec3(1.25, -0.12, 0.0), 0.22, 0.11), 0.12);
  // 깊은 볼(턱 근육)
  d = smin(d, sdEllipsoid(q - vec3(0.12, -0.14, 0.0), vec3(0.26, 0.2, 0.19)), 0.1);
  // 콧마루 능선과 콧구멍 둔덕
  d = smin(d, sdCapsule(q, vec3(0.2, 0.2, 0.0), vec3(1.1, 0.02, 0.0), 0.06), 0.06);
  vec3 nq = q - vec3(1.2, -0.05, 0.0);
  nq.z = abs(nq.z) - 0.07;
  d = smax(d, -sdEllipsoid(nq, vec3(0.05, 0.035, 0.035)), 0.02);
  // 눈두덩
  vec3 eq = q - vec3(0.12, 0.12, 0.0);
  eq.z = abs(eq.z) - 0.17;
  d = smin(d, sdEllipsoid(eq, vec3(0.09, 0.05, 0.05)), 0.05);
  // 아래턱: 벌렸다
  float gape = 0.55;
  vec3 jq = q - vec3(0.1, -0.16, 0.0);
  jq.xy = rot(gape) * jq.xy;
  jq.z *= 1.4;
  float jaw = sdRoundCone(jq, vec3(0.0, 0.0, 0.0), vec3(0.95, -0.02, 0.0), 0.15, 0.08);
  // 입 안 (어둠)
  vec3 mq = q - vec3(0.65, -0.22, 0.0);
  float mouth = sdEllipsoid(mq, vec3(0.5, 0.13, 0.11));
  d = smax(d, -mouth, 0.03);
  d = smin(d, jaw, 0.06);
  // 귀 대신 뒤로 젖힌 비늘 뿔
  vec3 hq = q;
  hq.z = abs(hq.z);
  d = smin(d, sdRoundCone(hq, vec3(-0.1, 0.2, 0.12), vec3(-0.55, 0.45, 0.2), 0.07, 0.01), 0.05);
  // 이빨: 위아래로 늘어선 누런 말 이빨
  float teeth = 1e5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float x = 0.35 + fi * 0.1;
    vec3 tq = q - vec3(x, -0.12 - fi * 0.005, 0.0);
    tq.z = abs(tq.z) - 0.075 + fi * 0.004;
    teeth = min(teeth, sdRoundCone(tq, vec3(0.0), vec3(0.01, -0.07, 0.0), 0.022, 0.008));
    vec3 lq = jq - vec3(0.25 + fi * 0.085, 0.07, 0.0);
    lq.z = abs(lq.z) - 0.085;
    teeth = min(teeth, sdRoundCone(lq, vec3(0.0), vec3(0.0, 0.06, 0.0), 0.02, 0.007));
  }
  vec2 r = vec2(d, 1.0);
  r = umin(r, vec2(teeth, 4.0));
  r = umin(r, vec2(sdEllipsoid(mq - vec3(-0.05, 0.0, 0.0), vec3(0.3, 0.06, 0.08)), 99.0));
  r.x *= 1.3;
  return r;
}

vec2 sdf(vec3 p) {
  int nb = int(uP[0].x + 0.5);
  float body = chainsK(p, 0, nb, 0.25).x;
  vec2 hh = horseHead(p);
  vec2 r = vec2(smin(body, hh.x, 0.12), hh.x < body ? hh.y : 1.0);
  if (hh.y > 3.5 && hh.x < body + 0.01) r.y = hh.y;
  // 비늘: 겹친 판 모양 혹
  if (r.x < 0.08 && r.y < 1.5) {
    vec2 v = vor2(p * 9.0);
    r.x -= 0.012 * (1.0 - smoothstep(0.0, 0.5, v.x)) - 0.006 * smoothstep(0.08, 0.0, v.y);
  }
  float bones = chainsK(p, nb, uBN, 0.06).x;
  r = umin(r, vec2(bones, 2.0));
  float mem = min(wingMem(p, 0), wingMem(p, 1));
  r = umin(r, vec2(mem, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec2 v = vor2(p * 9.0);
  float edge = smoothstep(0.1, 0.0, v.y);
  float belly = smoothstep(0.2, -0.6, n.y) * 0.5;
  if (id < 1.5) {
    // 비늘: 검녹색, 가장자리가 밝은 비늘판, 배는 조금 옅다
    vec3 alb = mix(vec3(0.03, 0.04, 0.035), vec3(0.07, 0.075, 0.06), belly) * (0.6 + 0.6 * fbm3(p * 3.0)) * (1.0 - edge * 0.5);
    return Mat(alb, 0.32, 1.0, vec3(0.0), 0.15, 0.1, 0.4);
  }
  if (id < 2.5) return Mat(vec3(0.035, 0.04, 0.035) * (0.7 + 0.5 * fbm3(p * 6.0)), 0.35, 0.9, vec3(0.0), 0.1, 0.1, 0.35);
  if (id < 3.5) {
    // 비늘 덮인 날개막: 작은 비늘 무늬, 뒤에서 비치면 탁한 녹빛
    vec2 v2 = vor2(p * 16.0);
    float sc = smoothstep(0.12, 0.0, v2.y);
    vec3 alb = vec3(0.03, 0.036, 0.03) * (1.0 - sc * 0.5) * (0.7 + 0.5 * fbm3(p * 2.0));
    return Mat(alb * 0.7, 0.55, 0.25, vec3(0.0), 0.05, 0.3, 0.05);
  }
  // 이빨
  return Mat(vec3(0.2, 0.18, 0.12), 0.4, 0.6, vec3(0.0), 0.0, 0.3, 0.4);
}
`,
  };
}
