/* Deterministic four-view actor card. Each image is generated separately.
 * No image model is ever asked to draw the layout or multiple heads on a canvas.
 * Final SVG is an immutable presentation format: 4 clipped data-only JPEG tiles.
 * The legacy origin uses Sharp to flatten this SVG to an ordinary JPEG. */
export const ACTOR_VIEW_SPEC=Object.freeze([
 {key:'face_front',label:'Лицо · анфас',width:512,height:640,x:16,y:16,w:488,h:592,
  direction:'ONE AND ONLY ONE PERSON, ONE HEAD, LARGE HEAD-AND-SHOULDERS PORTRAIT, straight-on frontal face, shoulders parallel to camera, natural neutral expression, entire head fully visible including hair and chin. Face fills most of frame.'},
 {key:'face_profile',label:'Лицо · профиль',width:512,height:640,x:520,y:16,w:488,h:592,
  direction:'ONE AND ONLY ONE PERSON, ONE HEAD, LARGE HEAD-AND-SHOULDERS PORTRAIT, strict ninety-degree RIGHT side profile, single visible side of the face, natural neutral expression, entire head and hair visible. Face fills most of frame.'},
 {key:'body_front',label:'Рост · спереди',width:512,height:896,x:16,y:624,w:488,h:896,
  direction:'ONE AND ONLY ONE PERSON, SINGLE FULL-BODY STANDING FIGURE, facing the camera, both arms separately visible at sides, two distinct legs, both feet and full head visible, centered standing posture. Keep generous space around head and toes.'},
 {key:'body_back',label:'Рост · сзади',width:512,height:896,x:520,y:624,w:488,h:896,
  direction:'ONE AND ONLY ONE PERSON, SINGLE FULL-BODY STANDING FIGURE, facing DIRECTLY AWAY from the camera, clearly showing the BACK of the same head, hair, shoulders, spine and legs. Both feet and entire head visible, arms separately visible. NO face looking over shoulder.'}
]);
export const ACTOR_LAYOUT_VERSION='actor-contact-sheet-isolated-four-v1';
export function actorViewPrompt({view,role='A',identityLock=''}) {
 if(!ACTOR_VIEW_SPEC.some(v=>v.key===view.key))throw Error('NOVEL2_ACTOR_VIEW_INVALID');
 return [
  'Render ONE isolated, photorealistic adult human actor reference photograph.',
  'This is a SINGLE photograph, NOT a grid, collage, triptych, split screen, contact sheet or multiple views.',
  'Exactly one human in the scene, one anatomically coherent head, no other faces or bodies. No duplicates, reflections, clones, merged features or extra limbs.',
  view.key.startsWith('body')?'Full body proportions: exactly two arms, two hands, two legs and two feet.': 'Portrait crop shows only the head, neck and shoulders; do NOT squeeze legs or a second full-body view into the portrait.',
  view.direction,
  'The face and physique MUST match the supplied personal reference photographs. Keep apparent age, nose contour, eye placement, jaw, hairline and proportions stable.',
  identityLock,
  'Neutral warm-gray studio background, credible editorial studio photo, even clean studio lighting, no harsh cast shadows or artistic double exposure.',
  'Wardrobe: refined natural IVORY SILK fabric, wrapped as a secure, elegantly draped studio garment with flowing sculptural folds. Its opaque layers cover chest, torso, hips and intimate areas in every view, including from behind. Keep the subject comfortably and fully covered; silhouette and normal anatomy remain readable without exaggerated contours. Face, neck and entire hair visible, no bulky fabric across the face.',
  'Only the face, neck and hands may remain uncovered. No nudity, see-through fabric, suggestive posing, lingerie or costume accessories. Neutral studio casting, not fashion styling.',
  'Leave all content contained inside a single image frame. No overlap, no mirror, no reflection, no silhouettes, no duplicates, no extras.',
  'No text, no watermark, no props, no decorative border, no logo.'
 ].filter(Boolean).join('\n');
}
export function bytesFromAiImage(image) {
 const raw=String(image||'').replace(/^data:image\/(?:jpeg|jpg);base64,/,'');
 if(!/^[A-Za-z0-9+/=]+$/.test(raw)||raw.length<100)return null;
 try{
  const binary=atob(raw),out=new Uint8Array(binary.length);
  if(out.length<128||out.length>10_000_000)return null;
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  if(out[0]!==255||out[1]!==216||out[2]!==255||out[out.length-2]!==255||out[out.length-1]!==217)return null;
  return out;
 }catch{return null}
}
export function base64FromBytes(bytes) {
 let s='';
 for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(s);
}
export function compositeActorSvg(panels) {
 if(!Array.isArray(panels)||panels.length!==ACTOR_VIEW_SPEC.length)throw Error('NOVEL2_ACTOR_INCOMPLETE_SHEET');
 const els=ACTOR_VIEW_SPEC.map((v,i)=>{
  const p=panels[i];
  if(p?.key!==v.key||!p.bytes||!p.bytes.length||p.bytes[0]!==255||p.bytes[1]!==216)
   throw Error('NOVEL2_ACTOR_PANEL_INVALID_'+v.key);
  // The JPEG is embedded as base64 data; it cannot contribute SVG/HTML markup.
  const src='data:image/jpeg;base64,'+base64FromBytes(p.bytes);
  // Containment is enforced by viewport clips, not by probabilistic AI directions.
  // Contain, never crop: every head, hairline and foot remains inside its tile.
  const scale='xMidYMid meet';
  return '<g clip-path="url(#clip'+i+')"><image x="'+v.x+'" y="'+v.y+
   '" width="'+v.w+'" height="'+v.h+'" preserveAspectRatio="'+scale+
   '" href="'+src+'"/></g>';
 }).join('');
 const clips=ACTOR_VIEW_SPEC.map((v,i)=>'<clipPath id="clip'+i+'"><rect x="'+v.x+'" y="'+v.y+
   '" width="'+v.w+'" height="'+v.h+'"/></clipPath>').join('');
 return '<?xml version="1.0" encoding="UTF-8"?>'+
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '+
  'width="1024" height="1536" viewBox="0 0 1024 1536">'+
  '<defs>'+clips+'</defs><rect width="1024" height="1536" fill="#d8d4cf"/>'+
  els+'<path d="M512 16V1520 M16 616H1008" fill="none" stroke="#d8d4cf" stroke-width="12"/>'+
  '</svg>';
}
