// 고해 신부 (2층) — 모든 죄를 들어주고, 모든 죄를 기록하는 키 크고 마른 신부.
// 고개를 옆으로 기울여 귀를 기울인다. 얼굴 앞에는 고해소의 나무 격자가 덧대어졌고, 격자 틈으로 창백한 금빛이 샌다.
// 한 팔엔 사슬로 허리에 묶인 두꺼운 장부를 펼쳐 들었고, 다른 손은 깃펜으로 무언가를 적는다. 허리엔 참회의 매.
const YAW = 0.38;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

export default function confessor() {
  const head = [0.05, 1.76, 0.43];
  const face = [head[0] + 0.0, head[1] - 0.02, head[2] + 0.06];
  return {
    preset: 'act2',
    cam: { pos: [-0.35, 0.75, 6.3], target: [0.0, 1.08, 0.0], fov: 1.8 },
    light: {
      key: [-0.35, 0.62, -0.8],
      rim: 1.3,
      fillCol: [0.2, 0.13, 0.06],
      pt: toWorld([face[0], face[1] - 0.06, face[2] + 0.1]),
      ptCol: [1.25, 1.0, 0.55],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    arrays: {
      uL: [[...toWorld([face[0], face[1], face[2] + 0.06]), 0.075]],
      uLC: [[1.0, 0.82, 0.45, 0.32]],
    },
    glsl: /* glsl */ `
const float YAW = ${YAW};
const vec3 HEAD = ${v3(head)};
const vec3 BOOK = vec3(-0.06, 1.12, 0.42);
const float BOOK_TILT = 0.75;
const vec3 QHAND = vec3(0.1, 1.24, 0.5);

float bendZ(float y) { float h = max(y - 0.8, 0.0); return 0.5 * h * h; }

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

/** 머리 지역 좌표: 숙이고(BOW) 옆으로 기울였다(ROLL) */
vec3 headSpace(vec3 p) {
  vec3 q = p - HEAD;
  q.xy = rot(-0.5) * q.xy;
  q.yz = rot(0.3) * q.yz;
  return q;
}
/** 책 지역 좌표: y = 책장 법선 */
vec3 bookSpace(vec3 p) {
  vec3 q = p - BOOK;
  q.xz = rot(-0.15) * q.xz;
  q.yz = rot(BOOK_TILT) * q.yz;
  return q;
}
/** 마름모 격자 구멍 */
float lattice(vec3 q) {
  vec2 g = rot(0.785) * q.xy;
  float per = 0.03;
  vec2 c = mod(g + per * 0.5, per) - per * 0.5;
  float hole = max(abs(c.x), abs(c.y)) - per * 0.34;
  float inside = max(abs(q.x) - 0.068, abs(q.y + 0.005) - 0.09);
  return max(hole, inside);
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  vec3 b = p;
  b.z -= bendZ(b.y);

  // ── 수단: 몸에 붙는 긴 검은 옷, 밑단만 살짝 퍼진다
  float y = clamp(b.y / 1.6, 0.0, 1.0);
  float ang = atan(b.z, b.x);
  float rr = mix(0.31, 0.15, pow(y, 0.42)) + 0.05 * smoothstep(0.14, 0.0, b.y);
  rr += 0.03 * (1.0 - y) * (sin(ang * 8.0 + y * 4.0 + 0.6 * sin(ang * 3.0)) * 0.6 + sin(ang * 19.0) * 0.25);
  float robe = (length(b.xz * vec2(1.0, 1.25)) - rr) * 0.7;
  robe = max(robe, b.y - 1.6);
  robe = max(robe, 0.01 + 0.04 * fbm3(vec3(b.x * 9.0, 0.0, b.z * 9.0)) - b.y);
  float torso = sdEllipsoid(b - vec3(0.0, 1.47, 0.0), vec3(0.18, 0.22, 0.13));
  torso = smin(torso, sdEllipsoid(b - vec3(0.0, 1.5, -0.08), vec3(0.17, 0.17, 0.12)), 0.08);
  float body = smin(robe, torso, 0.1);
  // 바닥까지 끌리는 검은 망토: 등과 옆을 덮고 앞은 열렸다
  float cyy = clamp(b.y / 1.62, 0.0, 1.0);
  float cr = mix(0.44, 0.215, pow(cyy, 0.6)) + 0.025 * (1.0 - cyy) * sin(atan(b.z, b.x) * 7.0 + cyy * 3.0);
  float cape = abs((length(b.xz * vec2(1.0, 1.2)) - cr) * 0.7) - 0.012;
  cape = max(cape, b.z - 0.02 - 0.12 * cyy);
  cape = max(cape, max(b.y - 1.64, 0.005 + 0.05 * fbm3(b * vec3(9.0, 0.0, 9.0)) - b.y));
  body = min(body, cape);
  // 짧은 어깨 망토
  vec3 mq = b - vec3(0.0, 1.66, 0.0);
  float mr = 0.1 + 0.16 * smoothstep(0.05, -0.28, mq.y);
  float mantle = (length(mq.xz * vec2(1.0, 1.3)) - mr) * 0.7;
  mantle = max(mantle, max(-0.28 - 0.02 * sin(atan(mq.z, mq.x) * 9.0) - mq.y, mq.y - 0.04));
  body = smin(body, mantle, 0.02);
  // 목
  body = smin(body, sdRoundCone(p, vec3(0.0, 1.66, bendZ(1.66) - 0.02), HEAD + vec3(0.0, -0.1, -0.06), 0.065, 0.05), 0.04);

  // ── 소매 (몸에 붙는 좁은 소매)
  vec3 shL = vec3(-0.17, 1.6, bendZ(1.6) - 0.02);
  vec3 elL = vec3(-0.3, 1.24, 0.2);
  vec3 wrL = vec3(-0.13, 1.05, 0.42);
  vec3 shR = vec3(0.17, 1.6, bendZ(1.6) - 0.02);
  vec3 elR = vec3(0.3, 1.28, 0.24);
  vec3 wrR = QHAND + vec3(0.02, -0.02, -0.07);
  float arms = min(sdRoundCone(p, shL, elL, 0.07, 0.066), sdRoundCone(p, elL, wrL, 0.066, 0.088));
  arms = min(arms, min(sdRoundCone(p, shR, elR, 0.07, 0.066), sdRoundCone(p, elR, wrR, 0.066, 0.085)));
  // 소맷자락이 아래로 처진다
  arms = smin(arms, sdRoundCone(p, mix(elL, wrL, 0.6), mix(elL, wrL, 0.75) + vec3(0.0, -0.14, -0.02), 0.07, 0.03), 0.06);
  arms = smin(arms, sdRoundCone(p, mix(elR, wrR, 0.6), mix(elR, wrR, 0.75) + vec3(0.0, -0.13, -0.02), 0.068, 0.03), 0.06);
  arms = max(arms, -sdSphere(p - wrL - normalize(wrL - elL) * 0.03, 0.06));
  arms = max(arms, -sdSphere(p - wrR - normalize(wrR - elR) * 0.03, 0.058));
  // 고해용 영대: 목에서 무릎까지 늘어진 검보라 띠 두 줄
  float stole = abs(body - 0.007) - 0.0045;
  stole = max(stole, abs(abs(b.x) - 0.062) - 0.026);
  stole = max(stole, max(0.66 - b.y, b.y - 1.62));
  stole = max(stole, -b.z);
  body = smin(body, arms, 0.04);
  body += 0.003 * (fbm3(p * 28.0) - 0.5);
  vec2 r = vec2(body, 1.0);
  r = umin(r, vec2(stole, 12.0));
  // 영대 끝의 술
  float fr = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -0.062 : 0.062;
    vec3 fq = b - vec3(sx, 0.62, 0.0);
    fq.z -= mix(0.31, 0.15, pow(0.66 / 1.6, 0.42)) / 1.25 + 0.012;
    fq.x = mod(fq.x + 0.006, 0.012) - 0.006;
    fr = min(fr, max(sdCapsule(fq, vec3(0.0, 0.04, 0.0), vec3(0.0, -0.02, 0.0), 0.0028), abs(b.x - sx) - 0.026));
  }
  r = umin(r, vec2(fr, 12.0));
  // 허리띠와 망토에 매달린 죄의 쪽지들
  float slips = 1e5;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float h1 = hash11(fi * 7.31 + 1.0);
    float h2 = hash11(fi * 3.17 + 5.0);
    float th = i < 9 ? mix(0.45, 2.7, fi / 8.0) + (h2 - 0.5) * 0.15 : mix(2.75, 3.5, (fi - 9.0) / 4.0);
    float yy = i < 9 ? 1.03 - h1 * 0.04 : 0.45 + (fi - 9.0) * 0.18 + h1 * 0.08;
    float rad = i < 9 ? 0.2 : mix(0.44, 0.215, pow(clamp(yy / 1.62, 0.0, 1.0), 0.6)) + 0.014;
    vec3 c = vec3(cos(th) * rad, yy, sin(th) * rad / (i < 9 ? 1.25 : 1.2));
    vec3 q = b - c;
    q.xz = rot(th - 1.5708) * q.xz;
    q.xy = rot((h2 - 0.5) * 0.5) * q.xy;
    slips = min(slips, sdBox(q - vec3(0.0, -0.045, 0.0), vec3(0.022 + 0.008 * h2, 0.045 + 0.02 * h1, 0.0012)));
  }
  r = umin(r, vec2(slips, 13.0));

  // 단추: 앞섶을 따라 촘촘히
  float btn = 1e5;
  for (int i = 0; i < 16; i++) {
    float by = 0.32 + float(i) * 0.075;
    float bz = 0.0;
    vec3 c = vec3(0.0, by, 0.0);
    c.z = bendZ(by) + mix(0.31, 0.15, pow(clamp(by / 1.6, 0.0, 1.0), 0.42)) / 1.25 + 0.004;
    if (by > 1.3) c.z = bendZ(by) + 0.128;
    btn = min(btn, sdSphere(p - c, 0.0085));
  }
  r = umin(r, vec2(btn, 4.0));

  // ── 머리: 정수리부터 덮어쓴 검은 휘장(고해소의 커튼). 주름진 채 가슴까지 늘어졌고, 얼굴 자리엔 나무 격자
  vec3 hq = headSpace(p);
  vec3 sq = p - HEAD;
  sq.xy = rot(-0.22) * sq.xy;
  float sy2 = sq.y - 0.02;
  float va = atan(sq.z, sq.x);
  float below = clamp(-sy2 / 0.42, 0.0, 1.0);
  float dome = sqrt(max(0.0, 0.13 * 0.13 - max(sy2, 0.0) * max(sy2, 0.0) * 0.9));
  dome += 0.008 * sin(va * 7.0 + sy2 * 20.0) * smoothstep(0.13, 0.0, abs(sy2 - 0.05)) + 0.006 * (fbm3(sq * 25.0) - 0.5);
  float vr = mix(dome, 0.23, pow(below, 1.1));
  vr += (0.014 * sin(va * 8.0 + 1.0 + sy2 * 6.0) + 0.007 * sin(va * 19.0 + 2.0)) * smoothstep(0.0, 0.3, below) ;
  float veil = (length(sq.xz * vec2(1.0, 1.05)) - vr) * 0.72;
  veil = max(veil, sy2 - 0.13);
  float vhem = -0.4 - 0.06 * fbm3(vec3(sq.x * 11.0, 0.0, sq.z * 11.0)) - 0.05 * pow(noise(vec3(va * 6.0, 3.0, 0.0)), 2.0);
  veil = max(veil, vhem - sq.y);
  veil = smin(veil, sdEllipsoid(hq - vec3(0.0, 0.01, -0.01), vec3(0.11, 0.135, 0.12)), 0.04);
  // 얼굴 자리를 판다
  vec3 fq = hq - vec3(0.0, -0.02, 0.12);
  veil = max(veil, -sdRoundBox(fq, vec3(0.07, 0.096, 0.09), 0.02));
  r = umin(r, vec2(veil, 11.0));
  // 격자 판 (살짝 휘었다)
  vec3 lq = hq - vec3(0.0, -0.02, 0.118);
  lq.z += lq.x * lq.x * 2.0;
  float panel = sdRoundBox(lq, vec3(0.078, 0.104, 0.007), 0.004);
  panel = max(panel, -max(lattice(lq), abs(lq.z) - 0.02));
  r = umin(r, vec2(panel, 3.0));
  // 격자 뒤: 빛나는 얼굴 (형체 없는 금빛)
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.02, 0.06), vec3(0.075, 0.1, 0.035)), 5.0));
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.02, 0.0), vec3(0.1, 0.13, 0.08)), 99.0));

  // ── 장부: 펼친 두꺼운 책
  vec3 bq = bookSpace(p);
  float cover = sdRoundBox(bq - vec3(0.0, -0.022, 0.0), vec3(0.235, 0.008, 0.162), 0.004);
  vec3 pq = vec3(abs(bq.x), bq.y, bq.z);
  float pages = sdRoundBox(pq - vec3(0.112, 0.0 + 0.016 * sin(clamp(pq.x / 0.225, 0.0, 1.0) * 3.1416), 0.0), vec3(0.108, 0.02, 0.152), 0.007);
  // 넘어가다 멈춘 책장 한 장
  vec3 lf = bq - vec3(0.0, 0.03, 0.0);
  lf.xy = rot(-1.1) * lf.xy;
  pages = min(pages, sdRoundBox(lf - vec3(0.0, 0.1, 0.0), vec3(0.0015, 0.1, 0.148), 0.001));
  r = umin(r, vec2(cover, 6.0));
  r = umin(r, vec2(pages, 7.0));
  // 책갈피 끈 몇 가닥이 늘어졌다
  float rib = sdCapsule(bq, vec3(0.01, 0.0, -0.15), vec3(0.03, -0.16, -0.3), 0.004);
  rib = min(rib, sdCapsule(bq, vec3(-0.02, 0.0, -0.15), vec3(-0.04, -0.13, -0.34), 0.004));
  r = umin(r, vec2(rib, 8.0));

  // ── 손: 책을 받친 손 + 깃펜을 쥔 손
  float hL = sdHand(p, wrL + vec3(0.02, 0.0, 0.02), vec3(0.55, 0.05, 0.6), vec3(0.0, -1.0, 0.15), 1.2, vec4(0.5, 0.6, 0.7, 0.8), 0.06, 1.0, 0.3);
  float hR = sdHand(p, QHAND, vec3(-0.15, -0.55, 0.6), vec3(0.3, 0.6, 0.5), 1.2, vec4(0.9, 1.2, 1.4, 1.5), 0.05, -1.0, 0.6);
  r = umin(r, vec2(min(hL, hR), 2.0));
  // 깃펜: 깃대 + 깃털
  vec3 qa = QHAND + vec3(-0.02, -0.07, 0.07);
  vec3 qb = QHAND + vec3(0.13, 0.26, 0.0);
  float quill = sdCapsule(p, qa, qb, 0.004);
  vec3 qd = normalize(qb - qa);
  vec3 qs = normalize(cross(qd, vec3(0.0, 0.0, 1.0)));
  float tt = dot(p - qa, qd) / length(qb - qa);
  float t = clamp(tt, 0.0, 1.0);
  vec3 axp = qa + (qb - qa) * t;
  float vane = abs(dot(p - axp, normalize(cross(qd, qs)))) - 0.0025;
  float w = 0.028 * smoothstep(0.3, 0.55, t) * (1.0 - smoothstep(0.85, 1.0, t)) * (0.85 + 0.15 * sin(t * 140.0));
  vane = max(vane, abs(dot(p - axp, qs) - w * 0.4) - w);
  vane = max(vane, max(-tt, tt - 1.0) * length(qb - qa));
  r = umin(r, vec2(min(quill, vane * 0.8), 9.0));

  // ── 허리띠, 장부를 묶은 사슬, 참회의 매
  vec3 wq = b - vec3(0.0, 1.06, 0.0);
  float belt = length(vec2(length(wq.xz * vec2(1.0, 1.25)) - 0.188, wq.y)) - 0.016;
  vec3 c0 = vec3(-0.15, 1.05, 0.13);
  vec3 c1 = vec3(-0.12, 0.86, 0.33);
  vec3 c2 = BOOK + vec3(-0.06, -0.08, -0.05);
  float chain = 1e5;
  for (int i = 0; i < 2; i++) {
    vec3 a = i == 0 ? c0 : c1;
    vec3 e = i == 0 ? c1 : c2;
    vec3 ba = e - a;
    float h = clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0);
    chain = min(chain, length(p - a - ba * h) - (0.0045 + 0.0025 * abs(sin(h * length(ba) * 230.0))));
  }
  float rod = sdCapsule(p, vec3(0.16, 1.05, 0.12), vec3(0.24, 0.42, 0.2), 0.009);
  rod = min(rod, sdCapsule(p, vec3(0.22, 0.55, 0.19), vec3(0.27, 0.38, 0.24), 0.005));
  rod = min(rod, sdCapsule(p, vec3(0.23, 0.5, 0.19), vec3(0.2, 0.34, 0.22), 0.005));
  r = umin(r, vec2(belt, 1.0));
  r = umin(r, vec2(min(chain, rod), 4.0));
  return r;
}

float ashDust(vec3 p, vec3 n) {
  return smoothstep(0.3, 0.9, n.y + 0.35 * (fbm3(p * 9.0) - 0.5));
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  float ash = ashDust(lp, n);
  if (id < 1.5) {
    // 검은 수단: 반들반들 닳은 모직
    float dirt = fbm3(lp * 5.0);
    float weave = 0.85 + 0.15 * noise(lp * 160.0);
    vec3 alb = vec3(0.02, 0.019, 0.022) * (0.6 + 0.8 * dirt) * weave;
    float low = smoothstep(0.28, 0.0, lp.y) * fbm3(lp * 14.0);
    alb = mix(alb, vec3(0.08, 0.075, 0.07), max(ash * 0.6, low * 0.6));
    return Mat(alb, 0.7, 0.25, vec3(0.0), 0.0, 0.0, 0.05);
  }
  if (id < 2.5) {
    float blot = fbm3(lp * 18.0);
    return Mat(vec3(0.14, 0.125, 0.11) * (0.7 + 0.5 * blot), 0.6, 0.35, vec3(0.0), 0.0, 0.5, 0.1);
  }
  if (id < 3.5) {
    // 검게 그을린 나무 격자
    float grain = 0.7 + 0.3 * noise(lp * vec3(40.0, 300.0, 40.0));
    return Mat(vec3(0.045, 0.028, 0.016) * grain, 0.6, 0.35, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 4.5) return Mat(vec3(0.03, 0.026, 0.022), 0.45, 0.8, vec3(0.0), 0.0, 0.0, 0.1);
  if (id < 5.5) {
    // 격자 뒤의 빛
    float fl = 0.75 + 0.35 * fbm3(lp * 30.0);
    return Mat(vec3(0.0), 1.0, 0.0, vec3(3.4, 2.6, 1.3) * fl, 0.0, 0.0, 0.0);
  }
  if (id < 6.5) return Mat(vec3(0.035, 0.018, 0.012) * (0.7 + 0.5 * fbm3(lp * 20.0)), 0.55, 0.4, vec3(0.0), 0.0, 0.0, 0.1);
  if (id < 7.5) {
    // 장부의 종이: 빽빽한 잉크 글씨, 아래의 목소리에게 바칠 이름들
    vec3 bq = lp - BOOK;
    bq.xz = rot(-0.15) * bq.xz;
    bq.yz = rot(BOOK_TILT) * bq.yz;
    float line = smoothstep(0.35, 0.1, abs(fract(bq.z * 95.0) - 0.5)) * step(0.012, abs(bq.x)) * step(abs(bq.x), 0.21) * step(abs(bq.z), 0.135);
    float word = step(0.38, noise(vec3(bq.x * 160.0, floor(bq.z * 95.0) * 3.0, 0.0)));
    float ink = line * word;
    float edge = smoothstep(0.9, 0.2, n.y);
    vec3 alb = mix(vec3(0.2, 0.18, 0.14), vec3(0.03, 0.02, 0.018), ink * 0.85);
    alb *= 0.75 + 0.35 * fbm3(lp * 12.0);
    alb = mix(alb, vec3(0.12, 0.1, 0.075), edge);
    return Mat(alb, 0.85, 0.1, vec3(0.0), 0.0, 0.35, 0.0);
  }
  if (id < 8.5) return Mat(vec3(0.07, 0.008, 0.008), 0.7, 0.3, vec3(0.0), 0.0, 0.0, 0.0);
  if (id > 12.5) {
    // 누렇게 바랜 쪽지: 깨알 같은 고백, 그을린 가장자리
    float ink = step(0.62, noise(lp * vec3(400.0, 90.0, 400.0))) * 0.7;
    float burn = smoothstep(0.55, 0.75, fbm3(lp * 40.0));
    vec3 alb = mix(vec3(0.2, 0.18, 0.135), vec3(0.04, 0.03, 0.02), max(ink * 0.6, burn));
    return Mat(alb, 0.9, 0.05, vec3(0.0), 0.0, 0.4, 0.0);
  }
  if (id > 11.5) {
    float th = 0.75 + 0.25 * noise(lp * vec3(300.0, 60.0, 300.0));
    return Mat(vec3(0.035, 0.012, 0.04) * th, 0.6, 0.5, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id > 10.5) {
    // 고해소 커튼: 낡은 검보라 벨벳, 접힌 곳은 더 어둡고 결 따라 희미하게 빛난다
    float vel = 0.8 + 0.2 * noise(lp * 200.0);
    vec3 alb = vec3(0.03, 0.018, 0.03) * vel * (0.6 + 0.7 * fbm3(lp * 7.0));
    alb = mix(alb, vec3(0.08, 0.075, 0.07), ash * 0.6);
    return Mat(alb, 0.92, 0.1, vec3(0.0), 0.0, 0.0, 0.0);
  }
  // 깃털: 검은 까마귀 깃
  return Mat(vec3(0.02, 0.02, 0.025), 0.4, 0.6, vec3(0.0), 0.35, 0.0, 0.0);
}
`,
  };
}
