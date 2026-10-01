const canvas=document.getElementById("game"),ctx=canvas.getContext("2d");
const scoreEl=document.getElementById("score"),bestEl=document.getElementById("best"),hint=document.getElementById("gameHint"),restart=document.getElementById("restart");
let dpr=Math.min(devicePixelRatio||1,2), W=1000,H=250, running=false, over=false, score=0, speed=5, last=0, spawn=0, obstacles=[], best=Number(localStorage.getItem("bobrBest")||0);
bestEl.textContent=String(best).padStart(4,"0");
function resize(){const r=canvas.getBoundingClientRect();canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}resize();addEventListener("resize",resize);
const bob={x:90,y:190,w:46,h:48,vy:0,onGround:true};
function reset(){score=0;speed=5;spawn=0;obstacles=[];bob.y=190;bob.vy=0;bob.onGround=true;over=false;running=true;hint.style.display="none";restart.style.display="none";last=performance.now();requestAnimationFrame(loop)}
function jump(){if(!running){reset();return} if(bob.onGround){bob.vy=-12;bob.onGround=false}}
function drawBob(){ctx.save();ctx.translate(bob.x,bob.y); // tail
ctx.fillStyle="#7c4b2a";ctx.beginPath();ctx.ellipse(-7,17,15,10,-.35,0,Math.PI*2);ctx.fill();
ctx.fillStyle="#a96735";ctx.beginPath();ctx.roundRect(0,-30,38,38,12);ctx.fill();
ctx.fillStyle="#8b542e";ctx.beginPath();ctx.arc(7,-31,9,0,Math.PI*2);ctx.arc(31,-31,9,0,Math.PI*2);ctx.fill();
ctx.fillStyle="#d08b51";ctx.beginPath();ctx.arc(7,-31,4,0,Math.PI*2);ctx.arc(31,-31,4,0,Math.PI*2);ctx.fill();
ctx.fillStyle="#20150f";ctx.beginPath();ctx.arc(11,-15,3,0,Math.PI*2);ctx.arc(27,-15,3,0,Math.PI*2);ctx.fill();
ctx.fillStyle="#d08b51";ctx.beginPath();ctx.ellipse(19,-7,11,8,0,0,Math.PI*2);ctx.fill();
ctx.fillStyle="#3c2618";ctx.beginPath();ctx.ellipse(19,-9,5,3,0,0,Math.PI*2);ctx.fill();
ctx.fillStyle="#d9a23a";ctx.beginPath();ctx.roundRect(4,7,30,23,6);ctx.fill();
ctx.fillStyle="#6f3f21";ctx.font="bold 10px Arial";ctx.textAlign="center";ctx.fillText("100",19,22);ctx.restore()}
function drawObstacle(o){ctx.fillStyle="#70431f";ctx.fillRect(o.x,200-o.h,o.w,o.h);ctx.fillStyle="#a86b3c";ctx.fillRect(o.x+5,205-o.h,o.w-10,5);ctx.strokeStyle="#4d2b18";ctx.lineWidth=3;ctx.strokeRect(o.x,200-o.h,o.w,o.h)}
function loop(t){if(!running)return;const dt=Math.min((t-last)/16.67,2);last=t;ctx.clearRect(0,0,W,H);
ctx.fillStyle="#e8d0a9";ctx.fillRect(0,0,W,H);ctx.fillStyle="rgba(255,255,255,.35)";for(let i=0;i<9;i++){ctx.beginPath();ctx.arc(80+i*130,48+(i%2)*22,3,0,7);ctx.fill()}
ctx.fillStyle="#6b4a2e";ctx.fillRect(0,199,W,7);ctx.fillStyle="#4b301e";for(let x=0;x<W;x+=36){ctx.fillRect(x,206,20,4)}
spawn-=dt;if(spawn<=0){let h=25+Math.random()*45;obstacles.push({x:W+10,w:18+Math.random()*13,h});spawn=60+Math.random()*70-speed*3}
speed+=0.0015*dt;score+=0.12*dt;scoreEl.textContent=String(Math.floor(score)).padStart(4,"0");
for(const o of obstacles)o.x-=speed*dt;obstacles=obstacles.filter(o=>o.x>-50);
bob.vy+=.62*dt;bob.y+=bob.vy*dt;if(bob.y>=190){bob.y=190;bob.vy=0;bob.onGround=true}
drawBob();for(const o of obstacles){drawObstacle(o);if(bob.x+bob.w-6>o.x&&bob.x+8<o.x+o.w&&bob.y+8>200-o.h){gameOver();return}}
requestAnimationFrame(loop)}
function gameOver(){running=false;over=true;let s=Math.floor(score);if(s>best){best=s;localStorage.setItem("bobrBest",best);bestEl.textContent=String(best).padStart(4,"0")}hint.textContent=`Бобёр столкнулся! Счёт: ${String(s).padStart(4,"0")}`;hint.style.display="block";restart.style.display="block"}
canvas.addEventListener("pointerdown",e=>{e.preventDefault();jump()});addEventListener("keydown",e=>{if(e.code==="Space"){e.preventDefault();jump()}});
restart.addEventListener("click",reset);

const photos=[...document.querySelectorAll(".photo img")],lb=document.getElementById("lightbox"),lbImg=document.getElementById("lb-img");let current=0;
function openPhoto(i){current=i;lbImg.src=photos[i].src;lbImg.alt=photos[i].alt;lb.classList.add("open");lb.setAttribute("aria-hidden","false")}
photos.forEach((p,i)=>p.parentElement.addEventListener("click",()=>openPhoto(i)));
function next(n){current=(current+n+photos.length)%photos.length;openPhoto(current)}
document.querySelector(".lb-close").onclick=()=>{lb.classList.remove("open");lb.setAttribute("aria-hidden","true")};
document.querySelector(".lb-prev").onclick=()=>next(-1);document.querySelector(".lb-next").onclick=()=>next(1);
lb.addEventListener("click",e=>{if(e.target===lb)document.querySelector(".lb-close").click()});
addEventListener("keydown",e=>{if(!lb.classList.contains("open"))return;if(e.key==="Escape")document.querySelector(".lb-close").click();if(e.key==="ArrowLeft")next(-1);if(e.key==="ArrowRight")next(1)});
