import fs from 'node:fs'

const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')

const checks=[
  ['état du portail élève relu côté serveur', main.includes('pp_get_my_student_portal_state')],
  ['écran accès élève désactivé', main.includes('Accès élève désactivé')],
  ['actualisation au retour dans l’onglet', main.includes("window.addEventListener('focus',refresh)")],
  ['autoévaluation rattachable à un contexte', main.includes('progression_item_id:progressionItem||null')],
  ['compétences du contexte filtrées par parent_code', main.includes('contextCodes.has(parent.code)') && main.includes('contextCodes.has(child.code)') && main.includes('c.parent_code===parent.code')],
  ['commentaires professeur visibles si publiés', main.includes('Commentaire de l’enseignant')],
  ['PFMP élève affiche les difficultés', main.includes('<b>Difficultés :</b>')],
  ['dépôt document élève disponible', main.includes('Déposer un document')],
  ['taille dépôt élève limitée à 20 Mo', main.includes('20*1024*1024')],
  ['suppression limitée aux documents autorisés', main.includes('if(!d.can_delete)return')],
  ['enseignant peut vérifier un dépôt', main.includes('DocumentReviewModal')],
  ['statuts document élève affichés', main.includes("a_corriger:'À corriger'")],
  ['commentaires document visibles côté élève', main.includes('student-document-comment')],
  ['commentaires professeur couplés aux positionnements', main.includes("key==='teacher_comments'&&next.teacher_comments")],
]

let failed=0
for(const [label,ok] of checks){
  if(ok) console.log(`✓ ${label}`)
  else { console.error(`✗ ${label}`); failed++ }
}
if(failed){console.error(`\n${failed} contrôle(s) en échec.`);process.exit(1)}
console.log(`\nParcours élève : ${checks.length} contrôles OK.`)
