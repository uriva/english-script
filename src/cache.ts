import { dirname } from "https://deno.land/std@0.179.0/path/mod.ts";

const writeStringToFile = (filePath: string) => (s: string) =>
  Deno.mkdir(dirname(filePath), { recursive: true }).then(() =>
    Deno.writeTextFile(filePath, s),
  );

const pathToCache = (name: string) => `.cache/${name}.json`;

export type JSONValue =
  | string
  | number
  | boolean
  | { [x: string]: JSONValue }
  | Array<JSONValue>;

const serialize = (x: Record<string, JSONValue>) =>
  JSON.stringify(Object.entries(x));

const readFileWithDefault = <T>(defaultF: () => T, filePath: string) =>
  Deno.readTextFile(filePath).catch(defaultF);

const deserialize = (str: string) =>
  Object.fromEntries(
    JSON.parse(str).map(([k, v]: [string, JSONValue]) => [k, v]),
  );

type Options<X, Y> = {
  key: (x: X) => string;
  name: string;
  f: (x: X) => Promise<Y>;
};

export const cache = <X, Y>({
  key,
  name,
  f,
}: Options<X, Y>): Promise<(x: X) => Promise<Y>> =>
  readFileWithDefault(() => serialize({}), pathToCache(name))
    .then((x) => x.toString())
    .then(deserialize)
    .then((cache) => ({
      cache,
      write: writeStringToFile(pathToCache(name)),
    }))
    .then(({ cache, write }) => (x: X) => {
      const keyResult = key(x);
      if (keyResult in cache) return Promise.resolve(cache[keyResult]);
      const result = f(x);
      if (result instanceof Promise) {
        return result.then((x) => {
          cache[keyResult] = x;
          return write(serialize(cache)).then(() => x);
        });
      }
      cache[keyResult] = result;
      return write(serialize(cache)).then(() => result);
    });
