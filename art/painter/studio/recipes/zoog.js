// 주그 (5층) — 떠도는 꿈의 숲에 사는 작고 갈색 털 난 것들. 파닥이는 소리로 속삭이며 무엇이든 갉아먹는다 — 특히 등불을.
// 웅크린 박쥐-쥐 같은 것: 엉긴 갈색 털 아래 등뼈와 갈비가 불거졌고, 접은 막날개의 손목 뼈가 머리 위로 뿔처럼 솟아
// 해진 막이 몸 양옆을 망토처럼 덮는다. 좁고 긴 머리를 깊이 숙여, 짧은 앞팔로 감싸 쥔 훔친 등불 조각을 긴 앞니로 갉는다.
// 찢긴 큰 귀, 바늘구멍만 한 노란 눈, 주둥이 둘레엔 짧은 더듬이 촉수. 손에 쥔 불씨가 아래에서 얼굴만 비춘다.

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};

export default function zoog() {
  const ember = [0.0, 0.36, 0.36];
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const path = (pts, rf) => {
    pts.forEach((p, i) => ch.push([...p, rf(i / (pts.length - 1))]));
    brk();
  };
  // 뒷다리: 쪼그려 앉았다
  for (const sx of [1, -1]) {
    path([[sx * 0.1, 0.26, -0.16], [sx * 0.17, 0.17, 0.06], [sx * 0.14, 0.04, -0.06], [sx * 0.15, 0.02, 0.08]], (t) => 0.055 - 0.035 * t);
    for (let f = 0; f < 3; f++) {
      const a = (f - 1) * 0.4;
      path([[sx * 0.15, 0.02, 0.08], [sx * 0.15 + Math.sin(a) * 0.06, 0.01, 0.08 + Math.cos(a) * 0.06], [sx * 0.15 + Math.sin(a) * 0.09, -0.005, 0.08 + Math.cos(a) * 0.09]], (t) => 0.01 - 0.008 * t);
    }
  }
  // 짧은 앞팔: 불씨를 감싸 쥐었다
  const wrists = [];
  for (const sx of [1, -1]) {
    const sh = [sx * 0.08, 0.42, 0.1];
    const el = [sx * 0.15, 0.3, 0.22];
    const wr = [sx * 0.07, 0.34, 0.34];
    path([sh, el, wr], (t) => 0.026 - 0.01 * t);
    wrists.push([wr, sx]);
  }
  // 접은 날개 뼈: 팔꿈치(옆구리) → 손목(머리 위 뒤로 솟음) → 접힌 손가락 뼈가 아래로
  const wing = [];
  for (const sx of [1, -1]) {
    const sh = [sx * 0.1, 0.48, -0.06];
    const el = [sx * 0.22, 0.3, -0.12];
    const wr = [sx * 0.2, 0.74, -0.18];
    path([sh, el, wr], (t) => 0.022 - 0.008 * t + 0.008 * Math.exp(-((t - 0.5) ** 2) * 200));
    const tip = [sx * 0.3, 0.12, -0.2];
    path([wr, [sx * 0.27, 0.45, -0.22], tip], (t) => 0.012 - 0.007 * t);
    path([wr, [sx * 0.22, 0.82, -0.14]], (t) => 0.012 - 0.01 * t); // 엄지 발톱
    wing.push([sh, el, wr, tip]);
  }
  const nLimb = ch.length;
  // 긴 손가락: 불씨를 감싼다 (가운뎃손가락이 유난히 길다)
  for (const [wr, sx] of wrists) {
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5) * 0.25;
      const len = f === 2 ? 1.5 : 1.0;
      const d0 = norm([-sx * 0.6, 0.3 + o, 0.5]);
      const k1 = add(wr, d0, 0.05 * len);
      const k2 = add(k1, norm([-sx * 0.4, o * 0.5 - 0.1, -0.2]), 0.04 * len);
      const k3 = add(k2, norm([-sx * 0.1, -0.6, -0.4]), 0.035 * len);
      path([wr, k1, k2, k3], (t) => 0.007 - 0.005 * t);
    }
  }
  const nFinger = ch.length;
  // 주둥이 둘레 더듬이 촉수 (짧고 가늘다)
  const snout = [0.0, 0.43, 0.33];
  for (let i = 0; i < 7; i++) {
    const a = -2.8 + (i / 6) * 2.6;
    const base = add(snout, [Math.cos(a) * 0.025, Math.sin(a) * 0.02, 0.0]);
    const dir = norm([Math.cos(a), Math.sin(a) - 0.5, 0.4]);
    path([base, add(base, dir, 0.035), add(add(base, dir, 0.06), [0, -0.02, 0.01])], (t) => 0.005 - 0.004 * t);
  }
  const nTent = ch.length;

  const lights = [
    [ember[0], ember[1], ember[2], 0.035],
    [0.045, 0.53, 0.26, 0.004],
    [-0.045, 0.53, 0.26, 0.004],
  ];
  const lc = [
    [1.0, 0.7, 0.25, 0.6],
    [1.0, 0.85, 0.35, 1.8],
    [1.0, 0.85, 0.35, 1.8],
  ];
  for (let i = 0; i < 5; i++) {
    lights.push([ember[0] + Math.sin(i * 2.1) * 0.12, ember[1] + 0.05 + i * 0.05, ember[2] + Math.cos(i * 1.7) * 0.08, 0.0025]);
    lc.push([1.0, 0.75, 0.3, 0.9]);
  }
  return {
    preset: 'act5',
    cam: { pos: [1.0, 0.3, 2.5], target: [0.0, 0.42, 0.0], fov: 1.75 },
    light: {
      key: [-0.3, 0.6, -0.75],
      keyCol: [1.1, 0.85, 1.05],
      fillCol: [0.03, 0.05, 0.07],
      amb: [0.008, 0.007, 0.01],
      rimCol: [1.0, 0.8, 1.1],
      rim: 2.0,
      exposure: 1.2,
      glow: 0.05,
      pt: [ember[0], ember[1] + 0.03, ember[2] + 0.05],
      ptCol: [0.55, 0.32, 0.1],
    },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: {
      uB: ch,
      uL: lights,
      uLC: lc,
      uP: [[nLimb, nFinger, nTent, 0], [...ember, 0], [...wing[0][1], 0], [...wing[0][2], 0], [...wing[0][3], 0], [...wing[0][0], 0]],
    },
    glsl: /* glsl */ `
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
// 삼각형까지 거리 (iq)
float udTri(vec3 p, vec3 a, vec3 b, vec3 c) {
  vec3 ba = b - a; vec3 pa = p - a;
  vec3 cb = c - b; vec3 pb = p - b;
  vec3 ac = a - c; vec3 pc = p - c;
  vec3 nor = cross(ba, ac);
  float s = sign(dot(cross(ba, nor), pa)) + sign(dot(cross(cb, nor), pb)) + sign(dot(cross(ac, nor), pc));
  if (s < 2.0) {
    vec3 q1 = ba * clamp(dot(ba, pa) / dot(ba, ba), 0.0, 1.0) - pa;
    vec3 q2 = cb * clamp(dot(cb, pb) / dot(cb, cb), 0.0, 1.0) - pb;
    vec3 q3 = ac * clamp(dot(ac, pc) / dot(ac, ac), 0.0, 1.0) - pc;
    return sqrt(min(min(dot(q1, q1), dot(q2, q2)), dot(q3, q3)));
  }
  return sqrt(dot(nor, pa) * dot(nor, pa) / dot(nor, nor));
}
// 접힌 막날개: 팔꿈치·손목·손가락 끝·어깨 사이의 해진 막
float wingMem(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  vec3 el = uP[2].xyz;
  vec3 wr = uP[3].xyz;
  vec3 tp = uP[4].xyz;
  vec3 sh = uP[5].xyz;
  float d = min(udTri(q, wr, tp, el), udTri(q, sh, el, wr));
  // 바깥 가장자리는 처지고 해졌다
  float tear = smoothstep(0.55, 0.7, noise(q * 26.0)) * smoothstep(0.22, 0.32, q.x);
  return d - 0.004 + tear * 0.02;
}

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.0, 0.4, 0.05)) - 0.65;
  if (bb > 0.3) return vec2(bb, 1.0);
  // ── 몸: 깊이 웅크린 마른 등, 불거진 등뼈와 갈비
  float body = sdEllipsoid(p - vec3(0.0, 0.3, -0.07), vec3(0.13, 0.16, 0.15));
  body = smin(body, sdEllipsoid(p - vec3(0.0, 0.44, 0.0), vec3(0.12, 0.11, 0.13)), 0.07);
  float ribs = abs(fract(p.y * 30.0) - 0.5);
  body += 0.006 * smoothstep(0.25, 0.05, ribs) * smoothstep(0.04, 0.1, abs(p.x)) * smoothstep(0.22, 0.3, p.y) * smoothstep(0.48, 0.4, p.y);
  for (int i = 0; i < 9; i++) {
    float t = float(i) / 8.0;
    vec3 c = vec3(0.0, 0.52 - t * 0.36 + 0.05 * sin(t * 3.0), -0.1 - 0.11 * sin(t * 2.6));
    body = smin(body, length(p - c) - 0.018, 0.015);
  }
  // ── 머리: 좁고 길다, 깊이 숙여 불씨를 갉는다
  vec3 hq = p - vec3(0.0, 0.52, 0.2);
  hq.yz = rot(0.75) * hq.yz;
  float head = sdEllipsoid(hq, vec3(0.06, 0.06, 0.075));
  head = smin(head, sdRoundCone(hq, vec3(0.0, -0.005, 0.03), vec3(0.0, -0.02, 0.15), 0.042, 0.02), 0.035);
  vec3 hs = vec3(abs(hq.x), hq.yz);
  head = smax(head, -sdSphere(hs - vec3(0.042, 0.022, 0.065), 0.01), 0.004);
  // 찢긴 큰 귀: 곧추서 뒤로 젖혀졌다
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? 1.0 : -1.0;
    vec3 e0 = vec3(sx * 0.04, 0.04, -0.02);
    vec3 e1 = vec3(sx * 0.13, 0.17, -0.1);
    float ear = sdRoundCone(hq, e0, e1, 0.05, 0.012);
    vec3 en = normalize(vec3(sx * 0.5, 0.2, 1.0));
    float ez = dot(hq - e0, en);
    ear = max(ear, abs(ez) - 0.005);
    ear = max(ear, -sdSphere(hq - mix(e0, e1, 0.7) - vec3(sx * 0.035, 0.0, 0.0), 0.016));
    ear = max(ear, -sdSphere(hq - mix(e0, e1, 0.4) - vec3(sx * 0.045, -0.015, 0.0), 0.01));
    head = smin(head, ear, 0.01);
  }
  body = smin(body, head, 0.035);
  float limbs = chainR(p, 0, int(uP[0].x), 0.01);
  body = smin(body, limbs, 0.025);
  body = smin(body, chainR(p, int(uP[0].x), int(uP[0].y), 0.002), 0.008);
  // 털: 엉긴 결
  if (body < 0.02) {
    body -= 0.004 * noise(p * vec3(170.0, 55.0, 170.0));
    body += 0.003 * (fbm3(p * 30.0) - 0.5);
  }
  vec2 r = vec2(body, 1.0);
  r = umin(r, vec2(wingMem(p), 2.0));
  // 앞니: 길게 튀어나왔다
  vec3 iq = hq - vec3(0.0, -0.045, 0.14);
  float teeth = sdRoundCone(vec3(abs(iq.x) - 0.007, iq.y, iq.z), vec3(0.0, 0.015, 0.0), vec3(0.0, -0.03, 0.012), 0.006, 0.003);
  r = umin(r, vec2(teeth, 3.0));
  // 더듬이 촉수
  r = umin(r, vec2(chainR(p, int(uP[0].y), int(uP[0].z), 0.002), 4.0));
  // 훔친 불씨: 깨진 등불 유리 조각
  vec3 eq = p - uP[1].xyz;
  float shard = sdRoundBox(eq, vec3(0.028, 0.034, 0.024), 0.008);
  shard = max(shard, dot(eq, normalize(vec3(1.0, 1.0, 0.3))) - 0.02);
  r = umin(r, vec2(shard, 5.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float v = fbm3(p * 20.0);
  if (id < 1.5) {
    // 엉긴 갈색 털, 끝은 바랬다
    float strand = noise(p * vec3(170.0, 55.0, 170.0));
    vec3 alb = vec3(0.05, 0.033, 0.02) * (0.5 + 0.9 * strand) * (0.7 + 0.5 * v);
    return Mat(alb, 0.92, 0.12, vec3(0.0), 0.0, 0.2, 0.0);
  }
  if (id < 2.5) {
    // 막날개: 얇은 검붉은 갈색, 뒤에서 빛이 비치면 핏줄이 보인다
    float vein = smoothstep(0.05, 0.0, ridge(p * 22.0));
    vec3 alb = mix(vec3(0.028, 0.014, 0.012), vec3(0.008, 0.004, 0.004), vein);
    return Mat(alb, 0.6, 0.3, vec3(0.0), 0.0, 0.7, 0.15);
  }
  if (id < 3.5) return Mat(vec3(0.24, 0.17, 0.06), 0.3, 0.9, vec3(0.0), 0.0, 0.2, 0.4);
  if (id < 4.5) return Mat(vec3(0.07, 0.03, 0.025), 0.3, 0.8, vec3(0.0), 0.0, 0.6, 0.6);
  // 불씨: 속에서 타는 노란 빛
  float core = smoothstep(0.05, 0.0, length(p - uP[1].xyz));
  return Mat(vec3(0.0), 0.1, 1.0, vec3(2.2, 1.35, 0.4) * (0.4 + core), 0.0, 0.0, 0.5);
}
`,
  };
}
