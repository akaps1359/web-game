// 부두 깡패 (1층) — 등을 말고 고개를 앞으로 내민 장신의 거한. 깃을 세운 긴 외투, 눈썹까지 눌러쓴 헌팅캡.
// 챙 그늘에 얼굴이 묻혔고, 입가의 담뱃불만이 입술과 턱을 붉게 핥는다.
// 한 손은 녹슨 쇠파이프를 어깨에 걸쳐 쥐었고, 늘어뜨린 다른 손은 피 밴 붕대를 감은 주먹.
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};

export default function thug() {
  const head = [0.0, 1.585, 0.36];
  const ember = [head[0] + 0.078, head[1] - 0.112, head[2] + 0.1];
  const hand = [0.25, 1.17, 0.4];
  const pdir = norm([0.17, 0.82, -0.55]);
  const pipeA = hand.map((v, i) => v - pdir[i] * 0.14);
  const pipeB = hand.map((v, i) => v + pdir[i] * 0.86);
  return {
    preset: 'act1',
    cam: { pos: [1.9, 0.55, 4.25], target: [0.05, 0.98, 0.08], fov: 1.85 },
    light: { rim: 2.3, fillCol: [0.22, 0.14, 0.075], amb: [0.022, 0.03, 0.032] },
    frame: { fill: 0.93 },
    arrays: {
      uL: [
        [ember[0], ember[1], ember[2], 0.008],
        [head[0] - 0.042, head[1] + 0.0, head[2] + 0.108, 0.0045],
        [head[0] + 0.04, head[1] - 0.003, head[2] + 0.112, 0.0045],
      ],
      uLC: [
        [1.0, 0.42, 0.1, 1.3],
        [1.0, 0.6, 0.3, 0.85],
        [1.0, 0.6, 0.3, 0.85],
      ],
    },
    glsl: /* glsl */ `
const vec3 HEAD = vec3(${head.join(', ')});
const vec3 EMBER = vec3(${ember.join(', ')});
const vec3 HAND_R = vec3(${hand.join(', ')});
const vec3 PIPE_A = vec3(${pipeA.join(', ')});
const vec3 PIPE_B = vec3(${pipeB.join(', ')});
const vec3 PDIR = vec3(${pdir.join(', ')});
const vec3 FIST = vec3(-0.36, 0.82, 0.3);
const vec3 SH_L = vec3(-0.23, 1.43, 0.145);
const vec3 EL_L = vec3(-0.34, 1.12, 0.2);
const vec3 SH_R = vec3(0.23, 1.44, 0.15);
const vec3 EL_R = vec3(0.35, 1.13, 0.2);

// 등이 굽는다: 위로 갈수록 앞(+z)으로
float bend(float y) { float h = max(y - 0.9, 0.0); return 0.5 * h * h; }

float folds(vec3 q, float freq, float amp) {
  float a = atan(q.z, q.x);
  return amp * (sin(a * freq + 2.5 * noise(q * 3.0)) * 0.6 + sin(a * freq * 2.3 + 1.7 + 3.0 * noise(q * 5.0)) * 0.4);
}

vec2 sdf(vec3 p) {
  vec3 b = p;
  b.z -= bend(b.y);

  // ── 외투 윗몸: 말린 등, 비탈진 어깨
  float coat = sdEllipsoid(b - vec3(0.0, 1.31, 0.02), vec3(0.235, 0.21, 0.165));
  coat = smin(coat, sdEllipsoid(b - vec3(0.0, 1.37, -0.05), vec3(0.22, 0.17, 0.16)), 0.08);
  coat = smin(coat, sdEllipsoid(b - vec3(0.0, 1.1, 0.02), vec3(0.21, 0.17, 0.155)), 0.1);
  coat = smin(coat, sdEllipsoid(b - vec3(0.0, 1.47, -0.03), vec3(0.15, 0.07, 0.11)), 0.08);
  coat = smin(coat, sdSphere(b - vec3(-0.215, 1.43, 0.0), 0.095), 0.08);
  coat = smin(coat, sdSphere(b - vec3(0.215, 1.44, 0.0), 0.095), 0.08);
  // 긴 자락: 허리 아래로 퍼지는 세로 주름, 해진 밑단
  float yy = b.y;
  vec3 sq = b - vec3(0.0, 0.0, 0.0);
  float sr = mix(0.32, 0.215, smoothstep(0.28, 1.1, yy));
  float sk0 = (length(sq.xz * vec2(1.0, 1.3)) - sr) * 0.7;
  if (sk0 < 0.08) sr += folds(sq, 7.0, 0.02 * smoothstep(1.0, 0.45, yy));
  float skirt = (length(sq.xz * vec2(1.0, 1.3)) - sr) * 0.7;
  float hem = 0.3 + 0.06 * fbm3(vec3(b.x * 6.0, 0.0, b.z * 6.0)) - 0.05 * smoothstep(0.0, -0.25, b.z);
  skirt = max(skirt, max(hem - yy, yy - 1.2));
  // 앞자락이 벌어진다
  skirt = max(skirt, -sdBox(b - vec3(0.0, 0.45, 0.3), vec3(0.02 + 0.11 * smoothstep(0.95, 0.3, yy), 0.5, 0.17)));
  coat = smin(coat, skirt, 0.06);
  // 넓은 옷깃 (가슴 앞에 접힌 두 장)
  vec3 lq = b - vec3(0.0, 1.33, 0.188);
  lq.x = abs(lq.x);
  lq.xy = rot(-0.35) * lq.xy;
  float lapel = sdRoundBox(lq - vec3(0.07, 0.0, 0.0), vec3(0.055, 0.15, 0.012), 0.008);
  lapel = max(lapel, -(lq.x - 0.02 - 0.5 * max(lq.y - 0.05, 0.0)));
  coat = smin(coat, lapel, 0.015);
  // 세운 깃
  vec3 nq = b - vec3(0.0, 1.52, 0.03);
  float collar = abs(length(nq.xz * vec2(1.0, 1.1)) - 0.115) - 0.02;
  float ctop = 0.07 + 0.05 * smoothstep(0.05, -0.12, nq.z) + 0.01 * sin(atan(nq.z, nq.x) * 5.0);
  collar = max(collar, max(-nq.y - 0.03, nq.y - ctop));
  collar = max(collar, nq.z - 0.055);
  coat = smin(coat, collar, 0.025);
  // 소매
  float sl = sdRoundCone(p, SH_L, EL_L, 0.085, 0.07);
  sl = min(sl, sdRoundCone(p, EL_L, FIST + vec3(0.02, 0.09, -0.04), 0.07, 0.06));
  float sr2 = sdRoundCone(p, SH_R, EL_R, 0.085, 0.07);
  sr2 = min(sr2, sdRoundCone(p, EL_R, HAND_R + vec3(0.03, -0.06, -0.08), 0.07, 0.06));
  float sleeves = min(sl, sr2);
  coat = smin(coat, sleeves, 0.05);
  if (coat < 0.04) {
    coat += 0.007 * sin(p.y * 60.0 + 4.0 * noise(p * 7.0)) * smoothstep(0.16, 0.0, min(length(p - EL_L), length(p - EL_R)));
    coat += 0.004 * (fbm3(p * 20.0) - 0.5);
  }
  vec2 r = vec2(coat, 1.0);
  // 겹여밈 단추 두 줄
  vec3 uq = b - vec3(0.0, 1.06, 0.0);
  uq.x = abs(uq.x) - 0.075;
  uq.y = uq.y - clamp(floor(uq.y / 0.1 + 0.5), 0.0, 2.0) * 0.1;
  float buttons = sdSphere(uq - vec3(0.0, 0.0, 0.17), 0.014);
  r = umin(r, vec2(buttons, 6.0));

  // ── 바지와 장화
  vec3 knL = vec3(-0.17, 0.5, 0.1);
  vec3 knR = vec3(0.19, 0.5, 0.02);
  vec3 anL = vec3(-0.2, 0.11, 0.1);
  vec3 anR = vec3(0.23, 0.11, -0.04);
  float legs = min(sdRoundCone(p, vec3(-0.1, 0.92, 0.0), knL, 0.1, 0.075), sdRoundCone(p, knL, anL, 0.075, 0.058));
  legs = min(legs, min(sdRoundCone(p, vec3(0.11, 0.92, 0.0), knR, 0.1, 0.075), sdRoundCone(p, knR, anR, 0.075, 0.058)));
  if (legs < 0.03) legs += 0.008 * (noise(p * vec3(14.0, 34.0, 14.0)) - 0.5);
  r = umin(r, vec2(legs, 3.0));
  // 장화: 굽과 밑창, 앞코가 닳았다
  float boots = 1e5;
  for (int i = 0; i < 2; i++) {
    vec3 an = i == 0 ? anL : anR;
    vec3 bq = p - vec3(an.x, 0.0, an.z + 0.06);
    float shaft = sdCappedCone(p - an - vec3(0.0, 0.07, -0.005), 0.12, 0.066, 0.07);
    float foot = sdRoundBox(bq - vec3(0.0, 0.05, 0.0), vec3(0.052, 0.04, 0.13), 0.035);
    foot = smin(foot, sdEllipsoid(bq - vec3(0.0, 0.055, 0.09), vec3(0.055, 0.045, 0.06)), 0.03);
    float sole = sdRoundBox(bq - vec3(0.0, 0.012, 0.005), vec3(0.058, 0.012, 0.15), 0.008);
    boots = min(boots, min(smin(shaft, foot, 0.05), sole));
  }
  r = umin(r, vec2(boots, 6.0));

  // ── 머리와 모자
  vec3 hq = p - HEAD;
  float hb = length(hq) - 0.24;
  if (hb < 0.02) {
    hq.yz = rot(0.18) * hq.yz;
    float skull = sdEllipsoid(hq, vec3(0.098, 0.115, 0.11));
    float jaw = sdEllipsoid(hq - vec3(0.0, -0.075, 0.04), vec3(0.09, 0.06, 0.08));
    vec3 aq = vec3(abs(hq.x), hq.y, hq.z);
    float cheek = sdEllipsoid(aq - vec3(0.055, -0.02, 0.065), vec3(0.036, 0.032, 0.036));
    float brow = sdEllipsoid(hq - vec3(0.0, 0.025, 0.092), vec3(0.078, 0.02, 0.028));
    float nose = sdRoundCone(hq, vec3(0.0, 0.01, 0.105), vec3(0.008, -0.036, 0.13), 0.014, 0.02);
    float face = smin(skull, jaw, 0.045);
    face = smin(face, cheek, 0.03);
    face = smin(face, brow, 0.02);
    face = smin(face, nose, 0.015);
    face = smax(face, -sdSphere(aq - vec3(0.038, 0.0, 0.11), 0.02), 0.01);
    face = smin(face, sdEllipsoid(aq - vec3(0.096, -0.01, -0.01), vec3(0.014, 0.032, 0.023)), 0.01);
    face += 0.003 * (fbm3(p * 40.0) - 0.5);
    r = umin(r, vec2(face, 2.0));
    vec3 cq = hq - vec3(0.0, 0.07, 0.01);
    cq.yz = rot(0.22) * cq.yz;
    float crown = sdEllipsoid(cq, vec3(0.133, 0.065, 0.145));
    crown = smin(crown, sdEllipsoid(cq - vec3(0.0, 0.012, 0.065), vec3(0.126, 0.05, 0.092)), 0.04);
    crown = max(crown, -(cq.y + 0.026));
    vec3 bq = hq - vec3(0.0, 0.042, 0.14);
    bq.yz = rot(0.45) * bq.yz;
    float brim = sdEllipsoid(bq, vec3(0.118, 0.011, 0.07));
    brim = max(brim, -bq.z - 0.032);
    float cap = smin(crown, brim, 0.014);
    cap += 0.002 * (noise(p * 90.0) - 0.5);
    r = umin(r, vec2(cap, 4.0));
  } else {
    r = umin(r, vec2(hb, 2.0));
  }
  float neck = sdRoundCone(p, vec3(0.0, 1.46, 0.17), HEAD + vec3(0.0, -0.07, -0.04), 0.088, 0.075);
  r = umin(r, vec2(neck, 2.0));

  // ── 손: 쇠파이프를 쥔 손 / 붕대 감은 주먹
  float hbnd = min(length(p - HAND_R), length(p - FIST)) - 0.14;
  if (hbnd < 0.02) {
    // 파이프를 감아쥔 손가락
    vec3 s1 = normalize(cross(PDIR, vec3(0.0, 0.0, 1.0)));
    vec3 s2 = cross(PDIR, s1);
    float grip = sdEllipsoid(p - HAND_R - s2 * 0.035, vec3(0.05, 0.06, 0.05));
    for (int i = 0; i < 4; i++) {
      vec3 c = HAND_R + PDIR * ((float(i) - 1.5) * 0.024);
      vec3 q = p - c;
      float along = dot(q, PDIR);
      vec2 rq = vec2(dot(q, s1), dot(q, s2));
      float ring = length(vec2(length(rq) - 0.04, along)) - 0.0125;
      ring = max(ring, -dot(rq, vec2(0.3, -1.0)));
      grip = smin(grip, ring, 0.012);
    }
    float fist = sdEllipsoid(p - FIST, vec3(0.055, 0.065, 0.058));
    for (int i = 0; i < 4; i++) {
      float o = (float(i) - 1.5) * 0.023;
      fist = smin(fist, sdSphere(p - FIST - vec3(o, -0.038, 0.042), 0.02), 0.016);
    }
    fist = smin(fist, sdRoundCone(p, FIST + vec3(0.04, 0.0, 0.03), FIST + vec3(0.02, -0.03, 0.06), 0.018, 0.014), 0.012);
    r = umin(r, vec2(min(grip, fist), 2.0));
    float wrap = abs(sdEllipsoid(p - FIST - vec3(0.0, 0.005, 0.004), vec3(0.06, 0.036, 0.06))) - 0.006;
    wrap = max(wrap, fist - 0.011);
    r = umin(r, vec2(wrap, 9.0));
  } else {
    r = umin(r, vec2(hbnd + 0.06, 2.0));
  }

  // ── 쇠파이프: 어깨에 걸쳤다. 위쪽 끝엔 무거운 이음쇠
  float pipe = sdCapsule(p, PIPE_A, PIPE_B, 0.024);
  if (pipe < 0.08) {
    pipe = min(pipe, sdCapsule(p, PIPE_B - PDIR * 0.1, PIPE_B - PDIR * 0.005, 0.038));
    vec3 side = normalize(cross(PDIR, vec3(0.0, 0.0, 1.0)));
    pipe = min(pipe, sdCapsule(p, PIPE_B - PDIR * 0.055, PIPE_B - PDIR * 0.055 + side * 0.085, 0.028));
    pipe = min(pipe, sdCapsule(p, PIPE_A - PDIR * 0.005, PIPE_A + PDIR * 0.035, 0.031));
  }
  r = umin(r, vec2(pipe, 5.0));

  // ── 담배와 불씨
  float cig = sdCapsule(p, HEAD + vec3(0.045, -0.1, 0.105), EMBER - vec3(0.004, -0.002, 0.004), 0.007);
  r = umin(r, vec2(cig, 7.0));
  r = umin(r, vec2(sdSphere(p - EMBER, 0.009), 8.0));
  return r;
}

/** 담뱃불이 비추는 빛 (가까운 곳만, 날카롭게 사그라든다) */
vec3 emberLight(vec3 p, vec3 n, vec3 alb) {
  vec3 l = EMBER - p;
  float d = length(l);
  float k = max(dot(n, l / d), 0.0) * exp(-d * 30.0);
  return alb * vec3(3.2, 1.2, 0.3) * k * 1.7;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    float dirt = fbm3(p * 4.5);
    float weave = 0.85 + 0.15 * noise(p * 120.0);
    float wetTop = smoothstep(0.25, 0.9, n.y);
    vec3 alb = vec3(0.03, 0.032, 0.035) * (0.55 + 0.8 * dirt) * weave;
    Mat m = Mat(alb, 0.85 - wetTop * 0.35, 0.12 + wetTop * 0.35, vec3(0.0), 0.0, 0.0, 0.1 + wetTop * 0.35);
    m.emi = emberLight(p, n, alb);
    return m;
  }
  if (id < 2.5) {
    float blot = fbm3(p * 9.0);
    float stub = smoothstep(-0.05, -0.1, (p - HEAD).y) * 0.6;
    vec3 alb = vec3(0.12, 0.08, 0.065) * (0.7 + 0.5 * blot) * (1.0 - stub * 0.5);
    Mat m = Mat(alb, 0.55, 0.35, vec3(0.0), 0.0, 0.4, 0.2);
    m.emi = emberLight(p, n, alb) * 1.4;
    return m;
  }
  if (id < 3.5) return Mat(vec3(0.024, 0.022, 0.02) * (0.7 + 0.6 * fbm3(p * 6.0)), 0.9, 0.08, vec3(0.0), 0.0, 0.0, 0.05);
  if (id < 4.5) {
    float tweed = 0.8 + 0.2 * noise(p * 160.0) + 0.15 * noise(p * 30.0);
    vec3 alb = vec3(0.036, 0.033, 0.028) * tweed;
    Mat m = Mat(alb, 0.88, 0.1, vec3(0.0), 0.0, 0.0, 0.15);
    m.emi = emberLight(p, n, alb);
    return m;
  }
  if (id < 5.5) {
    float rust = fbm3(p * 14.0);
    float bare = smoothstep(0.62, 0.72, noise(p * 22.0));
    float blood = smoothstep(1.6, 1.95, p.y) * smoothstep(0.35, 0.6, fbm3(p * 9.0 + 3.0));
    vec3 alb = mix(vec3(0.045, 0.026, 0.018), vec3(0.075, 0.04, 0.024), rust);
    alb = mix(alb, vec3(0.08, 0.08, 0.085), bare);
    alb = mix(alb, vec3(0.05, 0.006, 0.005), blood);
    return Mat(alb, mix(0.75, 0.3, max(bare, blood)), mix(0.35, 1.3, max(bare, blood)), vec3(0.0), 0.0, 0.0, blood * 0.8);
  }
  if (id < 6.5) return Mat(vec3(0.018, 0.015, 0.012), 0.35, 0.8, vec3(0.0), 0.0, 0.0, 0.6);
  if (id < 7.5) return Mat(vec3(0.2, 0.18, 0.15), 0.8, 0.1, emberLight(p, n, vec3(0.2)), 0.0, 0.3, 0.0);
  if (id < 8.5) return Mat(vec3(0.0), 0.5, 0.2, vec3(3.0, 0.9, 0.2), 0.0, 0.0, 0.0);
  float stain = smoothstep(0.45, 0.7, fbm3(p * 30.0));
  return Mat(mix(vec3(0.1, 0.09, 0.075), vec3(0.06, 0.015, 0.01), stain), 0.9, 0.1, vec3(0.0), 0.0, 0.3, 0.1);
}
`,
  };
}
