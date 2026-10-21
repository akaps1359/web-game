import { describe, expect, it } from 'vitest';
import '../src/content';
import { ENEMIES } from '../src/engine/registry';
import { layoutEnemies, leadOf, type Rect } from '../src/render/layout';
import { kitHidden, kitSeed, shuffleKit } from '../src/ui/shuffle';

/** 폰 세로 화면의 전투 무대쯤 */
const RECT: Rect = { x: 0, y: 64, w: 390, h: 330 };
const tierOf = (id: string) => ENEMIES.get(id)?.tier;

describe('수호자는 한가운데에 선다', () => {
  const unit = (uid: string, def: string, dead = false) => ({ uid, def, dead });

  it('가운데에 세울 적: 수호자, 없으면 하나뿐인 정예', () => {
    expect(leadOf([unit('a', 'gate-orb-seal'), unit('b', 'beyond-gate'), unit('c', 'gate-orb-gaze')], tierOf)).toBe('b');
    expect(leadOf([unit('a', 'initiate'), unit('b', 'enforcer')], tierOf)).toBe('b');
    expect(leadOf([unit('a', 'enforcer'), unit('b', 'butcher')], tierOf)).toBe(null);
    expect(leadOf([unit('a', 'initiate'), unit('b', 'beyond-gate', true)], tierOf)).toBe(null);
  });

  it('하수인이 몇이든 수호자는 가운데, 이름표 자리는 서로 겹치지 않고 무대 안', () => {
    for (let n = 1; n <= 5; n++) {
      for (const bossRow of [0, 1] as const) {
        const list = [
          { uid: 'boss', row: bossRow, scale: 1.55, dead: false, lead: true },
          ...Array.from({ length: n }, (_, i) => ({ uid: `m${i}`, row: (i % 2) as 0 | 1, scale: 0.6 + 0.15 * i, dead: false })),
        ];
        const at = layoutEnemies(RECT, list);
        expect(at.size).toBe(n + 1);
        expect(at.get('boss')!.x).toBeCloseTo(RECT.x + RECT.w / 2, 5);
        const spans = [...at.values()].map((a) => [a.x - a.slot! / 2, a.x + a.slot! / 2]).sort((p, q) => p[0] - q[0]);
        for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-6);
        expect(spans[0][0]).toBeGreaterThanOrEqual(RECT.x);
        expect(spans[spans.length - 1][1]).toBeLessThanOrEqual(RECT.x + RECT.w);
      }
    }
  });

  it('하수인은 양옆으로 나뉘어 선다', () => {
    const list = [{ uid: 'boss', row: 0 as const, scale: 1.5, dead: false, lead: true }, ...['a', 'b', 'c', 'd'].map((uid) => ({ uid, row: 0 as const, scale: 0.8, dead: false }))];
    const at = layoutEnemies(RECT, list);
    const cx = at.get('boss')!.x;
    const sides = ['a', 'b', 'c', 'd'].map((uid) => Math.sign(at.get(uid)!.x - cx));
    expect(sides.filter((s) => s > 0).length).toBe(2);
    expect(sides.filter((s) => s < 0).length).toBe(2);
  });
});

describe('가려진 기술 칸은 순서도 뒤섞인다', () => {
  const ui = (vars: Record<string, number>) => (k: string) => vars[k] ?? 0;

  it('이름이 뒤섞이거나 물이 칸 위로 차오르면 가려진 것 (어둠은 전장만 덮는다)', () => {
    expect(kitHidden(ui({}))).toBe(false);
    expect(kitHidden(ui({ 'ui:scramble': 1 }))).toBe(true);
    expect(kitHidden(ui({ 'ui:water': 1 }))).toBe(false);
    expect(kitHidden(ui({ 'ui:water': 2 }))).toBe(true);
    expect(kitHidden(ui({ 'ui:dark': 70 }))).toBe(false);
  });

  it('기술 칸은 모두 제자리를 떠나고, 같은 판·전투·턴이면 같은 순서', () => {
    for (let n = 2; n <= 12; n++) {
      const items = Array.from({ length: n }, (_, i) => ({ r: i % 4 === 3 ? null : `s${i}` }));
      for (let t = 0; t < 30; t++) {
        const seed = kitSeed(`7:${n}:${t}`);
        const out = shuffleKit(items, seed);
        expect(out.map((x) => x.r ?? '-').sort()).toEqual(items.map((x) => x.r ?? '-').sort());
        items.forEach((x, i) => {
          if (x.r) expect(out[i]).not.toBe(x);
        });
        expect(shuffleKit(items, seed)).toEqual(out);
      }
    }
  });

  it('턴마다 다른 순서', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((r) => ({ r }));
    const orders = new Set(Array.from({ length: 10 }, (_, t) => shuffleKit(items, kitSeed(`1:0:${t}`)).map((x) => x.r).join('')));
    expect(orders.size).toBeGreaterThan(6);
  });
});
