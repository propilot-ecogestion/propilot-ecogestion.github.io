import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {readStudentsTable,readStudentsWorkbook,readStudentsDelimitedText} from '../src/studentImport.js'

function caseCheck(label,fn){
  try{fn();console.log('✓ '+label)}
  catch(error){console.error('✗ '+label);throw error}
}

caseCheck('colonnes permutées et variantes d’intitulés',()=>{
  const r=readStudentsTable([
    ['Courriel élève','Prénom','Information annexe','Nom de famille','Groupe'],
    ['test@example.org','Élodie','sans importance','DUPONT','G2']
  ])
  assert.equal(r.error,null)
  assert.equal(r.students.length,1)
  assert.deepEqual(r.students[0],{last_name:'DUPONT',first_name:'Élodie',email:'test@example.org',group_name:null})
})
caseCheck('titres annexes précédant les vrais en-têtes',()=>{
  const r=readStudentsTable([
    ['Liste des élèves de la classe'],['Année 2026'],['Nom','Prénom','Groupe'],
    ['Martin','Jean','A'],['Durand','Léa','B']
  ])
  assert.equal(r.students.length,2)
  assert.equal(r.students[0].group_name,null)
})
caseCheck('table sans entêtes : Nom, Prénom en premières colonnes',()=>{
  const r=readStudentsTable([['Martin','Marc'],['Dupont','Anne']])
  assert.deepEqual(r.students.map(s=>s.last_name),['MARTIN','DUPONT'])
  assert.deepEqual(r.students.map(s=>s.email),[null,null])
})
caseCheck('CSV point-virgule avec séparateurs et guillemets dans les cellules',()=>{
  const r=readStudentsDelimitedText('Nom;Prénom;E-mail;Groupe\n"Dupont; Martin";Marie;marie@test.fr;A\n"Durand";"Sophie";;B')
  assert.equal(r.students.length,2)
  assert.equal(r.students[0].last_name,'DUPONT; MARTIN')
  assert.equal(r.students[1].group_name,null)
})
caseCheck('CSV virgules et champ e-mail facultatif',()=>{
  const r=readStudentsDelimitedText('First Name,Last Name,Email\nAlex,Girard,alex@test.fr\nLina,Petit,')
  assert.equal(r.students.length,2)
  assert.equal(r.students[0].first_name,'Alex')
  assert.equal(r.students[1].email,null)
})
caseCheck('tableur séparé par tabulations',()=>{
  const r=readStudentsDelimitedText('NOM\tPRENOM\tGROUPE\nVidal\tEmma\tB')
  assert.equal(r.students.length,1)
  assert.equal(r.students[0].group_name,null)
})
caseCheck('noms doublons et e-mails invalides signalés',()=>{
  const r=readStudentsTable([['Nom','Prénom','Email'],['Garcia','Pablo','invalid'],['Garcia','Pablo','pablo@test.fr']])
  assert.equal(r.students.length,1)
  assert.equal(r.students[0].email,null)
  assert.equal(r.warnings.length,2)
})
caseCheck('en-têtes incomplets : refus de confondre les élèves',()=>{
  const r=readStudentsTable([['Nom','Groupe'],['Durand','B']])
  assert.ok(r.error)
  assert.equal(r.students.length,0)
})
caseCheck('limite à 200 sans doublons',()=>{
  const rows=[['Nom','Prénom'],...Array.from({length:203},(_,i)=>['FAMILLE'+i,'Prenom'+i])]
  const r=readStudentsTable(rows)
  assert.equal(r.students.length,200)
  assert.ok(r.warnings.some(w=>w.includes('3 élève(s)')))
})
caseCheck('classeur multi-feuilles sélectionne la feuille élèves',()=>{
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Présentation'],['Aucune donnée']]),'Accueil')
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Prénom','Nom','Classe'],['Lou','MOREAU','1MCVA']]),'Élèves')
  const r=readStudentsWorkbook(wb,XLSX)
  assert.equal(r.name,'Élèves')
  assert.equal(r.students[0].group_name,null)
  assert.equal(r.students[0].first_name,'Lou')
})
caseCheck('modèle Nom | Prénom | Mail : colonne Mail vide autorisée',()=>{
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['Nom','Prénom','Mail'],
    ['ACHOUR BELI','Aya',''],
    ['AMAOUCH','Wassila',null],
    ['AOUED','Ayoub','ayoub@example.fr']
  ]),'Classe')
  const r=readStudentsWorkbook(wb,XLSX)
  assert.equal(r.error,null)
  assert.equal(r.students.length,3)
  assert.deepEqual(r.students.map(s=>s.email),[null,null,'ayoub@example.fr'])
  assert.ok(r.students.every(s=>s.group_name===null))
})
caseCheck('CSV Nom ; Prénom ; Mail sans adresse obligatoire',()=>{
  const r=readStudentsDelimitedText('Nom;Prénom;Mail\nMartin;Nina;\nDUPONT;Paul;paul@test.fr')
  assert.equal(r.error,null)
  assert.equal(r.students.length,2)
  assert.equal(r.students[0].email,null)
  assert.equal(r.students[1].email,'paul@test.fr')
})
console.log('\nImport des élèves : 12 scénarios réussis.')
