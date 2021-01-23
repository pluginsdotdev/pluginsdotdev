import url from "url";

/**
 * safeId generates an id that is safe for use by a plugin as a
 * name or id attribute.
 **/
export const safeId = (id: string) => {
  // TODO: move to a shared module to match plugin-point
  const { query } = url.parse("" + window.location, true);
  if (!query || !query.idPrefix) {
    throw new Error("No id prefix provided");
  }
  const { idPrefix } = query;
  if (typeof idPrefix !== "string") {
    throw new Error("Invalid idPrefix provided");
  }
  if (!/^[a-z0-9_]+$/i.test(idPrefix)) {
    throw new Error("Invalid id prefix provided");
  }
  return `${query.idPrefix}${id}`;
};
