const D=require('./domain.cjs');
// South Africa uses UTC+02:00 throughout the year. Keep the typed local values
// alongside the absolute timestamp so clients do not reinterpret their zone.
function appointment(input){
 const date=input.appointmentDate,time=input.appointmentTime;
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)D.fail('Choose a valid appointment date (YYYY-MM-DD).');
 if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))D.fail('Choose a valid appointment time (HH:mm, South African time).');
 return {appointmentDate:date,appointmentTime:time,appointmentMillis:Date.parse(`${date}T${time}:00+02:00`)};
}
function requireFutureAppointment(value){if(value.appointmentMillis<=Date.now())D.fail('Choose an appointment in the future (South African time).');}
module.exports={appointment,requireFutureAppointment};
