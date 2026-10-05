// 꿈을 먹는 자 (5층 계층군주) — 태아가 꾸는 꿈의 가장자리에서 잠든 이들의 꿈을 갉아먹고 자라는 것.
// 성운 속에 떠 있는 거대하고 앙상한 형체: 고개 숙인 눈 없는 긴 두개골이 그대로 마디진 빨대 주둥이(맥의 코)로 이어져,
// 사마귀처럼 높이 치켜든 팔꿈치 아래 긴 손가락으로 감싸 쥔 꿈의 방울 — 그 속에 웅크려 잠든 사람 — 에 꽂혀 있다.
// 머리 뒤로는 뼈 살대가 받친 그믐달 모양의 막 볏이 코브라 목덜미처럼 펼쳐져 뒤에서 오는 빛에 보랏빛으로 비치고,
// 부푼 배의 얇은 살갗 너머로 삼킨 꿈들이 비친다. 다리 대신 해진 촉수와 꼬리가 성운 속으로 풀려 내린다.
// 깨어난 악몽(@2)은 같은 몸을 build({ wake: true })로: 볏이 찢어져 가시가 되고, 주둥이 끝이 네 갈래 아가리로 벌어지고,
// 방울은 터져 사라졌으며, 배가 갈라져 핏빛 빛이 샌다.
// 형체는 자료 배열(uA 타원체, uB 사슬)로 넘기고 셰이더는 고리로 돈다.
import { rng } from '../../lib.js';

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const lerp3 = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
/** Catmull-Rom 곡선 위의 점들 */
export function spline(P, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * (P.length - 1);
    const k = Math.min(P.length - 2, Math.floor(u));
    const t = u - k;
    const p0 = P[Math.max(0, k - 1)];
    const p1 = P[k];
    const p2 = P[k + 1];
    const p3 = P[Math.min(P.length - 1, k + 2)];
    out.push(
      [0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t)),
    );
  }
  return out;
}

