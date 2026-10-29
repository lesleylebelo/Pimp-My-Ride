// Only process memory. Device preferences and server mutation receipts are untouched.
const cleaners=new Set();
export function registerSessionCache(clear){cleaners.add(clear);return()=>cleaners.delete(clear);}
export function clearSessionCaches(){for(const clear of cleaners)clear();}
