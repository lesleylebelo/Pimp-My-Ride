import {useMarketData} from './useMarketData';

// Display capability only. Every mutation is independently gated by the server.
export function useMockPayments(){
 const {data,busy,error,refresh}=useMarketData('paymentSimulation');
 return {enabled:!busy&&!error&&data?.enabled===true&&data?.simulated===true&&['local-emulator','mock'].includes(data?.mode),mode:data?.mode,busy,error,refresh};
}
