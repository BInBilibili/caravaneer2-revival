#!/usr/bin/env node
// ============================================================================
// gen_lzma_sol.mjs — 生成 LZMA(0x0200) 压缩的 .sol 测试夹具
// 用法：cd web && node scripts/gen_lzma_sol.mjs
// 依赖：java（1.8+）+ tools/ffdec/lib/LZMA.jar（官方 LZMA SDK Java 移植，含 Encoder）。
//       环境无网络，因此用 SDK 编码器产出参照流；浏览器端 SolImporter 的 TS 解码器与之对照。
// 输入：web/public/test_original_save.sol（gen_test_sol.cjs 生成，TCSO 0x0000）
// 产出：web/public/test_lzma_save.sol（TCSO 头 format=0x0200 + LZMA-alone body）
// 原理：直接从 test_original_save.sol 取出 AMF0 body（含其内嵌 timestamp）做 LZMA 压缩，
//       因此两个夹具的 body 解压后必然逐字节相等 —— roundtrip_test T6 据此做字节级往返校验。
// ============================================================================
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url)); // web/scripts
const webRoot = resolve(here, "..");
const refPath = join(webRoot, "public", "test_original_save.sol");
const outPath = join(webRoot, "public", "test_lzma_save.sol");
const lzmaJar = resolve(here, "..", "..", "tools", "ffdec", "lib", "LZMA.jar");

if (!existsSync(lzmaJar)) { console.error("FATAL: 找不到 " + lzmaJar + "（FFDec LZMA SDK jar）"); process.exit(1); }
if (!existsSync(refPath)) {
  console.error("FATAL: 找不到 " + refPath + "。请先运行 gen_test_sol.cjs 生成基准夹具（本脚本从中提取 body 压缩）。");
  process.exit(1);
}

// ---------- 从 test_original_save.sol 提取 AMF0 body ----------
const ref = readFileSync(refPath);
if (ref.toString("ascii", 0, 4) !== "TCSO") { console.error("FATAL: " + refPath + " 不是 TCSO 文件"); process.exit(1); }
const refFormat = ref.readUInt16BE(4);
if (refFormat !== 0x0000) { console.error("FATAL: 基准夹具应为未压缩(0x0000)，实际 0x" + refFormat.toString(16)); process.exit(1); }
const nameLen = ref.readUInt16BE(11);
const bodyOff = 13 + nameLen;
const bodyLen = ref.readUInt32BE(bodyOff);
const body = ref.subarray(bodyOff + 4, bodyOff + 4 + bodyLen);
console.log("AMF0 body（来自 test_original_save.sol）:", body.length, "bytes");

// ---------- Java LZMA 编码（LZMA-alone：5 字节属性 + 8 字节 LE 长度 + 流） ----------
const tmp = mkdtempSync(join(tmpdir(), "c2lzma-"));
const inPath = join(tmp, "body.bin");
const lzPath = join(tmp, "body.lzma");
writeFileSync(inPath, body);
let javaOut = "";
try {
  javaOut = execFileSync("java", ["-cp", lzmaJar, "SevenZip.LzmaAlone", "e", inPath, lzPath], { stdio: "pipe" }).toString();
} catch (e) {
  console.error("FATAL: java LZMA 编码失败:", String(e.stdout || "") + String(e.stderr || "") + String(e.message || ""));
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
const lz = readFileSync(lzPath);
rmSync(tmp, { recursive: true, force: true });
if (lz.length < 14) { console.error("FATAL: LZMA 输出异常（" + lz.length + " 字节）"); process.exit(1); }
const declen = lz.readBigUInt64LE(5);
if (declen !== BigInt(body.length)) { console.error("FATAL: LZMA 声明的未压缩长度 " + declen + " ≠ " + body.length); process.exit(1); }
console.log("LZMA-alone:", lz.length, "bytes（属性 0x" + lz[0].toString(16).padStart(2, "0") +
  "，未压缩 " + declen + "，压缩率 " + (lz.length / body.length).toFixed(3) + "×）");

// ---------- 包装 TCSO 头（format=0x0200） ----------
const name = "savedData";
const nameBuf = Buffer.from(name, "utf16le");
const nameBE = Buffer.alloc(nameBuf.length);
for (let i = 0; i < nameBuf.length; i += 2) { nameBE[i] = nameBuf[i + 1]; nameBE[i + 1] = nameBuf[i]; }
const head = Buffer.alloc(13);
head.write("TCSO", 0, "ascii");
head.writeUInt16BE(0x0200, 4); // LZMA 压缩标志
head[6] = 0;                   // AMF0
head.writeUInt16BE(nameBE.length, 11);
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32BE(lz.length, 0);
const file = Buffer.concat([head, nameBE, lenBuf, lz]);
writeFileSync(outPath, file);
console.log("written", outPath, "→", file.length, "bytes");
const jl = javaOut.split("\n").filter((l) => l.trim()).slice(0, 3);
if (jl.length) console.log(jl.join("\n"));
