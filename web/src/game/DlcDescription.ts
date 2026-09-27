export type TextRun = {text:string;bold:boolean;italic:boolean};
export type DescriptionBlock = {text?: string; runs?:TextRun[]; image?: string; alt?: string; heading?: number; quote?: boolean; rule?: boolean; align?:string; border?:boolean};

/** Only package-relative resources: no remote URLs, traversal or executable content. */
export function packageResource(base: string, path: string): string | null {
  try {
    const decoded = decodeURIComponent(path);
    if (!decoded || /[:\\?#]/.test(decoded) || decoded.startsWith('/') || decoded.split('/').includes('..')) return null;
    const root = new URL(base), url = new URL(path, root);
    return url.origin === root.origin && url.pathname.startsWith(root.pathname) ? url.href : null;
  } catch { return null; }
}

export function descriptionBlocks(raw: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[]=[];
  // Template content is inert and is never attached to the document. Only
  // allowlisted presentation data is copied to the canvas renderer.
  const template=document.createElement('template');template.innerHTML=raw.slice(0,100000);
  let current:DescriptionBlock={runs:[]};
  const flush=()=>{if(current.runs?.some(r=>r.text.trim()))blocks.push({...current,text:current.runs.map(r=>r.text).join('')});current={runs:[]};};
  const walk=(node:Node,bold=false,italic=false,depth=0)=>{
    if(depth>32||blocks.length>=100)return;
    if(node.nodeType===3){current.runs!.push({text:(node.textContent??'').replace(/\s+/g,' '),bold,italic});return;}
    if(node.nodeType!==1)return;
    const el=node as HTMLElement,tag=el.tagName.toLowerCase();
    if(['script','style','iframe','object','embed','svg','math','link','meta','base','form','input','button','video','audio'].includes(tag))return;
    if(tag==='img'){flush();blocks.push({image:el.getAttribute('src')??'',alt:el.getAttribute('alt')??''});return;}
    if(tag==='hr'){flush();blocks.push({rule:true});return;}
    if(tag==='br'){current.runs!.push({text:'\n',bold,italic});return;}
    const block=/^(h[1-6]|p|div|section|article|blockquote|li|ul|ol|figure|figcaption)$/.test(tag);
    if(block){
      flush();current={runs:[],heading:/^h[1-6]$/.test(tag)?Number(tag[1]):undefined,quote:tag==='blockquote',align:el.style.textAlign||el.getAttribute('align')||'left',border:!!el.style.border};
      if(tag==='li'){const parent=el.parentElement;const marker=parent?.tagName==='OL'?`${Array.from(parent.children).indexOf(el)+1}. `:'• ';current.runs!.push({text:marker,bold:false,italic:false});}
    }
    for(const child of Array.from(el.childNodes))walk(child,bold||tag==='b'||tag==='strong',italic||tag==='i'||tag==='em',depth+1);
    if(block)flush();
  };
  for(const child of Array.from(template.content.childNodes))walk(child);
  flush();
  return blocks;
}

/** Package filename codes for every entry in gamedata.languages (including unfinished languages).
 * Short codes are a web mod convention, not an original-game filename standard. */
export const DESCRIPTION_LANGUAGES: Readonly<Record<number,string>> = {
  1:'EN', 2:'ENG', 3:'ES', 4:'ESL', 5:'FR', 6:'PT', 7:'PTB',
  8:'DE', 9:'IS', 10:'RO', 11:'PL', 12:'TR', 13:'NL', 14:'RU',
  15:'MS', 16:'DA', 17:'FI', 18:'ZHS', 19:'ZHT', 20:'KO', 21:'EL',
  22:'NO', 23:'LT', 24:'SV', 25:'LV', 26:'LA', 27:'VI', 28:'TL',
  29:'EO', 30:'JA', 31:'IT', 32:'ID', 33:'HU', 34:'ET', 35:'SR',
  36:'HR', 37:'SGL', 38:'PIR', 39:'LET', 40:'SWG',
  41:'HBR', 42:'EU', 43:'CA', 44:'TH', 45:'CS',
};

export function descriptionFiles(language:number, explicit?:string):string[] {
  if(explicit)return /\.html$/i.test(explicit)?[explicit]:[];
  const locale=DESCRIPTION_LANGUAGES[language]??'EN';
  return [`description.${locale}.html`,'description.html'];
}

export function descriptionImageSize(width: number, height: number) {
  const scale = Math.min(1, 258 / Math.max(width, 1), 160 / Math.max(height, 1));
  return {width: width * scale, height: height * scale};
}
