import fs from 'node:fs'

const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const setup=fs.readFileSync(new URL('../src/SetupWizard.jsx',import.meta.url),'utf8')
const tour=fs.readFileSync(new URL('../src/GuidedTour.jsx',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')

const checks=[
  ['assistant en 6 étapes', setup.includes("Étape {step} sur 6")],
  ['nouvelle classe : nouveau brouillon à étape 1',setup.includes('setStep(1)')&&!setup.includes(".is('finalized_class_id',null).order('updated_at'")],
  ['organisation solo/binôme/trinôme', setup.includes("['solo','Seul']") && setup.includes("['binome','Binôme']") && setup.includes("['trinome','Trinôme']")],
  ['adresse académique obligatoire pour les collaborateurs', setup.includes('@ac-aix-marseille.fr')],
  ['import élèves avec aperçu', setup.includes('studentsPreview') && setup.includes('modifiez directement les champs si nécessaire')],
  ['PFMP configurables', setup.includes('addPfmp') && setup.includes('Dates PFMP propres à cette classe')],
  ['visite guidée disponible', tour.includes('Découvrir ProPilot') && tour.includes('ProPilot est prêt')],
  ['visite guidée couvre progression', tour.includes('Progression pédagogique')],
  ['visite guidée couvre évaluations', tour.includes('Évaluations')],
  ['visite guidée couvre PFMP', tour.includes('PFMP')],
  ['visite guidée couvre CCF/documents', tour.includes('CCF et documents')],
  ['visite guidée peut être passée', tour.includes('Passer la visite')],
  ['styles visite isolés', css.includes('.tour-overlay') && css.includes('.tour-card')],
  ['import tableurs Excel et ODS dans les classes existantes', main.includes('Importer des élèves (tableur ou CSV)') && main.includes('readStudentsFromFile(file,XLSX)') && main.includes('FileReader')===false],
  ['import classe sans groupe et avec contrôle des doublons', main.includes('const {group_name,...student}=row') && main.includes('doublon(s) ignoré(s)') && !main.includes('Importer des élèves (CSV)')],
  ['sélecteur tableur/CSV sur tablette dans assistant et classe', setup.includes('accept={STUDENT_SPREADSHEET_ACCEPT}') && main.includes('accept={STUDENT_SPREADSHEET_ACCEPT}')],
  ['lecteur de fichier bien importé dans les deux interfaces', setup.includes('import { readStudentsFromFile, readStudentsDelimitedText, STUDENT_SPREADSHEET_ACCEPT }') && main.includes('import { readStudentsFromFile, STUDENT_SPREADSHEET_ACCEPT }')],
  ['secours CSV Android par collage dans les deux imports', setup.includes('importPastedCsv') && main.includes('importPastedCsv') && setup.includes('readStudentsDelimitedText(csvPasteText)') && main.includes('readStudentsDelimitedText(csvPasteText)')],
  ['Excel parser câblé', setup.includes("import * as XLSX from 'xlsx'")],
  ['tableurs courants et CSV acceptés sans groupe', setup.includes('readStudentsFromFile(file,XLSX)') && setup.includes('studentFileStatus') && !setup.includes('<th>Groupe</th>')],
  ['visite raccordée à l’application', main.includes("import GuidedTour from './GuidedTour'")],
  ['visite mémorisée par professeur', main.includes('propilot-guided-tour-v22:')],
]

let failed=0
for(const [label,ok] of checks){
  if(ok) console.log(`✓ ${label}`)
  else { console.error(`✗ ${label}`); failed++ }
}
if(failed){console.error(`\n${failed} contrôle(s) onboarding en échec.`);process.exit(1)}
console.log(`\nOnboarding V22 : ${checks.length} contrôles OK.`)
