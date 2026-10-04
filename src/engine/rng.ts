/**
 * 시드 기반 난수. 상태를 외부 객체(box[key])에 저장해서 런 상태와 함께 그대로 직렬화된다.
 * 엔진 코드에서는 Math.random을 쓰지 않는다.
 */
export class Rng {
  constructor(
    private box: Record<string, number>,
    private key: string,
  ) {
    if (typeof box[key] !== 'number') box[key] = 0x9e3779b9;
  }

  /** 0 이상 1 미만 (mulberry32) */
  next(): number {
    let t = (this.box[this.key] = (this.box[this.key] + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min 이상 max 이하 정수 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** 중복 없이 n개 */
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle([...arr]).slice(0, n);
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
}

/** 문자열 → 32비트 시드 */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 서로 다른 스트림용 파생 시드 */
export function deriveSeed(seed: number, salt: string): number {
  return hashSeed(`${seed}:${salt}`);
}
