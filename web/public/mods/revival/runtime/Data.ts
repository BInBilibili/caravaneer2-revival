import type { DataStore } from "../../../../src/core/DataStore";
import type { SkeletonDefinition, SkeletonAnimation } from "./BattleSkeleton";
import type { TransportRig } from "./BattleTransportAnimation";

/** The base game has no dependency on this DLC-specific data schema. */
export type RevivalDataStore = DataStore & {
  battleSkeleton?: { definition: SkeletonDefinition; animations: Record<string, SkeletonAnimation>; transport?: TransportRig };
};
