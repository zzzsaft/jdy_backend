import { In } from "typeorm";
import { getCorpList } from "../../../config/wechatCorps";
import { Department } from "../../../entity/basic/department";
import { xftOrgnizationApiClient } from "../../xft/api/xft_orgnization";
import { contactApiClient } from "../api/contact";

const buildDepartmentLevels = async (
  department: Department,
  departments: Department[]
): Promise<Department> => {
  let levelName: string[] = [];
  let departmentTemp = department;
  levelName.push(department.name);
  while (departmentTemp.parent_id != "1" && departmentTemp.parent_id != "0") {
    const parentDepartment = departments.find(
      (candidate) =>
        candidate.department_id === departmentTemp.parent_id &&
        candidate.corp_id === department.corp_id
    );
    if (parentDepartment) {
      departmentTemp = parentDepartment;
    } else {
      break;
    }
    levelName.push(departmentTemp.name);
  }
  department.company = levelName.pop() ?? "";
  department.level1 = levelName.pop() ?? "";
  department.level2 = levelName.pop() ?? "";
  department.level3 = levelName.pop() ?? "";
  department.level4 = levelName.pop() ?? "";
  department.level5 = levelName.pop() ?? "";
  department.level6 = levelName.pop() ?? "";
  department.level7 = levelName.pop() ?? "";
  return department;
};

export const syncDepartments = async (corpId?: string): Promise<void> => {
  const corpConfigs = getCorpList(corpId);
  const corpIds = corpConfigs.map((config) => config.corpId);
  const existDepartments = await Department.find({
    where: { is_exist: true, corp_id: In(corpIds) },
  });
  let result: Department[] = [];

  for (const config of corpConfigs) {
    const departmentList = await contactApiClient.getDepartmentList(
      config.corpId
    );
    const corpDepartments = departmentList["department"].map(
      (department: any) => {
        return {
          corp_id: config.corpId,
          department_id: department.id.toString(),
          parent_id: department.parentid.toString(),
          name: department.name,
          department_leader: department.department_leader,
          is_exist: true,
        } as Department;
      }
    );
    result = result.concat(corpDepartments);

    await Department.upsert(corpDepartments, {
      conflictPaths: ["department_id", "corp_id"],
      skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
    });
  }

  const activeIds = result.map(
    (department) => `${department.corp_id}:${department.department_id}`
  );

  existDepartments
    .filter(
      (department) =>
        !activeIds.includes(`${department.corp_id}:${department.department_id}`)
    )
    .forEach(async (department) => {
      department.is_exist = false;
      await department.save();
    });
};

export const syncXftDepartmentIds = async (corpId: string): Promise<void> => {
  const xftOrg = (await xftOrgnizationApiClient.getOrgnizationList())["body"][
    "records"
  ]
    .filter((org: any) => org.status == "active")
    .map((org: any) => {
      return {
        xft_id: org["id"],
        department_id: org["code"],
        corp_id: corpId,
      };
    });
  await Department.upsert(xftOrg, {
    conflictPaths: ["department_id", "corp_id"],
    skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
  });
};

export const syncDepartmentLevels = async (corpId?: string): Promise<void> => {
  const corpConfigs = getCorpList(corpId);
  const updatedDepartments: Department[] = [];

  for (const config of corpConfigs) {
    const departments = await Department.find({
      where: { corp_id: config.corpId },
    });

    for (const department of departments) {
      updatedDepartments.push(
        await buildDepartmentLevels(department, departments)
      );
    }
  }

  await Department.save(updatedDepartments);
};
