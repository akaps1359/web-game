// 2층 배경 — 잿빛 수도원의 회랑.
// 재에 파묻힌 회랑 안뜰. 왼쪽으로 기둥과 아치가 줄지어 물러나고, 맞은편 회랑의 아치 너머 벽에는 해골이 쌓인 납골 벽감과
// 촛불이 줄지어 있다. 안뜰 한가운데 세 발 틀에 매달린 거대한 향로가 꺼지지 않고 타며 연기를 올리고,
// 성당 지붕 너머로 종탑이 잿빛 하늘을 찌른다. 종루 안의 종이 금빛으로 비친다. 재가 눈처럼 내린다.
// 기법: 음영은 material()의 emi에서 직접(하늘빛 + 점광원 + 역광), 코어 안개는 되돌려(undoFog) 우리 안개로.
// 촛불 불꽃은 너무 작아 광선이 놓치므로 overlay()에서 벽 평면과의 교차점으로 번짐을 그린다.

export default function bgAct2({ seed = 1 } = {}) {
  const FZ = -16.0;
  const wallZ = FZ - 3.6;
  // 조명: 큰 향로, 매단 향로 둘, 종루, 납골 벽 촛불 무리 셋
  const lights = [
    [0.9, 2.55, -7.5, 1.0, 0.2],
    [-5.5, 3.1, 1.6, 0.45, 0.06],
    [-5.5, 3.1, -4.8, 0.4, 0.06],
    [4.6, 15.0, -20.7, 0.7, 0.9],
    [-3.2, 1.9, wallZ + 0.6, 0.5, 0.0],
    [1.6, 1.9, wallZ + 0.6, 0.5, 0.0],
    [6.4, 1.9, wallZ + 0.6, 0.45, 0.0],
  ];
  return {
    preset: 'act2',
    cam: { pos: [-2.2, 1.6, 7.5], target: [0.9, 5.4, -20.0], fov: 1.05 },
    light: { key: [0, -1, 0], keyCol: [0, 0, 0], fillCol: [0, 0, 0], amb: [0, 0, 0], rim: 0, fog: [0, 0, 0], glow: 0.0, exposure: 1.05 },
    arrays: {
      uP: [[seed === 99 ? 1 : 0, 0, 0, 0]],
      uL: lights.map((l) => [l[0], l[1], l[2], Math.max(l[4], 0.001)]),
      uLC: lights.map((l, i) => [1.0, 0.62, 0.28, i === 3 ? 0.3 : l[4] > 0 ? 0.6 * l[3] : 0.0]),
    },
    glsl: /* glsl */ `
#define HAS_BG
#define HAS_VOLUME
#define HAS_OVERLAY
#define VOLUME_STEPS 40
#define VOLUME_FAR 48.0
#define NL 7

const float AX = -5.5;   // 왼쪽 회랑 기둥 줄
const float BW = -9.0;   // 왼쪽 회랑 안쪽 벽
const float FZ = ${FZ.toFixed(1)};  // 맞은편 회랑 기둥 줄
const float WZ = ${wallZ.toFixed(2)}; // 맞은편 회랑 안쪽 벽 (납골 벽감)
const float SP = 3.2;    // 기둥 간격
const float STY = 0.45;  // 회랑 바닥 높이
const float CAP = 3.7;   // 기둥 머리 높이
const vec3 TOWER = vec3(4.6, 0.0, -21.6);
const vec3 CENSER = vec3(0.9, 2.55, -7.5);
const vec3 SUND = vec3(0.12, 0.56, -0.82);
const vec3 GOLD = vec3(1.0, 0.64, 0.3);
const vec3 SKYL = vec3(0.075, 0.079, 0.088);

vec3 sunD() { return normalize(SUND); }
float box2(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
float rep(float x, float s) { return x - s * floor(x / s + 0.5); }
float archSD(vec2 q, float r) { return q.y < 0.0 ? abs(q.x) - r : length(q) - r; }

// ───── 하늘: 재로 뒤덮인 잿빛, 구릿빛으로 흐린 해 ─────
vec3 sky(vec3 rd) {
  float h = max(rd.y, 0.0);
  vec3 col = mix(vec3(0.07, 0.077, 0.09), vec3(0.015, 0.018, 0.026), smoothstep(0.0, 0.8, h));
  float g = max(dot(rd, sunD()), 0.0);
  // 재 너머로 흐릿하게 비치는 해: 핏빛 도는 구릿빛 원반과 무리
  col += vec3(0.6, 0.3, 0.16) * pow(g, 16.0) * 0.2 + vec3(0.95, 0.42, 0.18) * pow(g, 90.0) * 0.28;
  col += vec3(1.0, 0.42, 0.16) * smoothstep(0.99958, 0.99972, g) * 0.55;
  // 재구름: 바람에 찢긴 어두운 띠, 해 둘레는 엷다
  vec2 uv = rd.xz / (h + 0.15);
  float c = fbm(vec3(uv * vec2(0.5, 1.1), 3.0)) + 0.4 * fbm(vec3(uv * 2.6, 7.0));
  float thin = smoothstep(0.75, 0.97, g);
  col *= mix(0.45 + 0.75 * smoothstep(0.3, 1.0, c), 1.0, thin * 0.6);
  return col;
}
vec3 background(vec3 rd) { return sky(rd); }
vec3 hazeCol(vec3 rd) {
  float g = max(dot(rd, sunD()), 0.0);
  return vec3(0.055, 0.061, 0.072) + vec3(0.3, 0.15, 0.07) * pow(g, 12.0) * 0.25;
}
vec3 applyFog(vec3 c, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  return mix(c, hazeCol(rd), 1.0 - exp(-t * 0.013));
}
vec3 undoFog(vec3 want, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  float f = 1.0 - exp(-0.0015 * t * t);
  return (want - background(rd) * f) / max(1.0 - f, 0.03);
}

// ───── 회랑 한 줄 (q.x = 줄을 따라, q.y 위, q.z = 안뜰 쪽 +) ─────
vec2 arcade(vec3 q, float depth) {
  float zc = rep(q.x, SP);
  float d = box2(vec2(q.z, q.y - STY * 0.5), vec2(0.45, STY * 0.5));
  d = min(d, box2(vec2(q.z + depth * 0.5, q.y - STY * 0.5), vec2(depth * 0.5, STY * 0.5)));
  float ry = clamp((q.y - STY) / (CAP - STY), 0.0, 1.0);
  float col = max(length(vec2(zc, q.z)) - (0.27 - 0.04 * ry * ry), max(STY - q.y, q.y - CAP));
  col = min(col, sdBox(vec3(zc, q.y - STY - 0.12, q.z), vec3(0.4, 0.12, 0.4)));
  float capw = 0.3 + 0.14 * smoothstep(CAP - 0.05, CAP + 0.3, q.y);
  col = min(col, sdBox(vec3(zc, q.y - CAP - 0.18, q.z), vec3(capw, 0.18, capw)));
  d = min(d, col);
  float az = rep(q.x - SP * 0.5, SP);
  float arch = archSD(vec2(az, q.y - (CAP + 0.36)), 1.3);
  float wall = max(box2(vec2(q.z, q.y - (CAP + 0.36 + 1.25)), vec2(0.36, 1.25)), -arch);
  wall = min(wall, max(box2(vec2(q.z - 0.02, q.y - (CAP + 0.36 + 0.7)), vec2(0.4, 0.7)), max(arch - 0.18, -arch)));
  d = min(d, wall);
  d = min(d, box2(vec2(q.z - 0.06, q.y - (CAP + 2.7)), vec2(0.48, 0.1)));
  vec2 r = vec2(d, 2.0);
  float rs = (q.y - (CAP + 2.85)) + q.z * 0.38;
  float roof = max(abs(rs) - 0.12, max(q.z - 0.7, -q.z - depth - 0.3));
  r = umin(r, vec2(roof * 0.9, 3.0));
  // 회랑 천장
  r = umin(r, vec2(max(abs(q.y - (CAP + 2.5)) - 0.12, max(q.z - 0.3, -q.z - depth)), 2.0));
  return r;
}

// 납골 벽: 두 단의 아치 벽감, 해골 더미와 초 (q.x 벽을 따라, q.y 위, q.z 벽 앞쪽 +)
const float NP = 1.6;
float nicheLevel(float y) { return y < 2.05 ? 1.25 : 2.65; }
vec2 ossuary(vec3 q) {
  float u = rep(q.x, NP);
  float lv = nicheLevel(q.y);
  float niche = archSD(vec2(u, q.y - lv), 0.58);
  niche = max(niche, -(q.y - lv) - 0.45);
  float wall = max(q.z, -max(niche, max(-q.z - 0.45, q.z - 0.01)));
  vec2 r = vec2(wall, 2.0);
  // 해골 더미
  vec3 s0 = vec3(u, q.y - lv, q.z + 0.24);
  if (length(s0) < 0.75) {
    float sk = 1e5;
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      vec3 c = vec3(-0.38 + 0.19 * mod(fk, 4.0) + 0.04 * sin(fk * 7.0), -0.355 + 0.17 * floor(fk / 4.0), 0.06 - 0.12 * floor(fk / 4.0));
      vec3 s = s0 - c;
      s.xz = rot(sin(fk * 3.1) * 0.6) * s.xz;
      float d = sdEllipsoid(s, vec3(0.085, 0.088, 0.1));
      d = smin(d, sdEllipsoid(s - vec3(0.0, -0.06, 0.045), vec3(0.058, 0.04, 0.06)), 0.03);
      vec3 e = vec3(abs(s.x) - 0.033, s.y + 0.0, s.z - 0.088);
      d = max(d, -(length(e) - 0.026));
      sk = min(sk, d);
    }
    r = umin(r, vec2(sk, 5.0));
    // 초
    r = umin(r, vec2(sdCylinder(s0 - vec3(0.39, -0.33, 0.2), 0.11, 0.024), 4.5));
  } else r.x = min(r.x, length(s0) - 0.7);
  return r;
}

vec2 sdf(vec3 p) {
  // 안뜰 바닥: 재가 쌓여 물결진다
  float ash = 0.12 * fbm3(vec3(p.x * 0.35, 0.0, p.z * 0.35)) + 0.04 * noise(vec3(p.x * 2.0, 0.0, p.z * 2.0));
  ash += 0.35 * exp(-max(p.x - AX - 0.45, 0.0) * 1.6) + 0.3 * exp(-max(p.z - FZ - 0.45, 0.0) * 1.6);
  vec2 r = vec2(p.y - ash + 0.08, 1.0);
  // 왼쪽 회랑
  if (p.x < AX + 1.0) {
    r = umin(r, arcade(vec3(-p.z, p.y, p.x - AX), 3.5));
    r = umin(r, vec2(max(max(p.x - BW, -p.y), p.y - (CAP + 4.0)), 2.0));
  } else r.x = min(r.x, p.x - AX - 1.0 + 0.05);
  // 맞은편 회랑 + 납골 벽 + 성당
  if (p.z < FZ + 1.0) {
    r = umin(r, arcade(vec3(p.x, p.y, p.z - FZ), 3.6));
    if (p.y < 3.6) r = umin(r, ossuary(vec3(p.x, p.y, p.z - WZ)));
    else r.x = min(r.x, max(p.y - 3.25, p.z - WZ - 0.3));
    // 성당 벽 (회랑 지붕 위로 솟은 부분)과 높은 창
    float nave = max(max(p.z - WZ, p.y - 10.0), 3.4 - p.y);
    float win = max(archSD(vec2(rep(p.x - 1.6, 6.4), p.y - 9.0), 0.62), -(p.y - 9.0) - 1.2);
    nave = max(nave, -max(win, -(p.z - WZ + 0.5)));
    r = umin(r, vec2(nave, 2.0));
    r = umin(r, vec2(max(win, abs(p.z - (WZ - 0.42)) - 0.02), 9.0));
    // 박공 지붕
    float gab = (p.y - 10.0) + abs(p.z - (WZ - 5.4)) * 0.62 - 3.3;
    r = umin(r, vec2(max(gab * 0.8, max(max(WZ - 10.8 - p.z, p.z - (WZ + 0.2)), 9.8 - p.y)), 3.0));
  } else r.x = min(r.x, p.z - FZ - 1.0 + 0.05);
  // 종탑
  {
    vec3 t = p - TOWER;
    float m = max(abs(t.x), abs(t.z));
    float tw = max(m - 1.95 + 0.06 * step(6.0, t.y) + 0.06 * step(12.0, t.y), max(-t.y, t.y - 19.5));
    vec2 bq = abs(t.xz) - vec2(1.95);
    tw = min(tw, max(max(abs(bq.x), abs(bq.y)) - 0.3, max(-t.y, t.y - 13.0)));
    // 종루: 속이 빈 층에 아치 창
    float along = abs(t.x) < abs(t.z) ? t.x : t.z;
    float op = max(archSD(vec2(abs(along) - 0.75, t.y - 16.4), 0.5), -(t.y - 16.4) - 1.7);
    tw = max(tw, -max(op, -(m - 1.4)));
    tw = max(tw, -sdBox(t - vec3(0.0, 16.0, 0.0), vec3(1.4, 2.0, 1.4)));
    tw = min(tw, max(m - 2.1, abs(t.y - 14.3) - 0.12));
    tw = min(tw, max(m - 2.1, abs(t.y - 19.5) - 0.16));
    float k = 2.0 * (1.0 - (t.y - 19.5) / 8.0);
    tw = min(tw, max(m - k, max(19.5 - t.y, t.y - 27.5)) * 0.55);
    vec3 bq2 = t - vec3(0.0, 16.0, 0.0);
    float bell = sdCappedCone(bq2, 0.6, 0.95, 0.45);
    bell = max(bell, -sdCappedCone(bq2 + vec3(0.0, 0.15, 0.0), 0.55, 0.85, 0.35));
    bell = min(bell, sdCylinder(bq2 - vec3(0.0, 0.75, 0.0), 0.15, 0.08));
    r = umin(r, vec2(tw, 2.0));
    r = umin(r, vec2(bell, 7.0));
  }
  // 안뜰의 큰 향로: 세 갈래 나무 틀에 매달린 구멍 뚫린 청동 향로
  {
    vec3 b = p - CENSER;
    float bb = length(b - vec3(0.0, 0.6, 0.0)) - 3.4;
    if (bb > 0.0) r.x = min(r.x, bb + 0.05);
    else {
      vec3 top = vec3(0.0, 2.75, 0.0);
      float frame = 1e5;
      for (int i = 0; i < 3; i++) {
        float a = float(i) * 2.0944 + 0.5;
        vec3 foot = vec3(cos(a) * 1.9, -CENSER.y, sin(a) * 1.9);
        frame = min(frame, sdCapsule(b, foot, top, 0.07));
      }
      float chain = sdCapsule(b, vec3(0.0, 0.55, 0.0), top, 0.02);
      float body = sdEllipsoid(b, vec3(0.5, 0.58, 0.5));
      // 뚫린 무늬: 구멍 사이로 숯불이 보인다
      float ang = atan(b.z, b.x);
      float holes = length(vec2(fract(ang * 1.9) - 0.5, fract(b.y * 3.2) - 0.5)) - 0.22;
      body = max(body, -max(holes * 0.25, -sdEllipsoid(b, vec3(0.42, 0.5, 0.42))));
      body = min(body, sdCappedCone(b - vec3(0.0, 0.62, 0.0), 0.12, 0.2, 0.06));
      body = min(body, sdTorus(b - vec3(0.0, -0.05, 0.0), vec2(0.5, 0.035)));
      r = umin(r, vec2(min(frame, chain), 4.0));
      r = umin(r, vec2(body, 4.8));
      r = umin(r, vec2(sdEllipsoid(b, vec3(0.38, 0.45, 0.38)), 8.0));
    }
  }
  // 아치에 매달린 작은 향로 둘
  for (int i = 1; i < 3; i++) {
    vec3 c = uL[i].xyz;
    float bd = length(p - c - vec3(0.0, 1.0, 0.0)) - 1.4;
    if (bd > 0.0) {
      r.x = min(r.x, bd + 0.05);
      continue;
    }
    float ch = sdCapsule(p, c + vec3(0.0, 0.1, 0.0), c + vec3(0.0, 2.35, 0.0), 0.012);
    float cn = sdSphere(p - c, 0.13);
    cn = max(cn, -sdBox(p - c, vec3(0.2, 0.025, 0.2)));
    cn = min(cn, sdCappedCone(p - c - vec3(0.0, 0.17, 0.0), 0.06, 0.1, 0.02));
    r = umin(r, vec2(min(ch, cn), 4.0));
    r = umin(r, vec2(sdSphere(p - c, 0.1), 8.0));
  }
  return r;
}

// ───── 빛 ─────
vec3 pointLights(vec3 p, vec3 n, vec3 V, float rough, float spec, inout vec3 sp) {
  vec3 dif = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    vec3 lp = uL[i].xyz - p;
    float d2 = dot(lp, lp);
    vec3 l = lp * inversesqrt(d2);
    float w = i == 0 ? 5.0 : i < 3 ? 1.4 : i == 3 ? 14.0 : 2.2;
    float k = i == 0 ? 0.55 : i == 3 ? 1.6 : 1.1;
    float fl = i >= 4 ? smoothstep(-0.4, 0.7, dot(n, l)) : max(dot(n, l), 0.0);
    vec3 c = GOLD * w / (1.0 + d2 * k);
    if (i == 0) c *= vec3(1.0, 0.78, 0.6);
    dif += c * fl;
    sp += c * pow(max(dot(n, normalize(l + V)), 0.0), mix(160.0, 10.0, rough)) * spec;
  }
  return dif;
}
float aoL(vec3 p, vec3 n) {
  float o = 0.0;
  o += max(0.12 - sdf(p + n * 0.12).x, 0.0) * 2.5;
  o += max(0.4 - sdf(p + n * 0.4).x, 0.0) * 0.9;
  o += max(1.0 - sdf(p + n * 1.0).x, 0.0) * 0.3;
  return clamp(1.0 - o, 0.0, 1.0);
}
vec3 shade(vec3 p, vec3 n, vec3 V, vec3 alb, float rough, float spec) {
  float ao = aoL(p, n);
  // 지붕 아래·회랑 안쪽은 하늘빛이 덜 든다
  float under = step(p.y, CAP + 2.5) * max(smoothstep(0.5, -0.5, p.x - AX), smoothstep(0.5, -0.5, p.z - FZ));
  float cover = clamp(1.0 - 0.8 * under, 0.15, 1.0);
  vec3 c = alb * SKYL * (0.35 + 0.65 * (n.y * 0.5 + 0.5)) * ao * cover;
  vec3 sd = sunD();
  c += alb * vec3(0.3, 0.19, 0.12) * max(dot(n, sd), 0.0) * 0.55 * ao * cover;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  c += vec3(0.5, 0.32, 0.18) * 0.05 * fres * max(dot(-V, sd), 0.0) * ao * cover;
  vec3 sp = vec3(0.0);
  c += alb * pointLights(p, n, V, rough, spec, sp) * mix(0.45, 1.0, ao);
  c += sp * ao;
  return c;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  vec3 want;
  if (id > 8.5) {
    // 색유리: 마름모꼴 납 틀 사이로 호박빛, 드문드문 핏빛
    vec2 g = vec2(p.x + p.y, p.x - p.y) * 3.6;
    vec2 fg = abs(fract(g) - 0.5);
    float lead = smoothstep(0.38, 0.46, max(fg.x, fg.y));
    float hue = hash31(floor(vec3(g, 1.0)));
    vec3 gl = mix(GOLD * vec3(1.0, 0.85, 0.7), vec3(0.75, 0.12, 0.05), step(0.82, hue));
    float flick = 0.55 + 0.45 * noise(vec3(p.x * 1.5, p.y * 1.5, 3.0));
    want = gl * (0.5 + 0.5 * hue) * flick * (1.0 - 0.92 * lead) * 0.42;
  } else if (id > 7.5) {
    // 타오르는 숯
    float e = noise(p * 9.0) * 0.7 + noise(p * 23.0) * 0.3;
    want = mix(vec3(0.5, 0.08, 0.01), vec3(2.8, 1.2, 0.38), smoothstep(0.35, 0.8, e)) * 1.4;
  } else {
    vec3 alb;
    float rough = 0.85;
    float spec = 0.1;
    float up = smoothstep(0.55, 0.9, n.y);
    vec3 emi = vec3(0.0);
    if (id < 1.5) {
      alb = vec3(0.115, 0.117, 0.12) * (0.75 + 0.35 * fbm3(p * 3.0));
    } else if (id < 2.5) {
      vec2 bq = vec2(p.x + p.z, p.y);
      vec2 b = bq / vec2(0.9, 0.42);
      b.x += mod(floor(b.y), 2.0) * 0.5;
      vec2 f = fract(b);
      float joint = 1.0 - smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x) * 0.9, min(f.y, 1.0 - f.y) * 0.42));
      alb = vec3(0.07, 0.066, 0.062) * (0.6 + 0.5 * fbm3(p * 1.9)) * (1.0 - 0.45 * joint);
      alb = mix(alb, vec3(0.115, 0.112, 0.108), up * 0.85);
      alb *= 1.0 - 0.45 * smoothstep(0.5, 0.8, noise(p * vec3(1.0, 0.3, 1.0)));
    } else if (id < 3.5) {
      alb = mix(vec3(0.045, 0.038, 0.034), vec3(0.11, 0.108, 0.105), smoothstep(0.3, 0.8, fbm3(p * 2.0)) * up);
    } else if (id < 4.4) {
      alb = vec3(0.05, 0.036, 0.024) * (0.6 + 0.6 * fbm3(p * 8.0));
      rough = 0.5;
      spec = 0.4;
    } else if (id < 4.7) {
      // 초: 밀랍, 꼭대기에 불꽃
      alb = vec3(0.2, 0.17, 0.12);
      float lv = nicheLevel(p.y);
      emi = GOLD * 5.0 * smoothstep(-0.25, -0.2, p.y - lv);
      rough = 0.5;
    } else if (id < 4.9) {
      // 청동 향로: 구멍 가장자리가 숯불에 달아올랐다
      alb = vec3(0.06, 0.042, 0.024) * (0.7 + 0.5 * fbm3(p * 6.0));
      rough = 0.35;
      spec = 0.9;
      vec3 b = p - CENSER;
      emi = vec3(1.0, 0.35, 0.08) * 0.35 * smoothstep(0.5, 0.42, length(b / vec3(1.0, 1.15, 1.0)));
    } else if (id < 5.5) {
      alb = vec3(0.19, 0.17, 0.14) * (0.7 + 0.4 * noise(p * 20.0));
      rough = 0.6;
      spec = 0.2;
    } else {
      alb = mix(vec3(0.09, 0.065, 0.03), vec3(0.04, 0.08, 0.06), noise(p * 4.0));
      rough = 0.3;
      spec = 1.2;
    }
    want = shade(p, n, V, alb, rough, spec) + emi;
  }
  want = applyFog(want, p);
  if (uP[0].x > 0.5) want = vec3(fract(id * 0.37), fract(id * 0.61), fract(id * 0.83));
  return Mat(vec3(0.0), 1.0, 0.0, undoFog(want, p), 0.0, 0.0, 0.0);
}

// 촛불 번짐 + 내리는 재
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  if (uP[0].x > 0.5) return vec4(0.0);
  vec3 acc = vec3(0.0);
  // 납골 벽 앞 평면을 지나는 곳에서 가장 가까운 불꽃
  float zf = WZ - 0.04;
  float tp = (zf - ro.z) / rd.z;
  if (tp > 0.0 && tp < tHit + 0.6) {
    vec3 q = ro + rd * tp;
    if (q.y < 3.4) {
      float lv = nicheLevel(q.y);
      vec2 dq = vec2(rep(q.x - 0.39, NP), q.y - (lv - 0.17));
      float dd = length(dq * vec2(1.0, 0.6));
      float k = exp(-dd / 0.05);
      acc += GOLD * (k * 0.35 + pow(k, 5.0) * 1.2) * exp(-tp * 0.03);
    }
  }
  // 내리는 재
  for (int k = 0; k < 7; k++) {
    float t = 1.8 * pow(1.55, float(k));
    if (t > tHit) break;
    vec3 p = ro + rd * t;
    float cs = 0.16 * t;
    vec3 cell = floor(p / cs);
    vec3 h = vec3(hash31(cell + 1.3), hash31(cell + 7.1), hash31(cell + 3.7));
    if (h.x > 0.6) continue;
    vec3 c = (cell + 0.2 + 0.6 * h) * cs;
    float along = dot(c - ro, rd);
    float dp = length(c - ro - rd * along);
    float r = 0.0018 * along * (0.5 + h.y);
    float a = smoothstep(r, r * 0.25, dp);
    vec3 lit = hazeCol(rd) * 1.5 + GOLD * 0.7 / (1.0 + dot(c - CENSER, c - CENSER) * 0.2);
    acc += lit * a * (0.3 + 0.7 * h.z) * exp(-along * 0.035);
  }
  return vec4(acc, 0.0);
}

vec4 volume(vec3 p) {
  if (uP[0].x > 0.5) return vec4(0.0);
  float dens = 0.0025 + 0.006 * exp(-max(p.y, 0.0) / 2.0);
  // 향로에서 피어오르는 연기
  vec3 b = p - (CENSER + vec3(0.0, 0.5, 0.0));
  float hgt = max(b.y, 0.0);
  vec2 sw = vec2(sin(hgt * 0.5 + 1.0), cos(hgt * 0.37)) * (0.1 + hgt * 0.1);
  float rad = 0.25 + hgt * 0.15;
  float plume = exp(-dot(b.xz - sw, b.xz - sw) / (rad * rad)) * smoothstep(-0.6, 0.2, b.y) * smoothstep(10.0, 3.0, hgt);
  plume *= smoothstep(0.3, 0.75, fbm3(vec3(b.x * 1.4, b.y * 0.8 - 1.0, b.z * 1.4)));
  dens += plume * 0.22;
  vec3 L = hazeCol(normalize(p - uCamPos + vec3(0.0, 0.0, 1e-4))) * 0.9;
  for (int i = 0; i < NL; i++) {
    if (i == 3) continue;
    vec3 lp = uL[i].xyz - p;
    float w = i == 0 ? 1.8 : 0.5;
    L += GOLD * w / (1.0 + dot(lp, lp) * (i == 0 ? 1.6 : 3.0));
  }
  vec3 tp = p - (TOWER + vec3(0.0, 15.6, 0.0));
  L += GOLD * 3.0 / (1.0 + dot(tp, tp) * 1.4);
  return vec4(L, dens);
}
`,
  };
}
