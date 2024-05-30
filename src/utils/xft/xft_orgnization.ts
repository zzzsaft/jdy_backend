import { appApiClient, connectApiClient } from "./api_client";

class XFTOrgnizationApiClient {
  async getOrgnizationList() {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/ORG/orgqry/xft-service-organization/org/v1/get/page",
        payload: {
          pageSize: 2000,
        },
      },
      {
        name: "getOrgnizationList",
        duration: 1000,
        limit: 20,
      }
    );
  }
  async getOrgnization(id: string) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/ORG/orgqry/common/OPORGQRY",
        payload: {
          OPORGQRYX: [
            {
              ORGCOD: id,
            },
          ],
        },
      },
      {
        name: "getOrgnization",
        duration: 1000,
        limit: 20,
      }
    );
  }
  async addOrgnization(data: {
    id: string;
    name: string;
    parent_id: string;
    approverIds: string[];
  }) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/ORG/orgqry/xft-service-organization/org/v1/add",
        payload: {
          name: data.name,
          parentOrgCode: data.parent_id,
          code: data.id,
          approverEnterpriseUserIds: data.approverIds,
          remark: "api",
        },
      },
      {
        name: "addOrgnization",
        duration: 1000,
        limit: 1,
      }
    );
  }
  async updateOrgnization(data: {
    id: string;
    name: string;
    parent_id: string | number;
    userids?: string[];
  }) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/ORG/orgqry/xft-service-organization/org/v1/update",
        payload: {
          name: data.name,
          parentOrgCode: data.parent_id,
          id: data.id,
          approverEnterpriseUserIds: data.userids,
        },
      },
      {
        name: "updateOrgnization",
        duration: 1000,
        limit: 1,
      }
    );
  }
  async importOrgnization(
    data: {
      id: string;
      name: string;
      parent_id: string;
      leader: string;
    }[]
  ) {
    return await connectApiClient.doRequest(
      {
        method: "POST",
        path: "/connector-platform/prd/connector-platform/open/v1/service/trigger/f3ecbd4acbc141cdb1a5133ed572ef91/ad1b01d965de4c75b8d423931c3fc939",
        payload: { data: data },
      },
      {
        name: "importOrgnization",
        duration: 1000,
        limit: 1,
      }
    );
  }
}
export const xftOrgnizationApiClient = new XFTOrgnizationApiClient();
