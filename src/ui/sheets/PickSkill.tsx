import { useState } from 'preact/hooks';
import type { SkillDef } from '../../engine/types';
import { lvlVal } from '../../engine/combat';
import { camp, trainPaid } from '../../engine/places';
import { SKILLS } from '../../engine/registry';
import { canUpgradeSkill } from '../../engine/run';
import { apply, choose } from '../../state/actions';
import { store } from '../../state/store';
import { sound } from '../../sound';
import { SkillCard } from '../cards';
import { Icon, Sheet } from '../components';
import { SCHOOL_COLOR, skillDesc } from '../text';

/**
 * 강화할 스킬 고르기 (보상/야영지/훈련장 공용)
 * 위: 가진 스킬을 아이콘+이름으로 한눈에 → 누르면 아래에 강화 전후가 바뀌는 부분만 강조해서 보여 주고, 「강화한다」 한 번으로 끝.
 * 강화하면 카드가 빛나며 떠오르는 연출 뒤 저절로 닫힌다.
 */
export function PickSkillSheet() {
  const sheet = store.sheet;
  const run = store.run!;
  const [selUid, setSel] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; lvl: number } | null>(null);
  if (sheet?.kind !== 'pick') return null;
  const close = () => {
    store.sheet = null;
    setSel(null);
    setDone(null);
    store.emit();
  };
  const cands = run.skills.filter((s) => canUpgradeSkill(run, s));
  const maxed = run.skills.filter((s) => !canUpgradeSkill(run, s));
  const sel = cands.find((s) => s.uid === selUid) ?? null;
  const def = sel ? SKILLS.get(sel.id) : null;

  const upgrade = async () => {
    if (!sel || done) return;
    const before = sel.lvl;
    if (sheet.purpose === 'upgrade-reward') await choose(sheet.idx ?? 0, sel.uid);
    else if (sheet.purpose === 'train-camp') await apply((r) => camp(r, 'train', sel.uid));
    else if (sheet.purpose === 'train-paid') await apply((r) => trainPaid(r, sel.uid));
    const after = run.skills.find((x) => x.uid === sel.uid);
    if (!after || after.lvl <= before) return;
    sound.sfx('levelUp');
    setDone({ id: after.id, lvl: after.lvl });
    // 연출을 눌러 먼저 닫고 다른 창(소지품 등)을 열었으면 그 창은 닫지 않는다
    setTimeout(() => store.sheet === sheet && close(), 1700);
  };

  return (
    <Sheet title={sheet.title} icon="gi:anvil-impact" onClose={close}>
      <div class="scroll" style={{ flex: 1, display: 'grid', gap: 12, alignContent: 'start' }}>
        {cands.length === 0 && <div class="muted">강화할 수 있는 스킬이 없다.</div>}
        <div class="skill-grid">
          {cands.map((s) => {
            const d = SKILLS.get(s.id)!;
            return (
              <button class={`skill-tile ${s.uid === selUid ? 'sel' : ''}`} onClick={() => setSel(s.uid)}>
                <Icon name={d.icon} size={30} color={SCHOOL_COLOR[d.school]} />
                <span class="nm">{d.name}</span>
              </button>
            );
          })}
          {maxed.map((s) => {
            const d = SKILLS.get(s.id)!;
            return (
              <div class="skill-tile off">
                <Icon name={d.icon} size={30} color={SCHOOL_COLOR[d.school]} />
                <span class="nm">
                  {d.name}
                  {s.lvl > 0 ? '+' : ''}
                </span>
              </div>
            );
          })}
        </div>
        {sel && def ? (
          <UpgradeDetail def={def} lvl={sel.lvl} />
        ) : (
          cands.length > 0 && <div class="muted" style={{ fontSize: 13, textAlign: 'center' }}>스킬을 누르면 강화하면 무엇이 바뀌는지 보인다.</div>
        )}
      </div>
      <div class="footer" style={{ paddingTop: 10 }}>
        <button class="btn wide" disabled={!sel || !!done} onClick={() => void upgrade()}>
          <Icon name="gi:anvil-impact" size={18} />
          {sel && def ? `${def.name} 강화한다` : '강화할 스킬 선택'}
        </button>
      </div>
      {done && <UpgradeFx id={done.id} lvl={done.lvl} onClose={close} />}
    </Sheet>
  );
}

/** 강화 전후 비교: 바뀌는 숫자는 「전 → 후」로 */
function UpgradeDetail({ def, lvl }: { def: SkillDef; lvl: number }) {
  const a = skillDesc(def, lvl);
  const b = skillDesc(def, lvl + 1);
  const aligned = a.length === b.length;
  const rows: { label: string; from: string; to: string }[] = [];
  const cost = [lvlVal(def.cost, lvl), lvlVal(def.cost, lvl + 1)];
  const cd = [lvlVal(def.cd, lvl), lvlVal(def.cd, lvl + 1)];
  if (cost[0] !== cost[1]) rows.push({ label: '행동력', from: `${cost[0]}`, to: `${cost[1]}` });
  if (cd[0] !== cd[1]) rows.push({ label: '재사용 대기', from: cd[0] >= 99 ? '전투당 1회' : `${cd[0]}턴`, to: cd[1] >= 99 ? '전투당 1회' : `${cd[1]}턴` });
  return (
    <div class="panel" style={{ padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name={def.icon} size={34} color={SCHOOL_COLOR[def.school]} />
        <div class="serif" style={{ fontSize: 18, fontWeight: 800 }}>
          {def.name} <span style={{ color: 'var(--good)' }}>→ {def.name}+</span>
        </div>
      </div>
      <div class="desc" style={{ fontSize: 14, lineHeight: 1.6 }}>
        {b.map((s, i) => {
          const o = aligned ? a[i] : null;
          if (s.k && o && o.t !== s.t)
            return (
              <span>
                <s class="muted">{o.t}</s> <b class="kv" style={{ color: 'var(--good)' }}>{s.t}</b>
              </span>
            );
          return s.k ? <b class={s.k === 'num' ? 'kv' : s.k}>{s.t}</b> : s.t;
        })}
      </div>
      {rows.map((r) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span class="muted">{r.label}</span>
          <span>
            <s class="muted">{r.from}</s> <b style={{ color: 'var(--good)' }}>{r.to}</b>
          </span>
        </div>
      ))}
      {!aligned && <div class="muted" style={{ fontSize: 12 }}>강화 전: {a.map((s) => s.t).join('')}</div>}
    </div>
  );
}

/** 강화 연출: 카드가 빛나며 떠오르고 「강화!」 */
function UpgradeFx({ id, lvl, onClose }: { id: string; lvl: number; onClose: () => void }) {
  return (
    <div class="upfx" onClick={onClose}>
      <div class="burst" />
      <div class="label">강화!</div>
      <div class="card-wrap">
        <SkillCard id={id} lvl={lvl} />
      </div>
      {Array.from({ length: 14 }, (_, i) => (
        <i class="spark" style={{ '--a': `${(i / 14) * 360}deg`, '--d': `${0.5 + (i % 3) * 0.15}s` } as Record<string, string>} />
      ))}
    </div>
  );
}
