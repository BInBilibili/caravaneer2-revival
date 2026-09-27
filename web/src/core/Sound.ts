// 音效系统：SFXClick 等，音量开关跟随 GameData 配置
// 背景音乐：模式驱动（原版 GameData.setMode m==1 才有地图音乐 + MapMode musicFadeIn/Out 淡入淡出：
// openDialogue 开头 musicFadeOut=true；closeDialogue 且 mode==1 && gameSpeed>0 → musicFadeIn。
// 语义：setMusicMode("map") 播放 / "paused" 暂停（进镇/战斗/对话/菜单期间）；updateMusic 逐帧线性淡入淡出；
// document visibilitychange（切后台隐藏暂停、回到前台且地图模式恢复）。
let ready = false;
let soundFXOn = true;
export function setSoundFX(v: boolean) { soundFXOn = v; }
export function isSoundFXOn() { return soundFXOn; }
let musicOn = true;
let musicEl: HTMLAudioElement | null = null;
let musicPath = "";
export const MUSIC_VOLUME = 0.6; // MapMode.as: original music cap.
export type MusicMode = "map" | "paused";
let musicMode: MusicMode = "paused";
let playPending = false;
let playBlocked = false;
let playError = "";
function playMusic() {
  if (!musicEl || !musicOn || musicMode !== "map" || document.hidden || !musicEl.paused || playPending || playBlocked) return;
  const el = musicEl;
  playPending = true;
  void el.play().then(() => { playError = ""; }, (err: DOMException) => {
    if (musicEl !== el) return;
    playError = err?.message ?? String(err);
    // Retry policy failures on the next user gesture, not sixty pending play() calls/sec.
    playBlocked = err?.name === "NotAllowedError" || err?.name === "NotSupportedError";
  }).finally(() => { if (musicEl === el) playPending = false; });
}
export function setMusicOn(v: boolean) {
  musicOn = v;
  if (!v) musicEl?.pause();
  else { playBlocked = false; playMusic(); }
}
export function isMusicOn() { return musicOn; }
export function registerMusic(path: string) {
  if (!path || (musicEl && path === musicPath)) return;
  musicEl?.pause();
  musicPath = path;
  musicEl = new Audio(path);
  musicEl.loop = true;
  musicEl.volume = 0;
  playPending = playBlocked = false;
  playError = "";
  initMusicAutoPause();
}
export function startMusic() { playMusic(); }
export function stopMusic() { musicMode = "paused"; musicEl?.pause(); }
export function musicReady() { return !!musicEl; }
export function setMusicMode(m: MusicMode) { musicMode = m; }
export function isMapMusicMode() { return musicMode === "map"; }
export function musicStatus() {
  return { ready: !!musicEl, mode: musicMode, enabled: musicOn, paused: musicEl?.paused ?? true,
    volume: musicEl?.volume ?? 0, currentTime: musicEl?.currentTime ?? 0, error: playError };
}
/** Original +.01/-.02 per 25fps frame; zero volume pauses without rewinding. */
export function updateMusic(dt: number) {
  if (!musicEl || document.hidden) return;
  const target = musicMode === "map" && musicOn ? MUSIC_VOLUME : 0;
  const cur = musicEl.volume, step = (target > cur ? .25 : .5) * Math.max(0, dt);
  musicEl.volume = target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step);
  if (target > 0) playMusic();
  else if (musicEl.volume === 0) musicEl.pause();
}
let autoPauseInit = false;
export function initMusicAutoPause() {
  if (autoPauseInit || typeof document === "undefined") return;
  autoPauseInit = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) musicEl?.pause();
    else playMusic();
  });
  const unlock = () => { playBlocked = false; playMusic(); };
  document.addEventListener("pointerdown", unlock, { capture: true });
  document.addEventListener("keydown", unlock, { capture: true });
}

// ---- t5 修复：音效懒加载（不再预建 300+ Audio 元素） ----
// 背景：initSounds 对 manifest 全部 100+ 音效 × 每音效 3 元素 = 300+ new Audio()+load()
// 同时启动，浏览器并发拉取队列饱和 → 元素就绪极慢 → playSound 对未就绪元素调用 play()
// 返回 pending Promise，全部点击音效等到 10+ 秒后一起触发。
// 修复：只记录路径（initSounds 零开销）；首次 play 才建元素并立即 play()（尽力即时出声），
// 同时在后台预载 2 个备用元素入池，后续点击轮换复用。
const soundPaths = new Map<string, string>();
const playPool = new Map<string, HTMLAudioElement[]>();
const POOL_SPARES = 2; // 每音效首元素即时播放，另后台预载 2 个备用轮换
const VOL = 0.6;

