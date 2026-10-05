// 꿈의 대사제 (5층 정예) — 태아가 깨어나지 않도록 평생 자장가를 불러 온 사제. 이 꿈이 영원하기를 빈다.
// 바닥에 닿지 않고 떠 있는 깡마른 형체. 겹겹의 쪽빛 법의 밑단은 연기처럼 풀려 사라진다.
// 길쭉한 민머리, 눈은 별을 수놓은 띠로 동여맸고, 턱이 늘어질 만큼 벌린 입으로 끝없이 노래한다.
// 머리 뒤에는 아기 침대 위의 모빌 같은 초승달 관 — 가는 실에 매달린 작은 별과 달이 흔들린다.
// 두 손은 가슴 앞에서 잠든 별이 든 작은 요람 등롱을 받쳐 든다.
import { rng } from '../../lib.js';

export default function dreamHierophant({ seed = 1 } = {}) {
  const R = rng(seed * 89 + 21);
  const HEAD = [0, 2.42, 0.18];
  const CRADLE = [0, 1.52, 0.62];
  // 모빌: 초승달 관에서 늘어진 실 끝의 별 (uA: 실 위끝, 아래끝+크기)
  const A = [];
  const uL = [];
  const uLC = [];
  for (let i = 0; i < 6; i++) {
    const a = -2.3 + i * 0.92 + (R() - 0.5) * 0.1;
    const rr = 0.62;
    const top = [HEAD[0] + Math.cos(a + Math.PI / 2) * rr, HEAD[1] + 0.12 + Math.sin(a + Math.PI / 2) * rr * 0.95, HEAD[2] - 0.32];
    if (top[1] < HEAD[1] - 0.2) continue;
    const len = 0.25 + R() * 0.35;
    const end = [top[0], top[1] - len, top[2] + 0.02];
    const s = 0.03 + R() * 0.02;
    A.push([...top, 0], [...end, s]);
    uL.push([end[0], end[1] - s, end[2], s * 1.3]);
    uLC.push(i % 2 ? [0.75, 0.6, 1.0, 0.8] : [1.0, 0.88, 0.6, 0.8]);
  }
  // 요람 속 잠든 별
  uL.push([CRADLE[0], CRADLE[1] - 0.02, CRADLE[2], 0.08]);
  uLC.push([1.0, 0.85, 0.6, 0.7]);
  // 법의 밑단에서 풀려 나가는 빛 티끌
  for (let i = 0; i < 10; i++) {
    const a = R() * Math.PI * 2;
    uL.push([Math.cos(a) * (0.4 + R() * 0.4), 0.15 + R() * 0.5, Math.sin(a) * 0.4 + 0.2, 0.006 + R() * 0.01]);
    uLC.push([0.7, 0.55, 1.0, 0.8]);
  }
  const f3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;
  return {
    preset: 'act5',
    cam: { pos: [0.9, 0.2, 7.0], target: [0.0, 1.55, 0.1], fov: 1.85 },
    light: {
      key: [-0.4, 0.6, -0.7],
      keyCol: [0.9, 0.85, 1.25],
      fill: [0.6, -0.2, 0.75],
      fillCol: [0.04, 0.03, 0.08],
      amb: [0.008, 0.007, 0.014],
      rimCol: [0.8, 0.7, 1.25],
      rim: 2.2,
      glow: 0.07,
      exposure: 1.2,
      pt: [CRADLE[0], CRADLE[1], CRADLE[2] + 0.05],
      ptCol: [1.8, 1.3, 0.8],
    },
    frame: { fill: 0.9 },
    arrays: { uA: A, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
const vec3 HEAD = ${f3(HEAD)};
const vec3 CRADLE = ${f3(CRADLE)};

float hand(vec3 p, vec3 c, vec3 dir, vec3 up) {
  vec3 s = normalize(cross(dir, up));
  float d = sdEllipsoid(p - c, vec3(0.045, 0.05, 0.035));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.021;
    vec3 a = c + s * o + dir * 0.03;
    vec3 m = a + dir * (0.1 - abs(o) * 0.8);
    vec3 e = m + normalize(dir + up * 0.9) * 0.08;
    d = smin(d, sdRoundCone(p, a, m, 0.011, 0.008), 0.01);
    d = smin(d, sdRoundCone(p, m, e, 0.008, 0.004), 0.006);
  }
  return d;
}

vec2 sdf(vec3 p) {
  // 법의: 위는 좁고 아래로 퍼지며, 밑단은 연기처럼 찢겨 사라진다 (발이 없다)
  vec3 b = p - vec3(0.0, 0.2, 0.0);
  b.z -= 0.08 * max(b.y - 1.2, 0.0);
  float robe = sdRobe(b, 1.95, 0.2, 0.62, 13.0, 0.05);
  float ang = atan(b.z, b.x);
  float hem = 0.35 * fbm3(vec3(cos(ang) * 3.0, sin(ang) * 3.0, 1.0)) + 0.25 * pow(abs(sin(ang * 5.0 + 1.0)), 4.0);
  robe = max(robe, -(b.y - hem));
  // 겹친 겉옷: 앞이 갈라져 속옷이 보인다
  float over = sdRobe(b - vec3(0.0, 0.5, 0.0), 1.45, 0.24, 0.66, 9.0, 0.04);
  over = max(over, -(b.y - 0.5 - 0.15 * fbm3(b * 4.0)));
  over = max(over, -sdBox(b - vec3(0.0, 0.9, 0.7), vec3(0.08 + 0.12 * (1.0 - b.y / 2.0), 1.0, 0.4)));
  robe = min(robe, over);
  float torso = sdEllipsoid(p - vec3(0.0, 2.0, 0.0), vec3(0.24, 0.24, 0.18));
  robe = smin(robe, torso, 0.1);
  // 높은 깃: 목을 감싼다
  float collar = abs(sdCappedCone(p - vec3(0.0, 2.2, 0.03), 0.12, 0.2, 0.13)) - 0.012;
  collar = max(collar, -(p.z - 0.03 - 0.1 * (p.y - 2.1)));
  robe = min(robe, collar);
  // 소매: 넓게 늘어졌다
  vec3 elL = vec3(-0.36, 1.68, 0.3);
  vec3 elR = vec3(0.36, 1.68, 0.3);
  vec3 hL = CRADLE + vec3(-0.17, -0.05, 0.0);
  vec3 hR = CRADLE + vec3(0.17, -0.05, 0.0);
  float sl = min(sdRoundCone(p, vec3(-0.22, 2.05, 0.0), elL, 0.09, 0.1), sdRoundCone(p, elL, hL + vec3(-0.05, 0.02, -0.08), 0.1, 0.13));
  sl = min(sl, min(sdRoundCone(p, vec3(0.22, 2.05, 0.0), elR, 0.09, 0.1), sdRoundCone(p, elR, hR + vec3(0.05, 0.02, -0.08), 0.1, 0.13)));
  sl = max(sl, -min(sdSphere(p - hL - vec3(-0.04, 0.0, -0.04), 0.09), sdSphere(p - hR - vec3(0.04, 0.0, -0.04), 0.09)));
  robe = smin(robe, sl, 0.05);
  if (robe < 0.04) robe += 0.004 * (fbm3(p * 24.0) - 0.5);
  vec2 r = vec2(robe, 1.0);
  // 머리: 길쭉한 민머리, 들린 턱, 노래하는 입
  vec3 hq = p - HEAD;
  hq.yz = rot(-0.18) * hq.yz;
  float skull = sdEllipsoid(hq - vec3(0.0, 0.08, -0.02), vec3(0.13, 0.2, 0.15));
  skull = smin(skull, sdEllipsoid(hq - vec3(0.0, -0.1, 0.04), vec3(0.1, 0.12, 0.11)), 0.06);
  float jaw = sdEllipsoid(hq - vec3(0.0, -0.22, 0.06), vec3(0.075, 0.08, 0.08));
  skull = smin(skull, jaw, 0.05);
  // 벌린 입
  float mouth = sdEllipsoid(hq - vec3(0.0, -0.17, 0.13), vec3(0.04, 0.065, 0.05));
  skull = max(skull, -mouth);
  skull = smin(skull, sdCapsule(p, vec3(0.0, 2.12, 0.02), HEAD + vec3(0.0, -0.12, 0.0), 0.06), 0.06);
  r = umin(r, vec2(skull, 2.0));
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.17, 0.1), vec3(0.035, 0.06, 0.04)), 99.0));
  // 눈가리개 띠
  float band = abs(sdEllipsoid(hq - vec3(0.0, 0.0, 0.0), vec3(0.145, 0.205, 0.165))) - 0.012;
  band = max(band, abs(hq.y - 0.02 + 0.05 * hq.z) - 0.04);
  r = umin(r, vec2(band, 3.0));
  // 초승달 관: 머리 뒤의 가는 고리 (아래가 열린 초승달)
  vec3 cq = p - (HEAD + vec3(0.0, 0.12, -0.32));
  float cres = length(vec2(length(cq.xy) - 0.62, cq.z)) - 0.022;
  cres = max(cres, -cq.y - 0.32);
  // 관의 가는 살 (요람의 모빌처럼)
  float spoke = 1e5;
  for (int i = 0; i < 5; i++) {
    float a = 0.35 + float(i) * 0.6;
    vec2 dir = vec2(cos(a), sin(a));
    spoke = min(spoke, sdCapsule(cq, vec3(0.0), vec3(dir * 0.6, 0.0), 0.006));
  }
  float threads = 1e5;
  float charms = 1e5;
  for (int i = 0; i < 12; i += 2) {
    if (i >= uAN) break;
    vec3 t0 = uA[i].xyz;
    vec4 t1 = uA[i + 1];
    threads = min(threads, sdCapsule(p, t0, t1.xyz, 0.003));
    // 별 모양 장식 (다섯 갈래)
    vec3 sq = p - t1.xyz - vec3(0.0, -t1.w, 0.0);
    float st = length(sq) - t1.w * 0.45;
    float a5 = atan(sq.y, sq.x);
    float rr = length(sq.xy);
    float star5 = max(rr - t1.w * (0.55 + 0.45 * pow(abs(cos(a5 * 2.5)), 6.0)), abs(sq.z) - 0.008);
    charms = min(charms, min(st, star5));
  }
  r = umin(r, vec2(min(min(cres, spoke * 1.0), threads), 4.0));
  r = umin(r, vec2(charms, 5.0));
  // 손과 요람 등롱
  float hands = min(hand(p, hL, normalize(vec3(0.6, 0.1, 0.5)), vec3(0.0, 1.0, 0.0)), hand(p, hR, normalize(vec3(-0.6, 0.1, 0.5)), vec3(0.0, 1.0, 0.0)));
  r = umin(r, vec2(hands, 2.0));
  vec3 lq = p - CRADLE;
  // 요람: 엮은 바구니 (속이 빈 반구) + 위로 둥글게 덮은 가는 살
  float basket = abs(sdEllipsoid(lq, vec3(0.16, 0.11, 0.12))) - 0.008;
  basket = max(basket, lq.y - 0.02);
  basket -= 0.004 * sin(atan(lq.z, lq.x) * 24.0) * sin(lq.y * 80.0);
  float bars = 1e5;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 0.785;
    vec3 bq = lq - vec3(0.0, 0.02, 0.0);
    bq.xz = rot(a) * bq.xz;
    bars = min(bars, max(length(vec2(length(bq.xy) - 0.15, bq.z)) - 0.005, -bq.y));
  }
  basket = min(basket, bars);
  float hoop = sdTorus(lq - vec3(0.0, 0.02, 0.0), vec2(0.16, 0.01));
  float arc = max(sdTorus(vec3(lq.x, lq.z, lq.y - 0.02), vec2(0.16, 0.008)), -lq.y + 0.02);
  r = umin(r, vec2(min(min(basket, hoop), arc), 6.0));
  r = umin(r, vec2(length(lq + vec3(0.0, 0.03, 0.0)) - 0.055, 7.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  if (id < 1.5) {
    // 쪽빛 법의: 은빛 별자리 자수, 밑단으로 갈수록 연기처럼 옅어진다
    vec3 q = p * 3.0;
    vec2 g = fract(q.xy + q.z * 0.3) - 0.5;
    float stitch = smoothstep(0.03, 0.0, abs(g.x + g.y * 0.6)) * step(0.7, hash31(floor(q + 0.5)));
    float dot = smoothstep(0.06, 0.02, length(g)) * step(0.6, hash31(floor(q) + 3.0));
    float weave = 0.85 + 0.15 * noise(p * 120.0);
    vec3 alb = vec3(0.025, 0.022, 0.05) * (0.6 + 0.7 * fbm3(p * 4.0)) * weave;
    vec3 emi = vec3(0.7, 0.6, 1.0) * (stitch * 0.15 + dot * 0.5) * smoothstep(0.3, 1.0, p.y);
    float smoke = smoothstep(0.7, 0.2, p.y);
    emi += vec3(0.45, 0.3, 0.8) * smoke * 0.08 * fbm3(p * 6.0);
    return Mat(alb, 0.75, 0.25, emi, 0.15, 0.0, 0.1);
  }
  if (id < 2.5) {
    // 잿빛 피부: 오래 햇빛을 보지 못한 살, 푸른 핏줄
    float vein = smoothstep(0.08, 0.0, ridge(p * 14.0)) * 0.5;
    vec3 alb = mix(vec3(0.15, 0.14, 0.16), vec3(0.06, 0.06, 0.1), vein);
    return Mat(alb, 0.5, 0.35, vec3(0.0), 0.0, 0.6, 0.15);
  }
  if (id < 3.5) {
    // 눈가리개: 검은 비단에 금실 별
    float st = smoothstep(0.88, 0.95, noise(p * 60.0));
    return Mat(vec3(0.02, 0.018, 0.03), 0.35, 0.6, vec3(1.0, 0.8, 0.45) * st * 1.4, 0.0, 0.0, 0.2);
  }
  if (id < 4.5) return Mat(vec3(0.12, 0.1, 0.07), 0.3, 1.2, vec3(0.5, 0.4, 0.8) * 0.06, 0.2, 0.0, 0.5);
  if (id < 5.5) return Mat(vec3(0.1, 0.09, 0.06), 0.3, 1.0, vec3(1.0, 0.85, 0.55) * 0.9, 0.0, 0.0, 0.3);
  if (id < 6.5) return Mat(vec3(0.08, 0.065, 0.04), 0.35, 1.0, vec3(0.0), 0.0, 0.0, 0.4);
  return Mat(vec3(0.0), 1.0, 0.0, vec3(2.4, 1.9, 1.1), 0.0, 0.0, 0.0);
}
`,
  };
}
