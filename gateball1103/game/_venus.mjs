import { loadRaw } from './rawdata.mjs';
import { loadCore, GameData, Duel, M, L } from './src/engine.js';
const raw=loadRaw(), data=new GameData(raw), lib=await loadCore();
const VENUS=64734921;
let cases=0, missing=0, seqMismatch=0, other={};
for (let s=1; s<=300; s++){
  for (const humanTeam of [0,1]) {
    const decks = humanTeam===0 ? ['agent','rabbit'] : ['rabbit','agent'];
    const ai = humanTeam===0 ? [false,true] : [true,false];
    const d=new Duel(lib,data,{decks,ai,names:['A','B'],seed:[String(s),'5','6','7']});
    d.start();
    let st, n=0;
    while((st=d.advance())!=='end' && n++<400){
      if (st==='ai'){ d.aiAct(); continue; }
      const r=d.req;
      if (r.type===M.SELECT_IDLECMD && d.turnPlayer===humanTeam){
        const hand=d.field()[humanTeam].hand;
        const idx=hand.findIndex(q=>q.code===VENUS);
        if (idx>=0){
          cases++;
          const inSum=r.summons.some(c=>c.code===VENUS);
          if(!inSum){ missing++; const k=`turn${d.turn} ph${d.phase} mz=${d.field()[humanTeam].mz.filter(Boolean).length} log=${d.log.slice(-4).map(x=>x.s).join(' / ')}`; if(missing<6) console.log('MISSING', k, 'summons', r.summons.map(c=>data.name(c.code))); }
          // UI matching: sequence equals hand index?
          r.summons.filter(c=>c.code===VENUS).forEach(c=>{ if(hand[c.sequence]?.code!==VENUS) seqMismatch++; });
        }
        break;
      }
      // human non-idle requests: answer with fallback
      d.respond((await import('./src/engine.js')).fallback(r));
    }
    d.destroy();
  }
}
console.log({cases, missing, seqMismatch});
