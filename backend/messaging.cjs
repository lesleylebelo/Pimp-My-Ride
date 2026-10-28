const {createHash} = require('node:crypto');
const {FieldPath, FieldValue, Timestamp, AggregateField} = require('firebase-admin/firestore');
const D = require('./domain.cjs'), M = require('./marketplace-domain.cjs');
const {mutation} = require('./mutations.cjs');
const {quoteId} = require('./marketplace.cjs');
const conversationId = (request, owner, shop) => createHash('sha256').update(`${request}\n${owner}\n${shop}`).digest('hex');
const version = value => Number.isSafeInteger(value.termsVersion) && value.termsVersion > 0 ? value.termsVersion : Number.isSafeInteger(value.version) && value.version > 0 ? value.version : 1;
const active = (profile, role) => profile?.role === role && D.active(profile) && !profile.statusOperation && !profile.reviewOperation && !profile.provisioningOperation && (role !== 'shop' || profile.verificationStatus === 'approved');
const stamp = () => FieldValue.serverTimestamp();
const messageId = number => String(number).padStart(16, '0');
const serial = value => value instanceof Timestamp ? value.toMillis() : value;
const allowed = {summary:[], list:['cursor'], get:['id','cursor'], open:['serviceRequestId','shopId'], enquire:['serviceRequestId','reason'], consent:['id','decision'], send:['id','text'], read:['id','through']};
const writes = new Set(['open','enquire','consent','send','read']);

