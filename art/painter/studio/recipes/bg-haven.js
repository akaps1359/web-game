// 거점 배경 — 잿빛 새벽의 항구 마을과 부두.
// 등불이 늘어선 나무 부두가 안개 낀 잔잔한 물 위로 마을까지 이어진다. 박공지붕 집들이 언덕을 따라 층층이 서 있고,
// 몇몇 창에 불이 켜져 있다. 마을 뒤 낮은 구름 틈으로 희미한 새벽빛. 쓸쓸하지만 안전한 곳.
// 기법: 하늘·구름은 background(), 집들은 도메인 반복 + 난수, 창문은 발광, 물은 반사 광선 추적.
// 음영은 전부 material()의 emi에서 직접 계산하고(alb=0), 코어의 거리 안개를 되돌려(undoFog) 우리 안개로 바꾼다.

export default function bgHaven({ seed = 1 } = {}) {
  const debug = seed === 99 ? 1 : 0;
  const deck = 0.62;
  const lamps = [
    [0.62, deck + 1.3, -2.5, 1.0],
    [0.62, deck + 1.3, -8.5, 0.95],
    [0.62, deck + 1.3, -14.5, 0.9],
    [-1.92, 1.45, -6.6, 0.5], // 왼쪽 배 돛대에 매단 등
    [2.3, 2.6, -17.4, 0.6], // 선창 가로등
    [6.2, 8.7, -21.0, 0.0], // 등대 불빛 (빛 번짐만)
  ];
  return {
    preset: 'act1',
    cam: { pos: [0.05, 1.5, 1.5], target: [-0.45, -0.75, -22.0], fov: 1.15 },
    light: {
      key: [0.0, -1.0, 0.0],
      keyCol: [0, 0, 0],
      fillCol: [0, 0, 0],
      amb: [0, 0, 0],
      rim: 0.0,
      fog: [0, 0, 0],
      glow: 0.0,
      exposure: 0.95,
    },
    arrays: {
      uP: [[debug, 0, 0, 0]],
      uL: lamps.map((l, i) => [l[0], l[1], l[2], i === 5 ? 0.55 : i < 3 ? 0.11 : 0.09]),
      uLC: lamps.map((l, i) => (i === 5 ? [1.0, 0.75, 0.45, 0.35] : [1.0, 0.62, 0.3, 0.55 * l[3]])),
    },
    glsl: /* glsl */ `
#define HAS_BG
#define HAS_VOLUME
#define HAS_OVERLAY
#define VOLUME_STEPS 36
#define VOLUME_FAR 40.0
#define NLAMP 5

const float DECK = ${deck.toFixed(2)};
const vec3 LAMPC = vec3(1.0, 0.6, 0.27);
const vec3 SUNDIR = vec3(-0.25, 0.1, -1.0);
const vec3 DAWN = vec3(0.95, 0.66, 0.46);
const float SHORE = -17.0;
const float XMIN = -3.6; // 마을 왼쪽 끝 (그 너머는 트인 바다)

vec3 sunD() { return normalize(SUNDIR); }

// ───── 하늘 ─────
vec3 skyBase(vec3 rd) {
  vec3 sd = sunD();
  float h = max(rd.y, 0.0);
  float az = dot(normalize(rd.xz + vec2(1e-5)), normalize(sd.xz)) * 0.5 + 0.5;
  float sunw = pow(az, 5.0);
  vec3 hor = mix(vec3(0.05, 0.062, 0.08), vec3(0.13, 0.135, 0.15), sunw);
  vec3 zen = vec3(0.01, 0.014, 0.024);
  vec3 col = mix(hor, zen, smoothstep(0.0, 0.6, pow(h, 0.7)));
  float g = max(dot(rd, sd), 0.0);
  // 수평선에 얇게 깔린 새벽빛 (구름 틈의 장밋빛·호박빛)
  col += vec3(0.9, 0.55, 0.42) * exp(-h * 9.0) * pow(az, 8.0) * 0.2;
  col += DAWN * pow(g, 14.0) * 0.14 + vec3(1.0, 0.82, 0.62) * pow(g, 150.0) * 0.3;
  return col;
}
vec3 sky(vec3 rd) {
  vec3 col = skyBase(rd);
  float h = max(rd.y, 0.0);
  float az = pow(dot(normalize(rd.xz + vec2(1e-5)), normalize(sunD().xz)) * 0.5 + 0.5, 5.0);
  // 수평선 가까이 가로로 길게 깔린 층운
  float bands = smoothstep(0.5, 0.78, noise(vec3(rd.x * 1.3, h * 30.0, rd.z * 1.3)));
  col = mix(col, col * 0.6 + vec3(0.012, 0.01, 0.01), bands * smoothstep(0.015, 0.05, h) * smoothstep(0.3, 0.12, h) * 0.7);
  // 높은 곳의 무거운 구름 (아랫면이 새벽빛을 조금 받는다)
  if (h > 0.16) {
    vec2 uv = rd.xz / h * 1.3;
    float c = fbm(vec3(uv * 0.55, 2.0)) + 0.25 * fbm(vec3(uv * 2.1, 5.0));
    float cover = smoothstep(0.48, 0.85, c);
    vec3 cc = mix(vec3(0.011, 0.014, 0.02), vec3(0.06, 0.058, 0.064), az * smoothstep(0.6, 0.2, h));
    // 구름 가장자리의 은빛 테
    cc += vec3(0.75, 0.62, 0.55) * 0.1 * az * smoothstep(0.62, 0.5, c) * smoothstep(0.45, 0.2, h);
    col = mix(col, cc, cover * smoothstep(0.16, 0.32, h) * 0.92);
  }
  return col;
}
vec3 background(vec3 rd) {
  if (rd.y < 0.0) return skyBase(vec3(rd.x, 0.0, rd.z)) * 0.8;
  vec3 c = sky(rd);
  // 먼 바다 건너 낮은 곶 (안개 속 실루엣)
  float az = atan(rd.x, -rd.z);
  float ridge = 0.012 + 0.018 * smoothstep(-0.2, -0.75, az) + 0.006 * noise(vec3(az * 30.0, 0.0, 1.0));
  if (rd.y < ridge && az < -0.18) c = mix(c, skyBase(vec3(rd.x, 0.0, rd.z)) * 0.55, 0.85);
  return c;
}

// 우리 안개: 거리에 따라 매끈한 수평선 빛으로 (구름 무늬가 집에 비치지 않게)
vec3 hazeCol(vec3 rd) {
  float az = pow(dot(normalize(rd.xz + vec2(1e-5)), normalize(sunD().xz)) * 0.5 + 0.5, 6.0);
  float h = max(rd.y, 0.0);
  return mix(vec3(0.045, 0.054, 0.068), vec3(0.11, 0.105, 0.11), az) * (1.0 - 0.5 * smoothstep(0.0, 0.5, h));
}
vec3 applyFog(vec3 c, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  float f = 1.0 - exp(-t * 0.02);
  return mix(c, hazeCol(rd), f);
}
// 코어가 덧씌우는 거리 안개(background 쪽으로 섞기)를 미리 되돌린다
vec3 undoFog(vec3 want, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  float f = 1.0 - exp(-0.0015 * t * t);
  return (want - background(rd) * f) / max(1.0 - f, 0.03);
}

// ───── 마을 ─────
float hashc(float x, float s) { return hash11(x * 12.9898 + s * 78.233); }

float houseRow(vec3 p, float z0, float y0, float s, float w, float xmin) {
  float cx = floor(p.x / w);
  float lx = p.x - (cx + 0.5) * w;
  if ((cx + 0.5) * w < xmin) return max(w * 0.5 - abs(lx), xmin - w * 0.5 - p.x) + 0.05;
  float hw = w * (0.4 + 0.08 * hashc(cx, s + 1.0));
  float h = 1.6 + 2.2 * hashc(cx, s + 2.0);
  float dep = 1.4 + 0.8 * hashc(cx, s + 3.0);
  float zc = z0 - dep - 0.6 * hashc(cx, s + 4.0);
  float rh = hw * (1.0 + 0.7 * hashc(cx, s + 5.0));
  vec3 q = vec3(lx, p.y - y0, p.z - zc);
  float body = sdBox(q - vec3(0.0, h * 0.5 - 1.0, 0.0), vec3(hw, h * 0.5 + 1.0, dep));
  vec2 rq = vec2(abs(q.x), q.y - h);
  vec2 n = normalize(vec2(rh, hw));
  float roof = max(dot(rq - vec2(0.0, rh), n), -rq.y);
  roof = max(roof, abs(q.z) - dep - 0.08);
  roof = max(roof - 0.04, -rq.y - 0.04);
  float d = min(body, roof);
  if (hashc(cx, s + 6.0) > 0.4) {
    float chx = (hashc(cx, s + 7.0) - 0.5) * hw;
    d = min(d, sdBox(q - vec3(chx, h + rh * 0.8, -dep * 0.4), vec3(0.12, rh * 0.5 + 0.3, 0.12)));
  }
  d = min(d, w * 0.5 - abs(lx) + 0.05);
  return d;
}

float town(vec3 p) {
  if (p.z > SHORE + 0.5 || p.y > 14.0) return max(p.z - SHORE - 0.5, p.y - 14.0) + 0.1;
  float d = houseRow(p, SHORE - 0.6, 1.1, 1.0, 1.9, XMIN);
  d = min(d, houseRow(p + vec3(0.7, 0.0, 0.0), SHORE - 4.2, 2.6, 2.0, 2.1, XMIN - 1.5));
  d = min(d, houseRow(p + vec3(1.3, 0.0, 0.0), SHORE - 8.0, 4.2, 3.0, 2.3, XMIN - 3.0));
  // 언덕: 마을 왼쪽 끝에서 바다 쪽으로 낮아진다
  float slope = smoothstep(XMIN - 8.0, XMIN + 1.0, p.x);
  float hill = p.y - (1.1 + max(0.0, (SHORE - 1.5 - p.z)) * 0.42 * slope + 0.6 * fbm3(vec3(p.x * 0.15, 0.0, p.z * 0.15)) - 1.6 * (1.0 - slope));
  hill = max(hill * 0.8, p.z - (SHORE - 0.4));
  d = min(d, hill);
  // 교회 탑과 첨탑
  vec3 c = p - vec3(-1.2, 3.4, SHORE - 10.5);
  float tower = sdBox(c - vec3(0.0, 0.6, 0.0), vec3(0.85, 3.6, 0.85));
  // 종루의 아치 구멍
  vec2 bq = vec2(abs(c.x) < abs(c.z) ? c.x : c.z, c.y - 3.3);
  float bel = max(bq.y < 0.0 ? abs(bq.x) - 0.32 : length(bq) - 0.32, -bq.y - 0.9);
  tower = max(tower, -max(bel, -(max(abs(c.x), abs(c.z)) - 0.6)));
  tower = min(tower, sdBox(c - vec3(0.0, 4.25, 0.0), vec3(0.95, 0.07, 0.95)));
  float k = 0.72 * (1.0 - (c.y - 4.3) / 4.6);
  float spire = max(max(abs(c.x), abs(c.z)) - k, max(4.3 - c.y, c.y - 8.9));
  d = min(d, min(tower, spire * 0.6));
  // 오른쪽 곶의 등대
  vec3 l = p - vec3(6.2, 0.0, SHORE - 4.0);
  float rock = sdEllipsoid(l - vec3(0.0, -0.4, 0.0), vec3(4.5, 2.6, 3.4)) + 0.4 * fbm3(l * 0.7);
  float lh = sdCappedCone(l - vec3(0.0, 5.0, 0.0), 3.2, 0.95, 0.6);
  lh = min(lh, sdCylinder(l - vec3(0.0, 8.7, 0.0), 0.5, 0.62));
  lh = min(lh, sdCappedCone(l - vec3(0.0, 9.55, 0.0), 0.35, 0.7, 0.05));
  d = min(d, min(rock * 0.8, lh));
  // 선창 돌벽 (마을 왼쪽 끝을 지나 방파제로 조금 더 이어진다)
  d = min(d, max(max(p.z - SHORE, p.y - 1.1), XMIN - 2.5 - p.x));
  return d;
}

// ───── 부두 ─────
float pier(vec3 p, out float m) {
  m = 4.0;
  float d = sdBox(p - vec3(0.0, DECK - 0.07, -4.0), vec3(0.85, 0.07, 13.2));
  float gz = abs(p.z - 0.24 * floor(p.z / 0.24 + 0.5));
  d += 0.012 * smoothstep(0.02, 0.0, gz) * step(DECK - 0.03, p.y);
  float zr = p.z - 2.4 * floor(p.z / 2.4 + 0.5);
  float pile = sdCylinder(vec3(abs(p.x) - 0.9, p.y + 0.165, zr), 1.035, 0.11);
  pile = max(pile, p.z - 9.0);
  pile = max(pile, -17.2 - p.z);
  d = min(d, pile);
  for (int i = 0; i < 3; i++) {
    vec3 c = uL[i].xyz;
    vec3 q = p - vec3(0.95, DECK, c.z);
    float post = sdBox(q - vec3(0.0, 0.82, 0.0), vec3(0.055, 0.82, 0.055));
    post = min(post, sdBox(q - vec3(-0.17, 1.6, 0.0), vec3(0.19, 0.03, 0.03)));
    post = min(post, sdCapsule(p, c + vec3(0.0, 0.16, 0.0), vec3(c.x, DECK + 1.6, c.z), 0.008));
    float bd = length(p - c) - 0.25;
    if (bd < 0.0) {
      vec3 lq = p - c;
      float cage = sdRoundBox(lq, vec3(0.08, 0.12, 0.08), 0.01);
      cage = max(cage, -sdBox(lq, vec3(0.062, 0.095, 0.2)));
      cage = max(cage, -sdBox(lq, vec3(0.2, 0.095, 0.062)));
      cage = min(cage, sdCappedCone(lq - vec3(0.0, 0.15, 0.0), 0.04, 0.09, 0.02));
      if (cage < d) m = 5.0;
      d = min(d, cage);
      float glass = sdEllipsoid(lq, vec3(0.05, 0.08, 0.05));
      if (glass < d) m = 6.0;
      d = min(d, glass);
    } else d = min(d, bd + 0.05);
    if (post < d) m = 4.0;
    d = min(d, post);
  }
  return d;
}

// 선체: 이물이 뾰족하고 뱃전이 앞뒤로 휘어 오른다
float hullSD(vec3 q, float L, float W, float D) {
  float zz = clamp(q.z / L, -1.0, 1.0);
  float wz = W * (zz > 0.0 ? 1.0 - zz * zz : 1.0 - 0.3 * zz * zz);
  float sheer = 0.28 + 0.22 * zz * zz;
  float side = abs(q.x) - wz * (0.55 + 0.45 * smoothstep(-D, 0.2, q.y));
  float d = max(side, q.y - sheer);
  float keel = -D * (1.0 - pow(clamp(abs(q.x) / max(wz, 0.02), 0.0, 1.0), 2.0)) * (1.0 - 0.5 * zz * zz);
  d = max(d, keel - q.y);
  d = max(d, abs(q.z) - L);
  return d * 0.6;
}

float boat(vec3 p, vec3 c, float ang, float mast, out float m) {
  vec3 q = p - c;
  q.xz = rot(ang) * q.xz;
  float bb = length(q - vec3(0.0, mast * 0.45, 0.0)) - (mast * 0.55 + 1.2);
  m = 7.0;
  if (bb > 0.0) return bb + 0.05;
  float hull = hullSD(q, 1.95, 0.72, 0.6);
  // 갑판은 뱃전보다 조금 낮다
  hull = max(hull, -max(sdBox(q - vec3(0.0, 0.5, -0.1), vec3(0.6, 0.27, 1.45)), -0.6 * (q.y - 0.22)));
  float cabin = sdRoundBox(q - vec3(0.0, 0.45, -0.75), vec3(0.42, 0.28, 0.48), 0.04);
  cabin = min(cabin, sdBox(q - vec3(0.0, 0.76, -0.75), vec3(0.48, 0.03, 0.54)));
  float d = min(hull, cabin);
  float ms = sdCapsule(q, vec3(0.0, 0.2, 0.35), vec3(0.0, mast, 0.35), 0.035);
  ms = min(ms, sdCapsule(q, vec3(0.0, mast * 0.3, 0.35), vec3(0.0, mast * 0.36, 1.7), 0.025));
  ms = min(ms, sdCapsule(q, vec3(0.0, mast, 0.35), vec3(0.0, 0.45, 1.95), 0.008));
  ms = min(ms, sdCapsule(q, vec3(0.0, mast, 0.35), vec3(0.0, 0.4, -1.9), 0.008));
  ms = min(ms, sdCapsule(q, vec3(0.0, mast * 0.85, 0.35), vec3(0.62, 0.35, 0.3), 0.007));
  ms = min(ms, sdCapsule(q, vec3(0.0, mast * 0.85, 0.35), vec3(-0.62, 0.35, 0.3), 0.007));
  if (ms < d) m = 8.0;
  return min(d, ms);
}

vec2 sdfDry(vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  float pm;
  float pd = pier(p, pm);
  r = umin(r, vec2(pd, pm));
  float bm;
  r = umin(r, vec2(boat(p, vec3(-1.95, 0.05, -7.0), 0.18, 3.6, bm), bm));
  r = umin(r, vec2(boat(p, vec3(2.45, 0.04, -10.5), -0.35, 4.2, bm), bm));
  r = umin(r, vec2(boat(p, vec3(-3.9, 0.04, -13.5), 0.6, 3.2, bm), bm));
  r = umin(r, vec2(town(p), 2.0));
  return r;
}
vec2 sdf(vec3 p) { return umin(vec2(p.y, 1.0), sdfDry(p)); }

// 창문: 집 앞면(물 쪽)의 층마다 난 창. 일부만 불이 켜져 있다
vec3 windowGlow(vec3 p, vec3 n) {
  if (n.z < 0.6) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int row = 0; row < 3; row++) {
    float z0 = row == 0 ? SHORE - 0.6 : row == 1 ? SHORE - 4.2 : SHORE - 8.0;
    float y0 = row == 0 ? 1.1 : row == 1 ? 2.6 : 4.2;
    float s = float(row) + 1.0;
    float w = row == 0 ? 1.9 : row == 1 ? 2.1 : 2.3;
    float ox = row == 0 ? 0.0 : row == 1 ? 0.7 : 1.3;
    float x = p.x + ox;
    float cx = floor(x / w);
    float lx = x - (cx + 0.5) * w;
    float hw = w * (0.4 + 0.08 * hashc(cx, s + 1.0));
    float h = 1.6 + 2.2 * hashc(cx, s + 2.0);
    float dep = 1.4 + 0.8 * hashc(cx, s + 3.0);
    float zc = z0 - dep - 0.6 * hashc(cx, s + 4.0);
    if (abs(p.z - (zc + dep)) > 0.05) continue;
    if ((cx + 0.5) * w < XMIN - float(row) * 1.5) continue;
    float ly = p.y - y0;
    float fl = floor(ly / 0.95);
    float fy = ly - fl * 0.95;
    float cols = hashc(cx, s + 9.0) > 0.5 ? 2.0 : 1.0;
    float ww = hw * 2.0 / cols;
    float wc = floor((lx + hw) / ww);
    float wx = lx + hw - (wc + 0.5) * ww;
    if (ly > h - 0.2 || fl < 0.0) continue;
    float win = step(abs(wx), 0.15) * step(abs(fy - 0.52), 0.23);
    float frame = step(abs(wx), 0.012) + step(abs(fy - 0.52), 0.012);
    float lit = step(0.6, hashc(cx * 7.0 + fl * 3.0 + wc, s + 11.0));
    float warm = 0.5 + 0.5 * hashc(cx + fl, s + 13.0);
    acc += win * (1.0 - min(frame, 1.0) * 0.8) * (lit * vec3(1.0, 0.6, 0.26) * 2.6 * warm + (1.0 - lit) * vec3(0.012, 0.016, 0.02));
  }
  return acc;
}

vec3 lampLight(vec3 p, vec3 n, vec3 V, float rough, float spec, inout vec3 sp) {
  vec3 dif = vec3(0.0);
  for (int i = 0; i < NLAMP; i++) {
    vec3 lp = uL[i].xyz - p;
    float d2 = dot(lp, lp);
    vec3 l = lp * inversesqrt(d2);
    vec3 c = LAMPC * uLC[i].w * 3.5 / (1.0 + d2 * 2.2);
    dif += c * max(dot(n, l), 0.0);
    sp += c * pow(max(dot(n, normalize(l + V)), 0.0), mix(200.0, 10.0, rough)) * spec;
  }
  return dif;
}

// 하늘빛(반구) + 새벽 역광 + 등불
vec3 shade(vec3 p, vec3 n, vec3 V, vec3 alb, float rough, float spec) {
  vec3 sd = sunD();
  vec3 skyl = mix(vec3(0.022, 0.028, 0.04), vec3(0.07, 0.085, 0.115), n.y * 0.5 + 0.5);
  vec3 c = alb * skyl;
  c += alb * DAWN * 0.12 * max(dot(n, sd) * 0.7 + 0.3, 0.0);
  // 역광 테두리: 하늘을 등진 윤곽
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  c += DAWN * 0.09 * fres * max(dot(-V, sd), 0.0) * smoothstep(-0.3, 0.4, n.y + 0.2);
  vec3 sp = vec3(0.0);
  c += alb * lampLight(p, n, V, rough, spec, sp);
  c += sp;
  c += vec3(0.25, 0.2, 0.17) * spec * 0.12 * pow(max(dot(reflect(-V, n), sd), 0.0), 8.0);
  return c;
}

vec3 simpleShade(vec3 q, float id, vec3 rd) {
  if (id > 5.5 && id < 6.5) return LAMPC * 4.0;
  vec2 e = vec2(0.01, -0.01);
  vec3 n = normalize(e.xyy * sdfDry(q + e.xyy).x + e.yyx * sdfDry(q + e.yyx).x + e.yxy * sdfDry(q + e.yxy).x + e.xxx * sdfDry(q + e.xxx).x);
  vec3 alb = id > 1.5 && id < 3.5 ? vec3(0.04, 0.04, 0.04) : vec3(0.035, 0.03, 0.026);
  vec3 c = shade(q, n, -rd, alb, 0.8, 0.0);
  if (id > 1.5 && id < 2.5) c += windowGlow(q, n);
  return c;
}

vec3 traceRefl(vec3 ro, vec3 rd, float t0) {
  float t = 0.03;
  vec3 col = vec3(-1.0);
  for (int i = 0; i < 72; i++) {
    vec3 q = ro + rd * t;
    vec2 h = sdfDry(q);
    if (h.x < 0.002 * t) {
      col = simpleShade(q, h.y, rd);
      break;
    }
    t += h.x * 0.9;
    if (t > 45.0) break;
  }
  if (col.x < 0.0) col = sky(rd);
  else col = mix(col, hazeCol(rd), 1.0 - exp(-(t + t0) * 0.02));
  for (int i = 0; i < NLAMP; i++) {
    vec3 c = uL[i].xyz - ro;
    float along = dot(c, rd);
    if (along < 0.0) continue;
    float dp = length(c - rd * along);
    float k = exp(-dp / 0.1);
    col += LAMPC * uLC[i].w * (k * 0.5 + pow(k, 6.0) * 1.5);
  }
  return col;
}

float rip(vec2 x) {
  return noise(vec3(x * vec2(0.5, 1.6), 0.0)) * 0.6 + noise(vec3(x * vec2(1.7, 4.0), 1.3)) * 0.3 + noise(vec3(x * vec2(5.0, 9.0), 2.7)) * 0.1;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float tc = length(uCamPos - p);
  vec3 want;
  if (id < 1.5) {
    // 잔잔한 물
    vec2 e = vec2(0.02, 0.0);
    float amp = 0.024 * smoothstep(40.0, 4.0, tc) + 0.004;
    float h0 = rip(p.xz);
    vec3 wn = normalize(vec3(-(rip(p.xz + e.xy) - h0) / e.x * amp, 1.0, -(rip(p.xz + e.yx) - h0) / e.x * amp));
    vec3 R = reflect(-V, wn);
    R.y = abs(R.y);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
    vec3 refl = traceRefl(p + wn * 0.01, R, tc);
    vec3 sp = vec3(0.0);
    vec3 body = vec3(0.004, 0.006, 0.007) + lampLight(p, vec3(0.0, 1.0, 0.0), V, 0.5, 0.0, sp) * 0.01;
    want = refl * fres * 0.9 + body;
    want = mix(want, hazeCol(-V), 1.0 - exp(-tc * 0.02));
  } else if (id > 5.5 && id < 6.5) {
    want = LAMPC * 5.0;
  } else {
    vec3 alb = vec3(0.05);
    float rough = 0.8;
    float spec = 0.1;
    vec3 emi = vec3(0.0);
    if (id < 2.5) {
      float roofy = smoothstep(0.35, 0.75, abs(n.x) + n.y * 0.6) * step(n.z, 0.6);
      alb = mix(vec3(0.05, 0.048, 0.045), vec3(0.022, 0.024, 0.028), roofy) * (0.7 + 0.5 * fbm3(p * 1.7));
      // 등대 위의 등불칸
      vec3 l = p - vec3(6.2, 8.7, SHORE - 4.0);
      if (length(l) < 0.7 && abs(l.y) < 0.35) emi += vec3(1.0, 0.72, 0.42) * (1.2 + 1.4 * pow(max(dot(normalize(l.xz + vec2(1e-4)), normalize(uCamPos.xz - vec2(6.2, SHORE - 4.0))), 0.0), 4.0));
      emi += windowGlow(p, n);
    } else if (id < 4.5) {
      float grain = noise(vec3(p.x * 30.0, p.y * 4.0, p.z * 3.0));
      alb = vec3(0.036, 0.031, 0.027) * (0.6 + 0.5 * grain) * (0.75 + 0.5 * hash31(floor(p * vec3(1.0, 1.0, 4.17))));
      rough = 0.45;
      spec = 0.35;
    } else if (id < 5.5) {
      alb = vec3(0.025, 0.023, 0.022);
      rough = 0.4;
      spec = 0.5;
    } else if (id < 7.5) {
      float seam = smoothstep(0.82, 0.95, abs(fract(p.y * 6.0 + 0.3) * 2.0 - 1.0));
      float paint = step(0.5, noise(p * 2.0 + 3.0));
      alb = mix(vec3(0.045, 0.045, 0.043), vec3(0.07, 0.03, 0.022), paint) * (1.0 - 0.5 * seam);
      rough = 0.6;
      spec = 0.25;
    } else {
      alb = vec3(0.03, 0.026, 0.022);
    }
    want = shade(p, n, V, alb, rough, spec) + emi;
    // 가까운 갑판(아래쪽, UI가 덮는 곳)은 더 어둡게
    if (id > 2.5 && id < 4.5) want *= mix(0.5, 1.0, smoothstep(2.5, 9.0, tc));
    want = applyFog(want, p);
  }
  if (uP[0].x > 0.5) return Mat(vec3(0.0), 1.0, 0.0, undoFog(vec3(fract(id * 0.37), fract(id * 0.61), fract(id * 0.83)), p), 0.0, 0.0, 0.0);
  return Mat(vec3(0.0), 1.0, 0.0, undoFog(want, p), 0.0, 0.0, 0.0);
}

// 등대 불빛 줄기: 광선과 빛줄기 축의 최단 거리로 해석적으로 적분 (잡음 없음)
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 o = vec3(6.2, 8.75, SHORE - 4.0);
  vec3 b = normalize(vec3(-1.0, -0.03, 0.4));
  vec3 w0 = ro - o;
  float bb = dot(rd, b);
  float d = dot(rd, w0);
  float e = dot(b, w0);
  float den = max(1.0 - bb * bb, 1e-4);
  float t = (bb * e - d) / den;
  float sAx = (e - bb * d) / den;
  if (sAx < 0.4 || t < 0.0 || t > tHit) return vec4(0.0);
  float dist = length((ro + rd * t) - (o + b * sAx));
  float cone = 0.12 + sAx * 0.055;
  float k = exp(-dist * dist / (cone * cone)) * cone * 1.77 / sqrt(den);
  k *= exp(-sAx * 0.045) * smoothstep(0.4, 1.5, sAx);
  return vec4(vec3(1.0, 0.82, 0.6) * k * 0.16, 0.0);
}

vec4 volume(vec3 p) {
  if (uP[0].x > 0.5) return vec4(0.0);
  // 물 위에 낮게 깔린 새벽 안개
  float low = exp(-max(p.y, 0.0) / 0.8);
  float nz = fbm3(p * vec3(0.18, 0.6, 0.3) + vec3(2.0, 0.0, 0.0));
  float dens = 0.0008 + 0.03 * low * smoothstep(0.35, 0.8, nz);
  vec3 v = p - uCamPos;
  float lv = length(v);
  vec3 rd = lv > 1e-4 ? v / lv : vec3(0.0, 0.0, -1.0);
  vec3 L = hazeCol(rd) * 0.8;

  for (int i = 0; i < NLAMP; i++) {
    vec3 lp = uL[i].xyz - p;
    L += LAMPC * uLC[i].w * 1.6 / (1.0 + dot(lp, lp) * 2.5);
  }
  return vec4(L, dens);
}
`,
  };
}
