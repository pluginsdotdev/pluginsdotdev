import * as tags from "./tags";

const containsUnicode = (str: string) => /[\u0080-\uFFFF]/.test(str);

const allowedTags = new Set(
  tags.html
    .concat(tags.svg)
    .concat(tags.svgFilters)
    .concat(tags.mathMl)
    // https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L525
    .concat(["tbody"])
);
const customForbiddenTags = [
  "script",
  "noscript",
  "embed",
  "noembed",
  "foreignobject",
  "iframe",
  "noframes",
  "plaintext",
  "frameset",
  "object",
  "style",
  "template",
  "title",
  "head",
  "annotation-xml",
];
const forbiddenTags = new Set(
  // https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L525
  ["title"].concat(customForbiddenTags)
);

/**
 * isValidElement determines whether the provided element is safe.
 *
 * Follow the pattern of
 * https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L646
 **/
export const isValidElement = (nodeType: string) => {
  if (containsUnicode(nodeType)) {
    return false;
  }

  const tagName = nodeType.toLowerCase();

  // since we never set inner html, we can skip the namespace confusion from
  // https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L673

  if (!allowedTags.has(tagName) || forbiddenTags.has(tagName)) {
    return false;
  }

  // since we disallow the elements, we can skip the noscript/noembed from
  // https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L707
  return "keep";
};
