import { useState } from 'preact/hooks';
import { EQUIPS, MADNESS, RELICS, RUNES, SKILLS } from '../../engine/registry';
import { equipFromBag, equipSkill, essenceCap, essenceUsed, socketRune, unequip, xpToNext } from '../../engine/run';
import type { EquipSlot, School } from '../../engine/types';
import { applyAsk } from '../ask';
import { discardSkill, skillLockReason } from '../../engine/shop';
import { store } from '../../state/store';
import { EssenceCard, LootCard, SkillCard } from '../cards';
import { FlaskList } from '../flasks';
import { Icon, Sheet, showTip } from '../components';
import { INSIGHT_SOURCES, SCHOOL_NAME, insightText } from '../text';

type Tab = 'skills' | 'essences' | 'equip' | 'relics' | 'status';

const SLOT_NAME: Record<EquipSlot, string> = { weapon: '무기', armor: '방어구', trinket1: '장신구', trinket2: '장신구' };

export function CharacterSheet({ tab: initial }: { tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial ?? 'skills');
  const close = () => {
    store.sheet = null;
    store.emit();
  };
  return (
    <Sheet title="소지품" icon="gi:knapsack" onClose={close} fixed>
      <div class="tabs">
        {(
          [
            ['skills', '스킬'],
            ['essences', '정수'],
            ['equip', '장비'],
            ['relics', '유물'],
            ['status', '상태'],
          ] as [Tab, string][]
        ).map(([k, n]) => (
          <button class={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {n}
          </button>
        ))}
      </div>
      <div class="scroll" style={{ flex: 1, minHeight: 200 }}>
        {tab === 'skills' && <SkillsTab />}
        {tab === 'essences' && <EssencesTab />}
        {tab === 'equip' && <EquipTab />}
        {tab === 'relics' && <RelicsTab />}
        {tab === 'status' && <StatusTab />}
      </div>
    </Sheet>
  );
}

function locked(): boolean {
  return store.run?.screen === 'combat';
}

function SkillsTab() {
  const run = store.run!;
  const [slot, setSlot] = useState<number | null>(null);
  const [rune, setRune] = useState<number | null>(null);
  const lock = locked();
  const equipped = new Set(run.slots.filter(Boolean) as string[]);
  const book = run.skills.filter((s) => !equipped.has(s.uid));
  return (
    <div>
      {lock && <div class="muted" style={{ fontSize: 12, marginBottom: 6 }}>전투 중에는 스킬을 바꿀 수 없다.</div>}
      <div class="section-label" style={{ marginTop: 0 }}>
        장착 슬롯 {run.slots.filter(Boolean).length}/{run.slots.length} {slot !== null ? '— 넣을 스킬을 아래에서 고르세요' : ''}
      </div>
      <div class="list">
        {run.slots.map((uid, i) => {
          const s = uid ? run.skills.find((x) => x.uid === uid) : null;
          const pick = () => {
            if (lock) return;
            if (rune !== null && s) {
              const rd = RUNES.get(run.runes[rune]);
              void applyAsk({ title: `${SKILLS.get(s.id)?.name}에 ${rd?.name} 새기기`, icon: rd?.icon, color: '#c08cff', body: rd?.desc, ok: '새긴다' }, (r) => (socketRune(r, s.uid, rune) ? null : '이 스킬에는 넣을 수 없는 각인이다'), '각인을 새겼다');
              setRune(null);
              return;
            }
            setSlot(slot === i ? null : i);
          };
          return s ? (
            <SkillCard
              id={s.id}
              lvl={s.lvl}
              runes={s.runes}
              sel={slot === i}
              onClick={pick}
              right={
                !lock && (
                  <button
                    class="chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      void applyAsk({ title: `${SKILLS.get(s.id)?.name} 빼기`, icon: SKILLS.get(s.id)?.icon, body: '슬롯에서 빼서 스킬 목록으로 돌려놓는다.', ok: '뺀다' }, (r) => equipSkill(r, i, null));
                    }}
                  >
                    빼기
                  </button>
                )
              }
            />
          ) : (
            <button class={`card ${slot === i ? 'sel' : ''}`} style={{ borderStyle: 'dashed', justifyContent: 'center' }} onClick={pick}>
              <span class="muted">빈 슬롯 — 눌러서 스킬 넣기</span>
            </button>
          );
        })}
      </div>
      {run.runes.length > 0 && (
        <>
          <div class="section-label">각인 {rune !== null ? '— 새길 스킬을 위에서 고르세요' : '(눌러서 선택)'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {run.runes.map((id, i) => {
              const d = RUNES.get(id)!;
              return (
                <button
                  class="chip"
                  style={{ padding: '6px 10px', color: '#c08cff', borderColor: rune === i ? '#c08cff' : undefined }}
                  onClick={() => {
                    if (lock) return;
                    setRune(rune === i ? null : i);
                    showTip({ title: d.name, icon: d.icon, color: '#c08cff', body: d.desc + '\n\n장착 스킬을 눌러 새긴다. 기존 각인은 빠져서 돌아온다.' });
                  }}
                >
                  <Icon name={d.icon} size={14} />
                  {d.name}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div class="section-label">스킬 목록 ({book.length})</div>
      <div class="list">
        {book.length === 0 && <div class="muted" style={{ fontSize: 13 }}>장착하지 않은 스킬이 없다.</div>}
        {book.map((s) => (
          <SkillCard
            id={s.id}
            lvl={s.lvl}
            runes={s.runes}
            onClick={() => {
              if (lock) return;
              const target = slot ?? run.slots.indexOf(null);
              if (target < 0) {
                store.toast('먼저 바꿀 슬롯을 고르세요', 'info');
                return;
              }
              const cur = run.slots[target] ? run.skills.find((x) => x.uid === run.slots[target]) : null;
              void applyAsk({ title: `${SKILLS.get(s.id)?.name} 장착`, icon: SKILLS.get(s.id)?.icon, body: cur ? `${SKILLS.get(cur.id)?.name} 대신 넣는다.` : '빈 슬롯에 넣는다.', ok: '장착한다' }, (r) => equipSkill(r, target, s.uid));
              setSlot(null);
            }}
            right={
              s.from ? (
                <span class="chip" style={{ color: '#ff9ab0' }}>정수</span>
              ) : (
                !lock &&
                !skillLockReason(run, s.uid) && (
                  <button
                    class="chip"
                    style={{ color: 'var(--bad)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      void applyAsk(
                        { title: `${SKILLS.get(s.id)?.name}${s.lvl > 0 ? '+' : ''} 버리기`, icon: SKILLS.get(s.id)?.icon, body: '이 스킬을 영영 버린다. 새겨 둔 각인은 돌려받는다. 상인에게 팔면 골드라도 받을 수 있다.', ok: '버린다', danger: true },
                        (r) => discardSkill(r, s.uid),
                        '스킬을 버렸다',
                      );
                    }}
                  >
                    버리기
                  </button>
                )
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

function EssencesTab() {
  const run = store.run!;
  return (
    <div>
      <div class="panel" style={{ padding: 10, marginBottom: 10, fontSize: 13 }}>
        정수 자리 {essenceUsed(run)}/{essenceCap(run)} — 층 수호자를 쓰러뜨릴 때마다 자리가 하나 는다. 꽉 찼을 때 새 정수를 들이려면 가진 정수 하나를 깨뜨리고 바꾼다 (계층정수는 자리를 차지하지 않는다). 그냥 지우려면 신전에서 값을 치른다.
      </div>
      <div class="list">
        {run.essences.length === 0 && <div class="muted" style={{ fontSize: 13 }}>아직 흡수한 정수가 없다. 몬스터를 쓰러뜨리면 가끔 정수가 떨어진다.</div>}
        {run.essences.map((es) => (
          <EssenceCard id={es.id} color={es.color} guardian={es.guardian} core={es.core} />
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <FlaskList where="bag" />
      </div>
    </div>
  );
}

function EquipTab() {
  const run = store.run!;
  const lock = locked();
  return (
    <div>
      {lock && <div class="muted" style={{ fontSize: 12, marginBottom: 6 }}>전투 중에는 장비를 바꿀 수 없다.</div>}
      <div class="list">
        {(['weapon', 'armor', 'trinket1', 'trinket2'] as EquipSlot[]).map((slot) => {
          const it = run.equip[slot];
          return it ? (
            <LootCard
              it={{ kind: 'equip', id: it.id, n: it.lvl }}
              right={
                <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                  <span class="chip">
                    {SLOT_NAME[slot]}
                    {it.lvl > 0 ? ` +${it.lvl}` : ''}
                  </span>
                  {!lock && (
                    <button
                      class="chip"
                      onClick={(e) => {
                        e.stopPropagation();
                        void applyAsk({ title: `${EQUIPS.get(it.id)?.name} 해제`, icon: EQUIPS.get(it.id)?.icon, body: '가방으로 옮긴다.', ok: '해제한다' }, (r) => (unequip(r, slot) ? null : '가방이 가득 찼다'));
                      }}
                    >
                      해제
                    </button>
                  )}
                </div>
              }
            />
          ) : (
            <div class="card" style={{ borderStyle: 'dashed' }}>
              <span class="muted">{SLOT_NAME[slot]} — 비어 있음</span>
            </div>
          );
        })}
      </div>
      <div class="section-label">가방 {run.bag.length}/8 (눌러서 장착)</div>
      <div class="list">
        {run.bag.map((it) => (
          <LootCard
            it={{ kind: 'equip', id: it.id, n: it.lvl }}
            onClick={() => !lock && applyAsk({ title: `${EQUIPS.get(it.id)?.name} 장착`, icon: EQUIPS.get(it.id)?.icon, body: EQUIPS.get(it.id)?.desc, ok: '장착한다' }, (r) => (equipFromBag(r, it.uid) ? null : '장착할 수 없다'), `${EQUIPS.get(it.id)?.name} 장착`)}
          />
        ))}
      </div>
    </div>
  );
}

function RelicsTab() {
  const run = store.run!;
  return (
    <div class="list">
      {run.relics.length === 0 && <div class="muted" style={{ fontSize: 13 }}>유물이 없다.</div>}
      {run.relics.map((r) => (
        <LootCard it={{ kind: 'relic', id: r.id }} right={RELICS.get(r.id)?.counter ? <span class="chip">{r.n}</span> : undefined} />
      ))}
    </div>
  );
}

function StatusTab() {
  const run = store.run!;
  const p = run.player;
  const rows: [string, string][] = [
    ['레벨', `${p.level} (${p.xp}/${xpToNext(p.level)})`],
    ['체력', `${p.hp}/${p.maxHp}`],
    ['정신력', `${p.sanity}/${p.maxSanity}`],
    ['통찰', String(p.insight)],
    ['행동력', String(p.maxAp)],
    ['힘 · 민첩 · 의지', `${p.str} · ${p.dex} · ${p.will}`],
    ['골드', String(p.gold)],
    ['등불', String(run.light)],
  ];
  return (
    <div>
      <div class="panel" style={{ padding: 12, display: 'grid', gap: 5 }}>
        {rows.map(([k, v]) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span class="muted">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div class="muted" style={{ fontSize: 12, margin: '6px 2px' }}>
        힘: 공격 피해 +1 (스킬 한 번에 대상마다 첫 타격에만) / 민첩: 스킬 방어도 +1 / 의지: 받는 정신 피해 -5%
      </div>
      <div class="section-label">통찰 {p.insight}</div>
      <div class="panel" style={{ padding: 12, fontSize: 13, whiteSpace: 'pre-line', color: 'var(--ink-2)' }}>
        {insightText(p.insight)}
        <div class="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {INSIGHT_SOURCES}
        </div>
      </div>
      <div class="section-label">광기와 각성</div>
      <div class="list">
        {run.madness.length === 0 && <div class="muted" style={{ fontSize: 13 }}>아직은 제정신이다.</div>}
        {run.madness.map((m) => {
          const d = MADNESS.get(m)!;
          return (
            <div class="card">
              <div class="badge">
                <Icon name={d.icon} size={26} color={d.virtue ? '#4fffc4' : '#b99bff'} />
              </div>
              <div class="body">
                <div class="name" style={{ color: d.virtue ? '#4fffc4' : '#d0bfff' }}>
                  {d.name}
                </div>
                <div class="desc">{d.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div class="section-label">기술 계열</div>
      <div class="muted" style={{ fontSize: 12 }}>
        {[...new Set(run.skills.map((s) => SKILLS.get(s.id)?.school).filter((x): x is School => !!x))].map((x) => SCHOOL_NAME[x]).join(' · ')}
      </div>
    </div>
  );
}
