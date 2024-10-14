import { Execute_Action } from "../../entity/trigger/execute_action1";
import { Execute_Action_Content } from "../../entity/trigger/execute_action_content1";
import { Trigger } from "../../entity/trigger/trigger";
import { FilterCondition } from "../../type/jdy/IOptions";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import _ from "lodash";
interface Payload {
  data: any;
  op: "data_create" | "data_update" | "data_remove" | "data_recover";
}

export class 智能助手 {
  private formName: string;
  private entryId: string;
  private appId: string;
  private flowState: string | undefined;
  private dataId: number | undefined;
  private data: any;
  private trigger: Trigger;

  constructor(payload: Payload) {
    this.formName = payload.data.formName;
    this.entryId = payload.data.entryId;
    this.appId = payload.data.appId;
    const op = payload.op;
    this.flowState = payload.data.flowState;
    this.dataId = payload.data._id;
    this.data = payload.data;
    Trigger.find({
      where: { entry_id: this.entryId, app_id: this.appId },
      relations: [
        "trigger_conditions",
        "trigger_actions",
        "trigger_actions.execute_action_condition",
        "trigger_actions.execute_action_content",
      ],
    })
      .then((triggers) =>
        triggers.forEach((trigger) => {
          if (trigger.trigger_action.includes(op)) {
            if (this.check_condition(trigger)) {
              this.execute_action(trigger);
            }
          }
        })
      )
      .catch((error) => {
        throw error(error);
      });
  }

  private check_condition(trigger: Trigger): boolean {
    for (const condition of trigger.trigger_conditions) {
      switch (condition.method) {
        case "eq":
          if (condition.name === "flowState") {
            if (this.flowState !== condition.value) {
              return false;
            }
          }
          if (this.data[condition.name] !== condition.value) {
            return false;
          }
          break;
        case "ne":
          if (condition.name === "flowState") {
            if (this.flowState === condition.value) {
              return false;
            }
          }
          if (this.data[condition.name] === condition.value) {
            return false;
          }
          break;
        case "like":
          if (!this.data[condition.name].includes(condition.value)) {
            return false;
          }
          break;
        case "not_empty":
          if (this.data[condition.name] === "") {
            return false;
          }
          break;
        case "empty":
          if (this.data[condition.name] !== "") {
            return false;
          }
          break;
        case "range":
          try {
            const value = condition.value.split(",");
            if (
              this.data[condition.name] < value[0] ||
              this.data[condition.name] > value[1]
            ) {
              return false;
            }
          } catch {
            return false;
          }
          break;
        case "in":
          if (!condition.value.split(",").includes(this.data[condition.name])) {
            return false;
          }
          break;
        default:
          break;
      }
    }
    return true;
  }

  private async target_form_condition_check(
    action: Execute_Action,
    app_id: string,
    entry_id: string
  ): Promise<any[]> {
    if (action.execute_action_conditions.length === 0) {
      return [];
    }
    const condlist: FilterCondition[] = [];
    action.execute_action_conditions.forEach((condition) => {
      if (condition.set_type === "fixed") {
        condlist.push({
          field: condition.name,
          method: condition.method,
          value: [condition.value],
        });
      } else {
        condlist.push({
          field: condition.name,
          method: condition.method,
          value: this.value_type_convert(
            condition.type,
            this.data[condition.value]
          ),
        });
      }
    });

    const data = await jdyFormDataApiClient.batchDataQuery(app_id, entry_id, {
      filter: {
        rel: "and",
        cond: condlist,
      },
    });
    return data;
  }

  private async execute_action(trigger: Trigger): Promise<void> {
    for (const action of trigger.trigger_actions) {
      const checked_data = await this.target_form_condition_check(
        action,
        action.app_id,
        action.entry_id
      );
      switch (action.action) {
        case "create":
          if (checked_data.length === 0) {
            const dataList = this.add(action);
            await jdyFormDataApiClient.batchDataCreate(
              action.app_id,
              action.entry_id,
              dataList,
              { isStartWorkflow: action.is_start_workflow }
            );
          }
          break;
        case "delete":
          await jdyFormDataApiClient.batchDataRemove(
            action.app_id,
            action.entry_id,
            checked_data.map((i: any) => i["_id"])
          );
          break;
        case "update":
          if (checked_data.length !== 0) {
            await this.update(action, checked_data);
          }
          break;
        default:
          break;
      }
    }
  }

