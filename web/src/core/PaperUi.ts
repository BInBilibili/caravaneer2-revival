// Paper-ink controls used by the original town and navigation screens.
import { Sprite, Graphics, BitmapObject, ClipSprite } from './Display';
import { EngineText } from './EngineText';
import type { AssetStore } from './Assets';
import { sfxClick } from './Sound';
// Industry bookmarks have rounded upper corners but square lower corners.
class PaperShape extends Sprite {
  constructor(private w:number,private h:number,private radius:number){super();}
  render(ctx:CanvasRenderingContext2D){
    if(!this.visible)return;ctx.save();ctx.translate(this.x,this.y);ctx.scale(this.scaleX,this.scaleY);ctx.globalAlpha*=this.alpha;
    const r=this.radius;ctx.beginPath();ctx.moveTo(0,this.h);ctx.lineTo(0,r);ctx.quadraticCurveTo(0,0,r,0);ctx.lineTo(this.w-r,0);ctx.quadraticCurveTo(this.w,0,this.w,r);ctx.lineTo(this.w,this.h);ctx.closePath();ctx.clip();
    this.renderSelf(ctx);this.renderChildren(ctx);ctx.restore();
  }
}
export function paperInk(assets: AssetStore,w:number,h:number,topRadius=0): Sprite {
  const s=topRadius?new PaperShape(w,h,topRadius):new Sprite(); s.blendMode='layer'; s.mouseEnabled=false;
  const g=new Graphics();g.beginFill(0x504030);g.drawRect(0,0,w,h);s.graphics=g;
  const put=(im:HTMLImageElement|null)=>{if(!im)return;const clip=new ClipSprite(w,h);clip.mouseEnabled=false;clip.mouseChildren=false;
    const b=new BitmapObject(im);b.colorTransform={r:.3,g:.2,b:.1};b.mouseEnabled=false;clip.addChild(b);s.addChildAt(clip,0);s.graphics=null;};
  const im=assets.getImage('InterfaceForeground.png');if(im)put(im);else void assets.ensure('InterfaceForeground.png').then(put);return s;
}
export function paperButton(assets:AssetStore,label:string,w:number,h:number,fn:()=>void,size=14,sound:()=>void=sfxClick,topRadius=0):Sprite {
  const s=new Sprite(),g=new Graphics();g.hitRect(0,0,w,h);s.graphics=g;s.mouseChildren=false;s.buttonMode=true;
  const ink=paperInk(assets,w,h,topRadius),t=new EngineText(label,0xffffff,size,'center',0,0,w,h);t.verticalAlign='middle';t.blendMode='erase';t.mouseEnabled=false;ink.addChild(t);s.addChild(ink);
  // Original paper tabs have no alpha hover tween (TownMode.labelButtons).
  s.addEventListener('click',()=>{sound();fn();});return s;
}
