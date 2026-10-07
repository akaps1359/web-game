import { describe, expect, it } from 'vitest';
import { josa } from '../src/engine/josa';

/** 소스 원문 (vite가 묶어 준다) */
const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('조사', () => {
  it('받침·ㄹ받침·숫자에 맞게 붙는다', () => {
    expect(josa('퇴역 군인', '으로')).toBe('으로');
    expect(josa('밤 사냥꾼', '으로')).toBe('으로');
    expect(josa('오컬트 학자', '으로')).toBe('로');
    expect(josa('검은 물', '으로')).toBe('로');
    expect(josa('「톱날 베기」', '을')).toBe('를');
    expect(josa('정조준 사격+', '을')).toBe('을');
    expect(josa('정수', '이')).toBe('가');
    expect(josa(3, '을')).toBe('을');
    expect(josa(4, '을')).toBe('를');
    expect(josa(10, '을')).toBe('을');
  });

  it('화면 문구에 기계식 조사 표기(을(를) 등)가 없다 (가짜 시스템 메시지 제외)', () => {
    const bad: string[] = [];
    const machine = /을\(를\)|이\(가\)|\(으\)로|은\(는\)|와\(과\)/;
    const skip = /sysmsg|^\s*(\/\/|\*|\/\*)/;
    for (const [p, src] of Object.entries(SOURCES)) {
      src.split(/\r?\n/).forEach((line: string, i: number) => {
        if (machine.test(line) && !skip.test(line)) bad.push(`${p}:${i + 1}`);
      });
    }
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    expect(bad).toEqual([]);
  });
});
