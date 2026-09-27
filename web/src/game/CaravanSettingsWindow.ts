// Original IsoEngine.SettingsWindow: 14 switches in two columns.
import { Sprite, Graphics } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { Button, Switch } from "../core/Ui";
import { addDialogueBackground, DialogueTextMask } from "../core/DialogueBg";
import { getText, type DataStore } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import type { GameData } from "./World";
import { YesNoDialogue } from "./YesNoDialogue";

export const CARAVAN_SWITCHES = [
  {id:1550,key:"pauseOnExitTown",global:true},
  {id:1384,key:"interactWithFriendlyCaravans",global:true},
  {id:929,key:"collectForage",global:false},
  {id:930,key:"hunt",global:false},
  {id:1250,key:"milk",global:false},
  {id:6801,key:"shear",global:false},
  {id:6892,key:"soundFXControl",global:true},
  {id:1251,key:"autoFillLubricant",global:false},
  {id:1252,key:"autoFillWater",global:false},
  {id:6826,key:"distributeBatteries",global:true},
  {id:6836,key:"transportAsPassengers",global:true},
  {id:1385,key:"advancedTrading",global:true},
  {id:6802,key:"autoSave",global:true},
  {id:6893,key:"musicControl",global:true},
] as const;

export class CaravanSettingsWindow extends Sprite {
  readonly panel = new Sprite();
  readonly switches: Switch[] = [];
  constructor(gd: GameData, ds: DataStore, assets: AssetStore, onClose: () => void) {
    super();
    const backdrop = new Graphics(); backdrop.beginFill(0,.5); backdrop.drawRect(0,0,880,495); this.graphics=backdrop;
    const text=(id:number)=>getText(ds,id,ds.language).toUpperCase();
    const labels=CARAVAN_SWITCHES.map(pair=>new EngineText(text(pair.id),0xffffff,14,"left",0,0,880,20));
    const left=Math.max(...labels.slice(0,7).map(t=>t.textWidth))+40;
    const right=Math.max(...labels.slice(7).map(t=>t.textWidth))+40;
    const w=left+right+60, h=450;
    const panel=this.panel; panel.x=(880-w)/2; panel.y=248-h/2; this.addChild(panel);
    addDialogueBackground(panel,assets,0,0,w,h,0,undefined,false);
    const g=new Graphics();g.lineStyle(1,0xffffff,.35);g.moveTo(0,40);g.lineTo(w,40);g.hitRect(0,0,w,h);const frame=new Sprite();frame.graphics=g;frame.mouseEnabled=false;panel.addChild(frame);
    const title=new EngineText(text(36),0xffffff,16,"center",10,9,w-20,24);
    CARAVAN_SWITCHES.forEach((pair,i)=>{
      const owner:any=pair.global?gd:gd.Caravans[0];
      const sw=new Switch(1,!!owner[pair.key],()=>change(true),()=>change(false),null,null,30,40,true,assets);
      sw.x=i<7?20:left+40;sw.y=45+(i%7)*50;panel.addChild(sw);this.switches.push(sw);
      const label=labels[i];label.x=sw.x+40;label.y=sw.y+15;label.width=(i<7?left:right)-40;label.mouseEnabled=false;
      const change=(value:boolean)=>{
        if(pair.key==="advancedTrading" && value && !gd.warnedAboutAdvancedTrading){
          gd.warnedAboutAdvancedTrading=true;
          const warning=new YesNoDialogue(ds,assets);warning.setText(text(6813));
          warning.onApprove=()=>{gd.advancedTrading=true;this.removeChild(warning);};
          warning.onCancel=()=>{gd.advancedTrading=false;sw.setPosition(false);this.removeChild(warning);};
          this.addChild(warning);
        }else owner[pair.key]=value;
      };
    });
    panel.addChild(new DialogueTextMask(assets,w,h,[title,...labels]));
    const close=new Button(2,()=>{this.parent?.removeChild(this);onClose();},text(1229),assets);
    close.x=w/2-103;close.y=407;panel.addChild(close);
  }
}
