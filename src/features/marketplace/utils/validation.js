const MAX_CENTS=100000000;
const required=(v,label,max)=>typeof v!=='string'||!v.trim()?`${label} is required.`:v.trim().length>max?`${label} must be ${max} characters or fewer.`:null;
const integer=(v,min,max)=>/^\d+$/.test(String(v))&&Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max;
export function parseMoney(value){
 const s=String(value??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const [whole,part='']=s.split('.'),cents=Number(whole)*100+Number(part.padEnd(2,'0'));
 return Number.isSafeInteger(cents)&&cents<=MAX_CENTS?cents:null;
}
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
const clean=errors=>Object.fromEntries(Object.entries(errors).filter(([,v])=>v));
export function vehicleErrors(form){return clean({
 make:required(form.make,'Make',80),model:required(form.model,'Model',80),colour:required(form.colour,'Colour',80),
 year:integer(form.year,1886,new Date().getFullYear()+1)?null:'Enter a valid vehicle year.',
 registration:required(form.registration,'Registration',20)||(!/^[A-Za-z0-9 -]+$/.test(form.registration||'')?'Use letters, numbers, spaces or hyphens.':null),
});}
export function requestErrors(form){
 const min=parseMoney(form.budgetMin),max=parseMoney(form.budgetMax);
 return clean({vehicleId:required(form.vehicleId,'Vehicle',128),categoryId:required(form.categoryId,'Service category',128),title:required(form.title,'Title',100),description:required(form.description,'Description',300),city:required(form.city,'City',100),
  budgetMin:min===null?'Enter an amount up to R1,000,000 with at most two decimal places.':null,
  budgetMax:max===null?'Enter an amount up to R1,000,000 with at most two decimal places.':max<=0?'Maximum budget must be greater than zero.':min!==null&&max<min?'Maximum budget must be at least the minimum.':null,
  preferredDate:form.preferredDate&&!validDate(form.preferredDate)?'Use a valid date in YYYY-MM-DD format.':null,
  visibility:['open','direct'].includes(form.visibility)?null:'Choose an open or direct request.',
  shopId:form.visibility==='direct'?required(form.shopId,'Verified shop',128):null,
 });
}
export function quoteErrors(form){
 const errors={scope:required(form.scope,'Scope of work',2000),completionDays:integer(form.completionDays,1,365)?null:'Enter 1 to 365 working days.',validForDays:integer(form.validForDays,1,90)?null:'Enter 1 to 90 days.',warranty:typeof form.warranty==='string'&&form.warranty.length<=500?null:'Warranty must be 500 characters or fewer.'};
 if(!Array.isArray(form.items)||form.items.length<1||form.items.length>10)errors.items='Add 1 to 10 price items.';
 let total=0;
 for(const [i,item] of (Array.isArray(form.items)?form.items:[]).entries()){
  errors[`items.${i}.description`]=required(item.description,'Item description',200);
  const cents=parseMoney(item.amount);errors[`items.${i}.amount`]=cents===null||cents<=0?'Enter a positive amount with at most two decimal places.':null;total+=cents||0;
 }
 if(total>MAX_CENTS)errors.items='The total must not exceed R1,000,000.';
 return clean(errors);
}
