import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { Plus, Pencil, Trash2, Copy, BriefcaseBusiness, FileText, Download, Upload, Save, X, RefreshCw, LockKeyhole, ClipboardCheck } from 'lucide-react'

const LEARNING=[['D','Découverte'],['E','Expérimentation'],['A','Approfondissement'],['M','Maîtrise / autonomie']]
const STATUS=['Prévu','En cours','Terminé','À ajuster']
const GROUP_STYLE={
  G1:{personal:'GC1',label:'Conseiller et vendre',color:'#5B8DEF'},
  G2:{personal:'GC2',label:'Suivre les ventes',color:'#F4A259'},
  G3:{personal:'GC3',label:'Fidéliser la clientèle et développer la relation client',color:'#A678DE'},
  G4A:{personal:'GC4A',label:'Animer et gérer l’espace commercial',color:'#61B58C'},
  G4B:{personal:'GC4B',label:'Prospecter et valoriser l’offre commerciale',color:'#2EA6A1'}
}
const PERSONAL_GROUP_CODE=Object.fromEntries(Object.entries(GROUP_STYLE).map(([k,v])=>[k,v.personal]))
const PERSONAL_TO_GROUP=Object.fromEntries(Object.entries(GROUP_STYLE).map(([k,v])=>[v.personal,k]))

