export var SetType;
(function (SetType) {
    SetType["FIXED"] = "fixed";
    SetType["DYNAMIC"] = "dynamic";
})(SetType || (SetType = {}));
export var TriggerMethod;
(function (TriggerMethod) {
    TriggerMethod["NOT_EMPTY"] = "not_empty";
    TriggerMethod["EMPTY"] = "empty";
    TriggerMethod["EQ"] = "eq";
    TriggerMethod["NE"] = "ne";
    TriggerMethod["LIKE"] = "like";
    TriggerMethod["RANGE"] = "range";
    TriggerMethod["IN"] = "in";
})(TriggerMethod || (TriggerMethod = {}));
export var TriggerAction;
(function (TriggerAction) {
    TriggerAction["CREATE"] = "create";
    TriggerAction["UPDATE"] = "update";
    TriggerAction["DELETE"] = "delete";
})(TriggerAction || (TriggerAction = {}));
//# sourceMappingURL=trigger.js.map