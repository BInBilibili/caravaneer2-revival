import {strToU8, strFromU8, zlibSync, unzlibSync} from "fflate";

const COMPRESSED_PREFIX = "c2z1:";
/** Lossless local envelope; export/import SaveData and original .sol remain unchanged. */
export function encodeStoredObject(data: Record<string, any>): string {
  const json = JSON.stringify(data);
  if (json.length < 32768) return json;
  const bytes = zlibSync(strToU8(json), {level: 6});
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return COMPRESSED_PREFIX + btoa(binary);
}
export function decodeStoredObject(raw: string): Record<string, any> {
  if (raw.startsWith(COMPRESSED_PREFIX)) {
    const binary = atob(raw.slice(COMPRESSED_PREFIX.length));
    raw = strFromU8(unzlibSync(Uint8Array.from(binary, c => c.charCodeAt(0))));
  }
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid save envelope");
  return data;
}

// SharedObject → localStorage 模拟（savedData / config）
export class SharedObjectLike {
  data: Record<string, any>;
  private readFailed = false;
  constructor(private key: string, defaults: Record<string, any>, private backend?: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
    try {
      const raw = (this.backend ?? localStorage).getItem("c2:" + key);
      this.data = raw ? decodeStoredObject(raw) : { ...defaults };
    } catch {
      this.readFailed = true; // Never replace unreadable existing saves with an empty snapshot.
      this.data = { ...defaults };
    }
    if (!this.data.saves && key === "savedData") this.data.saves = [];
  }
  flush(): boolean {
    if (this.readFailed) return false;
    try { (this.backend ?? localStorage).setItem("c2:" + this.key, encodeStoredObject(this.data)); return true; }
    catch { return false; }
  }
  clear() { try { (this.backend ?? localStorage).removeItem("c2:" + this.key); } catch { /* noop */ } }
}

export interface SaveSlots {
  saves: Array<{ name?: string; day?: number; money?: number; date?: string } | null>;
}