function err(e){return e?.message||String(e||'Erreur')}
function lines(v){return String(v||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}
function unique(values){return [...new Set(values.filter(Boolean))]}
function safeName(v){return String(v||'fichier').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_')}
function learningLabel(code){return LEARNING.find(x=>x[0]===code)?.[1]||code||'—'}
function competencyCodes(value){if(!Array.isArray(value))return [];return value.map(x=>typeof x==='string'?x:(x.code||x.parent_code||x.comp_code||null)).filter(Boolean)}
function groupKey(item){const c=Array.isArray(item?.competencies)?item.competencies[0]:null;const raw=(c&&typeof c==='object'?(c.group||c.group_code):null)||item?.group_code||'';return PERSONAL_TO_GROUP[raw]||raw||'G1'}
function groupInfo(item){const key=groupKey(item);return {key,...(GROUP_STYLE[key]||{personal:key,label:key,color:'#94A3B8'})}}
function primaryCompetency(item){const c=Array.isArray(item?.competencies)?item.competencies[0]:null;if(!c)return 'Compétence à préciser';return typeof c==='string'?c:(c.comp||c.label||c.code||'Compétence')}
function formatDate(v){return v?new Date(`${v}T12:00:00`).toLocaleDateString('fr-FR'):'À renseigner'}

export default function PersonalProgression({klass,readOnly=false,onEvaluateContext=null,addRequestToken=0}){
  const [items,setItems]=useState([])
  const [periods,setPeriods]=useState([])
  const [pfmps,setPfmps]=useState([])
  const [attachments,setAttachments]=useState([])
  const [referenceCompetencies,setReferenceCompetencies]=useState([])
  const [referenceGroups,setReferenceGroups]=useState([])
  const [teacherOptions,setTeacherOptions]=useState([])
  const [teacherMembers,setTeacherMembers]=useState([])
  const [currentUserId,setCurrentUserId]=useState(null)
  const [open,setOpen]=useState(false)
  const [addMenu,setAddMenu]=useState(false)
  const [printOpen,setPrintOpen]=useState(false)
  const [printMode,setPrintMode]=useState('chronological')
  const [printCycle,setPrintCycle]=useState('premiere')
  const [printTeacher,setPrintTeacher]=useState('')
  const [printOptions,setPrintOptions]=useState({events:true,competencies:true,economy:true,problematic:false,activities:false})
  const [showSynthesis,setShowSynthesis]=useState(false)
  const [detailGroup,setDetailGroup]=useState(null)
  const [expandedCompetency,setExpandedCompetency]=useState(null)
  const [competencySearch,setCompetencySearch]=useState('')
  const [newKind,setNewKind]=useState('context')
  const [newPeriod,setNewPeriod]=useState(null)
  const [editItem,setEditItem]=useState(null)
  const [cycleView,setCycleView]=useState('cycle')
  const [teacherFilter,setTeacherFilter]=useState('')
  const [groupFilter,setGroupFilter]=useState('')
  const [levelFilter,setLevelFilter]=useState('')
  const [syncState,setSyncState]=useState('Synchronisation…')
  const timelineRef=useRef(null)
  const topScrollRef=useRef(null)
  function syncTimelinePosition(){const el=timelineRef.current,top=topScrollRef.current;if(!el||!top)return;if(Math.abs(top.scrollLeft-el.scrollLeft)>1)top.scrollLeft=el.scrollLeft}
  function syncFromTop(){const el=timelineRef.current,top=topScrollRef.current;if(!el||!top)return;if(Math.abs(el.scrollLeft-top.scrollLeft)>1)el.scrollLeft=top.scrollLeft}

  async function load(){
    setSyncState('Synchronisation…')
    const [i,p,f,c,g,m]=await Promise.all([
      supabase.from('pp_progression_items').select('*').eq('class_id',klass.id).order('sort_order').order('created_at'),
      supabase.from('pp_class_periods').select('*').eq('class_id',klass.id).order('sort_order'),
      supabase.from('pp_pfmp_periods').select('*').eq('class_id',klass.id).order('sort_order'),
      supabase.from('pp_competencies').select('code,label,group_code').eq('diploma_code',klass.diploma_code).is('parent_code',null).order('sort_order'),
      supabase.from('pp_competency_groups').select('code,label,sort_order').eq('diploma_code',klass.diploma_code).order('sort_order'),
      supabase.from('pp_class_members').select('user_id,member_role').eq('class_id',klass.id)
    ])
    setItems(i.data||[]);setPeriods(p.data||[]);setPfmps(f.data||[]);setReferenceCompetencies(c.data||[]);setReferenceGroups(g.data||[])
    const ids=(i.data||[]).map(x=>x.id)
    if(ids.length){const {data}=await supabase.from('pp_progression_attachments').select('*').in('progression_item_id',ids).order('created_at');setAttachments(data||[])}else setAttachments([])
    const {data:{user:currentUser}}=await supabase.auth.getUser();setCurrentUserId(currentUser?.id||null)
    const userIds=unique((m.data||[]).map(x=>x.user_id))
    let names=[]
    if(userIds.length){const {data:profiles}=await supabase.from('pp_profiles').select('user_id,display_name,email').in('user_id',userIds);const eligible=(m.data||[]).filter(x=>['owner','editor'].includes(x.member_role));setTeacherMembers(eligible.map(x=>({id:x.user_id,name:(profiles||[]).find(p=>p.user_id===x.user_id)?.display_name||(profiles||[]).find(p=>p.user_id===x.user_id)?.email?.split('@')[0]||'Enseignant'})));names=(profiles||[]).map(p=>p.display_name||String(p.email||'').split('@')[0]).filter(Boolean)}else setTeacherMembers([])
    const itemNames=(i.data||[]).map(x=>x.teacher_label).filter(Boolean)
    const base=unique([...names,...itemNames])
    const combos=[]
    if(names.length>=2)combos.push(names.slice(0,2).join(' & '))
    if(names.length>=3)combos.push(names.slice(0,3).join(' & '))
    setTeacherOptions(unique([...base,...combos]))
    setSyncState('✓ Progression synchronisée')
  }
  useEffect(()=>{load()},[klass.id,klass.diploma_code])
  useEffect(()=>{if(addRequestToken>0&&!readOnly)setAddMenu(true)},[addRequestToken,readOnly])

  function canEditItem(item){return !readOnly&&!!currentUserId&&(item.created_by===currentUserId||(item.coauthor_ids||[]).includes(currentUserId))}
  async function remove(item){if(!canEditItem(item))return;if(!confirm(`Supprimer « ${item.context_name} » ?`))return;await supabase.from('pp_progression_items').delete().eq('id',item.id);load()}
  async function resumeInTerminale(item){
    if(!confirm('Créer une reprise de ce contexte en Terminale ? Le contexte de Première sera conservé.'))return;
    const {data:{user}}=await supabase.auth.getUser();
    const {id,created_at,updated_at,revision,...copy}=item;
    const {error}=await supabase.from('pp_progression_items').insert({...copy,class_id:klass.id,cycle_level:'terminale',period_id:'P1',created_by:user.id,status:'Prévu',updated_at:new Date().toISOString()});
    if(error)throw error;
  }
  async function duplicate(item){const {data:{user}}=await supabase.auth.getUser();const {id,created_at,updated_at,revision,...copy}=item;await supabase.from('pp_progression_items').insert({...copy,class_id:klass.id,context_name:`${item.context_name} — copie`,created_by:user.id,status:'Prévu',updated_at:new Date().toISOString()});load()}
  async function downloadAttachment(a){const {data,error}=await supabase.storage.from('pp-progression-files').createSignedUrl(a.storage_path,60);if(error)alert(err(error));else window.open(data.signedUrl,'_blank','noopener,noreferrer')}
  async function moveItem(item,direction){
    if(!canEditItem(item))return
    const siblings=items.filter(x=>x.period_id===item.period_id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||new Date(a.created_at)-new Date(b.created_at))
    const index=siblings.findIndex(x=>x.id===item.id);const target=index+direction
    if(index<0||target<0||target>=siblings.length)return
    const reordered=[...siblings];const [moved]=reordered.splice(index,1);reordered.splice(target,0,moved)
    await Promise.all(reordered.filter(row=>canEditItem(row)).map(row=>supabase.from('pp_progression_items').update({sort_order:(reordered.indexOf(row)+1)*10,updated_at:new Date().toISOString()}).eq('id',row.id)))
    load()
  }
  function scrollTimeline(where){const el=timelineRef.current;if(!el)return;const max=Math.max(0,el.scrollWidth-el.clientWidth);const left=where==='start'?0:where==='end'?max:Math.max(0,Math.min(max,el.scrollLeft+where*420));el.scrollTo({left,behavior:'instant'});if(topScrollRef.current)topScrollRef.current.scrollLeft=left}

  const visible=useMemo(()=>items.filter(i=>(cycleView==='cycle'||(i.cycle_level||levelToCycle(klass.level_label))===cycleView)&&(!teacherFilter||i.teacher_label===teacherFilter)&&(!groupFilter||groupKey(i)===groupFilter)&&(!levelFilter||i.learning_level===levelFilter)),[items,klass.level_label,cycleView,teacherFilter,groupFilter,levelFilter])
  const covered=useMemo(()=>new Set(items.flatMap(i=>competencyCodes(i.competencies))),[items])
  const visibleCovered=useMemo(()=>new Set(visible.flatMap(i=>competencyCodes(i.competencies))),[visible])
  const totalTop=referenceCompetencies.length
  const pByCode=useMemo(()=>Object.fromEntries(periods.map(p=>[p.code,p])),[periods])
  const orderedPfmp=[...pfmps].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
  const timelineColumns=useMemo(()=>{
    const period=(code,label,subtitle)=>({kind:'period',code,label:pByCode[code]?.label||label,subtitle:pByCode[code]?.subtitle||subtitle})
    const pfmp=(index)=>{const row=orderedPfmp[index];return {kind:'pfmp',code:`PFMP${index+1}`,label:row?.label||`PFMP ${index+1}`,subtitle:row?`${formatDate(row.start_date)} → ${formatDate(row.end_date)}`:'Dates à renseigner',row}}
    const cols=[period('P1','Rentrée → Toussaint','Sept. – oct.'),period('P2','Toussaint → PFMP 1','Oct. – nov.'),pfmp(0),period('P3','Retour PFMP → Noël','Déc.'),period('P4','Noël → Hiver','Janv. – fév.'),period('P5','Hiver → Printemps','Fév. – avril'),period('P6','Printemps → PFMP 2','Avril – mai'),pfmp(1),period('P7','Fin d’année','Juin')]
    if(orderedPfmp.length>2)cols.splice(cols.length-1,0,...orderedPfmp.slice(2).map((row,index)=>({kind:'pfmp',code:`PFMP${index+3}`,label:row.label||`PFMP ${index+3}`,subtitle:`${formatDate(row.start_date)} → ${formatDate(row.end_date)}`,row})))
    return cols
  },[periods,pfmps])

  function exportPrint(){
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
    const values=v=>Array.isArray(v)?v.flatMap(x=>typeof x==='string'?[x]:x&&typeof x==='object'?[x.label||x.name||x.text||x.code||'']:[]):lines(v)
    const selected=items.filter(i=>(printCycle==='cycle'||(i.cycle_level||levelToCycle(klass.level_label))===printCycle)&&(!printTeacher||i.teacher_label===printTeacher))
      .filter(i=>printOptions.events||String(i.item_kind||i.activity_type||'').toLowerCase()!=='event')
      .sort((a,b)=>String(a.period_id||'').localeCompare(String(b.period_id||''))||(a.sort_order||0)-(b.sort_order||0))
    const periodName=code=>({P1:'Rentrée → Toussaint',P2:'Toussaint → PFMP 1',P3:'Retour PFMP → Noël',P4:'Noël → Hiver',P5:'Hiver → Printemps',P6:'Printemps → PFMP 2',P7:'Fin d’année'})[code]||code||'—'
    const list=arr=>values(arr).filter(Boolean).map(v=>'<li>'+esc(v)+'</li>').join('')
    const refMap=new Map(referenceCompetencies.map(c=>[c.code,c]))
    const skill=i=>competencyCodes(i.competencies).map(code=>{const c=refMap.get(code);const group=c?.group_code||c?.group||groupKey(i);const g=GROUP_STYLE[group]||GROUP_STYLE.G1;return '<div class="skill"><span class="pill" style="color:'+g.color+';border-color:'+g.color+'">'+esc(g.personal)+'</span><b>'+esc(c?.label||code)+'</b> · '+esc(i.learning_level||'D')+'</div>'}).join('')
    const economy=i=>values(i.econ_law_links).map(code=>'<div class="econ"><b>Économie-Droit</b><div>'+esc(code)+'</div></div>').join('')
    const behaviour=i=>values(i.behaviours||i.professional_behaviours||i.expected_behaviours)
    const knowledge=i=>values(i.knowledge||i.associated_knowledge||i.savoirs)
    const rows=selected.map(i=>'<tr><td class="period"><b>'+esc(periodName(i.period_id))+'</b><small>'+esc(i.period_id||'')+'</small></td><td><b>'+esc(i.context_name||'Contexte')+'</b>'+(printOptions.problematic&&i.problematic?'<p class="problem">'+esc(i.problematic)+'</p>':'')+(printOptions.activities?'<ul>'+list(i.activities)+'</ul>':'')+'</td><td>'+(printOptions.competencies?skill(i):'')+(printOptions.economy?economy(i):'')+'</td><td><ul>'+list(behaviour(i))+'</ul></td><td><ul>'+list(knowledge(i))+'</ul></td></tr>').join('')
    const label=printCycle==='cycle'?'Cycle complet':printCycle==='premiere'?'Première':'Terminale'
    const header='<header><h1>Progression partagée · Bac Pro MCV · '+esc(klass.school_year||'2026-2027')+' · '+esc(printTeacher||'Tous les enseignants')+'</h1><div class="sub">'+esc(label)+' · '+esc(klass.name||klass.label||klass.class_name||'Progression pédagogique')+'</div></header>'
    const classic='<table><colgroup><col style="width:10%"><col style="width:20%"><col style="width:23%"><col style="width:23%"><col style="width:24%"></colgroup><thead><tr><th>Période</th><th>Contexte</th><th>Groupe de compétences - Compétences</th><th>Comportements</th><th>Savoirs</th></tr></thead><tbody>'+rows+'</tbody></table>'
    const chronological=selected.map(i=>'<article><h3>'+esc(periodName(i.period_id))+' · '+esc(i.context_name)+'</h3><p>'+esc(i.teacher_label||'')+'</p>'+(printOptions.competencies?'<div>'+skill(i)+'</div>':'')+(printOptions.economy?economy(i):'')+(printOptions.problematic?'<p>'+esc(i.problematic)+'</p>':'')+(printOptions.activities?'<ul>'+list(i.activities)+'</ul>':'')+'</article>').join('')
    const css='@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#10213e;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}header{margin:0 0 7px;break-after:avoid;page-break-after:avoid}h1{font-size:15px;border-left:5px solid #2674f5;border-bottom:2px solid #2674f5;padding:9px;margin:0 0 6px}.sub{background:#bfd9fc;font-weight:700;padding:7px}table{border-collapse:collapse;width:100%;table-layout:fixed}th{background:#dce9fc;text-align:left;font-size:9px;padding:5px;border:1px solid #9fb5d4}td{border:1px solid #9fb5d4;padding:5px;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:auto;page-break-inside:auto}td{break-inside:auto;page-break-inside:auto}thead{display:table-header-group}tfoot{display:table-footer-group}th:first-child{background:#a9e65e!important;color:#234313;border-color:#80bf35}td.period{background:#d8f6ac!important;color:#254615;border-color:#a4d769}td.period b{color:#254615}td.period{background:#c9f58c!important;border-color:#8dc850;color:#23430b}td.period small{display:block;color:#426922;margin-top:5px}th:first-child{background:#a8e65c!important;color:#23430b}.skill{margin-bottom:5px;line-height:1.35}.pill{display:inline-block;border:1px solid;border-radius:8px;padding:1px 4px;font-weight:bold;font-size:8px;margin-right:4px}.econ{border-left:3px solid #0b987c;background:#e7fbf2;padding:5px;margin-top:6px;font-size:9px}.problem{font-style:italic;color:#53637b}ul{margin:0;padding-left:13px}li{margin:0 0 2px}article{break-inside:avoid;border:1px solid #cbd8ea;border-left:5px solid #2674f5;padding:10px;margin:10px 0}article h3{margin:0 0 5px}@media screen{body{padding:20px}}'
    const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Progression pédagogique</title><style>'+css+'</style></head><body>'+header+(printMode==='classic'?classic:chronological)+'</body></html>'
    const w=window.open('','_blank');if(!w){window.alert('Autorisez les fenêtres surgissantes pour imprimer.');return}w.document.write(html);w.document.close();w.addEventListener('load',()=>{w.focus();w.print()},{once:true})
  }
  const synthesisItems=visible.filter(i=>String(i.item_kind||'context')!=='event')
  const synthesisHours=synthesisItems.reduce((n,i)=>n+(Number(i.duration_hours)||0),0)
  const synthesisMulti=synthesisItems.filter(i=>competencyCodes(i.competencies).length>1).length
  const synthesisShared=synthesisItems.filter(i=>/\\s&\\s|\\set\\s|,/.test(String(i.teacher_label||''))).length
  const synthesisCoverage=totalTop?Math.round(visibleCovered.size/totalTop*100):0
  const synthesisEngaged=new Set(synthesisItems.filter(i=>['En cours','Terminé'].includes(i.status)).flatMap(i=>competencyCodes(i.competencies))).size
  const synthesisEngagedPercent=totalTop?Math.round(synthesisEngaged/totalTop*100):0
  return <div className="personal-progression personal-reference-ui">
    <div className="personal-progression-toolbar">
      <div><span className="eyebrow">Ergonomie de la version personnelle</span><h3>Progression pédagogique partagée</h3><p>La classe reste vide au départ ; le référentiel, les périodes et les PFMP structurent la progression.</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="btn" onClick={()=>setShowSynthesis(v=>!v)}>Synthèse de la progression</button><button type="button" className="btn primary" style={{background:"#075cf7",color:"#fff",border:"2px solid #075cf7",fontWeight:800,boxShadow:"0 4px 12px #075cf733"}} onClick={()=>{setPrintCycle(cycleView==='cycle'?'premiere':cycleView);setPrintOpen(true)}}>▣ Imprimer la progression</button>{!readOnly&&<button className="btn primary" onClick={()=>{setNewPeriod(null);setAddMenu(v=>!v)}}><Plus/>Ajouter</button>}</div>
    </div>

    {showSynthesis&&<section style={{background:'white',border:'1px solid #dbe4ef',borderRadius:16,padding:18,margin:'14px 0'}}><div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><div><h3>Synthèse de la progression</h3><p>Vue de lecture rapide de la cohérence de la progression selon l'année du cycle affichée</p></div><button type="button" onClick={()=>{const content='Synthèse de la progression\\nContextes programmés : '+synthesisItems.length+'\\nVolume prévu : '+synthesisHours+' h\\nContextes multi-compétences : '+synthesisMulti+'\\nContextes partagés : '+synthesisShared+'\\nCouverture programmée : '+synthesisCoverage+' %\\nCouverture engagée : '+synthesisEngagedPercent+' %';const blob=new Blob([content],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='synthese-progression.txt';a.click();URL.revokeObjectURL(url)}}>Exporter une synthèse autonome</button></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}>{[['Contextes programmés',synthesisItems.length],['Volume prévu',synthesisHours+' h'],['Contextes multi-compétences',synthesisMulti],['Contextes partagés',synthesisShared]].map(([label,value])=><div key={label} style={{border:'1px solid #dbe4ef',background:'#f8fafc',borderRadius:12,padding:14}}><div>{label}</div><strong style={{fontSize:22}}>{value}</strong></div>)}</div><p>La vue affichée comporte <b>{synthesisItems.length} contexte(s)</b> représentant <b>{synthesisHours} h prévues</b>. <b>{synthesisMulti}</b> contexte(s) mobilisent plusieurs compétences. La couverture programmée du référentiel est de <b>{synthesisCoverage} %</b>, tandis que la couverture engagée est de <b>{synthesisEngagedPercent} %</b>. <b>{synthesisShared}</b> contexte(s) sont partagés entre enseignants.</p></section>}
    {printOpen&&<div role="presentation" style={{position:'fixed',inset:0,zIndex:9999,background:'#0f172a80',display:'grid',placeItems:'center',padding:16}}><div role="dialog" aria-modal="true" aria-label="Imprimer la progression" style={{background:'white',width:'min(980px,96vw)',maxHeight:'90vh',overflowY:'auto',borderRadius:20,padding:24,boxShadow:'0 20px 60px #0003'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Imprimer la progression</h2><button onClick={()=>setPrintOpen(false)} aria-label="Fermer">✕</button></div><p style={{padding:12,background:'#eff6ff',borderRadius:9}}>Choisissez le rendu souhaité. Seule la progression est imprimée : le tableau de bord reste exclu.</p><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,margin:'20px 0'}}>{[['chronological','Vue chronologique','Présentation visuelle par périodes'],['classic','Progression classique','Tableau annuel moderne et conventionnel']].map(([value,label,description])=><label key={value} style={{padding:15,border:'1px solid #cbd5e1',borderRadius:12,background:printMode===value?'#eff6ff':'white'}}><input type="radio" checked={printMode===value} onChange={()=>setPrintMode(value)}/> <b>{label}</b><div style={{fontSize:12,color:'#64748b'}}>{description}</div></label>)}</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><label>Vue<select value={printCycle} onChange={e=>setPrintCycle(e.target.value)}><option value="premiere">Première</option><option value="terminale">Terminale</option><option value="cycle">Cycle complet · 2 ans</option></select></label><label>Enseignant<select value={printTeacher} onChange={e=>setPrintTeacher(e.target.value)}><option value="">Tous les enseignants</option>{teacherOptions.map(t=><option key={t} value={t}>{t}</option>)}</select></label></div><div style={{display:'grid',gap:18,margin:'24px 0'}}>{[['events','Afficher les événements / activités pédagogiques'],['competencies','Afficher les compétences principales et niveaux N/D/A/E'],['economy','Afficher les transversalités Économie-Droit'],['problematic','Afficher problématiques / objectifs'],['activities','Afficher activités / productions élèves']].map(([key,label])=><label key={key} style={{display:'flex',gap:12,alignItems:'center',justifyContent:'center'}}><input type="checkbox" checked={printOptions[key]} onChange={e=>setPrintOptions(o=>({...o,[key]:e.target.checked}))}/>{label}</label>)}</div><div style={{display:'flex',justifyContent:'flex-end',gap:10}}><button onClick={()=>setPrintOpen(false)}>Annuler</button><button className="btn primary" style={{background:"#075cf7",color:"#fff",border:"2px solid #075cf7",fontWeight:800,padding:"14px 24px",boxShadow:"0 4px 12px #075cf733"}} onClick={exportPrint}>🖨 Imprimer la progression</button></div></div></div>}
    <div className="personal-cycle-selector" role="group" aria-label="Année du cycle affichée">
      <strong>ANNÉE DU CYCLE AFFICHÉE</strong>
      <div className="personal-cycle-buttons">{[['premiere','Première'],['terminale','Terminale'],['cycle','Cycle complet · 2 ans']].map(([value,label])=><button type="button" key={value} className={cycleView===value?'active':''} onClick={()=>{setCycleView(value);timelineRef.current?.scrollTo({left:0,behavior:'smooth'})}} aria-pressed={cycleView===value}>{label}{value!=='cycle'&&<small> · {items.filter(i=>(i.cycle_level||levelToCycle(klass.level_label))===value).length} contexte(s)</small>}</button>)}</div>
      <small>Cette vue filtre uniquement les contextes de la classe ouverte. Les autres classes ne sont pas fusionnées.</small>
    </div>
    <div className="personal-controls">
      <label className="inline-control"><span>Filtrer par enseignant</span><select value={teacherFilter} onChange={e=>setTeacherFilter(e.target.value)}><option value="">Tous les enseignants</option>{teacherOptions.map(n=><option key={n}>{n}</option>)}</select></label>
      <label className="inline-control"><span>Groupe de compétences</span><select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}><option value="">Tous les groupes</option>{referenceGroups.map(g=><option key={g.code} value={g.code}>{GROUP_STYLE[g.code]?.personal||g.code} · {g.label}</option>)}</select></label>
      <label className="inline-control"><span>Niveau</span><select value={levelFilter} onChange={e=>setLevelFilter(e.target.value)}><option value="">Tous les niveaux</option>{LEARNING.map(([k,l])=><option key={k} value={k}>{k} · {l}</option>)}</select></label>
      <div className="personal-controls-spacer"/>{(teacherFilter||groupFilter||levelFilter)&&<button type="button" className="btn ghost" onClick={()=>{setTeacherFilter('');setGroupFilter('');setLevelFilter('')}}>Réinitialiser les filtres</button>}<span className="sync-state">{syncState}</span>
    </div>

    {(teacherFilter||groupFilter||levelFilter)&&<p className="muted" role="status">{visible.length} contexte(s) affiché(s) sur {items.length}</p>}
    <style>{`
      .personal-cycle-selector{display:flex;flex-direction:column;gap:7px;margin:14px 0;padding:13px 15px;background:#f8fafc;border:1px solid #dbe4ef;border-radius:13px}
      .personal-add-menu-backdrop{position:fixed;inset:0;background:#0f172a55;z-index:9998;display:flex;justify-content:flex-end;align-items:flex-start;padding:105px 28px 24px;box-sizing:border-box}
      .personal-add-menu{width:min(360px,calc(100vw - 40px));background:#fff;border:1px solid #dbe4f0;border-radius:16px;box-shadow:0 18px 55px #0f172a30;padding:14px;display:grid;gap:8px}
      .personal-add-menu h4{margin:4px 6px 8px;font-size:16px}
      .personal-add-menu button{text-align:left;display:grid;gap:5px;border:1px solid #e2e8f0;background:#fff;border-radius:12px;padding:14px;cursor:pointer;color:#14233b}
      .personal-add-menu button:hover{border-color:#3b82f6;background:#eff6ff}
      .personal-add-menu button small{font-size:12px;color:#64748b}
      .personal-add-menu button.personal-add-menu-cancel{display:block;text-align:center;color:#64748b}
      .personal-analytics{display:grid;gap:16px;margin-top:18px}.personal-analytics-panel{background:white;border:1px solid #dce5f1;border-radius:17px;padding:18px}.personal-analytics-panel h3,.personal-analytics-alerts h3{margin:0 0 7px;color:#172541}.personal-analytics-panel>p{color:#64748b;margin:0 0 14px;font-size:13px}.personal-analytics-levels{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.personal-analytics-levels>div{padding:15px 8px;border-radius:13px;display:grid;gap:5px;justify-items:center;text-align:center}.personal-analytics-levels b{font-size:23px}.personal-analytics-levels span{font-size:12px}.personal-analytics-panel>small{display:block;text-align:center;margin-top:12px;color:#64748b}.personal-analytics-alerts{border:1px solid #fed7aa;border-left:4px solid #fb923c;background:#fff7ed;border-radius:14px;padding:15px}.personal-analytics-alerts p{padding:10px 0;border-bottom:1px dashed #fdba74;margin:0;font-size:13px}.personal-analytics-alerts p:last-child{border:0}.personal-analytics-search{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin:4px 0 13px}.personal-analytics-table td{vertical-align:top;line-height:1.6}.personal-analytics-table td:nth-child(6){min-width:220px}.personal-analytics-level-chip{display:inline-block;border-radius:20px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap}.personal-analytics-cycle{display:grid;gap:9px}.personal-analytics-cycle-row{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:9px}.personal-analytics-cycle-row>strong,.personal-analytics-cycle-row>div{background:#f8fafc;border:1px solid #dce5f1;border-radius:12px;padding:12px;font-size:12px}.personal-analytics-cycle-row>div{display:grid;align-content:start;justify-items:start;gap:8px}.personal-analytics-cycle-row p{margin:0;color:#64748b;line-height:1.5}.personal-analytics-notice{background:#eff6ff;padding:10px;border-radius:9px}.personal-analytics-notice button{border:0;background:none;color:#1d4ed8;font-weight:700;cursor:pointer}@media(max-width:700px){.personal-analytics-levels{grid-template-columns:repeat(2,minmax(0,1fr))}.personal-analytics-cycle-row{grid-template-columns:1fr}}
      .personal-group-detail-link{border:0;background:transparent;color:#3970b4;cursor:pointer;padding:5px 0;font-size:12px;text-decoration:underline;text-underline-offset:3px}
      .personal-detail-backdrop{position:fixed;inset:0;background:#11182780;z-index:9997;display:grid;place-items:center;padding:22px}
      .personal-detail-modal{width:min(1060px,100%);max-height:92vh;overflow:auto;box-sizing:border-box;background:#f8fbff;border-radius:24px;padding:25px;box-shadow:0 25px 80px #0f172a44}
      .personal-detail-header{display:flex;justify-content:space-between;gap:18px}.personal-detail-header h2{margin:0;color:#11254b;font-size:24px}.personal-detail-header p{color:#64748b;margin:8px 0}.personal-detail-header button{align-self:flex-start;border:1px solid #d9e3f1;border-radius:12px;background:white;padding:7px 13px;font-size:23px;cursor:pointer}
      .personal-detail-summary{display:flex;gap:10px;margin:15px 0}.personal-detail-summary span{border:1px solid #dbe5f3;border-radius:20px;background:#fff;padding:9px 13px;font-weight:700;font-size:13px}
      .personal-detail-list{display:grid;gap:14px}.personal-detail-competency{background:white;border:1px solid #d7e2f1;border-radius:17px;padding:17px}
      .personal-detail-competency-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;background:none;border:0;cursor:pointer;text-align:left;color:#172541}
      .personal-detail-competency-title{display:grid;gap:7px;flex:1;min-width:160px}.personal-detail-competency-title strong{font-size:15px}.personal-detail-competency-title small{color:#2563eb;font-weight:700}
      .personal-detail-levels{display:flex;gap:5px}.personal-detail-levels>span{min-width:42px;display:grid;justify-items:center;gap:3px;padding:8px 6px;border-radius:10px}.personal-detail-levels b{font-size:16px}.personal-detail-levels small{font-size:11px}
      .personal-detail-level-D,.personal-detail-bubble-D{background:#dbeafe;color:#1d4ed8}.personal-detail-level-E,.personal-detail-bubble-E{background:#fef3c7;color:#92400e}.personal-detail-level-A,.personal-detail-bubble-A{background:#ede9fe;color:#6d28d9}.personal-detail-level-M,.personal-detail-bubble-M{background:#dcfce7;color:#15803d}
      .personal-detail-maximum{display:grid;gap:7px;font-size:12px;color:#64748b;text-align:center}.personal-detail-maximum b{font-size:18px;color:#6d28d9}
      .personal-detail-frequency{display:grid;gap:9px;font-size:12px;color:#64748b;min-width:120px}.personal-detail-frequency i{display:flex;gap:4px}.personal-detail-frequency em{width:25px;height:9px;border-radius:4px}
      .personal-detail-expanded{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:14px}.personal-detail-expanded h4{margin:4px 0 14px}.personal-detail-journey{display:flex;gap:15px;overflow:auto;padding:8px 0 20px}.personal-detail-journey>div{min-width:145px;flex:1;display:grid;justify-items:center;align-content:start;gap:7px;text-align:center;font-size:12px}.personal-detail-journey strong{font-size:12px}.personal-detail-journey small{color:#64748b}.personal-detail-bubble{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:800}
      .personal-detail-table-wrap{overflow-x:auto;border:1px solid #e0e8f3;border-radius:12px}.personal-detail-table-wrap table{width:100%;border-collapse:collapse;font-size:12px}.personal-detail-table-wrap th,.personal-detail-table-wrap td{padding:11px;text-align:left;border-bottom:1px solid #e2e8f0}.personal-detail-table-wrap th{background:#f1f5f9}
      @media(max-width:720px){.personal-detail-modal{padding:15px}.personal-detail-competency-toggle{flex-wrap:wrap}.personal-detail-frequency{min-width:100px}}
      .personal-cycle-selector>strong{font-size:11px;letter-spacing:.06em;color:#475569}
      .personal-cycle-selector>small{font-size:11px;color:#64748b}
      .personal-cycle-buttons{display:flex;flex-wrap:wrap;gap:6px}
      .personal-cycle-buttons button{padding:9px 12px;border:1px solid #dbe4ef;background:#fff;border-radius:9px;color:#334155;cursor:pointer}
      .personal-cycle-buttons button.active{border-color:#2563eb;background:#eaf2ff;color:#1d4ed8;font-weight:800}
      /* Barre haute type V14.1 : piste discrète et curseur large, glissable. */
      .personal-timeline-navigation{display:flex;align-items:center;gap:9px;margin:10px 0 12px}
      .personal-timeline-navigation>button{flex:0 0 auto;border:1px solid #d7e0ed;background:#fff;border-radius:11px;min-height:40px;padding:8px 13px;font-weight:650;color:#15233e;cursor:pointer;transition:background .15s,border-color .15s}
      .personal-timeline-navigation>button:hover{background:#eff6ff;border-color:#93b4e8}
      /* Même barre native que sous la progression, sans piste ni curseur décoratif. */
      .personal-scroll-track{flex:1;min-width:100px;overflow-x:scroll;overflow-y:hidden;height:20px;background:transparent;border:0;padding:0}
      .personal-scroll-track:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
      /* Reprise des proportions et couleurs de la progression personnelle V14.1 */
      .personal-timeline{align-items:stretch;gap:8px}
      .personal-period-column{height:66vh;min-height:510px;max-height:700px;display:flex;flex-direction:column;overflow:hidden;background:#f8fafc}
      .personal-period-head{flex:0 0 auto;min-height:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:10px 8px 8px;gap:2px}
      .personal-period-head>div{text-align:center;width:100%}
      .personal-period-head h4{font-weight:900;letter-spacing:.01em}
      .personal-period-add{display:grid;place-items:center;position:relative;margin:6px auto 0;width:34px;height:34px;min-width:34px;min-height:34px;border-radius:50%;background:#fff;color:var(--period-accent,#2563eb);border:0;box-shadow:0 2px 8px #0f172a1c;cursor:pointer}.personal-period-add:hover{transform:scale(1.08);box-shadow:0 3px 12px #0f172a30}.personal-period-theme-p1,.personal-period-theme-p5{--period-accent:#2f80ed}.personal-period-theme-p2,.personal-period-theme-p6{--period-accent:#18a96b}.personal-period-theme-p3,.personal-period-theme-p7{--period-accent:#ef4444}.personal-period-theme-p4{--period-accent:#7c3aed}
      .personal-card-competencies{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0}.personal-card-group-tag{font-size:11px;font-weight:800;border-radius:14px;background:#eef2ff;color:#1e40af;padding:3px 7px}
      .personal-period-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-color:#64748b #e2e8f0;scrollbar-width:thin}
      .personal-period-theme-p1 .personal-period-head,.personal-period-theme-p5 .personal-period-head{background:linear-gradient(135deg,#2f80ed,#56a8ff);color:#fff}
      .personal-period-theme-p2 .personal-period-head,.personal-period-theme-p6 .personal-period-head{background:linear-gradient(135deg,#18a96b,#58cf8b);color:#fff}
      .personal-period-theme-p3 .personal-period-head,.personal-period-theme-p7 .personal-period-head{background:linear-gradient(135deg,#ef4444,#fb7185);color:#fff}
      .personal-period-theme-p4 .personal-period-head{background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff}
      .personal-pfmp-column{width:76px;min-width:76px;max-width:76px;background:linear-gradient(180deg,#fff8dc,#ffefad);border:1px solid #f2cf61;align-items:center;justify-content:center}
      .personal-pfmp-vertical{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;height:100%;padding:12px 8px;color:#5f4500;text-align:center}
      .personal-pfmp-vertical strong{writing-mode:vertical-rl;text-orientation:upright;letter-spacing:.12em;font-size:16px}
      .personal-pfmp-vertical span{writing-mode:vertical-rl;text-orientation:mixed;font-size:11px}
      @media(max-width:760px){.personal-period-column{height:64vh;min-height:500px}}
      .personal-v14-dashboard{margin:18px 0 22px;padding:18px;border:1px solid #dbe4ef;border-radius:16px;background:#f8faff}
      .personal-v14-dashboard-title{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
      .personal-v14-dashboard-title strong{font-size:19px;color:#12233c}.personal-v14-dashboard-title span{color:#64748b}
      .personal-v14-ring-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .personal-v14-ring-card{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}
      .personal-v14-ring-card>strong{font-size:14px;color:#334155}
      .personal-v14-ring{height:114px;width:114px;border-radius:50%;display:grid;place-items:center}
      .personal-v14-ring>div{background:white;width:83px;height:83px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
      .personal-v14-ring b{font-size:16px}.personal-v14-ring span{font-size:13px;color:#64748b}
      .personal-v14-groups{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-top:14px}
      .personal-v14-group-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:14px;margin-top:12px}
      .personal-v14-group-grid>div{display:grid;gap:6px;font-size:13px}
      .personal-v14-meter{height:9px;border-radius:20px;background:#e8edf5;overflow:hidden}.personal-v14-meter i{display:block;height:100%;border-radius:20px}
      .personal-v14-levels{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.personal-v14-levels span{padding:9px 12px;border-radius:10px;background:#f1f5f9;font-size:13px}
      .personal-summary-side-by-side{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start;margin:12px 0}
      .personal-summary-side-by-side>.personal-summary-quality,.personal-summary-side-by-side>.personal-summary-alerts{min-width:0;margin:0}
      .personal-summary-side-by-side>.personal-summary-quality,.personal-summary-side-by-side>.personal-summary-alerts{box-sizing:border-box;border-radius:18px}
      .personal-summary-side-by-side>.personal-summary-quality{display:flex;flex-direction:column;justify-content:flex-start}
      .personal-summary-side-by-side>.personal-summary-quality>div:last-child{flex:1}
      .personal-summary-side-by-side>.personal-summary-alerts{height:auto;border-width:1px 1px 1px 4px}

      .personal-summary-side-by-side .personal-summary-alerts{align-self:start;display:flex;flex-direction:column;justify-content:flex-start;min-height:0;padding:14px 18px}
      .personal-summary-side-by-side .personal-summary-alerts h3{margin:0 0 5px;font-size:19px}
      .personal-summary-side-by-side .personal-summary-alerts p{flex:initial;display:block;margin:0;padding:9px 0;line-height:1.4}
      .personal-summary-side-by-side .personal-summary-alerts p:last-child{border-bottom:0}
      @media(max-width:950px){.personal-summary-side-by-side .personal-summary-alerts{min-height:auto}.personal-summary-side-by-side .personal-summary-alerts p{flex:initial}}
      @media(max-width:950px){.personal-summary-side-by-side{grid-template-columns:1fr}}
      /* KPI compacts dans la zone libre sous les alertes : grille 2 x 2 */
      .personal-summary-side-by-side>.personal-summary-right{display:flex;flex-direction:column;gap:12px;min-width:0;align-self:start}
      .personal-summary-side-by-side .personal-summary-right>.personal-summary-alerts{margin:0;width:100%;box-sizing:border-box}
      .personal-progression-summary .personal-summary-right>.personal-kpis-compact{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px!important;width:100%;max-width:100%;margin:0!important;padding:0!important;justify-content:stretch!important}
      .personal-progression-summary .personal-summary-right>.personal-kpis-compact>.personal-kpi{width:100%!important;min-width:0!important;min-height:65px!important;box-sizing:border-box;flex:initial!important}
      .personal-summary-right .personal-kpis-compact .kpi-copy>span{white-space:normal!important}
      @media(max-width:950px){.personal-summary-side-by-side>.personal-summary-right{width:100%}}
      @media(max-width:440px){.personal-progression-summary .personal-summary-right>.personal-kpis-compact{grid-template-columns:1fr}}
      /* Indicateurs synthétiques : quatre pastilles compactes sans cartes géantes */
      .personal-progression-summary .personal-kpis{display:flex!important;flex-wrap:wrap;gap:8px!important;margin:10px 0 12px!important;align-items:stretch}
      .personal-progression-summary .personal-kpi{display:flex!important;flex:1 1 185px;min-width:0;align-items:center;justify-content:space-between;gap:12px;padding:9px 13px!important;min-height:48px!important;border-radius:10px!important;box-shadow:none!important}
      .personal-progression-summary .personal-kpi span{font-size:12px!important;line-height:1.25}
      .personal-progression-summary .personal-kpi strong{font-size:21px!important;line-height:1.1;white-space:nowrap}
      @media(max-width:600px){.personal-progression-summary .personal-kpi{flex-basis:calc(50% - 8px);padding:8px!important}.personal-progression-summary .personal-kpi strong{font-size:18px!important}}
      /* Indicateurs KPI compacts : largeur ajustée au contenu, sans étirement */
      .personal-progression-summary .personal-kpis-compact{display:flex!important;justify-content:center;align-items:center;flex-wrap:wrap;gap:10px!important;margin:12px auto 16px!important;width:fit-content;max-width:100%}
      .personal-progression-summary .personal-kpis-compact .personal-kpi{flex:0 0 auto!important;width:auto!important;min-width:0!important;min-height:58px!important;padding:9px 12px!important;display:flex!important;justify-content:flex-start!important;gap:10px!important;border-radius:12px!important}
      .personal-kpis-compact .kpi-icon{width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex:0 0 38px;border-radius:10px;font-size:23px;font-weight:800}
      .personal-kpis-compact .kpi-copy{display:flex;flex-direction:column;gap:2px;min-width:0;border-left:2px solid currentColor;padding-left:10px}
      .personal-kpis-compact .kpi-copy>span{font-size:12px!important;white-space:nowrap;color:#475569}
      .personal-kpis-compact .kpi-copy>strong{font-size:22px!important;line-height:1.1}
      .personal-kpis-compact .kpi-blue{background:#ffffff!important;border-color:#c9dcff!important;color:#075fe2}.personal-kpis-compact .kpi-blue .kpi-icon{background:#deebff}
      .personal-kpis-compact .kpi-orange{background:#ffffff!important;border-color:#ffe1bd!important;color:#e87505}.personal-kpis-compact .kpi-orange .kpi-icon{background:#ffead5}
      .personal-kpis-compact .kpi-green{background:#ffffff!important;border-color:#c8edd9!important;color:#07864b}.personal-kpis-compact .kpi-green .kpi-icon{background:#ddf6e8}
      .personal-kpis-compact .kpi-red{background:#ffffff!important;border-color:#ffd2da!important;color:#d51635}.personal-kpis-compact .kpi-red .kpi-icon{background:#ffe4e9}
      @media(max-width:600px){.personal-progression-summary .personal-kpis-compact{justify-content:flex-start}.personal-progression-summary .personal-kpis-compact .personal-kpi{flex:1 1 45%!important}.personal-kpis-compact .kpi-copy>span{white-space:normal}}
      /* Tableau de bord dense, contrasté et lumineux */
      .personal-v14-dashboard{padding:13px 15px;margin:12px 0 16px;border-radius:16px;background:#f6f9ff}
      .personal-v14-dashboard-title{margin-bottom:10px;align-items:center}
      .personal-v14-dashboard-title strong{font-size:18px}
      .personal-v14-ring-grid{gap:9px}
      .personal-v14-ring-card{min-height:84px;padding:10px 13px;gap:10px;flex-direction:row;justify-content:space-between;text-align:left;background:linear-gradient(120deg,#fff 30%,#edf5ff);border-color:#cbdcf9;box-shadow:0 2px 8px #1e40af0a}
      .personal-v14-ring-card:nth-child(2){background:linear-gradient(120deg,#fff 30%,#fff0cc);border-color:#fbd38d}
      .personal-v14-ring-card:nth-child(3){background:linear-gradient(120deg,#fff 30%,#d6ffed);border-color:#8ee7c1}
      .personal-v14-ring-card>strong{font-size:14px;max-width:160px;color:#10294b;line-height:1.3}
      .personal-v14-ring{width:70px;height:70px;flex:0 0 70px}
      .personal-v14-ring>div{width:49px;height:49px}
      .personal-v14-ring b{font-size:12px;white-space:nowrap;color:#0f2a4a}
      .personal-v14-ring span{font-size:11px;font-weight:700}
      .personal-v14-groups{margin-top:10px;padding:12px 14px;border-color:#cbdcf9}
      .personal-v14-group-grid{gap:9px;margin-top:9px}
      .personal-v14-group-grid>div{padding:10px 12px;border-radius:11px;background:#eff5ff;gap:4px;font-weight:600}
      .personal-v14-group-grid>div:nth-child(2){background:#fff3df}
      .personal-v14-group-grid>div:nth-child(3){background:#f3eaff}
      .personal-v14-group-grid>div:nth-child(4){background:#e5fff0}
      .personal-v14-meter{height:7px;background:#dbe4f2}
      .personal-v14-group-grid small{font-weight:700;color:#334155}
      .personal-analytics-panel{padding:12px 14px}
      .personal-analytics-panel h3{margin:0 0 4px;font-size:17px}
      .personal-analytics-panel p{margin:4px 0 10px}
      .personal-analytics-levels{gap:8px}
      .personal-analytics-levels>div{padding:10px 8px;gap:2px;border:1px solid #c4d7f8}
      .personal-analytics-levels>div:nth-child(1){background:#c8ddff;color:#104bbd}
      .personal-analytics-levels>div:nth-child(2){background:#ffedaa;color:#974100;border-color:#ffd36c}
      .personal-analytics-levels>div:nth-child(3){background:#e2d1ff;color:#6223c6;border-color:#c8a5ff}
      .personal-analytics-levels>div:nth-child(4){background:#c6f7db;color:#087f43;border-color:#84e3b0}
      .personal-analytics-levels b{font-size:22px}
      .personal-analytics-levels span{font-size:12px;font-weight:700}
      /* Cartes pleines et contrastées, style compact demandé */
      .personal-v14-ring-card{min-height:72px;padding:10px 14px;background:#1769e8!important;border-color:#1769e8!important;color:#fff;box-shadow:none}
      .personal-v14-ring-card:nth-child(2){background:#ffad0d!important;border-color:#ffad0d!important;color:#17243c}
      .personal-v14-ring-card:nth-child(3){background:#08ae7b!important;border-color:#08ae7b!important;color:#fff}
      .personal-v14-ring-card>strong{color:inherit;font-size:13px;max-width:175px}
      .personal-v14-ring{width:61px;height:61px;flex-basis:61px;background:conic-gradient(#fff var(--progress,0%),#ffffff55 0)!important}
      .personal-v14-ring>div{width:45px;height:45px;background:#fff}
      .personal-v14-ring b{font-size:11px;color:#17345a}
      .personal-v14-ring span{font-size:10px;color:#17345a}
      .personal-v14-group-grid>div{background:#236bf0!important;color:#fff;padding:9px 11px}
      .personal-v14-group-grid>div:nth-child(2){background:#ff9b20!important;color:#17243c}
      .personal-v14-group-grid>div:nth-child(3){background:#873deb!important;color:#fff}
      .personal-v14-group-grid>div:nth-child(4){background:#10a96a!important;color:#fff}
      .personal-v14-group-grid small{color:inherit}
      .personal-v14-group-grid .personal-group-detail-link{color:inherit;text-decoration:underline;font-weight:700}
      .personal-v14-meter{background:#ffffff70}
      .personal-v14-meter i{background:#fff!important}
      .personal-v14-group-grid>div:nth-child(2) .personal-v14-meter{background:#17243c35}
      .personal-v14-group-grid>div:nth-child(2) .personal-v14-meter i{background:#17243c!important}
      .personal-analytics-levels>div{padding:9px 7px;min-height:54px;border:0}
      .personal-analytics-levels>div:nth-child(1){background:#2875eb;color:#fff}
      .personal-analytics-levels>div:nth-child(2){background:#ffca32;color:#202634}
      .personal-analytics-levels>div:nth-child(3){background:#8446e8;color:#fff}
      .personal-analytics-levels>div:nth-child(4){background:#12b878;color:#fff}
      /* Reproduction de la présentation V14.1 : grandes jauges, titres, sous-titres et bandeaux */
      .personal-v14-dashboard{background:#f3f6fc;padding:14px}
      .personal-v14-ring-grid{gap:16px}
      .personal-v14-ring-card,.personal-v14-ring-card:nth-child(2),.personal-v14-ring-card:nth-child(3){background:#fff!important;color:#10294b!important;border:1px solid #d8e3f5!important;border-radius:23px;min-height:0;padding:12px 15px;display:flex;flex-direction:column;align-items:stretch;gap:8px;box-shadow:none}
      .personal-v14-ring-heading{display:flex;align-items:center;gap:12px;text-align:left;min-height:36px}
      .personal-v14-ring-heading>div{display:grid;gap:3px}
      .personal-v14-ring-heading strong{font-size:12px;color:#10294b}
      .personal-v14-ring-heading small{font-size:11px;color:#62799d}
      .personal-v14-ring-icon{width:34px;height:34px;flex:0 0 34px;border-radius:50%;display:grid;place-items:center;font-size:20px;font-weight:800}
      .personal-v14-ring-card .personal-v14-ring{height:92px!important;width:92px!important;flex:0 0 92px!important;margin:0 auto;border-radius:50%;background:conic-gradient(var(--ring-color) 0%,#e8edf5 0)}
      .personal-v14-ring-card .personal-v14-ring>div{height:70px!important;width:70px!important;background:#fff}
      .personal-v14-ring-card .personal-v14-ring b{font-size:17px;color:#10294b}
      .personal-v14-ring-card .personal-v14-ring span{font-size:15px;color:#10294b}
      .personal-v14-ring-status{width:100%;padding:8px 10px;border-radius:10px;display:grid;gap:5px;text-align:left;margin-top:auto}
      .personal-v14-ring-status b{font-size:14px}
      .personal-v14-ring-status small{font-size:12px;line-height:1.4;color:inherit}
      .personal-v14-group-grid>div,.personal-v14-group-grid>div:nth-child(2),.personal-v14-group-grid>div:nth-child(3),.personal-v14-group-grid>div:nth-child(4){background:#f6f8fc!important;color:#10294b!important;padding:9px;border-radius:11px}
      .personal-v14-group-grid small{color:#62799d}
      .personal-v14-group-grid .personal-group-detail-link{color:#4268a5}
      .personal-v14-meter{background:#e7edf5}
      .personal-v14-group-grid>div:nth-child(2) .personal-v14-meter{background:#e7edf5}
      .personal-v14-group-grid>div .personal-v14-meter i{background:var(--unused,#2589e8)!important}
      .personal-v14-group-grid>div:nth-child(2) .personal-v14-meter i{background:#ff9918!important}
      .personal-v14-group-grid>div:nth-child(3) .personal-v14-meter i{background:#8546ef!important}
      .personal-v14-group-grid>div:nth-child(4) .personal-v14-meter i{background:#12ae71!important}
      .personal-v14-ring-card .personal-v14-ring{display:grid!important;place-items:center!important;background:conic-gradient(var(--ring-color) var(--progress),#e8edf5 0)!important}
      .personal-v14-ring-card .personal-v14-ring>div{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;border-radius:50%}
      .personal-v14-ring-card .personal-v14-ring b{font-size:17px!important;white-space:nowrap}
      .personal-v14-ring-card .personal-v14-ring span{font-size:12px!important}
      .personal-v14-ring-status small{font-size:11px}
      .personal-v14-dashboard{padding:10px;margin:10px 0 14px}
      .personal-v14-ring-grid{gap:10px}
      .personal-v14-groups{margin-top:10px;padding:10px}
      .personal-v14-group-grid{gap:8px;margin-top:8px}
      .personal-v14-levels{margin-top:8px}
      .personal-v14-secondary-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:start;margin-top:10px}
      .personal-v14-secondary-grid>.personal-v14-groups{min-width:0;width:auto;margin:0;padding:10px}
      .personal-v14-secondary-grid .personal-v14-levels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
      .personal-v14-secondary-grid>.personal-v14-level-summary{margin:0;min-width:0;display:flex;flex-direction:column;padding:10px}
      .personal-v14-secondary-grid>.personal-v14-level-summary .personal-analytics-levels{flex:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:7px}
      .personal-v14-secondary-grid>.personal-v14-level-summary .personal-analytics-levels>div{min-width:0;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:10px 5px}
      .personal-v14-secondary-grid>.personal-v14-level-summary>small{margin-top:auto;text-align:center}
      /* Alignement du bas des deux panneaux comme sur la maquette validée */
      .personal-v14-secondary-grid{align-items:stretch}
      .personal-v14-secondary-grid>.personal-v14-groups{display:flex;flex-direction:column;min-height:184px}
      .personal-v14-secondary-grid .personal-v14-group-grid{flex:1;align-items:stretch}
      .personal-v14-secondary-grid .personal-v14-group-grid>div{display:flex;flex-direction:column;min-width:0}
      .personal-v14-secondary-grid .personal-group-detail-link{margin-top:auto;align-self:center}
      .personal-v14-secondary-grid .personal-v14-levels{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;flex:1;align-items:stretch}
      .personal-v14-secondary-grid .personal-v14-levels span{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-width:0;padding:9px 5px}
      .personal-v14-secondary-grid .personal-v14-levels span b{font-size:19px}
      .personal-v14-secondary-grid .personal-v14-levels+small{margin-top:auto}
      @media(max-width:1250px){.personal-v14-secondary-grid .personal-v14-levels{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:950px){.personal-v14-secondary-grid{grid-template-columns:1fr}}
      @media(max-width:850px){.personal-v14-ring-grid{grid-template-columns:1fr}.personal-v14-ring-card{min-height:65px}.personal-analytics-levels{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:700px){.personal-v14-ring-grid{grid-template-columns:1fr}}
    `}</style>
    <div className="personal-timeline-navigation no-print"><button onClick={()=>scrollTimeline('start')}>« Début</button><button onClick={()=>scrollTimeline(-1)}>←</button><div className="personal-scroll-track" ref={topScrollRef} onScroll={syncFromTop} role="region" aria-label="Barre de défilement supérieure de la progression" tabIndex={0}><div style={{width:timelineColumns.reduce((total,col)=>total+(col.kind==='pfmp'?76:258),0)+Math.max(0,timelineColumns.length-1)*8,height:1}}/></div><button onClick={()=>scrollTimeline(1)}>→</button><button onClick={()=>scrollTimeline('end')}>Fin »</button></div>
    <div className="personal-timeline-wrap" ref={timelineRef} onScroll={syncTimelinePosition}>
      <div className="personal-timeline" style={{gridTemplateColumns:timelineColumns.map(col=>col.kind==='pfmp'?'76px':'258px').join(' ')}}>
        {timelineColumns.map(col=>col.kind==='pfmp'
          ? <PfmpColumn key={col.code} col={col}/>
          : <PeriodColumn key={col.code} col={col} items={visible.filter(i=>i.period_id===col.code)} files={attachments} readOnly={readOnly} onAdd={()=>{setNewPeriod(col.code);setNewKind('context');setOpen(true)}} canEditItem={canEditItem} onEdit={item=>{if(canEditItem(item))setEditItem(item)}} onDelete={remove} onDuplicate={duplicate} onDownload={downloadAttachment} onMove={moveItem} onEvaluate={onEvaluateContext}/>
        )}
      </div>
    </div>

    <div className="personal-progression-summary" aria-label="Bilan pédagogique après la progression">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:10}}>
        <div><h3 style={{margin:'0 0 4px',fontSize:24}}>Vue annuelle de la progression</h3><p style={{margin:0,color:'#64748b'}}>Lecture chronologique des contextes et de la montée en compétence sur l'année</p></div>
        <button type="button" onClick={()=>{setPrintCycle(cycleView==='cycle'?'premiere':cycleView);setPrintOpen(true)}} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:9,background:'#075cf7',color:'#fff',border:'2px solid #075cf7',borderRadius:11,padding:'12px 19px',fontSize:15,fontWeight:800,cursor:'pointer',boxShadow:'0 4px 12px #075cf733'}}><span aria-hidden="true">🖨</span> Imprimer la progression</button>
      </div>
    <section className="personal-v14-dashboard" aria-label="Tableau de bord de progression V14.1">
      <div className="personal-v14-dashboard-title"><strong>Tableau de bord pédagogique</strong><span>Programmation et couverture des compétences</span></div>
      <div className="personal-v14-ring-grid">
        {[
          {label:'Compétences programmées',subtitle:'Compétences distinctes du référentiel MCV',value:covered.size,total:totalTop,color:'#2589e8',symbol:'◎',status:covered.size===totalTop?'✓ Référentiel entièrement programmé':'Référentiel en cours de programmation',detail:`${covered.size} compétences officielles distinctes sur ${totalTop}.`},
          {label:'Couverture engagée',subtitle:'Compétences dans des éléments « En cours » ou « Terminé »',value:new Set(visible.filter(i=>i.status==='En cours'||i.status==='Terminé').flatMap(i=>competencyCodes(i.competencies))).size,total:totalTop,color:'#f59e0b',symbol:'▥',status:'◷ En progression',detail:'Compétences effectivement engagées dans les contextes.'},
          {label:'Contextes finalisés',subtitle:'Statut « Terminé »',value:visible.filter(i=>i.status==='Terminé').length,total:visible.length,color:'#10b981',symbol:'⚑',status:'À venir',detail:'Contextes pédagogiques terminés.'}
        ].map(k=>{const pct=k.total?Math.round(k.value/k.total*100):0;return <div key={k.label} className="personal-v14-ring-card" style={{'--ring-color':k.color}}><div className="personal-v14-ring-heading"><span className="personal-v14-ring-icon" style={{color:k.color,background:k.color+'19'}}>{k.symbol}</span><div><strong>{k.label}</strong><small>{k.subtitle}</small></div></div><div className="personal-v14-ring" style={{'--progress':pct+'%',background:`conic-gradient(${k.color} ${pct}%, #e8edf5 0)`}}><div><b>{k.value} / {k.total}</b><span>{pct}%</span></div></div><div className="personal-v14-ring-status" style={{background:k.color+'16',color:k.color}}><b>{k.status}</b><small>{k.detail}</small></div></div>})}
      </div>
      <div className="personal-v14-secondary-grid">
      <div className="personal-v14-groups"><strong>Répartition par groupe de compétences</strong><div className="personal-v14-group-grid">{referenceGroups.map(g=>{const related=referenceCompetencies.filter(c=>c.group_code===g.code);const done=related.filter(c=>visibleCovered.has(c.code)).length;const pct=related.length?Math.round(done/related.length*100):0;return <div key={g.code}><span>{GROUP_STYLE[g.code]?.personal||g.code} · {done}/{related.length}</span><div className="personal-v14-meter"><i style={{width:pct+'%',background:GROUP_STYLE[g.code]?.color||'#64748b'}}/></div><small>{pct}%</small><button type="button" className="personal-group-detail-link" onClick={()=>{setDetailGroup(g.code);setExpandedCompetency(null)}}>Voir le détail ›</button></div>})}</div></div>
      <div className="personal-analytics-panel personal-v14-level-summary"><h3>Niveaux de complexité programmés</h3><p>Niveau de complexité maximal prévu pour chaque compétence programmée</p><div className="personal-analytics-levels">{LEARNING.map(([k,label])=>{const competencySet=new Map();visible.forEach(item=>competencyCodes(item.competencies).forEach(code=>{const previous=competencySet.get(code);const rank={D:0,E:1,A:2,M:3};if(!previous||rank[item.learning_level]>rank[previous])competencySet.set(code,item.learning_level||'D')}));const n=[...competencySet.values()].filter(level=>level===k).length;return <div key={k} className={'personal-detail-level-'+k}><b>{n}</b><span>{k} · {label}</span></div>})}</div><small>Total : {new Set(visible.flatMap(item=>competencyCodes(item.competencies))).size} compétences distinctes programmées</small></div>
      </div>

      <div className="personal-summary-side-by-side">
      <section className="personal-summary-quality" style={{background:'#fff',border:'1px solid #dbe4ef',borderRadius:18,padding:20,margin:0}} aria-label="Vue annuelle de la progression">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
          <h3 style={{margin:0,fontSize:19}}>Contrôle qualité de la progression</h3>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <select aria-label="Filtrer par enseignant" value={teacherFilter} onChange={e=>setTeacherFilter(e.target.value)} style={{minWidth:220,padding:12,border:'1px solid #d2deec',borderRadius:9,background:'white'}}><option value="">Tous les enseignants</option>{teacherOptions.map(t=><option key={t} value={t}>{t}</option>)}</select>
            <button type="button" onClick={load} style={{padding:'12px 16px',border:'1px solid #d2deec',borderRadius:9,background:'white',cursor:'pointer'}}>⟳ Actualiser</button>
          </div>
        </div>
        {(()=>{const scope=items.filter(i=>(cycleView==='cycle'||(i.cycle_level||levelToCycle(klass.level_label))===cycleView)&&(!teacherFilter||i.teacher_label===teacherFilter));
          const missingProblem=scope.filter(i=>!String(i.problematic||'').trim()).length;
          const missingActivities=scope.filter(i=>!String(i.activities||'').replace(/\\n/g,'').trim()).length;
          const missingSkills=scope.filter(i=>!competencyCodes(i.competencies).length).length;
          const missingDuration=scope.filter(i=>!(Number(i.duration_hours)>0)).length;
          const programmed=new Set(scope.flatMap(i=>competencyCodes(i.competencies)));
          const missingOfficial=referenceCompetencies.filter(c=>!programmed.has(c.code)).length;
          const shared=scope.filter(i=>String(i.teacher_label||'').includes('&')||String(i.teacher_label||'').includes(' et ')).length;
          const rows=[[missingProblem===0,missingProblem===0?'Toutes les problématiques sont renseignées':missingProblem+' contexte(s) sans problématique'],[missingActivities===0,missingActivities===0?'Tous les contextes comportent des activités / productions élèves':missingActivities+' contexte(s) sans activités / productions élèves'],[missingSkills===0,missingSkills===0?'Tous les contextes ont au moins une compétence':missingSkills+' contexte(s) sans compétence'],[missingDuration===0,missingDuration===0?'Toutes les durées prévues sont renseignées':missingDuration+' durée(s) prévue(s) non renseignée(s)'],[missingOfficial===0,missingOfficial===0?'Toutes les compétences du référentiel sont programmées':missingOfficial+' compétence(s) du référentiel non programmée(s)'],[true,shared+' contexte(s) partagé(s) entre enseignants']];
          return <div style={{marginTop:12,background:'#eef5ff',border:'1px solid #cfe0ff',borderLeft:'4px solid #5b9dff',borderRadius:12,padding:'16px 14px'}}>{rows.map(([ok,label],index)=><div key={index} style={{padding:'8px 0',borderBottom:index===rows.length-1?'none':'1px dotted #bdd8ff',color:ok?'#06713c':'#b45309'}}>{ok?'✓':'⚠'} {label}</div>)}</div>})()}
      </section>
      <div className="personal-summary-right">
      <aside className="personal-analytics-alerts personal-summary-alerts" aria-label="Alertes de pilotage">
        <h3>Alertes de pilotage</h3>
        {(()=>{const rank={D:0,E:1,A:2,M:3};const stats=referenceCompetencies.map(c=>{const uses=items.filter(i=>competencyCodes(i.competencies).includes(c.code)&&(!teacherFilter||i.teacher_label===teacherFilter)&&(!groupFilter||groupKey(i)===groupFilter)&&(!levelFilter||i.learning_level===levelFilter));return {...c,uses,max:uses.reduce((m,i)=>rank[i.learning_level]>rank[m]?i.learning_level:m,'D'),engaged:uses.some(i=>['En cours','Terminé'].includes(i.status))}}).filter(c=>c.uses.length);return [{n:stats.filter(c=>!c.engaged).length,label:'programmée(s) mais pas encore engagée(s)',hint:'uniquement dans des contextes « Prévu » ou « À ajuster »'},{n:stats.filter(c=>c.uses.length===1).length,label:'mobilisée(s) une seule fois',hint:'prévoir un réinvestissement pour renforcer la spirale'},{n:stats.filter(c=>c.max==='D').length,label:'encore au niveau D',hint:'programmer au moins une expérimentation ultérieure'}].map(a=><p key={a.label}><b>{a.n} {a.label}</b> — {a.hint}.</p>)})()}
      </aside>
    <div className="personal-kpis personal-kpis-compact" aria-label="Indicateurs de la progression">
      <div className="personal-kpi kpi-blue"><span className="kpi-icon" aria-hidden="true">▣</span><div className="kpi-copy"><span>Compétences programmées</span><strong>{visibleCovered.size} / {totalTop}</strong></div></div>
      <div className="personal-kpi kpi-orange"><span className="kpi-icon" aria-hidden="true">▤</span><div className="kpi-copy"><span>Contextes / activités</span><strong>{visible.length}</strong></div></div>
      <div className="personal-kpi kpi-green"><span className="kpi-icon" aria-hidden="true">✓</span><div className="kpi-copy"><span>Éléments terminés</span><strong>{visible.filter(i=>i.status==='Terminé').length}</strong></div></div>
      <div className="personal-kpi kpi-red"><span className="kpi-icon" aria-hidden="true">⚠</span><div className="kpi-copy"><span>À ajuster</span><strong>{visible.filter(i=>i.status==='À ajuster').length}</strong></div></div>
    </div>
      </div>
      </div>
    <div className="personal-legend">{referenceGroups.map(g=>{const style=GROUP_STYLE[g.code]||{personal:g.code,color:'#94A3B8'};return <span key={g.code} style={{'--c':style.color}}><b>{style.personal}</b> · {g.label}</span>})}</div>



      <div className="personal-analytics">
        {(()=>{const rank={D:0,E:1,A:2,M:3};const stats=referenceCompetencies.map(c=>{const uses=items.filter(i=>competencyCodes(i.competencies).includes(c.code)&&(!teacherFilter||i.teacher_label===teacherFilter)&&(!groupFilter||groupKey(i)===groupFilter)&&(!levelFilter||i.learning_level===levelFilter)).sort((a,b)=>({premiere:0,terminale:1}[a.cycle_level||levelToCycle(klass.level_label)]??2)-({premiere:0,terminale:1}[b.cycle_level||levelToCycle(klass.level_label)]??2)||String(a.period_id||'').localeCompare(String(b.period_id||''))||(a.sort_order||0)-(b.sort_order||0));const max=uses.reduce((m,i)=>rank[i.learning_level]>rank[m]?i.learning_level:m,'D');return {...c,uses,max,engaged:uses.some(i=>i.status==='En cours'||i.status==='Terminé'),finished:uses.some(i=>i.status==='Terminé')}}).filter(x=>x.uses.length);const totals=Object.fromEntries(LEARNING.map(([k])=>[k,stats.filter(c=>c.max===k).length]));const alerts=[{n:stats.filter(c=>!c.engaged).length,label:'programmée(s) mais pas encore engagée(s)',hint:'uniquement dans des contextes « Prévu » ou « À ajuster »'},{n:stats.filter(c=>c.uses.length===1).length,label:'mobilisée(s) une seule fois',hint:'prévoir un réinvestissement pour renforcer la spirale'},{n:stats.filter(c=>c.max==='D').length,label:'encore au niveau D',hint:'programmer au moins une expérimentation ultérieure'}];return <><div className="personal-analytics-panel"><h3>Suivi détaillé des compétences</h3><p>Fréquence, parcours de complexité et contextes mobilisés</p><input className="personal-analytics-search" aria-label="Rechercher une compétence" placeholder="Rechercher une compétence" value={competencySearch} onChange={e=>setCompetencySearch(e.target.value)}/><div className="personal-detail-table-wrap"><table className="personal-analytics-table"><thead><tr><th>GC</th><th>Compétence</th><th>Fréquence</th><th>Niveau max</th><th>Parcours</th><th>Contextes</th><th>État</th></tr></thead><tbody>{stats.filter(c=>(c.label+' '+c.code+' '+c.uses.map(i=>i.context_name).join(' ')).toLocaleLowerCase().includes(competencySearch.toLocaleLowerCase())).map(c=><tr key={c.code}><td>{GROUP_STYLE[c.group_code]?.personal||c.group_code}</td><td><b>{c.label}</b></td><td>{c.uses.length}</td><td><span className={'personal-detail-bubble personal-detail-bubble-'+c.max}>{c.max}</span></td><td>{c.uses.map((i,n)=><React.Fragment key={i.id||n}><span className={'personal-analytics-level-chip personal-detail-level-'+(i.learning_level||'D')}>{i.learning_level||'—'}</span>{n<c.uses.length-1?' → ':''}</React.Fragment>)}</td><td>{c.uses.map(i=>i.context_name).filter(Boolean).join(' · ')}</td><td>{c.finished?'Terminée':c.engaged?'Engagée':'Programmée'}</td></tr>)}</tbody></table></div></div><div className="personal-analytics-panel"><h3>Continuité pédagogique · Première → Terminale</h3><p>Comparaison des compétences sur les deux années du cycle. Les données non renseignées restent explicitement indiquées.</p>{cycleView!=='cycle'&&<p className="personal-analytics-notice">Passez sur <button type="button" onClick={()=>setCycleView('cycle')}>Cycle complet · 2 ans</button> pour contrôler la continuité Première → Terminale.</p>}<div className="personal-analytics-cycle">{stats.map(c=><div key={c.code} className="personal-analytics-cycle-row"><strong>{GROUP_STYLE[c.group_code]?.personal||c.group_code} · {c.label}</strong>{[['premiere','Première'],['terminale','Terminale']].map(([level,label])=>{const entries=c.uses.filter(i=>(i.cycle_level||levelToCycle(klass.level_label))===level);const max=entries.reduce((m,i)=>rank[i.learning_level]>rank[m]?i.learning_level:m,'D');return <div key={level}><b>{label}</b>{entries.length?<><span className={'personal-analytics-level-chip personal-detail-level-'+max}>{max} · {learningLabel(max)}</span><p>{entries.map(i=>i.context_name).filter(Boolean).join(' · ')}</p></>:<p><i>Non mobilisée — aucun contexte</i></p>}</div>})}</div>)}</div></div></>})()}
      </div>
    </section>
    </div>

    {detailGroup&&<div className="personal-detail-backdrop" onClick={()=>setDetailGroup(null)}><section className="personal-detail-modal" role="dialog" aria-modal="true" aria-label="Détail des compétences" onClick={e=>e.stopPropagation()}>
      <header className="personal-detail-header"><div><h2>{GROUP_STYLE[detailGroup]?.personal||detailGroup} · {GROUP_STYLE[detailGroup]?.label||referenceGroups.find(g=>g.code===detailGroup)?.label}</h2><p>Fréquence de mobilisation, répartition D/E/A/M et progression de chaque compétence dans l’année.</p></div><button type="button" aria-label="Fermer" onClick={()=>setDetailGroup(null)}>×</button></header>
      {(()=>{const comps=referenceCompetencies.filter(c=>c.group_code===detailGroup);const count=comps.filter(c=>visibleCovered.has(c.code)).length;return <><div className="personal-detail-summary"><span>{count} / {comps.length} programmées</span><span>{comps.length?Math.round(count/comps.length*100):0} % de couverture</span></div><div className="personal-detail-list">{comps.map(c=>{const uses=visible.filter(item=>competencyCodes(item.competencies).includes(c.code)).sort((a,b)=>String(a.cycle_level||'').localeCompare(String(b.cycle_level||''))||String(a.period_id||'').localeCompare(String(b.period_id||'')));const levels=Object.fromEntries(LEARNING.map(([code])=>[code,uses.filter(i=>i.learning_level===code).length]));const max=[...LEARNING].reverse().find(([code])=>levels[code])?.[0]||'—';const expanded=expandedCompetency===c.code;return <article key={c.code} className="personal-detail-competency"><button type="button" className="personal-detail-competency-toggle" onClick={()=>setExpandedCompetency(expanded?null:c.code)} aria-expanded={expanded}><span className="personal-detail-competency-title"><strong>{c.label}</strong><small>{uses.length} mobilisation(s)</small></span><span className="personal-detail-levels">{LEARNING.map(([code])=><span key={code} className={'personal-detail-level-'+code}><b>{levels[code]}</b><small>{code}</small></span>)}</span><span className="personal-detail-maximum">Niveau max <b>{max}</b></span><span className="personal-detail-frequency">Fréquence · {new Set(uses.map(i=>i.period_id)).size} période(s)<i>{Array.from({length:5},(_,n)=><em key={n} style={{background:n<Math.min(5,new Set(uses.map(i=>i.period_id)).size)?'#2f80ed':'#e2e8f0'}}/>)}</i></span><span>{expanded?'⌃':'⌄'}</span></button>{expanded&&<div className="personal-detail-expanded"><h4>Progression dans l’année</h4>{uses.length?<><div className="personal-detail-journey">{uses.map((item,index)=><div key={item.id||index}><b>{item.cycle_level==='terminale'?'T · ':item.cycle_level==='premiere'?'1re · ':''}{item.period_id||'—'}</b><span className={'personal-detail-bubble personal-detail-bubble-'+(item.learning_level||'D')}>{item.learning_level||'—'}</span><strong>{item.context_name}</strong><small>{item.status}</small></div>)}</div><div className="personal-detail-table-wrap"><table><thead><tr><th>Période</th><th>Contexte / activité</th><th>Niveau</th><th>Statut</th></tr></thead><tbody>{uses.map((item,index)=><tr key={item.id||index}><td>{item.cycle_level==='terminale'?'T · ':item.cycle_level==='premiere'?'1re · ':''}{item.period_id||'—'}</td><td>{item.context_name}</td><td>{item.learning_level} · {learningLabel(item.learning_level)}</td><td>{item.status}</td></tr>)}</tbody></table></div></>:<p className="muted">Cette compétence n’est pas encore programmée dans la période sélectionnée.</p>}</div>}</article>})}</div></>})()}
    </section></div>}
    {!readOnly&&addMenu&&<div className="personal-add-menu-backdrop" onClick={()=>setAddMenu(false)}><div className="personal-add-menu" role="dialog" aria-label="Choisir le type d’ajout" onClick={e=>e.stopPropagation()}><h4>Que souhaitez-vous ajouter ?</h4><button type="button" onClick={()=>{setNewKind('context');setAddMenu(false);setOpen(true)}}><b>Contexte professionnel</b><small>Situation professionnelle reliée au référentiel MCV</small></button><button type="button" onClick={()=>{setNewKind('event');setAddMenu(false);setOpen(true)}}><b>Évènement / activité pédagogique</b><small>Bac blanc, CCF, sortie, projet, révision, oral…</small></button><button type="button" className="personal-add-menu-cancel" onClick={()=>setAddMenu(false)}>Annuler</button></div></div>}
    {!readOnly&&open&&<ProgressionEditor klass={klass} periods={periods} teacherOptions={teacherOptions} teacherMembers={teacherMembers} currentUserId={currentUserId} initial={{...(newPeriod?{period_id:newPeriod}:{}),item_kind:newKind}} onClose={()=>{setOpen(false);setNewPeriod(null)}} onSaved={()=>{setOpen(false);setNewPeriod(null);load()}}/>}
    {!readOnly&&editItem&&<ProgressionEditor klass={klass} periods={periods} teacherOptions={teacherOptions} teacherMembers={teacherMembers} currentUserId={currentUserId} initial={editItem} onDelete={()=>{remove(editItem).then(()=>{setEditItem(null);load()}).catch(e=>alert(err(e)))}} onResume={()=>{resumeInTerminale(editItem).then(()=>{setEditItem(null);load()}).catch(e=>alert(err(e)))}} onClose={()=>setEditItem(null)} onSaved={()=>{setEditItem(null);load()}}/>}
  </div>
}

