// 렝의 대거미 (3층 정예) — 렝의 골짜기를 메운 거미들의 어미. 집채만 한 몸이 앞다리 넷을 치켜들고 일어섰다.
// 터질 듯 부푼 배 위엔 얼어 죽은 탐사대원들을 감은 고치가 실로 묶여 얹혀 있고, 배 밑엔 알주머니가 포도송이처럼 매달렸다.
// 눈두덩엔 보랏빛 눈이 빽빽하고, 엄니 끝엔 독이 맺혔다. 다리 사이로 서리 낀 거미줄이 늘어져 바닥에 붙었다.
// 몸은 거미 뼈대(leng-spider.js의 lengSpider), 고치·알주머니는 이 레시피의 셰이더로.
const { lengSpider, spiderRecipe } = await import(/* @vite-ignore */ `/art/painter/studio/recipes/leng-spider.js?t=${Date.now()}`);

export default function lengBroodmother({ seed = 1 } = {}) {
  const S = 1.65;
  const sp = lengSpider({
    seed,
    salt: 19,
    yaw: 0.72,
    size: S,
    threads: 3,
    raise: [1.25, 0.8, 0, 0],
    ceph: [0.3, 0.52, 0],
    abd: [-0.78, 0.95, 0],
    abR: [0.95, 0.72, 0.8],
    kneeH: 0.62,
    legLen: 1.15,
    legW: 1.25,
    eyeScale: 1.25,
  });
  // 고치: 배 위에 비스듬히 묶인 사람 크기의 꾸러미 셋 (a → b, 굵기)
  const ab = sp.abd;
  const R = (p) => sp.W(p);
  // (머리 쪽 끝 → 발끝)
  const coc = [
    [R([-0.5, 1.7, -0.6]), R([-0.92, 1.8, 0.62]), 0.24],
    [R([-1.2, 1.62, -0.55]), R([-1.42, 1.55, 0.58]), 0.21],
  ];
  // 알주머니: 배 밑 실젖 둘레
  const eggs = [
    [R([-1.45, 0.42, 0.18]), 0.2],
    [R([-1.3, 0.3, -0.2]), 0.17],
    [R([-1.62, 0.6, -0.08]), 0.15],
    [R([-1.15, 0.22, 0.32]), 0.13],
    [R([-1.5, 0.18, -0.38]), 0.12],
  ];
  const uA = [];
  for (const [a, b, r] of coc) uA.push([...a, r * S], [...b, 0]);
  for (const [c, r] of eggs) uA.push([...c, r * S]);
  return spiderRecipe(sp, {
    cam: { pos: [0.4, 1.1, 16.0], target: [-0.2, 1.3, 0.0], fov: 1.8 },
    uA,
    pattern: 1.2,
    extraP: [[coc.length, eggs.length, 0, 0]],
    light: { rim: 2.0, exposure: 1.35 },
    frame: { fill: 0.95, bottom: 0.025 },
    helpers: /* glsl */ `
vec2 broodExtra(vec3 p) {
  int nc = int(uP[4].x + 0.5);
  int ne = int(uP[4].y + 0.5);
  float dc = 1e5;
  for (int i = 0; i < 8; i++) {
    if (i >= nc) break;
    vec4 a = uA[i * 2];
    vec4 b = uA[i * 2 + 1];
    // 고치: 머리·어깨가 비치는 길쭉한 꾸러미, 감긴 실의 결
    vec3 ba = b.xyz - a.xyz;
    float h = clamp(dot(p - a.xyz, ba) / dot(ba, ba), 0.0, 1.0);
    // 울퉁불퉁하게 감긴 꾸러미: 양 끝이 가늘고, 속의 형체가 비쳐 혹이 진다
    float prof = sqrt(max(1.0 - pow(h * 2.0 - 1.0, 2.0), 0.0)) * 0.9 + 0.1;
    prof *= 0.85 + 0.3 * noise(vec3(h * 6.0, float(i) * 3.0, 1.0));
    float r = a.w * prof;
    float d = (length(p - a.xyz - ba * h) - r) * 0.75;
    d += 0.05 * a.w * (fbm3(p * 9.0) - 0.5);
    dc = min(dc, d);
  }
  float de = 1e5;
  for (int i = 0; i < 16; i++) {
    if (i >= ne) break;
    vec4 e = uA[nc * 2 + i];
    de = smin(de, length(p - e.xyz) - e.w, 0.06);
  }
  return dc < de ? vec2(dc, 6.0) : vec2(de, 7.0);
}
`,
    sdfExtra: /* glsl */ `
  vec2 be = broodExtra(p);
  if (be.x < r.x) r = be;
`,
  });
}
