// 대종 (2층 하수인) — 종탑의 마지막 종. 그을린 청동에 푸른 녹, 위에서 흘러내린 밀랍.
// 청동 속에서 얼굴과 손이 밀고 나온다 (종을 부을 때 쇳물에 바친 자들). 종추 자리엔 밧줄에 감긴 수도사가 매달려 있다.
// 숯이 된 굵은 기둥 두 개와 들보, 들보 위의 촛불. 금 간 틈과 아가리 속에서 불씨 빛이 샌다.

export default function greatBell() {
  const lipY = 1.6;
  const inner = [0.0, lipY + 0.35, 0.0];
  const beamY = lipY + 1.75 + 0.3;
  const candles = [
    [-0.62, beamY + 0.17 + 0.09, 0.12],
    [-0.38, beamY + 0.17 + 0.06, 0.16],
    [0.55, beamY + 0.17 + 0.09, 0.1],
    [-1.12, 2.32 + 0.1, 0.3],
  ];
  return {
    preset: 'act2',
    cam: { pos: [1.1, 0.3, 7.6], target: [0.0, 2.05, 0.0], fov: 1.6 },
    light: {
      key: [-0.45, 0.6, -0.75],
      keyCol: [1.25, 1.15, 1.05],
      fillCol: [0.2, 0.1, 0.035],
      amb: [0.022, 0.018, 0.016],
      rim: 1.4,
      pt: inner,
      ptCol: [2.6, 0.9, 0.25],
      exposure: 1.2,
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: {
      uL: [
        ...candles.map((c) => [c[0], c[1] + 0.06, c[2], 0.03]),
        [inner[0], inner[1] + 0.25, inner[2], 0.22],
      ],
      uLC: [
        ...candles.map(() => [1.0, 0.7, 0.3, 1.1]),
        [1.0, 0.4, 0.12, 0.16],
      ],
      uP: candles.map((c) => [c[0], c[1] + 0.06, c[2], 0]),
    },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 44
#define VOLUME_FAR 14.0
const float BH = 1.75;   // 종 높이
const float BR = 0.95;   // 입술 반지름
const vec3 BLIP = vec3(0.0, ${lipY.toFixed(3)}, 0.0);  // 입술 중심
const float BEAMY = ${beamY.toFixed(3)};

vec3 ptLight(vec3 p, vec3 n, vec3 lp, vec3 col, float fall) {
  vec3 l = lp - p;
  float d = length(l);
  return col * max(dot(n, l / d), 0.0) / (1.0 + d * d * fall);
}

float bellR(float t) {
  return BR * (0.5 + 0.5 * pow(1.0 - t, 2.4)) + BR * 0.05 * exp(-t * 25.0);
}
float bellDR(float t) {
  return (BR * (-1.2 * pow(max(1.0 - t, 0.0), 1.4)) - BR * 1.25 * exp(-t * 25.0)) / BH;
}

// 종 겉면에서 밀고 나오는 얼굴 (a 각도, y 높이, s 크기, tilt 기울기)
float faceBump(vec3 q, float a, float y, float s, float tilt) {
  float t = y / BH;
  vec3 er = vec3(cos(a), 0.0, sin(a));
  vec3 et = vec3(-sin(a), 0.0, cos(a));
  vec3 c = er * (bellR(t) - 0.02) + vec3(0.0, y, 0.0);
  vec3 l = q - c;
  vec3 f = vec3(dot(l, et), l.y, dot(l, er));
  f.xy = rot(tilt) * f.xy;
  // 길쭉한 두개골 + 늘어진 턱 (비명)
  float d = sdEllipsoid(f - vec3(0.0, 0.01, -0.01) * s, vec3(0.068, 0.085, 0.055) * s);
  d = smin(d, sdEllipsoid(f - vec3(0.0, -0.07, 0.0) * s, vec3(0.045, 0.06, 0.045) * s), 0.04 * s);
  vec3 fe = f;
  fe.x = abs(fe.x);
  // 눈썹뼈와 광대
  d = smin(d, sdEllipsoid(fe - vec3(0.028, 0.035, 0.04) * s, vec3(0.03, 0.012, 0.018) * s), 0.015 * s);
  d = smin(d, sdEllipsoid(fe - vec3(0.042, -0.02, 0.03) * s, vec3(0.018, 0.022, 0.02) * s), 0.02 * s);
  // 코
  d = smin(d, sdRoundCone(f, vec3(0.0, 0.025, 0.045) * s, vec3(0.0, -0.012, 0.062) * s, 0.008 * s, 0.012 * s), 0.012 * s);
  // 감긴 채 움푹 꺼진 눈
  d = smax(d, -sdEllipsoid(fe - vec3(0.026, 0.015, 0.058) * s, vec3(0.017, 0.009, 0.012) * s), 0.01 * s);
  // 세로로 찢어지게 벌린 입
  d = smax(d, -sdEllipsoid(f - vec3(0.0, -0.075, 0.045) * s, vec3(0.018, 0.04, 0.03) * s), 0.012 * s);
  return d;
}
// 안에서 미는 손바닥 + 손가락 넷
float handBump(vec3 q, float a, float y, float s, float tilt) {
  float t = y / BH;
  vec3 er = vec3(cos(a), 0.0, sin(a));
  vec3 et = vec3(-sin(a), 0.0, cos(a));
  vec3 c = er * (bellR(t) - 0.025) + vec3(0.0, y, 0.0);
  vec3 l = q - c;
  vec3 f = vec3(dot(l, et), l.y, dot(l, er));
  f.xy = rot(tilt) * f.xy;
  float d = sdEllipsoid(f, vec3(0.042, 0.05, 0.028) * s);
  for (int i = 0; i < 4; i++) {
    float o = float(i) - 1.5;
    vec3 k0 = vec3(o * 0.02, 0.035, 0.0) * s;
    vec3 k1 = k0 + vec3(o * 0.022, 0.05 - abs(o) * 0.006, 0.006) * s;
    vec3 k2 = k1 + vec3(o * 0.016, 0.042 - abs(o) * 0.008, -0.002) * s;
    d = smin(d, sdRoundCone(f, k0, k1, 0.009 * s, 0.008 * s), 0.012 * s);
    d = smin(d, sdRoundCone(f, k1, k2, 0.008 * s, 0.006 * s), 0.006 * s);
  }
  d = smin(d, sdRoundCone(f, vec3(0.03, -0.01, 0.0) * s, vec3(0.085, 0.03, 0.004) * s, 0.011 * s, 0.007 * s), 0.012 * s);
  return d;
}

// 종 몸체: q는 입술 중심 기준
float bell(vec3 q) {
  float rho = length(q.xz);
  float t = clamp(q.y / BH, 0.0, 1.0);
  float r = bellR(t);
  float th = BR * (0.035 + 0.05 * exp(-t * 7.0));
  float slope = sqrt(1.0 + bellDR(t) * bellDR(t));
  float d = (abs(rho - (r - th)) - th) / slope;
  d = max(d, -q.y);
  d = max(d, q.y - BH);
  float dome = sdEllipsoid(q - vec3(0.0, BH - 0.02, 0.0), vec3(bellR(1.0), 0.28 * BR, bellR(1.0)));
  d = smin(d, dome, 0.06);
  d = smin(d, sdTorus(q - vec3(0.0, 0.035, 0.0), vec2(bellR(0.0) - th * 0.6, 0.032)), 0.02);
  float bands = sdTorus(q - vec3(0.0, BH * 0.13, 0.0), vec2(bellR(0.13) - 0.005, 0.016));
  bands = min(bands, sdTorus(q - vec3(0.0, BH * 0.66, 0.0), vec2(bellR(0.66) - 0.004, 0.013)));
  bands = min(bands, sdTorus(q - vec3(0.0, BH * 0.8, 0.0), vec2(bellR(0.8) - 0.004, 0.013)));
  bands = min(bands, sdTorus(q - vec3(0.0, BH * 0.93, 0.0), vec2(bellR(0.93) - 0.002, 0.02)));
  d = smin(d, bands, 0.012);
  float ang = atan(q.z, q.x);
  // 명문 띠
  if (t > 0.67 && t < 0.78 && rho > r - th) {
    float g = noise(vec3(ang * 34.0, q.y * 26.0, 3.0));
    float row = smoothstep(0.0, 0.02, abs(fract(q.y * 13.0) - 0.5) - 0.12);
    d -= 0.006 * smoothstep(0.52, 0.6, g) * row;
  }
  // 밀고 나오는 얼굴과 손 (앞쪽)
  if (q.z > -0.3 && t > 0.06 && t < 0.68) {
    float bump = faceBump(q, 1.38, 0.62, 2.3, 0.08);
    bump = min(bump, faceBump(q, 2.05, 0.5, 1.9, -0.3));
    bump = min(bump, faceBump(q, 0.72, 0.42, 1.7, 0.35));
    bump = min(bump, handBump(q, 1.0, 0.85, 2.2, -0.45));
    bump = min(bump, handBump(q, 1.72, 0.3, 2.0, 0.25));
    bump = min(bump, handBump(q, 2.45, 0.78, 1.8, 0.55));
    d = smin(d, bump, 0.12);
  }
  // 금: 입술에서 위로 갈라진 틈
  float ca = ang - 0.42 - 0.06 * (noise(vec3(q.y * 7.0, 1.0, 0.0)) - 0.5) - 0.03 * q.y;
  float crack = abs(ca) * rho - 0.009 * (1.0 - t * 1.6);
  d = max(d, -max(crack, q.y - BH * 0.55));
  d += 0.004 * (fbm3(q * 20.0) - 0.5);
  return d;
}

// 종추 자리에 매달린 말라붙은 수도사: 꺾인 목, 두건, 늘어진 긴 팔, 찢어진 수의, 맨발
const vec3 PIVOT = vec3(0.0, ${(lipY + 0.95).toFixed(3)}, 0.0);
const float HS = 0.82;
vec3 hangQ(vec3 p) {
  vec3 q = p - PIVOT;
  q.xy = rot(-0.05) * q.xy;
  q.yz = rot(0.05) * q.yz;
  q.xz = rot(-0.4) * q.xz;
  return q / HS;
}
vec3 headQ(vec3 q) {
  vec3 hq = q - vec3(0.03, -1.12, 0.02);
  hq.xy = rot(0.62) * hq.xy;
  hq.yz = rot(0.42) * hq.yz;
  return hq;
}
float hanged(vec3 p) {
  vec3 q = hangQ(p);
  float bb = length(q - vec3(0.0, -1.65, 0.0)) - 1.2;
  if (bb > 0.15) return bb * HS;
  // 목을 맨 밧줄 (종 속 어둠으로)
  float d = sdCapsule(q, vec3(0.0, 0.2, 0.0), vec3(0.0, -1.02, 0.0), 0.022);
  // 옆으로 꺾이고 숙인 두건 머리
  vec3 hq = headQ(q);
  float head = sdEllipsoid(hq, vec3(0.095, 0.115, 0.105));
  head = smin(head, sdEllipsoid(hq - vec3(0.0, 0.03, -0.045), vec3(0.11, 0.13, 0.11)), 0.03);
  head = smin(head, sdRoundCone(hq, vec3(0.0, 0.05, -0.06), vec3(0.0, 0.2, -0.17), 0.08, 0.012), 0.05);
  // 처진 어깨와 몸통
  float body = sdEllipsoid(q - vec3(0.0, -1.3, 0.0), vec3(0.19, 0.075, 0.11));
  body = smin(body, sdRoundCone(q, vec3(0.0, -1.33, 0.0), vec3(0.0, -1.85, 0.01), 0.14, 0.11), 0.07);
  // 늘어진 긴 팔과 손가락
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 sh = vec3(0.17 * sx, -1.31, 0.0);
    vec3 el = vec3(0.205 * sx, -1.63, 0.03);
    vec3 wr = vec3(0.19 * sx, -1.93, 0.05);
    body = smin(body, sdRoundCone(q, sh, el, 0.05, 0.036), 0.04);
    body = smin(body, sdRoundCone(q, el, wr, 0.036, 0.026), 0.02);
    for (int f = 0; f < 3; f++) {
      float o = (float(f) - 1.0) * 0.016;
      body = smin(body, sdRoundCone(q, wr + vec3(o * sx, -0.02, 0.0), wr + vec3(o * 1.6 * sx, -0.15 + abs(o) * 1.5, 0.025), 0.012, 0.005), 0.012);
    }
  }
  // 무릎까지 오는 찢어진 수의
  float skirt = sdRoundCone(q, vec3(0.0, -1.8, 0.01), vec3(0.0, -2.15, 0.03), 0.12, 0.135);
  float hem = -2.1 - 0.09 * fbm3(vec3(q.x * 14.0, 0.0, q.z * 14.0));
  skirt = max(skirt, hem - q.y);
  body = smin(body, skirt, 0.03);
  // 해진 수의 자락
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.7 + 0.4;
    vec3 c = vec3(cos(a) * 0.12, -2.12, sin(a) * 0.12);
    float L = 0.12 + 0.08 * fract(a * 3.1);
    body = smin(body, sdRoundCone(q, c, c + vec3(cos(a) * 0.02, -L, sin(a) * 0.02), 0.03, 0.006), 0.02);
  }
  // 앙상한 정강이와 늘어진 맨발
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 kn = vec3(0.055 * sx, -2.06, 0.04);
    vec3 an = vec3(0.06 * sx + 0.01, -2.45, 0.0);
    body = smin(body, sdRoundCone(q, kn, an, 0.045, 0.028), 0.02);
    body = smin(body, sdRoundCone(q, an, an + vec3(0.005 * sx, -0.12, 0.06), 0.03, 0.017), 0.02);
  }
  body += 0.01 * (fbm3(q * vec3(10.0, 4.0, 10.0)) - 0.5);
  d = min(d, smin(head, body, 0.04));
  return d * HS;
}

