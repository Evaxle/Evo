const navbar=document.querySelector('.glow-navbar');
const buttons=document.querySelectorAll('.nav-btn');
const hoverBorder=document.querySelector('.hover-border');

buttons.forEach(btn=>{
  btn.addEventListener('mouseenter',()=>{
    const rect=btn.getBoundingClientRect();
    const navRect=navbar.getBoundingClientRect();
    hoverBorder.style.left=(rect.left-navRect.left)+'px';
    hoverBorder.style.width=rect.width+'px';
  });
});
navbar.addEventListener('mouseleave',()=>{
  hoverBorder.style.width=0;
});

const sidebar=document.getElementById('glowSidebar');
let timer;
sidebar.addEventListener('mouseenter',()=>{
  clearTimeout(timer);
  sidebar.classList.add('expanded');
});
sidebar.addEventListener('mouseleave',()=>{
  timer=setTimeout(()=>{sidebar.classList.remove('expanded')},600);
});
