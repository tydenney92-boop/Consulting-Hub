import React from 'react';

export function DefinitionList({items,className=''}:{items:{label:string,value:React.ReactNode}[],className?:string}) {
  return <dl className={`record-fields ${className}`}>{items.map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value===null||item.value===undefined||item.value===''?'Not set':item.value}</dd></div>)}</dl>;
}

export function StatusBadge({children,tone='neutral'}:{children:React.ReactNode,tone?:'neutral'|'attention'|'success'|'overdue'}) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
