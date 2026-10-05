// 얼굴 없는 사제 (4층 일반) — 별들의 궁정을 섬기는 교단의 사제. 금실로 수놓인 검은 제의와 높은 주교관,
// 얼굴이 있어야 할 자리는 매끈한 창백한 살갗뿐이다. 한 손을 들어 손바닥 위에 검은 불꽃(속은 검고 가장자리가 붉게 타는)을 피우고,
// 다른 손은 가슴의 금빛 별 성표를 쥐었다.
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);

function chainKit() {
  const uB = [];
  const groups = [];
  let cur = null;
  return {
    uB,
    begin(mat, k) {
      cur = { i0: uB.length, mat, k };
    },
    end() {
      cur.i1 = uB.length;
      const pts = uB.slice(cur.i0, cur.i1).filter((q) => q[3] > 0);
      const c = mul(pts.reduce((s, q) => add(s, q), [0, 0, 0]), 1 / pts.length);
      cur.c = c;
      cur.r = Math.max(...pts.map((q) => Math.hypot(...sub(q.slice(0, 3), c)) + q[3]));
      groups.push(cur);
    },
    line(pts) {
      for (const q of pts) uB.push(q);
      uB.push([0, 0, 0, 0]);
      return pts;
    },
    uP() {
      const n = groups.length;
      return [[n, 0, 0, 0], ...groups.map((g) => [...g.c, g.r]), ...groups.map((g) => [g.i0, g.i1, g.k, g.mat])];
    },
  };
}

const CHAIN_GLSL = /* glsl */ `
vec2 chainSet(vec3 p) {
  vec2 res = vec2(1e5, 1.0);
  int ng = int(uP[0].x + 0.5);
  for (int g = 0; g < ng; g++) {
    vec4 bs = uP[1 + g];
    vec4 gi = uP[1 + ng + g];
    float k = gi.z;
    float d = length(p - bs.xyz) - bs.w;
    if (d < k + 0.25) {
      d = 1e5;
      int i1 = int(gi.y + 0.5) - 1;
      for (int i = int(gi.x + 0.5); i < i1; i++) {
        vec4 a = uB[i];
        vec4 b = uB[i + 1];
        if (a.w <= 0.0 || b.w <= 0.0) continue;
        d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), k);
      }
    }
    res = usmin(res, vec2(d, gi.w), max(k, 0.03));
  }
  return res;
}
`;

