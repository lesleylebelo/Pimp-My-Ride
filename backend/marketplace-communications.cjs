// Pure projections only. No email transport, addresses or provider credentials.
const D=require('./domain.cjs');
const NOTICE='SIMULATED / TEST — NOT REAL PAYMENT';
const titles={new_service_request:'New service request',quotation_submitted:'New quotation',quotation_renewed:'Quotation renewed',quotation_accepted:'Quotation accepted',booking_created:'Booking created — awaiting appointment confirmation',booking_confirmed:'Appointment confirmed',booking_cancelled:'Booking cancelled',service_completed:'Service completed',simulated_payment_paid:'Simulated payment successful',simulated_payment_failed:'Simulated payment failed',simulated_payment_cancelled:'Simulated payment cancelled',simulated_payment_pending:'Simulated payment still pending',simulated_in_store_payment_received:'Simulated in-store payment received',simulated_in_store_payment_recorded:'Simulated in-store payment recorded'};
const successful=name=>['simulated_payment_paid','simulated_in_store_payment_received','simulated_in_store_payment_recorded'].includes(name);
function message(name,bookingId,details={}){
 const title=titles[name]||'Marketplace update';
 const amount=Number.isSafeInteger(details.amountCents)?` Amount: ZAR ${(details.amountCents/100).toFixed(2)}.`:'';
 const appointment=details.appointmentDate?` Appointment: ${details.appointmentDate} at ${details.appointmentTime} SAST (UTC+02:00).`:'';
 return {title,body:`${title}.${bookingId?` Booking reference: ${bookingId}.`:''}${amount}${appointment} ${NOTICE}`};
}
function target(name,bookingId,details){
 if(successful(name)&&details.paymentAttemptId)return {type:'receipt',id:details.paymentAttemptId,bookingId};
 if(bookingId)return {type:'booking',id:bookingId};
 return {type:name==='new_service_request'?'request':'quotation',id:details.serviceRequestId};
}
function receiptSnapshot({booking,bookingId,attemptId,method,amountCents,paidCents,balanceDueCents}){
 return {schemaVersion:2,receiptReference:`TEST-${attemptId}`,bookingId,paymentAttemptId:attemptId,quoteId:booking.quoteId||null,
  customer:{id:booking.ownerId,name:booking.customerName||'Customer'},shop:{id:booking.shopId,name:booking.shopName||'Shop'},
  serviceTitle:booking.requestTitle||'Service booking',scope:booking.scope||'',items:(booking.items||[]).map(item=>({description:item.description,amountCents:item.amountCents})),
  method,amountCents,currency:booking.currency,totalCents:booking.totalCents,paidCentsAfter:paidCents,balanceDueCentsAfter:balanceDueCents,
  notice:NOTICE,receiptType:'SIMULATED_PAYMENT_RECEIPT',simulated:true,testTransaction:true};
}
function receiptView(value,booking,id){
 if(value.simulated!==true||value.testTransaction!==true||value.paymentAttemptId!==id||value.currency!=='ZAR'||!Number.isSafeInteger(value.amountCents)||value.amountCents<=0)D.fail('The saved receipt is inconsistent. Contact support.','failed-precondition');
 const historical=value.schemaVersion===undefined;
 if(!historical&&(value.schemaVersion!==2||value.customer?.id!==booking.ownerId||value.shop?.id!==booking.shopId||!Number.isSafeInteger(value.totalCents)||value.totalCents<=0||!Number.isSafeInteger(value.paidCentsAfter)||!Number.isSafeInteger(value.balanceDueCentsAfter)||value.amountCents>value.paidCentsAfter||value.paidCentsAfter>value.totalCents||value.balanceDueCentsAfter<0||value.paidCentsAfter+value.balanceDueCentsAfter!==value.totalCents))D.fail('The saved receipt snapshot is inconsistent. Contact support.','failed-precondition');
 // Legacy receipts keep known facts; historical accounting is NEVER reconstructed
 // from today's booking. Identity fallback is the participant ID, not live profile.
 return {id,receiptReference:`TEST-${id}`,bookingId:value.bookingId,paymentAttemptId:id,quoteId:historical?null:value.quoteId,
  customer:historical?{id:booking.ownerId,name:'Customer'}:{id:value.customer.id,name:value.customer.name},shop:historical?{id:booking.shopId,name:'Shop'}:{id:value.shop.id,name:value.shop.name},
  serviceTitle:historical?'Historical simulated payment':value.serviceTitle,scope:historical?'':value.scope,items:historical?[]:(value.items||[]).map(item=>({description:item.description,amountCents:item.amountCents})),
  method:historical?null:value.method,amountCents:value.amountCents,currency:'ZAR',issuedAt:value.issuedAt||null,
  totalCents:historical?null:value.totalCents,paidCentsAfter:historical?null:value.paidCentsAfter,balanceDueCentsAfter:historical?null:value.balanceDueCentsAfter,
  historicalSnapshotUnavailable:historical,compatibilityNotice:historical?'Historical quotation total, payment method and balance snapshots were not recorded. They cannot be reconstructed from the current booking.':null,
  notice:NOTICE,simulated:true,testTransaction:true};
}
module.exports={NOTICE,message,target,successful,receiptSnapshot,receiptView};
