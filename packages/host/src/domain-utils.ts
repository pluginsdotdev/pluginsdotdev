import url from "url";

export const domainFromUrl = (urlString: string) => {
  const { protocol, host } = url.parse(urlString);
  return `${protocol}//${host}`;
};
