// 빙의된 수도사 (2층) — 두 개의 목소리로 동시에 기도한다. 하나는 살려 달라고, 하나는 들어오라고.
// 발작하듯 몸이 굽었고, 목이 꺾여 고개가 어깨에 얹혔다. 빠질 듯 벌어진 턱에서 검은 연기(빠져나오는 악령)가 피어오르고, 목구멍 깊이 핏빛 불.
// 찢어진 수도복 사이로 드러난 가슴엔 또 하나의 얼굴이 살갗을 밀고 나온다. 한 손은 그 얼굴을 할퀴고, 한 손은 옆으로 뻗어 경련한다.
const YAW = 0.32;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const rotv = (a, x, y) => [Math.cos(a) * x + Math.sin(a) * y, -Math.sin(a) * x + Math.cos(a) * y];

const HEAD = [-0.12, 1.55, 0.16];
const ROLL = 0.95;
const PITCH = -0.35;
/** 머리 지역 좌표 → 레시피 지역 좌표 (GLSL headSpace의 역) */
function headToLocal([x, y, z]) {
  const [y1, z1] = rotv(-PITCH, y, z);
  const [x2, y2] = rotv(-ROLL, x, y1);
  return [HEAD[0] + x2, HEAD[1] + y2, HEAD[2] + z1];
}

