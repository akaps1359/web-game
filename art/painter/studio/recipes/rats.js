// 시궁쥐 떼 (1층) — 서로의 등을 타고 넘는 젖은 쥐들의 더미. 털은 엉겨 붙어 뾰족하고, 비늘 덮인 맨 꼬리가
// 사방으로 늘어졌다. 맨 앞의 큰 놈은 누런 앞니를 드러냈고, 어둠 속에 붉은 눈알 수십 개가 박혀 있다.
import { rng } from '../../lib.js';

/** 쥐 국소 좌표(머리 +x, 발 y=0) → 세계 */
export function ratToWorld(rat, [x, y, z]) {
  const [px, py, pz, s] = rat.pos;
  let c = Math.cos(rat.pitch);
  let sn = Math.sin(rat.pitch);
  const x1 = c * x - sn * y;
  const y1 = sn * x + c * y;
  c = Math.cos(rat.yaw);
  sn = Math.sin(rat.yaw);
  const x2 = c * x1 - sn * z;
  const z2 = sn * x1 + c * z;
  return [px + s * x2, py + s * y1, pz + s * z2];
}

export const RAT_GLSL = /* glsl */ `
/** 쥐 한 마리 (국소 단위: 코끝~꼬리뿌리 ~1, 머리 +x, 발 y=0). curl: 꼬리 휨, open: 입 벌림 */
vec2 ratLocal(vec3 q, float curl, float open, float detail) {
  // 낮고 길쭉한 몸: 엉덩이가 높고 크다
  float body = sdEllipsoid(q - vec3(-0.02, 0.2, 0.0), vec3(0.4, 0.17, 0.18));
  body = smin(body, sdEllipsoid(q - vec3(-0.25, 0.23, 0.0), vec3(0.27, 0.22, 0.21)), 0.14);
  body = smin(body, sdEllipsoid(q - vec3(0.2, 0.19, 0.0), vec3(0.17, 0.14, 0.14)), 0.1);
  // 뾰족한 머리
  float head = sdRoundCone(q, vec3(0.32, 0.2, 0.0), vec3(0.66, 0.12, 0.0), 0.12, 0.032);
  head = smin(head, sdEllipsoid(q - vec3(0.36, 0.22, 0.0), vec3(0.13, 0.11, 0.11)), 0.06);
  vec3 jq = q - vec3(0.42, 0.11, 0.0);
  jq.xy = rot(-open * 0.8) * jq.xy;
  float jaw = sdRoundCone(jq, vec3(0.0), vec3(0.2, -0.005, 0.0), 0.05, 0.02);
  head = smin(head, jaw, 0.025);
  float mouth = sdRoundCone(q - vec3(0.46, 0.115, 0.0), vec3(0.0), vec3(0.2, -0.015 - open * 0.11, 0.0), 0.012 + open * 0.05, 0.008 + open * 0.02);
  head = smax(head, -mouth, 0.015);
  float d = smin(body, head, 0.08);
  // 엉겨 붙어 뾰족하게 뭉친 젖은 털
  if (d < 0.08) {
    float clump = noise(q * vec3(55.0, 40.0, 55.0));
    d -= detail * (0.008 * smoothstep(0.45, 0.85, clump) + 0.004 * (noise(q * vec3(120.0, 60.0, 120.0)) - 0.5));
  }
  vec2 r = vec2(d, 1.0);
  // 귀: 크고 둥글고 얇다
  vec3 eq = vec3(q.x, q.y, abs(q.z)) - vec3(0.3, 0.3, 0.115);
  eq.yz = rot(0.95) * eq.yz;
  eq.xy = rot(0.35) * eq.xy;
  float ear = sdEllipsoid(eq, vec3(0.065, 0.07, 0.014));
  ear = max(ear, -sdEllipsoid(eq - vec3(0.004, 0.0, 0.014), vec3(0.05, 0.055, 0.012)));
  // 다리와 발: 짧게, 몸 아래로 웅크렸다
  vec3 lq = vec3(q.x, q.y, abs(q.z));
  float legs = sdRoundCone(lq, vec3(0.2, 0.12, 0.1), vec3(0.27, 0.02, 0.12), 0.04, 0.022);
  legs = min(legs, sdRoundCone(lq, vec3(-0.27, 0.15, 0.15), vec3(-0.16, 0.02, 0.16), 0.08, 0.03));
  legs = min(legs, sdEllipsoid(lq - vec3(0.3, 0.012, 0.125), vec3(0.05, 0.013, 0.03)));
  legs = min(legs, sdEllipsoid(lq - vec3(-0.1, 0.012, 0.16), vec3(0.1, 0.013, 0.035)));
  // 꼬리: 비늘 덮인 굵은 맨살, 바닥에 늘어져 휘감긴다
  vec3 t0 = vec3(-0.48, 0.2, 0.0);
  vec3 t1 = vec3(-0.78, 0.08, curl * 0.1);
  vec3 t2 = vec3(-1.05, 0.03, curl * 0.35);
  vec3 t3 = vec3(-1.25, 0.025, curl * 0.7);
  vec3 t4 = vec3(-1.3, 0.022, curl * 1.1);
  vec3 t5 = vec3(-1.2, 0.02, curl * 1.4);
  float tail = sdRoundCone(q, t0, t1, 0.06, 0.045);
  tail = min(tail, sdRoundCone(q, t1, t2, 0.045, 0.035));
  tail = min(tail, sdRoundCone(q, t2, t3, 0.035, 0.026));
  tail = min(tail, sdRoundCone(q, t3, t4, 0.026, 0.018));
  tail = min(tail, sdRoundCone(q, t4, t5, 0.018, 0.01));
  float nose = sdSphere(q - vec3(0.67, 0.125, 0.0), 0.028);
  float skin = min(min(ear, legs), min(tail, nose));
  r = umin(r, vec2(skin, 2.0));
  // 누런 앞니 (길다)
  float teeth = sdRoundCone(vec3(q.x, q.y, abs(q.z)) - vec3(0.62, 0.09, 0.011), vec3(0.0), vec3(0.012, -0.06 - open * 0.03, 0.0), 0.011, 0.007);
  teeth = min(teeth, sdRoundCone(jq - vec3(0.17, 0.0, 0.0), vec3(0.0, 0.0, 0.009), vec3(0.01, 0.065, 0.009), 0.009, 0.006));
  r = umin(r, vec2(teeth, 3.0));
  r = umin(r, vec2(sdRoundCone(q - vec3(0.47, 0.115, 0.0), vec3(0.0), vec3(0.15, -0.012 - open * 0.08, 0.0), 0.005 + open * 0.04, 0.004 + open * 0.014), 99.0));
  return r;
}

Mat ratMaterial(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 하수구 물에 젖어 엉긴 털: 거의 검은 갈색, 곳곳에 털 빠진 상처
    float fur = 0.65 + 0.35 * noise(p * vec3(300.0, 120.0, 300.0));
    float sore = smoothstep(0.66, 0.72, fbm3(p * 9.0 + 7.0));
    vec3 alb = vec3(0.04, 0.032, 0.027) * fur * (0.7 + 0.6 * fbm3(p * 4.0));
    alb = mix(alb, vec3(0.09, 0.025, 0.02), sore);
    return Mat(alb, 0.72, 0.32, vec3(0.0), 0.0, 0.12, 0.28 + sore * 0.5);
  }
  if (id < 2.5) {
    // 꼬리·귀·발: 거무죽죽한 맨살, 비늘 고리
    float ring = 0.75 + 0.25 * sin(dot(p, vec3(1.0)) * 300.0);
    return Mat(vec3(0.075, 0.055, 0.05) * ring, 0.45, 0.6, vec3(0.0), 0.0, 0.45, 0.5);
  }
  return Mat(vec3(0.24, 0.15, 0.04), 0.3, 1.0, vec3(0.0), 0.0, 0.2, 0.4);
}
`;

