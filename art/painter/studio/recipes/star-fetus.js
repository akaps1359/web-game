// 별의 태아 (5층 최종 수호자) — 세 모습 모두 이 파일에서 그린다 (form 0 잠든 태아, 1 깨어나는 알 @2, 2 태어난 것 @3).
// 1. 잠든 태아: 성운의 양막 속에 웅크린 거대한 태아. 뒤로 길게 부푼 두개골은 창백하게 비치고, 그 속에서 별 하나가 타며
//    검은 핏줄과 두개골 이음매를 비춘다. 부푼 눈꺼풀은 감겨 있고 그 밑으로 검은 눈동자가 비친다.
//    지나치게 긴 손가락이 뺨을 짚었고, 다른 손은 아래로 늘어졌다. 양막은 거의 어둠 — 가장자리에만 성운 실오라기가 빛나고,
//    탯줄은 혜성처럼 빛으로 풀려 양막 밖으로 흘러간다.
// 세 모습이 같은 존재로 읽히도록 몸(머리·손·탯줄)은 같은 GLSL 조각(BODY_GLSL + bodyGLSL(자세))을 쓴다.
// seed=99 는 형체 확인용 (앞에서 비춘 회색).
import { rng } from '../../lib.js';

const f3 = (a) => `vec3(${a.map((n) => Number(n).toFixed(4)).join(', ')})`;

/** 3차 베지어 곡선 위의 점들 */
export function bezier(P, n, wob = 0, R = Math.random) {
  const out = [];
  const ph = [R() * 6, R() * 6, R() * 6];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const m = 1 - t;
    const pt = [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
    pt[0] += Math.sin(t * 11 + ph[0]) * wob * t;
    pt[1] += Math.sin(t * 9 + ph[1]) * wob * t;
    pt[2] += Math.cos(t * 7 + ph[2]) * wob * t;
    out.push(pt);
  }
  return out;
}

// GLSL rot(a) * v 와 같은 2D 회전
const rot2 = (a, x, y) => [Math.cos(a) * x + Math.sin(a) * y, -Math.sin(a) * x + Math.cos(a) * y];

/**
 * 몸 좌표 ↔ 월드. GLSL toLocal: q = (p - C) / S; q.xz = rot(-YAW) * q.xz; q.xy = rot(ROLL) * q.xy
 * 반환: { W(몸→월드), glsl(상수 + toLocal) }
 */
export function bodyFrame(C, S, yaw, roll) {
  const W = (q) => {
    let [x, y] = rot2(-roll, q[0], q[1]);
    let z = q[2];
    [x, z] = rot2(yaw, x, z);
    return [C[0] + x * S, C[1] + y * S, C[2] + z * S];
  };
  const glsl = `
const vec3 C = ${f3(C)};
const float S = ${S.toFixed(4)};
vec3 toLocal(vec3 p) {
  vec3 q = (p - C) / S;
  q.xz = rot(${(-yaw).toFixed(4)}) * q.xz;
  q.xy = rot(${roll.toFixed(4)}) * q.xy;
  return q;
}`;
  return { W, glsl };
}

