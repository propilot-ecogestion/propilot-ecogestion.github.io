import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const evaluation=read('src/EvaluationMatrix.jsx');
const synthesis=read('src/SynthesisV14.jsx');
const pfmp=read('src/PfmpInline.jsx');
const student=read('ci/main.part4');
const tabs=read('ci/main.part2');
const setup=read('src/SetupWizard.jsx');
const progression=read('src/PersonalProgression.jsx');
const ccf=read('ci/main.part3');
const cases=[
 ['choix du contexte et référentiel complet pour les évaluations',evaluation.includes('Contexte / activité')&&evaluation.includes('Référentiel complet (toutes les compétences)')],
 ['rattachement des évaluations au contexte sélectionné',evaluation.includes('progression_item_id:context||null')],
 ['filtrage compétences principales ou détaillées en évaluation',evaluation.includes('const detailed=')&&evaluation.includes('assigned.has(c.parent_code)')],
 ['attitudes professionnelles retirées de la seule évaluation 2MRC',evaluation.includes("klass.diploma_code!=='2MRC'||c.group_code!=='AP'")&&pfmp.includes("parent_code")],
 ['PFMP intégré dans les propositions de synthèse',synthesis.includes("from('pp_pfmp_debriefs')")&&synthesis.includes('gc_positions')&&synthesis.includes('...pfFor(sid,code)')],
 ['autoévaluation consultable sans modifier automatiquement la proposition',synthesis.includes('selfFor=(sid,code)')&&synthesis.includes('Les autoévaluations restent visibles')],
 ['rattachement détaillé vers compétence principale dans la synthèse',synthesis.includes('parentMap[code]===c.code')],
 ['synthèse dédiée aux diplômes avec sous-compétences',synthesis.includes("['2MRC','ACCUEIL','EPC'].includes(klass.diploma_code)")],
 ['débrief PFMP par diplôme',pfmp.includes("eq('diploma_code',klass.diploma_code)")],
 ['autoévaluation filtrée par contexte et sous-compétence',student.includes('contextCodes.has(child.code)')&&student.includes('contextCodes.has(parent.code)')],
 ['notes réflexives conservées',student.includes('Ce que j’ai réussi')&&student.includes('Ce qui reste difficile')],
 ['CCF absent pour les classes 2MRC',tabs.includes("klass.diploma_code!=='2MRC'")&&student.includes("klass?.diploma_code!=='2MRC'")],
 ['CCF Métiers accueil réservé E31 et E32',ccf.includes("['E31','E32'].includes(ex.code)")],
 ['CAP EPC sans économie droit',progression.includes("klass.diploma_code!=='EPC'")&&progression.includes("klass.diploma_code==='EPC'?[]:f.econ_law_links")],
 ['suggestions économie droit pour cinq diplômes',["'2MRC'","MCVA:","MCVB:","ACCUEIL:","AGORA:"].every(x=>progression.includes(x))],
 ['assistant classe 2MRC sans CCF',setup.includes("draft.diploma_code==='2MRC'")&&setup.includes('ccf:false')]
];
let failures=0;
for(const [name,pass] of cases){process.stdout.write((pass?'✓':'✗')+' '+name+'\n');if(!pass)failures++;}
assert.equal(failures,0,failures+' échecs aux contrôles de préparation pilote');
console.log(cases.length+' contrôles pilote référentiels réussis.');
