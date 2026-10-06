import { useState } from 'preact/hooks';
import { ESSENCES, EQUIPS, FLOORS, MADNESS } from '../../engine/registry';
import { CURE_COST, cureMadness, inn, INN_SANITY, leaveHaven, purgeEssence, removalCost, smith, smithCost, TRAIN_COST } from '../../engine/places';
import { openShop } from '../../engine/shop';
import { refresh } from '../../state/actions';
import { applyAsk } from '../ask';
import { store } from '../../state/store';
import { EssenceCard } from '../cards';
import { FlaskList } from '../flasks';
import { Icon } from '../components';
import { RunHud } from '../Hud';
import { SellList, SellSkillList, ShopList } from './Merchant';

type Tab = 'inn' | 'shop' | 'smith' | 'temple';

export function HavenScreen() {
  const run = store.run!;
  const [tab, setTab] = useState<Tab>('inn');
  const next = FLOORS.get(run.act + 1);
  const mad = run.madness.filter((m) => !MADNESS.get(m)?.virtue);
  const openTab = async (t: Tab) => {
    if (t === 'shop' && !run.shop) {
      openShop(run, 'haven');
      await refresh();
    }
    setTab(t);
  };
  return (
    <div class="screen">
      <RunHud />
      <div style={{ padding: '6px 12px 0', textAlign: 'center' }}>
        <h2 class="title">안개 항구 · 거점</h2>
        <div class="muted" style={{ fontSize: 12 }}>
          {run.act}층을 벗어났다. 잠시 숨을 돌릴 수 있다.
        </div>
      </div>
      <div class="tabs" style={{ padding: '8px 12px 0' }}>
        {(
          [
            ['inn', '여관'],
            ['shop', '상점'],
            ['smith', '대장간'],
            ['temple', '신전'],
          ] as [Tab, string][]
        ).map(([k, n]) => (
          <button class={`tab ${tab === k ? 'on' : ''}`} onClick={() => openTab(k)}>
            {n}
          </button>
        ))}
      </div>
      <div class="scroll" style={{ flex: 1, padding: '6px 12px 12px' }}>
        {tab === 'inn' && (
          <div class="list">
            <button class={`card ${run.innUsed ? 'off' : ''}`} onClick={() => !run.innUsed && applyAsk({ title: '여관에서 쉴까요?', icon: 'gi:bed', ok: '쉰다' }, (r) => inn(r))}>
              <div class="badge">
                <Icon name="gi:wood-cabin" size={28} color="#ffb070" />
              </div>
              <div class="body">
                <div class="name">하룻밤 묵는다</div>
                <div class="desc">체력 전부, 정신력은 최대치의 {Math.round(INN_SANITY * 100)}%까지 회복 {run.innUsed ? '(이미 쉬었다)' : ''}</div>
              </div>
            </button>
            <button
              class={`card ${run.trainUsed ? 'off' : ''}`}
              onClick={() => {
                if (run.trainUsed) return void store.toast('이번 거점에서는 이미 훈련했다', 'info');
                store.sheet = { kind: 'pick', title: `스킬 훈련 (${TRAIN_COST} 골드)`, purpose: 'train-paid' };
                store.emit();
              }}
            >
              <div class="badge">
                <Icon name="gi:sword-brandish" size={28} color="#f0cf7a" />
              </div>
              <div class="body">
                <div class="name">훈련장</div>
                <div class="desc">스킬 하나를 강화한다. {TRAIN_COST} 골드 · 거점마다 한 번 {run.trainUsed ? '(이미 훈련했다)' : ''}</div>
              </div>
            </button>
          </div>
        )}
        {tab === 'shop' && (
          <>
            <ShopList />
            <SellList />
            <SellSkillList />
          </>
        )}
        {tab === 'smith' && (
          <div class="list">
            {(['weapon', 'armor', 'trinket1', 'trinket2'] as const).map((slot) => {
              const it = run.equip[slot];
              if (!it) return null;
              const def = EQUIPS.get(it.id)!;
              const max = it.lvl >= 2;
              return (
                <button class={`card ${max ? 'off' : ''}`} onClick={() => !max && applyAsk({ title: `${def.name} 강화`, icon: def.icon, body: `+${it.lvl} → +${it.lvl + 1}`, lines: [{ label: '비용', value: `${smithCost(it.lvl)} 골드` }], ok: '강화한다' }, (r) => smith(r, slot), `${def.name} 강화`)}>
                  <div class="badge">
                    <Icon name={def.icon} size={28} />
                  </div>
                  <div class="body">
                    <div class="name">
                      {def.name} {it.lvl > 0 ? `+${it.lvl}` : ''}
                    </div>
                    <div class="desc">{def.desc}</div>
                  </div>
                  <span class="chip num">{max ? '최대' : `${smithCost(it.lvl)}G`}</span>
                </button>
              );
            })}
          </div>
        )}
        {tab === 'temple' && (
          <div class="list">
            <div class="section-label">광기 치료 ({CURE_COST} 골드)</div>
            {mad.length === 0 && <div class="muted" style={{ fontSize: 13 }}>치료할 광기가 없다.</div>}
            {mad.map((m) => {
              const d = MADNESS.get(m)!;
              return (
                <button class="card" onClick={() => applyAsk({ title: `${MADNESS.get(m)?.name ?? '광기'} 치료`, icon: MADNESS.get(m)?.icon, body: `${CURE_COST} 골드`, ok: '치료한다' }, (r) => cureMadness(r, m))}>
                  <div class="badge">
                    <Icon name={d.icon} size={26} color="#b99bff" />
                  </div>
                  <div class="body">
                    <div class="name">{d.name}</div>
                    <div class="desc">{d.desc}</div>
                  </div>
                </button>
              );
            })}
            <FlaskList where="shrine" />
            <div class="section-label">정수 제거 ({removalCost(run)} 골드)</div>
            {run.essences.map((es) => (
              <EssenceCard
                id={es.id}
                color={es.color}
                guardian={es.guardian}
                core={es.core}
                footer={
                  <button class="btn danger wide" disabled={ESSENCES.get(es.id)?.lord || run.player.gold < removalCost(run)} onClick={() => applyAsk({ title: `${ESSENCES.get(es.id)?.name ?? '정수'}를 지울까요?`, icon: 'gi:heart-beats', body: `${removalCost(run)} 골드. 이 정수가 준 스탯·패시브·스킬이 모두 사라지고 되돌릴 수 없다.`, ok: '지운다', danger: true }, (r) => purgeEssence(r, es.uid), '정수를 지웠다')}>
                    지운다
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>
      <div class="footer">
        <button class="btn danger wide" onClick={() => applyAsk({ title: '다음 층으로 내려갈까요?', icon: 'gi:stairs', body: '거점을 떠나면 다음 수호자를 쓰러뜨릴 때까지 돌아올 수 없다.', ok: '내려간다', danger: true }, (r) => leaveHaven(r))}>
          <Icon name="gi:dungeon-gate" size={18} />
          {`${run.act + 1}층으로 내려간다${next ? ` · ${next.name}` : ''}`}
        </button>
      </div>
    </div>
  );
}
