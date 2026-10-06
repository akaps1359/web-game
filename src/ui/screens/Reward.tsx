import { absorbBlock, coreHp, essenceActives, essenceStats } from '../../engine/run';
import { choose, leaveReward, take } from '../../state/actions';
import { store } from '../../state/store';
import { EssenceCard, LootCard, lootInfo, lootName, STAT_NAME } from '../cards';
import { ask, confirmThen } from '../ask';
import { ESSENCES, SKILLS } from '../../engine/registry';
import type { EssenceStats } from '../../engine/types';
import type { LootItem } from '../../engine/run';
import { Icon } from '../components';
import { RunHud } from '../Hud';

/** 전리품을 가질지 묻는다 (골드·등유는 묻지 않음) */
function askLoot(it: LootItem, verb: string) {
  if (it.kind === 'gold' || it.kind === 'oil') return Promise.resolve(true);
  const info = lootInfo(it);
  return ask({ title: `${lootName(it)} — ${verb}`, icon: info.icon, color: info.color, body: [info.meta, info.desc].filter(Boolean).join('\n'), ok: verb });
}

/** 정수를 기술로(core=false) 또는 본질로(core=true) 흡수할지 확인하고 흡수한다 */
function askAbsorb(it: LootItem, core: boolean) {
  const def = ESSENCES.get(it.id);
  const name = def?.name ?? '정수';
  const st = essenceStats(it.id, it.guardian, core);
  const lines = Object.entries(st).map(([k, v]) => ({ label: STAT_NAME[k as keyof EssenceStats], value: `${(v as number) >= 0 ? '+' : ''}${v}`, color: '#b0ffc4' }));
  for (const a of core ? [] : essenceActives({ id: it.id, color: it.color ?? 0, guardian: it.guardian })) lines.push({ label: '기술', value: SKILLS.get(a)?.name ?? a, color: '#ffcf9a' });
  // 이계의 정수는 처음 흡수할 때 대가를 치른다 (같은 정수를 수호자판으로 바꿀 때는 없음)
  if (def?.eldritch && !store.run?.essences.some((e) => e.id === it.id)) lines.push({ label: '이계의 대가', value: '최대 정신력 -5, 통찰 +1', color: 'var(--eldritch)' });
  confirmThen(
    {
      title: `${name} — ${core ? '본질로' : '기술로'} 흡수`,
      icon: core ? 'gi:heart-beats' : 'gi:spell-book',
      color: 'var(--eldritch)',
      body: core
        ? `기술은 배우지 않고, 대신 최대 체력을 ${coreHp(def?.grade ?? 9, it.guardian)} 더 받는다. 능력치와 패시브는 그대로. 흡수한 정수는 정수 한도를 차지한다.`
        : '능력치와 패시브, 그리고 이 정수의 기술을 얻는다. 흡수한 정수는 정수 한도를 차지한다.',
      lines,
      ok: '흡수한다',
    },
    () => take(it, core),
  );
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
          const drop = { id: it.id, color: it.color ?? 0, guardian: it.guardian };
          const why = it.taken ? null : absorbBlock(run, drop);
          const whyCore = it.taken ? null : absorbBlock(run, drop, true);
          return (
            <div style={{ marginBottom: 12 }}>
              <div class="section-label">정수가 떨어졌다 — 그 자리에서 흡수하지 않으면 사라진다</div>
              <EssenceCard
                id={it.id}
                color={it.color ?? 0}
                guardian={it.guardian}
                // 흡수한 뒤에는 실제로 흡수한 모습 (본질이면 기술 없이 체력 추가)
                core={it.taken ? run.essences.find((e) => e.id === it.id)?.core : undefined}
                footer={
                  it.taken ? (
                    <div class="chip" style={{ justifySelf: 'center', color: 'var(--eldritch)' }}>
                      흡수함
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {why && whyCore && <div style={{ color: 'var(--bad)', fontSize: 12, textAlign: 'center' }}>{whyCore}</div>}
                      {why && !whyCore && <div style={{ color: 'var(--bad)', fontSize: 12, textAlign: 'center' }}>{why} — 본질로는 흡수할 수 있다</div>}
                      <div class="absorb-btns">
                        <button class="btn eldritch" disabled={!!why} onClick={() => askAbsorb(it, false)}>
                          <span>
                            <Icon name="gi:spell-book" size={16} /> 기술로 흡수
                          </span>
                          <small>능력치 + {it.guardian ? '기술 전부' : '기술'}</small>
                        </button>
                        <button class="btn eldritch" disabled={!!whyCore} onClick={() => askAbsorb(it, true)}>
                          <span>
                            <Icon name="gi:heart-beats" size={16} /> 본질로 흡수
                          </span>
                          <small>기술 대신 최대 체력 +{coreHp(ESSENCES.get(it.id)?.grade ?? 9, it.guardian)}</small>
                        </button>
                      </div>
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
