import type { DataStore } from "./DataStore";
// Web-only persistence feedback; original text IDs remain unchanged.
const messages = {
  autoSaved: {1: "Game autosaved", 18: "已自动存档", 19: "已自動存檔"},
  saveFailed: {1: "Save failed. Storage may be full or unavailable. Export a save file to keep your progress.", 18: "存档失败：存储空间可能已满或不可用。请导出存档文件以保留进度。", 19: "存檔失敗：儲存空間可能已滿或不可用。請匯出存檔檔案以保留進度。"},
};
export function webText(ds: DataStore, key: keyof typeof messages): string {
  const lang = ds.language === 30 ? 19 : ds.language;
  const row: Record<number, string> = messages[key];
  return row[lang] ?? row[1];
}
