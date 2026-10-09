import { useEffect, useRef, useState } from 'preact/hooks';
import { ENCOUNTERS, ENEMIES, FLOORS } from '../../engine/registry';
import { guardianRestHp, lightCost, type Room } from '../../engine/dungeon';
import { LV, ascAt } from '../../engine/abyss';
import { FINAL_ACT } from '../../engine/run';
import { fightGuardian, move, riftEnter, useItem } from '../../state/actions';
import { store } from '../../state/store';
import { CONSUMABLES } from '../../engine/registry';
import { Icon, press, showTip } from '../components';
import { RunHud, XpBar } from '../Hud';
import { DMG_NAME, hours, josa, ROOM_COLOR, ROOM_ICON, ROOM_NAME } from '../text';
import { weakPointKnown, weakPointOf } from '../../engine/weakpoint';
import { leavePlace } from '../../engine/places';
import { openShop } from '../../engine/shop';
import { refresh } from '../../state/actions';
import { sound } from '../../sound';
import { confirmThen } from '../ask';
import { MapView } from './DungeonMap';

/**
 * 계층군주의 기척 (2026-10, "계층군주 등장 조건에 대한 힌트도 인게임에"): 지도 위 칩 — 들은 징후만큼 ◆가 찬다.
 * 누르면 깨우는 조건의 소문(LordDef.hints)과 지금까지 들려온 징후
 */
function LordChip() {
  const run = store.run!;
  const f = run.floor!;
  const lord = FLOORS.get(f.act)?.lord;
  if (!lord) return null;
  const st = f.lord;
  // 마지막 징후는 깨어남 — ◆는 그 앞의 단계들
  const steps = Math.max(1, lord.warnings.length - 1);
  const heard = Math.min(st.warned, steps);
  const awake = st.room >= 0 && !st.defeated;
  const color = awake ? '#e6b8ff' : st.defeated ? 'var(--ink-3)' : '#b79ad6';
  const tip = () =>
    showTip({
      title: `계층군주 · ${lord.name}`,
      icon: 'gi:crowned-skull',
      color: '#c99cf0',
      body: [
        st.defeated
          ? '이 층의 계층군주를 쓰러뜨렸다.'
          : awake
            ? '깨어났다 — 지도에 표시된 곳에서 기다린다.'
            : '이 층 어딘가에 숨은 수호자가 잠들어 있다. 조건을 채우면 깨어나 지도에 나타난다. 쓰러뜨리면 희귀 유물과 창세의 물건(셋 중 하나), 그리고 계층정수를 얻는다.',
        '',
        '소문',
        ...lord.hints.map((h) => `· ${h}`),
        ...(heard > 0 ? ['', '들려온 징후', ...lord.warnings.slice(0, heard).map((w) => `· ${w}`)] : []),
      ].join('\n'),
      lines: [{ label: '기척', value: st.defeated ? '쓰러뜨림' : awake ? '깨어남' : `${heard} / ${steps}` }],
    });
  return (
    <button class={`chip lord-chip ${awake ? 'awake' : ''} ${st.defeated ? 'done' : ''}`} onClick={tip} aria-label="계층군주의 기척">
      <Icon name="gi:crowned-skull" size={13} color={color} />
      {st.defeated ? (
        '✓'
      ) : awake ? (
        '깨어남'
      ) : (
        <span class="pips">
          {Array.from({ length: steps }, (_, i) => (
            <i class={i < heard ? 'on' : ''} />
          ))}
        </span>
      )}
    </button>
  );
}

