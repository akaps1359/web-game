// 그노프케 (3층 일반) — 긴 털에 덮인 여섯 다리의 짐승. 이마에 돋은 뿔 하나로 얼음을 가른다. 지나가면 눈보라가 뒤따른다.
// 곰보다 크고 낮게 웅크린 몸, 어깨에 솟은 혹. 누렇게 바랜 긴 털이 커튼처럼 땅까지 늘어져 고드름이 엉겼고,
// 털 밑으로 여섯 개의 굵은 다리와 검은 갈고리 발톱이 드러난다. 낮게 숙인 머리 이마에서 비틀린 뿔 하나가 앞으로 뻗었다.
// 털 그늘 속에 창백한 눈 넷. 발치와 등 뒤로 눈보라가 휘몰아친다.
import { rng } from '../../lib.js';

const YAW = 0.55;
function toWorld([x, y, z]) {
  const c = Math.cos(YAW);
  const s = Math.sin(YAW);
  return [c * x - s * z, y, s * x + c * z];
}

export default function gnophKeh({ seed = 1 } = {}) {
  const R = rng(seed * 211 + 5);
  const cam = [1.6, 0.55, 7.2];
  const eyesL = [
    [1.465, 0.9, 0.125, 0.02],
    [1.465, 0.9, -0.125, 0.02],
    [1.535, 0.85, 0.077, 0.012],
    [1.535, 0.85, -0.077, 0.012],
  ];
  const eyes = [];
  const gaze = [];
  for (const e of eyesL) {
    const w = toWorld(e);
    eyes.push([...w, e[3]]);
    const g = [cam[0] - w[0], cam[1] - w[1], cam[2] - w[2]];
    const l = Math.hypot(...g);
    gaze.push([g[0] / l, g[1] / l, g[2] / l, 2]);
  }
  // 날리는 눈송이
  const lights = [];
  const lc = [];
  for (let i = 0; i < 20; i++) {
    lights.push([(R() - 0.5) * 3.6, 0.1 + R() * 2.0, (R() - 0.3) * 1.5, 0.004 + R() * 0.006]);
    lc.push([0.75, 0.88, 1.0, 0.8]);
  }
  return {
    preset: 'act3',
    cam: { pos: cam, target: [0.0, 0.85, 0.0], fov: 1.8 },
    light: {
      key: [-0.3, 0.7, -0.65],
      rim: 2.0,
      fillCol: [0.06, 0.11, 0.12],
      amb: [0.018, 0.024, 0.032],
      exposure: 1.2,
      eyeEmit: 1.6,
      glow: 0.06,
    },
    frame: { fill: 0.94 },
    arrays: { uE: eyes, uG: gaze, uL: lights, uLC: lc },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 80
#define VOLUME_FAR 12.0
const float YAW = ${YAW};

float hornD(vec3 q) {
  // 이마에서 앞위로 휘며 뻗은 비틀린 뿔
  float d = 1e5;
  vec3 prev = vec3(1.4, 0.98, 0.0);
  for (int i = 1; i <= 7; i++) {
    float t = float(i) / 7.0;
    vec3 c = vec3(1.4 + 0.62 * t, 0.98 + 0.12 * t + 0.4 * t * t, 0.04 * sin(t * 3.0));
    d = min(d, sdRoundCone(q, prev, c, mix(0.075, 0.012, float(i - 1) / 7.0), mix(0.075, 0.012, t)));
    prev = c;
  }
  // 비틀린 골
  float tw = atan(q.z, q.y - 0.98 - 0.3 * (q.x - 1.4)) * 2.0 + q.x * 40.0;
  d += 0.006 * sin(tw) * smoothstep(1.4, 1.55, q.x);
  return d;
}

float legD(vec3 q, vec3 top, vec3 knee, vec3 foot, float r) {
  float d = sdRoundCone(q, top, knee, r, r * 0.8);
  d = smin(d, sdRoundCone(q, knee, foot, r * 0.8, r * 0.7), 0.04);
  d = smin(d, sdEllipsoid(q - foot - vec3(0.04, -0.02, 0.0), vec3(r * 1.3, r * 0.6, r * 1.1)), 0.04);
  return d;
}

vec2 sdf(vec3 p) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  float bound = sdBox(q - vec3(0.35, 0.9, 0.0), vec3(1.65, 0.95, 0.85));
  if (bound > 0.2) return vec2(bound, 1.0);

  // ── 몸: 낮게 웅크린 통, 어깨의 혹, 커튼처럼 늘어진 털
  float body = sdEllipsoid(q - vec3(-0.1, 0.98, 0.0), vec3(0.95, 0.5, 0.5));
  body = smin(body, sdEllipsoid(q - vec3(0.45, 1.38, 0.0), vec3(0.52, 0.42, 0.46)), 0.25);
  // 늘어진 털: 몸보다 넓은 덩어리를 아래로 끌어내리고 밑단을 가닥으로 찢는다
  float hang = sdEllipsoid(q - vec3(0.0, 0.72, 0.0), vec3(1.05, 0.74, 0.6));
  float strand = noise(vec3(q.x * 30.0, q.y * 1.6, q.z * 30.0));
  float clump = noise(vec3(q.x * 9.0, q.y * 0.8, q.z * 9.0));
  float hemY = 0.16 + 0.3 * clump + 0.14 * strand;
  hang = smax(hang, (hemY - q.y) * 0.35, 0.03);
  float fur = smin(body, hang, 0.15);
  // 머리: 낮게 숙여 앞으로, 갈기에 묻혔다
  vec3 hq = q - vec3(1.28, 0.84, 0.0);
  float head = sdEllipsoid(hq, vec3(0.25, 0.2, 0.22));
  // 긴 주둥이 + 벌어진 아래턱
  head = smin(head, sdRoundCone(q, vec3(1.38, 0.82, 0.0), vec3(1.68, 0.72, 0.0), 0.12, 0.07), 0.08);
  float jawB = sdRoundCone(q, vec3(1.32, 0.68, 0.0), vec3(1.6, 0.5, 0.0), 0.09, 0.05);
  head = smin(head, jawB, 0.04);
  vec3 mq = q - vec3(1.5, 0.64, 0.0);
  mq.xy = rot(0.45) * mq.xy;
  float maw = sdEllipsoid(mq, vec3(0.17, 0.04, 0.08));
  head = smax(head, -maw, 0.02);
  // 눈두덩
  vec3 aq = vec3(q.x, q.y, abs(q.z));
  head = smin(head, sdEllipsoid(aq - vec3(1.42, 0.965, 0.12), vec3(0.08, 0.03, 0.07)), 0.03);
  float mane = sdEllipsoid(q - vec3(1.0, 0.98, 0.0), vec3(0.34, 0.42, 0.44));
  fur = smin(fur, mane, 0.12);
  // 털결: 아래로 흐르는 가닥
  if (fur < 0.08) fur -= 0.03 * (strand - 0.5) + 0.03 * (clump - 0.5) + 0.02 * (fbm3(q * vec3(6.0, 2.0, 6.0)) - 0.5) + 0.005 * (noise(q * vec3(80.0, 6.0, 80.0)) - 0.5);
  vec2 r = vec2(fur, 1.0);
  // 맨살 주둥이
  head += 0.006 * (fbm3(q * 18.0) - 0.5);
  r = umin(r, vec2(head, 2.0));
  r = umin(r, vec2(sdEllipsoid(mq - vec3(-0.03, 0.0, 0.0), vec3(0.14, 0.032, 0.065)), 99.0));
  // 이빨: 위아래로 들쭉날쭉
  float tusk = 1e5;
  for (int i = 0; i < 7; i++) {
    float t = float(i) / 6.0;
    float h = fract(sin(float(i) * 17.3) * 4375.5);
    for (int s = 0; s < 2; s++) {
      float sz = s == 0 ? 1.0 : -1.0;
      vec3 a = vec3(1.42 + t * 0.22, 0.73 - t * 0.04, sz * mix(0.075, 0.035, t));
      tusk = min(tusk, sdRoundCone(q, a, a + vec3(0.01, -0.03 - 0.03 * h, 0.0), 0.009, 0.001));
      vec3 b = vec3(1.4 + t * 0.18, 0.6 - t * 0.09, sz * mix(0.065, 0.03, t));
      tusk = min(tusk, sdRoundCone(q, b, b + vec3(0.0, 0.03 + 0.02 * h, 0.0), 0.008, 0.001));
    }
  }
  r = umin(r, vec2(tusk, 3.0));
  // 뿔
  r = umin(r, vec2(hornD(q), 3.0));

  // ── 여섯 다리: 털 밑으로 아래쪽만 드러난다
  float legs = 1e5;
  for (int i = 0; i < 3; i++) {
    float x = 0.6 - float(i) * 0.6;
    for (int s = 0; s < 2; s++) {
      float sz = s == 0 ? 1.0 : -1.0;
      float spread = 0.32 + 0.05 * float(i);
      legs = min(legs, legD(q, vec3(x, 0.85, spread * sz * 0.8), vec3(x + 0.08, 0.42, spread * sz * 1.05), vec3(x + 0.02, 0.06, spread * sz * 1.15), 0.1));
    }
  }
  legs += 0.01 * (fbm3(q * 14.0) - 0.5);
  r = umin(r, vec2(legs, 4.0));
  // 발톱
  float claws = 1e5;
  for (int i = 0; i < 3; i++) {
    float x = 0.6 - float(i) * 0.6;
    for (int s = 0; s < 2; s++) {
      float sz = s == 0 ? 1.0 : -1.0;
      float spread = (0.32 + 0.05 * float(i)) * 1.15;
      for (int k = 0; k < 3; k++) {
        float o = (float(k) - 1.0) * 0.045;
        vec3 a = vec3(x + 0.13, 0.05, spread * sz + o);
        claws = min(claws, sdRoundCone(q, a, a + vec3(0.07, -0.04, o * 0.3), 0.018, 0.003));
      }
    }
  }
  r = umin(r, vec2(claws, 5.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  if (id < 1.5) {
    // 누렇게 바랜 긴 털: 뿌리 쪽은 어둡고, 끝은 서리에 하얗다. 밑단엔 얼음이 엉겼다
    float strand = noise(vec3(q.x * 60.0, q.y * 3.0, q.z * 60.0));
    float dirt = fbm3(q * 3.0);
    vec3 alb = vec3(0.2, 0.185, 0.16) * (0.55 + 0.5 * strand) * (0.7 + 0.5 * dirt);
    alb = mix(alb, vec3(0.06, 0.05, 0.04), smoothstep(0.65, 0.3, q.y) * 0.5 * (1.0 - strand));
    float snow = smoothstep(0.5, 0.9, n.y + 0.3 * (fbm3(q * 8.0) - 0.5));
    alb = mix(alb, vec3(0.32, 0.36, 0.42), snow * 0.8);
    float ice = smoothstep(0.55, 0.3, q.y) * smoothstep(0.6, 0.8, noise(q * 25.0));
    alb = mix(alb, vec3(0.1, 0.14, 0.18), ice);
    return Mat(alb, mix(0.9, 0.15, ice), 0.12 + ice * 1.2 + snow * 0.3, vec3(0.0), 0.0, 0.3, ice);
  }
  if (id < 2.5) return Mat(vec3(0.05, 0.04, 0.042), 0.4, 0.6, vec3(0.0), 0.0, 0.3, 0.6);
  if (id < 3.5) {
    // 뿔·엄니: 누런 상아, 끝은 얼음처럼 반투명
    float tip = smoothstep(1.75, 2.05, q.x);
    float ring = 0.8 + 0.2 * sin(q.x * 90.0);
    vec3 alb = mix(vec3(0.12, 0.105, 0.08) * ring, vec3(0.08, 0.11, 0.14), tip);
    alb = mix(alb, vec3(0.08, 0.012, 0.01), smoothstep(1.4, 1.35, q.x) * step(q.y, 0.78));
    return Mat(alb, 0.35, 0.9, vec3(0.02, 0.05, 0.08) * tip, 0.0, 0.4, 0.4);
  }
  if (id < 4.5) {
    // 다리: 털 짧고 검은 가죽, 서리
    float snow = smoothstep(0.25, 0.05, q.y);
    vec3 alb = mix(vec3(0.05, 0.045, 0.04), vec3(0.3, 0.34, 0.4), snow * 0.7);
    return Mat(alb, 0.8, 0.2, vec3(0.0), 0.0, 0.1, 0.1);
  }
  return Mat(vec3(0.015, 0.014, 0.013), 0.25, 1.0, vec3(0.0), 0.0, 0.0, 0.5);
}

// 발치와 등 뒤로 휘몰아치는 눈보라
vec4 volume(vec3 p) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  if (q.y > 2.3 || q.y < -0.05 || abs(q.x - 0.2) > 2.0 || abs(q.z) > 1.4) return vec4(0.0);
  vec3 w = q * vec3(1.6, 3.5, 2.5) + vec3(q.y * 2.0, 0.0, 0.0);
  float n1 = fbm3(w + vec3(5.0, 1.0, 2.0));
  float low = smoothstep(0.55, 0.0, q.y) * smoothstep(1.6, 0.6, length(q.xz - vec2(0.2, 0.0)));
  float back = smoothstep(0.0, -0.8, q.x - 0.0) * smoothstep(2.3, 0.8, q.y) * smoothstep(1.4, 0.5, abs(q.z)) * 0.6;
  float d = smoothstep(0.45, 0.72, n1) * (low * 1.4 + back);
  if (d < 0.001) return vec4(0.0);
  vec3 rd = normalize(p - uCamPos);
  float fw = pow(max(dot(rd, -normalize(uKeyDir)), 0.0), 3.0);
  return vec4(vec3(0.24, 0.3, 0.38) * (0.5 + 1.5 * fw) * d, d * 1.6);
}
`,
  };
}