// ─────────────────────────────────────────────── 공용 GLSL: 태아의 몸 ───────────────────────────────────────────────
export const BODY_GLSL = /* glsl */ `
/** 지나치게 긴 손: w 손목, f 손가락이 뻗는 쪽, u 손등 쪽, curl 마디마다 굽힘, spread 벌림, L 손가락 길이 */
float longHand(vec3 p, vec3 w, vec3 f, vec3 u, float curl, float spread, float L) {
  vec3 rel = p - w;
  // 경계 캡슐 (구로 하면 부드러운 그림자에 가짜 반그림자가 생긴다)
  float bb = sdCapsule(rel, -f * L * 0.2, f * L * 1.45, L * 0.5);
  // 멀면 경계까지의 거리를 부풀려 돌려준다 (행진 보폭 0.6 이라 안전하고, 부드러운 그림자의 가짜 반그림자가 줄어든다)
  if (bb > 0.05) return bb * 1.5;
  vec3 s = normalize(cross(f, u));
  u = normalize(cross(s, f));
  vec3 hq = vec3(dot(rel, s), dot(rel, u), dot(rel, f));
  float d = sdEllipsoid(hq - vec3(0.0, 0.0, L * 0.26), vec3(L * 0.19, L * 0.065, L * 0.27));
  d = smin(d, sdCapsule(hq, vec3(0.0, 0.0, -L * 0.25), vec3(0.0, 0.0, L * 0.15), L * 0.075), L * 0.1);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    bool thumb = i == 4;
    float o = thumb ? -1.0 : (fi - 1.5) / 1.5;
    vec3 a = thumb ? vec3(-L * 0.15, -L * 0.03, L * 0.12) : vec3(o * L * 0.13, 0.0, L * 0.5);
    vec3 dir = thumb ? normalize(vec3(-0.75, -0.35, 0.6)) : normalize(vec3(o * spread, 0.0, 1.0));
    float len = L * (thumb ? 0.6 : (1.1 - 0.22 * abs(o + 0.25)));
    float r = L * (thumb ? 0.055 : 0.046);
    float c = curl * (0.7 + 0.3 * fract(fi * 0.618 + 0.3));
    for (int k = 0; k < 3; k++) {
      float seg = len * (k == 0 ? 0.42 : k == 1 ? 0.33 : 0.25);
      dir.yz = rot(-c) * dir.yz;
      vec3 b = a + dir * seg;
      d = smin(d, sdRoundCone(hq, a, b, r, r * 0.75), r * 0.4);
      d = smin(d, sdSphere(hq - b, r * (k == 2 ? 0.66 : 1.0)), r * 0.35);
      dir.xz = rot(0.08 * o * float(k)) * dir.xz;
      a = b;
      r *= 0.78;
    }
  }
  return d;
}

/** 머리 (머리 좌표 h: +z 얼굴, +y 정수리). part: 1 살갗, 2 눈꺼풀 */
float fetusHead(vec3 h, out float part) {
  part = 1.0;
  vec3 hx = vec3(abs(h.x), h.y, h.z);
  // 두개골: 뒤로 길게 부푼 돔
  float d = sdEllipsoid(h - vec3(0.0, 0.1, -0.12), vec3(0.74, 0.8, 0.84));
  d = smin(d, sdEllipsoid(h - vec3(0.0, 0.36, -0.62), vec3(0.66, 0.72, 0.72)), 0.4);
  // 관자놀이가 꺼졌다
  d = smax(d, -sdEllipsoid(hx - vec3(0.78, -0.12, 0.25), vec3(0.12, 0.2, 0.2)), 0.15);
  // 얼굴 아래쪽: 광대와 작은 턱
  float cheek = sdEllipsoid(hx - vec3(0.24, -0.4, 0.4), vec3(0.23, 0.24, 0.26));
  float jaw = sdEllipsoid(h - vec3(0.0, -0.58, 0.42), vec3(0.19, 0.15, 0.2));
  d = smin(d, smin(cheek, jaw, 0.14), 0.2);
  // 눈두덩과 낮은 콧등
  d = smin(d, sdEllipsoid(h - vec3(0.0, -0.04, 0.64), vec3(0.34, 0.12, 0.12)), 0.1);
  d = smax(d, -sdEllipsoid(hx - vec3(0.28, -0.16, 0.8), vec3(0.2, 0.13, 0.11)), 0.08);
  // 코: 넓고 낮은 태아의 코, 콧방울과 콧구멍
  d = smin(d, sdRoundCone(h, vec3(0.0, -0.1, 0.69), vec3(0.0, -0.28, 0.76), 0.035, 0.045), 0.05);
  d = smin(d, sdEllipsoid(h - vec3(0.0, -0.305, 0.765), vec3(0.06, 0.045, 0.05)), 0.04);
  d = smin(d, sdEllipsoid(hx - vec3(0.055, -0.325, 0.725), vec3(0.04, 0.03, 0.035)), 0.03);
  d = smax(d, -sdEllipsoid(hx - vec3(0.034, -0.352, 0.77), vec3(0.017, 0.009, 0.02)), 0.006);
  // 입술: 살짝 벌어진 작은 입
  vec3 mq = h - vec3(0.0, -0.47, 0.665);
  mq.y += 0.35 * mq.x * mq.x;
  float lips = smin(sdEllipsoid(mq - vec3(0.0, 0.02, 0.0), vec3(0.095, 0.03, 0.05)), sdEllipsoid(mq - vec3(0.0, -0.035, -0.005), vec3(0.08, 0.028, 0.045)), 0.02);
  d = smin(d, lips, 0.04);
  d = smax(d, -sdEllipsoid(mq - vec3(0.0, -0.006, 0.04), vec3(0.07, 0.009, 0.05)), 0.008);
  // 두개골 이음매 (얇은 골)
  float sag = abs(h.x + 0.02 * sin(h.z * 9.0)) - 0.01;
  float cor = abs(h.z - 0.05 + 0.25 * h.x * h.x + 0.02 * sin(h.x * 11.0)) - 0.01;
  float top = smoothstep(0.1, 0.4, h.y + 0.15 * h.z);
  d += 0.006 * smoothstep(0.02, -0.004, min(sag, cor)) * top;
  // 부푼 눈꺼풀 (감겼다): 아래로 휜 속눈썹 금과 윗눈꺼풀 주름
  vec3 e = hx - vec3(0.28, -0.16, 0.58);
  e.xy = rot(-0.18) * e.xy;
  float lid = sdEllipsoid(e, vec3(0.19, 0.135, 0.15));
  float seam = max(abs(e.y + 0.025 - 1.1 * e.x * e.x) - 0.005, -(e.z - 0.1));
  float crease = max(abs(e.y - 0.07 - 0.8 * e.x * e.x) - 0.004, -(e.z - 0.08));
  lid = smax(lid, -min(seam, crease), 0.006);
  if (lid < d + 0.015) part = 2.0;
  d = smin(d, lid, 0.04);
  return d;
}

/** 탯줄(uB) 위에서 가장 가까운 점의 매개변수 t (0 배꼽 ~ 1 끝), 축 위의 점, 접선 */
float cordT(vec3 p, out vec3 ap, out vec3 tg) {
  float best = 1e5;
  float tt = 0.0;
  ap = uB[0].xyz;
  tg = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 159; i++) {
    if (i + 1 >= uBN) break;
    vec3 a = uB[i].xyz;
    vec3 ba = uB[i + 1].xyz - a;
    if (uB[i].w <= 0.0 || uB[i + 1].w <= 0.0) continue;
    float h = clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0);
    vec3 c = a + ba * h;
    float dd = length(p - c) - mix(uB[i].w, uB[i + 1].w, h);
    if (dd < best) {
      best = dd;
      tt = float(i) + h;
      ap = c;
      tg = normalize(ba);
    }
  }
  return tt;
}

/** 탯줄의 혜성 꼬리: 광선과 사슬 마디 사이 거리로 빛 번짐. i0..i1 마디 구간, 끝으로 갈수록 넓고 밝다 */
vec3 cometGlow(vec3 ro, vec3 rd, float tHit, int i0, int i1, vec3 col, float wid, float k) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 159; i++) {
    if (i < i0) continue;
    if (i >= i1 || i + 1 >= uBN) break;
    float f = (float(i - i0) + 0.5) / float(i1 - i0);
    vec3 a = uB[i].xyz;
    vec3 u = uB[i + 1].xyz - a;
    vec3 w0 = a - ro;
    float ub = dot(u, rd);
    float sc = clamp((ub * dot(rd, w0) - dot(u, w0)) / max(dot(u, u) - ub * ub, 1e-6), 0.0, 1.0);
    float tc = ub * sc + dot(rd, w0);
    if (tc < 0.0) continue;
    float dd = length(w0 + u * sc - rd * tc);
    float w = wid * (0.3 + 1.7 * f);
    float vis = tc < tHit + 0.3 ? 1.0 : 0.2;
    acc += col * (exp(-dd / w) * 0.45 + exp(-dd / (w * 0.22)) * 0.7) * smoothstep(0.0, 0.35, f) * length(u) * k * vis;
  }
  return acc;
}

/** 머리 속 별이 살갗을 비추는 빛 (살을 지나며 붉어진다). 핏줄이 그 앞을 가린다. star = 별 위치(월드) */
vec3 innerStar(vec3 p, vec3 V, vec3 star, float spread, float k, vec4 qm) {
  vec3 s = star - p;
  float along = max(dot(s, -V), 0.0);
  float perp = length(s + V * along);
  float dist = length(s);
  float g = exp(-perp * perp / (spread * spread * 0.22)) * exp(-along / spread) * 2.6 + exp(-perp * perp / (spread * spread * 2.0)) * exp(-along / (spread * 1.5)) * 0.35 + exp(-dist / (spread * 0.6)) * 0.4;
  g *= k;
  vec3 m = mix(p, star, 0.1) * 1.0;
  float vein = smoothstep(0.1, 0.0, ridge(m * 2.8 + 4.0)) * smoothstep(0.35, 0.6, noise(m * 1.7));
  float fine = smoothstep(0.08, 0.0, ridge(m * 7.5 + 2.0));
  // 갈비뼈 그림자 (몸 좌표 qm에서): 별빛 앞을 가로지르는 검은 활
  float rib = smoothstep(0.72, 0.95, sin(qm.y * 26.0 + qm.z * 8.0 - abs(qm.x) * 5.0)) * qm.w * smoothstep(0.45, 0.25, abs(qm.y - 0.02)) * smoothstep(0.1, 0.25, length(qm.xz)) * smoothstep(0.75, 0.45, length(qm.xz));
  g *= 1.0 - 0.9 * max(max(vein, fine * 0.7 * smoothstep(0.2, 0.9, g)), rib * 0.85);
  vec3 hot = vec3(1.0, 0.86, 0.62);
  vec3 flesh = vec3(0.55, 0.06, 0.05);
  return mix(flesh, hot, smoothstep(0.45, 1.5, g)) * g;
}

/** 창백하고 차가운 살갗 (id 1 살갗, 2 눈꺼풀). q 몸 좌표, h 머리 좌표, emi 속빛 */
Mat fetusSkin(float id, vec3 q, vec3 h, vec3 emi) {
  float vein = smoothstep(0.1, 0.01, ridge(q * 3.2 + 1.3)) * smoothstep(0.4, 0.65, noise(q * 1.6));
  float cap = smoothstep(0.06, 0.0, ridge(q * 11.0 + 7.0)) * smoothstep(0.45, 0.7, noise(q * 3.0 + 2.0));
  float mott = fbm3(q * 4.0);
  vec3 alb = vec3(0.12, 0.12, 0.14) * (0.7 + 0.5 * mott);
  alb = mix(alb, vec3(0.05, 0.045, 0.09), max(vein * 0.55, cap * 0.3));
  if (id > 1.5) {
    // 눈꺼풀: 얇고 젖었다. 그 밑의 검은 눈동자가 비친다
    alb = mix(vec3(0.1, 0.085, 0.105), vec3(0.03, 0.012, 0.03), max(cap * 0.8, vein * 0.4));
    return Mat(alb, 0.2, 1.0, emi, 0.06, 0.55, 0.9);
  }
  float sag = abs(h.x + 0.02 * sin(h.z * 9.0));
  float cor = abs(h.z - 0.05 + 0.25 * h.x * h.x + 0.02 * sin(h.x * 11.0));
  float sut = smoothstep(0.03, 0.0, min(sag, cor)) * smoothstep(0.1, 0.4, h.y + 0.15 * h.z);
  alb *= 1.0 - 0.6 * sut;
  return Mat(alb, 0.42, 0.5, emi * (1.0 - 0.85 * sut), 0.04, 0.55, 0.4);
}
`;

/**
 * 자세 → GLSL fetusBody(q, part). 몸 좌표: 배가 +z, 위가 +y.
 * P.head {c, pitch, tilt}, P.arms[2] {sh, el, wr, f, u, curl, spread, len}, P.legs[2] {hi, kn, an, f, u, curl}, P.curl (등 굽힘 0~1)
 */
