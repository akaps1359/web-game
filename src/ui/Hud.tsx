import { store } from '../state/store';
import { essenceCap, essenceUsed, xpToNext } from '../engine/run';
import { Icon, showTip, Stat } from './components';

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
            body: `0이 되면 붕괴해 광기를 얻고 50으로 돌아온다. 나쁜 광기 4개째에는 완전히 미쳐 끝난다.\n현재 광기 ${run.madness.length}개`,
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
            body: '이계의 지식. 2 이상이면 적의 약점이 모두 보이고, 5 이상이면 숨겨진 의도가 보인다. 금기 스킬이 강해진다.\n대신 통찰 1당 받는 정신 피해가 5% 늘어난다.',
          })
        }
      />
      {!compact && <Stat icon="gi:two-coins" color="var(--brass-2)" value={p.gold} />}
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
