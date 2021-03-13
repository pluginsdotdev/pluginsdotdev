import u from "url";

export const urlAllowed = (
  allowedDomains: Array<string>,
  url: string
): boolean => {
  const { hostname } = u.parse(url);
  if (!hostname) {
    // you can hit your own host
    return true;
  }

  return allowedDomains.some(
    (domain) =>
      hostname === domain ||
      (domain.indexOf("*") === 0 && hostname.endsWith(domain.slice(1)))
  );
};