export function bodyGLSL(P) {
  const arm = (a) =>
    `smin(sdRoundCone(q, ${f3(a.sh)}, ${f3(a.el)}, 0.12, 0.075), sdRoundCone(q, ${f3(a.el)}, ${f3(a.wr)}, 0.078, 0.05), 0.05)`;
  const leg = (l) =>
    `smin(sdRoundCone(q, ${f3(l.hi)}, ${f3(l.kn)}, 0.22, 0.12), sdRoundCone(q, ${f3(l.kn)}, ${f3(l.an)}, 0.125, 0.065), 0.06)`;
  const hand = (a) =>
    `longHand(q, ${f3(a.wr)}, normalize(${f3(a.f)}), normalize(${f3(a.u)}), ${a.curl.toFixed(3)}, ${a.spread.toFixed(3)}, ${a.len.toFixed(3)})`;
  const foot = (l) =>
    `longHand(q, ${f3(l.an)}, normalize(${f3(l.f)}), normalize(${f3(l.u)}), ${l.curl.toFixed(3)}, 0.12, 0.3)`;
  return /* glsl */ `
const vec3 HEAD_C = ${f3(P.head.c)};
vec3 toHead(vec3 q) {
  vec3 h = q - HEAD_C;
  h.yz = rot(${P.head.pitch.toFixed(4)}) * h.yz;
  h.xy = rot(${P.head.tilt.toFixed(4)}) * h.xy;
  return h;
}
float fetusBody(vec3 q, out float part) {
  part = 1.0;
  float bound = length(q - vec3(0.0, 0.2, 0.2)) - 2.1;
  if (bound > 0.3) return bound * 1.5;
  float hp;
  float d = fetusHead(toHead(q), hp);
  // 가슴: 갈비뼈가 비친다
  vec3 c1 = q - ${f3(P.chest)};
  c1.yz = rot(${(-P.curl).toFixed(4)}) * c1.yz;
  float body = sdEllipsoid(c1, vec3(0.48, 0.56, 0.42));
  // 배와 엉덩이
  body = smin(body, sdEllipsoid(q - ${f3(P.belly)}, vec3(0.45, 0.48, 0.44)), 0.3);
  body = smin(body, sdEllipsoid(q - ${f3(P.hip)}, vec3(0.4, 0.33, 0.36)), 0.25);
  // 등뼈 마디와 날개뼈
  for (int i = 0; i < 10; i++) {
    float t = float(i) / 9.0;
    vec3 sp = mix(${f3(P.spine[0])}, ${f3(P.spine[1])}, t) + ${f3(P.spine[2])} * sin(3.14159 * t);
    body = smin(body, sdSphere(q - sp, 0.065 - 0.02 * t), 0.08);
  }
  vec3 sq = vec3(abs(q.x), q.y, q.z);
  body = smin(body, sdEllipsoid(sq - vec3(0.25, ${(P.chest[1] + 0.2).toFixed(3)}, ${(P.chest[2] - 0.32).toFixed(3)}), vec3(0.2, 0.22, 0.08)), 0.12);
  // 목
  body = smin(body, sdCapsule(q, ${f3(P.neck[0])}, ${f3(P.neck[1])}, 0.18), 0.15);
  d = smin(d, body, 0.2);
  if (hp > 1.5 && d > -0.01) part = 2.0;
  // 팔다리
  d = smin(d, min(${arm(P.arms[0])}, ${arm(P.arms[1])}), 0.1);
  d = smin(d, min(${leg(P.legs[0])}, ${leg(P.legs[1])}), 0.14);
  // 지나치게 긴 손가락, 오그라든 긴 발가락
  float limbs = min(min(${hand(P.arms[0])}, ${hand(P.arms[1])}), min(${foot(P.legs[0])}, ${foot(P.legs[1])}));
  d = smin(d, limbs, 0.03);
  return d;
}
`;
}

/** 웅크린 태아 자세 (1단계, 2단계 알 속) — 뺨을 짚은 손(-x, 카메라 쪽)과 아래로 늘어진 손(+x) */
export const CURL = {
  head: { c: [0, 1.0, 0.3], pitch: 0.45, tilt: -0.06 },
  curl: 0.5,
  chest: [0, 0.12, -0.08],
  belly: [0, -0.45, 0.1],
  hip: [0, -0.92, -0.2],
  spine: [
    [0, 0.55, -0.3],
    [0, -1.0, -0.36],
    [0, 0, -0.16],
  ],
  neck: [
    [0, 0.35, -0.02],
    [0, 0.75, 0.15],
  ],
  arms: [
    { sh: [-0.44, 0.38, -0.02], el: [-0.7, -0.32, 0.06], wr: [-0.66, -0.46, 0.52], f: [0.55, 0.05, 0.83], u: [-0.75, 0.25, 0.55], curl: 0.42, spread: 0.3, len: 0.62 },
    { sh: [0.44, 0.38, -0.02], el: [0.62, -0.42, 0.32], wr: [0.26, -0.02, 0.9], f: [-0.2, 0.6, 0.78], u: [0.7, 0.1, 0.7], curl: 0.3, spread: 0.36, len: 0.62 },
  ],
  legs: [
    { hi: [-0.26, -0.82, 0], kn: [-0.42, -0.1, 0.62], an: [-0.16, -0.98, 0.55], f: [0.55, -0.35, 0.55], u: [-0.3, -0.2, -0.4], curl: 0.35 },
    { hi: [0.26, -0.82, 0], kn: [0.4, -0.2, 0.58], an: [0.12, -1.02, 0.62], f: [-0.6, -0.3, 0.5], u: [0.3, -0.2, -0.4], curl: 0.35 },
  ],
};