function PeriodColumn({col,items,files,readOnly,canEditItem,onAdd,onEdit,onDelete,onDuplicate,onDownload,onMove,onEvaluate}){
  return <section className={`personal-period-column personal-period-theme-${col.code.toLowerCase()}`}>
    <div className="personal-period-head"><div><h4>{col.label}</h4><small>{col.subtitle}</small><span>{col.code}</span></div>{!readOnly&&<button type="button" className="personal-period-add" onClick={onAdd} title={`Ajouter un contexte ou une activité en ${col.label}`} aria-label={`Ajouter un contexte ou une activité en ${col.label}`}><Plus size={23} strokeWidth={3.5}/></button>}</div>
    <div className="personal-period-body">
      {items.map((item,index)=><ProgressionCard key={item.id} item={item} files={files.filter(a=>a.progression_item_id===item.id)} readOnly={readOnly||!canEditItem(item)} onEdit={()=>onEdit(item)} onDelete={()=>onDelete(item)} onDuplicate={()=>onDuplicate(item)} onDownload={onDownload} onMove={onMove} canMoveUp={index>0} canMoveDown={index<items.length-1} onEvaluate={onEvaluate}/>)}
      {!items.length&&<div className="personal-period-empty">Aucun élément</div>}
    </div>
  </section>
}

