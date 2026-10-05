// 성운 해파리 (5층) — 갓처럼 부푼 성운이 별 사이를 떠돈다. 투명한 갓 속에서 아기 별들이 깜박이고,
// 다 자란 별 하나를 갓 밑으로 낳아 보내는 중이다.
// 갓: 얇은 막(덧칠, 광선-타원체 교차) — 가장자리는 갈고리 달린 꽃잎 모양으로 갈라졌고, 방사형 수관이 비친다.
// 갓 속: 장미·보라·청록 성운(부피)과 갓 속 아기 별(uL). 아래: 주름진 입팔 넷과 길게 끌리는 가는 촉수(사슬).
import { rng } from '../../lib.js';

export default function nebulaJelly({ seed = 1 } = {}) {
  const R = rng(seed * 131 + 9);
  const BC = [0, 2.5, 0];
  const BR = [1.45, 1.0, 1.45];
  const tilt = 0.14;
  // 갓 좌표 → 월드 (기울임: xy 평면 회전)
  const rot2 = (a, x, y) => [Math.cos(a) * x + Math.sin(a) * y, -Math.sin(a) * x + Math.cos(a) * y];
  const BW = (q) => {
    const [x, y] = rot2(-tilt, q[0], q[1]);
    return [BC[0] + x, BC[1] + y, BC[2] + q[2]];
  };
  const B = [];
  const brk = () => B.length && B.push([0, 0, 0, 0]);
  // 가는 촉수: 갓 가장자리에서 아래로 길게, 물결치며 한쪽으로 흐른다
  const NT = 10;
  for (let k = 0; k < NT; k++) {
    const a = (k / NT) * Math.PI * 2 + R() * 0.25;
    const r0 = BR[0] * 0.9;
    const len = 1.9 + R() * 1.3;
    const ph = R() * 6;
    brk();
    const n = 11;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const sway = Math.sin(t * 7 + ph) * 0.32 * t;
      const q = [Math.cos(a) * r0 * (1 - 0.3 * t) + sway - t * t * 1.1, -0.22 - t * len, Math.sin(a) * r0 * (1 - 0.3 * t) + Math.cos(t * 6 + ph) * 0.3 * t];
      B.push([...BW(q), 0.017 * (1 - t * 0.7)]);
    }
  }
  const nTent = B.length;
  // 입팔 넷: 굵고 주름진 커튼, 나선으로 꼬이며 내려간다
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    brk();
    const n = 7;
    const len = 1.7 + R() * 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const aa = a + t * 1.6;
      const rr = 0.2 + 0.22 * t;
      const q = [Math.cos(aa) * rr - t * t * 0.5, -0.32 - t * len, Math.sin(aa) * rr];
      B.push([...BW(q), 0.075 * (1 - t * 0.65) + 0.015]);
    }
  }
  // 갓 속 아기 별 + 갓 밑으로 나오는 다 자란 별
  const uL = [];
  const uLC = [];
  for (let i = 0; i < 13; i++) {
    const a = R() * Math.PI * 2;
    const rr = Math.sqrt(R()) * 0.75;
    const y = -0.05 + R() * 0.65;
    uL.push([...BW([Math.cos(a) * rr * BR[0], y * BR[1], Math.sin(a) * rr * BR[2]]), 0.012 + R() * 0.025]);
    uLC.push(R() < 0.5 ? [1.0, 0.85, 0.65, 1.0] : [0.75, 0.88, 1.0, 1.0]);
  }
  const born = BW([0.25, -0.75, 0.35]);
  uL.push([...born, 0.11]);
  uLC.push([1.0, 0.9, 0.7, 1.6]);
  // 촉수 끝에 매달린 작은 빛
  for (let k = 0; k < NT; k += 2) {
    const c = B[k * 12 + 10];
    if (c && c[3] > 0) {
      uL.push([c[0], c[1], c[2], 0.012]);
      uLC.push([0.6, 0.9, 1.0, 0.9]);
    }
  }
  const f3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;
  return {
    preset: 'act5',
    cam: { pos: [0.4, -3.0, 12.0], target: [0.1, 1.5, 0], fov: 1.85 },
    light: {
      key: [-0.3, 0.8, -0.5],
      keyCol: [0.9, 0.85, 1.2],
      fill: [0.5, -0.5, 0.7],
      fillCol: [0.03, 0.05, 0.08],
      amb: [0.006, 0.005, 0.012],
      rimCol: [0.9, 0.75, 1.2],
      rim: 1.8,
      glow: 0.06,
      exposure: 1.15,
      pt: born,
      ptCol: [1.6, 1.3, 0.9],
    },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uB: B, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_VOLUME
#define VOLUME_STEPS 110
#define VOLUME_FAR 14.0
#define HAS_BG

const vec3 BC = ${f3(BC)};
const vec3 BR = ${f3(BR)};
const vec3 BORN = ${f3(born)};
const int NTENT = ${nTent};

vec3 bellLocal(vec3 p) {
  vec3 q = p - BC;
  q.xy = rot(${tilt.toFixed(4)}) * q.xy;
  return q;
}
vec3 bellDir(vec3 d) {
  d.xy = rot(${tilt.toFixed(4)}) * d.xy;
  return d;
}
/** 갓 가장자리 높이 (단위 타원체 좌표): 꽃잎처럼 갈라진 가장자리 */
float margin(float az) {
  float lap = abs(sin(az * 8.0));
  return -0.3 + 0.16 * (1.0 - pow(lap, 0.5)) + 0.03 * sin(az * 23.0);
}

vec2 sdf(vec3 p) {
  float d = chains(p, 0.02);
  // 입팔의 주름 (위쪽 갓 가까이, 굵은 사슬일수록)
  if (d < 0.1) {
    vec3 q0 = bellLocal(p);
    float frill = sin(atan(q0.z, q0.x) * 9.0 + q0.y * 14.0) * sin(q0.y * 23.0 + q0.x * 7.0);
    d -= 0.022 * frill * smoothstep(-0.1, -1.2, q0.y) * smoothstep(-3.0, -1.4, q0.y) * smoothstep(0.7, 0.2, length(q0.xz));
  }
  vec2 r = vec2(d, 1.0);
  // 갓 꼭대기 안쪽의 위장 덩어리 (어둡게 비친다)
  vec3 q = bellLocal(p);
  float gut = sdEllipsoid(q - vec3(0.0, 0.22, 0.0), vec3(0.32, 0.22, 0.32));
  gut = smin(gut, sdEllipsoid(q - vec3(0.0, -0.1, 0.0), vec3(0.13, 0.3, 0.13)), 0.12);
  gut += 0.02 * (fbm3(q * 9.0) - 0.5);
  r = umin(r, vec2(gut, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.0);
  if (id > 2.5) {
    // 위장: 검붉은 덩어리, 속에서 별빛이 샌다
    float v = fbm3(p * 6.0);
    float core = exp(-length(bellLocal(p) - vec3(0.0, 0.2, 0.0)) / 0.12);
    return Mat(vec3(0.02, 0.008, 0.018) * (0.6 + v), 0.3, 0.8, vec3(0.5, 0.08, 0.2) * fres * 0.2 + vec3(1.0, 0.5, 0.25) * core * 0.45, 0.2, 0.6, 0.7);
  }
  // 촉수와 입팔: 거의 투명한 보랏빛 살, 가장자리만 빛난다. 입팔에는 빛나는 점이 박혔다
  vec3 alb = vec3(0.05, 0.035, 0.08);
  vec3 emi = mix(vec3(0.5, 0.3, 0.9), vec3(0.35, 0.8, 0.95), smoothstep(0.0, 3.0, BC.y - p.y)) * fres * 0.9;
  float dots = smoothstep(0.8, 0.92, noise(p * 30.0));
  emi += vec3(0.7, 0.85, 1.0) * dots * 0.5;
  return Mat(alb, 0.25, 0.9, emi, 0.3, 0.8, 0.8);
}

// 갓의 막: 광선과 타원체의 두 교점에서 얇은 막 (비스듬할수록 밝다), 방사형 수관과 고리 근육
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 o = bellLocal(ro) / BR;
  vec3 d = bellDir(rd) / BR;
  float a = dot(d, d);
  float b = dot(o, d);
  float c = dot(o, o) - 1.0;
  float h = b * b - a * c;
  vec4 acc = vec4(0.0);
  if (h < 0.0) return acc;
  h = sqrt(h);
  for (int i = 0; i < 2; i++) {
    float t = i == 0 ? (-b - h) / a : (-b + h) / a;
    if (t < 0.0 || t > tHit) continue;
    vec3 q = o + d * t;
    float az = atan(q.z, q.x);
    if (q.y < margin(az)) continue;
    vec3 n = normalize(q / BR);
    vec3 nw = n;
    float graze = pow(1.0 - abs(dot(normalize(nw), normalize(d))), 2.5);
    // 방사형 수관 16줄 + 가장자리 고리
    float canal = smoothstep(0.08, 0.0, abs(fract(az * 16.0 / 6.2831853) - 0.5) - 0.42) * smoothstep(-0.2, 0.6, q.y);
    float ring = smoothstep(0.03, 0.0, abs(q.y - margin(az) - 0.05));
    float vein = smoothstep(0.04, 0.0, ridge(q * 5.0 + 2.0)) * 0.5;
    float wisp = fbm3(q * 3.0 + 4.0);
    vec3 col = mix(vec3(0.6, 0.3, 0.85), vec3(0.3, 0.75, 0.9), smoothstep(0.3, 0.7, wisp));
    col = mix(col, vec3(0.9, 0.35, 0.55), smoothstep(0.2, 0.9, q.y) * 0.4);
    float k = graze * graze * 0.35 + canal * 0.07 * (0.3 + graze) + ring * 0.45 + vein * 0.04;
    k *= i == 0 ? 1.0 : 0.55;
    acc.rgb += col * k;
    acc.a = max(acc.a, clamp(k * 1.2 + 0.03, 0.0, 1.0));
    // 가장자리 고리의 빛점
    float bead = smoothstep(0.03, 0.0, abs(q.y - margin(az) - 0.02)) * step(0.85, fract(az * 24.0 / 6.2831853));
    acc.rgb += vec3(0.8, 0.9, 1.0) * bead * 1.2;
  }
  // 다 자란 별의 빛살
  vec3 cc = BORN - ro;
  float al = dot(cc, rd);
  vec3 off = cc - rd * al;
  vec3 ww = normalize(cc);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  float ox = abs(dot(off, uu)) / al;
  float oy = abs(dot(off, vv)) / al;
  float spk = exp(-ox / 0.0012) * exp(-oy / 0.035) + exp(-oy / 0.0012) * exp(-ox / 0.035);
  acc.rgb += vec3(1.0, 0.88, 0.7) * spk * 0.8;
  acc.a = max(acc.a, clamp(spk, 0.0, 1.0));
  return acc;
}

// 갓 속 성운: 장미·보라·청록 구름, 아기 별 둘레가 밝다
vec4 volume(vec3 p) {
  vec3 q = bellLocal(p) / BR;
  float r = length(q);
  if (r > 1.0) return vec4(0.0);
  float az = atan(q.z, q.x);
  float inside = smoothstep(1.0, 0.85, r) * smoothstep(margin(az), margin(az) + 0.15, q.y);
  if (inside <= 0.0) return vec4(0.0);
  // 갓 속에서 소용돌이치는 성운 (중심축 둘레로 감긴다)
  float sw = atan(q.z, q.x) + q.y * 2.5 + length(q.xz) * 3.0;
  vec3 sq = vec3(cos(sw) * length(q.xz), q.y, sin(sw) * length(q.xz));
  float n1 = fbm3(sq * 2.8 + vec3(1.0, 2.0, uSeed));
  float n2 = fbm3(q * 5.5 + 7.0);
  float fil = pow(1.0 - ridge(sq * 3.2 + 5.0), 6.0);
  float cloud = smoothstep(0.42, 0.75, n1 * 0.7 + n2 * 0.4);
  float lane = smoothstep(0.55, 0.7, fbm3(q * 3.5 + 11.0));
  vec3 col = mix(vec3(0.95, 0.05, 0.35), vec3(0.35, 0.05, 0.95), smoothstep(0.3, 0.7, n2));
  col = mix(col, vec3(0.0, 0.7, 0.85), smoothstep(0.55, 0.8, n1) * 0.75);
  vec3 L = col * (0.03 + 2.0 * cloud * cloud + 1.5 * fil * cloud) * (1.0 - 0.95 * lane);
  for (int i = 0; i < 13; i++) {
    vec3 lp = uL[i].xyz - p;
    L += uLC[i].rgb * 0.006 / (0.004 + dot(lp, lp));
  }
  float dens = inside * (0.06 + 1.2 * cloud + lane * 1.2);
  return vec4(L * 1.1 * (uScene == 0 ? 1.7 : 1.0), dens * 0.5);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.01);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.08, 0.03, 0.12) * pow(fbm3(rd * 3.0), 3.0);
  return col;
}
`,
  };
}
