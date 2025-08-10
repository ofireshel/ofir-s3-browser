(function(){
  const cat=document.getElementById('cat');
  const canvas=document.getElementById('ground');
  const ctx=canvas.getContext('2d');
  function resize(){ canvas.width=innerWidth; canvas.height=innerHeight; }
  addEventListener('resize',resize); resize();

  function groundY(x){ const h=canvas.height, base=h-80; return base - (30*Math.sin(x/140) + 18*Math.sin((x+200)/63) + 12*Math.sin((x+520)/27)); }
  function groundSlope(x){ return (groundY(x+1)-groundY(x-1))/2; }
  function drawGround(){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#22314a'; ctx.beginPath(); ctx.moveTo(0,canvas.height); for(let x=0;x<=canvas.width;x+=2) ctx.lineTo(x,groundY(x)); ctx.lineTo(canvas.width,canvas.height); ctx.closePath(); ctx.fill(); }

  let R=90; (function(){ const r=cat.getBoundingClientRect(); R=Math.max(50,Math.max(r.width,r.height)/2); })();
  const mass=4.0, pxPerMeter=180, g=9.81*pxPerMeter; const I=0.5*mass*Math.pow(R/pxPerMeter,2);
  let x=canvas.width*0.35, y=10+R, vx=180, vy=0, w=0; let last=performance.now(); let groundedTime=0;

  function liftAndDrop(){ x = canvas.width*0.3 + Math.random()*canvas.width*0.4; y = 10 + R; vx = 140*(Math.random()*2-1); vy = 0; w = 0; groundedTime=0; }

  function collide(){
    const gy=groundY(x); if(y+R<=gy) return false;
    const s=groundSlope(x); let nx=-s, ny=1; const nlen=Math.hypot(nx,ny); nx/=nlen; ny/=nlen; y=gy-R;
    const rx=-nx*R, ry=-ny*R; let vcx=vx + (-w*ry), vcy=vy + (w*rx);
    const vdotn=vcx*nx + vcy*ny; const tx=-ny, ty=nx; const vdott=vcx*tx + vcy*ty;
    const e=0.55, mu=0.35; const rxn=rx*ny - ry*nx; const invMassN=(1/mass)+(rxn*rxn)/I; let jn=0; if(vdotn<0) jn=-(1+e)*vdotn/invMassN;
    const rxT=rx*tx + ry*ty; const invMassT=(1/mass)+(rxT*rxT)/I; let jt=-vdott/invMassT; const maxJt=mu*Math.abs(jn); if(jt>maxJt) jt=maxJt; if(jt<-maxJt) jt=-maxJt;
    const Jx=jn*nx + jt*tx, Jy=jn*ny + jt*ty; vx+=Jx/mass; vy+=Jy/mass; const tau=rx*Jy - ry*Jx; w+=tau/I; w*=0.985; return true;
  }

  function step(t){ const dt=Math.min(0.02,(t-last)/1000); last=t; vy += g*dt; x += vx*dt; y += vy*dt;
    if(x-R<0){ x=R; vx=-vx*0.55; w*=0.9; } if(x+R>canvas.width){ x=canvas.width-R; vx=-vx*0.55; w*=0.9; }
    const hit=collide(); drawGround(); cat.style.transform='translate('+(x-R)+'px,'+(y-R)+'px) rotate('+w*0.25+'rad)';
    const vmag=Math.hypot(vx,vy); const onGround=(y+R>=groundY(x)-1); if(onGround && vmag<24 && Math.abs(w)<0.25){ groundedTime+=dt; if(groundedTime>=2.0){ liftAndDrop(); } } else groundedTime=0;
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
})();
