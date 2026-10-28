import React from 'react';
import AppDateTimeField from './AppDateTimeField';

export default function AppTimePicker({minimumTime, maximumTime, ...props}) {
  return <AppDateTimeField {...props} mode="time" minimum={minimumTime} maximum={maximumTime}/>;
}