export function build({ seed = 1, wake = false } = {}) {
  const R = rng(seed * 4099 + 3);

  // ── 몸 타원체 (uA: [중심, k], [반지름, 0]) ──
  const ell = [];
  const E = (c, r, k = 0.22) => ell.push([...c, k], [...r, 0]);
  E([0, 2.78, -0.08], [0.6, 0.5, 0.4], 0.3); // 가슴 (앞으로 숙임)
  E([0, 3.08, -0.3], [0.56, 0.42, 0.44], 0.3); // 굽은 등 혹
  E([0.6, 3.05, 0.02], [0.24, 0.2, 0.22], 0.2); // 어깨
  E([-0.6, 3.05, 0.02], [0.24, 0.2, 0.22], 0.2);
  E([0, 2.05, 0.12], [0.56, 0.56, 0.5], 0.32); // 부푼 배
  E([0, 1.6, -0.1], [0.28, 0.34, 0.28], 0.25); // 허리
  E([0.04, 3.28, 0.25], [0.15, 0.17, 0.22], 0.16); // 목
  const nBody = ell.length;

  // ── 사슬 (uB) ──
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const pushPath = (pts, r0, r1, pw = 1, rf) => {
    pts.forEach((p, i) => {
      const t = i / (pts.length - 1);
      ch.push([...p, rf ? rf(t) : r0 + (r1 - r0) * Math.pow(t, pw)]);
    });
    brk();
  };
  // 꼬리 (허리 → 뒤로 말려 내려감)
  pushPath(spline([[0, 1.6, -0.1], [0.15, 1.05, -0.3], [0.05, 0.55, -0.15], [-0.35, 0.22, 0.15], [-0.75, 0.1, 0.45], [-1.05, 0.2, 0.6]], 13), 0.22, 0.012, 0.9);
  // 해진 촉수 (허리 둘레에서 늘어진다)
  for (let k = 0; k < 5; k++) {
    const a = -2.3 + (k / 4) * 4.6 + (R() - 0.5) * 0.3;
    const base = [Math.sin(a) * 0.3, 1.62 + R() * 0.15, Math.cos(a) * 0.24 - 0.05];
    const len = 0.9 + R() * 0.7;
    const sw = (R() - 0.5) * 0.6;
    const P = [base, add(base, [Math.sin(a) * 0.25 + sw * 0.3, -len * 0.4, Math.cos(a) * 0.15]), add(base, [Math.sin(a) * 0.35 + sw, -len * 0.8, Math.cos(a) * 0.25 + sw * 0.4]), add(base, [Math.sin(a) * 0.3 + sw * 1.4, -len, Math.cos(a) * 0.35])];
    pushPath(spline(P, 6), 0.055 + R() * 0.03, 0.005, 0.8);
  }
  const nTail = ch.length;

  // 팔: 어깨 → 높이 치켜든 팔꿈치 → (마디 하나 더) → 손목
  const bub = [0.04, 1.36, 1.28];
  const BR = 0.42;
  const wrists = [];
  for (const sx of [1, -1]) {
    const sh = [sx * 0.62, 3.05, 0.05];
    const el = wake ? [sx * 1.2, 3.65, -0.1] : [sx * 1.22, 3.3, 0.15];
    const kn = wake ? [sx * 1.85, 3.75, 0.35] : [sx * 1.15, 2.4, 0.75];
    const wr = wake ? [sx * 2.05, 3.2, 0.95] : [sx * 0.6, 1.62, 1.12];
    pushPath([sh, lerp3(sh, el, 0.5), el, lerp3(el, kn, 0.5), kn, wr], 0, 0, 1, (t) => 0.12 - 0.07 * t + 0.025 * Math.exp(-((t - 0.4) ** 2) * 200) + 0.02 * Math.exp(-((t - 0.8) ** 2) * 200));
    wrists.push(wr);
  }
  // 손가락
  for (const sx of [1, -1]) {
    const wr = wrists[sx > 0 ? 0 : 1];
    for (let f = 0; f < 4; f++) {
      const thumb = f === 3;
      const pts = [wr];
      if (!wake) {
        // 방울 표면을 따라 감는다
        const yaw0 = Math.atan2(wr[2] - bub[2], wr[0] - bub[0]);
        const el0 = thumb ? 0.55 : -0.55 + f * 0.4;
        for (let i = 1; i <= 4; i++) {
          const t = i / 4;
          const yaw = yaw0 + sx * t * (thumb ? -0.5 : 1.2 - Math.abs(f - 1) * 0.12);
          const el = el0 + (thumb ? 0.4 : -0.05) * t;
          const rr = BR + 0.04 + 0.03 * Math.sin(t * 3.1);
          pts.push([bub[0] + Math.cos(yaw) * Math.cos(el) * rr, bub[1] + Math.sin(el) * rr, bub[2] + Math.sin(yaw) * Math.cos(el) * rr]);
        }
        pts[1] = lerp3(pts[0], pts[1], 0.6);
      } else {
        // 활짝 편 갈퀴: 길게 뻗었다가 끝이 안으로 꺾인다
        const spread = thumb ? -0.9 : -0.35 + f * 0.33;
        const dir = [sx * (0.25 + Math.cos(spread) * 0.3), -0.55 + Math.sin(spread) * 0.7, 0.6];
        let p = wr;
        for (let i = 1; i <= 4; i++) {
          const t = i / 4;
          const bend = t * t * 0.9;
          p = add(p, [dir[0] * 0.21 - sx * bend * 0.06, dir[1] * 0.21 - bend * 0.15, dir[2] * 0.21 + bend * 0.07]);
          pts.push(p);
        }
      }
      pushPath(pts, thumb ? 0.032 : 0.028, 0.005, 1.2);
    }
  }
  const nArm = ch.length;

  // 머리: 고개 숙인 길쭉한 두개골 (뒤통수 → 얼굴 끝). 얼굴 끝은 칠성장어처럼 둥글게 오므린 입
  const headPts = [
    [0.0, 3.66, 0.12, 0.3],
    [0.07, 3.52, 0.48, 0.27],
    [0.13, 3.28, 0.8, 0.18],
    [0.17, 3.06, 0.98, 0.14],
  ];
  headPts.forEach((p) => ch.push(p));
  brk();
  const nHeadCh = ch.length;
  const hd = [0.04, -0.22, 0.18];
  const hl = Math.hypot(...hd);
  const mawDir = wake ? [0.12, -0.45, 0.88] : hd.map((x) => x / hl);
  const mawAt = add([0.17, 3.06, 0.98], mawDir, 0.1);
  // 혀 촉수: 입에서 늘어져 방울 속으로 파고든다 (깨어나면 앞으로 채찍처럼 뻗는다)
  const trunk = [];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 + 0.5;
    const o = [Math.cos(a) * 0.045, Math.sin(a) * 0.03, Math.sin(a) * 0.03];
    const s0 = add(mawAt, o);
    let P;
    if (!wake) {
      const end = add(bub, [Math.cos(a) * 0.1, 0.12 + Math.sin(a) * 0.06, Math.sin(a) * 0.08]);
      P = [s0, add(s0, [o[0] * 3 + 0.05, -0.35, 0.25 + o[2] * 2]), add(end, [o[0] * 2, 0.55, 0.12]), add(end, [0, 0.3, 0.02]), end];
    } else {
      const sw = (k - 1) * 0.4;
      P = [s0, add(s0, [sw * 0.5, -0.35, 0.35]), add(s0, [sw * 1.3, -0.85 + (k % 2) * 0.35, 0.75]), add(s0, [sw * 2.0, -1.0 + (k % 2) * 0.6, 1.2]), add(s0, [sw * 2.3, -0.75 + (k % 2) * 0.6, 1.45])];
    }
    const pts = spline(P, 8);
    trunk.push(...pts);
    pushPath(pts, 0.032, 0.008, 1.0);
  }
  const nTrunk = ch.length;

  // 배 속에서 비치는 삼킨 꿈들 (uA 뒤쪽에 [중심, 세기])
  const orbsAt = [
    [-0.22, 2.12, 0.5, 1.0],
    [0.24, 2.28, 0.44, 0.8],
    [0.02, 1.85, 0.52, 0.7],
    [-0.3, 2.5, 0.3, 0.5],
    [0.32, 1.9, 0.42, 0.6],
  ];
  for (const o of orbsAt) ell.push(o);
  const nOrb = ell.length;

  // 눈: 얼굴 옆 움푹한 홈 속 아주 작은 빛
  const lights = [];
  const lc = [];
  const eyeCol = wake ? [1.0, 0.16, 0.3] : [0.75, 0.45, 1.0];
  const eyes = [
    [0.3, 3.36, 0.82, 0.009, 1.2],
    [-0.06, 3.36, 0.82, 0.009, 1.2],
    [0.27, 3.48, 0.6, 0.006, 0.8],
    [-0.08, 3.5, 0.6, 0.006, 0.8],
  ];
  if (wake) eyes.push([0.33, 3.22, 0.98, 0.007, 1.0], [-0.04, 3.2, 1.0, 0.007, 1.0], [0.22, 3.62, 0.42, 0.006, 0.8], [-0.12, 3.62, 0.42, 0.006, 0.8]);
  for (const [x, y, z, s, k] of eyes) {
    lights.push([x, y, z, s]);
    lc.push([...eyeCol, k * 1.7]);
  }
  if (!wake) {
    // 방울 속 잠든 이의 빛
    lights.push([bub[0], bub[1], bub[2], 0.2]);
    lc.push([0.7, 0.45, 1.0, 0.2]);
  } else {
    // 아가리 속 빛
    lights.push([...add(mawAt, mawDir, -0.06), 0.06]);
    lc.push([1.0, 0.2, 0.35, 0.8]);
  }
  // 흩어지는 꿈 부스러기
  for (let i = 0; i < (wake ? 9 : 12); i++) {
    const p = trunk[Math.floor(R() * (trunk.length - 1))];
    lights.push([p[0] + (R() - 0.5) * 0.6, p[1] + (R() - 0.3) * 0.5, p[2] + (R() - 0.2) * 0.4, 0.005 + R() * 0.007]);
    lc.push(wake ? [1.0, 0.35, 0.5, 0.9] : [0.8, 0.6, 1.0, 0.9]);
  }
  for (let i = 0; i < 6; i++) {
    const a = R() * 6.28;
    lights.push([Math.cos(a) * (1.3 + R()), 0.4 + R() * 3.2, 0.3 + R() * 0.5, 0.005 + R() * 0.006]);
    lc.push(wake ? [1.0, 0.5, 0.6, 0.7] : [0.9, 0.8, 1.0, 0.7]);
  }

  const glowCol = wake ? 'vec3(1.0, 0.12, 0.32)' : 'vec3(0.6, 0.3, 1.0)';
  return {
    preset: 'act5',
    cam: { pos: [5.0, 0.75, 9.0], target: [0.15, 2.2, 0.35], fov: 1.75 },
    light: {
      key: [-0.35, 0.5, -0.8],
      keyCol: wake ? [1.4, 0.55, 0.75] : [1.25, 0.8, 1.25],
      fillCol: [0.05, 0.13, 0.17],
      amb: [0.012, 0.009, 0.02],
      rimCol: wake ? [1.3, 0.45, 0.7] : [1.0, 0.7, 1.3],
      rim: 1.6,
      exposure: 1.25,
      glow: 0.05,
      pt: wake ? [0.1, 2.0, 1.4] : [bub[0], bub[1] + 0.05, bub[2] + 0.1],
      ptCol: wake ? [1.2, 0.15, 0.35] : [0.8, 0.45, 1.3],
    },
    frame: { fill: 0.93, bottom: 0.03 },
    arrays: {
      uA: ell,
      uB: ch,
      uL: lights,
      uLC: lc,
      uP: [
        [nBody, nOrb, 0, wake ? 1 : 0],
        [nTail, nArm, nHeadCh, nTrunk],
        [-0.12, 3.75, -0.75, 1.15], // 그믐달 중심, 반지름
        [...bub, BR],
        [...mawAt, 0.13],
        [...mawDir, 0],
      ],
    },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_VOLUME
#define VOLUME_STEPS 40
#define VOLUME_FAR 16.0
#define HAS_BG
#define WAKE ${wake ? 1 : 0}

float ellR(vec3 p, int a, int b) {
  float d = 1e5;
  for (int i = a; i < b; i += 2) d = smin(d, sdEllipsoid(p - uA[i].xyz, uA[i + 1].xyz), uA[i].w);
  return d;
}
float chainR(vec3 p, int a, int b, float k) {
  float d = 1e5;
  for (int i = a; i < b - 1; i++) {
    vec4 s0 = uB[i];
    vec4 s1 = uB[i + 1];
    if (s0.w <= 0.0 || s1.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, s0.xyz, s1.xyz, s0.w, s1.w), k);
  }
  return d;
}