export default function facelessPriest() {
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };
  const HANDR = [0.52, 2.05, 0.38]; // 불꽃을 든 손
  const HANDL = [-0.1, 1.5, 0.32]; // 성표를 쥔 손
  const FLAME = add(HANDR, [0.0, 0.3, 0.02]);
  const SIGIL = [0.0, 1.42, 0.33];

  // ── 소매 (재질 1, 제의): 오른팔은 들어 올렸고 왼팔은 가슴으로
  K.begin(1, 0.06);
  K.line([[0.28, 1.95, 0.0, 0.13], [0.58, 1.62, 0.12, 0.1], [...add(HANDR, [0.0, -0.1, -0.04]), 0.075]]);
  K.line([[...add(HANDR, [0.0, -0.14, -0.04]), 0.085], [...add(HANDR, [0.04, -0.36, -0.08]), 0.12], [...add(HANDR, [0.05, -0.52, -0.1]), 0.07]]);
  K.line([[-0.28, 1.95, 0.0, 0.13], [-0.42, 1.55, 0.18, 0.1], [...add(HANDL, [-0.1, -0.02, -0.04]), 0.08]]);
  K.end();
  // ── 손 (재질 2, 창백하고 마른): 오른손은 손바닥을 위로, 손가락을 벌렸다
  K.begin(2, 0.012);
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.35;
    K.line([[...HANDR, 0.026], [...add(HANDR, [Math.sin(a) * 0.07, 0.05, Math.cos(a) * 0.05]), 0.016], [...add(HANDR, [Math.sin(a) * 0.11, 0.11, Math.cos(a) * 0.08]), 0.009]]);
  }
  for (let i = 0; i < 4; i++) {
    const y = (i - 1.5) * 0.028;
    K.line([[...add(HANDL, [0, y, 0]), 0.022], [...add(HANDL, [0.07, y - 0.02, 0.03]), 0.014], [...add(HANDL, [0.1, y - 0.04, 0.0]), 0.009]]);
  }
  K.end();
  // ── 성표 줄 (재질 3, 금)
  K.begin(3, 0.004);
  K.line([[-0.13, 1.98, 0.17, 0.008], [-0.08, 1.7, 0.3, 0.007], [...add(SIGIL, [0, 0.07, 0]), 0.007]]);
  K.line([[0.13, 1.98, 0.17, 0.008], [0.08, 1.7, 0.3, 0.007], [...add(SIGIL, [0, 0.07, 0]), 0.007]]);
  K.end();

  const P = {
    robe: prm([0.022, 0.02, 0.026, 0.8]),
    gold: prm([0.42, 0.29, 0.09, 0.28]),
    skin: prm([0.24, 0.22, 0.21, 0.4]), // 창백한 살갗
    head: prm([0.0, 2.27, 0.08, 0.0]),
    mitre: prm([0.0, 2.42, 0.02, 0.0]),
    flame: prm([...FLAME, 0.15]),
    fire: prm([1.0, 0.36, 0.12, 2.4]), // 불꽃 테두리 색, 세기
    sigil: prm([...SIGIL, 0.075]),
  };

  const uL = [
    [...add(FLAME, [0, 0.02, 0.02]), 0.13],
    [...add(FLAME, [0.04, 0.2, 0.0]), 0.02],
    [...add(FLAME, [-0.05, 0.3, 0.03]), 0.014],
  ];
  const uLC = [
    [1.0, 0.35, 0.1, 0.45],
    [1.0, 0.5, 0.2, 0.9],
    [1.0, 0.5, 0.2, 0.7],
  ];

  return {
    preset: 'act4',
    cam: { pos: [-0.6, 1.25, 7.4], target: [0.0, 1.45, 0], fov: 1.8 },
    light: { key: [-0.45, 0.7, -0.6], fillCol: [0.1, 0.07, 0.14], amb: [0.022, 0.018, 0.03], rim: 1.8, exposure: 1.3, pt: add(FLAME, [0.0, -0.05, 0.15]), ptCol: [1.1, 0.32, 0.1] },
    frame: { fill: 0.9, bottom: 0.025 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uL, uLC },
    glsl: /* glsl */ `
${CHAIN_GLSL}

vec2 sdf(vec3 p) {
  // ── 제의: 곧게 선 무거운 옷, 아래로 퍼진다
  float robe = sdRobe(p, 2.02, 0.2, 0.44, 13.0, 0.035);
  robe = max(robe, -(p.y - 0.02 - 0.05 * fbm3(vec3(p.x * 8.0, 0.0, p.z * 8.0))));
  robe = smin(robe, sdEllipsoid(p - vec3(0.0, 1.95, -0.01), vec3(0.29, 0.15, 0.2)), 0.1);
  // 어깨 망토 (케이프)
  float cape = sdEllipsoid(p - vec3(0.0, 1.9, -0.02), vec3(0.35, 0.22, 0.27));
  cape = max(cape, -(p.y - 1.72));
  robe = smin(robe, cape, 0.05);
  vec2 r = vec2(robe, 1.0);
  r = usmin(r, chainSet(p), 0.05);
  // ── 머리: 얼굴 없는 매끈한 달걀꼴, 목은 가늘다
  vec3 hq = p - ${P.head}.xyz;
  hq.yz = rot(0.12) * hq.yz;
  float head = sdEllipsoid(hq, vec3(0.1, 0.145, 0.12));
  vec3 eq = vec3(abs(hq.x), hq.y, hq.z);
  head = smax(head, -sdEllipsoid(eq - vec3(0.042, 0.02, 0.112), vec3(0.03, 0.014, 0.02)), 0.02);
  head = smax(head, -sdEllipsoid(hq - vec3(0.0, -0.068, 0.108), vec3(0.03, 0.008, 0.02)), 0.015);
  head = smin(head, sdCapsule(p, vec3(0.0, 2.0, 0.02), ${P.head}.xyz - vec3(0.0, 0.08, 0.0), 0.05), 0.04);
  r = umin(r, vec2(head, 2.0));
  // ── 주교관: 앞뒤로 납작한 뾰족한 관, 가운데가 갈라졌다
  vec3 mq = p - ${P.mitre}.xyz;
  float t = clamp(mq.y / 0.42, 0.0, 1.0);
  float mw = mix(0.12, 0.015, t * t);
  float mitre = max(max(abs(mq.x) - mw, abs(mq.z) - mix(0.11, 0.04, t)), max(-mq.y, mq.y - 0.42));
  mitre = max(mitre, -max(abs(mq.x) - 0.006, -(mq.y - 0.26)));
  r = umin(r, vec2(mitre * 0.9, 1.0));
  // ── 성표: 여덟 갈래 금빛 별
  vec3 sq = p - ${P.sigil}.xyz;
  float ang = atan(sq.y, sq.x);
  float star = length(sq.xy) - ${P.sigil}.w * (0.55 + 0.45 * pow(abs(cos(ang * 4.0)), 6.0));
  star = max(star, abs(sq.z) - 0.012);
  r = umin(r, vec2(star, 3.0));
  // ── 검은 불꽃: 손바닥 위에서 위로 갈래 치며 일렁인다
  vec4 F = ${P.flame};
  vec3 fq = p - F.xyz;
  fq.x += 0.04 * sin(fq.y * 18.0 + 1.0) * smoothstep(-0.05, 0.25, fq.y);
  float taper = mix(1.0, 0.15, clamp((fq.y + 0.08) / 0.42, 0.0, 1.0));
  float flame = length(fq / vec3(F.w * taper, F.w * 2.6, F.w * taper)) - 1.0;
  flame *= F.w * 0.6;
  flame += 0.05 * (noise(fq * vec3(12.0, 6.0, 12.0) + vec3(0.0, -3.0, 0.0)) - 0.5) * smoothstep(-0.1, 0.3, fq.y);
  r = umin(r, vec2(flame, 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 9.0);
  vec4 Rb = ${P.robe};
  vec4 Gd = ${P.gold};
  // 제의: 가운데로 내려오는 금실 영대 두 줄, 아랫단 금 테, 별 무늬 자수
  float stole = smoothstep(0.012, 0.0, abs(abs(p.x) - 0.075) - 0.02) * step(0.0, p.z) * step(p.y, 1.75);
  float hem = smoothstep(0.03, 0.0, abs(p.y - 0.14));
  float stars = smoothstep(0.92, 0.97, noise(p * 26.0)) * step(0.0, p.z) * step(p.y, 1.7);
  float capeEdge = smoothstep(0.02, 0.0, abs(p.y - 1.74)) * step(1.6, p.y);
  vec3 mq = p - ${P.mitre}.xyz;
  float mitreGold = step(0.0, mq.y) * (smoothstep(0.03, 0.0, abs(mq.y - 0.03)) + smoothstep(0.012, 0.0, abs(mq.x)) * step(0.05, mq.y) + smoothstep(0.02, 0.0, abs(mq.y - 0.22)) * 0.0);
  float gold = clamp(stole + hem + stars * 0.8 + capeEdge + mitreGold, 0.0, 1.0);
  vec3 alb = mix(Rb.rgb * (0.7 + 0.6 * g), Gd.rgb * (0.8 + 0.4 * g), gold);
  float rough = mix(Rb.a, Gd.a, gold), spec = mix(0.12, 1.4, gold), irid = 0.0, sss = 0.0, wet = gold * 0.4;
  vec3 emi = vec3(0.0);
  if (id > 3.5) {
    // 불꽃: 속은 빛을 먹는 검정, 가장자리(비스듬한 곳)만 붉게 탄다
    vec3 V = normalize(uCamPos - p);
    float edge = pow(1.0 - max(dot(n, V), 0.0), 2.0);
    vec4 Fr = ${P.fire};
    alb = vec3(0.0); rough = 1.0; spec = 0.0; wet = 0.0;
    emi = Fr.rgb * Fr.a * (pow(edge, 3.0) * 1.4 + 0.004) * (0.6 + 0.8 * noise(p * 20.0));
  } else if (id > 2.5) {
    alb = Gd.rgb; rough = Gd.a; spec = 1.6; wet = 0.5;
  } else if (id > 1.5) {
    // 창백한 살갗: 얼굴이 있어야 할 자리까지 매끈하다
    vec4 Sk = ${P.skin};
    alb = Sk.rgb * (0.85 + 0.25 * g); rough = Sk.a; spec = 0.5; sss = 0.6; wet = 0.25;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
