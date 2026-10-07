const menuToggle=document.querySelector(".menu-toggle"),mobileMenu=document.querySelector(".mobile-menu");
menuToggle?.addEventListener("click",()=>{const open=mobileMenu.hasAttribute("hidden");open?mobileMenu.removeAttribute("hidden"):mobileMenu.setAttribute("hidden","");menuToggle.setAttribute("aria-expanded",String(open))});
mobileMenu?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{mobileMenu.setAttribute("hidden","");menuToggle?.setAttribute("aria-expanded","false")}));

const diagnosis={
clienti:{title:"Più traffico non è sempre la risposta.",text:"Prima guardiamo domanda, posizionamento, presenza locale, offerta e capacità del sito di trasformare interesse in richiesta.",tags:["Domanda","Posizionamento","Conversione"]},
conversione:{title:"Prima di comprare altri click, fermiamo le perdite.",text:"Controlliamo messaggio, percorso, velocità di risposta, CRM e follow-up. Spesso la crescita è già dentro i lead che arrivano.",tags:["Percorso","CRM","Follow-up"]},
tempo:{title:"Automatizzare il caos lo rende solo più veloce.",text:"Mappiamo prima il processo, eliminiamo i passaggi inutili e solo dopo automatizziamo ciò che ha davvero senso.",tags:["Processo","Automazione","AI"]},
controllo:{title:"Se non sai cosa funziona, ogni scelta costa di più.",text:"Mettiamo ordine in tracking, pipeline e KPI per capire dove nasce il valore e dove si perde.",tags:["Tracking","Pipeline","KPI"]}
};
const diagButtons=document.querySelectorAll(".problem"),diagTitle=document.getElementById("diagTitle"),diagText=document.getElementById("diagText"),diagTags=document.getElementById("diagTags");
diagButtons.forEach(btn=>btn.addEventListener("click",()=>{diagButtons.forEach(b=>b.classList.remove("active"));btn.classList.add("active");const d=diagnosis[btn.dataset.key];diagTitle.textContent=d.title;diagText.textContent=d.text;diagTags.innerHTML=d.tags.map(t=>"<i>"+t+"</i>").join("")}));

const starterAnswers={
clienti:"Partiremmo da domanda, posizionamento e capacità del sito di trasformare interesse in richiesta.",
conversione:"Partiremmo da percorso, messaggio, velocità di risposta e follow-up.",
tempo:"Partiremmo dai passaggi ripetitivi: cosa eliminare, cosa semplificare e cosa automatizzare.",
controllo:"Partiremmo da tracking, pipeline e KPI per capire dove nasce e dove si perde valore."
};
const starterButtons=document.querySelectorAll(".starter-options button"),starterText=document.getElementById("starterText");
starterButtons.forEach(btn=>btn.addEventListener("click",()=>{starterButtons.forEach(b=>b.classList.remove("active"));btn.classList.add("active");starterText.textContent=starterAnswers[btn.dataset.key]}));

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}}),{threshold:.1});
document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));