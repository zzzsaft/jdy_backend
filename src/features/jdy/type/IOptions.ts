export interface IAppList {
  skip?: number;
  limit?: number;
}

export interface IEntryList {
  skip?: number;
  limit?: number;
}

export interface IDataCreateOption {
  is_start_workflow?: boolean;
  is_start_trigger?: boolean;
  transaction_id?: string;
  data_creator?: string;
}

export interface IDatasCreateOption {
  is_start_workflow?: boolean;
  data_creator?: string;
  transaction_id?: string;
}
export interface IDataUpdateOption {
  is_start_trigger?: boolean;
  transaction_id?: string;
}

export interface IDataQueryOption {
  data_id?: string;
  fields?: string[];
  filter?: Filter;
  limit?: number;
}

export interface Filter {
  rel: "and" | "or";
  cond: FilterCondition[];
}

export interface FilterCondition {
  field: string;
  type?: string;
  method: FilterMethod;
  value?: any[];
}

type FilterMethod =
  | "not_empty"
  | "empty"
  | "eq"
  | "in"
  | "range"
  | "nin"
  | "ne"
  | "like"
  | "verified"
  | "unverified";
