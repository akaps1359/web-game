import { describe, expect, it } from 'vitest';

/** 콘텐츠 소스 글 (경로 → 내용) */
const SOURCES = import.meta.glob('../src/content/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('제4의 벽: 화면이 겪는 일로만 깬다', () => {
  it('콘텐츠 글에 진짜 세계 토큰이나 화면 밖의 사람을 부르는 말이 없다', () => {
    const bad = /(?<!\$)\{(time|hour|deaths|runs|wins|best|origin)\}|화면 너머의 당신|화면 밖의 당신/;
    const found: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      src.split('\n').forEach((line, i) => {
        if (bad.test(line)) found.push(`${path}:${i + 1} ${line.trim()}`);
      });
    }
    expect(Object.keys(SOURCES).length).toBeGreaterThan(10);
    expect(found).toEqual([]);
  });
});
