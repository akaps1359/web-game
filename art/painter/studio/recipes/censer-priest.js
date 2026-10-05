// 향로 사제 (2층) — 꺼지지 않는 향로를 흔들며 회랑을 도는 키 큰 사제.
// 등이 크게 굽고 고개를 숙였다. 깊은 두건 속은 어둠뿐, 그 아래로 향로 불빛이 마른 턱을 올려 비춘다.
// 검붉은 제의(빛바랜 금실 테두리)에 재가 내려앉았다. 한 손은 축복하듯 두 손가락을 세웠고,
// 뻗은 손끝에 매달린 향로에서 짙은 연기가 휘감겨 오른다. 두건 속에서도 연기가 샌다.
const YAW = -0.32;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
// 레시피 안의 지역 좌표 → 세계 좌표 (sdf 첫 줄의 p.xz = rot(YAW) * p.xz 의 역)
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

export default function censerPriest() {
  const hand = [0.47, 1.16, 0.47];
  const censer = [0.7, 0.6, 0.66];
  const th = Math.atan2(hand[0] - censer[0], hand[1] - censer[1]);
  const ct = Math.cos(th);
  const st = Math.sin(th);
  const loc = (l) => [censer[0] + ct * l[0] + st * l[1], censer[1] - st * l[0] + ct * l[1], censer[2] + l[2]];
  const top = loc([0, 0.152, 0]);
  const ring = [hand[0] + 0.01, hand[1] - 0.075, hand[2] + 0.03];
  const rim = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    return loc([Math.cos(a) * 0.082, 0.012, Math.sin(a) * 0.082]);
  });
  // 두건 속 눈빛 (지역 좌표)
  const head = [0, 1.62, 0.3];
  const eyes = [
    [head[0] - 0.035, head[1] + 0.0, head[2] + 0.06],
    [head[0] + 0.032, head[1] + 0.004, head[2] + 0.062],
  ];
  const cw = toWorld(censer);
  return {
    preset: 'act2',
    cam: { pos: [0.6, 0.55, 6.0], target: [0.08, 1.05, 0.0], fov: 1.85 },
    light: {
      pt: toWorld([censer[0] - 0.03, censer[1] + 0.08, censer[2] + 0.02]),
      ptCol: [2.2, 0.9, 0.28],
      rim: 1.3,
      key: [-0.4, 0.62, -0.78],
      fillCol: [0.22, 0.12, 0.05],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    arrays: {
      uL: [
        [cw[0], cw[1] + 0.05, cw[2], 0.035],
        [...toWorld(eyes[0]), 0.0045],
        [...toWorld(eyes[1]), 0.0045],
      ],
      uLC: [
        [1.0, 0.42, 0.12, 0.35],
        [1.0, 0.42, 0.12, 0.8],
        [1.0, 0.42, 0.12, 0.8],
      ],
    },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 200
#define VOLUME_FAR 12.0
#define HAS_BG

const float YAW = ${YAW};
const vec3 HAND = ${v3(hand)};
const vec3 CENSER = ${v3(censer)};
const vec3 CTOP = ${v3(top)};
const vec3 RING = ${v3(ring)};
const vec3 RIM0 = ${v3(rim[0])};
const vec3 RIM1 = ${v3(rim[1])};
const vec3 RIM2 = ${v3(rim[2])};
const float SWING = ${(-th).toFixed(4)};
const vec3 HEAD = ${v3(head)};
const vec3 HAND2 = vec3(-0.27, 1.36, 0.47);
const float BOW = 0.8;

float bendZ(float y) { float h = max(y - 0.75, 0.0); return 0.33 * h * h; }

/** 마른 손: 손목 w, 손가락 방향 f, 손등 방향 u, 크기 s, 손가락별 굽힘 c(검지~새끼), 벌림 sp, 엄지 쪽 th(+1/-1), 엄지 굽힘 tc */
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

/** 늘어진 소매: 어깨 sh → 팔꿈치 e → 손목 w. 팔뚝 아래로 길게 처진 자락(주름), 손목 쪽은 속이 빈 어둠 */
float sleeve(vec3 p, vec3 sh, vec3 e, vec3 w, float hang) {
  float d = sdRoundCone(p, sh, e, 0.072, 0.066);
  vec3 ax = w - e;
  float L = length(ax);
  ax /= L;
  float fore = sdRoundCone(p, e, w, 0.066, 0.1);
  // 자락: 팔뚝을 지나는 수직면에 매달린 천
  vec3 q = p - e;
  float t = clamp(dot(q, ax) / L, 0.0, 1.0);
  vec3 axp = e + ax * L * t;
  float dy = axp.y - p.y;
  vec3 side = normalize(cross(ax, vec3(0.0, 1.0, 0.0)));
  float dz = dot(p - axp, side);
  float hb = 0.04 + hang * pow(t, 1.4);
  float tat = 0.06 * (noise(vec3(t * 14.0, 0.0, 3.0)) - 0.5) + 0.05 * pow(noise(vec3(t * 37.0, 1.0, 0.0)), 3.0);
  float u = clamp(dy / max(hb, 0.01), 0.0, 1.0);
  float th = mix(0.06, 0.018, u);
  float fold = 0.022 * sin(t * 26.0 + dy * 6.0) * u;
  float flap = abs(dz - fold) - th;
  flap = max(flap, max(-dy, dy - hb - tat));
  flap = max(flap, max(-dot(q, ax) - 0.02, dot(q, ax) - L));
  fore = smin(fore, flap * 0.8, 0.04);
  fore += 0.006 * (fbm3(p * 22.0) - 0.5);
  float hole = sdRoundCone(p, w - ax * 0.08, w + ax * 0.08, 0.04, 0.085);
  fore = max(fore, -hole);
  return smin(d, fore, 0.05);
}

float censerHoles(vec3 cq) {
  // 고딕 창 모양의 세로 틈 + 꼭대기 작은 구멍들
  vec3 hq1 = polarRep(cq, 12.0);
  float holes = sdRoundBox(hq1 - vec3(0.08, 0.042, 0.0), vec3(0.04, 0.017, 0.0065), 0.005);
  vec3 hq3 = polarRep(vec3(cq.x * 0.966 - cq.z * 0.259, cq.y, cq.x * 0.259 + cq.z * 0.966), 6.0);
  holes = min(holes, sdCapsule(hq3, vec3(0.02, 0.083, 0.0), vec3(0.09, 0.083, 0.0), 0.0055));
  return holes;
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  vec3 b = p;
  b.z -= bendZ(b.y);

  // ── 긴 장백의: 바닥에 끌리고 밑단은 해졌다
  float y = clamp(b.y / 1.45, 0.0, 1.0);
  float ang = atan(b.z, b.x);
  float rr = mix(0.37, 0.17, pow(y, 0.5)) + 0.07 * smoothstep(0.16, 0.0, b.y);
  rr += 0.04 * (1.0 - y) * (sin(ang * 9.0 + y * 3.0 + 0.7 * sin(ang * 4.0)) * 0.6 + sin(ang * 21.0 + 1.3) * 0.25);
  float robe = (length(b.xz * vec2(1.0, 1.15)) - rr) * 0.7;
  robe = max(robe, b.y - 1.45);
  float hem = 0.015 + 0.05 * fbm3(vec3(b.x * 9.0, 0.0, b.z * 9.0)) + 0.05 * pow(noise(vec3(ang * 9.0, 5.0, 0.0)), 3.0);
  robe = max(robe, hem - b.y);
  float torso = sdEllipsoid(b - vec3(0.0, 1.33, 0.0), vec3(0.21, 0.22, 0.15));
  float shoulders = min(sdSphere(b - vec3(0.19, 1.45, -0.01), 0.085), sdSphere(b - vec3(-0.19, 1.45, -0.01), 0.085));
  torso = smin(torso, shoulders, 0.1);
  float body = smin(robe, torso, 0.12);
  // ── 제의: 어깨에서 무릎 아래까지 앞뒤로 늘어진 두꺼운 천
  float cyy = clamp((b.y - 0.45) / 1.0, 0.0, 1.0);
  float cr = mix(0.32, 0.21, pow(cyy, 0.75)) + 0.018 * (1.0 - cyy) * sin(ang * 11.0 + cyy * 2.0 + 0.6 * sin(ang * 3.0));
  float chas = (length(b.xz * vec2(1.0, 1.1)) - cr) * 0.7;
  float sideCut = abs(b.x) - 0.25 + 0.05 * (1.0 - cyy);
  chas = max(chas, sideCut);
  float chHem = 0.48 + 0.12 * smoothstep(0.0, 0.25, abs(b.x)) + 0.03 * fbm3(b * 9.0);
  chas = max(chas, max(chHem - b.y, b.y - 1.47));
  chas = smin(chas, torso + 0.012, 0.08);
  body = min(body, chas);
  // ── 어깨 망토: 해진 끝단이 가슴 아래까지
  vec3 mq = b - vec3(0.0, 1.47, 0.0);
  float mr = 0.12 + 0.17 * smoothstep(0.1, -0.3, mq.y);
  float mantle = (length(mq.xz * vec2(1.0, 1.25)) - mr) * 0.7;
  float ma = atan(mq.z, mq.x);
  float strips = pow(noise(vec3(ma * 7.0, 0.0, 1.0)), 2.0) * 0.2 + 0.05 * noise(vec3(ma * 23.0, 2.0, 0.0));
  float mhem = -0.26 - strips;
  mantle = max(mantle, max(mhem - mq.y, mq.y - 0.08));
  body = smin(body, mantle, 0.025);
  // 굽은 등의 혹
  body = smin(body, sdEllipsoid(b - vec3(0.0, 1.4, -0.1), vec3(0.2, 0.2, 0.15)), 0.1);

  // ── 두건: 숙인 고개를 감싼 깊은 두건, 끝이 뒤로 처졌다
  vec3 hq = p - HEAD;
  hq.yz = rot(BOW) * hq.yz;
  float outer = sdEllipsoid(hq - vec3(0.0, 0.0, -0.015), vec3(0.14, 0.165, 0.175));
  outer = smin(outer, sdRoundCone(hq, vec3(0.0, 0.05, -0.08), vec3(0.0, 0.07, -0.28), 0.1, 0.02), 0.07);
  // 목 뒤로 흘러내려 망토와 이어진다
  outer = smin(outer, sdRoundCone(p, HEAD + vec3(0.0, -0.06, -0.08), vec3(0.0, 1.42, 0.06), 0.13, 0.17), 0.08);
  float opening = sdEllipsoid(hq - vec3(0.0, -0.05, 0.165), vec3(0.075, 0.115, 0.1));
  float inner = sdEllipsoid(hq - vec3(0.0, -0.01, 0.0), vec3(0.122, 0.145, 0.16));
  float hood = max(outer, -opening);
  hood = max(hood, -max(inner, hq.z + 0.02 - 0.2));
  body = smin(body, hood, 0.04);

  // ── 팔
  vec3 shA = vec3(0.19, 1.43, bendZ(1.43));
  vec3 elA = vec3(0.37, 1.18, 0.24);
  float arms = sleeve(p, shA, elA, HAND + vec3(-0.035, 0.01, -0.05), 0.2);
  vec3 shB = vec3(-0.19, 1.43, bendZ(1.43));
  vec3 elB = vec3(-0.35, 1.12, 0.24);
  arms = min(arms, sleeve(p, shB, elB, HAND2 + vec3(0.01, -0.07, -0.04), 0.24));
  body = smin(body, arms, 0.05);

  body += 0.0035 * (fbm3(p * 26.0) - 0.5);
  vec2 r = vec2(body, 1.0);
  if (chas < body + 0.003) r.y = 2.0;

  // ── 두건 속: 얼굴은 어둠, 아래로 마른 턱이 조금 드러났다
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, 0.02, -0.01), vec3(0.1, 0.12, 0.11)), 99.0));
  vec3 jq = hq - vec3(0.0, -0.1, 0.06);
  float jaw = sdEllipsoid(jq, vec3(0.04, 0.045, 0.045));
  jaw = smin(jaw, sdEllipsoid(jq - vec3(0.0, -0.035, 0.012), vec3(0.022, 0.02, 0.024)), 0.025);
  float mouth = sdEllipsoid(jq - vec3(0.0, -0.012, 0.045), vec3(0.016, 0.02, 0.026));
  jaw = smax(jaw, -mouth, 0.008);
  r = umin(r, vec2(jaw, 6.0));
  r = umin(r, vec2(sdEllipsoid(jq - vec3(0.0, -0.012, 0.03), vec3(0.013, 0.017, 0.02)), 99.0));

  // ── 허리 끈과 매듭진 끈, 뼈 묵주
  vec3 wq = b - vec3(0.0, 1.0, 0.0);
  float wr = 0.215 + 0.005 * sin(atan(wq.z, wq.x) * 40.0);
  float belt = length(vec2(length(wq.xz * vec2(1.0, 1.15)) - wr, wq.y)) - 0.014;
  vec3 kq = b - vec3(0.09, 1.0, 0.2);
  float cord = sdCapsule(kq, vec3(0.0), vec3(0.03, -0.45, 0.05), 0.011);
  cord = min(cord, sdSphere(kq - vec3(0.01, -0.14, 0.017), 0.02));
  cord = min(cord, sdSphere(kq - vec3(0.02, -0.3, 0.033), 0.02));
  cord = min(cord, sdSphere(kq - vec3(0.03, -0.45, 0.05), 0.022));
  r = umin(r, vec2(min(belt, cord), 8.0));
  float beads = 1e5;
  for (int i = 0; i < 13; i++) {
    float t = float(i) / 12.0;
    vec3 bp = vec3(-0.1 + 0.07 * sin(t * 3.1416), 1.0 - 0.38 * sin(t * 3.1416 * 0.5) - 0.06 * t, 0.205 + 0.02 * sin(t * 3.1416));
    beads = min(beads, sdSphere(b - bp, 0.013));
  }
  beads = min(beads, sdRoundBox(b - vec3(-0.04, 0.6, 0.235), vec3(0.008, 0.035, 0.006), 0.003));
  beads = min(beads, sdRoundBox(b - vec3(-0.04, 0.61, 0.235), vec3(0.022, 0.007, 0.006), 0.003));
  r = umin(r, vec2(beads, 9.0));

  // ── 손: 향로 사슬을 움켜쥔 손 + 두 손가락을 세운 축복의 손
  float hA = sdHand(p, HAND + vec3(-0.03, 0.01, -0.045), vec3(0.25, -0.3, 1.0), vec3(0.1, 1.0, 0.25), 1.3, vec4(1.35, 1.4, 1.45, 1.5), 0.08, 1.0, 1.0);
  float hB = sdHand(p, HAND2 + vec3(0.01, -0.07, -0.04), vec3(-0.1, 1.0, 0.18), vec3(0.15, -0.1, -1.0), 1.3, vec4(0.05, 0.08, 1.5, 1.55), 0.1, -1.0, 1.1);
  r = umin(r, vec2(min(hA, hB), 3.0));

  // ── 향로
  float chain = 1e5;
  for (int i = 0; i < 4; i++) {
    vec3 e = i == 0 ? RIM0 : i == 1 ? RIM1 : i == 2 ? RIM2 : CTOP;
    vec3 ba = e - RING;
    float h = clamp(dot(p - RING, ba) / dot(ba, ba), 0.0, 1.0);
    float link = 0.0026 + 0.0016 * abs(sin(h * length(ba) * 260.0));
    chain = min(chain, length(p - RING - ba * h) - link);
  }
  chain = min(chain, sdTorus((p - RING).xzy, vec2(0.02, 0.005)));
  vec3 cq = p - CENSER;
  cq.xy = rot(SWING) * cq.xy;
  float bowl = max(sdSphere(cq, 0.088), cq.y - 0.01);
  bowl = min(bowl, sdCappedCone(cq - vec3(0.0, -0.1, 0.0), 0.02, 0.045, 0.028));
  bowl = min(bowl, sdTorus(cq - vec3(0.0, 0.01, 0.0), vec2(0.089, 0.008)));
  float lid = abs(sdEllipsoid(cq, vec3(0.084, 0.11, 0.084))) - 0.006;
  lid = max(lid, 0.014 - cq.y);
  lid = min(lid, sdTorus(cq - vec3(0.0, 0.062, 0.0), vec2(0.07, 0.006)));
  lid = max(lid, -censerHoles(cq));
  lid = min(lid, sdCappedCone(cq - vec3(0.0, 0.115, 0.0), 0.024, 0.024, 0.007));
  lid = min(lid, sdSphere(cq - vec3(0.0, 0.142, 0.0), 0.01));
  r = umin(r, vec2(min(bowl, lid), 4.0));
  r = umin(r, vec2(chain, 7.0));
  r = umin(r, vec2(max(sdSphere(cq, 0.075), -cq.y), 5.0));
  return r;
}