float candle(vec3 p, vec3 base, float h, float r) {
  vec3 q = p - base;
  float d = sdCylinder(q - vec3(0.0, h * 0.5, 0.0), h * 0.5, r);
  d = smin(d, sdEllipsoid(q - vec3(0.0, 0.01, 0.0), vec3(r * 2.2, 0.025, r * 2.0)), 0.02);
  return d;
}

vec2 sdf(vec3 p) {
  vec3 q = p - BLIP;
  q.xy = rot(0.035) * q.xy;
  vec2 r = vec2(1e5, 0.0);
  float bb = length(q - vec3(0.0, 0.9, 0.0)) - 1.62;
  if (bb < 0.2) r = vec2(bell(q), 1.0);
  else r.x = bb;

  // 매달린 수도사
  r = umin(r, vec2(hanged(p), 5.0));

  // 들보: 굵고 그을렸다
  vec3 hq = p - vec3(0.0, BEAMY, 0.0);
  float beam = sdRoundBox(hq, vec3(1.42, 0.17, 0.22), 0.03);
  beam += 0.01 * (fbm3(p * vec3(2.5, 12.0, 12.0)) - 0.5);
  // 기둥 둘 + 버팀대
  float posts = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    posts = min(posts, sdRoundBox(p - vec3(1.27 * sx, BEAMY * 0.5, 0.0), vec3(0.14, BEAMY * 0.5 + 0.05, 0.17), 0.03));
    posts = min(posts, sdCapsule(p, vec3(1.25 * sx, BEAMY - 0.6, 0.0), vec3(0.85 * sx, BEAMY - 0.12, 0.0), 0.07));
    posts = min(posts, sdRoundBox(p - vec3(1.27 * sx, 0.07, 0.0), vec3(0.3, 0.07, 0.42), 0.03));
  }
  posts += 0.01 * (fbm3(p * vec3(12.0, 2.5, 12.0)) - 0.5);
  r = umin(r, vec2(min(beam, posts), 2.0));

  // 쇠: 종을 묶은 고리, 들보 띠
  float iron = 1e5;
  for (int i = 0; i < 3; i++) {
    float x = (float(i) - 1.0) * 0.2;
    iron = min(iron, sdTorus((p - vec3(x, BLIP.y + BH + 0.14, 0.0)).xzy, vec2(0.09, 0.024)));
  }
  iron = min(iron, sdBox(hq - vec3(-0.9, 0.0, 0.0), vec3(0.035, 0.19, 0.235)));
  iron = min(iron, sdBox(hq - vec3(0.9, 0.0, 0.0), vec3(0.035, 0.19, 0.235)));
  iron = min(iron, sdBox(p - vec3(-1.27, 2.9, 0.0), vec3(0.155, 0.04, 0.185)));
  iron = min(iron, sdBox(p - vec3(1.27, 1.3, 0.0), vec3(0.155, 0.04, 0.185)));
  r = umin(r, vec2(iron, 3.0));

  // 종을 치는 밧줄: 들보에서 늘어져 재 위에 사려 있다
  float rope = sdCapsule(p, vec3(0.98, BEAMY - 0.17, 0.26), vec3(1.0, 1.4, 0.36), 0.02);
  rope = min(rope, sdCapsule(p, vec3(1.0, 1.4, 0.36), vec3(0.9, 0.2, 0.5), 0.02));
  rope = min(rope, sdTorus(p - vec3(0.75, 0.16, 0.55), vec2(0.17, 0.028)));
  rope = min(rope, sdTorus(p - vec3(0.78, 0.2, 0.52), vec2(0.13, 0.026)));
  r = umin(r, vec2(rope, 7.0));

  // 촛불
  float cd = 1e5;
  cd = min(cd, candle(p, vec3(-0.62, BEAMY + 0.17, 0.12), 0.09, 0.03));
  cd = min(cd, candle(p, vec3(-0.38, BEAMY + 0.17, 0.16), 0.06, 0.028));
  cd = min(cd, candle(p, vec3(0.55, BEAMY + 0.17, 0.1), 0.09, 0.032));
  cd = min(cd, candle(p, vec3(-1.12, 2.32, 0.3), 0.1, 0.035));
  r = umin(r, vec2(cd, 6.0));
  // 촛대 받침 (기둥에 박힌 쇠)
  float holder = sdCylinder(p - vec3(-1.12, 2.3, 0.3), 0.012, 0.065);
  holder = min(holder, sdCapsule(p, vec3(-1.12, 2.29, 0.3), vec3(-1.2, 2.2, 0.15), 0.014));
  r = umin(r, vec2(holder, 3.0));

  // 잿더미
  float ash = sdEllipsoid(p - vec3(-1.3, 0.0, 0.15), vec3(0.75, 0.2, 0.75));
  ash = smin(ash, sdEllipsoid(p - vec3(1.35, 0.0, 0.05), vec3(0.7, 0.16, 0.7)), 0.25);
  ash = smin(ash, sdEllipsoid(p - vec3(0.15, -0.04, 0.2), vec3(0.9, 0.12, 0.65)), 0.35);
  ash += 0.07 * (fbm3(p * 4.0) - 0.5) + 0.02 * (noise(p * 18.0) - 0.5);
  r = umin(r, vec2(ash, 4.0));
  return r;
}

