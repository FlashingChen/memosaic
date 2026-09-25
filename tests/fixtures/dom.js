// Tiny dependency-free DOM reader for the HTML fixtures in this directory.
// It implements only the selector forms used by the provider adapters:
// "tag", ".class", "[attr*='value']", and descendant combinations.
// Text extraction is a deterministic stand-in for element.innerText: element
// boundaries are newlines, matching how a browser renders these blocks.

export function parseHtml(html) {
  const source = html.replace(/<!--[\s\S]*?-->/g, "");
  const root = { tagName: "#root", className: "", attributes: {}, children: [], parent: null };
  const stack = [root];
  const tagPattern = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  let cursor = 0;
  let match;

  while ((match = tagPattern.exec(source))) {
    const [, closing, rawTag, rawAttributes] = match;
    const tag = rawTag.toLowerCase();
    if (tag === "!doctype") continue;

    const text = source.slice(cursor, match.index);
    if (text.trim()) stack.at(-1).children.push({ tagName: "#text", text, children: [] });
    cursor = tagPattern.lastIndex;

    if (closing) {
      while (stack.length > 1 && stack.at(-1).tagName !== tag) stack.pop();
      if (stack.length > 1) stack.pop();
      continue;
    }

    const parent = stack.at(-1);
    const element = {
      tagName: tag,
      className: (rawAttributes.match(/class\s*=\s*"([^"]*)"/) || [, ""])[1],
      attributes: Object.fromEntries(
        [...rawAttributes.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map(([, key, value]) => [key, value])
      ),
      children: [],
      parent
    };
    parent.children.push(element);
    if (!match[4] && !["br", "img", "input", "mat-icon"].includes(tag)) stack.push(element);
  }

  const tail = source.slice(cursor);
  if (tail.trim()) stack.at(-1).children.push({ tagName: "#text", text: tail, children: [] });
  return root;
}

function collectText(node, out = []) {
  if (node.tagName === "#text") {
    out.push(node.text);
    return out;
  }
  for (const child of node.children) {
    collectText(child, out);
    out.push("\n");
  }
  return out;
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function elementText(node) {
  return decodeEntities(collectText(node).join(""))
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function containerText(html) {
  return elementText(parseHtml(html));
}

function matches(node, selector) {
  const attribute = selector.match(/^\[([\w-]+)([*^$]?)=(?:'([^']*)'|"([^"]*)")\]$/);
  if (attribute) {
    const [, name, operator, single, double] = attribute;
    const expected = single ?? double ?? "";
    const actual = node.attributes?.[name];
    if (actual === undefined) return false;
    if (operator === "*") return actual.includes(expected);
    if (operator === "^") return actual.startsWith(expected);
    if (operator === "$") return actual.endsWith(expected);
    return actual === expected;
  }
  if (selector.startsWith(".")) {
    return ` ${node.className || ""} `.includes(` ${selector.slice(1)} `);
  }
  return node.tagName === selector.toLowerCase();
}

export function querySelectorAll(root, selector) {
  const parts = selector.trim().split(/\s+/);
  let scope = [root];

  for (const part of parts) {
    const next = [];
    for (const candidate of scope) {
      const walk = (node) => {
        for (const child of node.children || []) {
          if (child.tagName === "#text") continue;
          if (matches(child, part)) next.push(child);
          walk(child);
        }
      };
      walk(candidate);
    }
    scope = next;
  }

  return scope;
}

export function extractBodyText(html, adapter) {
  const root = parseHtml(html);

  for (const selector of adapter.responseTextSelectors || []) {
    for (const nested of querySelectorAll(root, selector)) {
      const text = elementText(nested);
      if (text) return text;
    }
  }

  return elementText(root);
}
