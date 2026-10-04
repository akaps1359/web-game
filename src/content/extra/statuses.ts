import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { spendAmmo } from '../lib';

/**
 * extra 스킬 전용 보조 상태. (id는 'x-' 접두사)
 * 모두 스스로 부여한 상태에 다시 반응하지 않도록 작성한다 (무한 반복 방지).
 */
reg.statuses([
  {
    id: 'x-afterimage',
    name: '잔영',
    icon: 'gi:sword-array',
    kind: 'buff',
    desc: '이번 턴 스킬을 쓸 때마다 무작위 적에게 {n} 참격 피해',
    hooks: {
      afterSkill(c, s) {
        if (c.over) return;
        const pool = c.alive;
        if (!pool.length) return;
        const t = c.rng.pick(pool);
        c.damage({ src: s.unit, tgt: t, base: s.n, type: 'slash', attack: true, tags: ['afterimage'] });
      },
    },
    tickEnd(c, u) {
      c.clear(u, 'x-afterimage');
    },
  },
  {
    id: 'x-venom',
    name: '독 바른 날',
    icon: 'gi:dripping-knife',
    kind: 'buff',
    desc: '이번 턴 공격이 체력 피해를 줄 때마다 독 {n}',
    hooks: {
      onDamageDealt(c, s, d) {
        if (!d.attack || d.src !== s.unit || d.hpLoss <= 0) return;
        if (isEnemy(d.tgt) && d.tgt.hp > 0) c.apply(d.tgt, 'poison', s.n, s.unit);
      },
    },
    tickEnd(c, u) {
      c.clear(u, 'x-venom');
    },
  },
  {
    id: 'x-overwatch',
    name: '경계 사격',
    icon: 'gi:targeting',
    kind: 'buff',
    desc: '공격받을 때마다 탄약 1을 써서 공격자에게 {n} 관통 피해 (횟수 제한, 다음 내 턴 시작 시 사라짐)',
    hooks: {
      onDamageTaken(c, s, d) {
        // 반격(counter)끼리 주고받는 연쇄를 막기 위해 반격 피해에는 반응하지 않는다
        if (!d.attack || d.tags.includes('counter') || c.s.ammo <= 0) return;
        const src = d.src;
        if (!isEnemy(src) || src.dead || src.hp <= 0) return;
        const left = c.s.vars.xOverwatchLeft ?? 0;
        if (left <= 0) return;
        c.s.vars.xOverwatchLeft = left - 1;
        spendAmmo(c, 1);
        c.damage({ src: s.unit, tgt: src, base: s.n, type: 'pierce', attack: true, tags: ['counter', 'overwatch', 'noaim'] });
        if (left - 1 <= 0) c.clear(s.unit, 'x-overwatch');
      },
    },
    tickStart(c, u) {
      delete c.s.vars.xOverwatchLeft;
      c.clear(u, 'x-overwatch');
    },
  },
  {
    id: 'x-rite',
    name: '강령 의식',
    icon: 'gi:candles',
    kind: 'buff',
    desc: '내 턴이 {n}번 더 끝나면 의식이 완성되어 적 전체에 비전 피해',
    tickEnd(c, u, n) {
      if (n > 1) {
        c.apply(u, 'x-rite', -1);
        return;
      }
      const dmg = c.s.vars.xRiteDmg ?? 0;
      delete c.s.vars.xRiteDmg;
      c.clear(u, 'x-rite');
      if (dmg <= 0) return;
      c.emit({ t: 'text', uid: u.uid, text: '의식이 완성되었다', tone: 'eldritch' });
      for (const e of [...c.alive]) {
        if (c.over) return;
        c.emit({ t: 'fx', name: 'detonate', tgt: e.uid });
        c.damage({ src: u, tgt: e, base: dmg, type: 'arcane', attack: true, tags: ['rite'] });
      }
    },
  },
]);
