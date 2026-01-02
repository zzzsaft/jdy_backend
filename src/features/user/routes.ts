import { Request, Response } from "express";
import { authService } from "../../services/authService";
import { employeeService } from "../../services/md/employeeService";

const getUsers = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const users = await employeeService.getAllUsers();
  response.send(users);
};
export const UserRoutes = [
  {
    path: "/user/get",
    method: "get",
    action: getUsers,
  },
];
