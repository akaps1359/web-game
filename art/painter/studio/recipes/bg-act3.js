// 3층 배경 — 얼어붙은 고대 도시.
// 빙하 아래의 거대한 동굴. 반투명한 얼음 천장의 갈라진 틈으로 오로라(초록·보라)가 비치고 눈보라가 쏟아져 내린다.
// 그 빛기둥 아래 인류보다 오래된 고대인의 도시: 다섯 꼭짓점 별 모양 단면의 거탑이 층층이 솟아 천장에 닿을 듯하고,
// 다리가 탑과 탑을 잇는다. 검은 돌에는 띠 모양 벽화가 새겨져 있다. 얼음 청색 대 오로라 녹·보라.
// 기법: 음영은 material()의 emi에서 직접(틈으로 드는 오로라 빛 + 얼음을 거쳐 온 푸른 빛 + 연한 그림자), 코어 안개는 되돌림.

export default function bgAct3({ seed = 1 } = {}) {
  return {
    preset: 'act3',
    cam: { pos: [-1.5, 2.6, 31.0], target: [0.8, 13.5, -4.0], fov: 1.0 },
    light: { key: [0, -1, 0], keyCol: [0, 0, 0], fillCol: [0, 0, 0], amb: [0, 0, 0], rim: 0, fog: [0, 0, 0], glow: 0.0, exposure: 1.1 },
    arrays: {
      uP: [[seed === 99 ? 1 : 0, 0, 0, 0]],
    },
    glsl: /* glsl */ `
#define HAS_BG
#define HAS_VOLUME
#define HAS_OVERLAY
#define VOLUME_STEPS 44
#define VOLUME_FAR 75.0

const vec3 TC = vec3(0.0, 0.0, -5.0);     // 중앙 거탑
const vec3 TL = vec3(-15.5, 0.0, -14.0);  // 왼쪽 탑 (얼음벽에 반쯤 묻힘)
const vec3 TR = vec3(13.0, 0.0, -21.0);   // 오른쪽 계단탑
const vec3 AUR = vec3(0.25, 1.0, 0.62);   // 오로라 초록
const vec3 AUV = vec3(0.55, 0.25, 1.0);   // 오로라 보라
const vec3 ICE = vec3(0.18, 0.42, 0.75);  // 얼음을 거쳐 온 빛

float rep(float x, float s) { return x - s * floor(x / s + 0.5); }

// 다섯 꼭짓점 별 (iq)
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// 오각형
float sdPent(vec2 p, float r) {
  const vec3 k = vec3(0.809016994, 0.587785252, 0.726542528);
  p.x = abs(p.x);
  p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
  p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
  p -= vec2(clamp(p.x, -r * k.z, r * k.z), r);
  return length(p) * sign(p.y);
}

// 얼음 천장의 갈라진 틈 (x 중심선이 z를 따라 구불거린다)
float riftMask(vec2 xz) {
  float c = 1.0 + 3.0 * sin(xz.y * 0.07 + 0.6) + 1.2 * sin(xz.y * 0.19);
  float w = 4.2 + 1.6 * sin(xz.y * 0.11 + 2.0) + 1.0 * noise(vec3(xz.y * 0.3, 0.0, 1.0));
  w *= smoothstep(-70.0, -40.0, xz.y) * smoothstep(26.0, 6.0, xz.y);
  return w - abs(xz.x - c);
}
float ceilH(vec2 xz) {
  return 39.0 + 3.0 * fbm3(vec3(xz * 0.05, 0.0)) - 0.012 * xz.x * xz.x;
}

// ───── 하늘 (틈 너머): 오로라 커튼 ─────
vec3 sky(vec3 rd) {
  vec3 col = vec3(0.004, 0.008, 0.02) + vec3(0.01, 0.02, 0.04) * (1.0 - rd.y);
  // 별
  vec3 g = rd * 240.0;
  float st = step(0.996, hash31(floor(g))) * smoothstep(0.4, 0.0, length(fract(g) - 0.5));
  col += vec3(0.8, 0.9, 1.0) * st * 0.7;
  // 오로라: 하늘의 높은 면에 비친 휘어진 커튼
  vec2 uv = rd.xz / max(rd.y, 0.05);
  float acc = 0.0;
  vec3 ac = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float band = uv.x * 0.6 + sin(uv.y * 0.5 + fi * 1.7) * 0.9 + fi * 0.8 - 0.5 + 0.3 * noise(vec3(uv * 0.8, fi));
    float curtain = exp(-band * band * 3.0);
    float rays = 0.35 + 0.65 * pow(noise(vec3(uv.x * 11.0 + uv.y * 2.0, uv.y * 0.3, fi * 3.0)), 1.5);
    float k = curtain * rays * smoothstep(0.06, 0.3, rd.y);
    // 커튼 아래 가장자리는 초록, 위로 갈수록 보라
    float top = smoothstep(-0.3, 0.6, band + (rd.y - 0.3) * 2.0);
    ac += mix(AUR * 1.1, AUV, clamp(top + fi * 0.15, 0.0, 1.0)) * k;
  }
  col += ac * 0.6;
  return col;
}
vec3 background(vec3 rd) { return sky(rd); }

// 우리 안개: 차가운 푸른 대기, 틈 아래는 초록빛이 더해진다
vec3 hazeCol(vec3 rd) {
  return vec3(0.008, 0.017, 0.036);
}
vec3 applyFog(vec3 c, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  return mix(c, hazeCol(rd), 1.0 - exp(-t * 0.018));
}
vec3 undoFog(vec3 want, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  float f = 1.0 - exp(-0.0015 * t * t);
  return (want - background(rd) * f) / max(1.0 - f, 0.03);
}

// ───── 도시 ─────
// 중앙 거탑: 층마다 별을 36도씩 돌려 쌓았다. 층 사이에 돌림띠, 꼭대기엔 다섯 바늘탑
float towerC(vec3 p) {
  vec3 q = p - TC;
  if (length(q.xz) > 9.0) return length(q.xz) - 8.5;
  float tier = clamp(floor(q.y / 6.5), 0.0, 4.0);
  float ty = q.y - tier * 6.5;
  float r = 6.0 - 0.75 * tier - 0.05 * ty;
  vec2 xz = rot(tier * 0.6283 + 0.3) * q.xz;
  float d = sdStar5(xz, r, 0.52);
  // 새겨진 띠 (벽화 자리): 각 층 가운데의 얕은 홈
  d += 0.08 * smoothstep(0.6, 0.0, abs(ty - 3.4) - 1.0);
  d = max(d, max(-q.y, q.y - 32.5));
  // 층 사이 돌림띠
  float lt = floor(q.y / 6.5 + 0.5);
  float ly = q.y - lt * 6.5;
  float ledge = max(sdStar5(rot(lt * 0.6283 + 0.3) * q.xz, 6.25 - 0.75 * lt, 0.52), abs(ly) - 0.22);
  ledge = max(ledge, max(-q.y + 0.5, q.y - 32.6));
  d = min(d, ledge);
  // 꼭대기: 별 꼭짓점마다 바늘탑, 가운데 잘린 원뿔
  vec2 pr = rot(4.0 * 0.6283 + 0.3) * q.xz;
  float an = atan(pr.x, pr.y);
  float sector = 1.2566;
  float a2 = rep(an, sector);
  vec2 sp = vec2(sin(a2), cos(a2)) * length(pr);
  float spire = sdRoundCone(vec3(sp.x, q.y, sp.y - 2.3), vec3(0.0, 32.0, 0.0), vec3(0.0, 40.0, 0.0), 0.55, 0.05);
  d = min(d, spire);
  d = min(d, sdCappedCone(q - vec3(0.0, 34.0, 0.0), 1.6, 1.8, 0.7));
  return d;
}
// 왼쪽 탑: 오각기둥 + 원뿔 지붕
float towerL(vec3 p) {
  vec3 q = p - TL;
  if (length(q.xz) > 6.0) return length(q.xz) - 5.5;
  float d = max(sdPent(rot(0.2) * q.xz, 3.6 - 0.04 * q.y), max(-q.y, q.y - 27.0));
  d += 0.07 * smoothstep(0.5, 0.0, abs(rep(q.y, 4.0)) - 0.3);
  d = min(d, sdCappedCone(q - vec3(0.0, 31.0, 0.0), 4.0, 3.4, 0.1));
  return d;
}
// 오른쪽 탑: 오각형 계단 피라미드
float towerR(vec3 p) {
  vec3 q = p - TR;
  if (length(q.xz) > 9.0) return length(q.xz) - 8.5;
  float st = clamp(floor(q.y / 4.2), 0.0, 6.0);
  float d = max(sdPent(rot(st * 0.31) * q.xz, 7.2 - st * 0.95), max(-q.y, q.y - 29.4));
  d = max(d, -(q.y - (st + 1.0) * 4.2 + 0.0) - 100.0);
  d = min(d, sdRoundCone(q, vec3(0.0, 29.0, 0.0), vec3(0.0, 35.0, 0.0), 0.9, 0.1));
  return d;
}
// 다리: 중앙 거탑과 오른쪽 탑을 잇는 아치 다리
float bridge(vec3 p) {
  vec3 a = TC + vec3(3.0, 18.5, -1.0);
  vec3 b = TR + vec3(-3.0, 18.5, 2.0);
  vec3 ab = b - a;
  float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  vec3 c = a + ab * h;
  vec3 dq = p - c;
  float sag = 1.6 * sin(h * 3.14159);
  vec3 side = normalize(cross(ab, vec3(0.0, 1.0, 0.0)));
  float al = abs(dot(p - (a + b) * 0.5, normalize(ab))) - length(ab) * 0.5;
  float d = max(max(abs(dot(dq, side)) - 0.9, abs(dq.y + 0.4) - 0.45), al);
  // 아치 아래 받침
  d = min(d, max(max(abs(dot(dq, side)) - 0.6, max(dq.y + 0.8, -dq.y - 0.8 - (1.0 - sag / 1.6) * 3.0)), al));
  return d;
}

vec2 sdf(vec3 p) {
  // 눈 덮인 바닥과 무너진 돌덩이
  float fl = p.y - (0.4 * fbm3(vec3(p.xz * 0.12, 0.0)) + 0.6 * smoothstep(9.0, 4.0, length(p.xz - TC.xz)));
  vec2 r = vec2(fl, 1.0);
  {
    vec3 q = p - vec3(-4.5, 0.6, 12.0);
    q.xz = rot(0.5) * q.xz;
    q.xy = rot(0.3) * q.xy;
    float blk = sdBox(q, vec3(2.2, 1.2, 1.4));
    vec3 q2 = p - vec3(6.0, 0.4, 8.0);
    q2.xz = rot(-0.4) * q2.xz;
    blk = min(blk, sdBox(q2, vec3(1.4, 0.9, 2.6)));
    r = umin(r, vec2(blk, 2.0));
  }
  // 탑들
  r = umin(r, vec2(towerC(p), 2.0));
  r = umin(r, vec2(towerL(p), 2.0));
  r = umin(r, vec2(towerR(p), 2.0));
  r = umin(r, vec2(bridge(p), 2.0));
  // 먼 탑들 (안개 속 실루엣)
  {
    vec3 q = p - vec3(-7.0, 0.0, -52.0);
    float d = max(sdStar5(q.xz, 6.0 - 0.06 * q.y, 0.5), max(-q.y, q.y - 34.0));
    vec3 q2 = p - vec3(9.0, 0.0, -62.0);
    d = min(d, max(sdPent(q2.xz, 5.5 - 0.08 * q2.y), max(-q2.y, q2.y - 38.0)));
    r = umin(r, vec2(d, 2.0));
  }
  // 얼음: 양옆 벽과 천장(틈이 뚫렸다), 고드름
  {
    float wallX = 19.0 + 3.0 * fbm3(vec3(p.y * 0.08, p.z * 0.06, 2.0)) + 0.008 * p.y * p.y;
    float walls = wallX - abs(p.x - 1.0);
    // 머리 위로 드리운 얼음 선반: 앞쪽(카메라 쪽)만 덮고, 그 끝은 들쭉날쭉한 절벽
    float ch = ceilH(p.xz);
    float zEdge = 6.0 + 4.0 * fbm3(vec3(p.x * 0.12, p.y * 0.05, 1.0)) + 0.1 * (ch - p.y);
    float ceil = max(ch - p.y, zEdge - p.z) * 0.8;
    float ice = min(walls, ceil);
    // 고드름 (선반 아래에만)
    vec2 ic = vec2(rep(p.x, 2.3), rep(p.z, 2.7));
    vec2 cid = floor(vec2(p.x / 2.3 + 0.5, p.z / 2.7 + 0.5));
    float len = 1.5 + 4.5 * hash31(vec3(cid, 5.0));
    float icl = sdRoundCone(vec3(ic.x, p.y, ic.y), vec3(0.0, ch - len, 0.0), vec3(0.0, ch + 0.5, 0.0), 0.04, 0.45);
    icl = max(icl, zEdge + 1.0 - p.z);
    ice = min(ice, icl);
    // 왼쪽 탑을 반쯤 삼킨 얼음 덩어리
    // 왼쪽 앞을 막아선 얼음 절벽 (왼쪽 탑을 반쯤 삼켰다)
    float cliff = (p.x + 13.5 + 0.12 * p.y - 0.06 * p.z) + 2.2 * fbm3(p * vec3(0.12, 0.05, 0.12)) + 0.6 * noise(p * 0.6);
    cliff = max(cliff, p.z - 24.0);
    ice = min(ice, cliff * 0.7);
    // 오른쪽 앞의 얼음 절벽
    float cliffR = (12.5 - p.x + 0.1 * p.y + 0.12 * (p.z - 10.0)) + 2.0 * fbm3(p * vec3(0.12, 0.05, 0.12) + 7.0) + 0.6 * noise(p * 0.6 + 3.0);
    cliffR = max(cliffR, 4.0 - p.z);
    ice = min(ice, cliffR * 0.7);
    r = umin(r, vec2(ice * 0.8, 3.0));
  }
  return r;
}

// ───── 빛 ─────
// 틈으로 드는 오로라 빛: 점에서 위로 올려다봤을 때 틈이 얼마나 열려 있나
float riftLight(vec3 p) {
  float acc = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 off = vec2(float(i) - 1.0, 0.0) * 3.0;
    float ch = ceilH(p.xz);
    vec2 at = p.xz + vec2(0.15, -0.35) * (ch - p.y) + off;
    acc += smoothstep(-1.5, 2.0, riftMask(at));
  }
  return acc / 3.0;
}
float softSh(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.2 + 0.4 * hash31(vec3(gl_FragCoord.xy, 3.0));
  for (int i = 0; i < 28; i++) {
    float h = sdf(ro + rd * t).x;
    res = min(res, 3.0 * h / t);
    t += clamp(h, 0.4, 3.0);
    if (res < 0.02 || t > 40.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
vec3 shade(vec3 p, vec3 n, vec3 V, vec3 alb, float rough, float spec) {
  // 탑들 뒤 하늘의 오로라가 역광이 된다
  vec3 L = normalize(vec3(0.12, 0.42, -1.0));
  float rl = 1.0 - 0.8 * smoothstep(-2.0, 2.0, ceilH(p.xz) - 2.0 - p.y) * step(0.0, -riftMask(p.xz)) * 0.0;
  float sh = softSh(p + n * 0.05, L) * smoothstep(13.0, 5.0, p.z + 0.15 * p.y);
  vec3 aur = mix(AUR, AUV, smoothstep(5.0, 35.0, p.y) * 0.7) * 1.3;
  vec3 c = alb * aur * max(dot(n, L), 0.0) * rl * sh;
  // 얼음 천장을 거쳐 온 차가운 빛 (위에서 넓게)
  c += alb * ICE * 0.09 * (0.3 + 0.7 * max(n.y, 0.0));
  // 얼음 벽이 비추는 옆빛
  c += alb * ICE * 0.05 * max(abs(n.x), 0.0);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  c += aur * 0.65 * fres * max(dot(n, L) + 0.4, 0.0) * sh;
  c += aur * spec * 0.4 * pow(max(dot(n, normalize(L + V)), 0.0), mix(120.0, 10.0, rough)) * rl * sh;
  return c;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  vec3 want;
  float up = smoothstep(0.5, 0.85, n.y);
  if (id < 1.5) {
    // 눈: 푸르스름한 흰빛
    want = shade(p, n, V, vec3(0.2, 0.24, 0.28) * (0.8 + 0.25 * noise(p * 4.0)), 0.7, 0.2);
  } else if (id < 2.5) {
    // 검은 돌: 띠 모양 벽화(기하학적 기호), 위쪽 면엔 눈
    float ang = atan(p.z - TC.z, p.x - TC.x);
    // 고대인의 문자: 칸마다 세로·가로·고리·사선 획을 새겼다
    vec2 g = vec2(ang * 16.0, p.y * 2.4);
    vec2 cg = floor(g);
    vec2 fg = fract(g) - 0.5;
    float h1 = hash31(vec3(cg, 1.0));
    float h2 = hash31(vec3(cg, 2.0));
    float h3 = hash31(vec3(cg, 3.0));
    float glyph = step(0.45, h1) * smoothstep(0.1, 0.05, abs(fg.x)) * step(abs(fg.y), 0.38);
    glyph = max(glyph, step(0.5, h2) * smoothstep(0.1, 0.05, abs(fg.y + 0.15 * sign(h3 - 0.5))) * step(abs(fg.x), 0.36));
    glyph = max(glyph, step(0.62, h3) * smoothstep(0.1, 0.05, abs(length(fg) - 0.24)));
    glyph = max(glyph, step(0.8, h1 * 0.5 + h3 * 0.5) * smoothstep(0.1, 0.05, abs(fg.x - fg.y)) * step(abs(fg.x), 0.34));
    float band = smoothstep(0.75, 0.55, abs(rep(p.y - TC.y, 6.5) - 3.2));
    vec3 alb = vec3(0.028, 0.03, 0.034) * (0.7 + 0.6 * fbm3(p * 0.9));
    alb *= 1.0 - 0.5 * glyph * band;
    alb = mix(alb, vec3(0.42, 0.48, 0.55), up * smoothstep(0.35, 0.7, noise(p * 1.3)));
    want = shade(p, n, V, alb, 0.45, 0.6);
    // 벽화의 홈이 희미하게 빛난다 (오래된 무언가가 아직 깨어 있다) — 중앙 거탑에서만
    float onC = smoothstep(9.5, 8.0, length(p.xz - TC.xz));
    float pulse = 0.6 + 0.4 * noise(vec3(p.y * 0.4, ang * 2.0, 5.0));
    want += vec3(0.25, 0.95, 0.85) * 0.16 * glyph * band * (1.0 - up) * onC * pulse;
  } else {
    // 얼음: 두께에 따라 푸르게 비치고, 금이 간 곳이 밝다
    float crack = smoothstep(0.06, 0.0, ridge(p * 0.35)) * 0.6 + smoothstep(0.04, 0.0, ridge(p * 1.1 + 3.0)) * 0.4;
    float depthTint = 0.6 + 0.4 * fbm3(p * 0.2);
    vec3 alb = vec3(0.08, 0.16, 0.22);
    want = shade(p, n, V, alb, 0.2, 1.0);
    want += ICE * (0.05 + 0.06 * depthTint) + vec3(0.4, 0.75, 1.0) * crack * 0.12;
    want += AUR * 0.08 * riftLight(p) * smoothstep(0.0, -0.6, n.y);
  }
  want = applyFog(want, p);
  if (uP[0].x > 0.5) want = vec3(fract(id * 0.37), fract(id * 0.61), fract(id * 0.83));
  return Mat(vec3(0.0), 1.0, 0.0, undoFog(want, p), 0.0, 0.0, 0.0);
}

// 눈보라: 바람에 비스듬히 흩날리는 눈송이 (깊이별 격자, 바람 방향으로 늘어진 줄)
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  if (uP[0].x > 0.5) return vec4(0.0);
  vec3 acc = vec3(0.0);
  vec3 wind = normalize(vec3(0.6, -1.0, 0.25));
  for (int k = 0; k < 8; k++) {
    float t = 2.0 * pow(1.5, float(k));
    if (t > tHit) break;
    vec3 p = ro + rd * t;
    float cs = 0.14 * t;
    vec3 cell = floor(p / cs);
    vec3 h = vec3(hash31(cell + 1.3), hash31(cell + 7.1), hash31(cell + 3.7));
    if (h.x > 0.55) continue;
    vec3 c = (cell + 0.2 + 0.6 * h) * cs;
    // 바람 방향으로 늘어진 선분과 광선의 거리
    vec3 a = c - wind * cs * 0.05;
    vec3 b = c + wind * cs * 0.05;
    vec3 u = b - a;
    vec3 w0 = a - ro;
    float ub = dot(u, rd);
    float sc = clamp((ub * dot(rd, w0) - dot(u, w0)) / max(dot(u, u) - ub * ub, 1e-6), 0.0, 1.0);
    float tc = ub * sc + dot(rd, w0);
    float dd = length(w0 + u * sc - rd * tc);
    float r = 0.0011 * t * (0.6 + h.y);
    float al = smoothstep(r, r * 0.2, dd);
    vec3 lit = vec3(0.35, 0.5, 0.65) * 0.22 + AUR * 0.25 * riftLight(c);
    acc += lit * al * (0.3 + 0.7 * h.z) * exp(-t * 0.03);
  }
  return vec4(acc, 0.0);
}

vec4 volume(vec3 p) {
  if (uP[0].x > 0.5) return vec4(0.0);
  // 차가운 공기 + 틈 아래로 쏟아지는 눈보라 기둥 (오로라 빛을 받는다)
  float snow = fbm3(p * vec3(0.1, 0.05, 0.1) + vec3(p.y * 0.03, 0.0, 0.0));
  float dens = 0.002 + 0.008 * smoothstep(0.45, 0.85, snow) + 0.007 * exp(-max(p.y, 0.0) / 2.5);
  vec3 rd = normalize(p - uCamPos + vec3(0.0, 0.0, 1e-4));
  float ph = pow(max(dot(rd, normalize(vec3(0.12, 0.42, -1.0))), 0.0), 3.0);
  vec3 L = vec3(0.012, 0.028, 0.06) + mix(AUR, AUV, smoothstep(8.0, 38.0, p.y) * 0.7) * (0.02 + 0.22 * ph);
  return vec4(L, dens);
}
`,
  };
}
