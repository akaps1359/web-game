// 검은 별 (4층 계층군주) — 빛을 먹는 별. 별들이 제자리를 찾을 때 운석 구덩이 위로 내려앉는다.
// 빛을 먹는 완전한 검은 구(사건의 지평선), 그 둘레의 가는 광자 고리, 기울어진 강착원반(안쪽은 흰 금빛, 바깥은 보랏빛),
// 원반의 뒤쪽이 중력에 휘어 구의 위아래로 감기는 빛의 띠. 구의 아랫부분은 녹아 처지고, 타르 같은 검은 물줄기가
// 운석 구덩이를 향해 길게 뚝뚝 떨어진다 (끝마다 방울이 맺힌다).
// 원반·고리는 덧칠(HAS_OVERLAY)로 분석적으로 그리고, 물줄기는 자료 배열(uB)로 넘긴다.
import { rng } from '../../lib.js';

export default function blackStar({ seed = 1 } = {}) {
  const R = rng(seed * 433 + 9);
  const C = [0, 2.5, 0];
  const RS = 0.9;
  const sag = [C[0], C[1] - RS * 0.72, C[2] + 0.05];

  // 물줄기: 처진 바닥에서 떨어진다 (가늘고, 끝에 방울)
  const ch = [];
  const drops = [];
  const N = 8;
  for (let k = 0; k < N; k++) {
    const a = (k / (N - 1) - 0.5) * 2.2 + (R() - 0.5) * 0.25;
    const zf = (R() - 0.4) * 0.6;
    const base = [sag[0] + Math.sin(a) * 0.42, sag[1] - 0.28 + Math.abs(Math.sin(a)) * 0.15, sag[2] + zf * 0.45];
    const len = 0.7 + R() * 1.7 * (1 - Math.abs(a) * 0.25);
    const drift = (R() - 0.5) * 0.3;
    const M = 10;
    const w0 = 0.04 + R() * 0.03;
    const bulb = R() < 0.5;
    let last;
    for (let i = 0; i < M; i++) {
      const t = i / (M - 1);
      const x = base[0] + Math.sin(a) * t * 0.12 + drift * t * t + Math.sin(t * 6 + k) * 0.015;
      const y = base[1] - len * t;
      const z = base[2] + Math.cos(t * 5 + k * 2) * 0.012;
      // 굵은 뿌리 → 고르지 않게 가늘어지는 줄기 (몇은 끝에 방울)
      const lump = 1 + 0.35 * Math.sin(t * 13 + k * 3.1);
      const w = i === M - 1 && bulb ? w0 * 0.55 + 0.012 : (w0 * Math.pow(1 - t, 1.2) + 0.008) * lump;
      ch.push([x, y, z, w]);
      last = [x, y, z, w];
    }
    ch.push([0, 0, 0, 0]);
    // 떨어지는 중인 방울
    if (R() < 0.35 && last[1] > 0.35) drops.push([last[0], last[1] - 0.12 - R() * 0.15, last[2], 0.018 + R() * 0.012]);
  }
  for (const d of drops) {
    ch.push([d[0], d[1] + d[3] * 0.6, d[2], d[3] * 0.6], [d[0], d[1], d[2], d[3]], [0, 0, 0, 0]);
  }

  // 원반 주위로 끌려 들어가는 별 부스러기
  const lights = [];
  const lc = [];
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2;
    const rr = 2.0 + R() * 1.0;
    const x = C[0] + Math.cos(a) * rr;
    if (Math.abs(x) < 1.3) continue;
    lights.push([x, C[1] + (R() - 0.5) * 0.4 + Math.sin(a) * rr * 0.12, C[2] + Math.sin(a) * rr * 0.5, 0.006 + R() * 0.012]);
    lc.push(R() < 0.5 ? [1.0, 0.85, 0.55, 1.0] : [0.7, 0.5, 1.0, 1.0]);
  }

  const cam = [0.2, 0.8, 11.6];
  return {
    preset: 'act4',
    cam: { pos: cam, target: [0, 2.05, 0], fov: 1.8 },
    light: {
      key: [-0.2, 0.9, -0.4],
      keyCol: [0.9, 0.7, 1.1],
      fillCol: [0.1, 0.05, 0.18],
      amb: [0.01, 0.008, 0.02],
      rimCol: [1.0, 0.75, 0.5],
      rim: 1.2,
      exposure: 1.15,
      glow: 0.05,
      pt: [0, 2.25, 1.6],
      ptCol: [1.8, 1.1, 0.8],
    },
    frame: { fill: 0.94, bottom: 0.03 },
    arrays: { uB: ch, uL: lights, uLC: lc, uP: [[...C, RS], [0.33, 1.3, 2.8, 0], [...sag, 0]] },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_BG
#define HAS_OVERLAY

vec2 sdf(vec3 p) {
  vec3 q = p - uP[0].xyz;
  float RS = uP[0].w;
  float hole = length(q) - RS;
  // 녹아 처진 아랫부분
  float sag = sdEllipsoid(p - uP[2].xyz, vec3(0.62, 0.42, 0.6) * RS);
  float body = smin(hole, sag, 0.35);
  float drip = chains(p, 0.03);
  float d = smin(body, drip, 0.12);
  vec2 r = vec2(d, 99.0);
  // 구 바깥으로 흘러내린 것은 젖은 타르로 보인다
  if (min(sag, drip) < hole - 0.01) r.y = 1.0;
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  // 젖은 타르: 검고 매끈하며 보랏빛·금빛이 비친다
  float v = fbm3(p * 7.0);
  return Mat(vec3(0.006, 0.005, 0.009) * (0.6 + 0.8 * v), 0.08, 1.4, vec3(0.0), 0.4, 0.0, 1.0);
}

vec3 diskCol(float rr, float ang) {
  // rr: 0 안쪽 ~ 1 바깥쪽 — 원을 따라 길게 늘어진 줄무늬 (잡음)
  vec3 pa = vec3(cos(ang) * 1.5, sin(ang) * 1.5, rr * 26.0);
  float streak = noise(pa) * 0.6 + noise(pa * vec3(2.0, 2.0, 2.3) + 7.0) * 0.4;
  float clump = fbm3(vec3(cos(ang) * 3.0, sin(ang) * 3.0, rr * 5.0));
  vec3 hot = vec3(1.0, 0.93, 0.8);
  vec3 mid = vec3(1.0, 0.58, 0.2);
  vec3 cold = vec3(0.42, 0.16, 0.7);
  vec3 c = mix(hot, mid, smoothstep(0.0, 0.3, rr));
  c = mix(c, cold, smoothstep(0.3, 0.85, rr));
  float I = pow(1.0 - rr, 1.5) * (0.3 + 1.1 * streak * streak) * (0.5 + clump);
  return c * I * 2.6;
}

vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 C = uP[0].xyz;
  float RS = uP[0].w;
  float tilt = uP[1].x;
  vec3 N = normalize(vec3(0.0, cos(tilt), sin(tilt)));
  vec4 acc = vec4(0.0);
  vec3 oc = C - ro;
  float along = dot(oc, rd);
  float b = length(oc - rd * along);
  vec3 side = normalize(cross(rd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(side, rd);
  vec3 off = (ro + rd * along) - C;
  float phi = atan(dot(off, up), dot(off, side));
  // 뒤쪽 원반이 구의 위·아래로 휘어 보이는 띠 + 광자 고리
  if (along > 0.0) {
    float x = b / RS;
    float vert = pow(abs(sin(phi)), 1.5);
    float w = mix(0.08, 0.36, vert) * mix(1.0, 0.7, step(sin(phi), 0.0));
    float band = smoothstep(1.0, 1.05, x) * exp(-pow(max(x - 1.06, 0.0) / w, 1.3) * 2.0);
    float rrL = clamp((x - 1.03) / (w * 2.4), 0.0, 1.0);
    vec3 c = diskCol(rrL * 0.85, phi * 1.5 + 2.0) * band * mix(0.45, 1.0, vert);
    c += vec3(1.0, 0.88, 0.7) * exp(-abs(x - 1.012) * 150.0) * 2.0;
    c *= step(1.0, x) * step(along, tHit);
    acc.rgb += c;
    acc.a = max(acc.a, clamp(dot(c, vec3(0.45)), 0.0, 1.0));
  }
  // 앞쪽 원반 — 구보다 앞이거나 구를 비껴갈 때만
  float den = dot(rd, N);
  if (abs(den) > 1e-4) {
    float t = dot(C - ro, N) / den;
    if (t > 0.0 && t < tHit) {
      vec3 h = ro + rd * t - C;
      float r = length(h);
      float r0 = uP[1].y;
      float r1 = uP[1].z;
      if (r > r0 * 0.9 && r < r1) {
        vec3 ex = normalize(cross(N, vec3(0.0, 0.0, 1.0)));
        vec3 ey = cross(N, ex);
        float ang = atan(dot(h, ey), dot(h, ex));
        float rr = (r - r0) / (r1 - r0);
        vec3 c = diskCol(clamp(rr, 0.0, 1.0), ang) * smoothstep(r0 * 0.9, r0 * 1.03, r);
        c *= 0.55 + 0.7 * smoothstep(-1.0, 1.0, dot(normalize(h), -side));
        acc.rgb += c;
        acc.a = max(acc.a, clamp(dot(c, vec3(0.45)), 0.0, 1.0));
      }
    }
  }
  return acc;
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.005, 0.003, 0.01);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.92, 0.85) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  return col;
}
`,
  };
}
