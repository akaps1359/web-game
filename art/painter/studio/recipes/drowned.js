// 익사체 (1층) — 물에 불어 터질 듯한 시체가 비틀린 채 일어섰다. 꺾인 목에 머리가 옆으로 늘어지고,
// 젖은 머리카락이 장막처럼 얼굴을 덮었다. 턱이 빠진 입에서 검은 물이 흘러내린다. 한 팔은 앞으로 뻗어 움켜쥐려 하고
// 다른 팔은 빠진 어깨에 매달려 축 늘어졌다. 잿빛 녹색 살갗엔 검푸른 부패 핏줄, 어깨엔 따개비, 몸엔 해초.
import { rng } from '../../lib.js';

const K_BEND = 0.55;
const K_LEAN = -0.25;
const bend = (y) => K_BEND * Math.max(y - 0.85, 0) ** 2;
const lean = (y) => K_LEAN * Math.max(y - 0.85, 0) ** 2;
const H = [-0.2, 1.47, 0.32];
const ROLL = 0.55;
const PITCH = 0.42;
/** 머리 국소 좌표 → 세계 좌표 */
function headToWorld([x, y, z]) {
  let c = Math.cos(PITCH);
  let s = Math.sin(PITCH);
  const y1 = c * y - s * z;
  const z1 = s * y + c * z;
  c = Math.cos(ROLL);
  s = Math.sin(ROLL);
  return [H[0] + c * x - s * y1, H[1] + s * x + c * y1, H[2] + z1];
}

