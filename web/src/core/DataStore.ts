// 数据层运行时：加载资源清单与转换后的 JSON 数据
// 语言索引与 AS3 一致（Texts.language：1=English, 18=简体中文, 19=繁体中文）
import type { ModRuntime } from "./ModRuntime";

export interface DataStore {
  manifest: { images: Record<string, string[]>; sounds: Record<string, string[]>; fonts: Record<string, string[]> };
  texts: Record<string, string[]>;
  dialogues: { characterNames: Record<string, string>; entries: Record<string, any>; responses: Record<string, any> };
  presets: Record<string, any>;
  namePhonetics: Record<string, any>;
  mainStory: Record<string, any>;
  gamedata: Record<string, any>;
  items: Record<string, any>;
  weapons: Record<string, any>;
  industries: Record<string, any>;
  transports: Record<string, any>;
  obstacles: Record<string, any>;
  battleDoll?: any;
  language: number;
  runtime?: ModRuntime;
}

export async function loadDataStore(language = 1, runtime?: ModRuntime): Promise<DataStore> {
  const [manifest, textsWrap, dialogues, presets, namePhonetics, mainStory, gamedata, items, weapons, industries, transports, obstacles, battleDoll] = await Promise.all([
    fetchJson("assets/manifest.json"),
    fetchJson("data/texts.json"),
    fetchJson("data/dialogues.json"),
    fetchJson("data/presets.json"),
    fetchJson("data/namePhonetics.json"),
    fetchJson("data/mainStory.json"),
    fetchJson("data/gamedata.json"),
    fetchJson("data/items.json"),
    fetchJson("data/weapons.json"),
    fetchJson("data/industries.json"),
    fetchJson("data/transports.json"),
    fetchJson("data/obstacles.json"),
    fetchJson("data/battle_doll.json"),
  ]);
  const base: DataStore = { manifest, texts: textsWrap._texts, dialogues, presets, namePhonetics, mainStory, gamedata, items, weapons, industries, transports, obstacles, battleDoll, language, runtime };
  return runtime ? await runtime.applyTo(base) : base;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " -> " + res.status);
  return res.json();
}

// 文本查询（对齐 AS3 Texts.fetch：_texts[id][language]，空则回退语言映射表再退英文列）
// gender：1=男 / 2=女，用于解析文本内嵌的 <男/女> 性别变体标签（原版 Texts.fetch 第 2 参）
// 返回前把 @nl@ 换成换行（原版 Texts.fetch 尾部处理）
export function getText(ds: DataStore, id: number | string, language?: number, gender = 1): string {
  const lang = language ?? ds.language;
  const arr = ds.texts[String(id)];
  if (!arr) return "";
  let v = arr[lang];
  if (!(v && v.length > 0)) {
    // 原版 Texts.fetch 的语言回退映射（18↔19 简繁互备、30→19、32↔15、42/43→3、3↔4、6↔7）
    const fallback: Record<number, number> = { 3: 4, 4: 3, 6: 7, 7: 6, 15: 32, 18: 19, 19: 18, 30: 19, 32: 15, 42: 3, 43: 3 };
    const alt = fallback[lang];
    v = (alt !== undefined && arr[alt] && arr[alt].length > 0) ? arr[alt] : (arr[1] ?? "");
  }
  // 性别变体标签 <男/女>（含英文 <young man/young lady>）：gender==2 取后半
  v = v.replace(/<([^<>/]*)\/([^<>]*)>/g, (_m, a: string, b: string) => (gender === 2 && b.length > 0 ? b : a));
  // @nl@ → 换行
  v = v.replace(/@nl@/g, "\n");
  return v;
}

// 用语言名（如 "zh"）取语言索引
export function languageIndex(name: string): number | null {
  const map: Record<string, number> = { en: 1, zh: 18, zhHans: 18, zhHant: 19, ko: 20, ja: 30, es: 3, de: 8, ru: 14, fr: 5 };
  return map[name] ?? null;
}
