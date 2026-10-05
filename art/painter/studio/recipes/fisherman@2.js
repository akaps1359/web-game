// 심해의 혼혈 (늙은 어부의 본모습, 2형태) — 늙은 어부의 껍데기가 찢어지고 드러난 깊은 것의 피.
// 앞으로 크게 숙인 거구가 덮쳐 온다. 비늘 돋은 검푸른 몸, 등줄기를 따라 솟은 가시 지느러미,
// 목과 구분 없이 앞으로 길게 뻗은 납작한 물고기 머리, 옆으로 찢어지듯 벌어진 아가리에 바늘 이빨,
// 머리 양옆에 튀어나온 검고 젖은 눈알 속 청록빛, 목의 아가미가 빛난다.
// 물갈퀴 달린 긴 갈퀴손, 어깨엔 찢어진 유포 외투 조각이 걸려 있다.
// (컴파일 가속: 사슬은 k1-kit 의 동적 반복문, 코어 main 은 KIT_MAIN 으로 대체 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3, rng } from './k1-kit.js';

const K_BEND = 0.65;
const Y_BEND = 0.95;
const bendZ = (y) => K_BEND * Math.max(y - Y_BEND, 0) ** 2;
const W = (x, y, z) => [x, y, z + bendZ(y)];

export default function deepHybrid({ seed = 1 } = {}) {
  const R = rng(seed * 71 + 3);
  const head = [0.0, 1.78, 1.02];
  const sk = new Skel();
  // 몸통 살덩이 (굽은 등, 앙상한 옆구리, 두꺼운 어깨)
  const body = [
    [0.0, 1.0, 0.0, 0.23], [0.0, 1.28, 0.0, 0.25], [0.0, 1.52, -0.06, 0.29], [0.0, 1.55, 0.1, 0.23],
    [-0.22, 1.66, 0.0, 0.2], [0.22, 1.66, 0.0, 0.2], [0.0, 1.76, -0.1, 0.25], [0.0, 1.15, 0.12, 0.2],
  ];
  for (const b of body) {
    const w = W(b[0], b[1], b[2]);
    sk.blob(w[0], w[1], w[2], b[3]);
  }
  // 다리: 웅크린 뒷다리 (무릎이 앞으로, 발목이 높다), 물갈퀴 발
  sk.group(2, 0.05, 0.12, (s) => {
    for (const sx of [-1, 1]) {
      s.chain([[0.15 * sx, 0.98, 0.0, 0.13], [0.27 * sx, 0.62, 0.34, 0.09], [0.27 * sx, 0.3, -0.06, 0.055], [0.29 * sx, 0.06, 0.08, 0.045]]);
      for (const o of [-0.06, 0.0, 0.06]) s.chain([[0.29 * sx, 0.05, 0.08, 0.04], [0.29 * sx + o * 1.6, 0.022, 0.29, 0.015]]);
    }
  });
  // 팔: 길고 앞으로 벌어진다
  const shL = W(-0.32, 1.66, 0.02);
  const shR = W(0.32, 1.66, 0.02);
  const elL = [-0.72, 1.32, 0.78];
  const wrL = [-0.72, 1.18, 1.3];
  const elR = [0.74, 1.62, 0.66];
  const wrR = [0.8, 1.92, 1.1];
  sk.group(2, 0.05, 0.12, (s) => {
    s.chain([[...shL, 0.13], [...lerp3(shL, elL, 0.5), 0.1], [...elL, 0.08], [...wrL, 0.06]]);
    s.chain([[...shR, 0.13], [...lerp3(shR, elR, 0.5), 0.1], [...elR, 0.08], [...wrR, 0.06]]);
  });
  // 갈퀴손 (손가락 길고 끝에 검은 발톱)
  sk.group(2, 0.012, 0.02, (s) => {
    s.hand(add(wrL, [0.0, -0.02, 0.09]), [0.0, -0.3, 1.0], [0.0, 1.0, 0.3], { len: 0.3, curl: 0.75, r: 0.019, spread: 0.32, nails: 0.04 });
    s.hand(add(wrR, [0.03, 0.03, 0.08]), [0.25, 0.3, 1.0], [-0.3, 1.0, -0.1], { len: 0.3, curl: 0.85, r: 0.019, spread: 0.3, nails: 0.04 });
  });
  // 목: 굵게 앞으로, 머리와 이어진다
  const nb = W(0.0, 1.72, 0.08);
  sk.group(2, 0.06, 0.15, (s) => {
    s.chain([[...nb, 0.19], [...lerp3(nb, head, 0.5), 0.16], [...add(head, [0.0, -0.02, -0.2]), 0.15]]);
  });
  // 찢어진 외투 조각에서 늘어진 띠 (재질 5)
  sk.group(5, 0.006, 0.0, (s) => {
    for (let i = 0; i < 6; i++) {
      const root = W(-0.36 + i * 0.07 + (R() - 0.5) * 0.04, 1.5 - R() * 0.15, -0.18 + R() * 0.08);
      const L = 0.45 + R() * 0.45;
      s.curve([root, add(root, [-0.03, -L * 0.4, -0.06]), add(root, [(R() - 0.5) * 0.08, -L * 0.75, -0.05]), add(root, [(R() - 0.5) * 0.1, -L, -0.02])], 4, 0.03, 0.012, 0.8);
    }
  });
  const arr = sk.pack();
  // 옆구리를 따라 빛나는 점
  const lights = [];
  const lc = [];
  for (let i = 0; i < 5; i++) {
    for (const sx of [-1, 1]) {
      const w = W(sx * (0.27 - i * 0.015), 1.62 - i * 0.12, 0.08);
      lights.push([w[0], w[1], w[2] + 0.1, 0.011]);
      lc.push([0.3, 1.0, 0.85, 0.8]);
    }
  }
  const eyeL = add(head, [-0.17, 0.07, 0.02]);
  const eyeR = add(head, [0.17, 0.07, 0.02]);
  return {
    preset: 'act1',
    cam: { pos: [2.6, 0.55, 5.6], target: [0.05, 1.25, 0.5], fov: 1.75 },
    light: { pt: add(head, [0.3, -0.2, 0.6]), ptCol: [0.15, 0.7, 0.6], fillCol: [0.16, 0.24, 0.26], rim: 1.35 },
    arrays: {
      ...arr,
      uL: [[...add(eyeL, [-0.03, 0.01, 0.04]), 0.02], [...add(eyeR, [0.03, 0.01, 0.04]), 0.02], [head[0], head[1] - 0.08, head[2] + 0.08, 0.05], ...lights],
      uLC: [[0.35, 1.0, 0.85, 2.2], [0.35, 1.0, 0.85, 2.2], [0.3, 1.0, 0.85, 0.5], ...lc],
    },
    glsl: /* glsl */ `
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});
const vec3 EYE_L = vec3(${eyeL.join(', ')});
const vec3 EYE_R = vec3(${eyeR.join(', ')});

vec2 sdf(vec3 p) {
  float bound = sdCapsule(p, vec3(0.0, 0.0, 0.4), vec3(0.0, 2.3, 0.8), 1.35);
  if (bound > 0.3) return vec2(bound, 2.0);
  vec3 b = p;
  float hb = max(b.y - ${Y_BEND.toFixed(3)}, 0.0);
  b.z -= ${K_BEND.toFixed(3)} * hb * hb;
  // ── 몸통 ──
  float body = blobR(p, 0.16);
  vec2 r = vec2(body, 2.0);
  // 등줄기 가시 지느러미
  float fh = 0.15 + 0.08 * abs(sin(b.y * 26.0));
  float fin = max(abs(b.x) - 0.008, max(-(b.z + 0.27 + fh * smoothstep(1.0, 1.35, b.y) * smoothstep(2.0, 1.7, b.y)), b.z + 0.05));
  fin = max(fin, max(1.0 - b.y, b.y - 1.98));
  r = umin(r, vec2(fin, 6.0));
  // ── 머리: 목과 이어져 앞으로 길게 뻗은 납작한 물고기 머리 ──
  vec3 h = p - HEAD;
  h.yz = rot(0.1) * h.yz;
  float skull = sdEllipsoid(h - vec3(0.0, 0.05, -0.04), vec3(0.2, 0.12, 0.26));
  vec3 hs = vec3(abs(h.x), h.y, h.z);
  // 눈알이 앉은 옆머리 혹
  skull = smin(skull, length(hs - vec3(0.15, 0.07, 0.02)) - 0.065, 0.05);
  // 위턱: 넓고 납작한 주둥이
  float upper = sdEllipsoid(h - vec3(0.0, 0.0, 0.12), vec3(0.22, 0.065, 0.18));
  skull = smin(skull, upper, 0.05);
  // 아래턱: 아래로 활짝 벌어졌다
  vec3 jq = h - vec3(0.0, -0.04, -0.06);
  jq.yz = rot(0.6) * jq.yz;
  float jaw = sdEllipsoid(jq - vec3(0.0, -0.02, 0.2), vec3(0.21, 0.05, 0.2));
  float head = smin(skull, jaw, 0.05);
  // 아가리 안 (옆으로 길게)
  vec3 mq = h - vec3(0.0, -0.1, 0.16);
  float maw = sdEllipsoid(mq, vec3(0.19, 0.08, 0.15));
  head = smax(head, -maw, 0.02);
  head += 0.003 * sin(h.x * 70.0 + h.z * 40.0) * sin(h.y * 60.0);
  r = umin(r, vec2(head, 2.0));
  r = umin(r, vec2(sdEllipsoid(mq - vec3(0.0, 0.0, -0.03), vec3(0.17, 0.065, 0.12)), 99.0));
  // 바늘 이빨: 위턱 가장자리 (아래로), 아래턱 가장자리 (위로)
  vec3 tq = h - vec3(0.0, -0.05, 0.08);
  vec3 tu = polarRep(vec3(tq.x, tq.y, tq.z * 1.3), 26.0);
  float teeth = max(sdCapsule(tu, vec3(0.185, 0.0, 0.0), vec3(0.18, -0.06, 0.0), 0.007), -tq.z + 0.0);
  vec3 tl = jq - vec3(0.0, 0.01, 0.12);
  vec3 tlr = polarRep(vec3(tl.x, tl.y, tl.z * 1.25), 24.0);
  teeth = min(teeth, max(sdCapsule(tlr, vec3(0.18, 0.0, 0.0), vec3(0.175, 0.055, 0.0), 0.007), -tl.z));
  r = umin(r, vec2(teeth, 7.0));
  // 검고 젖은 눈알
  float eyes = min(length(p - EYE_L) - 0.05, length(p - EYE_R) - 0.05);
  r = umin(r, vec2(eyes, 10.0));
  // ── 찢어진 외투 조각 (등과 왼어깨를 덮은 해진 천) ──
  vec3 kq = b - vec3(-0.08, 1.72, -0.06);
  float ka = atan(kq.z, kq.x);
  float ct = clamp(-kq.y / 0.7, 0.0, 1.0);
  float crad = mix(0.27, 0.46, pow(ct, 0.7)) + 0.03 * sin(ka * 8.0 + kq.y * 4.0);
  float rag = abs(length(kq.xz * vec2(0.85, 1.0)) - crad) - 0.012;
  float rhem = -0.3 - 0.3 * (0.5 + 0.5 * sin(ka * 3.0 + 2.0)) - 0.07 * sin(ka * 13.0);
  rag = max(rag, max(rhem - kq.y, kq.y - 0.05));
  rag = max(rag, kq.z - 0.02 - kq.x * 0.6);
  r = umin(r, vec2(rag, 5.0));
  // 사슬 무리: 다리·팔·손·목·띠
  r = skel(p, r);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 2.5) {
    // 검푸른 비늘: 비늘마다 가장자리가 어둡고 젖어 번들거린다. 배는 창백하다. 목엔 빛나는 아가미
    vec3 q = p * 62.0;
    vec2 cell = vec2(q.x + q.z * 0.5 + 0.5 * floor(q.y), q.y);
    float sc = abs(fract(cell.x) - 0.5) + abs(fract(cell.y) - 0.5);
    float rim = smoothstep(0.38, 0.5, sc);
    float belly = smoothstep(0.0, 0.5, n.y * -0.3 + n.z * 0.6) * smoothstep(1.75, 1.0, p.y) * smoothstep(0.25, 0.05, abs(p.x));
    vec3 alb = mix(vec3(0.018, 0.04, 0.042), vec3(0.045, 0.065, 0.06), belly * smoothstep(0.6, 0.2, abs(p.x)) * step(0.9, p.y));
    alb *= 0.7 + 0.5 * fbm3(p * 6.0);
    alb = mix(alb, alb * 0.6, rim);
    vec3 hq = p - HEAD;
    float gillZone = smoothstep(0.07, 0.0, abs(hq.z + 0.2)) * smoothstep(0.1, 0.15, abs(hq.x)) * smoothstep(0.27, 0.21, abs(hq.x)) * smoothstep(0.09, 0.0, abs(hq.y + 0.05));
    float gill = smoothstep(0.55, 0.95, sin(hq.y * 120.0 + hq.z * 30.0)) * gillZone;
    vec3 emi = vec3(0.25, 1.0, 0.8) * gill * 1.4;
    return Mat(alb, 0.45, 0.35, emi, 0.0, 0.35, 0.22);
  }
  if (id < 5.5) {
    float dirt = fbm3(p * vec3(4.0, 1.5, 4.0));
    return Mat(vec3(0.035, 0.034, 0.026) * (0.4 + 0.8 * dirt), 0.6, 0.3, vec3(0.0), 0.0, 0.1, 0.4);
  }
  if (id < 6.5) {
    float spine = smoothstep(0.75, 0.98, abs(sin(p.y * 26.0)));
    vec3 alb = mix(vec3(0.04, 0.1, 0.09), vec3(0.01, 0.02, 0.02), spine);
    return Mat(alb, 0.3, 0.6, vec3(0.0), 0.0, 0.9, 0.6);
  }
  if (id < 7.5) return Mat(vec3(0.3, 0.29, 0.24), 0.3, 0.8, vec3(0.0), 0.0, 0.3, 0.5);
  // 검고 젖은 눈알, 속에 고인 청록빛
  return Mat(vec3(0.005, 0.012, 0.012), 0.04, 1.6, vec3(0.0, 0.05, 0.04), 0.0, 0.0, 1.0);
}
${KIT_MAIN}
`,
  };
}
