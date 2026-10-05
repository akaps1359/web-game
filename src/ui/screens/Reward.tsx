import { absorbBlock } from '../../engine/run';
import { choose, leaveReward, take } from '../../state/actions';
import { store } from '../../state/store';
import { EssenceCard, LootCard, lootInfo, lootName } from '../cards';
import { ask, confirmThen } from '../ask';
import { ESSENCES } from '../../engine/registry';
import type { LootItem } from '../../engine/run';
import { Icon } from '../components';
import { RunHud } from '../Hud';

/** 전리품을 가질지 묻는다 (골드·등유는 묻지 않음) */
function askLoot(it: LootItem, verb: string) {
  if (it.kind === 'gold' || it.kind === 'oil') return Promise.resolve(true);
  const info = lootInfo(it);
  return ask({ title: `${lootName(it)} — ${verb}`, icon: info.icon, color: info.color, body: [info.meta, info.desc].filter(Boolean).join('\n'), ok: verb });
}

const TITLE: Record<string, string> = {
  normal: '전투 승리',
  elite: '강적 격파',
  boss: '층 수호자 격파',
  rift: '균열 돌파',
  lord: '계층군주 격파',
  treasure: '보물',
  event: '획득',
  stalker: '추적자 격퇴',
};

export function RewardScreen() {
  const run = store.run!;
  const rw = run.reward;
  if (!rw) return <div class="screen" />;
  const essences = rw.items.filter((i) => i.kind === 'essence');
  const items = rw.items.filter((i) => i.kind !== 'essence');
  const pending = essences.some((e) => !e.taken) || items.some((i) => !i.taken) || (rw.choice && !rw.chosen);
  return (
    <div class="screen">
      <RunHud />
      <div class="scroll" style={{ flex: 1, padding: '6px 12px 12px' }}>
        <div style={{ textAlign: 'center', margin: '8px 0 14px' }}>
          <div class="title" style={{ fontSize: 26, color: 'var(--brass-2)' }}>
            {TITLE[rw.source] ?? '보상'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 6 }}>
            {rw.gold > 0 && (
              <span class="chip" style={{ color: 'var(--brass-2)' }}>
                <Icon name="gi:two-coins" size={14} />+{rw.gold}
              </span>
            )}
            {rw.xp > 0 && (
              <span class="chip" style={{ color: '#f0e0a0' }}>
                경험치 +{rw.xp}
              </span>
            )}
          </div>
        </div>

        {essences.map((it) => {
          const why = it.taken ? null : absorbBlock(run, { id: it.id, color: it.color ?? 0, guardian: it.guardian });
          return (
            <div style={{ marginBottom: 12 }}>
              <div class="section-label">정수가 떨어졌다 — 그 자리에서 흡수하지 않으면 사라진다</div>
              <EssenceCard
                id={it.id}
                color={it.color ?? 0}
                guardian={it.guardian}
                footer={
                  it.taken ? (
                    <div class="chip" style={{ justifySelf: 'center', color: 'var(--eldritch)' }}>
                      흡수함
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {why && <div style={{ color: 'var(--bad)', fontSize: 12, textAlign: 'center' }}>{why}</div>}
                      <button
                        class="btn eldritch wide"
                        disabled={!!why}
                        onClick={() =>
                          confirmThen(
                            { title: `${ESSENCES.get(it.id)?.name ?? '정수'} 흡수`, icon: 'gi:heart-beats', color: 'var(--eldritch)', body: '흡수한 정수는 정수 한도를 차지한다. 지우려면 거점이나 성소에서 대가를 치러야 한다.', ok: '흡수한다' },
                            () => take(it),
                          )
                        }
                      >
                        <Icon name="gi:heart-beats" size={18} />
                        흡수한다
                      </button>
                    </div>
                  )
                }
              />
            </div>
          );
        })}

        {items.length > 0 && <div class="section-label">전리품</div>}
        <div class="list">
          {items.map((it) => (
            <LootCard
              it={it}
              off={it.taken}
              onClick={() => !it.taken && askLoot(it, '줍기').then((ok) => {
                  if (ok) void take(it);
                })}
              right={<span class="chip">{it.taken ? '획득' : '줍기'}</span>}
            />
          ))}
        </div>

        {rw.choice && rw.choice.length > 0 && (
          <>
            <div class="section-label">{rw.chosen ? '선택 완료' : '하나를 고르세요'}</div>
            <div class="list">
              {rw.choice.map((it, i) => (
                <LootCard
                  it={it}
                  sel={rw.chosen && it.taken}
                  off={rw.chosen && !it.taken}
                  onClick={() => {
                    if (rw.chosen) return;
                    if (it.kind === 'upgrade') {
                      store.sheet = { kind: 'pick', title: '강화할 스킬', purpose: 'upgrade-reward', idx: i };
                      store.emit();
                    } else void askLoot(it, '고르기').then((ok) => {
                      if (ok) void choose(i);
                    });
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div class="footer">
        <button
          class={`btn wide ${pending ? 'ghost' : ''}`}
          onClick={() => (pending ? confirmThen({ title: '남은 보상을 두고 떠날까요?', icon: 'gi:exit-door', body: '가져가지 않은 보상은 사라진다.', ok: '떠난다', danger: true }, leaveReward) : leaveReward())}
        >
          {pending ? '남기고 떠난다' : '계속'}
        </button>
      </div>
    </div>
  );
}
