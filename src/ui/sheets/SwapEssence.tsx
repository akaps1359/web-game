import { useState } from 'preact/hooks';
import { inscribeFlask } from '../../engine/places';
import { ESSENCES, SKILLS } from '../../engine/registry';
import { absorbBlock, essenceActives, essenceCap, essenceStats, essenceUsed, inscribeCost, takesSlot, type EssenceDrop } from '../../engine/run';
import type { EssenceStats, OwnedEssence } from '../../engine/types';
import { apply, take } from '../../state/actions';
import { store } from '../../state/store';
import { ask } from '../ask';
import { EssenceCard, STAT_NAME } from '../cards';
import { Icon, Sheet } from '../components';

/** 스탯 묶음을 '최대 체력 +12 · 힘 +2' 꼴로 (sign = -1이면 잃는 쪽) */
function statLine(st: EssenceStats, sign: 1 | -1): string {
  return Object.entries(st)
    .filter(([, v]) => v)
    .map(([k, v]) => `${STAT_NAME[k as keyof EssenceStats]} ${sign * (v as number) >= 0 ? '+' : ''}${sign * (v as number)}`)
    .join(' · ');
}

/** 그 정수가 준 기술 이름들 (깨뜨리면 함께 사라진다) */
function skillNames(es: OwnedEssence): string {
  return essenceActives(es)
    .map((a) => SKILLS.get(a)?.name ?? a)
    .join(', ');
}

/**
 * 정수 자리가 꽉 찼을 때: 가진 정수 하나를 깨뜨리고 새 정수를 들인다.
 * 보상 화면(떨어진 정수)과 신전·거점(병에 담아 둔 정수를 새길 때)이 함께 쓴다. 고른 뒤 무엇을 잃는지 확인 창으로 한 번 더 묻는다
 */
export function SwapEssenceSheet() {
  const sheet = store.sheet;
  const run = store.run!;
  const [sel, setSel] = useState<string | null>(null);
  if (sheet?.kind !== 'swap-essence') return null;
  const close = () => {
    store.sheet = null;
    setSel(null);
    store.emit();
  };
  const item = sheet.source === 'reward' ? run.reward?.items[sheet.idx] : undefined;
  const drop: EssenceDrop | undefined = sheet.source === 'reward' ? (item ? { id: item.id, color: item.color ?? 0, guardian: item.guardian } : undefined) : run.flasks?.[sheet.idx];
  const def = drop && ESSENCES.get(drop.id);
  if (!drop || !def || (item && item.taken)) {
    // 이미 가져갔거나 병이 비었으면 닫는다
    queueMicrotask(close);
    return null;
  }
  const cost = sheet.source === 'flask' ? inscribeCost(drop) : 0;
  const owned = run.essences;
  const old = sel ? owned.find((e) => e.uid === sel) : undefined;
  const oldDef = old && ESSENCES.get(old.id);
  const why = sel ? absorbBlock(run, drop, sheet.pick, sel) : null;
  const gain = essenceStats(drop.id, drop.guardian, true);

  const swap = async () => {
    if (!old || !oldDef || why) return;
    const lost = essenceStats(old.id, old.guardian, old.core);
    const lines = [
      { label: '깨뜨림', value: oldDef.name, color: 'var(--bad)' },
      { label: '잃는 스탯', value: statLine(lost, -1) || '없음', color: '#ffb0a0' },
      { label: '잃는 패시브', value: oldDef.passive.name, color: '#ffb0a0' },
      ...(skillNames(old) ? [{ label: '잃는 기술', value: skillNames(old), color: '#ffb0a0' }] : []),
      { label: '얻음', value: def.name, color: 'var(--good)' },
      { label: '얻는 스탯', value: statLine(gain, 1) || '없음', color: '#b0ffc4' },
      { label: '얻는 패시브', value: def.passive.name, color: '#b0ffc4' },
      ...(sheet.pick ? [{ label: '배우는 기술', value: SKILLS.get(sheet.pick)?.name ?? sheet.pick, color: '#ffcf9a' }] : []),
      ...(cost ? [{ label: '새기는 값', value: `${cost} 골드` }] : []),
    ];
    const ok = await ask({
      title: `${oldDef.name}을(를) 깨뜨릴까요?`,
      icon: 'gi:shattered-heart',
      color: 'var(--bad)',
      body: `깨뜨린 정수는 되돌릴 수 없다. 그 정수가 준 스탯·최대 체력·패시브·기술이 모두 사라진다.${oldDef.eldritch ? ' 이계의 흔적(최대 정신력 -5, 통찰)은 남는다.' : ''}`,
      lines,
      ok: '깨뜨리고 들인다',
      danger: true,
      always: true,
    });
    if (!ok) return;
    const replace = old.uid;
    close();
    if (sheet.source === 'reward' && item) await take(item, sheet.pick, replace);
    else await apply((r) => inscribeFlask(r, sheet.idx, sheet.pick, replace), '정수를 바꿔 새겼다');
  };

  return (
    <Sheet title="정수 자리가 꽉 찼다" icon="gi:shattered-heart" onClose={close}>
      <div class="scroll" style={{ flex: 1, display: 'grid', gap: 10, alignContent: 'start' }}>
        <div class="panel" style={{ padding: 10, fontSize: 13, lineHeight: 1.6 }}>
          정수 자리 {essenceUsed(run)}/{essenceCap(run)} — <b style={{ color: '#ff9ab0' }}>{def.name}</b>를 들이려면 가진 정수 하나를 깨뜨려야 한다. 자리는 층 수호자를 쓰러뜨릴 때마다 하나씩 늘어난다.
        </div>
        <div class="section-label" style={{ margin: 0 }}>
          깨뜨릴 정수를 고르세요
        </div>
        <div class="list">
          {owned.map((es) => {
            const d = ESSENCES.get(es.id);
            const lock = !takesSlot(es.id);
            const on = sel === es.uid;
            return (
              <EssenceCard
                id={es.id}
                color={es.color}
                guardian={es.guardian}
                core={es.core}
                skill={es.skill}
                footer={
                  lock ? (
                    <div class="muted" style={{ fontSize: 12, textAlign: 'center' }}>
                      계층정수 — 자리를 차지하지 않고 깨뜨릴 수도 없다
                    </div>
                  ) : (
                    <button class={`btn wide ${on ? 'danger' : 'ghost'}`} onClick={() => setSel(on ? null : es.uid)}>
                      <Icon name={on ? 'gi:shattered-heart' : 'gi:broken-heart'} size={16} />
                      {on ? `${d?.name ?? '정수'} — 깨뜨릴 정수로 골랐다` : '이 정수를 깨뜨린다'}
                    </button>
                  )
                }
              />
            );
          })}
        </div>
      </div>
      <div class="footer" style={{ paddingTop: 10, display: 'grid', gap: 6 }}>
        {why && <div style={{ color: 'var(--bad)', fontSize: 12, textAlign: 'center' }}>{why}</div>}
        <button class="btn danger wide" disabled={!old || !!why} onClick={() => void swap()}>
          <Icon name="gi:shattered-heart" size={18} />
          {old && oldDef ? `${oldDef.name} 깨뜨리고 ${def.name} 들이기${cost ? ` · ${cost}골드` : ''}` : '깨뜨릴 정수를 고르세요'}
        </button>
      </div>
    </Sheet>
  );
}