float ashDust(vec3 p, vec3 n) {
  return smoothstep(0.3, 0.9, n.y + 0.35 * (fbm3(p * 9.0) - 0.5));
}

Mat material(float id, vec3 p, vec3 n) {
  float ash = ashDust(p, n);
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  if (id < 1.5) {
    // 거친 검은 모직, 밑단은 재에 절었다
    float dirt = fbm3(lp * 5.0);
    float weave = 0.85 + 0.15 * noise(lp * 150.0);
    vec3 alb = vec3(0.026, 0.024, 0.023) * (0.6 + 0.8 * dirt) * weave;
    float low = smoothstep(0.3, 0.0, lp.y) * fbm3(lp * 14.0);
    alb = mix(alb, vec3(0.085, 0.08, 0.075), max(ash * 0.7, low * 0.6));
    return Mat(alb, 0.92, 0.08, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    // 검붉은 제의 + 빛바랜 금실
    vec3 b = lp;
    b.z -= bendZ(b.y);
    float cyy = clamp((b.y - 0.45) / 1.0, 0.0, 1.0);
    float edge = smoothstep(0.03, 0.018, abs(abs(b.x) - 0.235 + 0.05 * (1.0 - cyy)));
    float pillar = smoothstep(0.04, 0.028, abs(b.x)) * step(0.0, b.z);
    float hemBand = smoothstep(0.05, 0.03, b.y - (0.48 + 0.12 * smoothstep(0.0, 0.25, abs(b.x))));
    float gold = max(max(edge, pillar), hemBand);
    float thread = 0.55 + 0.45 * noise(lp * vec3(320.0, 50.0, 320.0));
    float worn = smoothstep(0.3, 0.75, fbm3(lp * 12.0));
    vec3 red = vec3(0.03, 0.0065, 0.0055) * (0.55 + 0.8 * fbm3(lp * 6.0));
    vec3 gol = vec3(0.085, 0.056, 0.024) * thread * (1.0 - worn * 0.7);
    vec3 alb = mix(red, gol, gold);
    alb = mix(alb, vec3(0.085, 0.08, 0.075), ash * 0.75);
    float g = gold * (1.0 - worn) * (1.0 - ash);
    return Mat(alb, mix(0.82, 0.35, g), mix(0.12, 1.2, g), vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 3.5) {
    // 잿빛으로 마른 살갗
    float blot = fbm3(lp * 18.0);
    vec3 alb = vec3(0.13, 0.115, 0.1) * (0.7 + 0.5 * blot);
    return Mat(alb, 0.6, 0.35, vec3(0.0), 0.0, 0.5, 0.12);
  }
  if (id < 4.5) {
    // 그을린 놋쇠: 구멍 가장자리는 속의 숯불로 달아올랐다
    vec3 cq = lp - CENSER;
    cq.xy = rot(SWING) * cq.xy;
    float hole = censerHoles(cq);
    float soot = fbm3(lp * 30.0);
    vec3 alb = mix(vec3(0.085, 0.055, 0.025), vec3(0.018, 0.014, 0.01), smoothstep(0.25, 0.6, soot));
    vec3 emi = vec3(3.0, 0.9, 0.18) * smoothstep(0.006, 0.0, hole) + vec3(0.6, 0.15, 0.02) * smoothstep(0.02, 0.0, hole) * 0.4;
    return Mat(alb, 0.42, 1.0, emi, 0.0, 0.0, 0.1);
  }
  if (id > 6.5 && id < 7.5) return Mat(vec3(0.02, 0.018, 0.016), 0.45, 0.7, vec3(0.0), 0.0, 0.0, 0.0);
  if (id > 7.5 && id < 8.5) {
    // 재에 전 삼베 끈
    float tw = 0.7 + 0.3 * sin(dot(lp, vec3(120.0, 160.0, 120.0)));
    return Mat(vec3(0.06, 0.055, 0.048) * tw, 0.95, 0.05, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id > 8.5 && id < 9.5) return Mat(vec3(0.2, 0.18, 0.14) * (0.7 + 0.4 * noise(lp * 60.0)), 0.5, 0.6, vec3(0.0), 0.0, 0.3, 0.1);
  if (id > 5.5) {
    // 두건 그늘 속의 턱: 거의 보이지 않게
    return Mat(vec3(0.07, 0.06, 0.052), 0.6, 0.3, vec3(0.0), 0.0, 0.4, 0.2);
  }
  float hot = 0.5 + 0.9 * noise(lp * 90.0);
  return Mat(vec3(0.02), 0.9, 0.0, vec3(3.4, 1.1, 0.25) * hot, 0.0, 0.0, 0.0);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 L1 = normalize(uKeyDir);
  vec3 bg = mix(vec3(0.0), uFogCol * 0.5, smoothstep(-0.3, 0.6, rd.y)) * 0.6;
  bg += uFogCol * 0.9 * pow(max(dot(rd, normalize(vec3(-L1.x, L1.y * 0.25, -L1.z))), 0.0), 5.0);
  return bg;
}

/** 연기 기둥 하나: 시작점 o, 높이당 흐름 drift, 퍼짐 spread */
float plume(vec3 p, vec3 o, vec2 drift, float spread, float len, float seed) {
  float h = p.y - o.y;
  if (h < -0.03 || h > len) return 0.0;
  float s = max(h, 0.0);
  vec2 c = o.xz + drift * s + vec2(0.07 * sin(s * 5.0 + seed), 0.06 * cos(s * 4.0 + seed));
  float rad = 0.018 + spread * s + 0.05 * s * s;
  vec3 w = p * 5.0 + vec3(seed, -s * 2.5, 0.0);
  vec3 warp = vec3(fbm3(w), fbm3(w + 3.1), fbm3(w + 7.7)) - 0.5;
  vec3 pw = p + warp * (0.02 + 0.32 * s);
  float dc = length(pw.xz - c) / rad;
  float core = smoothstep(1.0, 0.1, dc);
  float tend = 1.0 - smoothstep(0.0, 0.3, ridge(pw * vec3(9.0, 4.0, 9.0) + seed));
  return core * mix(1.0, 0.25 + 0.95 * tend, smoothstep(0.0, 0.25, s)) * smoothstep(-0.03, 0.04, h) * smoothstep(len, len * 0.3, s);
}

// 향 연기: 향로에서 휘감겨 오르는 기둥 + 두건 속에서 새는 연기 + 발치의 잿빛 안개
vec4 volume(vec3 p) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  if (q.y < -0.05 || q.y > 3.0 || abs(q.x) > 1.7 || abs(q.z) > 1.6) return vec4(0.0);
  float d1 = plume(q, CTOP, vec2(-0.5, -0.4), 0.2, 1.5, 0.0) * (1.0 + 1.5 * smoothstep(0.35, 0.0, q.y - CTOP.y));
  float d2 = plume(q, HEAD + vec3(0.0, -0.06, 0.13), vec2(0.05, 0.12), 0.12, 0.8, 5.0) * 0.6;
  float low = uScene == 0 ? 0.0 : smoothstep(0.3, 0.0, q.y) * smoothstep(1.1, 0.25, length(q.xz - vec2(0.15, 0.1))) * smoothstep(0.5, 0.8, fbm3(q * vec3(2.5, 6.0, 2.5)));
  float dens = d1 * 12.0 + d2 * 6.0 + low * 2.0;
  if (dens < 0.001) return vec4(0.0);
  float dl = length(q - CENSER);
  vec3 warm = vec3(1.5, 0.55, 0.15) / (1.0 + dl * dl * 16.0);
  float lit = 0.4 + 0.6 * smoothstep(0.2, 2.2, q.y);
  vec3 cool = vec3(0.3, 0.28, 0.26) * lit;
  vec3 col = warm + cool * 0.6;
  if (uScene == 0) col *= 1.4;
  return vec4(col, dens);
}
`,
  };
}
