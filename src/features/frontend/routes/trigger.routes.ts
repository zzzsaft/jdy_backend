import type { Request, Response } from "express";
import { Trigger } from "../../../entity/trigger/trigger.js";
import { withRequiredUser } from "../../shared/routeAuth.js";

const TRIGGER_WRITABLE_FIELDS = [
  "trigger_name",
  "app_id",
  "app_name",
  "entry_id",
  "entry_name",
  "trigger_action",
  "isActive",
] as const;

function pickTriggerPatch(body: unknown): Partial<Trigger> {
  if (!body || typeof body !== "object") {
    throw new Error("request body is required");
  }
  const input = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of TRIGGER_WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      patch[field] = input[field];
    }
  }
  return patch as Partial<Trigger>;
}

function requirePositiveId(value: unknown, name: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return id;
}

function sendError(response: Response, error: unknown) {
  response.status(400).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

async function getAllTriggerInfos(_request: Request, response: Response) {
  try {
    const triggers = await Trigger.find({
      relations: ["trigger_actions"],
    });
    response.send(triggers);
  } catch (error) {
    sendError(response, error);
  }
}

const getTrigger = async (request: Request, response: Response) => {
  try {
    const trigger = await Trigger.findOne({
      where: { id: requirePositiveId(request.params.id, "id") },
      relations: [
        "trigger_actions",
        "trigger_actions.execute_action_contents",
        "trigger_actions.execute_action_conditions",
        "trigger_conditions",
        "flow_state_change_list",
      ],
    });
    response.send(trigger);
  } catch (error) {
    sendError(response, error);
  }
};

async function createTriggerInfos(request: Request, response: Response) {
  try {
    const trigger = Trigger.create(pickTriggerPatch(request.body)) as Trigger;
    if (
      request.body &&
      typeof request.body === "object" &&
      Array.isArray((request.body as any).trigger_action_list)
    ) {
      trigger.trigger_action_list = (request.body as any).trigger_action_list;
    }
    await trigger.save();
    response.send(trigger);
  } catch (error) {
    sendError(response, error);
  }
}

async function deleteTriggerInfos(request: Request, response: Response) {
  try {
    const id = requirePositiveId(request.body?.id, "id");
    await Trigger.delete(id);
    response.send({ id });
  } catch (error) {
    sendError(response, error);
  }
}

async function updateTriggerInfos(request: Request, response: Response) {
  try {
    const id = requirePositiveId(request.body?.id, "id");
    const triggers = await Trigger.update(id, pickTriggerPatch(request.body));
    response.send(triggers);
  } catch (error) {
    sendError(response, error);
  }
}

export const FrontendTriggerRoutes = [
  {
    path: "/trigger/getAllTriggers",
    method: "get",
    action: withRequiredUser(getAllTriggerInfos),
  },
  {
    path: "/trigger/get/:id",
    method: "get",
    action: withRequiredUser(getTrigger),
  },
  {
    path: "/trigger/delete/",
    method: "post",
    action: withRequiredUser(deleteTriggerInfos),
  },
  {
    path: "/trigger/post",
    method: "post",
    action: withRequiredUser(createTriggerInfos),
  },
  {
    path: "/trigger/update",
    method: "post",
    action: withRequiredUser(updateTriggerInfos),
  },
];
