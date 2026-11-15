export type Selection =
  | { kind: "string"; offset: number; length: number }
  | { kind: "container"; offset: number; length: number }
  | { kind: "byte"; offset: number; length: 1 };
