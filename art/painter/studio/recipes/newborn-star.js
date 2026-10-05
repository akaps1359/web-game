// 갓 태어난 별 (5층 하수인) — 성운이 낳은 아기 별. 첫 빛을 터뜨리기 직전의 불안정한 원시별.
// 끓어오르는 플라스마 공(쌀알 무늬·흑점·가장자리 어두워짐), 그것을 감은 검은 먼지 원반(안쪽 가장자리만 달아올랐다),
// 위아래로 뿜는 두 줄기 제트, 표면에서 솟는 홍염 고리와 떨어져 나가는 불덩이. 화난 듯 일그러져 있다.
import { rng } from '../../lib.js';

export default function newbornStar({ seed = 1 } = {}) {
  const R = rng(seed * 59 + 5);
  const C = [0, 1.3, 0];
  // 홍염 고리: [중심(표면 위 방향), 크기, 기울기]
  const P = [];
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    const b = (R() - 0.5) * 1.6;
    P.push([Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b) * 0.6 + 0.4, 0.22 + R() * 0.16]);
  }
  // 떨어져 나가는 불덩이
  const uL = [];
  const uLC = [];
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2;
    const b = (R() - 0.5) * 2.4;
    const r = 0.8 + R() * 0.9;
    uL.push([C[0] + Math.cos(a) * Math.cos(b) * r, C[1] + Math.sin(b) * r * 0.9, C[2] + Math.sin(a) * Math.cos(b) * r * 0.7 + 0.3, 0.01 + R() * 0.02]);
    uLC.push(R() < 0.7 ? [1.0, 0.7, 0.3, 1.0] : [1.0, 0.9, 0.7, 1.0]);
  }
  const f3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;
  return {
    preset: 'act5',
    cam: { pos: [0.3, -0.6, 7.6], target: [0, 1.3, 0], fov: 1.85 },
    light: {
      key: [0.0, 0.3, -1.0],
      keyCol: [0.5, 0.35, 0.2],
      fill: [0.5, -0.4, 0.7],
      fillCol: [0.02, 0.02, 0.04],
      amb: [0.004, 0.003, 0.006],
      rimCol: [1.2, 0.7, 0.35],
      rim: 1.2,
      glow: 0.08,
      exposure: 1.1,
      pt: C,
      ptCol: [5.0, 2.6, 0.9],
    },
    frame: { fill: 0.88, bottom: 0.04 },
    arrays: { uP: P, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_VOLUME
#define VOLUME_STEPS 120
#define VOLUME_FAR 11.0
#define HAS_BG

const vec3 C = ${f3(C)};
const float SR = 0.58;
const float TILT = 0.38;

vec3 diskLocal(vec3 p) {
  vec3 q = p - C;
  q.yz = rot(TILT) * q.yz;
  q.xy = rot(0.25) * q.xy;
  return q;
}
float boil(vec3 p) {
  return fbm(p * 4.0 + vec3(0.0, uSeed, 0.0)) * 0.65 + fbm3(p * 11.0) * 0.35;
}

vec2 sdf(vec3 p) {
  vec3 q = p - C;
  // 끓는 표면: 혹처럼 부풀었다 꺼진다
  float d = length(q) - SR;
  if (d < 0.3) d -= 0.025 * (boil(q) - 0.45) + 0.008 * sin(q.x * 9.0 + q.y * 7.0);
  vec2 r = vec2(d * 0.8, 1.0);
  return r;
}

vec3 plasma(float h) {
  vec3 c = mix(vec3(0.5, 0.05, 0.01), vec3(1.6, 0.45, 0.06), smoothstep(0.2, 0.5, h));
  c = mix(c, vec3(2.6, 1.6, 0.6), smoothstep(0.5, 0.75, h));
  return mix(c, vec3(3.2, 2.9, 2.4), smoothstep(0.78, 0.95, h));
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  if (id < 1.5) {
    vec3 q = p - C;
    float mu = max(dot(n, V), 0.0);
    // 쌀알 무늬 + 흑점 + 가장자리 어두워짐, 갈라진 틈은 흰빛
    float g = boil(q);
    // 쌀알 무늬: 촘촘한 세포, 어두운 골
    float gran = smoothstep(0.1, 0.6, 1.0 - ridge(q * 11.0 + 3.0)) * 0.65 + smoothstep(0.2, 0.8, 1.0 - ridge(q * 24.0 + 9.0)) * 0.35;
    // 표면을 기어가는 검은 필라멘트
    float fil = smoothstep(0.05, 0.0, ridge(q * 2.6 + 1.0)) * smoothstep(0.5, 0.65, noise(q * 3.0 + 8.0));
    // 흑점 쌍과 그 둘레의 밝은 백반
    float act = fbm3(q * 2.2 + 5.0);
    float spot = smoothstep(0.7, 0.74, act) * smoothstep(0.65, 0.8, noise(q * 9.0)) * 0.7;
    float fac = smoothstep(0.55, 0.66, act) * (1.0 - spot);
    // 갈라져 터지는 흰 틈 (불안정)
    float crack = smoothstep(0.05, 0.0, ridge(q * 3.4 + 7.0)) * smoothstep(0.5, 0.7, noise(q * 1.8 + 2.0));
    float h = 0.3 + 0.22 * g + 0.26 * gran + 0.12 * fac;
    h *= (1.0 - 0.8 * spot) * (1.0 - 0.55 * fil);
    h = max(h, 0.6 + crack * 0.35);
    vec3 emi = plasma(h * (0.5 + 0.45 * pow(mu, 0.7))) * (0.18 + 0.6 * pow(mu, 0.8));
    return Mat(vec3(0.0), 1.0, 0.0, emi, 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    // 먼지 원반: 검은 갈색, 별을 향한 안쪽 가장자리는 달아올랐다
    vec3 k = diskLocal(p);
    float rr = length(k.xz);
    float hot = smoothstep(1.15, 0.78, rr);
    float v = fbm3(p * 7.0);
    vec3 alb = vec3(0.03, 0.02, 0.015) * (0.5 + v);
    vec3 emi = vec3(1.4, 0.45, 0.08) * hot * hot * (0.4 + 0.8 * v) + vec3(0.5, 0.12, 0.03) * smoothstep(0.6, 0.85, v) * hot;
    return Mat(alb, 0.9, 0.1, emi, 0.0, 0.3, 0.0);
  }
  // 홍염: 붉은 플라스마 실
  float v = noise(p * 18.0);
  return Mat(vec3(0.0), 1.0, 0.0, plasma(0.45 + 0.35 * v) * 0.8, 0.0, 0.0, 0.0);
}

// 코로나와 제트
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 acc = vec3(0.0);
  vec3 c = C - ro;
  float along = dot(c, rd);
  vec3 o = c - rd * along;
  float th = length(o) / along;
  float rs = SR / along;
  vec3 ww = normalize(c);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  float ang = atan(dot(o, vv), dot(o, uu));
  float hit = tHit < 1e4 ? 1.0 : 0.0;
  float x = max(th - rs, 0.0) / rs;
  float st = noise(vec3(cos(ang) * 4.0, sin(ang) * 4.0, 2.0)) * 0.7 + noise(vec3(cos(ang) * 11.0, sin(ang) * 11.0, 5.0)) * 0.5;
  float cor = exp(-x / (0.1 + 0.45 * st * st * st)) * (0.4 + 1.2 * st * st);
  acc += vec3(1.3, 0.55, 0.15) * cor * (1.0 - hit * 0.9) * 0.6;
  // 홍염: 표면에서 솟아 휘는 빛의 고리 (실처럼 꼬였다)
  for (int i = 0; i < 6; i++) {
    vec3 dir = normalize(uP[i].xyz);
    float s = uP[i].w * 0.95;
    vec3 side = normalize(cross(dir, vec3(0.3, 1.0, 0.2)));
    vec3 base = C + dir * SR * 0.97;
    vec3 prev = base - side * s;
    for (int j = 1; j <= 12; j++) {
      float a = 3.14159 * float(j) / 12.0;
      vec3 cur = base + (-side * cos(a) + dir * sin(a) * (1.1 + 0.3 * sin(float(i) * 2.0))) * s;
      vec3 u = cur - prev;
      vec3 w0 = prev - ro;
      float ub = dot(u, rd);
      float sc = clamp((ub * dot(rd, w0) - dot(u, w0)) / max(dot(u, u) - ub * ub, 1e-6), 0.0, 1.0);
      float tc = ub * sc + dot(rd, w0);
      float dd = length(w0 + u * sc - rd * tc);
      float fl = 0.6 + 0.6 * noise(vec3(float(j) * 1.3, float(i) * 3.0, sc * 3.0));
      acc += vec3(1.6, 0.5, 0.12) * (exp(-dd / 0.012) * 0.9 + exp(-dd / 0.05) * 0.25) * fl * length(u) * 6.0 * (tc < tHit + 0.05 ? 1.0 : 0.15);
      prev = cur;
    }
  }
  // 위아래 제트: 원반 축을 따라 가늘게, 매듭진 빛
  vec3 ax = vec3(0.0, 1.0, 0.0);
  ax.yz = rot(-TILT) * ax.yz;
  ax.xy = rot(-0.25) * ax.xy;
  for (int s = 0; s < 2; s++) {
    vec3 a = C;
    vec3 u = ax * (s == 0 ? 1.7 : -1.3);
    vec3 w0 = a - ro;
    float ub = dot(u, rd);
    float sc = clamp((ub * dot(rd, w0) - dot(u, w0)) / max(dot(u, u) - ub * ub, 1e-6), 0.0, 1.0);
    float tc = ub * sc + dot(rd, w0);
    float dd = length(w0 + u * sc - rd * tc);
    float w = 0.03 + 0.12 * sc;
    float knots = 0.6 + 0.6 * pow(noise(vec3(sc * 9.0, float(s) * 4.0, 1.0)), 2.0);
    float I = exp(-dd / w) * smoothstep(0.25, 0.4, sc) * (1.0 - sc) * knots * 1.2;
    acc += mix(vec3(1.0, 0.85, 0.6), vec3(0.6, 0.75, 1.0), sc) * I * (tc < tHit + 0.2 ? 1.0 : 0.25);
  }
  return vec4(acc, clamp(dot(acc, vec3(0.33)) * 1.3, 0.0, 1.0));
}

// 먼지 원반 (부피): 얇고 찢긴 고리. 별 앞을 지나는 부분은 빛을 가리는 검은 띠, 안쪽 가장자리는 달아오른다
vec4 volume(vec3 p) {
  vec3 k = diskLocal(p);
  float rr = length(k.xz);
  if (rr > 2.0 || abs(k.y) > 0.4) return vec4(0.0);
  float ang = atan(k.z, k.x);
  float sw = ang + rr * 2.2;
  vec3 sq = vec3(cos(sw) * rr, k.y * 4.0, sin(sw) * rr);
  float n1 = fbm3(sq * 3.0 + 2.0);
  float n2 = fbm3(sq * 8.0 + 5.0);
  float th = 0.05 + 0.1 * smoothstep(0.7, 1.8, rr);
  float slab = exp(-pow((k.y + 0.04 * sin(ang * 3.0)) / th, 2.0));
  float ring = smoothstep(0.78, 1.05, rr) * smoothstep(1.9, 1.35, rr);
  float clump = smoothstep(0.35, 0.7, n1 * 0.7 + n2 * 0.4);
  float dens = slab * ring * (0.25 + clump) * 5.0;
  // 별빛에 달궈진 안쪽, 바깥은 거의 검다
  float hot = smoothstep(1.2, 0.7, rr);
  vec3 L = vec3(1.3, 0.42, 0.08) * hot * hot * 1.2 + vec3(0.25, 0.07, 0.02) * smoothstep(0.6, 0.8, n2) * hot;
  return vec4(L * (uScene == 0 ? 1.5 : 1.0), dens);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.01);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.08, 0.03, 0.1) * pow(fbm3(rd * 3.0), 3.0);
  return col;
}
`,
  };
}
