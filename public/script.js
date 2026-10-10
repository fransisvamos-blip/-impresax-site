const toggle=document.querySelector(".menu-toggle");
const menu=document.querySelector(".mobile-menu");
const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function closeMenu(){
  if(!toggle||!menu)return;
  menu.setAttribute("hidden","");
  toggle.setAttribute("aria-expanded","false");
  document.body.classList.remove("menu-open");
}

toggle?.addEventListener("click",()=>{
  const opening=menu.hasAttribute("hidden");
  if(opening){
    menu.removeAttribute("hidden");
    toggle.setAttribute("aria-expanded","true");
    document.body.classList.add("menu-open");
  }else closeMenu();
});
menu?.querySelectorAll("a").forEach(a=>a.addEventListener("click",closeMenu));

if(reduceMotion){
  document.querySelectorAll(".reveal").forEach(el=>el.classList.add("is-visible"));
}else{
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },{threshold:.08,rootMargin:"0px 0px -5% 0px"});
  document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));
}

document.querySelectorAll('a[href^="#"]').forEach(link=>{
  link.addEventListener("click",event=>{
    const selector=link.getAttribute("href");
    if(!selector||selector==="#")return;
    const target=document.querySelector(selector);
    if(!target)return;
    event.preventDefault();
    closeMenu();
    target.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"start"});
  });
});

function track(eventName,payload={}){
  if(Array.isArray(window.dataLayer))window.dataLayer.push({event:eventName,...payload});
  window.dispatchEvent(new CustomEvent("impresax:"+eventName,{detail:payload}));
}

document.querySelector(".hero-copy .master-cta")?.addEventListener("click",()=>track("hero_cta_click"));
document.querySelector(".master-header-cta")?.addEventListener("click",()=>track("header_cta_click"));

/* UTM */
const UTM_KEYS=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
const currentParams=new URLSearchParams(window.location.search);
const storedUtm={};
UTM_KEYS.forEach(key=>{
  const incoming=currentParams.get(key);
  if(incoming)sessionStorage.setItem("impresax_"+key,incoming);
  storedUtm[key]=sessionStorage.getItem("impresax_"+key)||"";
});

/* Business Check */
const diagnosisMap={
  clienti:{
    label:"Più clienti",
    title:"Controlleremo come oggi le persone ti trovano e arrivano fino al contatto.",
    text:"",
    flow:"VISIBILITÀ → INTERESSE → CONTATTO"
  },
  conversione:{
    label:"Più vendite",
    title:"Controlleremo dove le persone smettono di avanzare verso la vendita.",
    text:"",
    flow:"MESSAGGIO → CONTATTO → FOLLOW-UP → CLIENTE"
  },
  relazione:{
    label:"Meno opportunità perse",
    title:"Controlleremo dove richieste e clienti si perdono dopo il primo contatto.",
    text:"",
    flow:"CONTATTO → RISPOSTA → FOLLOW-UP → CLIENTE"
  },
  processi:{
    label:"Meno lavoro manuale",
    title:"Controlleremo quali attività possono essere semplificate o automatizzate.",
    text:"",
    flow:"ATTIVITÀ → SEMPLIFICA → AUTOMATIZZA"
  },
  dati:{
    label:"Più controllo",
    title:"Controlleremo quali numeri ti servono per capire cosa funziona davvero.",
    text:"",
    flow:"DATI → LETTURA → DECISIONE"
  },
  incerto:{
    label:"Non so da dove partire",
    formValue:"Altro",
    title:"Partiremo dal capire quale punto merita davvero attenzione.",
    text:"",
    flow:"CONTESTO → PRIORITÀ → AZIONE"
  }
};

const diagnosisButtons=[...document.querySelectorAll("[data-diagnosis]")];
const diagnosisTitle=document.getElementById("diagnosisTitle");
const diagnosisText=document.getElementById("diagnosisText");
const diagnosisFlow=document.getElementById("diagnosisFlow");
const analysisContext=document.getElementById("analysisContext");
let selectedDiagnosis=sessionStorage.getItem("impresax_diagnostic")||"";

