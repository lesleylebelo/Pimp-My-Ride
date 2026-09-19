let stop=async()=>{};
export const setPresenceStop=fn=>{stop=fn;};
export const endPresence=()=>stop();
