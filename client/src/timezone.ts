/** Convert wall-clock input in an explicit IANA zone; reject nonexistent DST times. */
export function zonedInput(instant: string, timezone: string) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const get=(key:string)=>parts.find(x=>x.type===key)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function zonedInstant(input: string, timezone: string, original?: string) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))throw new Error('Choose a valid date and time.');
  // Preserve the original instant, including its offset during a repeated DST hour.
  if(original&&zonedInput(original,timezone)===input)return original;
  const desired=Date.parse(input+':00.000Z');let result=desired;
  for(let i=0;i<4;i++)result+=desired-Date.parse(zonedInput(new Date(result).toISOString(),timezone)+':00.000Z');
  if(zonedInput(new Date(result).toISOString(),timezone)!==input)throw new Error('That time does not exist in this timezone because of daylight saving time. Choose another time.');
  return new Date(result).toISOString();
}
