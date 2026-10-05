// 늙은 어부 (1층 수호자, 1형태) — 굽은 등의 늙은 어부. 그러나 무언가 어긋나 있다.
// 축 늘어진 챙의 방수모, 젖은 유포 외투, 어깨에 걸쳐 바닥까지 끌리는 그물(코르크 찌·갈고리),
// 제 키보다 긴 갈고리 장대를 지팡이처럼 짚었다. 챙 그늘 아래 얼굴은 '인스머스의 얼굴'
// — 눈꺼풀 없이 튀어나온 창백한 눈, 턱 없는 넓은 입, 목의 아가미 주름, 비늘 돋은 잿빛 살갗.
// (셰이더 컴파일이 무거워지지 않게 sdf 안에서는 해시 잡음·둥근 원뿔을 쓰지 않는다 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3, rng } from './k1-kit.js';

const K_BEND = 0.55;
const Y_BEND = 0.85;
const bendZ = (y) => K_BEND * Math.max(y - Y_BEND, 0) ** 2;
const W = (x, y, z) => [x, y, z + bendZ(y)];

export default function fisherman({ seed = 1 } = {}) {
  const R = rng(seed * 313 + 9);
  const head = [0.0, 1.6, 0.6];
  const sk = new Skel();
  // 다리 (굽은 무릎) + 장화 (재질 6)
  sk.group(6, 0.05, 0.0, (s) => {
    s.chain([[-0.12, 0.8, 0.02, 0.085], [-0.17, 0.46, 0.14, 0.075], [-0.16, 0.36, 0.1, 0.085], [-0.16, 0.08, 0.04, 0.08]]);
    s.chain([[-0.16, 0.07, 0.0, 0.07], [-0.17, 0.05, 0.18, 0.06]]);
    s.chain([[0.12, 0.8, 0.0, 0.085], [0.18, 0.47, 0.08, 0.075], [0.18, 0.36, 0.05, 0.085], [0.19, 0.08, -0.02, 0.08]]);
    s.chain([[0.19, 0.07, -0.05, 0.07], [0.21, 0.05, 0.13, 0.06]]);
  });
  // 소매 (외투 재질)
  const shL = W(-0.33, 1.42, -0.02);
  const shR = W(0.33, 1.42, -0.02);
  const elL = [-0.44, 1.0, 0.3];
  const wrL = [-0.36, 0.72, 0.5];
  const elR = [0.44, 1.12, 0.36];
  const wrR = [0.36, 1.12, 0.66];
  sk.group(1, 0.05, 0.07, (s) => {
    s.chain([[...shL, 0.095], [...lerp3(shL, elL, 0.5), 0.085], [...elL, 0.08], [...wrL, 0.072]]);
    s.chain([[...shR, 0.095], [...lerp3(shR, elR, 0.5), 0.085], [...elR, 0.08], [...wrR, 0.074]]);
  });
  // 손: 오른손은 장대를 쥐고, 왼손은 그물 끝을 쥐었다 — 마디가 굵고 손톱이 길다
  sk.group(2, 0.012, 0.0, (s) => {
    s.hand(add(wrR, [0.0, 0.0, 0.07]), [-0.95, 0.15, 0.25], [0.1, 0.4, 0.9], { len: 0.15, curl: 1.75, r: 0.016, spread: 0.06, nails: 0.015 });
    s.hand(add(wrL, [0.0, -0.08, 0.04]), [0.05, -1.0, 0.25], [-0.8, 0.0, 0.5], { len: 0.15, curl: 1.4, r: 0.016, spread: 0.1, nails: 0.015 });
  });
  // 목 (앞으로 뻗음) + 아가미 주름은 재질에서
  const nb = W(0.0, 1.42, 0.06);
  sk.group(2, 0.03, 0.05, (s) => {
    s.curve([nb, add(nb, [0.0, 0.05, 0.08]), add(head, [0.0, -0.14, -0.16]), add(head, [0.0, -0.07, -0.08])], 4, 0.075, 0.07, 1.0);
  });
  // 갈고리 장대 (나무, 재질 8)
  const poleBot = [0.44, 0.0, 0.82];
  const poleTop = [0.3, 2.35, 0.52];
  sk.group(8, 0.0, 0.0, (s) => {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const q = lerp3(poleBot, poleTop, i / 4);
      pts.push([q[0] + Math.sin(i * 1.7) * 0.008, q[1], q[2], 0.024 - i * 0.002]);
    }
    s.chain(pts);
  });
  // 그물에서 늘어진 줄 (재질 5)
  sk.group(5, 0.004, 0.0, (s) => {
    for (let i = 0; i < 4; i++) {
      const root = [-0.3 - R() * 0.12, 0.62 + R() * 0.25, 0.3 + R() * 0.2];
      const L = root[1] - 0.02;
      s.curve([root, add(root, [(R() - 0.5) * 0.1, -L * 0.4, 0.05]), add(root, [(R() - 0.5) * 0.15, -L * 0.8, 0.02]), add(root, [(R() - 0.5) * 0.2, -L, 0.1])], 4, 0.006, 0.005, 1.0);
    }
  });
  // 코르크 찌 (그물에 매달린 공들)
  const floats = [[-0.36, 1.3, 0.38], [-0.43, 0.98, 0.38], [-0.4, 0.62, 0.56], [-0.12, 0.06, 0.72], [-0.48, 0.07, 0.6]];
  for (const f of floats) sk.blob(f[0], f[1], f[2], 0.048);
  const arr = sk.pack();
  return {
    preset: 'act1',
    cam: { pos: [-2.3, 0.4, 5.0], target: [0.0, 1.08, 0.35], fov: 1.72 },
    light: { pt: [0.0, 1.05, 1.0], ptCol: [0.1, 0.26, 0.24], rim: 1.25 },
    arrays: {
      ...arr,
      uL: [
        [-0.07, 1.65, 0.735, 0.008],
        [0.07, 1.646, 0.731, 0.008],
      ],
      uLC: [
        [0.5, 1.0, 0.9, 1.4],
        [0.5, 1.0, 0.9, 1.4],
      ],
    },
    glsl: /* glsl */ `
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});

vec2 sdf(vec3 p) {
  float bound = sdCapsule(p, vec3(0.0, 0.0, 0.35), vec3(0.0, 2.3, 0.35), 0.9);
  if (bound > 0.3) return vec2(bound, 1.0);
  vec3 b = p;
  float hb = max(b.y - ${Y_BEND.toFixed(3)}, 0.0);
  b.z -= ${K_BEND.toFixed(3)} * hb * hb;
  float y = b.y;
  // ── 유포 외투: 무릎 위까지, 앞섶이 겹치고 주머니가 불룩하다 ──
  float t = clamp((y - 0.5) / 1.0, 0.0, 1.0);
  float ang = atan(b.z, b.x);
  float rad = mix(0.33, 0.24, pow(t, 0.8));
  rad += 0.03 * (1.0 - t) * (sin(ang * 6.0 + 0.5) * 0.6 + sin(ang * 11.0 + 2.0) * 0.4);
  float coat = (length(b.xz * vec2(0.92, 1.05)) - rad) * 0.75;
  float hem = 0.55 + 0.03 * sin(ang * 7.0) + 0.02 * sin(ang * 17.0 + 1.0);
  coat = max(coat, max(hem - y, y - 1.46));
  float back = sdEllipsoid(b - vec3(0.0, 1.32, -0.1), vec3(0.32, 0.3, 0.24));
  float shd = sdEllipsoid(b - vec3(0.0, 1.42, 0.0), vec3(0.36, 0.1, 0.17));
  coat = smin(coat, smin(back, shd, 0.12), 0.15);
  // 주머니
  vec3 pk = vec3(abs(b.x) - 0.17, y - 0.75, b.z - 0.25);
  coat = smin(coat, sdRoundBox(pk, vec3(0.08, 0.075, 0.035), 0.025), 0.02);
  // 옷깃
  vec3 cq = b - vec3(0.0, 1.47, 0.04);
  coat = smin(coat, sdTorus(cq, vec2(0.12, 0.035)), 0.04);
  coat += 0.004 * sin(y * 33.0 + sin(ang * 5.0) * 2.0) * smoothstep(0.5, 1.0, y);
  vec2 r = vec2(coat, 1.0);
  // 그물: 왼어깨에 얇게 걸쳐 앞뒤로 늘어지고, 손에 한 움큼 쥐었다가 바닥에 조금 쌓였다
  float net = sdEllipsoid(p - vec3(-0.27, 1.4, 0.18), vec3(0.15, 0.07, 0.2));
  net = smin(net, sdEllipsoid(p - vec3(-0.36, 1.12, 0.32), vec3(0.07, 0.25, 0.1)), 0.07);
  net = smin(net, sdEllipsoid(p - vec3(-0.37, 0.72, 0.5), vec3(0.08, 0.13, 0.08)), 0.07);
  net = smin(net, sdEllipsoid(p - vec3(-0.34, 0.33, 0.55), vec3(0.06, 0.28, 0.06)), 0.08);
  net = smin(net, sdEllipsoid(p - vec3(-0.3, 0.03, 0.62), vec3(0.24, 0.05, 0.2)), 0.08);
  net += 0.006 * sin(p.y * 22.0 + sin(p.x * 9.0) * 2.0) * sin(p.x * 13.0 + p.z * 7.0);
  r = umin(r, vec2(net, 5.0));
  // ── 머리: 좁고 납작한 두개골, 턱 없는 넓은 입, 튀어나온 눈두덩 ──
  vec3 h = p - HEAD;
  h.yz = rot(0.15) * h.yz;
  float hd = sdEllipsoid(h, vec3(0.105, 0.125, 0.12));
  vec3 hs = vec3(abs(h.x), h.y, h.z);
  // 눈알이 앉을 불룩한 눈두덩 (옆으로 벌어졌다)
  hd = smin(hd, sdEllipsoid(hs - vec3(0.055, 0.035, 0.085), vec3(0.05, 0.045, 0.04)), 0.03);
  // 넓고 납작한 입 (아래로 처진 주둥이)
  hd = smin(hd, sdEllipsoid(h - vec3(0.0, -0.06, 0.07), vec3(0.09, 0.05, 0.07)), 0.05);
  float mouth = sdEllipsoid(h - vec3(0.0, -0.07, 0.135), vec3(0.075, 0.009, 0.03));
  hd = smax(hd, -mouth, 0.008);
  // 귀 없는 옆머리, 아가미 주름은 재질로
  hd += 0.0025 * sin(h.x * 90.0 + h.y * 40.0) * sin(h.y * 70.0);
  r = umin(r, vec2(hd, 2.0));
  // 눈꺼풀 없이 튀어나온 검고 젖은 눈알
  float eyes = length(hs - vec3(0.066, 0.035, 0.1)) - 0.036;
  r = umin(r, vec2(eyes, 10.0));
  // ── 방수모: 둥근 머리통, 앞은 짧고 뒤로 길게 처진 챙 ──
  vec3 hq = h - vec3(0.0, 0.11, -0.03);
  hq.yz = rot(-0.25) * hq.yz;
  float crown = sdEllipsoid(hq, vec3(0.125, 0.085, 0.135));
  float hr = length(hq.xz);
  float bk = smoothstep(0.05, -0.12, hq.z);
  float RR = 0.15 + 0.14 * bk;
  float bsurf = hq.y + 0.01 + (hr - 0.11) * (0.25 + 0.75 * bk) + 0.01 * sin(atan(hq.x, hq.z) * 9.0);
  float brim = max(abs(bsurf) * 0.7 - 0.007, max(hr - RR, 0.1 - hr));
  r = umin(r, vec2(min(crown, brim), 4.0));
  // ── 갈고리 장대 끝의 쇠 갈고리 ──
  vec3 g = p - vec3(${poleTop.join(', ')});
  float hook = length(vec2(length(g.yz - vec2(0.03, 0.13)) - 0.13, g.x)) - 0.016;
  hook = max(hook, -(g.z - 0.13 + g.y * 0.2));
  hook = min(hook, sdCapsule(g, vec3(0.0, -0.12, 0.0), vec3(0.0, 0.02, 0.0), 0.016));
  r = umin(r, vec2(hook, 3.0));
  // 코르크 찌
  r = umin(r, vec2(blobR(p, 0.001), 9.0));
  // 사슬 무리: 다리·소매·손·목·수염·장대·그물 줄
  r = skel(p, r);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 누렇게 바랜 회색 유포: 기름 먹은 광택, 갈라진 주름, 어두운 젖은 밑단
    float dirt = fbm3(p * vec3(4.0, 1.5, 4.0));
    float crack = smoothstep(0.06, 0.0, ridge(p * vec3(9.0, 3.0, 9.0))) * 0.5;
    float wetHem = smoothstep(0.9, 0.5, p.y);
    vec3 alb = vec3(0.11, 0.105, 0.08) * (0.5 + 0.8 * dirt) * (1.0 - crack) * (1.0 - wetHem * 0.4);
    return Mat(alb, 0.45, 0.5, vec3(0.0), 0.02, 0.0, 0.35 + wetHem * 0.4);
  }
  if (id < 2.5) {
    // 비늘이 돋기 시작한 잿빛 살갗, 목엔 아가미 주름, 끈적한 광택
    vec3 q = p - HEAD;
    float scale = smoothstep(0.35, 0.0, abs(sin(p.x * 160.0 + sin(p.y * 120.0)) * sin(p.y * 160.0))) * smoothstep(0.45, 0.65, fbm3(p * 6.0));
    float gill = smoothstep(0.5, 0.95, sin(q.y * 140.0)) * smoothstep(0.02, -0.04, q.y) * smoothstep(-0.2, -0.08, q.y);
    vec3 alb = vec3(0.13, 0.14, 0.125) * (0.7 + 0.5 * fbm3(p * 15.0));
    alb = mix(alb, vec3(0.06, 0.09, 0.085), scale * 0.6);
    alb = mix(alb, vec3(0.12, 0.03, 0.03), gill * 0.7);
    return Mat(alb, 0.35, 0.55, vec3(0.0), 0.08 * scale, 0.45, 0.55);
  }
  if (id < 3.5) {
    float rust = smoothstep(0.35, 0.7, fbm3(p * 14.0));
    return Mat(mix(vec3(0.07, 0.065, 0.06), vec3(0.12, 0.055, 0.02), rust), mix(0.3, 0.85, rust), mix(1.2, 0.2, rust), vec3(0.0), 0.0, 0.0, 0.4);
  }
  if (id < 4.5) {
    // 방수모: 낡은 유포, 챙 끝에서 물이 떨어질 듯 젖었다
    float dirt = fbm3(p * 6.0);
    return Mat(vec3(0.085, 0.08, 0.06) * (0.5 + 0.8 * dirt), 0.35, 0.6, vec3(0.0), 0.02, 0.0, 0.6);
  }
  if (id < 5.5) {
    // 그물: 검은 노끈의 격자, 사이사이 해초와 물기
    vec3 q = p * 95.0 + 3.0 * vec3(sin(p.y * 7.0), sin(p.z * 6.0), sin(p.x * 8.0));
    float grid = max(smoothstep(0.9, 0.99, abs(sin(q.x + q.z))), smoothstep(0.9, 0.99, abs(sin(q.y * 1.1 - q.z * 0.5))));
    float weed = smoothstep(0.55, 0.75, fbm3(p * 7.0));
    vec3 alb = mix(vec3(0.01, 0.011, 0.01), vec3(0.06, 0.058, 0.045), grid);
    alb = mix(alb, vec3(0.03, 0.05, 0.02), weed * 0.7);
    return Mat(alb, 0.6, 0.4, vec3(0.0), 0.0, 0.2, 0.6);
  }
  if (id < 6.5) return Mat(vec3(0.022, 0.022, 0.02), 0.35, 0.6, vec3(0.0), 0.0, 0.0, 0.7);
  if (id < 7.5) return Mat(vec3(0.3, 0.3, 0.28), 0.6, 0.3, vec3(0.0), 0.0, 0.5, 0.2);
  if (id < 8.5) {
    // 젖은 나무 장대
    float grain = noise(vec3(p.x * 80.0, p.y * 4.0, p.z * 80.0));
    return Mat(vec3(0.07, 0.05, 0.03) * (0.6 + 0.6 * grain), 0.5, 0.4, vec3(0.0), 0.0, 0.0, 0.5);
  }
  if (id > 9.5) {
    // 젖은 검은 눈알: 청록빛이 고인 깊은 홍채
    vec3 q = p - HEAD;
    return Mat(vec3(0.006, 0.012, 0.012), 0.04, 1.6, vec3(0.0, 0.035, 0.03), 0.15, 0.0, 1.0);
  }
  // 코르크 찌: 빛바래고 해초 낀 칠
  float w = noise(p * 40.0);
  return Mat(mix(vec3(0.07, 0.035, 0.025), vec3(0.03, 0.04, 0.02), smoothstep(0.4, 0.7, w)), 0.75, 0.2, vec3(0.0), 0.0, 0.0, 0.3);
}
${KIT_MAIN}
`,
  };
}
