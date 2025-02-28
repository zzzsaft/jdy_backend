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
  isStartTrigger?: boolean;
  transactionId?: string;
  data_creator?: string;
}

export interface IDatasCreateOption {
  isStartWorkflow?: boolean;
  data_creator?: string;
  transactionId?: string;
}
export interface IDataUpdateOption {
  isStartTrigger?: boolean;
  transactionId?: string;
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
