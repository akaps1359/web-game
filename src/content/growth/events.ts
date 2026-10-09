import { josa } from '../../engine/josa';
import { finish } from '../../engine/events';
import { AFFIXES, EQUIPS, OMENS, PACTS, RELICS, RUNES, SKILLS, reg } from '../../engine/registry';
import { GROWTH, acceptPact, equipName, moreAffixes, omensOf, placeRng, rollAffixes, rollPacts, swapOmen } from '../../engine/growth';
import { gainRelic, hurtRun, rng, type RunState } from '../../engine/run';
import { dismantlePool } from '../../engine/schools';
import type { EquipSlot } from '../../engine/types';

/*
 * 성장 개편 (2026-10, engine/growth.ts)의 이벤트: 계약·징조·장비 접사·유물 진화·각인을 이벤트로도 만난다.
 * 판마다 같은 이벤트가 되풀이되던 것(5층은 11개 중 5개가 매번)에 새 갈래를 더한다
 */

/** 공증인이 내미는 계약 둘 (이 층·이 방에서 늘 같다 — 화면을 그려도 판이 바뀌지 않는다) */
function notaryOffers(run: RunState): { curse: string; boon: string }[] {
  return rollPacts(run, 2, placeRng(run, 'notary'));
}

/** 진화의 짝: 지닌 유물 중 하나가 재료이고 짝이 없는 것 → [지닌 것, 없는 짝, 진화한 것] */
function missingPartners(run: RunState): [string, string, string][] {
  const owned = new Set(run.relics.map((r) => r.id));
  const out: [string, string, string][] = [];
  for (const d of RELICS.values()) {
    if (!d.evolve || owned.has(d.id)) continue;
    const [a, b] = d.evolve;
    if (owned.has(a) && !owned.has(b)) out.push([a, b, d.id]);
    else if (owned.has(b) && !owned.has(a)) out.push([b, a, d.id]);
  }
  return out;
}

const SLOT_KO: Record<EquipSlot, string> = { weapon: '무기', armor: '방어구', trinket1: '장신구', trinket2: '장신구' };

