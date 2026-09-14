import { connectorResponse } from "../../../api/connector/client.js";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
class FileApiClient {
  async uploadFile(file: Buffer | Uint8Array | AsyncIterable<Uint8Array>, key: string): Promise<string> {
    if (!key || Buffer.byteLength(key) > 255 || /[/\\\r\n\x00"]/.test(key) || key === "." || key === "..") {
      throw new Error("Invalid Dahua file name");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const source = file instanceof Uint8Array ? [file] : file;
    for await (const chunk of source) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_FILE_BYTES) throw new Error("Dahua file exceeds 8 MiB");
      chunks.push(buffer);
    }
    if (!size) throw new Error("Dahua file is empty");
    const response = await connectorResponse("/v1/providers/dahua/files/upload", {
      method: "POST", body: new Uint8Array(Buffer.concat(chunks)),
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": Buffer.from(key).toString("base64url") },
    }, 30000);
    const result = await response.json();
    if (typeof result.path !== "string" || !result.path) throw new Error("Invalid Dahua upload response");
    return result.path;
  }
}
export const fileApiClient = new FileApiClient();
