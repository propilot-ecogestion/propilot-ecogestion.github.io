export function detectCsvDelimiter(text){
  const sample=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).find(line=>line.trim())||''
  let semi=0,comma=0,quoted=false
  for(let i=0;i<sample.length;i++){
    const c=sample[i]
    if(c==='"'){
      if(quoted&&sample[i+1]==='"'){i++;continue}
      quoted=!quoted;continue
    }
    if(!quoted){if(c===';')semi++;else if(c===',')comma++}
  }
  return semi>=comma?';':','
}

export function parseCsvText(text,delimiter=detectCsvDelimiter(text)){
  const src=String(text||'').replace(/^\uFEFF/,'')
  const rows=[]
  let row=[],field='',quoted=false
  const pushField=()=>{row.push(field.trim());field=''}
  const pushRow=()=>{pushField();if(row.some(cell=>cell!==''))rows.push(row);row=[]}
  for(let i=0;i<src.length;i++){
    const c=src[i]
    if(quoted){
      if(c==='"'){
        if(src[i+1]==='"'){field+='"';i++}else quoted=false
      }else field+=c
      continue
    }
    if(c==='"'&&field.trim()===''){quoted=true;field='';continue}
    if(c===delimiter){pushField();continue}
    if(c==='\n'){pushRow();continue}
    if(c==='\r'){if(src[i+1]==='\n')continue;pushRow();continue}
    field+=c
  }
  if(field!==''||row.length)pushRow()
  return rows
}
