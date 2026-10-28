import React from 'react';
import AppDateTimeField from './AppDateTimeField';

export default function AppDatePicker({minimumDate, maximumDate, ...props}) {
  return <AppDateTimeField {...props} mode="date" minimum={minimumDate} maximum={maximumDate}/>;
}
