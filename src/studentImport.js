import { parseCsvText } from './csv.js'

// Sur Android Chrome, le choix « Photos et vidéos » peut ouvrir le
// gestionnaire de fichiers (libellé trompeur du sélecteur natif Chrome).
export const IS_ANDROID_CHROME = typeof navigator !== 'undefined'
  && /Android/i.test(navigator.userAgent)
  && /Chrome\//i.test(navigator.userAgent)
  && !/EdgA\/|OPR\/|SamsungBrowser\//i.test(navigator.userAgent)

/** Uniquement des fichiers d'élèves sous forme de tableur ou de texte CSV.
 * Extensions + MIME : Android et iPadOS ne reconnaissent pas tous les mêmes types.
 * Ce filtre évite que le sélecteur mobile se positionne sur Photos/Vidéos.
 */
export const STUDENT_SPREADSHEET_ACCEPT = [
  '.xlsx','.xls','.xlsm','.xlsb','.ods','.csv','.tsv','.tab','.txt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'text/csv','text/tab-separated-values','text/plain','application/csv'
].join(',')


// L'import de l'assistant ne dépend pas des intitulés exacts des colonnes.
// Le groupe n'est jamais importé, même s'il est présent dans le tableur.
const normalizeHeader=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[_./-]+/g,' ').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim()
const clean=value=>String(value??'').trim()
const normalName=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()

// Une colonne « Élève » contient parfois « NOM Prénom » ou « Prénom NOM ».
// Les noms ambigus restent modifiables dans l'aperçu avant import.
export function splitStudentFullName(input){
  const source=clean(input).replace(/\s+/g,' ')
  if(!source)return {last_name:'',first_name:'',review:'Nom et prénom à renseigner'}
  const pieces=source.split(/(?:,|;)\s*/).map(clean).filter(Boolean)
  if(pieces.length===2){
    const [first,second]=pieces
    const isUpper=v=>/[\p{L}]/u.test(v)&&v===v.toLocaleUpperCase('fr-FR')
    const reverse=!isUpper(first)&&isUpper(second)
    return {last_name:(reverse?second:first).toLocaleUpperCase('fr-FR'),first_name:reverse?first:second,review:null}
  }
  const parts=source.split(' ').filter(Boolean)
  if(parts.length===1)return {last_name:source.toLocaleUpperCase('fr-FR'),first_name:'',review:'Prénom manquant : complétez-le avant l’import'}
  const upper=v=>/[\p{L}]/u.test(v)&&v===v.toLocaleUpperCase('fr-FR')
  const isNameConnector=(word,i,arr)=>/^(?:-|–|—)$/.test(word)&&i>0&&i<arr.length-1&&upper(arr[i-1])&&upper(arr[i+1])
  const upperSurnamePart=(word,i,arr)=>upper(word)||isNameConnector(word,i,arr)
  const firstUpper=upper(parts[0]),lastUpper=upper(parts[parts.length-1])
  if(firstUpper&&!lastUpper){
    const boundary=parts.findIndex((part,i)=>!upperSurnamePart(part,i,parts))
    return {last_name:parts.slice(0,boundary).join(' ').toLocaleUpperCase('fr-FR'),first_name:parts.slice(boundary).join(' '),review:null}
  }
  if(!firstUpper&&lastUpper){
    const rev=[...parts].reverse()
    const boundary=rev.findIndex((part,i)=>!upperSurnamePart(part,i,rev))
    return {last_name:parts.slice(parts.length-boundary).join(' ').toLocaleUpperCase('fr-FR'),first_name:parts.slice(0,parts.length-boundary).join(' '),review:null}
  }
  // Cas sans indice fiable de casse : séparation proposée, à contrôler.
  if(firstUpper&&lastUpper){
    return {last_name:parts[0].toLocaleUpperCase('fr-FR'),first_name:parts.slice(1).join(' '),review:'Nom et prénom entièrement en majuscules : vérifiez la séparation'}
  }
  // Usage « Prénom Nom », sans garantie : possibilité d'inverser dans l'aperçu.
  return {last_name:parts.slice(1).join(' ').toLocaleUpperCase('fr-FR'),first_name:parts[0],review:'Ordre des noms incertain : vérifiez la séparation'}
}