vec3 candleLight(vec3 p, vec3 n) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) c += ptLight(p, n, uP[i].xyz, vec3(1.0, 0.62, 0.28), 14.0);
  // 종 아래 불씨 안개가 위로 비추는 빛
  c += ptLight(p, n, vec3(0.0, BLIP.y - 0.5, 0.75), vec3(1.0, 0.42, 0.13) * 2.4, 0.9);
  return c * 0.9;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 cl = candleLight(p, n);
  if (id < 1.5) {
    // 그을린 청동: 아래로 갈수록 그을음, 홈과 위쪽엔 푸른 녹, 위에서 흘러내린 밀랍
    vec3 q = p - BLIP;
    float ang = atan(q.z, q.x);
    float t = clamp(q.y / BH, 0.0, 1.0);
    float rho = length(q.xz);
    float pat = fbm3(p * 6.0);
    float verd = smoothstep(0.45, 0.72, fbm3(p * vec3(9.0, 4.0, 9.0)) + 0.3 * smoothstep(0.4, 1.0, t));
    float soot = clamp(smoothstep(0.45, 0.0, t) * 0.6 + 0.5 * fbm3(p * vec3(3.0, 0.8, 3.0) + 4.0), 0.0, 1.0);
    vec3 bronze = vec3(0.1, 0.062, 0.03) * (0.6 + 0.8 * pat);
    vec3 alb = mix(bronze, vec3(0.03, 0.06, 0.05), verd * 0.85);
    alb *= 1.0 - soot * 0.65;
    float rough = mix(0.35, 0.85, max(verd, soot * 0.6));
    float spec = mix(1.0, 0.12, max(verd, soot * 0.6));
    // 밀랍 줄기 (가늘고 드물게)
    float lane = noise(vec3(ang * 9.0, 0.0, 1.0));
    float dripLen = 0.55 + 0.4 * noise(vec3(ang * 23.0, 2.0, 0.0));
    float wax = smoothstep(0.78, 0.8, lane) * smoothstep(dripLen - 0.03, dripLen + 0.03, t);
    wax = 0.0;
    // 금 간 틈의 불씨
    float ca = ang - 0.42 - 0.06 * (noise(vec3(q.y * 7.0, 1.0, 0.0)) - 0.5) - 0.03 * q.y;
    float crack = smoothstep(0.024, 0.0, abs(ca) * rho) * step(q.y, BH * 0.55) * step(rho, bellR(t) + 0.02);
    vec3 emi = vec3(2.6, 0.8, 0.18) * crack * (0.5 + 0.5 * noise(p * 30.0));
    emi += alb * cl;
    return Mat(alb, rough, spec, emi, 0.04, wax * 0.6, 0.12);
  }
  if (id < 2.5) {
    // 숯이 된 목재
    float grain = noise(p * vec3(40.0, 3.0, 40.0)) * 0.5 + noise(p * vec3(3.0, 40.0, 40.0)) * 0.5;
    float charc = smoothstep(0.1, 0.0, ridge(p * vec3(6.0, 6.0, 6.0)));
    vec3 alb = vec3(0.035, 0.027, 0.02) * (0.55 + 0.7 * grain) * (1.0 - charc * 0.75);
    return Mat(alb, 0.88, 0.18, alb * cl, 0.0, 0.0, 0.0);
  }
  if (id < 3.5) {
    float rust = fbm3(p * 18.0);
    vec3 alb = vec3(0.035, 0.026, 0.02) * (0.6 + 0.8 * rust);
    return Mat(alb, 0.55, 0.6, alb * cl, 0.0, 0.0, 0.05);
  }
  if (id < 4.5) {
    // 재
    float g = fbm3(p * 9.0);
    vec3 alb = vec3(0.032, 0.031, 0.03) * (0.6 + 0.6 * g);
    return Mat(alb, 0.95, 0.03, alb * cl, 0.0, 0.0, 0.0);
  }
  if (id < 5.5) {
    // 말라붙은 수의와 회색 살갗. 두건 속 얼굴은 어둠
    vec3 q = hangQ(p);
    vec3 hq = headQ(q);
    float g = fbm3(p * 14.0);
    vec3 alb = vec3(0.07, 0.06, 0.047) * (0.6 + 0.6 * g);
    if (q.y < -2.12 || (abs(q.x) > 0.15 && q.y < -1.6)) alb = vec3(0.1, 0.088, 0.078) * (0.7 + 0.5 * g);
    float face = smoothstep(0.02, 0.07, hq.z) * smoothstep(0.02, -0.05, hq.y);
    alb *= 1.0 - 0.9 * face;
    return Mat(alb, 0.85, 0.15, alb * cl, 0.0, 0.25, 0.0);
  }
  if (id < 6.5) return Mat(vec3(0.3, 0.26, 0.18), 0.45, 0.3, vec3(0.3, 0.26, 0.18) * cl * 1.5, 0.0, 0.85, 0.1);
  // 밧줄
  float tw = 0.5 + 0.5 * sin((p.x + p.y + p.z) * 160.0);
  vec3 alb = vec3(0.06, 0.05, 0.035) * (0.7 + 0.4 * tw);
  return Mat(alb, 0.9, 0.1, alb * cl, 0.0, 0.0, 0.0);
}
vec4 volume(vec3 p) {
  vec3 q = p - BLIP;
  float rad = length(q.xz);
  float below = -q.y;
  vec4 v = vec4(0.0);
  // 종 아가리에서 쏟아지는 불씨 빛 안개
  if (below > -0.15 && below < 1.9 && rad < 1.6) {
    float coneR = BR * (0.78 + below * 0.22);
    float inCone = smoothstep(coneR, coneR * 0.25, rad) * smoothstep(-0.15, 0.1, below) * smoothstep(1.9, 0.9, below) * smoothstep(0.05, -0.35, p.z);
    float w = fbm3(p * vec3(2.6, 1.2, 2.6) + vec3(0.0, uSeed, 0.0));
    float smoke = 0.15 + 2.2 * w * w;
    float dens = inCone * smoke * 2.6;
    vec3 col = vec3(1.0, 0.4, 0.11) * 0.75 * exp(-max(below, 0.0) * 1.0);
    v = vec4(col, dens);
  }
  // 바닥에 깔린 재 안개
  float lowR = length(vec2(p.x * 0.6, p.z));
  if (p.y < 0.7 && lowR < 1.5) {
    float h = smoothstep(0.7, 0.05, p.y) * smoothstep(1.5, 0.6, lowR);
    float dn = h * (0.25 + 0.75 * fbm3(p * 2.5 + 7.0)) * 0.22;
    vec3 c2 = vec3(0.06, 0.05, 0.045);
    float tot = v.w + dn;
    if (tot > 0.0) v = vec4((v.rgb * v.w + c2 * dn) / tot, tot);
  }
  return v;
}
`,
  };
}