// ─────────────────────────────────────────────── 1. 잠든 태아 ───────────────────────────────────────────────
function sleeping({ seed }) {
  const R = rng(seed * 31 + 7);
  const S = 1.0;
  const F = bodyFrame([0, 1.75, 0], S, 0.62, 0.12);
  const W = F.W;

  // 탯줄: 배꼽에서 아래로 늘어졌다가 왼쪽으로 크게 감아 올라 머리 뒤 어둠으로 흘러간다 (끝은 혜성처럼 빛으로 풀린다)
  const nv = W([0.0, -0.42, 0.5]);
  const cordP = bezier([nv, [nv[0] + 0.5, nv[1] - 1.3, nv[2] + 0.8], [-1.0, -0.6, 1.2], [-2.0, 0.6, 0.2]], 18, 0.0, R).concat(
    bezier([[-2.0, 0.6, 0.2], [-2.8, 1.6, -0.5], [-2.6, 3.3, -0.9], [-1.4, 4.1, -2.0]], 20, 0.1, R).slice(1),
  );
  const cord = cordP.map((c, i) => [...c, (0.075 * Math.pow(1 - i / (cordP.length - 1), 0.9) + 0.003) * S]);
  // 양막과 머리 속의 별
  const AM = W([0.0, 0.15, 0.05]);
  const AMR = 2.3 * S;
  const star = W([0.0, 0.05, 0.02]);
  // 빛나는 점: 가슴 속 별의 번짐 + 탯줄 끝에서 흩어지는 별가루 + 양막 속 떠다니는 티끌
  const L = [[...star, 0.07]];
  const LC = [[1.0, 0.8, 0.55, 0.9]];
  for (let i = 0; i < 10; i++) {
    const k = Math.min(cord.length - 1, cord.length - 14 + i + Math.floor(R() * 4));
    const c = cord[k];
    const sp = 0.1 + (i / 10) * 0.5;
    L.push([c[0] + (R() - 0.5) * sp, c[1] + (R() - 0.5) * sp, c[2] + (R() - 0.5) * sp, 0.01 + R() * 0.018]);
    LC.push([0.75, 0.9, 1.0, 0.7 + R() * 0.5]);
  }
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2;
    const b = (R() - 0.5) * 2.0;
    const r = AMR * (0.7 + R() * 0.25);
    L.push([AM[0] + Math.cos(a) * r * Math.cos(b * 0.6), AM[1] + Math.sin(b * 0.6) * r, AM[2] + Math.sin(a) * r * 0.6, 0.006 + R() * 0.01]);
    LC.push(R() < 0.5 ? [1.0, 0.85, 0.65, 0.6] : [0.6, 0.9, 1.0, 0.6]);
  }

  return {
    preset: 'act5',
    cam: { pos: [0.3, -2.3, 9.6], target: [0.1, 1.8, 0], fov: 1.8 },
    light: {
      key: [-0.55, 0.55, -0.62],
      keyCol: [1.1, 1.08, 1.4],
      fill: [0.6, -0.5, 0.6],
      fillCol: [0.05, 0.12, 0.15],
      amb: [0.006, 0.006, 0.012],
      rimCol: [0.8, 0.88, 1.25],
      rim: 2.4,
      glow: 0.05,
      exposure: 1.15,
      pt: star,
      ptCol: [3.0, 1.5, 0.6],
    },
    frame: { fill: 0.93, bottom: 0.03 },
    arrays: { uB: cord, uL: L, uLC: LC },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_VOLUME
#define VOLUME_STEPS 110
#define VOLUME_FAR 17.0
#define HAS_BG

${F.glsl}
const vec3 AM = ${f3(AM)};
const float AMR = ${AMR.toFixed(4)};
const vec3 STAR = ${f3(star)};
${BODY_GLSL}
${bodyGLSL(CURL)}

vec2 sdf(vec3 p) {
  vec3 q = toLocal(p);
  float part;
  float d = fetusBody(q, part) * S;
  // 핏줄이 살짝 돋았다
  if (d < 0.05) d -= 0.005 * smoothstep(0.1, 0.0, ridge(q * 3.2 + 1.3)) * smoothstep(0.4, 0.65, noise(q * 1.6));
  vec2 r = vec2(d, part);
  r = umin(r, vec2(chains(p, 0.01), 3.0));
  return r;
}

/** 몸통 위의 점이면 1 (팔다리에는 갈비뼈 그림자가 없다) */
float torsoMask(vec3 q) {
  vec3 c1 = q - ${f3(CURL.chest)};
  c1.yz = rot(${(-CURL.curl).toFixed(4)}) * c1.yz;
  return smoothstep(0.06, 0.0, sdEllipsoid(c1, vec3(0.48, 0.56, 0.42)));
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  vec3 q = toLocal(p);
  if (id < 2.5) {
    vec3 emi = innerStar(p, V, STAR, 0.42 * S, id > 1.5 ? 0.9 : 1.5, vec4(toLocal(mix(p, STAR, 0.3)), torsoMask(q)));
    // 역광에 비치는 얇은 살 (손가락·가장자리가 붉게 비친다)
    float part;
    float th = -fetusBody(toLocal(p - n * 0.09 * S), part) / S;
    float thin = smoothstep(0.08, -0.02, th);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 2.0);
    float back = 0.35 + 0.65 * max(dot(V, -normalize(uKeyDir)), 0.0);
    emi += vec3(0.5, 0.06, 0.05) * (thin * (0.08 + 0.5 * fres) + fres * 0.12) * back;
    // 별에서 가까운 얇은 살은 별빛으로도 비친다
    emi += vec3(0.7, 0.12, 0.06) * thin * fres * 0.5 / (1.0 + dot(p - STAR, p - STAR) * 4.0);
    return fetusSkin(id, q, toHead(q), emi);
  }
  // 탯줄: 배꼽 쪽은 나선 핏줄이 비치는 젖은 살, 멀어질수록 혜성처럼 빛으로 풀린다
  vec3 ap;
  vec3 tg;
  float tt = cordT(p, ap, tg) / float(uBN - 1);
  vec3 nn = normalize(cross(tg, vec3(0.0, 1.0, 0.0)));
  vec3 bb = cross(tg, nn);
  vec3 rr = p - ap;
  float ang = atan(dot(rr, bb), dot(rr, nn));
  float vessel = smoothstep(0.6, 0.95, sin(ang * 2.0 + tt * 80.0)) + 0.6 * smoothstep(0.75, 0.97, sin(ang * 2.0 + tt * 80.0 + 2.4));
  vec3 alb = mix(vec3(0.11, 0.11, 0.13), vec3(0.05, 0.012, 0.025), clamp(vessel, 0.0, 1.0) * 0.8);
  float glow = smoothstep(0.5, 0.95, tt);
  vec3 emi = vec3(0.5, 0.8, 1.0) * glow * glow * 1.3 + vec3(0.4, 0.06, 0.04) * vessel * 0.08 * (1.0 - glow);
  return Mat(alb, 0.3, 0.8, emi, 0.12, 0.6, 0.75);
}

// 양막: 거의 보이지 않는 막. 찢긴 듯 끊어진 가장자리와 막의 핏줄만 성운빛에 걸린다
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec4 acc = vec4(0.0);
  // 가슴 속 별의 십자 빛살 (살을 뚫고 새어 나온다)
  {
    vec3 ww = normalize(uCamTarget - uCamPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 c = STAR - ro;
    float along = dot(c, rd);
    vec3 o = c - rd * along;
    float ox = dot(o, uu) / along;
    float oy = dot(o, vv) / along;
    vec2 r1 = rot(0.35) * vec2(ox, oy);
    float spk = exp(-abs(r1.x) / 0.001) * exp(-abs(r1.y) / 0.022) + exp(-abs(r1.y) / 0.001) * exp(-abs(r1.x) / 0.022);
    spk += 0.3 * (exp(-abs(r1.x + r1.y) / 0.0012) + exp(-abs(r1.x - r1.y) / 0.0012)) * exp(-length(r1) / 0.012);
    vec3 sc = vec3(1.0, 0.85, 0.65) * spk * 0.6;
    acc.rgb += sc;
    acc.a = max(acc.a, clamp(dot(sc, vec3(0.33)) * 1.5, 0.0, 1.0));
  }
  vec3 cg = cometGlow(ro, rd, tHit, uBN / 2, uBN - 1, vec3(0.5, 0.78, 1.0), 0.12, 2.0);
  acc.rgb += cg;
  acc.a = max(acc.a, clamp(dot(cg, vec3(0.33)) * 1.5, 0.0, 1.0));
  vec3 oc = ro - AM;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - AMR * AMR;
  float h = b * b - c;
  if (h < 0.0) return acc;
  h = sqrt(h);
  for (int i = 0; i < 2; i++) {
    float t = i == 0 ? -b - h : -b + h;
    if (t < 0.0 || t > tHit) continue;
    vec3 n = normalize(ro + rd * t - AM);
    float graze = pow(1.0 - abs(dot(n, rd)), 2.0);
    // 양막을 휘감는 가는 빛의 실 (거의 어둠, 비스듬한 가장자리에서만 밝다)
    float az = atan(n.z, n.x) + n.y * 2.2;
    vec3 sw = vec3(cos(az), sin(az), n.y * 3.5);
    float fil = pow(1.0 - ridge(sw * 1.3 + vec3(uSeed, 2.0, 5.0)), 12.0) + 0.5 * pow(1.0 - ridge(sw * 3.1 + 9.0), 16.0);
    float mask = smoothstep(0.38, 0.62, fbm3(n * 2.2 + vec3(1.0, uSeed, 4.0)));
    float v = smoothstep(0.025, 0.0, ridge(n * 4.0 + 3.0)) * smoothstep(0.5, 0.7, noise(n * 3.0 + 9.0));
    float lit = 0.35 + 0.9 * max(dot(n, normalize(uKeyDir)), 0.0);
    vec3 col = mix(vec3(0.2, 0.62, 0.72), vec3(0.5, 0.3, 0.9), smoothstep(-0.5, 0.6, n.y + sw.x * 0.3));
    float k = ((fil * mask * 1.3 + v * 0.1) * (0.1 + graze * 1.3) + graze * graze * 0.04 * mask) * lit * (i == 0 ? 1.0 : 0.45);
    k *= uScene == 0 ? 1.5 : 1.0;
    acc.rgb += col * k;
    acc.a = max(acc.a, clamp(k * 1.4, 0.0, 1.0));
  }
  return acc;
}

