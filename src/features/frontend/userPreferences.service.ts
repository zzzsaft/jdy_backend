import type { Repository } from "typeorm";
import { PgDataSource } from "../../config/data-source.js";
import { UserPreference } from "./entity/index.js";

type UserPreferenceRepository = Pick<
  Repository<UserPreference>,
  "findOne" | "upsert"
>;

export class UserPreferencesService {
  constructor(private readonly repository: UserPreferenceRepository) {}

  async getPreference(params: { ownerUserId: string; key: string }) {
    const preference = await this.repository.findOne({
      where: {
        ownerUserId: params.ownerUserId,
        preferenceKey: params.key,
      },
    });

    return {
      key: params.key,
      value: preference?.valueJsonb ?? null,
    };
  }

  async savePreference(params: {
    ownerUserId: string;
    key: string;
    value: unknown;
  }) {
    await this.repository.upsert(
      {
        ownerUserId: params.ownerUserId,
        preferenceKey: params.key,
        valueJsonb: params.value as any,
      } as any,
      ["ownerUserId", "preferenceKey"],
    );

    return {
      key: params.key,
      value: params.value,
    };
  }
}

export const userPreferencesService = new UserPreferencesService(
  PgDataSource.getRepository(UserPreference),
);
