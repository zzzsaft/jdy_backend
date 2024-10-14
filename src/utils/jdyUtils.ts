export class JdyUtil {
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
    return { value: new Date(data).toISOString() };
  }
  static setAddress(data: {
    province: string;
    city: string;
    district: string;
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
    return data;
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
}
type user = {
  username: string;
  name: string;
  status: number;
  type: number;
  departments: number[];
  integrate_id: string;
};