function createMessaging({db, auth, actor, now = Date.now}) {
  async function enabled(uid) {
    try {const user = await auth.getUser(uid);return user.emailVerified === true && !user.disabled;} catch (error) {if (error.code === 'auth/user-not-found') return false;throw error;}
  }
  function participant(conversation, account) {
    if (!conversation || conversation[account.profile.role === 'owner' ? 'ownerId' : 'shopId'] !== account.uid) D.fail('Conversation not found.', 'not-found');
  }
  async function context(get, conversation, isEnabled=enabled) {
    const [requestDoc, ownerDoc, shopDoc, bookingDoc] = await Promise.all([
      get(db.doc(`serviceRequests/${D.id(conversation.serviceRequestId)}`)), get(db.doc(`users/${D.id(conversation.ownerId)}`)),
      get(db.doc(`users/${D.id(conversation.shopId)}`)), get(db.doc(`bookings/${conversation.serviceRequestId}`)),
    ]);
    const request = requestDoc.data(), owner = ownerDoc.data(), shop = shopDoc.data(), booking = bookingDoc.data();
    if (!request || request.ownerId !== conversation.ownerId) D.fail('Service request not found.', 'not-found');
    const base = {request, owner, shop, canSend:false, canEnquire:false, reason:'This relationship no longer authorises new messages.', bookingId:null};
    if (!active(owner,'owner') || !active(shop,'shop') || !(await isEnabled(conversation.ownerId)) || !(await isEnabled(conversation.shopId))) return {...base,reason:'A participant is no longer eligible to send messages.'};
    // Explicit customer denial takes precedence over automatic quotation/invitation/booking access.
    if (['rejected','revoked'].includes(conversation.consent)) return {...base,reason:'The customer has not authorised communication.'};
    const booked = request.status === 'booked' && request.bookingId === conversation.serviceRequestId &&
      booking?.ownerId === conversation.ownerId && booking.shopId === conversation.shopId && booking.serviceRequestId === conversation.serviceRequestId &&
      booking.quoteId === request.acceptedQuoteId && ['pending_payment','pending_confirmation','confirmed'].includes(booking.status);
    if (booked) return {...base,canSend:true,reason:'Authorised booking conversation.',bookingId:conversation.serviceRequestId};
    if (request.status !== 'open' || request.visibility === 'direct' && request.shopId !== conversation.shopId) return base;
    const [vehicleDoc, categoryDoc] = await Promise.all([get(db.doc(`vehicles/${D.id(request.vehicleId)}`)),get(db.doc(`serviceCategories/${D.id(request.categoryId)}`))]);
    const vehicle = vehicleDoc.data();
    if (!vehicle || vehicle.ownerId !== conversation.ownerId || vehicle.archived || categoryDoc.data()?.archived !== false) return base;
    base.canEnquire = true;
    if (conversation.consent === 'approved' && conversation.consentTermsVersion === version(request)) return {...base,canSend:true,reason:'Customer-approved communication.'};
    if (request.visibility === 'direct' && request.shopId === conversation.shopId) return {...base,canSend:true,reason:'Current direct invitation.'};
    const legacy = quoteId(conversation.serviceRequestId, conversation.shopId), headDoc = await get(db.doc(`quotationHeads/${legacy}`)), head = headDoc.data();
    let currentId = legacy;
    if (headDoc.exists) {
      if (head?.serviceRequestId !== conversation.serviceRequestId || head?.shopId !== conversation.shopId || typeof head.quoteId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(head.quoteId)) return base;
      currentId = head.quoteId;
    }
    const quote = (await get(db.doc(`quotations/${currentId}`))).data();
    const quoteVersion = Object.hasOwn(quote || {},'termsVersion') ? quote.termsVersion : quote?.requestVersion;
    if (quote?.serviceRequestId === conversation.serviceRequestId && quote.shopId === conversation.shopId && quote.status === 'submitted' &&
        quote.validUntil instanceof Timestamp && quote.validUntil.toMillis() > now() && quoteVersion === version(request)) return {...base,canSend:true,reason:'Current authorised quotation.',expiresAt:quote.validUntil.toMillis()};
    return base;
  }
  function view(id, conversation, account, access) {
    const owner = account.profile.role === 'owner', received = conversation[owner?'receivedOwner':'receivedShop'] || 0, read = conversation[owner?'readOwner':'readShop'] || 0;
    return {id,serviceRequestId:conversation.serviceRequestId,shopId:conversation.shopId,shopName:conversation.shopName,requestTitle:conversation.requestTitle,vehicle:conversation.vehicle,avatar:access.canSend?{context:"conversation",id,revision:(owner?access.shop:access.owner)?.profilePhotoRevision||0}:null,
      consent:conversation.consent,enquiry:conversation.enquiry || '',canSend:access.canSend,reason:access.reason,bookingId:access.bookingId,expiresAt:access.expiresAt || null,
      unreadCount:Math.max(0,received-read),receivedCount:received,lastSequence:conversation.sequence || 0,lastMessage:conversation.lastMessage || '',updatedAt:serial(conversation.updatedAt)};
  }
  function notify(tx, recipientUid, id, event, title) {
    tx.create(db.collection('notifications').doc(), {recipientUid,event,title,body:'Open the private conversation for details.',target:{type:'conversation',id},readAt:null,createdAt:stamp()});
  }
  async function page(collection, cursor) {
    let query = collection.orderBy('sequence','desc');
    if (cursor) {
      const document = await collection.doc(D.id(cursor)).get();
      if (!document.exists) D.fail('Message cursor not found.','not-found');
      query = query.startAfter(document);
    }
    const result = await query.limit(21).get(), docs = result.docs.slice(0,20);
    return {docs,cursor:result.docs.length>20?docs[19].id:null};
  }
  const messaging = async function(request) {
    const account = await actor(request), input = request.data || {}, op = input.op;
    if (!['owner','shop'].includes(account.profile.role) || !active(account.profile,account.profile.role)) D.fail('Messaging access is unavailable.','permission-denied');
    if (!Object.hasOwn(allowed,op)) D.fail('Unknown messaging operation.');
    M.fields(input,['op',...allowed[op],...(writes.has(op)?['requestId']:[])]);
    const owner = account.profile.role === 'owner';
    if (op === 'summary') {
      // Only the caller's participant counters; no conversation text or identities.
      const counters=await db.collection('conversations').where(owner?'ownerId':'shopId','==',account.uid)
        .aggregate({received:AggregateField.sum(owner?'receivedOwner':'receivedShop'),read:AggregateField.sum(owner?'readOwner':'readShop')}).get();
      return {unreadCount:Math.max(0,counters.data().received-counters.data().read)};
    }
    if (op === 'list') {
      let query = db.collection('conversations').where(owner?'ownerId':'shopId','==',account.uid).orderBy('updatedAt','desc').orderBy(FieldPath.documentId(),'desc');
      if (input.cursor) {const cursor = await db.doc(`conversations/${D.id(input.cursor)}`).get();participant(cursor.data(),account);query = query.startAfter(cursor);}
      const snapshot = await query.limit(21).get(), docs = snapshot.docs.slice(0,20), result = {docs,cursor:snapshot.docs.length>20?docs[19].id:null};
      // Deduplicate repeated participant/request documents within this page only.
      // Every subsequent request and transaction still rechecks current access.
      const documents=new Map(),identities=new Map();
      const get=ref=>{if(!documents.has(ref.path))documents.set(ref.path,ref.get());return documents.get(ref.path);};
      const isEnabled=uid=>{if(!identities.has(uid))identities.set(uid,enabled(uid));return identities.get(uid);};
      const items = await Promise.all(result.docs.map(async doc => {const conversation = doc.data();return view(doc.id,conversation,account,await context(get,conversation,isEnabled));}));
      return {items,cursor:result.cursor};
    }
    if (op === 'get') {
      const id = D.id(input.id), conversation = (await db.doc(`conversations/${id}`).get()).data();participant(conversation,account);
      const access = await context(ref=>ref.get(),conversation);
      const messages = await page(db.collection(`conversations/${id}/messages`),input.cursor);
      return {conversation:view(id,conversation,account,access),messages:messages.docs.reverse().map(doc=>{const row=doc.data();return {id:doc.id,text:row.text,senderId:row.senderId,sequence:row.sequence,recipientOrdinal:row.recipientOrdinal,createdAt:serial(row.createdAt)};}),cursor:messages.cursor};
    }
    D.id(input.requestId);
    const receipt = mutation(db,account.uid,`messaging:${op}`,input);
    return receipt.atomic(async tx => {
      // Recheck the caller inside every transaction attempt, including after Auth revocation.
      const current = await actor(request);
      if (!active(current.profile,current.profile.role) || current.uid !== account.uid || current.profile.role !== account.profile.role) D.fail('Messaging access changed.','permission-denied');
      let id, ref, conversation, access;
      if (op === 'open' || op === 'enquire') {
        const serviceRequestId = D.id(input.serviceRequestId), requestDoc = await tx.get(db.doc(`serviceRequests/${serviceRequestId}`)), serviceRequest = requestDoc.data();
        if (!serviceRequest || owner && serviceRequest.ownerId !== account.uid || !owner && serviceRequest.visibility === 'direct' && serviceRequest.shopId !== account.uid) D.fail('Service request not found.','not-found');
        const shopId = owner ? D.id(input.shopId) : account.uid;
        if (!owner && input.shopId !== undefined && input.shopId !== account.uid) D.fail('Choose your own shop.','permission-denied');
        id = conversationId(serviceRequestId,serviceRequest.ownerId,shopId);ref = db.doc(`conversations/${id}`);
        const saved = await tx.get(ref);
        conversation = saved.data() || {serviceRequestId,ownerId:serviceRequest.ownerId,shopId,consent:'none',sequence:0,receivedOwner:0,receivedShop:0,readOwner:0,readShop:0,createdAt:stamp()};
        participant(conversation,account);
        access = await context(value=>tx.get(value),conversation);
        // Only a customer's deliberate action grants approval. An enquiry NEVER sets it.
        if (owner) {
          if (op === 'enquire') D.fail('Only shops submit communication enquiries.','permission-denied');
          const approved = {...conversation,consent:'approved',consentTermsVersion:version(access.request)};
          access = await context(value=>tx.get(value),approved);
          if (!access.canSend) D.fail('This shop cannot communicate about this request.','permission-denied');
          conversation = approved;
        } else if (op === 'enquire' && !access.canSend) {
          if (!access.canEnquire || access.request.visibility !== 'open') D.fail('Communication enquiries are unavailable.','permission-denied');
          if (saved.exists) D.fail('This conversation already exists. Await customer approval or view its current status.','failed-precondition');
          conversation = {...conversation,consent:'pending',enquiry:D.text(input.reason,'Enquiry',300)};
        } else if (!access.canSend) D.fail('A current quotation, valid invitation, customer approval or booking is required to start messaging.','permission-denied');
        conversation = {...conversation,shopName:access.shop.shop?.shopName || 'Shop',requestTitle:access.request.title,vehicle:M.vehicleSnapshot(access.request.vehicle || {}),updatedAt:stamp()};
        if (saved.exists) tx.update(ref,conversation);else tx.create(ref,conversation);
        const pendingEnquiry = op === 'enquire' && conversation.consent === 'pending';
        if (!saved.exists || owner && saved.data().consent !== 'approved') notify(tx,owner?conversation.shopId:conversation.ownerId,id,pendingEnquiry?'communication_enquiry':'conversation_opened',pendingEnquiry?'Communication approval requested':'Conversation opened');
        return {id};
      }
      id = D.id(input.id);ref = db.doc(`conversations/${id}`);conversation = (await tx.get(ref)).data();participant(conversation,account);
      access = await context(value=>tx.get(value),conversation);
      if (op === 'consent') {
        if (!owner || !['approved','rejected','revoked'].includes(input.decision)) D.fail('Only the customer can approve, reject or revoke communication.','permission-denied');
        if (input.decision === 'approved') {
          const approved = {...conversation,consent:'approved',consentTermsVersion:version(access.request)};
          if (!(await context(value=>tx.get(value),approved)).canSend) D.fail('Communication cannot be approved for this relationship.','failed-precondition');
        }
        tx.update(ref,{consent:input.decision,consentTermsVersion:version(access.request),updatedAt:stamp()});
        if (conversation.consent !== input.decision) notify(tx,conversation.shopId,id,'communication_consent',`Communication ${input.decision}`);
        return {id};
      }
      if (op === 'read') {
        const receivedKey = owner?'receivedOwner':'receivedShop', readKey = owner?'readOwner':'readShop';
        M.integer(input.through,'Read acknowledgement',0,conversation[receivedKey] || 0);
        const through = Math.max(conversation[readKey] || 0,input.through);
        tx.update(ref,{[readKey]:through});return {id,unreadCount:(conversation[receivedKey] || 0)-through};
      }
      if (op === 'send') {
        if (!access.canSend || access.expiresAt && access.expiresAt <= now()) D.fail(access.reason,'permission-denied');
        const text = D.text(input.text,'Message',2000);
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) D.fail('Remove unsupported control characters from the message.');
        const clock = now(), key = owner?'ownerSendWindow':'shopSendWindow', previous = conversation[key], window = previous && clock-previous.start < 60000 ? previous : {start:clock,count:0};
        if (window.count >= 10) D.fail('Please wait a minute before sending more messages.','resource-exhausted');
        const sequence = M.integer((conversation.sequence || 0)+1,'Message sequence',1,Number.MAX_SAFE_INTEGER), recipientKey = owner?'receivedShop':'receivedOwner';
        const recipientOrdinal = (conversation[recipientKey] || 0)+1, messageRef = ref.collection('messages').doc(messageId(sequence));
        tx.create(messageRef,{senderId:account.uid,text,sequence,recipientOrdinal,createdAt:stamp()});
        tx.update(ref,{sequence,[recipientKey]:recipientOrdinal,[key]:{start:window.start,count:window.count+1},lastMessage:text.slice(0,120),updatedAt:stamp()});
        notify(tx,owner?conversation.shopId:conversation.ownerId,id,'message_received','New private message');
        return {id,messageId:messageRef.id,sequence};
      }
      D.fail('Unknown messaging operation.');
    });
  };
  // Private avatar access uses exactly the current conversation permission check.
  messaging.authorizeAvatar = async (request, id) => {
    const account = await actor(request);
    if (!active(account.profile,account.profile.role)) D.fail('Messaging access is unavailable.','permission-denied');
    const conversation = (await db.doc(`conversations/${D.id(id)}`).get()).data();
    participant(conversation,account);
    const access = await context(ref=>ref.get(),conversation);
    if (!access.canSend) D.fail('Current customer-approved communication is required.','permission-denied');
    return account.profile.role==='owner'?conversation.shopId:conversation.ownerId;
  };
  return messaging;
}
module.exports = {createMessaging,conversationId};