function applyDiagnosis(key,emit=false){
  const data=diagnosisMap[key];
  if(!data)return;
  const wasEmpty=!selectedDiagnosis;
  selectedDiagnosis=key;
  sessionStorage.setItem("impresax_diagnostic",key);
  diagnosisButtons.forEach(btn=>btn.classList.toggle("active",btn.dataset.diagnosis===key));
  if(diagnosisTitle)diagnosisTitle.textContent=data.title;
  if(diagnosisText)diagnosisText.textContent=data.text;
  if(diagnosisFlow)diagnosisFlow.textContent=data.flow;
  if(analysisContext){
    analysisContext.textContent="Priorità scelta: "+data.label+".";
    analysisContext.classList.add("active");
  }
  const radioValue=data.formValue||data.label;
  const radio=[...document.querySelectorAll('input[name="improvement_area"]')].find(input=>input.value===radioValue);
  if(radio)radio.checked=true;
  if(emit){
    if(wasEmpty)track("diagnostic_start");
    track("diagnostic_complete",{diagnostic_area:data.label});
  }
}
diagnosisButtons.forEach(btn=>btn.addEventListener("click",()=>applyDiagnosis(btn.dataset.diagnosis,true)));
applyDiagnosis(selectedDiagnosis&&diagnosisMap[selectedDiagnosis]?selectedDiagnosis:"clienti",false);

/* Value Check */
const valueLeads=document.getElementById("valueLeads");
const valueClients=document.getElementById("valueClients");
const valueAverage=document.getElementById("valueAverage");
const valueOne=document.getElementById("valueOne");
const valueTwo=document.getElementById("valueTwo");
const valueFour=document.getElementById("valueFour");
const lowValueMessage=document.getElementById("lowValueMessage");
let valueStarted=false;
let valueCompleted=false;

function euro(value){
  return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value);
}

function scenarioAnnual(extra,leads,clients,average){
  const headroom=Math.max(0,leads-clients);
  if(headroom<extra)return null;
  return extra*average*12;
}

function updateValueCheck(fromUser=false){
  if(!valueLeads||!valueClients||!valueAverage)return;
  const leads=Math.max(0,Number(valueLeads.value)||0);
  const clients=Math.max(0,Number(valueClients.value)||0);
  const average=Math.max(0,Number(valueAverage.value)||0);
  const one=scenarioAnnual(1,leads,clients,average);
  const two=scenarioAnnual(2,leads,clients,average);
  const four=scenarioAnnual(4,leads,clients,average);

  if(valueOne)valueOne.textContent=one===null?"—":euro(one);
  if(valueTwo)valueTwo.textContent=two===null?"—":euro(two);
  if(valueFour)valueFour.textContent=four===null?"—":euro(four);

  const strongest=four??two??one??0;
  if(lowValueMessage){
    const low=strongest>0&&strongest<5000;
    const noHeadroom=leads>0&&clients>=leads;
    lowValueMessage.hidden=!(low||noHeadroom);
  }

  if(fromUser&&!valueStarted){
    valueStarted=true;
    track("value_check_start");
  }
  if(fromUser&&leads>0&&average>0&&!valueCompleted){
    valueCompleted=true;
    track("value_check_complete");
  }
}

[valueLeads,valueClients,valueAverage].forEach(input=>{
  input?.addEventListener("focus",()=>{
    if(!valueStarted){valueStarted=true;track("value_check_start")}
  });
  input?.addEventListener("input",()=>updateValueCheck(true));
});
updateValueCheck(false);

/* Sticky CTA */
const sticky=document.getElementById("stickyAnalysis");
const analysisSection=document.getElementById("analisi");
let analysisVisible=false;
if(analysisSection){
  const analysisObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      analysisVisible=entry.isIntersecting;
      updateSticky();
    });
  },{threshold:.08});
  analysisObserver.observe(analysisSection);
}
function updateSticky(){
  if(!sticky)return;
  const show=window.innerWidth<768&&window.scrollY>window.innerHeight*1.05&&!analysisVisible;
  sticky.classList.toggle("visible",show);
}
window.addEventListener("scroll",updateSticky,{passive:true});
window.addEventListener("resize",updateSticky);
sticky?.querySelector("a")?.addEventListener("click",()=>track("sticky_cta_click"));

/* Progressive Form */
const form=document.getElementById("leadForm");
const status=document.getElementById("formStatus");
const success=document.getElementById("formSuccess");
const steps=[...document.querySelectorAll(".form-step")];
const progress=[...document.querySelectorAll("[data-progress]")];
let currentStep=1;
let formStarted=false;

function showStep(step){
  currentStep=step;
  steps.forEach(el=>{
    el.hidden=false;
    el.classList.toggle("active",Number(el.dataset.step)===step);
  });
  progress.forEach(el=>{
    const n=Number(el.dataset.progress);
    el.classList.toggle("active",n===step);
    el.classList.toggle("done",n<step);
  });
  if(step===2)track("form_step_2");
  if(step===3)track("form_step_3");
  form?.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"center"});
}
function markStarted(){
  if(formStarted)return;
  formStarted=true;
  track("form_start");
}
form?.addEventListener("focusin",markStarted);
form?.addEventListener("change",markStarted);