export function DungeonScreen() {
  const run = store.run!;
  const f = run.floor!;
  const floorDef = FLOORS.get(f.act);
  const here = f.rooms[f.pos];
  // 이동 확인: 이웃 방을 누르면 먼저 선택만 하고, 확인 버튼으로 이동
  const [picked, setPicked] = useState<number | null>(null);
  // 이동 연출: 핀이 다음 방으로 걸어간 뒤에 실제로 들어간다
  const [walking, setWalking] = useState<number | null>(null);
  const target = picked !== null && here.links.includes(picked) ? picked : null;
  const select = (id: number) => {
    setPicked(target === id ? null : id);
  };
  const confirmMove = () => {
    if (target === null || walking !== null) return;
    setPicked(null);
    setWalking(target);
    sound.sfx('footstep', { volume: 0.5 });
    setTimeout(() => {
      setWalking(null);
      void move(target);
    }, 420);
  };

  // 등불이 줄어든 만큼 잠깐 띄운다
  const prevLight = useRef(run.light);
  const [drop, setDrop] = useState<{ n: number; k: number } | null>(null);
  useEffect(() => {
    if (run.light < prevLight.current) setDrop({ n: prevLight.current - run.light, k: Date.now() });
    prevLight.current = run.light;
  }, [run.light]);

  const roomTip = (r: Room) => {
    if (!r.scouted) {
      showTip({ title: '알 수 없는 방', icon: 'gi:help', body: '어둠에 가려 보이지 않는다. 등불이 밝으면 이웃한 방의 내용을 볼 수 있다.' });
      return;
    }
    const lines: { label: string; value: string }[] = [];
    // 이름 (같은 존재는 ×n) + 이번 여정에 드러난 급소 (engine/weakpoint.ts)
    const foes = (ids: string[]) =>
      [...new Set(ids)]
        .map((id) => {
          const n = ids.filter((x) => x === id).length;
          const wp = weakPointKnown(run, id) ? weakPointOf(run, id) : null;
          return `${ENEMIES.get(id)?.name ?? id}${n > 1 ? ` ×${n}` : ''}${wp ? ` (급소 ${DMG_NAME[wp]})` : ''}`;
        })
        .join(', ');
    if (r.enc) {
      const enc = ENCOUNTERS.find((e) => e.id === r.enc);
      if (enc) lines.push({ label: '존재', value: foes(enc.enemies.map((e) => e.id)) });
    }
    if (r.type === 'portal') {
      const boss = ENCOUNTERS.find((e) => e.id === f.bossEnc);
      if (boss) lines.push({ label: '층 수호자', value: boss.enemies[0] ? foes([boss.enemies[0].id]) : '???' });
    }
    const notes: string[] = [];
    if (r.flooded) notes.push(f.act === 2 ? '재에 파묻힘: 들어가는 데 2시간' : '침수됨: 들어가는 데 2시간');
    if (r.inverted) notes.push('회복 반전 구역: 이곳의 전투에선 회복이 피해가 된다');
    if (r.meteor !== undefined && !f.vars['meteor' + r.id]) notes.push(`유성 낙하 지점: ${r.meteor}시에 떨어진다 (현재 ${f.hours}시)`);
    if (r.frozen !== undefined && !r.cleared)
      notes.push(
        f.hours < r.frozen
          ? `얼어붙은 방: ${r.frozen}시간이 지나기 전엔 적이 얼음에 갇혀 첫 차례를 움직이지 못한다 (지금 ${hours(f.hours)})`
          : '녹아내린 방: 깨어난 것들이 굶주려 있다 (적 공격 피해 +25%)',
      );
    showTip({
      title: ROOM_NAME[r.type] + (r.rift ? ' · 균열' : ''),
      icon: r.rift ? 'gi:magic-portal' : ROOM_ICON[r.type],
      color: r.rift ? '#c08cff' : ROOM_COLOR[r.type],
      body: roomDesc(r) + (r.cleared && r.type !== 'merchant' && r.type !== 'shrine' ? '\n(이미 지나간 곳)' : '') + (notes.length ? '\n\n' + notes.join('\n') : ''),
      lines,
    });
  };

  const lightPct = run.light;
  const lightColor = run.light >= 75 ? '#ffd27a' : run.light >= 25 ? '#d0903a' : '#7a4a2a';
  const lightName = run.light >= 75 ? '밝음' : run.light >= 25 ? '희미함' : '어둠';

  return (
    <div class="screen dungeon">
      <div class={`screen-dark ${run.light < 25 ? 'dim' : ''}`} />
      <RunHud />
      <XpBar />
      <div class="floorbar">
        <button class="floor-name serif" onClick={() => floorDef && showTip({ title: `${f.act}층 · ${floorDef.name}`, icon: 'gi:dungeon-gate', body: `층의 법칙\n${floorDef.law}` })}>
          {`${f.act}층 · ${floorDef?.name ?? ''}`}
          <Icon name="gi:help" size={13} color="var(--ink-3)" />
        </button>
        <div class="grow" />
        <button
          class="chip"
          onClick={() =>
            showTip({
              title: '심연의 조수',
              icon: 'gi:high-tide',
              color: '#6fb6ea',
              body: `이동할 때마다 1시간이 흐른다. 12시간마다 조수가 ${(f.vars.tideMul ?? 1) > 1 ? `${f.vars.tideMul} 단계씩` : '한 단계'} 차올라 적이 강해진다. 조수 2단계부터 균열이 열리고, 4단계에는 무언가가 당신을 쫓기 시작한다.\n\n경과 ${hours(f.hours)} · 조수 ${f.tide}단계${f.vars.tideBase ? `\n지난 층에서 물러가지 않은 조수 ${f.vars.tideBase}단계 (심연 「물러나지 않는 조수」)` : ''}`,
            })
          }
        >
          <Icon name="gi:high-tide" size={13} color="#6fb6ea" />
          {hours(f.hours)} · 조수 {f.tide}
        </button>
        <button class="chip" aria-label="지도 보는 법" onClick={showLegend}>
          <Icon name="gi:scroll-unfurled" size={14} color="var(--brass-2)" />
        </button>
      </div>
      {/* 등불 막대 줄 끝에 계층군주의 기척 (윗줄은 층 이름·조수로 차 있다) */}
      <div class="lightrow">
        <button
          class="lightbar"
          onClick={() =>
            showTip({
              title: `등불 · ${lightName}`,
              icon: 'gi:old-lantern',
              color: lightColor,
              body: `이동할 때마다 ${lightCost(run)} 줄어든다.\n밝음(75+): 이웃 방이 모두 보인다.\n희미함(25+): 일부만 보인다.\n어둠: 아무것도 보이지 않고, 이동마다 정신력 -2, 기습 위험. 대신 전리품이 늘어난다.${ascAt(run, LV.ambush) ? '\n심연 「어둠 속의 것들」: 기습당하면 적이 먼저 움직인다.' : ''}`,
            })
          }
        >
          <span class={`lamp ${run.light < 25 ? 'low' : run.light < 75 ? 'mid' : ''}`}>
            <Icon name="gi:old-lantern" size={16} color={lightColor} />
          </span>
          <div class="lightbar-track">
            <i style={{ width: `${lightPct}%`, background: `linear-gradient(90deg, #6a3a10, ${lightColor})`, boxShadow: `0 0 ${4 + lightPct / 10}px ${lightColor}` }} />
          </div>
          <span class="num" style={{ color: lightColor, fontSize: 12, minWidth: 26, position: 'relative' }}>
            {run.light}
            {drop && (
              <span key={drop.k} class="light-drop">
                -{drop.n}
              </span>
            )}
          </span>
        </button>
        <LordChip />
      </div>

      <MapView target={target} walking={walking} onRoom={select} onTip={roomTip} />

      {target !== null ? <MoveConfirm id={target} onCancel={() => setPicked(null)} onConfirm={confirmMove} /> : <RoomPanel />}

      <div class="footer" style={{ paddingTop: 4 }}>
        {run.consumables.map((id, i) => {
          const def = id ? CONSUMABLES.get(id) : null;
          return (
            <button
              class="slot-item"
              onClick={() =>
                def &&
                (def.combat
                  ? showTip({ title: def.name, icon: def.icon, body: def.desc + '\n(전투 중에만 사용)' })
                  : confirmThen({ title: `${def.name} 사용`, icon: def.icon, body: def.desc, ok: '사용한다' }, () => useItem(i)))
              }
            >
              {def ? <Icon name={def.icon} size={22} color="var(--brass-2)" /> : <span class="muted">·</span>}
            </button>
          );
        })}
        <button class="btn" style={{ flex: 1.4 }} onClick={() => ((store.sheet = { kind: 'character' }), store.emit())}>
          <Icon name="gi:knapsack" size={18} />
          소지품
        </button>
      </div>
    </div>
  );
}

