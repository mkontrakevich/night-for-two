import crypto from 'node:crypto';
import {buildCoupleSpaceGeneratorSystemPrompt} from './couple-space-skill.js';

const SCOPE='couple_default';
const SESSION_TTL_MS=15*60*1000;
const DEFAULT_MODEL='bytedance-seed/seedream-4.5';
const DEFAULT_FALLBACK='google/gemini-2.5-flash-image';

export const PAIR_IMAGE_STYLES={
  soft:{label:'Soft / Sensual',camera:'medium-format editorial photography, 80mm lens, f/4',lighting:'large soft directional window-like key light, gentle fill, soft skin transitions, controlled highlights',mood:'quiet warmth, restrained attraction, tactile fabrics, elegant negative space',wardrobe:'refined fashion styling with full coverage, silk, knitwear, tailored layers or premium sleepwear'},
  intimate:{label:'Intimate / Tender',camera:'medium-format portrait photography, 85mm lens, f/2.8',lighting:'soft side key at 45 degrees, subtle warm practical light, delicate rim separation',mood:'trust, closeness, quiet tenderness, natural breathing posture, understated cinematic stillness',wardrobe:'premium covered boudoir styling, soft shirts, robes, layered textiles, elegant nightwear'},
  intense:{label:'Passionate / Intense',camera:'cinematic editorial photography, 50mm lens, f/2.8',lighting:'controlled high-contrast side light with clean rim light, deep but detailed shadows',mood:'strong emotional tension, close physical proximity, dynamic body lines, no explicit sexual action',wardrobe:'dark luxury fashion, tailored black layers, premium body-conscious styling with coverage'},
  boudoir:{label:'Boudoir',camera:'luxury editorial portrait, 85mm lens, f/2',lighting:'soft diffused key through fabric, warm practical ambience, shallow depth of field',mood:'private domestic atmosphere, refined softness, calm confidence, premium magazine finish',wardrobe:'elegant covered boudoir wardrobe, silk robe, camisole, tailored sleepwear, layered bedding and textiles'},
  fashion:{label:'High-fashion',camera:'high-end fashion editorial, medium format, 80mm lens, f/4',lighting:'precise studio key, subtle fill, sculptural rim, clean tonal separation',mood:'luxurious minimalism, graphic body architecture, controlled expression, magazine-grade composition',wardrobe:'couture-inspired full-coverage fashion styling, sculptural silhouettes, premium fabrics and accessories'},
  noir:{label:'Noir',camera:'black-and-white cinematic portrait, 85mm lens, f/2.8',lighting:'single hard side key softened at the edge, deep velvet shadows, narrow rim light, monochrome contrast',mood:'mystery, privacy, restrained tension, film-grain texture, minimal set',wardrobe:'dark covered styling, coat, shirt, dress, robe or layered fabric with strong silhouette'}
};

const schema=`
CREATE TABLE IF NOT EXISTS pair_image_identity_refs(
  scope text NOT NULL DEFAULT 'couple_default',
  subject_role text NOT NULL CHECK(subject_role IN ('owner','partner')),
  telegram_file_id text NOT NULL,
  telegram_file_unique_id text NOT NULL DEFAULT '',
  uploaded_by bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope,subject_role)
);
CREATE TABLE IF NOT EXISTS pair_image_preferences(
  scope text NOT NULL DEFAULT 'couple_default',
  chat_id bigint NOT NULL,
  style_key text NOT NULL DEFAULT 'intimate',
  aspect_ratio text NOT NULL DEFAULT '4:5',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope,chat_id)
);
`;

