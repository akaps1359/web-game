import { reg } from '../../engine/registry';
import { isEnemy, lvlVal } from '../../engine/combat';

/**
 * extra 넘버스 유물. 모두 훅/onGain만으로 동작한다 (엔진의 id 검사 없음).
 * 상태 부여형 유물은 자신이 부여한 상태에 다시 반응하지 않는다.
 */
reg.relics([
  // ───────────── 일반 ─────────────
  {
    id: 'x-bloody-bandage',
    name: 'No.43 피 묻은 붕대',
    icon: 'gi:arm-bandage',
    rarity: 'common',
    desc: '출혈 중인 적을 처치하면 체력 3 회복',
    hooks: {
      onKill(c, _s, victim) {
        if ((victim.st.bleed ?? 0) > 0) c.heal(c.p, 3);
      },
    },
  },
  {
    id: 'x-casing-pouch',
    name: 'No.46 탄피 주머니',
    icon: 'gi:shotgun-rounds',
    rarity: 'common',
    desc: '적을 처치하면 탄약을 가득 채운다',
    hooks: {
      onKill(c) {
        if (c.s.ammo >= c.s.maxAmmo) return;
        c.s.ammo = c.s.maxAmmo;
        c.emit({ t: 'text', uid: 'p', text: '탄약 보충', tone: 'good' });
      },
    },
  },
  {
    id: 'x-raven-feather',
    name: 'No.48 까마귀 깃털',
    icon: 'gi:raven',
    rarity: 'common',
    desc: '전투 시작 시 후열의 모든 적에게 취약 2',
    hooks: {
      onCombatStart(c) {
        for (const e of c.row(1)) c.apply(e, 'vuln', 2, c.p);
      },
    },
  },
  {
    id: 'x-feather-charm',
    name: 'No.50 깃털 부적',
    icon: 'gi:feather-necklace',
    rarity: 'common',
    desc: '보호막을 얻을 때 +2',
    hooks: { modApply: (c, _s, target, id, n) => (id === 'barrier' && target === c.p ? n + 2 : n) },
  },
  {
    id: 'x-doom-dice',
    name: 'No.53 파멸의 주사위',
    icon: 'gi:dice-fire',
    rarity: 'common',
    desc: '파멸을 부여할 때 +4',
    hooks: { modApply: (_c, _s, _t, id, n) => (id === 'doom' ? n + 4 : n) },
  },
  {
    id: 'x-lorgnette',
    name: 'No.55 금 간 오페라 안경',
    icon: 'gi:lorgnette',
    rarity: 'common',
    desc: '약점을 찌르는 공격 피해 +2',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.attack && d.type !== 'true' && isEnemy(d.tgt) && d.tgt.weak.includes(d.type)) d.add += 2;
      },
    },
  },
  {
    id: 'x-hanged-rope',
    name: 'No.57 교수형 밧줄',
    icon: 'gi:tarot-12-the-hanged-man',
    rarity: 'common',
    desc: '체력이 30% 이하인 적에게 주는 공격 피해 +25%',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.attack && isEnemy(d.tgt) && d.tgt.hp <= d.tgt.maxHp * 0.3) d.mult *= 1.25;
      },
    },
  },
  {
    id: 'x-undertaker-coin',
    name: 'No.59 장의사의 동전',
    icon: 'gi:coffin',
    rarity: 'common',
    desc: '적이 쓰러질 때마다 골드 +4 (하수인 제외)',
    hooks: {
      onAnyDeath(c, _s, victim) {
        if (isEnemy(victim) && !victim.minion && !victim.fled) c.s.bonusGold += 4;
      },
    },
  },
  {
    id: 'x-chain-rosary',
    name: 'No.62 사슬 묵주',
    icon: 'gi:crossed-chains',
    rarity: 'common',
    desc: '반격이 적중할 때마다 방어도 3',
    hooks: {
      onDamageDealt(c, _s, d) {
        if (d.src === c.p && d.tags.includes('counter') && isEnemy(d.tgt)) c.gainBlock(c.p, 3);
      },
    },
  },

  // ───────────── 고급 ─────────────
  {
    id: 'x-broken-tip',
    name: 'No.29 부러진 칼끝',
    icon: 'gi:sword-break',
    rarity: 'uncommon',
    desc: '적을 붕괴시키면 그 적의 최대 버팀만큼 출혈 (최대 10)',
    hooks: {
      onBreak(c, _s, victim) {
        const n = Math.min(10, victim.maxPoise);
        if (n > 0) c.apply(victim, 'bleed', n, c.p);
      },
    },
  },
  {
    id: 'x-undying-ember',
    name: 'No.30 꺼지지 않는 불씨',
    icon: 'gi:small-fire',
    rarity: 'uncommon',
    desc: '내 턴이 끝날 때 화상 중인 모든 적의 화상 +1',
    hooks: {
      onTurnEnd(c) {
        for (const e of c.alive) if ((e.st.burn ?? 0) > 0) c.apply(e, 'burn', 1, c.p);
      },
    },
  },
  {
    id: 'x-resonant-crystal',
    name: 'No.32 공명하는 수정',
    icon: 'gi:crystal-growth',
    rarity: 'uncommon',
    desc: '인장 폭발로 적을 처치하면 남은 모든 적에게 인장 3',
    hooks: {
      onKill(c, _s, _victim, d) {
        if (!d?.tags.includes('detonate')) return;
        for (const e of c.alive) c.apply(e, 'mark', 3, c.p);
      },
    },
  },
  {
    id: 'x-writhing-coat',
    name: 'No.34 꿈틀대는 외투',
    icon: 'gi:interlaced-tentacles',
    rarity: 'uncommon',
    desc: '내 턴이 끝날 때 촉수 1개당 방어도 3',
    hooks: {
      onTurnEnd(c) {
        const n = c.p.st.tentacle ?? 0;
        if (n > 0) c.gainBlock(c.p, 3 * n);
      },
    },
  },
  {
    id: 'x-metronome',
    name: 'No.35 놋쇠 메트로놈',
    icon: 'gi:metronome',
    rarity: 'uncommon',
    desc: '한 턴에 스킬을 4번 이상 쓰면 다음 턴 행동력 +1',
    hooks: {
      onTurnEnd(c) {
        if (c.s.used >= 4) c.apply(c.p, 'energized', 1, c.p);
      },
    },
  },
  {
    id: 'x-hunter-fang',
    name: 'No.36 사냥꾼의 송곳니',
    icon: 'gi:saber-tooth',
    rarity: 'uncommon',
    desc: '내 턴에 적을 처치하면 행동력 +1 (턴마다 1회)',
    hooks: {
      onKill(c) {
        if (c.s.phase !== 'player' || c.s.vars.xFangTurn === c.s.turn) return;
        c.s.vars.xFangTurn = c.s.turn;
        c.s.ap += 1;
        c.emit({ t: 'text', uid: 'p', text: '사냥 — 행동력 +1', tone: 'good' });
      },
    },
  },
  {
    id: 'x-spyglass',
    name: 'No.38 저격수의 망원경',
    icon: 'gi:spyglass',
    rarity: 'uncommon',
    desc: '조준 치명타가 버팀을 2 더 깎는다',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.crit && d.attack) d.poiseBonus += 2;
      },
    },
  },
  {
    id: 'x-alch-scale',
    name: 'No.39 연금술사의 저울',
    icon: 'gi:weight-scale',
    rarity: 'uncommon',
    desc: '독과 화상에 모두 걸린 적에게 주는 공격 피해 +30%',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.attack && isEnemy(d.tgt) && (d.tgt.st.poison ?? 0) > 0 && (d.tgt.st.burn ?? 0) > 0) d.mult *= 1.3;
      },
    },
  },

  // ───────────── 희귀 ─────────────
  {
    id: 'x-third-beat',
    name: 'No.20 세 번째 박자',
    icon: 'gi:musical-notes',
    rarity: 'rare',
    desc: '매 턴 3번째로 쓰는 스킬은 행동력 비용 0',
    // 3·6·9번째마다 공짜면 행동력이 4만 돼도 한 턴에 +2 — 보스 유물(행동력 +1)보다 강했다 (시뮬 승률 +23%p). 턴당 한 번으로
    hooks: { modCost: (c, _s, _d, cost) => (c.s.used === 2 ? 0 : cost) },
  },
  {
    id: 'x-mad-grin',
    name: 'No.21 광인의 미소',
    icon: 'gi:sharp-smile',
    rarity: 'rare',
    desc: '정신력이 30 미만이면 주는 피해 +40%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (c.p.sanity < 30 && d.type !== 'true') d.mult *= 1.4;
      },
    },
  },
  {
    id: 'x-plague-doll',
    name: 'No.23 역병 인형',
    icon: 'gi:voodoo-doll',
    rarity: 'rare',
    desc: '적이 쓰러지면 그 적의 출혈·독·화상·인장이 무작위 다른 적에게 옮겨붙는다',
    hooks: {
      onAnyDeath(c, _s, victim) {
        if (!isEnemy(victim) || victim.fled || c.over) return;
        const pool = c.alive.filter((e) => e !== victim);
        if (!pool.length) return;
        const to = c.rng.pick(pool);
        let moved = false;
        for (const id of ['bleed', 'poison', 'burn', 'mark']) {
          const n = victim.st[id] ?? 0;
          if (n <= 0) continue;
          delete victim.st[id];
          c.apply(to, id, n, c.p);
          moved = true;
        }
        if (moved) c.emit({ t: 'text', uid: to.uid, text: '역병이 옮겨붙었다', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'x-iron-vestment',
    name: 'No.24 철의 성의',
    icon: 'gi:chest-armor',
    rarity: 'rare',
    desc: '정신 피해를 방어도로 먼저 막는다 (방어도 2당 정신 피해 1)',
    hooks: {
      modSanityLoss(c, _s, n) {
        if (!c || n <= 0) return n;
        const a = Math.min(Math.floor(c.p.block / 2), Math.floor(n));
        if (a <= 0) return n;
        c.p.block -= a * 2;
        c.emit({ t: 'text', uid: 'p', text: '성의가 정신을 지켰다', tone: 'info' });
        return n - a;
      },
    },
  },
  {
    id: 'x-dead-hand',
    name: 'No.26 망자의 손',
    icon: 'gi:dead-head',
    rarity: 'rare',
    desc: '적이 쓰러지면 무작위 다른 적에게 그 적 최대 체력의 20%만큼 피해',
    hooks: {
      onAnyDeath(c, _s, victim) {
        if (!isEnemy(victim) || victim.fled || c.over) return;
        const pool = c.alive.filter((e) => e !== victim);
        const n = Math.floor(victim.maxHp * 0.2);
        if (!pool.length || n <= 0) return;
        const t = c.rng.pick(pool);
        c.emit({ t: 'fx', name: 'detonate', tgt: t.uid });
        c.damage({ src: c.p, tgt: t, base: n, type: 'true', tags: ['corpse'] });
      },
    },
  },
  {
    id: 'x-endless-belt',
    name: 'No.27 끝없는 탄띠',
    icon: 'gi:heavy-bullets',
    rarity: 'rare',
    desc: '스킬을 쓴 뒤 탄약이 0이면 즉시 가득 채우고 조준 1',
    hooks: {
      afterSkill(c) {
        if (c.s.ammo > 0 || c.over) return;
        c.s.ammo = c.s.maxAmmo;
        c.emit({ t: 'text', uid: 'p', text: '끝없는 탄띠 — 재장전', tone: 'good' });
        c.apply(c.p, 'aim', 1, c.p);
      },
    },
  },

  // ───────────── 보스 (강력 + 대가) ─────────────
  {
    id: 'x-thief-clock',
    name: 'No.12 시간 도둑의 시계',
    icon: 'gi:stopwatch',
    rarity: 'boss',
    desc: '행동력 +1. 기본기 외 모든 스킬의 재사용 대기 +1 (대기가 없던 스킬도 턴당 1번만)',
    onGain(run) {
      run.player.maxAp += 1;
    },
    hooks: { modCd: (_c, _s, def, cd) => (def.tags.includes('basic') || cd >= 99 ? cd : cd + 1) },
  },
  {
    id: 'x-twin-moon',
    name: 'No.13 쌍둥이 달',
    icon: 'gi:moon-orbit',
    rarity: 'boss',
    desc: '매 턴 처음 쓰는 스킬(기본기·행동력 스킬·대기를 되돌리는 스킬·전투당 1회 스킬 제외)이 50% 위력으로 한 번 더 발동 (탄약이 바닥났으면 불발). 전투 시작 시 모든 적의 체력 +15%',
    hooks: {
      onCombatStart(c) {
        for (const e of c.alive) {
          const add = Math.round(e.maxHp * 0.15);
          e.maxHp += add;
          e.hp += add;
        }
      },
      afterSkill(c, _s, u) {
        // 메아리 재발동은 afterSkill을 다시 부르지 않으므로 연쇄되지 않는다
        if (u.echo || u.basic || c.over || c.s.vars.xTwinTurn === c.s.turn) return;
        const def = u.def;
        if (def.tags.includes('energy') || def.tags.includes('refresh') || lvlVal(def.cd, u.owned.lvl) >= 99) return;
        c.s.vars.xTwinTurn = c.s.turn;
        // 메아리 각인과 같은 규칙: 탄약을 쓰는 스킬은 탄약이 남아 있을 때만 (빈 총으로 공짜 사격 방지) — 이번 턴 몫은 불발로 끝난다
        if (def.tags.includes('ammo') && c.s.ammo <= 0) return;
        let t = u.primary && !u.primary.dead ? u.primary : null;
        if (def.target === 'single' && !t) t = c.validTargets(def)[0] ?? null;
        if (def.target === 'single' && !t) return;
        const u2 = c.makeUse({ def, owned: u.owned, basic: u.basic }, 0.5);
        u2.echo = true;
        u2.primary = t;
        u2.type = u.type;
        c.emit({ t: 'skill', skill: def.id, name: def.name, target: t?.uid, school: def.school, dtype: def.type, echo: true });
        def.run(c, u2, t);
      },
    },
  },
  {
    id: 'x-abyss-quickening',
    name: 'No.15 심연의 태동',
    icon: 'gi:tentacles-skull',
    rarity: 'boss',
    desc: '전투 시작 시 촉수 2. 내 턴이 끝날 때 촉수 1개당 정신력 -1',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'tentacle', 2, c.p);
      },
      onTurnEnd(c) {
        const n = c.p.st.tentacle ?? 0;
        if (n > 0) c.loseSanity(n);
      },
    },
  },
  {
    id: 'x-glass-heart',
    name: 'No.16 유리 심장',
    icon: 'gi:glass-heart',
    rarity: 'boss',
    desc: '공격 피해 +40%. 스킬로 얻는 방어도 -50%',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.attack) d.mult *= 1.4;
      },
      modBlock(c, _s, b) {
        if (b.unit === c.p && b.fromSkill) b.amount *= 0.5;
      },
    },
  },
  {
    id: 'x-blood-grail',
    name: 'No.18 피의 성배',
    icon: 'gi:holy-grail',
    rarity: 'boss',
    desc: '전투 시작 시 의식 1 (매 턴 힘 +1). 내 턴이 끝날 때 체력 2를 잃는다',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'ritual', 1, c.p);
      },
      onTurnEnd(c) {
        const n = Math.min(2, c.p.hp - 1);
        if (n > 0) c.loseHp(c.p, n, 'grail');
      },
    },
  },
]);
