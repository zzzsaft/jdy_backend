export interface ILimitOpion {
  name: string;
  duration: number;
  limit: number;
}
export interface IRequestOptions {
  version?: string;
  method: "GET" | "POST";
  path: string;
  query?: any;
  payload?: any;
}
