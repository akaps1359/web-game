// 썩은 갈매기 떼 (1층) — 안개 속에서 소용돌이치며 내리꽂히는 갈매기들. 잿빛 날개 끝은 검고, 깃털이 빠진
// 자리는 누더기처럼 뚫렸다. 맨 앞의 놈은 갈고리 부리를 벌려 울부짖으며 달려들고, 터진 옆구리로 갈비뼈가,
// 머리 한쪽으로는 두개골이 드러났다. 눈은 흐린 젖빛 노랑에 핏빛 눈테.
import { rng } from '../../lib.js';

/** 갈매기 국소 좌표(머리 +x) → 세계 */
function gullToWorld(g, [x, y, z]) {
  const [px, py, pz, s] = g.pos;
  let c = Math.cos(g.roll);
  let sn = Math.sin(g.roll);
  const y1 = c * y - sn * z;
  const z1 = sn * y + c * z;
  c = Math.cos(g.pitch);
  sn = Math.sin(g.pitch);
  const x2 = c * x - sn * y1;
  const y2 = sn * x + c * y1;
  c = Math.cos(g.yaw);
  sn = Math.sin(g.yaw);
  const x3 = c * x2 - sn * z1;
  const z3 = sn * x2 + c * z1;
  return [px + s * x3, py + s * y2, pz + s * z3];
}

