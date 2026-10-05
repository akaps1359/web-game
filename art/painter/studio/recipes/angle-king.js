// 각도의 왕 (3층 수호자) — 모든 각도의 주인, 사냥개들의 왕. 시간이 굽어지기 전부터 굶주려 왔다.
// 신전의 개 석상처럼 꼿꼿이 앉은 거대한 흑요석 사냥개: 앞다리를 곧게 짚고 가슴을 내밀었고, 고개를 쳐들어 턱을 벌렸다.
// 머리 뒤로는 부러진 시계판 같은 칼날 후광 — 길이가 제각각인 날들이 바퀴살처럼 뻗고 군데군데 빠졌다.
// 발치엔 오각형 탑의 깨진 모서리 돌들, 둘레엔 공간의 파편이 떠돌고 푸른 연기가 피어오른다.
// 몸은 사냥개 뼈대(tindalos.js의 angleHound), 후광과 받침돌은 이 레시피의 셰이더로 그린다.
const { angleHound, houndRecipe } = await import(/* @vite-ignore */ `/art/painter/studio/recipes/tindalos.js?t=${Date.now()}`);

export default function angleKing({ seed = 1 } = {}) {
  const S = 1.5;
  // 먹이 앞에서 몸을 낮춘 거대한 사냥개: 앞다리를 넓게 짚고, 등은 높이 솟고, 머리는 낮게 이쪽으로
  const pose = {
    pelvis: [-1.0, 1.15, 0],
    waist: [-0.45, 1.3, 0],
    chest: [0.25, 1.02, 0],
    neck: [0.66, 0.98, 0],
    head: [0.95, 0.85, 0.0],
    headDir: [1, -0.22, 0.0],
    gape: 0.85,
    legs: [
      { j: [[0.3, 0.9, 0.24], [0.08, 0.72, 0.5], [0.6, 0.28, 0.6], [0.8, 0.03, 0.6]], w: 0.1, up: [0, 0, 1], kneeOut: -1 },
      { j: [[0.3, 0.9, -0.24], [0.12, 0.76, -0.5], [0.7, 0.3, -0.56], [0.92, 0.03, -0.52]], w: 0.1, up: [0, 0, -1], kneeOut: -1 },
      { j: [[-1.0, 1.08, 0.18], [-0.55, 0.62, 0.4], [-1.3, 0.48, 0.38], [-1.12, 0.03, 0.4]], w: 0.12, up: [0, 0, 1] },
      { j: [[-1.0, 1.08, -0.18], [-0.6, 0.66, -0.38], [-1.38, 0.5, -0.34], [-1.22, 0.03, -0.34]], w: 0.12, up: [0, 0, -1] },
    ],
    tail: [[-1.05, 1.2, 0], [-1.45, 1.45, 0.05], [-1.7, 1.9, -0.05], [-1.6, 2.35, 0.1], [-1.3, 2.55, 0.2], [-1.15, 2.4, 0.25]],
  };
  const yaw = 0.62;
  const h = angleHound({
    seed,
    pose,
    yaw,
    size: S,
    bulk: 1.3,
    ribs: 4,
    spines: 7,
    spineLen: 1.6,
    hackles: 0,
    teeth: 4,
    headLen: 0.95,
    headBulk: 1.3,
    eyePairs: 3,
    tongueDrop: 0.35,
    salt: 77,
  });
  // 후광: 머리 뒤, 카메라 쪽을 향한 원판
  const fwd = (() => {
    const a = h.W([0.95, 0.9, 0]);
    const b = h.W([0.45, 1.05, 0]);
    const d = a.map((x, i) => x - b[i]);
    const l = Math.hypot(...d);
    return d.map((x) => x / l);
  })();
  const halo = h.W([0.6, 0.98, 0]);
  const cam = [0.6, 0.3, 12.0];
  const hn = (() => {
    const d = [cam[0] - halo[0], (cam[1] - halo[1]) * 0.3, cam[2] - halo[2]];
    const l = Math.hypot(...d);
    return d.map((x) => x / l);
  })();
  return houndRecipe(h, {
    cam: { pos: cam, target: [0.1, 1.75, 0.0], fov: 1.75 },
    shards: 0,
    shardC: [0, 0, 0],
    shardR: 2.4,
    shardY: 2.6,
    shardH: 2.4,
    shardL: 0.35,
    smokeC: [0, 0.6, 0],
    smokeR: [2.6, 1.3, 1.8],
    smoke: 1.0,
    glow: 1.15,
    light: { rim: 1.5, key: [-0.3, 0.6, -0.85], pt: h.throat, ptCol: [0.6, 1.0, 1.8], exposure: 1.45 },
    frame: { fill: 0.95, bottom: 0.025 },
    extraP: [
      [...h.W([0.6, 0.98, 0]), 1.0],
      [...fwd, 0],
      [0, 1, 0, 0],
    ],
    helpers: /* glsl */ `
// 칼날 갈기: 목과 어깨를 둘러 뒤로 휩쓸린 긴 날들 (위쪽이 가장 길고, 목 아래는 비었다)
vec2 haloD(vec3 p) {
  vec3 c0 = uP[3].xyz;
  vec3 fw = uP[4].xyz;
  vec3 up0 = uP[5].xyz;
  vec3 sd = normalize(cross(fw, up0));
  vec3 up = cross(sd, fw);
  float s = ${S.toFixed(3)};
  vec3 res = vec3(1e5, 5.0, 1.0);
  if (length(p - c0) > s * 2.4) return vec2(length(p - c0) - s * 2.3, 1.0);
  for (int ring = 0; ring < 3; ring++) {
    float fr = float(ring);
    vec3 c = c0 - fw * s * (0.05 + 0.32 * fr);
    float rr = s * (0.16 + 0.05 * fr);
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      float h = hash31(vec3(fk, fr, 5.0));
      float th = (fk / 5.0 - 0.5) * 3.3 + (h - 0.5) * 0.35 + fr * 0.27;
      vec3 rad = sd * sin(th) + up * cos(th);
      float top = 0.5 + 0.5 * cos(th);
      float L = s * (0.3 + 1.0 * top * top * (0.6 + 0.6 * h)) * (1.0 - 0.18 * fr);
      vec3 base = c + rad * rr;
      vec3 dir = normalize(rad * (0.75 + 0.2 * h) - fw * (0.85 + 0.3 * fr) + up * 0.25);
      vec3 tip = base + dir * L;
      res = prismSeg(p, res, vec4(base, s * (0.075 - 0.012 * fr)), vec4(tip, 0.0), rad, 3.0, 5.0, 0.35);
    }
  }
  return vec2(res.x, res.z);
}

// 받침: 오각형 탑에서 떨어져 나온 모난 돌덩이들
float slab(vec3 p, vec3 c, vec3 b, float ry, float rx) {
  vec3 q = p - c;
  q.xz = rot(ry) * q.xz;
  q.yz = rot(rx) * q.yz;
  return sdBox(q, b);
}
float rubble(vec3 p) {
  float d = slab(p, vec3(-1.6, 0.25, -0.6), vec3(0.75, 0.35, 0.5), 0.5, 0.15);
  d = min(d, slab(p, vec3(1.7, 0.18, -0.2), vec3(0.6, 0.22, 0.45), -0.6, -0.1));
  d = min(d, slab(p, vec3(-2.1, 0.55, -1.4), vec3(0.3, 0.75, 0.3), 0.9, 0.28));
  d = min(d, slab(p, vec3(1.3, 0.12, 1.2), vec3(0.3, 0.14, 0.24), 1.2, 0.2));
  d = min(d, slab(p, vec3(-0.9, 0.1, 1.6), vec3(0.22, 0.1, 0.18), 0.3, -0.25));
  return max(d, -p.y);
}
`,
    sdfExtra: /* glsl */ `
  vec2 hh = haloD(p);
  if (hh.x < r.x) r = vec2(hh.x, 5.0);
`,
    matExtra: /* glsl */ `
  if (id > 4.5 && id < 5.5) {
    float e = haloD(p).y;
    float eg = smoothstep(0.01, 0.0, e) * smoothstep(0.35, 0.65, noise(p * 2.2));
    float face = hash31(floor(n * 3.0 + 0.5) + 7.0);
    return Mat(vec3(0.012, 0.014, 0.02) * (0.5 + face), 0.05, 1.4 + face, vec3(0.3, 0.62, 1.0) * eg * 0.6, 0.1, 0.0, 0.7);
  }
  if (id > 5.5) {
    float v = fbm3(p * 3.0);
    float carve = smoothstep(0.04, 0.0, abs(fract(p.x * 2.0 + p.z * 1.3) - 0.5) - 0.42) * step(0.6, noise(p * 2.0));
    return Mat(vec3(0.02, 0.024, 0.03) * (0.5 + v), 0.85, 0.25, vec3(0.3, 0.62, 1.0) * carve * 0.25, 0.0, 0.0, 0.15);
  }
`,
    seed,
  });
}
