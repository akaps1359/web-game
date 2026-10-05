// 문 너머의 존재 (4층 수호자) — 모든 시간과 공간이 맞닿는 문. 무지갯빛 구체들이 그것을 감싼다.
// 비스듬히 선 거대한 검은 현무암 고리(조각조각 갈라져 떠 있다). 그 안은 문 속의 문 속의 문 — 끝없이 겹친 고리가
// 빛의 한 점으로 빨려 든다. 그 문을 밀고 나오는 기름빛 구체 덩어리(요그소토스)가 고리를 넘쳐 흐르고 가장자리를 감싼다.
// 뒤에서 오는 빛에 구체마다 무지갯빛 테두리가 서고, 몇은 속에서 희미하게 빛난다.
// 형체는 자료 배열(uA 구체)로 넘기고 셰이더는 고리로 돈다 — 자료만 바꾸면 다시 컴파일하지 않는다.
import { rng } from '../../lib.js';

export default function beyondGate({ seed = 1 } = {}) {
  const R = rng(seed * 977 + 5);
  const G = [0, 2.2, 0];
  const RG = 1.45;
  const yaw = 0.42; // 고리를 비스듬히 돌린다
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  // 고리 좌표(x, y, z: 고리 앞쪽이 +z) → 월드
  const W = (x, y, z) => [G[0] + cy * x + sy * z, G[1] + y, G[2] - sy * x + cy * z];

  const orbs = [];
  const fits = (c, r) => orbs.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > (o[3] + r) * 0.72);
  const add = (c, r) => {
    if (fits(c, r)) {
      orbs.push([...c, r]);
      return true;
    }
    return false;
  };
  // 1) 문을 밀고 나와 아래 앞으로 쏟아지는 덩어리 (흐름을 따라 커졌다 작아진다)
  add(W(-0.62, -0.42, 0.45), 0.5);
  add(W(-1.0, -0.95, 0.95), 0.4);
  for (let i = 0; i < 300 && orbs.length < 36; i++) {
    const t = Math.pow(R(), 0.8);
    const path = [-0.5 - t * 0.75, -0.2 - t * 1.1, 0.15 + t * 1.2];
    const spread = 0.28 + t * 0.4;
    const r = (0.42 - t * 0.27) * (0.5 + R() * 0.65);
    const c = W(path[0] + (R() - 0.5) * spread * 2, path[1] + (R() - 0.5) * spread * 2, path[2] + (R() - 0.5) * spread);
    add(c, r);
  }
  // 2) 고리 바깥 가장자리를 감싸는 덩어리 (오른쪽 위, 왼쪽 위, 오른쪽 아래)
  for (const [a0, a1, n] of [[0.1, 1.6, 10], [2.2, 2.9, 6], [-1.2, -0.6, 5]]) {
    const goal = orbs.length + n;
    for (let i = 0; i < 200 && orbs.length < goal; i++) {
      const a = a0 + R() * (a1 - a0);
      const rr = RG + 0.15 + R() * 0.35;
      const r = 0.09 + Math.pow(R(), 1.5) * 0.24;
      add(W(Math.cos(a) * rr, Math.sin(a) * rr, (R() - 0.3) * 0.55), r);
    }
  }
  // 3) 떠도는 작은 구체
  for (let i = 0; i < 40 && orbs.length < 64; i++) {
    const a = R() * Math.PI * 2;
    const rr = 1.85 + R() * 0.35;
    add(W(Math.cos(a) * rr, Math.sin(a) * rr * 0.95, 0.2 + R() * 0.6), 0.035 + R() * 0.05);
  }

  // 문에서 흩어지는 불티
  const lights = [];
  const lc = [];
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.3 + R() * 1.9;
    lights.push([...W(Math.cos(a) * rr, Math.sin(a) * rr, 0.2 + R() * 1.0), 0.005 + R() * 0.009]);
    lc.push(R() < 0.6 ? [1.0, 0.85, 0.5, 1.0] : [0.75, 0.55, 1.0, 1.0]);
  }
  // 문 한가운데의 빛점
  lights.push([...W(0, 0, -0.02), 0.06]);
  lc.push([1.0, 0.9, 0.7, 1.2]);

  const cam = [0.45, 0.35, 10.2];
  return {
    preset: 'act4',
    cam: { pos: cam, target: [0, 2.05, 0], fov: 1.8 },
    light: {
      key: [-0.25, 0.25, -1.0],
      keyCol: [1.5, 1.2, 0.75],
      fillCol: [0.1, 0.06, 0.16],
      amb: [0.016, 0.012, 0.024],
      rimCol: [1.2, 0.95, 0.6],
      rim: 1.4,
      exposure: 1.2,
      glow: 0.06,
      pt: W(0, 0, 0.35),
      ptCol: [1.6, 1.2, 0.8],
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: { uA: orbs, uL: lights, uLC: lc, uP: [[...G, RG], [cy, sy, 0, 0]] },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_BG
#define HAS_OVERLAY

vec3 gateLocal(vec3 p) {
  vec3 q = p - uP[0].xyz;
  return vec3(uP[1].x * q.x - uP[1].y * q.z, q.y, uP[1].y * q.x + uP[1].x * q.z);
}

float ringD(vec3 q) {
  float a = atan(q.y, q.x) + 3.14159265;
  float r = length(q.xy);
  // 고르지 않은 조각: 각도를 비틀어 나눈다
  float wa = a + 0.18 * sin(a * 3.0 + 1.0);
  float stp = 6.2831853 / 11.0;
  float id = floor(wa / stp);
  float la = (fract(wa / stp) - 0.5) * stp;
  float h1 = hash31(vec3(id, 1.0, 7.0));
  float h2 = hash31(vec3(id, 5.0, 3.0));
  float h3 = hash31(vec3(id, 9.0, 1.0));
  float dr = (h1 - 0.5) * 0.12;
  float dz = (h2 - 0.5) * 0.3;
  vec2 cs = vec2(r - uP[0].w - dr, q.z - dz);
  cs = rot((h3 - 0.5) * 0.25) * cs;
  float d = sdBox(vec3(cs, 0.0), vec3(0.19, 0.32, 1.0)) - 0.03;
  // 깨지고 닳은 면
  d += 0.012 * sin(q.x * 9.0 + q.z * 5.0 + h1 * 6.0) * sin(q.y * 8.0 - q.z * 3.0) + 0.004 * sin(q.x * 37.0 - q.y * 29.0);
  float gap = abs(la) * r - (stp * 0.5 * r - 0.04 - 0.07 * h2);
  return max(d, gap);
}

vec2 sdf(vec3 p) {
  vec3 q = gateLocal(p);
  vec2 r = vec2(ringD(q), 1.0);
  float portal = max(length(q.xy) - (uP[0].w - 0.1), abs(q.z + 0.12) - 0.01);
  r = umin(r, vec2(portal, 3.0));
  float d = 1e5;
  for (int i = 0; i < 64; i++) {
    if (i >= uAN) break;
    d = smin(d, length(p - uA[i].xyz) - uA[i].w, 0.1);
  }
  r = umin(r, vec2(d, 2.0));
  return r;
}

// 문 속의 문: 고리가 끝없이 겹쳐 한 점의 빛으로 빨려 든다
vec3 portalCol(vec3 p) {
  vec3 q = gateLocal(p);
  float r = length(q.xy) / (uP[0].w - 0.1);
  float u = -log(max(r, 0.002));
  float a = atan(q.y, q.x) + u * 0.9;
  float k = fract(u * 1.35);
  float ring = smoothstep(0.0, 0.06, k) * smoothstep(0.42, 0.3, k);
  float edge = smoothstep(0.05, 0.0, abs(k - 0.42)) + smoothstep(0.04, 0.0, abs(k - 0.01));
  float seg = step(0.12, fract(a * 11.0 / 6.2831853 + floor(u * 1.35) * 0.37));
  float far = exp(-u * 0.55);
  vec3 dark = vec3(0.02, 0.012, 0.035) + vec3(0.12, 0.05, 0.22) * pow(1.0 - far, 3.0);
  vec3 c = mix(dark, vec3(0.012, 0.01, 0.014), ring * seg);
  c += vec3(1.0, 0.7, 0.3) * edge * seg * (0.35 + 0.65 * (1.0 - far)) * 0.9;
  c += vec3(1.0, 0.9, 0.7) * pow(1.0 - far, 6.0) * 4.0;
  c += vec3(0.7, 0.45, 1.0) * 0.25 * pow(1.0 - far, 2.0) * (0.5 + 0.5 * sin(a * 5.0 + u * 3.0));
  vec3 g = vec3(q.xy * 60.0, 1.0);
  c += vec3(1.0, 0.9, 0.8) * step(0.988, hash31(floor(g))) * smoothstep(0.45, 0.1, length(fract(g.xy) - 0.5)) * (1.0 - ring * seg) * 0.8;
  return c * 1.3;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 오래된 검은 현무암, 드문드문 희미한 금빛 룬
    vec3 q = gateLocal(p);
    float a = atan(q.y, q.x);
    float r = length(q.xy);
    float v = fbm3(p * 5.0);
    float pit = smoothstep(0.55, 0.75, fbm3(p * 17.0));
    vec2 g = vec2(a * 24.0, (r - uP[0].w) * 22.0);
    vec2 cell = floor(g);
    vec2 fc = fract(g);
    float h = hash31(vec3(cell, 2.0));
    float stroke = h < 0.4 ? step(abs(fc.x - 0.5), 0.09) : h < 0.75 ? step(abs(fc.y - 0.5), 0.09) : step(abs(length(fc - 0.5) - 0.3), 0.07);
    float rune = stroke * step(0.7, hash31(vec3(cell, 9.0))) * step(abs(r - uP[0].w), 0.13) * smoothstep(0.6, 0.85, dot(n, normalize(vec3(uP[1].y, 0.0, uP[1].x))));
    float lit = smoothstep(0.55, 0.75, noise(p * 2.0 + 4.0));
    vec3 emi = vec3(1.0, 0.6, 0.2) * rune * lit * 0.8;
    float grain = 0.75 + 0.5 * noise(p * 60.0);
    return Mat(vec3(0.011, 0.01, 0.011) * (0.5 + 0.9 * v) * (1.0 - pit * 0.6) * (1.0 - rune * 0.6) * grain, 0.85, 0.25, emi, 0.0, 0.0, 0.08);
  }
  if (id < 2.5) {
    // 기름막 구체: 검고 매끈, 가장자리엔 무지갯빛 막, 몇은 속에서 희미하게 빛난다
    int best = 0;
    float bd = 1e5;
    for (int i = 0; i < 64; i++) {
      if (i >= uAN) break;
      float dd = length(p - uA[i].xyz) - uA[i].w;
      if (dd < bd) { bd = dd; best = i; }
    }
    float hsh = hash31(vec3(float(best), 3.0, 11.0));
    vec3 V = normalize(uCamPos - p);
    float fr = 1.0 - max(dot(n, V), 0.0);
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (fr * 1.6 + hsh + vec3(0.0, 0.33, 0.67)));
    vec3 emi = film * pow(fr, 2.5) * 0.26;
    // 문 속의 빛이 구체마다 비친다
    vec3 Rf = reflect(-V, n);
    vec3 pd = normalize(uP[0].xyz - p);
    emi += vec3(1.0, 0.85, 0.6) * pow(max(dot(Rf, pd), 0.0), 40.0) * 2.2 * (0.6 + 0.4 * film.x);
    return Mat(vec3(0.01, 0.009, 0.013), 0.06, 1.4, emi, 0.8, 0.0, 0.95);
  }
  return Mat(vec3(0.0), 1.0, 0.0, portalCol(p), 0.0, 0.0, 0.0);
}

