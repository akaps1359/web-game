// 쥐 (1층, 하수인) — 개만 한 시궁쥐 한 마리가 앞발을 들고 몸을 반쯤 일으켜 누런 앞니를 드러냈다.
// 옆구리엔 털이 빠진 종양 덩어리, 비늘 덮인 굵은 꼬리가 몸 앞으로 감겨 온다. 두 눈은 핏빛.
import { RAT_GLSL, ratToWorld } from './rats.js';

const PIVOT = -0.2; // 뒷다리 쪽을 축으로 몸을 일으킨다

export default function rat() {
  const cam = [0.45, 0.36, 2.3];
  const s = 0.62;
  const r = { pos: [0.0, 0.0, 0.0, s], yaw: Math.PI / 2 + 0.95, pitch: 0.0, curl: 1.1, open: 0.85 };
  const rise = 0.12;
  // 셰이더와 같은 변환: 국소 → (일으킴) → 세계
  const toW = ([x, y, z]) => {
    const c = Math.cos(rise);
    const sn = Math.sin(rise);
    const x1 = PIVOT + c * (x - PIVOT) - sn * y;
    const y1 = sn * (x - PIVOT) + c * y;
    return ratToWorld(r, [x1, y1, z]);
  };
  const eyes = [toW([0.43, 0.25, -0.075]), toW([0.43, 0.25, 0.075])];
  const look = (e) => {
    const g = [cam[0] - e[0], cam[1] - e[1], cam[2] - e[2]];
    const l = Math.hypot(...g);
    return g.map((v) => v / l);
  };
  return {
    preset: 'act1',
    cam: { pos: cam, target: [0.05, 0.22, 0.05], fov: 1.85 },
    light: { rim: 2.0, fillCol: [0.24, 0.15, 0.08], amb: [0.024, 0.03, 0.032], eyeEmit: 2.0, glow: 0.06 },
    frame: { fill: 0.9 },
    arrays: {
      uE: eyes.map((e) => [...e, 0.019]),
      uG: [
        [...look(eyes[0]), 13],
        [...look(eyes[1]), 13],
      ],
      uP: [[...r.pos], [r.yaw, rise, r.curl, r.open]],
    },
    glsl: /* glsl */ `
${RAT_GLSL}
const float PIVOT = ${PIVOT};
vec2 sdf(vec3 p) {
  vec4 a = uP[0];
  vec4 o = uP[1];
  vec3 q = p - a.xyz;
  q.xz = rot(o.x) * q.xz;
  vec3 l = q / a.w;
  // 뒷다리를 축으로 상체를 일으킨다
  l.x -= PIVOT;
  l.xy = rot(o.y) * l.xy;
  l.x += PIVOT;
  vec2 r = ratLocal(l, o.z, o.w, 1.0);
  // 옆구리의 털 빠진 종양
  float tumor = sdSphere(l - vec3(-0.15, 0.3, -0.17), 0.085);
  tumor = smin(tumor, sdSphere(l - vec3(-0.08, 0.26, -0.19), 0.055), 0.04);
  tumor += 0.01 * (fbm3(l * 30.0) - 0.5);
  r = umin(r, vec2(smin(tumor, r.x + 0.02, 0.05), 4.0));
  // 수염: 가늘고 휘었다
  float wh = 1e5;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    for (int s = 0; s < 2; s++) {
      float sd = s == 0 ? 1.0 : -1.0;
      vec3 b0 = vec3(0.6, 0.15 - fi * 0.01, sd * 0.04);
      vec3 b1 = b0 + vec3(-0.02 + fi * 0.02, 0.02 - fi * 0.025, sd * (0.15 - fi * 0.012));
      vec3 b2 = b1 + vec3(-0.06 + fi * 0.015, -0.03 - fi * 0.02, sd * (0.12 - fi * 0.015));
      wh = min(wh, min(sdCapsule(l, b0, b1, 0.0018), sdCapsule(l, b1, b2, 0.0012)));
    }
  }
  r = umin(r, vec2(wh, 5.0));
  r.x *= a.w;
  return r;
}
Mat material(float id, vec3 p, vec3 n) {
  if (id > 4.5) return Mat(vec3(0.02, 0.018, 0.016), 0.6, 0.2, vec3(0.0), 0.0, 0.0, 0.1);
  if (id > 3.5) {
    float v = smoothstep(0.08, 0.0, ridge(p * 30.0));
    return Mat(mix(vec3(0.12, 0.06, 0.055), vec3(0.05, 0.01, 0.012), v), 0.3, 0.9, vec3(0.0), 0.05, 0.6, 0.8);
  }
  return ratMaterial(id, p, n);
}
`,
  };
}
