// TownMode.as:getLocationSymbol 1–34：统一设施和交易伙伴的原版组合图标。
import { Sprite, BitmapObject } from '../core/Display';
import type { AssetStore } from '../core/Assets';
export type LocationSymbolPart = { name: string; x: number; y: number; scale: number };
export function locationSymbolParts(symbol: number): Array<{ name: string; x: number; y: number; scale: number }> {
    const at = (name: string, x = 0, y = 0, scale = 1) => ({ name, x, y, scale });
    switch (symbol) {
      case 1: return [at("market")];
      case 2: return [at("equipmentshop")];
      case 3: return [at("cars")];
      case 4: return [at("firstaid")];
      case 5: return [at("veterinary")];
      case 6: return [at("mechanicalshop")];
      case 7: return [at("water")];
      case 8: return [at("person")];
      case 9: return [at("generalstore")];
      case 10: return [at("animals")];
      case 11: return [at("weapons")];
      case 12: return [at("carts")];
      case 13: return [at("slaves")];
      case 14: return [at("people")];
      case 15: return [at("room")];
      case 16: return [at("tent")]; // filtericontent
      case 17: return [at("storage")];
      case 18: return [at("house")];
      case 19: return [at("volunteers")];
      case 20: return [at("book")];
      case 21: return [at("sheriff")];
      case 22: return [at("prisoners", 0, 0, 0.8)];
      case 23: return [at("book"), at("sheriff", -9.5, -1, 0.3), at("sheriff", 9.5, -1, 0.3)];
      case 24: return [at("alkubrapolice")];
      case 25: return [at("liberationarmy")];
      case 26: return [at("workforcemerchants")];
      case 27: return [at("book"), at("mechanicalshop", -9.5, -1, 0.4), at("mechanicalshop", 9.5, -1, 0.4)];
      case 28: return [at("book"), at("veterinary", -9.5, -1, 0.4), at("veterinary", 9.5, -1, 0.4)];
      case 29: return [at("kendo")];
      case 30: return [at("transmitter")];
      case 31: return [at("bomb")];
      case 32: return [at("qubba")];
      case 33: return [at("federation")];
      case 34: return [at("book"), at("firstaid", -9.5, -1, 0.4), at("firstaid", 9.5, -1, 0.4)];
      default: return [];
    }
  }


export function attachLocationSymbol(group: Sprite, parts: LocationSymbolPart[], assets: AssetStore, x = 0, y = 0) {
  for (const part of parts) {
    // 每个部件都独立挂载：书本左右两个同名符号不能按贴图名去重。
    const holder = new Sprite(); holder.mouseEnabled = holder.mouseChildren = false; group.addChild(holder);
    const put = (image: HTMLImageElement | null) => {
      if (!image) return;
      holder.removeAll();
      const b = new BitmapObject(image); b.scaleX = b.scaleY = part.scale;
      b.x = x + part.x - image.naturalWidth * part.scale / 2;
      b.y = y + part.y - image.naturalHeight * part.scale / 2;
      holder.addChild(b);
    };
    const name = 'filtericon' + part.name + '.png', image = assets.getImage(name);
    if (image) put(image); else void assets.ensure(name).then(put);
  }
}
