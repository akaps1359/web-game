// 등명기 (1층, 등대지기의 하수인) — 등대 꼭대기의 프레넬 렌즈 등명기가 스스로 서 있다.
// 놋쇠 틀에 층층이 박힌 유리 프리즘 고리(반투명), 그 너머 렌즈 한가운데서 타오르는 심지는 금빛 홍채에
// 세로로 찢어진 동공을 가진 거대한 눈이 되어 이쪽을 노려본다. 녹청 슨 놋쇠, 짐승 발톱 모양 주철 받침,
// 빛에 홀려 맴도는 나방들.
import { rng } from '../../lib.js';

export default function lamp({ seed = 1 } = {}) {
  const R = rng(seed * 59 + 11);
  const core = [0.0, 0.86, 0.0];
  const cam = [0.55, 0.62, 3.7];
  const moths = [];
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.5 + R() * 0.25;
    moths.push([Math.cos(a) * rr, 0.6 + R() * 0.75, Math.sin(a) * rr * 0.8 + 0.1, R() * 6.28]);
  }
  // 눈이 카메라를 본다
  const g = [cam[0] - core[0], cam[1] - core[1], cam[2] - core[2]];
  const gl = Math.hypot(...g);
  return {
    preset: 'act1',
    cam: { pos: cam, target: [0.0, 0.78, 0.0], fov: 1.75 },
    light: { pt: [core[0], core[1], core[2] + 0.05], ptCol: [0.85, 0.52, 0.2], rim: 1.8, fillCol: [0.2, 0.14, 0.08], amb: [0.022, 0.028, 0.03], glow: 0.05 },
    frame: { fill: 0.9 },
    arrays: {
      uL: [[core[0], core[1], core[2] + 0.04, 0.2]],
      uLC: [[1.0, 0.72, 0.3, 0.16]],
      uP: [...moths, [g[0] / gl, g[1] / gl, g[2] / gl, 0]],
    },
    glsl: /* glsl */ `
#define HAS_OVERLAY
const vec3 CORE = vec3(${core.join(', ')});
const vec3 LENS = vec3(0.34, 0.47, 0.34);
const float CAGE = 1.03;

vec2 sdf(vec3 p) {
  vec3 q = p - CORE;
  // ── 놋쇠 틀: 렌즈 겉면을 따라가는 세로 살 8개 + 가로 테
  float shell = sdEllipsoid(q, LENS + 0.012);
  vec3 qf = q;
  qf.xz = rot(CAGE) * qf.xz;
  vec3 pr = polarRep(qf, 8.0);
  float ribs = max(abs(shell) - 0.016, abs(pr.z) - 0.013);
  ribs = max(ribs, abs(q.y) - 0.44);
  float hoops = 1e5;
  for (int i = 0; i < 4; i++) {
    float y = i == 0 ? -0.12 : i == 1 ? 0.12 : i == 2 ? -0.36 : 0.36;
    float rr = i < 2 ? 0.338 : 0.235;
    hoops = min(hoops, sdTorus(q - vec3(0.0, y, 0.0), vec2(rr, 0.015)));
  }
  float frame = min(ribs, hoops);
  // 꼭대기: 환기 돔과 꼭지 공
  float dome = sdEllipsoid(q - vec3(0.0, 0.45, 0.0), vec3(0.24, 0.11, 0.24));
  dome = max(dome, -(q.y - 0.43));
  dome = min(dome, sdCappedCone(q - vec3(0.0, 0.59, 0.0), 0.05, 0.07, 0.045));
  dome = min(dome, sdSphere(q - vec3(0.0, 0.68, 0.0), 0.05));
  dome = min(dome, sdTorus((q - vec3(0.0, 0.75, 0.0)).xzy, vec2(0.045, 0.01)));
  frame = min(frame, dome);
  frame = min(frame, sdCappedCone(q - vec3(0.0, -0.47, 0.0), 0.05, 0.25, 0.21));
  if (frame < 0.03) frame += 0.002 * (noise(p * 60.0) - 0.5);
  vec2 r = vec2(frame, 2.0);

  // ── 주철 받침: 짐승 발톱 셋
  float ped = sdCappedCone(p - vec3(0.0, 0.25, 0.0), 0.15, 0.13, 0.09);
  ped = smin(ped, sdTorus(p - vec3(0.0, 0.12, 0.0), vec2(0.13, 0.03)), 0.04);
  vec3 lq = polarRep(p, 3.0);
  float leg = sdRoundCone(lq, vec3(0.1, 0.18, 0.0), vec3(0.3, 0.06, 0.0), 0.05, 0.035);
  leg = smin(leg, sdRoundCone(lq, vec3(0.3, 0.06, 0.0), vec3(0.36, 0.025, 0.0), 0.035, 0.03), 0.02);
  for (int i = 0; i < 3; i++) {
    float o = (float(i) - 1.0) * 0.03;
    leg = smin(leg, sdRoundCone(lq, vec3(0.36, 0.03, o), vec3(0.43, 0.006, o * 1.6), 0.016, 0.004), 0.01);
  }
  ped = smin(ped, leg, 0.05);
  if (ped < 0.03) ped += 0.004 * (fbm3(p * 20.0) - 0.5);
  r = umin(r, vec2(ped, 3.0));

  // ── 심지: 렌즈 속에서 타는 눈 (안쪽 받침 위)
  r = umin(r, vec2(sdSphere(q, 0.15), 4.0));
  r = umin(r, vec2(sdCappedCone(q - vec3(0.0, -0.25, 0.0), 0.12, 0.035, 0.06), 3.0));

  // ── 빛에 홀린 나방
  for (int i = 0; i < 5; i++) {
    vec4 m = uP[i];
    vec3 mq = p - m.xyz;
    if (length(mq) > 0.08) { r = umin(r, vec2(length(mq) - 0.05, 5.0)); continue; }
    mq.xz = rot(m.w) * mq.xz;
    float mb = sdEllipsoid(mq, vec3(0.018, 0.006, 0.006));
    vec3 wq = vec3(mq.x, mq.y, abs(mq.z)) - vec3(-0.004, 0.006, 0.02);
    wq.yz = rot(-0.5 + 0.4 * sin(m.w * 3.0)) * wq.yz;
    float mw = sdEllipsoid(wq, vec3(0.014, 0.0015, 0.02));
    r = umin(r, vec2(min(mb, mw), 5.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 q = p - CORE;
  if (id < 2.5) {
    // 녹청 슨 놋쇠
    float verd = smoothstep(0.5, 0.75, fbm3(p * 9.0));
    vec3 alb = mix(vec3(0.085, 0.058, 0.022), vec3(0.022, 0.05, 0.038), verd);
    return Mat(alb, mix(0.32, 0.8, verd), mix(1.2, 0.2, verd), vec3(0.0), 0.0, 0.0, 0.3);
  }
  if (id < 3.5) {
    float rust = fbm3(p * 12.0);
    return Mat(mix(vec3(0.018, 0.017, 0.016), vec3(0.05, 0.024, 0.012), rust), 0.6, 0.5, vec3(0.0), 0.0, 0.0, 0.3);
  }
  if (id < 4.5) {
    // 타는 눈: 금빛 홍채의 섬유, 세로로 찢어진 검은 동공, 핏빛 가장자리
    vec3 g = normalize(uP[5].xyz);
    vec3 d = normalize(q);
    float a = acos(clamp(dot(d, g), -1.0, 1.0));
    vec3 up = normalize(vec3(0.0, 1.0, 0.0) - g * g.y);
    vec3 side = cross(g, up);
    float u = dot(d, side);
    float v = dot(d, up);
    float iris = smoothstep(0.98, 0.9, a);
    float limbus = smoothstep(0.7, 0.9, a) * iris;
    float fib = 0.45 + 0.55 * noise(vec3(atan(v, u) * 9.0, a * 26.0, 3.0));
    float slit = smoothstep(0.11, 0.06, abs(u) * (1.0 + 0.6 * abs(v))) * step(a, 0.8);
    vec3 col = mix(vec3(0.8, 0.3, 0.05), vec3(1.6, 1.0, 0.32), smoothstep(0.75, 0.15, a)) * fib;
    col *= 1.0 - limbus * 0.75;
    col = mix(vec3(0.35, 0.03, 0.01) * (0.5 + noise(d * 30.0)), col, iris);
    col *= 1.0 - slit * 0.99;
    return Mat(vec3(0.0), 0.2, 0.6, col, 0.0, 0.0, 0.4);
  }
  return Mat(vec3(0.04, 0.032, 0.025), 0.8, 0.1, vec3(0.0), 0.0, 0.5, 0.0);
}

// 유리 렌즈: 반투명 껍데기에 프리즘 고리마다 빛이 맺힌다 (광선-타원체 교차)
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 o = (ro - CORE) / LENS;
  vec3 d = rd / LENS;
  float a = dot(d, d);
  float b = dot(o, d);
  float c = dot(o, o) - 1.0;
  float h = b * b - a * c;
  if (h < 0.0) return vec4(0.0);
  h = sqrt(h);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 2; i++) {
    float t = i == 0 ? (-b - h) / a : (-b + h) / a;
    if (t < 0.0 || t > tHit) continue;
    vec3 P = ro + rd * t;
    vec3 q = P - CORE;
    if (abs(q.y) > 0.42) continue;
    vec3 n = normalize(q / (LENS * LENS));
    float band = smoothstep(0.125, 0.105, abs(q.y));
    float ring = pow(0.5 + 0.5 * sin(q.y * 95.0 + 1.2), 5.0) * (1.0 - band);
    vec3 qb = q;
    qb.xz = rot(CAGE + 0.3927) * qb.xz;
    vec3 pr = polarRep(qb, 8.0);
    float bull = pow(0.5 + 0.5 * sin(length(vec2(pr.z, q.y)) * 150.0), 4.0) * band;
    float pat = max(ring, bull);
    // 심지의 빛이 렌즈를 지나 이쪽으로 모인다
    float toward = pow(max(dot(normalize(q), -rd), 0.0), 3.0);
    float graze = pow(1.0 - abs(dot(n, rd)), 3.0);
    vec3 L1 = normalize(uKeyDir);
    float glint = pow(max(dot(reflect(rd, n), L1), 0.0), 40.0);
    vec3 col = vec3(1.0, 0.62, 0.22) * (0.04 + 0.4 * pat) * (0.3 + 0.4 * toward) + uRimCol * (graze * 0.12 + glint * 0.6);
    float k = (i == 0 ? 1.0 : 0.55);
    acc.rgb += col * k;
    acc.a = max(acc.a, (0.18 + 0.4 * pat + graze * 0.4) * k);
  }
  return acc;
}
`,
  };
}
