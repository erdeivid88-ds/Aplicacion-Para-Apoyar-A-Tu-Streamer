declare const chrome: any;
import { normalizeKickUrl, waitForKickUrl } from "../src/domain/stream-url";
import { configureManagedKickPlayback } from "../src/domain/kick-playback";
type ManagedTab = {streamerId:string; platform:"twitch"|"kick"; canonicalUrl:string; tabId:number; streamSessionId:string; monitorSessionId:string; createdAt:number; muted:boolean; createdByIntegration:true};
const HOST = "es.vortexstudio.apoyaatustreamer";
const VERSION = 1;
const MAX_IDS = 1000;
let nativePort:any = null;
let applicationConnected = false;
let appSessionId:string|undefined;
let lastHeartbeat = 0;
let watchdog:any;
const requestIds = new Set<string>();
const managed = new Map<number, ManagedTab>();

function safeUrl(platform:unknown, value:unknown) {
  if (platform !== "twitch" && platform !== "kick") throw new Error("invalid_platform");
  if (platform === "kick") {
    const normalized = normalizeKickUrl(value);
    if (!normalized.valid) throw new Error(normalized.reason);
    return normalized.url;
  }
  if (typeof value !== "string" || value.length > 2048) throw new Error("invalid_url");
  const u = new URL(value.trim());
  const hosts = platform === "twitch" ? ["twitch.tv","www.twitch.tv"] : ["kick.com","www.kick.com"];
  const parts = u.pathname.split("/").filter(Boolean);
  if (u.protocol !== "https:" || u.port || u.username || u.password || u.search || u.hash || !hosts.includes(u.hostname.toLowerCase()) || parts.length !== 1 || !/^[a-zA-Z0-9_]{2,30}$/.test(parts[0])) throw new Error("invalid_url");
  return `https://${platform === "twitch" ? "www.twitch.tv" : "kick.com"}/${parts[0].toLowerCase()}`;
}
async function readyKickTab(tabId:number){let tab:any;const diagnostic=await waitForKickUrl(async()=>{tab=await chrome.tabs.get(tabId);return tab?.url;});if(!diagnostic.success){console.warn("[kick-audio-url]",{source:"tab.url",valueType:typeof tab?.url,hasValue:typeof tab?.url==="string"&&tab.url.length>0,absoluteUrl:false,errorCode:diagnostic.errorCode});throw new Error(diagnostic.errorCode);}return{tab,diagnostic};}
function stopKickAudio(tabId:number){return chrome.scripting.executeScript({target:{tabId},func:()=>{const page=window as typeof window&{__apoyaKickAudio?:{observer?:MutationObserver;timers:number[];cancelled:boolean}};const control=page.__apoyaKickAudio;if(control){control.cancelled=true;control.observer?.disconnect();control.timers.forEach(clearTimeout);delete page.__apoyaKickAudio;}}}).catch(()=>undefined);}
function inactive() { applicationConnected=false; appSessionId=undefined; lastHeartbeat=0; requestIds.clear(); clearTimeout(watchdog); watchdog=undefined;for(const item of managed.values())if(item.platform==="kick")void stopKickAudio(item.tabId); }
function armWatchdog() { clearTimeout(watchdog); watchdog=setTimeout(inactive, 30001); }
function response(m:any, success:boolean, payload:any={}, error?:string) { nativePort?.postMessage({protocolVersion:VERSION,requestId:m?.requestId ?? "unknown",success,...(success?{payload}:{error:error ?? "rejected"})}); }
function validate(m:any, handshake=false) {
  if (!m || m.protocolVersion !== VERSION || typeof m.requestId !== "string" || !m.requestId || typeof m.appSessionId !== "string" || !m.appSessionId || typeof m.action !== "string" || !m.payload || typeof m.payload !== "object") throw new Error("invalid_message");
  if (requestIds.has(m.requestId)) throw new Error("duplicate_request");
  requestIds.add(m.requestId); if (requestIds.size > MAX_IDS) requestIds.delete(requestIds.values().next().value);
  if (!handshake && (!applicationConnected || m.appSessionId !== appSessionId || Date.now()-lastHeartbeat > 30000)) throw new Error("inactive_session");
}
async function exact(m:any) { const tabId=Number(m.payload.tabId); const item=managed.get(tabId); if (!item)throw new Error("not_managed");if(m.action!=="configure_audio"&&(item.streamerId!==m.payload.streamerId||item.platform!==m.payload.platform||item.streamSessionId!==m.payload.streamSessionId||item.monitorSessionId!==m.payload.monitorSessionId))throw new Error("not_managed"); const ready=item.platform==="kick"?await readyKickTab(tabId):undefined;const tab=ready?.tab??await chrome.tabs.get(tabId); if (safeUrl(item.platform,tab.url)!==item.canonicalUrl) throw new Error("url_changed"); return {item,tab,diagnostic:ready?.diagnostic}; }
async function configureKickPlayer(tabId:number, volume:number) {
  const [result]=await chrome.scripting.executeScript({target:{tabId},func:async(configuredVolume:number)=>{
    if(location.protocol!=="https:"||!(location.hostname==="kick.com"||location.hostname==="www.kick.com"))return{playerFound:false,playerMutedBefore:null,playerMutedAfter:null,playerVolumeBefore:null,playerVolumeAfter:null,muteButtonFound:false,muteButtonClicked:false,playbackReady:false,attempts:0,errorCode:"NOT_KICK_TAB"};
    const page=window as typeof window&{__apoyaKickAudio?:{observer?:MutationObserver;timers:number[];cancelled:boolean;attempts:number;last?:unknown}};
    if(page.__apoyaKickAudio){page.__apoyaKickAudio.cancelled=true;page.__apoyaKickAudio.observer?.disconnect();page.__apoyaKickAudio.timers.forEach(clearTimeout);}
    const control={timers:[] as number[],cancelled:false,attempts:0} as {observer?:MutationObserver;timers:number[];cancelled:boolean;attempts:number;last?:unknown};page.__apoyaKickAudio=control;
    const buttonState=(button:HTMLElement|undefined)=>button?(button.getAttribute("aria-label")??button.getAttribute("title")??button.getAttribute("aria-pressed")??""):undefined;
    const attempt=()=>{if(control.cancelled)return;
      const videos=[...document.querySelectorAll("video")].filter((video)=>{const box=video.getBoundingClientRect();return box.width>200&&box.height>100&&getComputedStyle(video).visibility!=="hidden";}) as HTMLVideoElement[];
      const video=videos.sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0];
      const buttons=[...document.querySelectorAll<HTMLElement>('[role="button"],button')];
      const muteButton=buttons.find((candidate)=>/mute|unmute|silenciar|activar sonido|desmutear/i.test(buttonState(candidate)??""));
      const before=video?{playerMutedBefore:video.muted,playerVolumeBefore:video.volume}:{playerMutedBefore:null,playerVolumeBefore:null};const stateBefore=buttonState(muteButton);
      if(video){video.muted=false;video.defaultMuted=false;if(configuredVolume>0)video.volume=configuredVolume;video.dispatchEvent(new Event("volumechange",{bubbles:true}));}
      let clicked=false;
      if(muteButton&&video&&(video.muted||video.volume===0)){muteButton.click();clicked=true;}
      control.attempts++;control.last={playerFound:Boolean(video),...before,playerMutedAfter:video?.muted??null,playerVolumeAfter:video?.volume??null,muteButtonFound:Boolean(muteButton),muteButtonStateBefore:stateBefore,muteButtonClicked:clicked,muteButtonStateAfter:buttonState(muteButton),attempts:control.attempts,playbackReady:Boolean(video&&!video.muted&&video.volume>0)};
      return control.last;
    };
    control.observer=new MutationObserver(()=>void attempt());control.observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener("loadedmetadata",attempt,{once:true,capture:true});document.addEventListener("playing",attempt,{once:true,capture:true});document.addEventListener("canplay",attempt,{once:true,capture:true});
    for(const delay of [0,250,250,500,1000,2000]){if(delay)await new Promise(resolve=>setTimeout(resolve,delay));const state=attempt() as any;if(state?.playbackReady)return state;}
    control.observer?.disconnect();control.cancelled=true;return control.last??{playerFound:false,playerMutedBefore:null,playerMutedAfter:null,playerVolumeBefore:null,playerVolumeAfter:null,muteButtonFound:false,muteButtonClicked:false,playbackReady:false,attempts:control.attempts};
  },args:[volume]});
  return result?.result;
}
async function onMessage(m:any) {
  try {
    if (m?.action === "handshake") { validate(m,true); inactive(); requestIds.add(m.requestId); applicationConnected=true; appSessionId=m.appSessionId; lastHeartbeat=Date.now(); armWatchdog(); response(m,true,{extensionVersion:chrome.runtime.getManifest().version,browser:navigator.userAgent.includes("Edg/")?"edge":"chrome",connected:true}); return; }
    validate(m);
    if (m.action === "heartbeat") { lastHeartbeat=Date.now(); armWatchdog(); response(m,true,{connected:true}); return; }
    if (m.action === "ping") { response(m,true,{connected:true,extensionVersion:chrome.runtime.getManifest().version,browser:navigator.userAgent.includes("Edg/")?"edge":"chrome",managedTabs:managed.size}); return; }
    if (m.action === "open_stream") {
      const p=m.payload; const canonicalUrl=safeUrl(p.platform,p.url); for (const item of managed.values()) if(item.streamerId===p.streamerId&&item.streamSessionId===p.streamSessionId){item.monitorSessionId=p.monitorSessionId;await chrome.tabs.get(item.tabId);const updated=await chrome.tabs.update(item.tabId,{muted:p.muted===true});item.muted=Boolean(updated.mutedInfo?.muted);await chrome.storage.session.set({managedTabs:[...managed.values()]});response(m,true,{...item,created:false,muted:item.muted});return;}
      const tab=await chrome.tabs.create({url:canonicalUrl,active:p.active===true}); if(typeof tab.id!=="number") throw new Error("missing_tab_id"); const updated=p.muted===false?tab:await chrome.tabs.update(tab.id,{muted:true}); const item:ManagedTab={streamerId:p.streamerId,platform:p.platform,canonicalUrl,tabId:tab.id,streamSessionId:p.streamSessionId,monitorSessionId:p.monitorSessionId,createdAt:Date.now(),muted:Boolean(updated.mutedInfo?.muted),createdByIntegration:true}; managed.set(tab.id,item); await chrome.storage.session.set({managedTabs:[...managed.values()]}); response(m,true,{...item,created:true}); return;
    }
    if (m.action === "get_stream_tabs") { response(m,true,{tabs:[...managed.values()]}); return; }
    if (m.action === "close_all_managed_streams") { const ids=[...managed.keys()]; if(ids.length) await chrome.tabs.remove(ids); managed.clear(); await chrome.storage.session.remove("managedTabs"); response(m,true,{closed:ids.length}); return; }
    const {item,tab,diagnostic}=await exact(m);
    if(m.action==="configure_audio"){
      if(item.platform!=="kick"){response(m,true,{tabId:item.tabId,tabMuted:Boolean(tab.mutedInfo?.muted),playerMuted:undefined,audioConfigured:true});return;}
      const enabled=m.payload.enabled!==false;const volume=Math.min(1,Math.max(0,Number(m.payload.targetVolume??1)));
      if(!enabled){await stopKickAudio(item.tabId);const muted=await chrome.tabs.update(item.tabId,{muted:true});item.muted=Boolean(muted.mutedInfo?.muted);response(m,true,{tabId:item.tabId,browserTabMuted:item.muted,playerMuted:null,audioConfigured:true,attempts:0});return;}
      if(!applicationConnected||m.appSessionId!==appSessionId||Date.now()-lastHeartbeat>30000)throw new Error("inactive_session");
      const playback=await configureManagedKickPlayback("browserTab",()=>configureKickPlayer(item.tabId,volume),async()=>{await chrome.tabs.update(item.tabId,{muted:true});},async()=>Boolean((await chrome.tabs.get(item.tabId)).mutedInfo?.muted));item.muted=playback.browserTabMutedAfter??false;
      response(m,playback.success,{tabId:item.tabId,...playback,audioConfigured:playback.success,audioAttempted:true,audioSuccess:playback.success,...diagnostic,actionTaken:"player_unmuted_then_tab_muted"},playback.errorCode);return;
    }
    if(m.action==="mute_stream"||m.action==="unmute_stream"){const muted=m.action==="mute_stream";const updated=await chrome.tabs.update(item.tabId,{muted});item.muted=Boolean(updated.mutedInfo?.muted);response(m,true,{tabId:item.tabId,muted:item.muted});return;}
    if(m.action==="focus_stream"){await chrome.windows.update(tab.windowId,{focused:true});await chrome.tabs.update(item.tabId,{active:true});response(m,true,{tabId:item.tabId});return;}
    if(m.action==="release_stream"){managed.delete(item.tabId);await chrome.storage.session.set({managedTabs:[...managed.values()]});response(m,true,{released:true});return;}
    if(m.action==="close_stream"){managed.delete(item.tabId);await chrome.tabs.remove(item.tabId);await chrome.storage.session.set({managedTabs:[...managed.values()]});response(m,true,{closed:true});return;}
    throw new Error("unknown_action");
  } catch(e) { response(m,false,{},e instanceof Error?e.message:"rejected"); }
}
async function restoreIdentityOnly(){const saved=await chrome.storage.session.get("managedTabs");for(const item of saved.managedTabs??[]){try{const tab=await chrome.tabs.get(item.tabId);if(safeUrl(item.platform,tab.url)===item.canonicalUrl)managed.set(item.tabId,item);}catch{managed.delete(item.tabId);}}await chrome.storage.session.set({managedTabs:[...managed.values()]});}
function connect(){inactive();try{nativePort=chrome.runtime.connectNative(HOST);nativePort.onMessage.addListener(onMessage);nativePort.onDisconnect.addListener(()=>{nativePort=null;inactive();});}catch{nativePort=null;inactive();void chrome.runtime.lastError;}}
chrome.tabs.onRemoved.addListener(async(tabId:number)=>{const item=managed.get(tabId);if(!item)return;managed.delete(tabId);await chrome.storage.session.set({managedTabs:[...managed.values()]});if(applicationConnected&&nativePort)nativePort.postMessage({protocolVersion:VERSION,requestId:crypto.randomUUID(),success:true,event:"managed_tab_closed",payload:{streamerId:item.streamerId,platform:item.platform,streamSessionId:item.streamSessionId,monitorSessionId:item.monitorSessionId,reason:"user_closed"}});});
chrome.tabs.onUpdated.addListener(async(tabId:number,change:any,tab:any)=>{const item=managed.get(tabId);if(!item||!applicationConnected||Date.now()-lastHeartbeat>30000)return;try{if(change.url&&safeUrl(item.platform,tab.url)!==item.canonicalUrl){managed.delete(tabId);return;}if(item.muted&&!tab.mutedInfo?.muted)await chrome.tabs.update(tabId,{muted:true});}catch{managed.delete(tabId);}});
chrome.runtime.onMessage.addListener((message:any,_sender:any,sendResponse:(value:any)=>void)=>{if(message?.action!=="status")return false;if(!nativePort)connect();sendResponse({connected:applicationConnected&&Date.now()-lastHeartbeat<=30000,monitorStatus:"La aplicación informa su estado mediante heartbeat",managedTabs:managed.size,version:chrome.runtime.getManifest().version});return false;});
void restoreIdentityOnly().then(connect);