// 그믐달 볏: 뒤통수에서 자라난 달 — 구에서 어긋난 구를 파낸 두꺼운 초승달, 표면은 곰보진 달 돌
vec3 moonQ(vec3 p) {
  vec3 q = p - uP[2].xyz;
  return q;
}
// 깨진 달의 금: 위쪽 한 점에서 퍼져 나간 금 7줄 (각도 공간의 들쭉날쭉한 선)
float moonCrack(vec3 q) {
  vec3 c = normalize(vec3(-0.35, 0.75, 0.55));
  vec3 n = normalize(q);
  float ang0 = acos(clamp(dot(n, c), -1.0, 1.0));
  vec3 t1 = normalize(cross(c, vec3(0.0, 0.0, 1.0)));
  vec3 t2 = cross(c, t1);
  float az = atan(dot(n, t2), dot(n, t1));
  float best = 1e5;
  for (int i = 0; i < 7; i++) {
    float a = float(i) * 0.8976 + 0.3 * hash11(float(i) * 7.1);
    float len = 0.7 + 0.8 * hash11(float(i) * 3.3);
    float jit = 0.12 * (noise(vec3(ang0 * 9.0, float(i), 1.0)) - 0.5) + 0.05 * (noise(vec3(ang0 * 31.0, float(i), 4.0)) - 0.5);
    float da = abs(mod(az - a - jit / max(ang0, 0.05) + 3.14159, 6.28318) - 3.14159) * sin(min(ang0, 1.5));
    float w = 0.03 * (1.0 - ang0 / len);
    best = min(best, max(da - w, ang0 - len));
  }
  return best;
}
float moonD(vec3 p) {
  vec3 q = moonQ(p);
  float R0 = uP[2].w;
  float d = length(q) - R0;
  vec3 V = normalize(uCamPos - uP[2].xyz);
  vec3 qc = q - vec3(0.42, -0.5, 0.0);
  float cut = length(qc - V * dot(qc, V)) - R0 * 0.92;
  d = smax(d, -cut, 0.06);
#if WAKE == 1
  // 깨어나면 달이 깨져 금이 간다
  float crack = moonCrack(q);
  d = smax(d, -(crack + 0.004), 0.01);
#endif
  if (d < 0.08) {
    // 크레이터: 둥근 홈
    vec3 g = q * 2.3;
    vec3 c = floor(g);
    vec3 f = fract(g) - 0.5;
    float h = hash31(c + 11.0);
    float cr = length(f + (vec3(hash31(c + 1.0), hash31(c + 2.0), hash31(c + 3.0)) - 0.5) * 0.4) - 0.22 * h;
    d += 0.03 * smoothstep(0.06, -0.12, cr) * step(0.4, h) - 0.008 * smoothstep(-0.02, 0.06, cr) * smoothstep(0.16, 0.06, cr) * step(0.4, h);
    d += 0.015 * (fbm3(q * 6.0) - 0.5);
  }
  return d;
}

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.0, 2.3, 0.5)) - 3.2;
  if (bb > 0.5) return vec2(bb, 1.0);
  // 가슴·등·어깨 (앞의 4개 타원체)와 부푼 배·허리는 따로 녹여 가운데가 잘록하게
  float chest = ellR(p, 0, 8);
  float belly = ellR(p, 8, 12);
  float neck = ellR(p, 12, int(uP[0].x));
  // 갈비: 가슴 옆구리에만 골
  float ribs = abs(fract(p.y * 7.0 + 0.3) - 0.5);
  float side = smoothstep(0.1, 0.4, abs(p.x)) * smoothstep(2.35, 2.6, p.y) * smoothstep(3.15, 2.85, p.y);
  chest += 0.026 * smoothstep(0.25, 0.05, ribs) * side;
  // 쇄골
  chest = smin(chest, sdCapsule(vec3(abs(p.x), p.y, p.z), vec3(0.06, 3.12, 0.3), vec3(0.55, 3.15, 0.12), 0.04), 0.05);
  float body = smin(chest, belly, 0.1);
  body = smin(body, neck, 0.12);
  // 등뼈 마디
  for (int i = 0; i < 9; i++) {
    float t = float(i) / 8.0;
    vec3 c = vec3(0.0, 1.7 + t * 1.6, -0.42 - 0.3 * sin(t * 3.0) + t * 0.1);
    body = smin(body, length(p - c) - 0.075, 0.07);
  }
