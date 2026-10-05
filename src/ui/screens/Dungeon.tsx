import { useState } from 'preact/hooks';
import { ENCOUNTERS, ENEMIES, FLOORS } from '../../engine/registry';
import { distances, lightCost, type Room } from '../../engine/dungeon';
import { FINAL_ACT } from '../../engine/run';
import { fightGuardian, move, riftEnter, useItem } from '../../state/actions';
import { store } from '../../state/store';
import { CONSUMABLES } from '../../engine/registry';
import { Icon, press, showTip } from '../components';
import { RunHud, XpBar } from '../Hud';
import { hours, ROOM_COLOR, ROOM_ICON, ROOM_NAME } from '../text';
import { leavePlace } from '../../engine/places';
import { openShop } from '../../engine/shop';
import { refresh } from '../../state/actions';
import { sound } from '../../sound';

export function DungeonScreen() {
  const run = store.run!;
  const f = run.floor!;
  const floorDef = FLOORS.get(f.act);
  const here = f.rooms[f.pos];
  const dist = distances(f, f.pos);
  const stalker = f.stalker?.active ? f.stalker : null;
  // 이동 확인: 이웃 방을 누르면 먼저 선택만 하고, 확인 버튼으로 이동
  const [picked, setPicked] = useState<number | null>(null);
  const target = picked !== null && here.links.includes(picked) ? picked : null;
  const select = (id: number) => {
    setPicked(target === id ? null : id);
    sound.sfx('click', { volume: 0.5 });
  };
  const confirmMove = () => {
    if (target === null) return;
    setPicked(null);
    void move(target);
  };

  const roomTip = (r: Room) => {
    if (!r.scouted) {
      showTip({ title: '알 수 없는 방', icon: 'gi:help', body: '어둠에 가려 보이지 않는다. 등불이 밝으면 이웃한 방의 내용을 볼 수 있다.' });
      return;
    }
    const lines: { label: string; value: string }[] = [];
    if (r.enc) {
      const enc = ENCOUNTERS.find((e) => e.id === r.enc);
      if (enc) lines.push({ label: '존재', value: enc.enemies.map((e) => ENEMIES.get(e.id)?.name ?? e.id).join(', ') });
    }
    if (r.type === 'portal') {
      const boss = ENCOUNTERS.find((e) => e.id === f.bossEnc);
      if (boss) lines.push({ label: '층 수호자', value: ENEMIES.get(boss.enemies[0].id)?.name ?? '???' });
    }
    const notes: string[] = [];
    if (r.flooded) notes.push(f.act === 2 ? '재에 파묻힘 — 들어가는 데 2시간' : '침수됨 — 들어가는 데 2시간');
    if (r.inverted) notes.push('회복 반전 구역 — 이곳의 전투에선 회복이 피해가 된다');
    if (r.meteor !== undefined && !f.vars['meteor' + r.id]) notes.push(`유성 낙하 지점 — ${r.meteor}시에 떨어진다 (현재 ${f.hours}시)`);
    if (r.frozen !== undefined && !r.cleared)
      notes.push(
        f.hours < r.frozen
          ? `얼어붙은 방 — ${r.frozen}시간이 지나기 전엔 적이 얼음에 갇혀 첫 차례를 움직이지 못한다 (지금 ${hours(f.hours)})`
          : '녹아내린 방 — 깨어난 것들이 굶주려 있다 (적 공격 피해 +25%)',
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
    <div class="screen">
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
              body: `이동할 때마다 1시간이 흐른다. 12시간마다 조수가 한 단계 차올라 적이 강해진다. 조수 2단계부터 균열이 열리고, 4단계에는 무언가가 당신을 쫓기 시작한다.\n\n경과 ${hours(f.hours)} · 조수 ${f.tide}단계`,
            })
          }
        >
          <Icon name="gi:high-tide" size={13} color="#6fb6ea" />
          {hours(f.hours)} · 조수 {f.tide}
        </button>
      </div>
      <button
        class="lightbar"
        onClick={() =>
          showTip({
            title: `등불 · ${lightName}`,
            icon: 'gi:old-lantern',
            color: lightColor,
            body: `이동할 때마다 ${lightCost(run)} 줄어든다.\n밝음(75+): 이웃 방이 모두 보인다.\n희미함(25+): 일부만 보인다.\n어둠: 아무것도 보이지 않고, 이동마다 정신력 -2, 기습 위험. 대신 전리품이 늘어난다.`,
          })
        }
      >
        <Icon name="gi:old-lantern" size={16} color={lightColor} />
        <div class="lightbar-track">
          <i style={{ width: `${lightPct}%`, background: `linear-gradient(90deg, #6a3a10, ${lightColor})` }} />
        </div>
        <span class="num" style={{ color: lightColor, fontSize: 12, minWidth: 26 }}>
          {run.light}
        </span>
      </button>

      <div class="map-wrap">
        <div class="map" style={{ aspectRatio: `${f.w} / ${f.h}` }}>
          <svg class="corridors" viewBox={`0 0 ${f.w * 100} ${f.h * 100}`} preserveAspectRatio="none">
            {f.rooms.flatMap((r) =>
              r.links
                .filter((l) => l > r.id && r.seen && f.rooms[l].seen)
                .map((l) => {
                  const o = f.rooms[l];
                  const lit = r.visited || o.visited;
                  return (
                    <line
                      x1={r.x * 100 + 50}
                      y1={r.y * 100 + 50}
                      x2={o.x * 100 + 50}
                      y2={o.y * 100 + 50}
                      stroke={lit ? 'rgba(201,162,74,0.55)' : 'rgba(150,150,150,0.25)'}
                      stroke-width={lit ? 7 : 5}
                      stroke-dasharray={lit ? undefined : '10 10'}
                      stroke-linecap="round"
                    />
                  );
                }),
            )}
          </svg>
          {f.rooms
            .filter((r) => r.seen)
            .map((r) => {
              const adj = here.links.includes(r.id);
              const cur = r.id === f.pos;
              const showStalker = stalker && stalker.room === r.id && (dist[r.id] <= 3 || r.visited);
              const icon = r.rift ? 'gi:magic-portal' : r.scouted ? ROOM_ICON[r.type] : 'gi:help';
              const color = r.rift ? '#c08cff' : r.scouted ? ROOM_COLOR[r.type] : '#5a5f66';
              const faded = r.cleared && r.type !== 'merchant' && r.type !== 'shrine' && !cur;
              return (
                <button
                  key={r.id}
                  class={`room ${cur ? 'cur' : ''} ${adj ? 'adj' : ''} ${r.scouted ? '' : 'unknown'} ${faded ? 'faded' : ''} ${r.rift ? 'rift' : ''} ${target === r.id ? 'target' : ''}`}
                  style={`left:${((r.x + 0.5) / f.w) * 100}%;top:${((r.y + 0.5) / f.h) * 100}%;--rc:${color}`}
                  {...press(() => (adj && !store.busy ? select(r.id) : roomTip(r)), () => roomTip(r))}
                >
                  {r.scouted && r.type === 'empty' && !r.rift ? <i class="dot" /> : <Icon name={icon} size={22} color={color} />}
                  {cur && <span class="me" />}
                  {(r.flooded || r.inverted || (r.meteor !== undefined && !f.vars['meteor' + r.id]) || (r.frozen !== undefined && !r.cleared)) && (
                    <span class="mods">
                      {r.flooded && (f.act === 2 ? <Icon name="gi:burning-embers" size={11} color="#c9a27a" /> : <Icon name="gi:water-drop" size={11} color="#6fb6ea" />)}
                      {r.inverted && r.scouted && <Icon name="gi:cycle" size={11} color="#ff80c0" />}
                      {r.meteor !== undefined && !f.vars['meteor' + r.id] && <Icon name="gi:burning-meteor" size={11} color="#ff9a4a" />}
                      {r.frozen !== undefined &&
                        !r.cleared &&
                        (f.hours < r.frozen ? <Icon name="gi:ice-cube" size={11} color="#9fd8ff" /> : <Icon name="gi:melting-ice-cube" size={11} color="#ff8a6a" />)}
                    </span>
                  )}
                  {showStalker && (
                    <span class="stalker">
                      <Icon name="gi:evil-eyes" size={16} color="#ff3040" />
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      {target !== null ? <MoveConfirm id={target} onCancel={() => setPicked(null)} onConfirm={confirmMove} /> : <RoomPanel />}

      <div class="footer" style={{ paddingTop: 4 }}>
        {run.consumables.map((id, i) => {
          const def = id ? CONSUMABLES.get(id) : null;
          return (
            <button
              class="slot-item"
              onClick={() =>
                def &&
                showTip({
                  title: def.name,
                  icon: def.icon,
                  body: def.desc + (def.combat ? '\n(전투 중에만 사용)' : ''),
                })
              }
              onDblClick={() => def && !def.combat && useItem(i)}
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
      return '오래된 신전. 정수를 지우거나 광기를 치료할 수 있다.';
    case 'portal':
      return '다음 층으로 이어지는 비석. 층 수호자가 지키고 있다.';
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
  if (r.flooded) lines.push(f.act === 2 ? '재에 파묻힌 방 — 2시간 걸린다' : '침수된 방 — 2시간 걸린다');
  if (r.inverted && known) lines.push('회복 반전 구역');
  if (r.meteor !== undefined && !f.vars['meteor' + r.id]) lines.push(`유성 낙하 지점 (${r.meteor}시 예정, 지금 ${f.hours}시)`);
  if (r.frozen !== undefined && !r.cleared)
    lines.push(f.hours < r.frozen ? '얼어붙은 방 — 적이 아직 얼음에 갇혀 있다' : '녹아내린 방 — 굶주린 것들이 깨어났다 (적 공격 피해 +25%)');
  if (cold > 0) lines.push(`혹한 — 등불이 ${cold} 더 닳는다`);
  if (after < 25) lines.push('어둠 속 이동 — 정신력 -2, 기습 위험');
  const danger = known && !r.cleared && (r.type === 'elite' || r.type === 'lord');
  return (
    <div class="room-panel panel" style={{ borderColor: 'var(--brass)' }}>
      <div class="room-head">
        <Icon name={r.rift ? 'gi:magic-portal' : known ? ROOM_ICON[r.type] : 'gi:help'} size={18} color={known ? ROOM_COLOR[r.type] : '#8a8f96'} />
        <span class="serif" style={{ fontWeight: 800 }}>
          {name}(으)로 이동할까요?
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
      <button class="btn eldritch wide" onClick={() => riftEnter()}>
        <Icon name="gi:magic-portal" size={18} />
        균열에 들어간다 (수호자를 쓰러뜨려야 나올 수 있다)
      </button>
    );
  } else if (here.type === 'portal') {
    const boss = ENCOUNTERS.find((e) => e.id === f.bossEnc);
    const name = boss ? ENEMIES.get(boss.enemies[0].id)?.name : '';
    action = (
      <button class="btn danger wide" onClick={() => fightGuardian()}>
        <Icon name="gi:dungeon-gate" size={18} />
        {f.act >= FINAL_ACT ? `최후의 수호자 「${name}」에게 다가간다` : `층 수호자 「${name}」에게 도전`}
      </button>
    );
  } else if (here.type === 'lord' && !here.cleared) {
    action = (
      <button class="btn danger wide" onClick={() => fightGuardian()}>
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
