/** 기술 칸 뒤섞기 — 칸이 가려진 동안에는 자리를 외워 쓰지 못하게 내 턴마다 칸 순서를 섞는다 (Combat.tsx의 SkillGrid). 순수 계산 */

/** 기술 칸이 가려졌는가: 이름이 뒤섞였거나(기억을 빼앗김) 물이 기술 칸 위로 차올랐다. 어둠은 전장만 덮어 칸은 읽힌다 */
export function kitHidden(ui: (k: string) => number): boolean {
  return !!ui('ui:scramble') || ui('ui:water') >= 2;
}

/** 글자 → 씨앗 (같은 판·전투·턴이면 같은 수) */
export function kitSeed(key: string): number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** 칸 순서를 씨앗으로 뒤섞는다 — 기술 칸은 모두 제자리를 떠난다 (빈 칸은 상관없다) */
export function shuffleKit<T extends { r: string | null }>(items: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let tries = 0; tries < 40; tries++) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.every((x, i) => !x.r || x !== items[i])) return out;
  }
  return [...items.slice(1), items[0]];
}
