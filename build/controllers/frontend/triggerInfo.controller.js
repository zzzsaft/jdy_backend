import { Trigger } from "../../entity/Trigger/Trigger";
/**
 * Loads all posts from the database.
 */
export async function GetAllTriggerInfos(request, response) {
    const triggers = await Trigger.find({
        relations: ["trigger_actions"],
    });
    // return loaded posts
    response.send(triggers);
}
export const GetTrigger = async (request, response) => {
    const trigger = await Trigger.findOne({
        where: { id: parseInt(request.params.id) },
        relations: [
            "trigger_actions",
            "trigger_actions.execute_action_contents",
            "trigger_actions.execute_action_conditions",
            "trigger_conditions",
        ],
    });
    // return loaded posts
    response.send(trigger);
};
export async function createTriggerInfos(request, response) {
    const trigger = Trigger.create(request.body);
    await trigger.save();
    response.send(trigger);
}
export async function deleteTriggerInfos(request, response) {
    await Trigger.delete(request.body.id);
    response.send({ id: request.params.id });
}
export async function updateTriggerInfos(request, response) {
    const req = request.body;
    const triggers = await Trigger.update(req.id, req);
    // return loaded posts
    response.send(triggers);
}
//# sourceMappingURL=triggerInfo.controller.js.map