param([ValidateSet('host','android','device')][string]$Target='host',[string]$ComputerIP='127.0.0.1',[string]$DeviceIP='')
$ErrorActionPreference='Stop'
$Root=Split-Path $PSScriptRoot -Parent
$Branch=git -C $Root -c safe.directory=$Root branch --show-current
if($Branch -notin @('feature/mock-payments','integration/consolidated-local','lesley','test/pimpmyride-integration')){throw 'Use an approved local development checkout (feature/mock-payments, integration/consolidated-local, lesley or test/pimpmyride-integration).'}
foreach($Entry in Get-ChildItem Env:){if(($Entry.Name -like 'SUPABASE_*' -or $Entry.Name -in @('FIREBASE_SERVICE_ACCOUNT_JSON','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_CONFIG')) -and $Entry.Value){throw 'Open a clean terminal without production/storage credentials.'}}
if($env:NODE_ENV -eq 'production' -or $env:RENDER){throw 'Local demo requires a clean local development terminal.'}
foreach($Key in @('FIREBASE_PROJECT_ID','EXPO_PUBLIC_FIREBASE_PROJECT_ID','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT')){if([Environment]::GetEnvironmentVariable($Key) -and [Environment]::GetEnvironmentVariable($Key) -ne 'demo-pmr-security'){throw 'Production project configuration detected; use a clean terminal.'}}
if($env:EXPO_PUBLIC_API_URL -like 'https:*'){throw 'Hosted API configuration detected; use a clean terminal.'}
$Synthetic=@{EXPO_PUBLIC_FIREBASE_API_KEY='demo-only-key';EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN='demo-pmr-security.invalid';EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID='1234567890';EXPO_PUBLIC_FIREBASE_APP_ID='demo-local-app'}
foreach($Key in $Synthetic.Keys){if([Environment]::GetEnvironmentVariable($Key) -and [Environment]::GetEnvironmentVariable($Key) -ne $Synthetic[$Key]){throw 'Non-demo client Firebase configuration detected.'}}
if($Target -eq 'device' -and (!$DeviceIP -or $ComputerIP -eq '127.0.0.1')){throw 'Device mode requires explicit ComputerIP and DeviceIP on trusted Wi-Fi.'}
$env:PATH=(Join-Path $Root '.local-checks/pmr-tools/node22/node-v22.23.3-win-x64')+[IO.Path]::PathSeparator+$env:PATH
$env:NODE_ENV='development'
$env:PMR_LOCAL_DEMO='true'
$env:PMR_DEMO_STORAGE='memory-fixtures'
$env:PMR_MOCK_PAYMENTS_ENABLED='true'
$env:FIREBASE_PROJECT_ID='demo-pmr-security'
$env:GCLOUD_PROJECT='demo-pmr-security'
$env:GOOGLE_CLOUD_PROJECT='demo-pmr-security'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:PMR_DEMO_BIND_HOST=if($Target -eq 'device'){$ComputerIP}else{'127.0.0.1'}
$env:PMR_DEMO_PUBLIC_HOST=if($Target -eq 'android'){'10.0.2.2'}else{$env:PMR_DEMO_BIND_HOST}
$env:PMR_DEMO_ALLOWED_CLIENT_IPS=if($Target -eq 'device'){'127.0.0.1,'+$ComputerIP+','+$DeviceIP}else{'127.0.0.1'}
if($Target -eq 'device'){$env:REACT_NATIVE_PACKAGER_HOSTNAME=$ComputerIP}
$env:EXPO_NO_DOTENV='1'
$env:EXPO_OFFLINE='1'
$env:EXPO_PUBLIC_PMR_LOCAL_DEMO='true'
$env:EXPO_PUBLIC_PMR_DEMO_HOST=$env:PMR_DEMO_PUBLIC_HOST
$env:EXPO_PUBLIC_API_URL='http://'+$env:PMR_DEMO_PUBLIC_HOST+':3000'
$env:EXPO_PUBLIC_FIREBASE_PROJECT_ID='demo-pmr-security'
$env:EXPO_PUBLIC_FIREBASE_API_KEY='demo-only-key'
$env:EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN='demo-pmr-security.invalid'
$env:EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID='1234567890'
$env:EXPO_PUBLIC_FIREBASE_APP_ID='demo-local-app'
$env:FIREBASE_CLI_DISABLE_USAGE_REPORTING='true'
$env:FIREBASE_SKIP_UPDATE_CHECK='true'
$env:DEBUG=''
$env:XDG_CONFIG_HOME=Join-Path $Root '.local-checks/phase4-firebase-config'
New-Item -ItemType Directory -Path $env:XDG_CONFIG_HOME -Force | Out-Null
Write-Host 'Synthetic local demo configured. No production credentials, cloud data, real payments or emails.'
