import { Request, Response } from "express";
import { logger } from "../../../config/logger";
import { bestSignContractService } from "../service/bestSignContractService";

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
  if (!request.body) {
    return response.status(400).send({ message: "Missing payload" });
  }

  try {
    await bestSignContractService.handleNotification(request.body);
  } catch (error) {
    logger.error(error);
    return response.status(500).send({ message: "Notification failed" });
  }

  return response.send({ success: true });
};

export const rejectContract = async (
  request: Request,
  response: Response
) => {
  if (!request.body) {
    return response.status(400).send({ message: "Missing payload" });
  }
  const { contractId, resignMark, entName, userAccount } = request.body;
  const resolvedContractId = Number(contractId);
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
  const { contractIds, saveLocal, outputDir, zipFileName, unzip } = request.body;
  if (!Array.isArray(contractIds) || contractIds.length === 0) {
    return response.status(400).send({ message: "Invalid contractIds" });
  }
  const result = await bestSignContractService.downloadContractFiles(
    contractIds,
    {
      saveLocal,
      outputDir,
      zipFileName,
      unzip,
    }
  );
  return response.send(result);
};
