export function presenceSummary(connections){
 const rows=Object.entries(connections??{}).filter(([,row])=>row&&typeof row.browserId==='string').map(([id,row])=>({id,...row}));
 const browsers=new Set(rows.map(row=>row.browserId)),active=new Set(rows.filter(row=>row.active).map(row=>row.browserId));
 const accounts=new Set(rows.map(row=>row.uid).filter(Boolean));
 const identified=new Set(rows.filter(row=>row.uid).map(row=>row.browserId));
 return {rows,browsers:browsers.size,active:active.size,tabs:rows.length,accounts:accounts.size,visitors:[...browsers].filter(id=>!identified.has(id)).length};
}
