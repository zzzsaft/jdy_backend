type Control =
  | "Text"
  | "Textarea"
  | "Number"
  | "Money"
  | "Date"
  | "Selector"
  | "Contact"
  | "Tips"
  | "File"
  | "Table"
  | "Attendance"
  | "Vacation"
  | "PunchCorrection"
  | "DateRange";
/**
 * @property  apply_data.control - 文本,多行文本,数字,金额,日期,单选,成员,说明文字,附件,明细,假勤,请假,补卡,时长
 */
export interface ApplyData<V extends Control = Control> {
  control: V;
  id: string;
  title: string;
  value: V extends "Vacation"
    ? Vacation
    : V extends "Attendance"
    ? { attendance: attendance }
    : V extends "PunchCorrection"
    ? { punch_correction: PunchCorrection }
    : object;
  hidden: boolean;
}

interface Vacation {
  vacation: {
    selector: selector;
    attendance: attendance;
  };
}

/**
 * @property {1|2|3|4|5} attendance.type - 1-请假；2-补卡；3-出差；4-外出；5-加班
 * @property {1|2} attendance.slice_info.state - 1--系统自动计算;2--用户修改
 * @property {number} attendance.slice_info.duration - 总时长，单位是秒
 */

interface attendance {
  date_range: DateRange;
  type: 1 | 2 | 3 | 4 | 5;
  slice_info: {
    day_items: {
      daytime: number;
      duration: number;
    }[];
    duration: number;
    state: 1 | 2;
  };
}

/**
 * @property {number} DateRange.new_begin - 开始时间,unix时间戳
 * @property {number} DateRange.new_end - 结束时间，unix时间戳
 * @property {number} DateRange.new_duration - 时长范围， 单位秒
 */
interface DateRange {
  type: "halfday" | "hour";
  //开始时间,unix时间戳
  new_begin: number;
  new_end: number;
  new_duration: number;
}

interface selector {
  type: "single" | "multi";
  options: SelectorOption[];
}

interface SelectorOption {
  key: string;
  value: {
    text: string;
    lang: string;
  }[];
}

interface PunchCorrection {
  state: string;
  time: number;
}
