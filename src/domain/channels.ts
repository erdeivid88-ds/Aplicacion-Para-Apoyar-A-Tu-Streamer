import type {Platform,Streamer} from './types';
const NAME=/^[a-zA-Z0-9_]{2,30}$/; const ID=/^[a-zA-Z0-9_-]{2,64}$/;
export const normalizeName=(v:string)=>v.trim().toLowerCase();
export function parseChannelUrl(value:string):{platform:Platform;name:string;url:string}|null{try{const u=new URL(value.trim());if(u.protocol!=='https:')return null;const host=u.hostname.toLowerCase().replace(/^www\./,'');const platform=host==='twitch.tv'?'twitch':host==='kick.com'?'kick':null;const parts=u.pathname.split('/').filter(Boolean);if(!platform||parts.length!==1||!NAME.test(parts[0]))return null;const name=normalizeName(parts[0]);return{platform,name,url:`https://${platform==='twitch'?'www.twitch.tv':'kick.com'}/${name}`};}catch{return null}}
export const validName=(v:string)=>NAME.test(v.trim()); export const validExternalId=(v:string)=>ID.test(v.trim());
export const isDuplicate=(items:Streamer[],candidate:Pick<Streamer,'platform'|'normalizedName'|'externalId'>)=>items.some(x=>x.platform===candidate.platform&&((candidate.externalId&&x.externalId===candidate.externalId)||x.normalizedName===candidate.normalizedName));
