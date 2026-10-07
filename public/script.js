const mt=document.querySelector(".menu-toggle"),mm=document.querySelector(".mobile-menu");
mt?.addEventListener("click",()=>{const o=mm.hasAttribute("hidden");o?mm.removeAttribute("hidden"):mm.setAttribute("hidden","");mt.setAttribute("aria-expanded",String(o))});
mm?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{mm.setAttribute("hidden","");mt?.setAttribute("aria-expanded","false")}));

const data={
clienti:"Guarderemmo prima domanda, posizionamento, presenza locale e capacità del sito di trasformare interesse in richiesta.",
conversione:"Guarderemmo percorso, messaggio, velocità di risposta e follow-up prima di aumentare il traffico.",
tempo:"Partiremmo dai passaggi ripetitivi: cosa eliminare, cosa semplificare e cosa automatizzare davvero.",
controllo:"Metteremmo ordine in tracking, pipeline e KPI per capire dove nasce e dove si perde valore."
};
const buttons=document.querySelectorAll(".starter-options button"),text=document.getElementById("starterText");
buttons.forEach(b=>b.addEventListener("click",()=>{buttons.forEach(x=>x.classList.remove("active"));b.classList.add("active");text.textContent=data[b.dataset.key]}));

const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("is-visible");io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll(".reveal").forEach(el=>io.observe(el));