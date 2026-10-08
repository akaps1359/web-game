import { store } from '../state/store';
import { OMENS, PACTS } from '../engine/registry';
import { GROWTH, omensOf } from '../engine/growth';
import { essenceCap, essenceUsed, xpToNext } from '../engine/run';
import { Icon, showTip, Stat } from './components';
import { INSIGHT_SOURCES, insightText } from './text';
import { BREAKDOWN_RESET, MAX_MADNESS } from '../engine/combat';

/** 판 진행 중 상단 표시줄 */
export function RunHud({ compact }: { compact?: boolean }) {
  const run = store.run!;
  const p = run.player;
  const snap = store.snap;
  const hp = snap ? snap.p.hp : p.hp;
  const san = snap ? snap.p.sanity : p.sanity;
  const openChar = () => {
    store.sheet = { kind: 'character' };
    store.emit();
  };
  return (
    <div class="hud">
      <Stat
        icon="gi:heart-organ"
        color="var(--hp-2)"
        value={hp}
        sub={`/${p.maxHp}`}
        onClick={() => showTip({ title: '체력', icon: 'gi:heart-organ', color: 'var(--hp-2)', body: '0이 되면 사경에 빠진다. 사경에서는 받는 피해와 매 턴이 정신력을 깎고, 정신력까지 0이 되면 죽는다.' })}
      />
      <Stat
        icon="gi:brain"
        color="var(--san-2)"
        value={san}
        sub={`/${p.maxSanity}`}
        onClick={() =>
          showTip({
            title: '정신력',
            icon: 'gi:brain',
            color: 'var(--san-2)',
            body: `0이 되면 정신이 무너져 광기를 얻고 ${BREAKDOWN_RESET}으로 돌아온다. 나쁜 광기가 ${MAX_MADNESS}개가 되면 여정이 끝난다.\n지금 광기 ${run.madness.length}개`,
          })
        }
      />
      <Stat
        icon="gi:third-eye"
        color="var(--ins)"
        value={snap ? snap.p.insight : p.insight}
        onClick={() =>
          showTip({
            title: '통찰',
            icon: 'gi:third-eye',
            color: 'var(--ins)',
            body: `이계의 지식. ${INSIGHT_SOURCES}\n${insightText(snap ? snap.p.insight : p.insight)}`,
          })
        }
      />
      {!compact && <Stat icon="gi:two-coins" color="var(--brass-2)" value={p.gold} />}
      <GrowthChip />
      <div class="grow" />
      <button class="stat hud-char" onClick={openChar} aria-label="캐릭터">
        <span class="chip" style={{ padding: '3px 8px', color: 'var(--brass-2)' }}>
          <Icon name="gi:knapsack" size={15} />
          <span class="num">Lv {p.level}</span>
          <span class="muted" style={{ fontSize: 10 }}>
            정수 {essenceUsed(run)}/{essenceCap(run)}
          </span>
        </span>
      </button>
      <button class="iconbtn" style={{ width: 34, height: 34 }} onClick={() => ((store.sheet = { kind: 'settings' }), store.emit())} aria-label="설정">
        <Icon name="gi:settings-knobs" size={16} />
      </button>
    </div>
  );
}

export function XpBar() {
  const p = store.run!.player;
  const need = xpToNext(p.level);
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', margin: '0 10px' }}>
      <div style={{ height: '100%', width: `${(p.xp / need) * 100}%`, background: 'linear-gradient(90deg, #8a7030, #f0cf7a)', transition: 'width 0.5s' }} />
    </div>
  );
}

/** 징조·계약 (2026-10 성장 개편): 지닌 것이 있으면 작은 표시, 누르면 무엇인지 */
function GrowthChip() {
  const run = store.run!;
  const omens = omensOf(run);
  const pacts = (run.pacts ?? []).filter((p) => p.left > 0);
  if (!omens.length && !pacts.length) return null;
  const tip = () =>
    showTip({
      title: '징조와 계약',
      icon: 'gi:crystal-ball',
      color: '#c8a0ff',
      body: [
        ...omens.map((id) => `【${OMENS.get(id)?.name}】 ${OMENS.get(id)?.desc}`),
        ...pacts.map((p) => `【계약 · ${PACTS.get(p.curse)?.name} → ${PACTS.get(p.boon)?.name}】 저주가 ${p.left}전투 남았다: ${PACTS.get(p.curse)?.desc}. 그 뒤로 ${PACTS.get(p.boon)?.desc}`),
        omens.length ? `징조는 ${GROWTH.omenCap}개까지 지닌다. 보상을 고르지 않고 떠나면 얻는다.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  // 좁은 화면에서 줄을 넘치지 않게: 징조는 하나의 표시 + 개수, 계약은 가장 먼저 이루어질 것까지 남은 전투
  return (
    <button class="hud-omens" onClick={tip} aria-label="징조와 계약">
      {omens.length > 0 && (
        <>
          <Icon name={omens.length === 1 ? (OMENS.get(omens[0])?.icon ?? 'gi:crystal-ball') : 'gi:crystal-ball'} size={14} color="#d9c2ff" />
          {omens.length > 1 && <span class="num omen">{omens.length}</span>}
        </>
      )}
      {pacts.length > 0 && (
        <>
          <Icon name="gi:quill-ink" size={14} color="#ff9a8a" />
          <span class="num">{Math.min(...pacts.map((p) => p.left))}</span>
        </>
      )}
    </button>
  );
}
