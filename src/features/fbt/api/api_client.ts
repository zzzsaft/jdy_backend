import { IRequestOptions } from "../../../type/IType.js";
import { connectorJSON } from "../../../api/connector/client.js";

export class ApiClient {
  protected async doRequest(options: IRequestOptions) {
    if (options.method !== "POST") throw new Error("Unsupported Fenbeitong method");
    const p = options.payload ?? {};
    const base = "/v1/providers/fenbeitong";
    const page = { pageIndex: p.page_index ?? 1, pageSize: p.page_size, all: false };
    let value: any;
    switch (options.path) {
      case "/openapi/org/department/v1/list":
      case "/openapi/org/employee/v1/list": {
        const key = options.path.includes("department") ? "departments" : "employees";
        value = await connectorJSON(`${base}/${key}/query`, { ...page, ...(p.state === undefined ? {} : { state: p.state }) });
        return { code: 0, data: { [key]: value.items, total_pages: value.totalPages, total_count: value.totalCount } };
      }
      case "/openapi/common/custom_form/v1/form_list":
        value = await connectorJSON(`${base}/forms/query`, { formType: p.form_type });
        return { code: 0, data: value.data };
      case "/openapi/apply/custom_common/v1/list":
        value = await connectorJSON(`${base}/trip-applications/query`, {
          ...page, type: p.type, orderState: p.order_state,
          approveStartTime: p.approve_start_time, approveEndTime: p.approve_end_time,
          createStartTime: p.create_start_time, createEndTime: p.create_end_time,
        });
        return { code: 0, data: { applies: value.items, total_pages: value.totalPages, total_count: value.totalCount } };
      case "/openapi/apply/custom_trip/v1/detail":
      case "/openapi/apply/common/v3/detail_apply_order": {
        const kind = options.path.includes("custom_trip") ? "trip-applications" : "applications";
        value = await connectorJSON(`${base}/${kind}/${encodeURIComponent(p.apply_id)}`, undefined, "GET");
        return { code: 0, data: value };
      }
      default: throw new Error("Unsupported Fenbeitong Connect operation");
    }
  }
}
