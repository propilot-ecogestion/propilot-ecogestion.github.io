import fs from 'node:fs'

const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const setup=fs.readFileSync(new URL('../src/SetupWizard.jsx',import.meta.url),'utf8')

const checks=[
  ['plus d’acceptation automatique des invitations', !main.includes("pp_accept_class_invites')")],
  ['liste explicite des invitations', main.includes("pp_get_my_pending_invites")],
  ['acceptation invitation ciblée', main.includes("pp_accept_class_invite")],
  ['refus invitation ciblée', main.includes("pp_decline_class_invite")],
  ['boîte invitations sur tableau de bord', main.includes('Invitations de collaboration')],
  ['rôle proposé visible avant acceptation', main.includes('droit proposé')],
  ['assistant précise acceptation du collègue', setup.includes('rejoint la classe seulement après l’avoir acceptée')],
  ['CCF filtré par assessment_mode', main.includes("['ccf','mixte'].includes(e.assessment_mode)")],
  ['espace élève masque modules non publiés', main.includes('const visibleTabs=[')],
  ['état vide si aucun module élève publié', main.includes('Aucun module publié')],
  ['propriétaire principal affiché distinctement', main.includes('Propriétaire principal')],
  ['lecture seule toujours détectée', main.includes('const readOnly=!access.can_edit')],
]

let failed=0
for(const [label,ok] of checks){
  if(ok) console.log(`✓ ${label}`)
  else {console.error(`✗ ${label}`); failed++}
}
if(failed){console.error(`\n${failed} contrôle(s) en échec.`);process.exit(1)}
console.log(`\nParcours pilote : ${checks.length} contrôles OK.`)
