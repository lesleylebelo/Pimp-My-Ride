export const APPOINTMENT_TIME_ZONE = 'Africa/Johannesburg';
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

// API calendar values are strings, never device-local midnight timestamps.
export function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const validClockTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const validPickerValue = (value, mode) => mode === 'time' ? validClockTime(value) : validCalendarDate(value);
export function sastToday(now = Date.now()) {
  return new Date(now + SAST_OFFSET_MS).toISOString().slice(0, 10);
}
export function pickerValue(date, mode) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
  const shifted = new Date(date.getTime() + SAST_OFFSET_MS).toISOString();
  const value = mode === 'time' ? shifted.slice(11, 16) : shifted.slice(0, 10);
  return validPickerValue(value, mode) ? value : '';
}
export function pickerDate(value, mode, now = Date.now()) {
  const selected = validPickerValue(value, mode) ? value : mode === 'time' ? '12:00' : sastToday(now);
  return new Date(mode === 'time' ? `${sastToday(now)}T${selected}:00+02:00` : `${selected}T12:00:00+02:00`);
}
export function calendarDateLabel(value) {
  if (!validCalendarDate(value)) return typeof value === 'string' ? value : '';
  return new Date(`${value}T12:00:00+02:00`).toLocaleDateString('en-ZA', {
    timeZone: APPOINTMENT_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric',
  });
}
