import url from "url";

const defaultPorts: Record<string, number> = {
  "http:": 80,
  "https:": 443,
};

export const domainFromUrl = (urlString: string) => {
  const { protocol, host } = url.parse(urlString);
  const defaultPort = protocol ? defaultPorts[protocol] : null;
  const canonicalHost =
    defaultPort && host
      ? host.replace(new RegExp(`:${defaultPort}$`), "")
      : host;
  return `${protocol}//${canonicalHost}`;
};

export const resolveUrl = (base: string, urlString: string) =>
  url.resolve(base, urlString);
