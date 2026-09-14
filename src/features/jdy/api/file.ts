import { randomUUID } from "node:crypto";
import { connectorResponse } from "../../../api/connector/client.js";

type UploadContext = { appId: string; entryId: string; transactionId: string };
class FileApiClient {
  transaction_id: string;
  private context?: UploadContext;

  /** Legacy initializer: creates a transaction locally; credentials never leave Connect. */
  async uploadToken(app_id: string, entry_id: string) {
    this.context = { appId: app_id, entryId: entry_id, transactionId: randomUUID() };
    this.transaction_id = this.context.transactionId;
  }
  private async upload(context: UploadContext, name: string, buffer: Buffer, mime = "application/octet-stream") {
    const query = new URLSearchParams({ app_id: context.appId, entry_id: context.entryId, transaction_id: context.transactionId });
    const response = await connectorResponse(`/v1/providers/jiandaoyun/files/upload?${query}`, {
      method: "POST", body: new Uint8Array(buffer),
      headers: { "Content-Type": mime, "X-File-Name": Buffer.from(name).toString("base64url"), "X-File-Name-Encoding": "base64url-utf8" },
    });
    return response.json();
  }
  async uploadFileList(files: File[]) {
    const context = this.context;
    if (!context) throw new Error("Initialize Jiandaoyun upload transaction first");
    const results: any[] = [];
    for (const file of files) results.push(await this.upload(context, file.name, Buffer.from(await file.arrayBuffer()), file.type || undefined));
    return results;
  }
  async uploadBuffer(app_id: string, entry_id: string, fileName: string, buffer: Buffer) {
    return (await this.uploadBuffers(app_id, entry_id, [{ fileName, buffer }]))[0];
  }
  async uploadBuffers(app_id: string, entry_id: string, files: Array<{ fileName: string; buffer: Buffer }>) {
    const context = { appId: app_id, entryId: entry_id, transactionId: randomUUID() };
    this.transaction_id = context.transactionId;
    const results: any[] = [];
    for (const file of files) results.push(await this.upload(context, file.fileName, file.buffer));
    return results;
  }
}
export default new FileApiClient();