#if WAKE == 1
  // 갈라진 배
  vec3 bq = p - vec3(0.24, 2.05, 0.55);
  bq.xz = rot(0.47) * bq.xz;
  float jag = 0.035 * sin(bq.y * 23.0) + 0.03 * (noise(vec3(bq.y * 9.0, 2.0, 1.0)) - 0.5);
  float slit = sdEllipsoid(bq, vec3(0.085 + jag, 0.5, 0.32));
  body = smax(body, -slit, 0.025);
#endif
  float tail = chainR(p, 0, int(uP[1].x), 0.05);
  float d = smin(body, tail, 0.14);
  float arms = chainR(p, int(uP[1].x), int(uP[1].y), 0.03);
  d = smin(d, arms, 0.1);
  float head = chainR(p, int(uP[1].y), int(uP[1].z), 0.1);
  vec3 hq = p - vec3(0.1, 3.4, 0.62);
  // 눈썹뼈 같은 능선과 관자놀이의 움푹한 홈 (눈은 없다)
  head = smin(head, sdEllipsoid(vec3(abs(hq.x) - 0.16, hq.y - 0.04, hq.z), vec3(0.09, 0.04, 0.2)), 0.05);
  head = smax(head, -sdEllipsoid(vec3(abs(hq.x) - 0.2, hq.y + 0.04, hq.z - 0.05), vec3(0.04, 0.03, 0.14)), 0.03);
  // 두개골 정수리의 능선
  head = smin(head, sdCapsule(p, vec3(0.0, 3.92, 0.05), vec3(0.08, 3.72, 0.55), 0.035), 0.08);
  // 오므린 둥근 입: 입술 고리, 구멍은 어둠
  vec3 mq = p - uP[4].xyz;
  vec3 md = uP[5].xyz;
  float along = dot(mq, md);
  float rr = length(mq - md * along);
  float MR = WAKE == 1 ? 0.15 : 0.075;
  float lip = length(vec2(rr - MR, along + 0.02)) - (WAKE == 1 ? 0.045 : 0.04);
  head = smin(head, lip, 0.05);
  float hole = max(rr - MR + 0.01, abs(along + 0.08) - 0.14);
  head = smax(head, -hole, 0.015);