function showLegend() {
  const kinds = ['combat', 'elite', 'treasure', 'event', 'camp', 'merchant', 'shrine', 'portal', 'lord'] as const;
  showTip({
    title: '지도 보는 법',
    icon: 'gi:scroll-unfurled',
    body: [
      '핀이 지금 있는 곳이다. 금빛으로 흐르는 길 끝의 방을 누르면 그리로 간다.',
      '발자국은 지나온 길, 체크(✓)는 이미 다녀간 방이다. 물음표는 어두워서 안이 보이지 않는 방.',
      '등불이 어두워질수록 내 주변만 밝게 보인다.',
    ].join('\n'),
    lines: kinds.map((k) => ({ label: ROOM_NAME[k], value: roomDesc({ type: k } as Room), color: ROOM_COLOR[k] })),
  });
}

/** 빈 목록이면 undefined (확인 창이 빈 줄을 그리지 않게) */
function nonEmpty<T>(list: T[]): T[] | undefined {
  return list.length ? list : undefined;
}


function roomDesc(r: Room): string {
  switch (r.type) {
    case 'combat':
      return '무언가가 웅크리고 있다.';
    case 'elite':
      return '강력한 존재의 기척. 쓰러뜨리면 유물을 얻는다.';
    case 'treasure':
      return '잊힌 물건이 남아 있다.';
    case 'event':
      return '기묘한 일이 기다린다.';
    case 'camp':
      return '불을 피우고 쉬어갈 수 있다.';
    case 'merchant':
      return '떠돌이 상인이 좌판을 폈다.';
    case 'shrine':
      return '오래된 신전. 병에 담은 정수를 새기거나, 정수를 지우거나, 광기를 치료할 수 있다.';
    case 'portal':
      return '다음 층으로 이어지는 비석. 층 수호자가 지키고 있다. 비석 앞에서 숨을 고르고(체력 전부) 싸운다.';
    case 'lord':
      return '계층군주가 깨어났다. 쓰러뜨리면 판당 하나뿐인 계층정수를 얻는다.';
    case 'start':
      return '내려온 곳.';
    default:
      return '텅 빈 방.';
  }
}

