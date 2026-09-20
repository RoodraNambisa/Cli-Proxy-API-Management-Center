export const normalizeRoutingCredentials = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

export const validRoutingCredential = (value: string) =>
  new TextEncoder().encode(value).length <= 512 && !/\p{Cc}/u.test(value);
