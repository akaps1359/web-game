// 꿈 사냥꾼 (5층 추적자) — 깨어 있는 채로 꿈속을 걷는 자를 쫓는 사냥꾼.
// 키 크고 등이 굽은 형체, 땅에 끌리는 누더기 외투와 깊은 두건. 두건 속엔 길쭉한 새 두개골 가면 — 눈구멍 속에 박하빛 점 둘.
// 한 손엔 미늘 달린 긴 사냥 창, 다른 손엔 어깨에서 흘러내리는 꿈 그물(성긴 그물코에 꿈 부스러기가 걸려 반짝인다).
// 허리에는 붙잡은 꿈들을 담은 유리 등롱 여럿이 매달려, 속에서 작은 성운이 소용돌이친다 (그중 몇은 당신의 것).
import { rng } from '../../lib.js';

export default function dreamHunter({ seed = 1 } = {}) {
  const R = rng(seed * 43 + 1);
  const bend = (y) => {
    const h = Math.max(y - 0.9, 0);
    return 0.62 * h * h;
  };
  // 허리 둘레의 꿈 등롱 (매달린 끈 길이가 제각각)
  const jars = [];
  const uL = [];
  const uLC = [];
  const cols = [
    [0.55, 1.0, 0.82],
    [0.7, 0.55, 1.0],
    [0.55, 1.0, 0.82],
    [1.0, 0.7, 0.5],
    [0.55, 0.85, 1.0],
    [0.55, 1.0, 0.82],
  ];
  for (let i = 0; i < 6; i++) {
    const a = -1.3 + i * 0.52 + (R() - 0.5) * 0.15;
    const r = 0.36;
    const top = [Math.sin(a) * r, 1.08, Math.cos(a) * r * 0.9 + bend(1.08)];
    const drop = 0.14 + R() * 0.32;
    const c = [top[0] * 1.08, top[1] - drop, top[2] * 1.08 + 0.03];
    const s = 0.045 + R() * 0.025;
    jars.push([...top, 0], [...c, s]);
    uL.push([c[0], c[1], c[2], s * 1.2]);
    uLC.push([...cols[i], 0.35]);
  }
  // 가면의 눈빛
  const head = [0.0, 1.92, 0.78];
  uL.push([head[0] - 0.055, head[1] + 0.0, head[2] + 0.14, 0.009], [head[0] + 0.055, head[1] - 0.005, head[2] + 0.14, 0.009]);
  uLC.push([0.55, 1.0, 0.82, 1.4], [0.55, 1.0, 0.82, 1.4]);
  // 그물에 걸린 꿈 부스러기
  for (let i = 0; i < 8; i++) {
    uL.push([-0.55 - R() * 0.35, 0.2 + R() * 1.1, 0.35 + R() * 0.3, 0.006 + R() * 0.008]);
    uLC.push([0.6, 1.0, 0.85, 0.9]);
  }
  const f3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;
  return {
    preset: 'act5',
    cam: { pos: [1.6, 0.1, 7.2], target: [0.05, 1.25, 0.2], fov: 1.85 },
    light: {
      key: [-0.45, 0.65, -0.6],
      keyCol: [0.85, 0.95, 1.2],
      fill: [0.6, 0.2, 0.75],
      fillCol: [0.025, 0.05, 0.05],
      amb: [0.006, 0.007, 0.01],
      rimCol: [0.6, 1.0, 0.9],
      rim: 2.2,
      glow: 0.08,
      exposure: 1.2,
      pt: [0.0, 0.9, 0.55],
      ptCol: [0.4, 0.9, 0.75],
    },
    frame: { fill: 0.9 },
    arrays: { uA: jars, uL, uLC },
    glsl: /* glsl */ `
const vec3 HEAD = ${f3(head)};
const vec3 HAND_R = vec3(0.42, 0.95, 0.62);
const vec3 HAND_L = vec3(-0.45, 0.98, 0.72);

float bend(float y) { float h = max(y - 0.9, 0.0); return 0.62 * h * h; }

float hand(vec3 p, vec3 c, vec3 dir, float s) {
  float d = sdEllipsoid(p - c, vec3(0.045, 0.055, 0.04) * s);
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.02 * s;
    vec3 a = c + vec3(o, -0.02, 0.0);
    vec3 m = a + dir * (0.09 - abs(o) * 0.8) * s;
    vec3 e = m + normalize(dir + vec3(0.0, -0.4, 0.5)) * 0.07 * s;
    d = smin(d, sdRoundCone(p, a, m, 0.011 * s, 0.008 * s), 0.01);
    d = smin(d, sdRoundCone(p, m, e, 0.008 * s, 0.004 * s), 0.006);
  }
  return d;
}

vec2 sdf(vec3 p) {
  vec3 b = p;
  b.z -= bend(b.y);
  // 누더기 외투: 아래로 넓게 퍼지고, 밑단은 찢겨 땅에 끌린다
  float robe = sdRobe(b, 1.72, 0.22, 0.6, 11.0, 0.065);
  float hem = 0.22 * fbm3(vec3(b.x * 7.0, 0.0, b.z * 7.0)) + 0.1 * step(0.6, noise(vec3(atan(b.z, b.x) * 6.0, 0.0, 1.0)));
  robe = max(robe, -(b.y - 0.01 - hem));
  // 외투 자락 사이 찢긴 틈
  robe = max(robe, -max(abs(fract(atan(b.z, b.x) * 1.9) - 0.5) - 0.05, b.y - 0.55 - 0.3 * noise(b * 3.0)));
  float torso = sdEllipsoid(b - vec3(0.0, 1.45, -0.02), vec3(0.28, 0.27, 0.2));
  robe = smin(robe, torso, 0.12);
  robe = smin(robe, sdEllipsoid(b - vec3(0.0, 1.6, -0.12), vec3(0.24, 0.18, 0.16)), 0.1);
  // 어깨 망토: 위에 한 겹 더, 끝이 해졌다
  float cape = abs(sdEllipsoid(b - vec3(0.0, 1.5, 0.0), vec3(0.42, 0.36, 0.34))) - 0.015;
  cape = max(cape, -(b.y - 1.2 - 0.12 * fbm3(b * 9.0)));
  robe = min(robe, cape);
  // 소매
  vec3 elR = vec3(0.46, 1.22, 0.42);
  vec3 elL = vec3(-0.5, 1.2, 0.45);
  float sl = min(sdRoundCone(p, vec3(0.26, 1.58, bend(1.58)), elR, 0.1, 0.085), sdRoundCone(p, elR, HAND_R + vec3(0.0, 0.07, -0.05), 0.085, 0.1));
  sl = min(sl, min(sdRoundCone(p, vec3(-0.26, 1.58, bend(1.58)), elL, 0.1, 0.085), sdRoundCone(p, elL, HAND_L + vec3(0.0, 0.07, -0.05), 0.085, 0.1)));
  sl = max(sl, -min(sdSphere(p - HAND_R - vec3(0.0, 0.05, 0.0), 0.07), sdSphere(p - HAND_L - vec3(0.0, 0.05, 0.0), 0.07)));
  robe = smin(robe, sl, 0.05);
  // 깊은 두건
  vec3 hq = p - HEAD;
  hq.yz = rot(0.4) * hq.yz;
  float hood = sdEllipsoid(hq - vec3(0.0, 0.02, -0.04), vec3(0.19, 0.22, 0.22));
  hood = smin(hood, sdRoundCone(hq, vec3(0.0, 0.12, -0.08), vec3(0.0, 0.3, -0.3), 0.12, 0.02), 0.06);
  hood = max(hood, -sdEllipsoid(hq - vec3(0.0, -0.03, 0.2), vec3(0.13, 0.17, 0.2)));
  robe = smin(robe, hood, 0.05);
  if (robe < 0.04) robe += 0.005 * (fbm3(p * 22.0) - 0.5);
  vec2 r = vec2(robe, 1.0);
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.02, 0.0), vec3(0.13, 0.16, 0.15)), 99.0));
  // 새 두개골 가면: 두건 밖으로 길게 튀어나온 부리
  vec3 mq = hq - vec3(0.0, -0.03, 0.1);
  float mask = sdEllipsoid(mq, vec3(0.1, 0.11, 0.1));
  mask = smin(mask, sdRoundCone(mq, vec3(0.0, -0.02, 0.05), vec3(0.0, -0.13, 0.36), 0.065, 0.012), 0.05);
  mask = max(mask, -sdEllipsoid(vec3(abs(mq.x), mq.y, mq.z) - vec3(0.05, 0.02, 0.09), vec3(0.03, 0.025, 0.04)));
  // 가면 위로 두건을 뚫고 솟은 비틀린 뿔 (가지를 친다)
  vec3 aq = vec3(abs(hq.x), hq.y, hq.z);
  vec3 a0 = vec3(0.08, 0.12, 0.0);
  vec3 a1 = vec3(0.22, 0.34, -0.1);
  vec3 a2 = vec3(0.3, 0.6, -0.05);
  vec3 a3 = vec3(0.26, 0.82, -0.18);
  float horn = smin(sdRoundCone(aq, a0, a1, 0.03, 0.022), sdRoundCone(aq, a1, a2, 0.022, 0.015), 0.02);
  horn = smin(horn, sdRoundCone(aq, a2, a3, 0.015, 0.004), 0.01);
  horn = min(horn, sdRoundCone(aq, a1 + vec3(0.02, 0.05, 0.0), a1 + vec3(0.2, 0.12, 0.05), 0.015, 0.003));
  horn = min(horn, sdRoundCone(aq, a2, a2 + vec3(0.16, 0.08, 0.06), 0.012, 0.002));
  mask = min(mask, horn);
  r = umin(r, vec2(mask, 2.0));
  // 손
  r = umin(r, vec2(min(hand(p, HAND_R, normalize(vec3(-0.3, -0.2, 0.6)), 1.0), hand(p, HAND_L, normalize(vec3(0.2, -0.6, 0.5)), 1.0)), 3.0));
  // 사냥 창: 길게 기울어진 자루, 미늘 달린 날
  vec3 s0 = vec3(0.58, 0.05, 0.45);
  vec3 s1 = vec3(0.32, 2.45, 0.85);
  float shaft = sdCapsule(p, s0, s1, 0.017);
  vec3 sd = normalize(s1 - s0);
  vec3 tip = s1 + sd * 0.42;
  vec3 bq = p - s1;
  float t = clamp(dot(bq, sd) / 0.42, 0.0, 1.0);
  vec3 perp = bq - sd * t * 0.42;
  float blade = max(length(perp * vec3(1.0, 1.0, 3.0)) - 0.06 * (1.0 - t) * (0.6 + 0.4 * sin(t * 3.14)), -dot(bq, sd));
  blade = min(blade, sdRoundCone(p, s1 + sd * 0.05, s1 + sd * -0.06 + vec3(0.12, 0.0, 0.0), 0.012, 0.003));
  blade = min(blade, sdRoundCone(p, s1 + sd * 0.05, s1 + sd * -0.06 + vec3(-0.12, 0.0, 0.0), 0.012, 0.003));
  r = umin(r, vec2(min(shaft, blade * 0.8), 4.0));
  // 꿈 그물: 왼손에서 늘어진 성긴 그물 (휘어진 판에 그물코 구멍)
  vec3 nq = p - vec3(-0.62, 0.5, 0.75);
  nq.x += 0.1 * sin(nq.y * 3.0 + nq.z * 4.0) + 0.2 * nq.y * nq.y;
  float sheet = sdBox(nq, vec3(0.008, 0.48, 0.3 - 0.1 * nq.y));
  sheet = max(sheet, -nq.y - 0.42 + 0.18 * noise(nq * 5.0));
  vec3 wq = nq + 0.06 * vec3(0.0, noise(nq * 4.0) - 0.5, noise(nq * 4.0 + 7.0) - 0.5);
  vec2 g = fract(vec2(wq.y * 6.0 + wq.z * 3.0, wq.z * 6.0 - wq.y * 3.0)) - 0.5;
  float holes = 0.465 - max(abs(g.x), abs(g.y));
  sheet = max(sheet, holes / 7.0);
  r = umin(r, vec2(sheet, 5.0));
  // 허리띠와 꿈 등롱
  float belt = sdTorus(b - vec3(0.0, 1.08, 0.0), vec2(0.33, 0.018));
  float lanterns = 1e5;
  float cords = 1e5;
  for (int i = 0; i < 6; i++) {
    vec3 top = uA[i * 2].xyz;
    vec4 j = uA[i * 2 + 1];
    cords = min(cords, sdCapsule(p, top, j.xyz + vec3(0.0, j.w, 0.0), 0.004));
    float jar = sdEllipsoid(p - j.xyz, vec3(j.w, j.w * 1.25, j.w));
    jar = min(jar, sdCappedCone(p - j.xyz - vec3(0.0, j.w * 1.2, 0.0), j.w * 0.2, j.w * 0.5, j.w * 0.3));
    lanterns = min(lanterns, jar);
  }
  r = umin(r, vec2(min(belt, cords), 6.0));
  r = umin(r, vec2(lanterns, 7.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  if (id < 1.5) {
    // 이슬 젖은 검은 모직, 밑단에 꿈 부스러기가 묻어 박하빛 얼룩
    float dirt = fbm3(p * 5.0);
    float wetHem = smoothstep(0.45, 0.05, p.y);
    vec3 alb = vec3(0.028, 0.03, 0.034) * (0.55 + 0.8 * dirt) * (0.85 + 0.15 * noise(p * 140.0));
    float speck = smoothstep(0.93, 0.98, noise(p * 40.0)) * smoothstep(0.5, 0.05, p.y);
    return Mat(alb, 0.9 - wetHem * 0.4, 0.06 + wetHem * 0.4, vec3(0.3, 0.9, 0.7) * speck * 0.6, 0.0, 0.0, wetHem * 0.4);
  }
  if (id < 2.5) {
    // 새 두개골: 누렇게 바랜 뼈, 금 간 결
    float crack = smoothstep(0.04, 0.0, ridge(p * 18.0)) * 0.5;
    return Mat(vec3(0.2, 0.19, 0.16) * (1.0 - crack), 0.5, 0.4, vec3(0.0), 0.0, 0.25, 0.1);
  }
  if (id < 3.5) return Mat(vec3(0.1, 0.1, 0.1), 0.6, 0.3, vec3(0.0), 0.0, 0.4, 0.1);
  if (id < 4.5) return Mat(vec3(0.06, 0.055, 0.05), 0.3, 1.2, vec3(0.0), 0.0, 0.0, 0.6);
  if (id < 5.5) {
    // 그물: 검은 실, 그물코마다 꿈 부스러기가 반짝인다
    float spark = smoothstep(0.88, 0.96, noise(p * 22.0));
    return Mat(vec3(0.035, 0.04, 0.045), 0.7, 0.3, vec3(0.4, 1.0, 0.8) * (0.01 + spark * 1.5), 0.2, 0.0, 0.2);
  }
  if (id < 6.5) return Mat(vec3(0.06, 0.05, 0.035), 0.8, 0.2, vec3(0.0), 0.0, 0.0, 0.1);
  // 꿈 등롱: 얇은 유리 속에서 작은 성운이 소용돌이친다
  int best = 0;
  float bd = 1e5;
  for (int i = 0; i < 6; i++) {
    float dd = length(p - uA[i * 2 + 1].xyz);
    if (dd < bd) { bd = dd; best = i; }
  }
  vec4 j = uA[best * 2 + 1];
  vec3 q = (p - j.xyz) / j.w;
  float sw = atan(q.z, q.x) + q.y * 3.0;
  float neb = fbm3(vec3(cos(sw), q.y * 2.0, sin(sw)) * 2.0 + float(best) * 3.0);
  vec3 c = uLC[best].rgb;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 emi = c * (0.25 + 1.6 * smoothstep(0.4, 0.75, neb)) + vec3(0.8, 0.9, 1.0) * fres * 0.4;
  return Mat(vec3(0.02), 0.05, 1.5, emi, 0.3, 0.0, 1.0);
}
`,
  };
}
