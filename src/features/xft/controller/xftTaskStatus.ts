const processStatusLabels: Record<string, string> = {
  "0": "审批中",
  "1": "已通过",
  "2": "已否决",
  "3": "已退回",
  "4": "撤销",
  "5": "撤回",
};

export const isPendingXftTask = (dealStatus: string) => dealStatus === "0";

export const getXftTaskStatus = (
  dealStatus: string,
  processStatus: string
) => {
  if (dealStatus === "2") return "已撤销";

  // The current task has been approved when its dealStatus is completed while
  // the overall process is still waiting at a later approval node.
  if (dealStatus === "1" && processStatus === "0") return "已通过";

  return processStatusLabels[processStatus] ?? "已处理";
};
