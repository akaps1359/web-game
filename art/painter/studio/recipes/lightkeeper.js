// 등대지기 (1층 수호자) — 빛에 미쳐 머리가 등대 꼭대기의 등롱실이 되어 버린 남자.
// 앙상하게 키 큰 몸이 독수리처럼 어깨를 웅크리고, 앞으로 뻗은 목 끝에서 등롱실(쇠 창살·금 간 유리·돔 지붕·난간)이
// 기울어진 채 타오른다. 등롱과 맞닿은 목살은 그을려 갈라진 틈마다 불씨가 빛난다.
// 한 팔은 무릎까지 늘어져 갈퀴손을 펴고, 다른 손은 배 등불을 들어 비춘다. 발목까지 늘어진 젖은 유포 외투.
// (셰이더 컴파일이 무거워지지 않게 sdf 안에서는 해시 잡음·둥근 원뿔을 쓰지 않는다 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3 } from './k1-kit.js';

const K_BEND = 0.62;
const Y_BEND = 1.05;
const bendZ = (y) => K_BEND * Math.max(y - Y_BEND, 0) ** 2;
/** 몸 좌표 → 월드 */
const W = (x, y, z) => [x, y, z + bendZ(y)];

export default function lightkeeper() {
  const head = [0.02, 2.2, 1.22];
  const lantern = [0.98, 0.88, 0.95];
  const sk = new Skel();
  const shL = W(-0.42, 2.0, -0.02);
  const shR = W(0.43, 2.06, -0.04);
  const elL = [-0.6, 1.42, 0.62];
  const wrL = [-0.56, 0.86, 0.98];
  const elR = [0.82, 1.62, 0.58];
  const wrR = [0.98, 1.34, 0.9];
  // 소매 (외투 재질): 팔꿈치와 소맷부리만 조금 두껍다
  sk.group(1, 0.05, 0.07, (s) => {
    s.chain([[...shL, 0.1], [...lerp3(shL, elL, 0.5), 0.085], [...elL, 0.08], [...lerp3(elL, wrL, 0.55), 0.068], [...wrL, 0.074]]);
    s.chain([[...shR, 0.1], [...lerp3(shR, elR, 0.5), 0.085], [...elR, 0.08], [...lerp3(elR, wrR, 0.55), 0.068], [...wrR, 0.074]]);
  });
  // 손 (살갗): 왼손은 아래로 늘어져 앞으로 갈퀴처럼 편다, 오른손은 등불 고리를 쥔다
  sk.group(2, 0.012, 0.0, (s) => {
    s.hand(add(wrL, [0.0, -0.08, 0.07]), [-0.05, -0.7, 0.75], [0.0, 0.65, 0.75], { len: 0.27, curl: 0.62, r: 0.0155, spread: 0.32 });
    s.hand(add(wrR, [0.03, -0.08, 0.02]), [0.1, -1.0, 0.0], [0.9, 0.0, 0.4], { len: 0.19, curl: 1.5, r: 0.0155, spread: 0.12 });
  });
  // 목: 웅크린 어깨 앞쪽에서 앞으로 뻗어 등롱 받침으로, 힘줄이 선다
  const nb = W(0.0, 1.95, 0.12);
  sk.group(2, 0.03, 0.05, (s) => {
    s.curve([nb, add(nb, [0.0, 0.06, 0.12]), add(head, [0.0, -0.32, -0.24]), add(head, [0.0, -0.28, -0.08])], 5, 0.078, 0.064, 1.0);
    for (const o of [-0.043, 0.043]) {
      s.curve([add(nb, [o * 1.5, -0.04, 0.08]), add(nb, [o * 1.3, 0.03, 0.2]), add(head, [o, -0.34, -0.18]), add(head, [o * 0.8, -0.29, -0.06])], 4, 0.021, 0.015, 1.0);
    }
  });
  // 등불을 매단 짧은 쇠사슬
  sk.group(3, 0.0, 0.0, (s) => {
    const top = add(wrR, [0.03, -0.2, 0.02]);
    const bot = add(lantern, [0.0, 0.25, 0.0]);
    const pts = [];
    for (let i = 0; i < 4; i++) pts.push([...lerp3(top, bot, i / 3), 0.011]);
    s.chain(pts);
  });
  const arr = sk.pack();
  return {
    preset: 'act1',
    cam: { pos: [1.15, 0.5, 6.3], target: [0.08, 1.38, 0.4], fov: 1.75 },
    light: { pt: [head[0], head[1] - 0.02, head[2] + 0.02], ptCol: [2.3, 1.7, 0.85], rim: 1.2, exposure: 1.1 },
    arrays: {
      ...arr,
      uL: [
        [head[0], head[1] - 0.02, head[2], 0.34],
        [lantern[0], lantern[1], lantern[2], 0.13],
      ],
      uLC: [
        [1.0, 0.85, 0.55, 0.7],
        [1.0, 0.6, 0.25, 0.45],
      ],
    },
    glsl: /* glsl */ `
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});
const vec3 LANT = vec3(${lantern.join(', ')});

// 등롱실 (q: 유리방 중심, 위가 +y). x: 쇠, y: 유리
vec2 lanternRoom(vec3 q) {
  float glass = sdCylinder(q, 0.16, 0.14);
  vec3 bq = polarRep(q, 8.0);
  float iron = sdBox(bq - vec3(0.145, 0.0, 0.0), vec3(0.017, 0.165, 0.02));
  iron = min(iron, sdCylinder(q - vec3(0.0, 0.03, 0.0), 0.011, 0.152));
  // 돔 지붕 + 환기 공 + 피뢰침
  float dome = max(length((q - vec3(0.0, 0.15, 0.0)) * vec3(1.0, 0.8, 1.0)) - 0.18, 0.155 - q.y);
  dome = min(dome, length(q - vec3(0.0, 0.335, 0.0)) - 0.035);
  dome = min(dome, sdCapsule(q, vec3(0.0, 0.35, 0.0), vec3(0.0, 0.5, 0.0), 0.006));
  iron = min(iron, dome);
  // 난간 달린 좁은 전망대
  vec3 g = q + vec3(0.0, 0.185, 0.0);
  iron = min(iron, sdCylinder(g, 0.022, 0.215));
  vec3 gq = polarRep(g, 14.0);
  iron = min(iron, sdCapsule(gq, vec3(0.205, 0.0, 0.0), vec3(0.205, 0.11, 0.0), 0.0065));
  iron = min(iron, sdTorus(g - vec3(0.0, 0.11, 0.0), vec2(0.205, 0.008)));
  // 받침: 목으로 좁아지는 깔때기
  vec3 f = g + vec3(0.0, 0.09, 0.0);
  iron = min(iron, max(length(f.xz) - 0.07 - max(f.y + 0.07, 0.0) * 0.9, abs(f.y) - 0.07));
  return vec2(iron, glass);
}

vec2 sdf(vec3 p) {
  vec3 b = p;
  float hb = max(b.y - ${Y_BEND.toFixed(3)}, 0.0);
  b.z -= ${K_BEND.toFixed(3)} * hb * hb;
  float y = b.y;
  // ── 외투: 웅크린 어깨에서 발목까지, 아래로 퍼지고 세로 주름, 밑단은 찢어진 띠 ──
  float t = clamp((y - 0.15) / 1.8, 0.0, 1.0);
  float ang = atan(b.z, b.x);
  float rad = mix(0.42, 0.25, pow(t, 0.7));
  rad -= 0.035 * smoothstep(0.25, 0.0, abs(y - 1.22));
  float fold = sin(ang * 5.0 + 0.6) * 0.55 + sin(ang * 9.0 + 2.1) * 0.3 + sin(ang * 17.0 + 4.0) * 0.15;
  rad += 0.045 * (1.0 - t) * smoothstep(1.1, 0.8, y) * fold;
  float coat = (length(b.xz * vec2(0.9, 1.0)) - rad) * 0.72;
  float tat = 0.5 + 0.5 * sin(ang * 5.0 + 1.3) * sin(ang * 3.0 + 0.4);
  float hem = 0.12 + 0.36 * smoothstep(0.5, 0.95, tat) + 0.05 * sin(ang * 13.0) + 0.03 * sin(ang * 31.0 + 2.0);
  coat = max(coat, max(hem - y, y - 2.02));
  // 혹처럼 솟아 웅크린 어깨와 등
  float back = sdEllipsoid(b - vec3(0.0, 1.9, -0.12), vec3(0.4, 0.38, 0.27));
  float shd = sdEllipsoid(b - vec3(0.0, 2.02, -0.02), vec3(0.47, 0.14, 0.2));
  coat = smin(coat, smin(back, shd, 0.16), 0.2);
  // 어깨망토 (해진 겉망토)
  vec3 kq = b - vec3(0.0, 2.1, -0.02);
  float ka = atan(kq.z, kq.x);
  float ct = clamp(-kq.y / 0.6, 0.0, 1.0);
  float crad = mix(0.22, 0.6, pow(ct, 0.75)) + 0.035 * ct * (sin(ka * 7.0 + 0.3) * 0.7 + sin(ka * 13.0) * 0.3);
  float cape = abs((length(kq.xz * vec2(0.92, 1.0)) - crad) * 0.8) - 0.012;
  float capeHem = -0.42 - 0.13 * (0.5 + 0.5 * sin(ka * 4.0 + 0.7)) - 0.05 * sin(ka * 11.0 + 1.0) - 0.025 * sin(ka * 23.0);
  cape = max(cape, max(capeHem - kq.y, kq.y - 0.02));
  coat = smin(coat, cape, 0.03);
  // 세운 깃
  vec3 lq0 = b - vec3(0.0, 2.08, 0.06);
  float collar = abs(sdCylinder(lq0, 0.11, 0.17 + 0.08 * (lq0.y + 0.1))) - 0.017;
  collar = max(collar, -(lq0.z - 0.1 + lq0.y * 0.5));
  coat = smin(coat, collar, 0.04);
  vec2 r = vec2(coat, 1.0);
  // 허리띠와 놋쇠 단추 (앞쪽)
  float belt = max(abs(length(b.xz * vec2(0.9, 1.0)) - rad + 0.005) - 0.02, abs(y - 1.22) - 0.04);
  vec3 bt = vec3(b.x, mod(y + 0.11, 0.22) - 0.11, b.z - rad * 0.97);
  float btn = max(length(bt - vec3(0.06, 0.0, 0.0)) - 0.02, abs(y - 1.65) - 0.32);
  btn = min(btn, length(vec3(b.x, y - 1.22, b.z - rad - 0.01)) - 0.035);
  r = umin(r, vec2(belt, 6.0));
  r = umin(r, vec2(btn, 3.0));
  // 장화 끝
  float boots = min(sdRoundBox(p - vec3(-0.17, 0.05, 0.14), vec3(0.075, 0.055, 0.15), 0.04), sdRoundBox(p - vec3(0.2, 0.05, 0.06), vec3(0.075, 0.055, 0.15), 0.04));
  r = umin(r, vec2(boots, 6.0));
  // 사슬 무리: 소매·손·목·사슬
  r = skel(p, r);
  // 등롱실 머리: 옆으로 기울었다
  vec3 q = p - HEAD;
  q.yz = rot(0.1) * q.yz;
  q.xy = rot(0.24) * q.xy;
  if (length(q) - 0.55 < r.x) {
    vec2 lr = lanternRoom(q);
    r = umin(r, vec2(lr.x, 3.0));
    r = umin(r, vec2(lr.y, 4.0));
  }
  // 배 등불
  vec3 lq = p - LANT;
  if (length(lq) - 0.3 < r.x) {
    float frame = max(sdCylinder(lq, 0.13, 0.09), -sdCylinder(lq, 0.11, 0.1));
    vec3 cq2 = polarRep(lq, 5.0);
    frame = min(frame, sdBox(cq2 - vec3(0.092, 0.0, 0.0), vec3(0.008, 0.12, 0.008)));
    frame = min(frame, max(length(lq.xz) - 0.105 + (lq.y - 0.13) * 1.8, abs(lq.y - 0.16) - 0.04));
    frame = min(frame, sdCylinder(lq + vec3(0.0, 0.14, 0.0), 0.016, 0.105));
    frame = min(frame, sdTorus((lq - vec3(0.0, 0.225, 0.0)).xzy, vec2(0.035, 0.008)));
    r = umin(r, vec2(frame, 3.0));
    r = umin(r, vec2(sdCylinder(lq, 0.11, 0.075), 5.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 젖은 유포 외투: 검은 올리브, 닳은 얼룩, 흘러내린 물자국, 소금기
    float dirt = fbm3(p * vec3(4.0, 1.5, 4.0));
    float streak = smoothstep(0.55, 0.8, fbm3(p * vec3(14.0, 1.2, 14.0)));
    float salt = smoothstep(0.62, 0.8, fbm3(p * 7.0 + 3.0)) * smoothstep(1.2, 0.3, p.y);
    float wetHem = smoothstep(0.9, 0.3, p.y);
    float weave = 0.85 + 0.15 * noise(p * vec3(160.0, 40.0, 160.0));
    vec3 alb = vec3(0.05, 0.048, 0.036) * (0.45 + 0.9 * dirt) * (1.0 - streak * 0.4) * weave + vec3(0.045, 0.045, 0.04) * salt;
    return Mat(alb, 0.78 - wetHem * 0.3 - streak * 0.35, 0.16 + wetHem * 0.35 + streak * 0.35, vec3(0.0), 0.02, 0.0, 0.1 + wetHem * 0.45 + streak * 0.35);
  }
  if (id < 2.5) {
    // 잿빛 마른 살갗, 검은 핏줄. 등롱에 가까울수록 그을려 갈라지고 틈에서 불씨가 빛난다
    float bl = fbm3(p * 22.0);
    float vein = smoothstep(0.07, 0.0, ridge(p * 9.0));
    float burn = smoothstep(0.42, 0.22, length(p - HEAD));
    float crack = smoothstep(0.06, 0.0, ridge(p * 26.0)) * burn;
    vec3 alb = mix(vec3(0.12, 0.105, 0.09) * (0.7 + 0.6 * bl), vec3(0.04, 0.03, 0.03), vein * 0.7);
    alb = mix(alb, vec3(0.02, 0.015, 0.012), burn * 0.85);
    vec3 emi = vec3(2.2, 0.9, 0.25) * crack * 1.4;
    return Mat(alb, 0.55, 0.35, emi, 0.0, 0.4, 0.2);
  }
  if (id < 3.5) {
    // 녹슨 쇠와 놋쇠
    float rust = smoothstep(0.35, 0.7, fbm3(p * 14.0));
    vec3 alb = mix(vec3(0.09, 0.07, 0.045), vec3(0.04, 0.032, 0.026), rust);
    return Mat(alb, mix(0.35, 0.85, rust), mix(1.0, 0.2, rust), vec3(0.0), 0.0, 0.0, 0.35);
  }
  if (id < 4.5) {
    // 등롱실 유리: 프레넬 렌즈 띠, 가운데 불꽃, 금 간 곳과 그을음은 어둡다
    vec3 q = p - HEAD;
    float core = exp(-dot(q.xz, q.xz) * 30.0) * smoothstep(0.16, 0.0, abs(q.y));
    float band = 0.72 + 0.28 * abs(sin(q.y * 95.0));
    float crack = smoothstep(0.04, 0.0, ridge(p * 13.0)) * 0.85;
    float soot = smoothstep(0.5, 0.75, fbm3(p * 9.0)) * 0.75 * smoothstep(-0.05, 0.14, q.y);
    vec3 emi = (vec3(2.2, 1.7, 0.95) * band + vec3(2.8, 2.5, 2.0) * core) * (1.0 - crack) * (1.0 - soot);
    return Mat(vec3(0.15), 0.05, 1.5, emi, 0.0, 0.0, 0.4);
  }
  if (id < 5.5) {
    float fl = 0.7 + 0.3 * noise(p * 30.0);
    return Mat(vec3(0.1), 0.1, 1.0, vec3(2.6, 1.3, 0.4) * fl, 0.0, 0.0, 0.3);
  }
  return Mat(vec3(0.025, 0.024, 0.022), 0.4, 0.5, vec3(0.0), 0.0, 0.0, 0.6);
}
${KIT_MAIN}
`,
  };
}
