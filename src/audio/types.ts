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
  /** 화면 연출용: 유리 깨짐, 시계 초침, 수호자 등장, 데이터 깨짐, 묵직한 손바닥, 컷인 바람 */
  | 'glass'
  | 'tick'
  | 'sting'
  | 'glitch'
  | 'thud'
  | 'swoosh'
  /** 즉사: 심장이 멎는 긴 소리 */
  | 'flatline'
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
