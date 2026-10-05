// 재를 토하는 성가대원 (2층) — 재가 쌓인 성가대석에서 아직도 저녁 기도를 부르는 아이들. 입을 벌릴 때마다 잿가루가 쏟아진다.
// 깡마르고 길쭉한 아이가 발끝을 땅에서 조금 띄운 채 떠 있다. 검은 수단 위에 재에 전 흰 중백의, 목엔 주름 깃.
// 고개를 젖혀 턱이 빠질 듯 입을 벌렸고, 그 입에서 잿가루가 폭포처럼 쏟아져 펼친 성가책을 넘고 발밑에 쌓인다. 눈은 텅 빈 검은 구멍.
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const YAW = 0.3;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];

export default function chorister() {
  const head = [0.0, 1.38, 0.05];
  const mouth = [0.0, 1.31, 0.13];
  return {
    preset: 'act2',
    cam: { pos: [0.3, 0.85, 4.0], target: [0.0, 0.78, 0.0], fov: 1.85 },
    light: {
      key: [-0.45, 0.65, -0.7],
      rim: 1.3,
      fillCol: [0.15, 0.1, 0.05],
      pt: toWorld([0.25, 0.75, 0.6]),
      ptCol: [0.75, 0.48, 0.2],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 160
#define VOLUME_FAR 10.0
#define HAS_BG

const float YAW = ${YAW.toFixed(4)};
const vec3 HEAD = ${v3(head)};
const vec3 MOUTH = ${v3(mouth)};
const vec3 BOOK = vec3(0.0, 0.98, 0.22);
const float LIFT = 0.07;

float sdHand(vec3 p, vec3 w, vec3 f, vec3 u, float s, vec4 c, float sp, float th, float tc) {
  float bd = length(p - w);
  if (bd > 0.3 * s) return bd - 0.2 * s;
  f = normalize(f);
  u = normalize(u - f * dot(u, f));
  vec3 sd = cross(f, u) * th;
  vec3 pc = w + f * 0.045 * s;
  vec3 q = p - pc;
  vec3 lq = vec3(dot(q, sd), dot(q, u), dot(q, f));
  float d = sdEllipsoid(lq, vec3(0.036, 0.012, 0.046) * s);
  d = smin(d, sdRoundCone(p, w - f * 0.07 * s, pc, 0.018 * s, 0.022 * s), 0.02 * s);
  for (int i = 0; i < 4; i++) {
    float fi = float(i) - 1.5;
    float cu = i == 0 ? c.x : i == 1 ? c.y : i == 2 ? c.z : c.w;
    vec3 a = pc + f * 0.04 * s - sd * fi * 0.017 * s + u * 0.002 * s;
    vec3 dd = normalize(f - sd * fi * sp);
    float len = (0.052 - abs(fi + 0.4) * 0.007) * s;
    float r = 0.0082 * s;
    for (int k = 0; k < 3; k++) {
      vec3 b = a + dd * len;
      d = smin(d, sdRoundCone(p, a, b, r, r * 0.8), 0.003 * s);
      d = min(d, sdSphere(p - a, r * 1.13));
      a = b;
      r *= 0.84;
      len *= 0.8;
      dd = normalize(dd - u * cu * 0.8);
    }
  }
  vec3 ta = pc - f * 0.02 * s + sd * 0.03 * s - u * 0.006 * s;
  vec3 tb = ta + normalize(f * 0.6 + sd * 0.7 - u * 0.3) * 0.038 * s;
  vec3 tc3 = tb + normalize(f * 0.9 - sd * tc * 0.6 - u * tc * 0.5) * 0.03 * s;
  d = smin(d, sdRoundCone(p, ta, tb, 0.0105 * s, 0.0085 * s), 0.008 * s);
  d = smin(d, sdRoundCone(p, tb, tc3, 0.0085 * s, 0.0065 * s), 0.004 * s);
  return d;
}

vec3 headSpace(vec3 p) {
  vec3 q = p - HEAD;
  q.yz = rot(-0.22) * q.yz;
  q.xy = rot(0.12) * q.xy;
  return q;
}
vec3 bookSpace(vec3 p) {
  vec3 q = p - BOOK;
  q.yz = rot(0.95) * q.yz;
  return q;
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  float bound = sdBox(p - vec3(0.0, 0.8, 0.05), vec3(0.6, 0.85, 0.55));
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 검은 수단: 발끝을 가리고 땅에서 조금 떠 있다
  float y = clamp((p.y - LIFT) / 1.1, 0.0, 1.0);
  float ang = atan(p.z, p.x);
  float rr = mix(0.2, 0.11, pow(y, 0.6)) + 0.02 * (1.0 - y) * sin(ang * 9.0 + y * 3.0);
  float cassock = (length(p.xz * vec2(1.0, 1.2)) - rr) * 0.7;
  float hem = LIFT + 0.04 * fbm3(vec3(p.x * 12.0, 0.0, p.z * 12.0)) + 0.06 * pow(noise(vec3(ang * 8.0, 1.0, 0.0)), 2.0);
  cassock = max(cassock, max(hem - p.y, p.y - 1.16));
  float torso = sdEllipsoid(p - vec3(0.0, 1.08, 0.0), vec3(0.125, 0.16, 0.09));
  cassock = smin(cassock, torso, 0.08);
  // ── 흰 중백의: 넓은 종 모양, 무릎께까지, 해진 레이스 단
  float sy2 = clamp((p.y - 0.45) / 0.7, 0.0, 1.0);
  float sr = mix(0.26, 0.135, pow(sy2, 0.55)) + 0.02 * (1.0 - sy2) * sin(ang * 12.0 + sy2 * 4.0 + sin(ang * 3.0));
  float surplice = (length(p.xz * vec2(1.0, 1.15)) - sr) * 0.7;
  float shem = 0.47 + 0.03 * sin(ang * 26.0) + 0.04 * fbm3(p * 12.0);
  surplice = max(surplice, max(shem - p.y, p.y - 1.18));
  surplice = smin(surplice, torso + 0.012, 0.06);
  // 넓은 소매: 팔꿈치에서 늘어졌다
  vec3 shL = vec3(-0.12, 1.13, 0.0);
  vec3 elL = vec3(-0.17, 0.95, 0.1);
  vec3 shR = vec3(0.12, 1.13, 0.0);
  vec3 elR = vec3(0.17, 0.95, 0.1);
  float sleeves = min(sdRoundCone(p, shL, elL, 0.042, 0.045), sdRoundCone(p, shR, elR, 0.042, 0.045));
  sleeves = smin(sleeves, sdRoundCone(p, elL, elL + vec3(-0.01, -0.15, 0.04), 0.052, 0.022), 0.035);
  sleeves = smin(sleeves, sdRoundCone(p, elR, elR + vec3(0.01, -0.15, 0.04), 0.052, 0.022), 0.035);
  surplice = smin(surplice, sleeves, 0.04);
  surplice += 0.003 * (fbm3(p * 30.0) - 0.5);
  vec2 r = vec2(cassock, 1.0);
  r = umin(r, vec2(surplice, 2.0));
  // 주름 깃 (러프)
  vec3 cq = p - vec3(0.0, 1.21, 0.015);
  float ca = atan(cq.z, cq.x);
  float ruff = length(vec2(length(cq.xz) - 0.085 - 0.012 * sin(ca * 22.0), cq.y * 1.3)) - 0.03;
  r = umin(r, vec2(ruff, 2.0));
  // ── 목·머리: 젖혀졌고, 아래턱이 빠질 듯 벌어졌다
  float neck = sdRoundCone(p, vec3(0.0, 1.2, 0.0), HEAD + vec3(0.0, -0.05, -0.035), 0.036, 0.032);
  vec3 hq = headSpace(p);
  float cran = sdEllipsoid(hq - vec3(0.0, 0.02, -0.01), vec3(0.07, 0.085, 0.083));
  vec3 qa = vec3(abs(hq.x), hq.y, hq.z);
  cran = smin(cran, sdEllipsoid(qa - vec3(0.045, -0.012, 0.05), vec3(0.02, 0.015, 0.022)), 0.02);
  cran = smax(cran, -sdEllipsoid(qa - vec3(0.027, 0.012, 0.072), vec3(0.02, 0.015, 0.018)), 0.01);
  cran = smin(cran, sdRoundCone(hq, vec3(0.0, 0.01, 0.08), vec3(0.0, -0.02, 0.094), 0.007, 0.009), 0.01);
  cran = max(cran, -(hq.y + 0.035 - hq.z * 0.1));
  vec3 jq = hq - vec3(0.0, -0.025, -0.02);
  jq.yz = rot(-0.8) * jq.yz;
  float jaw = sdEllipsoid(jq - vec3(0.0, -0.03, 0.052), vec3(0.05, 0.026, 0.056));
  jaw = max(jaw, -sdEllipsoid(jq - vec3(0.0, -0.008, 0.06), vec3(0.038, 0.024, 0.05)));
  float head = smin(smin(cran, jaw, 0.022), neck, 0.03);
  // 머리카락: 짧게 깎은 검은 머리
  float hair = sdEllipsoid(hq - vec3(0.0, 0.035, -0.02), vec3(0.074, 0.08, 0.082));
  hair = max(hair, -(hq.z - 0.03 + hq.y * 0.4));
  hair = max(hair, -(hq.y - 0.0));
  head += 0.0015 * (fbm3(p * 70.0) - 0.5);
  r = umin(r, vec2(head, 3.0));
  r = umin(r, vec2(hair + 0.002 * (fbm3(p * 90.0) - 0.5), 1.0));
  // 텅 빈 눈과 입 속: 어둠
  r = umin(r, vec2(sdSphere(qa - vec3(0.027, 0.012, 0.062), 0.014), 99.0));
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.055, 0.04), vec3(0.034, 0.04, 0.045)), 99.0));
  // ── 펼친 성가책 + 두 손
  vec3 bq = bookSpace(p);
  float cover = sdRoundBox(bq - vec3(0.0, -0.01, 0.0), vec3(0.13, 0.005, 0.09), 0.003);
  vec3 pq = vec3(abs(bq.x), bq.y, bq.z);
  float pages = sdRoundBox(pq - vec3(0.062, 0.002 + 0.008 * sin(clamp(pq.x / 0.12, 0.0, 1.0) * 3.14), 0.0), vec3(0.058, 0.009, 0.084), 0.004);
  r = umin(r, vec2(cover, 4.0));
  r = umin(r, vec2(pages, 5.0));
  float hL = sdHand(p, BOOK + vec3(-0.12, -0.04, -0.06), vec3(0.3, 0.2, 1.0), vec3(-0.3, -1.0, 0.2), 0.95, vec4(0.6, 0.65, 0.7, 0.75), 0.06, 1.0, 0.5);
  float hR = sdHand(p, BOOK + vec3(0.12, -0.04, -0.06), vec3(-0.3, 0.2, 1.0), vec3(0.3, -1.0, 0.2), 0.95, vec4(0.6, 0.65, 0.7, 0.75), 0.06, -1.0, 0.5);
  float fore = min(sdRoundCone(p, elL + vec3(0.0, -0.02, 0.03), BOOK + vec3(-0.12, -0.04, -0.07), 0.026, 0.02), sdRoundCone(p, elR + vec3(0.0, -0.02, 0.03), BOOK + vec3(0.12, -0.04, -0.07), 0.026, 0.02));
  r = umin(r, vec2(min(min(hL, hR), fore), 3.0));
  // ── 발밑에 쌓인 잿더미
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  float ash = smoothstep(0.25, 0.85, n.y + 0.4 * (fbm3(lp * 9.0) - 0.5));
  // 입에서 흘러내린 재가 앞섶에 묻었다
  float spill = smoothstep(0.12, 0.0, abs(lp.x + 0.02 * sin(lp.y * 20.0))) * step(0.0, lp.z) * smoothstep(0.7, 1.25, lp.y);
  if (id < 1.5) {
    vec3 alb = vec3(0.02, 0.018, 0.018) * (0.6 + 0.8 * fbm3(lp * 6.0));
    alb = mix(alb, vec3(0.1, 0.098, 0.095), max(ash * 0.6, spill * 0.5));
    return Mat(alb, 0.85, 0.1, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    // 재에 전 흰 중백의, 단에는 레이스 구멍 무늬
    vec3 alb = vec3(0.13, 0.127, 0.122) * (0.7 + 0.4 * fbm3(lp * 8.0));
    float lace = smoothstep(0.3, 0.6, sin(atan(lp.z, lp.x) * 60.0) * sin(lp.y * 140.0)) * smoothstep(0.58, 0.5, lp.y);
    alb *= 1.0 - lace * 0.5;
    float grime = smoothstep(0.4, 0.8, fbm3(lp * 5.0)) + smoothstep(0.65, 0.45, lp.y) * 0.4;
    alb = mix(alb, vec3(0.08, 0.077, 0.072), clamp(grime, 0.0, 1.0) * 0.6);
    alb = mix(alb, vec3(0.12, 0.118, 0.115), spill * 0.7);
    return Mat(alb, 0.9, 0.08, vec3(0.0), 0.0, 0.45, 0.0);
  }
  if (id < 3.5) {
    vec3 alb = vec3(0.14, 0.13, 0.125) * (0.75 + 0.35 * fbm3(lp * 22.0));
    alb = mix(alb, vec3(0.1, 0.098, 0.095), ash * 0.4);
    return Mat(alb, 0.6, 0.3, vec3(0.0), 0.0, 0.55, 0.08);
  }
  if (id < 4.5) return Mat(vec3(0.035, 0.012, 0.01), 0.6, 0.35, vec3(0.0), 0.0, 0.0, 0.0);
  if (id < 5.5) {
    vec3 bq = bookSpace(lp);
    float line = smoothstep(0.3, 0.1, abs(fract(bq.z * 80.0) - 0.5)) * step(0.012, abs(bq.x)) * step(abs(bq.x), 0.11);
    float note = step(0.6, noise(vec3(bq.x * 120.0, floor(bq.z * 80.0) * 3.0, 0.0)));
    vec3 alb = mix(vec3(0.19, 0.17, 0.13), vec3(0.04, 0.03, 0.025), line * note * 0.8);
    alb = mix(alb, vec3(0.13, 0.128, 0.125), smoothstep(0.4, 0.75, fbm3(lp * 18.0)));
    return Mat(alb, 0.85, 0.1, vec3(0.0), 0.0, 0.35, 0.0);
  }
  // 잿더미
  vec3 alb = vec3(0.11, 0.105, 0.1) * (0.75 + 0.4 * fbm3(lp * 30.0));
  float ember = smoothstep(0.8, 0.9, noise(lp * 50.0)) * 0.6;
  return Mat(alb, 1.0, 0.02, vec3(1.0, 0.35, 0.08) * ember * 0.4, 0.0, 0.0, 0.0);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 L1 = normalize(uKeyDir);
  vec3 bg = mix(vec3(0.0), uFogCol * 0.5, smoothstep(-0.3, 0.6, rd.y)) * 0.6;
  bg += uFogCol * 0.9 * pow(max(dot(rd, normalize(vec3(-L1.x, L1.y * 0.25, -L1.z))), 0.0), 5.0);
  return bg;
}

