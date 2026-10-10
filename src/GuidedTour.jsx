import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X, CheckCircle2 } from 'lucide-react'

const TOUR_STEPS=[
  {key:'dashboard',title:'Votre tableau de bord',text:'Retrouvez ici vos classes, vos invitations de collaboration et les accès rapides vers votre travail.'},
  {key:'classes',title:'Vos classes et vos élèves',text:'Ouvrez une classe pour retrouver les élèves et travailler dans un espace commun si vous êtes en binôme ou en trinôme.'},
  {key:'progression',title:'Progression pédagogique',text:'Construisez votre progression P1 à P7, ajoutez vos contextes et retrouvez les PFMP directement dans la progression.'},
  {key:'evaluations',title:'Évaluations',text:'Positionnez rapidement les élèves sur les compétences du référentiel, notamment depuis une tablette.'},
  {key:'pfmp',title:'PFMP',text:'Suivez les périodes de formation en milieu professionnel et les éléments de bilan associés.'},
  {key:'ccf',title:'CCF et documents',text:'Préparez les épreuves, suivez les pièces attendues et gérez les documents liés au CCF.'},
]

export default function GuidedTour({open,onClose}){
  const [index,setIndex]=useState(0)
  useEffect(()=>{if(open)setIndex(0)},[open])
  if(!open)return null
  const step=TOUR_STEPS[index]
  const last=index===TOUR_STEPS.length-1
  return <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Visite guidée ProPilot">
    <div className="tour-card">
      <div className="tour-head">
        <span className="eyebrow">Découvrir ProPilot • {index+1}/{TOUR_STEPS.length}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Fermer la visite"><X/></button>
      </div>
      <div className="tour-progress" aria-hidden="true"><span style={{width:`${((index+1)/TOUR_STEPS.length)*100}%`}}/></div>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div className="tour-actions">
        <button className="btn ghost" onClick={onClose}>Passer la visite</button>
        <div className="row">
          {index>0&&<button className="btn" onClick={()=>setIndex(i=>i-1)}><ChevronLeft/>Retour</button>}
          {!last?<button className="btn primary" onClick={()=>setIndex(i=>i+1)}>Suivant<ChevronRight/></button>:<button className="btn primary" onClick={onClose}><CheckCircle2/>ProPilot est prêt</button>}
        </div>
      </div>
    </div>
  </div>
}
