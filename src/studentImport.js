import { parseCsvText } from './csv.js'

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
  const firstUpper=upper(parts[0]),lastUpper=upper(parts[parts.length-1])
  if(firstUpper&&!lastUpper){
    const boundary=parts.findIndex(part=>!upper(part))
    return {last_name:parts.slice(0,boundary).join(' ').toLocaleUpperCase('fr-FR'),first_name:parts.slice(boundary).join(' '),review:null}
  }
  if(!firstUpper&&lastUpper){
    const rev=[...parts].reverse()
    const boundary=rev.findIndex(part=>!upper(part))
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
  return {students:students.slice(0,limit),warnings,error:null,headerDetected:!!head}
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