// 문 가장자리 너머로 새어 나오는 빛줄기 (덧칠: 앞을 가리는 것이 있으면 숨는다)
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 C = uP[0].xyz;
  vec3 oc = C - ro;
  float along = dot(oc, rd);
  if (along < 0.0 || tHit < 1e4) return vec4(0.0);
  vec3 off = ro + rd * along - C;
  vec3 side = normalize(cross(rd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(side, rd);
  float ang = atan(dot(off, up), dot(off, side));
  float x = length(off) / uP[0].w;
  float streak = pow(0.5 + 0.5 * sin(ang * 11.0 + 2.0 * sin(ang * 4.0 + 1.0)), 5.0);
  streak *= 0.4 + 0.6 * noise(vec3(cos(ang) * 4.0, sin(ang) * 4.0, 2.0));
  float I = streak * smoothstep(0.85, 1.1, x) * exp(-(x - 1.0) * 2.8) * 0.32;
  I += 0.1 * smoothstep(0.85, 1.05, x) * exp(-(x - 1.0) * 5.0);
  vec3 c = vec3(1.0, 0.78, 0.45) * I;
  return vec4(c, clamp(I * 1.4, 0.0, 1.0));
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.006, 0.004, 0.012) + vec3(0.06, 0.035, 0.08) * smoothstep(-0.2, 0.7, rd.y) * 0.4;
  vec3 g = rd * 280.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.92, 0.8) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  return col;
}
`,
  };
}
