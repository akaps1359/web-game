// 1층 배경 — 안개 항구 지하 수로.
// 벽돌 궁륭이 끝없이 이어지는 침수된 운하. 천장의 쇠창살로 잿빛 낮빛이 기둥처럼 떨어지고,
// 그 빛 속 물 위에 두건 쓴 형체가 서 있다. 벽의 등불(호박색)과 녹회색 안개, 물에 비친 빛줄기.
// 기법: 조명은 material()의 emi로 직접 계산(등불 여러 개 + 해석적 빛기둥), 물은 반사 광선을 따로 추적,
// 빛기둥의 산란은 overlay()에서 기둥 구간만 촘촘히 적분.

export default function bgAct1() {
  const W = 4.2;
  const lx = W - 0.5;
  // 벽 등불: 앞쪽 6개는 등불 모양까지, 마지막은 옆 통로 안의 빛
  const lamps = [
    [-lx, 2.7, 0.0, 1.0],
    [lx, 2.7, -12.0, 1.0],
    [-lx, 2.7, -18.0, 0.95],
    [lx, 2.7, -24.0, 0.85],
    [-lx, 2.7, -30.0, 0.8],
    [lx, 2.7, -36.0, 0.7],
    [-(W + 2.3), 1.6, -15.0, 0.8],
  ];
  return {
    preset: 'act1',
    cam: { pos: [-0.6, 1.7, 8.5], target: [0.45, -2.55, -19.5], fov: 1.12 },
    light: {
      key: [0.0, -1.0, 0.02],
      keyCol: [0, 0, 0],
      fill: [0.0, 0.25, -1.0],
      fillCol: [0.045, 0.07, 0.065],
      amb: [0.02, 0.028, 0.027],
      rim: 0.0,
      fog: [0.03, 0.045, 0.043],
      glow: 0.0,
      exposure: 1.3,
    },
    arrays: {
      // 등불 7개 + 두건 속 희미한 두 눈
      uL: [...lamps.map((l, i) => [l[0], l[1], l[2], i === 6 ? 0.3 : 0.15]), [0.815, 1.62, -6.27, 0.018], [0.885, 1.62, -6.27, 0.018]],
      uLC: [...lamps.map((l, i) => [1.0, 0.6, 0.27, (i === 6 ? 0.25 : 0.7) * l[3]]), [0.6, 1.0, 0.75, 0.4], [0.6, 1.0, 0.75, 0.4]],
    },
    glsl: /* glsl */ `
#define HAS_BG
#define HAS_VOLUME
#define HAS_OVERLAY
#define VOLUME_STEPS 40
#define VOLUME_FAR 46.0
#define NLAMP 7

const float W = ${W.toFixed(2)};
const float SPRING = 3.6;
const float WALK = 0.75;
const float CH = 2.6;
const float BAY = 6.0;
const vec3 GRATE = vec3(0.0, 7.8, -9.0);
const vec2 GSIZE = vec2(0.8, 1.0);
const vec3 SUNC = vec3(0.82, 1.0, 0.93);
const vec3 LAMPC = vec3(1.0, 0.56, 0.22);
const vec3 FIG = vec3(0.85, 0.0, -6.7);
const vec3 POOL = vec3(0.94, 0.0, -6.3);

vec3 sunDir() { return normalize(vec3(-0.12, 1.0, -0.35)); }

float box2(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
float profile(vec2 q) {
  q.x = abs(q.x);
  vec2 c = q - vec2(0.0, SPRING);
  return c.y < 0.0 ? q.x - W : length(c) - W;
}
// 벽돌 무늬: (가장자리까지 거리, 벽돌 난수)
vec2 brick(vec2 uv, vec2 size) {
  vec2 b = uv / size;
  float row = floor(b.y);
  b.x += mod(row, 2.0) * 0.5;
  vec2 cell = floor(b);
  vec2 f = fract(b);
  vec2 e = min(f, 1.0 - f) * size;
  return vec2(min(e.x, e.y), hash31(vec3(cell, 3.0)));
}
// 벽면 좌표 (길이 방향 z, 단면을 따라 잰 높이)
vec2 wallUV(vec3 p) {
  vec2 c = vec2(abs(p.x), p.y - SPRING);
  float v = c.y < 0.0 ? p.y : SPRING + W * atan(c.y, c.x);
  return vec2(p.z, v);
}
const vec2 BRICK = vec2(0.3, 0.125);

float lantern(vec3 p, vec3 c, float side) {
  vec3 q = p - c;
  float cage = sdRoundBox(q, vec3(0.12, 0.19, 0.12), 0.015);
  cage = max(cage, -sdBox(q, vec3(0.092, 0.155, 0.2)));
  cage = max(cage, -sdBox(q, vec3(0.2, 0.155, 0.092)));
  cage = min(cage, sdCappedCone(q - vec3(0.0, 0.24, 0.0), 0.06, 0.14, 0.035));
  float arm = sdCapsule(p, c + vec3(0.0, 0.3, 0.0), vec3(side * W, c.y + 0.3, c.z), 0.025);
  arm = min(arm, sdCapsule(p, vec3(side * W, c.y - 0.2, c.z), vec3(side * (W - 0.3), c.y + 0.3, c.z), 0.02));
  return min(cage, arm);
}

vec2 sdf(vec3 p) {
  float ax = abs(p.x);
  float prof = profile(p.xy);
  float wall = -prof;
  float zr = p.z - BAY * floor(p.z / BAY + 0.5);
  float rib = max(-prof - 0.36, abs(zr) - 0.45);
  // 옆 통로 (기둥 사이)
  float zc = p.z - BAY * floor(p.z / BAY) - BAY * 0.5;
  vec2 aq = vec2(abs(zc), p.y - 1.9);
  float arch = aq.y < 0.0 ? aq.x - 1.4 : length(aq) - 1.4;
  float passage = max(arch, max(W - 0.7 - ax, ax - (W + 3.4)));
  wall = max(wall, -passage);
  // 벽돌 결 (표면 가까이에서만)
  if (wall < 0.06) {
    vec2 bk = brick(wallUV(p), BRICK);
    wall += 0.009 * (1.0 - smoothstep(0.0, 0.016, bk.x)) - 0.006 * bk.y * smoothstep(0.0, 0.02, bk.x);
  }
  // 천장 쇠창살 구멍과 그 위로 뚫린 비스듬한 굴
  vec3 sd = sunDir();
  float s = (p.y - GRATE.y) / sd.y;
  vec3 gp = p - sd * s;
  vec2 o = gp.xz - GRATE.xz;
  float shaft = max(max(abs(o.x) - GSIZE.x, abs(o.y) - GSIZE.y) * 0.75, GRATE.y - 1.0 - p.y);
  wall = max(wall, -shaft);
  rib = max(rib, -shaft);
  vec2 r = vec2(wall, 1.0);
  // 바닥: 보도 + 물가 연석
  float walk = max(CH - ax, p.y - WALK);
  float curb = box2(vec2(ax - CH - 0.2, p.y - WALK - 0.04), vec2(0.2, 0.06)) - 0.02;
  float stone = min(min(rib, walk), curb);
  // 계류 말뚝
  vec3 bq = vec3(ax - CH - 0.38, p.y - WALK, zr - 0.9);
  stone = min(stone, sdCappedCone(bq - vec3(0.0, 0.25, 0.0), 0.25, 0.15, 0.12));
  stone = min(stone, sdCylinder(bq - vec3(0.0, 0.52, 0.0), 0.04, 0.17));
  r = umin(r, vec2(stone, 2.0));
  // 오른쪽 벽을 따라 달리는 녹슨 관 두 줄
  {
    float pipe = min(length(vec2(p.x - (W - 0.22), p.y - 3.15)) - 0.15, length(vec2(p.x - (W - 0.2), p.y - 3.52)) - 0.1);
    float band = abs(p.z - 1.5 * floor(p.z / 1.5 + 0.5)) - 0.03;
    pipe = min(pipe, max(min(length(vec2(p.x - (W - 0.22), p.y - 3.15)) - 0.17, length(vec2(p.x - (W - 0.2), p.y - 3.52)) - 0.12), band));
    r = umin(r, vec2(pipe, 5.0));
  }
  // 물
  r = umin(r, vec2(p.y, 3.0));
  // 쇠창살
  vec3 gq = p - vec3(GRATE.x, GRATE.y - 0.16, GRATE.z);
  float bz = gq.z - 0.3 * floor(gq.z / 0.3 + 0.5);
  float bars = max(sdBox(vec3(gq.x, gq.y, bz), vec3(GSIZE.x + 0.2, 0.05, 0.045)), abs(gq.z) - GSIZE.y - 0.1);
  bars = min(bars, max(sdBox(gq, vec3(GSIZE.x + 0.2, 0.06, GSIZE.y + 0.2)), -sdBox(gq, vec3(GSIZE.x, 0.2, GSIZE.y))));
  r = umin(r, vec2(bars, 5.0));
  // 등불 (경계 구 밖에서는 구까지의 거리만)
  for (int i = 0; i < 6; i++) {
    vec3 c = uL[i].xyz;
    float side = sign(c.x);
    float bd = length(p - vec3(c.x + side * 0.25, c.y + 0.05, c.z)) - 0.6;
    if (bd > 0.0) {
      r.x = min(r.x, bd + 0.05);
      continue;
    }
    r = umin(r, vec2(lantern(p, c, side), 5.0));
    r = umin(r, vec2(sdEllipsoid(p - c, vec3(0.07, 0.12, 0.07)), 6.0));
  }
  // 보도 위의 나무통과 상자 (밀수품)
  if (ax > CH && p.y < WALK + 1.4) {
    vec3 q = p - vec3(-3.45, WALK, -8.3);
    float bar1 = max(length(q.xz) - 0.27 - 0.035 * (1.0 - pow((q.y - 0.42) / 0.42, 2.0)), abs(q.y - 0.42) - 0.42);
    vec3 q2 = p - vec3(-3.3, WALK, -9.05);
    float bar2 = max(length(q2.xz) - 0.27 - 0.035 * (1.0 - pow((q2.y - 0.42) / 0.42, 2.0)), abs(q2.y - 0.42) - 0.42);
    float barrels = min(bar1, bar2);
    vec3 cq = p - vec3(3.45, WALK + 0.3, -9.4);
    cq.xz = rot(0.3) * cq.xz;
    float crate = sdBox(cq, vec3(0.32, 0.3, 0.32));
    vec3 cq2 = p - vec3(3.4, WALK + 0.82, -9.3);
    cq2.xz = rot(-0.2) * cq2.xz;
    crate = min(crate, sdBox(cq2, vec3(0.26, 0.22, 0.26)));
    r = umin(r, vec2(min(barrels, crate), 4.0));
  } else r.x = min(r.x, max(CH - ax, p.y - WALK - 1.4) + 0.05);
  // 왼쪽 앞에 매어 둔 나룻배 (바닥이 있는 선체)
  {
    vec3 q = p - vec3(-1.62, 0.22, 2.4);
    q.xz = rot(0.1) * q.xz;
    float hull = sdEllipsoid(q, vec3(0.62, 0.5, 2.0));
    hull = max(hull, q.y - 0.2);
    float inner = max(sdEllipsoid(q - vec3(0.0, 0.1, 0.0), vec3(0.54, 0.45, 1.88)), -0.12 - q.y);
    hull = max(hull, -inner);
    float seat = sdBox(q - vec3(0.0, 0.05, 0.3), vec3(0.55, 0.025, 0.14));
    r = umin(r, vec2(min(hull, seat), 4.0));
  }
  // 빛기둥 속에 선 형체
  {
    vec3 b = p - FIG + vec3(0.0, 0.3, 0.0);
    float fb = length(b - vec3(0.0, 1.1, 0.0)) - 1.5;
    if (fb > 0.0) r.x = min(r.x, fb + 0.05);
    else {
      const float H = 1.78;
      float hunch = max(b.y - 1.0, 0.0);
      b.z -= 0.3 * hunch * hunch;
      float robe = sdRobe(b, H, 0.17, 0.3, 9.0, 0.03);
      robe = smin(robe, sdEllipsoid(b - vec3(0.0, H - 0.18, 0.0), vec3(0.23, 0.22, 0.16)), 0.1);
      robe = smin(robe, sdHood(b, vec3(0.0, H + 0.18, 0.05), 0.165), 0.05);
      // 지나치게 긴 팔: 소매 끝이 물에 닿을 듯 늘어졌다
      float arms = min(sdRoundCone(b, vec3(-0.22, H - 0.12, 0.0), vec3(-0.3, 0.42, 0.12), 0.075, 0.055), sdRoundCone(b, vec3(0.22, H - 0.12, 0.0), vec3(0.31, 0.48, 0.08), 0.075, 0.055));
      robe = smin(robe, arms, 0.05);
      r = umin(r, vec2(robe, 7.0));
      r = umin(r, vec2(sdSphere(b - vec3(0.0, H + 0.15, 0.04), 0.12), 99.0));
    }
  }
  return r;
}

// 해석적 빛기둥: 쇠창살을 지나온 낮빛 (0~1)
float beam(vec3 p) {
  vec3 sd = sunDir();
  float s = (GRATE.y - 0.16 - p.y) / sd.y;
  if (s < -0.05) return 0.0;
  vec3 q = p + sd * s;
  vec2 o = q.xz - GRATE.xz;
  float pen = 0.02 + 0.02 * s;
  float m = smoothstep(-pen, pen, GSIZE.x - abs(o.x)) * smoothstep(-pen, pen, GSIZE.y - abs(o.y));
  float bz = abs(o.y - 0.3 * floor(o.y / 0.3 + 0.5));
  m *= smoothstep(0.045 - pen * 0.5, 0.045 + pen * 0.5, bz);
  return m;
}

vec3 background(vec3 rd) {
  // 안개 색: 운하 저 끝 쪽이 희미하게 밝다
  vec3 c = vec3(0.026, 0.04, 0.038);
  float fwd = max(-rd.z, 0.0);
  c += vec3(0.05, 0.075, 0.07) * pow(fwd, 18.0) * smoothstep(-0.25, 0.1, rd.y);
  return c;
}

vec3 lampLight(vec3 p, vec3 n, vec3 V, float rough, float spec, out vec3 sp) {
  vec3 dif = vec3(0.0);
  sp = vec3(0.0);
  for (int i = 0; i < NLAMP; i++) {
    vec3 lp = uL[i].xyz - p;
    float d2 = dot(lp, lp);
    vec3 l = lp * inversesqrt(d2);
    vec3 c = LAMPC * (uLC[i].w / 0.7) * 4.5 / (1.0 + d2 * 1.1);
    dif += c * max(dot(n, l), 0.0);
    vec3 h = normalize(l + V);
    sp += c * pow(max(dot(n, h), 0.0), mix(220.0, 10.0, rough)) * spec;
  }
  return dif;
}
float aoL(vec3 p, vec3 n) {
  float o = 0.0;
  o += max(0.15 - sdf(p + n * 0.15).x, 0.0) * 2.0;
  o += max(0.45 - sdf(p + n * 0.45).x, 0.0) * 0.8;
  o += max(1.0 - sdf(p + n * 1.0).x, 0.0) * 0.3;
  return clamp(1.0 - o, 0.0, 1.0);
}

// 반사 광선용 간단한 음영
vec3 shadeSimple(vec3 q, float id, vec3 rd) {
  if (id > 5.5 && id < 6.5) return LAMPC * 4.0;
  vec2 e = vec2(0.01, -0.01);
  vec3 n = normalize(e.xyy * sdf(q + e.xyy).x + e.yyx * sdf(q + e.yyx).x + e.yxy * sdf(q + e.yxy).x + e.xxx * sdf(q + e.xxx).x);
  vec3 alb = id < 1.5 ? vec3(0.075, 0.05, 0.038) : id < 2.5 ? vec3(0.065, 0.065, 0.06) : vec3(0.035);
  vec3 sp;
  return alb * (lampLight(q, n, -rd, 0.5, 0.0, sp) + vec3(0.05, 0.07, 0.065) + SUNC * 3.0 * beam(q) * max(dot(n, sunDir()), 0.0));
}
vec3 traceRefl(vec3 ro, vec3 rd, float t0) {
  float t = 0.04;
  vec3 col = background(rd);
  for (int i = 0; i < 56; i++) {
    vec3 q = ro + rd * t;
    vec2 h = sdf(q);
    if (h.x < 0.003 * t) {
      col = shadeSimple(q, h.y, rd);
      break;
    }
    t += h.x * 0.9;
    if (t > 40.0) break;
  }
  float tt = t + t0;
  col = mix(col, background(rd), 1.0 - exp(-0.0015 * tt * tt));
  // 반사된 빛기둥과 등불 번짐
  vec3 acc = vec3(0.0);
  float tm = min(t, 9.0);
  for (int i = 0; i < 10; i++) acc += beam(ro + rd * ((float(i) + 0.5) * tm / 10.0));
  col += SUNC * acc * tm / 10.0 * 0.05;
  for (int i = 0; i < NLAMP; i++) {
    vec3 c = uL[i].xyz - ro;
    float along = dot(c, rd);
    if (along < 0.0) continue;
    float dp = length(c - rd * along);
    float k = exp(-dp / 0.14);
    col += LAMPC * uLC[i].w * (k * 0.5 + pow(k, 6.0) * 1.6) * 1.3;
  }
  return col;
}

float rip(vec2 x) {
  return noise(vec3(x * vec2(0.9, 2.2), 0.0)) * 0.6 + noise(vec3(x * vec2(2.6, 5.0), 1.3)) * 0.28 + noise(vec3(x * 9.0, 2.7)) * 0.08;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float tc = length(uCamPos - p);
  vec3 sd = sunDir();
  if (id > 2.5 && id < 3.5) {
    // 물: 잔물결 법선 → 반사 추적 + 탁한 물속에 스민 빛
    vec2 e = vec2(0.025, 0.0);
    float h0 = rip(p.xz);
    vec3 wn = normalize(vec3(-(rip(p.xz + e.xy) - h0) / e.x * 0.035, 1.0, -(rip(p.xz + e.yx) - h0) / e.x * 0.035));
    vec3 R = reflect(-V, wn);
    R.y = abs(R.y);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
    vec3 refl = traceRefl(p + wn * 0.01, R, tc);
    vec3 sp;
    float b = beam(p);
    vec3 body = vec3(0.01, 0.016, 0.012) * (lampLight(p, vec3(0.0, 1.0, 0.0), V, 0.5, 0.0, sp) + vec3(0.3)) + SUNC * b * 0.1;
    body += SUNC * b * pow(max(dot(wn, normalize(sd + V)), 0.0), 400.0) * 4.0;
    return Mat(vec3(0.0), 1.0, 0.0, refl * fres * 1.15 + body, 0.0, 0.0, 0.0);
  }
  if (id > 5.5 && id < 6.5) return Mat(vec3(0.0), 1.0, 0.0, LAMPC * 5.0, 0.0, 0.0, 0.0);
  vec3 alb;
  float rough = 0.8;
  float spec = 0.2;
  float far = smoothstep(26.0, 9.0, tc);
  if (id < 1.5) {
    // 젖은 벽돌: 물때 줄, 이끼, 소금꽃
    vec2 uv = wallUV(p);
    vec2 bk = brick(uv, BRICK);
    float mortar = (1.0 - smoothstep(0.0, 0.014, bk.x)) * far;
    alb = mix(vec3(0.09, 0.05, 0.034), vec3(0.06, 0.052, 0.042), bk.y) * (0.7 + 0.55 * fbm3(p * 3.1)) * mix(1.0, 0.75 + 0.5 * bk.y, far);
    alb = mix(alb, vec3(0.028, 0.028, 0.024), mortar * 0.8);
    float waterline = smoothstep(2.0, 0.7, p.y);
    float streak = smoothstep(0.5, 0.8, noise(vec3(p.z * 2.3, p.y * 0.25, p.x)));
    alb = mix(alb, vec3(0.018, 0.032, 0.02), waterline * 0.75);
    alb = mix(alb, vec3(0.12, 0.125, 0.105), streak * 0.3 * smoothstep(1.2, 4.0, p.y));
    float wet = 0.35 + 0.65 * max(waterline, streak * 0.6);
    rough = mix(0.7, 0.2, wet);
    spec = mix(0.15, 1.0, wet);
  } else if (id < 2.5) {
    // 돌: 갈비 아치는 방사형 이음매, 보도는 판석
    float zr = p.z - BAY * floor(p.z / BAY + 0.5);
    float joint;
    if (abs(zr) < 0.5 && p.y > 1.0) {
      vec2 c = vec2(abs(p.x), p.y - SPRING);
      float a = c.y < 0.0 ? p.y / 0.45 : SPRING / 0.45 + atan(c.y, c.x) / 0.11;
      joint = abs(fract(a) - 0.5) * 2.0;
      joint = 1.0 - smoothstep(0.86, 0.97, joint);
      joint = 1.0 - joint;
    } else {
      vec2 bk = brick(vec2(p.z, abs(p.x) * 1.0 + p.y), vec2(0.9, 0.55));
      joint = 1.0 - smoothstep(0.0, 0.025, bk.x);
    }
    alb = vec3(0.08, 0.078, 0.07) * (0.6 + 0.55 * fbm3(p * 2.3));
    alb = mix(alb, vec3(0.025), joint * far);
    float slick = smoothstep(1.1, 0.72, p.y);
    alb = mix(alb, vec3(0.022, 0.036, 0.026), slick * 0.6);
    rough = 0.5 - 0.25 * slick;
    spec = 0.6;
  } else if (id < 4.5) {
    float seam = smoothstep(0.82, 0.95, abs(fract(p.y * 7.0 + 0.3) * 2.0 - 1.0));
    alb = vec3(0.042, 0.03, 0.021) * (0.7 + 0.5 * noise(vec3(p.x * 2.0, p.y * 9.0, p.z * 30.0))) * (1.0 - 0.65 * seam);
    alb *= mix(0.55, 1.0, smoothstep(0.05, 0.3, p.y));
    rough = 0.6;
    spec = 0.35;
  } else if (id < 5.5) {
    // 녹슨 쇠
    float rust = fbm3(p * 7.0);
    alb = mix(vec3(0.03, 0.03, 0.032), vec3(0.11, 0.045, 0.02), smoothstep(0.35, 0.7, rust));
    rough = mix(0.35, 0.85, rust);
    spec = 0.7;
  } else {
    // 젖은 천
    alb = vec3(0.028, 0.03, 0.028) * (0.7 + 0.5 * fbm3(p * 6.0));
    rough = 0.55;
    spec = 0.45;
  }
  float ao = aoL(p, n);
  vec3 sp;
  vec3 lit = lampLight(p, n, V, rough, spec, sp);
  float b = beam(p);
  vec3 sun = SUNC * 3.4 * b * max(dot(n, sd), 0.0);
  sun += SUNC * 2.0 * b * pow(max(dot(n, normalize(sd + V)), 0.0), mix(200.0, 10.0, rough)) * spec;
  // 빛 웅덩이에서 튀는 반사광
  vec3 pl = POOL - p;
  vec3 bounce = SUNC * 0.12 * max(dot(n, normalize(pl)), 0.0) / (1.0 + dot(pl, pl) * 0.1);
  vec3 emi = alb * (lit + bounce) * ao + sp * ao + alb * sun;
  return Mat(alb, rough, 0.0, emi, 0.0, 0.0, 0.0);
}

// 빛기둥 산란: 기둥을 감싼 상자 구간만 촘촘히
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 bmin = vec3(GRATE.x - GSIZE.x - 0.1, 0.0, GRATE.z - GSIZE.y - 0.1);
  vec3 bmax = vec3(GRATE.x + GSIZE.x + 1.1, GRATE.y + 2.5, GRATE.z + GSIZE.y + 3.0);
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tn = min(t0, t1);
  vec3 tf = max(t0, t1);
  float ta = max(max(max(tn.x, tn.y), tn.z), 0.0);
  float tb = min(min(min(tf.x, tf.y), tf.z), tHit);
  if (tb <= ta) return vec4(0.0);
  float dt = (tb - ta) / 40.0;
  float j = hash31(vec3(gl_FragCoord.xy, 11.0));
  float acc = 0.0;
  for (int i = 0; i < 40; i++) {
    vec3 p = ro + rd * (ta + dt * (float(i) + j));
    float b = beam(p);
    if (b <= 0.001) continue;
    // 위쪽(굴 속)은 더 밝고, 먼지 낀 공기는 들쭉날쭉
    float dens = (0.45 + 0.9 * fbm3(p * vec3(1.6, 0.5, 1.6) + vec3(3.0, 0.0, 1.0))) * (0.55 + 0.45 * smoothstep(0.0, 7.5, p.y));
    acc += b * dens;
  }
  float ph = 0.55 + 1.3 * pow(max(dot(rd, sunDir()), 0.0), 3.0);
  vec3 col = SUNC * acc * dt * 0.085 * ph;
  // 빛기둥 속으로 떨어지는 물방울 줄기
  vec3 sd = sunDir();
  for (int i = 0; i < 6; i++) {
    float fi = float(i) + 1.0;
    float hy = 0.6 + 6.4 * hash11(fi * 1.93);
    float sdesc = (GRATE.y - 0.16 - hy) / sd.y;
    vec2 c = GRATE.xz - sd.xz * sdesc + (vec2(hash11(fi * 7.1), hash11(fi * 3.3)) - 0.5) * GSIZE * 1.5;
    vec2 d2 = rd.xz;
    float tt = dot(c - ro.xz, d2) / dot(d2, d2);
    if (tt < 0.0 || tt > tHit) continue;
    vec3 q = ro + rd * tt;
    float len = 0.3 + 0.35 * hash11(fi * 5.7);
    float seg = smoothstep(hy - len, hy - len + 0.12, q.y) * smoothstep(hy + 0.02, hy - 0.04, q.y);
    float w = 0.006 + 0.0003 * tt;
    col += SUNC * exp(-length(q.xz - c) / w) * seg * beam(q) * (0.15 + 0.25 * hash11(fi * 9.1));
  }
  return vec4(col, 0.0);
}

vec4 volume(vec3 p) {
  // 물 위에 낮게 깔린 안개 + 옅은 공기 + 등불 무리
  float low = exp(-max(p.y, 0.0) / 1.0) * (0.3 + 0.9 * fbm3(p * vec3(0.35, 0.8, 0.2) + vec3(0.0, 0.0, 1.7)));
  float dens = 0.007 + 0.05 * low;
  vec3 L = vec3(0.04, 0.06, 0.056) * 0.45;
  for (int i = 0; i < NLAMP; i++) {
    vec3 lp = uL[i].xyz - p;
    L += LAMPC * uLC[i].w * 2.6 / (1.0 + dot(lp, lp) * 0.9);
  }
  // 빛 웅덩이 위의 안개는 빛을 받는다
  vec3 pl = POOL - p;
  L += SUNC * 0.25 / (1.0 + dot(pl, pl) * 0.4);
  return vec4(L, dens);
}
`,
  };
}
