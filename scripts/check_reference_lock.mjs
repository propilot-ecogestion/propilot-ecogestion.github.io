import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root=process.cwd()
const main=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8')
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8')
const reference=path.join(root,'docs/reference-interface-professeur.png')
const publicReference=path.join(root,'DEMO_REFERENCE_VISUELLE_V17.html')
const hasReference=fs.existsSync(reference)||fs.existsSync(publicReference)

const rules=[
  ['référence visuelle disponible',hasReference],
  ['titre progression partagé',main.includes('Progression pédagogique partagée')],
  ['onglet Progression',main.includes("'Progression'")],
  ['onglet Élèves',main.includes("'Élèves'")],
  ['onglet Évaluations',main.includes("'Évaluations'")],
  ['onglet PFMP',main.includes("'PFMP'")],
  ['onglet Synthèse compétences',main.includes("'Synthèse compétences'")],
  ['onglet CCF',main.includes("'CCF'")],
  ['onglet Accès élève',main.includes("'Accès élève'")],
  ['bouton + Ajouter',css.includes('.reference-add-btn')],
  ['navigation horizontale',css.includes('.personal-timeline-navigation')],
  ['colonnes PFMP jaunes',css.includes('.personal-pfmp-column') && css.includes('#fff8dc')],
  ['cartes contexte',css.includes('.personal-context-card')],
  ['action évaluer mes élèves',css.includes('.personal-evaluate-btn')],
  ['couleur progression bleue',css.includes('#2f6fed')],
  ['couleur élèves cyan',css.includes('#11bce0')],
  ['couleur évaluations violette',css.includes('#b260ff')],
  ['couleur PFMP verte',css.includes('#39c869')],
  ['couleur synthèse orange',css.includes('#ff7a1a')],
  ['couleur accès élève rose',css.includes('#ff5fa0')],
  ...['p1','p2','p3','p4','p5','p6','p7'].map(p=>[`thème période ${p.toUpperCase()}`,css.includes(`.personal-period-theme-${p}`)])
]

let failed=0
for(const [label,ok] of rules){
  console.log(`${ok?'✓':'✗'} ${label}`)
  if(!ok)failed++
}
if(failed){
  console.error(`\n${failed} règle(s) de référence visuelle manquante(s).`)
  process.exit(1)
}
console.log(`\nRéférence visuelle verrouillée : ${rules.length} contrôles OK.`)
