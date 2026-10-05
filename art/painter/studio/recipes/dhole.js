// 프나스의 돌 (3층 추적자) — 얼음 밑으로 굴을 뚫고 올라온 거대한 벌레. 아무도 그 전체 모습을 본 적이 없다.
// 깨진 얼음판을 밀어 올리며 솟은 몸의 앞쪽 일부만 보인다: 마디마디 주름진 거대한 원통이 활처럼 휘어 이쪽으로 내려오고,
// 끝은 눈도 얼굴도 없는 둥근 아가리 — 안쪽으로 겹겹이 늘어선 이빨 고리가 목구멍 어둠 속으로 이어진다.
// 몸은 점액으로 번들거리고, 아가리 가장자리에서 산성 녹빛 점액이 늘어져 떨어진다. 둘레엔 뒤집힌 얼음 덩어리들.
const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map((x) => x * k);
const len = (a) => Math.hypot(...a);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
function bez(P, t) {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
}

export default function dhole() {
  const P = [
    [-1.0, -1.5, -1.2],
    [-0.85, 2.6, -1.2],
    [0.1, 4.8, 0.2],
    [0.6, 3.3, 2.1],
  ];
  const N = 16;
  const B = [];
  const cum = [];
  let L = 0;
  let prev = null;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const p = bez(P, t);
    if (prev) L += len(sub(p, prev));
    prev = p;
    const r = 1.0 + 0.1 * Math.sin(t * 7) + 0.12 * Math.pow(t, 6);
    B.push([...p, r]);
    cum.push([L, 0, 0, 0]);
  }
  const mouth = B[N - 1].slice(0, 3);
  const md = nrm(sub(B[N - 1], B[N - 2])); // 아가리가 향하는 쪽
  // 점액 줄기: 아가리 가장자리에서 늘어진다
  const side = nrm([md[2], 0, -md[0]]);
  const upm = nrm([side[1] * md[2] - side[2] * md[1], side[2] * md[0] - side[0] * md[2], side[0] * md[1] - side[1] * md[0]]);
  B.push([0, 0, 0, 0]);
  const drips = [];
  const rims = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    rims.push(add(add(mouth, side, Math.cos(a) * 1.05), upm, Math.sin(a) * 1.05));
  }
  rims.sort((x, y) => x[1] - y[1]);
  // 아가리 아래쪽 가장자리에서만 늘어진다
  for (const [k, l] of [[0, 1.1], [2, 0.7], [4, 1.4], [7, 0.5]]) {
    const rim = rims[k];
    const top = add(rim, md, 0.05);
    B.push([...top, 0.045], [...add(top, [0.01, -l * 0.5, 0]), 0.014], [...add(top, [0.02, -l, 0.0]), 0.026], [0, 0, 0, 0]);
    drips.push(add(top, [0.02, -l - 0.03, 0]));
  }
  // 얼음 밑에서 한 번 더 솟았다 들어가는 몸의 등 (전체는 보이지 않는다)
  const HUMP0 = B.length;
  const H = [[-3.6, -0.9, -2.6], [-3.3, 1.5, -2.3], [-1.6, 1.7, -2.9], [-1.3, -0.9, -3.0]];
  for (let i = 0; i < 9; i++) {
    const p = bez(H, i / 8);
    B.push([...p, 0.85 + 0.05 * Math.sin(i)]);
  }
  B.push([0, 0, 0, 0]);
  const uL = drips.map((d) => [...d, 0.025]);
  const uLC = drips.map(() => [0.55, 0.9, 0.3, 0.35]);
  // 얼음 덩어리: [중심, 크기], [회전]
  const ice = [
    [[0.15, 0.35, 0.3], [1.1, 0.14, 0.75], [0.35, 0.1, 0.55]],
    [[-2.3, 0.45, -0.7], [1.0, 0.15, 0.7], [-0.5, 0.8, -0.6]],
    [[0.9, 0.55, -1.5], [0.9, 0.14, 0.6], [0.6, -0.6, 0.45]],
    [[-1.9, 0.2, 0.9], [0.7, 0.11, 0.5], [0.25, 1.2, 0.3]],
    [[-0.6, 0.8, -2.4], [0.8, 0.14, 0.55], [-0.8, 0.3, 0.7]],
    [[1.5, 0.15, 0.8], [0.45, 0.08, 0.35], [0.2, 0.4, -0.3]],
    [[-2.9, 0.12, 0.5], [0.4, 0.07, 0.3], [0.0, 0.7, 0.35]],
  ];
  const uA = [...cum];
  const iceA = [];
  for (const [c, s, r] of ice) iceA.push([...c, 0], [...s, 0], [...r, 0]);
  return {
    preset: 'act3',
    cam: { pos: [1.8, 0.4, 14.5], target: [-0.3, 2.4, 0.0], fov: 1.8 },
    light: {
      key: [-0.4, 0.6, -0.75],
      keyCol: [0.9, 1.1, 1.45],
      fill: [0.6, 0.15, 0.8],
      fillCol: [0.12, 0.16, 0.1],
      amb: [0.02, 0.025, 0.03],
      rimCol: [0.7, 0.95, 1.2],
      rim: 1.8,
      exposure: 1.35,
      glow: 0.1,
      pt: add(mouth, md, -0.3),
      ptCol: [0.5, 0.9, 0.25],
    },
    frame: { fill: 0.94, bottom: 0.025 },
    arrays: { uB: B, uA, uG: iceA, uL, uLC, uP: [[N, ice.length, HUMP0, 0], [...mouth, 0], [...md, 0], [...side, 0], [...upm, 0]] },
    glsl: /* glsl */ `
// 몸: 사슬을 따라가며 누적 길이로 마디 주름을 새긴다. 반환 (거리, 길이 위치)
vec2 wormBody(vec3 p) {
  int n = int(uP[0].x + 0.5);
  float d = 1e5;
  float sAt = 0.0;
  for (int i = 0; i < 40; i++) {
    if (i + 1 >= n) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    vec3 ba = b.xyz - a.xyz;
    float h = clamp(dot(p - a.xyz, ba) / dot(ba, ba), 0.0, 1.0);
    float r = mix(a.w, b.w, h);
    float di = length(p - a.xyz - ba * h) - r;
    if (di < d) { sAt = mix(uA[i].x, uA[i + 1].x, h); }
    d = smin(d, di, 0.15);
  }
  return vec2(d, sAt);
}
vec2 sdf(vec3 p) {
  vec2 wb = wormBody(p);
  float d = wb.x;
  float s = wb.y;
  // 마디 주름: 굵은 고리와 가는 고리
  // 고르지 않은 마디: 간격과 깊이가 제각각, 군데군데 부풀고 접힌다
  float ring = sin(s * 6.5 + 1.6 * sin(s * 1.1) + 0.8 * noise(p * 0.8));
  float amp = 0.05 + 0.05 * noise(vec3(s * 0.7, 2.0, 1.0));
  d += amp * smoothstep(0.5, 1.0, ring) + 0.01 * sin(s * 31.0 + 3.0 * noise(p * 2.0));
  if (d < 0.25) {
    d -= 0.08 * (fbm3(p * 1.1) - 0.5);
    d += 0.015 * (1.0 - smoothstep(0.0, 0.3, ridge(p * 5.0))) + 0.008 * (fbm3(p * 9.0) - 0.5);
  }
  // 아가리: 끝을 둥글게 파고, 입술 고리
  vec3 mc = uP[1].xyz;
  vec3 md = uP[2].xyz;
  vec3 q = p - mc;
  vec3 l = vec3(dot(q, uP[3].xyz), dot(q, uP[4].xyz), dot(q, md));
  // 입술: 다섯 갈래로 울퉁불퉁하게 부푼 살 고리
  float la = atan(l.y, l.x);
  float lobe = 0.5 + 0.5 * cos(la * 5.0 + 0.6);
  vec2 lt = vec2(length(l.xy) - (1.0 + 0.08 * lobe), l.z + 0.02 - 0.12 * lobe);
  float lip = length(lt) - (0.14 + 0.06 * lobe);
  d = smin(d, lip, 0.15);
  float hole = sdEllipsoid(l - vec3(0.0, 0.0, 0.3), vec3(0.86, 0.86, 1.3));
  d = smax(d, -hole, 0.08);
  vec2 r = vec2(d, 1.0);
  // 아가리 안쪽 벽은 빛을 먹는 어둠 (입술 바깥만 살)
  if (l.z < 0.42 && length(l.xy) < 0.96) r.y = 99.0;
  // 목구멍 어둠
  r = umin(r, vec2(sdEllipsoid(l - vec3(0.0, 0.0, -1.0), vec3(0.7, 0.7, 0.45)), 99.0));
  // 이빨 고리 넷: 안쪽·뒤쪽을 향한 갈고리
  float teeth = 1e5;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float rr = 0.86 - fk * 0.11;
    float z = 0.02 - fk * 0.2;
    float nT = 20.0 - fk * 2.0;
    vec3 tq = vec3(l.x, l.z - z, l.y);
    float ang = atan(tq.z, tq.x) + fk * 0.17;
    tq = vec3(length(tq.xz) * cos(ang), tq.y, length(tq.xz) * sin(ang));
    tq = polarRep(tq, nT);
    vec3 base = vec3(rr, 0.0, 0.0);
    vec3 tip = vec3(rr - 0.3 + fk * 0.04, -0.16, 0.0);
    teeth = min(teeth, sdRoundCone(tq, base, tip, 0.05 - fk * 0.006, 0.003));
  }
  r = umin(r, vec2(teeth, 2.0));
  // 점액 줄기
  float sl = 1e5;
  int hump0 = int(uP[0].z + 0.5);
  for (int i = 0; i < 160; i++) {
    if (i < int(uP[0].x + 0.5) + 1) continue;
    if (i + 1 >= hump0) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    sl = smin(sl, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), 0.04);
  }
  r = umin(r, vec2(sl, 4.0));
  r.x = smin(r.x, sl, 0.05);
  // 뒤쪽에 솟은 몸의 등: 같은 살, 같은 마디
  float hu = 1e5;
  float hs = 0.0;
  for (int i = 0; i < 160; i++) {
    if (i < hump0) continue;
    if (i + 1 >= uBN) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    vec3 ba = b.xyz - a.xyz;
    float h = clamp(dot(p - a.xyz, ba) / dot(ba, ba), 0.0, 1.0);
    float di = length(p - a.xyz - ba * h) - mix(a.w, b.w, h);
    if (di < hu) hs = float(i) + h;
    hu = smin(hu, di, 0.2);
  }
  if (hu < 0.3) {
    hu += 0.05 * smoothstep(0.5, 1.0, sin(hs * 4.5 + 1.3 * sin(hs))) - 0.08 * (fbm3(p * 1.1) - 0.5) + 0.008 * (fbm3(p * 9.0) - 0.5);
  }
  r = umin(r, vec2(hu, 1.0));
  // 땅 아래는 잘라낸다
  r.x = max(r.x, -p.y - 0.02);
  // 얼음 덩어리
  float ic = 1e5;
  int ni = int(uP[0].y + 0.5);
  for (int i = 0; i < 16; i++) {
    if (i >= ni) break;
    vec3 c = uG[i * 3].xyz;
    vec3 sz = uG[i * 3 + 1].xyz;
    vec3 ro = uG[i * 3 + 2].xyz;
    vec3 iq = p - c;
    iq.xz = rot(ro.y) * iq.xz;
    iq.xy = rot(ro.z) * iq.xy;
    iq.yz = rot(ro.x) * iq.yz;
    float bx = sdBox(iq, sz);
    // 모서리를 비스듬히 깎아 깨진 판처럼
    bx = max(bx, dot(iq, normalize(vec3(0.7, 0.4, 0.6))) - sz.x * 0.7);
    bx = max(bx, dot(iq, normalize(vec3(-0.6, 0.5, -0.5))) - sz.x * 0.75);
    ic = min(ic, bx);
  }
  ic = max(ic, -p.y);
  r = umin(r, vec2(ic, 3.0));
  return r;
}
Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 아가리 안쪽 살: 어둡고 붉은 젖은 살
    vec3 mq = p - uP[1].xyz;
    vec3 ml = vec3(dot(mq, uP[3].xyz), dot(mq, uP[4].xyz), dot(mq, uP[2].xyz));
    float inside = smoothstep(0.55, 0.05, ml.z) * smoothstep(1.25, 0.95, length(ml.xy));
    if (inside > 0.01) {
      vec3 fl = vec3(0.06, 0.02, 0.02) * (0.6 + 0.6 * fbm3(p * 8.0));
      Mat mi = Mat(fl * (1.0 - inside * 0.7), 0.3, 0.5 * (1.0 - inside * 0.6), vec3(0.0), 0.0, 0.4, 0.25);
      if (inside > 0.5) return mi;
    }
    // 점액에 젖은 회갈색 살, 주름 골은 어둡다
    vec2 wb = wormBody(p);
    float ring = smoothstep(0.4, 1.0, sin(wb.y * 9.0));
    float v = fbm3(p * 3.0);
    float pale = smoothstep(0.45, 0.75, fbm3(p * 1.5 + 9.0));
    vec3 alb = mix(vec3(0.055, 0.05, 0.04), vec3(0.11, 0.1, 0.085), pale) * (0.6 + 0.7 * v) * (1.0 - ring * 0.6);
    float slime = smoothstep(0.55, 0.8, fbm3(p * 2.0 + 4.0));
    return Mat(alb, 0.32 - slime * 0.2, 0.7 + slime * 0.8, vec3(0.3, 0.6, 0.1) * slime * 0.012, 0.1, 0.35, 0.4 + 0.5 * slime);
  }
  if (id < 2.5) return Mat(vec3(0.12, 0.11, 0.08), 0.3, 0.9, vec3(0.0), 0.0, 0.3, 0.6);
  if (id < 3.5) {
    // 얼음: 푸른 흰빛, 속의 금과 기포
    float crack = smoothstep(0.03, 0.0, ridge(p * 4.0 + 2.0)) * smoothstep(0.4, 0.6, noise(p * 2.0));
    float snow = smoothstep(0.6, 0.95, n.y) * smoothstep(0.45, 0.7, fbm3(p * 5.0));
    vec3 alb = mix(vec3(0.05, 0.08, 0.11), vec3(0.2, 0.26, 0.32), crack) ;
    alb = mix(alb, vec3(0.3, 0.33, 0.38), snow);
    return Mat(alb * 0.45, 0.08 + snow * 0.7, 1.3, vec3(0.06, 0.12, 0.18) * crack * 0.25, 0.0, 0.4, 0.35 - snow * 0.3);
  }
  // 산성 점액
  return Mat(vec3(0.03, 0.045, 0.015), 0.08, 1.4, vec3(0.45, 0.9, 0.2) * 0.06, 0.0, 0.7, 1.0);
}
`,
  };
}
