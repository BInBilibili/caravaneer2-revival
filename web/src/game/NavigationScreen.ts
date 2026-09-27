import { discoverVisibleTowns } from "./TownVisibility";
// Port of IsoEngine.NavigationScreen: paper map, remembered viewport, two-point route and daily supplies.
import { Sprite, Graphics, BitmapObject, ClipSprite } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { Button } from "../core/Ui";
import { addDialogueBackground, DialogueTextMask } from "../core/DialogueBg";
import { getText, type DataStore } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import type { GameData } from "./World";
import { sfxClick } from "../core/Sound";
import { numberFormat } from "./ConsProdGraph";
type Point = {x:number;y:number};
const INK=2232576, PURPLE=2892436;
export class NavigationScreen {
  readonly screen=new Sprite();
  private routeStart:Point|null=null;
  private routeEnd:Point|null=null;
  private preview:Point|null=null;
  private plot=new ClipSprite(530,380);
  private mapLayer=new Sprite();
  private borderLayer=new Sprite();
  private townLayer=new Sprite();
  private markLayer=new Sprite();
  private info!:EngineText;
  private navText!:EngineText;
  private goBtn!:Sprite;
  private invertBtn!:Sprite;
  private pressed=new Set<number>();
  private frameAcc=0;
  private keydown=(e:KeyboardEvent)=>this.onKey(e,true);
  private keyup=(e:KeyboardEvent)=>this.onKey(e,false);
  private blur=()=>this.pressed.clear();
  constructor(private gd:GameData,private ds:DataStore,private assets:AssetStore,private onClose:()=>void,private onGo:()=>void=onClose){
    this.build();this.refresh();
    window.addEventListener("keydown",this.keydown);window.addEventListener("keyup",this.keyup);window.addEventListener("blur",this.blur);
  }
  destroy(){window.removeEventListener("keydown",this.keydown);window.removeEventListener("keyup",this.keyup);window.removeEventListener("blur",this.blur);this.pressed.clear();}
  private text(id:number){return getText(this.ds,id,this.ds.language);}
  get infoText(){return this.info.text;}
  get routeReady(){return !!this.routeStart&&!!this.routeEnd;}
  worldToMap(x:number,y:number):Point{return {x:320+(x-this.gd.mapCenterX)/8*this.gd.mapScale,y:247+(y-this.gd.mapCenterY)/8*this.gd.mapScale};}
  mapToWorld(x:number,y:number):Point{return {x:(x-320)*8/this.gd.mapScale+this.gd.mapCenterX,y:(y-247)*8/this.gd.mapScale+this.gd.mapCenterY};}
  refresh(){
    discoverVisibleTowns(this.gd);
    this.pressed.clear();this.preview=null;
    if(!this.gd.routeEnd)this.gd.routeStart=null;
    this.routeStart=this.gd.routeStart?{...this.gd.routeStart}:null;
    this.routeEnd=this.gd.routeEnd?{...this.gd.routeEnd}:null;
    this.gd.mapScale=Math.max(.1,Math.min(10,this.gd.mapScale||1));
    this.updateMap();this.updateInfoText();
  }
  private build(){
    const S=this.screen;S.graphics=new Graphics();S.graphics.hitRect(0,0,880,495);
    addDialogueBackground(S,this.assets,0,0,880,495,0,undefined,false);
    const paper=(x:number,w:number,mirror:boolean)=>{
      const p=new ClipSprite(w,410);p.x=x;p.y=42;p.mouseEnabled=p.mouseChildren=false;S.addChild(p);
      const put=(im:HTMLImageElement|null)=>{if(!im)return;const b=new BitmapObject(im);b.x=mirror?880:-660;b.scaleX=mirror?-1:1;p.addChild(b);};
      const im=this.assets.getImage("TownBG.jpg");if(im)put(im);else void this.assets.ensure("TownBG.jpg").then(put);
    };
    paper(40,560,true);paper(640,220,false);
    this.plot.x=55;this.plot.y=57;this.plot.mouseEnabled=this.plot.mouseChildren=false;S.addChild(this.plot);
    for(const layer of [this.mapLayer,this.townLayer,this.markLayer]){layer.x=-55;layer.y=-57;layer.mouseEnabled=layer.mouseChildren=false;this.plot.addChild(layer);}
    const frame=new Sprite(),g=new Graphics();g.lineStyle(2,INK);g.drawRect(55,57,530,380);
    g.lineStyle(1,INK);g.drawRect(50,52,540,390);g.drawRect(45,47,550,400);frame.graphics=g;frame.mouseEnabled=false;S.addChild(frame);this.borderLayer.mouseEnabled=false;S.addChild(this.borderLayer);
    const title=new EngineText(this.text(1396).toUpperCase(),0xffffff,14,"center",640,12,220,20);
    S.addChild(new DialogueTextMask(this.assets,880,495,[title]));
    this.info=new EngineText("",INK,14,"center",650,52,200,390,true,true);this.info.lineHeightScale=1.1;this.info.mouseEnabled=false;S.addChild(this.info);
    this.navText=new EngineText("",PURPLE,12,"left",60,62,500,390,true,true);this.navText.mouseEnabled=false;S.addChild(this.navText);
    this.goBtn=this.routeButton(this.text(2221),()=>this.goButtonFunction());this.invertBtn=this.routeButton(this.text(2222),()=>this.invertButtonFunction());
    S.addChild(this.goBtn);S.addChild(this.invertBtn);
    const click=new Sprite();click.graphics=new Graphics();click.graphics.hitRect(40,42,560,410);
    click.addEventListener("pointerdown",(e:any)=>this.clickOnMap(e.x,e.y));
    click.addEventListener("pointermove",(e:any)=>{if(this.routeStart&&!this.routeEnd){this.preview=this.mapToWorld(e.x,e.y);this.updateMarks();this.updateInfoText();}});
    click.onWheel=d=>{const steps=Math.max(1,Math.min(10,Math.round(Math.abs(d)/100)));this.zoom(Math.pow(d<0?1.05:.95,steps));};S.addChild(click);
    const hold=(n:number,x:number,y:number,label:string|null,vertical=false)=>{
      const host=new Sprite();host.x=x;host.y=y;host.buttonMode=true;host.mouseChildren=false;host.graphics=new Graphics();host.graphics.hitRect(0,0,vertical?28:n>=4?25:206,vertical?206:n>=4?25:28);
      const button=new Button(n>=4?8:2,n===6?()=>this.resetZoom():null,label,this.assets);button.mouseEnabled=button.mouseChildren=false;
      if(vertical){button.rotation=90;button.x=28;}
      host.addChild(button);
      if(n<4){const triangle=new Sprite(),g=new Graphics();g.beginFill(INK);if(vertical){const sign=n===3?-1:1;g.moveTo(14+sign*5,103);g.lineTo(14-sign*4,97);g.lineTo(14-sign*4,109);g.lineTo(14+sign*5,103);}else{const sign=n===0?-1:1;g.moveTo(103,14+sign*5);g.lineTo(97,14-sign*4);g.lineTo(109,14-sign*4);g.lineTo(103,14+sign*5);}triangle.graphics=g;triangle.mouseEnabled=false;host.addChild(triangle);}
      host.addEventListener("pointerdown",()=>{button.dispatchEvent("pointerdown");if(n<6)this.pressed.add(n);});
      for(const ev of ["pointerout","pointerup"])host.addEventListener(ev,()=>{this.pressed.delete(n);button.dispatchEvent(ev);});
      host.addEventListener("click",()=>button.dispatchClick());S.addChild(host);
    };
    hold(0,217,9,null);hold(2,217,459,null);hold(3,7,144,null,true);hold(1,607,144,null,true);
    hold(4,607.5,42,"+");hold(5,607.5,72,"-");hold(6,607.5,429,"R");
    const close=new Button(2,()=>{this.pressed.clear();this.onClose();},this.text(902).toUpperCase(),this.assets);close.x=647;close.y=459;S.addChild(close);
  }
  private routeButton(label:string,fn:()=>void){const b=new Sprite();b.x=660;b.buttonMode=true;b.mouseChildren=false;b.graphics=new Graphics();b.graphics.lineStyle(1,INK);b.graphics.drawRect(0,0,180,20);b.graphics.hitRect(0,0,180,20);b.addChild(new EngineText(label,INK,14,"center",0,0,180,20));b.addEventListener("click",fn);return b;}
  private zoom(f:number){this.gd.mapScale=Math.max(.1,Math.min(10,this.gd.mapScale*f));this.updateMap();}
  private resetZoom(){
    const towns=this.gd.Towns.filter(t=>t&&t.active&&t.discovered),c=this.gd.Caravans[0];
    const xs=towns.map(t=>t.x),ys=towns.map(t=>t.y);
    const minX=xs.length?Math.min(...xs):c.x,maxX=xs.length?Math.max(...xs):c.x,minY=ys.length?Math.min(...ys):c.y,maxY=ys.length?Math.max(...ys):c.y;
    this.gd.mapCenterX=(minX+maxX)/2;this.gd.mapCenterY=(minY+maxY)/2;
    this.gd.mapScale=towns.length<=1?1:Math.min(Math.max(Math.min(560/((maxX-minX)/8),410/((maxY-minY)/8)),.1),1.11)*.9;
    this.zoom(1);
  }
  private updateMap(){
    const g=new Graphics();g.lineStyle(1,INK,.3);const min=this.mapToWorld(55,57),max=this.mapToWorld(585,437);
    const step=Math.pow(10,Math.round(Math.log10(560*8/this.gd.mapScale/10)));
    for(let x=Math.ceil(min.x/step)*step;x<=max.x;x+=step){const p=this.worldToMap(x,0);g.moveTo(p.x,57);g.lineTo(p.x,437);}
    for(let y=Math.ceil(min.y/step)*step;y<=max.y;y+=step){const p=this.worldToMap(0,y);g.moveTo(55,p.y);g.lineTo(585,p.y);}
    const border=new Graphics(),xs=[55],ys=[57];
    const firstX=Math.ceil(min.x/step),firstY=Math.ceil(min.y/step);
    for(let x=firstX*step;x<=max.x;x+=step)xs.push(this.worldToMap(x,0).x);
    for(let y=firstY*step;y<=max.y;y+=step)ys.push(this.worldToMap(0,y).y);
    xs.push(585);ys.push(437);border.lineStyle(1,INK);
    for(const x of xs){border.moveTo(x,47);border.lineTo(x,52);border.moveTo(x,442);border.lineTo(x,447);}
    for(const y of ys){border.moveTo(45,y);border.lineTo(50,y);border.moveTo(590,y);border.lineTo(595,y);}
    border.lineStyle(0,0,0);border.beginFill(INK,.3);
    for(let i=0;i<xs.length-1;i++)if((firstX+i)%2===0){border.drawRect(xs[i],47,xs[i+1]-xs[i],5);border.drawRect(xs[i],442,xs[i+1]-xs[i],5);}
    for(let i=0;i<ys.length-1;i++)if((firstY+i)%2===0){border.drawRect(45,ys[i],5,ys[i+1]-ys[i]);border.drawRect(590,ys[i],5,ys[i+1]-ys[i]);}
    this.borderLayer.graphics=border;
    this.mapLayer.graphics=g;this.townLayer.removeAll();
    const sc=Math.pow(this.gd.mapScale,.3);
    for(const t of this.gd.Towns){if(!t||!t.active||!t.discovered)continue;const p=this.worldToMap(t.x,t.y),dot=new Sprite(),g=new Graphics(),r=3+t.population/500;g.beginFill(INK);g.drawCircle(0,0,r);dot.graphics=g;dot.x=p.x;dot.y=p.y;dot.scaleX=dot.scaleY=sc;dot.addChild(new EngineText(t.name,INK,12,"center",-100,r,200,20));this.townLayer.addChild(dot);}
    this.updateMarks();
  }
  private updateMarks(){
    this.markLayer.removeAll();this.navText.text="";const c=this.gd.Caravans[0],g=new Graphics();g.lineStyle(1,PURPLE);
    if(c.devicesWorking(198)>0){const p=this.worldToMap(c.x,c.y),s=this.gd.mapScale;g.drawCircle(p.x,p.y,5*s);g.moveTo(p.x-10*s,p.y);g.lineTo(p.x+10*s,p.y);g.moveTo(p.x,p.y-10*s);g.lineTo(p.x,p.y+10*s);this.navText.text=this.text(5790);}
    else if(this.gd.lastSextantPos.length>=2){const p=this.worldToMap(this.gd.lastSextantPos[0],this.gd.lastSextantPos[1]);g.beginFill(PURPLE,.2);g.drawCircle(p.x,p.y,this.gd.lastSextantOffset/8*this.gd.mapScale);g.endFill();const elapsed=Math.max(0,this.gd.Time-this.gd.lastSextantMeasurement);this.navText.text=this.text(5791)+"\n"+this.text(5792).replace("@hours@",String(Math.floor(elapsed/3600))).replace("@minutes@",String(Math.round(elapsed%3600/60)));}
    if(this.routeStart){const a=this.worldToMap(this.routeStart.x,this.routeStart.y);g.drawCircle(a.x,a.y,3);const end=this.routeEnd??this.preview;if(end){const b=this.worldToMap(end.x,end.y);g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);const marker=new Sprite(),mg=new Graphics();mg.beginFill(PURPLE);mg.moveTo(0,0);mg.lineTo(-4,6);mg.lineTo(4,6);mg.lineTo(0,0);marker.graphics=mg;marker.x=b.x;marker.y=b.y;marker.rotation=this.directionTo(end);this.markLayer.addChild(marker);}}
    this.markLayer.graphics=g;
  }
  private directionTo(end:Point){return (Math.atan2(end.x-this.routeStart!.x,this.routeStart!.y-end.y)*180/Math.PI+360)%360;}
  private syncRoute(){this.gd.routeStart=this.routeStart?{...this.routeStart}:null;this.gd.routeEnd=this.routeEnd?{...this.routeEnd}:null;}
  private clickOnMap(x:number,y:number){
    if(x<40||x>600||y<42||y>452)return;
    sfxClick();
    if(this.routeStart&&this.routeEnd){this.routeStart=null;this.routeEnd=null;}
    const p=this.mapToWorld(x,y);if(!this.routeStart){this.routeStart=p;this.preview=p;}else this.routeEnd=p;
    this.syncRoute();this.updateMarks();this.updateInfoText();
  }
  private updateInfoText(){
    const c=this.gd.Caravans[0],end=this.routeEnd??this.preview,rows:string[]=[];let ready=false;
    if(!this.routeStart)rows.push(this.text(1397));
    else {
      if(!this.routeEnd)rows.push(this.text(1398),"");
      if(end){
        const dir=this.directionTo(end),dist=Math.hypot(end.x-this.routeStart.x,end.y-this.routeStart.y)/5;
        const old=c.direction;c.direction=dir*Math.PI/180;let speed:number;try{speed=c.speedKmh;}finally{c.direction=old;}
        const hours=speed!>0?dist/speed!:Infinity;
        rows.push(this.text(7)+": "+Math.round(dir*10)/10+"º","",this.text(1399)+": "+Math.round(dist)+" "+this.text(943),"");
        if(!Number.isFinite(hours))rows.push(this.text(1446));
        else {let days=Math.floor(hours/24),h=Math.round(hours%24);if(h===24){days++;h=0;}rows.push(this.text(1400)+": "+(days?days+this.text(941)+" ":"")+h+this.text(1401),"");}
        ready=!!this.routeEnd&&Number.isFinite(hours)&&dist>0;
        if(ready){const cp=c.getConsumptionProduction(),days=hours/24,daily=(item:number)=>Math.max(0,(cp.consumption.find(x=>x.item===item)?.amount??0)-(cp.production.find(x=>x.item===item)?.amount??0));
          const pair=(needId:number,availableId:number,need:number,available:number,unit:number)=>rows.push(this.text(needId)+": "+numberFormat(need,0)+" "+this.text(unit),this.text(availableId)+": "+numberFormat(available,0)+" "+this.text(unit),"");
          pair(1402,1403,daily(1)*days,c.water,11);pair(1404,1405,Math.max(0,cp.foodConsumption-cp.foodProduction)*days,c.foodKcal(),939);
          if(daily(62)>0)pair(1406,1407,daily(62)*days,c.forage,12);
          if(daily(64)>0||cp.fuelPer100Km>0)pair(1408,1409,daily(64)*days+cp.fuelPer100Km*dist/100,c.fuel,11);
        }
      }
    }
    this.info.text=rows.join("\n")+(rows.at(-1)===""?"\n":"");this.info.size=14;while(this.info.textHeight>310&&this.info.size>=8)this.info.size--;
    this.goBtn.visible=this.invertBtn.visible=ready;this.goBtn.y=62+this.info.textHeight;this.invertBtn.y=92+this.info.textHeight;
  }
  private goButtonFunction(){if(!this.routeStart||!this.routeEnd||!this.goBtn.visible)return;sfxClick();const c=this.gd.Caravans[0];c.direction=this.directionTo(this.routeEnd)*Math.PI/180;c.moving=true;this.pressed.clear();this.onGo();}
  private invertButtonFunction(){if(!this.routeStart||!this.routeEnd)return;sfxClick();[this.routeStart,this.routeEnd]=[this.routeEnd,this.routeStart];this.syncRoute();this.updateMarks();this.updateInfoText();}
  private onKey(e:KeyboardEvent,down:boolean){
    if(!this.screen.visible||!this.screen.parent)return;
    const n=({ArrowUp:0,w:0,W:0,ArrowRight:1,d:1,D:1,ArrowDown:2,s:2,S:2,ArrowLeft:3,a:3,A:3} as Record<string,number>)[e.key];
    if(n!==undefined){e.preventDefault();if(down)this.pressed.add(n);else this.pressed.delete(n);}
    if(down&&!e.repeat&&(e.key==="r"||e.key==="R"))this.resetZoom();
  }
  update(dt:number){if(!this.screen.visible)return;this.frameAcc+=Math.min(dt,.2)*25;let changed=false;
    while(this.frameAcc>=1){this.frameAcc--;const move=80/this.gd.mapScale;for(const n of this.pressed){if(n===0)this.gd.mapCenterY-=move;if(n===1)this.gd.mapCenterX+=move;if(n===2)this.gd.mapCenterY+=move;if(n===3)this.gd.mapCenterX-=move;if(n===4)this.gd.mapScale=Math.min(10,this.gd.mapScale*1.05);if(n===5)this.gd.mapScale=Math.max(.1,this.gd.mapScale*.95);changed=true;}}
    if(changed)this.updateMap();
  }
}