#if WAKE == 1
  {
    vec3 sd0 = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
    vec3 ud0 = cross(sd0, md);
    for (int i = 0; i < 5; i++) {
      float ang = float(i) * 1.2566 + 0.3;
      vec3 dir = sd0 * cos(ang) + ud0 * sin(ang);
      vec3 a0 = uP[4].xyz + dir * MR;
      vec3 a1 = a0 + dir * 0.2 - md * 0.12;
      vec3 a2 = a1 + dir * 0.06 - md * 0.14;
      float pet = min(sdRoundCone(p, a0, a1, 0.05, 0.03), sdRoundCone(p, a1, a2, 0.03, 0.008));
      head = smin(head, pet, 0.04);
    }
  }
#endif
  d = smin(d, head, 0.12);
  vec2 r = vec2(d, 1.0);
  // 입 속 이빨 고리
  vec3 sd = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
  vec3 ud = cross(sd, md);
  float teeth = 1e5;
  float ta = atan(dot(mq, ud), dot(mq, sd));
  float N = WAKE == 1 ? 14.0 : 10.0;
  float sa = 6.2831853 / N;
  float ka = floor(ta / sa + 0.5) * sa;
  vec3 dir = sd * cos(ka) + ud * sin(ka);
  for (int j = 0; j < 2; j++) {
    float dep = -0.02 - float(j) * 0.05;
    vec3 t0 = uP[4].xyz + dir * (MR - 0.005) + md * dep;
    teeth = min(teeth, sdRoundCone(p, t0, t0 - dir * MR * 0.6 - md * 0.02, 0.012 - float(j) * 0.003, 0.002));
  }
  r = umin(r, vec2(teeth, 4.0));
  r = umin(r, vec2(max(rr - MR * 0.75, abs(along + 0.13) - 0.06), 99.0));
  // 혀 촉수
  float tg = chainR(p, int(uP[1].z), int(uP[1].w), 0.02);
  r = umin(r, vec2(tg, 6.0));
  if (r.x < 0.1) r.x += 0.009 * (fbm3(p * 9.0) - 0.5) + 0.004 * ridge(p * vec3(30.0, 8.0, 30.0));
  // 그믐달 볏과 그것을 뒤통수에 잇는 뼈 줄기
  float mn = moonD(p);
  float stalk = sdRoundCone(p, vec3(0.0, 3.7, 0.0), uP[2].xyz + vec3(0.25, -0.35, 0.55), 0.13, 0.08);
  stalk = min(stalk, sdRoundCone(p, vec3(-0.1, 3.55, -0.05), uP[2].xyz + vec3(-0.35, -0.6, 0.45), 0.1, 0.06));
  r = umin(r, vec2(smin(mn, stalk, 0.15), 2.0));
