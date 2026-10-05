// 새끼 거미 (3층 하수인) — 알주머니에서 막 터져 나온 렝의 새끼. 아직 껍질이 덜 굳어 희뿌연 보랏빛으로 비친다.
// 몸보다 훨씬 긴 다리를 높이 세우고, 앞다리 하나를 들어 더듬으며, 눈 여덟이 한꺼번에 이쪽을 본다.
const { lengSpider, spiderRecipe } = await import(/* @vite-ignore */ `/art/painter/studio/recipes/leng-spider.js?t=${Date.now()}`);

export default function lengSpiderling({ seed = 1 } = {}) {
  const sp = lengSpider({
    seed,
    salt: 53,
    yaw: 1.15,
    size: 0.55,
    threads: 0,
    raise: [0.7, 0, 0, 0],
    ceph: [0.25, 0.42, 0],
    abd: [-0.42, 0.55, 0],
    abR: [0.42, 0.34, 0.36],
    kneeH: 0.7,
    legLen: 1.2,
    legW: 0.85,
    eyeScale: 1.1,
  });
  return spiderRecipe(sp, {
    cam: { pos: [0.3, 1.0, 4.4], target: [0.0, 0.28, 0.0], fov: 1.8 },
    pale: 0.75,
    pattern: 0.8,
    light: { rim: 2.0, exposure: 1.4 },
  });
}