function PfmpColumn({col}){
  return <section className="personal-period-column personal-pfmp-column">
    <div className="personal-pfmp-vertical"><strong>{col.row?.label||col.label}</strong><span>{col.row?`${formatDate(col.row.start_date)} → ${formatDate(col.row.end_date)}`:'Dates à renseigner'}</span></div>
  </section>
}

function ProgressionCard({item,files,readOnly,onEdit,onDelete,onDuplicate,onDownload,onMove,canMoveUp,canMoveDown,onEvaluate}){
  const group=groupInfo(item)
  return <article className="personal-context-card" style={{'--gc':group.color}} onClick={()=>!readOnly&&onEdit()}>
    {!readOnly&&<div className="personal-card-order"><button disabled={!canMoveUp} title="Monter" onClick={e=>{e.stopPropagation();onMove(item,-1)}}>↑</button><button disabled={!canMoveDown} title="Descendre" onClick={e=>{e.stopPropagation();onMove(item,1)}}>↓</button></div>}
    <h4>{item.context_name}</h4>
    <div className="personal-card-competencies">{[...new Set((item.competencies||[]).map(c=>{const raw=typeof c==='object'?(c.group||c.group_code||''):'';const key=PERSONAL_TO_GROUP[raw]||raw;return GROUP_STYLE[key]?.personal||(typeof c==='string'?(c.match(/GC(?:1|2|3|4A|4B)/i)||[])[0]:null)}).filter(Boolean))].map(code=><span key={code} className="personal-card-group-tag">{code}</span>)}</div>
    {item.problematic&&<p className="personal-card-problem">{item.problematic}</p>}
    <div className="personal-card-badges"><span className={`level-${item.learning_level||'D'}`}>{item.learning_level||'D'}</span><span>{item.status||'Prévu'}</span>{item.item_kind==='event'&&<span>{item.activity_type||'Évènement'}</span>}</div>
    <p><b>{item.teacher_label||'Enseignant à préciser'}</b> · {Number(item.duration_hours||0).toFixed(1)} h</p>
    <div className="personal-card-meta"><span>{(item.competencies||[]).length} compétence(s)</span><span>{(item.econ_law_links||[]).length} lien(s) éco-droit</span>{files.length>0&&<span>{files.length} pièce(s)</span>}</div>
    {files.length>0&&<div className="personal-card-files">{files.slice(0,2).map(f=><button key={f.id} onClick={e=>{e.stopPropagation();onDownload(f)}} title={f.file_name}><FileText/>{f.file_name}</button>)}</div>}
    {onEvaluate&&<button className="personal-evaluate-btn" onClick={e=>{e.stopPropagation();onEvaluate(item)}}><ClipboardCheck/>Évaluer mes élèves</button>}
    <div className="personal-card-footer"><span>{readOnly?<><LockKeyhole/> Consultation seule</>:<>✎ Modifiable</>}</span>{!readOnly&&<div><button title="Dupliquer" onClick={e=>{e.stopPropagation();onDuplicate()}}><Copy/></button><button title="Supprimer" onClick={e=>{e.stopPropagation();onDelete()}}><Trash2/></button></div>}</div>
  </article>
}

