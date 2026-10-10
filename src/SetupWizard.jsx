import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'
import { School, Upload, BookOpenCheck, Users, CalendarDays, CheckCircle2, ArrowLeft, ChevronRight, Plus, Trash2, Save } from 'lucide-react'

const DEFAULT_MODULES={ccf:true,pfmp:true,reports:true,students:true,synthesis:true,evaluations:true,progression:true,student_portal:true}
const MODULE_LABELS={progression:'Progression',students:'Élèves',evaluations:'Évaluations',synthesis:'Synthèses',pfmp:'PFMP',ccf:'CCF',reports:'Documents / rapports',student_portal:'Espace élève'}

function normalizeEmail(v){return String(v||'').trim().toLowerCase()}
function safeFileName(v){return String(v||'logo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_')}

export default function SetupWizard({onClose,onCreated}){
  const [draft,setDraft]=useState(null)
  const [packs,setPacks]=useState([])
  const [reference,setReference]=useState({competencies:0,exams:[],econ:0})
  const [step,setStep]=useState(1)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [step2Clicks,setStep2Clicks]=useState(0)
  const [studentsFile,setStudentsFile]=useState(null)
  const [studentsPreview,setStudentsPreview]=useState([])
  const [currentEmail,setCurrentEmail]=useState('')

  useEffect(()=>{init()},[])
  useEffect(()=>{if(draft?.diploma_code)loadReference(draft.diploma_code)},[draft?.diploma_code])

  async function init(){
    setMessage('')
    try {
      const {data:{user},error:authError}=await supabase.auth.getUser()
      if(authError||!user)throw new Error('Session expirée. Reconnectez-vous.')
      setCurrentEmail(normalizeEmail(user.email))
      // "Créer une classe" démarre toujours un nouveau parcours ; les anciens brouillons sont conservés.
      const [{data:packsData,error:packsError},{data:newDraft,error:draftError}]=await Promise.all([
        supabase.from('pp_diploma_packs').select('code,name,short_name,has_ccf,has_econ_law').eq('active',true).order('sort_order'),
        supabase.from('pp_class_setup_drafts').insert({owner_id:user.id,organization_mode:'solo',collaborators:[],enabled_modules:DEFAULT_MODULES,pfmp_periods:[],school_year:'2026-2027',step_no:1}).select().single()
      ])
      if(packsError||draftError)throw packsError||draftError
      setPacks(packsData||[])
      setDraft(newDraft)
      setStep(1)
    } catch(error) {
      setMessage('Impossible de démarrer la création : '+String(error?.message||error))
    }
  }

  async function loadReference(code){
    const [c,e,l]=await Promise.all([
      supabase.from('pp_competencies').select('*',{count:'exact',head:true}).eq('diploma_code',code),
      supabase.from('pp_exams').select('code,label,coefficient,mode_hint').eq('diploma_code',code).order('sort_order'),
      supabase.from('pp_diploma_econ_law_links').select('*',{count:'exact',head:true}).eq('diploma_code',code)
    ])
    setReference({competencies:c.count||0,exams:e.data||[],econ:l.count||0})
    // Le chargement du référentiel ne doit jamais écraser les champs saisis par l'utilisateur.
  }

  async function patch(values,nextStep=null){
    if(!draft)return
    const payload={...values,updated_at:new Date().toISOString()}
    if(nextStep)payload.step_no=nextStep
    const {data,error}=await supabase.from('pp_class_setup_drafts').update(payload).eq('id',draft.id).select().single()
    if(error){setMessage('Enregistrement impossible : '+error.message);return null}
    if(!data){setMessage('La sauvegarde du brouillon n’a retourné aucune donnée.');return null}
    setDraft(previous=>({...previous,...data,...values})); if(nextStep)setStep(nextStep); return data
  }

  async function uploadLogo(file){
    if(!file||!draft)return
    setBusy(true);setMessage('')
    const {data:{user}}=await supabase.auth.getUser()
    const path=`${user.id}/${Date.now()}-${safeFileName(file.name)}`
    const {error}=await supabase.storage.from('pp-establishment-logos').upload(path,file,{upsert:false})
    if(error){setMessage(error.message);setBusy(false);return}
    await patch({establishment_logo_path:path})
    setBusy(false)
  }

  function collaborators(){return Array.isArray(draft?.collaborators)?draft.collaborators:[]}
  function expectedCollaborators(){return draft?.organization_mode==='binome'?1:draft?.organization_mode==='trinome'?2:0}
  function collaboratorValidation(){
    const rows=collaborators().filter(x=>normalizeEmail(x.email)).map(x=>({...x,email:normalizeEmail(x.email)}))
    const emails=rows.map(x=>x.email)
    if(rows.some(x=>!x.email.endsWith('@ac-aix-marseille.fr') && !['prof.zizah@gmail.com','zizah.prof@gmail.com'].includes(x.email)))return 'Pendant le pilote, les collègues doivent utiliser une adresse @ac-aix-marseille.fr (sauf comptes de test autorisés).'
    if(currentEmail&&emails.includes(currentEmail))return 'Votre propre adresse ne doit pas être ajoutée comme collègue.'
    if(new Set(emails).size!==emails.length)return 'Un même collègue ne peut pas être ajouté plusieurs fois.'
    const expected=expectedCollaborators()
    if(rows.length!==expected)return draft?.organization_mode==='binome'?'Un binôme comprend exactement un collègue en plus du propriétaire principal.':draft?.organization_mode==='trinome'?'Un trinôme comprend exactement deux collègues en plus du propriétaire principal.':rows.length?'Le mode « Seul » ne comporte aucun collègue.':''
    return ''
  }
  function setCollaborator(index,key,value){
    const rows=[...collaborators()];rows[index]={...rows[index],[key]:value};setDraft({...draft,collaborators:rows})
  }
  function addCollaborator(){setDraft({...draft,collaborators:[...collaborators(),{email:'',member_role:'editor'}]})}
  function removeCollaborator(index){setDraft({...draft,collaborators:collaborators().filter((_,i)=>i!==index)})}

  function pfmps(){return Array.isArray(draft?.pfmp_periods)?draft.pfmp_periods:[]}
  function setPfmp(index,key,value){const rows=[...pfmps()];rows[index]={...rows[index],[key]:value};setDraft({...draft,pfmp_periods:rows})}
  function addPfmp(){setDraft({...draft,pfmp_periods:[...pfmps(),{label:`PFMP ${pfmps().length+1}`,start_date:'',end_date:'',sort_order:(pfmps().length+1)*10}]})}
  function removePfmp(index){setDraft({...draft,pfmp_periods:pfmps().filter((_,i)=>i!==index)})}

  function rowsToStudents(rows){
    if(!rows.length){setStudentsPreview([]);return}
    const clean=v=>String(v??'').trim()
    const headers=rows[0].map(x=>clean(x).toLowerCase())
    const idx=names=>headers.findIndex(h=>names.some(n=>h.includes(n)))
    const iNom=idx(['nom','last_name']),iPrenom=idx(['prénom','prenom','first_name']),iGroupe=idx(['groupe','group']),iEmail=idx(['mail','email','e-mail'])
    const parsed=rows.slice(1).map(cols=>({last_name:clean(cols[iNom>=0?iNom:0]).toUpperCase(),first_name:clean(cols[iPrenom>=0?iPrenom:1]),group_name:iGroupe>=0?clean(cols[iGroupe])||null:null,email:iEmail>=0?normalizeEmail(cols[iEmail])||null:null})).filter(x=>x.last_name&&x.first_name)
    setStudentsPreview(parsed.slice(0,200))
  }

  function parseStudents(file){
    setStudentsFile(file);setMessage('')
    if(!file){setStudentsPreview([]);return}
    const ext=file.name.split('.').pop()?.toLowerCase()
    const r=new FileReader()
    if(ext==='xlsx'||ext==='xls'){
      r.onload=()=>{try{const wb=XLSX.read(r.result,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];rowsToStudents(XLSX.utils.sheet_to_json(ws,{header:1,defval:''}))}catch(e){setStudentsPreview([]);setMessage('Impossible de lire ce fichier Excel. Vérifiez le format du classeur.')}}
      r.readAsArrayBuffer(file);return
    }
    r.onload=()=>{
      const lines=String(r.result||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim())
      if(!lines.length){setStudentsPreview([]);return}
      const delim=lines[0].includes(';')?';':','
      const clean=v=>String(v||'').replace(/^"|"$/g,'').trim()
      rowsToStudents(lines.map(line=>line.split(delim).map(clean)))
    }
    r.readAsText(file,'utf-8')
  }

  async function finalize(){
    setBusy(true);setMessage('')
    const validation=collaboratorValidation()
    if(validation){setMessage(validation);setBusy(false);return}
    const collabs=collaborators().filter(x=>normalizeEmail(x.email)).map(x=>({email:normalizeEmail(x.email),member_role:x.member_role||'editor'}))
    await patch({collaborators:collabs,pfmp_periods:pfmps(),enabled_modules:{...(draft.enabled_modules||DEFAULT_MODULES),...(draft.diploma_code==='2MRC'?{ccf:false}:{})},step_no:6})
    const {data:classId,error}=await supabase.rpc('pp_finalize_class_setup',{target_draft_id:draft.id})
    if(error){setMessage(error.message);setBusy(false);return}
    if(studentsPreview.length){
      const rows=studentsPreview.map(s=>({...s,class_id:classId,access_enabled:false}))
      const {error:importError}=await supabase.from('pp_students').insert(rows)
      if(importError)setMessage(`Classe créée, mais import élèves incomplet : ${importError.message}`)
    }
    setBusy(false)
    onCreated?.(classId)
  }

  const canNext=useMemo(()=>{
    if(!draft)return false
    if(step===1)return !!draft.establishment_name?.trim() && !!draft.establishment_city?.trim()
    if(step===2)return !!draft.diploma_code && !!(draft.school_year||'2026-2027').trim() && !!draft.class_name?.trim() && !!draft.level_label?.trim()
    if(step===3)return collaboratorValidation()===''
    return true
  },[draft,step,reference])

  async function next(){
    setMessage('')
    if(step===1)await patch({establishment_name:draft.establishment_name,establishment_city:draft.establishment_city,establishment_logo_path:draft.establishment_logo_path||null},2)
    if(step===2){
      setStep2Clicks(n=>n+1)
      if(!draft.diploma_code||!draft.class_name?.trim()||!draft.level_label?.trim()){
        setMessage('Champs manquants : '+[!draft.diploma_code?'diplôme':null,!draft.class_name?.trim()?'nom de classe':null,!draft.level_label?.trim()?'niveau':null].filter(Boolean).join(', '));return
      }
      // La navigation ne dépend pas de la latence réseau : sauvegarde en arrière-plan,
      // mais erreur visible et retour à l'étape 2 en cas d'échec.
      setStep(3)
      setBusy(true)
      try {
        const saved=await patch({diploma_code:draft.diploma_code,school_year:draft.school_year||'2026-2027',class_name:draft.class_name.trim(),level_label:draft.level_label,reference_ready:reference.competencies>0&&(draft.diploma_code==='2MRC'||reference.exams.length>0)},3)
        if(!saved)setStep(2)
      } catch(error) {
        setMessage('Erreur lors de la sauvegarde : '+String(error?.message||error))
        setStep(2)
      } finally {setBusy(false)}
      return
    }
    if(step===3)await patch({organization_mode:draft.organization_mode,collaborators:collaborators()},4)
    if(step===4)await patch({enabled_modules:{...(draft.enabled_modules||DEFAULT_MODULES),...(draft.diploma_code==='2MRC'?{ccf:false}:{})},pfmp_periods:pfmps()},5)
    if(step===5)setStep(6)
  }
  function back(){setMessage('');setStep(s=>Math.max(1,s-1))}

  if(!draft)return <div className="modal-backdrop setup-backdrop"><div className="setup-shell"><div className="center-screen compact">{message?<><p role="alert">{message}</p><button className="btn" onClick={onClose}>Fermer</button></>:<><div className="spinner"/><p>Préparation de votre espace…</p></>}</div></div></div>

  const steps=[['Établissement',School],['Classe & diplôme',BookOpenCheck],['Équipe',Users],['Modules & PFMP',CalendarDays],['Élèves',Upload],['Vérification',CheckCircle2]]
  return <div className="modal-backdrop setup-backdrop" onMouseDown={onClose}>
    <div className="setup-shell" onMouseDown={e=>e.stopPropagation()}>
      <aside className="setup-steps"><div><strong>Créer une classe</strong><span>Assistant ProPilot</span></div>{steps.map(([label,Icon],i)=><button key={label} className={step===i+1?'active':step>i+1?'done':''} onClick={()=>i+1<step&&setStep(i+1)}><Icon/><span>{i+1}. {label}</span>{step>i+1&&<CheckCircle2/>}</button>)}</aside>
      <section className="setup-main">
        <div className="setup-head"><div><span className="eyebrow">Étape {step} sur 6</span><h2>{steps[step-1][0]}</h2></div><button className="icon-btn" onClick={onClose}>×</button></div>

        {step===1&&<div className="setup-section"><p className="lead">Votre établissement personnalise l’espace professeur. Le logo académique reste dans l’identité générale de ProPilot.</p><div className="form-grid"><label>Nom de l’établissement<input value={draft.establishment_name||''} onChange={e=>setDraft({...draft,establishment_name:e.target.value})} placeholder="Ex. Lycée professionnel Démo"/></label><label>Ville<input value={draft.establishment_city||''} onChange={e=>setDraft({...draft,establishment_city:e.target.value})} placeholder="Ville"/></label><label className="full logo-drop"><span>Logo de l’établissement</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>e.target.files?.[0]&&uploadLogo(e.target.files[0])}/><small>{draft.establishment_logo_path?'Logo importé. Vous pourrez le remplacer plus tard.':'PNG, JPG, WEBP ou SVG • 5 Mo max.'}</small></label></div></div>}

        {step===2&&<div className="setup-section"><div className="form-grid"><label>Diplôme<select value={draft.diploma_code||''} onChange={e=>setDraft({...draft,diploma_code:e.target.value,...(e.target.value==='2MRC'?{level_label:'2de',enabled_modules:{...(draft.enabled_modules||DEFAULT_MODULES),ccf:false}}:{})})}><option value="">Choisir…</option>{packs.map(p=><option key={p.code} value={p.code}>{p.short_name}</option>)}</select></label><label>Année scolaire<input value={draft.school_year||'2026-2027'} onChange={e=>setDraft({...draft,school_year:e.target.value})}/></label><label>Nom de la classe<input value={draft.class_name||''} onChange={e=>{const is2=/^2\s*MRC/i.test(e.target.value.trim());setDraft({...draft,class_name:e.target.value,...(is2?{diploma_code:'2MRC',level_label:'2de',enabled_modules:{...(draft.enabled_modules||DEFAULT_MODULES),ccf:false}}:{})})}} placeholder="Ex. 2MRC1"/></label><label>Niveau<select value={draft.level_label||''} onChange={e=>setDraft({...draft,level_label:e.target.value})}><option value="">Choisir…</option><option value="2de">2de</option><option value="1re">1re</option><option value="Terminale">Terminale</option></select></label></div>{draft.diploma_code&&<div className="reference-preview"><div><strong>{reference.competencies}</strong><span>compétences du référentiel</span></div><div><strong>{reference.econ}</strong><span>liens économie-droit</span></div><div><strong>{reference.exams.length}</strong><span>épreuves retrouvées</span></div></div>}{reference.exams.length>0&&<div className="exam-preview">{reference.exams.map(e=><div key={e.code}><b>{e.code}</b><span>{e.label}</span><small>Coeff. {e.coefficient??'—'} • {e.mode_hint||'modalité à préciser'}</small></div>)}</div>}</div>}

        {step===3&&<div className="setup-section"><p className="lead">Choisissez dès la création si la classe est gérée seul, en binôme ou en trinôme. Le propriétaire choisit les droits des collègues.</p><div className="segmented setup-segmented">{[['solo','Seul'],['binome','Binôme'],['trinome','Trinôme']].map(([k,l])=><button key={k} className={draft.organization_mode===k?'active':''} onClick={()=>setDraft({...draft,organization_mode:k,collaborators:k==='solo'?[]:collaborators()})}>{l}</button>)}</div>{draft.organization_mode!=='solo'&&<div className="collab-editor">{collaborators().map((c,i)=><div className="collab-row" key={i}><input type="email" value={c.email||''} onChange={e=>setCollaborator(i,'email',e.target.value)} placeholder="prenom.nom@ac-aix-marseille.fr"/><select value={c.member_role||'editor'} onChange={e=>setCollaborator(i,'member_role',e.target.value)}><option value="owner">Propriétaire / co-responsable</option><option value="editor">Éditeur</option><option value="viewer">Lecture seule</option></select><button className="icon-btn danger-text" onClick={()=>removeCollaborator(i)}><Trash2/></button></div>)}<div className="row wrap"><button className="btn" onClick={addCollaborator} disabled={collaborators().length>=expectedCollaborators()}><Plus/>Ajouter un collègue</button><span className="badge muted">{collaborators().filter(x=>normalizeEmail(x.email)).length} / {expectedCollaborators()}</span></div>{collaboratorValidation()&&<small className="form-hint warning">{collaboratorValidation()}</small>}<small className="muted">Le propriétaire principal est ajouté automatiquement. Chaque collègue reçoit une invitation et rejoint la classe seulement après l’avoir acceptée. Le propriétaire principal choisit le niveau de droit proposé.</small></div>}</div>}

        {step===4&&<div className="setup-section"><h3>Modules de la classe</h3><div className="module-grid">{Object.entries(MODULE_LABELS).filter(([k])=>!(draft.diploma_code==='2MRC'&&k==='ccf')).map(([k,label])=><label className="module-toggle" key={k}><input type="checkbox" checked={draft.enabled_modules?.[k]??true} onChange={e=>setDraft({...draft,enabled_modules:{...(draft.enabled_modules||DEFAULT_MODULES),[k]:e.target.checked}})}/><span>{label}</span></label>)}</div><div className="setup-subhead"><div><h3>Dates PFMP propres à cette classe</h3><p>Ces périodes apparaîtront ensuite dans la progression, comme dans votre version personnelle.</p></div><button className="btn" onClick={addPfmp}><Plus/>Ajouter une PFMP</button></div><div className="pfmp-editor">{pfmps().map((p,i)=><div className="pfmp-row" key={i}><input value={p.label||''} onChange={e=>setPfmp(i,'label',e.target.value)} placeholder={`PFMP ${i+1}`}/><input type="date" value={p.start_date||''} onChange={e=>setPfmp(i,'start_date',e.target.value)}/><input type="date" value={p.end_date||''} onChange={e=>setPfmp(i,'end_date',e.target.value)}/><button className="icon-btn danger-text" onClick={()=>removePfmp(i)}><Trash2/></button></div>)}{!pfmps().length&&<div className="small-empty">Aucune PFMP saisie pour le moment.</div>}</div></div>}

        {step===5&&<div className="setup-section"><p className="lead">L’import est facultatif : vous pourrez aussi ajouter les élèves plus tard dans la classe.</p><label className="logo-drop"><span>Importer une liste Excel ou CSV</span><input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={e=>parseStudents(e.target.files?.[0]||null)}/><small>Colonnes reconnues : Nom, Prénom, Groupe, Email.</small></label>{studentsPreview.length>0&&<div className="table-card setup-students-preview"><table><thead><tr><th>Nom</th><th>Prénom</th><th>Groupe</th><th>Email</th></tr></thead><tbody>{studentsPreview.slice(0,8).map((s,i)=><tr key={i}><td>{s.last_name}</td><td>{s.first_name}</td><td>{s.group_name||'—'}</td><td>{s.email||'—'}</td></tr>)}</tbody></table><div className="small-empty">{studentsPreview.length} élève(s) détecté(s){studentsPreview.length>8?' • aperçu limité aux 8 premiers':''}.</div></div>}</div>}

        {step===6&&<div className="setup-section"><div className="setup-summary"><CheckCircle2/><div><h3>Votre boîte à outils est prête à être créée</h3><p>La classe sera vide de vos données pédagogiques personnelles, mais le bon référentiel, les périodes P1 à P7, les transversalités économie-droit et les épreuves correspondant au diplôme sont déjà disponibles.</p></div></div><div className="summary-list"><div><span>Établissement</span><b>{draft.establishment_name} — {draft.establishment_city}</b></div><div><span>Classe</span><b>{draft.class_name} • {draft.level_label} • {draft.school_year}</b></div><div><span>Diplôme</span><b>{packs.find(p=>p.code===draft.diploma_code)?.short_name||draft.diploma_code}</b></div><div><span>Organisation</span><b>{draft.organization_mode} • {collaborators().length} collègue(s) invité(s)</b></div><div><span>PFMP</span><b>{pfmps().length} période(s)</b></div><div><span>Élèves à importer</span><b>{studentsPreview.length}</b></div></div></div>}

        {step===2&&<div className="form-hint" role="status">Diagnostic étape 2 : bouton actif · clics reçus : {step2Clicks} · sauvegarde : {busy?'en cours':'au repos'} · diplôme : {draft.diploma_code||'non choisi'} · classe : {draft.class_name||'vide'} · niveau : {draft.level_label||'non choisi'}</div>}
        {message&&<div className="form-message">{message}</div>}
        <div className="setup-actions"><button className="btn ghost" onClick={step===1?onClose:back}><ArrowLeft/>{step===1?'Fermer':'Retour'}</button>{step<6?<button className="btn primary" disabled={step!==2&&(busy||!canNext)} type="button" onClick={next}>Continuer <ChevronRight/></button>:<button className="btn primary" disabled={busy} onClick={finalize}><Save/>{busy?'Création…':'Créer la classe'}</button>}</div>
      </section>
    </div>
  </div>
}