#if WAKE == 0
  // 방울 속 잠든 이: 무릎을 끌어안고 웅크린 사람 (빛을 등진 검은 그림자)
  vec3 b = p - uP[3].xyz;
  b.xy = rot(0.6) * b.xy;
  float sl = sdEllipsoid(b - vec3(-0.02, 0.0, 0.0), vec3(0.12, 0.15, 0.09));
  sl = smin(sl, sdSphere(b - vec3(0.06, 0.17, 0.05), 0.075), 0.03);
  sl = smin(sl, sdRoundCone(b, vec3(0.0, -0.1, 0.02), vec3(0.11, 0.05, 0.08), 0.06, 0.045), 0.03);
  sl = smin(sl, sdRoundCone(b, vec3(0.11, 0.05, 0.08), vec3(0.06, -0.14, 0.09), 0.045, 0.03), 0.02);
  sl = smin(sl, sdRoundCone(b, vec3(0.03, 0.08, 0.09), vec3(0.1, 0.0, 0.12), 0.025, 0.02), 0.02);
  r = umin(r, vec2(sl, 5.0));
#endif
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float v = fbm3(p * 4.0);
  if (id < 1.5) {
    // 보랏빛 도는 검은 살갗: 젖어 번들거리고, 배는 얇아 삼킨 꿈이 비친다
    vec3 alb = vec3(0.022, 0.016, 0.034) * (0.6 + 0.8 * v);
    vec3 emi = vec3(0.0);
    float belly = smoothstep(0.75, 0.35, length((p - vec3(0.0, 2.05, 0.3)) / vec3(1.0, 1.1, 1.0)));
    for (int i = int(uP[0].x); i < int(uP[0].y); i++) {
      float dd = length(p - uA[i].xyz);
      emi += ${glowCol} * uA[i].w * (exp(-dd * 26.0) * 2.6 + exp(-dd * 8.0) * 0.06);
    }
    float vein = smoothstep(0.08, 0.0, ridge(p * 5.0));
    emi *= belly * (0.7 + 0.3 * vein);
#if WAKE == 1
    // 찢긴 배 안쪽 (원래 배 표면보다 안에 드러난 살): 핏빛으로 끓는다
    float sdb = sdEllipsoid(p - uA[8].xyz, uA[9].xyz);
    float inner = smoothstep(-0.005, -0.04, sdb);
    float depth = smoothstep(-0.04, -0.22, sdb);
    float boil = 0.25 + 1.2 * smoothstep(0.1, 0.0, ridge(p * 8.0)) * (0.5 + noise(p * 14.0));
    emi += vec3(1.3, 0.08, 0.22) * inner * boil * mix(1.0, 0.35, depth) * 0.85;
    alb = mix(alb, vec3(0.08, 0.005, 0.02), inner);
#endif
    alb = mix(alb, vec3(0.045, 0.022, 0.06), belly * 0.5);
    return Mat(alb, 0.38, 0.9, emi, 0.12, mix(0.12, 0.45, belly), 0.6);
  }
  if (id < 2.5) {
    // 달 돌: 창백한 잿빛, 곰보 자국은 어둡고, 스스로 희미한 달빛을 낸다 (뼈 줄기 쪽은 살빛으로 이어진다)
    vec3 q = moonQ(p);
    float onMoon = smoothstep(uP[2].w - 0.25, uP[2].w - 0.05, length(q));
    float m1 = fbm3(q * 3.0);
    float m2 = fbm3(q * 11.0);
    float maria = smoothstep(0.45, 0.6, fbm3(q * 1.6 + 3.0));
    vec3 alb = vec3(0.2, 0.18, 0.21) * (0.5 + 0.7 * m1) * (0.75 + 0.35 * m2) * (1.0 - 0.55 * maria);
    vec3 emi = ${wake ? 'vec3(0.1, 0.03, 0.045)' : 'vec3(0.06, 0.055, 0.09)'} * (0.4 + 0.8 * m1) * (0.7 + 0.4 * m2) * (1.0 - 0.6 * maria) * onMoon;
#if WAKE == 1
    float crack = moonCrack(q);
    emi += vec3(1.6, 0.1, 0.28) * (smoothstep(0.02, 0.0, crack) * 1.2 + smoothstep(0.09, 0.0, crack) * 0.15) * onMoon;
#endif
    alb = mix(vec3(0.022, 0.016, 0.034) * (0.6 + 0.8 * v), alb, onMoon);
    return Mat(alb, 0.85, 0.15, emi, 0.0, 0.05, 0.0);
  }
  if (id < 3.5) {
    // 볏 살대: 검게 바랜 뼈
    return Mat(vec3(0.05, 0.042, 0.05) * (0.6 + 0.7 * v), 0.45, 0.6, vec3(0.0), 0.0, 0.1, 0.25);
  }
  if (id < 4.5) return Mat(vec3(0.16, 0.13, 0.12), 0.3, 0.8, vec3(0.0), 0.0, 0.3, 0.6);
  if (id < 5.5) {
    // 잠든 이: 빛을 등진 검은 그림자, 가장자리만 희미하게
    vec3 V = normalize(uCamPos - p);
    float fr = pow(1.0 - max(dot(n, V), 0.0), 2.0);
    return Mat(vec3(0.02, 0.016, 0.03), 0.6, 0.2, vec3(0.6, 0.4, 1.0) * fr * 0.5, 0.0, 0.6, 0.0);
  }
  // 혀 촉수: 젖은 검붉은 살, 끝으로 갈수록 꿈을 빨아들여 빛난다
  float tip = ${wake ? 'smoothstep(1.45, 1.75, length(p - uP[4].xyz)) * 0.5' : 'smoothstep(1.95, 1.6, p.y)'};
  return Mat(vec3(0.06, 0.02, 0.04), 0.25, 1.1, ${glowCol} * tip * 0.8, 0.1, 0.6, 0.8);
}

