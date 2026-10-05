// 검은 풍뎅이 떼 (4층 하수인, 무리) — 검은 파라오가 부르는 풍뎅이들. 반들거리는 검은 딱정벌레들이 무더기로 기어오르고
// 몇 마리는 날아오른다. 등딱지 가장자리에 금빛이 번들거리고, 앞을 보는 놈들의 작은 눈이 금빛으로 빛난다.
import { rng } from '../../lib.js';

export default function pharaohScarab({ seed = 1 } = {}) {
  const R = rng(seed * 5501 + 31);
  const beetles = [];
  // 아래층: 바닥에 몰려 기어 온다
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.5;
    const rr = 0.25 + R() * 0.55;
    const s = 0.24 + R() * 0.08;
    beetles.push([Math.cos(a) * rr * 1.3, s * 0.36, Math.sin(a) * rr * 0.7, s, (R() - 0.5) * 1.6 + (Math.cos(a) > 0 ? -0.4 : 0.4), (R() - 0.5) * 0.2, (R() - 0.5) * 0.3]);
  }
  // 위층: 무더기 위로 기어오른다
  for (let i = 0; i < 4; i++) {
    const s = 0.23 + R() * 0.06;
    beetles.push([(R() - 0.5) * 0.7, 0.32 + R() * 0.12, (R() - 0.5) * 0.4, s, (R() - 0.5) * 1.4, -0.35 - R() * 0.3, (R() - 0.5) * 0.5]);
  }
  // 날아오르는 놈들
  for (let i = 0; i < 4; i++) {
    const s = 0.2 + R() * 0.05;
    beetles.push([(R() - 0.5) * 1.6, 0.95 + R() * 0.7, (R() - 0.5) * 0.6, s, (R() - 0.5) * 2.0, -0.6 - R() * 0.4, (R() - 0.5) * 0.8]);
  }
  const uA = [];
  for (const b of beetles) {
    uA.push([b[0], b[1], b[2], b[3]]);
    uA.push([b[4], b[5], b[6], 0]);
  }
  // 앞을 보는 놈들의 금빛 눈
  const uE = [];
  const uG = [];
  // 국소 좌표 → 세계 (셰이더의 회전을 거꾸로)
  const toWorld = (bt, l) => {
    const [x, y, z, sc, yaw, pitch, roll] = bt;
    const [lx, ly, lz] = l.map((v) => v * sc);
    const x2 = Math.cos(roll) * lx - Math.sin(roll) * ly;
    const y2 = Math.sin(roll) * lx + Math.cos(roll) * ly;
    const y1 = Math.cos(pitch) * y2 - Math.sin(pitch) * lz;
    const z1 = Math.sin(pitch) * y2 + Math.cos(pitch) * lz;
    return [x + Math.cos(yaw) * x2 + Math.sin(yaw) * z1, y + y1, z - Math.sin(yaw) * x2 + Math.cos(yaw) * z1];
  };
  for (const bt of beetles) {
    const o = toWorld(bt, [0, 0, 0]);
    const f = toWorld(bt, [0, 0, 1]).map((v, i) => v - o[i]);
    const fl = Math.hypot(...f);
    if (f[2] / fl < 0.25) continue;
    for (const side of [-1, 1]) {
      uE.push([...toWorld(bt, [side * 0.17, 0.0, 0.86]), bt[3] * 0.055]);
      uG.push([f[0] / fl, f[1] / fl, f[2] / fl, 5]);
    }
    if (uE.length >= 14) break;
  }

  return {
    preset: 'act4',
    cam: { pos: [0.5, 1.5, 5.6], target: [0.0, 0.55, 0], fov: 1.8 },
    light: { key: [-0.45, 0.75, -0.55], fillCol: [0.12, 0.09, 0.14], amb: [0.02, 0.018, 0.025], rim: 1.7, exposure: 1.3, eyeEmit: 1.4, glow: 0.05 },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uA, uE, uG },
    glsl: /* glsl */ `
vec2 sdf(vec3 p) {
  float d = 1e5;
  float part = 1.0;
  int n = uAN / 2;
  for (int i = 0; i < n; i++) {
    vec4 c = uA[2 * i];
    vec4 o = uA[2 * i + 1];
    vec3 q = p - c.xyz;
    if (length(q) > c.w * 1.6) {
      d = min(d, length(q) - c.w * 1.2);
      continue;
    }
    q.xz = rot(-o.x) * q.xz;
    q.yz = rot(o.y) * q.yz;
    q.xy = rot(o.z) * q.xy;
    q /= c.w;
    // 딱지날개: 가운데 솔기가 파였다
    float body = sdEllipsoid(q - vec3(0.0, 0.0, -0.12), vec3(0.5, 0.34, 0.62));
    body = smax(body, -max(abs(q.x) - 0.012, -(q.y - 0.18)), 0.02);
    // 앞가슴등판 + 머리 (톱니 이마)
    float pron = sdEllipsoid(q - vec3(0.0, 0.02, 0.48), vec3(0.42, 0.26, 0.26));
    float head = sdEllipsoid(q - vec3(0.0, -0.04, 0.76), vec3(0.28, 0.13, 0.16));
    head -= 0.03 * max(0.0, sin(atan(q.x, q.z - 0.6) * 9.0)) * smoothstep(0.7, 0.9, q.z);
    float b = smin(body, smin(pron, head, 0.05), 0.04);
    // 다리 여섯 (좌우 대칭)
    vec3 lq = vec3(abs(q.x), q.y, q.z);
    float legs = sdCapsule(lq, vec3(0.32, -0.12, 0.3), vec3(0.72, -0.3, 0.62), 0.045);
    legs = min(legs, sdCapsule(lq, vec3(0.38, -0.14, 0.0), vec3(0.8, -0.32, 0.05), 0.045));
    legs = min(legs, sdCapsule(lq, vec3(0.34, -0.14, -0.3), vec3(0.72, -0.32, -0.62), 0.045));
    float bb = min(b, legs) * c.w;
    if (bb < d) { d = bb; part = legs < b ? 2.0 : 1.0; }
  }
  return vec2(d, part);
}

Mat material(float id, vec3 p, vec3 n) {
  float g = noise(p * 30.0);
  // 반들거리는 검은 갑각, 비스듬한 곳에 금빛·녹빛 기름막
  vec3 alb = vec3(0.018, 0.016, 0.012) * (0.7 + 0.6 * g);
  float pits = smoothstep(0.7, 0.8, noise(p * 70.0));
  return Mat(alb, 0.12 + pits * 0.3, 1.5, vec3(0.0), id > 1.5 ? 0.0 : 0.55, 0.0, 0.75);
}
`,
  };
}
