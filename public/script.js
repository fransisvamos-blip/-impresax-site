const menuToggle=document.querySelector(".menu-toggle");
const mobileMenu=document.querySelector(".mobile-menu");
menuToggle?.addEventListener("click",()=>{const open=mobileMenu.hasAttribute("hidden");open?mobileMenu.removeAttribute("hidden"):mobileMenu.setAttribute("hidden","");menuToggle.setAttribute("aria-expanded",String(open))});
mobileMenu?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{mobileMenu.setAttribute("hidden","");menuToggle?.setAttribute("aria-expanded","false")}));

const answers={
clienti:"Partiremmo da domanda, posizionamento, presenza locale e capacità del sito di trasformare interesse in richiesta.",
conversione:"Guarderemmo percorso, messaggio, velocità di risposta e follow-up prima di aumentare il traffico.",
tempo:"Partiremmo dai passaggi ripetitivi: cosa eliminare, cosa semplificare e cosa automatizzare davvero.",
controllo:"Metteremmo ordine in tracking, pipeline e KPI per capire dove nasce e dove si perde valore."
};
const buttons=document.querySelectorAll(".starter-options button");
const starterText=document.getElementById("starterText");
buttons.forEach(btn=>btn.addEventListener("click",()=>{buttons.forEach(b=>b.classList.remove("active"));btn.classList.add("active");starterText.textContent=answers[btn.dataset.key]}));

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}}),{threshold:.1});
document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));