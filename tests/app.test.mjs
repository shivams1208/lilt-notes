import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8').replace('<script src="bundle.js"></script>','');
const bundle=readFileSync(new URL('../web/bundle.js',import.meta.url),'utf8');
function app(){const dom=new JSDOM(html,{url:'https://local.test/',pretendToBeVisual:true,runScripts:'dangerously'});const w=dom.window,messages=[];w.structuredClone=structuredClone;w.webkit={messageHandlers:{lilt:{postMessage(m){messages.push(m)}}}};w.Range.prototype.getBoundingClientRect=()=>({top:0,left:0,right:0,bottom:0,width:0,height:0});w.Range.prototype.getClientRects=()=>[];w.HTMLElement.prototype.scrollIntoView=()=>{};w.eval(bundle);return {w,messages,close:()=>{w.Lilt.editor.destroy();w.close();}};}
const note=(id,markdown,extra={})=>({id,markdown,doc:null,text:markdown,title:markdown,pinned:false,createdAt:1,updatedAt:1,deletedAt:null,...extra});
const library=(notes,id)=>({version:1,notes,currentId:id,settings:{autoSize:false},snippets:[]});
test('opening and rendering notes preserves edit time while an actual edit updates it',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('old','# Old note',{updatedAt:1000}),note('new','New note',{updatedAt:5000})],'new'));
  assert.equal(a.w.Lilt.state().notes.find(n=>n.id==='new').updatedAt,5000);
  a.w.Lilt.openNote('old');
  assert.equal(a.w.Lilt.state().notes.find(n=>n.id==='old').updatedAt,1000);
  a.w.Lilt.flush();
  assert.equal(a.w.Lilt.state().notes.find(n=>n.id==='old').updatedAt,1000);
  a.w.Lilt.editor.commands.insertContent(' edited');
  assert.ok(a.w.Lilt.state().notes.find(n=>n.id==='old').updatedAt>5000);
 }finally{a.close();}
});
test('keyboard navigation keeps command rows stable through repeated scrolling',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Keep me')],'a'));a.w.Lilt.action('actions');
  const root=a.w.document.querySelector('#results'),input=a.w.document.querySelector('#overlay-search');
  const original=[...root.querySelectorAll('[data-index]')],enabled=original.filter(el=>!el.disabled);
  for(const target of enabled.slice(1)){
   input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
   assert.equal(root.querySelector('.selected'),target);
   assert.deepEqual([...root.querySelectorAll('[data-index]')],original);
  }
  for(let i=0;i<5;i++)input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(root.querySelector('.selected'),enabled.at(-1));
  input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
  assert.equal(root.querySelector('.selected'),enabled.at(-2));
 }finally{a.close();}
});
test('stationary hover after scrolling cannot take selection away from the keyboard',()=>{
 for(const mode of ['actions','browse']){
  const a=app();try{
   a.w.Lilt.init(library(Array.from({length:20},(_,i)=>note('n'+i,'Note '+i)),'n0'));a.w.Lilt.action(mode);
   const root=a.w.document.querySelector('#results'),input=a.w.document.querySelector('#overlay-search');
   const hover=(index,x=100,y=180)=>root.querySelector(`[data-index="${index}"]`).dispatchEvent(new a.w.MouseEvent('mousemove',{clientX:x,clientY:y,bubbles:true}));
   hover(2);
   for(let i=0;i<8;i++)input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
   const selected=root.querySelector('.selected').dataset.index;
   hover(Number(selected)-2); // The list moved underneath an unmoved pointer.
   assert.equal(root.querySelector('.selected').dataset.index,selected,mode);
   root.dispatchEvent(new a.w.Event('scroll'));
   hover(Number(selected)-2);assert.equal(root.querySelector('.selected').dataset.index,selected,mode);
   hover(1,101,180);assert.equal(root.querySelector('.selected').dataset.index,'1',mode);
  }finally{a.close();}
 }
});
test('keyboard selection survives the first stationary hover event after opening the app',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Keep me')],'a'));a.w.Lilt.action('actions');
  const root=a.w.document.querySelector('#results'),input=a.w.document.querySelector('#overlay-search');
  for(let i=0;i<8;i++)input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  const target=root.querySelector('.selected');
  root.querySelector('[data-index="0"]').dispatchEvent(new a.w.MouseEvent('mousemove',{clientX:100,clientY:180,bubbles:true}));
  assert.equal(root.querySelector('.selected'),target);
  root.querySelector('[data-index="1"]').dispatchEvent(new a.w.MouseEvent('mousemove',{clientX:101,clientY:180,bubbles:true}));
  assert.equal(root.querySelector('.selected').dataset.index,'1');
 }finally{a.close();}
});
test('imported pinned order stays identical in Browse Notes and numeric shortcuts after opening and editing',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('original','Original')],'original'));
  a.w.Lilt.importBackup(library([note('first','First',{pinned:true,pinOrder:0,updatedAt:1}),note('second','Second',{pinned:true,pinOrder:1,updatedAt:99}),note('third','Third',{pinned:true,pinOrder:2,updatedAt:999})],'first'));
  const key=value=>a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:value,metaKey:true,bubbles:true}));
  for(const [shortcut,id] of [['3','third'],['2','second'],['1','first']]){key(shortcut);assert.equal(a.w.Lilt.state().currentId,id);a.w.Lilt.editor.commands.insertContent(' edited');a.w.Lilt.action('browse');assert.deepEqual([...a.w.document.querySelectorAll('[data-browse-pin]')].map(el=>el.dataset.browsePin),['first','second','third','original']);a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
  const saved=JSON.parse(a.w.Lilt.flush());a.w.Lilt.init(saved);a.w.Lilt.action('browse');assert.deepEqual([...a.w.document.querySelectorAll('[data-browse-pin]')].map(el=>el.dataset.browsePin),['first','second','third','original']);
 }finally{a.close();}
});
test('manual resizing cancels queued auto-sizing and preserves content and the preference',async()=>{
 const a=app();try{
  const data=library([note('a','# Short note\n\nKeep this text.')],'a');data.settings.autoSize=true;
  a.w.Lilt.init(data);const original=a.w.Lilt.editor.getMarkdown();a.messages.length=0;
  a.w.Lilt.manualResize();a.w.dispatchEvent(new a.w.Event('resize'));
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(a.messages.some(m=>m.type==='resize'),false);
  assert.equal(a.w.Lilt.state().settings.autoSize,false);
  assert.equal(a.w.Lilt.editor.getMarkdown(),original);
  const saved=JSON.parse(a.w.Lilt.flush());assert.equal(saved.settings.autoSize,false);
  a.w.Lilt.init(saved);a.messages.length=0;a.w.dispatchEvent(new a.w.Event('resize'));
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(a.messages.some(m=>m.type==='resize'),false);
  a.w.Lilt.action('autoSize');await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(a.w.Lilt.state().settings.autoSize,true);
  assert.ok(a.messages.some(m=>m.type==='resize'));
 }finally{a.close();}
});
test('Command P and K suppress queued resize requests and closing menus does not request resizing',async()=>{
 const a=app();try{
  const data=library([note('a','Short note')],'a');data.settings.autoSize=true;a.w.Lilt.init(data);
  await new Promise(resolve=>setTimeout(resolve,40));const original=a.w.Lilt.editor.getMarkdown();
  for(const [key,mode] of [['p','browse'],['k','actions'],['p','browse'],['k','actions']]){
   a.messages.length=0;a.w.dispatchEvent(new a.w.Event('resize'));
   a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown',{key,metaKey:true,bubbles:true}));
   assert.equal(a.w.document.querySelector('#overlay').dataset.mode,mode);
   await new Promise(resolve=>setTimeout(resolve,30));
   a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   await new Promise(resolve=>setTimeout(resolve,30));
   assert.equal(a.w.document.querySelector('#overlay').hidden,true);
   assert.equal(a.messages.some(m=>m.type==='resize'),false);
   assert.equal(a.w.Lilt.state().settings.autoSize,true);
   assert.equal(a.w.Lilt.editor.getMarkdown(),original);
  }
 }finally{a.close();}
});
test('cold startup preserves last-opened note and formats it',()=>{const a=app();try{a.w.Lilt.init(library([note('a','# Keep me\n\nDo not overwrite.')],'a'));assert.match(a.w.Lilt.editor.getText(),/Do not overwrite/);assert.match(a.w.Lilt.state().notes[0].markdown,/Keep me/);assert.match(a.w.Lilt.editor.getHTML(),/<h1>/);}finally{a.close();}});
test('switching notes cannot undo into a different document',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Alpha'),note('b','Bravo')],'a'));a.w.Lilt.editor.commands.insertContent(' edit');a.w.Lilt.openNote('b');a.w.Lilt.editor.commands.undo();assert.equal(a.w.Lilt.editor.getText(),'Bravo');a.w.Lilt.openNote('a');assert.match(a.w.Lilt.editor.getText(),/edit/);}finally{a.close();}});
test('new note, trash, and restore retain all note data',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Keep this')],'a'));a.w.Lilt.action('new');a.w.Lilt.editor.commands.insertContent('Second');a.w.Lilt.action('trash');assert.equal(a.w.Lilt.state().notes.filter(n=>n.deletedAt).length,1);assert.equal(a.w.Lilt.editor.getText(),'Keep this');a.w.Lilt.action('actions');const input=a.w.document.querySelector('#overlay-search');input.value='Recently Deleted';input.dispatchEvent(new a.w.Event('input'));a.w.document.querySelector('[data-index="0"]').click();a.w.document.querySelector('[data-index="0"]').click();a.w.document.querySelector('#restore-note').click();assert.equal(a.w.Lilt.editor.getText(),'Second');assert.equal(a.w.Lilt.state().notes.filter(n=>n.deletedAt).length,0);}finally{a.close();}});
test('source editing persists and returns to formatted editing',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Original')],'a'));a.w.Lilt.action('source');const source=a.w.document.querySelector('#source');source.value='# Changed\n\n**Important**';source.dispatchEvent(new a.w.Event('input'));a.w.Lilt.action('source');assert.match(a.w.Lilt.editor.getHTML(),/<h1>Changed/);assert.match(a.w.Lilt.editor.getHTML(),/<strong>Important/);assert.match(JSON.parse(a.w.Lilt.flush()).notes[0].markdown,/Changed/);}finally{a.close();}});
test('search action opens the chosen note and persists selection',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Apples'),note('b','Bananas')],'a'));a.w.Lilt.action('browse');const input=a.w.document.querySelector('#overlay-search');input.value='bananas';input.dispatchEvent(new a.w.Event('input'));a.w.document.querySelector('[data-index="0"]').click();assert.equal(a.w.Lilt.state().currentId,'b');assert.equal(a.w.Lilt.editor.getText(),'Bananas');}finally{a.close();}});
test('remote newer notes merge without losing local newer notes',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Local',{updatedAt:10})],'a'));a.w.Lilt.merge(library([note('b','Remote',{updatedAt:20})],'b'));assert.equal(a.w.Lilt.state().notes.length,2);assert.match(a.w.Lilt.editor.getText(),/Local/);}finally{a.close();}});
test('task nodeview has layout class and checkbox wiring',()=>{const a=app();try{a.w.Lilt.init(library([note('a','- [ ] Task')],'a'));const item=a.w.document.querySelector('li[data-type="taskItem"]');assert.ok(item);const checkbox=item.querySelector('input');checkbox.click();assert.equal(a.w.Lilt.editor.getJSON().content[0].content[0].attrs.checked,true);}finally{a.close();}});
test('HTML export while editing source contains the latest source changes',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Original')],'a'));a.w.Lilt.action('source');const source=a.w.document.querySelector('#source');source.value='# Latest';source.dispatchEvent(new a.w.Event('input'));a.w.Lilt.action('actions');const input=a.w.document.querySelector('#overlay-search');input.value='Export HTML';input.dispatchEvent(new a.w.Event('input'));a.w.document.querySelector('[data-index="0"]').click();const output=a.messages.findLast(m=>m.type==='export');assert.match(output.content,/<h1>Latest/);assert.doesNotMatch(output.content,/Original/);}finally{a.close();}});
test('imported Markdown immediately updates the visible title',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Original')],'a'));a.w.Lilt.importNotes([{markdown:'# Imported title\n\nBody'}]);assert.equal(a.w.document.querySelector('#note-title').textContent,'Imported title');assert.equal(a.w.Lilt.state().notes.at(-1).title,'Imported title');}finally{a.close();}});

test('command palette toggles, filters, and executes the selected action from the keyboard',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Keep me')],'a'));a.w.Lilt.action('actions');assert.equal(a.w.document.querySelector('#overlay').hidden,false);a.w.Lilt.action('actions');assert.equal(a.w.document.querySelector('#overlay').hidden,true);a.w.Lilt.action('actions');const input=a.w.document.querySelector('#overlay-search');input.value='Duplicate Note';input.dispatchEvent(new a.w.Event('input'));assert.equal(a.w.document.querySelectorAll('[data-index]').length,1);input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(a.w.Lilt.state().notes.length,2);assert.equal(a.w.Lilt.editor.getText(),'Keep me');assert.equal(a.w.document.querySelector('#overlay').hidden,true);}finally{a.close();}});

test('command submenu returns to its parent without changing the note',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Keep me')],'a'));a.w.Lilt.action('actions');[...a.w.document.querySelectorAll('[data-index]')].find(el=>el.querySelector('.name')?.textContent==='Format…').click();assert.ok(a.w.document.querySelector('#results').textContent.includes('Heading…'));a.w.document.querySelector('#overlay-search').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(a.w.document.querySelector('#overlay').hidden,false);assert.ok(a.w.document.querySelector('#results').textContent.includes('Browse Notes'));assert.equal(a.w.Lilt.editor.getText(),'Keep me');}finally{a.close();}});

test('find and replace keeps the note visible and replaces all matches',()=>{const a=app();try{a.w.Lilt.init(library([note('a','A **bold** phrase and a bold phrase.')],'a'));a.w.Lilt.action('replace');assert.equal(a.w.document.querySelector('#overlay').hidden,true);assert.equal(a.w.document.querySelector('#findbar').hidden,false);const input=a.w.document.querySelector('#find-input');input.value='bold phrase';input.dispatchEvent(new a.w.Event('input'));assert.equal(a.w.document.querySelector('#find-count').textContent,'1 of 2');a.w.document.querySelector('#replace-input').value='clear text';a.w.document.querySelector('#replace-all').click();assert.equal(a.w.Lilt.editor.getText(),'A clear text and a clear text.');assert.equal(a.w.document.querySelector('#find-count').textContent,'No matches');}finally{a.close();}});
test('grouped formatting keeps selection, applies a heading and dismisses with Escape',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Heading text')],'a'));a.w.Lilt.action('formatbar');a.w.document.querySelector('[data-format-group="heading"]').click();a.w.document.querySelector('#format-menu [data-format="heading2"]').click();assert.match(a.w.Lilt.editor.getHTML(),/<h2>Heading text/);assert.equal(a.w.document.querySelector('#format-menu'),null);a.w.document.querySelector('[data-format-group="list"]').click();a.w.document.activeElement.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(a.w.document.querySelector('#format-menu'),null);assert.ok(!a.messages.some(m=>m.type==='hide'));}finally{a.close();}});
test('code copy sends only the current code content to the native clipboard',()=>{const a=app();try{a.w.Lilt.init(library([note('a','```js\nconst n = 42;\n```')],'a'));a.w.document.querySelector('.copy-code').click();assert.equal(a.messages.findLast(m=>m.type==='copy').text,'const n = 42;');}finally{a.close();}});
test('typing an emoji query keeps focus in the note and inserts at the cursor',()=>{const a=app();try{a.w.Lilt.init(library([note('a','')],'a'));const e=a.w.Lilt.editor;e.view.dom.focus();e.commands.insertContent('Plan :rocket');const popup=a.w.document.querySelector('#inline-emoji');assert.equal(popup.hidden,false);assert.equal(a.w.document.querySelector('#overlay').hidden,true);assert.equal(a.w.document.activeElement,e.view.dom);assert.match(popup.textContent,/🚀/);e.view.dom.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(e.getText(),'Plan 🚀');assert.equal(popup.hidden,true);assert.equal(a.messages.some(m=>m.type==='overlay'&&m.open),false);}finally{a.close();}});
test('emoji Escape preserves literal text and does not hide Notes or reopen the same query',()=>{const a=app();try{a.w.Lilt.init(library([note('a','')],'a'));const e=a.w.Lilt.editor;e.commands.insertContent(':smile');e.view.dom.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(e.getText(),':smile');e.commands.insertContent('s');assert.equal(a.w.document.querySelector('#inline-emoji').hidden,true);assert.equal(a.messages.some(m=>m.type==='hide'),false);e.commands.insertContent(' :rocket');assert.equal(a.w.document.querySelector('#inline-emoji').hidden,false);}finally{a.close();}});
test('emoji navigation inserts the chosen item and leaves code untouched',()=>{const a=app();try{a.w.Lilt.init(library([note('a','')],'a'));const e=a.w.Lilt.editor;e.commands.insertContent(':');const popup=a.w.document.querySelector('#inline-emoji');e.view.dom.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));const expected=popup.querySelector('[aria-selected="true"] .emoji-symbol').textContent;e.view.dom.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));assert.equal(e.getText(),expected);a.w.Lilt.action('new');e.commands.setCodeBlock();e.commands.insertContent(':rocket');assert.equal(popup.hidden,true);assert.match(e.getText(),/:rocket/);}finally{a.close();}});
test('pinning a search result acts on that note and keeps the current note and search',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Apples'),note('b','Bananas')],'a'));a.w.Lilt.action('browse');let input=a.w.document.querySelector('#overlay-search');input.value='Bananas';input.dispatchEvent(new a.w.Event('input'));input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'.',metaKey:true,bubbles:true}));const state=a.w.Lilt.state();assert.equal(state.notes.find(n=>n.id==='b').pinned,true);assert.equal(state.notes.find(n=>n.id==='a').pinned,false);assert.equal(state.currentId,'a');assert.equal(a.w.document.querySelector('#overlay-search').value,'Bananas');assert.equal(a.w.document.querySelectorAll('[data-index]').length,1);}finally{a.close();}});
test('command keyboard navigation skips disabled actions without executing them',()=>{const a=app();try{a.w.Lilt.init(library([note('a','')],'a'));a.w.Lilt.action('actions');const root=a.w.document.querySelector('#results');assert.equal(root.querySelectorAll('button[disabled]').length,7);assert.match(root.querySelector('.selected').textContent,/Pin Note/);const input=a.w.document.querySelector('#overlay-search');input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.match(root.querySelector('.selected').textContent,/Browse Notes/);input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.match(root.querySelector('.selected').textContent,/Find in Note/);assert.equal(a.w.Lilt.state().notes.length,1);}finally{a.close();}});
test('Copy Note As shortcut opens formats and quicklinks export the current note URL',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Useful note')],'a'));const e=a.w.Lilt.editor;e.view.dom.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'C',metaKey:true,shiftKey:true,bubbles:true}));assert.match(a.w.document.querySelector('#results').textContent,/Copy Note As…Markdown/);a.w.Lilt.action('closeOverlay');a.w.Lilt.action('quicklink');const output=a.messages.findLast(m=>m.type==='export');assert.match(output.filename,/\.inetloc$/);assert.match(output.content,/<string>liltnotes:\/\/note\/a<\/string>/);assert.equal(a.w.Lilt.editor.getText(),'Useful note');}finally{a.close();}});
test('auto-size and format shortcuts change preferences without changing note text',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Keep me')],'a'));const e=a.w.Lilt.editor;e.view.dom.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'?',metaKey:true,shiftKey:true,bubbles:true}));assert.equal(a.w.Lilt.state().settings.autoSize,true);e.view.dom.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'≤',code:'Comma',metaKey:true,altKey:true,bubbles:true}));assert.equal(a.w.Lilt.state().settings.formatbar,true);assert.equal(e.getText(),'Keep me');}finally{a.close();}});
test('counter switches between words and characters and remembers the selection',()=>{const a=app();try{a.w.Lilt.init(library([note('a','One two three')],'a'));a.w.document.querySelector('#stats').click();assert.equal(a.w.document.querySelector('#stats').textContent,'3 words');const saved=a.w.Lilt.state();a.w.Lilt.init(saved);assert.equal(a.w.document.querySelector('#stats').textContent,'3 words');a.w.document.querySelector('#stats').click();assert.equal(a.w.document.querySelector('#stats').textContent,'13 characters');assert.equal(a.w.Lilt.editor.getText(),'One two three');}finally{a.close();}});
test('repeated New Note and Duplicate commands do not accumulate blank notes',()=>{const a=app();try{a.w.Lilt.init(library([note('a','')],'a'));for(let i=0;i<10;i++)a.w.Lilt.action('new');a.w.Lilt.action('duplicate');assert.equal(a.w.Lilt.state().notes.length,1);assert.equal(a.w.Lilt.state().currentId,'a');a.w.Lilt.editor.commands.insertContent('Keep this content');a.w.Lilt.action('new');assert.equal(a.w.Lilt.state().notes.length,2);assert.match(a.w.Lilt.state().notes.find(n=>n.id==='a').markdown,/Keep this content/);}finally{a.close();}});
test('New Note reuses an unpinned draft while preserving pinned and deleted notes',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Original'),note('draft',''),note('pinned','',{pinned:true}),note('deleted','',{deletedAt:2})],'a'));a.w.Lilt.action('new');assert.equal(a.w.Lilt.state().currentId,'draft');assert.equal(a.w.Lilt.state().notes.length,4);a.w.Lilt.editor.commands.insertContent('Written draft');a.w.Lilt.action('new');assert.equal(a.w.Lilt.state().notes.length,5);assert.equal(a.w.Lilt.state().notes.find(n=>n.id==='pinned').pinned,true);assert.equal(a.w.Lilt.state().notes.find(n=>n.id==='deleted').deletedAt,2);assert.match(a.w.Lilt.state().notes.find(n=>n.id==='draft').markdown,/Written draft/);}finally{a.close();}});
test('image-only notes remain meaningful and can be duplicated',()=>{const a=app();try{a.w.Lilt.init(library([note('image','![](data:image/png;base64,aGVsbG8=)')],'image'));a.w.Lilt.action('actions');const create=[...a.w.document.querySelectorAll('[data-index]')].find(el=>el.querySelector('.name')?.textContent==='New Note');assert.equal(create.disabled,false);a.w.Lilt.action('closeOverlay');a.w.Lilt.action('duplicate');assert.equal(a.w.Lilt.state().notes.length,2);assert.match(a.w.Lilt.state().notes[1].markdown,/data:image\/png/);}finally{a.close();}});
test('history does not navigate back into deleted notes or the current note again',()=>{const a=app();try{a.w.Lilt.init(library([note('a','Alpha'),note('b','Bravo')],'a'));a.w.Lilt.openNote('b');a.w.Lilt.openNote('a');a.w.Lilt.action('trash');assert.equal(a.w.Lilt.state().currentId,'b');a.w.Lilt.action('actions');for(const name of ['Go Back','Go Forward']){const row=[...a.w.document.querySelectorAll('[data-index]')].find(el=>el.querySelector('.name')?.textContent===name);assert.equal(row.disabled,true);}assert.equal(a.w.Lilt.editor.getText(),'Bravo');}finally{a.close();}});
test('the application creates and retains more than five meaningful notes without a limit',()=>{const a=app();try{a.w.Lilt.init(library([note('original','Original note')],'original'));for(let i=0;i<25;i++)a.w.Lilt.action('new',{markdown:'# Note '+i+'\n\nBody '+i});const saved=JSON.parse(a.w.Lilt.flush());assert.equal(saved.notes.length,26);assert.equal(new Set(saved.notes.map(n=>n.id)).size,26);assert.match(saved.notes.find(n=>n.id==='original').markdown,/Original note/);for(let i=0;i<25;i++)assert.ok(saved.notes.some(n=>n.title==='Note '+i&&n.markdown.includes('Body '+i)));}finally{a.close();}});

test('browse controls pin and delete the selected result while retaining the current note and search',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Apples'),note('b','Bananas')],'a'));a.w.Lilt.action('browse');
  const input=a.w.document.querySelector('#overlay-search');input.value='Bananas';input.dispatchEvent(new a.w.Event('input'));
  a.w.document.querySelector('[data-browse-pin="b"]').click();
  assert.equal(a.w.Lilt.state().notes.find(n=>n.id==='b').pinned,true);
  assert.equal(a.w.Lilt.state().currentId,'a');
  assert.equal(a.w.document.querySelector('#overlay-search').value,'Bananas');
  a.w.document.querySelector('[data-browse-delete="b"]').click();
  assert.ok(a.w.Lilt.state().notes.find(n=>n.id==='b').deletedAt);
  assert.equal(a.w.Lilt.state().currentId,'a');
  assert.equal(a.w.Lilt.editor.getText(),'Apples');
  assert.equal(a.w.document.querySelector('#overlay-search').value,'Bananas');
  assert.match(a.w.document.querySelector('#results').textContent,/No results/);
 }finally{a.close();}
});
test('browse shows current status and character counts and opens results from the keyboard',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Apples'),note('b','Bananas')],'a'));a.w.Lilt.action('browse');
  assert.match(a.w.document.querySelector('.selected').textContent,/Current • 6 characters/);
  const input=a.w.document.querySelector('#overlay-search');input.value='Bananas';input.dispatchEvent(new a.w.Event('input'));
  input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert.equal(a.w.Lilt.state().currentId,'b');assert.equal(a.w.Lilt.editor.getText(),'Bananas');
  assert.ok(a.w.Lilt.state().settings.noteOpenedAt.b>1);
  assert.equal(a.w.document.querySelector('#overlay').hidden,true);
 }finally{a.close();}
});
test('heading submenu returns to formatting and applies the selected heading without losing text',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Keep my text')],'a'));a.w.Lilt.action('formatMenu');
  const choose=name=>[...a.w.document.querySelectorAll('[data-index]')].find(el=>el.querySelector('.name')?.textContent===name).click();
  choose('Heading…');
  a.w.document.querySelector('#overlay-search').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.match(a.w.document.querySelector('#results').textContent,/Inline.*Heading….*Block.*List/s);
  choose('Heading…');choose('Heading 2');
  assert.match(a.w.Lilt.editor.getHTML(),/<h2>Keep my text<\/h2>/);
  assert.equal(a.w.document.querySelector('#overlay').hidden,true);
 }finally{a.close();}
});
test('command search avoids duplicate aliases while retaining additional formatting actions',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Keep my text')],'a'));a.w.Lilt.action('actions');
  const input=a.w.document.querySelector('#overlay-search');input.value='Format';input.dispatchEvent(new a.w.Event('input'));
  assert.deepEqual([...a.w.document.querySelectorAll('.row .name')].map(el=>el.textContent),['Format…','Toggle Format Bar']);
  input.value='Insert Table';input.dispatchEvent(new a.w.Event('input'));
  a.w.document.querySelector('[data-index="0"]').click();assert.match(a.w.Lilt.editor.getHTML(),/<table/);
  assert.match(a.w.Lilt.editor.getText(),/Keep my text/);
 }finally{a.close();}
});
test('saving and normal iCloud sync stay quiet while genuine save failures remain visible',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Keep my text')],'a'));
  const status=a.w.document.querySelector('#save-state');
  a.w.Lilt.editor.commands.insertContent(' edit');
  assert.equal(status.textContent,'');assert.equal(status.classList.contains('visible'),false);
  for(const message of ['Saved to iCloud Drive','Saved on this Mac · iCloud pending','Saved to notes folder']){a.w.Lilt.syncStatus(message);assert.equal(status.textContent,'');assert.equal(status.classList.contains('visible'),false);}
  a.w.Lilt.error('Local save failed');a.w.Lilt.syncStatus('Saved to iCloud Drive');
  assert.equal(status.textContent,'Not saved');assert.equal(status.classList.contains('visible'),true);
  a.w.Lilt.flush();const revision=a.messages.findLast(m=>m.type==='save').revision;
  a.w.Lilt.saved(revision-1);assert.equal(status.textContent,'Not saved');
  a.w.Lilt.saved(revision);assert.equal(status.textContent,'');
  a.w.Lilt.syncStatus('Saved on this Mac; folder unavailable');assert.match(status.textContent,/folder unavailable/);
  a.w.Lilt.syncStatus('Saved to iCloud Drive');assert.equal(status.textContent,'');assert.equal(status.classList.contains('visible'),false);
 }finally{a.close();}
});

