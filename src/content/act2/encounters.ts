import { reg } from '../../engine/registry';

reg.encounters([
  // ── 초반 (층의 첫 3전투) ──
  { id: 'a2-ghoul1', act: 2, kind: 'normal', early: true, enemies: [{ id: 'crypt-ghoul' }] },
  { id: 'a2-lampreys', act: 2, kind: 'normal', early: true, enemies: [{ id: 'lamprey' }, { id: 'lamprey' }] },
  { id: 'a2-friar1', act: 2, kind: 'normal', early: true, enemies: [{ id: 'scaled-friar' }] },
  { id: 'a2-monk1', act: 2, kind: 'normal', early: true, enemies: [{ id: 'possessed-monk' }] },
  { id: 'a2-confessor1', act: 2, kind: 'normal', early: true, enemies: [{ id: 'confessor' }] },
  { id: 'a2-eel-lamprey', act: 2, kind: 'normal', early: true, enemies: [{ id: 'lamprey' }, { id: 'pale-eel', row: 1 }] },

  // ── 일반 ──
  { id: 'a2-choir', act: 2, kind: 'normal', enemies: [{ id: 'martyr' }, { id: 'chorister', row: 1 }, { id: 'chorister', row: 1 }] },
  { id: 'a2-sermon', act: 2, kind: 'normal', enemies: [{ id: 'martyr' }, { id: 'abbey-priest', row: 1 }] },
  { id: 'a2-ghouls', act: 2, kind: 'normal', enemies: [{ id: 'crypt-ghoul' }, { id: 'crypt-ghoul' }] },
  { id: 'a2-ghoul-nun', act: 2, kind: 'normal', enemies: [{ id: 'crypt-ghoul' }, { id: 'drowned-nun', row: 1 }] },
  { id: 'a2-deep', act: 2, kind: 'normal', enemies: [{ id: 'scaled-friar' }, { id: 'pale-eel', row: 1 }] },
  { id: 'a2-shoal', act: 2, kind: 'normal', enemies: [{ id: 'scaled-friar' }, { id: 'lamprey' }] },
  { id: 'a2-exorcism', act: 2, kind: 'normal', enemies: [{ id: 'possessed-monk' }, { id: 'bell-acolyte', row: 1 }] },
  { id: 'a2-bells', act: 2, kind: 'normal', enemies: [{ id: 'confessor' }, { id: 'bell-acolyte', row: 1 }] },
  { id: 'a2-confession', act: 2, kind: 'normal', enemies: [{ id: 'confessor' }, { id: 'drowned-nun', row: 1 }] },
  { id: 'a2-font', act: 2, kind: 'normal', enemies: [{ id: 'possessed-monk' }, { id: 'font-tentacle', row: 1 }] },
  { id: 'a2-vigil', act: 2, kind: 'normal', enemies: [{ id: 'martyr' }, { id: 'drowned-nun', row: 1 }] },
  { id: 'a2-cell', act: 2, kind: 'normal', enemies: [{ id: 'confessor' }, { id: 'abbey-priest', row: 1 }, { id: 'chorister', row: 1 }] },
  { id: 'a2-eels', act: 2, kind: 'normal', enemies: [{ id: 'lamprey' }, { id: 'lamprey' }, { id: 'pale-eel', row: 1 }] },
  { id: 'a2-monk-ghoul', act: 2, kind: 'normal', enemies: [{ id: 'possessed-monk' }, { id: 'crypt-ghoul' }] },
  { id: 'a2-baptism', act: 2, kind: 'normal', enemies: [{ id: 'scaled-friar' }, { id: 'font-tentacle', row: 1 }] },

  // ── 정예 ──
  { id: 'a2-flagellant', act: 2, kind: 'elite', enemies: [{ id: 'flagellant' }, { id: 'martyr' }] },
  { id: 'a2-choirmaster', act: 2, kind: 'elite', enemies: [{ id: 'chorister', row: 0 }, { id: 'chorister', row: 0 }, { id: 'choirmaster', row: 1 }] },
  { id: 'a2-reliquary', act: 2, kind: 'elite', enemies: [{ id: 'reliquary' }] },

  // ── 층 수호자 ──
  { id: 'a2-boss-priest', act: 2, kind: 'boss', theme: 'high-priest', enemies: [{ id: 'high-priest' }] },
  { id: 'a2-boss-ghoulking', act: 2, kind: 'boss', theme: 'ghoul-king', enemies: [{ id: 'ghoul-king' }] },
  { id: 'a2-boss-deeplord', act: 2, kind: 'boss', theme: 'deep-lord', enemies: [{ id: 'deep-lord' }] },

  // ── 특수 ──
  { id: 'lord-a2', act: 2, kind: 'boss', theme: 'lord', enemies: [{ id: 'bellkeeper' }] },
  { id: 'stalker-a2', act: 2, kind: 'elite', enemies: [{ id: 'angler' }] },
  { id: 'rift-a2', act: 2, kind: 'elite', enemies: [{ id: 'inverted-saint' }] },
]);
