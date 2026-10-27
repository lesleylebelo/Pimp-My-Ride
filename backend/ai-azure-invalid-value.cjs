// Never return provider text, field paths, numeric values, or supported-value
// lists. These classifications describe provider evidence, not inferred fixes.
const fields=new Map(['input','tools','tool_choice','max_output_tokens','store','stream','api-version'].map(field=>[field,field.replace('-','_')]));
const categories=new Set(['unknown','none','auto','required','developer','system','user','assistant','tool','input_text','output_text','text','input_image','true','false','empty_array','array','object','positive_integer','nonpositive_integer','non_integer','range']);
const tags=[...fields.values(),'input_role','input_content','input_content_type'];
const classifications=new Set(['unknown',...tags.flatMap(field=>[...categories].map(value=>field+'_'+value)),...['none','auto','required','developer','system','user','assistant','tool','input_text','output_text','text','input_image','true','false'].map(value=>'enum_'+value+'_field_unknown')]);
function fieldTag(value){
 if(typeof value!=='string'||value.length>100)return null;
 if(fields.has(value))return fields.get(value);
 if(/^input(?:\[\d{1,3}\]|\.\d{1,3})\.role$/.test(value))return 'input_role';
 if(/^input(?:\[\d{1,3}\]|\.\d{1,3})\.content$/.test(value))return 'input_content';
 if(/^input(?:\[\d{1,3}\]|\.\d{1,3})\.content(?:\[\d{1,3}\]|\.\d{1,3})\.type$/.test(value))return 'input_content_type';
 return null;
}
function valueCategory(value){
 if(value===true||value===false)return String(value);
 if(typeof value==='string')return categories.has(value)&&!['unknown','range','object','array','positive_integer','nonpositive_integer','non_integer','empty_array'].includes(value)?value:'unknown';
 if(typeof value==='number'&&Number.isFinite(value))return !Number.isInteger(value)?'non_integer':value>0?'positive_integer':'nonpositive_integer';
 if(Array.isArray(value))return value.length?'array':'empty_array';
 return value&&typeof value==='object'?'object':'unknown';
}
function errorNodes(chain){
 const nodes=[],seen=new Set(),queue=chain.slice();
 while(queue.length&&nodes.length<12){
  const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;
  seen.add(node);nodes.push(node);
  for(const key of ['error','innererror','innerError'])if(node[key]&&typeof node[key]==='object')queue.push(node[key]);
  if(Array.isArray(node.details))queue.push(...node.details.slice(0,4));
  if(node.response?.data?.error)queue.push(node.response.data.error);
 }
 return nodes;
}
function invalidValueClassification(chain,code,stage,status){
 if(stage!=='responses_request'||status!==400)return null;
 const nodes=errorNodes(chain);
 if(code!=='invalid_value'&&!nodes.some(node=>node.code==='invalid_value'))return null;
 const evidence=[];
 for(const node of nodes){
  const param=fieldTag(node.param)||fieldTag(node.target);
  let field=param,category=Object.hasOwn(node,'value')?valueCategory(node.value):'unknown';
  const message=typeof node.message==='string'&&node.message.length<=2048?node.message.replace(/^400\s+/,''):'';
  // Anchored known error grammar only; arbitrary mentions are not evidence.
  const named=/^Invalid (?:value for )?['"]([A-Za-z0-9_.\[\]-]{1,100})['"]:\s*(.*)$/i.exec(message);
  if(named){
   const namedField=fieldTag(named[1]);
   if(param&&namedField&&param!==namedField)return 'unknown';
   field=field||namedField;
   const literal=/^['"]([^'"\r\n]{1,64})['"](?:\.|\s|$)/.exec(named[2]);
   if(literal)category=valueCategory(literal[1]);
   else if(field==='max_output_tokens'&&/^(?:out of range\b|must be (?:between|greater than|less than)\b)/i.test(named[2]))category='range';
  }else{
   const literal=/^Invalid value:\s*['"]([^'"\r\n]{1,64})['"](?:\.|\s|$)/i.exec(message);
   if(literal)category=valueCategory(literal[1]);
   else if(!param)continue;
  }
  if(field)evidence.push(field+'_'+category);
  else if(category!=='unknown'&&classifications.has('enum_'+category+'_field_unknown'))evidence.push('enum_'+category+'_field_unknown');
 }
 // Prefer a more specific value only for the same explicitly identified field.
 const fieldOf=item=>tags.find(field=>item.startsWith(field+'_')&&categories.has(item.slice(field.length+1)));
 const distinct=new Set(evidence.filter(item=>!item.endsWith('_unknown')||!evidence.some(other=>other!==item&&fieldOf(item)&&fieldOf(item)===fieldOf(other)&&!other.endsWith('_unknown'))));
 return distinct.size===1?[...distinct][0]:'unknown';
}
module.exports={invalidValueClassification,classifications};