  private async update(
    action: Execute_Action,
    checked_data: any[]
  ): Promise<void> {
    const data = this.create_data(action);
    if (action.extension_subform_name == "") {
      const ids = checked_data.map((i: any) => i["_id"]);
      await jdyFormDataApiClient.batchDataUpdate(
        action.app_id,
        action.entry_id,
        ids,
        data
      );
    } else {
      const subform_names = action.extension_subform_name.split(",");
      checked_data.forEach(async (i: any) => {
        for (const sumform of subform_names) {
          data[sumform] = data[sumform]["value"].push(i[sumform]);
        }
        await jdyFormDataApiClient.singleDataUpdate(
          action.app_id,
          action.entry_id,
          i["_id"],
          data
        );
      });
    }
  }

  private add(action: Execute_Action): any[] {
    const data = this.create_data(action);
    const dataList: any[] = [];
    // # 源数据子表，目标数据非子表
    const temp = action.execute_action_contents.filter(
      (i: Execute_Action_Content) => !i.subform_name && i.value_subform_name
    );
    temp.sort((a: Execute_Action_Content, b: Execute_Action_Content) =>
      a.name.localeCompare(b.name)
    );
    const grouped_objects = temp.reduce(
      (acc: Execute_Action_Content[][], cur: Execute_Action_Content) => {
        const last = acc[acc.length - 1];
        if (last && last[0].name === cur.name) {
          last.push(cur);
        } else {
          acc.push([cur]);
        }
        return acc;
      },
      []
    );
    const groupedAndSorted = _(temp)
      .groupBy("name")
      .map((value, key) => ({ name: key, values: _.sortBy(value, "name") }))
      .value();
    if (grouped_objects.length !== 0) {
      const object = grouped_objects[0];
      for (const i of this.data[object[0].value]) {
        const new_data = { ...data };
        for (const j of object) {
          new_data[j.name] = {
            value: this.value_type_convert(j.type, i[j.value_subform_name]),
          };
        }
        dataList.push(new_data);
      }
    }
    if (dataList.length === 0) {
      dataList.push(data);
    }
    console.log(dataList);
    return dataList;
  }

  private create_data(action: Execute_Action): any {
    const data: any = {};
    for (const i of action.execute_action_contents) {
      if (!i.subform_name && !i.value_subform_name) {
        if (i.set_type === "fixed") {
          data[i.name] = { value: i.value };
        } else {
          data[i.name] = {
            value: this.value_type_convert(i.type, this.data[i.value]),
          };
        }
      }
    }
    const temp = action.execute_action_contents.filter(
      (i: Execute_Action_Content) => i.subform_name
    );
    temp.sort((a: Execute_Action_Content, b: Execute_Action_Content) =>
      a.name.localeCompare(b.name)
    );
    const grouped_objects = temp.reduce(
      (acc: Execute_Action_Content[][], cur: Execute_Action_Content) => {
        const last = acc[acc.length - 1];
        if (last && last[0].name === cur.name) {
          last.push(cur);
        } else {
          acc.push([cur]);
        }
        return acc;
      },
      []
    );
    const subforms: any = {};
    for (const object of grouped_objects) {
      subforms[object[0].name] = {};
      for (const content of object) {
        if (!content.value_subform_name && content.set_type === "dynamic") {
          subforms[object[0].name][content.subform_name] = {
            value: this.value_type_convert(
              content.type,
              this.data[content.value]
            ),
          };
        } else if (
          !content.value_subform_name &&
          content.set_type === "fixed"
        ) {
          subforms[object[0].name][content.subform_name] = {
            value: content.value,
          };
        }
      }
    }
    for (const object of grouped_objects) {
      const value_contents = object.filter(
        (content: Execute_Action_Content) =>
          content.value_subform_name && content.set_type === "dynamic"
      );
      if (value_contents.length === 0) {
        continue;
      }
      const subform = subforms[object[0].name];
      data[object[0].name] = { value: [] };
      for (const j of this.data[object[0].value]) {
        const copied_subform = { ...subform };
        for (const [key, value] of Object.entries(j)) {
          for (const k of value_contents) {
            if (k.value_subform_name === key) {
              copied_subform[k.subform_name] = {
                value: this.value_type_convert(k.type, value),
              };
              break;
            }
          }
        }
        data[object[0].name]["value"].push(copied_subform);
      }
    }
    for (const [key, value] of Object.entries(subforms)) {
      if (!(key in data)) {
        data[key] = { value: [value] };
      }
    }
    return data;
  }

  private value_type_convert(type: string, value: any): any {
    switch (type) {
      case "user":
        return value.username;
      case "usergroup":
        return value.map((i: any) => i.username);
      case "dept":
        return value.dept_no;
      case "deptgroup":
        return value.map((i: any) => i.dept_no);
      default:
        return value;
    }
  }
}
