import fs from 'node:fs'
const src=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const checks=[
  ['pièces attendues chargées par classe',src.includes("pp_ccf_document_requirements")],
  ['pièce rattachée au document CCF',src.includes('requirement_id:targetRequirement||null')],
  ['dossier CCF affiche les pièces manquantes',src.includes("label:'Manquant'")],
  ['dossier CCF affiche les pièces validées',src.includes("label:'Validé'")],
  ['élève dépose directement une pièce attendue',src.includes("upload(e.target.files[0],req.id,req.exam_code)")],
  ['document complémentaire reste possible',src.includes('Document complémentaire')],
  ['professeur configure les pièces attendues',src.includes('Pièces attendues dans le dossier CCF')],
  ['pièce obligatoire/facultative configurable',src.includes("required:!!reqForm.required")],
  ['matrice classe affiche note et dossier',src.includes('note • dossier')],
  ['pièces reçues agrégées',src.includes('Pièces obligatoires reçues')],
  ['pièces validées agrégées',src.includes('Pièces validées')],
  ['dossiers complets agrégés',src.includes('Dossiers complets')],
  ['suppression requirement conserve les documents',src.includes('Les documents déjà déposés seront conservés comme pièces complémentaires')],
  ['élève reçoit les requirements dans son onglet CCF',src.includes('requirements={ccfRequirements}')],
]
let failed=0
for(const [label,ok] of checks){console.log(`${ok?'✓':'✗'} ${label}`);if(!ok)failed++}
if(failed){console.error(`\n${failed} contrôle(s) dossier CCF en échec.`);process.exit(1)}
console.log(`\nDossier CCF : ${checks.length} contrôles OK.`)