export default function drowned({ seed = 1 } = {}) {
  const R = rng(seed * 131 + 17);
  const cam = [1.0, 0.8, 4.5];
  const chains = [];
  // 해초: 왼쪽 어깨에 걸쳐 앞뒤로 늘어진 띠
  for (let i = 0; i < 2; i++) {
    const top = [-0.3 + i * 0.07 + lean(1.38), 1.4 + R() * 0.03, bend(1.38) + (i === 0 ? 0.04 : -0.05)];
    const N = 8;
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      chains.push([
        top[0] - 0.04 * t + Math.sin(t * 6 + i * 2) * 0.02,
        top[1] - t * (0.5 + i * 0.15),
        top[2] + (i === 0 ? 1 : -1) * (0.1 * Math.sin(t * 1.6) + 0.03),
        0.015 * (1 - t * 0.5),
      ]);
    }
    chains.push([0, 0, 0, 0]);
  }
  const weedEnd = chains.length;
  // 입에서 흘러내리는 검은 물
  const mouth = headToWorld([0.0, -0.125, 0.09]);
  for (let k = 0; k < 8; k++) {
    const t = k / 7;
    chains.push([mouth[0] + 0.015 * Math.sin(t * 3), mouth[1] - t * 0.36, mouth[2] + 0.02 * t - 0.06 * t * t, 0.011 * (1 - t * 0.5) + 0.003]);
  }
  chains.push([0, 0, 0, 0]);
  const waterEnd = chains.length;

  const eyeA = headToWorld([0.04, 0.0, 0.098]);
  const look = (e) => {
    const g = [cam[0] - e[0] + 0.2, cam[1] - e[1] - 0.3, cam[2] - e[2]];
    const l = Math.hypot(...g);
    return g.map((v) => v / l);
  };

  return {
    preset: 'act1',
    cam: { pos: cam, target: [-0.02, 0.92, 0.12], fov: 1.85 },
    light: { rim: 2.1, fillCol: [0.2, 0.15, 0.09], amb: [0.024, 0.032, 0.034], eyeEmit: 1.0, glow: 0.05 },
    frame: { fill: 0.92 },
    arrays: {
      uB: chains,
      uE: [[...eyeA, 0.012]],
      uG: [[...look(eyeA), 12]],
      uP: [[0, weedEnd, waterEnd, 0]],
    },
    glsl: /* glsl */ `
const vec3 H = vec3(${H.join(', ')});
const float ROLL = ${ROLL};
const float PITCH = ${PITCH};

float bendZ(float y) { float h = max(y - 0.85, 0.0); return ${K_BEND} * h * h; }
float leanX(float y) { float h = max(y - 0.85, 0.0); return ${K_LEAN} * h * h; }
vec3 toBody(vec3 p) { return vec3(p.x - leanX(p.y), p.y, p.z - bendZ(p.y)); }
vec3 toHead(vec3 p) {
  vec3 q = p - H;
  q.xy = rot(ROLL) * q.xy;
  q.yz = rot(PITCH) * q.yz;
  return q;
}

float chainRange(vec3 p, int i0, int i1, float k) {
  float d = 1e5;
  for (int i = 0; i < 159; i++) {
    if (i < i0) continue;
    if (i + 1 >= i1 || i + 1 >= uBN) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), k);
  }
  return d;
}

/** 젖은 머리카락 장막: 두피에서 곧게 늘어진 가닥들 (각도 반복) */
float hairCurtain(vec3 p) {
  vec3 d = p - (H + vec3(0.0, 0.02, 0.0));
  float top = 0.13;
  if (d.y > top + 0.02 || d.y < -0.5 || length(d.xz) > 0.25) return 1e5;
  float N = 96.0;
  float a = atan(d.z, d.x);
  float cell = floor(a / 6.28318 * N + 0.5);
  float res = 1e5;
  for (int k = -1; k <= 1; k++) {
    float c = cell + float(k);
    float h1 = fract(sin(c * 127.1) * 43758.5);
    float h2 = fract(sin(c * 311.7) * 24634.6);
    // 가닥은 이웃과 엉겨 뭉친다
    float ac = (c + 0.45 * sin(c * 1.7) + 0.3 * sin(c * 0.53)) / N * 6.28318;
    // 높이에 따른 반지름: 두피 위는 머리 곡면을 따르고, 아래는 곧게 떨어진다
    float y = d.y;
    float rs = 0.118;
    float rad = y > 0.0 ? sqrt(max(rs * rs - y * y * 0.9, 0.0004)) + 0.01 : rs + 0.01 + 0.035 * (-y) * (0.3 + h1) + 0.006 * sin(c * 2.3);
    float sway = (0.014 * sin(y * 11.0 + c * 1.3) + 0.006 * sin(y * 27.0 + c)) * smoothstep(0.0, -0.2, y);
    vec2 cen = vec2(cos(ac), sin(ac)) * rad + vec2(-sin(ac), cos(ac)) * sway;
    float len = 0.22 + 0.3 * h2 * h2;
    float th = 0.0042 * mix(1.0, 0.35, smoothstep(0.0, -len, y));
    float s = length(d.xz - cen) - th;
    s = max(s, -(y + len));
    res = min(res, s);
  }
  return max(res * 0.8, d.y - top);
}

/** 길고 마른 손가락이 벌어진 손 */
float hand(vec3 p, vec3 c, vec3 dir, vec3 spread, float len) {
  float d = sdEllipsoid(p - c, vec3(0.048, 0.042, 0.048));
  for (int i = 0; i < 4; i++) {
    float o = float(i) - 1.5;
    vec3 a = c + dir * 0.03 + spread * o * 0.021;
    vec3 m = a + dir * len * 0.55 + spread * o * 0.018 - vec3(0.0, 0.012, 0.0);
    vec3 e = m + normalize(dir - vec3(0.0, 0.6, 0.0)) * len * 0.5 + spread * o * 0.012;
    d = smin(d, sdRoundCone(p, a, m, 0.013, 0.01), 0.014);
    d = smin(d, sdRoundCone(p, m, e, 0.01, 0.005), 0.007);
  }
  vec3 ta = c - spread * 0.04;
  d = smin(d, sdRoundCone(p, ta, ta - spread * 0.05 + dir * 0.06, 0.014, 0.008), 0.014);
  return d;
}

vec2 sdf(vec3 p) {
  vec3 b = toBody(p);
  // ── 몸통: 물에 불어 부푼 배, 처진 가슴
  float body = sdEllipsoid(b - vec3(0.0, 0.93, 0.0), vec3(0.19, 0.14, 0.14));
  body = smin(body, sdEllipsoid(b - vec3(0.0, 1.11, 0.06), vec3(0.22, 0.21, 0.2)), 0.1);
  body = smin(body, sdEllipsoid(b - vec3(0.0, 1.32, 0.0), vec3(0.235, 0.16, 0.145)), 0.1);
  body = smin(body, sdSphere(b - vec3(0.24, 1.36, 0.0), 0.08), 0.08);
  body = smin(body, sdSphere(b - vec3(-0.25, 1.28, -0.01), 0.075), 0.08);
  // 꺾인 목
  body = smin(body, sdRoundCone(p, vec3(-0.05, 1.38, 0.13), H + vec3(0.06, -0.07, -0.05), 0.08, 0.062), 0.06);

  // ── 팔: 앞으로 뻗은 팔 / 빠진 어깨에 매달린 팔
  vec3 sR = vec3(0.2, 1.38, 0.14);
  vec3 eR = vec3(0.34, 1.16, 0.4);
  vec3 wR = vec3(0.33, 1.1, 0.66);
  body = smin(body, sdRoundCone(p, sR, eR, 0.072, 0.055), 0.05);
  body = smin(body, sdRoundCone(p, eR, wR, 0.055, 0.04), 0.03);
  vec3 sL = vec3(-0.33, 1.24, 0.1);
  vec3 eL = vec3(-0.4, 0.9, 0.14);
  vec3 wL = vec3(-0.39, 0.6, 0.19);
  body = smin(body, sdRoundCone(p, sL, eL, 0.068, 0.052), 0.04);
  body = smin(body, sdRoundCone(p, eL, wL, 0.052, 0.038), 0.03);
  float hb = min(length(p - wR), length(p - wL)) - 0.25;
  if (hb < 0.02) {
    body = smin(body, hand(p, wR + vec3(0.0, -0.01, 0.04), normalize(vec3(0.05, -0.1, 1.0)), vec3(1.0, 0.15, 0.0), 0.16), 0.03);
    body = smin(body, hand(p, wL + vec3(0.0, -0.04, 0.0), vec3(0.05, -1.0, 0.12), vec3(0.0, 0.0, 1.0), 0.15), 0.03);
  }

  // ── 다리: 무릎이 꺾였고, 한쪽은 뒤로 끌린다 (맨발)
  float legs = sdRoundCone(p, vec3(-0.11, 0.9, 0.0), vec3(-0.17, 0.5, 0.17), 0.11, 0.08);
  legs = min(legs, sdRoundCone(p, vec3(-0.17, 0.5, 0.17), vec3(-0.17, 0.09, 0.07), 0.08, 0.052));
  legs = min(legs, sdRoundCone(p, vec3(0.12, 0.9, 0.0), vec3(0.18, 0.47, 0.03), 0.11, 0.08));
  legs = min(legs, sdRoundCone(p, vec3(0.18, 0.47, 0.03), vec3(0.22, 0.13, -0.24), 0.08, 0.052));
  legs = min(legs, sdEllipsoid(p - vec3(-0.17, 0.04, 0.14), vec3(0.058, 0.042, 0.115)));
  legs = min(legs, sdRoundCone(p, vec3(0.22, 0.13, -0.24), vec3(0.23, 0.025, -0.13), 0.048, 0.032));
  body = smin(body, legs, 0.07);

  // ── 머리: 부푼 얼굴, 턱이 빠져 벌어진 입
  vec3 hq = toHead(p);
  if (length(hq) < 0.3) {
    float skull = sdEllipsoid(hq, vec3(0.1, 0.12, 0.11));
    float cheeks = sdEllipsoid(vec3(abs(hq.x), hq.y, hq.z) - vec3(0.048, -0.05, 0.06), vec3(0.052, 0.056, 0.048));
    float nose = sdRoundCone(hq, vec3(0.0, 0.0, 0.095), vec3(0.0, -0.035, 0.118), 0.017, 0.019);
    float head = smin(skull, cheeks, 0.04);
    head = smin(head, nose, 0.02);
    vec3 jq = hq - vec3(0.0, -0.075, 0.0);
    jq.yz = rot(0.6) * jq.yz;
    float jaw = sdEllipsoid(jq - vec3(0.0, -0.035, 0.05), vec3(0.072, 0.034, 0.068));
    head = smin(head, jaw, 0.03);
    float mouth = sdEllipsoid(hq - vec3(0.0, -0.115, 0.085), vec3(0.038, 0.058, 0.05));
    head = smax(head, -mouth, 0.015);
    float sockets = sdSphere(vec3(abs(hq.x), hq.y, hq.z) - vec3(0.042, 0.004, 0.098), 0.026);
    head = smax(head, -sockets, 0.012);
    body = smin(body, head, 0.03);
  }
  // 불어 터진 살갗의 주름
  if (body < 0.04) body += 0.004 * (fbm3(p * 24.0) - 0.5) - 0.003 * smoothstep(0.1, 0.0, ridge(p * 9.0));
  vec2 r = vec2(body, 1.0);
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.11, 0.07), vec3(0.03, 0.05, 0.04)), 99.0));

  // ── 머리카락 장막
  r = umin(r, vec2(hairCurtain(p), 3.0));

  // ── 따개비: 오른쪽 어깨에 들러붙은 껍데기
  vec3 bc = vec3(0.23, 1.44, 0.17);
  if (length(p - bc) < 0.2) {
    float bar = 1e5;
    for (int i = 0; i < 10; i++) {
      float fi = float(i);
      vec3 o = vec3(sin(fi * 2.4) * 0.07, cos(fi * 1.7) * 0.04, sin(fi * 3.1) * 0.05) * (0.4 + 0.6 * fract(fi * 0.37));
      vec3 c = bc + o;
      vec3 nn = normalize(c - vec3(0.19, 1.33, 0.12));
      float s = 0.015 + 0.01 * fract(fi * 0.61);
      float cone = sdRoundCone(p, c - nn * s, c + nn * s * 0.6, s, s * 0.55);
      cone = max(cone, -sdSphere(p - c - nn * s * 0.9, s * 0.45));
      bar = min(bar, cone);
    }
    r = umin(r, vec2(bar, 5.0));
  }

  // ── 해초, 검은 물
  int i1 = int(uP[0].y + 0.5);
  int i2 = int(uP[0].z + 0.5);
  r = umin(r, vec2(chainRange(p, 0, i1, 0.01), 4.0));
  if (length(p - H) < 0.7) r = umin(r, vec2(chainRange(p, i1, i2, 0.02), 6.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    vec3 b = toBody(p);
    // 넝마: 셔츠 (몸통, 앞섶이 찢겨 벌어졌다) + 바지 (무릎 아래는 해졌다)
    float torn = smoothstep(0.53, 0.6, fbm3(p * 6.0 + 4.0));
    float shirt = step(0.98 + 0.08 * fbm3(p * 9.0), b.y) * step(b.y, 1.44) * step(abs(b.x), 0.29 + 0.04 * noise(p * 20.0));
    shirt *= 1.0 - step(abs(b.x - 0.02), 0.05 + 0.08 * smoothstep(1.4, 1.05, b.y)) * step(0.05, b.z);
    float pants = step(0.5 + 0.14 * fbm3(p * 8.0), p.y) * step(p.y, 1.0) * step(0.0, 0.3 - abs(p.x));
    float cloth = max(shirt, pants) * (1.0 - torn);
    // 부패한 살갗: 잿빛 녹색 위로 검푸른 핏줄 (대리석 무늬)
    float vein = smoothstep(0.09, 0.0, ridge(p * 7.0)) * smoothstep(0.35, 0.65, noise(p * 2.5));
    float mott = fbm3(p * 5.0);
    vec3 skin = mix(vec3(0.07, 0.082, 0.07), vec3(0.042, 0.05, 0.04), mott);
    skin = mix(skin, vec3(0.015, 0.035, 0.035), vein * 0.85);
    vec3 rag = vec3(0.024, 0.027, 0.027) * (0.5 + 0.8 * fbm3(p * 7.0));
    if (cloth > 0.5) return Mat(rag, 0.75, 0.25, vec3(0.0), 0.0, 0.0, 0.35);
    return Mat(skin, 0.6, 0.3, vec3(0.0), 0.03, 0.2, 0.25);
  }
  if (id < 3.5) return Mat(vec3(0.008, 0.009, 0.009), 0.5, 0.5, vec3(0.0), 0.0, 0.0, 0.35);
  if (id < 4.5) {
    float s = fbm3(p * 18.0);
    return Mat(mix(vec3(0.02, 0.03, 0.01), vec3(0.045, 0.045, 0.012), s), 0.35, 0.9, vec3(0.0), 0.1, 0.4, 0.9);
  }
  if (id < 5.5) return Mat(vec3(0.13, 0.125, 0.11) * (0.6 + 0.5 * fbm3(p * 40.0)), 0.9, 0.15, vec3(0.0), 0.0, 0.0, 0.2);
  // 검은 물
  return Mat(vec3(0.003, 0.005, 0.005), 0.05, 1.6, vec3(0.0), 0.15, 0.0, 1.0);
}
`,
  };
}
