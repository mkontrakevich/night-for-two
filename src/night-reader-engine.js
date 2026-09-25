export const NIGHT_READER_VERSION=1;
export const NIGHT_EPISODE_MIN_PAGES=10;
export const NIGHT_EPISODE_MAX_PAGES=20;
export const NIGHT_PAGE_TARGET_WORDS=Object.freeze({min:130,target:170,max:220});
export const NIGHT_READER_MEDIA_KINDS=Object.freeze(['image','video']);

const clean=(v='',n=12000)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n);
const cleanProse=(v='',n=12000)=>String(v||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,n);
const wordCount=v=>clean(v,50000).split(/\s+/).filter(Boolean).length;

export function normalizeReaderPage(input={},index=0){
  const kind=['prose','scene_preview','transition'].includes(String(input.kind))?String(input.kind):'prose';
  const text=cleanProse(input.text,12000);
  if(!text)throw new Error('NIGHT_READER_PAGE_TEXT_REQUIRED');
  const media=input.media&&typeof input.media==='object'?{
    kind:NIGHT_READER_MEDIA_KINDS.includes(String(input.media.kind))?String(input.media.kind):'image',
    prompt:clean(input.media.prompt,900),
    asset_url:clean(input.media.asset_url,1200),
    poster_url:clean(input.media.poster_url,1200),
    status:['planned','generating','ready','failed'].includes(String(input.media.status))?String(input.media.status):'planned'
  }:null;
  return {
    id:clean(input.id||`page_${index+1}`,90),
    kind,
    title:clean(input.title,180),
    text,
    word_count:wordCount(text),
    media,
    interaction_anchor:clean(input.interaction_anchor,90)||null,
    scene_id:clean(input.scene_id,90)||null
  };
}

export function buildEpisodeReader({episodeId='',title='',pages=[],prologue=null,epilogue=null,targetPages=14}={}){
  const normalized=(Array.isArray(pages)?pages:[]).map(normalizeReaderPage);
  if(normalized.length<NIGHT_EPISODE_MIN_PAGES||normalized.length>NIGHT_EPISODE_MAX_PAGES)throw new Error('NIGHT_READER_EPISODE_PAGE_COUNT_INVALID');
  const target=Math.max(NIGHT_EPISODE_MIN_PAGES,Math.min(NIGHT_EPISODE_MAX_PAGES,Number(targetPages)||14));
  return {
    version:NIGHT_READER_VERSION,
    episode_id:clean(episodeId,100),
    title:clean(title,180),
    target_pages:target,
    page_count:normalized.length,
    pages:normalized,
    prologue:prologue?normalizeReaderPage({...prologue,id:prologue.id||'prologue'},-1):null,
    epilogue:epilogue?normalizeReaderPage({...epilogue,id:epilogue.id||'epilogue'},normalized.length):null,
    progress:{male_player:0,female_player:0}
  };
}

export function readerPage(reader={},index=0){
  const pages=Array.isArray(reader.pages)?reader.pages:[];
  if(!pages.length)return null;
  return pages[Math.max(0,Math.min(pages.length-1,Number(index)||0))]||null;
}

export function setReaderProgress(reader={},actor='',index=0){
  if(!['male_player','female_player'].includes(String(actor)))throw new Error('NIGHT_READER_ACTOR_INVALID');
  const max=Math.max(0,(Array.isArray(reader.pages)?reader.pages.length:1)-1);
  const next=Math.max(0,Math.min(max,Number(index)||0));
  return {...reader,progress:{...(reader.progress||{}),[actor]:next}};
}

export function readerGateState(reader={},actor='male_player'){
  const index=Number(reader?.progress?.[actor])||0;
  const page=readerPage(reader,index);
  return {
    index,
    page,
    blocked:Boolean(page?.interaction_anchor),
    interaction_anchor:page?.interaction_anchor||null,
    can_prev:index>0,
    can_next:index<Math.max(0,(reader?.pages?.length||0)-1)&&!page?.interaction_anchor
  };
}

export function episodePageBudget({completedPages=0,targetPages=14,remainingBeats=1}={}){
  const target=Math.max(NIGHT_EPISODE_MIN_PAGES,Math.min(NIGHT_EPISODE_MAX_PAGES,Number(targetPages)||14));
  const completed=Math.max(0,Number(completedPages)||0);
  const remaining=Math.max(0,target-completed);
  const beats=Math.max(1,Number(remainingBeats)||1);
  return {
    target,
    completed,
    remaining,
    recommended_next:Math.max(1,Math.min(6,Math.ceil(remaining/beats)))
  };
}

export function readerGenerationContract({targetPages=14,completedPages=0,remainingBeats=3}={}){
  const budget=episodePageBudget({targetPages,completedPages,remainingBeats});
  return {
    episode_pages_min:NIGHT_EPISODE_MIN_PAGES,
    episode_pages_max:NIGHT_EPISODE_MAX_PAGES,
    target_pages:budget.target,
    completed_pages:budget.completed,
    remaining_pages:budget.remaining,
    next_segment_pages:budget.recommended_next,
    page_words:NIGHT_PAGE_TARGET_WORDS,
    note:'Пролог и эпилог не входят в page_count основного эпизода. Интерактивные точки встраиваются между литературными страницами и могут блокировать перелистывание вперёд до решения.'
  };
}
