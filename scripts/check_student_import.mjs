import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {readStudentsTable,readStudentsWorkbook,readStudentsDelimitedText,splitStudentFullName} from '../src/studentImport.js'

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
caseCheck('colonne Élève avec NOM Prénom et noms composés',()=>{
  const r=readStudentsTable([
    ['Élève','Mail'],
    ['DUPONT Jean',''],
    ['EL ALAOUI Nawel',''],
    ['RURANGWA Mutesi Dorcas',''],
    ['BERNARD-MARTIN Anaïs','anais@test.fr']
  ])
  assert.equal(r.error,null)
  assert.equal(r.students.length,4)
  assert.deepEqual(r.students.map(s=>[s.last_name,s.first_name]),[
    ['DUPONT','Jean'],['EL ALAOUI','Nawel'],['RURANGWA','Mutesi Dorcas'],['BERNARD-MARTIN','Anaïs']
  ])
  assert.equal(r.students[0].email,null)
})
caseCheck('colonne Élève inversée : Prénom NOM',()=>{
  const r=readStudentsTable([['Élève'],['Jean DUPONT'],['Mina EL ALAOUI']])
  assert.equal(r.students.length,2)
  assert.deepEqual([r.students[0].last_name,r.students[0].first_name],['DUPONT','Jean'])
  assert.deepEqual([r.students[1].last_name,r.students[1].first_name],['EL ALAOUI','Mina'])
})
caseCheck('colonne Élève avec virgule séparatrice',()=>{
  const r=readStudentsTable([['Élève'],['DUPONT, Jean'],['Dupont, Jean Marie']])
  assert.deepEqual([r.students[0].last_name,r.students[0].first_name],['DUPONT','Jean'])
  assert.equal(r.students[1].first_name,'Jean Marie')
})
caseCheck('colonne Élève tout en majuscules : aperçu et avertissement',()=>{
  const r=readStudentsTable([['Nom Prénom'],['DUPONT JEAN']])
  assert.equal(r.students.length,1)
  assert.equal(r.students[0].last_name,'DUPONT')
  assert.equal(r.students[0].first_name,'JEAN')
  assert.ok(r.students[0]._review)
  assert.ok(r.warnings.some(s=>s.includes('vérifiez la séparation')))
})
caseCheck('nom complet ambigu : import possible après correction dans aperçu',()=>{
  const r=readStudentsTable([['Nom et Prénom'],['Martin Pierre']])
  assert.equal(r.students.length,1)
  assert.ok(r.students[0]._review)
  assert.equal(r.error,null)
})
caseCheck('prénom absent dans Élève : ligne conservée pour correction',()=>{
  const r=readStudentsTable([['Élève'],['DUPONT'],['DURAND Léa']])
  assert.equal(r.students.length,2)
  assert.equal(r.students[0].first_name,'')
  assert.ok(r.students[0]._review)
  assert.equal(r.students[1].first_name,'Léa')
})
caseCheck('colonne Élève placée après autres données CSV',()=>{
  const r=readStudentsDelimitedText('Groupe;Mail;Élève;Autre\nG1;;MOREAU Anaïs;x\nG2;p@test.fr;Paul DURAND;x')
  assert.equal(r.error,null)
  assert.equal(r.students.length,2)
  assert.deepEqual(r.students.map(s=>[s.last_name,s.first_name]),[['MOREAU','Anaïs'],['DURAND','Paul']])
  assert.ok(r.students.every(s=>s.group_name===null))
})
caseCheck('classeur feuille Élève : lecture combinée',()=>{
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Élève','Mail'],['ACHOUR BELI Aya',''],['ZARA Noeyla','noeyla@test.fr']]),'Liste')
  const r=readStudentsWorkbook(wb,XLSX)
  assert.equal(r.students.length,2)
  assert.equal(r.students[0].last_name,'ACHOUR BELI')
  assert.equal(r.students[0].first_name,'Aya')
})
caseCheck('une seule colonne sans titre : compatible',()=>{
  const r=readStudentsTable([['DUPONT Jean'],['DURAND Léa']])
  assert.equal(r.error,null)
  assert.equal(r.students.length,2)
})
caseCheck('CSV Pronote natif 16 colonnes : seules Élèves et Adresse E-mail sont exploitées',()=>{
  const headers=['Élèves','Encouragement/Valorisation','Né(e) le','Sexe','Adresse E-mail',
    'Entrée','Sortie','','Classe de rattachement','Tuteur','Cnx Ele.','Cnx Resp.',
    'Option 1','Option 2','Option 3','Régime']
  const names=Array.from({length:25},(_,i)=>'FAMILLE'+i+' Prénom'+i)
  names[0]='DUPONT - MARTIN Léa'
  names[1]='EL ALAOUI Nawel'
  names[2]='MOREAU Marie Louise'
  const lines=[headers,...names.map((name,i)=>{
    const cells=Array(16).fill('')
    cells[0]=name
    cells[2]='05/04/2010'
    cells[3]='Féminin'
    cells[4]=i<19?'eleve'+i+'@exemple.fr':''
    cells[5]='01/09/2026'
    cells[8]='1MCVA'
    cells[15]='Externe'
    return cells
  })].map(row=>row.map(cell=>'"'+String(cell).replaceAll('"','""')+'"').join(';')).join('\r\n')
  const csv='\uFEFF'+lines
  const r=readStudentsDelimitedText(csv)
  assert.equal(r.error,null)
  assert.equal(r.source,'pronote')
  assert.equal(r.students.length,25)
  assert.equal(r.students.filter(student=>student.email).length,19)
  assert.equal(r.ignoredColumns,14)
  assert.deepEqual(r.sourceColumns,{identity:'Élèves',email:'Adresse E-mail'})
  assert.deepEqual([r.students[0].last_name,r.students[0].first_name],['DUPONT - MARTIN','Léa'])
  assert.deepEqual([r.students[1].last_name,r.students[1].first_name],['EL ALAOUI','Nawel'])
  assert.deepEqual([r.students[2].last_name,r.students[2].first_name],['MOREAU','Marie Louise'])
  assert.ok(r.students.every(student=>student.group_name===null))
  assert.ok(r.students.every(student=>Object.keys(student).every(key=>['last_name','first_name','email','group_name','_review'].includes(key))))
})
caseCheck('CSV Pronote : colonnes inutiles mal remplies et mails manquants non bloquants',()=>{
  const sample=[
    ['Élèves','Sexe','Adresse E-mail','Classe de rattachement','Cnx Ele.'],
    ['DURAND Zoé','valeur inconnue','','1MCVA','erreur'],
    ['LEROY Yannis','','yannis@exemple.fr','','']
  ]
  const r=readStudentsDelimitedText(sample.map(row=>row.map(v=>'"'+v+'"').join(';')).join('\n'))
  assert.equal(r.source,'pronote')
  assert.equal(r.students.length,2)
  assert.equal(r.students[0].email,null)
  assert.equal(r.students[1].email,'yannis@exemple.fr')
})
console.log('\nImport des élèves : 23 scénarios réussis.')
