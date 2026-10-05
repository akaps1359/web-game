// 검은 파라오 (4층 수호자) — 모래 아래 피라미드에서 되살아난 왕. 그 가면 아래엔 얼굴이 없다.
// 키 큰 마른 흑요석 몸에 썩은 아마포 붕대, 황금 데스마스크와 줄무늬 네메스 두건, 넓은 목걸이(우세크),
// 머리 뒤로 솟은 코브라 두건 같은 부채 깃, 바닥까지 끌리는 해진 검은 망토(피라미드 실루엣),
// 한 손엔 키보다 긴 와스 홀, 한 손은 앞으로 내밀어 "무릎 꿇어라" (금 손톱). 발치엔 검은 풍뎅이.
// form 1 (얼굴 없는 파라오, black-pharaoh@2): 가면은 발치에 떨어졌고, 두건 속 얼굴 자리는 빛을 먹는 구멍 — 보랏빛 별이 그 안에서 떠돈다.
//
// 셰이더 컴파일(D3D)이 느리므로 형체 대부분은 자료 배열(uA 타원체, uB 사슬)로 넘기고 셰이더는 고리로 돈다.
// 자료만 바꾸면 다시 컴파일하지 않는다.
import { rng } from '../../lib.js';

export default function blackPharaoh({ seed = 1, form = 0 } = {}) {
  const R = rng(seed * 131 + 17);
  const faceless = form === 1;

  // ── 타원체 (uA: [중심, k], [반지름, 0]) ── 살갗
  const ell = [];
  const E = (c, r, k) => ell.push([...c, k], [...r, 0]);
  E([0, 2.02, 0.03], [0.27, 0.32, 0.165], 0.14); // 가슴
  E([0, 1.6, 0.0], [0.165, 0.3, 0.12], 0.14); // 배
  E([0.31, 2.26, 0.04], [0.13, 0.085, 0.11], 0.1); // 어깨
  E([-0.31, 2.26, 0.04], [0.13, 0.085, 0.11], 0.1);
  E([0, 2.44, 0.08], [0.064, 0.16, 0.064], 0.07); // 목
  const nTorso = ell.length;
  const staff = [-0.74, 0.5];
  E([staff[0] + 0.022, 2.12, staff[1] - 0.025], [0.054, 0.08, 0.056], 0.02); // 지팡이를 쥔 주먹
  const WL = [0.57, 1.72, 0.68];
  const P = [WL[0] - 0.005, WL[1] - 0.03, WL[2] + 0.085];
  E(P, [0.06, 0.028, 0.075], 0.02); // 펼친 손바닥
  const nSkinEll = ell.length;
  // 풍뎅이 (uA: [x, y, z, 방향])
  for (let i = 0; i < 8; i++) {
    const a = -0.6 + R() * 4.3;
    const r = 0.55 + R() * 0.5;
    ell.push([Math.sin(a) * r * 1.1, 0.024, Math.cos(a) * r * 0.75 + 0.14, R() * 6.28]);
  }
  const nAll = ell.length;

  // ── 사슬 (uB) ── 팔·손가락 (살갗), 그다음 지팡이
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  ch.push([-0.35, 2.25, 0.06, 0.074], [-0.5, 2.02, 0.1, 0.062], [-0.63, 1.8, 0.2, 0.05], [-0.71, 2.1, 0.45, 0.04]);
  brk();
  ch.push([0.35, 2.25, 0.06, 0.074], [0.5, 2.03, 0.12, 0.062], [0.62, 1.86, 0.28, 0.05], [...WL, 0.04]);
  brk();
  // 길고 굽은 손가락 (끝은 금 손톱)
  for (let i = 0; i < 4; i++) {
    const o = (i - 1.5) * 0.032;
    const len = 1.2 - Math.abs(i - 1.6) * 0.14;
    const b0 = [P[0] + o, P[1], P[2] + 0.055];
    const b1 = [b0[0] + o * 0.5, b0[1] - 0.025, b0[2] + 0.11 * len];
    const b2 = [b1[0] + o * 0.35, b1[1] - 0.09 * len, b1[2] + 0.07 * len];
    const b3 = [b2[0] + o * 0.2, b2[1] - 0.085 * len, b2[2] - 0.01];
    ch.push([...b0, 0.013], [...b1, 0.01], [...b2, 0.008], [...b3, 0.003]);
    brk();
  }
  ch.push([P[0] - 0.05, P[1] - 0.005, P[2], 0.014], [P[0] - 0.095, P[1] - 0.06, P[2] + 0.06, 0.009], [P[0] - 0.1, P[1] - 0.13, P[2] + 0.1, 0.003]);
  brk();
  const nSkinCh = ch.length;
  const S = (x, y, z, r) => [staff[0] + x, y, staff[1] + z, r];
  ch.push(S(0, 0.12, 0, 0.026), S(0, 3.14, 0, 0.03));
  brk();
  ch.push(S(-0.01, 3.1, 0, 0.042), S(0.16, 3.2, 0.06, 0.03), S(0.24, 3.17, 0.08, 0.016));
  brk();
  ch.push(S(0.08, 3.2, 0.03, 0.016), S(0.07, 3.3, 0.02, 0.004));
  brk();
  ch.push(S(0.12, 3.2, 0.05, 0.014), S(0.12, 3.29, 0.045, 0.004));
  brk();
  ch.push(S(0, 0.16, 0, 0.02), S(0.05, 0.0, 0, 0.011));
  brk();
  ch.push(S(0, 0.16, 0, 0.02), S(-0.05, 0.0, 0, 0.011));
  brk();
  const nCh = ch.length;

  // ── 매개변수 (uP) ──
  const head = [0, 2.69, 0.18];
  const tilt = 0.2;
  const roll = 0.09;
  const hs = 1.12;

  // 머리 좌표 → 월드 (셰이더: q = (p - head) / hs, q.yz = rot(tilt) * q.yz, q.xy = rot(roll) * q.xy 의 역)
  const toW = (e) => {
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const x1 = cr * e[0] - sr * e[1];
    const y1 = sr * e[0] + cr * e[1];
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    return [head[0] + hs * x1, head[1] + hs * (c * y1 - s * e[2]), head[2] + hs * (s * y1 + c * e[2])];
  };

  // 얼굴 없는 구멍에서 기어 나오는 가는 검은 촉수
  if (faceless) {
    for (let k = 0; k < 7; k++) {
      const a = -1.75 + k * (3.5 / 6) + (R() - 0.5) * 0.35; // 얼굴 평면에서의 방향 (0 = 위)
      const len = 0.24 + R() * 0.3;
      const curl = (R() < 0.5 ? -1 : 1) * (1.2 + R() * 1.4);
      const ph = R() * 6.28;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const ang = a + curl * t * t;
        const rad = 0.025 + t * len;
        const e = [
          Math.sin(ang) * rad + Math.sin(t * 8 + ph) * 0.02 * t,
          -0.03 + Math.cos(ang) * rad * 0.9 + 0.06 * t * t,
          0.05 + t * len * 0.5 - t * t * 0.1,
        ];
        ch.push([...toW(e), 0.021 * Math.pow(1 - t, 0.8) + 0.003]);
      }
      brk();
    }
  }
  const nTen = ch.length;

  const params = [
    [nTorso, nSkinEll, nAll, 0],
    [nSkinCh, nCh, roll, nTen],
    [...head, tilt],
    [0.5, 0.13, 1.02, -0.85], // 떨어진 가면 위치 + 기울기 (뒤로 기대어 하늘을 본다)
    [0.0, 2.5, -0.1, hs], // 부채 깃 중심, w: 머리 크기
  ];

  const lights = [];
  const lc = [];
  if (!faceless) {
    lights.push([...toW([-0.047, 0.017, 0.118]), 0.008], [...toW([0.047, 0.017, 0.118]), 0.008]);
    lc.push([1.0, 0.72, 0.3, 2.2], [1.0, 0.72, 0.3, 2.2]);
  } else {
    for (let i = 0; i < 9; i++) {
      lights.push([...toW([(R() - 0.5) * 0.15, (R() - 0.45) * 0.2, 0.065 + R() * 0.04]), 0.005 + R() * 0.007]);
      lc.push(R() < 0.6 ? [0.75, 0.45, 1.0, 2.0] : [1.0, 0.85, 0.6, 1.8]);
    }
    // 구멍 깊은 곳의 희미한 성운
    lights.push([...toW([0, -0.04, 0.07]), 0.06]);
    lc.push([0.45, 0.2, 0.9, 0.35]);
  }
  for (let i = 0; i < 9; i++) {
    const a = R() * 6.28;
    lights.push([Math.cos(a) * (0.8 + R() * 0.6), 0.5 + R() * 2.7, Math.sin(a) * 0.5 + 0.2, 0.005 + R() * 0.007]);
    lc.push(faceless ? [0.7, 0.45, 1.0, 0.6] : [1.0, 0.75, 0.35, 0.6]);
  }

  const light = faceless
    ? { key: [-0.35, 0.6, -0.75], keyCol: [1.0, 0.7, 1.5], rimCol: [0.95, 0.6, 1.4], fillCol: [0.1, 0.06, 0.2], amb: [0.02, 0.015, 0.035], pt: [0.25, 1.95, 1.15], ptCol: [0.9, 0.45, 1.7], rim: 1.2, exposure: 1.25 }
    : { key: [-0.35, 0.6, -0.75], fillCol: [0.12, 0.07, 0.18], amb: [0.02, 0.015, 0.03], pt: [0.75, 1.75, 1.0], ptCol: [2.6, 1.5, 0.55], rim: 1.3, exposure: 1.25 };

  return {
    preset: 'act4',
    cam: { pos: [0.9, 0.35, 6.9], target: [0, 1.7, 0], fov: 1.8 },
    light,
    frame: { fill: 0.9, bottom: 0.025 },
    arrays: { uA: ell, uB: ch, uL: lights, uLC: lc, uP: params },
    glsl: /* glsl */ `
#define FACELESS ${faceless ? 1 : 0}

float ellR(vec3 p, int a, int b) {
  float d = 1e5;
  for (int i = a; i < b; i += 2) d = smin(d, sdEllipsoid(p - uA[i].xyz, uA[i + 1].xyz), uA[i].w);
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

float maskD(vec3 q) {
  vec3 s = vec3(abs(q.x), q.y, q.z);
  float d = sdEllipsoid(q - vec3(0.0, -0.02, 0.03), vec3(0.116, 0.166, 0.122));
  d = smin(d, sdRoundCone(q, vec3(0.0, 0.03, 0.128), vec3(0.0, -0.05, 0.16), 0.01, 0.019), 0.03);
  d = smin(d, sdEllipsoid(s - vec3(0.047, 0.05, 0.114), vec3(0.054, 0.02, 0.026)), 0.025);
  d = smin(d, sdEllipsoid(q - vec3(0.0, -0.094, 0.128), vec3(0.03, 0.01, 0.013)), 0.014);
  d = smax(d, -sdEllipsoid(s - vec3(0.047, 0.018, 0.13), vec3(0.036, 0.016, 0.034)), 0.006);
  d = smin(d, sdRoundBox(q - vec3(0.0, -0.215, 0.1), vec3(0.03, 0.065, 0.026), 0.018), 0.03);
  return d;
}

float nemesD(vec3 q) {
  vec3 s = vec3(abs(q.x), q.y, q.z);
  float d = sdEllipsoid(q - vec3(0.0, 0.05, -0.035), vec3(0.148, 0.15, 0.165));
  vec3 wq = s - vec3(0.15, -0.085, -0.055);
  wq.xy = rot(0.34) * wq.xy;
  d = smin(d, sdEllipsoid(wq, vec3(0.072, 0.185, 0.105)), 0.07);
  vec3 lq = s - vec3(0.185, -0.38, 0.075);
  lq.yz = rot(-0.2) * lq.yz;
  d = smin(d, sdRoundBox(lq, vec3(0.062, 0.21, 0.014), 0.012), 0.05);
  d = max(d, -sdEllipsoid(q - vec3(0.0, -0.035, 0.12), vec3(0.108, 0.16, 0.12)));
  return min(d, sdCapsule(q, vec3(0.0, 0.09, 0.128), vec3(0.0, 0.17, 0.152), 0.011));
}

// 머리 뒤로 솟은 부채 깃 (코브라 두건처럼 옆이 앞으로 굽는다)
float fanD(vec3 p) {
  vec3 q = p - uP[4].xyz;
  q.z += 0.62 * q.x * q.x - 0.1 * q.y;
  // 살대 끝이 가시처럼 튀어나온다
  float ph = fract(atan(q.x, q.y - 0.05) * 5.0);
  float spike = pow(max(1.0 - abs(ph - 0.5) * 2.0, 0.0), 5.0) * smoothstep(0.05, 0.25, q.y);
  float sc = 1.0 + 0.2 * spike;
  vec3 e = q - vec3(0.0, 0.26, 0.0);
  float d = sdEllipsoid(vec3(e.xy / sc, e.z), vec3(0.58, 0.52, 0.035 / sc));
  return 0.6 * max(d, -q.y - 0.02);
}

float cloakD(vec3 p) {
  vec3 q = p - vec3(0.0, 0.0, -0.04);
  float t = clamp(q.y / 2.3, 0.0, 1.0);
  vec2 rad = mix(vec2(0.95, 0.72), vec2(0.42, 0.2), pow(t, 0.65));
  float a = atan(q.x, -q.z);
  float fold = 0.045 * (1.0 - t * 0.85) * (sin(a * 7.0 + t * 2.5) * 0.6 + sin(a * 15.0 + 1.3) * 0.4);
  float e = (length(q.xz / rad) - 1.0) * min(rad.x, rad.y);
  float d = (abs(e - fold) - 0.016) * 0.7;
  // 앞은 열렸다
  d = max(d, q.z - mix(0.3, -0.1, t));
  d = max(d, 0.02 + 0.06 * max(sin(a * 23.0) * sin(a * 9.0 + 1.0), 0.0) - p.y);
  return max(d, p.y - 2.31);
}

vec2 sdf(vec3 p) {
  // 살갗: 몸통 타원체 + 팔·손가락 사슬, 붕대 골
  float torso = ellR(p, 0, int(uP[0].x));
  float skin = smin(torso, ellR(p, int(uP[0].x), int(uP[0].y)), 0.02);
  skin = smin(skin, chainR(p, 0, int(uP[1].x), 0.014), 0.06);
  float warp = 0.025 * sin(p.x * 13.0 + p.y * 7.0) + 0.015 * sin(p.z * 17.0 - p.y * 11.0);
  float wrap = max(sin((p.y + p.x * 0.45 + p.z * 0.3 + warp) * 140.0), 0.8 * sin((p.y - p.x * 0.55 + p.z * 0.2 - warp) * 105.0 + 1.3));
  skin -= 0.0024 * smoothstep(0.2, 0.9, wrap) * step(p.y, 2.5) * step(1.05, p.y);
  vec2 r = vec2(skin, 1.0);
  // 허리띠와 앞치마
  float belt = sdTorus(p - vec3(0.0, 1.46, 0.0), vec2(0.185, 0.03));
  vec3 aq = p - vec3(0.0, 1.0, 0.285);
  aq.yz = rot(-0.12) * aq.yz;
  float apron = sdRoundBox(aq, vec3(0.08 + 0.045 * (0.45 - aq.y), 0.45, 0.01), 0.006);
  r = umin(r, vec2(belt, 3.0));
  r = umin(r, vec2(apron, 8.0));
  // 아마포 치마와 망토
  float robe = sdRobe(p, 1.5, 0.18, 0.34, 28.0, 0.009);
  robe = max(robe, 0.012 + 0.012 * sin(atan(p.x, p.z) * 31.0) - p.y);
  r = umin(r, vec2(min(robe, cloakD(p)), 2.0));
  r = umin(r, vec2(fanD(p), 9.0));
  // 목걸이 (우세크)
  vec3 cq = p - vec3(0.0, 2.36, 0.05);
  float collar = max(abs(torso - 0.014) - 0.016, length(cq * vec3(1.0, 1.0, 1.15)) - 0.43);
  collar = max(collar, cq.y + 0.005);
  r = umin(r, vec2(collar, 5.0));
  // 머리
  float hs = uP[4].w;
  vec3 hq = (p - uP[2].xyz) / hs;
  hq.yz = rot(uP[2].w) * hq.yz;
  hq.xy = rot(uP[1].z) * hq.xy;
  r = umin(r, vec2(nemesD(hq) * hs, 4.0));
#if FACELESS
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.035, 0.06), vec3(0.102, 0.157, 0.1)) * hs, 99.0));
  vec3 mq = (p - uP[3].xyz) / hs;
  mq.yz = rot(uP[3].w) * mq.yz;
  mq.xy = rot(0.35) * mq.xy;
  r = umin(r, vec2(max(maskD(mq), 0.02 - mq.z) * hs, 3.0));
  // 구멍에서 기어 나오는 촉수
  r = umin(r, vec2(chainR(p, int(uP[1].y), int(uP[1].w), 0.012), 10.0));
#else
  r = umin(r, vec2(maskD(hq) * hs, 3.0));
  vec3 es = vec3(abs(hq.x), hq.y, hq.z);
  r = umin(r, vec2(sdEllipsoid(es - vec3(0.047, 0.018, 0.112), vec3(0.034, 0.015, 0.022)) * hs, 99.0));
#endif
  // 지팡이
  r = umin(r, vec2(chainR(p, int(uP[1].x), int(uP[1].y), 0.02), 6.0));
  // 풍뎅이
  float sc = 1e5;
  for (int i = int(uP[0].y); i < int(uP[0].z); i++) {
    vec3 q = p - uA[i].xyz;
    q.xz = rot(uA[i].w) * q.xz;
    sc = min(sc, smin(sdEllipsoid(q, vec3(0.034, 0.022, 0.048)), sdEllipsoid(q - vec3(0.0, 0.0, 0.048), vec3(0.026, 0.016, 0.02)), 0.01));
  }
  r = umin(r, vec2(sc, 7.0));
  return r;
}

Mat goldMat(vec3 p, vec3 n, float grime) {
  vec3 V = normalize(uCamPos - p);
  vec3 Rf = reflect(-V, n);
  float fr = pow(1.0 - max(dot(n, V), 0.0), 2.0);
  float env = 0.05 + 0.18 * smoothstep(-0.3, 0.8, Rf.y) + 1.6 * pow(max(dot(Rf, normalize(uKeyDir)), 0.0), 10.0)
            + 0.3 * pow(max(dot(Rf, normalize(uFillDir)), 0.0), 5.0)
            + 1.0 * pow(max(dot(Rf, normalize(uPtPos - p)), 0.0), 10.0);
  float g = fbm3(p * 24.0);
  float dirt = grime * smoothstep(0.4, 0.75, g);
  vec3 tone = FACELESS == 1 ? vec3(0.9, 0.62, 0.32) : vec3(1.0, 0.66, 0.24);
  vec3 emi = tone * env * mix(0.6, 1.0, fr) * 0.3 * (1.0 - dirt * 0.85);
  return Mat(vec3(0.17, 0.11, 0.04) * (1.0 - dirt * 0.75), 0.28 + dirt * 0.5, 1.4 * (1.0 - dirt * 0.7), emi, 0.0, 0.0, 0.2);
}

Mat material(float id, vec3 p, vec3 n) {
  float gold = 0.0;
  float grime = 0.3;
  Mat m = Mat(vec3(0.02), 0.5, 0.5, vec3(0.0), 0.0, 0.0, 0.2);
  if (id < 1.5) {
    // 흑요석 살갗 위 썩은 붕대 (틈으로 검은 살이 보인다)
    float v = fbm3(p * 9.0);
    float warp = 0.025 * sin(p.x * 13.0 + p.y * 7.0) + 0.015 * sin(p.z * 17.0 - p.y * 11.0);
    float wrap = max(sin((p.y + p.x * 0.45 + p.z * 0.3 + warp) * 140.0), 0.8 * sin((p.y - p.x * 0.55 + p.z * 0.2 - warp) * 105.0 + 1.3));
    float band = smoothstep(0.0, 0.5, wrap) * step(0.47, fbm3(p * vec3(4.0, 9.0, 4.0))) * step(p.y, 2.5) * step(1.05, p.y);
    vec3 linen = vec3(0.075, 0.058, 0.04) * (0.5 + 0.8 * fbm3(p * 30.0));
    vec3 alb = mix(vec3(0.014, 0.012, 0.017) * (0.7 + 0.6 * v), linen, band);
    vec3 emi = vec3(0.0);
#if FACELESS
    float crack = smoothstep(0.06, 0.0, ridge(p * 6.0 + vec3(0.0, p.y * 2.0, 0.0))) * smoothstep(0.45, 0.7, noise(p * 3.0)) * (1.0 - band);
    emi = vec3(0.55, 0.22, 1.0) * crack * 1.8;
#endif
    m = Mat(alb, mix(0.3, 0.9, band), mix(0.9, 0.1, band), emi, 0.05 * (1.0 - band), 0.0, 0.55 * (1.0 - band));
    // 손가락 끝 금 손톱
    vec3 tipC = uA[int(uP[0].y) - 2].xyz;
    gold = step(length(p - tipC), 0.45) * step(p.y, tipC.y - 0.2);
  } else if (id < 2.5) {
    // 검은 아마포, 금실 밑단
    gold = step(abs(p.y - 0.11) - 0.02, 0.0) * step(0.02, length(p.xz) - 0.3);
    // 망토 앞자락의 금 테두리
    vec3 kq = p - vec3(0.0, 0.0, -0.04);
    float kt = clamp(kq.y / 2.3, 0.0, 1.0);
    float cut = kq.z - mix(0.3, -0.1, kt);
    gold = max(gold, step(-0.013, cut) * step(0.3, length(p.xz)) * step(0.3, p.y));
    grime = 0.6;
    float dust = smoothstep(0.6, 0.0, p.y) * 0.5;
    m = Mat(mix(vec3(0.022, 0.019, 0.017), vec3(0.06, 0.05, 0.038), dust) * (0.6 + 0.7 * fbm3(p * 6.0)), 0.88, 0.12, vec3(0.0), 0.0, 0.0, 0.03);
  } else if (id < 3.5) {
    gold = 1.0;
  } else if (id < 4.5) {
    // 네메스: 바랜 금과 검푸른 줄
    gold = step(0.62, fract(p.y * 24.0));
    grime = 0.55;
    m = Mat(vec3(0.01, 0.013, 0.028), 0.45, 0.6, vec3(0.0), 0.0, 0.0, 0.3);
  } else if (id < 5.5) {
    // 우세크: 금 · 청금석 · 홍옥수 띠
    vec3 cq = p - vec3(0.0, 2.36, 0.05);
    float rr = length(cq * vec3(1.0, 1.0, 1.15));
    float k = mod(floor(rr * 34.0), 3.0);
    float bead = 0.75 + 0.25 * sin(atan(cq.x, cq.z) * 90.0);
    gold = (k < 0.5 || rr > 0.405) ? 1.0 : 0.0;
    grime = 0.35;
    m = Mat(mix(vec3(0.06, 0.01, 0.007), vec3(0.008, 0.018, 0.05), step(k, 1.5)) * bead, 0.3, 0.9, vec3(0.0), 0.0, 0.0, 0.4);
  } else if (id < 6.5) {
    // 와스 홀: 검은 나무, 금띠
    gold = (step(0.9, fract(p.y * 2.2 + 0.3)) > 0.5 || p.y > 3.04 || p.y < 0.2) ? 1.0 : 0.0;
    grime = 0.45;
    m = Mat(vec3(0.016, 0.013, 0.011), 0.5, 0.5, vec3(0.0), 0.0, 0.0, 0.2);
  } else if (id < 7.5) {
    m = Mat(vec3(0.012, 0.011, 0.008), 0.2, 1.4, vec3(0.0), 0.55, 0.0, 0.5);
  } else if (id > 9.5) {
    // 얼굴 구멍의 촉수: 젖은 검정, 끝으로 갈수록 보랏빛이 스민다
    float tip = smoothstep(2.75, 3.15, p.y);
    m = Mat(vec3(0.008, 0.006, 0.012), 0.15, 1.3, vec3(0.45, 0.18, 1.0) * tip * 0.8, 0.5, 0.0, 0.9);
  } else if (id < 8.5) {
    // 앞치마: 검은 판에 금 테두리와 상형 문자 칸
    vec3 aq = p - vec3(0.0, 1.0, 0.285);
    float w = 0.08 + 0.045 * (0.45 - aq.y);
    float edge = step(w - 0.016, abs(aq.x));
    vec2 g = vec2(aq.x * 90.0, aq.y * 60.0);
    vec2 cell = floor(g);
    vec2 fc = fract(g);
    float h = hash31(vec3(cell, 3.0));
    float stroke = h < 0.33 ? step(abs(fc.x - 0.5), 0.14) : h < 0.66 ? step(abs(fc.y - 0.5), 0.14) : step(abs(length(fc - 0.5) - 0.3), 0.1);
    float glyph = step(abs(aq.x), 0.035) * step(0.3, hash31(vec3(cell, 7.0))) * stroke * step(abs(aq.y), 0.4);
    gold = max(edge, glyph);
    grime = 0.5;
    m = Mat(vec3(0.01, 0.012, 0.022), 0.45, 0.6, vec3(0.0), 0.0, 0.0, 0.3);
  } else {
    // 부채 깃: 검은 비늘 가죽, 방사형 금 살대와 테두리
    vec3 q = p - uP[4].xyz;
    float ang = atan(q.x, q.y - 0.05);
    float rib = step(0.86, fract(ang * 5.0 + 0.5));
    float rim = step(0.93, length(vec2(q.x / 0.58, (q.y - 0.26) / 0.52)));
    gold = max(rib * step(0.12, q.y), rim);
    grime = 0.5;
    float sc = 0.6 + 0.4 * smoothstep(0.2, 0.0, abs(fract(q.x * 30.0 + 0.5 * floor(q.y * 30.0)) - 0.5));
    m = Mat(vec3(0.014, 0.012, 0.016) * sc, 0.35, 0.8, vec3(0.0), 0.15, 0.0, 0.4);
  }
  if (gold > 0.5) m = goldMat(p, n, grime);
  return m;
}
`,
  };
}
