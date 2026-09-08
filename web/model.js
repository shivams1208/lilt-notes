export const defaults = {theme:'system',zoom:100,formatbar:false,autoSize:true,alwaysOnTop:true,spellcheck:true,hotkey:'option',syncPath:null};
export const uuid = () => globalThis.crypto.randomUUID();
export function makeNote(markdown='') { const now=Date.now(); return {id:uuid(),markdown,doc:null,title:'Untitled',text:markdown,pinned:false,createdAt:now,updatedAt:now,deletedAt:null}; }
export function isEmptyNote(note) {return !!note && !note.deletedAt && !note.purgedAt && typeof note.markdown==='string' && !note.markdown.trim();}
export function reusableDraft(notes,currentId) {const drafts=notes.filter(n=>isEmptyNote(n)&&!n.pinned);return drafts.find(n=>n.id===currentId)||drafts.sort((a,b)=>b.updatedAt-a.updatedAt)[0];}
export function initialLibrary() {return {version:1,notes:[],currentId:null,settings:{...defaults},snippets:[]};}
export function normalizeLibrary(raw) {if(!raw || raw.version!==1 || !Array.isArray(raw.notes)) throw new Error('This is not a supported Lilt Notes library.'); return {...raw,settings:{...defaults,...raw.settings},snippets:raw.snippets||[],notes:raw.notes.filter(n=>n && typeof n.id==='string' && typeof n.markdown==='string')};}
export function noteTitle(text) {return text.split('\n').map(x=>x.trim()).find(Boolean)?.slice(0,150)||'Untitled';}
export function comparePins(a,b) {
 const pinned=Number(Boolean(b.pinned))-Number(Boolean(a.pinned));
 if(pinned||!a.pinned)return pinned;
 const rank=n=>Number.isFinite(n.pinOrder)?n.pinOrder:Infinity;
 return rank(a)===rank(b)?0:rank(a)<rank(b)?-1:1;
}
export function setPinned(notes,n,pinned) {
 delete n.pinOrder;
 if(pinned){const ranks=notes.filter(other=>other.id!==n.id&&other.pinned&&!other.deletedAt&&!other.purgedAt&&Number.isFinite(other.pinOrder)).map(other=>other.pinOrder);if(ranks.length)n.pinOrder=Math.max(...ranks)+1;}
 n.pinned=pinned;
}
export function sortNotes(notes) {return [...notes].sort((a,b)=>comparePins(a,b)||b.updatedAt-a.updatedAt);}
export function searchNotes(notes,query,deleted=false) {const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return sortNotes(notes.filter(n=>!n.purgedAt && Boolean(n.deletedAt)===deleted && terms.every(t=>(n.title+' '+n.text+' '+n.markdown).toLocaleLowerCase().includes(t))));}
export function countText(text) {return {words:(text.trim().match(/\S+/gu)||[]).length,characters:[...text].length,lines:text ? text.split('\n').length:0};}
export function openedDescription(timestamp,now=Date.now()) {
 const days=Math.max(0,Math.floor((now-(timestamp||now))/86400000));
 if(days===0)return 'Opened today';
 if(days===1)return 'Opened yesterday';
 if(days<7)return `Opened ${days} days ago`;
 if(days<14)return 'Opened last week';
 if(days<30)return `Opened ${Math.floor(days/7)} weeks ago`;
 if(days<60)return 'Opened last month';
 if(days<365)return `Opened ${Math.floor(days/30)} months ago`;
 return `Opened ${new Date(timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`;
}
export function mergeLibraries(local,incoming) { const merged=new Map(local.notes.map(n=>[n.id,n]));for(const note of incoming.notes||[]){const old=merged.get(note.id);if(!old || note.updatedAt>old.updatedAt) merged.set(note.id,note);}return {...local,notes:[...merged.values()]};}
export function expandSnippet(text,date=new Date()) {const iso=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');return text.replaceAll('{date}',date.toLocaleDateString()).replaceAll('{time}',date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})).replaceAll('{iso-date}',iso);}
export function filename(title) {return (title.replace(/[\/:*?"<>|\u0000-\u001f]/g,'-').trim().slice(0,100)||'Untitled');}
