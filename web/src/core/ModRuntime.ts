/** Runtime DLC/mod host. Data-only mods are safe by default; script execution
 * must be explicitly enabled by the host. */
export type ModManifest = {
  descriptionFile?: string;
  id: string; version: string; name?: string; apiVersion?: number; priority?: number;
  /** Localized display names keyed by language index (1 = English, 18 = 简体中文, 19 = 繁體中文). */
  names?: Record<string, string>;
  /** Dependencies may be listed as ids or as an id -> version-range map. */
  dependencies?: string[] | Record<string, string>;
  data?: Record<string, string | Record<string, any>>;
  assets?: Record<string, string>; entry?: string; enabled?: boolean;
  /** Build-time entry for explicitly bundled runtimes; never an arbitrary script opt-in. */
  runtime?: string;
};
export type ModRecord = ModManifest & { source: string; enabled: boolean; error?: string };

/** Display name for a language: names[lang], then zh-CN/zh-TW/ja sharing, then English, then `name`. */
export function modDisplayName(mod: ModRecord, language: number): string {
  const names = mod.names;
  if (names) {
    const direct = names[String(language)];
    if (direct) return direct;
    if (language === 18 || language === 19 || language === 30) {
      const zh = names["18"] || names["19"];
      if (zh) return zh;
    }
    if (names["1"]) return names["1"];
  }
  return mod.name ?? mod.id;
}

export type BundledModRuntime = {
  id: string;
  manifestUrl: string;
  load: () => Promise<{ default: (api: ReturnType<ModRuntime["api"]>) => void | Promise<void> }>;
};

type Listener = (payload: any) => void | Promise<void>;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();
  on(name: string, listener: Listener): () => void { let set = this.listeners.get(name); if (!set) { set = new Set(); this.listeners.set(name, set); } set.add(listener); return () => set?.delete(listener); }
  emit(name: string, payload?: any): void { for (const fn of this.listeners.get(name) ?? []) { try { Promise.resolve(fn(payload)).catch((e) => console.warn("mod event error", name, e)); } catch (e) { console.warn("mod event error", name, e); } } }
  async emitAsync(name: string, payload?: any): Promise<void> { for (const fn of this.listeners.get(name) ?? []) { try { await fn(payload); } catch (e) { console.warn("mod event error", name, e); } } }
  clear() { this.listeners.clear(); }
}

