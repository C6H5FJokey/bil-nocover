import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { Script } from "node:vm";

const dist = new URL("../dist/", import.meta.url);
const read = (name) => readFile(new URL(name, dist), "utf8");

test("extension declares local CSS at document_start with only Bilibili access", async () => {
  const manifest = JSON.parse(await read("edge/manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "declarativeNetRequestWithHostAccess"]);
  assert.deepEqual(manifest.host_permissions, ["*://search.bilibili.com/*", "*://api.bilibili.com/*"]);
  await access(new URL(`edge/${manifest.background.service_worker}`, dist));
  for (const entry of manifest.content_scripts) {
    assert.equal(entry.run_at, "document_start");
    assert.ok(entry.css?.length || entry.world === "MAIN");
    assert.ok(entry.matches.every((pattern) => /^\*:\/\/(\*|t|search)\.bilibili\.com\/\*$/.test(pattern)));
    for (const file of [...(entry.css ?? []), ...(entry.js ?? [])]) {
      await access(new URL(`edge/${file}`, dist));
    }
  }
  assert.ok((await read("edge/common.css")).includes("::placeholder"));
});

test("userscript requests early execution and has no remote dependencies", async () => {
  const script = await read("userscript/bili-nocover.user.js");
  assert.match(script, /@run-at\s+document-start/);
  assert.doesNotMatch(script, /@require\s|@connect\s/);
});

test("both generated JavaScript entry points parse without a module loader", async () => {
  new Script(await read("edge/content.js"));
  new Script(await read("edge/search-filter.js"));
  new Script(await read("edge/search-bridge.js"));
  new Script(await read("edge/popup.js"));
  new Script(await read("userscript/bili-nocover.user.js"));
});
