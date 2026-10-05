// 별빛 순례자 (5층) — 우주 한가운데의 요람을 향해 걷는 자들. 걸음마다 몸이 별빛으로 부서져 흩어지지만 멈추는 법이 없다.
// 등이 굽은 키 큰 순례자가 긴 지팡이를 짚고 한 걸음 내디딘다. 무거운 법의와 깊은 두건 — 두건 속엔 얼굴 대신 작은 별자리가 떴다.
// 몸의 뒤쪽 절반은 네모난 조각으로 바스러지는 중이다: 부서진 면마다 속에서 금빛 별빛이 새고, 떨어져 나간 조각들은
// 혜성 꼬리처럼 뒤로 흩날린다. 지팡이 끝엔 작은 순례자의 등불이 흔들린다.
import { rng } from '../../lib.js';

export default function starPilgrim({ seed = 1 } = {}) {
  const R = rng(seed * 811 + 17);
  const head = [-0.12, 1.72, 0.3];
  const staffTop = [-0.62, 2.25, 0.45];
  const lamp = [-0.66, 2.0, 0.5];
  // 흩날리는 조각 (uA: 중심, 크기) — 몸 뒤쪽 오른편에서 뒤로 길게
  const shards = [];
  for (let i = 0; i < 40; i++) {
    const t = Math.pow(R(), 0.8);
    const y = 0.4 + R() * 1.45;
    const x = 0.25 + t * 1.6 + (R() - 0.5) * 0.25;
    const z = -0.15 - t * 0.9 + (R() - 0.5) * 0.5;
    const s = (0.05 - t * 0.035) * (0.5 + R() * 0.9) + 0.006;
    shards.push([x, y + t * 0.25, z, s]);
  }
  const lights = [];
  const lc = [];
  // 두건 속 별자리
  const cons = [
    [-0.05, 0.03, 0.0],
    [0.02, 0.05, 0.0],
    [0.05, -0.01, 0.0],
    [-0.02, -0.04, 0.0],
    [0.0, 0.0, 0.0],
  ];
  for (const c of cons) {
    lights.push([head[0] + c[0], head[1] + c[1] - 0.02, head[2] + 0.06, 0.004 + R() * 0.003]);
    lc.push([1.0, 0.92, 0.7, 1.6]);
  }
  lights.push([lamp[0], lamp[1], lamp[2], 0.05]);
  lc.push([1.0, 0.8, 0.45, 0.6]);
  for (let i = 0; i < 18; i++) {
    const sh = shards[Math.floor(R() * shards.length)];
    lights.push([sh[0] + (R() - 0.5) * 0.15, sh[1] + (R() - 0.5) * 0.15, sh[2] + (R() - 0.5) * 0.15, 0.004 + R() * 0.007]);
    lc.push([1.0, 0.88, 0.6, 1.0]);
  }
  return {
    preset: 'act5',
    cam: { pos: [2.2, 0.75, 6.2], target: [0.25, 1.15, 0.0], fov: 1.75 },
    light: {
      key: [-0.45, 0.55, -0.7],
      keyCol: [1.15, 0.85, 1.1],
      fillCol: [0.05, 0.09, 0.12],
      amb: [0.012, 0.011, 0.02],
      rimCol: [1.0, 0.8, 1.15],
      rim: 1.8,
      exposure: 1.2,
      glow: 0.05,
      pt: [0.45, 1.2, 0.2],
      ptCol: [0.9, 0.62, 0.25],
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: { uA: shards, uL: lights, uLC: lc, uP: [[...head, 0], [...staffTop, 0], [...lamp, 0]] },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_BG

float bend(float y) { float h = max(y - 0.9, 0.0); return 0.28 * h * h; }

// 바스러짐: 몸 뒤쪽(+x, -z)으로 갈수록 강하다
float erosion(vec3 p) {
  return smoothstep(-0.15, 0.5, p.x * 0.9 - p.z * 0.6 + 0.55 * (fbm3(p * 2.5) - 0.5));
}

float figure(vec3 p) {
  vec3 b = p;
  b.z -= bend(b.y);
  b.x += 0.08 * max(b.y - 0.9, 0.0);
  // 법의: 걷는 다리 쪽으로 자락이 앞으로 쏠렸다
  vec3 rb = b - vec3(0.0, 0.0, 0.05 * smoothstep(0.8, 0.0, b.y));
  float robe = sdRobe(rb, 1.6, 0.2, 0.42, 8.0, 0.045);
  robe = max(robe, -(b.y - 0.02 - 0.12 * fbm3(vec3(b.x * 7.0, 0.0, b.z * 7.0))));
  robe = smin(robe, sdEllipsoid(b - vec3(0.0, 1.45, -0.02), vec3(0.24, 0.2, 0.18)), 0.1);
  robe = smin(robe, sdEllipsoid(b - vec3(0.0, 1.55, -0.1), vec3(0.2, 0.14, 0.13)), 0.08);
  // 내디딘 발 (자락 밖으로)
  robe = smin(robe, sdRoundCone(p, vec3(-0.1, 0.25, 0.25), vec3(-0.14, 0.04, 0.42), 0.06, 0.045), 0.05);
  // 소매: 지팡이 쥔 팔 (앞), 늘어뜨린 팔 (뒤)
  vec3 hand = vec3(-0.6, 1.35, 0.46);
  float sl = sdRoundCone(p, vec3(-0.2, 1.52, bend(1.52) + 0.05), vec3(-0.45, 1.28, 0.35), 0.09, 0.08);
  sl = min(sl, sdRoundCone(p, vec3(-0.45, 1.28, 0.35), hand + vec3(0.05, 0.0, -0.03), 0.08, 0.1));
  float sr = sdRoundCone(p, vec3(0.2, 1.5, bend(1.5) - 0.02), vec3(0.32, 1.1, 0.1), 0.09, 0.09);
  sr = min(sr, sdRoundCone(p, vec3(0.32, 1.1, 0.1), vec3(0.3, 0.8, 0.22), 0.09, 0.11));
  robe = smin(robe, min(sl, sr), 0.05);
  // 두건
  vec3 hq = p - uP[0].xyz;
  hq.yz = rot(0.5) * hq.yz;
  float hood = sdEllipsoid(hq - vec3(0.0, 0.01, -0.02), vec3(0.15, 0.18, 0.17));
  hood = smin(hood, sdRoundCone(hq, vec3(0.0, 0.07, -0.08), vec3(0.02, 0.14, -0.26), 0.11, 0.04), 0.08);
  hood = max(hood, -sdEllipsoid(hq - vec3(0.0, -0.03, 0.15), vec3(0.1, 0.13, 0.15)));
  hood = max(hood, -sdEllipsoid(hq - vec3(0.0, -0.02, 0.0), vec3(0.12, 0.15, 0.14)));
  robe = smin(robe, hood, 0.05);
  // 지팡이 쥔 마른 손
  float hd = sdEllipsoid(p - hand, vec3(0.04, 0.05, 0.035));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.022;
    vec3 a = hand + vec3(-0.01, o, 0.03);
    hd = smin(hd, sdRoundCone(p, a, a + vec3(-0.045, -0.01, 0.0), 0.011, 0.009), 0.01);
  }
  return smin(robe, hd, 0.02);
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 1.0);
  float bb = length(p - vec3(0.0, 1.0, 0.1)) - 1.4;
  float fig = 1e5;
  if (bb < 0.3) {
    fig = figure(p);
    // 네모 조각으로 떨어져 나간다
    float e = erosion(p);
    if (e > 0.01) {
      float nz = fbm3(p * 7.0) * 0.75 + noise(p * 23.0) * 0.25;
      fig = max(fig, (e * 1.1 - nz) * 0.12);
    }
    if (fig < 0.04) fig += 0.004 * (fbm3(p * 18.0) - 0.5);
    r = vec2(fig, 1.0);
    r = umin(r, vec2(max(sdEllipsoid(p - uP[0].xyz - vec3(0.0, -0.02, 0.0), vec3(0.11, 0.14, 0.12)), -fig - 0.02), 99.0));
  } else {
    r.x = bb;
  }
  // 흩날리는 조각: 기울어진 작은 육면체
  float sh = 1e5;
  for (int i = 0; i < 64; i++) {
    if (i >= uAN) break;
    vec4 s = uA[i];
    vec3 q = p - s.xyz;
    if (dot(q, q) > 0.04) { sh = min(sh, length(q) - s.w); continue; }
    float h = hash11(float(i) * 7.3);
    q.xy = rot(h * 6.28) * q.xy;
    q.yz = rot(h * 11.0) * q.yz;
    float h2 = hash11(float(i) * 3.1);
    sh = min(sh, sdBox(q, vec3(s.w * (0.5 + h2 * 0.6), s.w * 0.12, s.w * (0.9 - h2 * 0.3))) - s.w * 0.04);
  }
  r = umin(r, vec2(sh, 2.0));
  // 지팡이와 등불
  vec3 st = uP[1].xyz;
  float staff = sdCapsule(p, vec3(-0.52, 0.02, 0.48), st, 0.018);
  staff = min(staff, sdCapsule(p, st, st + vec3(-0.08, -0.06, 0.03), 0.014));
  staff = min(staff, sdCapsule(p, st + vec3(-0.08, -0.06, 0.03), uP[2].xyz + vec3(0.0, 0.07, 0.0), 0.004));
  vec3 lq = p - uP[2].xyz;
  float cage = sdRoundBox(lq, vec3(0.035, 0.05, 0.035), 0.008);
  cage = max(cage, -sdBox(lq, vec3(0.027, 0.04, 0.06)));
  cage = max(cage, -sdBox(lq, vec3(0.06, 0.04, 0.027)));
  staff = min(staff, cage);
  r = umin(r, vec2(staff, 3.0));
  r = umin(r, vec2(sdEllipsoid(lq, vec3(0.02, 0.032, 0.02)), 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float v = fbm3(p * 6.0);
  if (id < 1.5) {
    // 법의: 먼지 쌓인 잿빛 보라 천. 부서지는 가장자리 근처는 속에서 금빛이 샌다
    float e = erosion(p);
    float fo = figure(p);
    // 겉면: 먼지 앉은 천, 부서지는 쪽은 금이 가서 빛이 샌다
    float crack = smoothstep(0.05, 0.0, ridge(p * 6.0)) * smoothstep(0.1, 0.5, e);
    float rim = 0.0;
    vec3 alb = vec3(0.045, 0.04, 0.06) * (0.6 + 0.7 * v) * (0.85 + 0.15 * noise(p * 110.0));
    vec3 emi = vec3(1.4, 0.98, 0.42) * crack * 0.5;
    if (fo < -0.003 && e > 0.02) {
      // 부서진 면: 가장자리는 금빛으로 타고, 속은 몸 대신 별빛이 차 있다
      vec3 g = p * 45.0;
      vec3 c = floor(g);
      float star = step(0.88, hash31(c)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.6 + hash31(c + 2.0));
      float deep = smoothstep(0.004, 0.035, -fo);
      alb = vec3(0.0);
      vec3 inner = vec3(0.12, 0.07, 0.03) * (0.4 + 0.6 * fbm3(p * 5.0)) + vec3(1.3, 1.05, 0.7) * star * 1.2;
      emi = mix(vec3(1.5, 1.0, 0.4), inner, deep);
    }
    emi += vec3(1.6, 1.1, 0.45) * rim * 1.2;
    return Mat(alb, 0.88, 0.1, emi, 0.0, 0.1, 0.0);
  }
  if (id < 2.5) {
    // 흩날리는 조각: 천 조각이 가장자리부터 금빛으로 타며 사라진다 (멀리 갈수록 빛만 남는다)
    float far = smoothstep(0.5, 1.7, p.x);
    vec3 alb = vec3(0.045, 0.04, 0.06) * (1.0 - far);
    vec3 V = normalize(uCamPos - p);
    float edgeLit = pow(1.0 - abs(dot(n, V)), 2.0);
    vec3 emi = vec3(1.4, 0.95, 0.4) * (0.08 + 0.5 * edgeLit + 0.9 * far * far);
    return Mat(alb, 0.8, 0.2, emi, 0.0, 0.0, 0.0);
  }
  if (id < 3.5) return Mat(vec3(0.05, 0.035, 0.022) * (0.6 + 0.6 * v), 0.55, 0.5, vec3(0.0), 0.0, 0.0, 0.1);
  return Mat(vec3(0.0), 0.1, 1.0, vec3(2.2, 1.6, 0.7), 0.0, 0.0, 0.3);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.012);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.2, 0.07, 0.26) * pow(fbm3(rd * 3.0), 3.0) * 0.8 + vec3(0.03, 0.08, 0.1) * pow(fbm3(rd * 2.0 + 5.0), 3.0);
  return col;
}
`,
  };
}
