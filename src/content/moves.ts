import type { Combat } from '../engine/combat';
import type { DmgType, EnemyUnit, IntentKind, MoveDef } from '../engine/types';

type Then = (c: Combat, e: EnemyUnit) => void;

/** 적 행동 정의 헬퍼 */
export const mv = {
  attack(
    name: string,
    dmg: MoveDef['dmg'],
    o: { hits?: MoveDef['hits']; melee?: boolean; type?: DmgType; extra?: IntentKind[]; then?: Then; desc?: string } = {},
  ): MoveDef {
    return {
      name,
      intent: 'attack',
      dmg,
      hits: o.hits,
      melee: o.melee ?? true,
      extra: o.extra,
      desc: o.desc,
      run(c, e) {
        c.enemyAttack(e, { type: o.type });
        if (!c.over && !e.dead) o.then?.(c, e);
      },
    };
  },
  block(name: string, n: number, o: { then?: Then; extra?: IntentKind[]; desc?: string } = {}): MoveDef {
    return {
      name,
      intent: 'block',
      extra: o.extra,
      desc: o.desc,
      run(c, e) {
        c.gainBlock(e, n);
        o.then?.(c, e);
      },
    };
  },
  buff(name: string, run: Then, o: { desc?: string; extra?: IntentKind[] } = {}): MoveDef {
    return { name, intent: 'buff', run, desc: o.desc, extra: o.extra };
  },
  debuff(name: string, run: Then, o: { desc?: string; extra?: IntentKind[]; dmg?: number; melee?: boolean } = {}): MoveDef {
    return { name, intent: 'debuff', run, desc: o.desc, extra: o.extra, dmg: o.dmg, melee: o.melee };
  },
  horror(
    name: string,
    sanity: number,
    o: { dmg?: number; hits?: number; melee?: boolean; type?: DmgType; then?: Then; desc?: string } = {},
  ): MoveDef {
    return {
      name,
      intent: 'horror',
      sanity,
      dmg: o.dmg,
      hits: o.hits,
      melee: o.melee ?? false,
      extra: o.dmg ? ['attack'] : undefined,
      desc: o.desc,
      run(c, e) {
        if (o.dmg) c.enemyAttack(e, { type: o.type ?? 'void' });
        // 공격하다 반격·가시에 쓰러졌으면 공포도 끝 (공격의 부가 효과와 같은 규칙)
        if (!c.over && !e.dead) c.horror(e, sanity);
        if (!c.over && !e.dead) o.then?.(c, e);
      },
    };
  },
  summon(name: string, run: Then, desc?: string): MoveDef {
    return { name, intent: 'summon', run, desc };
  },
  /** 다음 턴 강공격 예고 (붕괴시키면 취소) */
  charge(name: string, preview: number, o: { hits?: number; then?: Then } = {}): MoveDef {
    return {
      name,
      intent: 'charge',
      charging: true,
      dmg: preview,
      hits: o.hits,
      run(c, e) {
        e.mem.charge = 1;
        c.emit({ t: 'text', uid: e.uid, text: '힘을 모은다…', tone: 'bad' });
        o.then?.(c, e);
      },
    };
  },
  heal(name: string, n: number, o: { then?: Then } = {}): MoveDef {
    return {
      name,
      intent: 'heal',
      run(c, e) {
        c.heal(e, n);
        o.then?.(c, e);
      },
    };
  },
};

/** 차지 후속타: 실행 시 차지 해제 */
export function release(m: MoveDef): MoveDef {
  return {
    ...m,
    run(c, e) {
      delete e.mem.charge;
      m.run(c, e);
    },
  };
}

/** 같은 편 적들 (자신 제외) */
export function others(c: Combat, e: EnemyUnit): EnemyUnit[] {
  return c.alive.filter((x) => x !== e);
}

export function countDef(c: Combat, id: string): number {
  return c.alive.filter((x) => x.def === id).length;
}
