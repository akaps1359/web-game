// 서리 망령 (3층 일반) — 얼어 죽은 자의 마지막 숨이 서리가 되어 떠돈다. 지나간 자리마다 온기가 사라진다.
// 성에가 엉겨 굳은 수의를 뒤집어쓴 여윈 얼굴: 얼음으로 된 해골 같은 얼굴, 텅 빈 눈구멍 속의 창백한 빛,
// 길게 찢어진 입에서 마지막 숨이 하얀 김으로 흘러나온다. 뼈만 남은 두 팔이 고드름 손가락으로 앞을 더듬고,
// 가슴 아래로는 몸이 풀려 서리 안개가 되어 끌린다. 떠다니는 얼음 결정.
import { rng } from '../../lib.js';

export default function frostWraith({ seed = 1 } = {}) {
  const R = rng(seed * 59 + 1);
  const head = [0.0, 1.78, 0.12];
  const lights = [
    [head[0] - 0.034, head[1] + 0.03, head[2] + 0.085, 0.005],
    [head[0] + 0.034, head[1] + 0.026, head[2] + 0.085, 0.005],
  ];
  const lc = [
    [0.7, 0.9, 1.0, 1.6],
    [0.7, 0.9, 1.0, 1.6],
  ];
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.3 + R() * 0.7;
    lights.push([Math.cos(a) * rr, 0.4 + R() * 1.7, Math.sin(a) * rr * 0.6 + 0.1, 0.003 + R() * 0.005]);
    lc.push([0.65, 0.85, 1.0, 1.0]);
  }
  return {
    preset: 'act3',
    cam: { pos: [0.5, 1.15, 6.4], target: [0.0, 1.15, 0.0], fov: 1.85 },
    light: {
      key: [-0.3, 0.6, -0.75],
      rim: 2.0,
      fillCol: [0.05, 0.1, 0.13],
      amb: [0.02, 0.03, 0.045],
      exposure: 1.2,
      glow: 0.08,
      pt: [0.0, 1.3, 0.9],
      ptCol: [0.12, 0.2, 0.3],
    },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uL: lights, uLC: lc },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 110
#define VOLUME_FAR 11.0

const vec3 HEAD = vec3(${head.join(', ')});

vec3 headLocal(vec3 p) {
  vec3 hq = p - HEAD;
  hq.yz = rot(-0.4) * hq.yz;
  hq.xy = rot(0.12) * hq.xy;
  return hq;
}

/** 뼈만 남은 팔: 어깨 s → 팔꿈치 e → 손목 w, 고드름 손가락 */
float boneArm(vec3 p, vec3 s, vec3 e, vec3 w, vec3 fd, float sp, out float fingers) {
  float d = sdRoundCone(p, s, e, 0.03, 0.022);
  d = smin(d, sdRoundCone(p, e, w, 0.022, 0.016), 0.02);
  d = smin(d, sdSphere(p - e, 0.026), 0.01);
  fingers = 1e5;
  vec3 side = normalize(cross(fd, vec3(0.0, 1.0, 0.0)));
  for (int i = 0; i < 4; i++) {
    float fi = float(i) - 1.5;
    vec3 a = w + side * fi * 0.018;
    vec3 dir = normalize(fd + side * fi * sp + vec3(0.0, -0.15, 0.0));
    vec3 m = a + dir * 0.09;
    vec3 tip = m + normalize(dir + vec3(0.0, -0.5, 0.0)) * (0.13 + 0.03 * abs(fi));
    fingers = min(fingers, sdRoundCone(p, a, m, 0.009, 0.007));
    fingers = min(fingers, sdRoundCone(p, m, tip, 0.007, 0.0008));
  }
  return d;
}

