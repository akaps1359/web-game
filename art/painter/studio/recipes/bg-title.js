// 타이틀 배경 — 심연으로의 하강.
// 안개 낀 항구 마을 한가운데 뚫린 거대한 수직 갱. 벽을 따라 깎아 낸 나선 계단이 끝없이 내려가고, 층마다 등불이 고리처럼 이어진다.
// 아래로 갈수록 안개가 짙어지고, 저 밑바닥에서 청록빛이 희미하게 올라온다 — '아래의 목소리'.
// 갱 건너편 가장자리에는 기울어진 집들과 등대가 안개 속 달빛에 실루엣으로 서 있다.
// 기법: 넓은 화각으로 내려다본 원통 갱(나선 선반은 각도 반복), 등불은 각도·층 반복으로 SDF/빛/번짐을 함께 계산.

export default function bgTitle({ seed = 1 } = {}) {
  const Rs = 20.0;
  const pos = [0.6, 1.5, Rs - 4.5];
  const pitch = (57 * Math.PI) / 180;
  const target = [0.0, pos[1] - Math.sin(pitch) * 10, pos[2] - Math.cos(pitch) * 10];
  return {
    preset: 'act1',
    cam: { pos, target, fov: 0.74 },
    light: { key: [0, -1, 0], keyCol: [0, 0, 0], fillCol: [0, 0, 0], amb: [0, 0, 0], rim: 0, fog: [0, 0, 0], glow: 0.0, exposure: 1.15 },
    arrays: { uP: [[seed === 99 ? 1 : 0, 0, 0, 0]] },
    glsl: /* glsl */ `
#define HAS_BG
#define HAS_VOLUME
#define HAS_OVERLAY
#define VOLUME_STEPS 64
#define VOLUME_FAR 58.0

const float RS = ${Rs.toFixed(1)};   // 갱 반지름
const float PITCH = 9.0;  // 나선 한 바퀴에 내려가는 깊이
const float LW = 2.4;     // 선반 폭
const float NL = 22.0;    // 한 바퀴의 등불 수
const vec3 VOICE = vec3(0.12, 0.95, 0.72);
const vec3 LAMP = vec3(1.0, 0.6, 0.26);
const vec3 MOON = vec3(-0.35, 0.55, -1.0);

float rep(float x, float s) { return x - s * floor(x / s + 0.5); }
float box2(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// ───── 하늘: 안개 낀 밤, 구름 너머 달 ─────
vec3 sky(vec3 rd) {
  float h = max(rd.y, 0.0);
  vec3 col = mix(vec3(0.06, 0.085, 0.09), vec3(0.01, 0.016, 0.022), smoothstep(0.0, 0.5, h));
  vec3 md = normalize(MOON);
  float g = max(dot(rd, md), 0.0);
  col += vec3(0.5, 0.65, 0.65) * pow(g, 30.0) * 0.5 + vec3(0.8, 0.9, 0.88) * pow(g, 600.0) * 1.5;
  vec2 uv = rd.xz / (h + 0.15);
  col *= 0.6 + 0.6 * smoothstep(0.3, 0.9, fbm(vec3(uv * 0.8, 2.0)));
  return col;
}
vec3 background(vec3 rd) {
  if (rd.y < -0.2) return vec3(0.0);
  return sky(rd);
}
vec3 undoFog(vec3 want, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  float f = 1.0 - exp(-0.0015 * t * t);
  return (want - background(rd) * f) / max(1.0 - f, 0.03);
}
// 깊이에 따른 안개 색: 위는 달빛 회청, 아래는 목소리의 청록
vec3 depthFog(float y) {
  return mix(vec3(0.02, 0.03, 0.034), VOICE * 0.045, smoothstep(-5.0, -45.0, y));
}

// 나선 선반: 각도 a에서 n번째 바퀴의 높이
float ledgeY(float a, float n) { return -2.0 - (a / 6.2831853) * PITCH - n * PITCH; }
// 점 p에서 가장 가까운 선반의 (높이 차, 바퀴 번호)
vec2 ledgeNear(vec3 p) {
  float a = atan(p.z, p.x) + 3.14159265;
  float y0 = -2.0 - (a / 6.2831853) * PITCH;
  float n = floor((y0 - p.y) / PITCH + 0.5);
  return vec2(p.y - (y0 - n * PITCH), n);
}
// 등불 위치 (가장 가까운 것)
vec3 lampPos(vec3 p) {
  float a = atan(p.z, p.x) + 3.14159265;
  float cell = 6.2831853 / NL;
  float ca = (floor(a / cell) + 0.5) * cell;
  float y0 = -2.0 - (ca / 6.2831853) * PITCH;
  float n = floor((y0 + 1.1 - p.y) / PITCH + 0.5);
  float ly = y0 - n * PITCH + 1.1;
  float r = RS - 0.35;
  return vec3(cos(ca - 3.14159265) * r, ly, sin(ca - 3.14159265) * r);
}

// 가장자리의 집들 (각도 반복)
float houses(vec3 p) {
  float r = length(p.xz);
  if (r < RS + 1.0 || p.y > 14.0) return max(RS + 1.0 - r, p.y - 14.0) + 0.3;
  float a = atan(p.z, p.x);
  float cell = 6.2831853 / 26.0;
  float ci = floor(a / cell + 0.5);
  float la = a - ci * cell;
  vec2 lp = vec2(r * cos(la) - (RS + 3.6 + 1.5 * hash11(ci * 3.1)), r * sin(la));
  float h = 2.5 + 4.5 * hash11(ci * 7.7);
  float w = 1.5 + 0.6 * hash11(ci * 1.3);
  float lean = (hash11(ci * 5.1) - 0.5) * 0.25;
  vec3 q = vec3(lp.x + lean * p.y, p.y, lp.y);
  float body = sdBox(q - vec3(0.0, h * 0.5, 0.0), vec3(1.6, h * 0.5, w));
  float roof = max(abs(q.z) * 1.3 + (q.y - h) - w * 1.2, max(-(q.y - h), abs(q.x) - 1.7));
  float d = min(body, roof);
  d = min(d, (cell * 0.5 - abs(la)) * r + 0.2);
  // 등대
  vec3 l = p - vec3(-RS - 5.0, 0.0, -6.0);
  float lh = sdCappedCone(l - vec3(0.0, 6.0, 0.0), 6.0, 1.3, 0.75);
  lh = min(lh, sdCylinder(l - vec3(0.0, 12.6, 0.0), 0.6, 0.85));
  lh = min(lh, sdCappedCone(l - vec3(0.0, 13.7, 0.0), 0.5, 0.95, 0.05));
  return min(d, lh);
}

vec2 sdf(vec3 p) {
  float r = length(p.xz);
  // 지면과 갱 벽: 지면 위(갱 밖)는 y=0 땅, 갱 안은 빈 공간
  float ground = max(p.y, RS - r);
  float wall = RS - r;
  float solid = max(-wall, 0.0) > 0.0 ? 0.0 : 0.0;
  // 고체 = (r > RS 그리고 y < 0)
  float shaftSolid = max(RS - r, p.y);
  // 벽의 돌 결
  if (abs(RS - r) < 0.3 && p.y < 0.0) {
    float a = atan(p.z, p.x) * RS;
    vec2 b = vec2(a / 1.1, p.y / 0.55);
    b.x += mod(floor(b.y), 2.0) * 0.5;
    vec2 f = abs(fract(b) - 0.5);
    shaftSolid += 0.05 * smoothstep(0.42, 0.5, max(f.x, f.y)) + 0.02 * hash31(floor(vec3(b, 1.0)));
  }
  vec2 res = vec2(shaftSolid, 2.0);
  // 가장자리 낮은 난간
  float rail = max(abs(r - RS - 0.45) - 0.35, max(p.y - 0.9, -p.y));
  res = umin(res, vec2(rail, 2.0));
  // 나선 선반 (계단): 벽에서 안쪽으로 튀어나온 판
  vec2 ln = ledgeNear(p);
  float ledge = max(abs(ln.x + 0.35) - 0.35, max(RS - LW - r, r - RS - 0.1));
  ledge = max(ledge, p.y + 0.0);
  // 계단 단 (각도 방향으로 잘게)
  float a = atan(p.z, p.x);
  float st = abs(fract(a * RS / 0.55) - 0.5);
  ledge += 0.06 * smoothstep(0.3, 0.5, st) * step(ln.x, 0.05);
  // 선반 아래 받침 (까치발)
  float cell = 6.2831853 / NL;
  float bra = max(abs(rep(a, cell) * r) - 0.25, max(RS - r - LW * 0.8 + (-(ln.x + 0.7)) * 0.9, -(ln.x + 0.6)));
  bra = max(bra, ln.x + 2.2);
  ledge = min(ledge, bra * 0.7);
  res = umin(res, vec2(ledge * 0.8, 3.0));
  // 등불: 벽에 박은 쇠막대 끝의 유리
  vec3 lp = lampPos(p);
  float lamp = length(p - lp) - 0.16;
  res = umin(res, vec2(lamp, 6.0));
  float arm = sdCapsule(p, lp + vec3(0.0, 0.2, 0.0), lp * (RS / length(lp.xz)) * vec3(1.0, 0.0, 1.0) + vec3(0.0, lp.y + 0.3, 0.0), 0.03);
  res = umin(res, vec2(arm, 5.0));
  // 마을
  res = umin(res, vec2(houses(p), 4.0));
  return res;
}

vec3 lampLight(vec3 p, vec3 n) {
  vec3 lp = lampPos(p);
  vec3 d = lp - p;
  float d2 = dot(d, d);
  return LAMP * 3.2 * max(dot(n, d * inversesqrt(d2)), 0.0) / (1.0 + d2 * 1.2);
}
vec3 shade(vec3 p, vec3 n, vec3 V, vec3 alb) {
  // 달빛 (위), 아래에서 올라오는 목소리의 빛, 가까운 등불
  vec3 c = alb * vec3(0.1, 0.13, 0.14) * max(n.y, 0.0) * smoothstep(-25.0, 0.0, p.y);
  vec3 toAxis = normalize(vec3(-p.x, 0.0, -p.z));
  float below = smoothstep(-6.0, -45.0, p.y);
  c += alb * VOICE * (0.08 + 0.6 * below) * max(dot(n, normalize(toAxis + vec3(0.0, -0.8, 0.0))) * 0.7 + 0.3, 0.0) * (0.3 + below);
  c += alb * lampLight(p, n);
  return c;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  vec3 want;
  if (id > 5.5) {
    want = LAMP * 4.0;
  } else {
    vec3 alb = vec3(0.07, 0.07, 0.068) * (0.6 + 0.6 * fbm3(p * 0.8));
    if (id > 2.5 && id < 3.5) alb = vec3(0.09, 0.088, 0.085) * (0.7 + 0.4 * fbm3(p * 2.0));
    if (id > 3.5 && id < 4.5) alb = vec3(0.04, 0.042, 0.045);
    if (id > 4.5) alb = vec3(0.03);
    // 젖은 이끼 얼룩
    alb *= 1.0 - 0.4 * smoothstep(0.5, 0.8, noise(p * vec3(0.3, 0.9, 0.3)));
    want = shade(p, n, V, alb);
    // 갱 벽 위쪽에 파 들어간 집들의 창과 문 (마을이 갱 속까지 이어진다)
    if (id > 1.5 && id < 2.5 && p.y < -0.5 && p.y > -16.0 && length(p.xz) > RS - 0.3) {
      float a = atan(p.z, p.x);
      vec2 g3 = vec2(a * 22.0, p.y * 0.6);
      vec2 fg = fract(g3);
      float on = step(0.78, hash31(vec3(floor(g3), 7.0)));
      float win = on * step(0.32, fg.x) * step(fg.x, 0.68) * step(0.4, fg.y) * step(fg.y, 0.72);
      want += LAMP * win * 0.8 * smoothstep(-16.0, -2.0, p.y);
    }
    // 마을 창 불빛 (집의 갱 쪽 면)
    if (id > 3.5 && id < 4.5) {
      float a = atan(p.z, p.x);
      vec2 g = vec2(a * 60.0, p.y * 1.4);
      vec2 g2 = vec2(a * 34.0, p.y * 0.9);
      float win = step(0.86, hash31(vec3(floor(g2), 4.0))) * step(0.35, fract(g2.x)) * step(fract(g2.x), 0.65) * step(0.3, fract(g2.y)) * step(fract(g2.y), 0.7) * step(1.0, p.y);
      want += LAMP * win * 0.9 * step(0.3, -dot(n, normalize(p * vec3(1.0, 0.0, 1.0))));
      vec3 l = p - vec3(-RS - 5.0, 12.6, -6.0);
      if (length(l.xz) < 0.9 && abs(l.y) < 0.6) want += vec3(1.0, 0.85, 0.6) * 2.0;
    }
  }
  // 깊이 안개: 멀고 깊을수록 청록빛 안개 속으로
  float t = length(p - uCamPos);
  float fdep = 1.0 - exp(-t * 0.025 - max(-p.y - 8.0, 0.0) * 0.035 - max(p.y, 0.0) * 0.05);
  want = mix(want, depthFog(p.y), fdep);
  if (uP[0].x > 0.5) want = vec3(fract(id * 0.37), fract(id * 0.61), fract(id * 0.83));
  return Mat(vec3(0.0), 1.0, 0.0, undoFog(want, p), 0.0, 0.0, 0.0);
}

// 등불의 빛 번짐: 선반 높이마다 광선 위의 가장 가까운 등불
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  if (uP[0].x > 0.5) return vec4(0.0);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 40; k++) {
    float t = 1.0 + float(k) * 1.4;
    if (t > tHit) break;
    vec3 p = ro + rd * t;
    if (length(p.xz) < RS - 3.0) continue;
    vec3 lp = lampPos(p);
    vec3 c = lp - ro;
    float along = dot(c, rd);
    if (along < 0.0 || along > tHit + 0.3) continue;
    float dp = length(c - rd * along);
    float kk = exp(-dp / (0.09 + along * 0.004));
    float fade = exp(-max(-lp.y - 6.0, 0.0) * 0.05);
    acc += LAMP * (kk * 0.18 + pow(kk, 6.0) * 0.6) * fade;
  }
  return vec4(min(acc, vec3(2.0)), 0.0);
}

vec4 volume(vec3 p) {
  if (uP[0].x > 0.5) return vec4(0.0);
  float r = length(p.xz);
  float inShaft = smoothstep(RS + 0.5, RS - 1.0, r);
  // 위는 항구 안개, 갱 안은 깊어질수록 짙은 청록 안개 (목소리의 빛이 퍼진다)
  float deep = smoothstep(-4.0, -40.0, p.y);
  float n = fbm3(p * vec3(0.08, 0.15, 0.08) + vec3(0.0, 2.0, 0.0));
  float dens = 0.003 + 0.01 * exp(-abs(p.y - 1.0) / 2.5) * smoothstep(0.35, 0.75, n) + inShaft * deep * 0.014 * (0.4 + n);
  vec3 L = vec3(0.03, 0.045, 0.05) * (1.0 - deep) + VOICE * deep * 0.12 * inShaft;
  // 축 근처 깊은 곳에서 솟는 빛 기둥
  L += VOICE * 1.6 * exp(-r * r / 45.0) * deep * deep;
  vec3 lp = lampPos(p);
  L += LAMP * 0.35 / (1.0 + dot(lp - p, lp - p) * 3.0);
  return vec4(L, dens);
}
`,
  };
}