function html(value=''){return String(value).replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]));}
function safeCode(error){return String(error?.message||error||'UNKNOWN').replace(/[^A-Z0-9_:\-.]/gi,'_').slice(0,140);}
function hash(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function callbackRows(rows){return rows;}
function roleLabel(role){return role==='owner'?'Партнёр A':'Партнёр B';}

export function buildPairImagePrompt({brief='',target='pair',styleKey='intimate'}={}){
  const style=PAIR_IMAGE_STYLES[styleKey]||PAIR_IMAGE_STYLES.intimate;
  const subject=target==='pair'
    ?'two consenting adults from the supplied identity references, photographed together; preserve both identities, facial structure, age, hair, body proportions and natural characteristics'
    :`one consenting adult from the supplied identity reference (${target==='owner'?'male subject':'female subject'}); preserve identity, facial structure, age, hair, body proportions and natural characteristics`;
  return [
    'Create a photorealistic premium editorial photograph.',
    `Primary request: ${String(brief||'').trim().slice(0,1800)}.`,
    `Subject: ${subject}.`,
    `Creative direction: ${style.mood}.`,
    `Wardrobe and styling: ${style.wardrobe}.`,
    `Camera: ${style.camera}; physically plausible perspective, realistic depth compression, sharp focus on the eyes when visible.`,
    `Lighting: ${style.lighting}. Preserve natural skin texture, pores, fine hair, fabric texture and realistic tonal transitions; no plastic skin, no excessive HDR.`,
    'Composition: deliberate editorial framing, clean background hierarchy, natural hands and anatomy, coherent contact shadows, refined color grading, subtle organic film grain.',
    'Identity lock: use each supplied reference only for that person. Do not merge faces, swap facial traits, change age, beautify into a different person, or alter body proportions.',
    'Adult-content boundary for real identities: sensual or intimate editorial mood may be implied, but keep the scene non-explicit and fully covered; no nudity, visible intimate anatomy, explicit sexual activity, coercion or violence.',
    'No text, logos or watermarks unless explicitly requested.'
  ].join('\n');
}

export function createPairImageStudio({pool,api,send,admins}){
  const sessions=new Map();
  const token=process.env.TELEGRAM_BOT_TOKEN||'';

  function session(chat){
    const value=sessions.get(String(chat));
    if(!value)return null;
    if(value.expiresAt<Date.now()){sessions.delete(String(chat));return null;}
    return value;
  }
  function setSession(chat,value){sessions.set(String(chat),{...value,expiresAt:Date.now()+SESSION_TTL_MS});}
  async function audit(event,{chat='',target='',style='',outcome='ok',metadata={}}={}){
    const safe=Object.fromEntries(Object.entries(metadata).filter(([,v])=>['string','number','boolean'].includes(typeof v)).map(([k,v])=>[k,String(v).slice(0,120)]));
    await pool.query('INSERT INTO personal_audit_log(scope,event,entity_type,entity_id,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6)',[SCOPE,event,'pair_image',null,outcome,JSON.stringify({chat:String(chat),target,style,...safe})]).catch(()=>{});
  }
  async function init(){await pool.query(schema);return true;}
  async function preferences(chat){
    const {rows}=await pool.query('SELECT style_key,aspect_ratio FROM pair_image_preferences WHERE scope=$1 AND chat_id=$2',[SCOPE,String(chat)]);
    return rows[0]||{style_key:'intimate',aspect_ratio:'4:5'};
  }
  async function setPreference(chat,field,value){
    const allowed=field==='style_key'?PAIR_IMAGE_STYLES[value]:['1:1','4:5','9:16','16:9'].includes(value);
    if(!allowed)return false;
    const current=await preferences(chat),style=field==='style_key'?value:current.style_key,ratio=field==='aspect_ratio'?value:current.aspect_ratio;
    await pool.query(`INSERT INTO pair_image_preferences(scope,chat_id,style_key,aspect_ratio) VALUES($1,$2,$3,$4)
      ON CONFLICT(scope,chat_id) DO UPDATE SET style_key=EXCLUDED.style_key,aspect_ratio=EXCLUDED.aspect_ratio,updated_at=now()`,[SCOPE,String(chat),style,ratio]);
    return true;
  }
  async function referenceState(){
    const {rows}=await pool.query('SELECT subject_role,telegram_file_id FROM pair_image_identity_refs WHERE scope=$1',[SCOPE]);
    return new Map(rows.map(row=>[row.subject_role,row.telegram_file_id]));
  }
  async function menu(chat){
    if(!admins.has(String(chat)))return false;
    const pref=await preferences(chat),refs=await referenceState(),style=PAIR_IMAGE_STYLES[pref.style_key]||PAIR_IMAGE_STYLES.intimate;
    const text=`<b>📸 СТУДИЯ ПАРЫ</b>\n\nСтиль: <b>${html(style.label)}</b>\nФормат: <b>${html(pref.aspect_ratio)}</b>\nРеференс Партнёра A: ${refs.has('owner')?'✅':'—'} · Партнёра B: ${refs.has('partner')?'✅':'—'}\n\nРеференсы сохраняются как Telegram file_id, изображения в Git не попадают.`;
    return send(chat,text,callbackRows([
      [{text:'👥 Сгенерировать пару',callback_data:'pimg:gen:pair'}],
      [{text:'👤 Партнёр A',callback_data:'pimg:gen:owner'},{text:'👤 Партнёр B',callback_data:'pimg:gen:partner'}],
      [{text:'🎨 Стиль',callback_data:'pimg:styles'},{text:`▣ ${pref.aspect_ratio}`,callback_data:'pimg:ratios'}],
      [{text:'📎 Реф. Партнёра A',callback_data:'pimg:ref:owner'},{text:'📎 Реф. Партнёра B',callback_data:'pimg:ref:partner'}]
    ]));
  }
  async function styleMenu(chat){
    const rows=[];const entries=Object.entries(PAIR_IMAGE_STYLES);
    for(let i=0;i<entries.length;i+=2)rows.push(entries.slice(i,i+2).map(([key,value])=>({text:value.label,callback_data:`pimg:style:${key}`})));
    rows.push([{text:'← Назад',callback_data:'pimg:open'}]);
    return send(chat,'<b>🎨 СТИЛЬ СЪЁМКИ</b>\n\nВыберите профессиональное направление.',rows);
  }
  async function ratioMenu(chat){return send(chat,'<b>▣ ФОРМАТ</b>',[
    [{text:'1:1',callback_data:'pimg:ratio:1x1'},{text:'4:5',callback_data:'pimg:ratio:4x5'}],
    [{text:'9:16',callback_data:'pimg:ratio:9x16'},{text:'16:9',callback_data:'pimg:ratio:16x9'}],
    [{text:'← Назад',callback_data:'pimg:open'}]
  ]);}
  async function saveReference(message,role){
    const photo=Array.isArray(message.photo)?message.photo.at(-1):null;
    if(!photo?.file_id)return false;
    await pool.query(`INSERT INTO pair_image_identity_refs(scope,subject_role,telegram_file_id,telegram_file_unique_id,uploaded_by)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(scope,subject_role) DO UPDATE SET telegram_file_id=EXCLUDED.telegram_file_id,telegram_file_unique_id=EXCLUDED.telegram_file_unique_id,uploaded_by=EXCLUDED.uploaded_by,updated_at=now()`,[SCOPE,role,String(photo.file_id),String(photo.file_unique_id||''),String(message.from?.id||message.chat?.id)]);
    await audit('identity_reference_saved',{chat:message.chat?.id,target:role,metadata:{fileUniqueId:String(photo.file_unique_id||'')}});
    sessions.delete(String(message.chat?.id));
    await send(String(message.chat.id),`✅ Референс «${html(roleLabel(role))}» сохранён.`);
    await menu(String(message.chat.id));
    return true;
  }
  async function telegramDataUrl(fileId){
    if(!token)throw new Error('TELEGRAM_BOT_TOKEN_MISSING');
    const info=await api('getFile',{file_id:fileId});
    if(!info?.ok||!info.result?.file_path)throw new Error('TELEGRAM_REFERENCE_UNAVAILABLE');
    const response=await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if(!response.ok)throw new Error(`TELEGRAM_REFERENCE_${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>12*1024*1024)throw new Error('REFERENCE_TOO_LARGE');
    const path=String(info.result.file_path).toLowerCase(),mime=path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':'image/jpeg';
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }
  async function imageRequest({prompt,aspectRatio,references}){
    const key=process.env.OPENROUTER_API_KEY;
    if(!key)throw new Error('OPENROUTER_NOT_CONFIGURED');
    const models=[process.env.PERSONAL_IMAGE_MODEL||DEFAULT_MODEL,process.env.PERSONAL_IMAGE_FALLBACK_MODEL||DEFAULT_FALLBACK].filter((value,index,array)=>value&&array.indexOf(value)===index);
    let lastError=null;
    for(const model of models){
      try{
        const payload={model,prompt,aspect_ratio:aspectRatio,output_format:'jpeg',input_references:references.map(url=>({type:'image_url',image_url:{url}}))};
        if(model.includes('seedream'))payload.resolution=process.env.PERSONAL_IMAGE_RESOLUTION||'2K';
        const response=await fetch('https://openrouter.ai/api/v1/images',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','HTTP-Referer':'https://github.com/mkontrakevich/night-for-two','X-Title':'Night for Two Image Studio'},body:JSON.stringify(payload)});
        const json=await response.json();
        if(!response.ok)throw new Error(`OPENROUTER_IMAGE_${response.status}:${json?.error?.message||'failed'}`);
        const first=json?.data?.[0];if(!first?.b64_json)throw new Error('OPENROUTER_IMAGE_EMPTY');
        return {buffer:Buffer.from(first.b64_json,'base64'),model,cost:json?.usage?.cost??null};
      }catch(error){lastError=error;}
    }
    throw lastError||new Error('IMAGE_GENERATION_FAILED');
  }
  async function sendPhoto(chat,buffer,caption){
    const form=new FormData();form.append('chat_id',String(chat));form.append('photo',new Blob([buffer],{type:'image/jpeg'}),'pair-editorial.jpg');form.append('caption',String(caption||'').slice(0,900));
    const response=await fetch(`https://api.telegram.org/bot${token}/sendPhoto`,{method:'POST',body:form});const json=await response.json();
    if(!response.ok||!json?.ok)throw new Error(`TELEGRAM_SEND_PHOTO_${json?.error_code||response.status}`);
    return json;
  }
  async function generateFromBrief(message,state){
    const chat=String(message.chat.id),brief=String(message.text||'').trim();if(!brief||brief.startsWith('/'))return false;
    const pref=await preferences(chat),refs=await referenceState(),roles=state.target==='pair'?['owner','partner']:[state.target];
    const missing=roles.filter(role=>!refs.has(role));
    if(missing.length){sessions.delete(chat);await send(chat,`Сначала нужен референс: <b>${missing.map(roleLabel).join(' + ')}</b>.`);await menu(chat);return true;}
    sessions.delete(chat);
    await send(chat,'📸 Собираю кадр: идентичность → композиция → свет → камера → генерация…');
    try{
      const dataUrls=[];for(const role of roles)dataUrls.push(await telegramDataUrl(refs.get(role)));
      const scenePrompt=buildPairImagePrompt({brief,target:state.target,styleKey:pref.style_key});
      const prompt=buildCoupleSpaceGeneratorSystemPrompt({provider:'openrouter',mode:'image',extra:scenePrompt});
      const result=await imageRequest({prompt,aspectRatio:pref.aspect_ratio,references:dataUrls});
      await sendPhoto(chat,result.buffer,`📸 ${PAIR_IMAGE_STYLES[pref.style_key]?.label||'Editorial'} · ${pref.aspect_ratio}\n${result.model}`);
      await audit('image_generated',{chat,target:state.target,style:pref.style_key,metadata:{ratio:pref.aspect_ratio,briefHash:hash(brief),briefLength:brief.length,model:result.model,cost:result.cost??'',skill:'skills/couple-space/intimate-narrative/SKILL.md'}});
    }catch(error){
      await audit('image_generation_failed',{chat,target:state.target,style:pref.style_key,outcome:'error',metadata:{code:safeCode(error),briefHash:hash(brief)}});
      await send(chat,`Не удалось сгенерировать изображение. Диагностика сохранена: <code>${html(safeCode(error))}</code>.`);
    }
    return true;
  }
  async function handleCallback(callback){
    const chat=String(callback.from?.id||'');if(!admins.has(chat))return false;
    const data=String(callback.data||'');if(!data.startsWith('pimg:'))return false;
    await api('answerCallbackQuery',{callback_query_id:callback.id}).catch(()=>{});
    if(data==='pimg:open'){await menu(chat);return true;}
    if(data==='pimg:styles'){await styleMenu(chat);return true;}
    if(data==='pimg:ratios'){await ratioMenu(chat);return true;}
    const ref=data.match(/^pimg:ref:(owner|partner)$/);if(ref){setSession(chat,{kind:'reference',role:ref[1]});await send(chat,`Отправь следующим сообщением <b>одну исходную фотографию ${html(roleLabel(ref[1]))}</b>. Лучше нейтральный портрет без фильтров.`);return true;}
    const gen=data.match(/^pimg:gen:(pair|owner|partner)$/);if(gen){setSession(chat,{kind:'brief',target:gen[1]});await send(chat,'Опиши сцену одним сообщением: что происходит, локация, настроение и важные детали. Камеру, свет и фотореализм система соберёт сама.');return true;}
    const style=data.match(/^pimg:style:(\w+)$/);if(style&&PAIR_IMAGE_STYLES[style[1]]){await setPreference(chat,'style_key',style[1]);await menu(chat);return true;}
    const ratio=data.match(/^pimg:ratio:(1x1|4x5|9x16|16x9)$/);if(ratio){await setPreference(chat,'aspect_ratio',ratio[1].replace('x',':'));await menu(chat);return true;}
    return true;
  }
  async function handleUpdate(update){
    if(update.callback_query&&await handleCallback(update.callback_query))return true;
    const message=update.message;if(!message)return false;const chat=String(message.chat?.id||'');if(!admins.has(chat))return false;
    const text=String(message.text||'').trim();if(/^\/(?:pair_image|pair_photo|image_studio)(?:@\w+)?$/iu.test(text)){await menu(chat);return true;}
    const state=session(chat);if(!state)return false;
    if(state.kind==='reference')return saveReference(message,state.role);
    if(state.kind==='brief')return generateFromBrief(message,state);
    return false;
  }
  async function tick(){for(const [chat,value] of sessions)if(value.expiresAt<Date.now())sessions.delete(chat);}
  return {init,handleUpdate,tick,menu,status:()=>({pairImageStudio:true,sessions:sessions.size})};
}
