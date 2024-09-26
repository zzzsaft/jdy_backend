import { Response, Request } from "express";

export const handleFBT = async (request: Request, response: Response) => {
  // logger.info(request.body);
  return response.send({ state: "success" });
};
