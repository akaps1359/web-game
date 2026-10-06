import type { Combat } from '../engine/combat';
import type { CineName, DamageCtx, DmgType, EnemyUnit, SkillDef, SkillUse, TargetMode } from '../engine/types';

/** 스킬 정의 헬퍼 (기본값 채움) */
export function skill(d: Omit<SkillDef, 'tags' | 'vals'> & { tags?: string[]; vals?: SkillDef['vals'] }): SkillDef {
  return { tags: [], vals: {}, ...d };
}

/** dmg/hits/poise 값을 써서 공격 */
export function hit(
  c: Combat,
  u: SkillUse,
  t: EnemyUnit | null,
  o: { dmg?: number; hits?: number; type?: DmgType; poise?: number; tags?: string[]; ignoreBlock?: boolean; mode?: TargetMode } = {},
): DamageCtx[] {
  return c.strike(u, t, {
    dmg: o.dmg ?? u.v('dmg'),
    hits: o.hits ?? (u.v('hits') || 1),
    poise: o.poise ?? u.v('poise'),
    type: o.type,
    tags: o.tags,
    ignoreBlock: o.ignoreBlock,
    mode: o.mode,
  });
}

export function guard(c: Combat, u: SkillUse, amount?: number): number {
  return c.gainBlock(c.p, amount ?? u.v('blk'), u);
}

export const needAmmo =
  (n: number) =>
  (c: Combat): string | null =>
    c.s.ammo >= n ? null : '탄약 부족';

export function spendAmmo(c: Combat, n: number) {
  c.s.ammo = Math.max(0, c.s.ammo - n);
}

export function reload(c: Combat) {
  c.s.ammo = c.s.maxAmmo;
  c.emit({ t: 'text', uid: 'p', text: '재장전', tone: 'info' });
}

/** 이번 턴 이 스킬 이전에 사용한 스킬 수 */
export function combo(c: Combat): number {
  return c.s.used;
}

/** 인장 폭발: 인장 수 × per 비전 피해, 인장 소모 */
export function detonate(c: Combat, u: SkillUse, t: EnemyUnit, per: number, base = 0): DamageCtx | null {
  const marks = t.st.mark ?? 0;
  if (marks > 0) c.apply(t, 'mark', -marks);
  const dmg = base + marks * per;
  if (dmg <= 0) return null;
  c.emit({ t: 'fx', name: 'detonate', tgt: t.uid });
  return c.damage({ src: c.p, tgt: t, base: dmg, type: u.type ?? 'arcane', attack: true, skill: u, tags: ['detonate'] });
}

/** 3층 '표본 채집'으로 빼앗겨 잠긴 기술인가 (빼앗은 적을 쓰러뜨려야 되찾는다 — 대기를 되돌리는 효과로는 풀리지 않는다) */
export function seized(c: Combat, uid: string): boolean {
  const slot = c.run.slots.indexOf(uid);
  return slot >= 0 && c.alive.some((e) => !!e.mem.specimen && e.mem.specimen - 1 === slot);
}

/** 이 스킬로 피해를 준 총합 */
export function dealt(ds: DamageCtx[]): number {
  return ds.reduce((s, d) => s + d.hpLoss, 0);
}

/** 처치 여부 */
export function killed(ds: DamageCtx[]): boolean {
  return ds.some((d) => d.killed);
}

/** 적 행동용: 플레이어에게 상태 부여 */
export function debuffPlayer(c: Combat, e: EnemyUnit, id: string, n: number) {
  c.apply(c.p, id, n, e);
}

/**
 * 화면 연출을 낸다 (게임 규칙과 무관 — 봇·시뮬레이션에선 아무 일도 없다). 이름별 모습은 CineName 설명 참고.
 * uid: 연출의 중심이 되는 적, text: 글자 (whisper·sysmsg·scrawl), n: 세기·개수
 */
export function cine(c: Combat, name: CineName, o: { uid?: string; text?: string; n?: number } = {}) {
  c.emit({ t: 'cine', name, uid: o.uid, text: o.text, n: o.n });
}

/**
 * 전투 화면 전체에 계속 남는 연출 상태 (Combat.vars의 'ui:' 값, 0이면 꺼짐). 화면에만 영향, 규칙은 내용 쪽에서 따로 짠다.
 * - 'ui:water' 0~3: 화면 아래에서 물이 차오른 높이
 * - 'ui:cracks' 0~3: 깨진 화면 유리
 * - 'ui:tilt' -15~15: 화면이 기운 각도
 * - 'ui:dark' 0~100: 화면이 어두워진 정도 (%)
 * - 'ui:scramble' 0/1: 스킬 이름·설명이 뒤섞여 보인다 (기억을 빼앗김)
 * - 'ui:eye' 0/1: 거대한 눈이 배경에서 지켜본다
 * - 'ui:swap' 0/1: 체력과 정신력 막대가 자리를 바꿔 보인다
 */
export type UiVar = 'ui:water' | 'ui:cracks' | 'ui:tilt' | 'ui:dark' | 'ui:scramble' | 'ui:eye' | 'ui:swap';

export function setUi(c: Combat, key: UiVar, n: number) {
  if (n) c.s.vars[key] = n;
  else delete c.s.vars[key];
}
