const {failure}=require('./ai-errors.cjs');
// Closed grammatical vocabulary: no specifications, service names, prices or claims.
const editorial=new Set(('a an the i we you your our my me mine us their its it this that these those to for of and or in on at by with from as is are be been was were have has had would could can please request requested requesting work project showcase description title details information clarify explain provide consider prefer preferred which what when how any about want wants like need needs clearly accurately regarding also so into onto them they there do does did am being').split(' '));
const questions=new Set(('scope timing condition preferences constraints budget vehicle vehicles make model year colour color finish areas parts existing issues additional requirements intended desired schedule start date completion detail specific choice available options other should done more further').split(' '));
// Grammatical framing and general clarification are not automotive facts.
// Technical nouns still have to come from the draft; synonyms below retain a
// closed meaning rather than accepting arbitrary newly generated content.
for(const word of 'looking seeking wish wishing kindly help assistance get getting would like'.split(' '))editorial.add(word);
for(const word of 'timeframe timeline deadline duration spending spend expectations expectation priorities priority reference references photo photos photograph photographs image images picture pictures share tell describe explain outcome outcomes result results final look anything else important information about regarding roughly approximate estimated estimate limitations limits concerns concern requirements preferences details desired preferred particular specify clarify elaboration elaborate suitable convenient availability flexible flexibility'.split(' '))questions.add(word);
questions.add('much');
const forms=[['wrap','wraps','wrapped','wrapping'],['paint','paints','painted','painting'],['install','installs','installed','installing'],['repair','repairs','repaired','repairing'],['fix','fixes','fixed','fixing'],['replace','replaces','replaced','replacing'],['fit','fits','fitted','fitting'],['tint','tints','tinted','tinting'],['tune','tunes','tuned','tuning'],['service','services','serviced','servicing']];
const inflections=new Map(forms.flatMap(group=>group.map(word=>[word,group[0]])));
const past=new Set(forms.map(group=>group[2]));
const negators=new Set(['no','not','never','without','neither','nor','avoid','excluding']);
const critical=new Set(('if unless before after until within only must required require requires should will shall optional prefer preferred planned planning plan budget price cost warranty guarantee guarantees guaranteed certified certification engine gearbox transmission turbo supercharger horsepower hp kw nm litre liter cc ecu stage specification specifications front rear left right one two three four five six seven eight nine ten first second third all both some less additional monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december').split(' '));
const colours=new Set(('black white red blue green yellow silver grey gray orange purple brown pink').split(' '));
function normal(value){return String(value).normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g,"'")
 .replace(/\b(can't|cannot)\b/g,'can not').replace(/\bwon't\b/g,'will not').replace(/\bshan't\b/g,'shall not')
 .replace(/\b(\p{L}+)n't\b/gu,'$1 not').replace(/\bit's\b/g,'it is').replace(/\bi'm\b/g,'i am').replace(/\b(you|we|they)'re\b/g,'$1 are')
 .replace(/\b(\p{L}+)'s\b/gu,'$1').replace(/\br\s+(?=\d)/g,'r');}
const words=value=>normal(value).match(/[\p{L}\p{N}]+/gu)||[];
const spellings=new Map([['color','colour'],['gray','grey'],['tire','tyre'],['tires','tyres'],['optimize','optimise']]);
const equivalent=new Map([['fix','repair'],['matte','matt']]);
const canonical=word=>{const root=inflections.get(word)||word;return equivalent.get(root)||spellings.get(root)||root;};
const numbers=value=>normal(value).match(/[-+]?\d+(?:[.,:/-]\d+)*/g)||[];
const money=value=>normal(value).match(/[\u00a3$\u20ac%]|\br(?=\d)/g)||[];
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
function reject(field,rule){throw failure('grounding_rejected',{rejectedField:field,validationRule:rule});}
const copulas=new Set('is are have has had did was were'.split(' '));
const protectedStatus=value=>completed(value)||words(value).some(word=>copulas.has(word));
const statusWords=new Set('have has had been was were is are be need needs want wants would could to will shall plan planned planning'.split(' '));
function content(value,preserveStatus=false){return words(value).filter(word=>!editorial.has(word)||critical.has(word)||negators.has(word)||preserveStatus&&statusWords.has(word)).map(canonical);}
function negative(value){return words(value).filter(word=>negators.has(word));}
function sensitive(value){const list=words(value);return numbers(value).length||negative(value).length||list.some(word=>critical.has(word))||new Set(list.filter(word=>colours.has(word))).size>1||new Set(list.filter(word=>inflections.has(word)).map(canonical)).size>1;}
function signature(value,preserveStatus=false){
 // Keep sensitive facts attached to their original clause, order and negation.
 // Sentence punctuation/newlines are equivalent boundaries, not decimal separators.
 return normal(value).replace(/(?<!\d)[,.;!?]|[,.;!?](?!\d)|\n/g,' | ').split('|').map(part=>content(part,preserveStatus)).filter(part=>part.length);
}
function completed(value){
 const text=normal(value),list=words(value),participles=[...past,'completed','finished','done'].join('|');
 if(/\b(already|successfully)\b/.test(text)||new RegExp('\\b(?:have|has|had|was|were|is|are)\\s+(?:been\\s+)?(?:'+participles+')\\b').test(text))return true;
 const requested=/\b(need|needs|want|wants|would|could|please|request|plan|planned|planning|to)\b/.test(text);
 return !requested&&(list.some(word=>past.has(word))||/\b(completed|finished|done)\b/.test(text));
}
function newAssertion(original,value){
 // Permit request framing, not fresh assertions of possession/state/completion.
 const requested=normal(value)
  .replace(/\b(?:is|are)\s+to\s+be\b/g,'to be')
  .replace(/\b(request|work|project)\s+is\s+(to|for)\b/g,'$1 $2')
  .replace(/\b(would like|want|wants|need|needs)\s+to\s+have\b/g,'$1 to')
  .replace(/\b(could|can)\s+you\s+(please\s+)?have\b/g,'$1 you');
 const before=words(original),after=words(requested);
 return [...copulas].some(word=>after.filter(item=>item===word).length>before.filter(item=>item===word).length);
}
function editorialWords(source){
 const supplied=new Set(words(source));
 return [...new Set([...editorial,...forms.filter(group=>group.some(word=>supplied.has(word))).flat()])];
}
function validateGrounding(value,draft){
 const source=draft.title+'\n'+draft.description,supplied=new Set(words(source).map(canonical));
 for(const field of ['title','description']){
  const text=value[field],original=draft[field],list=words(text);
  if(!same(negative(original),negative(text)))reject(field,'negation_changed');
  if(!same(numbers(original),numbers(text)))reject(field,'number_changed');
  if(!same(money(original),money(text)))reject(field,'currency_changed');
  if(newAssertion(original,text)||completed(text)&&!completed(original)||completed(original)&&!completed(text))reject(field,'work_status_changed');
  if(list.some(word=>!editorial.has(word)&&!supplied.has(canonical(word))))reject(field,'new_content_term');
  // This deliberately stays conservative for technical, dated, numeric or
  // negated text. Purely editorial rewrites may restructure ordinary sentences.
  if((sensitive(source)||protectedStatus(source))&&!same(signature(original,protectedStatus(source)),signature(text,protectedStatus(source))))reject(field,'sensitive_structure_changed');
 }
 const descriptionFacts=new Set(content(value.description));
 if(content(draft.description).some(word=>!descriptionFacts.has(word)))reject('description','source_fact_omitted');
 const retained=new Set(content(value.title+'\n'+value.description));
 if(content(draft.title).some(word=>!retained.has(word)))reject('title','source_fact_omitted');
 for(const text of value.missingDetails){
  if(numbers(text).length||money(text).length)reject('missingDetails','question_numeric_reference');
  const list=words(text),open=/^(what|which|when|how)\b/.test(normal(text));
  const neutralFrame=/^(could|can|would) you (please )?(provide|clarify|describe|share|tell|explain|specify)\b/.test(normal(text))||/^(do you have|are there|is there) (any|a|an)\b/.test(normal(text));
  if(!open&&!neutralFrame)reject('missingDetails','question_assumption');
  // Questions may introduce general missing-information topics, never new
  // services/specifications. No completed-work assumptions or source negation
  // reversal may hide inside a syntactically valid question.
  if(negative(text).length||completed(text)||/\b(must|required|guarantee|guaranteed|already)\b/.test(normal(text)))reject('missingDetails','question_assumption');
  if(list.some(word=>!editorial.has(word)&&!questions.has(word)&&!supplied.has(canonical(word))))reject('missingDetails','question_unprovided_term');
  const domain=list.filter(word=>!editorial.has(word)&&!questions.has(word));
  if(domain.length&&(negative(source).length||/\b(is|are|has|have|was|were)\b/.test(normal(text))))reject('missingDetails','question_assumption');
 }
}
module.exports={validateGrounding,editorialWords,questionWords:()=>[...questions]};
