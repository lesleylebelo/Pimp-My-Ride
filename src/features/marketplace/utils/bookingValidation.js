// Appointment inputs represent South African Standard Time, independently of the device timezone.
export function appointmentErrors({appointmentDate, appointmentTime}, now = Date.now()) {
  const errors = {};
  const date = String(appointmentDate || '').trim(), time = String(appointmentTime || '').trim();
  const calendar = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!date) errors.appointmentDate = 'Appointment date is required.';
  else if (!calendar || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date) errors.appointmentDate = 'Enter a valid date in YYYY-MM-DD format.';
  if (!time) errors.appointmentTime = 'Appointment time is required.';
  else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.appointmentTime = 'Enter a valid 24-hour time in HH:mm format.';
  if (!errors.appointmentDate && !errors.appointmentTime && new Date(`${date}T${time}:00+02:00`).getTime() <= now) errors.appointmentTime = 'Choose a future appointment in South African Standard Time (SAST).';
  return errors;
}

export function cancellationError(reason) {
  const value = String(reason || '').trim();
  if (!value) return 'A cancellation reason is required.';
  if (value.length > 500) return 'Use 500 characters or fewer for the cancellation reason.';
  return '';
}
