import { useStore } from '../state/store';
import { TipView, Toasts } from './components';
import { Title } from './screens/Title';
import { DungeonScreen } from './screens/Dungeon';
import { CombatScreen } from './screens/Combat';
import { RewardScreen } from './screens/Reward';
import { EventScreen } from './screens/Event';
import { CampScreen, ShrineScreen } from './screens/Places';
import { MerchantScreen } from './screens/Merchant';
import { HavenScreen } from './screens/Haven';
import { EndScreen } from './screens/End';
import { CharacterSheet } from './sheets/Character';
import { SettingsSheet } from './sheets/Settings';
import { PickSkillSheet } from './sheets/PickSkill';
import { CodexSheet } from './sheets/Codex';
import { AskView } from './ask';

export function App() {
  const s = useStore();
  const run = s.run;
  let screen;
  if (!run) screen = <Title />;
  else
    switch (run.screen) {
      case 'combat':
        screen = <CombatScreen />;
        break;
      case 'reward':
        screen = <RewardScreen />;
        break;
      case 'event':
        screen = <EventScreen />;
        break;
      case 'camp':
        screen = <CampScreen />;
        break;
      case 'shrine':
        screen = <ShrineScreen />;
        break;
      case 'merchant':
        screen = <MerchantScreen />;
        break;
      case 'haven':
        screen = <HavenScreen />;
        break;
      case 'gameover':
      case 'victory':
        screen = <EndScreen />;
        break;
      default:
        screen = <DungeonScreen />;
    }
  const sheet = s.sheet;
  return (
    <>
      {screen}
      {sheet?.kind === 'character' && <CharacterSheet tab={sheet.tab} />}
      {sheet?.kind === 'settings' && <SettingsSheet />}
      {sheet?.kind === 'pick' && <PickSkillSheet />}
      {sheet?.kind === 'codex' && <CodexSheet />}
      <Toasts />
      <TipView />
      <AskView />
    </>
  );
}
