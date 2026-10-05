// 5층 배경 — 꿈꾸는 우주.
// 궁정의 바닥이 꺼지고 열린 우주. 장미·보라·청록 성운이 자궁처럼 둥글게 감싼 공동 한가운데, 거대한 무언가가 웅크려 잠들어 있다
// (별의 태아 — 윤곽만, 성운 빛에 테두리만 비친다). 빛나는 탯줄이 성운 밖으로 흘러나가고, 성운 속에서 별들이 태어난다.
// 꿈의 땅 조각들(울타르의 지붕들, 끝없이 내려가는 일흔 계단, 작은 섬들)이 섬처럼 떠다닌다.
// 기법: 성운은 volume() (뒤쪽 껍질이 짙고 앞쪽은 엷어 태아가 비친다), 태아·섬은 SDF + emi 직접 음영, 갓 태어난 별은 uL 빛 번짐.

import { rng } from '../../lib.js';

export default function bgAct5({ seed = 1 } = {}) {
  const R = rng(seed * 17 + 5);
  const C = [1.2, 6.0, 0.0];
  // 갓 태어난 별: 성운 껍질 안쪽에 흩어진 빛
  const uL = [];
  const uLC = [];
  for (let i = 0; i < 20; i++) {
    const a = R() * Math.PI * 2;
    const b = (R() - 0.5) * Math.PI * 0.9;
    const r = 8 + R() * 6;
    const p = [C[0] + Math.cos(a) * Math.cos(b) * r, C[1] + Math.sin(b) * r * 0.85, C[2] - Math.abs(Math.sin(a) * Math.cos(b)) * r * 0.7 - 3];
    const big = R() < 0.25;
    uL.push([...p, big ? 0.09 : 0.035 + R() * 0.03]);
    const warm = R() < 0.4;
    uLC.push(warm ? [1.0, 0.82, 0.6, big ? 0.9 : 0.6] : [0.7, 0.85, 1.0, big ? 0.9 : 0.6]);
  }
  // 섬의 창 불빛 둘
  uL.push([10.6, 2.35, 7.2, 0.03], [10.0, 2.6, 6.6, 0.025]);
  uLC.push([1.0, 0.6, 0.3, 0.9], [1.0, 0.6, 0.3, 0.7]);
  return {
    preset: 'act5',
    cam: { pos: [0.0, 1.5, 40.0], target: [0.4, -2.2, 0.0], fov: 1.1 },
    light: { key: [0, -1, 0], keyCol: [0, 0, 0], fillCol: [0, 0, 0], amb: [0, 0, 0], rim: 0, fog: [0, 0, 0], glow: 0.0, exposure: 1.1 },
    arrays: { uP: [[seed === 99 ? 1 : 0, 0, 0, 0]], uL, uLC },
    glsl: /* glsl */ `
#define HAS_BG
#define HAS_VOLUME
#define HAS_OVERLAY
#define VOLUME_STEPS 72
#define VOLUME_FAR 62.0

const vec3 C = vec3(${C.join(', ')});
const vec3 ROSE = vec3(1.0, 0.36, 0.55);
const vec3 VIO = vec3(0.5, 0.25, 1.0);
const vec3 TEAL = vec3(0.2, 0.85, 0.85);

float rep(float x, float s) { return x - s * floor(x / s + 0.5); }

// ───── 하늘: 깊은 우주, 별, 먼 은하 먼지 ─────
vec3 stars(vec3 rd, float scale, float th) {
  vec3 g = rd * scale;
  vec3 c = floor(g);
  float h = hash31(c);
  float d = length(fract(g) - 0.5);
  float b = step(th, h) * smoothstep(0.45, 0.0, d);
  return mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash31(c + 5.0)) * b * (0.3 + 1.2 * hash31(c + 9.0));
}
vec3 sky(vec3 rd) {
  vec3 col = vec3(0.003, 0.002, 0.008);
  float d1 = fbm(rd * 3.0 + 1.0);
  col += vec3(0.04, 0.012, 0.05) * pow(d1, 3.0) * 1.5 + vec3(0.0, 0.02, 0.03) * pow(fbm(rd * 5.0 + 7.0), 4.0);
  col += stars(rd, 300.0, 0.988) + stars(rd, 700.0, 0.992) * 0.5;
  return col;
}
vec3 background(vec3 rd) { return sky(rd); }
vec3 undoFog(vec3 want, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  float f = 1.0 - exp(-0.0015 * t * t);
  return (want - background(rd) * f) / max(1.0 - f, 0.03);
}

// 성운 빛의 방향별 색 (태아와 섬을 비추는 환경광 근사)
vec3 nebulaLight(vec3 p, vec3 n) {
  vec3 q = C - p;
  float d = length(q);
  vec3 l = q / d;
  float k = max(dot(n, l) * 0.6 + 0.4, 0.0);
  return mix(ROSE, VIO, 0.5 + 0.5 * n.y) * k * 1.2 / (1.0 + d * d * 0.004);
}

// ───── 별의 태아: 옆모습, 거대한 두개골, 무릎을 턱 밑까지 끌어안고 웅크렸다 (얼굴은 왼쪽) ─────
const float FS = 1.9; // 크기
float fetus(vec3 p) {
  vec3 q = (p - C) / FS;
  if (length(q) > 7.0) return (length(q) - 6.6) * FS;
  q.xy = rot(0.18) * q.xy;
  // 머리: 뒤통수가 크게 부푼 두개골 + 이마·눈두덩·코·턱의 옆얼굴
  float head = sdEllipsoid(q - vec3(-0.5, 2.3, 0.0), vec3(2.2, 2.05, 1.95));
  head = smin(head, sdSphere(q - vec3(0.45, 2.85, 0.0), 1.85), 0.8);
  head = smin(head, sdEllipsoid(q - vec3(-2.25, 2.55, 0.0), vec3(0.55, 0.6, 0.95)), 0.35);
  head = smin(head, sdEllipsoid(q - vec3(-2.55, 1.75, 0.0), vec3(0.3, 0.35, 0.3)), 0.25);
  head = smin(head, sdEllipsoid(q - vec3(-2.05, 0.95, 0.0), vec3(0.6, 0.45, 0.75)), 0.35);
  // 감긴 눈꺼풀 (부풀었다)
  vec3 eq = vec3(q.x, q.y, abs(q.z));
  head = smin(head, sdEllipsoid(eq - vec3(-2.05, 2.05, 0.75), vec3(0.42, 0.3, 0.32)), 0.15);
  // 두개골 이음매
  vec3 hq = q - vec3(0.0, 2.6, 0.0);
  head = smax(head, -(abs(hq.z + 0.05 * sin(hq.x * 6.0)) - 0.035) , 0.03);
  // 몸통: 등이 둥글게 굽었다
  vec3 bq = q - vec3(0.55, -0.7, 0.0);
  bq.xy = rot(-0.35) * bq.xy;
  float body = sdEllipsoid(bq, vec3(1.75, 2.45, 1.6));
  float d = smin(head, body, 0.7);
  for (int i = 0; i < 7; i++) {
    float a = float(i) * 0.33 - 0.9;
    vec3 c = vec3(0.55, -0.7, 0.0) + vec3(cos(a) * 1.75, sin(a) * 2.4, 0.0);
    c.xy = vec2(0.55, -0.7) + rot(0.35) * (c.xy - vec2(0.55, -0.7));
    d = smin(d, sdSphere(q - c, 0.24), 0.25);
  }
  for (int s = 0; s < 2; s++) {
    float side = s == 0 ? 1.0 : -1.0;
    // 다리: 무릎이 턱 밑까지
    vec3 hip = vec3(1.1, -2.3, 0.7 * side);
    vec3 knee = vec3(-1.7, -0.4, 0.95 * side);
    vec3 foot = vec3(-0.2, -2.9, 0.75 * side);
    d = smin(d, sdRoundCone(q, hip, knee, 0.85, 0.55), 0.4);
    d = smin(d, sdRoundCone(q, knee, foot, 0.55, 0.33), 0.25);
    d = smin(d, sdEllipsoid(q - foot - vec3(-0.3, -0.05, 0.0), vec3(0.45, 0.2, 0.25)), 0.15);
    // 팔: 무릎을 감싸고, 긴 손가락이 턱 끝에 닿는다
    vec3 sh = vec3(0.1, 0.55, 1.0 * side);
    vec3 el = vec3(-0.9, -0.9, 1.25 * side);
    vec3 ha = vec3(-2.2, 0.35, 1.1 * side);
    d = smin(d, sdRoundCone(q, sh, el, 0.45, 0.32), 0.25);
    d = smin(d, sdRoundCone(q, el, ha, 0.32, 0.2), 0.2);
    for (int f = 0; f < 3; f++) {
      vec3 fo = vec3(0.0, 0.1 * float(f), 0.07 * float(f) * side);
      d = smin(d, sdRoundCone(q, ha + fo, ha + fo + vec3(-0.15, 0.6, -0.1 * side), 0.09, 0.035), 0.06);
    }
  }
  d += 0.035 * (fbm3(q * 1.6) - 0.5);
  return d * FS;
}
// 탯줄: 배에서 나와 성운 밖으로 굽이쳐 흘러간다
vec3 cordPt(float t) {
  vec3 a = C + vec3(-0.6, -2.2, 2.4);
  vec3 b = C + vec3(5.0, -9.5, 8.0);
  vec3 c = C + vec3(9.0, 2.0, 2.0);
  vec3 d = C + vec3(19.0, -3.0, 9.0);
  float m = 1.0 - t;
  vec3 pt = m * m * m * a + 3.0 * m * m * t * b + 3.0 * m * t * t * c + t * t * t * d;
  return pt + vec3(sin(t * 13.0), cos(t * 10.0), sin(t * 8.0)) * 0.35 * t;
}
float cord(vec3 p, out float tt) {
  float d = 1e5;
  tt = 0.0;
  vec3 prev = cordPt(0.0);
  float rp = 0.3;
  for (int i = 1; i <= 20; i++) {
    float t = float(i) / 20.0;
    vec3 cur = cordPt(t);
    float r = mix(0.3, 0.04, pow(t, 0.6));
    float s = sdRoundCone(p, prev, cur, rp, r);
    rp = r;
    if (s < d) {
      d = s;
      tt = t;
    }
    prev = cur;
  }
  return d;
}

// ───── 떠도는 꿈의 땅 ─────
float island(vec3 p, vec3 c, float r, float s) {
  vec3 q = p - c;
  float bb = length(q) - r * 2.0;
  if (bb > 0.5) return bb;
  float ang = atan(q.z, q.x);
  float taper = clamp(-q.y / (r * 1.9), 0.0, 1.0);
  // 아래로 갈수록 뾰족하게, 바위 기둥처럼 들쭉날쭉
  float jag = 0.55 + 0.45 * noise(vec3(ang * 3.0, s, 0.0)) + 0.3 * noise(vec3(ang * 9.0, s + 2.0, 0.0)) * taper;
  float rad = r * pow(1.0 - taper, 1.3) * jag;
  float top = q.y - 0.15 * noise(vec3(q.xz * 1.5, s)) + 0.25 * smoothstep(r * 0.6, r, length(q.xz));
  float d = max(length(q.xz) - rad, max(top, -q.y - r * 1.9));
  d += 0.3 * (fbm3(q * 1.1 + s) - 0.5);
  return d * 0.7;
}
vec2 isles(vec3 p) {
  // 1. 아래 왼쪽 가까운 큰 섬: 무너진 아치
  float d = island(p, vec3(-9.5, -9.0, 16.0), 4.2, 1.0);
  vec3 a = p - vec3(-9.0, -9.0, 16.0);
  float pil = sdCylinder(a - vec3(-1.0, 1.4, 0.0), 1.4, 0.28);
  pil = min(pil, max(sdCylinder(a - vec3(1.0, 1.0, 0.2), 1.0, 0.28), (a.y - 1.6) + 0.4 * (a.x - 1.0)));
  pil = min(pil, max(sdBox(a - vec3(-0.3, 2.95, 0.0), vec3(1.0, 0.2, 0.35)), a.x * 0.8 + (a.y - 2.95) - 0.1));
  d = min(d, pil);
  // 2. 오른쪽 섬: 울타르의 지붕들 (창에 불빛)
  float d2 = island(p, vec3(10.4, 1.6, 7.0), 2.6, 2.0);
  vec3 u = p - vec3(10.4, 1.6, 7.0);
  for (int i = 0; i < 3; i++) {
    vec3 hc = vec3(-0.9 + float(i) * 0.9, 0.0, 0.2 * float(i) - 0.3);
    float hh = 0.7 + 0.35 * float(i == 1);
    vec3 hq = u - hc;
    float house = sdBox(hq - vec3(0.0, hh * 0.5, 0.0), vec3(0.35, hh * 0.5, 0.35));
    float roof = max(abs(hq.x) * 1.4 + hq.y - hh - 0.55, max(-(hq.y - hh), abs(hq.z) - 0.4));
    d2 = min(d2, min(house, roof));
  }
  d = min(d, d2);
  // 3. 위 오른쪽: 일흔 계단이 허공으로 내려간다
  float d3 = island(p, vec3(-13.0, 15.0, -2.0), 2.3, 3.0);
  vec3 s0 = p - vec3(-12.0, 14.95, -2.0);
  float k = clamp(floor(-s0.y / 0.42), 0.0, 26.0);
  vec3 sq = s0 - vec3(-k * 0.38, -k * 0.42, k * 0.22);
  float stp = sdBox(sq, vec3(0.28, 0.05, 0.45));
  d = min(d, min(d3, stp));
  // 4. 먼 작은 섬들
  d = min(d, island(p, vec3(13.0, 17.0, -12.0), 1.8, 4.0));
  d = min(d, island(p, vec3(-3.5, -14.5, -4.0), 1.5, 5.0));
  return vec2(d, 2.0);
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(fetus(p), 1.0);
  float ct;
  r = umin(r, vec2(cord(p, ct), 3.0));
  r = umin(r, isles(p));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.2);
  vec3 want;
  if (id < 1.5) {
    // 태아: 거의 검은 실루엣, 성운 빛에 테두리만. 살 속 희미한 별빛 핏줄
    float f4 = pow(1.0 - max(dot(n, V), 0.0), 4.0);
    vec3 rimc = mix(ROSE, TEAL, smoothstep(-0.2, 0.7, n.y));
    want = vec3(0.003, 0.002, 0.005) + rimc * f4 * 0.55;
    want += nebulaLight(p, n) * 0.004;
    // 살 속에서 희미하게 비치는 별빛 핏줄
    float vein = smoothstep(0.05, 0.0, ridge(p * 0.6)) * smoothstep(0.45, 0.75, noise(p * 0.35));
    want += vec3(1.0, 0.7, 0.9) * vein * 0.025;
  } else if (id < 2.5) {
    // 꿈의 땅: 어두운 바위, 성운 쪽 가장자리가 물든다
    vec3 alb = vec3(0.035, 0.03, 0.04) * (0.7 + 0.5 * fbm3(p * 1.5));
    want = alb * nebulaLight(p, n) * 0.9 + mix(VIO, ROSE, 0.5) * fres * 0.12 * max(dot(n, normalize(C - p)) + 0.5, 0.0);
    // 울타르의 창 불빛
    vec3 u = p - vec3(10.4, 1.6, 7.0);
    float win = step(length(u.xz) , 2.0) * step(0.15, u.y) * step(u.y, 0.6) * step(0.75, fract(u.x * 4.0 + 0.2)) * step(0.2, n.z);
    want += vec3(1.0, 0.6, 0.28) * win * 1.4;
  } else {
    // 탯줄: 끝으로 갈수록 빛으로 풀린다
    float ct;
    cord(p, ct);
    vec3 glowc = mix(ROSE * 0.6, vec3(1.0, 0.85, 0.95), ct);
    want = glowc * (0.05 + 2.4 * ct * ct) + mix(ROSE, TEAL, 0.5) * fres * 0.35;
  }
  if (uP[0].x > 0.5) want = vec3(fract(id * 0.37), fract(id * 0.61), fract(id * 0.83));
  return Mat(vec3(0.0), 1.0, 0.0, undoFog(want, p), 0.0, 0.0, 0.0);
}

// 양막: 태아를 감싼 얇은 막 (비스듬한 가장자리만 희미하게)
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  if (uP[0].x > 0.5) return vec4(0.0);
  vec3 oc = ro - C;
  float R = 9.8;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - R * R;
  float h = b * b - c;
  vec3 acc = vec3(0.0);
  h = sqrt(max(h, 0.0));
  for (int i = 0; i < 2; i++) {
    if (b * b - c < 0.0) break;
    float t = i == 0 ? -b - h : -b + h;
    if (t < 0.0 || t > tHit) continue;
    vec3 p = ro + rd * t;
    vec3 n = normalize(p - C);
    float graze = pow(1.0 - abs(dot(n, rd)), 3.0);
    float wisp = 0.5 + 0.5 * fbm3(n * 3.0 + 2.0);
    acc += mix(ROSE, TEAL, smoothstep(-0.6, 0.6, n.y + wisp - 0.5)) * pow(graze, 2.0) * smoothstep(0.6, 0.95, wisp) * (i == 0 ? 0.08 : 0.04);
  }
  // 탯줄의 빛 번짐 (혜성 꼬리처럼)
  vec3 prev = cordPt(0.0);
  for (int i = 1; i <= 20; i++) {
    float t = float(i) / 20.0;
    vec3 cur = cordPt(t);
    vec3 u = cur - prev;
    vec3 w0 = prev - ro;
    float ub = dot(u, rd);
    float sc = clamp((ub * dot(rd, w0) - dot(u, w0)) / max(dot(u, u) - ub * ub, 1e-6), 0.0, 1.0);
    float tc = ub * sc + dot(rd, w0);
    if (tc > 0.0 && tc < tHit + 1.0) {
      float dd = length(w0 + u * sc - rd * tc);
      float wdt = mix(0.4, 1.4, t);
      acc += mix(ROSE, vec3(1.0, 0.85, 0.95), t) * exp(-dd / wdt) * 0.06 * (0.2 + t);
    }
    prev = cur;
  }
  // 가장 밝은 갓난 별의 십자 빛살
  vec3 ww = normalize(uCamTarget - uCamPos);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  for (int i = 0; i < 20; i++) {
    if (uL[i].w < 0.08) continue;
    vec3 c = uL[i].xyz - ro;
    float along = dot(c, rd);
    if (along < 0.0) continue;
    vec3 o = c - rd * along;
    float ox = abs(dot(o, uu)) / along;
    float oy = abs(dot(o, vv)) / along;
    float spk = exp(-ox / 0.0005) * exp(-oy / 0.012) + exp(-oy / 0.0005) * exp(-ox / 0.012);
    acc += uLC[i].rgb * spk * 0.35;
  }
  return vec4(acc, 0.0);
}

vec4 volume(vec3 p) {
  if (uP[0].x > 0.5) return vec4(0.0);
  vec3 q = p - C;
  float r = length(q);
  // 자궁 같은 껍질: 반지름 12 둘레, 뒤쪽이 짙고 앞쪽(카메라 쪽)은 엷다
  float shell = exp(-pow((r - 15.0) / 5.0, 2.0));
  float front = mix(0.3, 1.0, smoothstep(8.0, -6.0, q.z));
  float n1 = fbm3(q * 0.11 + vec3(2.0, 5.0, 1.0));
  float n2 = fbm3(q * 0.33 + vec3(7.0, 1.0, 3.0));
  float wisp = smoothstep(0.38, 0.82, n1 * 0.75 + n2 * 0.4);
  float dens = shell * wisp * front * 0.07;
  // 공동 안쪽의 엷은 빛 안개 (태아 뒤를 밝힌다)
  dens += 0.003 * exp(-r / 8.0) * front;
  // 어두운 먼지 띠 (빛을 먹는다)
  float lane = smoothstep(0.55, 0.7, fbm3(q * 0.08 + vec3(9.0, 3.0, 4.0)));
  dens += lane * shell * 0.05;
  // 아주 엷은 우주 먼지
  dens += 0.0005;
  vec3 col = mix(ROSE, VIO, smoothstep(0.35, 0.75, n2));
  col = mix(col, TEAL, smoothstep(13.5, 17.0, r) * 0.7 + smoothstep(0.7, 0.9, n1) * 0.3);
  vec3 L = col * (0.5 + 1.8 * wisp) * shell * (1.0 - 0.9 * lane) + vec3(0.9, 0.7, 1.0) * 0.5 * exp(-r / 7.0);
  // 갓 태어난 별 둘레의 빛
  for (int i = 0; i < 20; i++) {
    vec3 lp = uL[i].xyz - p;
    L += uLC[i].rgb * 0.5 / (1.0 + dot(lp, lp) * 1.5);
  }
  return vec4(L, dens);
}
`,
  };
}
