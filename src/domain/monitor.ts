import type {Streamer} from './types';
export interface LiveResult{live:boolean;sessionId?:string;title?:string;category?:string;avatar?:string}
export const transition=(old:Streamer,result:LiveResult)=>({becameLive:!old.live&&result.live,ended:old.live&&!result.live,newSession:result.live&&!!old.sessionId&&!!result.sessionId&&old.sessionId!==result.sessionId,shouldOpen:result.live&&result.sessionId!==old.openedSessionId});
export class ScanLock{private running=false;async run<T>(task:()=>Promise<T>):Promise<T|null>{if(this.running)return null;this.running=true;try{return await task()}finally{this.running=false}}}
export const shouldAutoStart=(idleMs:number,idleMinutes:number,hasChannels:boolean,status:string,dialogOpen:boolean,enabled:boolean)=>enabled&&hasChannels&&status==='off'&&!dialogOpen&&idleMs>=idleMinutes*60_000;
