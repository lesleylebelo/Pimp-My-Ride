export function notificationDestination(item,role){
 const target=item.target||(item.bookingId?{type:'booking',id:item.bookingId}:null);
 if(!target||typeof target.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(target.id))return null;
 if(target.type==='receipt')return ['ReceiptDetail',{id:target.id}];
 if(target.type==='conversation')return ['Chat',{id:target.id}];
 if(target.type==='booking')return ['BookingDetail',{id:target.id}];
 if(target.type==='request'||target.type==='quotation')return [role==='shop'?'ShopRequest':target.type==='quotation'?'QuoteComparison':'OwnerRequest',{id:target.id}];
 return null;
}

// Keep the server's full-precision ordering, including timestamp ties across pages.
export function notificationSections(items, now = Date.now()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const sections = [];
  for (const item of items) {
    const valid = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt);
    const title = valid && item.createdAt >= today.getTime() ? 'Today'
      : valid && item.createdAt >= yesterday.getTime() ? 'Yesterday' : 'Earlier';
    let section = sections[sections.length - 1];
    if (!section || section.title !== title) {
      section = {title, key: `${title}-${sections.length}`, data: []}; sections.push(section);
    }
    section.data.push(item);
  }
  return sections;
}

export function notificationTime(value, now = Date.now()) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) return 'Time unavailable';
  const age = now - value;
  if (age >= 0 && age < 60000) return 'Just now';
  if (age >= 60000 && age < 3600000) return `${Math.floor(age / 60000)}m ago`;
  if (age >= 3600000 && age < 86400000) return `${Math.floor(age / 3600000)}h ago`;
  return new Date(value).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', ...(new Date(value).getFullYear() !== new Date(now).getFullYear() ? {year: 'numeric'} : {})});
}

export function notificationIcon(item) {
  const type = item.target?.type;
  if (type === 'conversation') return 'chatbubble-ellipses-outline';
  if (type === 'receipt') return 'receipt-outline';
  if (type === 'quotation') return 'document-text-outline';
  if (type === 'booking' || item.bookingId) return 'calendar-outline';
  if (type === 'request') return 'construct-outline';
  return 'notifications-outline';
}
