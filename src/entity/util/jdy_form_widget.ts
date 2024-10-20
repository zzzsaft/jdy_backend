import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ name: "util_form_widget", schema: "jdy" })
// @Unique(["app_id", "entry_id",'name'])
export class JdyWidget extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  app_id: string;
  @Column()
  entry_id: string;
  @Column()
  name: string;
  @Column()
  label: string;
  @Column()
  widgetName: string;
  @Column()
  type: string;
  @Column()
  is_delete: boolean;
  @ManyToOne(() => JdyWidget, (widget) => widget.subforms, { nullable: true })
  parent: JdyWidget | null;
  @OneToMany(() => JdyWidget, (widget) => widget.parent)
  subforms: JdyWidget[];

  static async insertWidgets(appId: string, entryId: string, widgets: any[]) {
    const existingWidgets = await JdyWidget.find({
      where: { app_id: appId, entry_id: entryId },
      relations: ["subforms"],
    });

    // Mark existing widgets as deleted if not found in the new set
    await JdyWidget.markMissingWidgets(existingWidgets, widgets);

    // Insert or update widgets
    for (const widgetData of widgets) {
      const existWidget = JdyWidget.findWidget(
        existingWidgets,
        widgetData.name
      );
      const widget = await JdyWidget.insertOrUpdateWidget(
        appId,
        entryId,
        widgetData,
        existWidget
      );

      // Handle subforms if they exist
      if (widgetData.items) {
        await JdyWidget.insertSubforms(
          appId,
          entryId,
          widget,
          widgetData.items
        );
      }
    }
  }

  // Function to mark missing widgets as deleted
  static async markMissingWidgets(
    existingWidgets: JdyWidget[],
    widgets: any[]
  ) {
    for (const existWidget of existingWidgets) {
      const isPresent = widgets.find((w) => w.name === existWidget.name);
      if (!isPresent && !existWidget.is_delete) {
        existWidget.is_delete = true;
        await JdyWidget.save(existWidget);
      }
    }
  }

  // Function to find existing widget
  static findWidget(
    existingWidgets: JdyWidget[],
    widgetName: string
  ): JdyWidget | undefined {
    return existingWidgets.find((widget) => widget.name === widgetName);
  }

  // Function to insert or update a widget
  static async insertOrUpdateWidget(
    appId: string,
    entryId: string,
    widgetData: any,
    existWidget: JdyWidget | undefined
  ) {
    if (existWidget) {
      existWidget.is_delete = false; // Restore if it was marked as deleted
      return await JdyWidget.save(existWidget);
    }

    // Create new widget if it doesn't exist
    return await JdyWidget.insertWidget(appId, entryId, widgetData);
  }

  // Function to handle subforms
  static async insertSubforms(
    appId: string,
    entryId: string,
    parentWidget: JdyWidget,
    subformWidgets: any[]
  ) {
    for (const subformWidget of subformWidgets) {
      const existSubform = parentWidget.subforms.find(
        (subform) => subform.name === subformWidget.name
      );
      if (!existSubform) {
        await JdyWidget.insertWidget(
          appId,
          entryId,
          subformWidget,
          parentWidget
        );
      }
    }
  }

  static async insertWidget(
    appId: string,
    entryId: string,
    widgetData: any,
    parent: JdyWidget | null = null
  ) {
    const { name, widgetName, label, type } = widgetData;

    const widget = new JdyWidget();
    widget.app_id = appId;
    widget.entry_id = entryId;
    widget.name = name;
    widget.widgetName = widgetName;
    widget.label = label;
    widget.type = type;
    widget.parent = parent; // Set parent widget

    return await JdyWidget.save(widget);
  }
}
