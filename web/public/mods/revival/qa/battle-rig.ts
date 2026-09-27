// Save-free renderer fixture. These transforms exercise rig features; they are
// NOT newly invented original-game motions and are never installed in gameplay.
import type { AssetStore } from "../../../../src/core/Assets";
import { renderDollFrame, type DollData, type DollRenderOpts } from "../runtime/BattleDoll";
import type { SkeletonAnimation, SkeletonDefinition } from "../runtime/BattleSkeleton";

export async function verifyStaticRig(data: DollData, assets: AssetStore): Promise<string> {
  const strip = document.querySelector<HTMLCanvasElement>("#rig-preview")!;
  strip.width = 500; strip.height = 400;
  const preview = strip.getContext("2d")!;
  const figure = document.querySelector<HTMLElement>("#rig-figure")!;
  figure.hidden = false;
  const names = ["Body", "Head", "RightForearm", "LeftForearm", "Shadows"];
  await Promise.all(names.map(name => assets.ensure(name + "1.png")));
  const cuts = new Map<string, HTMLCanvasElement>();
  let checks = 0;
  for (let dir = 0; dir < 4; dir++) {
    // Make one static native-size head image from the already-owned source.
    // An actual DLC would supply this image through its normal asset manifest.
    const cut = (part: string) => {
      const key = part + ":" + dir;
      let cv = cuts.get(key);
      if (cv) return cv;
      const b = data.spriteBoundaries[part]["1"][String(dir)]["1"];
      const pose = renderDollFrame({ assets, data, appearance: { gender: 1 }, dir,
        renderLayer: part === "Shadows" ? "shadow" : "body", skeleton: {
          definition: { drawOrder: "slots", bones: [{ name: "root" }], attachments: { fixed: { part, frame: 1 } },
            slots: [{ name: part, part, bone: "root", z: 0, attachment: "fixed" }] },
          animation: { name: "fixed", duration: 1, fps: 25, tracks: [] }, time: 0,
        } });
      if (!pose) throw new Error("Rig fixture asset unavailable: " + part);
      cv = document.createElement("canvas"); cv.width = b.width; cv.height = b.height;
      cv.getContext("2d")!.drawImage(pose, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
      cuts.set(key, cv); return cv;
    };
    const head = new Image(); head.src = cut("Head").toDataURL("image/png"); await head.decode();
    const nativeAssets = { getImage: (name: string) => name === "qa-static-head.png" ? head : assets.getImage(name) } as AssetStore;
    const hb = data.spriteBoundaries.Head["1"][String(dir)]["1"];
    const definition: SkeletonDefinition = {
      drawOrder: "slots",
      bones: [
        { name: "root", x: 50, y: 50, rotation: .2, scaleX: 1.25, scaleY: .75 },
        { name: "torso", parent: "root", pivotX: 50, pivotY: 50 },
        { name: "arm", parent: "root", x: 1, y: -8, pivotX: 50, pivotY: 41, alpha: .8 },
      ],
      attachments: {
        body: { part: "Body", frame: 1 }, head: { image: "qa-static-head.png", x: hb.x, y: hb.y },
        hand: { part: "RightForearm", frame: 1 }, alternate: { part: "LeftForearm", frame: 1 }, shadow: { part: "Shadows", frame: 1 },
      },
      slots: [
        { name: "hand", part: "RightForearm", bone: "arm", z: 2, attachment: "hand", x: 50, pivotX: 50, directions: { "3": { scaleX: -1, z: -1 } } },
        { name: "body", part: "Body", bone: "torso", z: 0, attachment: "body" },
        { name: "head", part: "Head", bone: "torso", z: 1, attachment: "head" },
        { name: "shadow", part: "Shadows", bone: "torso", z: -2, attachment: "shadow" },
      ],
    };
    const animation: SkeletonAnimation = { name: "rig-capability-check", duration: .2, fps: 25,
      tracks: [{ bone: "arm", keys: [{ time: 0, transform: { rotation: 0 } }, { time: .16, transform: { rotation: -.4 } }] }],
      slotTracks: [{ slot: "hand", keys: [{ time: .08, attachment: "alternate" }, { time: .12, visible: false }, { time: .16, visible: true }] }],
    };
    for (let frame = 0; frame < 5; frame++) {
      const time = frame / 25;
      for (const renderLayer of ["body", "shadow"] as const) {
        const opts: DollRenderOpts = { assets: nativeAssets, data, appearance: { gender: 1 }, dir, phase: 1, frame: frame + 1, renderLayer,
          skeleton: { definition, animation, time } };
        const got = renderDollFrame(opts);
        if (!got) throw new Error("Rig fixture rendering incomplete");
        // Independent Canvas transform stack, never the production matrix/sampler.
        const expected = document.createElement("canvas"); expected.width = expected.height = 100;
        const c = expected.getContext("2d")!;
        const order = renderLayer === "shadow" ? ["Shadows"] : dir === 3 ? ["hand", "Body", "Head"] : ["Body", "Head", "hand"];
        for (const part of order) {
          const hand = part === "hand";
          if (hand && frame === 3) continue;
          const source = hand ? (frame >= 2 ? "LeftForearm" : "RightForearm") : part;
          const b = data.spriteBoundaries[source]["1"][String(dir)]["1"];
          c.save(); c.translate(50, 50); c.rotate(.2); c.scale(1.25, .75);
          if (hand) {
            c.translate(1, -8); c.rotate(-.4 * time / .16); c.translate(-50, -41);
            c.translate(50, 0); c.scale(dir === 3 ? -1 : 1, 1); c.translate(-50, 0); c.globalAlpha = .8;
          } else c.translate(-50, -50);
          c.drawImage(source === "Head" ? head : cut(source), b.x, b.y); c.restore();
        }
        const actual = got.getContext("2d")!.getImageData(0, 0, 100, 100).data;
        const reference = c.getImageData(0, 0, 100, 100).data;
        if (actual.some((byte, i) => byte !== reference[i])) throw new Error(`Rig pixels differ: direction ${dir}, frame ${frame}, ${renderLayer}`);
        if (renderLayer === "body") preview.drawImage(got, frame * 100, dir * 100);
        checks++;
      }
    }
  }
  return `Static rig: ${checks} body/shadow poses match an independent Canvas transform stack. Five fixed source parts; native head image, parent shear, pivots, reflection, slot order, attachment switch and visibility verified. Preview: columns=time, rows=direction. Capability demo only, not original-game animation.`;
}
