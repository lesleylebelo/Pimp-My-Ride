const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateSuggestion}=require('../ai-assist.cjs');
const {failure}=require('../ai-errors.cjs');
const {createAIAssist}=require('../ai-assist.cjs');
const sample=(description='Wrap doors in black.',title='Black wrap')=>({title,description,limits:{title:100,description:2000},categories:[{id:'wrap',name:'Wrap'}]});
const value=(draft,change={})=>({title:draft.title,description:draft.description,categoryId:'wrap',missingDetails:[],...change});
const check=(draft,change)=>validateSuggestion(value(draft,change),draft);

test('closed editorial additions, punctuation and sourced action inflections allow harmless rewrites',()=>{
 for(const description of ['Please wrap the doors in black for me.','I would like my doors wrapped in black.','For my doors, I would like a black wrap.','Wrap the doors in black!','WRAP THE DOORS IN BLACK.','The doors need to be wrapped in black.'])assert.equal(check(sample(),{description}).description,description);
 const draft=sample('I need the doors repaired.','Door repair');assert.ok(check(draft,{description:'Please repair the doors for me.'}));
 const spelling=sample('Please paint the tyres grey.','Tyre colour');assert.ok(check(spelling,{description:'Please paint the tires gray.'}));
 const negative=sample("Don't install a turbo.",'Turbo work');assert.ok(check(negative,{description:'Do not install a turbo.'}));
});
test('non-presupposing clarification topics can request missing information without new service claims',()=>{
 const questions=['What is your budget?','What is the make and model of your vehicle?','When would you like this work done?','Are there any existing issues or constraints?','Could you clarify your preferred timing?'];
 assert.deepEqual(check(sample(),{missingDetails:questions}).missingDetails,questions);
 assert.ok(check(sample(),{missingDetails:['What colour would you prefer?','Which areas should we wrap?']}));
});
test('new specifications, services, prices, warranties and completion claims fail with content-free field/rule codes',()=>{
 const draft=sample();
 for(const [change,field,rule] of [
  [{title:'Turbo wrap'},'title','new_content_term'],
  [{description:'Wrap doors with a turbo.'},'description','new_content_term'],
  [{description:'Wrap doors in black for R500.'},'description','number_changed'],
  [{description:'Wrap doors in black with a warranty.'},'description','new_content_term'],
  [{description:'Wrap doors in black and install an exhaust.'},'description','new_content_term'],
  [{description:'Doors have been wrapped in black.'},'description','work_status_changed'],
  [{description:'Black wrap is on the doors.'},'description','work_status_changed'],
  [{description:'I had black wrap for the doors.'},'description','work_status_changed'],
  [{description:'I did wrap doors in black.'},'description','work_status_changed'],
  [{description:'Completed black wrap for doors.'},'description','work_status_changed'],
  [{description:'Wrap doors.'},'description','source_fact_omitted'],
  [{description:'Wrap both doors in black.'},'description','new_content_term'],
 ])assert.throws(()=>check(draft,change),error=>error.reason==='grounding_rejected'&&error.rejectedField===field&&error.validationRule===rule&&!JSON.stringify(error).includes(change.description||change.title));
});
test('changed numeric associations, budgets, dates, requirements and negation scope stay protected',()=>{
 for(const [description,rewrite,rule] of [
  ['Front wheels 18 inches. Rear wheels 19 inches.','Front wheels 19 inches. Rear wheels 18 inches.','number_changed'],
  ['Front wheels 18 inches. Rear wheels 19 inches.','Rear wheels 18 inches. Front wheels 19 inches.','sensitive_structure_changed'],
  ['Wrap doors for R500 by Friday.','Wrap doors for R600 by Friday.','number_changed'],
  ['Wrap doors for R500 by Friday.','Wrap doors for $500 by Friday.','currency_changed'],
  ['Wrap doors before Friday.','Wrap doors after Friday.','new_content_term'],
  ['Do not wrap doors. Wrap wheels.','Wrap doors. Do not wrap wheels.','sensitive_structure_changed'],
  ['Do not wrap doors. Wrap wheels.','Wrap doors. Wrap wheels.','negation_changed'],
  ['Do not wrap doors. Wrap wheels.','Do not wrap doors and wheels.','sensitive_structure_changed'],
  ['Optional wheel repairs.','Required wheel repairs.','new_content_term'],
  ['Manual gearbox and automatic engine.','Automatic gearbox and manual engine.','sensitive_structure_changed'],
  ['Doors have been wrapped. Wheels need repair.','Doors need wrap. Wheels have been repaired.','sensitive_structure_changed'],
  ['Blue doors and red wheels.','Red doors and blue wheels.','sensitive_structure_changed'],
  ['Wrap doors. Repair wheels.','Repair doors. Wrap wheels.','sensitive_structure_changed'],
 ])assert.throws(()=>check(sample(description,'Work request'),{description:rewrite}),{reason:'grounding_rejected',rejectedField:'description',validationRule:rule});
});
test('questions cannot introduce specifications, new services, numbers or completed-work assumptions',()=>{
 for(const [question,rule] of [
  ['What turbo would you prefer?','question_unprovided_term'],
  ['Which exhaust should we install?','question_unprovided_term'],
  ['What is your R500 budget?','question_numeric_reference'],
  ['What work has been completed?','question_assumption'],
  ['Is a turbo required?','question_assumption'],
 ])assert.throws(()=>check(sample(),{missingDetails:[question]}),{reason:'grounding_rejected',rejectedField:'missingDetails',validationRule:rule});
 assert.throws(()=>check(sample('Do not install a turbo.','Work request'),{missingDetails:['Which turbo would you prefer?']}),{validationRule:'question_assumption'});
});
test('unsupported categories and malformed model output remain rejected',()=>{
 assert.throws(()=>check(sample(),{categoryId:'invented'}),{reason:'malformed_output',rejectedField:'categoryId',validationRule:'category_unsupported'});
 for(const change of [{extra:'private'},{title:''},{description:'x'.repeat(2001)},{missingDetails:['An assertion.']},{missingDetails:null}])assert.throws(()=>check(sample(),change),{reason:'malformed_output'});
});
test('validation diagnostics are content-free and never require a quota record',async()=>{
 const forged=failure('grounding_rejected',{rejectedField:'private input',validationRule:'private response'});assert.equal(forged.rejectedField,null);assert.equal(forged.validationRule,null);
 const diagnostics=[];const assist=createAIAssist({db:{},onDiagnostic:value=>diagnostics.push(value),provider:{enabled:true,suggest:async()=>({title:'Black wrap',description:'Invented turbo.',categoryId:'Wrap & Paint',missingDetails:[]})},actor:async()=>({uid:'tester',profile:{role:'shop',accountStatus:'active',verificationStatus:'approved'}})});
 await assert.rejects(()=>assist({data:{kind:'showcase',title:'Black wrap',description:'Wrap doors in black.',categoryId:'Wrap & Paint'}}),{validationRule:'new_content_term'});
 assert.equal(diagnostics[0].validationRule,'new_content_term');assert.ok(!JSON.stringify(diagnostics).includes('turbo'));assert.ok(!JSON.stringify(diagnostics).includes('tester'));
});

test('safe ordinary paraphrases and general clarification questions avoid superficial vocabulary rejection',()=>{
 assert.ok(check(sample('Please repair the doors.','Door repair'),{description:'I am looking for help to fix the doors.'}));
 assert.ok(check(sample('Paint doors in matt black.','Matt black paint'),{description:'Please paint the doors in matte black.'}));
 const missingDetails=['Could you share your preferred timeframe?','Do you have any reference photos?','What would you like the final result to look like?','Is there a deadline for this work?','How much would you like to spend?'];
 assert.deepEqual(check(sample(),{missingDetails}).missingDetails,missingDetails);
 // General questions never grant permission to invent a new service or fact.
 for(const question of ['Which supercharger would you like?','What horsepower do you want?','Could you share the turbo specifications?'])assert.throws(()=>check(sample(),{missingDetails:[question]}),{reason:'grounding_rejected'});
});
