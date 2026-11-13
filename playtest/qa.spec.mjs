import { test, expect } from '@playwright/test';

const cap = { trail: 180, flashes: 8, texts: 40, rings: 30, parts: 700, voices: 24 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function snap(page) { return page.evaluate(() => window.__bl?.snap()); }
async function qa(page) { return page.evaluate(() => window.__bl?.qa); }
function assertCaps(q) { for (const [k, v] of Object.entries(cap)) expect(q[k], k).toBeLessThanOrEqual(v); }
function pick(s) {
  const os = (s?.orbs || []).filter(o => o.type !== 'thorn'); if (!os.length) return null;
  for (const o of os) { const near = os.filter(q => Math.hypot(q.x-o.x,q.y-o.y) < s.R*6); if (near.length < 1) continue;
    const x=near.reduce((a,q)=>a+q.x,0)/near.length, y=near.reduce((a,q)=>a+q.y,0)/near.length;
    const r=Math.max(s.R*2.5,...near.map(q=>Math.hypot(q.x-x,q.y-y)+s.R*1.5));
    if (x-r>0&&x+r<s.W&&y-r>s.H*.13&&y+r<s.H) return {x,y,r}; }
  const o=os[0]; return {x:o.x,y:o.y,r:s.R*2.8};
}
async function fire(page, type, x, y) {
  await page.evaluate(({type,x,y}) => {
    const c=document.querySelector('canvas');
    c.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:9,pointerType:'touch',clientX:x,clientY:y,buttons:type==='pointerup'?0:1}));
  }, {type,x,y});
}
async function strokePath(page, pts, {nearStart=true, steps=8, release=true}={}) {
  if (!pts.length) return;
  await fire(page,'pointerdown',pts[0].x,pts[0].y);
  for (let i=1;i<pts.length;i++) {
    const a=pts[i-1], b=pts[i];
    for (let k=1;k<=steps;k++) await fire(page,'pointermove', a.x+(b.x-a.x)*k/steps, a.y+(b.y-a.y)*k/steps);
    await sleep(8);
  }
  if (nearStart) {
    const last=pts[pts.length-1], first=pts[0];
    // approach the start (gap ~20px) so near-start close can fire without a perfect meet
    const d=Math.hypot(last.x-first.x,last.y-first.y)||1, nx=first.x+(last.x-first.x)/d*20, ny=first.y+(last.y-first.y)/d*20;
    await fire(page,'pointermove', nx, ny); await sleep(40);
  }
  await sleep(120);
  if (release) { await fire(page,'pointerup', pts[0].x, pts[0].y); await sleep(160); }
}
async function touchStroke(page, loop, turns=2.25, release=true) {
  const pts=around(loop,'square');
  if (!release) { await strokePath(page, pts, {nearStart:true, release:false}); return; }
  await strokePath(page, pts, {nearStart:true});
}
async function start(page) {
  await page.addInitScript(()=>{try{sessionStorage.clear();localStorage.removeItem('bloomloop.run.v2')}catch(e){}});
  await page.goto(process.env.GAME_URL || '/index.html?test=1', {waitUntil:'domcontentloaded', timeout:20000});
  await page.waitForFunction(() => window.__bl?.mode === 'title', {timeout:15000});
  await page.evaluate(() => {
    const el=document.getElementById('title');
    const r=el.getBoundingClientRect();
    const x=r.left+r.width/2, y=r.top+r.height*0.82;
    const ev=t=>(el.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:1,pointerType:'touch',clientX:x,clientY:y,buttons:t==='pointerup'?0:1})));
    ev('pointerdown'); ev('pointerup');
  });
  await sleep(400);
  await page.waitForFunction(() => window.__bl?.mode === 'play' && !window.__bl.snap()?.drawing, {timeout:8000});
}
async function play(page, seconds, check, onGod) {
  const end=Date.now()+seconds*1000;
  while (Date.now()<end) {
    const s=await snap(page); if(!s) break;
    const l=pick(s);
    if (l) {
      if (s.godMode) { onGod?.(); await touchStroke(page,l,2.25,false); const s2=await snap(page),l2=pick(s2)||l; await touchStroke(page,l2,2.25,true); }
      else await touchStroke(page,l);
      await sleep(90);
    } else await sleep(120);
    await check();
  }
}
function trio(s){ return {x:s.W/2, y:s.H*.52, r:s.R*4.4}; }
function around(c, kind) {
  const {x,y,r} = c;
  if (kind==='triangle') return [{x,y:y-r},{x:x+r*.95,y:y+r*.72},{x:x-r*.95,y:y+r*.72},{x,y:y-r+4}];
  if (kind==='square') return [{x:x-r,y:y-r},{x:x+r,y:y-r},{x:x+r,y:y+r},{x:x-r,y:y+r},{x:x-r,y:y-r+4}];
  if (kind==='blob') {
    const pts=[];
    for (let i=0;i<=28;i++){
      const a=-Math.PI/2+i/28*Math.PI*1.92, wob=1+0.22*Math.sin(i*2.15)+0.12*Math.cos(i*3.4);
      pts.push({x:x+Math.cos(a)*r*wob,y:y+Math.sin(a)*r*wob});
    }
    return pts;
  }
  if (kind==='eight') {
    // square around the trio, then cut back across the bottom edge so the stroke self-intersects
    return [
      {x, y:y+r},
      {x:x-r, y:y+r},
      {x:x-r, y:y-r},
      {x:x+r, y:y-r},
      {x:x+r, y:y+r},
      {x:x-r*0.25, y:y+r}
    ];
  }
  return [];
}

