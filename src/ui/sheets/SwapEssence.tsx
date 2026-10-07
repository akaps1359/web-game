import { useRef, useState } from 'preact/hooks';
import { inscribeFlask } from '../../engine/places';
import { ESSENCES, SKILLS } from '../../engine/registry';
import { absorbBlock, essenceActives, essenceCap, essenceStats, essenceUsed, inscribeCost, takesSlot, type EssenceDrop } from '../../engine/run';
import type { EssenceDef, EssenceStats, OwnedEssence } from '../../engine/types';
import { apply, take } from '../../state/actions';
import { store } from '../../state/store';
import { ask } from '../ask';
import { STAT_NAME, josa } from '../cards';
import { Sheet } from '../components';
import { Detail, Head, Row, Stats, Summary, statText, useKeepVisible, type Fig } from './Character';

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

const essColor = (d: EssenceDef) => (d.eldritch ? '#4fffc4' : '#ff9ab0');

/**
 * 정수 자리가 꽉 찼을 때: 가진 정수 하나를 깨뜨리고 새 정수를 들인다.
 * 보상 화면(떨어진 정수)과 신전·거점(병에 담아 둔 정수를 새길 때)이 함께 쓴다.
 * 소지품 창과 같은 틀: 요약 → 목록(들일 정수, 깨뜨릴 정수) → 고르면 아래 낱장에 잃는 것과 얻는 것 → 확인 창
 */
export function SwapEssenceSheet() {
  const sheet = store.sheet;
  const run = store.run!;
  const [sel, setSel] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useKeepVisible(listRef, sel ?? '');
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
  const pickName = sheet.pick ? (SKILLS.get(sheet.pick)?.name ?? sheet.pick) : '';
  const used = essenceUsed(run);
  const cap = essenceCap(run);

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
      ...(pickName ? [{ label: '배우는 기술', value: pickName, color: '#ffcf9a' }] : []),
      ...(cost ? [{ label: '새기는 값', value: `${cost} 골드` }] : []),
    ];
    const ok = await ask({
      title: `${oldDef.name}${josa(oldDef.name, '을', '를')} 깨뜨릴까요?`,
      icon: 'gi:shattered-heart',
      color: 'var(--bad)',
      body: `깨뜨린 정수는 되돌릴 수 없어요. 그 정수가 준 스탯, 최대 체력, 패시브, 기술이 모두 사라져요.${oldDef.eldritch ? ' 이계의 흔적(최대 정신력 -5, 통찰)은 남아요.' : ''}`,
      lines,
      ok: '깨뜨리고 들이기',
      danger: true,
      always: true,
    });
    if (!ok) return;
    const replace = old.uid;
    close();
    if (sheet.source === 'reward' && item) await take(item, sheet.pick, replace);
    else await apply((r) => inscribeFlask(r, sheet.idx, sheet.pick, replace), '정수를 바꿔 새겼다');
  };

  const sum: Fig[] = [
    { k: '정수 자리', v: used, of: cap, pips: [used, cap], bad: used >= cap },
    cost ? { k: '새기는 값', v: `${cost}골드`, word: true, bad: run.player.gold < cost } : { k: '들이는 값', v: '없음', word: true },
  ];

  return (
    <Sheet title="정수 자리가 꽉 찼다" icon="gi:shattered-heart" onClose={close} fixed>
      <div class="inv">
        <Summary figs={sum} />
        <p class="inv-intro">
          <b style={{ color: essColor(def) }}>{def.name}</b>
          {josa(def.name, '을', '를')} 들이려면 가진 정수 하나를 깨뜨려야 한다. 깨뜨릴 정수를 누르면 잃는 것과 얻는 것이 보인다.
        </p>
        <div class="inv-list" ref={listRef}>
          <Head label="들일 정수" />
          <Row
            icon={def.icon}
            color={essColor(def)}
            name={
              <>
                {def.name}
                {drop.guardian && <em class="inv-tag">수호자</em>}
              </>
            }
            meta={
              <>
                <span>{statText(gain) || '스탯 없음'}</span>
                <span>패시브 · {def.passive.name}</span>
                {pickName && <span>기술 · {pickName}</span>}
              </>
            }
          />
          <Head label="깨뜨릴 정수 선택" count={owned.length} />
          {owned.map((es) => {
            const d = ESSENCES.get(es.id);
            if (!d) return null;
            const lord = !takesSlot(es.id);
            return (
              <Row
                icon={d.icon}
                color={essColor(d)}
                on={sel === es.uid}
                off={lord}
                name={
                  <>
                    {d.name}
                    {es.guardian && <em class="inv-tag">수호자</em>}
                    {lord && <em class="inv-tag">계층</em>}
                  </>
                }
                meta={lord ? <span>자리를 차지하지 않고 깨뜨릴 수도 없다</span> : <span>{statText(essenceStats(es.id, es.guardian, es.core)) || '스탯 없음'}</span>}
                onTap={() => (lord ? store.toast('계층정수는 깨뜨릴 수 없다', 'bad') : setSel(sel === es.uid ? null : es.uid))}
              />
            );
          })}
        </div>
        {old && oldDef && (
          <Detail
            icon={oldDef.icon}
            color={essColor(oldDef)}
            title={oldDef.name}
            sub="깨뜨릴 정수"
            acts={[{ label: `깨뜨리고 들이기${cost ? ` · ${cost}골드` : ''}`, kind: 'main danger', why, run: () => void swap() }]}
            onClose={() => setSel(null)}
          >
            <div class="inv-trade">
              <div class="lose">
                <span class="h">잃는 것</span>
                <span class="n">{oldDef.name}</span>
                <Stats st={Object.fromEntries(Object.entries(essenceStats(old.id, old.guardian, old.core)).map(([k, v]) => [k, -(v as number)])) as EssenceStats} />
                <span class="x">패시브 · {oldDef.passive.name}</span>
                {skillNames(old) && <span class="x">기술 · {skillNames(old)}</span>}
              </div>
              <div class="gain">
                <span class="h">얻는 것</span>
                <span class="n">{def.name}</span>
                <Stats st={gain} />
                <span class="x">패시브 · {def.passive.name}</span>
                {pickName && <span class="x">기술 · {pickName}</span>}
              </div>
            </div>
            <div class="inv-block essence">
              <b class="bt">잃는 패시브 · {oldDef.passive.name}</b>
              {oldDef.passive.desc}
            </div>
            <div class="inv-block essence">
              <b class="bt">얻는 패시브 · {def.passive.name}</b>
              {def.passive.desc}
            </div>
            {oldDef.eldritch && <p class="inv-small eld">이계의 흔적(최대 정신력 -5, 통찰)은 깨뜨려도 남는다.</p>}
          </Detail>
        )}
      </div>
    </Sheet>
  );
}
