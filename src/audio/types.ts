export type Mood =
  | 'title'
  | 'explore'
  | 'combat'
  | 'elite'
  | 'boss'
  | 'event'
  | 'merchant'
  | 'camp'
  | 'haven'
  | 'rift'
  | 'lord'
  | 'victory'
  | 'defeat'
  | 'silence';

export type Sfx =
  | 'click'
  | 'select'
  | 'error'
  | 'slash'
  | 'pierce'
  | 'gunshot'
  | 'blunt'
  | 'fire'
  | 'arcane'
  | 'void'
  | 'block'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'break'
  | 'enemyDeath'
  | 'playerHit'
  | 'sanityLoss'
  | 'whisper'
  | 'levelUp'
  | 'coin'
  | 'essence'
  | 'footstep'
  | 'door'
  | 'portal'
  | 'riftOpen'
  | 'reveal'
  | 'bell'
  | 'heartbeat'
  | 'turnStart'
  | 'charge'
  | 'victoryHit'
  | 'breakdown';

/** 볼륨은 0..1 */
export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}
