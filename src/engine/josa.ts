/** 받침: 0 없음 · 1 있음 · 'l' ㄹ받침 ('으로'만 다르게 붙는다) */
type Batchim = 0 | 1 | 'l';

/** 숫자를 한자어로 읽을 때의 받침 (일·칠·팔은 ㄹ, 삼·육·십·백·천·만은 받침) */
function numBatchim(n: number): Batchim {
  const a = Math.abs(Math.trunc(n));
  const d = a % 10;
  if (a === 0 || d === 0) return 1;
  return d === 1 || d === 7 || d === 8 ? 'l' : d === 3 || d === 6 ? 1 : 0;
}

function wordBatchim(w: string): Batchim {
  const ch = w.replace(/[^가-힣0-9]+$/, '').slice(-1);
  if (!ch) return 0;
  if (/[0-9]/.test(ch)) return numBatchim(Number(ch));
  const jong = (ch.charCodeAt(0) - 0xac00) % 28;
  return jong === 0 ? 0 : jong === 8 ? 'l' : 1;
}

/** 앞말(숫자·낱말)에 맞는 조사: 을/를 · 이/가 · 은/는 · 과/와 · 이면/면 · 으로/로 */
export function josa(w: string | number, j: '을' | '이' | '은' | '과' | '이면' | '으로'): string {
  const b = typeof w === 'number' ? numBatchim(w) : wordBatchim(w);
  if (j === '으로') return b === 1 ? '으로' : '로';
  if (!b) return { 을: '를', 이: '가', 은: '는', 과: '와', 이면: '면' }[j];
  return j;
}