function typeEditor(editor,text){
 for(const char of text){const {from,to}=editor.state.selection;const handled=editor.view.someProp('handleTextInput',fn=>fn(editor.view,from,to,char));if(!handled)editor.view.dispatch(editor.state.tr.insertText(char,from,to));}
}
test('snippets can be created, searched, edited, inserted and deleted without changing existing note text',()=>{
 const a=app();try{
  const d=a.w.document;a.w.Lilt.init(library([note('a','Keep this')],'a'));
  a.w.Lilt.action('snippets');d.querySelector('#add-snippet').click();
  d.querySelector('#snippet-name').value='Meeting';d.querySelector('#snippet-keyword').value='!meet';d.querySelector('#snippet-text').value='\n\n## Agenda\n\n{cursor}Next steps';d.querySelector('#save-snippet').click();
  assert.equal(a.w.Lilt.state().snippets.length,1);assert.equal(a.w.Lilt.editor.getText(),'Keep this');
  const query=d.querySelector('#overlay-search');query.value='!meet';query.dispatchEvent(new a.w.Event('input'));
  assert.equal(d.querySelectorAll('[data-index]').length,1);d.querySelector('[data-snippet-edit]').click();
  assert.equal(d.querySelector('#snippet-name').value,'Meeting');d.querySelector('#snippet-name').value='Planning';d.querySelector('#save-snippet').click();
  assert.equal(d.querySelector('#overlay-search').value,'!meet');assert.equal(a.w.Lilt.state().snippets[0].name,'Planning');
  d.querySelector('.snippet-insert').click();const e=a.w.Lilt.editor;
  assert.match(e.getHTML(),/<h2>Agenda<\/h2>/);assert.match(e.getText(),/Keep this/);assert.doesNotMatch(e.getText(),/LiltCursor|\{cursor\}/);
  typeEditor(e,'Start ');assert.match(e.getText(),/Start Next steps/);
  const saved=JSON.parse(a.w.Lilt.flush());a.w.Lilt.init(saved);assert.equal(a.w.Lilt.state().snippets[0].keyword,'!meet');
  a.w.Lilt.action('snippets');d.querySelector('[data-snippet-edit]').click();d.querySelector('#delete-snippet').click();d.querySelector('#cancel-delete-snippet').click();assert.equal(a.w.Lilt.state().snippets.length,1);
  d.querySelector('#delete-snippet').click();d.querySelector('#confirm-delete-snippet').click();
  assert.equal(a.w.Lilt.state().snippets.length,0);assert.match(e.getText(),/Start Next steps/);
 }finally{a.close();}
});
test('snippet keywords expand at the caret with Markdown and cursor placement, and Undo restores the keyword',()=>{
 const a=app();try{
  const data=library([note('a','Prefix suffix')],'a');data.snippets=[{id:'s',name:'Greeting',keyword:'!hi',text:'**Hello** {cursor}there'}];a.w.Lilt.init(data);
  const e=a.w.Lilt.editor;e.commands.setTextSelection(8);typeEditor(e,'!hi');
  assert.equal(e.getText(),'Prefix Hello theresuffix');assert.match(e.getHTML(),/<strong>Hello<\/strong>/);
  assert.equal(e.state.selection.from,14);e.commands.undo();assert.equal(e.getText(),'Prefix !hisuffix');
  e.commands.redo();typeEditor(e,'friend ');assert.equal(e.getText(),'Prefix Hello friend theresuffix');
 }finally{a.close();}
});
test('keyword expansion respects word boundaries, disabled settings, composing input and literal code',()=>{
 const a=app();try{
  const data=library([note('a','')],'a');data.snippets=[{id:'s',name:'Code',keyword:'!hi',text:'**Hi** {cursor}there'}];a.w.Lilt.init(data);const e=a.w.Lilt.editor;
  typeEditor(e,'word!hi');assert.equal(e.getText(),'word!hi');
  e.commands.setContent('');e.commands.setCodeBlock();typeEditor(e,'!hi');assert.equal(e.state.doc.firstChild.textContent,'**Hi** there');assert.ok(e.isActive('codeBlock'));assert.doesNotMatch(e.getHTML(),/<strong>/);
  e.commands.setContent('');a.w.Lilt.action('snippets');const toggle=a.w.document.querySelector('#snippet-expansion');toggle.click();a.w.Lilt.action('closeOverlay');typeEditor(e,'!hi');assert.equal(e.getText(),'!hi');
  assert.equal(a.w.Lilt.state().settings.expandSnippetKeywords,false);
  a.w.Lilt.action('snippets');a.w.document.querySelector('#snippet-expansion').click();a.w.Lilt.action('closeOverlay');e.commands.setContent('');e.view.input.composing=true;typeEditor(e,'!hi');e.view.input.composing=false;assert.equal(e.getText(),'!hi');
  e.commands.setContent('!hi');assert.equal(e.getText(),'!hi');
 }finally{a.close();}
});
test('snippet editor rejects duplicate keywords and invalid names or keywords',()=>{
 const a=app();try{
  const data=library([note('a','Keep this')],'a');data.snippets=[{id:'s',name:'Existing',keyword:'!hi',text:'Hello'}];a.w.Lilt.init(data);const d=a.w.document;
  a.w.Lilt.action('snippets');d.querySelector('#add-snippet').click();d.querySelector('#save-snippet').click();assert.match(d.querySelector('#toast').textContent,/name and content/);
  d.querySelector('#snippet-name').value='New';d.querySelector('#snippet-text').value='Second';d.querySelector('#snippet-keyword').value='!hi';d.querySelector('#save-snippet').click();assert.match(d.querySelector('#toast').textContent,/already used/);
  d.querySelector('#snippet-keyword').value='bad keyword';d.querySelector('#save-snippet').click();assert.match(d.querySelector('#toast').textContent,/spaces or quotes/);
  assert.equal(a.w.Lilt.state().snippets.length,1);assert.equal(a.w.Lilt.editor.getText(),'Keep this');
 }finally{a.close();}
});
test('manual snippet insertion also updates Markdown source and preserves its selection',()=>{
 const a=app();try{
  const data=library([note('a','Keep TARGET end')],'a');data.snippets=[{id:'s',name:'Replace',text:'**{cursor}bold**'}];a.w.Lilt.init(data);a.w.Lilt.action('source');
  const d=a.w.document,source=d.querySelector('#source');source.setSelectionRange(5,11);a.w.Lilt.action('snippets');d.querySelector('.snippet-insert').click();
  assert.equal(source.value,'Keep **bold** end');assert.equal(source.selectionStart,7);assert.match(a.w.Lilt.state().notes[0].markdown,/Keep \*\*bold\*\* end/);
  a.w.Lilt.action('source');assert.match(a.w.Lilt.editor.getHTML(),/<strong>bold<\/strong>/);
 }finally{a.close();}
});