function headerRole(cell){
  const label=normalizeHeader(cell)
  if(!label)return null
  if(/^(?:eleve|eleves|nom prenom|nom et prenom|prenon nom|prenom nom|identite|identite eleve|nom complet|noms et prenoms|full name|fullname|student|student name|student full name|name and surname|nom de l eleve et prenom)$/.test(label))return 'full_name'
  if(/^(?:prenom|prenoms|first name|firstname|given name|given names|forename|forenames|prenom eleve|prenom de l eleve|prenom usuel)$/.test(label) ||
      /\bprenom\b|\bfirst name\b|\bgiven name\b/.test(label))return 'first_name'
  if(/^(?:nom|noms|last name|lastname|surname|family name|nom de famille|nom de naissance|nom usuel|nom eleve|nom de l eleve)$/.test(label) ||
      /^nom (?:de |d )?(?:l )?eleve$/.test(label))return 'last_name'
  if(/^(?:email|e mail|courriel|mail|adresse mail|adresse email|adresse e mail|email eleve|courriel eleve)$/.test(label) ||
      /\b(?:email|courriel)\b/.test(label))return 'email'
  return null
}

export function detectStudentHeaders(rows){
  const sample=(rows||[]).slice(0,20)
  let best=null
  sample.forEach((cells,rowIndex)=>{
    if(!Array.isArray(cells))return
    const found={}
    cells.forEach((cell,i)=>{const role=headerRole(cell);if(role && found[role]===undefined)found[role]=i})
    const separate=found.last_name!==undefined&&found.first_name!==undefined
    const combined=found.full_name!==undefined
    const count=Number(separate)*4+Number(combined)*2+Number(found.email!==undefined)
    if(!separate&&!combined)return
    if(!best||count>best.score)best={rowIndex,columns:found,score:count}
  })
  return best
}

export function readStudentsTable(rows,{limit=200}={}){
  const table=(rows||[]).filter(row=>Array.isArray(row)&&row.some(cell=>clean(cell)!==''))
  if(!table.length)return {students:[],warnings:[],error:'Le fichier est vide.',headerDetected:false}
  const head=detectStudentHeaders(table)
  const first=table[0].map(headerRole)
  // Sans en-tête : une seule colonne peut contenir « NOM Prénom ».
  // Un en-tête incomplet reste signalé pour éviter de prendre « Groupe » pour un prénom.
  if(!head && first.some(Boolean))return {students:[],warnings:[],error:'Colonnes incomplètes : utilisez « Nom » et « Prénom » ou une seule colonne « Élève ».',headerDetected:false}
  const cols=head?.columns||(table[0].length===1?{full_name:0}:{last_name:0,first_name:1})
  const offset=head?head.rowIndex+1:0
  const headerCells=head?table[head.rowIndex]:[]
  // Reconnaissance de l'export élèves Pronote : extraire uniquement l'identité et l'e-mail.
  const isPronote=Boolean(head&&cols.full_name!==undefined
    &&normalizeHeader(headerCells[cols.full_name])==='eleves'
    &&headerCells.some(c=>['classe de rattachement','encouragement valorisation','cnx ele','regime','ne e le'].includes(normalizeHeader(c))))
  const warnings=[],students=[],seenNames=new Set(),seenEmails=new Set()
  table.slice(offset).forEach((cells,i)=>{
    const usesFullName=cols.full_name!==undefined&&(cols.last_name===undefined||cols.first_name===undefined)
    const fullName=usesFullName?splitStudentFullName(cells[cols.full_name]):null
    const last_name=usesFullName?fullName.last_name:clean(cells[cols.last_name]).toUpperCase()
    const first_name=usesFullName?fullName.first_name:clean(cells[cols.first_name])
    const originalEmail=cols.email===undefined?'':clean(cells[cols.email]).toLowerCase()
    let email=originalEmail||null
    const line=i+offset+1
    if(!last_name){warnings.push('Ligne '+line+' ignorée : nom manquant.');return}
    if(!first_name&&!usesFullName){warnings.push('Ligne '+line+' ignorée : prénom manquant.');return}
    if(fullName?.review)warnings.push('Ligne '+line+' : '+fullName.review+' ('+clean(cells[cols.full_name])+').')
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      warnings.push('Ligne '+line+' : adresse e-mail ignorée car invalide.')
      email=null
    }
    const nameKey=normalName(last_name)+'|'+normalName(first_name)
    if(seenNames.has(nameKey)||(email&&seenEmails.has(email))){
      warnings.push('Ligne '+line+' ignorée : élève en doublon ('+first_name+' '+last_name+').')
      return
    }
    seenNames.add(nameKey)
    if(email)seenEmails.add(email)
    students.push(fullName?.review?{last_name,first_name,email,group_name:null,_review:fullName.review}:{last_name,first_name,email,group_name:null})
  })
  if(students.length>limit)warnings.push((students.length-limit)+' élève(s) au-delà de la limite de '+limit+' non importés.')
  return {students:students.slice(0,limit),warnings,error:null,headerDetected:!!head,source:isPronote?'pronote':null,
    sourceColumns:isPronote?{identity:clean(headerCells[cols.full_name]),email:cols.email===undefined?null:clean(headerCells[cols.email])}:null,
    ignoredColumns:isPronote?Math.max(0,headerCells.length-1-Number(cols.email!==undefined)):null}
}

