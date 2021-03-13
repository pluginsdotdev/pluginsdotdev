export const memoized = <T>(
  promiseProducer: () => Promise<T>
): (() => Promise<T>) => {
  let cachedPromise: Promise<T> | null = null;

  return () => {
    if (cachedPromise) {
      return cachedPromise;
    }

    cachedPromise = promiseProducer();
    return cachedPromise;
  };
};