reg.events([
  {
    id: 'g-notary',
    title: '심연의 공증인',
    icon: 'gi:quill-ink',
    acts: [2, 3, 4],
    stages: {
      start: (run, ev) => {
        const offers = notaryOffers(run);
        return {
          text: `검은 장부를 펼친 자가 깃펜을 내민다. 잉크가 아니라 무언가 살아 있는 것이 펜촉에서 떨어진다.\n"대가는 먼저, 보답은 영원히. 전투 ${GROWTH.pactFights}번을 견디면 장부의 이 줄은 너의 것이다."`,
          choices: [
            ...offers.map((o) => {
              const c = PACTS.get(o.curse)!;
              const b = PACTS.get(o.boon)!;
              return {
                label: `서명: ${c.name} → ${b.name}`,
                hint: `${GROWTH.pactFights}전투 동안 ${c.desc} · 그 뒤로 ${b.desc}`,
                disabled: (run.pacts ?? []).some((p) => p.boon === o.boon) && '이미 맺은 축복이다',
                go: (r: RunState, e: typeof ev) => {
                  const why = acceptPact(r, o.curse, o.boon);
                  finish(e, why ?? `이름을 쓰자 장부의 그 줄이 잠깐 빛났다. 「${c.name}」${josa(c.name, '이')} 살갗 아래로 스며든다.`);
                },
              };
            }),
            { label: '서명하지 않는다', go: (_r, e) => finish(e, '공증인은 장부를 덮었다. "다음 장에서 보지."') },
          ],
        };
      },
    },
  },
  {
    id: 'g-seer',
    title: '점쟁이의 탁자',
    icon: 'gi:crystal-ball',
    acts: [1, 2, 3, 4],
    // 징조는 희귀 이상의 보상을 지나칠 때만 생긴다 (engine/growth.ts OMEN_RARITY) — 점쟁이는 지닌 징조를 바꿔 줄 뿐, 새로 주지 않는다 (성장 억제)
    when: (run) => omensOf(run).length > 0,
    stages: {
      start: (run) => {
        const held = omensOf(run)[0];
        if (!held || !OMENS.has(held)) {
          return {
            text: '천을 덮은 탁자 위에 그을린 뼈 조각들이 흩어져 있다. 얼굴을 가린 이가 고개를 젓는다. "네 앞날엔 아직 읽을 무늬가 없군."',
            choices: [{ label: '지나간다', go: (_r, e) => finish(e, '등 뒤에서 뼈 굴러가는 소리가 들렸다.') }],
          };
        }
        const from = OMENS.get(held)!;
        const cost = 20 + 10 * Math.min(5, run.act);
        const have = new Set(omensOf(run));
        // 이 탁자에 놓인 뼈 셋 (이 방에서 늘 같다)
        const picks = placeRng(run, 'seer').sample([...OMENS.keys()].filter((id) => !have.has(id)), 3);
        return {
          text: `천을 덮은 탁자 위에 그을린 뼈 조각들이 흩어져 있다. 얼굴을 가린 이가 내 「${from.name}」${josa(from.name, '을')} 읽더니 뼈 셋을 내 앞으로 민다.\n"그 앞날이 마음에 들지 않으면 바꿔 주지. 새 앞날을 그냥 얹어 주지는 않아."`,
          choices: [
            ...picks.map((id) => ({
              label: `바꾼다: ${OMENS.get(id)!.name} (${cost} 골드)`,
              hint: `「${from.name}」${josa(from.name, '을')} 내려놓는다 · ${OMENS.get(id)!.desc}`,
              disabled: run.player.gold < cost && '골드가 부족하다',
              go: (r: RunState, e: Parameters<typeof finish>[0]) => {
                r.player.gold -= cost;
                swapOmen(r, held, id);
                finish(e, `뼈를 쥐자 손바닥의 무늬가 바뀌었다. 「${from.name}」 → 「${OMENS.get(id)!.name}」`);
              },
            })),
            { label: '그냥 지나간다', go: (_r, e) => finish(e, '등 뒤에서 뼈 굴러가는 소리가 들렸다.') },
          ],
        };
      },
    },
  },
  {
    id: 'g-smith',
    title: '떠돌이 대장장이',
    icon: 'gi:anvil',
    acts: [2, 3, 4],
    when: (run) => Object.values(run.equip).some((it) => it && EQUIPS.get(it.id)?.rarity !== 'basic'),
    stages: {
      start: (run) => {
        const cost = 30 + 15 * Math.min(5, run.act);
        const slots = (['weapon', 'armor', 'trinket1', 'trinket2'] as EquipSlot[]).filter((s) => {
          const it = run.equip[s];
          return it && EQUIPS.get(it.id)?.rarity !== 'basic' && EQUIPS.get(it.id)?.rarity !== 'genesis';
        });
        return {
          text: '모루를 등에 진 대장장이가 불 꺼진 화덕 옆에 앉아 있다. "쇠는 기억을 갈아 끼울 수 있지. 무엇을 다시 두드려 줄까?"',
          choices: [
            ...slots.map((slot) => {
              const it = run.equip[slot]!;
              return {
                label: `${SLOT_KO[slot]} 재련: ${equipName(it)} (${cost} 골드)`,
                hint: it.aff?.length ? `접사를 새로 굴린다 (${it.aff.length}개)` : '접사 하나를 새긴다',
                disabled: run.player.gold < cost && '골드가 부족하다',
                go: (r: RunState, e: Parameters<typeof finish>[0]) => {
                  r.player.gold -= cost;
                  const cur = r.equip[slot]!;
                  const n = Math.max(1, cur.aff?.length ?? 0);
                  const next = moreAffixes(r, cur.id, [], n);
                  cur.aff = next.length ? next : rollAffixes(r, cur.id, 1);
                  finish(e, `불티가 튀었다. ${equipName(cur)}${josa(EQUIPS.get(cur.id)!.name, '이')} 식으며 새 무늬를 드러냈다. (${(cur.aff ?? []).map((a) => AFFIXES.get(a)?.name).join(' · ')})`);
                },
              };
            }),
            ...(slots.length
              ? [
                  {
                    label: '피로 덧새김 (무작위 장비 하나에 접사 +1)',
                    hint: '체력 -10',
                    go: (r: RunState, e: Parameters<typeof finish>[0]) => {
                      const slot = rng(r, 'event').pick(slots);
                      const cur = r.equip[slot]!;
                      const n = hurtRun(r, 10);
                      cur.aff = moreAffixes(r, cur.id, cur.aff ?? [], 1);
                      finish(e, `대장장이가 내 피를 쇳물에 섞었다. (체력 -${n}) ${equipName(cur)}`);
                    },
                  },
                ]
              : []),
            { label: '지나간다', go: (_r, e) => finish(e, '모루 두드리는 소리가 멀어졌다.') },
          ],
        };
      },
    },
  },
  {
    id: 'g-collector',
    title: '짝을 찾는 수집가',
    icon: 'gi:magnifying-glass',
    acts: [2, 3, 4],
    when: (run) => missingPartners(run).length > 0,
    stages: {
      start: (run) => {
        const pairs = missingPartners(run);
        if (!pairs.length) {
          return {
            text: '유리 상자를 잔뜩 짊어진 수집가가 내 유물들을 훑어보더니 고개를 젓는다. "짝을 잃은 것이 없군. 운이 좋은 건지 나쁜 건지."',
            choices: [{ label: '지나간다', go: (_r, e) => finish(e, '수집가는 유리 상자를 고쳐 메고 어둠 속으로 사라졌다.') }],
          };
        }
        const [have, want, evo] = pairs[0];
        const cost = 80 + 20 * Math.min(5, run.act);
        const others = run.relics.filter((r) => {
          const d = RELICS.get(r.id);
          return d && r.id !== have && !d.onGain && d.rarity !== 'boss' && !d.evolve && !pairs.some((p) => p[0] === r.id);
        });
        return {
          text: `유리 상자를 잔뜩 짊어진 수집가가 내 「${RELICS.get(have)!.name}」${josa(RELICS.get(have)!.name, '을')} 보고 눈을 빛낸다.\n"그건 혼자 있으면 안 되는 물건이야. 짝을 찾아 둘을 함께 지니고 수호자를 쓰러뜨리면… 「${RELICS.get(evo)!.name}」${josa(RELICS.get(evo)!.name, '이')} 되지."`,
          choices: [
            {
              label: `짝을 산다: ${RELICS.get(want)!.name} (${cost} 골드)`,
              hint: RELICS.get(want)!.desc,
              disabled: run.player.gold < cost && '골드가 부족하다',
              go: (r, e) => {
                r.player.gold -= cost;
                gainRelic(r, want);
                finish(e, `수집가가 유리 상자 하나를 열어 건넸다. 「${RELICS.get(want)!.name}」`);
              },
            },
            {
              label: `다른 유물과 맞바꾼다`,
              hint: others.length ? `무작위 유물 하나를 내준다 → ${RELICS.get(want)!.name}` : '내줄 만한 유물이 없다',
              disabled: !others.length && '내줄 만한 유물이 없다',
              go: (r, e) => {
                const give = rng(r, 'event').pick(others);
                r.relics = r.relics.filter((x) => x !== give);
                gainRelic(r, want);
                finish(e, `「${RELICS.get(give.id)!.name}」${josa(RELICS.get(give.id)!.name, '을')} 내주고 「${RELICS.get(want)!.name}」${josa(RELICS.get(want)!.name, '을')} 받았다.`);
              },
            },
            { label: '거절한다', go: (_r, e) => finish(e, '"아깝군." 수집가는 유리 상자를 고쳐 메었다.') },
          ],
        };
      },
    },
  },
  {
    id: 'g-furnace',
    title: '기억을 녹이는 가마',
    icon: 'gi:burning-book',
    acts: [1, 2, 3, 4],
    when: (run) => run.skills.some((s) => !run.slots.includes(s.uid) && !s.from && !s.starter && dismantlePool(s.id).length > 0),
    stages: {
      start: (run) => {
        const bag = run.skills.filter((s) => !run.slots.includes(s.uid) && !s.from && !s.starter && dismantlePool(s.id).length > 0).slice(0, 3);
        return {
          text: '푸른 불이 타는 가마. 안을 들여다보니 글자들이 녹아 문양으로 굳어 간다. 쓰지 않는 기술을 넣으면 그 계열의 각인이 되어 나올 것 같다.',
          choices: [
            ...bag.map((s) => ({
              label: `녹인다: ${SKILLS.get(s.id)!.name}`,
              hint: '그 계열의 각인 하나 (새겨 둔 각인은 돌려받는다)',
              go: (r: RunState, e: Parameters<typeof finish>[0]) => {
                const i = r.skills.findIndex((x) => x.uid === s.uid);
                if (i < 0) return finish(e, '가마가 식어 버렸다.');
                r.runes.push(...r.skills[i].runes);
                r.skills.splice(i, 1);
                const pool = dismantlePool(s.id).flatMap((id) => RUNES.get(id) ?? []);
                const rune = rng(r, 'event').weighted(pool, (x) => ({ common: 50, uncommon: 35, rare: 15 })[x.rarity as 'common'] ?? 10);
                r.runes.push(rune.id);
                finish(e, `기억 하나가 녹아 「${rune.name}」${josa(rune.name, '이')} 되었다.`);
              },
            })),
            { label: '지나간다', go: (_r, e) => finish(e, '불은 계속 무언가를 녹이고 있었다.') },
          ],
        };
      },
    },
  },
]);
