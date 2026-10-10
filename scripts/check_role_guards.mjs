import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const main=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8')
const progression=fs.readFileSync(path.join(root,'src/PersonalProgression.jsx'),'utf8')

const checks=[
  ['+ Ajouter masqué en lecture seule', main.includes("{!readOnly&&<button className=\"reference-add-btn\"")],
  ['Réglages réservés à can_manage', main.includes("{access.can_manage&&<button className=\"reference-settings-btn\"")],
  ['Onglet réglages rendu seulement avec can_manage', main.includes("tab==='settings' && access.can_manage")],
  ['Ajout/import élèves masqués en lecture seule', main.includes("{!readOnly&&<><button className=\"btn\" onClick={()=>setShowImport(true)}") && main.includes("setShowAdd(true)")],
  ['Accès élève transmet readOnly au modal', main.includes("function StudentAccessTab({klass,readOnly=false})") && main.includes("if(readOnly||!form)return") && main.includes("if(!selected||!form||readOnly||busy)return")],
  ['Modal élève désactive les champs en lecture seule', main.includes('disabled={readOnly} value={f.last_name}') && main.includes('disabled={readOnly} type="checkbox"')],
  ['Modal élève ne propose pas Enregistrer en lecture seule', main.includes("{!readOnly&&<button className=\"btn primary\">Enregistrer</button>}")],
  ['Évaluation rapide bloque la saisie en lecture seule', main.includes("if(readOnly) return <div className=\"empty-state compact\"")],
  ['Positionnement final bloque save en lecture seule', main.includes('if(readOnly||!selected)return')],
  ['PFMP masque les créations en lecture seule', main.includes("{!readOnly&&<button className=\"btn primary\" onClick={()=>{setEditPeriod(null);setOpen(true)}}")],
  ['CCF bloque saveScore en lecture seule', main.includes('if(readOnly)return') && main.includes('async function saveScore(student,exam)')],
  ['Documents masquent upload/suppression en lecture seule', main.includes("{!readOnly&&<div className=\"upload-zone\"") && main.includes("{!readOnly&&<button className=\"icon-btn danger-text\"")],
  ['Propriétaire principal distingué', main.includes("access.is_primary_owner?'Propriétaire principal'")],
  ['Conflit multi-prof progression détecté', progression.includes("eq('revision',Number(initial.revision||1))") && progression.includes('modifié par un autre enseignant')],
  ['Duplication ne recopie pas la révision', progression.includes('const {id,created_at,updated_at,revision,...copy}=item')],
]

let failed=0
for(const [label,ok] of checks){
  if(ok) console.log(`✓ ${label}`)
  else { console.error(`✗ ${label}`); failed++ }
}
if(failed){
  console.error(`\n${failed} contrôle(s) de rôles/collaboration en échec.`)
  process.exit(1)
}
console.log(`\nRôles et collaboration : ${checks.length} contrôles OK.`)