function mkAudio(path: string): HTMLAudioElement {
  const a = new Audio(path);
  a.preload = "auto";
  a.volume = VOL;
  return a;
}

function isReady(a: HTMLAudioElement): boolean {
  // readyState: 0=HAVE_NOTHING 1=HAVE_METADATA 2=HAVE_CURRENT_DATA 3=HAVE_FUTURE_DATA 4=HAVE_ENOUGH_DATA
  return a.readyState >= 3;
}

export function initSounds(manifest: { sounds: Record<string, string[]> }, resolve?: (name: string, fallback?: string) => string | undefined) {
  if (ready) return;
  ready = true;
  for (const [k, paths] of Object.entries(manifest.sounds)) {
    const p = paths && paths.length ? paths[0] : "";
    if (!p) continue;
    soundPaths.set(k, resolve?.(k, p) ?? p);
    // 不再预建元素；首次 playSound 时才按需创建（懒加载）
  }
}

/** 后台预载该音效的备用元素（补齐到 total 个），供后续点击轮换复用 */
function ensurePool(name: string, total = POOL_SPARES + 1) {
  let arr = playPool.get(name);
  if (!arr) { arr = []; playPool.set(name, arr); }
  const path = soundPaths.get(name);
  if (!path) return;
  while (arr.length < total) {
    const a = mkAudio(path);
    // 预载：load() 启动拉取+解码，但不调用 play()（避免无点击也出声）
    a.load();
    arr.push(a);
  }
}

let poolIdx = 0;
export function playSound(name: string, volume = VOL) {
  if (!soundFXOn) return;
  const path = soundPaths.get(name);
  if (!path) return;
  try {
    const arr = playPool.get(name);
    // 1) 池里已有就绪元素（readyState>=3）→ 轮换复用，即时出声
    if (arr && arr.some(isReady)) {
      const ready = arr.filter(isReady);
      const a = ready[poolIdx % ready.length];
      poolIdx++;
      a.currentTime = 0;
      a.volume = Math.max(0, Math.min(1, volume));
      a.play().catch(() => {});
      if (arr.length < POOL_SPARES + 1) ensurePool(name); // 补足备用数
      return;
    }
    // 2) 无就绪元素（首播或池仍在加载）：新建元素立即 play()（每击即时，
    //    不等 load 完成，浏览器尽力解码出声），避免对未就绪元素排队 play
    const a = mkAudio(path);
    a.currentTime = 0;
    a.volume = Math.max(0, Math.min(1, volume));
    a.play().catch(() => {});
    if (arr) {
      arr.push(a);
      // 池封顶（首元素 + 备用数），防止连点期间无限增长
      if (arr.length > POOL_SPARES + 1) arr.splice(0, arr.length - (POOL_SPARES + 1));
    } else {
      playPool.set(name, [a]);
    }
    ensurePool(name);
  } catch { /* noop */ }
}

/** 调试钩子（验证探针用）：返回各音效池元素数、就绪状态与播放进度 */
export function __c2SoundStats() {
  const out: Record<string, { path: string; count: number; ready: number; playing: number; states: number[]; times: number[] }> = {};
  for (const [k, arr] of playPool) {
    out[k] = {
      path: soundPaths.get(k) ?? "",
      count: arr.length,
      ready: arr.filter(isReady).length,
      playing: arr.filter((a) => !a.paused).length,
      states: arr.map((a) => a.readyState),
      times: arr.map((a) => a.currentTime),
    };
  }
  return out;
}
// 暴露给 window 供验证探针读取（构建产物为单文件，无法 import 模块内部）
if (typeof globalThis !== "undefined") (globalThis as any).__c2SoundStats = __c2SoundStats;

export function sfxMetallicClick() { playSound("SFXMetallicClick.mp3"); }
export function sfxPage() { playSound("SFXPage.mp3"); }
export function sfxClick() { playSound("SFXClick.mp3"); }
// 原版 MapMode.as：底部速度按钮/OPTIONS/键盘变速 = SFXTapeButton（L402/410/423/436/449）；
// 顶部三个开关（mouseStatus 30/31/32）= SFXSlideButton（L477/486/496，mUp 时播放）
export function sfxTapeButton() { playSound("SFXTapeButton.mp3"); }
export function sfxSlideButton() { playSound("SFXSlideButton.mp3"); }

// 原版 Switch.as pressed() L190：new SFXSwitch().play()——开关切换用独立音效（不是 SFXClick）
export function sfxSwitch() { playSound("SFXSwitch.mp3"); }

// 原版 SFXCashRegister（TradeWindow.finishBarter 成交音效）
export function sfxCashRegister() { playSound("SFXCashRegister.mp3"); }
