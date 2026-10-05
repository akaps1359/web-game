// 거대 게 (1층 정예) — 침수 구역 바닥을 기어 다니는 마차만 한 게.
// 따개비와 해초가 엉겨 붙은 가시 돋친 검붉은 등딱지, 짧은 자루 끝의 검은 눈에 주황빛, 마디마디 굵은 다리,
// 하나는 머리 위로 치켜들어 벌린 거대한 부수는 집게, 하나는 앞으로 내민 작은 집게. 입가엔 거품이 끓는다.
// (컴파일 가속: 사슬은 k1-kit 의 동적 반복문, 코어 main 은 KIT_MAIN 으로 대체 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, lerp3, rng } from './k1-kit.js';

export default function crab({ seed = 1 } = {}) {
  const R = rng(seed * 211 + 7);
  const sk = new Skel();
  // 걷는 다리 4쌍: 몸 옆에서 위로 솟았다가 바닥으로 꺾인다 (마디는 굵고 관절은 가늘다)
  sk.group(1, 0.03, 0.05, (s) => {
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = 0.25 - i * 0.23;
        const sp = 1.0 + i * 0.06;
        const base = [sx * 0.64, 0.6, z];
        const fan = 0.32 - i * 0.26;
        const knee = [sx * 1.0 * sp, 0.95 - i * 0.04, z + fan * 0.6];
        const ank = [sx * 1.36 * sp, 0.52, z + fan * 1.3];
        const tip = [sx * 1.5 * sp, 0.0, z + fan * 1.9];
        s.chain([[...base, 0.1], [...lerp3(base, knee, 0.5), 0.1], [...knee, 0.072], [...lerp3(knee, ank, 0.5), 0.08], [...ank, 0.055], [...lerp3(ank, tip, 0.5), 0.05], [...tip, 0.012]]);
      }
    }
  });
  // 집게발: 큰 집게는 치켜들어 벌렸고, 작은 집게는 앞으로 내밀었다 (손바닥 마디는 두툼한 장갑 모양)
  sk.group(4, 0.05, 0.06, (s) => {
    s.chain([[0.52, 0.66, 0.38, 0.13], [0.78, 1.0, 0.66, 0.13], [0.78, 1.22, 0.9, 0.17], [0.7, 1.42, 1.08, 0.22], [0.6, 1.58, 1.22, 0.17]]);
    s.chain([[-0.52, 0.64, 0.4, 0.1], [-0.74, 0.7, 0.74, 0.095], [-0.66, 0.7, 0.94, 0.12], [-0.56, 0.68, 1.1, 0.11]]);
  });
  sk.group(5, 0.02, 0.06, (s) => {
    // 큰 집게: 아래 고정 손가락 (앞으로 휘어 내려감) + 위 움직이는 손가락 (위로 벌어짐)
    s.curve([[0.58, 1.58, 1.3], [0.52, 1.62, 1.48], [0.44, 1.56, 1.62], [0.38, 1.46, 1.68]], 5, 0.1, 0.018, 0.9);
    s.curve([[0.62, 1.72, 1.24], [0.6, 1.92, 1.36], [0.52, 2.02, 1.52], [0.42, 1.98, 1.64]], 5, 0.09, 0.016, 0.9);
    // 작은 집게
    s.curve([[-0.53, 0.62, 1.18], [-0.48, 0.58, 1.3], [-0.42, 0.56, 1.4], [-0.37, 0.6, 1.46]], 4, 0.06, 0.012, 0.9);
    s.curve([[-0.54, 0.76, 1.16], [-0.5, 0.82, 1.28], [-0.43, 0.8, 1.38], [-0.38, 0.74, 1.44]], 4, 0.055, 0.012, 0.9);
  });
  // 눈자루
  sk.group(1, 0.02, 0.03, (s) => {
    s.chain([[-0.12, 0.86, 0.5, 0.035], [-0.15, 1.0, 0.56, 0.028]]);
    s.chain([[0.12, 0.86, 0.5, 0.035], [0.15, 1.01, 0.57, 0.028]]);
  });
  // 입가의 거품
  for (let i = 0; i < 14; i++) {
    sk.blob((R() - 0.5) * 0.26, 0.52 + R() * 0.14, 0.6 + R() * 0.1, 0.012 + R() * 0.02);
  }
  const arr = sk.pack();
  return {
    preset: 'act1',
    cam: { pos: [2.9, 2.6, 7.1], target: [0.05, 0.8, 0.3], fov: 1.75 },
    light: { pt: [0.0, 0.9, 1.3], ptCol: [0.45, 0.18, 0.06], rim: 1.3 },
    arrays: {
      ...arr,
      uL: [
        [-0.15, 1.03, 0.6, 0.008],
        [0.15, 1.04, 0.61, 0.008],
      ],
      uLC: [
        [1.0, 0.5, 0.2, 2.4],
        [1.0, 0.5, 0.2, 2.4],
      ],
    },
    glsl: /* glsl */ `
${KIT_GLSL}
vec2 sdf(vec3 p) {
  float bound = length((p - vec3(0.0, 0.9, 0.4)) * vec3(0.55, 0.7, 0.7)) - 1.3;
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 등딱지: 넓고 납작하며 앞 가장자리와 옆에 가시, 등엔 혹과 고랑 ──
  vec3 c = p - vec3(0.0, 0.7, 0.05);
  c.yz = rot(-0.12) * c.yz;
  float ca = atan(c.z, c.x);
  float rimMask = smoothstep(0.12, 0.0, abs(c.y + 0.02));
  float spikes = 0.07 * pow(max(sin(ca * 15.0), 0.0), 6.0) * rimMask * smoothstep(-0.5, 0.1, c.z);
  float shell = sdEllipsoid(c, vec3(0.82, 0.3, 0.62)) - spikes;
  shell = smin(shell, sdEllipsoid(c - vec3(0.0, 0.14, -0.08), vec3(0.48, 0.18, 0.4)), 0.12);
  vec3 cs = vec3(abs(c.x), c.y, c.z);
  shell = smin(shell, sdEllipsoid(cs - vec3(0.36, 0.12, 0.12), vec3(0.2, 0.12, 0.18)), 0.08);
  shell = smax(shell, -sdEllipsoid(cs - vec3(0.2, 0.28, 0.05), vec3(0.03, 0.08, 0.3)), 0.03);
  shell += 0.012 * sin(c.x * 26.0 + sin(c.z * 19.0) * 2.0) * sin(c.z * 23.0 + c.x * 5.0) * smoothstep(-0.1, 0.2, c.y);
  shell = smin(shell, sdEllipsoid(p - vec3(0.0, 0.5, 0.12), vec3(0.6, 0.14, 0.5)), 0.1);
  vec2 r = vec2(shell, 2.0);
  // 입 (어두운 틈) 과 거품
  r = umin(r, vec2(sdEllipsoid(p - vec3(0.0, 0.55, 0.6), vec3(0.12, 0.06, 0.04)), 99.0));
  r = umin(r, vec2(blobR(p, 0.006), 6.0));
  // 눈알 (검고 젖었다)
  float eyes = min(length(p - vec3(-0.152, 1.015, 0.57)) - 0.034, length(p - vec3(0.152, 1.025, 0.58)) - 0.034);
  r = umin(r, vec2(eyes, 7.0));
  // 사슬 무리: 다리·집게 팔·집게 손가락·눈자루
  r = skel(p, r);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  // 따개비 무늬
  vec3 bq = p * 22.0;
  vec3 bf = fract(bq) - 0.5;
  float bh = hash31(floor(bq));
  float barn = step(0.78, bh) * smoothstep(0.42, 0.22, length(bf.xz)) * smoothstep(0.55, 0.8, fbm3(p * 3.0 + 5.0)) * smoothstep(-0.2, 0.6, n.y);
  float hole = barn * smoothstep(0.1, 0.04, length(bf.xz));
  float algae = smoothstep(0.55, 0.8, fbm3(p * 4.0 + 2.0)) * smoothstep(0.0, 0.7, n.y);
  if (id < 5.5) {
    // 검붉은 등딱지: 얼룩덜룩, 마디 끝과 집게 끝은 검고, 윗면엔 해초와 따개비
    float tone = fbm3(p * 5.0);
    float speck = smoothstep(0.6, 0.75, noise(p * 30.0));
    vec3 alb = mix(vec3(0.05, 0.014, 0.01), vec3(0.15, 0.045, 0.025), tone);
    alb = mix(alb, alb * 0.5, speck);
    float tipDark = id > 4.5 ? smoothstep(0.3, 0.9, length(p - vec3(0.62, 1.6, 1.2)) * 2.0) : 0.0;
    if (id > 4.5 && p.x < 0.0) tipDark = smoothstep(0.2, 0.6, length(p - vec3(-0.54, 0.68, 1.12)) * 2.0);
    alb = mix(alb, vec3(0.015, 0.01, 0.01), tipDark);
    alb = mix(alb, vec3(0.03, 0.045, 0.02), algae * 0.7);
    alb = mix(alb, vec3(0.2, 0.19, 0.16) * (1.0 - hole), barn);
    return Mat(alb, 0.62 + barn * 0.3, 0.38 * (1.0 - barn), vec3(0.0), 0.0, 0.15, 0.3);
  }
  if (id < 6.5) return Mat(vec3(0.3, 0.31, 0.28), 0.15, 1.0, vec3(0.0), 0.2, 0.9, 0.9);
  // 눈알
  return Mat(vec3(0.01, 0.006, 0.004), 0.05, 1.5, vec3(0.04, 0.012, 0.0), 0.0, 0.0, 1.0);
}
${KIT_MAIN}
`,
  };
}
