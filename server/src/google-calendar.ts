import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

const calendarScope='https://www.googleapis.com/auth/calendar.events.owned';
const authEndpoint=()=>process.env.GOOGLE_OAUTH_AUTH_URL||'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint=()=>process.env.GOOGLE_OAUTH_TOKEN_URL||'https://oauth2.googleapis.com/token';
const revokeEndpoint=()=>process.env.GOOGLE_OAUTH_REVOKE_URL||'https://oauth2.googleapis.com/revoke';
const calendarApi=()=>process.env.GOOGLE_CALENDAR_API_BASE_URL||'https://www.googleapis.com/calendar/v3';

export class CalendarAuthorizationError extends Error {}
export class CalendarConfigurationError extends Error {}
export class GoogleCalendarApiError extends Error {constructor(message:string,public status:number){super(message)}}

const credentials=()=>{
  const clientId=process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret=process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri=process.env.GOOGLE_REDIRECT_URI?.trim();
  if(!clientId||!clientSecret||!redirectUri)throw new CalendarConfigurationError('Google Calendar is not configured for this environment.');
  return{clientId,clientSecret,redirectUri};
};

const encryptionKey=()=>{
  const raw=process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if(!raw)throw new CalendarConfigurationError('Google Calendar token encryption is not configured.');
  const key=/^[a-f\d]{64}$/i.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64');
  if(key.length!==32)throw new CalendarConfigurationError('GOOGLE_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes.');
  return key;
};

export const googleCalendarConfigured=()=>{
  try{credentials();encryptionKey();return true}catch{return false}
};

export const encryptToken=(value:string)=>{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv),encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return`${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
};

export const decryptToken=(value:string)=>{
  const[iv,tag,data]=value.split('.').map(part=>Buffer.from(part,'base64url'));
  if(!iv||!tag||!data)throw new CalendarAuthorizationError('Reconnect Google Calendar to continue syncing.');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
};

export const googleAuthorizationUrl=(state:string)=>{
  const{clientId,redirectUri}=credentials(),url=new URL(authEndpoint());
  url.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:calendarScope,access_type:'offline',include_granted_scopes:'true',prompt:'consent',state}).toString();
  return url.toString();
};

const parseGoogleResponse=async(response:Response)=>{
  const text=await response.text();
  let body:any={};try{body=text?JSON.parse(text):{}}catch{body={}}
  if(!response.ok){
    const detail=body?.error_description||body?.error?.message||body?.error||'Google Calendar request failed.';
    if(response.status===401||detail==='invalid_grant')throw new CalendarAuthorizationError('Google Calendar authorization expired. Reconnect to resume syncing.');
    throw new GoogleCalendarApiError(String(detail),response.status);
  }
  return body;
};

export const exchangeAuthorizationCode=async(code:string,fetchImpl:typeof fetch=fetch)=>{
  const{clientId,clientSecret,redirectUri}=credentials();
  const response=await fetchImpl(tokenEndpoint(),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'}),signal:AbortSignal.timeout(10_000)});
  return parseGoogleResponse(response);
};

export const refreshGoogleToken=async(refreshToken:string,fetchImpl:typeof fetch=fetch)=>{
  const{clientId,clientSecret}=credentials();
  const response=await fetchImpl(tokenEndpoint(),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({refresh_token:refreshToken,client_id:clientId,client_secret:clientSecret,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10_000)});
  return parseGoogleResponse(response);
};

export const revokeGoogleToken=async(token:string,fetchImpl:typeof fetch=fetch)=>{
  try{await fetchImpl(revokeEndpoint(),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),signal:AbortSignal.timeout(5_000)})}catch{/* Disconnecting Consulting Hub must not depend on Google's availability. */}
};

export const deterministicEventId=(plannedInteractionId:string)=>`ch${createHash('sha256').update(plannedInteractionId).digest('hex').slice(0,40)}`;

export const calendarEventBody=(planned:any,contact:any,appBaseUrl?:string)=>{
  const contactName=[contact.firstName,contact.lastName].filter(Boolean).join(' '),type=String(planned.type).toLowerCase().replaceAll('_',' ').replace(/^./,x=>x.toUpperCase()),end=new Date(new Date(planned.scheduledAt).getTime()+planned.durationMinutes*60_000),description=[`Contact: ${contactName}`,contact.company?.name?`Firm: ${contact.company.name}`:'',planned.notes?`Notes: ${planned.notes}`:'',appBaseUrl?`Consulting Hub: ${appBaseUrl.replace(/\/$/,'')}/#/networking/${contact.id}`:''].filter(Boolean).join('\n');
  return{summary:`${type} — ${contactName}${contact.company?.name?` (${contact.company.name})`:''}`,description,location:planned.location||undefined,start:{dateTime:new Date(planned.scheduledAt).toISOString(),timeZone:planned.timezone},end:{dateTime:end.toISOString(),timeZone:planned.timezone},extendedProperties:{private:{consultingHubPlannedInteractionId:planned.id}}};
};

type CalendarRequest={method:'POST'|'PATCH'|'DELETE';eventId?:string;body?:any;accessToken:string;fetchImpl?:typeof fetch};
export const googleCalendarRequest=async({method,eventId,body,accessToken,fetchImpl=fetch}:CalendarRequest)=>{
  const path=eventId?`/calendars/primary/events/${encodeURIComponent(eventId)}`:'/calendars/primary/events',response=await fetchImpl(`${calendarApi()}${path}`,{method,headers:{authorization:`Bearer ${accessToken}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8_000)});
  if(method==='DELETE'&&response.status===404)return null;
  return parseGoogleResponse(response);
};
