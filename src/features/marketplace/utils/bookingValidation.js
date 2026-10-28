import {validCalendarDate, validClockTime} from '../../../shared/utils/dateTime';
// Appointment inputs represent South African Standard Time, independently of the device timezone.
export function appointmentErrors({appointmentDate, appointmentTime}, now = Date.now()) {
  const errors = {};
  const date = String(appointmentDate || '').trim(), time = String(appointmentTime || '').trim();
  if (!date) errors.appointmentDate = 'Appointment date is required.';
  else if (!validCalendarDate(date)) errors.appointmentDate = 'Enter a valid date in YYYY-MM-DD format.';
  if (!time) errors.appointmentTime = 'Appointment time is required.';
  else if (!validClockTime(time)) errors.appointmentTime = 'Enter a valid 24-hour time in HH:mm format.';
  if (!errors.appointmentDate && !errors.appointmentTime && new Date(`${date}T${time}:00+02:00`).getTime() <= now) errors.appointmentTime = 'Choose a future appointment in South African Standard Time (SAST).';
  return errors;
}

export function cancellationError(reason) {
  const value = String(reason || '').trim();
  if (!value) return 'A cancellation reason is required.';
  if (value.length > 500) return 'Use 500 characters or fewer for the cancellation reason.';
  return '';
}
