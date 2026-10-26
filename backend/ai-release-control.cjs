// Retired experimental accounting. Historical records remain untouched.
// No generation service imports this module. These paths exist only for
// migration/security tests and historical investigation, never authorisation.
const CONTROL_PATH='aiAssistControl/initial-provider-test-v1';
const DAILY_PREFIX='aiAssistDaily',ATTEMPT_PREFIX='aiAssistAttempts';
module.exports={CONTROL_PATH,DAILY_PREFIX,ATTEMPT_PREFIX};