test('mobile scripted play earns and chains three God modes', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); let urls=0; page.on('framenavigated',()=>urls++);
  await start(page); let gods=0;
  await play(page, 95, async()=>{assertCaps(await qa(page)); expect(errors).toEqual([]); expect(urls).toBe(1)},()=>gods++);
  const s=await snap(page); expect(s.loops).toBeGreaterThanOrEqual(15); expect(gods).toBeGreaterThanOrEqual(3); expect(errors).toEqual([]); expect(urls).toBe(1);
});

test('triangle, square, blob, and figure-8 all capture enclosed orbs', async ({ page }) => {
  test.setTimeout(120000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  let s=await snap(page);
  expect(s.orbs.length).toBe(3);
  const results={};
  for (const kind of ['triangle','square','blob','eight']) {
    // fresh page each shape so the tutorial trio is present
    if (kind!=='triangle') { await start(page); s=await snap(page); }
    const before=s.loops||0;
    await strokePath(page, around(trio(s), kind), {nearStart: kind!=='eight'});
    s=await snap(page);
    results[kind]={loops:s.loops, firstDone:s.firstDone, score:s.score};
    expect(s.firstDone || s.loops>before, kind+' should capture the trio').toBeTruthy();
    expect(s.loops).toBeGreaterThan(before);
    assertCaps(await qa(page));
  }
  expect(errors, JSON.stringify(results)).toEqual([]);
});

test('three minute bounded-graph soak', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); let urls=0; page.on('framenavigated',()=>urls++);
  await start(page); const end=Date.now()+180000; while(Date.now()<end){ await play(page, 2.4, async()=>{}); assertCaps(await qa(page)); expect(errors).toEqual([]); expect(urls).toBe(1); }
  expect(errors).toEqual([]); expect(urls).toBe(1);
});

test('locker cached unlock reloads directly to the game', async ({ page }) => {
  test.skip(!process.env.LOCKER_URL, 'set LOCKER_URL for the encrypted locker test');
  await page.goto(process.env.LOCKER_URL);
  if (await page.locator('#pw').count()) {
    test.skip(!process.env.BLOOMLOOP_PASSWORD, 'set BLOOMLOOP_PASSWORD for locker unlock');
    await page.locator('#pw').fill(process.env.BLOOMLOOP_PASSWORD);
    await page.locator('#go').click();
    await expect(page.locator('canvas')).toHaveCount(1, {timeout:30000});
  }
  await page.reload();
  await expect(page.locator('canvas')).toHaveCount(1, {timeout:30000});
});
