// 별을 삼킨 것 (5층) — 검은 몸속에서 삼킨 별이 아직 타고 있다. 빛을 보면 그것마저 삼키려 든다.
// 빛을 먹는 검은 뱀 같은 짐승이 삼킨 별을 제 몸으로 칭칭 감아 가두었다. 똬리 틈마다 별빛이 새어 나와 비늘 안쪽을 달군다.
// 똬리에서 솟은 목 끝의 머리는 거의 아가리 — 턱이 찢어질 듯 벌어졌고, 안쪽으로 굽은 바늘 이빨이 겹겹이 줄지었다. 눈은 없다.
// 주위의 빛이 실처럼 휘말려 그 아가리로 빨려 든다.
import { rng } from '../../lib.js';

export default function starSwallower({ seed = 1 } = {}) {
  const R = rng(seed * 211 + 17);
  const STAR = [0, 1.45, 0];
  const H = [0.35, 3.3, 0.55]; // 머리 (위턱 뿌리)
  const F0 = [0.95, -0.4, 0.45]; // 아가리가 향하는 쪽 (카메라 쪽, 아래로)
  const fl = Math.hypot(...F0);
  const F = F0.map((v) => v / fl);
  // 몸: 꼬리 끝 → 별을 감는 똬리 2바퀴 반 → 솟는 목 → 머리
  const B = [];
  const turns = 2.3;
  const n1 = 52;
  for (let i = 0; i < n1; i++) {
    const t = i / (n1 - 1);
    const a = -1.2 + t * turns * Math.PI * 2;
    const y = STAR[1] - 0.95 + t * 1.6 + 0.12 * Math.sin(a * 1.5);
    const rr = 0.78 + 0.12 * Math.sin(t * 9) + 0.25 * (1 - t) * (1 - t);
    const tube = 0.06 + 0.17 * Math.pow(t, 0.6);
    B.push([STAR[0] + Math.cos(a) * rr, y, STAR[2] + Math.sin(a) * rr * 0.9, tube]);
  }
  // 목: 똬리 끝에서 머리로
  const last = B[B.length - 1];
  const neckEnd = [H[0] - F[0] * 0.55, H[1] - F[1] * 0.55 + 0.05, H[2] - F[2] * 0.55];
  const P = [last.slice(0, 3), [last[0] + 0.1, last[1] + 1.0, last[2] - 0.5], [neckEnd[0] - 0.2, neckEnd[1] + 0.5, neckEnd[2] - 0.7], neckEnd];
  for (let i = 1; i < 16; i++) {
    const t = i / 15;
    const m = 1 - t;
    const c = [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
    B.push([...c, 0.23 - 0.05 * Math.sin(t * Math.PI)]);
  }
  // 빛 부스러기: 아가리로 빨려 드는 것들
  const uL = [];
  const uLC = [];
  const mouth = [H[0] + F[0] * 0.45, H[1] + F[1] * 0.45 - 0.2, H[2] + F[2] * 0.45];
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2;
    const r = 0.4 + R() * 1.5;
    uL.push([mouth[0] + Math.cos(a) * r, mouth[1] + Math.sin(a) * r * 0.8, mouth[2] + 0.4 + R() * 0.8, 0.007 + R() * 0.012]);
    uLC.push(R() < 0.7 ? [1.0, 0.75, 0.4, 0.9] : [0.7, 0.85, 1.0, 0.9]);
  }
  const f3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;
  return {
    preset: 'act5',
    cam: { pos: [0.6, -1.2, 9.6], target: [0.15, 2.0, 0], fov: 1.85 },
    light: {
      key: [-0.45, 0.6, -0.65],
      keyCol: [0.55, 0.45, 0.85],
      fill: [0.6, -0.3, 0.7],
      fillCol: [0.015, 0.012, 0.03],
      amb: [0.003, 0.002, 0.006],
      rimCol: [0.7, 0.5, 1.2],
      rim: 1.7,
      glow: 0.07,
      exposure: 1.15,
      pt: STAR,
      ptCol: [3.0, 1.3, 0.35],
    },
    frame: { fill: 0.92, bottom: 0.04 },
    arrays: { uB: B, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_BG

const vec3 STAR = ${f3(STAR)};
const vec3 HEAD = ${f3(H)};
const vec3 FWD = ${f3(F)};
const vec3 MOUTH = ${f3(mouth)};
const float SRAD = 0.5;

const float HS = 1.35;
vec3 headLocal(vec3 p) {
  vec3 s = normalize(cross(FWD, vec3(0.0, 1.0, 0.0)));
  vec3 u = cross(s, FWD);
  vec3 q = p - HEAD;
  return vec3(dot(q, s), dot(q, u), dot(q, FWD)) / HS;
}

float headD(vec3 p, out float mid) {
  vec3 h = headLocal(p);
  mid = 1.0;
  // 위턱: 길고 납작한 두개골, 눈 자리 없이 매끈하다. 뒤통수엔 가시 돌기
  float skull = sdEllipsoid(h - vec3(0.0, 0.12, 0.3), vec3(0.32, 0.19, 0.72));
  skull = smin(skull, sdEllipsoid(h - vec3(0.0, 0.2, -0.15), vec3(0.34, 0.3, 0.36)), 0.18);
  // 눈 자리 없는 매끈한 이마 능선
  skull = smin(skull, sdEllipsoid(vec3(abs(h.x), h.y, h.z) - vec3(0.16, 0.28, 0.15), vec3(0.08, 0.06, 0.35)), 0.08);
  vec3 hx = vec3(abs(h.x), h.y, h.z);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec3 b = vec3(0.12, 0.3 - fi * 0.03, -0.1 - fi * 0.14);
    skull = smin(skull, sdRoundCone(hx, b, b + vec3(0.06, 0.16 - fi * 0.02, -0.12), 0.05, 0.008), 0.04);
  }
  // 아래턱: 크게 젖혀 벌어졌다
  vec3 j = h - vec3(0.0, -0.02, -0.12);
  j.yz = rot(-0.95) * j.yz;
  float jaw = sdEllipsoid(j - vec3(0.0, -0.06, 0.45), vec3(0.28, 0.08, 0.62));
  jaw = max(jaw, -sdEllipsoid(j - vec3(0.0, 0.03, 0.47), vec3(0.22, 0.07, 0.55)));
  float head = smin(skull, jaw, 0.08);
  // 아가리 안쪽은 비웠다
  head = max(head, -sdEllipsoid(h - vec3(0.0, -0.2, 0.3), vec3(0.26, 0.24, 0.55)));
  return head * HS;
}

/** 이빨: 위턱 가장자리와 아래턱 가장자리에 두 줄씩, 안쪽으로 굽은 바늘 */
float teethD(vec3 p) {
  vec3 h = headLocal(p);
  vec3 j = h - vec3(0.0, -0.02, -0.12);
  j.yz = rot(-0.95) * j.yz;
  float t = 1e5;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float a = mix(-1.25, 1.25, fi / 9.0);
    float len = 0.16 + 0.08 * sin(fi * 2.7) - 0.05 * abs(a) + (abs(fi - 4.5) > 3.6 ? 0.0 : 0.0);
    vec3 b = vec3(sin(a) * 0.26, -0.02, 0.3 + cos(a) * 0.62);
    t = min(t, sdRoundCone(h, b, b + vec3(-sin(a) * 0.03, -len, -0.03), 0.022, 0.002));
    vec3 b2 = vec3(sin(a) * 0.22, -0.02, 0.32 + cos(a) * 0.4);
    t = min(t, sdRoundCone(h, b2, b2 + vec3(-sin(a) * 0.04, -len * 0.7, -0.05), 0.016, 0.002));
    vec3 c = vec3(sin(a) * 0.25, 0.0, 0.45 + cos(a) * 0.58);
    t = min(t, sdRoundCone(j, c, c + vec3(-sin(a) * 0.03, len * 0.9, -0.03), 0.02, 0.002));
  }
  // 아래턱 끝의 긴 엄니: 입 밖으로 휘어 솟는다
  vec3 jx = vec3(abs(j.x), j.y, j.z);
  vec3 f0 = vec3(0.17, 0.0, 0.85);
  vec3 f1 = f0 + vec3(0.03, 0.2, -0.02);
  vec3 f2 = f1 + vec3(-0.02, 0.18, -0.1);
  t = min(t, smin(sdRoundCone(jx, f0, f1, 0.035, 0.022), sdRoundCone(jx, f1, f2, 0.022, 0.003), 0.01));
  vec3 g0 = vec3(0.2, -0.01, 0.62);
  t = min(t, sdRoundCone(jx, g0, g0 + vec3(0.02, 0.26, 0.04), 0.03, 0.003));
  return t * HS;
}

vec2 sdf(vec3 p) {
  float d = chains(p, 0.06);
  // 등을 따라 솟은 비늘 능선
  if (d < 0.15) d -= 0.012 * pow(max(sin(p.x * 13.0 + p.z * 11.0 + p.y * 9.0), 0.0), 3.0) + 0.012 * fbm3(p * 12.0);
  float mid;
  float hd = headD(p, mid);
  d = smin(d, hd, 0.12);
  vec2 r = vec2(d, 1.0);
  r = umin(r, vec2(teethD(p), 2.0));
  // 아가리 속 어둠
  vec3 h = headLocal(p);
  r = umin(r, vec2(sdEllipsoid(h - vec3(0.0, -0.22, 0.12), vec3(0.22, 0.2, 0.42)) * HS, 99.0));
  // 삼킨 별
  float star = length(p - STAR) - SRAD - 0.025 * (fbm3((p - STAR) * 7.0) - 0.5);
  r = umin(r, vec2(star, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  if (id < 1.5) {
    // 빛을 먹는 검은 비늘: 별을 향한 안쪽 면만 붉게 달아오른다
    vec3 ls = STAR - p;
    float dist = length(ls);
    float toward = max(dot(n, ls / dist), 0.0);
    float scale = smoothstep(0.35, 0.65, abs(fract(dot(p, vec3(9.0, 7.0, 8.0))) - 0.5) * 2.0);
    vec3 emi = vec3(1.0, 0.32, 0.06) * pow(toward, 3.0) * 0.5 * exp(-(dist - SRAD) * 4.0);
    return Mat(vec3(0.006, 0.005, 0.009) * (0.6 + 0.5 * scale), 0.3, 0.45, emi, 0.25, 0.0, 0.12);
  }
  if (id < 2.5) return Mat(vec3(0.06, 0.05, 0.045), 0.3, 0.9, vec3(0.0), 0.0, 0.2, 0.4);
  // 별: 끓는 플라스마
  vec3 q = p - STAR;
  float mu = max(dot(n, V), 0.0);
  float g = fbm(q * 5.0);
  float gran = 1.0 - ridge(q * 16.0);
  float h = 0.42 + 0.35 * g + 0.2 * gran;
  vec3 c = mix(vec3(1.1, 0.25, 0.03), vec3(2.4, 1.3, 0.4), smoothstep(0.5, 0.8, h));
  c = mix(c, vec3(3.0, 2.5, 1.9), smoothstep(0.82, 0.95, h));
  return Mat(vec3(0.0), 1.0, 0.0, c * (0.3 + 0.7 * pow(mu, 0.5)), 0.0, 0.0, 0.0);
}

// 똬리 틈으로 새는 별빛 + 아가리로 빨려 드는 빛의 실
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 acc = vec3(0.0);
  vec3 c = STAR - ro;
  float along = dot(c, rd);
  float th = length(c - rd * along) / along;
  float hid = tHit < along - SRAD * 1.1 ? 0.25 : (tHit < 1e4 && tHit < along + SRAD ? 0.4 : 1.0);
  acc += vec3(1.0, 0.5, 0.12) * (exp(-th / 0.05) * 0.25 + exp(-th / 0.025) * 0.4) * hid;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec3 prev = vec3(0.0);
    for (int i = 0; i <= 20; i++) {
      float t = float(i) / 20.0;
      float a = fk * 1.57 + t * 4.5;
      float rr = mix(1.7 + 0.3 * fk, 0.05, pow(t, 0.7));
      vec3 cur = MOUTH + vec3(cos(a) * rr, sin(a) * rr * 0.7, 0.6 * (1.0 - t) + sin(a) * rr * 0.3);
      if (i > 0) {
        vec3 u = cur - prev;
        vec3 w0 = prev - ro;
        float ub = dot(u, rd);
        float sc = clamp((ub * dot(rd, w0) - dot(u, w0)) / max(dot(u, u) - ub * ub, 1e-6), 0.0, 1.0);
        float tc = ub * sc + dot(rd, w0);
        float dd = length(w0 + u * sc - rd * tc);
        float w = mix(0.02, 0.006, t);
        float flick = 0.55 + 0.45 * noise(vec3(t * 6.0, fk * 5.0, 1.0));
        acc += mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.7, 0.35), t) * (exp(-dd / w) + exp(-dd / (w * 5.0)) * 0.15) * t * t * flick * length(u) * 2.4 * (tc < tHit + 0.1 ? 1.0 : 0.15);
      }
      prev = cur;
    }
  }
  return vec4(acc, clamp(dot(acc, vec3(0.33)) * 1.4, 0.0, 1.0));
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
