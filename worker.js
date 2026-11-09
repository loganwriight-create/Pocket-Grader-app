const MODEL = "gemini-3.1-flash-lite";
const ALLOWED_ORIGIN = "https://loganwriight-create.github.io";
const cors = {"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
function reply(data,status){return new Response(JSON.stringify(data),{status:status||200,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
export default { async fetch(request,env) {
 const origin=request.headers.get("Origin")||"";
 if(origin && origin!==ALLOWED_ORIGIN) return new Response("Origin not allowed",{status:403});
 if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
 const url=new URL(request.url);
 if(request.method==="GET" && url.pathname==="/") return reply({ok:true,service:"Pocket Grader AI",ready:Boolean(env.GEMINI_API_KEY)});
 if(request.method!=="POST" || url.pathname!=="/grade") return reply({error:"Not found"},404);
 if(!env.GEMINI_API_KEY) return reply({error:"Gemini API key is not configured."},503);
 let body; try{body=await request.json()}catch{return reply({error:"Invalid JSON request."},400)}
 const valid=x=>x && typeof x.data==="string" && ["image/jpeg","image/png","image/webp"].includes(x.mimeType) && x.data.length>100 && x.data.length<11200000;
 if(!valid(body.front)||!valid(body.back)) return reply({error:"Provide front and back JPEG, PNG or WebP photos, each under 8 MB."},400);
 const prompt="You are an assistant providing an unofficial, cautious trading card pre-grade estimate. Assess the FRONT and BACK photos of this "+String(body.game||"trading card").slice(0,40)+" named "+String(body.cardName||"unknown").slice(0,100)+". Inspect only visible evidence: centering, corners, edges, surface and print defects. Do not invent defects. IMPORTANT: You CANNOT authenticate a trading card from photos. Never say or imply that a card is fake, counterfeit, genuine, authentic, or unofficial based on these images. Do not use authenticity as a grading factor. If asked about authenticity, state that it cannot be determined from this visual assessment. Assume authenticity is NOT ASSESSED. If glare, blur, sleeves or low resolution prevent assessment, say so and lower confidence. Give a conservative overall condition score from 1.0 to 10.0. A 10 requires exceptionally clean visible condition on both sides. This is NOT an official grader score. Also inspect the FRONT PHOTO only and estimate a tight rectangular bounding box around the complete visible trading card, excluding the table/background and any empty space. Use normalized coordinates from 0 to 1000 relative to the full front image: x and y are the top-left corner, width and height are the box dimensions. Include the whole card including its outer border; do not crop card edges. If the card cannot be confidently located, set cardBounds to null. Return ONLY JSON: {authenticity:"not_assessed",score:number,summary:string,confidence:'low|medium|high',breakdown:{centering:string,corners:string,edges:string,surface:string,print:string},visibleIssues:string[],cardBounds:{x:number,y:number,width:number,height:number}|null}.";
 const parts=[{text:"FRONT PHOTO"},{inlineData:{mimeType:body.front.mimeType,data:body.front.data}},{text:"BACK PHOTO"},{inlineData:{mimeType:body.back.mimeType,data:body.back.data}},{text:prompt}];
 try {
  const upstream=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:"user",parts}],generationConfig:{temperature:0.2,responseMimeType:"application/json"}})});
  const result=await upstream.json();
  if(!upstream.ok) return reply({error:result.error?.message||"Gemini request failed."},upstream.status===429?429:502);
  const text=result.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
  if(!text) return reply({error:"Gemini returned no assessment. Try clearer photos."},502);
  let assessment; try{assessment=JSON.parse(text)}catch{return reply({error:"Gemini returned an unreadable assessment. Please try again."},502)}
  const raw=assessment.cardBounds;let cardBounds=null;if(raw&&[raw.x,raw.y,raw.width,raw.height].every(v=>Number.isFinite(Number(v)))){const x=Math.max(0,Math.min(999,Number(raw.x))),y=Math.max(0,Math.min(999,Number(raw.y))),right=Math.max(x+1,Math.min(1000,x+Number(raw.width))),bottom=Math.max(y+1,Math.min(1000,y+Number(raw.height)));if(right-x>80&&bottom-y>120)cardBounds={x,y,width:right-x,height:bottom-y};}return reply({authenticity:"not_assessed",score:Math.max(1,Math.min(10,Number(assessment.score)||1)),summary:String(assessment.summary||"Visual assessment complete."),confidence:String(assessment.confidence||"medium"),breakdown:assessment.breakdown||{},visibleIssues:Array.isArray(assessment.visibleIssues)?assessment.visibleIssues:[],cardBounds},200);
 }catch(e){return reply({error:"Could not connect to Gemini. Please try again."},502)}
}};