export default function possessedMonk() {
  const mouth = headToLocal([0.0, -0.075, 0.07]);
  const chest = [0.0, 1.3, 0.16];
  return {
    preset: 'act2',
    cam: { pos: [0.3, 0.8, 5.4], target: [0.0, 1.05, 0.0], fov: 1.85 },
    light: {
      key: [-0.45, 0.62, -0.72],
      rim: 1.3,
      fillCol: [0.2, 0.11, 0.05],
      pt: toWorld([mouth[0] + 0.02, mouth[1] - 0.05, mouth[2] + 0.12]),
      ptCol: [0.9, 0.05, 0.07],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    arrays: {
      uL: [
        [...toWorld([mouth[0], mouth[1], mouth[2] + 0.01]), 0.009],
        [...toWorld([chest[0], chest[1] - 0.045, chest[2] + 0.05]), 0.006],
      ],
      uLC: [
        [1.0, 0.1, 0.14, 0.5],
        [1.0, 0.1, 0.14, 0.4],
      ],
    },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 160
#define VOLUME_FAR 12.0
#define HAS_BG

const float YAW = ${YAW.toFixed(4)};
const vec3 HEAD = ${v3(HEAD)};
const float ROLL = ${ROLL.toFixed(4)};
const float PITCH = ${PITCH.toFixed(4)};
const vec3 MOUTH = ${v3(mouth)};
const vec3 CHEST = ${v3(chest)};
const vec3 P0 = vec3(0.0, 0.92, 0.0);
const vec3 P1 = vec3(0.0, 1.12, -0.01);
const vec3 P2 = vec3(0.02, 1.29, 0.03);
const vec3 P3 = vec3(-0.01, 1.42, 0.05);
const vec3 P4 = vec3(-0.06, 1.48, 0.09);
const vec3 HANDL = vec3(0.21, 1.4, 0.15);
const vec3 HANDR = vec3(-0.6, 1.36, 0.25);

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
  q.xy = rot(ROLL) * q.xy;
  q.yz = rot(PITCH) * q.yz;
  return q;
}
vec3 chestSpace(vec3 p) {
  vec3 q = p - CHEST;
  q.yz = rot(0.12) * q.yz;
  return q;
}
float torsoD(vec3 p) {
  vec3 q = p;
  q.x *= 0.78;
  float d = sdRoundCone(q, P0, P1, 0.14, 0.12);
  d = smin(d, sdRoundCone(q, P1, P2, 0.12, 0.145), 0.06);
  d = smin(d, sdRoundCone(q, P2, P3, 0.145, 0.15), 0.06);
  d = smin(d, sdRoundCone(q, P3, P4, 0.15, 0.06), 0.06);
  return d * 0.78;
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;

  // ── 몸통 (드러난 살) + 갈비뼈 + 가슴을 밀고 나오는 두 번째 얼굴
  float torso = torsoD(p);
  vec3 cq = chestSpace(p);
  vec3 cqs = (cq - vec3(0.0, 0.01, 0.0)) / 1.6;
  float rib = 0.5 + 0.5 * cos(cq.y * 95.0 - abs(cq.x) * 18.0);
  float ribZone = smoothstep(0.035, 0.09, abs(cq.x)) * smoothstep(-0.2, -0.08, cq.y) * smoothstep(0.13, 0.05, cq.y);
  torso -= 0.006 * pow(rib, 3.0) * ribZone;
  float face2 = sdEllipsoid(cqs - vec3(0.0, -0.01, -0.03), vec3(0.06, 0.08, 0.05));
  vec3 fq = vec3(abs(cqs.x), cqs.y, cqs.z);
  face2 = smin(face2, sdEllipsoid(fq - vec3(0.024, 0.032, 0.013), vec3(0.028, 0.011, 0.012)), 0.012);
  face2 = smin(face2, sdRoundCone(cqs, vec3(0.0, 0.02, 0.016), vec3(0.0, -0.008, 0.028), 0.007, 0.01), 0.01);
  face2 = smin(face2, sdEllipsoid(fq - vec3(0.035, -0.01, 0.0), vec3(0.016, 0.013, 0.014)), 0.012);
  face2 = smax(face2, -sdEllipsoid(fq - vec3(0.022, 0.017, 0.018), vec3(0.014, 0.009, 0.014)), 0.006);
  float m2 = sdEllipsoid(cqs - vec3(0.0, -0.042, 0.016), vec3(0.018, 0.026, 0.022));
  face2 = smax(face2, -m2, 0.006);
  face2 *= 1.6;
  float skin = smin(torso, face2, 0.03);
  skin += 0.0015 * (fbm3(p * 70.0) - 0.5);

  // ── 찢어진 수도복
  float cloth = torsoD(p) - 0.018 - 0.004 * fbm3(p * 20.0);
  float open = abs(cq.x) - 0.1 - 0.05 * fbm3(p * 9.0) - 0.05 * smoothstep(-0.1, 0.15, cq.y) + 0.03 * smoothstep(-0.1, -0.3, cq.y);
  float front = -(cq.z + 0.06);
  cloth = max(cloth, -max(open, front));
  cloth = max(cloth, -(torsoD(p) - 0.006));
  vec3 knL = vec3(0.1, 0.5, 0.14);
  vec3 knR = vec3(-0.1, 0.5, 0.1);
  float legs = min(sdRoundCone(p, vec3(0.09, 0.9, 0.0), knL, 0.1, 0.075), sdRoundCone(p, vec3(-0.09, 0.9, 0.0), knR, 0.1, 0.075));
  legs = min(legs, min(sdRoundCone(p, knL, vec3(0.11, 0.1, 0.03), 0.072, 0.05), sdRoundCone(p, knR, vec3(-0.11, 0.1, -0.02), 0.072, 0.05)));
  float y = clamp(p.y / 1.0, 0.0, 1.0);
  float ang = atan(p.z, p.x);
  float rr = mix(0.31, 0.16, pow(y, 0.7)) + 0.035 * (1.0 - y) * sin(ang * 8.0 + y * 4.0 + sin(ang * 3.0));
  float skirt = (length(p.xz * vec2(1.0, 1.15)) - rr) * 0.7;
  skirt = smin(skirt, legs - 0.03, 0.12);
  float hem = 0.1 + 0.06 * fbm3(vec3(p.x * 10.0, 0.0, p.z * 10.0)) + 0.12 * pow(noise(vec3(ang * 7.0, 1.0, 0.0)), 2.0);
  skirt = max(skirt, max(hem - p.y, p.y - 1.08));
  cloth = smin(cloth, skirt, 0.08);
  vec3 shL = vec3(0.16, 1.42, 0.0);
  vec3 elL = vec3(0.31, 1.2, 0.1);
  vec3 shR = vec3(-0.18, 1.42, 0.0);
  vec3 elR = vec3(-0.39, 1.36, 0.1);
  float sleeves = min(sdRoundCone(p, shL, elL, 0.075, 0.07), sdRoundCone(p, shR, elR, 0.075, 0.07));
  sleeves = smin(sleeves, sdRoundCone(p, elL, elL + vec3(0.0, -0.17, -0.02), 0.07, 0.03), 0.04);
  sleeves = smin(sleeves, sdRoundCone(p, elR, elR + vec3(0.02, -0.19, -0.02), 0.07, 0.03), 0.04);
  cloth = smin(cloth, sleeves, 0.04);
  // 목 뒤로 넘어간 두건
  cloth = smin(cloth, sdEllipsoid(p - vec3(0.0, 1.47, -0.12), vec3(0.15, 0.09, 0.09)), 0.06);
  cloth += 0.004 * (fbm3(p * 22.0) - 0.5);
  vec2 r = vec2(cloth, 1.0);
  r = umin(r, vec2(skin, 2.0));
  // 가슴 얼굴의 눈구멍과 입 속: 몸 안에서 새는 핏빛
  float glow2 = sdEllipsoid(cqs - vec3(0.0, -0.042, 0.01), vec3(0.015, 0.022, 0.012));
  glow2 = min(glow2, sdEllipsoid(fq - vec3(0.022, 0.017, 0.012), vec3(0.011, 0.007, 0.008)));
  r = umin(r, vec2(glow2 * 1.6, 5.0));

  // ── 팔뚝 + 손: 가슴의 얼굴을 할퀴는 손, 옆으로 뻗어 경련하는 손
  float fore = sdRoundCone(p, elL + normalize(HANDL - elL) * 0.05, HANDL, 0.032, 0.024);
  fore = min(fore, sdRoundCone(p, elR + normalize(HANDR - elR) * 0.05, HANDR, 0.032, 0.024));
  float hL = sdHand(p, HANDL, vec3(-0.45, -0.5, 0.35), vec3(0.3, 0.2, 1.0), 1.2, vec4(1.1, 1.15, 1.2, 1.25), 0.16, 1.0, 0.8);
  float hR = sdHand(p, HANDR, vec3(-1.0, 0.25, 0.25), vec3(0.0, 1.0, -0.2), 1.25, vec4(0.25, 0.55, 0.9, 1.25), 0.32, -1.0, 0.2);
  float limbs = min(fore, min(hL, hR));
  // 꺾인 목
  limbs = smin(limbs, sdRoundCone(p, P4 + vec3(0.02, -0.02, -0.01), HEAD + vec3(0.03, -0.05, -0.02), 0.058, 0.05), 0.03);
  for (int s = 0; s < 2; s++) {
    vec3 an = s == 0 ? vec3(0.11, 0.08, 0.03) : vec3(-0.11, 0.08, -0.02);
    float foot = sdRoundCone(p, an + vec3(0.0, -0.035, -0.02), an + vec3(0.0, -0.05, 0.12), 0.026, 0.022);
    for (int t = 0; t < 4; t++) {
      float tx = (float(t) - 1.5) * 0.017;
      foot = smin(foot, sdRoundCone(p, an + vec3(tx, -0.05, 0.12), an + vec3(tx * 1.2, -0.072, 0.145 - abs(tx) * 0.5), 0.009, 0.007), 0.01);
    }
    limbs = min(limbs, smin(foot, sdRoundCone(p, an, an + vec3(0.0, 0.1, 0.0), 0.024, 0.03), 0.02));
  }
  r = umin(r, vec2(limbs, 2.0));

  // ── 머리: 꺾여 어깨에 얹혔고, 아래턱이 빠질 듯 벌어졌다
  vec3 hq = headSpace(p) / 1.12;
  float cran = sdEllipsoid(hq - vec3(0.0, 0.025, -0.015), vec3(0.08, 0.098, 0.096));
  vec3 qa = vec3(abs(hq.x), hq.y, hq.z);
  cran = smin(cran, sdEllipsoid(qa - vec3(0.05, -0.012, 0.058), vec3(0.024, 0.018, 0.026)), 0.02);
  cran = smax(cran, -sdEllipsoid(qa - vec3(0.03, 0.012, 0.082), vec3(0.022, 0.016, 0.02)), 0.012);
  cran = smin(cran, sdEllipsoid(qa - vec3(0.03, 0.034, 0.078), vec3(0.03, 0.01, 0.016)), 0.015);
  cran = smin(cran, sdRoundCone(hq, vec3(0.0, 0.012, 0.092), vec3(0.0, -0.026, 0.11), 0.009, 0.012), 0.012);
  cran = smin(cran, sdEllipsoid(qa - vec3(0.08, 0.0, 0.0), vec3(0.01, 0.026, 0.017)), 0.01);
  cran = max(cran, -(hq.y + 0.045 - hq.z * 0.1));
  float teeth = 1e5;
  for (int i = 0; i < 6; i++) {
    float a = (float(i) - 2.5) * 0.28;
    vec3 tp = vec3(sin(a) * 0.04, -0.045, 0.06 + cos(a) * 0.025);
    teeth = min(teeth, sdRoundCone(hq, tp, tp + vec3(0.0, -0.016, 0.0), 0.0065, 0.004));
  }
  vec3 jq = hq - vec3(0.0, -0.03, -0.02);
  jq.yz = rot(-0.7) * jq.yz;
  float jaw = sdEllipsoid(jq - vec3(0.0, -0.035, 0.06), vec3(0.058, 0.03, 0.065));
  jaw = max(jaw, -sdEllipsoid(jq - vec3(0.0, -0.01, 0.07), vec3(0.045, 0.028, 0.06)));
  for (int i = 0; i < 6; i++) {
    float a = (float(i) - 2.5) * 0.3;
    vec3 tp = vec3(sin(a) * 0.037, -0.018, 0.06 + cos(a) * 0.035);
    teeth = min(teeth, sdRoundCone(jq, tp, tp + vec3(0.0, 0.014, 0.0), 0.006, 0.0035));
  }
  float head = smin(cran, jaw, 0.025);
  head = smin(head, max(sdEllipsoid(qa - vec3(0.055, -0.06, 0.03), vec3(0.012, 0.045, 0.04)), -sdEllipsoid(hq - vec3(0.0, -0.07, 0.07), vec3(0.04, 0.05, 0.06))), 0.015);
  head += 0.0015 * (fbm3(p * 70.0) - 0.5);
  r = umin(r, vec2(head * 1.12, 2.0));
  r = umin(r, vec2(teeth * 1.12, 4.0));
  // 입 속: 어둠, 깊은 곳에 핏빛 불씨 (머리 밖으로 새지 않게 안쪽에)
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.066, 0.035), vec3(0.042, 0.048, 0.055)) * 1.12, 99.0));
  r = umin(r, vec2(sdSphere(hq - vec3(0.0, -0.06, 0.03), 0.014) * 1.12, 5.0));
  r = umin(r, vec2(sdSphere(qa - vec3(0.03, 0.01, 0.072), 0.0125) * 1.12, 6.0));
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
    float dirt = fbm3(lp * 5.0);
    float weave = 0.82 + 0.18 * noise(lp * vec3(200.0, 70.0, 200.0));
    vec3 alb = vec3(0.032, 0.027, 0.024) * (0.6 + 0.8 * dirt) * weave;
    alb = mix(alb, vec3(0.09, 0.085, 0.08), ash * 0.5);
    return Mat(alb, 0.9, 0.08, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    vec3 cq = chestSpace(lp);
    float near = smoothstep(0.25, 0.05, length(cq.xy)) * step(0.0, cq.z + 0.05);
    float vein = smoothstep(0.08, 0.0, ridge(lp * 18.0)) * (0.35 + 0.65 * near);
    float blot = fbm3(lp * 16.0);
    vec3 alb = vec3(0.13, 0.115, 0.1) * (0.7 + 0.5 * blot);
    alb = mix(alb, vec3(0.03, 0.012, 0.02), vein * 0.85);
    float scratch = smoothstep(0.1, 0.0, length(cq.xy - vec2(0.05, 0.0))) * smoothstep(0.55, 0.9, noise(vec3(cq.x * 15.0 + cq.y * 70.0, 0.0, 1.0)));
    alb = mix(alb, vec3(0.07, 0.006, 0.006), scratch);
    vec3 emi = vec3(0.7, 0.02, 0.05) * vein * near * 0.3;
    return Mat(alb, 0.55, 0.35, emi, 0.0, 0.55, 0.15 + scratch * 0.6);
  }
  if (id < 4.5) return Mat(vec3(0.2, 0.17, 0.11), 0.4, 0.6, vec3(0.0), 0.0, 0.2, 0.4);
  if (id < 5.5) return Mat(vec3(0.0), 1.0, 0.0, vec3(1.5, 0.05, 0.07), 0.0, 0.0, 0.0);
  return Mat(vec3(0.3, 0.28, 0.25), 0.1, 1.5, vec3(0.05, 0.02, 0.02), 0.0, 0.4, 1.0);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 L1 = normalize(uKeyDir);
  vec3 bg = mix(vec3(0.0), uFogCol * 0.5, smoothstep(-0.3, 0.6, rd.y)) * 0.6;
  bg += uFogCol * 0.9 * pow(max(dot(rd, normalize(vec3(-L1.x, L1.y * 0.25, -L1.z))), 0.0), 5.0);
  return bg;
}

