// from https://github.com/cure53/DOMPurify/blob/main/src/regexp.js
export const isValidDataAttr = (prop: string) =>
  /^data-[\-\w.\u00B7-\uFFFF]/i.test(prop);
export const isValidAriaAttr = (prop: string) => /^aria-[\-\w]+$/i.test(prop);
export const fixWhitespace = (value: string, replacement?: string) =>
  value.replace(
    /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g,
    replacement ?? ""
  );
export const isAllowedUri = (value: string) =>
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i.test(
    fixWhitespace(value)
  );
export const isScriptOrData = (value: string) =>
  /^(?:\w+script|data):/i.test(fixWhitespace(value));
