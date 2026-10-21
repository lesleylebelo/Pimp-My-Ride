const OUTCOMES=new Set(['successful','failed','cancelled','pending']);

function createMockPaymentProvider(){
 return {
  name:'mock',
  simulated:true,
  async createCheckout({paymentId,amountCents,currency}){
   return {provider:'mock',providerReference:`SIM-${paymentId}`,amountCents,currency,status:'pending',simulated:true};
  },
  simulateResult({outcome}){
   if(!OUTCOMES.has(outcome))throw Object.assign(new Error('Choose a supported simulated payment outcome.'),{code:'invalid-argument'});
   return {status:outcome==='successful'?'paid':outcome,simulated:true};
  },
 };
}

module.exports={createMockPaymentProvider};
