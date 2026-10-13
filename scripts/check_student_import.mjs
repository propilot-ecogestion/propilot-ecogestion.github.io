import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {readStudentsTable,readStudentsWorkbook,readStudentsDelimitedText,splitStudentFullName,readStudentsFromFile} from '../src/studentImport.js'

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
async function mobileCheck(label,fn){
  await fn()
  console.log('✓ '+label)
}
await mobileCheck('tablette : export Pronote CSV à MIME inconnu et sans extension',async()=>{
  const data='\uFEFFÉlèves;Adresse E-mail;Classe de rattachement\nDUPONT Léa;;T1\nLEROY Adam;adam@test.fr;T1'
  const file=new Blob([data],{type:'application/octet-stream'})
  Object.defineProperty(file,'name',{value:'Export Pronote'})
  const r=await readStudentsFromFile(file,XLSX)
  assert.equal(r.source,'pronote')
  assert.equal(r.students.length,2)
  assert.equal(r.students[0].email,null)
})
await mobileCheck('tablette : fichier .csv pris en charge quel que soit son MIME',async()=>{
  const file=new Blob(['Élèves;Adresse E-mail\nDUPONT Jeanne;jeanne@example.fr'],{type:'application/vnd.ms-excel'})
  Object.defineProperty(file,'name',{value:'Export CSV.csv'})
  const r=await readStudentsFromFile(file,XLSX)
  assert.equal(r.students.length,1)
  assert.equal(r.students[0].first_name,'Jeanne')
})
await mobileCheck('tablette : lecture via FileReader après échec de arrayBuffer',async()=>{
  const original=globalThis.FileReader
  const encoded=new TextEncoder().encode('Élèves;Adresse E-mail\nMOREAU Élise;')
  globalThis.FileReader=class {
    readAsArrayBuffer(){
      this.result=encoded.buffer
      queueMicrotask(()=>this.onload())
    }
  }
  const file={name:'Pronote.csv',size:encoded.length,arrayBuffer:async()=>{throw Error('Provider unavailable')}}
  try{
    const r=await readStudentsFromFile(file,XLSX)
    assert.equal(r.students.length,1)
    assert.equal(r.students[0].last_name,'MOREAU')
  }finally{
    if(original===undefined)delete globalThis.FileReader
    else globalThis.FileReader=original
  }
})
await mobileCheck('tablette : fichier vide provoque une erreur explicite',async()=>{
  const f=new Blob([])
  Object.defineProperty(f,'name',{value:'empty.csv'})
  await assert.rejects(()=>readStudentsFromFile(f,XLSX),/vide/)
})
await mobileCheck('Android fournisseur annonce 0 octet mais livre bien le CSV',async()=>{
  const data=new TextEncoder().encode('\uFEFFÉlèves;Adresse E-mail\nDUPONT Léa;\nMARTIN Samir;samir@exemple.fr')
  const file={name:'Export CSV.csv',size:0,type:'application/octet-stream',arrayBuffer:async()=>data.buffer}
  const r=await readStudentsFromFile(file,XLSX)
  assert.equal(r.students.length,2)
  assert.equal(r.source,null)
})
await mobileCheck('Android taille zéro et arrayBuffer vide : secours FileReader',async()=>{
  const original=globalThis.FileReader
  const good=new TextEncoder().encode('Nom;Prénom;Mail\nDUPONT;Léa;')
  globalThis.FileReader=class {readAsArrayBuffer(){this.result=good.buffer;queueMicrotask(()=>this.onload())}}
  const file={name:'eleves.csv',size:0,arrayBuffer:async()=>new ArrayBuffer(0)}
  try{
    const r=await readStudentsFromFile(file,XLSX)
    assert.equal(r.students.length,1)
    assert.equal(r.students[0].first_name,'Léa')
  }finally{if(original===undefined)delete globalThis.FileReader;else globalThis.FileReader=original}
})
await mobileCheck('Android annonce XLSX alors que le contenu est CSV Pronote',async()=>{
  const file=new Blob(['Élèves;Adresse E-mail;Classe de rattachement\nDUPONT Léa;;2MRC'],{type:'application/vnd.ms-excel'})
  Object.defineProperty(file,'name',{value:'Export CSV.xlsx'})
  const r=await readStudentsFromFile(file,XLSX)
  assert.equal(r.students.length,1)
  assert.equal(r.source,'pronote')
})
await mobileCheck('CSV UTF-16 sans BOM reconnu par contenu',async()=>{
  const text='Élèves;Adresse E-mail\nDUPONT Léa;lea@exemple.fr'
  const buf=new Uint8Array(text.length*2)
  for(let i=0;i<text.length;i++){buf[i*2]=text.charCodeAt(i)&255;buf[i*2+1]=text.charCodeAt(i)>>8}
  const file=new Blob([buf])
  Object.defineProperty(file,'name',{value:'pronote.csv'})
  const r=await readStudentsFromFile(file,XLSX)
  assert.equal(r.students.length,1)
  assert.equal(r.students[0].email,'lea@exemple.fr')
})
await mobileCheck('Android choisit un aperçu HTML à la place du CSV : message ciblé',async()=>{
  const file=new Blob(['<!doctype html><html><body>Pronote</body></html>'])
  Object.defineProperty(file,'name',{value:'Export.csv'})
  await assert.rejects(()=>readStudentsFromFile(file,XLSX),/HTML/)
})
await mobileCheck('Android fichier entièrement vide : erreur explicite après tentative',async()=>{
  const file=new Blob([])
  Object.defineProperty(file,'name',{value:'CSV.csv'})
  await assert.rejects(()=>readStudentsFromFile(file,XLSX),/0 octet|inaccessible/)
})
console.log('\nImport des élèves : 33 scénarios réussis (dont 10 contrôles mobiles).')