vec4 volume(vec3 p) {
  vec3 q = p - AM;
  float r = length(q);
  if (r > AMR + 1.8) return vec4(0.0);
  vec3 dir = q / max(r, 1e-3);
  // 양막을 휘감아 도는 성운 실오라기 — 대부분은 어둠, 가는 필라멘트만 빛난다
  float az = atan(dir.z, dir.x) + dir.y * 1.3;
  vec3 sw = vec3(cos(az) * 1.6, sin(az) * 1.6, dir.y * 5.0) + vec3(0.0, 0.0, r * 0.9);
  float fil = pow(1.0 - ridge(sw * 1.3 + vec3(3.0, 1.0, uSeed)), 9.0);
  float n1 = fbm3(sw * 0.8 + vec3(7.0, 2.0, 1.0));
  float n2 = fbm3(dir * 3.0 + r * 0.7 + 3.0);
  float shell = exp(-pow((r - AMR - 0.05) / 0.35, 2.0));
  float outer = exp(-pow((r - AMR - 0.7) / 0.6, 2.0));
  float wisp = smoothstep(0.55, 0.8, n1 * 0.7 + n2 * 0.4);
  float dens = shell * (fil * smoothstep(0.35, 0.6, n1) * 0.8 + wisp * 0.35) + outer * wisp * 0.2;
  float inside = smoothstep(AMR, AMR - 0.5, r);
  dens += 0.006 * inside;
  vec3 col = mix(vec3(0.08, 0.4, 0.48), vec3(0.3, 0.13, 0.62), smoothstep(0.35, 0.7, n2));
  col = mix(col, vec3(0.7, 0.14, 0.26), smoothstep(0.68, 0.85, n1) * 0.45);
  float ds = dot(p - STAR, p - STAR);
  float lit = 0.15 + 1.1 * pow(max(dot(dir, normalize(uKeyDir)) * 0.7 + 0.3, 0.0), 2.0) + 0.6 / (1.0 + ds * 0.5);
  vec3 L = col * lit * (0.2 + 2.2 * fil + 0.6 * wisp);
  L += vec3(1.0, 0.65, 0.4) * 0.35 / (1.0 + ds * 3.0) * inside;
  return vec4(L * (uScene == 0 ? 1.8 : 1.0), dens);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.01);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  float h = hash31(cell);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, h) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.1, 0.04, 0.14) * pow(fbm3(rd * 3.0), 3.0) * 0.8;
  return col;
}
`,
  };
}

// ─────────────────────────────────────────────── 2. 깨어나는 알 ───────────────────────────────────────────────
// 양막이 굳어 된 거대한 알. 검은 흑요석 같은 껍질에 금빛 별자리가 새겨졌다. 위쪽 한 곳이 깨져 구멍이 났고,
// 그 틈으로 눈부신 빛이 새며, 지나치게 긴 손가락이 안에서 가장자리를 움켜쥔다. 갈라진 금마다 빛줄기가 뿜어지고,
// 얇은 껍질 너머로 웅크린 태아의 그림자가 희미하게 비치고, 깨진 껍질 조각들이 빛 속으로 떠오른다.
function egg({ seed }) {
  const R = rng(seed * 53 + 11);
  const E = [0, 2.1, 0];
  const ER = [1.5, 2.0, 1.5];
  const tilt = 0.1;
  // 알 좌표(q) → 월드: q.xy = rot(tilt) * (p - E).xy 의 역
  const EW = (q) => {
    const [x, y] = rot2(-tilt, q[0], q[1]);
    return [E[0] + x, E[1] + y, E[2] + q[2]];
  };
  // 깨진 자리 (알 좌표의 방향)
  const bd = [0.42, 0.32, 0.85];
  const bl = Math.hypot(...bd);
  const BR = bd.map((v) => v / bl);
  const surf = (d, s = 1) => [d[0] * ER[0] * s, d[1] * ER[1] * s, d[2] * ER[2] * s];
  const HC = surf(BR, 1.0);
  // 안의 태아 (웅크린 자세, 작게) — 그림자와 구멍 너머로만 보인다
  const F = bodyFrame(EW([0.05, -0.1, 0.1]), 0.62, 0.9, 0.1);
  // 별자리: 알 위의 방향들 (w > 0 이면 앞 별과 잇는다)
  const A = [];
  const nC = 10;
  for (let c = 0; c < nC && A.length < 58; c++) {
    let th;
    let ph;
    for (let t = 0; t < 30; t++) {
      th = (R() - 0.5) * 2.6;
      ph = (R() - 0.45) * 2.2;
      const d = [Math.sin(th) * Math.cos(ph * 0.7), Math.sin(ph * 0.7), Math.cos(th) * Math.cos(ph * 0.7)];
      if (d[0] * BR[0] + d[1] * BR[1] + d[2] * BR[2] < 0.75) break;
    }
    const n = 4 + Math.floor(R() * 4);
    let a = th;
    let b = ph * 0.7;
    for (let i = 0; i < n; i++) {
      const d = [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
      A.push([...d, i === 0 ? 0 : 1]);
      a += (R() - 0.5) * 0.55;
      b += (R() - 0.5) * 0.45;
    }
  }
  // 떠도는 껍질 조각 (깨진 자리에서 튀어 나왔다)
  const P = [];
  for (let i = 0; i < 5; i++) {
    const out = 1.12 + R() * 0.55;
    const j = [(R() - 0.5) * 0.7, (R() - 0.5) * 0.6, (R() - 0.5) * 0.5];
    const d = [BR[0] + j[0], BR[1] + j[1], BR[2] + j[2]];
    const l = Math.hypot(...d);
    const c = EW(surf(d.map((v) => v / l), out));
    P.push([...c, 0.06 + R() * 0.09]);
  }
  // 빛: 깨진 틈의 눈부신 점, 흩어지는 불티
  const LP = EW([0.0, 0.1, -0.7]);
  const uL = [[...EW(surf(BR, 0.85)), 0.25]];
  const uLC = [[1.0, 0.85, 0.6, 1.0]];
  for (let i = 0; i < 12; i++) {
    const out = 1.05 + R() * 0.9;
    const j = [(R() - 0.5) * 1.2, (R() - 0.5) * 1.0, (R() - 0.5) * 0.8];
    const d = [BR[0] + j[0], BR[1] + j[1], BR[2] + j[2]];
    const l = Math.hypot(...d);
    uL.push([...EW(surf(d.map((v) => v / l), out)), 0.008 + R() * 0.014]);
    uLC.push([1.0, 0.85, 0.55, 0.8]);
  }
  // 손: 구멍 안에서 나와 아래 가장자리를 움켜쥔다
  const nrm = (v) => {
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
  };
  // 손가락만 구멍 아래 가장자리를 넘어와 껍질을 움켜쥔다 (손바닥·팔은 안쪽 빛 속)
  const rimDir = nrm([BR[0] - 0.06, BR[1] - 0.24, BR[2] + 0.05]);
  const c0 = EW([0, 0, 0]);
  const rimW = EW(surf(rimDir, 1.0));
  const hupV = nrm([rimW[0] - c0[0], rimW[1] - c0[1], rimW[2] - c0[2]]);
  const belowW = EW(surf(nrm([rimDir[0] - 0.02, rimDir[1] - 0.3, rimDir[2] + 0.08]), 1.0));
  const Dt = nrm([belowW[0] - rimW[0], belowW[1] - rimW[1], belowW[2] - rimW[2]]);
  const wrist = rimW.map((v, i) => v - hupV[i] * 0.22 - Dt[i] * 0.28);
  const fdir = nrm(hupV.map((v, i) => v * 0.75 + Dt[i] * 0.66));
  const hup = nrm(hupV.map((v, i) => v * 0.66 - Dt[i] * 0.75));
  const elbow = EW(surf(BR, 0.45));

  return {
    preset: 'act5',
    cam: { pos: [0.5, -2.4, 11.6], target: [0.3, 2.3, 0], fov: 1.9 },
    light: {
      key: [-0.5, 0.45, -0.75],
      keyCol: [0.75, 0.75, 1.05],
      fill: [0.6, -0.4, 0.6],
      fillCol: [0.03, 0.07, 0.09],
      amb: [0.005, 0.005, 0.01],
      rimCol: [0.75, 0.85, 1.25],
      rim: 2.6,
      glow: 0.06,
      exposure: 1.15,
      pt: EW(surf(BR, 0.7)),
      ptCol: [2.0, 1.4, 0.8],
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: { uA: A, uL, uLC, uP: P },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_VOLUME
#define VOLUME_STEPS 120
#define VOLUME_FAR 17.0
#define HAS_BG

${F.glsl}
const vec3 EGG = ${f3(E)};
const vec3 ER = ${f3(ER)};
const vec3 BR = ${f3(BR)};
const vec3 HC = ${f3(HC)};
const vec3 LP = ${f3(LP)};
const vec3 WRIST = ${f3(wrist)};
const vec3 ELBOW = ${f3(elbow)};
const vec3 FDIR = ${f3(fdir)};
const vec3 HUP = ${f3(hup)};
const float TH = 0.07;
${BODY_GLSL}
${bodyGLSL(CURL)}

vec3 eggLocal(vec3 p) {
  vec3 q = p - EGG;
  q.xy = rot(${tilt.toFixed(4)}) * q.xy;
  return q;
}
float eggD(vec3 q) {
  float k = 1.0 - 0.09 * clamp(q.y / ER.y, -1.0, 1.0);
  return sdEllipsoid(vec3(q.x / k, q.y, q.z / k), ER) * k;
}
vec3 h33(vec3 p) { return vec3(hash31(p), hash31(p + 17.13), hash31(p + 31.71)); }
/** 보로노이 경계까지 (0 = 금) */
float vEdge(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k % 3 - 1), float((k / 3) % 3 - 1), float(k / 9 - 1));
    vec3 r = g + h33(i + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
/** 껍질의 금 (n: 알 중심에서의 방향). 깨진 자리 가까이 촘촘하고 멀어질수록 드문드문 */
float crackAt(vec3 n, float w) {
  // 깨진 자리(BR)에서 방사형으로 뻗는 금: s = BR에서의 각거리, phi = BR 둘레의 방위
  vec3 t1 = normalize(cross(BR, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(t1, BR);
  float s = acos(clamp(dot(n, BR), -1.0, 1.0));
  float phi = atan(dot(n, t2), dot(n, t1));
  float c = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float a0 = fi * 0.698 + 0.35 * sin(fi * 3.7);
    float len = 0.9 + 1.3 * fract(sin(fi * 12.9) * 437.5);
    float wob = 0.22 * (noise(vec3(s * 3.0, fi * 7.1, 0.0)) - 0.5) + 0.07 * (noise(vec3(s * 13.0, fi * 3.3, 1.0)) - 0.5);
    float dphi = abs(mod(phi - a0 - wob / max(s, 0.25) + 3.14159, 6.28318) - 3.14159) * sin(min(s, 1.57));
    float ww = w * max(1.2 - s / len, 0.0) * smoothstep(len, len * 0.6, s);
    if (ww > 1e-4) c = max(c, smoothstep(ww, ww * 0.2, dphi) * step(0.3, s));
    // 가지
    float b0 = a0 + 0.3 * sin(fi * 5.1);
    float bs = s - (0.5 + 0.4 * fract(fi * 0.37));
    float dphb = abs(mod(phi - b0 - 0.5 * bs - wob + 3.14159, 6.28318) - 3.14159) * sin(min(s, 1.57));
    float bw = w * 0.6 * smoothstep(0.5, 0.0, bs) * step(0.0, bs);
    if (bw > 1e-4) c = max(c, smoothstep(bw, bw * 0.2, dphb));
  }
  // 깨진 자리 둘레의 잔금
  float e2 = vEdge(n * 9.0 + 4.2 + 0.3 * noise(n * 20.0));
  c = max(c, smoothstep(w * 0.6, 0.0, e2) * smoothstep(0.75, 0.35, s));
  return clamp(c, 0.0, 1.0);
}
float holeD(vec3 q) {
  vec3 n = normalize(q);
  float jag = 0.42 + 0.14 * noise(n * 9.0) + 0.07 * noise(n * 23.0);
  return length(q - HC) - jag;
}

float fetusAt(vec3 p) {
  float part;
  return fetusBody(toLocal(p), part) * S;
}

vec2 sdf(vec3 p) {
  vec3 q = eggLocal(p);
  float bound = length(q) - 2.6;
  vec2 r = vec2(1e5, 1.0);
  if (bound < 0.3) {
    float e = eggD(q);
    vec3 n = normalize(q / ER);
    // 껍질 (바깥 면에 금이 골로 패였다)
    float outer = e + 0.01 * crackAt(n, 0.018) - 0.006 * fbm3(q * 6.0);
    float shell = max(outer, -(e + TH));
    shell = max(shell, -holeD(q));
    r = vec2(shell, 1.0);
    // 안의 태아
    r = umin(r, vec2(fetusAt(p), 2.0));
    // 구멍에서 나온 팔과 손
    float arm = sdRoundCone(p, ELBOW, WRIST, 0.1, 0.065);
    float hand = longHand(p, WRIST, FDIR, HUP, 0.55, 0.32, 0.8);
    r = umin(r, vec2(smin(arm, hand, 0.04), 2.0));
  } else {
    r = vec2(bound, 1.0);
  }
  // 떠도는 껍질 조각
  for (int i = 0; i < 5; i++) {
    vec3 c = uP[i].xyz;
    vec3 sq = p - c;
    sq.xy = rot(float(i) * 1.7) * sq.xy;
    sq.yz = rot(float(i) * 2.3 + 0.5) * sq.yz;
    float sz = uP[i].w;
    sq.z += dot(sq.xy, sq.xy) * 0.9;
    float sh = sdBox(sq, vec3(sz, sz * 0.75, 0.018)) - 0.004;
    sh = max(sh, dot(sq.xy, normalize(vec2(1.0, 0.6 + float(i) * 0.3))) - sz * 0.35);
    sh = max(sh, dot(sq.xy, normalize(vec2(-0.7, 1.0 - float(i) * 0.2))) - sz * 0.5);
    r = umin(r, vec2(sh * 0.8, 5.0));
  }
  return r;
}

/** 별자리: 가장 가까운 선까지의 각거리와 별까지의 각거리 */
vec2 constel(vec3 n) {
  float dl = 1.0;
  float ds = 1.0;
  for (int i = 0; i < 64; i++) {
    if (i >= uAN) break;
    vec3 b = uA[i].xyz;
    ds = min(ds, acos(clamp(dot(n, b), -1.0, 1.0)));
    if (uA[i].w < 0.5 || i == 0) continue;
    vec3 a = uA[i - 1].xyz;
    vec3 c = normalize(cross(a, b));
    if (dot(cross(a, n), c) > 0.0 && dot(cross(n, b), c) > 0.0) dl = min(dl, abs(asin(clamp(dot(n, c), -1.0, 1.0))));
  }
  return vec2(dl, ds);
}

/** 안의 빛이 얇은 껍질을 지나며 비친다 — 태아가 가리면 그림자 */
float fetusShadow(vec3 p) {
  vec3 d = LP - p;
  float L = length(d);
  d /= L;
  float res = 1.0;
  float t = 0.05;
  for (int i = 0; i < 20; i++) {
    float h = fetusAt(p + d * t);
    res = min(res, 6.0 * h / t);
    t += clamp(h, 0.04, 0.25);
    if (res < 0.01 || t > L) break;
  }
  return clamp(res, 0.0, 1.0);
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  if (id < 1.5) {
    vec3 q = eggLocal(p);
    float e = eggD(q);
    vec3 dn = normalize(q / ER);
    if (e < -TH * 0.5) {
      // 껍질 안쪽 면: 눈부신 빛으로 가득하다
      return Mat(vec3(0.0), 1.0, 0.0, vec3(2.6, 2.0, 1.25) * (0.7 + 0.3 * fbm3(q * 5.0)), 0.0, 0.0, 0.0);
    }
    if (holeD(q) < 0.02 || e < -0.01) {
      // 깨진 단면: 층층이 굳은 막, 안쪽 빛에 달궈졌다
      float layer = 0.5 + 0.5 * sin(e * 160.0);
      return Mat(vec3(0.05, 0.04, 0.035), 0.6, 0.3, vec3(1.6, 1.0, 0.45) * smoothstep(-0.02, -TH, e) * (0.5 + 0.5 * layer), 0.0, 0.0, 0.1);
    }
    // 바깥 면: 검은 흑요석 같은 껍질, 기름막 같은 진주빛, 새겨진 별자리
    vec2 cs = constel(dn);
    float line = smoothstep(0.005, 0.0015, cs.x);
    float star = smoothstep(0.018, 0.005, cs.y);
    float halo = exp(-cs.y / 0.02) * 0.25;
    float crack = crackAt(dn, 0.035);
    float grain = fbm3(q * 7.0);
    vec3 alb = vec3(0.016, 0.017, 0.026) * (0.6 + 0.8 * grain);
    alb = mix(alb, vec3(0.1, 0.07, 0.035), line * 0.5);
    vec3 emi = vec3(1.0, 0.78, 0.4) * (line * 0.45 + star * 2.2 + halo);
    // 금에서 쏟아지는 빛 (가운데가 가장 뜨겁다)
    float hot = crackAt(dn, 0.012);
    emi += vec3(2.8, 2.1, 1.3) * (crack * 0.5 + hot * 1.4);
    // 얇은 껍질 너머로 비치는 빛과 태아의 그림자
    float thin = smoothstep(0.1, 0.8, dn.z) * (0.55 + 0.45 * fbm3(dn * 3.0 + 3.0)) * smoothstep(0.95, 0.4, dot(dn, BR) + 0.0);
    float sh = fetusShadow(p);
    emi += vec3(1.0, 0.5, 0.2) * thin * (0.004 + 0.1 * sh);
    return Mat(alb, 0.18, 1.3, emi, 0.45, 0.0, 0.9);
  }
  if (id < 2.5) {
    // 태아의 살갗 (구멍 안의 빛에 역광으로 비친다)
    float fres = pow(1.0 - max(dot(n, V), 0.0), 2.5);
    float toward = max(dot(n, normalize(EGG - p)), 0.0);
    vec3 emi = vec3(1.0, 0.55, 0.25) * fres * 1.2 + vec3(0.6, 0.15, 0.06) * toward * 0.3;
    return Mat(vec3(0.05, 0.048, 0.055), 0.45, 0.5, emi, 0.04, 0.6, 0.4);
  }
  // 떠도는 껍질 조각: 깨진 자리 쪽 면이 빛에 달궈졌다
  float toward = max(dot(n, normalize(HC + EGG - p)), 0.0);
  float fr = pow(1.0 - abs(dot(n, V)), 3.0);
  return Mat(vec3(0.016, 0.017, 0.026), 0.2, 1.3, vec3(1.6, 1.05, 0.55) * (toward * toward * 0.25 + fr * 0.5), 0.45, 0.0, 0.8);
}

vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec4 acc = vec4(0.0);
  return acc;
}

// 금마다 뿜어지는 빛줄기 + 깨진 자리의 큰 빛
vec4 volume(vec3 p) {
  vec3 q = eggLocal(p);
  float r = length(q / ER);
  if (r < 1.0 || r > 2.6) return vec4(0.0);
  vec3 n = normalize(q / ER);
  float c = crackAt(n, 0.06);
  float near = max(dot(n, BR), 0.0);
  float beam = c * exp(-(r - 1.0) * 2.6) * 0.9;
  beam += pow(near, 18.0) * exp(-(r - 1.0) * 1.8) * 1.2;
  beam *= smoothstep(2.4, 1.6, r);
  float dust = 0.5 + 0.5 * fbm3(p * 3.0);
  float dens = beam * dust * 0.6;
  vec3 col = vec3(1.0, 0.8, 0.5) * 2.2;
  return vec4(col * dens * (uScene == 0 ? 1.8 : 1.0), dens * 0.5);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.01);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  float h = hash31(cell);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, h) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.1, 0.04, 0.14) * pow(fbm3(rd * 3.0), 3.0) * 0.8;
  return col;
}
`,
  };
}

