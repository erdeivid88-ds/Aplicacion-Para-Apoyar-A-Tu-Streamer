export const MAX_MESSAGE_BYTES = 64 * 1024;
export function encodeNativeMessage(value: unknown) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  if (!body.length || body.length > MAX_MESSAGE_BYTES) throw new Error("Longitud no válida.");
  const frame = Buffer.allocUnsafe(body.length + 4);
  frame.writeUInt32LE(body.length, 0); body.copy(frame, 4); return frame;
}
export class NativeMessageDecoder {
  private buffer = Buffer.alloc(0);
  push(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]); const result: unknown[] = [];
    while (this.buffer.length >= 4) { const size=this.buffer.readUInt32LE(0); if(!size||size>MAX_MESSAGE_BYTES) throw new Error("Longitud no válida."); if(this.buffer.length<size+4)break; const raw=this.buffer.subarray(4,size+4).toString("utf8"); this.buffer=this.buffer.subarray(size+4); result.push(JSON.parse(raw)); }
    return result;
  }
}