// 입에서 피어오르는 검은 연기: 아래는 핏빛으로 달아올랐고 위로 갈수록 검고 흩어진다
vec4 volume(vec3 p) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  float h = q.y - MOUTH.y;
  if (h < -0.08 || h > 1.0) return vec4(0.0);
  float s = max(h + 0.02, 0.0);
  vec2 c = MOUTH.xz + vec2(-0.05 * s + 0.06 * sin(s * 4.0), 0.12 * s + 0.05 * cos(s * 5.0)) + vec2(0.0, 0.035);
  float rad = 0.022 + 0.13 * s + 0.08 * s * s;
  vec3 w = q * 6.0 + vec3(0.0, -s * 3.0, 0.0);
  vec3 warp = vec3(fbm3(w), fbm3(w + 3.1), fbm3(w + 7.7)) - 0.5;
  vec3 qw = q + warp * (0.02 + 0.25 * s);
  float dc = length(qw.xz - c) / rad;
  float core = smoothstep(1.0, 0.15, dc);
  float tend = 1.0 - smoothstep(0.0, 0.3, ridge(qw * vec3(10.0, 5.0, 10.0)));
  float dens = core * mix(1.0, 0.3 + 0.9 * tend, smoothstep(0.0, 0.2, s)) * smoothstep(-0.06, 0.02, h) * smoothstep(1.0, 0.35, s) * 16.0;
  if (dens < 0.001) return vec4(0.0);
  float hot = smoothstep(0.3, 0.0, s);
  vec3 col = mix(vec3(0.02, 0.016, 0.018), vec3(0.8, 0.03, 0.06), hot * hot) + vec3(0.11, 0.1, 0.1) * smoothstep(0.25, 0.9, s) * (0.3 + 0.7 * tend);
  return vec4(col, dens);
}
`,
  };
}
