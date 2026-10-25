/** No input.value writes, focus changes, page-world code, or network access. */
export function startPlaceholderCleaner(doc, selectors) {
  const inputSelector = `:is(${selectors.join(",")})`;

  function clean(element) {
    if (element.matches(inputSelector) && element.hasAttribute("placeholder")) {
      element.removeAttribute("placeholder");
    }
  }

  function scan(root) {
    if (root.nodeType === 1) clean(root);
    for (const input of root.querySelectorAll(inputSelector)) clean(input);
  }

  // Observe Document, which exists at document_start even without <html>.
  // Process only inserted subtrees and changed placeholders, not the whole page
  // on every mutation. CSS handles dynamically reclassified inputs immediately.
  const observer = new doc.defaultView.MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        clean(mutation.target);
      } else {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) scan(node);
        }
      }
    }
  });
  observer.observe(doc, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["placeholder"],
  });
  scan(doc);
  return observer;
}