export default function gulls({ seed = 1 } = {}) {
  const R = rng(seed * 733 + 3);
  const cam = [0.3, 0.9, 5.2];
  const list = [
    // 맨 앞: 카메라 쪽으로 내리꽂힌다
    { pos: [0.08, 1.2, 0.55, 1.55], yaw: Math.PI / 2 + 0.5, pitch: -0.42, roll: 0.22, flap: 0.12, open: 0.65 },
    { pos: [-0.72, 1.78, -0.45, 1.0], yaw: -0.25, pitch: 0.12, roll: -0.55, flap: 0.55, open: 0.3 },
    { pos: [0.78, 1.95, -0.6, 0.92], yaw: Math.PI + 0.35, pitch: -0.18, roll: 0.5, flap: 0.05, open: 0.45 },
    { pos: [-0.12, 2.4, -1.1, 0.8], yaw: 0.55, pitch: 0.25, roll: -0.35, flap: 0.85, open: 0.0 },
    { pos: [0.72, 0.85, -0.35, 0.85], yaw: Math.PI - 0.45, pitch: -0.3, roll: -0.6, flap: 0.4, open: 0.35 },
    { pos: [-0.85, 1.0, -0.75, 0.78], yaw: 0.35, pitch: -0.12, roll: 0.55, flap: 0.7, open: 0.15 },
  ];
  const uA = list.map((g) => g.pos);
  const uB = list.map((g) => [g.yaw, g.pitch, g.roll, g.flap + Math.floor(g.open * 100) * 10]);
  const eyes = [];
  const gaze = [];
  list.forEach((g, i) => {
    for (const side of [-1, 1]) {
      if (i === 0 && side === 1) continue; // 맨 앞 놈의 한쪽 눈은 빈 구멍
      const e = gullToWorld(g, [0.27, 0.068, side * 0.036]);
      eyes.push([...e, g.pos[3] * 0.013]);
      const d = [cam[0] - e[0], cam[1] - e[1], cam[2] - e[2]];
      const l = Math.hypot(...d);
      gaze.push([d[0] / l, d[1] / l, d[2] / l, 12]);
    }
  });
  const feathers = [];
  for (let i = 0; i < 6; i++) feathers.push([(R() - 0.5) * 2.0, 0.6 + R() * 1.9, (R() - 0.5) * 1.0, R() * 6.28]);
  return {
    preset: 'act1',
    cam: { pos: cam, target: [0.0, 1.5, 0.0], fov: 1.75 },
    light: { rim: 2.2, fillCol: [0.2, 0.14, 0.08], amb: [0.025, 0.032, 0.034], eyeEmit: 2.2, glow: 0.07 },
    frame: { fill: 0.92 },
    arrays: { uA, uB, uE: eyes, uG: gaze, uP: feathers },
    glsl: /* glsl */ `
#define NO_GROUND

/** 날개 한쪽 (국소: 뿌리 원점, 바깥 +z, 앞 +x). 반환 (거리, 재질) */
vec2 wing(vec3 w, float flap, float rotten) {
  float dih = mix(0.8, -0.35, flap);
  w.yz = rot(-dih) * w.yz;
  // 안쪽 날개: 앞전은 두툼하고 뒷전은 얇다
  float chord = 0.085 - 0.02 * smoothstep(0.0, 0.34, w.z);
  vec3 iw = w - vec3(-0.01, 0.0, 0.17);
  float inner = sdEllipsoid(iw, vec3(chord, 0.008 + 0.006 * smoothstep(-0.05, 0.05, w.x), 0.2));
  // 썩어 빠진 깃: 군데군데 뚫리고 뒷전이 들쭉날쭉하다
  float gap = smoothstep(0.62, 0.72, noise(vec3(w.z * 16.0, rotten * 9.0, 1.0)));
  float hole = smoothstep(0.66, 0.74, noise(vec3(w.x * 20.0, w.z * 14.0, rotten * 5.0)));
  inner = max(inner, -(w.x + 0.06 - 0.05 * gap));
  // 앞전의 뼈 (깃이 빠져 드러났다)
  float bone = sdRoundCone(w, vec3(0.04, 0.0, 0.0), vec3(0.035, 0.002, 0.35), 0.011, 0.007);
  // 바깥 날개: 손목에서 꺾여 뒤로 젖혀진 칼날 모양 (끝이 검다)
  vec3 o = w - vec3(0.025, 0.0, 0.35);
  float bend2 = mix(-0.25, 0.55, flap);
  o.yz = rot(bend2) * o.yz;
  o.xz = rot(0.45) * o.xz;
  float taper = clamp(o.z / 0.34, 0.0, 1.0);
  float outer = sdEllipsoid(o - vec3(-0.025, 0.0, 0.16), vec3(0.06 * (1.0 - taper * 0.75) + 0.008, 0.007, 0.18));
  float notch = smoothstep(0.6, 0.7, noise(vec3(o.z * 22.0, rotten * 3.0, 4.0)));
  outer = max(outer, -(o.x + 0.045 - 0.04 * notch));
  bone = min(bone, sdRoundCone(o, vec3(0.0), vec3(0.01, 0.0, 0.12), 0.008, 0.005));
  vec2 r = vec2(min(inner, outer), 1.0);
  r = umin(r, vec2(bone, 3.0));
  return r;
}

vec2 gull(vec3 q, float flap, float open, float hero) {
  float body = sdEllipsoid(q - vec3(0.0, 0.0, 0.0), vec3(0.22, 0.085, 0.088));
  body = smin(body, sdEllipsoid(q - vec3(-0.21, 0.012, 0.0), vec3(0.12, 0.018, 0.06)), 0.04);
  // 길쭉한 머리, 납작한 이마
  vec3 hq = q - vec3(0.24, 0.055, 0.0);
  float head = sdEllipsoid(hq, vec3(0.075, 0.052, 0.048));
  head = smin(head, sdEllipsoid(hq - vec3(-0.01, 0.022, 0.0), vec3(0.05, 0.02, 0.036)), 0.02);
  body = smin(body, head, 0.05);
  float hole = 1e5;
  if (hero > 0.5) {
    // 터진 옆구리, 빈 눈구멍, 드러난 두개골
    hole = sdEllipsoid(q - vec3(-0.02, -0.01, 0.083), vec3(0.08, 0.05, 0.04));
    body = smax(body, -hole, 0.015);
    body = smax(body, -sdSphere(hq - vec3(0.03, 0.013, 0.042), 0.016), 0.006);
  }
  if (body < 0.03) body += 0.006 * (fbm3(q * vec3(40.0, 18.0, 40.0)) - 0.5) - 0.006 * smoothstep(0.62, 0.75, noise(q * 14.0));
  vec2 r = vec2(body, 1.0);
  if (hero > 0.5) {
    float ribs = 1e5;
    for (int i = 0; i < 5; i++) {
      float x = -0.08 + float(i) * 0.03;
      ribs = min(ribs, sdCapsule(q, vec3(x, 0.03, 0.058), vec3(x - 0.012, -0.045, 0.07), 0.005));
    }
    r = umin(r, vec2(ribs, 3.0));
    r = umin(r, vec2(hole + 0.012, 99.0));
  }
  // 갈고리 부리 (벌어졌다)
  float beak = sdRoundCone(q, vec3(0.3, 0.052, 0.0), vec3(0.41, 0.038, 0.0), 0.02, 0.009);
  beak = smin(beak, sdRoundCone(q, vec3(0.41, 0.038, 0.0), vec3(0.428, 0.012, 0.0), 0.009, 0.003), 0.01);
  vec3 jq = q - vec3(0.3, 0.036, 0.0);
  jq.xy = rot(-open * 0.55) * jq.xy;
  beak = min(beak, sdRoundCone(jq, vec3(0.0), vec3(0.11, -0.004, 0.0), 0.015, 0.006));
  // 아래 부리의 붉은 점 자리 (각진 턱)
  beak = smin(beak, sdSphere(jq - vec3(0.085, -0.006, 0.0), 0.009), 0.006);
  r = umin(r, vec2(beak, 2.0));
  r = umin(r, vec2(sdRoundCone(q - vec3(0.3, 0.04, 0.0), vec3(0.0), vec3(0.08, -0.012 - open * 0.03, 0.0), 0.006 + open * 0.009, 0.003), 99.0));
  // 날개 둘
  vec3 w = q - vec3(0.03, 0.045, 0.0);
  float side = sign(w.z);
  w.z = abs(w.z) - 0.065;
  r = umin(r, wing(w, flap, hero + (side > 0.0 ? 0.6 : 0.0)));
  // 늘어진 물갈퀴 발
  vec3 fq = vec3(q.x, q.y, abs(q.z));
  float feet = sdRoundCone(fq, vec3(-0.08, -0.06, 0.03), vec3(-0.17, -0.12, 0.04), 0.008, 0.005);
  feet = min(feet, sdEllipsoid(fq - vec3(-0.19, -0.125, 0.04), vec3(0.03, 0.004, 0.022)));
  r = umin(r, vec2(feet, 4.0));
  return r;
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 1.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uAN) break;
    vec4 a = uA[i];
    vec4 o = uB[i];
    vec3 q = p - a.xyz;
    float bound = length(q) - 0.9 * a.w;
    if (bound > r.x) continue;
    q.xz = rot(o.x) * q.xz;
    q.xy = rot(o.y) * q.xy;
    q.yz = rot(o.z) * q.yz;
    float flap = fract(o.w);
    float open = floor(o.w / 10.0) / 100.0;
    vec2 h = gull(q / a.w, flap, open, i == 0 ? 1.0 : 0.0);
    h.x *= a.w;
    r = umin(r, h);
  }
  for (int i = 0; i < 6; i++) {
    vec4 f = uP[i];
    vec3 q = p - f.xyz;
    if (length(q) > 0.15) { r = umin(r, vec2(length(q) - 0.1, 1.0)); continue; }
    q.xz = rot(f.w) * q.xz;
    q.xy = rot(f.w * 1.7) * q.xy;
    r = umin(r, vec2(sdEllipsoid(q, vec3(0.06, 0.004, 0.016)), 1.0));
  }
  return r;
}

/** 깃털 색: 머리·배는 때 묻은 흰색, 등·날개는 잿빛, 날개 끝은 검다 */
vec3 plumage(vec3 p) {
  // 가장 가까운 새를 찾아 국소 좌표로
  vec3 best = vec3(0.0);
  float bd = 1e5;
  for (int i = 0; i < 8; i++) {
    if (i >= uAN) break;
    vec4 a = uA[i];
    vec4 o = uB[i];
    vec3 q = p - a.xyz;
    float d = length(q) / a.w;
    if (d < bd) {
      bd = d;
      q.xz = rot(o.x) * q.xz;
      q.xy = rot(o.y) * q.xy;
      q.yz = rot(o.z) * q.yz;
      best = q / a.w;
    }
  }
  vec3 q = best;
  float span = abs(q.z);
  float wingTip = smoothstep(0.42, 0.52, span);
  float back = smoothstep(0.0, 0.03, q.y - 0.02) * (1.0 - smoothstep(0.2, 0.3, q.x)) + smoothstep(0.1, 0.2, span);
  vec3 white = vec3(0.13, 0.13, 0.122);
  vec3 grey = vec3(0.05, 0.053, 0.056);
  vec3 c = mix(white, grey, clamp(back, 0.0, 1.0));
  c = mix(c, vec3(0.012, 0.012, 0.013), wingTip);
  return c;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    float grime = fbm3(p * 6.0);
    float rot_ = smoothstep(0.62, 0.76, fbm3(p * 11.0 + 5.0));
    vec3 alb = plumage(p) * (0.6 + 0.5 * grime);
    alb = mix(alb, vec3(0.07, 0.025, 0.02), rot_);
    float barb = 0.85 + 0.15 * noise(p * vec3(300.0, 40.0, 300.0));
    return Mat(alb * barb, 0.75, 0.2, vec3(0.0), 0.0, 0.3, 0.15 + rot_ * 0.5);
  }
  // 누런 부리 (아래 부리 끝에 핏빛 점)
  if (id < 2.5) return Mat(vec3(0.17, 0.13, 0.04), 0.35, 0.7, vec3(0.0), 0.0, 0.1, 0.3);
  if (id < 3.5) return Mat(vec3(0.19, 0.16, 0.12) * (0.7 + 0.4 * fbm3(p * 30.0)), 0.5, 0.5, vec3(0.0), 0.0, 0.2, 0.3);
  return Mat(vec3(0.07, 0.05, 0.04), 0.5, 0.4, vec3(0.0), 0.0, 0.3, 0.3);
}
`,
  };
}