function editorLines(value){return (Array.isArray(value)?value:[value]).flatMap(x=>String(x??'').replace(/\\n/g,'\n').split('\n')).map(x=>x.trim()).filter(Boolean)}
function ProgressionEditor({klass,periods,teacherOptions=[],teacherMembers=[],currentUserId=null,initial=null,onClose,onSaved,onDelete,onResume}){
  const [competencies,setCompetencies]=useState([])
  const [resources,setResources]=useState([])
  const [econ,setEcon]=useState([])
  const [files,setFiles]=useState([])
  const [existingFiles,setExistingFiles]=useState([])
  const [busy,setBusy]=useState(false)
  const [analyzing,setAnalyzing]=useState(false)
  const [aiProgress,setAiProgress]=useState(0)
  const [aiStage,setAiStage]=useState('')
  const [aiSuggestion,setAiSuggestion]=useState(null)
  const [savedAiReview,setSavedAiReview]=useState(initial?.ai_review||null)
  const [aiChecks,setAiChecks]=useState({})
  const [message,setMessage]=useState('')
  const isEditing=Boolean(initial?.id)
  const initialCodes=competencyCodes(initial?.competencies)
  const [coauthors,setCoauthors]=useState(initial?.coauthor_ids||[])
  const [f,setF]=useState({
    item_kind:initial?.item_kind||'context', activity_type:initial?.activity_type||'', custom_activity_type:initial?.custom_activity_type||'',
    period_id:initial?.period_id||periods?.[0]?.code||'P1', context_name:initial?.context_name||'', problematic:initial?.problematic||'', teacher_label:initial?.teacher_label||teacherOptions[0]||'',
    learning_level:initial?.learning_level||'D', status:initial?.status||'Prévu', duration_hours:Number(initial?.duration_hours??initial?.planned_hours??2), cycle_level:initial?.cycle_level||levelToCycle(klass.level_label),
    behavioursText:editorLines(initial?.behaviours||[]).join('\n'), knowledgeText:editorLines(initial?.knowledge||[]).join('\n'), expectedText:editorLines(initial?.expected_results||[]).join('\n'), activities:initial?.activities||'', notes:initial?.notes||'',
    competencyCodes:initialCodes, econ_law_links:normalizeEcon(initial?.econ_law_links||[])
  })

  useEffect(()=>{loadLists()},[klass.diploma_code])
  useEffect(()=>{if(isEditing)loadFiles()},[initial?.id])
  async function loadLists(){
    const [c,l,r]=await Promise.all([
      supabase.from('pp_competencies').select('code,label,group_code').eq('diploma_code',klass.diploma_code).is('parent_code',null).order('sort_order'),
      supabase.from('pp_diploma_econ_law_links').select('econ_law_code').eq('diploma_code',klass.diploma_code),
      supabase.from('pp_competency_resources').select('*').eq('diploma_code',klass.diploma_code)
    ])
    setCompetencies(c.data||[]);setResources(r.data||[])
    const codes=(l.data||[]).map(x=>x.econ_law_code)
    if(codes.length){const {data}=await supabase.from('pp_econ_law_items').select('*').in('code',codes).order('sort_order');setEcon(data||[])}else setEcon([])
  }
  async function loadFiles(){const {data}=await supabase.from('pp_progression_attachments').select('*').eq('progression_item_id',initial.id).order('created_at');setExistingFiles(data||[])}
  function resourceText(codes){const selected=resources.filter(r=>codes.includes(r.competency_code));return {beh:unique(selected.flatMap(r=>r.behaviours||[])).join('\n'),know:unique(selected.flatMap(r=>r.knowledge||[])).join('\n'),res:unique(selected.flatMap(r=>r.expected_results||[])).join('\n')}}
  function toggleResource(field,label){setF(prev=>{const entries=editorLines(prev[field]);const exists=entries.includes(label);return {...prev,[field]:(exists?entries.filter(x=>x!==label):[...entries,label]).join('\n')}})}
  function resourceChoices(key,field,title){
    const options=unique(resources.filter(r=>f.competencyCodes.includes(r.competency_code)).flatMap(r=>editorLines(r[key])));
    const selected=editorLines(f[field]);const all=unique([...options,...selected]);
    return <fieldset className="pedag-checklist"><legend>{title}</legend>{all.length?<div className="pedag-checklist-grid">{all.map(label=><label key={label} className="pedag-checklist-option"><input type="checkbox" checked={selected.includes(label)} onChange={()=>toggleResource(field,label)}/><span>{label}</span></label>)}</div>:<p className="muted">Sélectionnez d’abord les compétences du référentiel pour afficher les propositions.</p>}<details className="pedag-custom"><summary>Ajouter ou modifier des éléments manuellement</summary><textarea rows="4" value={f[field]} onChange={e=>setF({...f,[field]:e.target.value})} placeholder="Un élément par ligne"/></details></fieldset>
  }
  function refillFromReferential(){const x=resourceText(f.competencyCodes);setF(prev=>({...prev,behavioursText:x.beh,knowledgeText:x.know,expectedText:x.res}))}
  function toggleCode(code){setF(prev=>{const codes=prev.competencyCodes.includes(code)?prev.competencyCodes.filter(x=>x!==code):[...prev.competencyCodes,code];const next={...prev,competencyCodes:codes};if(!prev.behavioursText.trim()&&!prev.knowledgeText.trim()&&!prev.expectedText.trim()){const x=resourceText(codes);next.behavioursText=x.beh;next.knowledgeText=x.know;next.expectedText=x.res}return next})}
  // Correspondances pédagogiques indicatives par diplôme et groupe de compétences.
  const econByDiploma={
    ACCUEIL:{B1:['ED-M1-Q2','ED-M1-Q3','ED-M2-Q2','ED-M5-Q1'],B2:['ED-M1-Q2','ED-M3-Q3','ED-M5-Q1','ED-M5-Q2'],B3:['ED-M1-Q3','ED-M2-Q1','ED-M2-Q2','ED-M2-Q3','ED-M3-Q2']},
    '2MRC':{C1:['ED-M1-Q3','ED-M2-Q1','ED-M2-Q2','ED-M2-Q3'],C2:['ED-M1-Q3','ED-M2-Q3','ED-M3-Q2'],C3:['ED-M1-Q1','ED-M3-Q3','ED-M5-Q1']},
    MCVA:{G1:['ED-M1-Q3','ED-M2-Q1','ED-M2-Q2','ED-M2-Q3'],G2:['ED-M1-Q3','ED-M2-Q3','ED-M3-Q3'],G3:['ED-M2-Q2','ED-M3-Q2','ED-M3-Q3'],G4A:['ED-M3-Q1','ED-M3-Q2','ED-M3-Q3']},
    MCVB:{G1:['ED-M1-Q3','ED-M2-Q1','ED-M2-Q2','ED-M2-Q3'],G2:['ED-M1-Q3','ED-M2-Q3','ED-M3-Q3'],G3:['ED-M2-Q2','ED-M3-Q2','ED-M3-Q3'],G4B:['ED-M1-Q1','ED-M3-Q3','ED-M5-Q1']},
    AGORA:{B1:['ED-M1-Q2','ED-M1-Q3','ED-M3-Q3'],B2:['ED-M3-Q1','ED-M3-Q2','ED-M3-Q3'],B3:['ED-M5-Q1','ED-M5-Q2','ED-M5-Q3']}
  }
  const selectedEconGroups=new Set(f.competencyCodes.map(code=>competencies.find(c=>c.code===code)?.group_code).filter(Boolean))
  const recommendedEcon=new Set([...selectedEconGroups].flatMap(group=>econByDiploma[klass.diploma_code]?.[group]||[]))
  const sortedEcon=[...econ].sort((a,b)=>Number(recommendedEcon.has(b.code))-Number(recommendedEcon.has(a.code)))
  function toggleEcon(code){setF({...f,econ_law_links:f.econ_law_links.includes(code)?f.econ_law_links.filter(x=>x!==code):[...f.econ_law_links,code]})}
  async function removeFile(a){if(!confirm(`Supprimer ${a.file_name} ?`))return;await supabase.storage.from('pp-progression-files').remove([a.storage_path]);await supabase.from('pp_progression_attachments').delete().eq('id',a.id);loadFiles()}
  async function uploadPending(itemId,userId){for(const file of files){const path=`${userId}/${itemId}/${Date.now()}-${safeName(file.name)}`;const {error}=await supabase.storage.from('pp-progression-files').upload(path,file);if(error)throw error;const {error:dbError}=await supabase.from('pp_progression_attachments').insert({progression_item_id:itemId,file_name:file.name,storage_path:path,mime_type:file.type||null,file_size:file.size,uploaded_by:userId});if(dbError)throw dbError}}
  async function analyzeDocument(fileOverride=null){
    const file=fileOverride instanceof File?fileOverride:files[0]
    if(!file){setMessage('Ajoutez un document dans la section Pièces jointes avant de lancer l’analyse.');return}
    setAnalyzing(true);setAiProgress(5);setAiStage('Préparation du document');setMessage('Analyse du document en cours…');setAiSuggestion(null)
    try{
      const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw new Error('Connectez-vous pour analyser un document.');setAiProgress(15);setAiStage('Envoi sécurisé du document')
      if(file.size>5_000_000)throw new Error('Document trop volumineux pour l’analyse (maximum 5 Mo).')
      setAiProgress(25);setAiStage('Lecture locale du document')
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Lecture du fichier impossible'));reader.readAsDataURL(file)})
      setAiProgress(55);setAiStage('Reconnaissance IA en cours — durée variable')
      const referential=competencies.map(c=>({code:c.code,label:c.label,group:c.group_code,resources:resources.filter(r=>r.competency_code===c.code).map(r=>({behaviours:r.behaviours,knowledge:r.knowledge,expected_results:r.expected_results}))}))
      const {data,error}=await supabase.functions.invoke('analyze-progression-document',{body:{file_data:dataUrl,file_name:file.name,context_name:f.context_name,problematic:f.problematic,referential,economy_law_referential:econ.map(x=>({code:x.code,label:x.question_label}))}})
      if(error){
        let detail=''
        try{const response=error.context;if(response&&typeof response.json==='function'){const payload=await response.json();detail=payload?.message||payload?.error||''}}catch{}
        throw new Error(detail||error.message||'Erreur de communication avec le service IA')
      }
      if(data?.error)throw new Error(data.message||data.error)
      if(!data?.analysis)throw new Error('Aucune proposition reçue.')
      setAiProgress(100);setAiStage('Analyse terminée — propositions prêtes')
      const analysis=data.analysis
      const normalize=v=>String(v||'').trim().toLocaleLowerCase('fr')
      const matched=(Array.isArray(analysis.selections)&&analysis.selections.length)?analysis.selections:(Array.isArray(analysis.competencies)?analysis.competencies:[]).map(entry=>{
        const raw=typeof entry==='string'?entry:(entry.code||entry.competence_code||entry.competence||'')
        const ref=competencies.find(c=>normalize(c.code)===normalize(raw)||normalize(c.label)===normalize(raw))
        if(!ref)return null
        const resourcesFor=resources.filter(x=>x.competency_code===ref.code)
        const flatten=key=>unique(resourcesFor.flatMap(x=>Array.isArray(x[key])?x[key]:[]))
        return {group_code:ref.group_code,competence:ref.code,competence_label:ref.label,behaviours:flatten('behaviours'),knowledge:flatten('knowledge'),expected_results:flatten('expected_results')}
      }).filter(Boolean)
      const economySelections=(analysis.economy_law_selections||[]).length?analysis.economy_law_selections:(analysis.econ_law_links||[]).map(code=>{const match=econ.find(x=>x.code===code);return match?{module_code:match.code,question:match.question_label}:null}).filter(Boolean)
      setAiSuggestion({...analysis,selections:matched,economy_law_selections:economySelections});setSavedAiReview({...analysis,selections:matched,economy_law_selections:economySelections});setAiChecks({});
      // Prefill editable fields immediately, without waiting for teacher validation.
      const proposedCodes=matched.map(v=>v.competence).filter(code=>competencies.some(c=>c.code===code));
      const proposedLines=key=>unique(matched.flatMap(v=>Array.isArray(v[key])?v[key]:[])).join('\n');
      const proposedActivities=analysis.suggested_activities||analysis.activities;
      setF(prev=>({...prev,
        context_name:analysis.suggested_context_name||analysis.context_name||prev.context_name,
        problematic:analysis.suggested_problematic||analysis.problematic||prev.problematic,
        activities:Array.isArray(proposedActivities)?proposedActivities.join('\n'):(proposedActivities||prev.activities),
        competencyCodes:unique([...prev.competencyCodes,...proposedCodes]),
        econ_law_links:unique([...prev.econ_law_links,...economySelections.map(v=>v.module_code).filter(code=>econ.some(x=>x.code===code))]),
        behavioursText:proposedLines('behaviours')||prev.behavioursText,
        knowledgeText:proposedLines('knowledge')||prev.knowledgeText,
        expectedText:proposedLines('expected_results')||prev.expectedText,
        learning_level:['D','E','A','M'].includes(analysis.suggested_level)?analysis.suggested_level:prev.learning_level
      }));setMessage(matched.length||economySelections.length?'Propositions reçues : décochez les éléments non pertinents avant de les appliquer.':'Analyse terminée, mais aucune compétence du référentiel n’a été reconnue. Vérifiez le document et les références.')
    }catch(e){setAiStage('Analyse interrompue');setMessage('Analyse IA indisponible : '+err(e))}finally{setAnalyzing(false)}
  }
  function aiChecked(key){return aiChecks[key]!==false}
  function aiToggle(key){setAiChecks(p=>({...p,[key]:!aiChecked(key)}))}
  function aiSelections(){return (aiSuggestion?.selections||[]).filter((v,i)=>aiChecked('s'+i))}
  function applyAiSuggestion(){
    // Teacher validation must not overwrite edits made after automatic prefill.
    const selectedCodes=(aiSuggestion?.selections||[]).filter((v,i)=>aiChecked('s'+i)).map(v=>v.competence);
    const selectedEcon=(aiSuggestion?.economy_law_selections||[]).filter((v,i)=>aiChecked('ed'+i)).map(v=>v.module_code).filter(code=>econ.some(x=>x.code===code));
    const rejectedEcon=(aiSuggestion?.economy_law_selections||[]).filter((v,i)=>!aiChecked('ed'+i)).map(v=>v.module_code);
    const rejectedCodes=(aiSuggestion?.selections||[]).filter((v,i)=>!aiChecked('s'+i)).map(v=>v.competence);
    setF(prev=>({...prev,competencyCodes:unique([...prev.competencyCodes.filter(code=>!rejectedCodes.includes(code)),...selectedCodes]),econ_law_links:unique([...prev.econ_law_links.filter(code=>!rejectedEcon.includes(code)),...selectedEcon])}));
    setAiSuggestion(null);
    setMessage('Sélection validée. Vos modifications manuelles sont conservées ; vous pouvez encore corriger avant d’enregistrer.');
  }
    async function submit(e){
    e.preventDefault();setBusy(true);setMessage('')
    try{
      const {data:{user}}=await supabase.auth.getUser();const beh=lines(f.behavioursText),know=lines(f.knowledgeText),res=lines(f.expectedText)
      const selected=competencies.filter(c=>f.competencyCodes.includes(c.code)).map(c=>({code:c.code,comp:c.label,group:c.group_code,personal_group:PERSONAL_GROUP_CODE[c.group_code]||c.group_code,level:f.learning_level,beh,know,res}))
      const primary=selected[0]
      const payload={item_kind:f.item_kind,activity_type:f.item_kind==='event'?(f.activity_type||null):null,custom_activity_type:f.item_kind==='event'&&f.activity_type==='Autre'?(f.custom_activity_type||null):null,period_id:f.period_id,context_name:f.context_name,problematic:f.problematic||null,teacher_label:([teacherMembers.find(m=>m.id===(initial?.created_by||currentUserId))?.name,...coauthors.map(id=>teacherMembers.find(m=>m.id===id)?.name)].filter(Boolean).join(' & ')||f.teacher_label||null),coauthor_ids:coauthors,group_code:primary?.personal_group||primary?.group||null,learning_level:f.learning_level,status:f.status,duration_hours:Number(f.duration_hours||0),behaviours:beh,knowledge:know,expected_results:res,activities:f.activities||null,notes:f.notes||null,ai_review:savedAiReview,competencies:selected,cycle_level:f.cycle_level,econ_law_links:klass.diploma_code==='EPC'?[]:f.econ_law_links,sort_order:Number(initial?.sort_order||10),updated_at:new Date().toISOString()}
      let itemId=initial?.id
      if(isEditing){
        const {data,error}=await supabase.from('pp_progression_items').update(payload).eq('id',initial.id).eq('revision',Number(initial.revision||1)).select('id,revision').maybeSingle()
        if(error)throw error
        if(!data){setMessage('Ce contexte a été modifié par un autre enseignant depuis son ouverture. Fermez cette fenêtre puis rouvrez le contexte pour récupérer la dernière version avant de modifier à nouveau.');return}
      }else{
        const {data,error}=await supabase.from('pp_progression_items').insert({...payload,class_id:klass.id,created_by:user.id}).select('id,revision').single();if(error)throw error;itemId=data.id
      }
      if(files.length)await uploadPending(itemId,user.id);onSaved()
    }catch(e){setMessage(err(e))}finally{setBusy(false)}
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal progression-editor-modal" onMouseDown={e=>e.stopPropagation()}><style>{`
.progression-editor-modal{width:min(1160px,96vw);max-height:94vh;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#10223d}.progression-editor-modal label{font-weight:600}.progression-editor-modal input,.progression-editor-modal textarea,.progression-editor-modal select{border-radius:12px}.progression-editor-modal .modal-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px}.progression-editor-modal .modal-actions button{border-radius:11px;font-weight:500}
.progression-editor-modal .editor-section{padding:24px 26px;margin:18px 0;border:1px solid #d9e3f1;border-radius:18px;background:#fff}
.progression-editor-modal .editor-section>h4,.progression-editor-modal .editor-section-title h4{font-size:19px;margin:0 0 16px;color:#10223d}
.progression-editor-modal .editor-section-title{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:18px}
.progression-editor-modal .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.progression-editor-modal .form-grid>label{display:flex;flex-direction:column;gap:9px;min-width:0;line-height:1.45}
.progression-editor-modal .form-grid>label.full{grid-column:1/-1}
.progression-editor-modal .form-grid textarea{box-sizing:border-box;width:100%;min-height:140px;padding:14px 16px;border:1px solid #cbd8e8;border-radius:12px;font-size:14px;font-weight:400;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;resize:vertical}
.progression-editor-modal .form-grid label small{font-weight:400;color:#64748b}
.progression-editor-modal .pedag-checklist{border:1px solid #d6e2f0;border-radius:16px;padding:18px 20px;margin:18px 0;background:#f9fbff;min-width:0}
.progression-editor-modal .pedag-checklist legend{font-weight:750;color:#142541;padding:0 8px}
.progression-editor-modal .pedag-checklist-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 24px}
.progression-editor-modal .pedag-checklist-option{display:flex;align-items:flex-start;gap:11px;line-height:1.5;font-weight:400;cursor:pointer;min-width:0}
.progression-editor-modal .pedag-checklist-option input{margin-top:5px;flex-shrink:0;accent-color:#2563eb}
.progression-editor-modal .pedag-checklist-option span{overflow-wrap:anywhere}
.progression-editor-modal .pedag-custom{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px}
.progression-editor-modal .pedag-custom summary{cursor:pointer;color:#2563eb;font-weight:650}
.progression-editor-modal .pedag-custom textarea{display:block;width:100%;box-sizing:border-box;margin-top:12px;padding:12px;border:1px solid #cbd8e8;border-radius:10px;line-height:1.5}
@media(max-width:720px){.progression-editor-modal .pedag-checklist-grid{grid-template-columns:1fr}}
.progression-editor-modal .ai-proposal{margin-top:22px;padding:22px;border:1px solid #b9d3f8;border-radius:16px;background:#f8fbff}
.progression-editor-modal .ai-proposal>h4{font-size:20px;margin-bottom:14px}
.progression-editor-modal .ai-review-card{background:#fff;border:1px solid #d9e3f1;border-radius:14px;padding:18px 20px;margin:14px 0;display:grid;gap:12px}
.progression-editor-modal .ai-review-card>div{display:grid;gap:8px}
.progression-editor-modal .ai-review-item{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:8px;line-height:1.55;font-weight:400}
.progression-editor-modal .ai-review-item:hover{background:#eff6ff}
.progression-editor-modal .ai-review-item input{flex-shrink:0;margin-top:5px}

/* Fidélité à la charte de référence : Arial partout, contraste et densité maîtrisés */
.progression-editor-modal,.progression-editor-modal *:not(svg):not(path){font-family:Arial,Helvetica,sans-serif!important;letter-spacing:normal}
.progression-editor-modal .modal-head{padding:12px 18px 10px}
.progression-editor-modal .modal-head h3{font-size:27px;font-weight:700;line-height:1.15}
.progression-editor-modal .eyebrow{font-size:11px;font-weight:700;letter-spacing:.04em;color:#64748b}
.progression-editor-modal .editor-section{padding:12px 16px;margin:9px 0;border-radius:13px}
.progression-editor-modal .editor-section>h4,.progression-editor-modal .editor-section-title h4{font-size:17px;font-weight:700;margin:0 0 9px}
.progression-editor-modal .file-drop{padding:12px 14px!important;gap:5px!important;min-height:0!important;background:#f4f8ff;border:1.5px dashed #93b4fa;border-radius:13px}
.progression-editor-modal .file-drop>span{font-size:16px;font-weight:700!important;line-height:1.3}
.progression-editor-modal .file-drop input{font-family:Arial,Helvetica,sans-serif!important;font-size:14px;font-weight:400}
.progression-editor-modal .file-drop small{font-size:12px;font-weight:400;color:#60738f}
.progression-editor-modal .attachment-list{margin:4px 0 7px}
.progression-editor-modal .attachment-list>div{padding:7px 10px;min-height:0}
.progression-editor-modal .editor-section .muted{font-size:14px;line-height:1.45;margin:5px 0 10px}
.progression-editor-modal .btn{font-family:Arial,Helvetica,sans-serif!important;font-weight:600}
.progression-editor-modal .modal-actions{padding:9px 6px;gap:7px}



.progression-editor-modal .import-heading-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.progression-editor-modal .import-heading-row>h4{margin:0!important;flex:0 0 auto}
.progression-editor-modal .import-heading-row .uploaded-files{display:flex;align-items:center;gap:10px;margin:0;min-width:0}
.progression-editor-modal .import-heading-row .uploaded-files>strong{margin:0;white-space:nowrap;font-size:14px}
.progression-editor-modal .import-heading-row .attachment-list{display:flex;gap:5px;flex-wrap:wrap}
.progression-editor-modal .import-heading-row .attachment-list>div{padding:3px 5px;gap:6px}
.progression-editor-modal .editor-import-section .file-drop{padding:9px 12px!important;gap:3px!important}
.progression-editor-modal .editor-import-section .file-drop>svg{width:22px!important;height:22px!important}
.progression-editor-modal .editor-import-section .file-drop>span{font-size:15px!important}
.progression-editor-modal .editor-import-section .file-drop small{font-size:13px!important}
@media(max-width:700px){.progression-editor-modal .import-heading-row{align-items:flex-start}.progression-editor-modal .import-heading-row .uploaded-files{flex-wrap:wrap}}

/* Fenêtre contexte : restitution fidèle du modèle personnel */
.progression-editor-modal{font-family:Arial,Helvetica,sans-serif!important;padding:16px 20px!important;border-radius:26px!important}
.progression-editor-modal .modal-head{padding:0 4px 12px!important;margin-bottom:0!important;border-bottom:1px solid #e5eaf2}
.progression-editor-modal .modal-head h3{font:700 29px/1.2 Arial,Helvetica,sans-serif!important;color:#080808!important}
.progression-editor-modal .modal-head button{background:transparent!important;border:0!important}
.progression-editor-modal .progression-editor-form{padding:0 4px 8px!important}
.progression-editor-modal .editor-import-section{padding:0!important;border:0!important;margin:6px 0 8px!important}
.progression-editor-modal .editor-import-section>h4{font:700 15px/1.35 Arial,Helvetica,sans-serif!important;color:#080808!important;margin:0 0 7px!important}
.progression-editor-modal .editor-import-section .file-drop{min-height:0!important;padding:14px 12px!important;background:#f3f7ff!important;border:2px dashed #93b4ff!important;border-radius:14px!important;gap:5px!important}
.progression-editor-modal .editor-import-section .file-drop>svg{width:28px!important;height:28px!important}
.progression-editor-modal .editor-import-section .file-drop>span{font:700 18px/1.3 Arial,Helvetica,sans-serif!important;color:#050505!important}
.progression-editor-modal .editor-import-section .file-drop small{font:400 15px/1.35 Arial,Helvetica,sans-serif!important;color:#111!important}
.progression-editor-modal .editor-import-section .file-drop input[type=file]{font:400 15px Arial,Helvetica,sans-serif!important;max-width:100%}
.progression-editor-modal .uploaded-files{margin:9px 0 0}
.progression-editor-modal .uploaded-files>strong{display:block;font:700 16px Arial,Helvetica,sans-serif;margin:0 0 5px;color:#080808}
.progression-editor-modal .uploaded-files .attachment-list{margin:0}
.progression-editor-modal .uploaded-files .attachment-list>div{display:flex;width:max-content;max-width:100%;gap:9px;padding:6px 9px;border:1px solid #d4deec;border-radius:10px;background:#f8fafc}
.progression-editor-modal .uploaded-files .attachment-list .icon-btn{width:32px;height:32px}
.progression-editor-modal .editor-import-section+.editor-section{margin:8px 0!important;padding:12px 14px!important;background:#eff6ff!important;border-color:#bfd6ff!important}
.progression-editor-modal .editor-import-section+.editor-section>h4{font-size:16px!important;margin-bottom:6px!important}
.progression-editor-modal .editor-import-section+.editor-section .muted{margin:3px 0 8px!important}

/* Densité professionnelle : préserver la charte graphique et supprimer les espaces inutiles */
.progression-editor-modal .modal-head{padding:14px 22px 12px;margin-bottom:0;border-bottom:1px solid #e3eaf4}
.progression-editor-modal .modal-head h3{font-size:25px;line-height:1.2;margin:0;font-weight:750}
.progression-editor-modal .progression-editor-form{padding:0 4px 10px}
.progression-editor-modal .editor-section{padding:14px 18px;margin:10px 0;border-radius:14px}
.progression-editor-modal .editor-section>h4,.progression-editor-modal .editor-section-title h4{font-size:17px;margin:0 0 10px;font-weight:750}
.progression-editor-modal .editor-section-title{margin-bottom:10px;gap:10px}
.progression-editor-modal .form-grid{gap:12px 16px}
.progression-editor-modal .form-grid>label{gap:5px;line-height:1.3}
.progression-editor-modal .form-grid textarea{min-height:92px;padding:10px 12px;line-height:1.5}
.progression-editor-modal .pedag-checklist{padding:11px 14px;margin:10px 0;border-radius:12px}
.progression-editor-modal .pedag-checklist-grid{gap:7px 16px}
.progression-editor-modal .ai-proposal{margin-top:12px;padding:14px;border-radius:13px}
.progression-editor-modal .ai-review-card{padding:12px 14px;margin:9px 0;gap:8px}
.progression-editor-modal .file-drop{min-height:0!important;padding:14px 16px!important;gap:6px!important;border-radius:13px!important}
.progression-editor-modal .file-drop>svg{width:23px;height:23px}
.progression-editor-modal .file-drop small{font-size:12px}
.progression-editor-modal .attachment-list{margin:7px 0}
.progression-editor-modal .modal-actions{padding:12px 8px;gap:8px}
@media(max-width:720px){.progression-editor-modal .editor-section{padding:12px}.progression-editor-modal .modal-head h3{font-size:21px}}
@media(max-width:720px){.progression-editor-modal .form-grid{grid-template-columns:1fr}.progression-editor-modal .editor-section{padding:16px}}
`}</style><div className="modal-head"><div><h3>Contexte / activité</h3></div><button onClick={onClose}><X/></button></div><form onSubmit={submit} className="progression-editor-form">
    <div className="editor-section editor-import-section"><div className="import-heading-row"><h4>📎 Cours / dossier pédagogique</h4>{existingFiles.length>0&&<div className="uploaded-files"><strong>Documents déposés</strong><div className="attachment-list">{existingFiles.map(a=><div key={a.id}><FileText/><span>{a.file_name}</span><button type="button" className="icon-btn danger-text" onClick={()=>removeFile(a)} title="Supprimer le document"><Trash2/></button></div>)}</div></div>}</div><label className="file-drop"><Upload/><span>Glissez-déposez votre cours ou votre contexte ici</span><small>PDF · Word · PowerPoint · Excel · Images · 50 Mo maximum</small><input type="file" multiple aria-label="Choisir un ou plusieurs fichiers" onChange={e=>{const chosen=[...e.target.files];setFiles(chosen);if(chosen.length)analyzeDocument(chosen[0])}}/>{files.length>0&&<small>{files.length} nouveau(x) fichier(s) sélectionné(s)</small>}</label></div>
    <div className="editor-section"><h4>2. Reconnaissance IA du document</h4><p className="muted">L’analyse démarre automatiquement après sélection d’un document compatible. Vous pouvez aussi la relancer manuellement. Les propositions restent à vérifier et ne sont jamais enregistrées automatiquement.</p>{(analyzing||aiProgress===100)&&<div className="ai-progress-box" role="status" aria-live="polite"><div className="ai-progress-head"><strong>{aiStage}</strong><strong>{aiProgress}%</strong></div><div className="ai-progress-track" role="progressbar" aria-label="Progression de la reconnaissance IA" aria-valuenow={aiProgress} aria-valuemin="0" aria-valuemax="100"><div className="ai-progress-fill" style={{width:aiProgress+'%'}}/></div><small>{analyzing&&aiProgress===55?'L’IA traite le document. Le pourcentage avancera à la réception du résultat.':'Étapes de préparation et de traitement du document'}</small></div>}<button type="button" className="btn primary" onClick={()=>analyzeDocument()} disabled={analyzing||busy||!files.length}>{analyzing?'Analyse en cours…':'✨ Analyser le document avec l’IA'}</button>{aiSuggestion&&<div className="ai-proposal" id="propilot-ai-review"><h4>Propositions IA à vérifier {aiSuggestion.confidence&&<small>· Confiance : {aiSuggestion.confidence}</small>}</h4>{aiSuggestion.rationale&&<p className="muted">{aiSuggestion.rationale}</p>}<div className="ai-review-card" style={{background:"#eff6ff",borderColor:"#bfdbfe"}}><strong style={{display:"block",fontSize:17,marginBottom:8}}>Préremplissage proposé dans la fenêtre</strong><p className="muted" style={{margin:"0 0 8px"}}>Vérifiez le contexte, la problématique et les activités avant de les appliquer.</p><div style={{display:"grid",gap:8,marginTop:10}}><div><b>Contexte professionnel proposé : </b>{aiSuggestion.suggested_context_name||aiSuggestion.context_name||"Non reconnu dans le document"}</div><div><b>Problématique / mission proposée : </b>{aiSuggestion.suggested_problematic||aiSuggestion.problematic||"Non reconnue dans le document"}</div><div><b>Activités / productions élèves proposées :</b>{(Array.isArray(aiSuggestion.suggested_activities||aiSuggestion.activities)?(aiSuggestion.suggested_activities||aiSuggestion.activities):String(aiSuggestion.suggested_activities||aiSuggestion.activities||"").split(/\\n|\n/)).filter(Boolean).length?<ul>{(Array.isArray(aiSuggestion.suggested_activities||aiSuggestion.activities)?(aiSuggestion.suggested_activities||aiSuggestion.activities):String(aiSuggestion.suggested_activities||aiSuggestion.activities||"").split(/\\n|\n/)).filter(Boolean).map((v,i)=><li key={i}>{v}</li>)}</ul>:<p className="muted">Aucune activité reconnue.</p>}</div></div><small>Ces informations sont seulement proposées. Rien n’est encore appliqué aux champs ni enregistré.</small></div>{(aiSuggestion.selections||[]).map((v,i)=><div key={i} className="ai-review-card"><label><input type="checkbox" checked={aiChecked('s'+i)} onChange={()=>aiToggle('s'+i)}/><strong>{v.group_code} · {v.competence_label||v.competence}</strong> <small style={{marginLeft:8,border:"1px solid #dbe4ef",borderRadius:16,padding:"3px 9px",color:v.competence_evidence?"#166534":"#92400e",background:v.competence_evidence?"#dcfce7":"#fef3c7"}}>{v.confidence||"à confirmer"}</small></label><p className="muted" style={{margin:"8px 0 12px 28px",fontSize:15,lineHeight:1.45}}><strong>↳ Justification de la compétence :</strong> {v.competence_evidence||"Justification non confirmée : vérifiez cette compétence avant validation."}</p>{[['behaviours','Comportements professionnels','behaviour_evidence'],['knowledge','Savoirs associés','knowledge_evidence'],['expected_results','Résultats attendus','result_evidence']].map(([kind,label,evidence])=><div key={kind}><strong>{label}</strong>{!(v[kind]||[]).length&&<p className="muted" style={{fontSize:13,margin:'5px 0 9px 28px'}}>Aucune proposition étayée pour cette rubrique. Tu peux la compléter manuellement avant d’enregistrer.</p>}{(v[kind]||[]).map((x,j)=><label key={j} className="ai-review-item"><input type="checkbox" checked={aiChecked(i+':'+kind+':'+j)} onChange={()=>aiToggle(i+':'+kind+':'+j)}/><span>{x}{(v[evidence]||[]).find(e=>e.label===x)?.evidence&&<small>Preuve : {(v[evidence]||[]).find(e=>e.label===x).evidence}</small>}</span></label>)}</div>)}</div>)}{klass.diploma_code!=='EPC'&&(aiSuggestion.economy_law_selections||[]).length>0&&<div className="ai-review-card"><strong>Transversalités Économie-Droit</strong>{aiSuggestion.economy_law_selections.map((v,i)=><label className="ai-review-item" key={i}><input type="checkbox" checked={aiChecked('ed'+i)} onChange={()=>aiToggle('ed'+i)}/><span>{v.module_code} · {v.question}<small>{v.question_evidence||''}</small></span></label>)}</div>}<button type="button" className="btn primary" onClick={applyAiSuggestion}>Appliquer uniquement les propositions cochées</button><button type="button" className="btn ghost" onClick={()=>setAiSuggestion(null)}>Ignorer</button></div>}</div>
    {aiSuggestion&&<div className="editor-section" style={{background:"#eff6ff",borderColor:"#bfdbfe"}}><strong>Document reconnu : propositions à valider</strong><p className="muted">L’IA a proposé un titre, des activités et des éléments du référentiel. Cochez les propositions utiles ci-dessus, puis cliquez sur « Appliquer uniquement les propositions cochées ». Vous pourrez ensuite vérifier et modifier les champs ci-dessous.</p><button type="button" className="btn ghost" onClick={()=>document.getElementById('propilot-ai-review')?.scrollIntoView({behavior:'smooth',block:'start'})}>Revoir les propositions IA ↑</button></div>}
    {savedAiReview&&!aiSuggestion&&<div className="editor-section" style={{background:"#eff6ff",borderColor:"#bfdbfe",fontFamily:"Arial, Helvetica, sans-serif",fontSize:16,lineHeight:1.55}}><h4>✨ Analyse IA du document — synthèse conservée</h4>{savedAiReview.rationale&&<p>{savedAiReview.rationale}</p>}<div className="ai-review-card" style={{background:"#eff6ff",borderColor:"#bfdbfe"}}><strong>Contexte professionnel reconnu</strong><p>{savedAiReview.suggested_context_name||savedAiReview.context_name||"Non identifié"}</p><strong>Problématique / mission</strong><p>{savedAiReview.suggested_problematic||savedAiReview.problematic||"Non identifiée"}</p><strong>Activités / productions élèves</strong><ul>{(Array.isArray(savedAiReview.suggested_activities||savedAiReview.activities)?savedAiReview.suggested_activities||savedAiReview.activities:String(savedAiReview.suggested_activities||savedAiReview.activities||"").split(/\\n|\n/)).filter(Boolean).map((v,i)=><li key={i}>{v}</li>)}</ul></div>{(savedAiReview.selections||[]).map((v,i)=><div className="ai-review-card" key={i}><strong>{v.group_code} · {v.competence_label||v.competence}</strong><p style={{margin:"8px 0 12px",fontSize:15,lineHeight:1.45}}><strong>↳ Justification de la compétence :</strong> {v.competence_evidence||"Aucune justification documentaire conservée pour cette compétence."}</p></div>)}</div>}<div className="editor-section" id="propilot-identification"><h4>3. Identification</h4><div className="form-grid"><label>Type<select value={f.item_kind} onChange={e=>setF({...f,item_kind:e.target.value})}><option value="context">Contexte pédagogique</option><option value="event">Évènement / activité</option></select></label>{f.item_kind==='event'&&<label>Type d’activité<select value={f.activity_type} onChange={e=>setF({...f,activity_type:e.target.value})}><option value="">Choisir…</option><option>Oral post-PFMP</option><option>PFMP</option><option>Évaluation</option><option>Sortie pédagogique</option><option>Autre</option></select></label>}<label className="full">Nom du contexte / activité<input value={f.context_name} onChange={e=>setF({...f,context_name:e.target.value})} required/></label><label className="full">Problématique<textarea rows="2" value={f.problematic} onChange={e=>setF({...f,problematic:e.target.value})}/></label><label>Période<select value={f.period_id} onChange={e=>setF({...f,period_id:e.target.value})}>{periods.map(p=><option key={p.id} value={p.code}>{p.code} — {p.label}</option>)}</select></label><fieldset style={{border:"1px solid #dbe4ef",borderRadius:10,padding:12}}><legend>Enseignants associés (1 à 3)</legend><div style={{fontSize:13,marginBottom:8}}>Les enseignants associés peuvent modifier cette publication.</div>{teacherMembers.filter(m=>m.id===(initial?.created_by||currentUserId)).map(m=><label key={m.id} style={{display:"block"}}><input type="checkbox" checked disabled/> {m.name} · auteur</label>)}{teacherMembers.filter(m=>m.id!==(initial?.created_by||currentUserId)).map(m=><label key={m.id} style={{display:"block",marginTop:6}}><input type="checkbox" checked={coauthors.includes(m.id)} onChange={e=>setCoauthors(prev=>e.target.checked?[...prev,m.id].slice(0,2):prev.filter(id=>id!==m.id))} disabled={!coauthors.includes(m.id)&&coauthors.length>=2}/> {m.name}</label>)}</fieldset><label>Niveau d’apprentissage<select value={f.learning_level} onChange={e=>setF({...f,learning_level:e.target.value})}>{LEARNING.map(([k,l])=><option key={k} value={k}>{k} — {l}</option>)}</select></label><label>Statut<select value={f.status} onChange={e=>setF({...f,status:e.target.value})}>{STATUS.map(s=><option key={s}>{s}</option>)}</select></label><label>Durée prévue (h)<input type="number" min="0" step="0.5" value={f.duration_hours} onChange={e=>setF({...f,duration_hours:e.target.value})}/></label><label>Niveau de classe<select value={f.cycle_level} onChange={e=>setF({...f,cycle_level:e.target.value})}><option value="seconde">Seconde</option><option value="premiere">Première</option><option value="terminale">Terminale</option></select></label></div></div>
    <div className="editor-section"><h4>2. Compétences du référentiel</h4><p className="muted">Le référentiel officiel de la classe est chargé automatiquement. Les comportements, savoirs et résultats attendus peuvent être préremplis comme dans votre version personnelle.</p><div className="competency-choice-grid">{competencies.map(c=><button type="button" key={c.code} className={f.competencyCodes.includes(c.code)?'competency-choice selected':'competency-choice'} onClick={()=>toggleCode(c.code)}><span style={{borderLeft:`4px solid ${GROUP_STYLE[c.group_code]?.color||'#94A3B8'}`}}>{GROUP_STYLE[c.group_code]?.personal||c.group_code}</span><b>{c.code}</b><small>{c.label}</small></button>)}</div></div>
    <div className="editor-section"><div className="editor-section-title"><h4>5. Éléments pédagogiques</h4><button type="button" className="btn small" onClick={refillFromReferential} disabled={!f.competencyCodes.length}><RefreshCw/>Tout sélectionner depuis le référentiel</button></div>
    <p className="muted">Cochez uniquement les éléments travaillés dans ce contexte. Les choix sont enregistrés avec le contexte pédagogique.</p>
    {resourceChoices('behaviours','behavioursText','Comportements professionnels')}
    {resourceChoices('knowledge','knowledgeText','Savoirs associés')}
    {resourceChoices('expected_results','expectedText','Résultats attendus')}
    <div className="form-grid"><label className="full">Activités / productions élèves<textarea rows="7" value={f.activities} onChange={e=>setF({...f,activities:e.target.value})} placeholder="- Activité 1\n- Activité 2…"/></label><label className="full">Ajustement / observation<textarea rows="3" value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="À compléter au fil de l’année"/></label></div></div>
    {klass.diploma_code!=='EPC'&&<div className="editor-section"><h4>6. Transversalités économie-droit</h4><div className="econ-choice-grid">{sortedEcon.map(x=><button type="button" key={x.code} className={f.econ_law_links.includes(x.code)?'econ-choice selected':'econ-choice'} onClick={()=>toggleEcon(x.code)}><b>{x.code}{recommendedEcon.has(x.code)?' · Suggéré pour les compétences sélectionnées':''}</b><span>{x.question_label}</span></button>)}{!econ.length&&<div className="small-empty">Aucun lien économie-droit configuré pour ce diplôme.</div>}</div></div>}
    {message&&<div className="form-message">{message}</div>}<div className="modal-actions">{isEditing&&onDelete&&<button type="button" className="btn ghost" disabled={busy} onClick={onDelete}><Trash2 size={16}/> Supprimer</button>}{isEditing&&onResume&&f.cycle_level!=='terminale'&&<button type="button" className="btn ghost" disabled={busy} onClick={onResume}>↗ Reprendre en Terminale</button>}<button type="button" className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy}><Save/>{busy?'Enregistrement…':'Enregistrer'}</button></div>
  </form></div></div>
}

function levelToCycle(label){const v=String(label||'').toLowerCase();if(v.includes('term'))return 'terminale';if(v.includes('2'))return 'seconde';return 'premiere'}
function normalizeEcon(arr){return (Array.isArray(arr)?arr:[]).map(x=>typeof x==='string'?x:(x.code||x.econ_law_code||null)).filter(Boolean)}


