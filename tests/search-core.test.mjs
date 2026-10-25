import test from "node:test";
import assert from "node:assert/strict";
import { createSearchEngine } from "../src/search-core.mjs";

const engine = createSearchEngine();
const classify = (query, data) => engine.classify({ title: "", tag: "", description: "", complete: true, ...data }, engine.parseTerms(query));

test("all core conditions must match; one popular word cannot pass", () => {
  const result = classify("塔菲 麦克风", { title: "赛睿软件麦克风降噪教程" });
  assert.equal(result.status, "weak");
  assert.deepEqual(result.missing, ["塔菲"]);
});

test("tags and description rescue relevant results without all words in the title", () => {
  const result = classify("JavaScript 闭包", { title: "什么是闭包？", tag: "前端,JavaScript" });
  assert.equal(result.status, "match");
  assert.deepEqual(result.hits[0].fields, ["tag"]);
  assert.equal(classify("塔菲 麦克风", { title: "塔菲的新设备", description: "本期测试话筒音质" }).status, "match");
});

test("HTML highlighting, full-width letters and capitalization are normalized", () => {
  assert.equal(classify("JavaScript 闭包", { title: 'ＪＡＶＡＳＣＲＩＰＴ 的 <em class="keyword">闭包</em>' }).status, "match");
});

test("aliases are OR within a condition, while separate conditions stay AND", () => {
  assert.equal(classify("GTNH 炼钢", { title: "格雷科技新视野制钢流程" }).status, "match");
  assert.equal(classify("Godot 背包/库存", { title: "Godot 库存系统" }).status, "match");
  assert.equal(classify("Godot 背包/库存", { title: "Unity 库存系统" }).status, "weak");
});

test("short aliases do not match unrelated English words", () => {
  assert.equal(classify("JavaScript", { title: "NodeJS runtime" }).status, "weak");
  assert.equal(classify("JavaScript", { title: "JS 闭包" }).status, "match");
});

test("explicit phrases stay literal and do not expand aliases", () => {
  assert.equal(classify('"JavaScript 闭包"', { title: "JavaScript 闭包指南" }).status, "match");
  assert.equal(classify('"JavaScript 闭包"', { title: "JS 闭包指南" }).status, "weak");
});

test("missing metadata is retained, while explicit ad flags remain identifiable", () => {
  assert.equal(classify("Godot 背包", { title: "无完整信息的标题", complete: false }).status, "unknown");
  assert.equal(classify("Godot 背包", { title: "Godot 背包", type: "video_ad_82" }).status, "ad");
  assert.equal(classify("Godot", { title: "Godot", type: "picture_ad_0" }).status, "ad");
  assert.equal(classify("Godot", { title: "Godot", isAd: true }).status, "ad");
});

test("automatic parsing separates mixed-language terms and optional query words", () => {
  const groups = engine.parseTerms("GTNH炼钢教程", true);
  assert.equal(engine.classify({ title: "格雷科技新视野制钢", complete: true }, groups).status, "match");
  assert.equal(engine.classify({ title: "其他游戏制钢", complete: true }, groups).status, "weak");
});

test("an empty query never folds ordinary content", () => {
  assert.equal(classify("", { title: "任意视频" }).status, "match");
});
