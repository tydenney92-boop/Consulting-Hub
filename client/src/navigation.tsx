import React, {createContext, useContext, useLayoutEffect, useState} from 'react';

export type RecordKind = 'company' | 'opportunity' | 'application' | 'contact' | 'interview' | 'task' | 'document';
const sections: Record<RecordKind, string> = {company:'firms',opportunity:'opportunities',application:'applications',contact:'networking',interview:'interviews',task:'tasks',document:'documents'};
export const recordPath = (kind: RecordKind, id: string) => `#/${sections[kind]}/${encodeURIComponent(id)}`;
export function parseRoute(hash: string) {
  const [path, query=''] = (hash || '#/dashboard').split('?');
  const [, section='dashboard', encodedId] = path.split('/');
  const kind = (Object.keys(sections) as RecordKind[]).find(key => sections[key] === section);
  let id: string | undefined;
  try {id = encodedId ? decodeURIComponent(encodedId) : undefined;} catch { /* Invalid links fall back to the section. */ }
  return {section, kind, id, query: new URLSearchParams(query)};
}
type Navigation = {go:(hash:string, replace?:boolean)=>void; back:(fallback:string)=>void};
export const NavigationContext = createContext<Navigation>({go:()=>{},back:()=>{}});
export const useNavigation = () => useContext(NavigationContext);
export function RecordLink({kind,id,children}: {kind:RecordKind,id?:string|null,children:React.ReactNode}) {
  const {go}=useNavigation();
  return id ? <a className="text-btn record-link" href={recordPath(kind,id)} onClick={e=>{if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.button===0){e.preventDefault();go(recordPath(kind,id));}}}>{children}</a> : <>{children}</>;
}
export function useWorkspaceRoute() {
  const [hash,setHash]=useState(location.hash || '#/dashboard');
  useLayoutEffect(()=>{
    const sync=()=>setHash(location.hash || '#/dashboard');
    addEventListener('hashchange',sync);addEventListener('popstate',sync);
    return()=>{removeEventListener('hashchange',sync);removeEventListener('popstate',sync)};
  },[]);
  useLayoutEffect(()=>{
    const content=document.querySelector('.content');
    const key=`consulting-scroll:${hash}`;
    try {if(content)content.scrollTop=Number(sessionStorage.getItem(key)||0);} catch {}
    return()=>{try {sessionStorage.setItem(key,String(content?.scrollTop||0));} catch {}};
  },[hash]);
  const go=(next:string,replace=false)=>{
    if(next===location.hash)return;
    const current=location.hash || '#/dashboard';
    if(replace)history.replaceState({},'',next);else history.pushState({consultingFrom:current},'',next);
    setHash(next);
  };
  const back=(fallback:string)=>{
    if(typeof history.state?.consultingFrom==='string'&&history.state.consultingFrom.startsWith('#/'))history.back();
    else go(fallback,true);
  };
  return {hash,route:parseRoute(hash),go,back};
}
