import { Request, Response } from "express";

export const parking = async (request: Request, response: Response) => {
  return response.send(request.body);
};
