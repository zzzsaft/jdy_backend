import { DataSource } from "typeorm";
import { ContractArchiveVersion } from "../entity/index.js";
import { mapVersion } from "./contractArchive.mapper.js";

export class ContractArchiveVersionService {
  constructor(private readonly dataSource: DataSource) {}

  async listVersions(archiveId: number) {
    const versions = await this.dataSource
      .getRepository(ContractArchiveVersion)
      .find({
        where: { archiveId: String(archiveId) },
        order: { version: "DESC" },
      });
    return { versions: versions.map((version) => mapVersion(version, false)) };
  }

  async getVersion(archiveId: number, versionNumber: number) {
    const version = await this.dataSource
      .getRepository(ContractArchiveVersion)
      .findOne({
        where: { archiveId: String(archiveId), version: versionNumber },
      });
    if (!version) {
      throw new Error(`Contract archive version not found: ${archiveId} v${versionNumber}`);
    }
    return { version: mapVersion(version, true) };
  }
}