test('note shortcut recording commits only after native approval and preserves conflicts',()=>{
 const a=app();try{
  const d=a.w.document;a.w.Lilt.init(library([note('a','Alpha'),note('b','Bravo')],'a'));a.w.Lilt.action('noteShortcut');
  const candidate={keyCode:25,modifiers:6656,label:'⌃ ⌥ ⇧ 9'};
  d.querySelector('#record-note-shortcut').click();const request=a.messages.findLast(m=>m.type==='recordShortcut').requestId;
  a.w.Lilt.shortcutRecorded('stale',candidate);assert.equal(d.querySelector('#save-note-shortcut').disabled,true);
  a.w.Lilt.shortcutRecorded(request,candidate);assert.equal(d.querySelector('#save-note-shortcut').disabled,false);
  d.querySelector('#save-note-shortcut').click();assert.equal(a.messages.findLast(m=>m.type==='setNoteShortcut').noteId,'a');assert.equal(a.w.Lilt.state().settings.noteHotkeys.a,undefined);
  a.w.Lilt.noteShortcutResult('a',null,'Already in use');assert.match(d.querySelector('#shortcut-help').textContent,/Already in use/);assert.equal(a.w.Lilt.state().settings.noteHotkeys.a,undefined);
  a.w.Lilt.noteShortcutResult('a',candidate,null);assert.equal(a.w.Lilt.state().settings.noteHotkeys.a.label,candidate.label);assert.equal(d.querySelector('#overlay').hidden,true);assert.equal(a.w.Lilt.editor.getText(),'Alpha');
  a.w.Lilt.init(JSON.parse(a.w.Lilt.flush()));a.w.Lilt.action('noteShortcut');assert.equal(d.querySelector('#record-note-shortcut').textContent,candidate.label);
  d.querySelector('#remove-note-shortcut').click();assert.equal(a.messages.findLast(m=>m.type==='setNoteShortcut').shortcut,null);
  a.w.Lilt.noteShortcutResult('a',null,null);assert.equal(a.w.Lilt.state().settings.noteHotkeys.a,undefined);
 }finally{a.close();}
});
test('closing the shortcut recorder cancels capture and deleting notes removes only their shortcuts',()=>{
 const a=app();try{
  const data=library([note('a','Alpha'),note('b','Bravo')],'a');data.settings.noteHotkeys={a:{keyCode:25,modifiers:6656,label:'A'},b:{keyCode:26,modifiers:6656,label:'B'},missing:{keyCode:28,modifiers:6656,label:'Missing'}};
  a.w.Lilt.init(data);assert.equal(a.w.Lilt.state().settings.noteHotkeys.missing,undefined);
  a.w.Lilt.action('noteShortcut');a.w.document.querySelector('#record-note-shortcut').click();const request=a.messages.findLast(m=>m.type==='recordShortcut').requestId;a.w.Lilt.action('closeOverlay');
  assert.ok(a.messages.some(m=>m.type==='cancelShortcutRecording'));a.w.Lilt.shortcutRecorded(request,{keyCode:0,modifiers:2048,label:'Ignored'});assert.equal(a.w.Lilt.state().settings.noteHotkeys.a.label,'A');
  a.w.Lilt.action('trash');assert.equal(a.w.Lilt.state().settings.noteHotkeys.a,undefined);assert.equal(a.w.Lilt.state().settings.noteHotkeys.b.label,'B');assert.equal(a.w.Lilt.editor.getText(),'Bravo');
  a.w.Lilt.merge(library([note('b','Bravo',{deletedAt:Date.now(),updatedAt:Date.now()+10000})],'b'));assert.equal(a.w.Lilt.state().settings.noteHotkeys.b,undefined);
 }finally{a.close();}
});

