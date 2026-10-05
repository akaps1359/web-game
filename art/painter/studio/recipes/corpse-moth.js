// 시체 나방 (2층) — 향로 연기를 따라 모여드는 창백한 나방. 시체에 알을 슬고, 그 날갯가루를 들이마신 자는 생각이 굳는다.
// 사람 몸통만 한 나방이 날개를 펴고 떠 있다. 잿빛 상아색 날개는 해지고 구멍이 났으며, 검은 날개맥과
// 노려보는 눈 같은 눈알 무늬. 털 많은 가슴엔 해골 무늬, 알이 차 부푼 배가 늘어졌다. 날갯가루가 희미하게 빛나며 떨어진다.
import { rng } from '../../lib.js';

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

export default function corpseMoth({ seed = 1 } = {}) {
  const R = rng(seed * 19 + 3);
  const C = [0.0, 1.0, 0.0];
  const motes = [];
  const mc = [];
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.1 + R() * 0.45;
    motes.push([C[0] + Math.cos(a) * rr, C[1] - 0.32 - R() * 0.6, C[2] + Math.sin(a) * rr * 0.6, 0.004 + R() * 0.004]);
    mc.push([1.0, 0.86, 0.55, 0.5 + R() * 0.5]);
  }
  return {
    preset: 'act2',
    cam: { pos: [0.15, 0.95, 3.4], target: [0.0, 0.95, 0.0], fov: 1.85 },
    light: {
      key: [-0.35, 0.75, -0.6],
      rim: 1.2,
      fillCol: [0.25, 0.15, 0.06],
      exposure: 1.18,
      glow: 0.06,
    },
    frame: { fill: 0.92 },
    arrays: { uL: motes, uLC: mc },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 120
#define VOLUME_FAR 10.0
#define HAS_BG

const vec3 C = ${v3(C)};
const float PITCH = 0.42;

/** 나방 지역 좌표: 머리(+z)가 아래로 숙여져 등이 카메라 쪽으로 기울었다 */
vec3 mothSpace(vec3 p) {
  // 몸을 세웠다: 등(+y)이 카메라를, 머리(+z)가 위·앞을 향한다
  vec3 w = p - C;
  float t = PITCH;
  return vec3(w.x, dot(w, vec3(0.0, -sin(t), cos(t))), dot(w, vec3(0.0, cos(t), sin(t))));
}
/** 날개 좌표계: u 날개 바깥쪽, v 앞쪽, w 날개면의 법선 */
void wingFrame(float s, out vec3 U, out vec3 V, out vec3 N) {
  U = normalize(vec3(s * 0.95, 0.22, 0.1));
  V = normalize(vec3(0.0, 0.0, 1.0) - U * U.z);
  N = cross(U, V) * s;
}
float ellipse2(vec2 q, vec2 c, vec2 r, float a) {
  vec2 d = rot(a) * (q - c);
  return sdEllipsoid(vec3(d, 0.0), vec3(r, 1.0));
}
/** 날개 윤곽 (2D): 앞날개 + 뒷날개, 해진 가장자리와 구멍 */
float wingShape(vec2 q, float s) {
  // 앞날개: 끝이 뾰족한 길쭉한 삼각형, 뒷날개: 둥글다
  float fw = ellipse2(q, vec2(0.25, 0.05), vec2(0.28, 0.095), -0.28);
  fw = max(fw, -(q.y + 0.35 * (q.x - 0.05) - 0.16) * 0.0 - 1.0);
  float hw = ellipse2(q, vec2(0.15, -0.115), vec2(0.155, 0.12), 0.55);
  float d = smin(fw, hw, 0.02);
  // 해진 가장자리: 잔 톱니 + 몇 군데 찢긴 홈
  d += 0.008 * (fbm3(vec3(q * 30.0, s * 3.0)) - 0.5);
  float tear = sdEllipsoid(vec3(rot(0.4 * s) * (q - vec2(0.36, -0.03 + 0.02 * s)), 0.0), vec3(0.06, 0.012, 1.0));
  tear = min(tear, sdEllipsoid(vec3(rot(-0.9) * (q - vec2(0.22, -0.22)), 0.0), vec3(0.05, 0.01, 1.0)));
  if (s > 0.0) tear = min(tear, sdEllipsoid(vec3(rot(0.2) * (q - vec2(0.48, 0.12)), 0.0), vec3(0.04, 0.012, 1.0)));
  d = max(d, -tear);
  d = max(d, -q.x + 0.015);
  // 작은 벌레 먹은 구멍 몇 개
  float hole = smoothstep(0.84, 0.88, noise(vec3(q * 26.0, s * 7.0 + 1.0))) * 0.02;
  d = max(d, -(0.004 - hole));
  return d;
}

vec2 sdf(vec3 p) {
  vec3 q = mothSpace(p);
  float bound = length(q) - 0.75;
  if (bound > 0.2) return vec2(bound, 1.0);
  // ── 몸: 털 많은 가슴, 머리, 알이 차 부푼 배 (마디)
  float thorax = sdEllipsoid(q - vec3(0.0, 0.0, 0.0), vec3(0.075, 0.065, 0.09));
  float head = sdSphere(q - vec3(0.0, -0.01, 0.1), 0.048);
  float body = smin(thorax, head, 0.03);
  float abdomen = 1e5;
  for (int i = 0; i < 6; i++) {
    float t = float(i) / 5.0;
    vec3 c = vec3(0.0, -0.03 - t * 0.09 - t * t * 0.05, -0.1 - t * 0.2);
    float r = mix(0.07, 0.03, t * t) * (1.0 + 0.12 * sin(t * 3.1416));
    abdomen = smin(abdomen, sdEllipsoid(q - c, vec3(r, r * 0.95, 0.055)), 0.025);
  }
  body = smin(body, abdomen, 0.03);
  body += 0.006 * (fbm3(q * 60.0) - 0.5);
  vec2 r = vec2(body, 1.0);
  // 눈: 크고 검은 겹눈
  vec3 qa = vec3(abs(q.x), q.y, q.z);
  r = umin(r, vec2(sdSphere(qa - vec3(0.03, 0.0, 0.125), 0.024), 4.0));
  // ── 날개 둘
  float wings = 1e5;
  for (int k = 0; k < 2; k++) {
    float s = k == 0 ? -1.0 : 1.0;
    vec3 U;
    vec3 V;
    vec3 N;
    wingFrame(s, U, V, N);
    vec3 wq = q - vec3(s * 0.05, 0.02, 0.0);
    vec2 uv = vec2(dot(wq, U), dot(wq, V));
    float w = dot(wq, N);
    float camber = 0.05 * uv.x * uv.x - 0.012 * sin(uv.x * 9.0 + uv.y * 6.0);
    float plate = abs(w - camber) - 0.0045;
    wings = min(wings, max(plate, wingShape(uv, s)));
  }
  r = umin(r, vec2(wings * 0.8, 2.0));
  // ── 깃털 더듬이
  float ant = 1e5;
  for (int k = 0; k < 2; k++) {
    float s = k == 0 ? -1.0 : 1.0;
    vec3 a0 = vec3(s * 0.02, 0.03, 0.13);
    vec3 a1 = vec3(s * 0.08, 0.04, 0.22);
    vec3 a2 = vec3(s * 0.17, 0.03, 0.3);
    float sh = min(sdRoundCone(q, a0, a1, 0.006, 0.004), sdRoundCone(q, a1, a2, 0.004, 0.002));
    // 깃털 잎: 납작한 타원 + 결
    vec3 A = normalize(a2 - a0);
    vec3 Bn = normalize(cross(A, vec3(0.0, 1.0, 0.0)));
    vec3 Cn = cross(A, Bn);
    vec3 aq = q - mix(a0, a2, 0.58);
    float leaf = sdEllipsoid(vec3(dot(aq, A), dot(aq, Bn), dot(aq, Cn)), vec3(0.085, 0.024, 0.004));
    ant = min(ant, min(sh, leaf));
  }
  r = umin(r, vec2(ant, 3.0));
  // ── 늘어진 다리 여섯
  float legs = 1e5;
  for (int i = 0; i < 3; i++) {
    for (int k = 0; k < 2; k++) {
      float s = k == 0 ? -1.0 : 1.0;
      float zi = 0.04 - float(i) * 0.045;
      vec3 l0 = vec3(s * 0.04, -0.04, zi);
      vec3 l1 = vec3(s * 0.11, -0.1, zi + 0.03);
      vec3 l2 = vec3(s * 0.12, -0.24 - float(i) * 0.03, zi + 0.06);
      legs = min(legs, min(sdRoundCone(q, l0, l1, 0.009, 0.006), sdRoundCone(q, l1, l2, 0.006, 0.002)));
    }
  }
  r = umin(r, vec2(legs, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 q = mothSpace(p);
  if (id < 1.5) {
    // 잿빛 털: 가슴 위엔 해골 무늬
    float fur = 0.75 + 0.25 * noise(q * 240.0);
    vec3 alb = vec3(0.09, 0.08, 0.065) * fur;
    vec2 sk = vec2(q.x, q.z + 0.005);
    float skull = smoothstep(0.045, 0.035, length(sk * vec2(1.0, 0.85))) * step(0.03, q.y);
    float sock = smoothstep(0.013, 0.009, length(vec2(abs(sk.x) - 0.017, sk.y - 0.008))) * skull;
    float nose = smoothstep(0.006, 0.003, length(vec2(sk.x, sk.y + 0.012))) * skull;
    skull *= 0.55 + 0.45 * noise(q * 160.0);
    alb = mix(alb, vec3(0.19, 0.165, 0.12), skull);
    alb = mix(alb, vec3(0.02, 0.014, 0.01), max(sock, nose) * 0.85);
    // 배의 마디 띠
    float band = smoothstep(0.4, 0.9, sin(q.z * 100.0)) * step(q.z, -0.08);
    alb = mix(alb, vec3(0.04, 0.035, 0.03), band * 0.6);
    return Mat(alb, 0.95, 0.05, vec3(0.0), 0.0, 0.3, 0.0);
  }
  if (id < 2.5) {
    // 날개: 재를 뒤집어쓴 상아색, 검은 날개맥, 노려보는 눈알 무늬
    float s = q.x < 0.0 ? -1.0 : 1.0;
    vec3 U;
    vec3 V;
    vec3 N;
    wingFrame(s, U, V, N);
    vec3 wq = q - vec3(s * 0.05, 0.02, 0.0);
    vec2 uv = vec2(dot(wq, U), dot(wq, V));
    float ang = atan(uv.y, uv.x);
    float vein = smoothstep(0.025, 0.0, abs(sin(ang * 9.0 + uv.x * 3.0)) * length(uv) * 3.0) * smoothstep(0.03, 0.1, length(uv));
    float sd2 = wingShape(uv, s);
    float edge = smoothstep(-0.03, 0.0, sd2 + 0.02);
    float band = smoothstep(0.012, 0.0, abs(sd2 + 0.05 + 0.01 * sin(uv.x * 60.0 + uv.y * 40.0)));
    float dust = fbm(vec3(uv * 24.0, s));
    float speck = smoothstep(0.62, 0.75, noise(vec3(uv * 140.0, s)));
    vec3 alb = mix(vec3(0.26, 0.245, 0.215), vec3(0.14, 0.13, 0.11), smoothstep(0.35, 0.7, dust));
    alb = mix(alb, vec3(0.06, 0.05, 0.04), smoothstep(0.12, 0.0, length(uv)) * 0.8);
    alb = mix(alb, vec3(0.05, 0.042, 0.035), max(max(vein * 0.7, edge * 0.6), max(band * 0.6, speck * 0.5)));
    // 앞날개의 물결 띠
    float wave = smoothstep(0.015, 0.0, abs(uv.y - 0.02 - 0.03 * sin(uv.x * 20.0) - (uv.x - 0.3) * 0.2)) * step(0.15, uv.x);
    alb = mix(alb, vec3(0.06, 0.05, 0.04), wave * 0.8);
    // 뒷날개의 눈알 무늬
    vec2 e = uv - vec2(0.15, -0.12);
    float de = length(e * vec2(1.0, 1.2)) + 0.006 * (noise(vec3(uv * 60.0, s)) - 0.5);
    float ring = smoothstep(0.05, 0.044, de) - smoothstep(0.038, 0.032, de);
    float iris = smoothstep(0.033, 0.029, de) - smoothstep(0.019, 0.016, de);
    float pupil = smoothstep(0.018, 0.014, de * (1.0 + 0.6 * abs(e.x) / max(de, 0.001)));
    float glint = smoothstep(0.006, 0.003, length(e - vec2(0.007, 0.007)));
    alb = mix(alb, vec3(0.025, 0.02, 0.016), ring);
    alb = mix(alb, vec3(0.13, 0.085, 0.05), iris);
    alb = mix(alb, vec3(0.012, 0.008, 0.006), pupil);
    alb = mix(alb, vec3(0.24, 0.22, 0.19), glint);
    return Mat(alb * 1.15, 0.9, 0.12, vec3(0.0), 0.0, 0.85, 0.0);
  }
  if (id < 3.5) return Mat(vec3(0.07, 0.06, 0.05), 0.85, 0.1, vec3(0.0), 0.0, 0.3, 0.0);
  // 겹눈: 검고 번들거린다
  return Mat(vec3(0.015, 0.012, 0.01), 0.15, 1.5, vec3(0.0), 0.25, 0.0, 0.6);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 L1 = normalize(uKeyDir);
  vec3 bg = mix(vec3(0.0), uFogCol * 0.5, smoothstep(-0.3, 0.6, rd.y)) * 0.6;
  bg += uFogCol * 0.9 * pow(max(dot(rd, normalize(vec3(-L1.x, L1.y * 0.25, -L1.z))), 0.0), 5.0);
  return bg;
}

// 날개에서 떨어지는 날갯가루: 아래로 갈수록 퍼지고 옅어진다, 희미하게 반짝인다
vec4 volume(vec3 p) {
  vec3 q = p - C;
  float h = -q.y + 0.05;
  if (h < 0.0 || h > 1.0 || abs(q.x) > 0.8 || abs(q.z) > 0.6) return vec4(0.0);
  float spread = 0.25 + 0.35 * h;
  float mask = smoothstep(spread, spread * 0.3, length(q.xz * vec2(0.8, 1.4))) * smoothstep(0.0, 0.1, h) * smoothstep(1.0, 0.3, h);
  float n = fbm3(q * vec3(6.0, 3.0, 6.0) + vec3(0.0, uSeed, 0.0));
  float dens = mask * smoothstep(0.5, 0.78, n) * 1.2;
  if (dens < 0.001) return vec4(0.0);
  float spark = smoothstep(0.92, 0.97, noise(q * 90.0));
  vec3 col = vec3(0.35, 0.3, 0.22) * (0.5 + 0.5 * n) + vec3(1.2, 1.0, 0.6) * spark;
  if (uScene == 0) col *= 1.3;
  return vec4(col, dens);
}
`,
  };
}
