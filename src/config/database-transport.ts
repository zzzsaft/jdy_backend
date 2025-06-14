import { TransportStreamOptions } from "winston-transport";
import Transport from "winston-transport";
// import { Log } from "../entity/utils/log";
import { Trigger } from "../entity/trigger/trigger";

export class DatabaseTransport extends Transport {
  constructor(options?: TransportStreamOptions) {
    super(options);
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit("logged", info);
    });
    // const logRepository = PgDataSource.getRepository(Log);
    // const log = Log.create({
    //   level: info.level,
    //   message: info.message,
    // });

    // log.save().then(() => {
    //   callback();
    // });
    callback();
  }
}
