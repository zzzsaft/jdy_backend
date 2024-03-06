export enum SetType {
  FIXED = "fixed",
  DYNAMIC = "dynamic",
}

export enum TriggerMethod {
  NOT_EMPTY = "not_empty",
  EMPTY = "empty",
  EQ = "eq",
  NE = "ne",
  LIKE = "like",
  RANGE = "range",
  IN = "in",
}
export enum TriggerAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}
