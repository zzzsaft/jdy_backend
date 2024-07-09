import { Request, Response } from "express";

export const parking = async (request: Request, response: Response) => {
  console.log(request.body);
  return response.send(request.body);
};
