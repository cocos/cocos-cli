export type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;
