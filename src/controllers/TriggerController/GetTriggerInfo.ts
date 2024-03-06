import { Request, Response } from "express";
import { Trigger } from "../../entity/Trigger/Trigger";

/**
 * Loads all posts from the database.
 */
export async function GetAllTriggerInfos(request: Request, response: Response) {
  const triggers = await Trigger.find({
    relations: ["trigger_actions"],
  });

  // return loaded posts
  response.send(triggers);
}
