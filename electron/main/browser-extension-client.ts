import net from "node:net";
import { randomUUID } from "node:crypto";
import { NativeMessageDecoder, encodeNativeMessage } from "../../native-host/src/framing";
import { PROTOCOL_VERSION, type BrowserAction } from "../../src/domain/browser-protocol";

const PIPE = "\\\\.\\pipe\\apoya-a-tu-streamer-native-v1";
export class BrowserExtensionClient {
  readonly appSessionId = randomUUID();
  private server?: net.Server; private socket?: net.Socket; private heartbeat?: NodeJS.Timeout;
  private pending = new Map<string,{resolve:(v:any)=>void,reject:(e:Error)=>void,timer:NodeJS.Timeout}>();
  constructor(private appVersion:string, private monitorStatus:()=>string, private changed:(status:Record<string,unknown>)=>void) {}
  start(){this.server=net.createServer(socket=>this.attach(socket));this.server.on("error",error=>this.changed({connected:false,nativeHostConnected:false,lastError:error.message}));this.server.listen(PIPE);}
  private attach(socket:net.Socket){this.socket?.destroy();this.socket=socket;const decoder=new NativeMessageDecoder();this.changed({nativeHostConnected:true,lastCommunication:new Date().toISOString()});socket.on("data",chunk=>{try{for(const message of decoder.push(Buffer.from(chunk)))this.receive(message as any)}catch{socket.destroy();}});socket.on("close",()=>this.disconnect("Native Messaging desconectado."));void this.request("handshake",{appVersion:this.appVersion,monitorStatus:this.monitorStatus()}).then(payload=>{this.changed({connected:true,sessionActive:true,...payload,lastError:undefined});this.heartbeat=setInterval(()=>void this.request("heartbeat",{timestamp:Date.now(),monitorStatus:this.monitorStatus()}).then(()=>this.changed({lastHeartbeat:new Date().toISOString()})).catch(()=>undefined),10000);}).catch(error=>this.disconnect(error.message));}
  private receive(message:any){this.changed({lastCommunication:new Date().toISOString()});if(message?.event==="stream_closed"||message?.event==="managed_tab_closed"){this.changed({lastClosedStream:message.payload});return;}const item=this.pending.get(message?.requestId);if(!item)return;clearTimeout(item.timer);this.pending.delete(message.requestId);if(message.success)item.resolve(message.payload);else item.reject(new Error(message.error??"Extensión rechazada."));}
  request(action:BrowserAction,payload:Record<string,unknown>={}){return new Promise<any>((resolve,reject)=>{if(!this.socket||this.socket.destroyed){reject(new Error("Extensión no disponible."));return;}const requestId=randomUUID();const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error("Tiempo de espera de la extensión agotado."));},5000);this.pending.set(requestId,{resolve,reject,timer});this.socket.write(encodeNativeMessage({protocolVersion:PROTOCOL_VERSION,requestId,appSessionId:this.appSessionId,action,payload}));});}
  isConnected(){return Boolean(this.socket&&!this.socket.destroyed);}
  private disconnect(reason:string){clearInterval(this.heartbeat);this.heartbeat=undefined;this.socket=undefined;for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error(reason));}this.pending.clear();this.changed({connected:false,nativeHostConnected:false,sessionActive:false,lastError:reason});}
  stop(){clearInterval(this.heartbeat);this.socket?.destroy();this.server?.close();this.disconnect("Aplicación cerrada.");}
}
