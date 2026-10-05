// 교단 입문자 (1층) — 등이 활처럼 굽은 키 큰 형체, 젖어 늘어진 해진 로브와 깊은 두건. 두건 속 어둠엔
// 보랏빛 눈 두 점. 허리엔 밧줄 띠와 매듭에 매단 뼈 부적, 한 손엔 낮게 든 등불, 다른 손엔 물결 모양 의식용 단검.
// 사람형 레시피의 본보기: 몸을 굽히는 좌표 변환 → 로브(sdRobe) + 두건 + 소매(이어진 원뿔) + 뼈마디 손 + 소품.
// 얼굴은 재질 99(완전한 어둠), 눈은 빛나는 점(uL)으로.

export default function initiate() {
  const handR = [0.26, 0.86, 0.5];
  const lantern = [handR[0] + 0.01, handR[1] - 0.33, handR[2] + 0.04];
  const head = [0.0, 1.66, 0.36];
  return {
    preset: 'act1',
    cam: { pos: [1.6, 0.62, 5.6], target: [0, 0.95, 0.1], fov: 1.85 },
    light: { pt: lantern, ptCol: [1.3, 0.72, 0.26], rim: 2.1, fillCol: [0.2, 0.13, 0.07], amb: [0.022, 0.028, 0.03] },
    frame: { fill: 0.92 },
    arrays: {
      uL: [
        [head[0] - 0.042, head[1] - 0.01, head[2] + 0.09, 0.0075],
        [head[0] + 0.042, head[1] - 0.014, head[2] + 0.09, 0.0075],
        [lantern[0], lantern[1], lantern[2], 0.13],
      ],
      uLC: [
        [0.78, 0.45, 1.0, 1.3],
        [0.78, 0.45, 1.0, 1.3],
        [1.0, 0.6, 0.25, 0.32],
      ],
    },
    glsl: /* glsl */ `
const vec3 HAND_L = vec3(-0.33, 0.8, 0.44);
const vec3 HAND_R = vec3(${handR.join(', ')});
const vec3 LANTERN = vec3(${lantern.join(', ')});
const vec3 HEAD = vec3(${head.join(', ')});

float bend(float y) { float h = max(y - 0.8, 0.0); return 0.45 * h * h; }

/** 손: 손바닥 + 길고 마른 손가락 넷, 마디가 불거졌다 (dir = 손가락이 향하는 방향) */
float hand(vec3 p, vec3 c, vec3 dir) {
  float d = sdEllipsoid(p - c, vec3(0.038, 0.048, 0.034));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.017;
    vec3 a = c + vec3(o, -0.02, 0.0);
    vec3 m = a + dir * (0.07 - abs(o) * 0.8) + vec3(o * 0.4, 0.0, 0.0);
    vec3 e = m + normalize(dir + vec3(0.0, -0.6, 0.3)) * 0.05;
    d = smin(d, sdRoundCone(p, a, m, 0.0095, 0.007), 0.01);
    d = smin(d, sdRoundCone(p, m, e, 0.007, 0.004), 0.005);
    d = smin(d, sdSphere(p - m, 0.0095), 0.004);
  }
  return d;
}

vec2 sdf(vec3 p) {
  vec3 b = p;
  b.z -= bend(b.y);
  // ── 해진 로브: 키가 크고 밑단은 들쭉날쭉 찢겨 바닥에 끌린다
  float robe = sdRobe(b, 1.55, 0.2, 0.46, 9.0, 0.05);
  robe = max(robe, -(b.y - 0.01 - 0.18 * fbm3(vec3(b.x * 8.0, 0.0, b.z * 8.0))));
  float torso = sdEllipsoid(b - vec3(0.0, 1.38, -0.01), vec3(0.25, 0.23, 0.18));
  robe = smin(robe, torso, 0.12);
  // 굽은 등의 혹
  robe = smin(robe, sdEllipsoid(b - vec3(0.0, 1.5, -0.1), vec3(0.2, 0.15, 0.13)), 0.1);
  // 소매: 넓고 끝이 해졌다 (어깨 → 팔꿈치 → 손목)
  vec3 elL = vec3(-0.4, 1.12, 0.3);
  vec3 elR = vec3(0.38, 1.14, 0.32);
  float sl = min(sdRoundCone(p, vec3(-0.24, 1.48, bend(1.48) - 0.02), elL, 0.1, 0.085), sdRoundCone(p, elL, HAND_L + vec3(0.0, 0.08, -0.05), 0.085, 0.11));
  float sr = min(sdRoundCone(p, vec3(0.24, 1.48, bend(1.48) - 0.02), elR, 0.1, 0.085), sdRoundCone(p, elR, HAND_R + vec3(0.0, 0.08, -0.05), 0.085, 0.11));
  float sleeves = min(sl, sr);
  // 소매 끝을 비우고 해진 가장자리
  sleeves = max(sleeves, -min(sdSphere(p - HAND_L - vec3(0.0, 0.05, 0.0), 0.075), sdSphere(p - HAND_R - vec3(0.0, 0.05, 0.0), 0.075)));
  robe = smin(robe, sleeves, 0.05);
  // ── 깊은 두건: 앞으로 길게 나와 얼굴을 삼킨다
  vec3 hq = p - HEAD;
  hq.yz = rot(0.35) * hq.yz;
  float hood = sdEllipsoid(hq - vec3(0.0, 0.01, -0.02), vec3(0.17, 0.2, 0.19));
  hood = smin(hood, sdRoundCone(hq, vec3(0.0, 0.1, -0.06), vec3(0.0, 0.26, -0.2), 0.11, 0.02), 0.06);
  float face = sdEllipsoid(hq - vec3(0.0, -0.04, 0.17), vec3(0.11, 0.15, 0.17));
  hood = max(hood, -face);
  hood = max(hood, -sdEllipsoid(hq - vec3(0.0, -0.02, 0.0), vec3(0.14, 0.17, 0.16)));
  robe = smin(robe, hood, 0.05);
  if (robe < 0.04) robe += 0.005 * (fbm3(p * 22.0) - 0.5);
  vec2 r = vec2(robe, 1.0);
  // 두건 속은 빛을 먹는 어둠
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.02, -0.02), vec3(0.12, 0.15, 0.13)), 99.0));
  // ── 밧줄 띠와 뼈 부적
  float belt = sdTorus(b - vec3(0.0, 1.0, 0.0), vec2(0.275, 0.016));
  float knotPos = 0.0;
  vec3 kn = vec3(0.1, 0.99, 0.26 + bend(0.99));
  belt = min(belt, sdSphere(p - kn, 0.028));
  belt = min(belt, sdRoundCone(p, kn, kn + vec3(0.01, -0.28, 0.02), 0.012, 0.009));
  belt = min(belt, sdRoundCone(p, kn, kn + vec3(-0.03, -0.22, 0.03), 0.011, 0.009));
  r = umin(r, vec2(belt, 5.0));
  vec3 cq = p - (kn + vec3(-0.03, -0.27, 0.035));
  float charm = sdRoundBox(cq, vec3(0.022, 0.04, 0.008), 0.006);
  charm = min(charm, sdRoundCone(cq, vec3(0.0, -0.04, 0.0), vec3(0.0, -0.075, 0.0), 0.012, 0.004));
  r = umin(r, vec2(charm, 6.0));
  // ── 마른 손
  float hl = hand(p, HAND_L, normalize(vec3(0.05, -1.0, 0.25)));
  float hr = hand(p, HAND_R, normalize(vec3(-0.1, -0.6, 0.6)));
  r = umin(r, vec2(min(hl, hr), 2.0));
  // ── 등불
  float chain = sdCapsule(p, HAND_R + vec3(0.0, -0.05, 0.03), LANTERN + vec3(0.0, 0.11, 0.0), 0.006);
  vec3 lq = p - LANTERN;
  float cage = sdRoundBox(lq, vec3(0.055, 0.085, 0.055), 0.01);
  cage = max(cage, -sdBox(lq, vec3(0.044, 0.068, 0.08)));
  cage = max(cage, -sdBox(lq, vec3(0.08, 0.068, 0.044)));
  cage = min(cage, sdCappedCone(lq - vec3(0.0, 0.105, 0.0), 0.022, 0.065, 0.018));
  r = umin(r, vec2(min(chain, cage), 3.0));
  r = umin(r, vec2(sdEllipsoid(lq, vec3(0.036, 0.056, 0.036)), 4.0));
  // ── 물결 모양 의식용 단검 (손가락 사이로 늘어뜨림)
  vec3 bq = p - (HAND_L + vec3(0.01, -0.21, 0.05));
  bq.xy = rot(0.12) * bq.xy;
  bq.x -= 0.008 * sin(bq.y * 45.0);
  float blade = sdBox(bq, vec3(0.012 * (0.2 + 0.8 * smoothstep(-0.16, 0.1, bq.y)), 0.15, 0.003));
  float hilt = sdBox(bq - vec3(0.0, 0.155, 0.0), vec3(0.03, 0.006, 0.008));
  r = umin(r, vec2(min(blade, hilt), 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 거친 모직 로브: 얼룩, 젖어 무거운 밑단
    float dirt = fbm3(p * 5.0);
    float weave = 0.85 + 0.15 * noise(p * 140.0);
    float wetHem = smoothstep(0.45, 0.05, p.y);
    vec3 alb = vec3(0.032, 0.03, 0.033) * (0.55 + 0.8 * dirt) * weave * (1.0 - wetHem * 0.45);
    return Mat(alb, 0.92 - wetHem * 0.5, 0.06 + wetHem * 0.5, vec3(0.0), 0.0, 0.0, wetHem * 0.5);
  }
  // 잿빛으로 마른 살갗
  if (id < 2.5) return Mat(vec3(0.12, 0.112, 0.1), 0.6, 0.3, vec3(0.0), 0.0, 0.4, 0.1);
  if (id < 3.5) return Mat(vec3(0.1, 0.09, 0.08), 0.3, 1.4, vec3(0.0), 0.0, 0.0, 0.7);
  if (id < 4.5) return Mat(vec3(0.0), 0.1, 1.0, vec3(2.4, 1.3, 0.45), 0.0, 0.0, 0.3);
  if (id < 5.5) return Mat(vec3(0.06, 0.05, 0.035), 0.9, 0.1, vec3(0.0), 0.0, 0.0, 0.1);
  // 뼈 부적: 희미한 보랏빛 문양
  float sig = smoothstep(0.004, 0.0, abs(length((p - vec3(0.07, 0.69, 0.4)).xy) - 0.015));
  return Mat(vec3(0.18, 0.165, 0.13), 0.5, 0.4, vec3(0.6, 0.25, 1.0) * sig * 0.6, 0.0, 0.3, 0.2);
}
`,
  };
}