test('writing previews leave notes unchanged until replacement and support undo and redo',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','She go yesterday.')],'a'));const e=a.w.Lilt.editor,d=a.w.document;
  a.w.Lilt.action('writing',{id:'grammar'});const request=a.messages.findLast(m=>m.type==='write');assert.equal(request.text,'She go yesterday.');
  a.w.Lilt.writingProgress(request.id,2,3);assert.match(d.querySelector('#writing-progress').textContent,/2 of 3/);
  a.w.Lilt.writingResult(request.id,'She went yesterday.',null);assert.equal(e.getText(),'She go yesterday.');assert.equal(d.querySelector('#writing-preview').textContent,'She went yesterday.');
  d.querySelector('#copy-writing').click();assert.equal(a.messages.findLast(m=>m.type==='copy').text,'She went yesterday.');assert.equal(e.getText(),'She go yesterday.');
  d.querySelector('#replace-writing').click();assert.equal(e.getText(),'She went yesterday.');assert.equal(e.commands.undo(),true);assert.equal(e.getText(),'She go yesterday.');assert.equal(e.commands.redo(),true);assert.equal(e.getText(),'She went yesterday.');
 }finally{a.close();}
});
test('writing selection replacement preserves surrounding text and heading and is a separate undo step',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','# Prefix bad phrase suffix\n\nKeep **bold**.')],'a'));const e=a.w.Lilt.editor,d=a.w.document;
  e.commands.setTextSelection({from:8,to:18});a.w.Lilt.action('writing',{id:'improve'});const request=a.messages.findLast(m=>m.type==='write');assert.equal(request.text,'bad phrase');
  a.w.Lilt.writingResult(request.id,'better phrase',null);d.querySelector('#replace-writing').click();assert.match(e.getHTML(),/<h1>Prefix better phrase suffix<\/h1>/);assert.match(e.getHTML(),/<strong>bold<\/strong>/);
  e.commands.undo();assert.match(e.getHTML(),/<h1>Prefix bad phrase suffix<\/h1>/);
 }finally{a.close();}
});
test('writing rejects stale results after cancellation, note changes, and switching notes',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Original'),note('b','Other')],'a'));const e=a.w.Lilt.editor,d=a.w.document;
  a.w.Lilt.action('writing',{id:'grammar'});const first=a.messages.findLast(m=>m.type==='write');a.w.Lilt.action('closeOverlay');assert.ok(a.messages.some(m=>m.type==='cancelWriting'&&m.id===first.id));a.w.Lilt.writingResult(first.id,'Ignored',null);assert.equal(d.querySelector('#overlay').hidden,true);
  a.w.Lilt.action('writing',{id:'grammar'});const second=a.messages.findLast(m=>m.type==='write');e.commands.insertContent(' new');a.w.Lilt.writingResult(second.id,'Outdated',null);assert.equal(d.querySelector('#replace-writing').disabled,true);assert.match(d.querySelector('#writing-help').textContent,/note changed/);assert.doesNotMatch(e.getText(),/Outdated/);
  d.querySelector('#retry-writing').click();const third=a.messages.findLast(m=>m.type==='write');assert.equal(third.text,e.getMarkdown());a.w.Lilt.writingResult(second.id,'Stale retry',null);assert.ok(d.querySelector('#writing-progress'));
  a.w.Lilt.openNote('b');a.w.Lilt.writingResult(third.id,'Wrong note',null);assert.equal(e.getText(),'Other');assert.equal(d.querySelector('#overlay').hidden,true);
 }finally{a.close();}
});
test('writing checks again at replacement time and handles model errors without editing',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Original')],'a'));const e=a.w.Lilt.editor,d=a.w.document;
  a.w.Lilt.action('writing',{id:'grammar'});const request=a.messages.findLast(m=>m.type==='write');a.w.Lilt.writingResult(request.id,'Suggestion',null);e.commands.insertContent(' new');d.querySelector('#replace-writing').click();assert.equal(d.querySelector('#replace-writing').disabled,true);assert.doesNotMatch(e.getText(),/Suggestion/);
  d.querySelector('#retry-writing').click();const retry=a.messages.findLast(m=>m.type==='write');a.w.Lilt.writingResult(retry.id,null,'Model unavailable');assert.match(d.querySelector('[role=alert]').textContent,/Model unavailable/);assert.equal(d.querySelector('#replace-writing'),null);assert.doesNotMatch(e.getText(),/Suggestion/);
 }finally{a.close();}
});
test('writing handles Markdown source selections and rejects a changed editing mode',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Keep TARGET end')],'a'));a.w.Lilt.action('source');const d=a.w.document,source=d.querySelector('#source');source.setSelectionRange(5,11);
  a.w.Lilt.action('writing',{id:'grammar'});const request=a.messages.findLast(m=>m.type==='write');assert.equal(request.text,'TARGET');a.w.Lilt.writingResult(request.id,'**better**',null);d.querySelector('#replace-writing').click();assert.equal(source.value,'Keep **better** end');assert.equal(a.w.Lilt.state().notes[0].markdown,'Keep **better** end');
  a.w.Lilt.action('writing',{id:'grammar'});const next=a.messages.findLast(m=>m.type==='write');a.w.Lilt.action('source');a.w.Lilt.writingResult(next.id,'Wrong mode',null);assert.equal(d.querySelector('#replace-writing')?.disabled,true);assert.doesNotMatch(a.w.Lilt.editor.getText(),/Wrong mode/);
 }finally{a.close();}
});
test('writing translation and custom instructions require input and preserve the original selection',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Keep Hello end')],'a'));const e=a.w.Lilt.editor,d=a.w.document;e.commands.setTextSelection({from:6,to:11});a.w.Lilt.action('writing',{id:'translate'});
  d.querySelector('#start-writing').click();assert.equal(a.messages.filter(m=>m.type==='write').length,0);d.querySelector('#writing-instruction').value='Spanish';d.querySelector('#start-writing').click();const request=a.messages.findLast(m=>m.type==='write');assert.equal(request.text,'Hello');assert.match(request.instruction,/Spanish/);
  a.w.Lilt.writingResult(request.id,'Hola',null);d.querySelector('#replace-writing').click();assert.equal(e.getText(),'Keep Hola end');
  a.w.Lilt.action('writing',{id:'custom'});d.querySelector('#writing-instruction').value='Use bullet points';d.querySelector('#start-writing').click();assert.equal(a.messages.findLast(m=>m.type==='write').instruction,'Use bullet points');
 }finally{a.close();}
});
test('writing selections carry inline Markdown and preserve marks when replaced',()=>{
 const a=app();try{
  a.w.Lilt.init(library([note('a','Keep **She go** end')],'a'));const e=a.w.Lilt.editor,d=a.w.document;e.commands.setTextSelection({from:6,to:12});a.w.Lilt.action('writing',{id:'grammar'});const request=a.messages.findLast(m=>m.type==='write');assert.equal(request.text,'**She go**');a.w.Lilt.writingResult(request.id,'**She goes**',null);d.querySelector('#replace-writing').click();assert.match(e.getHTML(),/Keep <strong>She goes<\/strong> end/);e.commands.undo();assert.match(e.getHTML(),/Keep <strong>She go<\/strong> end/);
 }finally{a.close();}
});
test('writing inside a list or quote preserves the surrounding block structure',()=>{
 for(const markdown of ['- Keep She go end\n- Another item','> Keep She go end']){
  const a=app();try{
   a.w.Lilt.init(library([note('a',markdown)],'a'));const e=a.w.Lilt.editor,d=a.w.document;let from;
   e.state.doc.descendants((node,pos)=>{if(node.isText&&node.text.includes('She go'))from=pos+node.text.indexOf('She go');});
   const before=e.getJSON();e.commands.setTextSelection({from,to:from+6});a.w.Lilt.action('writing',{id:'grammar'});const request=a.messages.findLast(m=>m.type==='write');assert.equal(request.text,'She go');a.w.Lilt.writingResult(request.id,'She goes',null);d.querySelector('#replace-writing').click();const after=e.getJSON();assert.deepEqual(JSON.parse(JSON.stringify(after).replace('She goes','She go')),JSON.parse(JSON.stringify(before)));
  }finally{a.close();}
 }
});
