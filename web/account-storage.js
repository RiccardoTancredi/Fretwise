/* Each page keeps one account's local state. Never adopt unowned legacy saves. */
(function(){
'use strict';
window.FretwiseAccountStorage={create(uid,backend){
  const prefix='fretwise.account.'+(uid?'user:'+encodeURIComponent(uid):'guest')+':';
  const memory=new Map();
  let active=true;
  return {
    getItem(key){
      if(!active) return null;
      const k=prefix+key;
      if(memory.has(k)) return memory.get(k);
      try{ return backend.getItem(k); }catch(e){ return null; }
    },
    setItem(key,value){
      if(!active) return;
      const k=prefix+key, v=String(value); memory.set(k,v);
      try{ backend.setItem(k,v); }catch(e){}
    },
    removeItem(key){
      if(!active) return;
      const k=prefix+key; memory.set(k,null);
      try{ backend.removeItem(k); }catch(e){}
    },
    deactivate(){ active=false; memory.clear(); }
  };
}};
})();
