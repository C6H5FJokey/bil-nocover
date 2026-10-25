// Keep the factory self-contained: the builder shares it with both entry points.
export function createSearchEngine() {
  const aliases = [
    ["javascript", "js"], ["typescript", "ts"],
    ["gtnh", "格雷科技新视野", "gregtech new horizons"],
    ["炼钢", "制钢"], ["麦克风", "话筒"], ["存档", "存读档", "save load"],
  ];
  const optionalWords = new Set(["的", "了", "吗", "呢", "怎么", "如何", "什么", "一个", "教程", "视频"]);

  function normalize(value) {
    return String(value ?? "").replace(/<[^>]*>/g, " ")
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, " ")
      .normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }

  function alternatives(term) {
    const normalized = normalize(term);
    const group = aliases.find(items => items.includes(normalized));
    return group ? [...group] : [normalized];
  }

  function parseTerms(text, automatic = false) {
    let chunks = String(text ?? "").match(/"[^"]+"|“[^”]+”|[^\s]+/g) ?? [];
    if (automatic) {
      chunks = chunks.flatMap(chunk => {
        if (/^["“]/.test(chunk) || chunk.includes("/")) return [chunk];
        const mixed = chunk.replace(/([a-z0-9])([\u3400-\u9fff])/gi, "$1 $2")
          .replace(/([\u3400-\u9fff])([a-z0-9])/gi, "$1 $2").split(/\s+/);
        return mixed.flatMap(part => {
          if (!/^[\u3400-\u9fff]{4,}$/.test(part) || typeof Intl.Segmenter !== "function") return [part];
          const words = [...new Intl.Segmenter("zh", { granularity: "word" }).segment(part)]
            .filter(item => item.isWordLike).map(item => item.segment);
          const combined = [];
          let singles = "";
          for (const word of words) {
            if (word.length === 1) singles += word;
            else { if (singles) combined.push(singles); singles = ""; combined.push(word); }
          }
          if (singles) combined.push(singles);
          return combined.length ? combined : [part];
        });
      });
      const essential = chunks.filter(chunk => !optionalWords.has(normalize(chunk)));
      if (essential.length) chunks = essential;
    }
    const groups = chunks.map(chunk => {
      const literal = /^["“]/.test(chunk);
      const label = chunk.replace(/^["“]|["”]$/g, "");
      const terms = literal ? [normalize(label)] : label.split("/").flatMap(alternatives);
      return { label, terms: [...new Set(terms.filter(Boolean))], literal };
    }).filter(group => group.terms.length);
    return groups.filter((group, index) => groups.findIndex(other => other.terms.join("|") === group.terms.join("|")) === index);
  }

  function contains(text, term) {
    if (!/^[a-z0-9][a-z0-9 .+#-]*$/i.test(term)) return text.includes(term);
    // Short aliases such as JS must not match unrelated English words.
    let position = -1;
    while ((position = text.indexOf(term, position + 1)) !== -1) {
      const before = text[position - 1] ?? "";
      const after = text[position + term.length] ?? "";
      if (!/[a-z0-9_]/i.test(before) && !/[a-z0-9_]/i.test(after)) return true;
    }
    return false;
  }

  function classify(item, groups) {
    if (item.isAd === true || /^(?:video|picture|brand)_ad(?:_|$)/.test(item.type ?? "")) {
      return { status: "ad", missing: [], hits: [] };
    }
    const fields = { title: normalize(item.title), tag: normalize(item.tag), description: normalize(item.description) };
    const hits = groups.map(group => ({
      term: group.label,
      fields: Object.entries(fields).filter(([, text]) => group.terms.some(term => contains(text, term))).map(([name]) => name),
    }));
    const missing = hits.filter(hit => !hit.fields.length).map(hit => hit.term);
    if (!groups.length || !missing.length) return { status: "match", missing, hits };
    return { status: item.complete === true ? "weak" : "unknown", missing, hits };
  }

  return { normalize, parseTerms, classify };
}
