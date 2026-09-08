export function emojiQuery(editor){
 const {$from,empty}=editor.state.selection;
 if(!empty||!$from.parent.isTextblock||editor.isActive('codeBlock')||editor.isActive('code'))return null;
 const before=$from.parent.textBetween(0,$from.parentOffset,'\ufffc','\ufffc');
 const match=before.match(/(?:^|\s):([\p{L}\p{N}_+-]{0,36})$/u);
 return match?{from:$from.pos-match[1].length-1,to:$from.pos,query:match[1]}:null;
}

export class InlineEmojiPicker {
 constructor(editor,catalog){
  this.editor=editor;this.catalog=catalog;this.selected=0;this.dismissedStart=null;
  this.element=document.createElement('div');this.element.id='inline-emoji';this.element.hidden=true;this.element.setAttribute('role','listbox');this.element.setAttribute('aria-label','Emoji suggestions');document.body.append(this.element);this.list=document.createElement('div');this.list.className='emoji-options';this.element.append(this.list);
  this.element.addEventListener('mousedown',e=>e.preventDefault());
  this.element.addEventListener('click',e=>{const option=e.target.closest('[data-emoji-index]');if(option)this.choose(Number(option.dataset.emojiIndex));});
  this.element.addEventListener('mousemove',e=>{const option=e.target.closest('[data-emoji-index]');if(option){this.selected=Number(option.dataset.emojiIndex);this.highlight();}});
 }
 update(){
  const range=emojiQuery(this.editor);
  if(!range){this.dismissedStart=null;this.close();return;}
  if(range.from===this.dismissedStart)return;
  if(range.from!==this.range?.from||range.query!==this.range?.query)this.selected=0;
  this.range=range;
  const terms=range.query.toLocaleLowerCase().replaceAll('_',' ').split(/\s+/).filter(Boolean);
  this.matches=this.catalog.filter(entry=>terms.every(term=>entry[1].toLocaleLowerCase().includes(term))).slice(0,40);
  if(!this.matches.length){this.close();return;}
  this.list.replaceChildren();
  this.matches.forEach(([emoji,label],index)=>{const button=document.createElement('button');button.type='button';button.tabIndex=-1;button.id='emoji-option-'+index;button.dataset.emojiIndex=index;button.setAttribute('role','option');const symbol=document.createElement('span');symbol.className='emoji-symbol';symbol.textContent=emoji;const name=document.createElement('span');name.className='emoji-name';name.textContent=label;button.append(symbol,name);this.list.append(button);});
  this.element.hidden=false;this.editor.view.dom.setAttribute('aria-controls',this.element.id);this.highlight();this.position();
 }
 position(){
  if(this.element.hidden||!this.range)return;
  let rect;try{rect=this.editor.view.coordsAtPos(this.range.to);}catch{return;}
  const width=Math.min(288,window.innerWidth-24),below=window.innerHeight-rect.bottom-12,above=rect.top-12;
  const useBelow=below>=Math.min(240,above),available=Math.max(56,useBelow?below:above);
  this.element.style.width=width+'px';this.element.style.maxHeight=Math.min(272,available)+'px';
  this.element.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px';
  this.element.style.top=(useBelow?rect.bottom+6:Math.max(8,rect.top-this.element.offsetHeight-6))+'px';
 }
 highlight(){
  this.element.querySelectorAll('[data-emoji-index]').forEach((el,i)=>el.setAttribute('aria-selected',String(i===this.selected)));
  this.editor.view.dom.setAttribute('aria-activedescendant','emoji-option-'+this.selected);
 }
 handleKey(event){
  if(this.element.hidden||event.isComposing||event.metaKey||event.ctrlKey||event.altKey)return false;
  if(!['Escape','ArrowDown','ArrowUp','Enter','Tab'].includes(event.key))return false;
  event.preventDefault();event.stopPropagation();
  if(event.key==='Escape')this.close(true);
  else if(event.key==='Enter'||event.key==='Tab')this.choose(this.selected);
  else{this.selected=(this.selected+(event.key==='ArrowDown'?1:-1)+this.matches.length)%this.matches.length;this.highlight();this.list.children[this.selected]?.scrollIntoView({block:'nearest'});}
  return true;
 }
 choose(index){const value=this.matches[index]?.[0],range=this.range;if(!value||!range)return;this.close();this.editor.chain().focus().insertContentAt({from:range.from,to:range.to},{type:'text',text:value}).run();}
 close(dismiss=false){if(dismiss)this.dismissedStart=this.range?.from??null;this.element.hidden=true;this.range=null;this.editor.view.dom.removeAttribute('aria-controls');this.editor.view.dom.removeAttribute('aria-activedescendant');}
}
