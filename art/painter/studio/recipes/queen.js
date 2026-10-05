// 밀수조직 두목 (1층 수호자) — 부두 밀수조직의 여두목.
// 키 큰 몸에 깃을 높이 세운 검자줏빛 긴 외투, 챙 넓은 모자엔 젖어 늘어진 검은 깃털.
// 얼굴은 금 간 하얀 도자기 가면으로 가렸고 (그린 듯한 미소, 눈구멍 속 금빛), 검은 머리칼이 어깨로 흘러내린다.
// 가슴을 가로지른 탄띠엔 권총들과 금사슬. 한 손은 수발총을 겨누고, 한 손엔 커틀러스를 낮게 늘어뜨렸다.
// (셰이더 컴파일이 무거워지지 않게 sdf 안에서는 해시 잡음·둥근 원뿔을 쓰지 않는다 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3, rng } from './k1-kit.js';

export default function queen({ seed = 1 } = {}) {
  const R = rng(seed * 59 + 2);
  const head = [0.0, 1.93, 0.05];
  const sk = new Skel();
  // 다리: 긴 장화 (재질 6)
  sk.group(6, 0.04, 0.0, (s) => {
    s.chain([[-0.1, 1.05, 0.02, 0.085], [-0.13, 0.55, 0.06, 0.07], [-0.14, 0.08, 0.04, 0.065]]);
    s.chain([[-0.14, 0.06, 0.02, 0.055], [-0.15, 0.04, 0.2, 0.045]]);
    s.chain([[0.1, 1.05, 0.0, 0.085], [0.17, 0.56, -0.02, 0.07], [0.2, 0.08, -0.08, 0.065]]);
    s.chain([[0.2, 0.06, -0.1, 0.055], [0.24, 0.04, 0.06, 0.045]]);
  });
  // 소매 (외투, 재질 1)
  const shL = [-0.27, 1.66, -0.02];
  const elL = [-0.38, 1.3, 0.04];
  const wrL = [-0.4, 0.98, 0.18];
  const shR = [0.27, 1.66, -0.02];
  const elR = [0.46, 1.56, 0.32];
  const wrR = [0.5, 1.6, 0.68];
  sk.group(1, 0.04, 0.06, (s) => {
    s.chain([[...shL, 0.075], [...elL, 0.062], [...lerp3(elL, wrL, 0.7), 0.06], [...wrL, 0.085]]);
    s.chain([[...shR, 0.075], [...elR, 0.062], [...lerp3(elR, wrR, 0.7), 0.06], [...wrR, 0.085]]);
  });
  // 장갑 낀 손 (재질 7)
  sk.group(7, 0.01, 0.0, (s) => {
    s.hand(add(wrR, [0.0, -0.01, 0.08]), [0.0, -0.3, 1.0], [0.0, 1.0, 0.3], { len: 0.12, curl: 1.8, r: 0.012, spread: 0.04 });
    s.hand(add(wrL, [0.0, -0.08, 0.04]), [0.0, -1.0, 0.25], [-0.9, 0.0, 0.3], { len: 0.12, curl: 1.8, r: 0.012, spread: 0.04 });
  });
  // 검은 머리칼 (재질 5): 모자 아래에서 어깨와 등으로
  sk.group(5, 0.01, 0.0, (s) => {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.25 + (i / 8) * 1.5);
      const root = add(head, [Math.cos(a) * 0.12, 0.06, -Math.abs(Math.sin(a)) * 0.08 - 0.02]);
      const out = [Math.cos(a) * 0.16, 0, -0.08];
      const L = 0.45 + R() * 0.25;
      s.curve([root, add(root, [out[0] * 0.6, -L * 0.3, out[2]]), add(root, [out[0], -L * 0.7, out[2] - 0.02]), add(root, [out[0] * 0.9 + (R() - 0.5) * 0.06, -L, out[2] - 0.03])], 4, 0.032, 0.012, 0.8);
    }
  });
  // 젖어 늘어진 깃털 장식 (재질 8)
  sk.group(8, 0.03, 0.0, (s) => {
    s.curve([add(head, [0.12, 0.2, 0.0]), add(head, [0.3, 0.3, -0.08]), add(head, [0.42, 0.18, -0.2]), add(head, [0.46, -0.08, -0.25])], 7, 0.055, 0.012, 0.8, (t) => [0, Math.sin(t * 12.0) * 0.012 * t, 0]);
    s.curve([add(head, [0.1, 0.19, 0.04]), add(head, [0.26, 0.26, 0.02]), add(head, [0.36, 0.12, -0.06]), add(head, [0.36, -0.02, -0.08])], 6, 0.04, 0.01, 0.8);
  });
  const arr = sk.pack();
  return {
    preset: 'act1',
    cam: { pos: [-0.9, 0.4, 5.6], target: [0.05, 1.08, 0.15], fov: 1.75 },
    light: { pt: [0.25, 1.45, 1.1], ptCol: [0.55, 0.38, 0.14], rim: 1.2 },
    arrays: {
      ...arr,
      uL: [
        [-0.042, 1.935, 0.205, 0.012],
        [0.042, 1.935, 0.205, 0.012],
        [-0.02, 1.36, 0.25, 0.012],
        [0.12, 1.55, 0.2, 0.008],
        [-0.15, 1.52, 0.17, 0.008],
      ],
      uLC: [
        [1.0, 0.75, 0.3, 1.6],
        [1.0, 0.75, 0.3, 1.6],
        [1.0, 0.8, 0.4, 0.9],
        [1.0, 0.8, 0.4, 0.7],
        [1.0, 0.8, 0.4, 0.7],
      ],
    },
    glsl: /* glsl */ `
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});

// 수발총 (오른손, 앞쪽으로 겨눔)
float pistol(vec3 p) {
  vec3 q = p - vec3(0.5, 1.6, 0.8);
  q.xz = rot(0.55) * q.xz;
  float barrel = sdCapsule(q, vec3(0.0, 0.025, -0.02), vec3(0.0, 0.035, 0.36), 0.022);
  float muzzle = max(length(q.xy - vec2(0.0, 0.035)) - 0.034 - (q.z - 0.3) * 0.25, abs(q.z - 0.34) - 0.04);
  float stock = sdCapsule(q, vec3(0.0, 0.0, -0.02), vec3(0.0, -0.12, -0.12), 0.034);
  float lock = sdBox(q - vec3(0.0, 0.035, 0.03), vec3(0.026, 0.03, 0.06));
  return min(min(barrel, muzzle), min(stock, lock));
}
// 커틀러스 (왼손, 아래로)
float cutlass(vec3 p) {
  vec3 q = p - vec3(-0.41, 0.88, 0.26);
  q.xy = rot(-0.15) * q.xy;
  q.xz = rot(-0.2) * q.xz;
  float t = clamp(-q.y / 0.75, 0.0, 1.0);
  q.z -= 0.08 * t * t;
  float blade = sdBox(q - vec3(0.0, -0.4, 0.0), vec3(0.006, 0.4, mix(0.04, 0.012, t * t)));
  float guard = sdTorus((q - vec3(0.0, 0.03, 0.03)).yxz, vec2(0.055, 0.008));
  return min(blade, guard);
}

vec2 sdf(vec3 p) {
  float bound = sdCapsule(p, vec3(0.0, 0.0, 0.2), vec3(0.0, 2.25, 0.2), 0.9);
  if (bound > 0.3) return vec2(bound, 1.0);
  float y = p.y;
  float ang = atan(p.z, p.x);
  // ── 외투: 좁은 허리에서 바닥까지 퍼진 자락 (앞이 갈라짐), 위는 꼭 맞는 몸판 ──
  float t = clamp(y / 1.12, 0.0, 1.0);
  float rad = mix(0.5, 0.22, pow(t, 0.9)) + 0.05 * (1.0 - t) * (sin(ang * 6.0 + 0.4) * 0.6 + sin(ang * 13.0 + 1.9) * 0.4);
  float skirtS = (length(p.xz * vec2(0.95, 1.1)) - rad) * 0.75;
  float skirt = abs(skirtS) - 0.02;
  float slit = max(abs(p.x - 0.05) - 0.03 - (1.1 - y) * 0.28, -p.z);
  skirt = max(skirt, -slit);
  skirt = max(skirt, max(0.06 + 0.04 * sin(ang * 5.0) + 0.02 * sin(ang * 17.0) - y, y - 1.15));
  float waist = sdEllipsoid(p - vec3(0.0, 1.18, 0.0), vec3(0.17, 0.16, 0.13));
  float bodice = sdEllipsoid(p - vec3(0.0, 1.46, 0.01), vec3(0.23, 0.24, 0.16));
  vec3 ps = vec3(abs(p.x), p.y, p.z);
  bodice = smin(bodice, sdEllipsoid(ps - vec3(0.09, 1.47, 0.09), vec3(0.09, 0.08, 0.07)), 0.04);
  float shd = sdEllipsoid(p - vec3(0.0, 1.64, -0.01), vec3(0.32, 0.08, 0.13));
  float coat = smin(skirt, smin(waist, smin(bodice, shd, 0.08), 0.1), 0.06);
  // 높이 세운 깃
  vec3 cq = p - vec3(0.0, 1.78, -0.01);
  float collar = abs(sdCylinder(cq, 0.1, 0.11 + 0.1 * (cq.y + 0.1))) - 0.012;
  collar = max(collar, -(cq.z - 0.06 + cq.y * 0.3));
  coat = smin(coat, collar, 0.03);
  coat += 0.003 * sin(y * 37.0 + sin(ang * 5.0) * 2.0);
  vec2 r = vec2(coat, 1.0);
  // ── 탄띠: 오른어깨에서 왼허리로, 금 버클과 권총 손잡이 ──
  vec3 bq = p - vec3(0.0, 1.38, 0.0);
  bq.xy = rot(-0.7) * bq.xy;
  float belt = max(abs(length(bq.xz * vec2(1.0, 1.25)) - 0.235) - 0.014, abs(bq.y) - 0.035);
  r = umin(r, vec2(belt, 7.0));
  float gold = length(p - vec3(-0.02, 1.36, 0.22)) - 0.028;
  vec3 gc = p - vec3(0.0, 1.62, 0.0);
  float chains = max(abs(length(gc.xz * vec2(1.0, 1.2)) - 0.2 + gc.y * 0.4) - 0.007, abs(gc.y + 0.08 + 0.05 * gc.x * gc.x) - 0.009);
  chains = max(chains, -gc.z);
  r = umin(r, vec2(min(gold, chains), 4.0));
  float grips = min(sdCapsule(p, vec3(0.13, 1.5, 0.19), vec3(0.18, 1.6, 0.25), 0.025), sdCapsule(p, vec3(-0.12, 1.24, 0.2), vec3(-0.18, 1.32, 0.26), 0.025));
  r = umin(r, vec2(grips, 9.0));
  // ── 머리와 도자기 가면 ──
  vec3 h = p - HEAD;
  h.yz = rot(0.1) * h.yz;
  float skull = sdEllipsoid(h, vec3(0.1, 0.125, 0.11));
  skull = smin(skull, sdCapsule(p, vec3(0.0, 1.66, -0.01), vec3(0.0, 1.85, 0.02), 0.045), 0.04);
  r = umin(r, vec2(skull, 5.0));
  vec3 mq = h - vec3(0.0, -0.005, 0.03);
  float mask = sdEllipsoid(mq, vec3(0.095, 0.125, 0.1));
  mask = max(mask, -(mq.z - 0.02));
  vec3 ms = vec3(abs(mq.x), mq.y, mq.z);
  mask = smin(mask, sdEllipsoid(ms - vec3(0.0, -0.005, 0.1), vec3(0.016, 0.04, 0.02)), 0.02);
  float eyeH = sdEllipsoid(ms - vec3(0.042, 0.02, 0.09), vec3(0.022, 0.012, 0.05));
  mask = smax(mask, -eyeH, 0.004);
  r = umin(r, vec2(mask, 2.0));
  r = umin(r, vec2(sdEllipsoid(ms - vec3(0.042, 0.02, 0.07), vec3(0.02, 0.011, 0.02)), 99.0));
  // ── 챙 넓은 모자 (앞으로 기울어 눈을 가린다) ──
  vec3 hq = h - vec3(0.0, 0.1, -0.01);
  hq.yz = rot(0.18) * hq.yz;
  hq.xy = rot(-0.12) * hq.xy;
  float crown = sdEllipsoid(hq - vec3(0.0, 0.045, 0.0), vec3(0.12, 0.075, 0.13));
  float hr = length(hq.xz);
  float brim = max(abs(hq.y - 0.05 * smoothstep(0.14, 0.34, hr) * (1.0 + 0.7 * sin(atan(hq.x, hq.z) * 2.0 + 1.0))) - 0.009, hr - 0.34);
  r = umin(r, vec2(min(crown, brim), 8.0));
  // ── 사슬 무리: 다리·소매·손·머리칼·깃털 ──
  r = skel(p, r);
  if (length(p - vec3(0.55, 1.6, 0.85)) - 0.4 < r.x) r = umin(r, vec2(pistol(p), 9.0));
  if (length(p - vec3(-0.44, 0.5, 0.3)) - 0.6 < r.x) r = umin(r, vec2(cutlass(p), 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검자줏빛 두꺼운 천 외투: 바랜 얼룩, 젖은 밑단, 금실 테두리는 생략
    float dirt = fbm3(p * vec3(4.0, 1.6, 4.0));
    float weave = 0.85 + 0.15 * noise(p * vec3(150.0, 40.0, 150.0));
    float wetHem = smoothstep(0.4, 0.05, p.y);
    vec3 alb = vec3(0.06, 0.03, 0.045) * (0.5 + 0.8 * dirt) * weave;
    return Mat(alb, 0.7 - wetHem * 0.35, 0.22 + wetHem * 0.4, vec3(0.0), 0.02, 0.0, 0.15 + wetHem * 0.5);
  }
  if (id < 2.5) {
    // 하얀 도자기 가면: 반들반들, 금 간 틈은 검다, 붉게 그린 웃는 입
    float crack = smoothstep(0.045, 0.0, ridge(p * 16.0)) * smoothstep(0.35, 0.6, noise(p * 6.0));
    vec3 q = p - HEAD;
    float lip = smoothstep(0.012, 0.0, abs(q.y + 0.065 - 30.0 * q.x * q.x)) * step(abs(q.x), 0.05);
    vec3 alb = vec3(0.42, 0.4, 0.37) * (1.0 - crack * 0.9);
    alb = mix(alb, vec3(0.18, 0.02, 0.02), lip);
    return Mat(alb, 0.15, 1.1, vec3(0.0), 0.0, 0.2, 0.4);
  }
  if (id < 3.5) {
    float rust = smoothstep(0.45, 0.75, fbm3(p * 14.0));
    return Mat(mix(vec3(0.05, 0.05, 0.052), vec3(0.06, 0.03, 0.012), rust), mix(0.55, 0.85, rust), mix(0.45, 0.15, rust), vec3(0.0), 0.0, 0.0, 0.15);
  }
  if (id < 4.5) return Mat(vec3(0.3, 0.2, 0.06), 0.25, 1.6, vec3(0.0), 0.0, 0.0, 0.3);
  if (id < 5.5) return Mat(vec3(0.012, 0.01, 0.012), 0.35, 0.7, vec3(0.0), 0.05, 0.0, 0.6);
  if (id < 6.5) return Mat(vec3(0.022, 0.02, 0.022), 0.3, 0.7, vec3(0.0), 0.0, 0.0, 0.6);
  if (id < 7.5) return Mat(vec3(0.035, 0.025, 0.02), 0.45, 0.5, vec3(0.0), 0.0, 0.0, 0.3);
  if (id < 8.5) {
    // 검은 펠트 모자와 젖은 깃털
    float f = noise(p * vec3(60.0, 200.0, 60.0));
    return Mat(vec3(0.016, 0.013, 0.018) * (0.7 + 0.6 * f), 0.85, 0.12, vec3(0.0), 0.0, 0.0, 0.05);
  }
  // 검은 나무와 놋쇠 (총, 손잡이)
  return Mat(vec3(0.06, 0.04, 0.03), 0.35, 0.8, vec3(0.0), 0.0, 0.0, 0.3);
}
${KIT_MAIN}
`,
  };
}
