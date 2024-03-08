interface FormField {
  value:
    | string
    | number
    | string[]
    | Date
    | Address
    | Coordinate
    | Phone
    | Username
    | Username[]
    | DeptNo
    | DeptNo[]
    | Attachment
    | Image
    | SubForm[];
}

interface Address {
  province: string;
  city: string;
  district: string;
  detail: string;
}

interface Coordinate {
  province: string;
  city: string;
  district: string;
  detail: string;
  lnglatXY: [number, number];
}

interface Phone {
  phone: string;
}

interface Username {
  username: string;
}

type DeptNo = number;

type Attachment = string[]; // 文件 key 数组

type Image = string[]; // 文件 key 数组

interface SubForm {
  [key: string]: FormField;
}

export interface IFormData {
  [key: string]: FormField;
}
