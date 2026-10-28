const fs=require("fs");const dir=process.argv[2];
const fresh=JSON.parse(fs.readFileSync(dir+"/arch-fresh.json","utf8"));
const c=JSON.parse(JSON.stringify(fresh.content));
// 1. CIQ_OP_Outcome
const i=c.lists.findIndex(l=>l.id==="CIQ_OP_Outcome"); if(i<0) throw new Error("no CIQ_OP_Outcome");
if(c.lists.some(l=>l.id==="CIQ_Round_Outcome")) throw new Error("CIQ_Round_Outcome already present");
const op=c.lists[i];
op.items=["Accepted","Withdrawn"];
op.item_source="data_model (D22/COH-08): a Return is the native send-back, so the point's own outcome is only Accepted or Withdrawn (brd.md L246; supersedes the L1214 three-value row)";
op.used_by=["CIQ Open Point outcome"];
// 2. new CIQ_Round_Outcome after it
c.lists.splice(i+1,0,{id:"CIQ_Round_Outcome",name:"CIQ Round Outcome",items:["Accepted","Returned","Withdrawn"],
 item_source:"data_model (COH-11): split from CIQ OP Outcome so the round history keeps 'Returned' (brd.md L246, L251; a list-backed Select drops values it doesn't hold, L1229)",
 used_by:["Rounds outcome column (CIQ Open Point)"],populate:op.populate});
// 3. list_ids, keeping key order
const li={};for(const [k,v] of Object.entries(c.id_reservations.list_ids)){li[k]=v;if(k==="CIQ OP Outcome")li["CIQ Round Outcome"]="CIQ_Round_Outcome";}
if(!li["CIQ Round Outcome"]) throw new Error("list_ids anchor missing");
c.id_reservations.list_ids=li;
// 4. build_order lists layer
const bo=c.build_order.find(b=>b.layer==="lists");const j=bo.artifacts.indexOf("CIQ OP Outcome");if(j<0)throw new Error("bo anchor");
bo.artifacts.splice(j+1,0,"CIQ Round Outcome");
// 5. counts
for(const h of [c.hard_rules[0],c.hard_rules[2]]){ if(!h.rule.includes("21 lists")) throw new Error("count anchor"); h.rule=h.rule.replace("21 lists","22 lists"); }
c.coverage.lists="22/22: 21 domain value sets plus CIQ Round Outcome (COH-11 split from CIQ OP Outcome)";
fs.writeFileSync(dir+"/arch-commit.json",JSON.stringify(c,null,2));
// diff report
const a=fresh.content;const out=[];
function d(x,y,p){ if(JSON.stringify(x)===JSON.stringify(y))return; if(x&&y&&typeof x==="object"&&typeof y==="object"&&!Array.isArray(x)&&!Array.isArray(y)){for(const k of new Set([...Object.keys(x),...Object.keys(y)]))d(x[k],y[k],p+"."+k);} else out.push(p);}
d(a,c,"");console.log("base revision",fresh.revision);console.log("changed paths:",out);
console.log("lists",c.lists.length,"list_ids",Object.keys(c.id_reservations.list_ids).length,"build_order lists",bo.artifacts.length);
