import { useState } from 'preact/hooks';
import { absorbBlock, essenceStats, FLASK_CAP, inscribeCost, isGenesisLoot, slotFull } from '../../engine/run';
import { bottle, choose, leaveReward, take } from '../../state/actions';
import { store } from '../../state/store';
import { EssenceCard, LootCard, lootClue, lootInfo, lootName, STAT_NAME } from '../cards';
import { ask, confirmThen } from '../ask';
import { ESSENCES, OMENS, SKILLS } from '../../engine/registry';
import { GROWTH, omensOf } from '../../engine/growth';
import type { EssenceStats } from '../../engine/types';
import type { LootItem } from '../../engine/run';
import { Icon } from '../components';
import { RunHud } from '../Hud';

/** 전리품을 가질지 묻는다 (골드·등유는 묻지 않음). 실마리 스킬이면 그 이유도 한 줄 */
function askLoot(it: LootItem, verb: string) {
  if (it.kind === 'gold' || it.kind === 'oil') return Promise.resolve(true);
  const info = lootInfo(it);
  const clue = lootClue(store.run, it);
  return ask({ title: `${lootName(it)} ${verb}`, icon: info.icon, color: info.color, body: [info.meta, info.desc, clue && `실마리: ${clue}`].filter(Boolean).join('\n'), ok: verb });
}

/** 보통 정수는 그냥 흡수(본질), 수호자 정수는 기술로(core=false) 또는 본질로(core=true) */
function askAbsorb(it: LootItem, pick: string | null) {
  const def = ESSENCES.get(it.id);
  const name = def?.name ?? '정수';
  const st = essenceStats(it.id, it.guardian, true);
  const lines = Object.entries(st).map(([k, v]) => ({ label: STAT_NAME[k as keyof EssenceStats], value: `${(v as number) >= 0 ? '+' : ''}${v}`, color: '#b0ffc4' }));
  if (pick) lines.push({ label: '기술', value: SKILLS.get(pick)?.name ?? pick, color: '#ffcf9a' });
  // 이계의 정수는 처음 흡수할 때 대가를 치른다 (같은 정수를 수호자판으로 바꿀 때는 없음)
  const had = store.run?.essences.find((e) => e.id === it.id);
  if (def?.eldritch && !had) lines.push({ label: '이계의 대가', value: '최대 정신력 -5', color: 'var(--eldritch)' });
  confirmThen(
    {
      title: `${name} 흡수`,
      icon: 'gi:heart-beats',
      color: 'var(--eldritch)',
      body: !it.guardian
        ? '능력치와 패시브, 최대 체력을 얻는다. 흡수한 정수는 정수 자리 하나를 차지하고, 지우려면 신전에서 값을 치르거나 자리가 꽉 찼을 때 새 정수와 바꿔야 한다.'
        : pick
          ? '능력치와 패시브, 최대 체력, 그리고 고른 기술을 얻는다. 흡수한 정수는 정수 자리 하나를 차지한다.'
          : '능력치와 패시브, 최대 체력을 얻는다 (기술은 고르지 않았다). 흡수한 정수는 정수 자리 하나를 차지한다.',
      lines,
      ok: '흡수한다',
    },
    () => take(it, pick),
  );
}

