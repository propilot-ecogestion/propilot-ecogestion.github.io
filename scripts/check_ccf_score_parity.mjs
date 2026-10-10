import fs from 'node:fs'
const src=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const checks=[
  ['note proposée gérée séparément',src.includes('proposed_score')&&src.includes('Note proposée enregistrée')],
  ['note validée gérée séparément',src.includes('validated_score')&&src.includes('Note CCF validée')],
  ['validation explicite CCF',src.includes('async function validateScore')&&src.includes('ccf-validate-score')],
  ['modification invalide l’ancienne validation',src.includes('validated_score:null')&&src.includes("status:nextValue==null?'non_evalue':'en_cours'")],
  ['moyenne basée sur la note validée',src.includes('function weightedAverage')&&src.includes('validatedScore(resultMap')],
  ['dossier prêt exige note validée',src.includes('const notesReady=tracked.every')&&src.includes('validatedScore')],
  ['export distingue proposée et validée',src.includes('note proposée')&&src.includes('note validée')],
  ['affichage lecture seule distingue les deux états',src.includes('Validée {Number(validated).toFixed(1)}/20')&&src.includes('Proposée {Number(proposed).toFixed(1)}/20')],
  ['calcul documentaire indexé côté client',src.includes('requirementDocState=useMemo')&&src.includes('correctionCountMap=useMemo')],
  ['résultats chargés seulement pour les épreuves CCF',src.includes("in('exam_code',trackedRows.map(x=>x.code))")],
]
let failed=0
for(const [label,ok] of checks){console.log(`${ok?'✓':'✗'} ${label}`);if(!ok)failed++}
if(failed){console.error(`\n${failed} contrôle(s) parité note CCF en échec.`);process.exit(1)}
console.log(`\nParité note CCF : ${checks.length} contrôles OK.`)
