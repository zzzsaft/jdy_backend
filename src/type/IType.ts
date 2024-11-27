export interface ILimitOpion {
  name: string;
  duration: number;
  limit: number;
}
export interface IRequestOptions {
  version?: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: any;
  payload?: any;
}
export interface IAppoint {
  /**
   * 来宾公司
   */
  guestCompany: string;
  /**
   * 来宾类型
   */
  guestType: string;
  /**
   * 是否为邀请(0:不是,1:是)
   */
  // inviteStatus: number;
  /**
   * 车牌号
   */
  visitorCarNum: string;
  /**
   * 来访结束时间，yyyy-MM-dd HH:mm:ss
   */
  visitorLeaveTime: string;
  /**
   * 访客姓名
   */
  visitorName: string;
  /**
   * 访客手机号
   */
  visitorPhone: string;
  /**
   * 来访目的
   */
  visitorPurpose: string;
  /**
   * 来访事由
   */
  visitorReason: string;
  /**
   * 来访时间，yyyy-MM-dd HH:mm:ss
   */
  visitorTime: string;
  // [property: string]: any;
  area: string;
}
