import { parseCsvText } from './csv.js'

// L'import de l'assistant ne dépend pas des intitulés exacts des colonnes.
// Le groupe n'est jamais importé, même s'il est présent dans le tableur.
const normalizeHeader=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[_./-]+/g,' ').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim()
const clean=value=>String(value??'').trim()
const normalName=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()

function headerRole(cell){
  const label=normalizeHeader(cell)
  if(!label)return null
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
    const count=Number(found.last_name!==undefined)+Number(found.first_name!==undefined)+Number(found.email!==undefined)
    if(found.last_name===undefined||found.first_name===undefined)return
    if(!best||count>best.score)best={rowIndex,columns:found,score:count}
  })
  return best
}

export function readStudentsTable(rows,{limit=200}={}){
  const table=(rows||[]).filter(row=>Array.isArray(row)&&row.some(cell=>clean(cell)!==''))
  if(!table.length)return {students:[],warnings:[],error:'Le fichier est vide.',headerDetected:false}
  const head=detectStudentHeaders(table)
  const first=table[0].map(headerRole)
  // En l'absence d'en-têtes, tolérer simplement deux colonnes Nom | Prénom.
  // Si l'en-tête est incomplet, refuser plutôt que mélanger les identités.
  if(!head && first.some(Boolean))return {students:[],warnings:[],error:'Impossible de reconnaître les colonnes Nom et Prénom. Elles doivent figurer séparément dans le fichier.',headerDetected:false}
  if(!head && table[0].length<2)return {students:[],warnings:[],error:'Deux colonnes distinctes (Nom et Prénom) sont nécessaires.',headerDetected:false}
  const cols=head?.columns||{last_name:0,first_name:1}
  const offset=head?head.rowIndex+1:0
  const warnings=[],students=[],seenNames=new Set(),seenEmails=new Set()
  table.slice(offset).forEach((cells,i)=>{
    const last_name=clean(cells[cols.last_name]).toUpperCase()
    const first_name=clean(cells[cols.first_name])
    const originalEmail=cols.email===undefined?'':clean(cells[cols.email]).toLowerCase()
    let email=originalEmail||null
    const line=i+offset+1
    if(!last_name||!first_name){warnings.push('Ligne '+line+' ignorée : nom ou prénom manquant.');return}
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
    students.push({last_name,first_name,email,group_name:null})
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
  if(!best)return {students:[],warnings:[],error:'Aucune feuille ne contient des colonnes Nom et Prénom exploitables.'}
  return {...best,warnings:[...(tabs.length>1?['Feuille utilisée : '+best.name+'.']:[]),...best.warnings]}
}
