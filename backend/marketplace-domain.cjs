const D=require('./domain.cjs');
const MAX_CENTS=100000000;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function fields(input,allowed){
 if(!input||typeof input!=='object'||Array.isArray(input))D.fail('Enter valid request details.');
 const extras=Object.keys(input).filter(key=>!allowed.includes(key));
 if(extras.length)D.fail('This request contains unsupported fields.');
}
function integer(value,label,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)D.fail(`${label} must be a whole number between ${min} and ${max}.`);return value;}
function optional(value,label,max){if(value===undefined||value==='')return '';if(typeof value!=='string'||value.trim().length>max)D.fail(`${label} must be at most ${max} characters.`);return value.trim();}
function bool(value,label){if(typeof value!=='boolean')D.fail(`${label} must be true or false.`);return value;}
function vehicle(input){
 const registration=D.text(input.registration,'Registration',20).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9 -]*$/.test(registration))D.fail('Enter a valid vehicle registration using letters, numbers, spaces or hyphens.');
 return {make:D.text(input.make,'Make',80),model:D.text(input.model,'Model',80),year:integer(input.year,'Year',1886,new Date().getUTCFullYear()+1),colour:D.text(input.colour,'Colour',80),registration};
}
function date(value){
 if(value===undefined||value==='')return '';
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)D.fail('Choose a valid preferred date (YYYY-MM-DD).');
 return value;
}
// Apply the South African date boundary only when creating, after receipt lookup.
function requireFutureDate(value){const today=new Date(Date.now()+2*60*60*1000).toISOString().slice(0,10);if(value&&value<today)D.fail('Choose today or a future preferred date.');}
function serviceRequest(input){
 const min=integer(input.budgetMinCents,'Minimum budget',0,MAX_CENTS),max=integer(input.budgetMaxCents,'Maximum budget',1,MAX_CENTS);
 if(max<min)D.fail('Maximum budget must be at least the minimum budget.');
 if(!['open','direct'].includes(input.visibility))D.fail('Choose an open or direct request.');
 if(input.visibility==='open'&&own(input,'shopId')&&input.shopId!==null&&input.shopId!=='')D.fail('An open request cannot target a shop.');
 return {title:D.text(input.title,'Title',100),description:D.text(input.description,'Description',300),categoryId:D.id(input.categoryId),city:D.text(input.city,'City',100),budgetMinCents:min,budgetMaxCents:max,preferredDate:date(input.preferredDate),visibility:input.visibility,shopId:input.visibility==='direct'?D.id(input.shopId):null};
}
function quotation(input){
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>10)D.fail('Add between 1 and 10 quotation line items.');
 const items=input.items.map(item=>{fields(item,['description','amountCents']);return {description:D.text(item.description,'Item description',200),amountCents:integer(item.amountCents,'Item amount',1,MAX_CENTS)};});
 const totalCents=items.reduce((total,item)=>total+item.amountCents,0);
 integer(totalCents,'Quotation total',1,MAX_CENTS);
 return {scope:D.text(input.scope,'Scope of work',2000),items,totalCents,currency:'ZAR',completionDays:integer(input.completionDays,'Completion days',1,365),warranty:optional(input.warranty,'Warranty',500),validForDays:integer(input.validForDays,'Validity days',1,90)};
}
const vehicleSnapshot=value=>Object.fromEntries(['make','model','year','colour'].map(key=>[key,value[key]]));
module.exports={fields,integer,optional,bool,vehicle,serviceRequest,quotation,vehicleSnapshot,requireFutureDate};
