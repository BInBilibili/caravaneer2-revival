import {Sprite, Graphics, BitmapObject} from '../core/Display';
import {EngineText} from '../core/EngineText';
import {Button, ScrollableArea} from '../core/Ui';
import {addDialogueBackground} from '../core/DialogueBg';
import {getText, type DataStore} from '../core/DataStore';
import type {AssetStore} from '../core/Assets';
import {modDisplayName, type ModRuntime, type ModRecord} from '../core/ModRuntime';
import {sfxClick} from '../core/Sound';
import {descriptionBlocks, descriptionFiles, descriptionImageSize, packageResource} from './DlcDescription';

/** DLCDialogue.as: 600x460 Dialogue, heading, brown list, lavender checkboxes,
 * 40px rows and bottom Done button. Web extension: independent description pane. */
export class DlcDialogue extends Sprite {
  private list: ScrollableArea;
  private detail: ScrollableArea;
  private selected: string | null = null;
  private pending = new Map<string, boolean>();
  private request = 0;
  private abort?: AbortController;
  private notice: EngineText;
  constructor(private ds: DataStore, private assets: AssetStore, private mods?: ModRuntime) {
    super();
    this.graphics = new Graphics(); this.graphics.beginFill(0, .5); this.graphics.drawRect(0,0,880,495); this.graphics.hitRect(0,0,880,495);
    const panel = new Sprite(); panel.x=140; panel.y=18; this.addChild(panel);
    addDialogueBackground(panel, assets, 0,0,600,460,0,undefined,false);
    const line = new Graphics(); line.lineStyle(1,0xffffff,.3); line.moveTo(0,45); line.lineTo(600,45); panel.addChild(line);
    panel.addChild(new EngineText(getText(ds,6878) || 'DLC',0xffffff,20,'center',10,12,580,30));
    const makeArea = (x:number,width:number) => {
      const frame = new Graphics(); frame.beginFill(4735032); frame.drawRect(x,60,width+10,280);
      frame.lineStyle(1,0xffffff,.3); frame.moveTo(x+width+10,59);frame.lineTo(x+width+10,341);frame.lineTo(x-1,341);
      frame.lineStyle(1,0,.6);frame.lineTo(x-1,59);frame.lineTo(x+width+10,59);panel.addChild(frame);
      const area = new ScrollableArea(width,280,width,280,true,false,false,10,10,assets);
      area.x=x;area.y=60;panel.addChild(area);return area;
    };
    this.list=makeArea(20,230);this.detail=makeArea(280,290);
    this.notice=new EngineText('',0xffffff,13,'center',20,353,560,52,true,true);panel.addChild(this.notice);
    const done=new Button(2,()=>this.finish(),getText(ds,1229),assets);done.x=197;done.y=417;panel.addChild(done);
    this.visible=false;
  }
  open() {
    this.visible=true;this.pending.clear();
    for(const mod of this.mods?.mods??[])this.pending.set(mod.id,mod.enabled);
    this.notice.text='';this.drawList();
    const mod=this.mods?.mods.find(m=>m.id===this.selected)??this.mods?.mods[0];
    if(mod)void this.select(mod,true);
    else {this.detail.clearAll();this.detail.updateSize();}
  }
  private drawList() {
    const scroll=this.list.scroll;this.list.clearAll();
    for(const [i,mod] of (this.mods?.mods??[]).entries()) {
      const row=new Sprite();row.x=8;row.y=10+i*40;Object.assign(row,{width:214,height:40});
      const g=new Graphics();g.beginFill(this.selected===mod.id?0xffffff:0, this.selected===mod.id ? .10 : 0);g.drawRect(0,0,214,40);
      g.lineStyle(1,11446745);g.moveTo(0,0);g.lineTo(214,0);g.moveTo(0,40);g.lineTo(214,40);g.hitRect(0,0,214,40);row.graphics=g;
      row.buttonMode=true;row.addEventListener('click',()=>{sfxClick();void this.select(mod);});
      const check=new Sprite();check.x=2;check.y=10;check.buttonMode=true;check.mouseChildren=false;
      const cg=new Graphics();cg.lineStyle(2,11446745);cg.drawRect(0,0,20,20);cg.hitRect(-2,-2,24,24);
      if(this.pending.get(mod.id)){cg.moveTo(5,5);cg.lineTo(10,15);cg.lineTo(15,5);}check.graphics=cg;
      check.addEventListener('click',()=>{sfxClick();this.pending.set(mod.id,!this.pending.get(mod.id));this.drawList();this.updateNotice();});
      row.addChild(check);
      const name=new EngineText(modDisplayName(mod,this.ds.language),11446745,13,'left',32,10,178,28,true,true);name.lineHeightScale=1;name.mouseEnabled=false;row.addChild(name);
      this.list.addContent(row);
    }
    this.list.updateSize();this.list.scroll=scroll;
  }
  private updateNotice() {
    const changed=(this.mods?.mods??[]).some(m=>this.pending.get(m.id)!==m.enabled);
    const zh=[18,19,30].includes(this.ds.language);
    this.notice.text=changed?(zh?'点击“完成”应用更改并重新加载。\n含 DLC 内容的存档，请勿停用对应 DLC。':'Done applies changes and reloads the game.\nKeep required DLC enabled when continuing its saves.'):'';
  }
  private finish() {
    const changed=(this.mods?.mods??[]).filter(m=>this.pending.get(m.id)!==m.enabled);
    for(const mod of changed)this.pending.get(mod.id)?this.mods?.enable(mod.id):this.mods?.disable(mod.id);
    this.abort?.abort();this.request++;this.visible=false;
    if(changed.length)location.reload();
  }
  private async select(mod: ModRecord, force = false) {
    if (!force && this.selected === mod.id) return;
    this.selected=mod.id;this.drawList();this.abort?.abort();this.abort=new AbortController();const request=++this.request;
    this.detail.clearAll();this.detail.scroll=0;
    let y=10;
    // Include trailing space in measured scroll content, including asynchronous images.
    const padding = new Sprite();padding.mouseEnabled=false;
    Object.assign(padding,{width:1,height:12});this.detail.addContent(padding);
    const updatePadding=()=>{padding.y=y;this.detail.updateSize();};
    const addText=(text:string,size=14)=>{
      const t=new EngineText(text,11446745,size,'left',12,y,266,null,true,true);t.lineHeightScale=1.15;t.mouseEnabled=false;
      this.detail.addContent(t);y+=t.textHeight+12;updatePadding();
    };
    try {
      let html='';
      for(const file of descriptionFiles(this.ds.language,mod.descriptionFile)) {
        const url=packageResource(mod.source,file);if(!url)continue;
        const response=await fetch(url,{signal:this.abort.signal});if(!response.ok)continue;
        html=await response.text();break;
      }
      if(html.length>100000||request!==this.request)return;
      const blocks=descriptionBlocks(html);
      if(!blocks.length)addText(modDisplayName(mod,this.ds.language),16);
      for(const block of blocks) {
        if(request!==this.request)return;
        if(block.rule){
          const line=new Sprite(),g=new Graphics();g.lineStyle(1,11446745);g.moveTo(12,0);g.lineTo(278,0);
          line.graphics=g;line.y=y;line.mouseEnabled=false;this.detail.addContent(line);y+=14;updatePadding();continue;
        }
        if(block.text){
          const size=block.heading?Math.max(15,23-block.heading*2):14;
          const left=block.quote||block.border?24:12;let x=left;const startY=y;
          if(block.border)y+=8;
          let lineTexts:EngineText[]=[];
          const finishLine=()=>{const free=278-left-(x-left);const offset=block.align==='center'?free/2:block.align==='right'?free:0;for(const t of lineTexts)t.x+=offset;lineTexts=[];};
          // Lay out styled runs at native output resolution using EngineText metrics.
          for(const run of block.runs??[{text:block.text,bold:false,italic:false}]) {
            const style=run.bold||block.heading?(run.italic?'boldItalic':'bold'):run.italic?'italic':'regular';
            for(const char of Array.from(run.text)) {
              if(char==='\n'){finishLine();x=left;y+=Math.round(size*1.4);continue;}
              const t=new EngineText(char,11446745,size,'left',0,0,null,null,false,false,null,style);
              if(x+t.textWidth>278&&x>left){finishLine();x=left;y+=Math.round(size*1.4);}
              t.x=x;t.y=y;t.mouseEnabled=false;this.detail.addContent(t);lineTexts.push(t);x+=t.textWidth;
            }
          }
          finishLine();y+=Math.round(size*1.4);
          if(block.border){y+=8;const s=new Sprite(),g=new Graphics();g.lineStyle(1,11446745);g.drawRect(12,startY,266,y-startY);s.graphics=g;s.mouseEnabled=false;this.detail.addContent(s);}
          if(block.quote){const s=new Sprite(),g=new Graphics();g.lineStyle(2,11446745);g.moveTo(14,startY);g.lineTo(14,y);s.graphics=g;s.mouseEnabled=false;this.detail.addContent(s);}
          y+=12;updatePadding();continue;
        }
        const imageUrl=block.image&&packageResource(mod.source,block.image);
        if(!imageUrl){if(block.alt)addText(block.alt,12);continue;}
        try {
          const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=imageUrl;});
          if(request!==this.request)return;
          if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>32000000){if(block.alt)addText(block.alt,12);continue;}
          const size=descriptionImageSize(img.naturalWidth,img.naturalHeight),container=new Sprite(),bitmap=new BitmapObject(img);
          bitmap.scaleX=bitmap.scaleY=size.width/img.naturalWidth;bitmap.mouseEnabled=false;container.addChild(bitmap);
          container.x=(290-size.width)/2;container.y=y;container.mouseEnabled=false;Object.assign(container,{width:size.width,height:size.height});
          this.detail.addContent(container);y+=size.height+12;
          // HTML alt is fallback text, not a caption for a successfully loaded image.
          updatePadding();
        } catch {if(request===this.request&&block.alt)addText(block.alt,12);}
      }
    } catch { if(request===this.request)addText(modDisplayName(mod,this.ds.language),16); }
  }
}
