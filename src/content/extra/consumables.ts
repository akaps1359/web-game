import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';

/** extra 소모품 */
reg.consumables([
  {
    id: 'x-flare',
    name: '조명탄',
    icon: 'gi:cross-flare',
    rarity: 'common',
    desc: '적 전체의 약점을 밝히고 취약 1',
    combat: true,
    target: 'all',
    use(_run, c) {
      if (!c) return;
      for (const e of c.alive) {
        for (const w of e.weak) {
          if (e.known.includes(w)) continue;
          e.known.push(w);
          c.emit({ t: 'reveal', uid: e.uid, dtype: w });
        }
        c.apply(e, 'vuln', 1, c.p);
      }
    },
  },
  {
    id: 'x-ammo-crate',
    name: '탄약 상자',
    icon: 'gi:ammo-box',
    rarity: 'common',
    desc: '탄약을 가득 채우고 조준 2',
    combat: true,
    target: 'self',
    use(_run, c) {
      if (!c) return;
      c.s.ammo = c.s.maxAmmo;
      c.apply(c.p, 'aim', 2, c.p);
    },
  },
  {
    id: 'x-sigil-dust',
    name: '인장 가루',
    icon: 'gi:pestle-mortar',
    rarity: 'common',
    desc: '적 전체에 인장 3',
    combat: true,
    target: 'all',
    use(_run, c) {
      if (c) for (const e of c.alive) c.apply(e, 'mark', 3, c.p);
    },
  },
  {
    id: 'x-adrenaline',
    name: '아드레날린 주사',
    icon: 'gi:syringe',
    rarity: 'uncommon',
    desc: '이번 턴 행동력 +1, 공격 피해 +30%',
    combat: true,
    target: 'self',
    use(_run, c) {
      if (!c) return;
      c.s.ap += 1;
      c.apply(c.p, 'frenzy', 30, c.p);
    },
  },
  {
    id: 'x-throw-net',
    name: '투척 그물',
    icon: 'gi:spider-web',
    rarity: 'uncommon',
    desc: '대상을 기절시킨다 (다음 행동 1회 불가)',
    combat: true,
    target: 'single',
    use(_run, c, t) {
      if (c && isEnemy(t)) c.apply(t, 'stun', 1, c.p);
    },
  },
  {
    id: 'x-catalyst-vial',
    name: '촉매 앰플',
    icon: 'gi:test-tubes',
    rarity: 'rare',
    desc: '대상의 출혈·독·화상을 2배로',
    combat: true,
    target: 'single',
    use(_run, c, t) {
      if (!c || !isEnemy(t)) return;
      for (const id of ['bleed', 'poison', 'burn']) {
        const n = t.st[id] ?? 0;
        if (n > 0) c.apply(t, id, n, c.p);
      }
    },
  },
  {
    id: 'x-black-candle',
    name: '검은 양초',
    icon: 'gi:candle-flame',
    rarity: 'rare',
    // 통찰은 언제나 영구 대가를 치르고 얻는다 (2026-10 개편 — 이벤트의 통찰 +1과 같은 값)
    desc: '통찰 +1, 최대 정신력 -8',
    combat: false,
    target: 'self',
    use(run, c) {
      const p = run.player;
      p.maxSanity = Math.max(10, p.maxSanity - 8);
      if (p.sanity > p.maxSanity) {
        c?.emit({ t: 'sanity', delta: p.maxSanity - p.sanity });
        p.sanity = p.maxSanity;
      }
      if (c) c.gainInsight(1);
      else p.insight += 1;
    },
  },
]);
