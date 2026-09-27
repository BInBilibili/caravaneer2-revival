import type { GameData } from './World';
import type { DataStore } from '../core/DataStore';
import { makeDialogueEnv, transpileAs3Fn } from './Story';
import { TOWN_BATTLE_BODIES } from './battleStoryData';

const scripts = new Map<number, ReturnType<typeof transpileAs3Fn>>();
/** Original MapMode over-town encounters, before the normal town screen opens. */
export function openTownBattle(gd: GameData, ds: DataStore, townId: number,
  open: (owner:any, settings:any, obstacles:any[]) => void): boolean {
  if (!gd.storyMode || !gd.story || !TOWN_BATTLE_BODIES[townId]) return false;
  const env = makeDialogueEnv(gd, ds), story = env.Story;
  const eligible = townId === 21 ? !story.killedRoversAtSigurdsHut
    : townId === 46 ? story.needToAttackCannibals && !story.defeatedTheCannibals
    : townId === 47 ? story.needToAttckWinchester && !story.killedWinchester
    : story.heardAboutReginsPlan && !story.reginsMenDefeated;
  if (!eligible) return false;
  let encounter: {owner:any;settings:any;obstacles:any[]} | undefined;
  Object.assign(env, { nc:0, i:0, k:0, peopleNum:0, rnd:0, obstaclesToPass:[], mapSymbols:{},
    openDialogue: (_case:number, owner:any, settings:any, obstacles:any[]) => { encounter={owner,settings,obstacles}; },
  });
  let script = scripts.get(townId);
  if (!script) { script=transpileAs3Fn(TOWN_BATTLE_BODIES[townId]);scripts.set(townId,script); }
  script(env);
  if (!encounter) throw new Error('Story battle '+townId+' did not create its encounter');
  const {owner,settings,obstacles}=encounter;
  // Direct original equipment assignments must also reserve that owner's cargo.
  owner.inUse={};
  for(const person of owner.People)for(const item of person.equipment)
    owner.inUse[item.type]=(owner.inUse[item.type]??0)+item.amount;
  gd.Caravans[0].moving=false;
  open(owner,settings,obstacles);
  return true;
}
