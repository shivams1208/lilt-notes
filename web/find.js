import {Extension} from '@tiptap/core';
import {Plugin,PluginKey} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';

const searchKey=new PluginKey('liltSearch');
export const SearchHighlights=Extension.create({
  name:'searchHighlights',
  addProseMirrorPlugins(){return [new Plugin({
    key:searchKey,
    state:{
      init:()=>DecorationSet.empty,
      apply(tr,old){
        const value=tr.getMeta(searchKey);
        if(value)return DecorationSet.create(tr.doc,value.matches.map((m,i)=>Decoration.inline(m.from,m.to,{class:i===value.active?'search-match search-match-active':'search-match'})));
        return old.map(tr.mapping,tr.doc);
      },
    },
    props:{decorations:state=>searchKey.getState(state)},
  })];},
});

export function literalMatches(text,query,{caseSensitive=false,wholeWord=false}={}){
  if(!query)return [];
  const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const regex=new RegExp(escaped,caseSensitive?'gu':'giu');
  const isWord=char=>!!char&&/[\p{L}\p{N}_]/u.test(char);
  return [...text.matchAll(regex)].filter(m=>!wholeWord||(!isWord([...text.slice(0,m.index)].at(-1))&&!isWord([...text.slice(m.index+m[0].length)][0]))).map(m=>({from:m.index,to:m.index+m[0].length}));
}

export function findText(editor,query,options={}){
  const matches=[];
  editor.state.doc.descendants((node,pos)=>{
    if(!node.isTextblock)return;
    // Mark boundaries do not break a visible word or phrase. Inline atoms do.
    const text=node.textBetween(0,node.content.size,'','\ufffc');
    for(const match of literalMatches(text,query,options))matches.push({from:pos+1+match.from,to:pos+1+match.to});
    return false;
  });
  return matches;
}

export function highlightMatches(editor,matches,active=-1){
  editor.view.dispatch(editor.state.tr.setMeta(searchKey,{matches,active}).setMeta('addToHistory',false));
}

export function replaceMatches(editor,matches,replacement){
  if(!matches.length)return false;
  let tr=editor.state.tr;
  for(const match of [...matches].sort((a,b)=>b.from-a.from))tr=tr.insertText(replacement,match.from,match.to);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
