import { workflowApiClient } from "../../features/jdy/api/workflow";

export const isTaskFinished = async (taskid: string): Promise<boolean> => {
  const workflow = await workflowApiClient.workflowInstanceGet(taskid);
  const finishTime = workflow["finish_time"];
  if (!finishTime) return false; // 如果没有 finish_time，则返回 false
  return isWithin60Seconds(new Date(workflow["finish_time"]));
};

const isWithin60Seconds = (date: Date): boolean =>
  Math.abs(date.getTime() - Date.now()) <= 100 * 60 * 1000;
