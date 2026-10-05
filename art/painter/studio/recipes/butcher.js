// 어시장 도살자 (1층 정예) — 어시장 뒷골목의 거구 도살자.
// 짐승처럼 웅크린 거대한 몸, 솟은 승모근 사이에 파묻힌 머리엔 노끈으로 묶은 삼베 자루를 뒤집어썼고
// 찢어 낸 눈구멍 속에서 핏빛이 번뜩인다. 피에 절어 번들거리는 가죽 앞치마, 흉터투성이 굵은 팔.
// 문짝만 한 식칼을 머리 위로 치켜들었고 (도축 준비), 다른 손엔 쇠사슬에 매단 고기 갈고리.
// (컴파일 가속: 사슬은 k1-kit 의 동적 반복문, 코어 main 은 KIT_MAIN 으로 대체 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3 } from './k1-kit.js';

export default function butcher() {
  const sk = new Skel();
  // 다리: 짧고 굵게 벌어졌다 (바지·장화, 재질 6)
  sk.group(6, 0.06, 0.06, (s) => {
    for (const sx of [-1, 1]) {
      s.chain([[0.24 * sx, 0.78, 0.04, 0.19], [0.32 * sx, 0.45, 0.12, 0.16], [0.33 * sx, 0.1, 0.06, 0.14]]);
      s.chain([[0.33 * sx, 0.08, 0.04, 0.11], [0.34 * sx, 0.065, 0.18, 0.09], [0.35 * sx, 0.05, 0.31, 0.065]]);
    }
  });
  // 팔 (맨살, 재질 2): 오른팔은 식칼을 머리 위로 치켜들고, 왼팔은 늘어뜨렸다
  const shR = [0.55, 1.62, 0.08];
  const elR = [0.9, 1.88, 0.12];
  const wrR = [0.72, 2.3, 0.28];
  const shL = [-0.55, 1.6, 0.08];
  const elL = [-0.74, 1.18, 0.18];
  const wrL = [-0.7, 0.84, 0.36];
  sk.group(2, 0.06, 0.12, (s) => {
    s.chain([[...shR, 0.17], [...lerp3(shR, elR, 0.45), 0.165], [...elR, 0.12], [...lerp3(elR, wrR, 0.35), 0.135], [...wrR, 0.085]]);
    s.chain([[...shL, 0.17], [...lerp3(shL, elL, 0.45), 0.16], [...elL, 0.12], [...lerp3(elL, wrL, 0.35), 0.13], [...wrL, 0.085]]);
  });
  // 손: 굵은 손가락 (오른손은 식칼 자루, 왼손은 쇠사슬)
  sk.group(2, 0.02, 0.03, (s) => {
    s.hand(add(wrR, [-0.02, 0.08, 0.04]), [-0.2, 0.9, 0.3], [-0.9, -0.2, 0.3], { len: 0.17, curl: 1.9, r: 0.03, spread: 0.05 });
    s.hand(add(wrL, [-0.02, -0.08, 0.06]), [0.0, -0.95, 0.3], [-0.9, 0.0, 0.3], { len: 0.17, curl: 1.7, r: 0.03, spread: 0.06 });
  });
  // 쇠사슬 + 고기 갈고리 줄 (재질 3)
  const chainTop = add(wrL, [0.0, -0.22, 0.1]);
  const hookTop = [-0.66, 0.36, 0.6];
  sk.group(3, 0.0, 0.0, (s) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const q = lerp3(chainTop, hookTop, i / 5);
      pts.push([q[0] + Math.sin(i * 2.0) * 0.012, q[1], q[2] + Math.sin(i * 1.3) * 0.02, 0.018]);
    }
    s.chain(pts);
  });
  const arr = sk.pack();
  const head = [0.0, 1.86, 0.24];
  return {
    preset: 'act1',
    cam: { pos: [1.4, 0.45, 6.6], target: [0.1, 1.36, 0.2], fov: 1.75 },
    light: { pt: [0.1, 1.0, 1.3], ptCol: [0.4, 0.07, 0.04], fillCol: [0.4, 0.24, 0.12], rim: 1.25 },
    arrays: {
      ...arr,
      uL: [
        [head[0] - 0.062, head[1] + 0.01, head[2] + 0.13, 0.014],
        [head[0] + 0.065, head[1] + 0.005, head[2] + 0.13, 0.014],
      ],
      uLC: [
        [1.0, 0.15, 0.06, 2.2],
        [1.0, 0.15, 0.06, 2.2],
      ],
    },
    glsl: /* glsl */ `
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});

// 큰 식칼: 오른손에 쥐고 머리 위로, 칼날은 뒤로 젖혀졌다
float cleaver(vec3 p) {
  vec3 q = p - vec3(0.7, 2.36, 0.3);
  q.xy = rot(-0.25) * q.xy;
  float grip = sdCapsule(q, vec3(0.0, -0.16, 0.0), vec3(0.0, 0.08, 0.0), 0.032);
  vec3 bq = q - vec3(-0.13, 0.36, 0.0);
  float blade = sdBox(bq, vec3(0.2, 0.28, 0.012 - 0.008 * smoothstep(0.0, 0.2, -bq.x)));
  blade = max(blade, -(length(bq.xy - vec2(0.12, 0.2)) - 0.032));
  float bolster = sdBox(q - vec3(0.0, 0.1, 0.0), vec3(0.05, 0.035, 0.025));
  return min(min(grip, blade), bolster);
}

// 몸통: 처진 배, 두꺼운 가슴, 솟은 승모근, 등의 혹
float torsoD(vec3 p) {
  vec3 ps = vec3(abs(p.x), p.y, p.z);
  float gut = sdEllipsoid(p - vec3(0.0, 0.98, 0.16), vec3(0.42, 0.4, 0.38));
  float chest = sdEllipsoid(p - vec3(0.0, 1.42, 0.08), vec3(0.46, 0.3, 0.3));
  float pec = sdEllipsoid(ps - vec3(0.19, 1.47, 0.27), vec3(0.18, 0.12, 0.09));
  float delt = sdEllipsoid(ps - vec3(0.53, 1.6, 0.06), vec3(0.18, 0.17, 0.17));
  float trap = sdEllipsoid(ps - vec3(0.2, 1.72, -0.02), vec3(0.22, 0.13, 0.16));
  float hump = sdEllipsoid(p - vec3(0.0, 1.62, -0.16), vec3(0.4, 0.3, 0.24));
  float d = smin(gut, chest, 0.2);
  d = smin(d, pec, 0.08);
  d = smin(d, delt, 0.1);
  d = smin(d, smin(trap, hump, 0.15), 0.12);
  d = smin(d, sdCapsule(p, vec3(0.0, 1.66, 0.08), vec3(0.0, 1.82, 0.2), 0.13), 0.1);
  return d;
}

vec2 sdf(vec3 p) {
  float bound = sdCapsule(p, vec3(0.05, 0.0, 0.2), vec3(0.15, 2.7, 0.2), 1.15);
  if (bound > 0.3) return vec2(bound, 2.0);
  float body = torsoD(p);
  vec2 r = vec2(body, 2.0);
  // ── 가죽 앞치마: 가슴에서 정강이까지, 배를 따라 휘고 아래는 늘어진 판 ──
  float onBody = abs(body - 0.028) - 0.013;
  onBody = max(onBody, -(p.z - 0.12 + 0.2 * (p.y - 1.0) * (p.y - 1.0)));
  float lowerSheet = sdRoundBox(p - vec3(0.0, 0.48, 0.42 - 0.18 * (0.75 - p.y)), vec3(0.36 + 0.05 * (0.8 - p.y), 0.36, 0.012), 0.01);
  float apron = min(onBody, lowerSheet);
  apron = max(apron, max(p.y - 1.56 + 0.9 * p.x * p.x, abs(p.x) - mix(0.38, 0.24, smoothstep(1.05, 1.5, p.y))));
  apron = max(apron, 0.14 + 0.03 * sin(p.x * 30.0) - p.y);
  // 목끈과 허리끈
  vec3 nq = p - vec3(0.0, 1.66, 0.12);
  apron = min(apron, max(abs(length(nq.xz * vec2(1.0, 1.25)) - 0.2) - 0.012, abs(nq.y + 0.25 * nq.z) - 0.018));
  apron = min(apron, max(abs(body - 0.03) - 0.018, abs(p.y - 1.05) - 0.022));
  r = umin(r, vec2(apron, 5.0));
  // ── 삼베 자루 머리: 묶인 꼭지, 목에서 노끈으로 졸라맸다 ──
  vec3 h = p - HEAD;
  h.yz = rot(0.3) * h.yz;
  float sack = sdEllipsoid(h, vec3(0.16, 0.19, 0.17));
  sack = smin(sack, sdEllipsoid(h - vec3(0.02, 0.17, -0.04), vec3(0.07, 0.07, 0.07)), 0.06);
  sack = smin(sack, sdCapsule(h, vec3(0.02, 0.2, -0.05), vec3(0.08, 0.32, -0.1), 0.02), 0.04);
  sack += 0.006 * sin(h.x * 40.0 + h.y * 15.0) * sin(h.y * 35.0 - h.z * 20.0);
  vec3 es = vec3(abs(h.x) - 0.062, h.y - 0.01, h.z - 0.14);
  float eyes = sdEllipsoid(es, vec3(0.03, 0.02 + 0.006 * sin(h.x * 70.0), 0.05));
  sack = smax(sack, -eyes, 0.008);
  vec2 hr = vec2(sack, 8.0);
  hr = umin(hr, vec2(sdEllipsoid(es + vec3(0.0, 0.0, 0.02), vec3(0.026, 0.018, 0.03)), 99.0));
  hr = umin(hr, vec2(sdTorus(h + vec3(0.0, 0.15, 0.0), vec2(0.12, 0.016)), 7.0));
  r = umin(r, hr);
  // ── 사슬 무리: 다리·팔·손·사슬 ──
  r = skel(p, r);
  // ── 식칼 ──
  if (length(p - vec3(0.62, 2.6, 0.3)) - 0.6 < r.x) r = umin(r, vec2(cleaver(p), 3.0));
  // ── 고기 갈고리 (S자) ──
  vec3 k = p - vec3(${hookTop.join(', ')});
  float hook = length(vec2(length(k.xy - vec2(0.0, -0.08)) - 0.08, k.z)) - 0.014;
  hook = max(hook, k.x);
  float hook2 = length(vec2(length(k.xy - vec2(0.0, -0.24)) - 0.08, k.z)) - 0.016;
  hook2 = max(hook2, -k.x);
  hook = min(min(hook, hook2), sdCapsule(k, vec3(0.08, -0.24, 0.0), vec3(0.08, -0.17, 0.0), 0.012));
  r = umin(r, vec2(hook, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 2.5) {
    // 창백하고 얼룩진 살갗: 흉터, 핏자국
    float bl = fbm3(p * 9.0);
    float scar = smoothstep(0.05, 0.0, ridge(p * vec3(4.0, 11.0, 4.0))) * smoothstep(0.5, 0.7, noise(p * 2.0));
    float blood = smoothstep(0.5, 0.72, fbm3(p * 5.0 + 3.0));
    vec3 alb = vec3(0.12, 0.09, 0.075) * (0.65 + 0.5 * bl);
    alb = mix(alb, vec3(0.17, 0.07, 0.06), scar);
    alb = mix(alb, vec3(0.06, 0.006, 0.004), blood * 0.85);
    return Mat(alb, 0.5 - blood * 0.25, 0.3 + blood * 0.5, vec3(0.0), 0.0, 0.45, 0.2 + blood * 0.5);
  }
  if (id < 3.5) {
    // 쇠: 날은 닦여 번들, 나머지는 녹과 말라붙은 피
    float rust = smoothstep(0.4, 0.75, fbm3(p * 12.0));
    float blood = smoothstep(0.45, 0.7, fbm3(p * 7.0 + 9.0));
    vec3 alb = mix(vec3(0.07, 0.07, 0.072), vec3(0.09, 0.04, 0.02), rust);
    alb = mix(alb, vec3(0.06, 0.005, 0.003), blood * 0.85);
    return Mat(alb, mix(0.3, 0.8, rust), mix(1.0, 0.25, rust), vec3(0.0), 0.0, 0.0, 0.3 + blood * 0.5);
  }
  if (id < 5.5) {
    // 피에 절은 가죽 앞치마: 검붉고 번들번들, 흘러내린 자국
    float drip = smoothstep(0.5, 0.85, fbm3(p * vec3(18.0, 2.0, 18.0)));
    float dirt = fbm3(p * 4.0);
    vec3 alb = mix(vec3(0.035, 0.018, 0.013), vec3(0.08, 0.006, 0.004), drip) * (0.6 + 0.6 * dirt);
    return Mat(alb, 0.32 - drip * 0.15, 0.6 + drip * 0.4, vec3(0.0), 0.0, 0.0, 0.55 + drip * 0.3);
  }
  if (id < 6.5) return Mat(vec3(0.022, 0.02, 0.018), 0.45, 0.4, vec3(0.0), 0.0, 0.0, 0.5);
  if (id < 7.5) return Mat(vec3(0.08, 0.065, 0.045), 0.85, 0.15, vec3(0.0), 0.0, 0.0, 0.1);
  // 삼베 자루: 성긴 올, 핏물 번진 얼룩
  vec3 q = p * 150.0;
  float weave = 0.75 + 0.25 * abs(sin(q.x + q.z) * sin(q.y));
  float stain = smoothstep(0.5, 0.75, fbm3(p * 8.0 + 1.0));
  vec3 alb = mix(vec3(0.12, 0.095, 0.065), vec3(0.07, 0.012, 0.008), stain) * weave * (0.7 + 0.4 * fbm3(p * 20.0));
  return Mat(alb, 0.9, 0.1, vec3(0.0), 0.0, 0.1, 0.1 + stain * 0.4);
}
${KIT_MAIN}
`,
  };
}
