// Isolated adapter: the caller must authenticate and enforce content policy.
export const SDXL_MODEL='@cf/bytedance/stable-diffusion-xl-lightning';

export async function generateSdxl(ai, input) {
  if (!ai || typeof ai.run !== 'function') throw Error('SDXL_BINDING_MISSING');
  if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length>12000) throw Error('SDXL_PROMPT_INVALID');
  if (input.input_references?.length) throw Error('SDXL_REFERENCE_NOT_SUPPORTED');
  const width=Number(input.width),height=Number(input.height);
  if (![width,height].every(n=>Number.isInteger(n)&&n>=256&&n<=1024&&n%64===0)) throw Error('SDXL_SIZE_INVALID');
  const seed=input.seed;
  if (seed!==undefined && (!Number.isSafeInteger(seed)||seed<0||seed>4294967295)) throw Error('SDXL_SEED_INVALID');
  const params={prompt:input.prompt,negative_prompt:String(input.negative_prompt||'').slice(0,4000),width,height,num_steps:4};
  if(seed!==undefined)params.seed=seed;
  let response;
  try { response=await ai.run(SDXL_MODEL,params); } catch { throw Error('SDXL_INFERENCE_FAILED'); }
  let bytes;
  try {
    if(response instanceof ReadableStream) bytes=new Uint8Array(await new Response(response).arrayBuffer());
    else if(response instanceof ArrayBuffer) bytes=new Uint8Array(response);
    else if(ArrayBuffer.isView(response)) bytes=new Uint8Array(response.buffer,response.byteOffset,response.byteLength);
    else throw Error('invalid');
  } catch { throw Error('SDXL_RESPONSE_INVALID'); }
  const png=[137,80,78,71,13,10,26,10];
  if(bytes.length<32||bytes.length>16_000_000||!png.every((x,i)=>bytes[i]===x)) throw Error('SDXL_IMAGE_INVALID');
  let binary=''; for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {ok:true,image:'data:image/png;base64,'+btoa(binary),model:SDXL_MODEL,seed:seed??null,steps:4,width,height};
}