export default function rats({ seed = 1 } = {}) {
  const R = rng(seed * 4241 + 9);
  const cam = [0.55, 0.7, 3.7];
  const list = [];
  const add = (x, y, z, s, yaw, pitch, curl, open = 0) => list.push({ pos: [x, y, z, s], yaw, pitch, curl, open });
  // 앞의 큰 놈: 카메라를 보며 이빨을 드러냈다
  add(0.05, 0.0, 0.55, 0.42, Math.PI / 2 - 0.6, -0.05, 0.8, 0.75);
  // 바닥층: 바깥을 향해 기어 나오는 쥐들
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.3;
    const rr = 0.42 + R() * 0.15;
    const x = Math.cos(a) * rr * 1.25;
    const z = Math.sin(a) * rr * 0.8 - 0.05;
    const face = a + (R() - 0.5) * 1.2;
    add(x, 0.0, z, 0.28 + R() * 0.08, face, (R() - 0.5) * 0.15, (R() - 0.5) * 2, R() < 0.3 ? 0.4 : 0.05);
  }
  // 둘째 층: 서로를 타고 오른다
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + R() * 0.5;
    const rr = 0.18 + R() * 0.16;
    add(Math.cos(a) * rr * 1.2, 0.1 + R() * 0.06, Math.sin(a) * rr * 0.8 - 0.05, 0.27 + R() * 0.07, a + Math.PI * (R() < 0.5 ? 0.5 : -0.5) + (R() - 0.5), 0.25 + R() * 0.35, (R() - 0.5) * 2, R() < 0.3 ? 0.35 : 0.05);
  }
  // 꼭대기: 몸을 일으켜 냄새를 맡는다
  add(-0.12, 0.22, -0.05, 0.3, Math.PI / 2 + 0.6, 0.75, 1.0, 0.25);
  add(0.22, 0.2, -0.1, 0.27, Math.PI / 2 - 1.0, 0.55, -1.0, 0.1);
  add(-0.35, 0.16, 0.12, 0.26, Math.PI / 2 + 1.4, 0.4, 0.6, 0.0);
  // 더미 꼭대기로 기어오르는 놈들 (더미가 높아진다)
  add(0.02, 0.33, -0.12, 0.28, Math.PI / 2 - 0.2, 0.95, -0.8, 0.5);
  add(-0.2, 0.3, -0.2, 0.25, Math.PI / 2 + 2.4, 0.7, 1.0, 0.2);
  add(0.18, 0.28, 0.02, 0.24, Math.PI / 2 - 1.6, 0.55, 0.4, 0.3);

  const uA = list.map((r) => r.pos);
  const uB = list.map((r) => [r.yaw, r.pitch, r.curl, r.open]);
  const eyes = [];
  const gaze = [];
  for (const r of list) {
    for (const side of [-1, 1]) {
      if (eyes.length >= 48) break;
      const e = ratToWorld(r, [0.43, 0.25, side * 0.075]);
      eyes.push([...e, r.pos[3] * 0.03]);
      let g = [cam[0] - e[0] + (R() - 0.5) * 2, cam[1] - e[1], cam[2] - e[2]];
      const l = Math.hypot(...g);
      g = g.map((v) => v / l);
      gaze.push([...g, 13]);
    }
  }
  return {
    preset: 'act1',
    cam: { pos: cam, target: [0.0, 0.2, 0.05], fov: 1.9 },
    light: { rim: 1.2, eyeEmit: 2.2, glow: 0.05 },
    frame: { fill: 0.94 },
    arrays: { uA, uB, uE: eyes, uG: gaze },
    glsl: /* glsl */ `
${RAT_GLSL}
vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 1.0);
  // 더미 한가운데 묻힌 몸뚱이들 (빈틈을 메운다)
  float mound = sdEllipsoid(p - vec3(-0.05, 0.08, -0.08), vec3(0.32, 0.12, 0.24));
  mound = smin(mound, sdEllipsoid(p - vec3(0.15, 0.1, -0.12), vec3(0.2, 0.1, 0.14)), 0.08);
  mound = smin(mound, sdEllipsoid(p - vec3(-0.22, 0.09, 0.05), vec3(0.18, 0.09, 0.13)), 0.08);
  if (mound < 0.05) mound -= 0.012 * smoothstep(0.45, 0.85, noise(p * 100.0));
  r = vec2(mound, 1.0);
  for (int i = 0; i < 24; i++) {
    if (i >= uAN) break;
    vec4 a = uA[i];
    vec4 o = uB[i];
    vec3 q = p - a.xyz;
    float bound = length(q - vec3(-0.3 * a.w, 0.2 * a.w, 0.0)) - 1.45 * a.w;
    if (bound > r.x) continue;
    q.xz = rot(o.x) * q.xz;
    q.xy = rot(o.y) * q.xy;
    vec2 h = ratLocal(q / a.w, o.z, o.w, 1.0);
    h.x *= a.w;
    r = umin(r, h);
  }
  return r;
}
Mat material(float id, vec3 p, vec3 n) { return ratMaterial(id, p, n); }
`,
  };
}