vec2 sdf(vec3 p) {
  // ── 성에가 엉겨 굳은 수의: 앞으로 굽은 몸, 깊은 두건, 밑단은 길게 찢겨 안개로 풀린다
  vec3 hq = headLocal(p);
  vec3 bq = p - vec3(0.0, 0.45, 0.0);
  bq.z -= 0.25 * max(bq.y - 0.6, 0.0) * max(bq.y - 0.6, 0.0);
  float robe = sdRobe(bq, 1.12, 0.1, 0.44, 7.0, 0.06);
  float ang = atan(bq.z, bq.x);
  float strips = pow(noise(vec3(ang * 5.0, 0.0, 3.0)), 2.0);
  float hem = 0.35 + 0.5 * strips + 0.08 * fbm3(vec3(ang * 3.0, 0.0, 1.0)) + 0.06 * pow(noise(vec3(ang * 11.0, 2.0, 0.0)), 3.0);
  robe = smax(robe, (hem - bq.y) * 0.3, 0.01);
  float torso = sdEllipsoid(bq - vec3(0.0, 0.94, 0.0), vec3(0.17, 0.24, 0.14));
  robe = smin(robe, torso, 0.1);
  robe = smin(robe, sdEllipsoid(bq - vec3(0.0, 1.05, -0.08), vec3(0.18, 0.14, 0.12)), 0.08);
  // 두건: 앞으로 길게 나와 얼굴을 그늘에 묻는다
  float hood = sdEllipsoid(hq - vec3(0.0, 0.02, -0.02), vec3(0.155, 0.185, 0.18));
  hood = smin(hood, sdRoundCone(hq, vec3(0.0, 0.1, -0.06), vec3(0.0, 0.24, -0.26), 0.11, 0.02), 0.06);
  float opening = sdEllipsoid(hq - vec3(0.0, -0.04, 0.16), vec3(0.1, 0.15, 0.12));
  float hollow = sdEllipsoid(hq - vec3(0.0, -0.01, 0.0), vec3(0.13, 0.16, 0.15));
  hood = max(hood, -opening);
  hood = max(hood, -max(hollow, -hq.z));
  robe = smin(robe, hood, 0.05);
  if (robe < 0.05) robe -= 0.004 * (fbm3(p * 16.0) - 0.5) + 0.004 * pow(noise(p * vec3(30.0, 60.0, 30.0)), 3.0);
  vec2 r = vec2(robe, 1.0);

  // ── 얼음 해골 얼굴: 꺼진 눈구멍, 길게 찢어진 입 (두건 그늘 속으로 물러나 있다)
  hq.z += 0.025;
  vec3 eq = hq;
  eq.x = abs(eq.x);
  float face = sdEllipsoid(hq - vec3(0.0, 0.01, 0.02), vec3(0.072, 0.09, 0.085));
  // 길게 처진 턱 (숨을 내뱉다 얼어붙은)
  face = smin(face, sdRoundCone(hq, vec3(0.0, -0.04, 0.05), vec3(0.0, -0.15, 0.06), 0.045, 0.028), 0.03);
  // 광대뼈, 꺼진 볼
  face = smin(face, sdEllipsoid(eq - vec3(0.05, -0.01, 0.07), vec3(0.022, 0.014, 0.022)), 0.012);
  face = smax(face, -sdEllipsoid(eq - vec3(0.05, -0.06, 0.08), vec3(0.02, 0.035, 0.02)), 0.015);
  // 깊은 눈구멍, 코뼈 구멍
  face = smax(face, -sdEllipsoid(eq - vec3(0.034, 0.025, 0.1), vec3(0.021, 0.02, 0.03)), 0.008);
  face = smax(face, -sdEllipsoid(hq - vec3(0.0, -0.012, 0.105), vec3(0.008, 0.014, 0.02)), 0.005);
  float mouth = sdEllipsoid(hq - vec3(0.0, -0.1, 0.085), vec3(0.022, 0.05, 0.04));
  face = smax(face, -mouth, 0.008);
  face += 0.003 * (fbm3(hq * 40.0) - 0.5);
  r = umin(r, vec2(face, 2.0));
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.1, 0.07), vec3(0.018, 0.045, 0.03)), 99.0));
  r = umin(r, vec2(sdEllipsoid(eq - vec3(0.034, 0.025, 0.085), vec3(0.017, 0.016, 0.015)), 99.0));
  // 얼어붙은 이빨
  float teeth = 1e5;
  for (int i = 0; i < 4; i++) {
    float x = (float(i) - 1.5) * 0.011;
    teeth = min(teeth, sdRoundCone(hq, vec3(x, -0.052, 0.095), vec3(x * 1.1, -0.075, 0.093), 0.0045, 0.0008));
  }
  r = umin(r, vec2(teeth, 4.0));

  // ── 앞을 더듬는 뼈 팔 (소매 없이 수의 밑에서)
  float f1;
  float f2;
  float arms = boneArm(p, vec3(0.18, 1.42, 0.05), vec3(0.36, 1.2, 0.32), vec3(0.3, 1.25, 0.6), normalize(vec3(-0.1, 0.0, 1.0)), 0.25, f1);
  arms = min(arms, boneArm(p, vec3(-0.18, 1.42, 0.05), vec3(-0.4, 1.12, 0.22), vec3(-0.42, 0.98, 0.48), normalize(vec3(-0.2, -0.3, 1.0)), 0.3, f2));
  // 팔에 걸린 넝마 자락
  arms += 0.004 * (fbm3(p * 30.0) - 0.5);
  r = umin(r, vec2(arms, 3.0));
  r = umin(r, vec2(min(f1, f2), 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float fr = pow(1.0 - abs(dot(n, V)), 2.0);
  if (id < 1.5) {
    // 성에 수의: 희뿌옇게 언 천, 가장자리는 속에서 빛이 샌다
    float rime = smoothstep(0.35, 0.75, fbm3(p * 14.0));
    vec3 alb = mix(vec3(0.07, 0.085, 0.1), vec3(0.24, 0.29, 0.35), rime);
    float edge = smoothstep(1.0, 0.5, p.y);
    vec3 emi = vec3(0.1, 0.2, 0.3) * (fr * 0.6 + edge * 0.5) * (0.6 + 0.4 * rime);
    return Mat(alb, 0.6, 0.6, emi, 0.0, 0.7, 0.3);
  }
  if (id < 2.5) {
    // 얼음 얼굴: 반투명한 얼음 속에 핏줄 같은 금
    float crack = smoothstep(0.03, 0.0, ridge(p * 26.0)) * 0.6;
    vec3 alb = vec3(0.16, 0.2, 0.25) * (0.8 + 0.4 * noise(p * 50.0));
    vec3 emi = vec3(0.03, 0.06, 0.1) * (0.1 + fr * 0.6) + vec3(0.25, 0.4, 0.55) * crack * 0.15;
    return Mat(alb * 0.45, 0.3, 1.0, emi, 0.0, 0.4, 0.7);
  }
  if (id < 3.5) {
    // 서리 덮인 뼈
    vec3 alb = mix(vec3(0.12, 0.13, 0.14), vec3(0.28, 0.32, 0.38), smoothstep(0.4, 0.8, fbm3(p * 25.0)));
    return Mat(alb, 0.5, 0.7, vec3(0.06, 0.12, 0.18) * fr, 0.0, 0.5, 0.3);
  }
  // 고드름 손가락: 맑은 얼음
  return Mat(vec3(0.08, 0.12, 0.16), 0.08, 1.6, vec3(0.08, 0.17, 0.26) * (0.5 + fr), 0.0, 0.8, 1.0);
}

// 가슴 아래로 풀려 끌리는 서리 안개 + 입에서 흘러나오는 숨
vec4 volume(vec3 p) {
  if (p.y < -0.1 || p.y > 2.2 || abs(p.x) > 1.3 || abs(p.z) > 1.3) return vec4(0.0);
  float dens = 0.0;
  // 몸의 연장: 아래로 갈수록 가늘어지며 뒤로 휜다
  float yy = clamp((1.0 - p.y) / 1.0, 0.0, 1.0);
  vec2 c = vec2(0.06 * sin(p.y * 3.0) - 0.05 * yy, -0.02 - 0.35 * yy * yy);
  float rad = mix(0.24, 0.04, pow(yy, 0.8));
  vec3 w = p * vec3(5.0, 2.5, 5.0) + vec3(0.0, uSeed, 0.0);
  float n1 = fbm3(w);
  float body = smoothstep(1.0, 0.25, length(p.xz - c) / rad + (n1 - 0.5) * 1.4) * smoothstep(1.05, 0.75, p.y) * smoothstep(0.0, 0.25, p.y);
  float wisps = smoothstep(0.55, 0.8, fbm3(p * vec3(3.0, 7.0, 3.0) + 2.0)) * smoothstep(0.6, 0.1, length(p.xz - c) - rad) * smoothstep(1.1, 0.7, p.y);
  dens += body * 2.5 + wisps * 1.0;
  // 숨: 입에서 앞아래로
  vec3 m = HEAD + vec3(0.0, -0.13, 0.15);
  vec3 bd = normalize(vec3(0.75, -0.15, 0.65));
  vec3 bp = p - m;
  float h = clamp(dot(bp, bd), 0.0, 0.8);
  vec3 cc = m + bd * h + vec3(0.0, 0.12 * h * h, 0.0);
  float br = smoothstep(1.0, 0.2, length(p - cc) / (0.025 + 0.18 * h) + (fbm3(p * 12.0) - 0.5) * 1.3) * smoothstep(0.8, 0.2, h);
  dens += br * 3.0;
  if (dens < 0.001) return vec4(0.0);
  vec3 rd = normalize(p - uCamPos);
  float fw = pow(max(dot(rd, -normalize(uKeyDir)), 0.0), 3.0);
  vec3 col = vec3(0.22, 0.36, 0.5) * (0.6 + 1.6 * fw) * (0.7 + 0.5 * n1);
  return vec4(col * dens * 0.55, dens * 1.4);
}
`,
  };
}