export class ModRuntime {
  readonly events = new EventBus(); readonly rules = new Map<string, any>(); readonly services = new Map<string, any>(); readonly mods: ModRecord[] = [];
  private overlay = new Map<string, string>(); private allowScripts: boolean; private dataTarget: Record<string, any> | null = null;
  private bundledRuntimes: BundledModRuntime[];
  constructor(opts: { allowScripts?: boolean; bundledRuntimes?: BundledModRuntime[] } = {}) {
    this.allowScripts = !!opts.allowScripts;
    this.bundledRuntimes = opts.bundledRuntimes ?? [];
  }
  async load(indexUrl = "mods/index.json"): Promise<ModRecord[]> {
    let urls: any[] = [];
    try { const r = await fetch(indexUrl,{cache:'no-store'}); if (!r.ok) return this.mods; const raw = await r.json(); urls = Array.isArray(raw) ? raw : (raw.mods ?? []); } catch { return this.mods; }
    // Read all manifests first so dependencies can be ordered deterministically.
    const pending: Array<{ manifest: ModManifest; source: string }> = [];
    for (const u of urls) {
      try {
        const inline = typeof u === "string" ? undefined : (u.manifest ?? u);
        const url = typeof u === "string" ? u : u.manifest;
        if (!url && !inline?.id) continue;
        const sourceUrl = new URL(url || indexUrl, location.href).toString();
        const manifest = inline?.id ? inline as ModManifest : await (await fetch(sourceUrl)).json() as ModManifest;
        pending.push({ manifest, source: sourceUrl });
      } catch (e) { console.warn("mod manifest read failed", u, e); }
    }
    const byId = new Map(pending.map((p) => [p.manifest.id, p]));
    const visiting = new Set<string>(), visited = new Set<string>(), ordered: typeof pending = [];
    const visit = (p: { manifest: ModManifest; source: string }) => {
      const id = p.manifest.id;
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error("cyclic mod dependency: " + id);
      visiting.add(id);
      for (const dep of dependencyIds(p.manifest)) {
        const d = byId.get(dep);
        if (!d) throw new Error("missing mod dependency: " + id + " -> " + dep);
        visit(d);
      }
      visiting.delete(id); visited.add(id); ordered.push(p);
    };
    for (const p of [...pending].sort((a, b) => (a.manifest.priority ?? 0) - (b.manifest.priority ?? 0))) {
      try { visit(p); } catch (e) { console.warn("mod dependency error", p.manifest.id, e); }
    }
    // DFS order guarantees every dependency is loaded before its dependents.
    for (const p of ordered) { try { await this.loadManifest(p.source, p.manifest); } catch (e) { console.warn("mod load failed", p.manifest.id, e); } }
    return this.mods;
  }
  async installPackage(pkg: { manifest: ModManifest; data?: Record<string, any>; assets?: Record<string, string> }, source = location.href): Promise<ModRecord> {
    const m = { ...pkg.manifest, data: { ...(pkg.manifest.data ?? {}), ...(pkg.data ?? {}) }, assets: { ...(pkg.manifest.assets ?? {}), ...(pkg.assets ?? {}) } };
    const rec = await this.loadManifest(source, m);
    if (this.dataTarget) { const merged = await this.applyTo(this.dataTarget); Object.assign(this.dataTarget, merged); }
    return rec;
  }
  async installFile(file: File): Promise<ModRecord> {
    if (/\.c2mod$/i.test(file.name) || file.type === "application/zip") {
      throw new Error("ZIP .c2mod 安装需要先解包到 public/mods；当前浏览器构建只接受 JSON mod 包");
    }
    const pkg = JSON.parse(await file.text());
    if (!pkg.manifest) throw new Error("mod package requires manifest");
    return this.installPackage(pkg, "./" + file.name);
  }
  async loadManifest(url: string, inline?: ModManifest): Promise<ModRecord> {
    const source = new URL(url, location.href).toString(); const manifest = inline ?? await (await fetch(source)).json() as ModManifest;
    if (!manifest?.id || !manifest.version) throw new Error("invalid mod manifest");
    const old = this.mods.find((m) => m.id === manifest.id); if (old) return old;
    for (const dep of dependencyIds(manifest)) if (!this.has(dep)) throw new Error(`missing mod dependency: ${manifest.id} -> ${dep}`);
    const base = source.slice(0, source.lastIndexOf("/") + 1);
    const disabled = manifest.enabled === false || this.disabledIds().has(manifest.id);
    const rec: ModRecord = { ...manifest, source: base, enabled: !disabled }; this.mods.push(rec);
    if (!rec.enabled) return rec;
    // Match both id and canonical local manifest path. An installed/remote mod
    // cannot get script permission by claiming the name of a bundled package.
    const bundled = this.bundledRuntimes.find(entry => entry.id === manifest.id
      && new URL(entry.manifestUrl, location.href).href === new URL(source, location.href).href);
    const priorServices = new Map(this.services), priorRules = new Map(this.rules), priorOverlay = new Map(this.overlay);
    try {
      if (manifest.runtime && !bundled) throw new Error("Runtime not bundled: " + manifest.id);
      if (bundled) {
        const module = await bundled.load();
        await module.default(this.api(rec));
      } else if (this.allowScripts && manifest.entry) {
        const module = await import(/* @vite-ignore */ new URL(manifest.entry, base).toString());
        const register = module.default ?? module.register;
        if (typeof register === "function") await register(this.api(rec));
      }
      for (const [name, value] of Object.entries(manifest.assets ?? {})) this.overlay.set(name.toLowerCase(), new URL(value, base).toString());
    } catch (error) {
      // A failed optional runtime must not leave its data/asset overrides active.
      rec.enabled = false; rec.error = String(error);
      for (const [target, previous] of [[this.services, priorServices], [this.rules, priorRules], [this.overlay, priorOverlay]] as const) {
        target.clear(); for (const [key, value] of previous) target.set(key, value);
      }
      throw error;
    }
    return rec;
  }
  async loadDataPatches(): Promise<Record<string, any>[]> { const out: Record<string, any>[] = []; for (const mod of this.mods.filter((m) => m.enabled)) for (const [key, value] of Object.entries(mod.data ?? {})) { if (typeof value === "object") out.push({ [key]: value }); else { try { const r = await fetch(new URL(value, mod.source)); if (r.ok) out.push({ [key]: await r.json() }); } catch (e) { console.warn("mod data load failed", mod.id, key, e); } } } return out; }
  async applyTo<T extends Record<string, any>>(base: T): Promise<T> {
    this.dataTarget = base;
    const patches = await this.loadDataPatches();
    if (!patches.length) { this.events.emit("data:ready", base); return base; }
    const runtime = (base as any).runtime; const cloneBase: any = { ...base }; delete cloneBase.runtime;
    const result: any = deepClone(cloneBase); result.runtime = runtime;
    for (const patch of patches) mergeInto(result, patch);
    this.events.emit("data:ready", result); return result as T;
  }
  resolveAsset(name: string, fallback?: string): string | undefined { return this.overlay.get(name.toLowerCase()) ?? fallback; }
  registerRule<T>(name: string, rule: T): T { this.rules.set(name, rule); return rule; }
  rule<T>(name: string, fallback: T): T { return (this.rules.get(name) as T | undefined) ?? fallback; }
  registerService<T>(name: string, service: T): T { this.services.set(name, service); return service; }
  service<T>(name: string, fallback?: T): T | undefined { return (this.services.get(name) as T | undefined) ?? fallback; }
  activeModList() { return this.mods.filter((m) => m.enabled).map(({ id, version }) => ({ id, version })); }
  has(id: string) { return this.mods.some((m) => m.id === id && m.enabled); }
  enable(id: string) { const m = this.mods.find((x) => x.id === id); if (!m) return false; m.enabled = true; this.persistDisabled(id, false); return true; }
  disable(id: string) { const m = this.mods.find((x) => x.id === id); if (!m) return false; m.enabled = false; this.persistDisabled(id, true); return true; }
  api(mod: ModRecord) { return {
    mod: { id: mod.id, version: mod.version },
    on: this.events.on.bind(this.events), emit: this.events.emit.bind(this.events), emitAsync: this.events.emitAsync.bind(this.events),
    registerRule: this.registerRule.bind(this), registerService: this.registerService.bind(this),
    resolveAsset: this.resolveAsset.bind(this), has: this.has.bind(this), enable: this.enable.bind(this), disable: this.disable.bind(this),
    getData: () => this.dataTarget, rules: this.rules, services: this.services
  }; }
  private disabledIds(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem("c2:disabledMods") || "[]")); } catch { return new Set(); } }
  private persistDisabled(id: string, disabled: boolean) { const ids = this.disabledIds(); disabled ? ids.add(id) : ids.delete(id); try { localStorage.setItem("c2:disabledMods", JSON.stringify([...ids])); } catch { /* storage may be unavailable */ } }
}
function dependencyIds(manifest: ModManifest): string[] { return Array.isArray(manifest.dependencies) ? manifest.dependencies : Object.keys(manifest.dependencies ?? {}); }
function deepClone<T>(v: T): T { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function mergeInto(target: any, patch: any): any { if (!patch || typeof patch !== "object") return patch; if (Array.isArray(patch)) return patch.slice(); for (const [k, v] of Object.entries(patch)) { if (k === "$replace") return deepClone(v); if (k === "$delete" && Array.isArray(v)) { for (const key of v) delete target[key as any]; continue; } if (k === "$append" && Array.isArray(v)) { if (Array.isArray(target)) target.push(...deepClone(v)); continue; } if (v && typeof v === "object" && !Array.isArray(v)) { if (!target[k] || typeof target[k] !== "object") target[k] = {}; const replaced = mergeInto(target[k], v); if (replaced !== undefined) target[k] = replaced; } else target[k] = deepClone(v); } return target; }