export function readStudentsDelimitedText(text){
  let best=null
  for(const delimiter of [';',',','\t','|']){
    const rows=parseCsvText(text,delimiter)
    const result=readStudentsTable(rows)
    const score=(result.headerDetected?10000:0)+(result.error?0:100)+result.students.length
    if(!best||score>best.score)best={...result,score}
  }
  const {score,...result}=best
  return result
}

export function readStudentsWorkbook(workbook,XLSX){
  const tabs=(workbook?.SheetNames||[]).map(name=>{
    const sheet=workbook.Sheets[name]
    if(!sheet)return null
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:false})
    return {name,...readStudentsTable(rows)}
  }).filter(Boolean)
  const best=tabs.filter(tab=>!tab.error).sort((a,b)=>{
    return (Number(b.headerDetected)-Number(a.headerDetected))||(b.students.length-a.students.length)
  })[0]
  if(!best)return {students:[],warnings:[],error:'Aucune feuille ne contient des colonnes Nom / Prénom ou une colonne Élève exploitable.'}
  return {...best,warnings:[...(tabs.length>1?['Feuille utilisée : '+best.name+'.']:[]),...best.warnings]}
}


/**
 * Lecture compatible tablettes (iPadOS/Safari, Android/Chrome et fichiers
 * issus de la zone Téléchargements). Ne transmet rien au serveur.
 * L'extension et le MIME ne sont pas fiables pour les exports Pronote.
 */
async function loadStudentFileBuffer(file){
  if(!file)throw new Error('Aucun fichier sélectionné.')
  // Android peut retourner size=0 pour un document dont la taille n'est pas
  // renseignée par le fournisseur. Vérifier les octets réellement lus.
  if(Number(file.size)>20*1024*1024)throw new Error('Fichier trop volumineux (20 Mo maximum).')
  let firstError=null
  if(typeof file.arrayBuffer==='function'){
    try{
      const data=await file.arrayBuffer()
      if(data instanceof ArrayBuffer&&data.byteLength>0)return data
    }catch(e){firstError=e}
  }
  if(typeof FileReader!=='undefined'){
    try{
      const data=await new Promise((resolve,reject)=>{
        const reader=new FileReader()
        reader.onerror=()=>reject(new Error('Lecture refusée par le fournisseur de documents Android.'))
        reader.onabort=()=>reject(new Error('La sélection a été interrompue.'))
        reader.onload=()=>resolve(reader.result)
        reader.readAsArrayBuffer(file)
      })
      if(data instanceof ArrayBuffer&&data.byteLength>0)return data
    }catch(e){firstError=e}
  }
  if(typeof file.text==='function'){
    try{
      const value=await file.text()
      if(value)return new TextEncoder().encode(value).buffer
    }catch(e){firstError=e}
  }
  const label=Number(file.size)===0?'taille indiquée : 0 octet':'lecture indisponible'
  throw new Error('Fichier sélectionné mais vide ou contenu inaccessible ('+label+'). Enregistrez le CSV dans Téléchargements, puis réessayez dans Chrome.'+(firstError?.message?' Détail : '+String(firstError.message):''))
}

