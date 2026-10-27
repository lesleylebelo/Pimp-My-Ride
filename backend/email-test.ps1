param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('rehearse','prepare','verify','status','send-once','refresh-status')]
  [string]$Action,
  [ValidateSet('booking','receipt')]
  [string]$Kind='booking'
)
$ErrorActionPreference='Stop'
function Read-PrivateValue([string]$Prompt) {
  $secureValue=Read-Host $Prompt -AsSecureString
  $valuePointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($valuePointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($valuePointer); $secureValue.Dispose() }
}
$names=@('FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_PROJECT_ID','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','NODE_ENV','PMR_TRANSACTIONAL_EMAIL_ENABLED','PMR_EMAIL_TEST_MAILBOX','RESEND_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_SERVICE_ACCOUNT_JSON')
$savedValues=@{}
foreach ($name in $names) { $savedValues[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
$resultCode=1
try {
  $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8187'
  $env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9197'
  $env:FIREBASE_PROJECT_ID='demo-pmr-security'
  $env:GCLOUD_PROJECT='demo-pmr-security'
  $env:GOOGLE_CLOUD_PROJECT='demo-pmr-security'
  $env:NODE_ENV='test'
  $env:PMR_TRANSACTIONAL_EMAIL_ENABLED='false'
  [Environment]::SetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS',$null,'Process')
  [Environment]::SetEnvironmentVariable('FIREBASE_SERVICE_ACCOUNT_JSON',$null,'Process')
  [Environment]::SetEnvironmentVariable('RESEND_API_KEY',$null,'Process')
  $env:PMR_EMAIL_TEST_MAILBOX=Read-PrivateValue 'Enter the designated Resend account mailbox (hidden)'
  $nodeArgs=@((Join-Path $PSScriptRoot 'email-test.cjs'),$Action)
  if ($Action -eq 'send-once') {
    $approval=Read-Host "Type SEND ONE $($Kind.ToUpper()) EMAIL to authorise exactly one live attempt"
    if ($approval -cne "SEND ONE $($Kind.ToUpper()) EMAIL") { throw 'Live attempt was not authorised.' }
    $nodeArgs+=@($Kind,'--approve-one-live-email')
  }
  if ($Action -in @('send-once','refresh-status')) {
    $env:RESEND_API_KEY=Read-PrivateValue 'Enter the Resend API key (hidden; process memory only)'
  }
  & node @nodeArgs
  $resultCode=$LASTEXITCODE
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$savedValues[$name],'Process') }
  $savedValues.Clear()
}
exit $resultCode
