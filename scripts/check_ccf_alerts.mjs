import fs from 'node:fs'
const src=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')
const checks=[
  ['compte les dossiers prêts',src.includes('const readyStudents=')],
  ['détecte les pièces manquantes',src.includes('missingDocs')],
  ['détecte les corrections demandées',src.includes('corrections')&&src.includes("status==='a_corriger'")],
  ['détecte les notes manquantes',src.includes('scoreMissing')],
  ['alerte dossiers à finaliser',src.includes('dossier(s) CCF à finaliser')],
  ['filtre recherche élève',src.includes('ccfQuery')&&src.includes('Rechercher un élève…')],
  ['filtre groupe',src.includes('ccfGroup')&&src.includes('Tous les groupes')],
  ['filtre épreuve',src.includes('ccfExamFilter')&&src.includes('Toutes les épreuves')],
  ['filtre état dossier',src.includes('ccfStatusFilter')&&src.includes('Pièce manquante')&&src.includes('Note non validée')],
  ['état prêt/à finaliser dans matrice',src.includes("status.ready?'Prêt':'À finaliser'")],
  ['bouton réinitialiser filtres',src.includes('Réinitialiser')],
  ['mise en forme alertes CCF',css.includes('.ccf-alert-panel')&&css.includes('.ccf-filterbar')],
]
let failed=0
for(const [label,ok] of checks){console.log(`${ok?'✓':'✗'} ${label}`);if(!ok)failed++}
if(failed){console.error(`\n${failed} contrôle(s) alertes CCF en échec.`);process.exit(1)}
console.log(`\nPilotage CCF : ${checks.length} contrôles OK.`)