function setError(step,message){
  const box=document.querySelector('[data-error="'+step+'"]');
  if(box)box.textContent=message||"";
}
function fieldValid(field){
  const value=String(field.value||"").trim();
  let invalid=field.required&&!value;
  if(field.type==="email"&&value&&!field.checkValidity())invalid=true;
  if(field.type==="url"&&value&&!field.checkValidity())invalid=true;
  if(field.name==="phone"&&value&&value.replace(/\D/g,"").length<7)invalid=true;
  field.classList.toggle("invalid",invalid);
  field.setAttribute("aria-invalid",invalid?"true":"false");
  return !invalid;
}
function validateStep(step){
  setError(step,"");
  if(step===1){
    const checked=form?.querySelector('input[name="improvement_area"]:checked');
    if(!checked){
      setError(1,"Scegli la priorità che oggi senti più importante.");
      return false;
    }
    return true;
  }
  const container=document.querySelector('.form-step[data-step="'+step+'"]');
  const fields=[...(container?.querySelectorAll("input[required],textarea[required]")||[])];
  const valid=fields.map(fieldValid).every(Boolean);
  if(!valid){
    setError(step,"Controlla i campi evidenziati.");
    container?.querySelector(".invalid")?.focus();
  }
  return valid;
}
document.querySelectorAll("[data-next]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const next=Number(btn.dataset.next);
    if(validateStep(currentStep))showStep(next);
  });
});
document.querySelectorAll("[data-back]").forEach(btn=>{
  btn.addEventListener("click",()=>showStep(Number(btn.dataset.back)));
});
form?.querySelectorAll("input,textarea").forEach(field=>{
  field.addEventListener("input",()=>{if(field.classList.contains("invalid"))fieldValid(field)});
  field.addEventListener("change",()=>{if(field.classList.contains("invalid"))fieldValid(field)});
});
document.querySelectorAll('input[name="improvement_area"]').forEach(radio=>{
  radio.addEventListener("change",()=>{
    const match=Object.entries(diagnosisMap).find(([,data])=>(data.formValue||data.label)===radio.value);
    if(match&&selectedDiagnosis!==match[0])applyDiagnosis(match[0],false);
  });
});

const LEAD_ENDPOINT="https://bvkeurkithmvodyjmnqi.supabase.co/functions/v1/impresax-lead";

form?.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!validateStep(3))return;
  const improvement=form.querySelector('input[name="improvement_area"]:checked');
  if(!improvement){
    showStep(1);
    setError(1,"Scegli la priorità che vuoi migliorare.");
    return;
  }
  const submit=form.querySelector(".form-submit");
  submit.disabled=true;
  status.className="form-status loading";
  status.textContent="Stiamo inviando la richiesta…";
  track("form_submit",{improvement_area:improvement.value});

  const data=new FormData(form);
  const payload={
    name:String(data.get("name")||""),
    company:String(data.get("company")||""),
    sector:String(data.get("sector")||""),
    website:String(data.get("website")||""),
    phone:String(data.get("phone")||""),
    email:String(data.get("email")||""),
    improvement_area:improvement.value,
    message:String(data.get("message")||""),
    diagnostic_area:selectedDiagnosis&&diagnosisMap[selectedDiagnosis]?diagnosisMap[selectedDiagnosis].label:"",
    website_extra:String(data.get("website_extra")||""),
    source_page:window.location.href,
    ...storedUtm
  };

  try{
    const response=await fetch(LEAD_ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    const result=await response.json().catch(()=>({ok:false,error:"invalid_response"}));
    if(!response.ok||!result.ok){
      if(response.status===429)throw new Error("Hai già inviato diverse richieste. Riprova più tardi.");
      if(response.status===422)throw new Error("Controlla i dati inseriti e riprova.");
      throw new Error("Non siamo riusciti a salvare la richiesta. Riprova tra poco.");
    }
    steps.forEach(el=>el.hidden=true);
    document.querySelector(".form-progress")?.setAttribute("hidden","");
    status.textContent="";
    status.className="form-status";
    success.hidden=false;
    track("lead_success",{improvement_area:improvement.value});
  }catch(error){
    status.className="form-status error";
    status.textContent=error?.message||"Errore temporaneo. Riprova.";
  }finally{
    submit.disabled=false;
  }
});