// 입에서 쏟아지는 잿가루: 앞으로 뿜어져 나와 아래로 떨어지며 퍼진다
vec4 volume(vec3 p) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  float h = MOUTH.y - q.y;
  if (h < -0.06 || h > 1.45 || abs(q.x) > 0.6 || q.z < -0.3 || q.z > 0.8) return vec4(0.0);
  float s = max(h, 0.0);
  // 포물선: 앞으로 조금 나간 뒤 떨어진다
  vec2 c = vec2(MOUTH.x + 0.015 * sin(s * 6.0), MOUTH.z + 0.03 + 0.12 * sqrt(s) - 0.06 * s);
  float rad = 0.024 + 0.05 * s + 0.06 * s * s;
  vec3 w = q * vec3(9.0, 4.0, 9.0) + vec3(0.0, uSeed, 0.0);
  vec3 warp = vec3(fbm3(w), 0.0, fbm3(w + 4.0)) - 0.5;
  vec2 dq = q.xz + warp.xz * (0.02 + 0.12 * s) - c;
  float dc = length(dq) / rad;
  float stream = smoothstep(1.0, 0.2, dc) * smoothstep(-0.06, 0.02, h) * smoothstep(1.2, 0.5, s);
  float grain = smoothstep(0.35, 0.75, fbm3(q * 26.0 + vec3(0.0, q.y * 8.0, 0.0)));
  // 바닥 근처에서 피어오른 먼지
  float dust = smoothstep(0.25, 0.0, q.y) * smoothstep(0.4, 0.1, length(q.xz - vec2(0.02, 0.15))) * smoothstep(0.5, 0.75, fbm3(q * 5.0));
  float dens = stream * (0.35 + grain) * 22.0 + dust * 2.0;
  if (dens < 0.001) return vec4(0.0);
  vec3 col = vec3(0.13, 0.125, 0.12) * (0.6 + 0.6 * grain);
  if (uScene == 0) col *= 1.3;
  return vec4(col, dens);
}
`,
  };
}