// 꿈의 방울: 얇은 막
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
#if WAKE == 1
  return vec4(0.0);
#else
  vec3 C = uP[3].xyz;
  float Rb = uP[3].w;
  vec3 oc = ro - C;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - Rb * Rb;
  float h = b * b - c;
  if (h < 0.0) return vec4(0.0);
  h = sqrt(h);
  vec4 acc = vec4(0.0);
  float t0 = max(-b - h, 0.0);
  float t1 = min(-b + h, tHit);
  if (t1 > t0) {
    // 방울 속을 채운 꿈빛: 지나는 길이만큼 쌓이고 가운데로 갈수록 짙다
    vec3 mid = ro + rd * (t0 + t1) * 0.5;
    float core = exp(-length(mid - C) * 4.0);
    float fill = (1.0 - exp(-(t1 - t0) * 1.6)) * (0.35 + 0.65 * core);
    acc.rgb += mix(vec3(0.25, 0.12, 0.6), vec3(0.75, 0.55, 1.0), core) * fill * 0.45;
    acc.a = max(acc.a, fill * 0.9);
  }
  for (int i = 0; i < 2; i++) {
    float t = i == 0 ? -b - h : -b + h;
    if (t < 0.0 || t > tHit) continue;
    vec3 q = ro + rd * t;
    vec3 nn = normalize(q - C);
    float graze = pow(1.0 - abs(dot(nn, rd)), 2.5);
    float wisp = 0.55 + 0.45 * fbm3(nn * 4.0 + vec3(uSeed));
    vec3 c1 = mix(vec3(0.75, 0.4, 1.0), vec3(0.4, 0.8, 1.0), smoothstep(-0.6, 0.8, nn.y + wisp - 0.5));
    float k = (0.03 + graze * 0.75) * wisp * (i == 0 ? 1.0 : 0.5);
    acc.rgb += c1 * k;
    acc.a = max(acc.a, k * 1.2);
  }
  return acc;
