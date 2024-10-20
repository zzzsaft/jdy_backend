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

@Entity({ name: "form_widget", schema: "jdy" })
@Unique(["app_id", "entry_id", "name"])
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
  is_delete: boolean = false;
  @Column({ nullable: true })
  jdy_id: string;
  @ManyToOne(() => JdyWidget, (widget) => widget.subforms, { nullable: true })
  parent: JdyWidget | null;
  @OneToMany(() => JdyWidget, (widget) => widget.parent)
  subforms: JdyWidget[];

  // Function to find existing widget
  static findWidget(
    existingWidgets: JdyWidget[],
    widgetName: string
  ): JdyWidget | undefined {
    return existingWidgets.find((widget) => widget.name === widgetName);
  }

  static async insertWidgets(appId: string, entryId: string, widgets: any[]) {
    const existingWidgets = await JdyWidget.find({
      where: { app_id: appId, entry_id: entryId },
      relations: ["subforms"],
    });

    // Mark existing widgets as deleted if not found in the new set
    const widgetsToSave = [];
    await JdyWidget.markMissingWidgets(existingWidgets, widgets, widgetsToSave);

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
        existWidget,
        widgetsToSave
      );

      // Handle subforms if they exist
      if (widgetData.items) {
        await JdyWidget.insertSubforms(
          appId,
          entryId,
          widget,
          widgetData.items,
          widgetsToSave
        );
      }
    }

    // Batch save all accumulated widgets at once
    if (widgetsToSave.length > 0) {
      await JdyWidget.save(widgetsToSave);
    }
  }

  // Function to mark missing widgets as deleted
  static async markMissingWidgets(
    existingWidgets: JdyWidget[],
    widgets: any[],
    widgetsToSave: JdyWidget[]
  ) {
    for (const existWidget of existingWidgets) {
      const isPresent = widgets.find((w) => w.name === existWidget.name);
      if (!isPresent && !existWidget.is_delete) {
        existWidget.is_delete = true;
        widgetsToSave.push(existWidget); // Accumulate the widget to save later
      }
    }
  }

  // Function to insert or update a widget and accumulate for batch saving
  static async insertOrUpdateWidget(
    appId: string,
    entryId: string,
    widgetData: any,
    existWidget: JdyWidget | undefined,
    widgetsToSave: JdyWidget[]
  ) {
    if (existWidget) {
      existWidget.is_delete = false; // Restore if it was marked as deleted
      widgetsToSave.push(existWidget); // Accumulate the widget to save later
      return existWidget;
    }

    // Create new widget if it doesn't exist and accumulate for batch saving
    const newWidget = await JdyWidget.createWidget(appId, entryId, widgetData);
    widgetsToSave.push(newWidget); // Accumulate the widget to save later
    return newWidget;
  }

  // Function to handle subforms and accumulate for batch saving
  static async insertSubforms(
    appId: string,
    entryId: string,
    parentWidget: JdyWidget,
    subformWidgets: any[],
    widgetsToSave: JdyWidget[]
  ) {
    for (const subformWidget of subformWidgets) {
      const existSubform = parentWidget.subforms?.find(
        (subform) => subform.name === subformWidget.name
      );
      if (!existSubform) {
        const newSubform = await JdyWidget.createWidget(
          appId,
          entryId,
          subformWidget,
          parentWidget
        );
        widgetsToSave.push(newSubform); // Accumulate the subform widget to save later
      }
    }
  }

  // Function to create a widget (used in place of save)
  static async createWidget(
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

    return widget;
  }
}
