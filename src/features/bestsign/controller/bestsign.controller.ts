import { Request, Response } from "express";
import { logger } from "../../../config/logger.js";
import { bestSignContractService } from "../service/bestSignContractService.js";
import { bestSignContractNotifyService } from "../service/bestSignContractNotifyService.js";

const quoteLargeIntegers = (jsonText: string) => {
  // Object values:  "key": 1234567890123456789
  let out = jsonText.replace(/(:\s*)(-?\d{16,})(\s*[,\}])/g, '$1"$2"$3');
  // Array values: [1234567890123456789, ...]
  out = out.replace(/([\[,]\s*)(-?\d{16,})(\s*[,\]])/g, '$1"$2"$3');
  return out;
};

export const sendContractByTemplate = async (
  request: Request,
  response: Response
) => {
  if (!request.body) {
    return response.status(400).send({ message: "Missing payload" });
  }

  const { senderName, senderPhone, ...payload } = request.body;
  const result = await bestSignContractService.sendContractByTemplate(payload, {
    senderName,
    senderPhone,
  });
  return response.send(result);
};

export const bestSignNotification = async (
  request: Request,
  response: Response
) => {
  // BestSign may send 19-digit IDs in JSON payload. If the JSON is parsed normally,
  // JS will round those numbers and we will persist wrong IDs. Prefer re-parsing rawBody.
  const rawBody = (request as any).rawBody as string | undefined;
  const payload =
    rawBody && rawBody.trim().length
      ? (() => {
          try {
            return JSON.parse(quoteLargeIntegers(rawBody));
          } catch (error) {
            logger.warn("BestSign notify: failed to parse rawBody", { error });
            return request.body;
          }
        })()
      : request.body;

  if (!payload) {
    return response.status(400).send({ message: "Missing payload" });
  }

  try {
    await bestSignContractNotifyService.handleNotification(payload);
  } catch (error) {
    logger.error(error);
    return response.status(500).send({ message: "Notification failed" });
  }

  return response.send({ success: true });
};

export const rejectContract = async (request: Request, response: Response) => {
  if (!request.body) {
    return response.status(400).send({ message: "Missing payload" });
  }
  const { contractId, resignMark, entName, userAccount } = request.body;
  const resolvedContractId = String(contractId ?? "");
  if (!resolvedContractId) {
    return response.status(400).send({ message: "Invalid contractId" });
  }
  const result = await bestSignContractService.rejectContract(
    resolvedContractId,
    resignMark,
    entName,
    userAccount
  );
  return response.send(result);
};

export const downloadContractFiles = async (
  request: Request,
  response: Response
) => {
  if (!request.body) {
    return response.status(400).send({ message: "Missing payload" });
  }
  const { contractIds, saveLocal, outputDir, zipFileName, unzip } =
    request.body;
  if (!Array.isArray(contractIds) || contractIds.length === 0) {
    return response.status(400).send({ message: "Invalid contractIds" });
  }
  const result = await bestSignContractService.downloadContractFiles(
    contractIds,
    {
      saveLocal,
      outputDir,
      zipFileName,
      // unzip,
    }
  );
  return response.send(result);
};

export const approveContract = async (request: Request, response: Response) => {
  if (!request.body) {
    return response.status(400).send({ message: "Missing payload" });
  }
  const { result, contractId } = request.body;
  if (!contractId) {
    return response.status(400).send({ message: "Missing contractId" });
  }
  const apiResult = await bestSignContractService.approveContract(
    String(result),
    String(contractId)
  );
  return response.send(apiResult);
};

export const signContract = async (request: Request, response: Response) => {
  if (!request.body) {
    return response.status(400).send({ message: "Missing payload" });
  }
  const { bizNo, account } = request.body;
  if (!bizNo) {
    return response.status(400).send({ message: "Missing bizNo" });
  }
  if (!account) {
    return response.status(400).send({ message: "Missing account" });
  }
  const result = await bestSignContractService.signContract({
    bizNo: String(bizNo),
  });
  return response.send(result);
};
