// 구그 (5층) — 저주받아 꿈의 섬 밑바닥으로 쫓겨난 거인. 팔목마다 두 개씩 갈라진 앞발, 머리를 세로로 가르는 아가리.
// 산처럼 웅크린 검은 털북숭이 거인: 굽은 등이 머리보다 높이 솟고, 목 없이 가슴에 박힌 커다란 머리는 정수리부터 턱까지
// 세로로 갈라진 아가리다 — 양쪽 가장자리에 누런 송곳니가 줄지어 맞물리고, 틈새로 핏빛이 샌다.
// 머리 양옆엔 뼈 돋은 눈두덩 아래 짧은 자루 끝에 붙은 작은 눈. 팔은 팔꿈치에서 둘로 갈라져 앞발이 넷 —
// 둘은 땅을 짚고 둘은 갈퀴를 펴 들었다. 엉킨 털은 뒤에서 오는 빛에 가장자리만 희게 선다.

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};

export default function gug() {
  const ell = [];
  const E = (c, r, k = 0.25) => ell.push([...c, k], [...r, 0]);
  E([0, 1.3, -0.45], [0.62, 0.5, 0.5], 0.3); // 골반
  E([0, 1.65, -0.05], [0.68, 0.6, 0.55], 0.35); // 배
  E([0, 2.3, 0.12], [0.85, 0.6, 0.6], 0.35); // 가슴
  E([0, 3.0, -0.32], [0.82, 0.58, 0.6], 0.35); // 등 혹
  E([0.88, 2.55, 0.1], [0.38, 0.36, 0.38], 0.25); // 어깨
  E([-0.88, 2.55, 0.1], [0.38, 0.36, 0.38], 0.25);
  E([0.5, 1.15, -0.3], [0.32, 0.42, 0.36], 0.2); // 허벅지
  E([-0.5, 1.15, -0.3], [0.32, 0.42, 0.36], 0.2);
  const nBody = ell.length;

  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const path = (pts, rf) => {
    pts.forEach((p, i) => ch.push([...p, rf(i / (pts.length - 1))]));
    brk();
  };
  // 다리
  for (const sx of [1, -1]) path([[sx * 0.5, 1.1, -0.3], [sx * 0.7, 0.6, 0.1], [sx * 0.66, 0.15, -0.12], [sx * 0.68, 0.08, 0.15]], (t) => 0.28 - 0.14 * t);
  // 팔: 어깨 → 팔꿈치 → 두 갈래 아래팔
  const paws = [];
  for (const sx of [1, -1]) {
    const sh = [sx * 0.95, 2.55, 0.15];
    const el = [sx * 1.4, 1.8, 0.3];
    path([sh, el], (t) => 0.27 - 0.06 * t);
    // 땅을 짚은 아래팔
    const wA = [sx * 1.3, 0.35, 0.95];
    path([el, add(el, [sx * -0.02, -0.6, 0.35]), wA], (t) => 0.2 - 0.06 * t);
    paws.push([wA, [0, -1, 0.35], sx, 'ground']);
    // 치켜든 아래팔
    const wB = [sx * 1.7, 2.15, 1.05];
    path([el, add(el, [sx * 0.25, -0.05, 0.4]), wB], (t) => 0.19 - 0.05 * t);
    paws.push([wB, norm([sx * 0.2, 0.75, 0.6]), sx, 'raised']);
  }
  const nSkin = ch.length;
  // 앞발: 굵은 손가락 넷, 끝에 갈고리 발톱
  for (const [w, dir, sx, kind] of paws) {
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5) * 0.11;
      const side = norm([dir[2] * (kind === 'ground' ? 1 : 0.6), 0, -dir[0] - 0.0001]).map((x) => x * sx);
      const base = add(w, side, o);
      let pts;
      if (kind === 'ground') {
        const fwd = norm([o * 1.5 * sx, 0, 1]);
        pts = [base, add(add(base, fwd, 0.22), [0, -0.2, 0]), add(add(base, fwd, 0.38), [0, -0.3, 0])];
      } else {
        const spread = norm(add(dir, side, o * 2.0));
        const k1 = add(base, spread, 0.24);
        pts = [base, k1, add(k1, norm([spread[0] * 0.3, -0.8, 0.6]), 0.2)];
      }
      path(pts, (t) => 0.075 - 0.035 * t);
    }
  }
  const nFinger = ch.length;
  // 발톱 (손가락 끝마다)
  for (let i = nSkin; i < nFinger; i += 4) {
    const tip = ch[i + 2];
    const prev = ch[i + 1];
    const d = norm([tip[0] - prev[0], tip[1] - prev[1], tip[2] - prev[2]]);
    const c1 = add(tip, d, 0.12);
    ch.push([...tip.slice(0, 3), 0.035], [...add(c1, [0, -0.05, 0]), 0.004]);
    brk();
  }
  const nClaw = ch.length;

  // 눈: 머리 양옆의 짧은 자루 끝
  const head = [0, 2.5, 0.82];
  const eyes = [];
  const gaze = [];
  const cam = [2.4, 0.5, 10.0];
  for (const sx of [1, -1]) {
    const e = [sx * 0.56, 2.66, 0.86, 0.055];
    eyes.push(e);
    const g = norm([cam[0] - e[0] + sx * 1.0, cam[1] - e[1], cam[2] - e[2]]);
    gaze.push([...g, 13]);
  }
  const lights = [
    [0.0, 2.45, 1.25, 0.12],
    [0.0, 2.85, 1.15, 0.06],
  ];
  const lc = [
    [1.0, 0.25, 0.15, 0.35],
    [1.0, 0.25, 0.15, 0.25],
  ];
  return {
    preset: 'act5',
    cam: { pos: cam, target: [0.05, 1.75, 0.3], fov: 1.8 },
    light: {
      key: [-0.35, 0.6, -0.7],
      keyCol: [1.2, 0.85, 1.0],
      fillCol: [0.05, 0.08, 0.1],
      amb: [0.012, 0.01, 0.014],
      rimCol: [1.05, 0.8, 1.0],
      rim: 1.9,
      exposure: 1.2,
      glow: 0.06,
      eyeEmit: 2.2,
      pt: [0.0, 2.4, 1.5],
      ptCol: [0.9, 0.18, 0.1],
    },
    frame: { fill: 0.93, bottom: 0.03 },
    arrays: { uA: ell, uB: ch, uE: eyes, uG: gaze, uL: lights, uLC: lc, uP: [[nBody, nSkin, nFinger, nClaw], [...head, 0]] },
    glsl: /* glsl */ `
#define HAS_BG

float ellR(vec3 p, int a, int b) {
  float d = 1e5;
  for (int i = a; i < b; i += 2) d = smin(d, sdEllipsoid(p - uA[i].xyz, uA[i + 1].xyz), uA[i].w);
  return d;
}
float chainR(vec3 p, int a, int b, float k) {
  float d = 1e5;
  for (int i = a; i < b - 1; i++) {
    vec4 s0 = uB[i];
    vec4 s1 = uB[i + 1];
    if (s0.w <= 0.0 || s1.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, s0.xyz, s1.xyz, s0.w, s1.w), k);
  }
  return d;
}
// 세로 아가리의 벌어진 폭 (머리 좌표 y에 따라 렌즈 모양)
float mawW(float y) {
  float t = clamp((y + 0.48) / 0.92, 0.0, 1.0);
  return 0.11 * pow(sin(3.14159 * t), 0.8);
}

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.0, 1.7, 0.3)) - 2.9;
  if (bb > 0.5) return vec2(bb, 1.0);
  float body = ellR(p, 0, int(uP[0].x));
  body = smin(body, chainR(p, 0, int(uP[0].y), 0.06), 0.18);
  // ── 머리: 목 없이 가슴에 박혔다
  vec3 hq = p - uP[1].xyz;
  float head = sdEllipsoid(hq, vec3(0.44, 0.52, 0.42));
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.25, 0.12), vec3(0.36, 0.3, 0.34)), 0.12);
  // 눈두덩: 뼈가 돋은 능선
  vec3 hs = vec3(abs(hq.x), hq.yz);
  head = smin(head, sdEllipsoid(hs - vec3(0.42, 0.22, 0.05), vec3(0.14, 0.07, 0.16)), 0.08);
  head = smin(head, sdRoundCone(hs, vec3(0.42, 0.24, 0.0), vec3(0.6, 0.3, -0.05), 0.06, 0.02), 0.05);
  // 눈자루
  head = smin(head, sdRoundCone(hs, vec3(0.38, 0.14, 0.02), vec3(0.54, 0.16, 0.04), 0.06, 0.04), 0.05);
  // 세로로 갈라진 아가리
  float w = mawW(hq.y);
  float slit = max(abs(hq.x) - w, -hq.z + 0.05);
  slit = max(slit, abs(hq.y + 0.02) - 0.47);
  head = smax(head, -slit, 0.02);
  float d = smin(body, head, 0.2);
  // 엉킨 털: 결 따라 늘어진 가닥 (아래로 흐른다)
  float hair = 0.0;
  if (d < 0.12) {
    vec3 hp = p * vec3(14.0, 3.5, 14.0) + vec3(0.0, noise(p * 4.0) * 2.0, 0.0);
    hair = noise(hp) * 0.7 + noise(hp * 2.3) * 0.3;
    d -= 0.03 * hair - 0.01;
    d += 0.012 * (fbm3(p * 5.0) - 0.5);
  }
  vec2 r = vec2(d, 1.0);
  // 아가리 속 어둠
  r = umin(r, vec2(max(max(abs(hq.x) - w * 0.7, abs(hq.y + 0.02) - 0.44), head + 0.08), 99.0));
  // 송곳니: 아가리 양 가장자리에 줄지어 서로 맞물린다
  float teeth = 1e5;
  for (int s = 0; s < 2; s++) {
    float sg = s == 0 ? 1.0 : -1.0;
    float yy = hq.y + (s == 0 ? 0.0 : 0.045);
    float cell = floor(yy / 0.09 + 0.5);
    float ty = yy - cell * 0.09;
    float cy = cell * 0.09 - (s == 0 ? 0.0 : 0.045);
    float wc = mawW(cy);
    float len = 0.05 + 0.06 * hash11(cell * 3.1 + float(s) * 7.0);
    vec3 tq = vec3(sg * hq.x - wc - 0.01, ty, hq.z - 0.34 - 0.06 * cos(cy * 2.5));
    float tooth = sdRoundCone(tq, vec3(0.0), vec3(-len - wc * 0.6, -0.01, 0.0), 0.022, 0.003);
    tooth = max(tooth, abs(cy + 0.02) - 0.42);
    teeth = min(teeth, tooth);
  }
  r = umin(r, vec2(teeth, 2.0));
  // 앞발 손가락과 발톱 (살갗이 드러났다)
  float fingers = chainR(p, int(uP[0].y), int(uP[0].z), 0.04);
  r = umin(r, vec2(smin(fingers, d + 0.02, 0.06), 3.0));
  r = umin(r, vec2(chainR(p, int(uP[0].z), int(uP[0].w), 0.01), 2.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검은 털: 엉키고 먼지 묻었다, 가닥 끝은 잿빛, 무광
    vec3 hp = p * vec3(14.0, 3.5, 14.0) + vec3(0.0, noise(p * 4.0) * 2.0, 0.0);
    float strand = noise(hp * 2.0);
    float v = fbm3(p * 3.0);
    vec3 alb = vec3(0.028, 0.022, 0.02) * (0.5 + 0.9 * strand) * (0.7 + 0.5 * v);
    alb += vec3(0.05, 0.045, 0.04) * smoothstep(0.75, 0.95, strand);
    // 아가리 가장자리의 핏빛 잇몸과 그 둘레에 번진 빛
    vec3 hq = p - uP[1].xyz;
    float w = mawW(hq.y);
    float lip = smoothstep(0.08, 0.0, abs(abs(hq.x) - w)) * step(abs(hq.y + 0.02), 0.47) * step(0.1, hq.z);
    alb = mix(alb, vec3(0.12, 0.02, 0.02), lip);
    vec3 emi = vec3(0.9, 0.12, 0.05) * smoothstep(0.03, 0.0, abs(hq.x) - w * 0.8) * step(abs(hq.y + 0.02), 0.45) * step(0.0, hq.z) * 0.7;
    return Mat(alb, mix(0.95, 0.3, lip), mix(0.15, 0.8, lip), emi, 0.0, 0.1, mix(0.0, 0.8, lip));
  }
  if (id < 2.5) {
    // 누런 송곳니와 발톱
    float y = fbm3(p * 20.0);
    return Mat(vec3(0.22, 0.17, 0.08) * (0.7 + 0.4 * y), 0.35, 0.9, vec3(0.0), 0.0, 0.2, 0.4);
  }
  // 앞발의 굳은 살갗: 검회색, 갈라졌다
  float crack = smoothstep(0.05, 0.0, ridge(p * 9.0));
  return Mat(vec3(0.05, 0.042, 0.04) * (1.0 - crack * 0.5), 0.75, 0.3, vec3(0.0), 0.0, 0.1, 0.1);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.012);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.2, 0.07, 0.26) * pow(fbm3(rd * 3.0), 3.0) * 0.8 + vec3(0.03, 0.08, 0.1) * pow(fbm3(rd * 2.0 + 5.0), 3.0);
  return col;
}
`,
  };
}
