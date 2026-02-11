export class JdyUtil {
  static getValue(data: any) {
    if (data == null) return data;
    if (typeof data === "object" && "value" in data) {
      return (data as { value?: unknown }).value;
    }
    return data;
  }

  static getText(data: any) {
    const resolved = JdyUtil.getValue(data);
    if (resolved == null) return "";
    if (Array.isArray(resolved)) return resolved.join("，");
    if (typeof resolved === "object") return JSON.stringify(resolved);
    return String(resolved);
  }

  static getDateText(data: any) {
    const resolved = JdyUtil.getValue(data);
    if (!resolved) return "";
    const date = JdyUtil.getDate(String(resolved));
    if (!date || Number.isNaN(date.getTime())) return String(resolved);
    return date.toISOString().split("T")[0];
  }

  static getAddressText(data: any) {
    const resolved = JdyUtil.getValue(data);
    if (!resolved) return "";
    const addr = JdyUtil.getAddress(resolved as any);
    return addr?.full ?? "";
  }

  static getStringArray(data: any) {
    const resolved = JdyUtil.getValue(data);
    if (Array.isArray(resolved)) return resolved.map((item) => String(item));
    if (!resolved) return [];
    return [String(resolved)];
  }
  static setText(data: string) {
    return { value: data ?? "" };
  }

  static setNumber(data: number) {
    return { value: data };
  }
  static setCombos(data: string[]) {
    return { value: data };
  }
  static setOrgs(data: number[]) {
    return { value: data };
  }
  static setDate(data: Date) {
    if (!data) {
      return { value: "" };
    }
    return { value: new Date(data).toISOString() };
  }
  static setAddress(data: {
    province?: string;
    city?: string;
    district?: string;
    detail: string;
  }) {
    return { value: data };
  }
  static setLocation(data: {
    province: string;
    city: string;
    district: string;
    detail: string;
    lnglatXY: [number, number];
  }) {
    return { value: data };
  }
  static setPhone(data: string[]) {
    return { phone: data };
  }
  static setSubForm(data: Array<{ [key: string]: any }>) {
    if (!data) {
      return { value: [] };
    }
    return {
      value: data.map((record) => {
        const formattedRecord: { [key: string]: any } = {};
        for (const key in record) {
          if (record.hasOwnProperty(key)) {
            formattedRecord[key] = record[key];
          }
        }
        return formattedRecord;
      }),
    };
  }
  static getDate(data: string) {
    return new Date(data);
  }
  static getSign(data: {
    name: string;
    size: number;
    mime: string;
    url: string;
  }) {
    return data;
  }
  static getAddress(data: {
    province: string;
    city: string;
    district: string;
    detail: string;
  }) {
    if (!data) return { full: "" };
    const city = data?.province == data?.city ? "" : data.city;
    return {
      ...data,
      full: `${data?.province ?? ""}${city}${data?.district ?? ""}${
        data?.detail ?? ""
      }`,
    };
  }
  static getLocation(data: {
    province: string;
    city: string;
    district: string;
    detail: string;
    lnglatXY: [number, number];
  }) {
    return data;
  }
  static getPhone(data: { phone: string; verified: boolean }) {
    return data;
  }
  static getUser(data: {
    username: string;
    name: string;
    status: number;
    type: number;
    departments: number[];
    integrate_id: string;
  }) {
    if (!data) return null;
    return data;
  }
  static getUsers(
    data: {
      username: string;
      name: string;
      status: number;
      type: number;
      departments: number[];
      integrate_id: string;
    }[]
  ) {
    if (!data) return null;
    return data;
  }
  static getOrg(data: {
    name: string;
    dept_no: number;
    type: number;
    parent_no: number;
    status: number;
    integrate_id: number;
  }) {
    return data;
  }
  static getOrgs(
    data: {
      name: string;
      dept_no: number;
      type: number;
      parent_no: number;
      status: number;
      integrate_id: number;
    }[]
  ) {
    return data;
  }
  static getSubForm(data: Array<{ [key: string]: any }>) {
    return data;
  }
  static getState(data: number) {
    const state = {
      0: "进行中",
      1: "已完成",
      2: "手动结束",
      4: "被激活",
      5: "任务被暂停",
    };
    return state?.[data] ?? "";
  }
}
type user = {
  username: string;
  name: string;
  status: number;
  type: number;
  departments: number[];
  integrate_id: string;
};
