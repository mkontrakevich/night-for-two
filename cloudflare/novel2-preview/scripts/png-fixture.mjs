// Standards-valid PNG fixtures for Node-only tests; no fake image headers.
import {deflateSync} from 'node:zlib';
const TABLE=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=(c&1)?((c>>>1)^0xEDB88320):(c>>>1);return c>>>0});
function crc(arr){let c=0xffffffff;for(const b of arr)c=TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function chunk(name,data){const type=Buffer.from(name,'ascii'),size=Buffer.alloc(4),end=Buffer.alloc(4);size.writeUInt32BE(data.length);end.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,end])}
export function fixture(w,h){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 const rows=[];
 for(let y=0;y<h;y++){const row=Buffer.alloc(1+3*w,238);row[0]=0;for(let x=0;x<w;x++){const color=(x<8||y<8||x>w-9||y>h-9||Math.abs(x-w/2)<2)?20:238;const n=1+x*3;row[n]=color;row[n+1]=color;row[n+2]=color;}rows.push(row)}
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
 return new Uint8Array(png)
}
