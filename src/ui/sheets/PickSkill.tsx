import { camp } from '../../engine/places';
import { trainPaid } from '../../engine/places';
import { canUpgradeSkill } from '../../engine/run';
import { apply, choose } from '../../state/actions';
import { store } from '../../state/store';
import { SkillCard } from '../cards';
import { Sheet } from '../components';

/** 강화할 스킬 고르기 (보상/야영지/훈련장 공용) */
export function PickSkillSheet() {
  const sheet = store.sheet;
  const run = store.run!;
  if (sheet?.kind !== 'pick') return null;
  const close = () => {
    store.sheet = null;
    store.emit();
  };
  const cands = run.skills.filter((s) => canUpgradeSkill(run, s));
  const pick = async (uid: string) => {
    close();
    if (sheet.purpose === 'upgrade-reward') await choose(sheet.idx ?? 0, uid);
    else if (sheet.purpose === 'train-camp') await apply((r) => camp(r, 'train', uid), '기술을 갈고닦았다');
    else if (sheet.purpose === 'train-paid') await apply((r) => trainPaid(r, uid), '기술을 갈고닦았다');
  };
  return (
    <Sheet title={sheet.title} icon="gi:anvil-impact" onClose={close}>
      <div class="scroll list" style={{ flex: 1 }}>
        {cands.length === 0 && <div class="muted">강화할 수 있는 스킬이 없다.</div>}
        {cands.map((s) => (
          <div style={{ display: 'grid', gap: 4 }}>
            <SkillCard id={s.id} lvl={s.lvl} onClick={() => pick(s.uid)} />
            <div class="muted" style={{ fontSize: 11, paddingLeft: 8 }}>
              강화 후 ▼
            </div>
            <SkillCard id={s.id} lvl={s.lvl + 1} onClick={() => pick(s.uid)} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}
