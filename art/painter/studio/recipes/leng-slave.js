// 렝의 노예 (5층 하수인) — 달짐승에게 부려지는 렝 고원의 반인반수. 짧은 뿔을 누더기 터번으로 감췄고, 입이 지나치게 넓다.
// 등이 굽은 깡마른 몸: 갈비와 채찍 자국이 드러난 맨 상체, 목엔 끊어진 사슬이 달린 쇠 목줄. 허리 아래는 털북숭이 염소 다리,
// 뒤로 꺾인 무릎과 갈라진 발굽. 해진 천을 칭칭 감은 머리 틈으로 휜 뿔 두 개가 비어져 나오고, 얼굴엔 귀밑까지 찢어진 입,
// 깊이 꺼진 눈두덩 속 호박색 눈. 두 손으로 녹슨 창을 비스듬히 겨눴다.

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);

export default function lengSlave() {
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const path = (pts, rf) => {
    pts.forEach((p, i) => ch.push([...p, rf(i / (pts.length - 1))]));
    brk();
  };
  // 염소 다리: 엉덩이 → 무릎(앞) → 뒤꿈치(뒤로 높이) → 발목 → 발굽
  for (const sx of [1, -1]) {
    const st = sx > 0 ? 0.08 : -0.1;
    path([[sx * 0.12, 0.92, -0.02 + st * 0.2], [sx * 0.16, 0.6, 0.2 + st], [sx * 0.15, 0.4, -0.16 + st], [sx * 0.15, 0.1, -0.02 + st], [sx * 0.15, 0.04, 0.04 + st]], (t) => (t < 0.25 ? 0.09 - 0.1 * t : t < 0.5 ? 0.065 - 0.1 * (t - 0.25) : 0.04 - 0.02 * (t - 0.5)) + 0.01 * Math.exp(-((t - 0.5) ** 2) * 300));
  }
  // 팔: 창을 두 손으로 쥐었다
  // 창: 뒤 손(오른쪽) → 앞 손(왼쪽) → 창끝은 왼쪽 앞으로
  const hR = [-0.24, 1.08, 0.36];
  const hL = [0.2, 1.02, 0.1];
  path([[0.17, 1.42, 0.02], [0.32, 1.15, 0.0], hL], (t) => 0.042 - 0.014 * t);
  path([[-0.17, 1.42, 0.02], [-0.3, 1.2, 0.18], hR], (t) => 0.042 - 0.014 * t);
  for (const [h, sx] of [[hR, 1], [hL, -1]]) {
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5) * 0.018;
      path([add(h, [0, o, 0.0]), add(h, [-sx * 0.03, o - 0.005, 0.035]), add(h, [-sx * 0.045, o - 0.025, 0.01])], (t) => 0.011 - 0.004 * t);
    }
  }
  const nSkin = ch.length;
  // 끊어진 사슬: 목줄에서 늘어진다
  const links = [];
  let c = [0.02, 1.47, 0.14];
  for (let i = 0; i < 6; i++) {
    links.push([...c, i % 2]);
    c = add(c, [0.012 * Math.sin(i * 1.3), -0.055, 0.012]);
  }
  return {
    preset: 'act5',
    cam: { pos: [1.9, 0.65, 4.3], target: [-0.1, 0.92, 0.1], fov: 1.75 },
    light: {
      key: [-0.45, 0.55, -0.7],
      keyCol: [1.15, 0.9, 1.05],
      fillCol: [0.06, 0.08, 0.1],
      amb: [0.014, 0.012, 0.016],
      rimCol: [1.05, 0.85, 1.05],
      rim: 1.7,
      exposure: 1.2,
      glow: 0.05,
      pt: [-0.4, 1.3, 0.9],
      ptCol: [0.55, 0.36, 0.16],
    },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: {
      uB: ch,
      uA: links,
      uL: [
        [0.038, 1.589, 0.318, 0.006],
        [-0.038, 1.589, 0.318, 0.006],
      ],
      uLC: [
        [1.0, 0.7, 0.3, 1.5],
        [1.0, 0.7, 0.3, 1.5],
      ],
      uP: [[nSkin, links.length, 0, 0], [...hR, 0], [...hL, 0]],
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
float bend(float y) { float h = max(y - 0.95, 0.0); return 0.6 * h * h; }

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.0, 0.95, 0.1)) - 1.3;
  if (bb > 0.3) return vec2(bb, 1.0);
  vec3 b = p;
  b.z -= bend(b.y);
  vec3 sp = vec3(abs(b.x), b.y, b.z);
  // ── 맨 상체: 갈비가 드러나고 굽었다
  float torso = sdEllipsoid(b - vec3(0.0, 1.28, 0.0), vec3(0.17, 0.2, 0.11));
  torso = smin(torso, sdEllipsoid(b - vec3(0.0, 1.02, 0.0), vec3(0.12, 0.13, 0.09)), 0.08);
  torso = smin(torso, sdEllipsoid(sp - vec3(0.15, 1.41, 0.0), vec3(0.07, 0.05, 0.06)), 0.05);
  float ribs = abs(fract(b.y * 26.0) - 0.5);
  torso += 0.004 * smoothstep(0.25, 0.05, ribs) * smoothstep(0.08, 0.15, abs(b.x)) * smoothstep(1.12, 1.2, b.y) * smoothstep(1.4, 1.3, b.y);
  // 골반과 털북숭이 허리
  float hips = sdEllipsoid(b - vec3(0.0, 0.9, -0.02), vec3(0.16, 0.12, 0.11));
  // 목과 머리
  torso = smin(torso, sdRoundCone(p, vec3(0.0, 1.44, 0.03 + bend(1.44)), vec3(0.0, 1.54, 0.2), 0.05, 0.04), 0.03);
  vec3 hq = p - vec3(0.0, 1.6, 0.24);
  hq.yz = rot(0.3) * hq.yz;
  float head = sdEllipsoid(hq, vec3(0.08, 0.095, 0.085));
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.06, 0.03), vec3(0.07, 0.05, 0.065)), 0.03);
  vec3 hs = vec3(abs(hq.x), hq.yz);
  // 꺼진 눈두덩과 납작한 코
  head = smax(head, -sdSphere(hs - vec3(0.038, 0.012, 0.075), 0.017), 0.008);
  head = smin(head, sdEllipsoid(hs - vec3(0.038, 0.032, 0.07), vec3(0.025, 0.008, 0.015)), 0.008);
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.015, 0.085), vec3(0.016, 0.015, 0.012)), 0.01);
  // 귀밑까지 찢어진 넓은 입
  float headRaw = head;
  float mcurve = -0.05 + 2.4 * hq.x * hq.x;
  float mouth = max(abs(hq.y - mcurve) - 0.004 - 0.012 * smoothstep(0.06, 0.0, abs(hq.x)), max(abs(hq.x) - 0.075, -hq.z + 0.01));
  head = smax(head, -mouth, 0.004);
  float body = smin(torso, head, 0.03);
  float limbs = chainR(p, 0, int(uP[0].x), 0.02);
  // 털: 허리 아래 다리를 덮은 엉긴 털
  float fur = smin(hips, chainR(p, 0, 10, 0.02), 0.05);
  fur -= 0.022 * noise(p * vec3(50.0, 12.0, 50.0)) * smoothstep(1.0, 0.85, p.y) * smoothstep(0.3, 0.5, p.y);
  // 힘줄과 마른 근육 결
  torso += 0.006 * (fbm3(p * 14.0) - 0.5) - 0.004 * smoothstep(0.2, 0.0, ridge(p * vec3(8.0, 20.0, 8.0)));
  body = smin(body, limbs, 0.03);
  body = smin(body, fur, 0.04);
  vec2 r = vec2(body, fur < body + 0.003 && p.y < 0.98 ? 2.0 : 1.0);
  // 허리에 두른 누더기 천
  vec3 lq = p - vec3(0.0, 0.0, -0.01);
  float lyy = clamp((0.98 - lq.y) / 0.3, 0.0, 1.0);
  float lrad = 0.16 + 0.05 * lyy + 0.015 * sin(atan(lq.z, lq.x) * 7.0) * lyy;
  float loin = (length(lq.xz) - lrad) * 0.8;
  loin = abs(loin) - 0.008;
  loin = max(loin, lq.y - 0.98);
  loin = max(loin, (0.7 + 0.12 * fbm3(vec3(lq.x * 12.0, 0.0, lq.z * 12.0)) + 0.08 * sin(atan(lq.z, lq.x) * 5.0)) - lq.y);
  r = umin(r, vec2(loin, 4.0));
  r = umin(r, vec2(max(mouth + 0.002, headRaw + 0.004), 99.0));
  float tx = mod(hq.x + 0.006, 0.012) - 0.006;
  float teeth = max(sdBox(vec3(tx, hq.y - mcurve + 0.004, hq.z - 0.065), vec3(0.003, 0.006, 0.01)), abs(hq.x) - 0.06);
  teeth = max(teeth, headRaw + 0.001);
  r = umin(r, vec2(teeth, 5.0));
  // 발굽
  float hoof = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? 1.0 : -1.0;
    float st = s == 0 ? 0.08 : -0.1;
    vec3 hq2 = p - vec3(sx * 0.15, 0.035, 0.05 + st);
    float hf = sdRoundCone(hq2, vec3(0.0, 0.02, -0.02), vec3(0.0, -0.01, 0.04), 0.04, 0.03);
    hf = max(hf, -sdBox(hq2 - vec3(0.0, 0.0, 0.05), vec3(0.006, 0.05, 0.04)));
    hf = max(hf, -hq2.y - 0.03);
    hoof = min(hoof, hf);
  }
  r = umin(r, vec2(hoof, 3.0));
  // 누더기 터번 (머리를 칭칭 감았다)
  vec3 tq = hq - vec3(0.0, 0.045, -0.01);
  float turban = sdEllipsoid(tq, vec3(0.105, 0.075, 0.1));
  turban = max(turban, -(tq.y + 0.035 + 0.02 * sin(atan(tq.z, tq.x) * 3.0)));
  float wrap = sin(tq.y * 90.0 + atan(tq.z, tq.x) * 2.0);
  turban -= 0.004 * smoothstep(0.3, 1.0, wrap);
  turban = smin(turban, sdRoundCone(tq, vec3(0.05, -0.02, -0.06), vec3(0.09, -0.16, -0.1), 0.03, 0.012), 0.02);
  r = umin(r, vec2(turban, 4.0));
  // 터번 틈으로 비어져 나온 휜 뿔
  float horn = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? 1.0 : -1.0;
    vec3 prev = vec3(sx * 0.07, 0.08, 0.0);
    for (int i = 1; i <= 9; i++) {
      float t = float(i) / 9.0;
      float a = t * 4.2;
      float rr = 0.1 * (1.0 - 0.4 * t);
      vec3 cur = vec3(sx * (0.08 + 0.09 * t + rr * 0.3), 0.07 + rr * sin(a) * 0.95, -0.02 - rr * (1.0 - cos(a)) * 0.9 + 0.08 * t);
      horn = min(horn, sdRoundCone(hq, prev, cur, 0.034 * (1.0 - (t - 0.11) * 0.7), 0.034 * (1.0 - t * 0.72)));
      prev = cur;
    }
  }
  horn += 0.002 * sin(length(hq.yz) * 260.0);
  r = umin(r, vec2(horn, 5.0));
  // 쇠 목줄과 끊어진 사슬
  vec3 cq = p - vec3(0.0, 1.49, 0.07 + bend(1.49) * 0.5);
  float collar = sdTorus(cq, vec2(0.065, 0.016));
  for (int i = 0; i < 8; i++) {
    if (i >= int(uP[0].y)) break;
    vec4 L = uA[i];
    vec3 lq = p - L.xyz;
    lq = L.w > 0.5 ? lq.zyx : lq;
    collar = min(collar, sdTorus(lq.xzy * vec3(1.0, 1.0, 0.7), vec2(0.022, 0.006)));
  }
  // 녹슨 창: 두 손을 지나 비스듬히
  vec3 hR = uP[1].xyz;
  vec3 hL = uP[2].xyz;
  vec3 sd = normalize(hR - hL);
  vec3 sA = hL - sd * 0.55;
  vec3 sB = hR + sd * 0.75;
  float spear = sdCapsule(p, sA, sB, 0.014);
  vec3 bq = p - sB;
  float along = dot(bq, sd);
  float blade = max(length(bq - sd * along) - 0.035 * (1.0 - clamp(along / 0.2, 0.0, 1.0)), abs(along - 0.1) - 0.1);
  spear = min(spear, blade);
  spear = min(spear, sdCapsule(p, sB - sd * 0.02, sB + sd * 0.02, 0.022));
  r = umin(r, vec2(min(collar, spear), 6.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float v = fbm3(p * 10.0);
  if (id < 1.5) {
    // 볕에 그을리고 때 묻은 살갗, 채찍 자국
    float scar = smoothstep(0.04, 0.0, abs(fract(p.x * 4.0 + p.y * 6.0 + 0.3 * v) - 0.5) - 0.47) * smoothstep(1.15, 1.25, p.y) * step(p.z, 0.0);
    vec3 alb = vec3(0.075, 0.055, 0.045) * (0.6 + 0.6 * v);
    alb = mix(alb, vec3(0.14, 0.04, 0.035), scar * 0.8);
    return Mat(alb, 0.6, 0.35, vec3(0.0), 0.0, 0.4, 0.15);
  }
  if (id < 2.5) {
    // 염소 다리 털: 엉긴 짙은 갈색
    float strand = noise(p * vec3(60.0, 16.0, 60.0));
    return Mat(vec3(0.05, 0.035, 0.025) * (0.5 + 0.9 * strand), 0.95, 0.1, vec3(0.0), 0.0, 0.1, 0.0);
  }
  if (id < 3.5) return Mat(vec3(0.02, 0.018, 0.016), 0.3, 0.9, vec3(0.0), 0.0, 0.0, 0.3);
  if (id < 4.5) {
    // 누더기 터번: 바랜 황토빛 천
    return Mat(vec3(0.12, 0.09, 0.05) * (0.6 + 0.6 * v), 0.92, 0.08, vec3(0.0), 0.0, 0.2, 0.0);
  }
  if (id < 5.5) return Mat(vec3(0.1, 0.085, 0.065) * (0.7 + 0.4 * v), 0.45, 0.5, vec3(0.0), 0.0, 0.1, 0.1);
  // 녹슨 쇠
  float rust = fbm3(p * 25.0);
  return Mat(mix(vec3(0.045, 0.04, 0.038), vec3(0.14, 0.055, 0.02), rust), 0.55, 0.7, vec3(0.0), 0.0, 0.0, 0.1);
}
`,
  };
}
