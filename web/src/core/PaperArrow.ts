// Original RepeatedGraphics(1/2): a 20px square with a transparent triangular cutout.
// Explicit parent hit area is required: our display list does not inherit child hits
// when mouseChildren=false. Journal arrows use the original tinted foreground ink.
import { Graphics, Sprite } from './Display';
import type { AssetStore } from './Assets';

export class PaperArrow extends Sprite {
  private surface: HTMLCanvasElement | null = null;
  private image: HTMLImageElement | null = null;

  constructor(direction: -1 | 1, color: number, onClick: () => void,
              private assets: AssetStore | null = null,
              private sampleX = 0, private sampleY = 0) {
    super();
    const g = new Graphics();
    g.beginFill(color);
    const triangle = direction < 0
      ? [{x:13,y:6},{x:6,y:10},{x:13,y:14}]
      : [{x:7,y:6},{x:14,y:10},{x:7,y:14}];
    g.polyCompound([[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}],triangle],g.fill,null);
    g.hitRect(0,0,20,20);
    this.graphics = g;
    this.buttonMode = true;
    this.mouseChildren = false;
    this.addEventListener('click',onClick);
    if (assets) void assets.ensure('InterfaceForeground.png');
  }

  renderSelf(ctx: CanvasRenderingContext2D) {
    const image = this.assets?.getImage('InterfaceForeground.png');
    if (!image) { super.renderSelf(ctx); return; }
    if (!this.surface || this.image !== image) {
      const surface = document.createElement('canvas');
      surface.width = surface.height = 20;
      const off = surface.getContext('2d')!;
      off.drawImage(image,this.sampleX,this.sampleY,20,20,0,0,20,20);
      const pixels = off.getImageData(0,0,20,20);
      for (let i=0;i<pixels.data.length;i+=4) {
        pixels.data[i]*=.3; pixels.data[i+1]*=.2; pixels.data[i+2]*=.1;
      }
      off.putImageData(pixels,0,0);
      off.globalCompositeOperation = 'destination-in';
      this.graphics!.render(off);
      this.surface = surface; this.image = image;
    }
    ctx.drawImage(this.surface,0,0);
  }
}
