// 대사제 (2층 수호자) — 수도원을 아래의 목소리에 바친 마지막 대사제. 그의 목숨은 향로의 불처럼 꺼지지 않는다.
// 높은 삼중관, 성체 현시대처럼 머리 뒤로 뻗은 녹슨 금빛 햇살, 금 간 금빛 가면 (틈 사이로 아래의 목소리의 보랏빛).
// 바닥까지 퍼진 검보라 망토와 금실 띠. 숯처럼 그을린 손엔 불씨가 비치고, 높이 든 향로에서 연기가 흘러내리며,
// 다른 손엔 땅을 향한 물결 날 제례검.

export default function highPriest() {
  const hand = [0.92, 3.08, 0.6];
  const censer = [0.78, 2.55, 0.82];
  return {
    preset: 'act2',
    cam: { pos: [1.4, 0.3, 9.4], target: [0.1, 2.05, 0.0], fov: 1.55 },
    light: {
      key: [-0.45, 0.65, -0.62],
      keyCol: [1.25, 1.15, 1.05],
      fillCol: [0.16, 0.08, 0.035],
      amb: [0.02, 0.016, 0.018],
      rim: 1.35,
      pt: censer,
      ptCol: [3.4, 1.35, 0.42],
      exposure: 1.2,
    },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: {
      uL: [
        [censer[0], censer[1], censer[2], 0.17],
        [-0.085, 2.76, 0.37, 0.018],
        [0.085, 2.76, 0.37, 0.018],
      ],
      uLC: [
        [1.0, 0.45, 0.12, 0.28],
        [0.78, 0.5, 1.0, 1.4],
        [0.78, 0.5, 1.0, 1.4],
      ],
    },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 40
#define VOLUME_FAR 14.0
const vec3 CENSER = vec3(${censer.join(', ')});
const vec3 HANDR = vec3(${hand.join(', ')});
const vec3 HEADC = vec3(0.0, 2.7, 0.14);
const vec3 HANDL = vec3(-0.62, 1.38, 0.62);
const vec3 SWORD_TIP = vec3(-0.95, 0.03, 1.35);

vec3 bend(vec3 p) {
  float h = max(p.y - 1.4, 0.0);
  p.z -= 0.1 * h * h;
  return p;
}

// 마디진 손: 손바닥 + 긴 손가락 넷 (f 손가락 방향, u 손등)
float hand(vec3 p, vec3 c, vec3 f, vec3 u, float curl) {
  float bd = length(p - c) - 0.3;
  if (bd > 0.1) return bd;
  f = normalize(f);
  vec3 s = normalize(cross(f, u));
  u = normalize(cross(s, f));
  float d = sdEllipsoid(p - c, vec3(0.055, 0.065, 0.03));
  for (int i = 0; i < 4; i++) {
    float o = float(i) - 1.5;
    vec3 k = c + f * 0.05 + s * o * 0.026;
    float L = 0.12 - abs(o) * 0.015;
    vec3 m = k + normalize(f - u * curl * 0.6 + s * o * 0.1) * L * 0.55;
    vec3 e = m + normalize(f - u * curl * 1.6) * L * 0.5;
    d = smin(d, min(sdRoundCone(p, k, m, 0.013, 0.011), sdRoundCone(p, m, e, 0.011, 0.006)), 0.012);
  }
  d = smin(d, sdRoundCone(p, c - s * 0.045, c - s * 0.07 + f * 0.07 - u * 0.03, 0.015, 0.009), 0.015);
  return d;
}

// 들어 올린 팔 아래로 늘어진 소매 자락: 팔 선분 a→b 아래로 떨어지는 얇은 천 (drop은 b쪽으로 갈수록 길다)
float drape(vec3 p, vec3 a, vec3 b, float drop, float th) {
  vec2 ab = b.xz - a.xz;
  float h = clamp(dot(p.xz - a.xz, ab) / dot(ab, ab), 0.0, 1.0);
  vec3 c = mix(a, b, h);
  vec2 nrm = normalize(vec2(-ab.y, ab.x));
  float lat = dot(p.xz - c.xz, nrm) + 0.03 * sin(h * 18.0 + p.y * 6.0);
  float bottom = c.y - drop * (0.35 + 0.65 * h) - 0.06 * fbm3(p * 8.0);
  float d = max(abs(lat) - th, max(p.y - c.y, bottom - p.y));
  d = max(d, max(-h + 0.0, h - 1.0) * 0.0 + max(dot(p.xz - a.xz, ab) / length(ab) - length(ab) - 0.05, -dot(p.xz - a.xz, ab) / length(ab) - 0.05));
  return d * 0.8;
}

// 삼중관
vec2 tiara(vec3 q) {
  float bd = length(q - vec3(0.0, 0.35, 0.0)) - 0.6;
  if (bd > 0.1) return vec2(bd, 4.0);
  float y = q.y;
  float rr = 0.19 * (1.0 - smoothstep(0.0, 0.62, y) * 0.5) * sqrt(clamp(1.0 - pow(max(y - 0.05, 0.0) / 0.6, 3.0), 0.0, 1.0)) + 0.015;
  float d = (length(q.xz) - rr) * 0.8;
  d = max(d, max(-y, y - 0.64));
  vec2 r = vec2(d, 5.0);
  float crowns = 1e5;
  for (int i = 0; i < 3; i++) {
    float cy = 0.05 + float(i) * 0.18;
    float cr = 0.19 * (1.0 - smoothstep(0.0, 0.62, cy) * 0.5) + 0.02;
    vec3 cq = q - vec3(0.0, cy, 0.0);
    float ring = length(vec2(length(cq.xz) - cr, cq.y)) - 0.018;
    vec3 sp = polarRep(cq, 12.0);
    float spike = sdRoundCone(sp, vec3(cr, 0.0, 0.0), vec3(cr + 0.015, 0.075, 0.0), 0.014, 0.003);
    crowns = min(crowns, min(ring, spike));
  }
  crowns = min(crowns, sdSphere(q - vec3(0.0, 0.67, 0.0), 0.032));
  crowns = min(crowns, sdBox(q - vec3(0.0, 0.77, 0.0), vec3(0.008, 0.07, 0.008)));
  crowns = min(crowns, sdBox(q - vec3(0.0, 0.79, 0.0), vec3(0.04, 0.008, 0.008)));
  r = umin(r, vec2(crowns, 4.0));
  return r;
}

// 머리 뒤의 햇살 (성체 현시대): 길고 짧은 녹슨 금 가시가 번갈아
float sunburst(vec3 p) {
  vec3 q = p - (HEADC + vec3(0.0, 0.05, -0.28));
  float bd = length(q) - 1.15;
  if (bd > 0.1) return bd;
  float a = atan(q.y, q.x);
  float n = 28.0;
  float k = floor(a / 6.2831853 * n + 0.5);
  float ak = k / n * 6.2831853;
  vec2 dir = vec2(cos(ak), sin(ak));
  vec2 pq = q.xy;
  float along = dot(pq, dir);
  float perp = abs(pq.x * dir.y - pq.y * dir.x);
  float longR = mod(k, 2.0) < 0.5 ? 1.05 : 0.72;
  longR *= 0.9 + 0.2 * hash11(k * 7.13);
  float t = clamp((along - 0.3) / (longR - 0.3), 0.0, 1.0);
  float w = mix(0.035, 0.002, t);
  float d = max(perp - w, abs(q.z) - 0.012);
  d = max(d, max(0.3 - along, along - longR));
  // 안쪽 고리 둘
  float ring = length(vec2(length(q.xy) - 0.34, q.z)) - 0.022;
  ring = min(ring, length(vec2(length(q.xy) - 0.42, q.z)) - 0.012);
  return min(d, ring);
}

vec2 sdf(vec3 p) {
  vec3 b = bend(p);
  vec2 r = vec2(1e5, 0.0);
  // ── 망토: 어깨에서 바닥까지 넓게 퍼짐, 앞이 트였다, 묵직한 주름 ──
  float yy = clamp(b.y / 2.35, 0.0, 1.0);
  float rad = mix(1.15, 0.42, pow(yy, 0.7));
  float ang = atan(b.x, b.z);
  rad += 0.07 * (1.0 - yy) * sin(ang * 8.0 + b.y * 1.5) + 0.03 * (1.0 - yy) * sin(ang * 17.0 - b.y * 3.0);
  vec3 cq = b;
  cq.z *= 1.15;
  float cope = (length(cq.xz) - rad) * 0.72;
  cope = abs(cope + 0.03) - 0.03;
  float slitW = 0.2 + 0.28 * (1.0 - yy);
  cope = max(cope, -(abs(ang) - slitW) * 0.6);
  float hem = 0.02 + 0.07 * fbm3(vec3(b.x * 5.0, 0.0, b.z * 5.0));
  cope = max(cope, max(hem - b.y, b.y - 2.4));
  float sh = sdEllipsoid(b - vec3(0.0, 2.32, 0.0), vec3(0.56, 0.19, 0.35));
  cope = smin(cope, sh, 0.12);
  vec3 kq = b - vec3(0.0, 2.44, -0.02);
  float collar = abs(sdCylinder(kq, 0.11, 0.22 + 0.1 * (kq.y + 0.11))) - 0.022;
  collar = max(collar, -(kq.z - 0.12 + kq.y * 0.4));
  cope = smin(cope, collar, 0.05);
  cope += 0.004 * (fbm3(p * 20.0) - 0.5);
  r = vec2(cope, 1.0);
  // 장백의
  float alb = sdRobe(b - vec3(0.0, 0.0, 0.05), 2.25, 0.3, 0.55, 12.0, 0.025);
  alb = max(alb, -(b.y - 0.01 - 0.04 * fbm3(vec3(b.x * 8.0, 0.0, b.z * 8.0))));
  r = umin(r, vec2(alb, 2.0));
  // 금실 띠
  float bandEdge = abs(abs(ang) - slitW - 0.085) - 0.075;
  float orph = max(cope - 0.012, bandEdge * 0.6);
  orph = max(orph, -(b.y - 0.12));
  r = umin(r, vec2(orph, 4.0));

  // ── 팔: 오른팔은 향로를 높이 들고 (소매가 팔꿈치로 흘러내림), 왼팔은 칼을 아래로 ──
  vec3 shR = vec3(0.46, 2.3, 0.05);
  vec3 elR = vec3(0.86, 2.62, 0.35);
  float sleeve = sdRoundCone(b, shR, elR, 0.15, 0.13);
  // 팔꿈치까지 흘러내린 소매가 팔 아래로 길게 늘어진다
  sleeve = smin(sleeve, drape(p, shR + vec3(0.02, -0.05, 0.0), elR, 0.75, 0.02), 0.05);
  float armR = sdRoundCone(p, elR + vec3(0.0, 0.02, 0.0), HANDR + vec3(-0.02, -0.06, 0.0), 0.055, 0.04);
  vec3 shL = vec3(-0.48, 2.3, 0.05);
  vec3 elL = vec3(-0.68, 1.85, 0.28);
  float sL = sdRoundCone(b, shL, elL, 0.15, 0.15);
  // 아래팔 소매: 손목으로 갈수록 넓어지고 아래로 처진다
  vec3 wL = HANDL + vec3(0.02, 0.18, -0.06);
  vec3 wEnd = wL + vec3(-0.04, -0.2, 0.06);
  float cone = sdRoundCone(p, elL, wEnd, 0.15, 0.24);
  cone = max(abs(cone) - 0.02, dot(p - wEnd, normalize(wEnd - elL)) - 0.0);
  cone += 0.012 * sin(atan(p.x - wEnd.x, p.z - wEnd.z) * 7.0 + p.y * 5.0);
  sL = smin(sL, cone, 0.05);
  sleeve = min(sleeve, sL);
  sleeve += 0.005 * (fbm3(p * 18.0) - 0.5);
  r = umin(r, vec2(sleeve, 1.0));
  float hands = hand(p, HANDR, vec3(0.1, 1.0, 0.1), vec3(0.0, 0.0, 1.0), 1.4);
  hands = min(hands, hand(p, HANDL, vec3(-0.15, -0.7, 0.4), vec3(-1.0, 0.0, 0.0), 1.3));
  hands = smin(hands, armR, 0.03);
  r = umin(r, vec2(hands, 3.0));

  // ── 머리: 금 간 금빛 가면, 그 뒤는 어둠 ──
  const float HSC = 1.3;
  vec3 hq = (bend(p) - HEADC) / HSC;
  hq.yz = rot(0.15) * hq.yz;
  hq.xy = rot(-0.1) * hq.xy;
  float mask = sdEllipsoid(hq - vec3(0.0, 0.0, 0.05), vec3(0.15, 0.2, 0.15));
  mask = max(mask, -(hq.z + 0.0));
  float face = smin(mask, sdRoundCone(hq, vec3(0.0, 0.05, 0.19), vec3(0.0, -0.06, 0.215), 0.012, 0.02), 0.02);
  vec3 he = hq;
  he.x = abs(he.x);
  face = smax(face, -sdEllipsoid(he - vec3(0.065, 0.045, 0.17), vec3(0.04, 0.008, 0.03)), 0.008);
  face = smax(face, -sdEllipsoid(hq - vec3(0.0, -0.11, 0.17), vec3(0.035, 0.005, 0.03)), 0.006);
  r = umin(r, vec2(face * HSC, 6.0));
  // 뒤에서 가면을 붙잡은 길고 창백한 손가락들
  float fing = 1e5;
  for (int i = 0; i < 6; i++) {
    float sx = i < 3 ? -1.0 : 1.0;
    float fy = (float(i - (i < 3 ? 0 : 3)) - 1.0) * 0.085 - 0.01;
    vec3 a0 = vec3(0.19 * sx, fy + 0.03, -0.12);
    vec3 a1 = vec3(0.172 * sx, fy + 0.01, 0.03);
    vec3 a2 = vec3(0.13 * sx, fy - 0.01, 0.13);
    vec3 a3 = vec3(0.085 * sx, fy - 0.03, 0.16);
    fing = min(fing, min(sdRoundCone(hq, a0, a1, 0.012, 0.011), min(sdRoundCone(hq, a1, a2, 0.011, 0.009), sdRoundCone(hq, a2, a3, 0.009, 0.004))));
  }
  r = umin(r, vec2(fing * HSC, 10.0));
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, 0.0, -0.02), vec3(0.14, 0.19, 0.14)) * HSC, 99.0));
  vec3 tq = hq - vec3(0.0, 0.12, -0.03);
  tq.yz = rot(-0.1) * tq.yz;
  vec2 ti = tiara(tq);
  r = umin(r, vec2(ti.x * HSC, ti.y));
  // 햇살
  r = umin(r, vec2(sunburst(p), 4.0));

  // ── 향로 ──
  vec3 cc = p - CENSER;
  float cbd = length(p - mix(CENSER, HANDR, 0.5)) - 0.55;
  if (cbd < 0.1) {
    float bowl = sdSphere(cc, 0.14);
    bowl = max(bowl, -sdSphere(cc, 0.12));
    vec3 hp = polarRep(cc, 8.0);
    float holes = sdCapsule(hp, vec3(0.14, -0.03, 0.0), vec3(0.14, 0.06, 0.0), 0.02);
    bowl = max(bowl, -holes);
    bowl = min(bowl, sdTorus(cc, vec2(0.145, 0.012)));
    bowl = min(bowl, sdCappedCone(cc - vec3(0.0, 0.16, 0.0), 0.04, 0.11, 0.03));
    bowl = min(bowl, sdCylinder(cc + vec3(0.0, 0.16, 0.0), 0.025, 0.055));
    vec3 top = HANDR + vec3(0.0, -0.04, 0.0);
    float ch = 1e5;
    for (int i = 0; i < 3; i++) {
      float a = float(i) * 2.094;
      vec3 at = CENSER + vec3(cos(a) * 0.12, 0.02, sin(a) * 0.12);
      ch = min(ch, sdCapsule(p, at, top, 0.006));
    }
    r = umin(r, vec2(min(bowl, ch), 7.0));
    r = umin(r, vec2(sdSphere(cc + vec3(0.0, 0.02, 0.0), 0.1), 8.0));
  } else {
    r.x = min(r.x, cbd);
  }

  // ── 제례검: 물결 날, 끝이 땅에 닿는다 ──
  vec3 ax = normalize(HANDL - SWORD_TIP);
  vec3 sq = p - SWORD_TIP;
  float along = dot(sq, ax);
  vec3 side = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));
  vec3 nrm = cross(side, ax);
  float sx = dot(sq, side);
  float sz = dot(sq, nrm);
  float L = length(HANDL - SWORD_TIP);
  float w = 0.05 * smoothstep(0.0, 0.3, along) + 0.012 * sin(along * 20.0);
  float blade = max(max(abs(sx) - w, abs(sz) - 0.01), max(-along, along - (L - 0.16)));
  float guard = sdBox(vec3(sx, along - (L - 0.14), sz), vec3(0.17, 0.022, 0.025));
  float grip = sdCapsule(p, SWORD_TIP + ax * (L - 0.14), SWORD_TIP + ax * (L + 0.16), 0.022);
  float pommel = sdSphere(p - (SWORD_TIP + ax * (L + 0.19)), 0.04);
  r = umin(r, vec2(blade * 0.8, 9.0));
  r = umin(r, vec2(min(guard, min(grip, pommel)), 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검보라 벨벳 (다마스크 무늬), 아래로 갈수록 재에 그을림
    float dam = smoothstep(0.45, 0.55, noise(p * vec3(9.0, 5.0, 9.0)));
    float dirt = fbm3(p * 4.0);
    vec3 alb = vec3(0.034, 0.018, 0.04) * (0.7 + 0.6 * dirt) * (0.8 + 0.5 * dam);
    alb *= mix(0.45, 1.0, smoothstep(0.0, 0.7, p.y));
    return Mat(alb, 0.75, 0.25, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    float dirt = fbm3(p * 6.0);
    float blood = smoothstep(0.55, 0.75, fbm3(p * vec3(5.0, 2.0, 5.0) + 3.0)) * smoothstep(0.9, 0.1, p.y);
    vec3 alb = vec3(0.13, 0.12, 0.1) * (0.6 + 0.5 * dirt);
    alb = mix(alb, vec3(0.025, 0.024, 0.023), smoothstep(0.5, 0.0, p.y) * 0.7);
    alb = mix(alb, vec3(0.08, 0.008, 0.006), blood * 0.85);
    return Mat(alb, 0.8, 0.15, vec3(0.0), 0.0, 0.2, blood * 0.6);
  }
  if (id < 3.5) {
    float cr = smoothstep(0.08, 0.0, ridge(p * 26.0));
    vec3 alb = vec3(0.025, 0.02, 0.018) * (0.7 + 0.6 * fbm3(p * 30.0));
    return Mat(alb, 0.7, 0.3, vec3(2.4, 0.6, 0.12) * cr * 0.8, 0.0, 0.0, 0.0);
  }
  if (id < 4.5) {
    float pat = smoothstep(0.3, 0.7, noise(p * 40.0));
    float tarn = fbm3(p * 7.0);
    vec3 alb = vec3(0.24, 0.16, 0.06) * (0.5 + 0.5 * pat) * (0.45 + 0.6 * tarn);
    return Mat(alb, 0.32, 1.3, vec3(0.0), 0.05, 0.0, 0.1);
  }
  if (id < 5.5) {
    float pat = smoothstep(0.4, 0.6, noise(p * 30.0));
    vec3 alb = mix(vec3(0.1, 0.09, 0.08), vec3(0.22, 0.15, 0.06), pat * 0.6);
    return Mat(alb, 0.5, 0.6, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 6.5) {
    float cr = smoothstep(0.05, 0.0, ridge(p * vec3(14.0, 9.0, 14.0) + 2.0)) * smoothstep(0.4, 0.6, noise(p * 6.0));
    vec3 alb = vec3(0.42, 0.29, 0.1) * (0.75 + 0.3 * fbm3(p * 12.0));
    return Mat(alb * (1.0 - cr), 0.2, 1.8, vec3(1.2, 0.7, 2.6) * cr * 1.3, 0.08, 0.0, 0.35);
  }
  if (id < 7.5) {
    float rust = fbm3(p * 16.0);
    return Mat(vec3(0.07, 0.05, 0.025) * (0.6 + 0.8 * rust), 0.4, 1.0, vec3(0.0), 0.0, 0.0, 0.1);
  }
  if (id < 8.5) {
    float g = noise(p * 40.0);
    return Mat(vec3(0.05), 0.9, 0.0, vec3(3.0, 1.0, 0.25) * (0.5 + 0.8 * g), 0.0, 0.0, 0.0);
  }
  if (id > 9.5) {
    // 창백한 손가락
    vec3 alb = vec3(0.1, 0.09, 0.085) * (0.8 + 0.3 * fbm3(p * 40.0));
    return Mat(alb, 0.45, 0.5, vec3(0.0), 0.0, 0.6, 0.3);
  }
  float blood = smoothstep(0.5, 0.7, fbm3(p * 8.0)) * smoothstep(1.2, 0.2, p.y);
  vec3 alb = mix(vec3(0.05, 0.05, 0.055), vec3(0.06, 0.005, 0.004), blood);
  return Mat(alb, mix(0.18, 0.35, blood), 1.6, vec3(0.0), 0.0, 0.0, 0.3 + blood * 0.5);
}

// 향로 연기: 위로 오르다 머리 뒤로 퍼져 햇살 뒤의 장막이 된다
vec4 volume(vec3 p) {
  vec3 q = p - CENSER;
  float h = q.y;
  if (h < -0.2 || h > 1.6) return vec4(0.0);
  vec3 c = vec3(-0.75 * smoothstep(0.0, 1.2, h), 0.0, -0.7 * smoothstep(0.0, 1.0, h));
  float spread = 0.1 + h * 0.35;
  float rr = length((q - c).xz);
  float plume = smoothstep(spread, spread * 0.15, rr) * smoothstep(-0.2, 0.05, h) * smoothstep(1.6, 0.8, h);
  float w = fbm3(p * vec3(4.0, 2.5, 4.0) + vec3(0.0, -uSeed, 0.0));
  float w2 = fbm3(p * vec3(9.0, 5.0, 9.0) + 3.0);
  float dens = plume * pow(max(w * 1.3 - 0.2 + 0.3 * w2, 0.0), 2.0) * 7.0;
  vec3 col = mix(vec3(1.0, 0.42, 0.12) * 1.1, vec3(0.09, 0.075, 0.075), smoothstep(0.0, 0.45, h));
  return vec4(col, dens);
}
`,
  };
}
