// 모서리의 새끼 (3층 하수인) — 각도의 왕이 탑의 모서리마다 풀어 둔 새끼 사냥개. 아직 덜 자라 더 앙상하다.
// 바닥에 배를 붙이다시피 낮게 기어 나오며 머리를 이쪽으로 내민다. 갈비 날이 드러나고, 등엔 짧은 파편 가시,
// 벌린 턱 사이로 혀가 늘어지고 푸른 고름이 떨어진다. 뒤쪽은 아직 모서리 속이라 깨진 파편이 흩어진다.
const { angleHound, houndRecipe } = await import(/* @vite-ignore */ `/art/painter/studio/recipes/tindalos.js?t=${Date.now()}`);

export default function angleWhelp({ seed = 1 } = {}) {
  const pose = {
    pelvis: [-0.85, 0.72, 0],
    waist: [-0.38, 0.62, 0],
    chest: [0.18, 0.58, 0],
    neck: [0.55, 0.55, 0],
    head: [0.8, 0.45, 0.0],
    headDir: [1, -0.12, 0.0],
    gape: 0.7,
    legs: [
      // 앞다리: 팔꿈치를 옆으로 높이 벌리고 기어 나온다
      { j: [[0.25, 0.5, 0.15], [0.1, 0.62, 0.45], [0.55, 0.2, 0.5], [0.7, 0.03, 0.46]], w: 0.06, up: [0, 0, 1], kneeOut: -1 },
      { j: [[0.25, 0.5, -0.15], [0.2, 0.6, -0.45], [0.62, 0.22, -0.42], [0.78, 0.03, -0.38]], w: 0.06, up: [0, 0, -1], kneeOut: -1 },
      { j: [[-0.85, 0.66, 0.12], [-0.45, 0.42, 0.36], [-1.12, 0.36, 0.34], [-0.98, 0.03, 0.34]], w: 0.075, up: [0, 0, 1] },
      { j: [[-0.85, 0.66, -0.12], [-0.5, 0.45, -0.34], [-1.18, 0.38, -0.3], [-1.06, 0.03, -0.3]], w: 0.075, up: [0, 0, -1] },
    ],
    tail: [[-0.9, 0.74, 0], [-1.25, 0.9, 0.05], [-1.5, 1.2, -0.05], [-1.55, 1.5, 0.1]],
  };
  const h = angleHound({
    seed,
    pose,
    yaw: 0.85,
    size: 1.0,
    bulk: 0.85,
    ribs: 5,
    spines: 6,
    spineLen: 0.8,
    hackles: 2,
    teeth: 4,
    headLen: 0.72,
    headBulk: 0.95,
    tongueDrop: 0.6,
    salt: 31,
  });
  return houndRecipe(h, {
    cam: { pos: [0.4, 0.55, 6.6], target: [-0.1, 0.6, 0.0], fov: 1.8 },
    shards: 9,
    shardC: h.W([-1.3, 0, 0]),
    shardR: 0.6,
    shardY: 0.8,
    shardH: 1.0,
    shardL: 0.16,
    smokeC: h.W([-1.0, 0.5, 0]),
    smokeR: [1.2, 0.9, 1.0],
    smoke: 1.0,
    light: { rim: 1.4, pt: h.throat, ptCol: [0.5, 0.9, 1.6] },
    seed,
  });
}
