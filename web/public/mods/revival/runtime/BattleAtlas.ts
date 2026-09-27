import type { AssetStore } from '../../../../src/core/Assets';
import type { SkeletonDefinition } from './BattleSkeleton';

export type AtlasRect = { x: number; y: number; width: number; height: number };
export type PackedPartAtlas = {
  sourceUrl: string; image: string; width: number; height: number;
  cell: { width: number; height: number };
  frames: Record<string, AtlasRect & { original: AtlasRect }>;
};

/** Never replace mod-supplied original artwork with a base-game packed atlas. */
export function packedPartAtlas(assets: AssetStore, definition: SkeletonDefinition | undefined, source: string): PackedPartAtlas | undefined {
  const atlas = definition?.packedParts?.[source];
  return atlas && assets.getImageSource?.(source) === atlas.sourceUrl ? atlas : undefined;
}

export function packedPartFrame(atlas: PackedPartAtlas, dir: number, frame: number, cell: {width:number;height:number}, bounds: AtlasRect) {
  const rect = atlas.frames[`${dir}/${frame}`];
  if (!rect || cell.width !== atlas.cell.width || cell.height !== atlas.cell.height) return undefined;
  const original = rect.original;
  // A mod may alter frame boundaries without replacing its source URL.
  if (original.x !== bounds.x || original.y !== bounds.y || original.width !== bounds.width || original.height !== bounds.height) return undefined;
  if (![rect.x,rect.y,rect.width,rect.height].every(Number.isInteger) || rect.x < 0 || rect.y < 0 || rect.width !== bounds.width || rect.height !== bounds.height || rect.x+rect.width > atlas.width || rect.y+rect.height > atlas.height) return undefined;
  return rect;
}

type PackedLoad = { image: HTMLImageElement | null | undefined; ready: Promise<HTMLImageElement | undefined> };
const loads = new WeakMap<AssetStore, Map<string, PackedLoad>>();

// null means pending, undefined means unavailable: do not request the large
// original while the compact image is still loading. Failed loads are memoized.
function packedLoad(assets: AssetStore, atlas: PackedPartAtlas): PackedLoad {
  let store = loads.get(assets);
  if (!store) { store = new Map(); loads.set(assets, store); }
  const key = JSON.stringify([atlas.image, assets.getImageSource?.(atlas.image), atlas.width, atlas.height]);
  const cached = store.get(key);
  if (cached) return cached;
  const valid = (image: HTMLImageElement | null) => image?.complete && image.naturalWidth === atlas.width && image.naturalHeight === atlas.height ? image : undefined;
  const current = valid(assets.getImage(atlas.image));
  const state: PackedLoad = { image: current ?? null, ready: Promise.resolve(current) };
  store.set(key, state);
  if (!current) state.ready = assets.ensure(atlas.image).then(valid, () => undefined).then(image => { state.image = image; return image; });
  return state;
}

export function battlePackedImage(assets: AssetStore, atlas: PackedPartAtlas): HTMLImageElement | null | undefined {
  return packedLoad(assets, atlas).image;
}

export async function ensureBattlePart(assets: AssetStore, definition: SkeletonDefinition | undefined, name: string) {
  const atlas = packedPartAtlas(assets, definition, name);
  if (atlas) {
    const image = await packedLoad(assets, atlas).ready;
    if (image) return image;
  }
  return assets.ensure(name).catch(() => null);
}

/** One crop selection path for the doll and ground weapons. Original coordinates
 * are AnimationData.splitAtlas's direction columns and 80-frame row wrap. */
export function battlePartCrop(assets: AssetStore, definition: SkeletonDefinition | undefined, name: string, dir: number, frame: number, cell: {width:number;height:number}, bounds: AtlasRect): {image: HTMLImageElement; rect: AtlasRect} | null {
  const atlas = packedPartAtlas(assets, definition, name);
  const rect = atlas ? packedPartFrame(atlas, dir, frame, cell, bounds) : undefined;
  if (atlas && rect) {
    const image = battlePackedImage(assets, atlas);
    if (image === null) return null;
    if (image) return {image, rect};
  }
  const image = assets.getImage(name);
  if (!image?.complete || !image.naturalWidth) return null;
  return {image, rect: {x:(dir+(frame>80?4:0))*cell.width+bounds.x,
    y:(frame>80?frame-81:frame-1)*cell.height+bounds.y,width:bounds.width,height:bounds.height}};
}
