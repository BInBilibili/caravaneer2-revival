import { Sprite, Graphics } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { Button } from "../core/Ui";
import { addDialogueBackground, DialogueTextMask } from "../core/DialogueBg";
import { getText, type DataStore } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
export interface OptionsMenuHooks {save:()=>void;load:()=>void;exit:()=>void;resume:()=>void;fullscreen?:()=>void;}
/** Original MapMode.OptionsMenu; settings live in CaravanSettingsWindow, not here. */
export class OptionsMenu extends Sprite {
  readonly panel=new Sprite();
  readonly buttons:Button[]=[];
  constructor(ds:DataStore,assets:AssetStore,hooks:OptionsMenuHooks){
    super();this.graphics=new Graphics();this.graphics.beginFill(0,.5);this.graphics.drawRect(0,0,880,495);
    const text=(id:number)=>getText(ds,id,ds.language).toUpperCase();
    const rows:Array<[number,()=>void]>=[[1433,hooks.save],[1434,hooks.load],[1435,hooks.exit]];
    if(hooks.fullscreen)rows.push([7031,hooks.fullscreen]);rows.push([1436,hooks.resume]);
    const title=new EngineText(text(28),0xffffff,20,"center",0,10,880,30);
    const labels=rows.map(([id],i)=>{const t=new EngineText(text(id),0xffffff,15,"left",65,0,500,20);t.y=57+i*40+15-t.textHeight/2;return t;});
    const w=Math.max(title.textWidth+40,...labels.map(t=>t.textWidth+85)),h=rows.length*40+70;
    title.width=w;this.panel.x=325-w/2;this.panel.y=248-h/2;this.addChild(this.panel);
    addDialogueBackground(this.panel,assets,0,0,w,h,0,undefined,false);
    const line=new Sprite();line.graphics=new Graphics();line.graphics.lineStyle(1,0xffffff,.35);line.graphics.moveTo(0,45);line.graphics.lineTo(w,45);line.mouseEnabled=false;this.panel.addChild(line);
    rows.forEach(([,fn],i)=>{const b=new Button(1,fn,null,assets);b.x=20;b.y=55+i*40;this.buttons.push(b);this.panel.addChild(b);});
    this.panel.addChild(new DialogueTextMask(assets,w,h,[title,...labels]));
  }
}
