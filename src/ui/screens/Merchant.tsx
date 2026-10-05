import { EQUIPS } from '../../engine/registry';
import { buy, priceOf, sell, sellPrice, sellSkill, skillLockReason, skillSellPrice, SKILL_SELL_RATE } from '../../engine/shop';
import { SKILLS } from '../../engine/registry';
import { leavePlace } from '../../engine/places';
import { store } from '../../state/store';
import { sound } from '../../sound';
import { LootCard, SkillCard, lootInfo, lootName } from '../cards';
import { applyAsk } from '../ask';
import { Icon } from '../components';
import { RunHud } from '../Hud';

export function ShopList() {
  const run = store.run!;
  const shop = run.shop;
  if (!shop) return null;
  return (
    <div class="list">
      {shop.items.map((it, i) => {
        const cost = priceOf(run, it);
        const afford = run.player.gold >= cost;
        return (
          <LootCard
            it={{ kind: it.kind === 'oil' ? 'oil' : it.kind, id: it.id, n: it.kind === 'oil' ? 30 : undefined }}
            off={it.sold}
            onClick={() => {
              if (it.sold) return;
              const loot = { kind: it.kind === 'oil' ? 'oil' : it.kind, id: it.id, n: it.kind === 'oil' ? 30 : undefined } as Parameters<typeof lootInfo>[0];
              const info = lootInfo(loot);
              if (!afford) return void store.toast('골드가 모자라다', 'bad');
              void applyAsk({ title: `${lootName(loot)} 구매`, icon: info.icon, color: info.color, body: info.desc || info.meta, lines: [{ label: '가격', value: `${cost} 골드` }, { label: '남는 골드', value: `${run.player.gold - cost} 골드` }], ok: '산다' }, (r) => {
                const why = buy(r, i);
                if (!why) sound.sfx('coin');
                return why;
              });
            }}
            right={
              <span class="chip num" style={{ color: it.sold ? 'var(--ink-3)' : afford ? 'var(--brass-2)' : 'var(--bad)' }}>
                {it.sold ? '판매됨' : `${cost}G`}
              </span>
            }
          />
        );
      })}
    </div>
  );
}

export function SellList() {
  const run = store.run!;
  if (!run.bag.length) return null;
  return (
    <>
      <div class="section-label">가방의 장비 팔기</div>
      <div class="list">
        {run.bag.map((it) => (
          <LootCard
            it={{ kind: 'equip', id: it.id, n: it.lvl }}
            onClick={() => applyAsk({ title: `${EQUIPS.get(it.id)?.name} 판매`, icon: EQUIPS.get(it.id)?.icon, lines: [{ label: '받는 골드', value: `+${sellPrice(run, it.uid)} 골드` }], ok: '판다' }, (r) => sell(r, it.uid), `${EQUIPS.get(it.id)?.name} 판매`)}
            right={<span class="chip num" style={{ color: 'var(--good)' }}>+{sellPrice(run, it.uid)}G</span>}
          />
        ))}
      </div>
    </>
  );
}

/** 장착하지 않은 스킬 팔기 (정수 스킬 제외) */
export function SellSkillList() {
  const run = store.run!;
  const list = run.skills.filter((s) => !skillLockReason(run, s.uid));
  if (!list.length) return null;
  return (
    <>
      <div class="section-label">스킬 팔기 (상점 값의 {Math.round(SKILL_SELL_RATE * 100)}%, 장착 중·정수 스킬 제외)</div>
      <div class="list">
        {list.map((s) => {
          const def = SKILLS.get(s.id);
          const gold = skillSellPrice(run, s.uid);
          return (
            <SkillCard
              id={s.id}
              lvl={s.lvl}
              runes={s.runes}
              onClick={() =>
                applyAsk(
                  { title: `${def?.name}${s.lvl > 0 ? '+' : ''} 판매`, icon: def?.icon, body: s.runes.length ? '새겨 둔 각인은 돌려받는다.' : undefined, lines: [{ label: '받는 골드', value: `+${gold} 골드` }], ok: '판다' },
                  (r) => sellSkill(r, s.uid),
                  `${def?.name} 판매`,
                )
              }
              right={<span class="chip num" style={{ color: 'var(--good)' }}>+{gold}G</span>}
            />
          );
        })}
      </div>
    </>
  );
}

export function MerchantScreen() {
  return (
    <div class="screen">
      <RunHud />
      <div class="scroll" style={{ flex: 1, padding: '12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div class="hero-icon" style={{ width: 64, height: 64, margin: 0 }}>
            <Icon name="gi:shop" size={38} color="#6ee0a0" />
          </div>
          <div>
            <h2 class="title">떠돌이 상인</h2>
            <div class="muted" style={{ fontSize: 13 }}>
              "어둠 속에선 뭐든 비싸지. 살 건가?"
            </div>
          </div>
        </div>
        <ShopList />
        <SellList />
        <SellSkillList />
      </div>
      <div class="footer">
        <button class="btn wide" onClick={() => applyAsk({ title: '상인을 떠날까요?', icon: 'gi:exit-door', ok: '떠난다' }, (r) => leavePlace(r))}>
          떠난다
        </button>
      </div>
    </div>
  );
}