/** 이동 확인 */
function MoveConfirm({ id, onCancel, onConfirm }: { id: number; onCancel: () => void; onConfirm: () => void }) {
  const run = store.run!;
  const f = run.floor!;
  const r = f.rooms[id];
  const known = r.scouted;
  const name = r.rift ? '균열이 열린 방' : known ? ROOM_NAME[r.type] : '알 수 없는 방';
  const cost = r.flooded ? 2 : 1;
  // 층의 법칙이 등불을 더 닳게 할 수 있다 (3층 혹한: f.vars.coldLight = 추가 소모 %)
  const cold = Math.ceil((lightCost(run) * (f.vars.coldLight ?? 0)) / 100);
  const light = lightCost(run) + cold;
  const after = Math.max(0, run.light - light);
  const lines: string[] = [];
  if (known && r.enc && !r.cleared) {
    const enc = ENCOUNTERS.find((e) => e.id === r.enc);
    if (enc) lines.push('존재: ' + enc.enemies.map((e) => ENEMIES.get(e.id)?.name ?? e.id).join(', '));
  }
  if (known && !r.cleared && r.type === 'elite') lines.push('강력한 존재가 지키고 있다');
  if (r.type === 'lord' && !r.cleared) lines.push('계층군주가 기다린다');
  if (r.type === 'portal') lines.push('층 수호자에게 도전하려면 들어간 뒤 따로 결정한다');
  if (r.flooded) lines.push(f.act === 2 ? '재에 파묻힌 방: 2시간 걸린다' : '침수된 방: 2시간 걸린다');
  if (r.inverted && known) lines.push('회복 반전 구역');
  if (r.meteor !== undefined && !f.vars['meteor' + r.id]) lines.push(`유성 낙하 지점 (${r.meteor}시 예정, 지금 ${f.hours}시)`);
  if (r.frozen !== undefined && !r.cleared)
    lines.push(f.hours < r.frozen ? '얼어붙은 방: 적이 아직 얼음에 갇혀 있다' : '녹아내린 방: 굶주린 것들이 깨어났다 (적 공격 피해 +25%)');
  if (cold > 0) lines.push(`혹한: 등불이 ${cold} 더 닳는다`);
  if (after < 25) lines.push(ascAt(run, LV.ambush) ? '어둠 속 이동: 정신력 -2, 기습 위험 (기습당하면 적이 먼저 움직인다)' : '어둠 속 이동: 정신력 -2, 기습 위험');
  const danger = known && !r.cleared && (r.type === 'elite' || r.type === 'lord');
  return (
    <div class="room-panel panel" style={{ borderColor: 'var(--brass)' }}>
      <div class="room-head">
        <Icon name={r.rift ? 'gi:magic-portal' : known ? ROOM_ICON[r.type] : 'gi:help'} size={18} color={known ? ROOM_COLOR[r.type] : '#8a8f96'} />
        <span class="serif" style={{ fontWeight: 800 }}>
          {name}{josa(name, '으로')} 이동할까요?
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'grid', gap: 2 }}>
        <div>
          시간 +{cost} · 등불 {run.light} → {after}
        </div>
        {lines.map((l) => (
          <div>· {l}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button class="btn ghost" style={{ flex: 1 }} onClick={onCancel}>
          취소
        </button>
        <button class={`btn ${danger ? 'danger' : ''}`} style={{ flex: 2 }} disabled={store.busy} onClick={onConfirm}>
          <Icon name="gi:footsteps" size={18} />
          이동
        </button>
      </div>
    </div>
  );
}

function RoomPanel() {
  const run = store.run!;
  const f = run.floor!;
  const here = f.rooms[f.pos];
  const recent = run.log.slice(-3).reverse();
  let action = null;
  if (here.rift) {
    action = (
      <button class="btn eldritch wide" onClick={() => confirmThen({ title: '균열에 들어갈까요?', icon: 'gi:magic-portal', color: 'var(--eldritch)', body: '균열 속 전투를 연달아 치르고 균열 수호자를 쓰러뜨려야 나올 수 있어요.', ok: '들어간다', danger: true }, riftEnter)}>
        <Icon name="gi:magic-portal" size={18} />
        균열에 들어간다 (수호자를 쓰러뜨려야 나올 수 있다)
      </button>
    );
  } else if (here.type === 'portal') {
    const boss = ENCOUNTERS.find((e) => e.id === f.bossEnc);
    const name = boss ? ENEMIES.get(boss.enemies[0].id)?.name : '';
    action = (
      <button
        class="btn danger wide"
        onClick={() =>
          confirmThen(
            {
              title: `「${name}」에게 도전할까요?`,
              icon: 'gi:dungeon-gate',
              body: `${f.act >= FINAL_ACT ? '마지막 싸움이에요. 준비가 되었는지 확인하세요.' : '층 수호자와 싸워요. 이기면 거점으로 가요.'}\n\n비석 앞에서 숨을 고르고 체력을 모두 채운 채 싸워요. 정신력은 그대로예요. 수호자의 공격은 그만큼 매서워요.`,
              lines: nonEmpty([
                ...(run.player.hp < guardianRestHp(run) ? [{ label: '숨 고르기', value: `체력 ${run.player.hp} → ${guardianRestHp(run)}`, color: 'var(--good)' }] : []),
                // 심연 「두 번째 모습」: 별의 태아 말고는 쓰러지면 한 번 다시 일어선다
                ...(ascAt(run, LV.rise) && f.act < FINAL_ACT ? [{ label: '두 번째 모습', value: '쓰러지면 한 번 다시 일어서요', color: 'var(--eldritch)' }] : []),
              ]),
              ok: '도전한다',
              danger: true,
            },
            fightGuardian,
          )
        }
      >
        <Icon name="gi:dungeon-gate" size={18} />
        {f.act >= FINAL_ACT ? `최후의 수호자 「${name}」에게 다가간다` : `층 수호자 「${name}」에게 도전`}
      </button>
    );
  } else if (here.type === 'lord' && !here.cleared) {
    action = (
      <button class="btn danger wide" onClick={() => confirmThen({ title: '계층군주에게 도전할까요?', icon: 'gi:crowned-skull', body: '이 층에서 가장 강한 존재예요.', ok: '도전한다', danger: true }, fightGuardian)}>
        <Icon name="gi:crowned-skull" size={18} />
        계층군주에게 도전
      </button>
    );
  } else if (here.type === 'merchant') {
    action = (
      <button
        class="btn wide"
        onClick={async () => {
          openShop(run, 'merchant', here.id);
          await refresh();
        }}
      >
        <Icon name="gi:shop" size={18} />
        상인과 거래
      </button>
    );
  } else if (here.type === 'shrine') {
    action = (
      <button
        class="btn wide"
        onClick={async () => {
          run.screen = 'shrine';
          await refresh();
        }}
      >
        <Icon name="gi:church" size={18} />
        신전에 들어간다
      </button>
    );
  } else if (here.type === 'camp' && !here.cleared) {
    action = (
      <button
        class="btn wide"
        onClick={async () => {
          run.screen = 'camp';
          await refresh();
        }}
      >
        <Icon name="gi:campfire" size={18} />
        야영한다
      </button>
    );
  }
  return (
    <div class="room-panel panel">
      <div class="room-head">
        <Icon name={here.rift ? 'gi:magic-portal' : ROOM_ICON[here.type]} size={18} color={ROOM_COLOR[here.type]} />
        <span class="serif" style={{ fontWeight: 800 }}>
          {ROOM_NAME[here.type]}
        </span>
        <span class="muted" style={{ fontSize: 12 }}>
          · 이웃한 방을 눌러 이동
        </span>
      </div>
      {action}
      <div class="log">
        {recent.map((l, i) => (
          <div style={{ opacity: 1 - i * 0.28 }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

export { leavePlace };