// ─────────────────────────────────────────────── 3. 태어난 것 ───────────────────────────────────────────────
// 빛나는 공허. 같은 태아가 몸을 펴고 떠올랐지만 그 몸은 우주에 뚫린 구멍이다 — 실루엣 속엔 다른 하늘의 별이 비치고,
// 뒤에서 눈부신 별이 그것에 가려 일식 같은 코로나를 터뜨린다. 처음 뜬 두 눈은 가는 빛의 틈.
// 지나치게 긴 손가락을 벌린 두 팔, 배꼽에서 뻗은 혜성 탯줄 셋이 빛의 꼬리를 끌며 휘감는다.
export const BORN = {
  head: { c: [0, 1.04, 0.26], pitch: 0.2, tilt: -0.05 },
  curl: 0.45,
  chest: [0, 0.18, -0.02],
  belly: [0, -0.38, 0.06],
  hip: [0, -0.86, -0.08],
  spine: [
    [0, 0.6, -0.32],
    [0, -0.95, -0.3],
    [0, 0, -0.08],
  ],
  neck: [
    [0, 0.42, -0.04],
    [0, 0.82, 0.1],
  ],
  arms: [
    { sh: [-0.44, 0.38, -0.02], el: [-0.62, -0.2, 0.5], wr: [-0.42, 0.05, 1.25], f: [0.05, 0.25, 0.97], u: [-0.6, 0.75, -0.2], curl: 0.18, spread: 0.55, len: 0.9 },
    { sh: [0.44, 0.38, -0.02], el: [0.66, -0.38, 0.32], wr: [0.5, -0.7, 0.98], f: [0.15, -0.35, 0.92], u: [0.5, 0.75, 0.2], curl: 0.28, spread: 0.5, len: 0.85 },
  ],
  legs: [
    { hi: [-0.26, -0.82, 0], kn: [-0.42, -0.14, 0.62], an: [-0.16, -1.02, 0.55], f: [0.55, -0.35, 0.55], u: [-0.3, -0.2, -0.4], curl: 0.35 },
    { hi: [0.26, -0.82, 0], kn: [0.4, -0.24, 0.58], an: [0.12, -1.06, 0.62], f: [-0.6, -0.3, 0.5], u: [0.3, -0.2, -0.4], curl: 0.35 },
  ],
};

