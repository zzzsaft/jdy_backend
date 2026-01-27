import { JdyWidget } from "../../../entity/util/jdy_form_widget";
import { formApiClient } from "../api/form";

export const insertWidgets = async (appId: string, entryId: string) => {
  const widgets = await formApiClient.formWidgets(appId, entryId);
  await widgetService(appId, entryId, widgets["widgets"]);
};
const widgetService = async (appid, entryid, widgets) => {
  await new WidgetService(appid, entryid).insertOrUpdateWidgets(widgets);
};
class WidgetService {
  constructor(private appId: string, private entryId: string) {}
  async insertOrUpdateWidgets(widgets: any[]) {
    const existingWidgets = await JdyWidget.find({
      where: { app_id: this.appId, entry_id: this.entryId },
      relations: ["subforms"],
    });

    // 获取所有传入的widget和subform的name列表
    const incomingWidgetNames = this.getAllWidgetNames(widgets);

    const savedWidgets = await this.processWidgets(widgets, existingWidgets);

    // Mark missing widgets as deleted
    await this.markMissingWidgets(existingWidgets, incomingWidgetNames);

    return savedWidgets;
  }

  // 递归获取传入的所有widget及其子表单的name
  private getAllWidgetNames(widgets: any[]): string[] {
    let names: string[] = [];
    for (const widget of widgets) {
      names.push(widget.name);
      if (widget.items && widget.items.length > 0) {
        names = names.concat(this.getAllWidgetNames(widget.items)); // 递归处理subform
      }
    }
    return names;
  }

  // 处理传入的widget及其子表单
  private async processWidgets(widgets: any[], existingWidgets: JdyWidget[]) {
    let savedWidgets: JdyWidget[] = [];

    for (const widgetData of widgets) {
      let newWidget;
      let existingWidget = existingWidgets.find(
        (widget) => widget.name === widgetData.name
      );

      if (!existingWidget) {
        // 新增widget
        newWidget = this.createWidgetInstance(widgetData);
        savedWidgets.push(newWidget);
      } else {
        // 更新已有widget
        existingWidget = this.updateWidgetInstance(existingWidget, widgetData);
        savedWidgets.push(existingWidget);
      }

      if (widgetData.items) {
        const childWidgets = await this.processWidgets(
          widgetData.items,
          existingWidget?.subforms || []
        );
        for (const childWidget of childWidgets) {
          childWidget.parent = existingWidget ?? newWidget; // 关联parent
        }
        savedWidgets.push(...childWidgets);
      }
    }

    // 批量保存所有 widgets
    return await JdyWidget.save(savedWidgets);
  }

  // 创建新的widget实例
  private createWidgetInstance(
    widgetData: any,
    parent: JdyWidget | null = null
  ): JdyWidget {
    const widget = new JdyWidget();
    widget.app_id = this.appId;
    widget.entry_id = this.entryId;
    widget.name = widgetData.name;
    widget.widgetName = widgetData.widgetName;
    widget.label = widgetData.label;
    widget.type = widgetData.type;
    widget.is_delete = false;
    widget.parent = parent; // 设置父 widget，如果有的话
    return widget;
  }

  // 更新现有的widget实例
  private updateWidgetInstance(widget: JdyWidget, widgetData: any): JdyWidget {
    widget.widgetName = widgetData.widgetName;
    widget.label = widgetData.label;
    widget.type = widgetData.type;
    widget.is_delete = false;
    return widget;
  }

  // 标记缺失的widgets为已删除
  private async markMissingWidgets(
    existingWidgets: JdyWidget[],
    incomingNames: string[]
  ) {
    const widgetsToDelete = existingWidgets.filter(
      (widget) => !incomingNames.includes(widget.name)
    );

    for (const widget of widgetsToDelete) {
      widget.is_delete = true;
    }

    // 批量保存标记删除的widgets
    await JdyWidget.save(widgetsToDelete);
  }
}
