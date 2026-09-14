import React from 'react';
import { LandingButton, LandingShell, LandingText, ui, useLandingFeedback } from '../components/landing/LandingUI';

export default function AdminHomeScreen() {
  const feedback = useLandingFeedback();
  const soon = feedback.showFeature;
  return <LandingShell title="Admin Overview" admin {...feedback}>
    <LandingText weight="semibold" style={ui.green}>PimpMyRide administration</LandingText>
    <LandingText style={ui.muted}>Review registrations and keep the marketplace running smoothly.</LandingText>
    <LandingText style={ui.sample}>Example overview · Sample counts</LandingText>
    <LandingText weight="semibold" style={{ fontSize: 22, lineHeight: 31 }}>1 pending application</LandingText>
    <LandingText weight="semibold" style={[ui.green, { fontSize: 15, lineHeight: 22 }]}>1 open report</LandingText>
    <LandingButton title="Review Shop Applications" onPress={() => soon('Shop applications')} />
    {['Review Reported Content', 'Manage Vehicle Owners', 'Manage Shop Accounts', 'Recent Activity', 'Platform Summary'].map(title =>
      <LandingButton key={title} title={title} outline onPress={() => soon(title)} />
    )}
  </LandingShell>;
}
