import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../../../src/app.html',import.meta.url),'utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
export async function musicApp(){
  const nodes=new Map(), data=new Map();
  function node(id){
    if(!nodes.has(id)){
      const n={id,innerHTML:'',textContent:'',className:'',style:{},dataset:{},listeners:{},hidden:false,
        addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);},setAttribute(){},querySelectorAll:()=>[],focus(){}};
      n.classList={contains:k=>n.className.split(' ').includes(k),add(){},remove(){},toggle(){}};
      n.closest=()=>n; n.getBoundingClientRect=()=>({width:1000,height:400});
      nodes.set(id,n);
    }
    return nodes.get(id);
  }
  const document={getElementById:node,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},hidden:false};
  const context={document,console,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    navigator:{onLine:false},location:{origin:'http://localhost',pathname:'/',href:'http://localhost/'},
    history:{state:null},performance:{now:()=>0},innerWidth:1200,
    setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},addEventListener(){},
    matchMedia:()=>({matches:false}),URL,URLSearchParams};
  context.window=context; context.self=context;
  // Execute the actual app and its event handlers, without starting a UI or a cloud session.
  const code=source.slice(0,source.indexOf('\nload(); loadLocalRuns();'))+`
window.musicTest={S,CHORDS,INSTRUMENTS,markers,evalShape,genVoicings,checkChord,onCell,chordRootName,chordNoteName,chordGuide,renderAnswer,renderSettings,sameShape,spellTone,
setInst, setQuestion(q){Q=q;phase='ask';view='app';round={results:[]};S.sound=false;},
getQuestion(){return Q;}, disableRendering(){render=()=>{};}};
})();`;
  vm.createContext(context); await vm.runInContext(code,context);
  const app=context.musicTest;
  return {...app,node,action(act){
    const target={dataset:{act},closest:selector=>selector==='[data-act]'?target:null};
    for(const cb of node('answer').listeners.click||[]) cb({target});
  }};
}