/** 흡수하지 않고 병에 담는다 */
function askBottle(it: LootItem) {
  const run = store.run!;
  const name = ESSENCES.get(it.id)?.name ?? '정수';
  const cost = inscribeCost({ id: it.id, color: it.color ?? 0, guardian: it.guardian });
  confirmThen(
    {
      title: `${name} · 병에 담기`,
      icon: 'gi:round-bottom-flask',
      color: 'var(--eldritch)',
      body: `지금 흡수하지 않고 병에 담아 둔다. 신전이나 거점의 신전에서 ${cost}골드를 내고 새길 수 있다.`,
      lines: [{ label: '정수 병', value: `${(run.flasks?.length ?? 0) + 1}/${FLASK_CAP}` }],
      ok: '담는다',
    },
    () => bottle(it),
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
  // 수호자 정수와 함께 배울 기술 (정수 카드마다)
  const [picks, setPicks] = useState<Record<string, string | null>>({});
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

        {essences.map((it, i) => {
          const drop = { id: it.id, color: it.color ?? 0, guardian: it.guardian };
          const key = `${i}:${it.id}`;
          const pick = it.guardian ? (picks[key] ?? null) : null;
          const why = it.taken ? null : absorbBlock(run, drop, pick);
          const flasks = run.flasks?.length ?? 0;
          const owned = run.essences.find((e) => e.id === it.id);
          return (
            <div style={{ marginBottom: 12 }}>
              <div class="section-label">정수가 떨어졌다. 흡수하거나 병에 담지 않으면 사라진다</div>
              <EssenceCard
                id={it.id}
                color={it.color ?? 0}
                guardian={it.guardian}
                // 흡수한 뒤에는 실제로 흡수한 모습, 고르기 전 수호자 정수는 기술 고르기
                core={it.taken && !it.bottled ? owned?.core : true}
                skill={it.taken && !it.bottled ? owned?.skill : undefined}
                choose={!it.taken && it.guardian ? { pick, onPick: (id) => setPicks({ ...picks, [key]: id }) } : undefined}
                footer={
                  it.taken ? (
                    <div class="chip" style={{ justifySelf: 'center', color: 'var(--eldritch)' }}>
                      {it.bottled ? '병에 담음' : '흡수함'}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {why && <div style={{ color: 'var(--bad)', fontSize: 12, textAlign: 'center' }}>{why}{slotFull(why) ? '. 가진 정수 하나를 깨뜨리고 바꾸거나, 병에 담아 두거나, 두고 떠날 수 있다' : ''}</div>}
                      {slotFull(why) ? (
                        <button
                          class="btn eldritch wide"
                          onClick={() => {
                            store.sheet = { kind: 'swap-essence', source: 'reward', idx: rw.items.indexOf(it), pick };
                            store.emit();
                          }}
                        >
                          <Icon name="gi:shattered-heart" size={18} />
                          정수 하나를 깨뜨리고 바꾼다{it.guardian && pick ? ` + ${SKILLS.get(pick)?.name ?? ''}` : ''}
                        </button>
                      ) : (
                        <button class="btn eldritch wide" disabled={!!why} onClick={() => askAbsorb(it, pick)}>
                          <Icon name="gi:heart-beats" size={18} />
                          {it.guardian ? (pick ? `흡수한다 + ${SKILLS.get(pick)?.name ?? ''}` : '흡수한다 (기술 없이)') : '흡수한다'}
                        </button>
                      )}
                      <button class="btn ghost wide" disabled={flasks >= FLASK_CAP} onClick={() => askBottle(it)}>
                        <Icon name="gi:round-bottom-flask" size={16} />
                        {flasks >= FLASK_CAP ? `정수 병이 가득 찼다 (${flasks}/${FLASK_CAP})` : `병에 담기 (${flasks}/${FLASK_CAP})`}
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
              clue={lootClue(run, it, !it.taken)}
              onClick={() => !it.taken && askLoot(it, '줍기').then((ok) => {
                  if (ok) void take(it);
                })}
              right={<span class="chip">{it.taken ? '획득' : '줍기'}</span>}
            />
          ))}
        </div>

        {rw.choice && rw.choice.length > 0 && (
          <>
            <div class="section-label">
              {rw.chosen ? '선택 완료' : rw.choice.some(isGenesisLoot) ? '창세의 것: 하나 선택 (판마다 하나뿐)' : '하나 선택'}
            </div>
            {/* 징조 (2026-10 성장 개편): 고르지 않고 떠나면 받는다 — 건너뛰기도 선택이다 */}
            {!rw.chosen && rw.omen && OMENS.has(rw.omen) && <OmenNote id={rw.omen} />}
            <div class="list">
              {rw.choice.map((it, i) => (
                <LootCard
                  it={it}
                  sel={rw.chosen && it.taken}
                  off={rw.chosen && !it.taken}
                  clue={lootClue(run, it, !rw.chosen)}
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
          onClick={() => (pending ? confirmThen({ title: '남은 보상을 두고 떠날까요?', icon: 'gi:exit-door', body: '가져가지 않은 보상은 사라져요.', ok: '떠난다', danger: true }, leaveReward) : leaveReward())}
        >
          {pending ? '남기고 떠난다' : '계속'}
        </button>
      </div>
    </div>
  );
}

/** 고르지 않고 떠나면 받을 징조 (지닌 징조가 가득하면 받지 못한다) */
function OmenNote({ id }: { id: string }) {
  const o = OMENS.get(id)!;
  const full = omensOf(store.run!).length >= GROWTH.omenCap;
  return (
    <div class="omen-note">
      <Icon name={o.icon} size={18} color="#c8a0ff" />
      <span>
        고르지 않고 떠나면 <b>{o.name}</b>: {o.desc}
        {full && <em> (징조가 가득 차 받지 못한다 — {GROWTH.omenCap}개)</em>}
      </span>
    </div>
  );
}
