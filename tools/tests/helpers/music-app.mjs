import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../../../src/app.html',import.meta.url),'utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
export async function musicApp({storage}={}){
  const nodes=new Map(), data=storage||new Map(), documentListeners={}; let now=0;
  function node(id){
    if(!nodes.has(id)){
      const n={id,innerHTML:'',textContent:'',className:'',style:{},dataset:{},listeners:{},hidden:false,
        addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);},setAttribute(){},querySelectorAll:()=>[],focus(){},
        parentNode:{clientWidth:900},showModal(){this.open=true;},close(){this.open=false;for(const f of this.listeners.close||[])f();}};
      n.classList={contains:k=>n.className.split(' ').includes(k),add(){},remove(){},toggle(){}};
      n.closest=()=>n; n.getBoundingClientRect=()=>({width:1000,height:400});
      nodes.set(id,n);
    }
    return nodes.get(id);
  }
  const document={getElementById:node,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(type,cb){(documentListeners[type]??=[]).push(cb);},hidden:false};
  const context={document,console,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    navigator:{onLine:false},location:{origin:'http://localhost',pathname:'/',href:'http://localhost/'},
    history:{state:null,pushState(){},replaceState(){}},performance:{now:()=>now},innerWidth:1200,innerHeight:900,
    setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},addEventListener(){},
    matchMedia:()=>({matches:false}),URL,URLSearchParams};
  context.window=context; context.self=context;
  // Execute the actual app and its event handlers, without starting a UI or a cloud session.
  const code=source.slice(0,source.indexOf('\nload(); loadLocalRuns();'))+`
window.musicTest={S,CHORDS,INSTRUMENTS,markers,evalShape,genVoicings,checkChord,onCell,chordRootName,chordNoteName,chordGuide,renderAnswer,renderSettings,sameShape,spellTone,
libraryData,librarySettings,renderLibrary,rememberMusic,rememberExercise,exerciseHistory,openReview,closeReview,stepReview,renderReview,rememberPuzzle,
identifyChord,shapeFingers,openChordExplorer,closeChordExplorer,editExploredFrets,exploreCell,renderChordExplorer,
getExplorer(){return explorer;},load,getCoordState(){return CR;},getPuzzle(){return PZ;},capturePractice,practiceSettingsChanged,storeRound,newRound,nextQuestion,finish,showSummary,startRun,finishRun,questionRange,questionBass,
setRound(results,p='ask'){round={results,counted:false};phase=p;},setPhase(p){phase=p;},finishSession,commitWordAnswer,
getReview(){return review;},getStats(){return statsAll;},getState(){return {Q,phase,round,WP,PS,CS,B,WSN,PSN,runs};},
setPuzzle(p){PZ=p;},setChessView(tab){view='chess';CS.tab=tab;},setCoordsPhase(p){CR.phase=p;},
setWordSession(w,data){WSN=w;WD=data;WS.lang=w.lang;view='words';},answerQuiz,
setPaintSession(p){PSN=p;view='home';},answerPaint,
setInst, setQuestion(q){Q=q;phase='ask';view='app';round={results:[]};S.sound=false;}, resClass, resScore, getRoundResults(){return round.results;},
getQuestion(){return Q;}, disableRendering(){render=()=>{};}};
})();`;
  vm.createContext(context); await vm.runInContext(code,context);
  const app=context.musicTest;
  return {...app,node,storage:data,documentListeners,setTime(t){now=t;},click(id,selector,dataset){
    const target={dataset,closest:s=>s===selector?target:null};
    for(const cb of node(id).listeners.click||[])cb({target});
  },action(act){
    const target={dataset:{act},closest:selector=>selector==='[data-act]'?target:null};
    for(const cb of node('answer').listeners.click||[]) cb({target});
  }};
}
