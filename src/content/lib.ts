import type { Combat } from '../engine/combat';
import type { DamageCtx, DmgType, EnemyUnit, SkillDef, SkillUse, TargetMode } from '../engine/types';

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
