import type { Request, Response } from "express";
import { Trigger } from "../../../entity/trigger/trigger.js";

async function getAllTriggerInfos(_request: Request, response: Response) {
  const triggers = await Trigger.find({
    relations: ["trigger_actions"],
  });
  response.send(triggers);
}

const getTrigger = async (request: Request, response: Response) => {
  const trigger = await Trigger.findOne({
    where: { id: parseInt(request.params.id) },
    relations: [
      "trigger_actions",
      "trigger_actions.execute_action_contents",
      "trigger_actions.execute_action_conditions",
      "trigger_conditions",
      "flow_state_change_list",
    ],
  });
  response.send(trigger);
};

async function createTriggerInfos(request: Request, response: Response) {
  const trigger = Trigger.create(request.body);
  trigger.trigger_action_list = request.body.trigger_action_list;
  await trigger.save();
  response.send(trigger);
}

async function deleteTriggerInfos(request: Request, response: Response) {
  await Trigger.delete(request.body.id);
  response.send({ id: request.params.id });
}

async function updateTriggerInfos(request: Request, response: Response) {
  const req = request.body;
  const triggers = await Trigger.update(req.id, req);
  response.send(triggers);
}

export const FrontendTriggerRoutes = [
  {
    path: "/trigger/getAllTriggers",
    method: "get",
    action: getAllTriggerInfos,
  },
  {
    path: "/trigger/get/:id",
    method: "get",
    action: getTrigger,
  },
  {
    path: "/trigger/delete/",
    method: "post",
    action: deleteTriggerInfos,
  },
  {
    path: "/trigger/post",
    method: "post",
    action: createTriggerInfos,
  },
  {
    path: "/trigger/update",
    method: "post",
    action: updateTriggerInfos,
  },
];