function decodeStudentText(data){
  const bytes=new Uint8Array(data)
  // Pronote est généralement UTF-8 avec BOM ; certains exports Android ou
  // tableurs sont en UTF-16 (éventuellement sans BOM).
  if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const sample=bytes.subarray(0,Math.min(bytes.length,400))
  const evenZero=sample.filter((b,i)=>i%2===0&&b===0).length
  const oddZero=sample.filter((b,i)=>i%2===1&&b===0).length
  if(oddZero>sample.length/6&&oddZero>evenZero*4)return new TextDecoder('utf-16le').decode(bytes)
  if(evenZero>sample.length/6&&evenZero>oddZero*4)return new TextDecoder('utf-16be').decode(bytes)
  let decoded=new TextDecoder('utf-8').decode(bytes)
  if(decoded.includes('\uFFFD')){
    try{decoded=new TextDecoder('windows-1252').decode(bytes)}catch{}
  }
  return decoded.replace(/^\uFEFF/,'')
}

export async function readStudentsFromFile(file,XLSX){
  const buffer=await loadStudentFileBuffer(file)
  const bytes=new Uint8Array(buffer)
  const ext=String(file.name||'').split('.').pop().toLowerCase()
  if(ext==='numbers')throw new Error('Apple Numbers : exportez d’abord le document au format Excel ou CSV.')
  const zip=bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4
  const ole=bytes[0]===208&&bytes[1]===207&&bytes[2]===17&&bytes[3]===224
  const binary=zip||ole
  const prefix=decodeStudentText(bytes.subarray(0,Math.min(bytes.length,256)))
  if(prefix.trimStart().startsWith('%PDF-'))throw new Error('Le document choisi est un PDF, pas un CSV. Téléchargez « Export CSV » depuis Pronote.')
  if(/^\s*<(?:!doctype\s+html|html|head|body)\b/i.test(prefix))throw new Error('Le document choisi est une page HTML, pas le CSV Pronote. Téléchargez le fichier CSV complet.')
  // Inspecter le contenu plutôt que l'extension ou le type MIME du fournisseur Android.
  // Un fournisseur peut annoncer .xls, application/octet-stream ou 0 octet.
  if(!binary){
    const csv=readStudentsDelimitedText(decodeStudentText(buffer))
    if(!csv.error&&csv.students.length)return csv
    if(['csv','tsv','tab','txt'].includes(ext)||!['xlsx','xls','xlsm','xlsb','ods'].includes(ext)){
      throw new Error(csv.error||'Aucun élève reconnu dans ce fichier texte. Vérifiez les colonnes Nom / Prénom ou Élèves.')
    }
  }
  try{
    const book=XLSX.read(buffer,{type:'array'})
    const parsed=readStudentsWorkbook(book,XLSX)
    if(parsed.error)throw new Error(parsed.error)
    return parsed
  }catch(error){
    if(!binary){
      const csv=readStudentsDelimitedText(decodeStudentText(buffer))
      if(!csv.error&&csv.students.length)return csv
    }
    throw new Error('Impossible de lire le tableur sélectionné ('+String(error?.message||error)+'). Essayez l’export CSV Pronote.')
  }
}
