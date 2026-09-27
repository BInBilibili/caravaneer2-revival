// 资源库：manifest 名称→文件 映射 + 图片缓存 + 字体加载
import type { DataStore } from "./DataStore";

export class AssetStore {
  private images = new Map<string, HTMLImageElement>();
  private loading = new Map<string, Promise<HTMLImageElement>>();
  fontsReady = false;

  constructor(private ds: DataStore) {}

  /**
   * 使用系统字体，不再下载或注册 Flash 提取字体。
   * 保留异步初始化接口，供启动流程等待浏览器字体就绪。
   */
  async loadFonts(): Promise<void> {
    this.fontsReady = true;
    await document.fonts.ready;
  }

  // 按 AS3 资源名取图（如 "TitleScreen.jpg" / "TownBG.jpg"）
  /** Resolved source identity without loading, including mod overrides. */
  getImageSource(name: string): string | undefined {
    return this.ds.runtime?.resolveAsset(name, this.ds.manifest.images[name]?.[0]) ?? this.ds.manifest.images[name]?.[0];
  }

  getImage(name: string): HTMLImageElement | null {
    const hit = this.images.get(name);
    if (hit) return hit;
    const key = Object.keys(this.ds.manifest.images).find(
      (k) => k.toLowerCase() === name.toLowerCase()
    );
    if (!key) {
      const url = this.ds.runtime?.resolveAsset(name);
      if (!url) return null;
      return this.loadUrl(name, url);
    }
    return this.loadByName(key);
  }

  private loadUrl(key: string, url: string): HTMLImageElement | null {
    const cached = this.images.get(key); if (cached) return cached;
    const pending = this.loading.get(key); if (pending) return null;
    const p = new Promise<HTMLImageElement>((res, rej) => { const img = new Image(); img.onload = () => { this.images.set(key, img); res(img); }; img.onerror = () => rej(new Error("图像加载失败: " + url)); img.src = url; });
    this.loading.set(key, p); p.then(() => this.loading.delete(key)).catch(() => this.loading.delete(key)); return null;
  }

  private loadByName(key: string): HTMLImageElement | null {
    const cached = this.images.get(key);
    if (cached) return cached;
    const pending = this.loading.get(key);
    if (pending) return null; // 异步进行中，调用方重试
    const url = this.ds.runtime?.resolveAsset(key, this.ds.manifest.images[key][0]) ?? this.ds.manifest.images[key][0];
    const p = new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => { this.images.set(key, img); res(img); };
      img.onerror = () => rej(new Error("图片加载失败: " + url));
        img.src = url;
    });
    this.loading.set(key, p);
    p.then(() => this.loading.delete(key)).catch(() => this.loading.delete(key));
    return null;
  }

  async ensure(name: string): Promise<HTMLImageElement | null> {
    const img = this.getImage(name);
    if (img) return img;
    const key = Object.keys(this.ds.manifest.images).find(
      (k) => k.toLowerCase() === name.toLowerCase()
    );
    if (!key) {
      const url = this.ds.runtime?.resolveAsset(name);
      return url ? await this.loadUrlAsync(name, url) : null;
    }
    const p = this.loading.get(key) ?? (() => {
      const img = new Image();
      const prom = new Promise<HTMLImageElement>((res, rej) => {
        img.onload = () => { this.images.set(key, img); res(img); };
        img.onerror = () => rej(new Error("图片加载失败: " + name));
        img.src = this.ds.runtime?.resolveAsset(key, this.ds.manifest.images[key][0]) ?? this.ds.manifest.images[key][0];
      });
      this.loading.set(key, prom);
      return prom;
    })();
    try { return await p; } catch { return null; }
  }

  private async loadUrlAsync(key: string, url: string): Promise<HTMLImageElement | null> {
    const hit = this.images.get(key); if (hit) return hit;
    const existing = this.loading.get(key); if (existing) { try { return await existing; } catch { return null; } }
    const p = new Promise<HTMLImageElement>((res, rej) => { const img = new Image(); img.onload = () => { this.images.set(key, img); res(img); }; img.onerror = () => rej(new Error("图像加载失败: " + url)); img.src = url; });
    this.loading.set(key, p); try { return await p; } catch { return null; } finally { this.loading.delete(key); }
  }
}
