export type ExpandUnion<T> = T extends infer U ? U : never;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