function born({ seed }) {
  const R = rng(seed * 71 + 13);
  const S = 1.0;
  const F = bodyFrame([0, 2.3, 0], S, 0.75, 0.05);
  const W = F.W;
  const nv = W([0, -0.4, 0.5]);
  // 혜성 탯줄 셋: 배꼽에서 나와 몸을 휘감고 바깥 어둠으로 빛의 꼬리를 끈다
  const ad = (a, b) => a.map((v, i) => v + b[i]);
  // 배꼽에서 아래로 늘어졌다가 몸 뒤로 크게 휘어 양옆 위로 솟는 혜성 꼬리 (빛의 날개처럼)
  // 배꼽에서 채찍처럼 휘어 나가는 혜성 탯줄: 몸 가까이는 검고, 끝은 눈부신 혜성 머리
  const paths = [
    [nv, ad(nv, [-0.1, -1.3, 0.4]), [-2.6, -0.4, -0.2], [-2.5, 3.6, -1.6]],
    [nv, ad(nv, [0.3, -1.4, 0.3]), [2.8, -0.2, -0.4], [3.1, 2.8, -1.8]],
    [nv, ad(nv, [0.0, -1.3, 0.6]), [0.6, -0.9, 1.0], [1.4, -0.3, -1.6]],
  ];
  const B = [];
  const tails = [];
  for (const P of paths) {
    const pts = bezier(P, 30, 0.08, R);
    if (B.length) B.push([0, 0, 0, 0]);
    const s0 = B.length;
    pts.forEach((c, i) => B.push([...c, 0.05 * Math.pow(1 - i / (pts.length - 1), 1.2) + 0.005]));
    tails.push([s0 + 6, B.length - 1]);
  }
  // 코로나의 중심 (몸 바로 뒤의 별)
  const cam = [0.3, -2.4, 11.4];
  const ch = W([0, 0.35, -0.1]);
  const dl = Math.hypot(ch[0] - cam[0], ch[1] - cam[1], ch[2] - cam[2]);
  const CO = ch.map((v, i) => v + ((v - cam[i]) / dl) * 3.2);
  // 눈: 가는 빛의 틈 (머리 좌표의 눈 자리 → 몸 → 월드)
  const hp = BORN.head;
  const eyeW = (sx) => {
    // h = (±0.27, -0.16, 0.66) → q = HEAD_C + rotX^-1 ...
    const h = [sx * 0.27, -0.17, 0.7];
    let [x, y] = rot2(-hp.tilt, h[0], h[1]);
    let z = h[2];
    [y, z] = rot2(-hp.pitch, y, z);
    return W([hp.c[0] + x, hp.c[1] + y, hp.c[2] + z]);
  };
  const uL = [];
  const uLC = [];
  for (const sx of [-1, 1]) {
    uL.push([...eyeW(sx), 0.018]);
    uLC.push([1.0, 0.95, 0.85, 1.6]);
  }
  // 혜성 머리 (탯줄 끝)
  for (const t of tails) {
    const c = B[t[1]];
    uL.push([c[0], c[1], c[2], 0.1]);
    uLC.push([0.75, 0.9, 1.0, 1.6]);
  }
  // 꼬리의 별가루
  for (let i = 0; i < 14; i++) {
    const t = tails[i % 3];
    const k = t[1] - Math.floor(R() * 10);
    const c = B[k];
    uL.push([c[0] + (R() - 0.5) * 0.5, c[1] + (R() - 0.5) * 0.5, c[2] + (R() - 0.5) * 0.5, 0.01 + R() * 0.015]);
    uLC.push([0.7, 0.9, 1.0, 0.8]);
  }

  return {
    preset: 'act5',
    cam: { pos: cam, target: [0.0, 2.3, 0], fov: 1.85 },
    light: {
      key: CO.map((v, i) => v - cam[i]),
      keyCol: [1.6, 1.45, 1.2],
      fill: [0.5, -0.6, 0.6],
      fillCol: [0.02, 0.04, 0.06],
      amb: [0.0, 0.0, 0.0],
      rimCol: [1.2, 1.1, 0.95],
      rim: 3.2,
      glow: 0.12,
      exposure: 1.15,
    },
    frame: { fill: 0.94, bottom: 0.03 },
    arrays: { uB: B, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_BG

${F.glsl}
const vec3 CO = ${f3(CO)};
${tails.map((t, i) => `const int T${i}A = ${t[0]};\nconst int T${i}B = ${t[1]};`).join('\n')}
${BODY_GLSL}
${bodyGLSL(BORN)}

vec2 sdf(vec3 p) {
  vec3 q = toLocal(p);
  float part;
  float d = fetusBody(q, part) * S;
  vec2 r = vec2(d, 1.0);
  r = umin(r, vec2(chains(p, 0.01), 3.0));
  return r;
}

/** 다른 하늘: 실루엣 속에 비치는 별과 성운 (시선 방향으로) */
vec3 voidSky(vec3 rd) {
  vec3 col = vec3(0.0);
  vec3 g = rd * 160.0;
  vec3 c = floor(g);
  float h = hash31(c + 7.0);
  col += mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.85, 0.7), hash31(c + 2.0)) * step(0.985, h) * smoothstep(0.5, 0.0, length(fract(g) - 0.5)) * (0.4 + 1.2 * hash31(c + 5.0));
  vec3 g2 = rd * 420.0;
  vec3 c2 = floor(g2);
  col += vec3(0.8, 0.85, 1.0) * step(0.99, hash31(c2)) * smoothstep(0.45, 0.0, length(fract(g2) - 0.5)) * 0.5;
  float neb = pow(fbm3(rd * 4.0 + 3.0), 3.0);
  col += mix(vec3(0.12, 0.03, 0.18), vec3(0.02, 0.12, 0.16), fbm3(rd * 2.0)) * neb * 0.5;
  return col;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  if (id < 2.5) {
    // 빛을 먹는 몸: 거의 완전한 검정, 그 속에 다른 하늘. 가장자리만 코로나 빛에 탄다
    vec3 emi = voidSky(-V) * 0.7;
    // 처음 뜬 눈: 눈꺼풀 금을 따라 가늘게 벌어진 빛
    vec3 h = toHead(toLocal(p));
    vec3 e = vec3(abs(h.x), h.y, h.z) - vec3(0.28, -0.16, 0.58);
    e.xy = rot(-0.18) * e.xy;
    float slit = smoothstep(0.012, 0.002, abs(e.y + 0.025 - 1.1 * e.x * e.x)) * smoothstep(0.12, 0.04, abs(e.x)) * step(0.05, e.z);
    emi += vec3(1.0, 0.95, 0.82) * slit * 4.0;
    float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
    emi += vec3(1.0, 0.9, 0.75) * fres * 0.25;
    return Mat(vec3(0.003), 0.5, 0.15, emi, 0.0, 0.0, 0.0);
  }
  // 혜성 탯줄: 몸 가까이는 검고, 멀어질수록 푸른 흰빛
  vec3 ap;
  vec3 tg;
  float ti = cordT(p, ap, tg);
  float seg = ti < float(T0B) + 0.5 ? (ti - 0.0) / float(T0B) : ti < float(T1B) + 0.5 ? (ti - float(T1A - 6)) / float(T1B - T1A + 6) : (ti - float(T2A - 6)) / float(T2B - T2A + 6);
  float glow = smoothstep(0.1, 0.95, seg);
  return Mat(vec3(0.003), 0.4, 0.2, vec3(0.45, 0.72, 1.0) * glow * glow * 1.6 + vec3(0.9, 0.95, 1.0) * pow(glow, 6.0) * 3.0, 0.0, 0.0, 0.0);
}

// 코로나: 몸에 가려진 별 + 바깥으로 뻗는 흐름 줄기, 혜성 꼬리
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec4 acc = vec4(0.0);
  vec3 c = CO - ro;
  float along = dot(c, rd);
  vec3 o = c - rd * along;
  float th = length(o) / along;
  vec3 ww = normalize(c);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  float ang = atan(dot(o, vv), dot(o, uu));
  float hit = tHit < 1e4 ? 1.0 : 0.0;
  // 줄기: 각도마다 다른 길이
  float s1 = noise(vec3(cos(ang) * 3.0, sin(ang) * 3.0, 1.0));
  float s2 = noise(vec3(cos(ang) * 9.0, sin(ang) * 9.0, 4.0));
  float streamer = pow(s1, 2.0) * 0.8 + pow(s2, 3.0) * 0.6;
  float core = exp(-th / 0.03) * 3.5 + exp(-th / 0.07) * 1.0;
  float reach = 0.035 + 0.12 * streamer * streamer;
  float corona = exp(-th / reach) * (0.4 + 2.0 * streamer) * smoothstep(0.32, 0.12, th) + exp(-th / 0.08) * 0.1;
  vec3 col = vec3(1.0, 0.92, 0.78) * core + mix(vec3(1.0, 0.82, 0.6), vec3(0.6, 0.75, 1.0), smoothstep(0.05, 0.4, th)) * corona;
  col *= 1.0 - hit;
  // 가는 빛살
  float rays = pow(max(0.0, 1.0 - abs(sin(ang * 3.0 + 0.4))), 120.0) * exp(-th / 0.12) * 0.3 * smoothstep(0.3, 0.15, th);
  col += vec3(1.0, 0.9, 0.75) * rays * (1.0 - hit * 0.9);
  acc.rgb += col;
  // 혜성 꼬리
  acc.rgb += cometGlow(ro, rd, tHit, T0A + 6, T0B, vec3(0.5, 0.78, 1.0), 0.1, 1.5);
  acc.rgb += cometGlow(ro, rd, tHit, T1A + 6, T1B, vec3(0.5, 0.78, 1.0), 0.1, 1.5);
  acc.rgb += cometGlow(ro, rd, tHit, T2A + 6, T2B, vec3(0.5, 0.78, 1.0), 0.1, 1.5);
  acc.a = clamp(dot(acc.rgb, vec3(0.33)) * 1.2, 0.0, 1.0);
  return acc;
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.01);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  float h = hash31(cell);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, h) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.1, 0.04, 0.14) * pow(fbm3(rd * 3.0), 3.0) * 0.8;
  return col;
}
`,
  };
}

/** seed 99: 형체 확인용 (앞에서 비춘 회색, 빛·성운 없음) */
export function debugView(r) {
  r.light = { ...r.light, key: [0.3, 0.6, 1.0], keyCol: [1.2, 1.2, 1.2], fill: [-0.6, 0.2, 0.6], fillCol: [0.3, 0.3, 0.35], amb: [0.08, 0.08, 0.08], rim: 0.3, pt: [0, 0, 0], ptCol: [0, 0, 0] };
  r.glsl = r.glsl
    .replace('Mat material(float id, vec3 p, vec3 n) {', 'Mat material(float id, vec3 p, vec3 n) {\n  return Mat(vec3(0.35) + 0.25 * vec3(fract(id * 0.37), fract(id * 0.61), fract(id * 0.83)), 0.6, 0.2, vec3(0.0), 0.0, 0.0, 0.0);')
    .replace('vec4 volume(vec3 p) {', 'vec4 volume(vec3 p) {\n  return vec4(0.0);')
    .replace('vec4 overlay(vec3 ro, vec3 rd, float tHit) {', 'vec4 overlay(vec3 ro, vec3 rd, float tHit) {\n  return vec4(0.0);');
  r.arrays = { ...r.arrays, uL: [], uLC: [] };
  return r;
}

export default function starFetus({ seed = 1, mode = 'sprite', form = 0 } = {}) {
  const r = form === 2 ? born({ seed, mode }) : form === 1 ? egg({ seed, mode }) : sleeping({ seed, mode });
  return seed === 99 ? debugView(r) : r;
}
