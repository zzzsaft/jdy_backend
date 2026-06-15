import type { Request, Response } from "express";
import { productConfigAgentArchiveService } from "./contractArchive.service.js";
import {
  optionalBoolean,
  optionalString,
  requireString,
  sendError,
} from "../utils/routeUtils.js";

type ProductConfigAgentRouteAction = (request: Request, response: Response) => Promise<void>;
type Route = {
  path: string;
  method: string;
  action: ProductConfigAgentRouteAction;
};

const getContractsSummary = async (_request: Request, response: Response) => {
  try {
    response.json(await productConfigAgentArchiveService.getContractsSummary());
  } catch (error) {
    sendError(response, error);
  }
};

const listContracts = async (request: Request, response: Response) => {
  try {
    const status =
      typeof request.query.status === "string" && request.query.status.trim()
        ? request.query.status.trim()
        : undefined;
    if (
      status !== undefined &&
      status !== "uploaded" &&
      status !== "normalized" &&
      status !== "archived" &&
      status !== "dictionary_dirty"
    ) {
      throw new Error(
        "status must be uploaded, normalized, archived, or dictionary_dirty",
      );
    }

    response.json(
      await productConfigAgentArchiveService.listContracts({
        page:
          typeof request.query.page === "string"
            ? Number(request.query.page)
            : undefined,
        pageSize:
          typeof request.query.pageSize === "string"
            ? Number(request.query.pageSize)
            : undefined,
        status,
        q:
          typeof request.query.q === "string" && request.query.q.trim()
            ? request.query.q.trim()
            : undefined,
        productNumber:
          typeof request.query.productNumber === "string" &&
          request.query.productNumber.trim()
            ? request.query.productNumber.trim()
            : undefined,
        customerId:
          typeof request.query.customerId === "string" &&
          request.query.customerId.trim()
            ? request.query.customerId.trim()
            : undefined,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const archiveContract = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(
      await productConfigAgentArchiveService.archiveDocument({
        documentId,
        archivedBy: optionalString(request.body?.archivedBy ?? request.body?.reviewedBy),
        force: request.body?.force === true,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getArchiveReadiness = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(await productConfigAgentArchiveService.checkArchiveReadiness(documentId));
  } catch (error) {
    sendError(response, error);
  }
};

const listContractArchives = async (request: Request, response: Response) => {
  try {
    const status =
      typeof request.query.status === "string" && request.query.status.trim()
        ? request.query.status.trim()
        : undefined;
    if (
      status !== undefined &&
      status !== "archived" &&
      status !== "dictionary_dirty"
    ) {
      throw new Error("status must be archived or dictionary_dirty");
    }
    response.json(
      await productConfigAgentArchiveService.listContractArchives({
        page:
          typeof request.query.page === "string"
            ? Number(request.query.page)
            : undefined,
        pageSize:
          typeof request.query.pageSize === "string"
            ? Number(request.query.pageSize)
            : undefined,
        status,
        q:
          typeof request.query.q === "string" && request.query.q.trim()
            ? request.query.q.trim()
            : undefined,
        productNumber:
          typeof request.query.productNumber === "string" &&
          request.query.productNumber.trim()
            ? request.query.productNumber.trim()
            : undefined,
        customerId:
          typeof request.query.customerId === "string" &&
          request.query.customerId.trim()
            ? request.query.customerId.trim()
            : undefined,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getContractArchive = async (request: Request, response: Response) => {
  try {
    const archiveId = Number(request.params.archiveId);
    if (!archiveId) throw new Error("archiveId is required");
    response.json(await productConfigAgentArchiveService.getArchiveDetail(archiveId));
  } catch (error) {
    sendError(response, error);
  }
};

const patchContractArchive = async (request: Request, response: Response) => {
  try {
    const archiveId = Number(request.params.archiveId);
    if (!archiveId) throw new Error("archiveId is required");
    response.json(
      await productConfigAgentArchiveService.patchArchive({
        archiveId,
        changes: request.body?.changes,
        editedBy: optionalString(request.body?.editedBy),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const listContractArchiveVersions = async (
  request: Request,
  response: Response,
) => {
  try {
    const archiveId = Number(request.params.archiveId);
    if (!archiveId) throw new Error("archiveId is required");
    response.json(await productConfigAgentArchiveService.listVersions(archiveId));
  } catch (error) {
    sendError(response, error);
  }
};

const getContractArchiveVersion = async (
  request: Request,
  response: Response,
) => {
  try {
    const archiveId = Number(request.params.archiveId);
    const version = Number(request.params.version);
    if (!archiveId) throw new Error("archiveId is required");
    if (!version) throw new Error("version is required");
    response.json(await productConfigAgentArchiveService.getVersion(archiveId, version));
  } catch (error) {
    sendError(response, error);
  }
};

const replaceItemProductBindings = async (
  request: Request,
  response: Response,
) => {
  try {
    const archiveId = Number(request.params.archiveId);
    const itemId = Number(request.params.itemId);
    if (!archiveId) throw new Error("archiveId is required");
    if (!itemId) throw new Error("itemId is required");
    response.json(
      await productConfigAgentArchiveService.replaceItemProductBindings({
        archiveId,
        itemId,
        bindings: Array.isArray(request.body?.bindings)
          ? request.body.bindings
          : [],
        editedBy: optionalString(request.body?.editedBy),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const searchProductConfigs = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentArchiveService.searchProductConfigs({
        productNumber: requireString(request.query.productNumber, "productNumber"),
        customerId:
          typeof request.query.customerId === "string" &&
          request.query.customerId.trim()
            ? request.query.customerId.trim()
            : undefined,
        includeErp: optionalBoolean(request.query.includeErp, "includeErp"),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

export function createProductConfigAgentArchiveRoutes(
  withProductConfigAgentAdmin: (action: ProductConfigAgentRouteAction) => ProductConfigAgentRouteAction,
  withProductConfigAgentToken: (action: ProductConfigAgentRouteAction) => ProductConfigAgentRouteAction,
): Route[] {
  return [
    {
      path: "/productConfigAgent/contracts/summary",
      method: "get",
      action: withProductConfigAgentToken(getContractsSummary),
    },
    {
      path: "/productConfigAgent/contracts",
      method: "get",
      action: withProductConfigAgentToken(listContracts),
    },
    {
      path: "/productConfigAgent/contracts/:documentId/archive",
      method: "post",
      action: withProductConfigAgentAdmin(archiveContract),
    },
    {
      path: "/productConfigAgent/contracts/:documentId/archive-readiness",
      method: "get",
      action: withProductConfigAgentToken(getArchiveReadiness),
    },
    {
      path: "/productConfigAgent/contract-archives",
      method: "get",
      action: withProductConfigAgentToken(listContractArchives),
    },
    {
      path: "/productConfigAgent/contract-archives/:archiveId/versions/:version",
      method: "get",
      action: withProductConfigAgentToken(getContractArchiveVersion),
    },
    {
      path: "/productConfigAgent/contract-archives/:archiveId/versions",
      method: "get",
      action: withProductConfigAgentToken(listContractArchiveVersions),
    },
    {
      path: "/productConfigAgent/contract-archives/:archiveId/items/:itemId/product-bindings",
      method: "put",
      action: withProductConfigAgentAdmin(replaceItemProductBindings),
    },
    {
      path: "/productConfigAgent/contract-archives/:archiveId",
      method: "get",
      action: withProductConfigAgentToken(getContractArchive),
    },
    {
      path: "/productConfigAgent/contract-archives/:archiveId",
      method: "patch",
      action: withProductConfigAgentAdmin(patchContractArchive),
    },
    {
      path: "/productConfigAgent/product-configs/search",
      method: "get",
      action: withProductConfigAgentToken(searchProductConfigs),
    },
  ];
}