#endif
}

// 성운: 꼬리 끝에 엷게 풀린 안개, 방울(또는 아가리) 둘레의 꿈 안개
vec4 volume(vec3 p) {
  float n1 = fbm3(p * vec3(1.8, 2.6, 1.8) + vec3(0.0, uSeed, 3.0));
  float tailz = smoothstep(1.2, 0.2, p.y) * smoothstep(1.4, 0.3, length(p.xz - vec2(-0.4, 0.2))) * smoothstep(-0.2, 0.25, p.y);
  float cloud = tailz * smoothstep(0.5, 0.75, n1) * (uScene == 0 ? 0.5 : 1.0);
  vec3 F = WAKE == 1 ? uP[4].xyz : uP[3].xyz;
  float dl = length(p - F);
  float aura = smoothstep(0.85, 0.4, dl) * smoothstep(0.38, 0.48, dl) * n1;
  float dens = cloud * 1.2 + aura * 0.7;
  if (dens < 0.002) return vec4(0.0);
  vec3 col = (WAKE == 1 ? vec3(0.75, 0.12, 0.3) : vec3(0.45, 0.22, 0.8)) * (cloud * 0.45 + aura * 0.9);
  return vec4(col, dens * 0.9);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.012);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  float h = hash31(cell);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, h) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.2, 0.07, 0.26) * pow(fbm3(rd * 3.0), 3.0) * 0.8 + vec3(0.03, 0.08, 0.1) * pow(fbm3(rd * 2.0 + 5.0), 3.0);
  return col;
}
`,
  };
}

export default function dreamEater(opts) {
  return build(opts);
}
